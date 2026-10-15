// Background worker: picks jobs from the "jobs" table and runs the registered handler.
//
// How a job is claimed safely by exactly one worker (even with many API instances):
//   UPDATE jobs SET status = 'running' ...
//    WHERE id = (SELECT id FROM jobs WHERE status = 'pending' AND run_at <= NOW()
//                ORDER BY run_at, id FOR UPDATE SKIP LOCKED LIMIT 1)
// SKIP LOCKED lets other workers skip a row that is being claimed instead of waiting.
//
// Failures are retried with exponential backoff (5s, 10s, 20s, ...) until max_attempts,
// then the job is marked "failed" and can be retried from Platform → Background Jobs.
import os from 'node:os';
import { db, withTransaction } from '../database/db.js';
import { enqueue } from './queue.js';
import { logContext, type LogContext } from '../common/logger/context.js';
import { logger } from '../common/logger/logger.js';
import { JOB_COLUMNS, type JobRow } from './queue.js';

export type JobHandler<T = any> = (payload: T, job: JobRow<T>) => Promise<void>;

const handlers = new Map<string, JobHandler>();
const workerId = `${os.hostname()}:${process.pid}`;

const STUCK_AFTER_MINUTES = 10;
const KEEP_COMPLETED_DAYS = 7;

let running = false;
let loops: Promise<void>[] = [];
let maintenanceTimer: NodeJS.Timeout | null = null;

/** Registers the handler for a queue name. */
export function defineJob<T>(queue: string, handler: JobHandler<T>) {
  handlers.set(queue, handler as JobHandler);
}

const backoffSeconds = (attempt: number) => Math.min(3600, 5 * 2 ** (attempt - 1));
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function claimNext(): Promise<JobRow | null> {
  const { rows } = await db.query<JobRow>(
    `UPDATE jobs
        SET status = 'running', attempts = attempts + 1, locked_at = NOW(), locked_by = $1, updated_at = NOW()
      WHERE id = (SELECT id FROM jobs
                   WHERE status = 'pending' AND run_at <= NOW()
                   ORDER BY run_at, id
                   FOR UPDATE SKIP LOCKED
                   LIMIT 1)
      RETURNING ${JOB_COLUMNS}`,
    [workerId],
  );
  return rows[0] ?? null;
}

/** Claims and runs one job. Returns false when the queue is empty. */
export async function processNextJob(): Promise<boolean> {
  const job = await claimNext();
  if (!job) return false;

  const ctx: LogContext = { requestId: `job-${job.id}`, organizationId: job.organizationId ?? undefined, queries: [] };
  const start = performance.now();

  await logContext.run(ctx, async () => {
    const handler = handlers.get(job.queue);
    try {
      if (!handler) throw new Error(`No handler registered for queue "${job.queue}"`);
      await handler(job.payload, job);

      await db.query(
        `UPDATE jobs SET status = 'completed', completed_at = NOW(), locked_at = NULL, last_error = NULL, updated_at = NOW() WHERE id = $1`,
        [job.id],
      );
      logJob(job, 'completed', start, ctx);
    } catch (err) {
      const message = (err as Error).message ?? String(err);
      const finalAttempt = !handler || job.attempts >= job.maxAttempts;
      await db.query(
        `UPDATE jobs
            SET status = $2::text, last_error = $3, locked_at = NULL, updated_at = NOW(),
                run_at = CASE WHEN $2::text = 'pending' THEN NOW() + make_interval(secs => $4) ELSE run_at END
          WHERE id = $1`,
        [job.id, finalAttempt ? 'failed' : 'pending', message.slice(0, 2000), backoffSeconds(job.attempts)],
      );
      logJob(job, finalAttempt ? 'failed' : 'retry', start, ctx, message);
    }
  });
  return true;
}

