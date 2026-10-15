// Production error inbox: browse grouped errors, resolve / ignore them, turn one into a bug.
//   * organization scope: errors of the active organization (permission errors.read / errors.manage)
//   * platform scope: every group, including errors outside any organization (platform admins)
import { z } from 'zod';
import { db, withTransaction } from '../../database/db.js';
import { BadRequestException, ConflictException, NotFoundException } from '../../common/exceptions/http.exception.js';
import { audit } from '../../common/utils/audit.js';
import { tenantOf, type RequestContext } from '../../common/utils/request-context.js';
import { env } from '../../config/env.js';
import { recordEvents } from '../work-items/work-item-events.js';
import { resolveItem, WorkItemsService } from '../work-items/work-items.service.js';
import { PRIORITIES, SEVERITIES } from '../work-items/work-items.dto.js';
import { parseUserAgent } from './fingerprint.js';

export const listErrorsQuerySchema = z.object({
  status: z.enum(['unresolved', 'resolved', 'ignored', 'all']).default('unresolved'),
  source: z.enum(['server', 'client']).optional(),
  search: z.string().trim().max(200).optional(),
  sort: z.enum(['last_seen', 'first_seen', 'occurrences']).default('last_seen'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

export const createBugFromErrorSchema = z.object({
  projectRef: z.union([z.string().trim().regex(/^([A-Za-z][A-Za-z0-9]{1,9}|\d+)$/), z.number().int().positive()]),
  title: z.string().trim().min(1).max(500).optional(),
  priority: z.enum(PRIORITIES).optional(),
  severity: z.enum(SEVERITIES).optional(),
  assigneeId: z.number().int().positive().nullable().optional(),
});

export const linkBugSchema = z.object({
  itemRef: z.union([z.number().int().positive(), z.string().trim().regex(/^[A-Za-z][A-Za-z0-9]{1,9}-\d+$/, 'Use a key like TF-12')]),
});

export type ListErrorsQuery = z.infer<typeof listErrorsQuerySchema>;
export type CreateBugFromErrorDto = z.infer<typeof createBugFromErrorSchema>;

export interface ErrorGroup {
  id: number;
  organizationId: number | null;
  organizationName?: string | null;
  source: 'server' | 'client';
  title: string;
  culprit: string | null;
  status: 'unresolved' | 'resolved' | 'ignored';
  occurrences: number;
  usersAffected: number;
  firstSeenAt: Date;
  lastSeenAt: Date;
  resolvedAt: Date | null;
  regressedAt: Date | null;
  lastRelease: string | null;
  bug: { id: number; key: string; title: string; status: { name: string; category: string; color: string } } | null;
}

export interface ErrorEvent {
  id: number;
  occurredAt: Date;
  requestId: string | null;
  user: { id: number; name: string } | null;
  method: string | null;
  url: string | null;
  message: string;
  stack: string | null;
  userAgent: string | null;
  release: string | null;
  context: Record<string, unknown>;
}

const GROUP_SELECT = `
  SELECT g.id, g.organization_id AS "organizationId", o.name AS "organizationName", g.source, g.title, g.culprit, g.status,
         g.occurrences, g.first_seen_at AS "firstSeenAt", g.last_seen_at AS "lastSeenAt", g.resolved_at AS "resolvedAt",
         g.regressed_at AS "regressedAt", g.last_release AS "lastRelease",
         (SELECT COUNT(DISTINCT e.user_id)::int FROM error_events e WHERE e.group_id = g.id) AS "usersAffected",
         CASE WHEN w.id IS NULL THEN NULL ELSE json_build_object(
           'id', w.id, 'key', p.key || '-' || w.number, 'title', w.title,
           'status', json_build_object('name', s.name, 'category', s.category, 'color', s.color)) END AS bug
    FROM error_groups g
    LEFT JOIN organizations o ON o.id = g.organization_id
    LEFT JOIN work_items w ON w.id = g.work_item_id AND w.deleted_at IS NULL -- a bug in the trash is not shown
    LEFT JOIN projects p ON p.id = w.project_id
    LEFT JOIN project_statuses s ON s.id = w.status_id`;

const SORTS = { last_seen: 'g.last_seen_at DESC', first_seen: 'g.first_seen_at DESC', occurrences: 'g.occurrences DESC' } as const;

export class ErrorsService {
  private readonly items = new WorkItemsService();

  /** organizationId = null → platform scope (all organizations). */
  async list(query: ListErrorsQuery, organizationId: number | null) {
    const where: string[] = [];
    const params: unknown[] = [];
    const add = (sql: (p: string) => string, v: unknown) => {
      params.push(v);
      where.push(sql(`$${params.length}`));
    };
    if (organizationId !== null) add((p) => `g.organization_id = ${p}`, organizationId);
    if (query.status !== 'all') add((p) => `g.status = ${p}`, query.status);
    if (query.source) add((p) => `g.source = ${p}`, query.source);
    if (query.search) add((p) => `(g.title ILIKE ${p} OR g.culprit ILIKE ${p})`, `%${query.search}%`);
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const [items, total, counts] = await Promise.all([
      db.query<ErrorGroup>(`${GROUP_SELECT} ${whereSql} ORDER BY ${SORTS[query.sort]}, g.id DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`, [
        ...params,
        query.limit,
        (query.page - 1) * query.limit,
      ]),
      db.query<{ count: number }>(`SELECT COUNT(*)::int AS count FROM error_groups g ${whereSql}`, params),
      // tab badges: per status, same scope
      db.query<{ status: string; count: number }>(
        `SELECT status, COUNT(*)::int AS count FROM error_groups g ${organizationId !== null ? 'WHERE g.organization_id = $1' : ''} GROUP BY status`,
        organizationId !== null ? [organizationId] : [],
      ),
    ]);
    return {
      items: items.rows,
      total: total.rows[0]!.count,
      page: query.page,
      limit: query.limit,
      counts: Object.fromEntries(counts.rows.map((r) => [r.status, r.count])) as Record<string, number>,
    };
  }

  async findOne(id: number, organizationId: number | null) {
    const group = await this.loadGroup(id, organizationId);
    const [events, daily] = await Promise.all([
      db.query<ErrorEvent>(
        `SELECT e.id::int, e.occurred_at AS "occurredAt", e.request_id AS "requestId",
                CASE WHEN u.id IS NULL THEN NULL ELSE json_build_object('id', u.id, 'name', u.name) END AS "user",
                e.method, e.url, e.message, e.stack, e.user_agent AS "userAgent", e.release, e.context
           FROM error_events e LEFT JOIN users u ON u.id = e.user_id
          WHERE e.group_id = $1 ORDER BY e.id DESC LIMIT 20`,
        [id],
      ),
      // recent occurrences per day (from the kept events — an indication, not an exact count)
      db.query<{ date: string; count: number }>(
        `SELECT to_char(d, 'YYYY-MM-DD') AS date,
                (SELECT COUNT(*)::int FROM error_events e WHERE e.group_id = $1 AND e.occurred_at >= d AND e.occurred_at < d + INTERVAL '1 day') AS count
           FROM generate_series(CURRENT_DATE - 13, CURRENT_DATE, INTERVAL '1 day') d ORDER BY d`,
        [id],
      ),
    ]);
    return { ...group, events: events.rows, daily: daily.rows };
  }

  async setStatus(id: number, status: 'resolved' | 'ignored' | 'unresolved', ctx: RequestContext, organizationId: number | null) {
    await this.loadGroup(id, organizationId);
    await db.query(
      `UPDATE error_groups SET status = $2::text,
              resolved_at = CASE WHEN $2::text = 'resolved' THEN NOW() ELSE NULL END,
              resolved_by = CASE WHEN $2::text = 'resolved' THEN $3::int ELSE NULL END
        WHERE id = $1`,
      [id, status, ctx.user!.id],
    );
    await audit(ctx, { action: `error.${status === 'unresolved' ? 'reopen' : status === 'resolved' ? 'resolve' : 'ignore'}`, entity: 'error_group', entityId: id });
    return this.loadGroup(id, organizationId);
  }

  /** Files a bug in a project (the user needs edit rights there) pre-filled from the error, and links them. */
  async createBug(id: number, dto: CreateBugFromErrorDto, ctx: RequestContext) {
    const organizationId = tenantOf(ctx).organizationId;
    const group = await this.loadGroup(id, organizationId);
    if (group.bug) throw new ConflictException(`This error is already linked to ${group.bug.key}`);
    const { rows: latest } = await db.query<ErrorEvent>(
      `SELECT e.request_id AS "requestId", e.method, e.url, e.message, e.stack, e.user_agent AS "userAgent", e.release, e.context
         FROM error_events e WHERE e.group_id = $1 ORDER BY e.id DESC LIMIT 1`,
      [id],
    );
    const e = latest[0];
    const ua = parseUserAgent(e?.userAgent);
    const where = group.source === 'server' ? `\`${group.culprit}\`` : `page \`${String(e?.context?.page ?? e?.url ?? '')}\``;
    const stackLines = (e?.stack ?? '').split('\n').slice(0, 15).join('\n');

    const description = [
      `**Production error** captured automatically (${group.source}) — [open in Production Errors](/errors/${group.id})`,
      '',
      '| | |',
      '|---|---|',
      `| Occurrences | ${group.occurrences} · ${group.usersAffected} user(s) affected |`,
      `| First / last seen | ${new Date(group.firstSeenAt).toISOString()} / ${new Date(group.lastSeenAt).toISOString()} |`,
      `| Where | ${where} |`,
      `| Release | ${group.lastRelease ?? '—'} |`,
      e?.requestId ? `| ${group.source === 'server' ? 'Request id' : 'Error id'} | \`${e.requestId}\` — search it in \`server/logs/\` for the full request and SQL |` : '',
      '',
      stackLines ? '```text\n' + stackLines + '\n```' : '',
    ]
      .filter((line) => line !== '')
      .join('\n');

    const bug = await this.items.create(
      String(dto.projectRef),
      {
        type: 'bug',
        title: (dto.title ?? `[Error] ${group.title}`).slice(0, 500),
        description,
        priority: dto.priority ?? 'high',
        severity: dto.severity ?? (group.occurrences >= 100 ? 'critical' : 'major'),
        assigneeId: dto.assigneeId ?? undefined,
        environment: `${group.source === 'server' ? 'Server' : 'Browser'} · ${String(e?.context?.environment ?? env.nodeEnv)}`,
        stepsToReproduce: group.source === 'server' ? `${e?.method ?? ''} ${e?.url ?? ''}`.trim() : `Open ${e?.url ?? 'the page'}`,
        expectedResult: group.source === 'server' ? 'The request completes without a server error.' : 'The page works without crashing.',
        actualResult: e?.message ?? group.title,
        browser: ua.browser,
        os: ua.os,
        foundInVersion: group.lastRelease,
      },
      ctx,
    );
    await this.link(id, bug.id, organizationId, ctx);
    return { group: await this.loadGroup(id, organizationId), bug: await this.items.findOne(String(bug.id), ctx) };
  }

  /** Link an existing bug (e.g. the error is a known issue). */
  async linkBug(id: number, itemRef: string | number, ctx: RequestContext) {
    const organizationId = tenantOf(ctx).organizationId;
    await this.loadGroup(id, organizationId);
    const { itemId } = await resolveItem(ctx, itemRef); // must be visible to the user
    await this.link(id, itemId, organizationId, ctx);
    return this.loadGroup(id, organizationId);
  }

  private async link(groupId: number, itemId: number, organizationId: number, ctx: RequestContext) {
    await withTransaction(async (client) => {
      await client.query('UPDATE error_groups SET work_item_id = $2 WHERE id = $1', [groupId, itemId]);
      await recordEvents(client, { id: itemId, organizationId }, ctx.user!.id, [{ type: 'error_linked', newValue: { groupId } }]);
      await audit(ctx, { action: 'error.link_bug', entity: 'error_group', entityId: groupId, details: { workItemId: itemId } }, client);
    });
  }

  private async loadGroup(id: number, organizationId: number | null): Promise<ErrorGroup> {
    const { rows } = await db.query<ErrorGroup>(
      `${GROUP_SELECT} WHERE g.id = $1 ${organizationId !== null ? 'AND g.organization_id = $2' : ''}`,
      organizationId !== null ? [id, organizationId] : [id],
    );
    if (!rows[0]) throw new NotFoundException('Error not found');
    return rows[0];
  }
}

/** Development helper: throws on purpose so the inbox can be tried out. Disabled in production. */
export function simulateError(kind: string): never {
  if (env.isProduction) throw new BadRequestException('Not available in production');
  if (kind === 'type') {
    const settings = JSON.parse('{}') as { theme: { name: string } };
    return settings.theme.name as never; // TypeError: Cannot read properties of undefined (reading 'name')
  }
  throw new Error(`Simulated failure for testing the error inbox (${kind})`);
}
