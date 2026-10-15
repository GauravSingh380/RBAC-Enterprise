// Platform operations: the email outbox ("Mailbox") and the background job queue.
import { z } from 'zod';
import { db } from '../../database/db.js';
import { BadRequestException, NotFoundException } from '../../common/exceptions/http.exception.js';
import { audit } from '../../common/utils/audit.js';
import { paginationSchema, type Paginated } from '../../common/utils/pagination.js';
import type { RequestContext } from '../../common/utils/request-context.js';
import { JOB_COLUMNS, enqueue, type JobRow } from '../../jobs/queue.js';
import { EMAIL_QUEUE } from '../email/email.service.js';

export const emailListQuerySchema = paginationSchema.extend({
  status: z.enum(['queued', 'sent', 'failed']).optional(),
});

export const jobListQuerySchema = paginationSchema.extend({
  status: z.enum(['pending', 'running', 'completed', 'failed']).optional(),
  queue: z.string().max(100).optional(),
});

export interface EmailSummary {
  id: number;
  to: string;
  subject: string;
  template: string;
  status: string;
  driver: string | null;
  previewUrl: string | null;
  error: string | null;
  attempts: number;
  organization: string | null;
  createdAt: Date;
  sentAt: Date | null;
}

export class PlatformOpsService {
  async listEmails(query: z.infer<typeof emailListQuerySchema>): Promise<Paginated<EmailSummary>> {
    const search = query.search ? `%${query.search}%` : null;
    const where = `($1::text IS NULL OR e.to_address ILIKE $1 OR e.subject ILIKE $1) AND ($2::text IS NULL OR e.status = $2)`;
    const [items, total] = await Promise.all([
      db.query<EmailSummary>(
        `SELECT e.id::int, e.to_address AS "to", e.subject, e.template, e.status, e.driver, e.preview_url AS "previewUrl",
                e.error, e.attempts, o.name AS organization, e.created_at AS "createdAt", e.sent_at AS "sentAt"
           FROM email_messages e LEFT JOIN organizations o ON o.id = e.organization_id
          WHERE ${where}
          ORDER BY e.created_at DESC, e.id DESC
          LIMIT $3 OFFSET $4`,
        [search, query.status ?? null, query.limit, (query.page - 1) * query.limit],
      ),
      db.query<{ count: number }>(`SELECT COUNT(*)::int AS count FROM email_messages e WHERE ${where}`, [search, query.status ?? null]),
    ]);
    return { items: items.rows, total: total.rows[0]!.count, page: query.page, limit: query.limit };
  }

  async getEmail(id: number) {
    const { rows } = await db.query(
      `SELECT id::int, to_address AS "to", subject, template, status, driver, preview_url AS "previewUrl", error, attempts,
              html, text, created_at AS "createdAt", sent_at AS "sentAt"
         FROM email_messages WHERE id = $1`,
      [id],
    );
    if (!rows[0]) throw new NotFoundException('Email not found');
    return rows[0];
  }

  /** Queue a failed (or any) email again. */
  async resendEmail(id: number, ctx: RequestContext): Promise<void> {
    const { rowCount } = await db.query(
      `UPDATE email_messages SET status = 'queued', error = NULL WHERE id = $1 AND html IS NOT NULL`,
      [id],
    );
    if (!rowCount) throw new BadRequestException('Email not found or its content was already discarded');
    await enqueue(EMAIL_QUEUE, { emailId: id });
    await audit(ctx, { action: 'platform.email_resend', entity: 'email', entityId: id, organizationId: null });
  }

  async jobStats() {
    const { rows } = await db.query<{ status: string; count: number }>(
      'SELECT status, COUNT(*)::int AS count FROM jobs GROUP BY status',
    );
    const stats = { pending: 0, running: 0, completed: 0, failed: 0 } as Record<string, number>;
    for (const r of rows) stats[r.status] = r.count;
    return stats;
  }

  async listJobs(query: z.infer<typeof jobListQuerySchema>): Promise<Paginated<JobRow & { lockedBy: string | null }>> {
    const where = `($1::text IS NULL OR status = $1) AND ($2::text IS NULL OR queue = $2)`;
    const params = [query.status ?? null, query.queue ?? null];
    const [items, total] = await Promise.all([
      db.query<JobRow & { lockedBy: string | null }>(
        `SELECT ${JOB_COLUMNS}, locked_by AS "lockedBy" FROM jobs WHERE ${where}
          ORDER BY created_at DESC, id DESC LIMIT $3 OFFSET $4`,
        [...params, query.limit, (query.page - 1) * query.limit],
      ),
      db.query<{ count: number }>(`SELECT COUNT(*)::int AS count FROM jobs WHERE ${where}`, params),
    ]);
    return { items: items.rows, total: total.rows[0]!.count, page: query.page, limit: query.limit };
  }

  /** Give a failed job a fresh set of attempts. */
  async retryJob(id: number, ctx: RequestContext): Promise<void> {
    const { rowCount } = await db.query(
      `UPDATE jobs SET status = 'pending', attempts = 0, run_at = NOW(), last_error = NULL, updated_at = NOW()
        WHERE id = $1 AND status = 'failed'`,
      [id],
    );
    if (!rowCount) throw new BadRequestException('Only failed jobs can be retried');
    await audit(ctx, { action: 'platform.job_retry', entity: 'job', entityId: id, organizationId: null });
  }
}