function logJob(job: JobRow, outcome: 'completed' | 'failed' | 'retry', start: number, ctx: LogContext, error?: string) {
  const durationMs = Math.round((performance.now() - start) * 10) / 10;
  const level = outcome === 'completed' ? 'info' : outcome === 'retry' ? 'warn' : 'error';
  logger.log(level, `JOB ${job.queue} #${job.id} ${outcome}`, {
    type: 'job',
    jobId: job.id,
    queue: job.queue,
    outcome,
    attempt: job.attempts,
    maxAttempts: job.maxAttempts,
    durationMs,
    error,
    requestId: ctx.requestId,
    sourceRequestId: (job.payload as { _requestId?: string })._requestId,
    queries: ctx.queries.length ? ctx.queries : undefined,
    queryCount: ctx.queries.length,
    dbTimeMs: Math.round(ctx.queries.reduce((s, q) => s + q.durationMs, 0) * 10) / 10,
  });
}

/**
 * Recurring jobs (table job_schedules, e.g. the daily notification digest): enqueues every due schedule
 * once and moves next_run_at forward (skipping runs missed while the server was down). With several
 * workers, the UPDATE row lock lets exactly one of them take each run.
 */
export async function runDueSchedules(): Promise<string[]> {
  return withTransaction(async (client) => {
    const { rows } = await client.query<{ name: string; queue: string }>(
      `UPDATE job_schedules
          SET last_run_at = NOW(),
              next_run_at = next_run_at + make_interval(secs => interval_seconds * (FLOOR(EXTRACT(EPOCH FROM NOW() - next_run_at) / interval_seconds) + 1))
        WHERE enabled AND next_run_at <= NOW()
        RETURNING name, queue`,
    );
    for (const s of rows) await enqueue(s.queue, { schedule: s.name }, { executor: client });
    if (rows.length) logger.info(`Scheduled jobs enqueued: ${rows.map((r) => r.name).join(', ')}`);
    return rows.map((r) => r.name);
  });
}

/** Re-queues jobs whose worker died, deletes old completed jobs, and starts due recurring jobs. */
async function maintenance() {
  try {
    await runDueSchedules();
    const stuck = await db.query(
      `UPDATE jobs SET status = 'pending', locked_at = NULL, updated_at = NOW()
        WHERE status = 'running' AND locked_at < NOW() - make_interval(mins => $1)`,
      [STUCK_AFTER_MINUTES],
    );
    if (stuck.rowCount) logger.warn(`Re-queued ${stuck.rowCount} stuck job(s)`);
    await db.query(`DELETE FROM jobs WHERE status = 'completed' AND completed_at < NOW() - make_interval(days => $1)`, [
      KEEP_COMPLETED_DAYS,
    ]);
  } catch (err) {
    logger.error(`Job maintenance failed: ${(err as Error).message}`);
  }
}

export function startWorker(options: { concurrency: number; pollIntervalMs: number }) {
  if (running) return;
  running = true;

  const loop = async () => {
    while (running) {
      try {
        const worked = await processNextJob();
        if (!worked) await sleep(options.pollIntervalMs);
      } catch (err) {
        logger.error(`Job worker error: ${(err as Error).message}`);
        await sleep(options.pollIntervalMs * 5);
      }
    }
  };

  loops = Array.from({ length: Math.max(1, options.concurrency) }, loop);
  void maintenance();
  maintenanceTimer = setInterval(maintenance, 60_000);
  logger.info(`Job worker started`, { workerId, concurrency: options.concurrency, queues: [...handlers.keys()].join(',') });
}

/** Stops polling and waits for running jobs to finish (graceful shutdown). */
export async function stopWorker() {
  if (!running) return;
  running = false;
  if (maintenanceTimer) clearInterval(maintenanceTimer);
  await Promise.all(loops);
  loops = [];
}

/** Runs every due job now (tests / scripts). */
export async function drainJobs(limit = 100): Promise<number> {
  let count = 0;
  while (count < limit && (await processNextJob())) count++;
  return count;
}
