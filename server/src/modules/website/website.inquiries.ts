// Contact form → Inquiries inbox (Platform → Website → Inquiries).
//   visitors: POST /api/website/inquiries (no login) — rate limited, hidden "website" field + time check against bots
//   on arrival: an automatic "we received it" e-mail to the sender, a notification e-mail to every platform admin
//   the platform owner: read, change status, keep internal notes, reply (sent by e-mail and kept with the inquiry), delete
import { z } from 'zod';
import { db, withTransaction } from '../../database/db.js';
import { NotFoundException } from '../../common/exceptions/http.exception.js';
import { logger } from '../../common/logger/logger.js';
import { audit } from '../../common/utils/audit.js';
import type { RequestContext } from '../../common/utils/request-context.js';
import { env } from '../../config/env.js';
import { queueEmail } from '../email/email.service.js';
import { INQUIRY_TYPES } from './website.sections.js';

export const INQUIRY_STATUSES = ['new', 'replied', 'closed', 'spam'] as const;
export const TEAM_SIZES = ['1-10', '11-50', '51-200', '201-1000', '1000+'] as const;
/** a human needs a few seconds to fill in the form; bots post instantly */
const MIN_FILL_MS = 2500;

const optional = (max: number) => z.string().trim().max(max).optional().transform((v) => v || null);
export const inquirySchema = z.object({
  type: z.enum(INQUIRY_TYPES).default('question'),
  name: z.string().trim().min(1, 'Tell us your name').max(100),
  email: z.string().trim().toLowerCase().email('A valid email address, please').max(255),
  company: optional(150),
  teamSize: z.enum(TEAM_SIZES).optional().nullable(),
  phone: optional(40),
  message: z.string().trim().min(10, 'A few more words, please (at least 10 characters)').max(5000),
  sourcePath: z.string().trim().max(200).regex(/^\//).optional().nullable(),
  /** honeypot: invisible to people, bots fill it */
  website: z.string().max(500).optional(),
  /** milliseconds between showing the form and sending it */
  elapsedMs: z.number().int().min(0).optional(),
});

export const listInquiriesQuery = z.object({
  status: z.enum([...INQUIRY_STATUSES, 'open', 'all']).default('open'), // open = new + replied
  type: z.enum(INQUIRY_TYPES).optional(),
  search: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});
export const updateInquirySchema = z
  .object({ status: z.enum(INQUIRY_STATUSES).optional(), notes: z.string().max(10_000).nullable().optional() })
  .refine((d) => d.status !== undefined || d.notes !== undefined, { message: 'Nothing to update' });
export const replySchema = z.object({ body: z.string().trim().min(1, 'Write a reply').max(10_000), close: z.boolean().default(false) });

export const TYPE_LABELS: Record<(typeof INQUIRY_TYPES)[number], string> = {
  question: 'General question',
  demo: 'Demo request',
  sales: 'Sales / pricing',
  support: 'Support',
};

const SELECT = `
  SELECT i.id, i.type, i.status, i.name, i.email, i.company, i.team_size AS "teamSize", i.phone, i.message, i.notes,
         i.source_path AS "sourcePath", i.replied_at AS "repliedAt", i.created_at AS "createdAt", i.updated_at AS "updatedAt",
         (SELECT COUNT(*)::int FROM website_inquiry_replies r WHERE r.inquiry_id = i.id) AS "replyCount"
    FROM website_inquiries i`;

export class InquiriesService {
  /** From the contact form. Bots get the same "thank you" — but nothing is sent and it lands in Spam. */
  async submit(dto: z.infer<typeof inquirySchema>, ctx: RequestContext): Promise<void> {
    const spam = !!dto.website || (dto.elapsedMs !== undefined && dto.elapsedMs < MIN_FILL_MS);
    await withTransaction(async (client) => {
      const { rows } = await client.query<{ id: number }>(
        `INSERT INTO website_inquiries (type, status, name, email, company, team_size, phone, message, source_path, ip_address, user_agent)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id`,
        [dto.type, spam ? 'spam' : 'new', dto.name, dto.email, dto.company, dto.teamSize ?? null, dto.phone, dto.message, dto.sourcePath ?? null, ctx.ip, ctx.userAgent],
      );
      if (spam) return;
      const id = rows[0]!.id;
      await queueEmail(
        { to: dto.email, template: 'inquiryReceived', data: { name: dto.name, topic: TYPE_LABELS[dto.type], message: dto.message, url: `${env.appUrl}/` } },
        client,
      );
      const admins = await client.query<{ email: string; name: string }>('SELECT email, name FROM users WHERE is_platform_admin AND is_active');
      for (const a of admins.rows) {
        await queueEmail(
          {
            to: a.email,
            template: 'inquiryNew',
            data: {
              adminName: a.name, topic: TYPE_LABELS[dto.type], fromName: dto.name, fromEmail: dto.email, company: dto.company,
              message: dto.message, url: `${env.appUrl}/platform/website?tab=inquiries&inquiry=${id}`,
            },
          },
          client,
        );
      }
    });
    if (spam) logger.info('Contact form: message filed as spam', { ip: ctx.ip });
  }

  async list(q: z.infer<typeof listInquiriesQuery>) {
    const where: string[] = [];
    const params: unknown[] = [];
    const add = (sql: (p: string) => string, v: unknown) => {
      params.push(v);
      where.push(sql(`$${params.length}`));
    };
    if (q.status === 'open') where.push(`i.status IN ('new', 'replied')`);
    else if (q.status !== 'all') add((p) => `i.status = ${p}`, q.status);
    if (q.type) add((p) => `i.type = ${p}`, q.type);
    if (q.search) add((p) => `(i.name ILIKE ${p} OR i.email ILIKE ${p} OR i.company ILIKE ${p} OR i.message ILIKE ${p})`, `%${q.search.replace(/[\\%_]/g, '\\$&')}%`);
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const [items, total, counts] = await Promise.all([
      db.query(`${SELECT} ${whereSql} ORDER BY (i.status = 'new') DESC, i.created_at DESC LIMIT ${q.limit} OFFSET ${(q.page - 1) * q.limit}`, params),
      db.query<{ n: number }>(`SELECT COUNT(*)::int AS n FROM website_inquiries i ${whereSql}`, params),
      db.query<{ status: string; n: number }>('SELECT status, COUNT(*)::int AS n FROM website_inquiries GROUP BY status'),
    ]);
    const c = Object.fromEntries(INQUIRY_STATUSES.map((s) => [s, counts.rows.find((r) => r.status === s)?.n ?? 0]));
    return { items: items.rows, total: total.rows[0]!.n, page: q.page, limit: q.limit, counts: c };
  }

  async get(id: number) {
    const { rows } = await db.query(`${SELECT} WHERE i.id = $1`, [id]);
    if (!rows[0]) throw new NotFoundException('Inquiry not found');
    const replies = await db.query(
      `SELECT r.id, r.body, r.created_at AS "createdAt", CASE WHEN u.id IS NULL THEN NULL ELSE json_build_object('id', u.id, 'name', u.name) END AS "sentBy"
         FROM website_inquiry_replies r LEFT JOIN users u ON u.id = r.sent_by WHERE r.inquiry_id = $1 ORDER BY r.created_at, r.id`,
      [id],
    );
    return { ...rows[0], replies: replies.rows };
  }

  async update(id: number, dto: z.infer<typeof updateInquirySchema>, ctx: RequestContext) {
    const { rowCount } = await db.query(
      `UPDATE website_inquiries SET status = COALESCE($2, status), notes = CASE WHEN $3::boolean THEN $4 ELSE notes END, updated_at = NOW() WHERE id = $1`,
      [id, dto.status ?? null, dto.notes !== undefined, dto.notes ?? null],
    );
    if (!rowCount) throw new NotFoundException('Inquiry not found');
    if (dto.status) await audit(ctx, { action: 'website.inquiry_status', entity: 'website_inquiry', entityId: id, details: { status: dto.status }, organizationId: null });
    return this.get(id);
  }

  /** E-mails the answer to the sender and keeps it with the inquiry. */
  async reply(id: number, dto: z.infer<typeof replySchema>, ctx: RequestContext) {
    const inquiry = (await this.get(id)) as { name: string; email: string; message: string; type: keyof typeof TYPE_LABELS; status: string };
    await withTransaction(async (client) => {
      await client.query('INSERT INTO website_inquiry_replies (inquiry_id, body, sent_by) VALUES ($1, $2, $3)', [id, dto.body, ctx.user!.id]);
      await client.query(`UPDATE website_inquiries SET status = $2, replied_at = NOW(), updated_at = NOW() WHERE id = $1`, [id, dto.close ? 'closed' : 'replied']);
      await queueEmail(
        {
          to: inquiry.email,
          template: 'inquiryReply',
          data: { name: inquiry.name, topic: TYPE_LABELS[inquiry.type], reply: dto.body, original: inquiry.message, senderName: ctx.user!.name, contactUrl: `${env.appUrl}/contact` },
        },
        client,
      );
      await audit(ctx, { action: 'website.inquiry_reply', entity: 'website_inquiry', entityId: id, organizationId: null }, client);
    });
    return this.get(id);
  }

  async remove(id: number, ctx: RequestContext) {
    const { rowCount } = await db.query('DELETE FROM website_inquiries WHERE id = $1', [id]);
    if (!rowCount) throw new NotFoundException('Inquiry not found');
    await audit(ctx, { action: 'website.inquiry_delete', entity: 'website_inquiry', entityId: id, organizationId: null });
  }
}
