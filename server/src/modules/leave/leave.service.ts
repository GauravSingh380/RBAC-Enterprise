// Leave requests: preview → request → approve / reject / cancel, balances and the team calendar.
//
// Rules:
//   * cost = WORKING days of the person's holiday calendar (weekends + holidays excluded, half days = 0.5)
//   * limited types (an allowance) can't go below zero: available = entitled + carried over − approved − pending
//   * no overlapping pending / approved leave per person — enforced by the database (EXCLUDE constraint)
//   * approvers = leave.approve (or owners); nobody approves their own leave except an owner
//   * the team calendar shows WHO is out to everyone, but the TYPE (e.g. sick) only to the person and approvers
//   * notifications (bell + email by preference): approvers on a new request, the requester on a decision
import { db, withTransaction, type Queryable } from '../../database/db.js';
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '../../common/exceptions/http.exception.js';
import { PERMISSIONS } from '../../common/constants/rbac.js';
import type { TenantContext } from '../../common/types/auth.types.js';
import { audit } from '../../common/utils/audit.js';
import { tenantOf, type RequestContext } from '../../common/utils/request-context.js';
import { membersWithPermission, notify } from '../notifications/notify.js';
import { countLeaveDays, yearOf, type Portion } from './leave-days.js';
import type { CreateLeaveDto, ListLeaveQuery, PreviewLeaveDto } from './leave.dto.js';

const EXCLUSION_VIOLATION = '23P01';
const HIDDEN_TYPE = { id: 0, name: 'Out of office', color: '#8c8c8c', isPaid: true };

export const canApproveLeave = (t: TenantContext) => t.isOwner || t.permissions.includes(PERMISSIONS.LEAVE_APPROVE);
const canSeeTypes = (t: TenantContext) => canApproveLeave(t) || t.permissions.includes(PERMISSIONS.LEAVE_MANAGE);

export interface LeaveRequest {
  id: number;
  user: { id: number; name: string };
  type: { id: number; name: string; color: string; isPaid: boolean };
  startDate: string;
  endDate: string;
  portion: Portion;
  days: number;
  reason: string | null;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  decidedBy: { id: number; name: string } | null;
  decidedAt: Date | null;
  decisionNote: string | null;
  createdAt: Date;
  canCancel: boolean;
  canDecide: boolean;
}

const REQUEST_SELECT = `
  SELECT r.id, json_build_object('id', u.id, 'name', u.name) AS "user",
         json_build_object('id', t.id, 'name', t.name, 'color', t.color, 'isPaid', t.is_paid) AS type,
         to_char(r.start_date, 'YYYY-MM-DD') AS "startDate", to_char(r.end_date, 'YYYY-MM-DD') AS "endDate",
         r.portion, r.days::float AS days, r.reason, r.status,
         CASE WHEN d.id IS NULL THEN NULL ELSE json_build_object('id', d.id, 'name', d.name) END AS "decidedBy",
         r.decided_at AS "decidedAt", r.decision_note AS "decisionNote", r.created_at AS "createdAt",
         r.start_date > CURRENT_DATE AS "inFuture",
         (SELECT om.manager_id FROM organization_members om WHERE om.organization_id = r.organization_id AND om.user_id = r.user_id) AS "managerId"
    FROM leave_requests r
    JOIN users u ON u.id = r.user_id
    JOIN leave_types t ON t.id = r.leave_type_id
    LEFT JOIN users d ON d.id = r.decided_by`;

type Row = Omit<LeaveRequest, 'canCancel' | 'canDecide'> & { inFuture: boolean; managerId: number | null };

const fmt = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const describeDates = (r: { startDate: string; endDate: string; portion: Portion }) =>
  r.startDate === r.endDate ? `${fmt(r.startDate)}${r.portion === 'am' ? ' (morning)' : r.portion === 'pm' ? ' (afternoon)' : ''}` : `${fmt(r.startDate)} – ${fmt(r.endDate)}`;

