import { describe, expect, it } from 'vitest';
import { db, withTransaction } from '../../src/database/db.js';
import { enqueue } from '../../src/jobs/queue.js';
import { defineJob, drainJobs } from '../../src/jobs/worker.js';

const jobRow = async (id: number) =>
  (await db.query('SELECT status, attempts, last_error AS "lastError", run_at AS "runAt" FROM jobs WHERE id = $1', [id])).rows[0];

describe('background job queue', () => {
  it('runs a job once and marks it completed', async () => {
    const seen: number[] = [];
    defineJob<{ n: number }>('test.ok', async (p) => {
      seen.push(p.n);
    });
    const id = await enqueue('test.ok', { n: 7 });
    await drainJobs();
    expect(seen).toEqual([7]);
    expect((await jobRow(id)).status).toBe('completed');
  });

  it('retries with backoff, then fails after max attempts', async () => {
    defineJob('test.fail', async () => {
      throw new Error('boom');
    });
    const id = await enqueue('test.fail', {}, { maxAttempts: 2 });

    await drainJobs();
    let row = await jobRow(id);
    expect(row.status).toBe('pending'); // scheduled for a retry in the future
    expect(row.attempts).toBe(1);
    expect(new Date(row.runAt).getTime()).toBeGreaterThan(Date.now());

    await db.query('UPDATE jobs SET run_at = NOW() WHERE id = $1', [id]); // fast-forward
    await drainJobs();
    row = await jobRow(id);
    expect(row.status).toBe('failed');
    expect(row.attempts).toBe(2);
    expect(row.lastError).toBe('boom');
  });

  it('jobs enqueued inside a rolled-back transaction never exist (transactional outbox)', async () => {
    let jobId = 0;
    await expect(
      withTransaction(async (client) => {
        jobId = await enqueue('test.ok', { n: 1 }, { executor: client });
        throw new Error('rollback');
      }),
    ).rejects.toThrow('rollback');
    expect(await jobRow(jobId)).toBeUndefined();
  });

  it('fails jobs for unknown queues instead of looping forever', async () => {
    const id = await enqueue('test.unknown', {});
    await drainJobs();
    const row = await jobRow(id);
    expect(row.status).toBe('failed');
    expect(row.lastError).toContain('No handler');
  });
});
