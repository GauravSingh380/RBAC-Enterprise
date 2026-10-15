// Background job queue stored in PostgreSQL (table "jobs").
//
//   await enqueue('email.send', { emailId }, { executor: client })
//
// Passing a transaction client as `executor` makes the job part of the same transaction
// ("transactional outbox"): if the business change rolls back, the job is never created,
// and if it commits, the job is guaranteed to exist.
import { db, type Queryable } from '../database/db.js';
import { getLogContext } from '../common/logger/context.js';

export interface EnqueueOptions {
  executor?: Queryable;
  /** Run no earlier than this. */
  runAt?: Date;
  maxAttempts?: number;
  organizationId?: number | null;
}

export interface JobRow<T = Record<string, unknown>> {
  id: number;
  queue: string;
  payload: T;
  status: 'pending' | 'running' | 'completed' | 'failed';
  attempts: number;
  maxAttempts: number;
  runAt: Date;
  lastError: string | null;
  organizationId: number | null;
  createdAt: Date;
  completedAt: Date | null;
}

export const JOB_COLUMNS = `id::int, queue, payload, status, attempts, max_attempts AS "maxAttempts", run_at AS "runAt",
  last_error AS "lastError", organization_id AS "organizationId", created_at AS "createdAt", completed_at AS "completedAt"`;

export async function enqueue<T extends object>(queue: string, payload: T, options: EnqueueOptions = {}): Promise<number> {
  const executor = options.executor ?? db;
  const { rows } = await executor.query<{ id: number }>(
    `INSERT INTO jobs (queue, payload, run_at, max_attempts, organization_id)
     VALUES ($1, $2, COALESCE($3, NOW()), $4, $5) RETURNING id::int`,
    [
      queue,
      // keep the request id so the job's logs can be traced back to the request that created it
      JSON.stringify({ ...payload, _requestId: getLogContext()?.requestId }),
      options.runAt ?? null,
      options.maxAttempts ?? 5,
      options.organizationId ?? null,
    ],
  );
  return rows[0]!.id;
}