/** The holiday calendar that applies to a member (theirs, or the organization's default) and its holidays in a range. */
export async function calendarFor(executor: Queryable, organizationId: number, userId: number, from: string, to: string) {
  const { rows } = await executor.query<{ id: number; weekendDays: number[] }>(
    `SELECT c.id, c.weekend_days AS "weekendDays"
       FROM organization_members m
       JOIN holiday_calendars c ON c.organization_id = m.organization_id
                               AND (c.id = m.holiday_calendar_id OR (m.holiday_calendar_id IS NULL AND c.is_default))
      WHERE m.organization_id = $1 AND m.user_id = $2
      LIMIT 1`,
    [organizationId, userId],
  );
  const calendar = rows[0] ?? { id: 0, weekendDays: [0, 6] }; // no calendar configured: Sat/Sun off
  const { rows: holidays } = await executor.query<{ date: string; name: string }>(
    `SELECT to_char(date, 'YYYY-MM-DD') AS date, name FROM holidays
      WHERE calendar_id = $1 AND date BETWEEN $2 AND $3 AND NOT is_optional`,
    [calendar.id, from, to],
  );
  return { ...calendar, holidays: new Map(holidays.map((h) => [h.date, h.name])) };
}

export class LeaveService {
  /** What would this request cost, and what's left afterwards? (live in the request form) */
  async preview(dto: PreviewLeaveDto, ctx: RequestContext) {
    const tenant = tenantOf(ctx);
    const type = await this.loadType(db, dto.leaveTypeId, tenant.organizationId);
    const count = await this.count(db, tenant.organizationId, ctx.user!.id, dto, type);
    const balance = await this.balanceOf(db, tenant.organizationId, ctx.user!.id, type.id, yearOf(dto.startDate));
    // teammates who are already out in that period (helps avoid everyone being away at once)
    const { rows: overlaps } = await db.query<{ name: string; startDate: string; endDate: string }>(
      `SELECT u.name, to_char(r.start_date, 'YYYY-MM-DD') AS "startDate", to_char(r.end_date, 'YYYY-MM-DD') AS "endDate"
         FROM leave_requests r JOIN users u ON u.id = r.user_id
        WHERE r.organization_id = $1 AND r.user_id <> $2 AND r.status IN ('approved', 'pending')
          AND daterange(r.start_date, r.end_date, '[]') && daterange($3::date, $4::date, '[]')
        ORDER BY r.start_date LIMIT 10`,
      [tenant.organizationId, ctx.user!.id, dto.startDate, dto.endDate],
    );
    return {
      ...count,
      balance: balance.entitled === null ? null : { ...balance, after: balance.available - count.days },
      teammatesOut: overlaps,
    };
  }

  async create(dto: CreateLeaveDto, ctx: RequestContext): Promise<LeaveRequest> {
    const tenant = tenantOf(ctx);
    const user = ctx.user!;

    const id = await withTransaction(async (client) => {
      const type = await this.loadType(client, dto.leaveTypeId, tenant.organizationId);
      const count = await this.count(client, tenant.organizationId, user.id, dto, type);
      // lock the person's balance check (two simultaneous requests can't both use the last days)
      await client.query('SELECT pg_advisory_xact_lock($1, $2)', [tenant.organizationId, user.id]);
      const balance = await this.balanceOf(client, tenant.organizationId, user.id, type.id, yearOf(dto.startDate));
      if (balance.entitled !== null && count.days > balance.available) {
        throw new BadRequestException(`Not enough ${type.name}: ${balance.available} day(s) available, this request needs ${count.days}`);
      }

      const status = type.requiresApproval ? 'pending' : 'approved';
      let rows: { id: number }[];
      try {
        ({ rows } = await client.query<{ id: number }>(
          `INSERT INTO leave_requests (organization_id, user_id, leave_type_id, start_date, end_date, portion, days, reason, status, decided_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::text, CASE WHEN $9::text = 'approved' THEN NOW() END) RETURNING id`,
          [tenant.organizationId, user.id, type.id, dto.startDate, dto.endDate, dto.portion, count.days, dto.reason || null, status],
        ));
      } catch (err: any) {
        if (err.code === EXCLUSION_VIOLATION) throw new ConflictException('You already have leave requested or approved in this period');
        throw err;
      }

      if (status === 'pending') {
        // the person's MANAGER decides; without a manager, the leave approvers (leave.approve or owners)
        const manager = await this.activeManagerOf(client, tenant.organizationId, user.id);
        await notify(client, {
          organizationId: tenant.organizationId,
          userIds: manager ? [manager] : await membersWithPermission(client, tenant.organizationId, PERMISSIONS.LEAVE_APPROVE),
          actorId: user.id,
          type: 'leave_requested',
          title: `${user.name} requested ${type.name}`,
          body: `${describeDates(dto)} · ${count.days} working day${count.days === 1 ? '' : 's'}${dto.reason ? ` — “${dto.reason}”` : ''}`,
          url: '/leave/approvals',
        });
      }
      await audit(ctx, { action: 'leave.request', entity: 'leave_request', entityId: rows[0]!.id, details: { type: type.name, ...dto, days: count.days, status } }, client);
      return rows[0]!.id;
    });
    return this.findOne(id, ctx);
  }

  async list(query: ListLeaveQuery, ctx: RequestContext) {
    const tenant = tenantOf(ctx);
    const approver = canApproveLeave(tenant);
    const reports = approver ? [] : await this.directReports(db, tenant.organizationId, ctx.user!.id);
    if (query.scope === 'team' && !approver && !reports.length) throw new ForbiddenException('You cannot see other people\'s requests');
    const where = ['r.organization_id = $1'];
    const params: unknown[] = [tenant.organizationId];
    const add = (sql: (p: string) => string, v: unknown) => {
      params.push(v);
      where.push(sql(`$${params.length}`));
    };
    // managers without leave.approve: only their direct reports
    if (query.scope === 'team' && !approver) add((p) => `r.user_id = ANY(${p}::int[])`, reports);
    if (query.scope === 'mine') add((p) => `r.user_id = ${p}`, ctx.user!.id);
    else if (query.userId) add((p) => `r.user_id = ${p}`, query.userId);
    if (query.status !== 'all') add((p) => `r.status = ${p}`, query.status);
    if (query.year) add((p) => `EXTRACT(YEAR FROM r.start_date) = ${p}`, query.year);
    const whereSql = where.join(' AND ');
    // pending first (oldest first: fair queue), then the rest newest first
    const [items, total] = await Promise.all([
      db.query<Row>(
        `${REQUEST_SELECT} WHERE ${whereSql}
          ORDER BY (r.status = 'pending') DESC, CASE WHEN r.status = 'pending' THEN r.created_at END ASC, r.start_date DESC, r.id DESC
          LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, query.limit, (query.page - 1) * query.limit],
      ),
      db.query<{ count: number }>(`SELECT COUNT(*)::int AS count FROM leave_requests r WHERE ${whereSql}`, params),
    ]);
    return { items: items.rows.map((r) => this.withRights(r, ctx)), total: total.rows[0]!.count, page: query.page, limit: query.limit };
  }

  async findOne(id: number, ctx: RequestContext): Promise<LeaveRequest> {
    const tenant = tenantOf(ctx);
    const { rows } = await db.query<Row>(`${REQUEST_SELECT} WHERE r.id = $1 AND r.organization_id = $2`, [id, tenant.organizationId]);
    const row = rows[0];
    if (!row || (row.user.id !== ctx.user!.id && !canApproveLeave(tenant) && row.managerId !== ctx.user!.id)) throw new NotFoundException('Leave request not found');
    return this.withRights(row, ctx);
  }

  async decide(id: number, decision: 'approved' | 'rejected', note: string | undefined, ctx: RequestContext): Promise<LeaveRequest> {
    const tenant = tenantOf(ctx);
    await withTransaction(async (client) => {
      const request = await this.lockRequest(client, id, tenant.organizationId);
      const isManager = request.managerId === ctx.user!.id;
      if (!canApproveLeave(tenant) && !isManager) {
        if (request.userId === ctx.user!.id) throw new ForbiddenException('You cannot decide on your own leave');
        throw new ForbiddenException('Only their manager or a leave approver can decide on this request');
      }
      if (request.status !== 'pending') throw new ConflictException(`This request is already ${request.status}`);
      if (request.userId === ctx.user!.id && !tenant.isOwner) throw new ForbiddenException('You cannot decide on your own leave');
      await client.query(
        `UPDATE leave_requests SET status = $2, decided_by = $3, decided_at = NOW(), decision_note = $4 WHERE id = $1`,
        [id, decision, ctx.user!.id, note || null],
      );
      await this.notifyRequester(client, id, tenant.organizationId, decision, note, ctx);
      await audit(ctx, { action: `leave.${decision === 'approved' ? 'approve' : 'reject'}`, entity: 'leave_request', entityId: id, details: { note } }, client);
    });
    return this.findOne(id, ctx);
  }

  /** The person (pending, or approved leave that hasn't started) or an approver (any pending / approved). */
  async cancel(id: number, note: string | undefined, ctx: RequestContext): Promise<LeaveRequest> {
    const tenant = tenantOf(ctx);
    await withTransaction(async (client) => {
      const request = await this.lockRequest(client, id, tenant.organizationId);
      const own = request.userId === ctx.user!.id;
      const canManage = canApproveLeave(tenant) || request.managerId === ctx.user!.id;
      if (!own && !canManage) throw new NotFoundException('Leave request not found');
      if (request.status !== 'pending' && request.status !== 'approved') throw new ConflictException(`This request is already ${request.status}`);
      if (own && !canManage && request.status === 'approved' && !request.inFuture) {
        throw new BadRequestException('Leave that has started can only be cancelled by an approver');
      }
      await client.query(`UPDATE leave_requests SET status = 'cancelled', decided_by = $2, decided_at = NOW(), decision_note = $3 WHERE id = $1`, [
        id,
        ctx.user!.id,
        note || null,
      ]);
      if (!own) await this.notifyRequester(client, id, tenant.organizationId, 'cancelled', note, ctx);
      await audit(ctx, { action: 'leave.cancel', entity: 'leave_request', entityId: id, details: { note } }, client);
    });
    return this.findOne(id, ctx);
  }

  /** Balances of the current user (or, for approvers / managers, of someone else). */
  async balances(year: number, userId: number | undefined, ctx: RequestContext) {
    const tenant = tenantOf(ctx);
    const target = userId ?? ctx.user!.id;
    if (target !== ctx.user!.id && !canSeeTypes(tenant)) throw new ForbiddenException('You cannot see other people\'s balances');
    const { rows: types } = await db.query<{ id: number; name: string; color: string; isPaid: boolean; allowHalfDay: boolean; requiresApproval: boolean }>(
      `SELECT id, name, color, is_paid AS "isPaid", allow_half_day AS "allowHalfDay", requires_approval AS "requiresApproval"
         FROM leave_types WHERE organization_id = $1 AND is_active ORDER BY position, lower(name)`,
      [tenant.organizationId],
    );
    return Promise.all(types.map(async (t) => ({ type: t, ...(await this.balanceOf(db, tenant.organizationId, target, t.id, year)) })));
  }

  /**
   * Who is out between two dates (approved + pending) and the holidays, for the team calendar.
   * Leave types are only revealed to the person themselves and to approvers / leave managers.
   */
  async calendar(from: string, to: string, ctx: RequestContext) {
    const tenant = tenantOf(ctx);
    const seeTypes = canSeeTypes(tenant);
    const [members, leaves, calendars, holidays] = await Promise.all([
      db.query<{ id: number; name: string; calendarId: number | null }>(
        `SELECT u.id, u.name, COALESCE(m.holiday_calendar_id, (SELECT id FROM holiday_calendars WHERE organization_id = $1 AND is_default)) AS "calendarId"
           FROM organization_members m JOIN users u ON u.id = m.user_id
          WHERE m.organization_id = $1 AND m.status = 'active' ORDER BY lower(u.name)`,
        [tenant.organizationId],
      ),
      db.query<{ id: number; userId: number; type: LeaveRequest['type']; startDate: string; endDate: string; portion: Portion; days: number; status: string }>(
        `SELECT r.id, r.user_id AS "userId",
                json_build_object('id', t.id, 'name', t.name, 'color', t.color, 'isPaid', t.is_paid) AS type,
                to_char(r.start_date, 'YYYY-MM-DD') AS "startDate", to_char(r.end_date, 'YYYY-MM-DD') AS "endDate",
                r.portion, r.days::float AS days, r.status
           FROM leave_requests r JOIN leave_types t ON t.id = r.leave_type_id
          WHERE r.organization_id = $1 AND r.status IN ('approved', 'pending')
            AND daterange(r.start_date, r.end_date, '[]') && daterange($2::date, $3::date, '[]')
          ORDER BY r.start_date`,
        [tenant.organizationId, from, to],
      ),
      db.query<{ id: number; name: string; weekendDays: number[]; isDefault: boolean }>(
        `SELECT id, name, weekend_days AS "weekendDays", is_default AS "isDefault" FROM holiday_calendars WHERE organization_id = $1`,
        [tenant.organizationId],
      ),
      db.query<{ calendarId: number; date: string; name: string; isOptional: boolean }>(
        `SELECT calendar_id AS "calendarId", to_char(date, 'YYYY-MM-DD') AS date, name, is_optional AS "isOptional"
           FROM holidays WHERE organization_id = $1 AND date BETWEEN $2 AND $3 ORDER BY date`,
        [tenant.organizationId, from, to],
      ),
    ]);
    return {
      members: members.rows,
      leaves: leaves.rows.map((l) => (seeTypes || l.userId === ctx.user!.id ? l : { ...l, type: HIDDEN_TYPE })),
      calendars: calendars.rows,
      holidays: holidays.rows,
    };
  }

  // ---------------------------------------------------------------- helpers

  private async count(executor: Queryable, organizationId: number, userId: number, dto: PreviewLeaveDto, type: { allowHalfDay: boolean }) {
    if (dto.endDate < dto.startDate) throw new BadRequestException('The end date is before the start date');
    if (yearOf(dto.startDate) !== yearOf(dto.endDate)) throw new BadRequestException('Split requests at the end of the year (one request per year)');
    if (dto.portion !== 'full' && !type.allowHalfDay) throw new BadRequestException('This leave type does not allow half days');
    const calendar = await calendarFor(executor, organizationId, userId, dto.startDate, dto.endDate);
    let count;
    try {
      count = countLeaveDays(dto.startDate, dto.endDate, dto.portion, calendar.weekendDays, calendar.holidays);
    } catch (err) {
      throw new BadRequestException((err as Error).message);
    }
    if (count.days === 0) throw new BadRequestException('These dates are all weekends or holidays — nothing to request');
    return count;
  }

  /** entitled (null = unlimited), carried over, used (approved), pending, available. */
  private async balanceOf(executor: Queryable, organizationId: number, userId: number, leaveTypeId: number, year: number) {
    const { rows } = await executor.query<{ entitled: number | null; carriedOver: number; used: number; pending: number }>(
      `SELECT COALESCE(b.entitled, t.default_days)::float AS entitled, COALESCE(b.carried_over, 0)::float AS "carriedOver",
              COALESCE((SELECT SUM(days) FROM leave_requests r WHERE r.user_id = $2 AND r.leave_type_id = t.id AND r.status = 'approved'
                          AND EXTRACT(YEAR FROM r.start_date) = $4), 0)::float AS used,
              COALESCE((SELECT SUM(days) FROM leave_requests r WHERE r.user_id = $2 AND r.leave_type_id = t.id AND r.status = 'pending'
                          AND EXTRACT(YEAR FROM r.start_date) = $4), 0)::float AS pending
         FROM leave_types t
         LEFT JOIN leave_balances b ON b.leave_type_id = t.id AND b.user_id = $2 AND b.year = $4
        WHERE t.id = $3 AND t.organization_id = $1`,
      [organizationId, userId, leaveTypeId, year],
    );
    const b = rows[0]!;
    const available = b.entitled === null ? null : Math.round((b.entitled + b.carriedOver - b.used - b.pending) * 10) / 10;
    return { year, ...b, available: available as number };
  }

  private async loadType(executor: Queryable, id: number, organizationId: number) {
    const { rows } = await executor.query<{ id: number; name: string; allowHalfDay: boolean; requiresApproval: boolean }>(
      `SELECT id, name, allow_half_day AS "allowHalfDay", requires_approval AS "requiresApproval"
         FROM leave_types WHERE id = $1 AND organization_id = $2 AND is_active`,
      [id, organizationId],
    );
    if (!rows[0]) throw new BadRequestException('Unknown leave type');
    return rows[0];
  }

  private async lockRequest(executor: Queryable, id: number, organizationId: number) {
    const { rows } = await executor.query<{ userId: number; status: string; inFuture: boolean; managerId: number | null }>(
      `SELECT r.user_id AS "userId", r.status, r.start_date > CURRENT_DATE AS "inFuture", om.manager_id AS "managerId"
         FROM leave_requests r
         LEFT JOIN organization_members om ON om.organization_id = r.organization_id AND om.user_id = r.user_id
        WHERE r.id = $1 AND r.organization_id = $2 FOR UPDATE OF r`,
      [id, organizationId],
    );
    if (!rows[0]) throw new NotFoundException('Leave request not found');
    return rows[0];
  }

  private async notifyRequester(executor: Queryable, id: number, organizationId: number, outcome: 'approved' | 'rejected' | 'cancelled', note: string | undefined, ctx: RequestContext) {
    const { rows } = await executor.query<{ userId: number; typeName: string; startDate: string; endDate: string; portion: Portion; days: number }>(
      `SELECT r.user_id AS "userId", t.name AS "typeName", to_char(r.start_date, 'YYYY-MM-DD') AS "startDate",
              to_char(r.end_date, 'YYYY-MM-DD') AS "endDate", r.portion, r.days::float AS days
         FROM leave_requests r JOIN leave_types t ON t.id = r.leave_type_id
        WHERE r.id = $1`,
      [id],
    );
    const r = rows[0]!;
    await notify(executor, {
      organizationId,
      userIds: [r.userId],
      actorId: ctx.user!.id,
      type: outcome === 'approved' ? 'leave_approved' : outcome === 'rejected' ? 'leave_rejected' : 'leave_cancelled',
      title: `${ctx.user!.name} ${outcome} your ${r.typeName}`,
      body: `${describeDates(r)} · ${r.days} day${r.days === 1 ? '' : 's'}${note ? ` — “${note}”` : ''}`,
      url: '/leave',
    });
  }

  /** Active manager of a member (null when none or inactive). */
  private async activeManagerOf(executor: Queryable, organizationId: number, userId: number): Promise<number | null> {
    const { rows } = await executor.query<{ managerId: number }>(
      `SELECT m.manager_id AS "managerId" FROM organization_members m
         JOIN organization_members mg ON mg.organization_id = m.organization_id AND mg.user_id = m.manager_id AND mg.status = 'active'
        WHERE m.organization_id = $1 AND m.user_id = $2`,
      [organizationId, userId],
    );
    return rows[0]?.managerId ?? null;
  }

  private async directReports(executor: Queryable, organizationId: number, managerId: number): Promise<number[]> {
    const { rows } = await executor.query<{ userId: number }>(
      `SELECT user_id AS "userId" FROM organization_members WHERE organization_id = $1 AND manager_id = $2 AND status = 'active'`,
      [organizationId, managerId],
    );
    return rows.map((r) => r.userId);
  }

  private withRights({ inFuture, managerId, ...row }: Row, ctx: RequestContext): LeaveRequest {
    const tenant = tenantOf(ctx);
    const own = row.user.id === ctx.user!.id;
    const approver = canApproveLeave(tenant) || managerId === ctx.user!.id;
    const open = row.status === 'pending' || row.status === 'approved';
    return {
      ...row,
      canCancel: open && (approver || (own && (row.status === 'pending' || inFuture))),
      canDecide: row.status === 'pending' && approver && (!own || tenant.isOwner),
    };
  }
}
