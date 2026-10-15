// Leave configuration of an organization (permission leave.manage, except reads):
//   leave types · holiday calendars & holidays · which calendar applies to whom · per-person allowances
import { db, withTransaction, type Queryable } from '../../database/db.js';
import { BadRequestException, ConflictException, NotFoundException } from '../../common/exceptions/http.exception.js';
import { audit } from '../../common/utils/audit.js';
import { tenantOf, type RequestContext } from '../../common/utils/request-context.js';
import type { CalendarDto, LeaveTypeDto, SetBalanceDto, UpdateCalendarDto, UpdateLeaveTypeDto } from './leave.dto.js';

const UNIQUE_VIOLATION = '23505';

export interface LeaveType {
  id: number;
  name: string;
  color: string;
  isPaid: boolean;
  defaultDays: number | null;
  allowHalfDay: boolean;
  requiresApproval: boolean;
  isActive: boolean;
  position: number;
  requestCount: number;
}

export interface HolidayCalendar {
  id: number;
  name: string;
  description: string | null;
  weekendDays: number[];
  isDefault: boolean;
  holidayCount: number;
  memberCount: number;
}

/** New organizations: copy the leave type templates + a default calendar (Sat/Sun off). */
export async function seedLeaveDefaults(executor: Queryable, organizationId: number) {
  await executor.query(
    `INSERT INTO leave_types (organization_id, name, color, is_paid, default_days, allow_half_day, requires_approval, position)
     SELECT $1, name, color, is_paid, default_days, allow_half_day, requires_approval, sort_order FROM leave_type_templates
     ON CONFLICT (organization_id, name) DO NOTHING`,
    [organizationId],
  );
  await executor.query(
    `INSERT INTO holiday_calendars (organization_id, name, weekend_days, is_default) VALUES ($1, 'Default', '{0,6}', TRUE)
     ON CONFLICT (organization_id, name) DO NOTHING`,
    [organizationId],
  );
}

const conflict = (what: string) => (err: any) => {
  if (err?.code === UNIQUE_VIOLATION) throw new ConflictException(`${what} already exists`);
  throw err;
};

export class LeaveSettingsService {
  // ---------------------------------------------------------------- leave types

  async listTypes(ctx: RequestContext, includeInactive = false): Promise<LeaveType[]> {
    const { rows } = await db.query<LeaveType>(
      `SELECT t.id, t.name, t.color, t.is_paid AS "isPaid", t.default_days::float AS "defaultDays", t.allow_half_day AS "allowHalfDay",
              t.requires_approval AS "requiresApproval", t.is_active AS "isActive", t.position,
              (SELECT COUNT(*)::int FROM leave_requests r WHERE r.leave_type_id = t.id) AS "requestCount"
         FROM leave_types t
        WHERE t.organization_id = $1 ${includeInactive ? '' : 'AND t.is_active'}
        ORDER BY t.position, lower(t.name)`,
      [tenantOf(ctx).organizationId],
    );
    return rows;
  }

  async createType(dto: LeaveTypeDto, ctx: RequestContext) {
    const orgId = tenantOf(ctx).organizationId;
    await db
      .query(
        `INSERT INTO leave_types (organization_id, name, color, is_paid, default_days, allow_half_day, requires_approval, position)
         VALUES ($1, $2, $3, $4, $5, $6, $7, (SELECT COALESCE(MAX(position), 0) + 10 FROM leave_types WHERE organization_id = $1))`,
        [orgId, dto.name, dto.color, dto.isPaid, dto.defaultDays, dto.allowHalfDay, dto.requiresApproval],
      )
      .catch(conflict(`A leave type named "${dto.name}"`));
    await audit(ctx, { action: 'leave.type_create', entity: 'leave_type', details: { name: dto.name } });
    return this.listTypes(ctx, true);
  }

  async updateType(id: number, dto: UpdateLeaveTypeDto, ctx: RequestContext) {
    const orgId = tenantOf(ctx).organizationId;
    const map: Record<string, string> = {
      name: 'name',
      color: 'color',
      isPaid: 'is_paid',
      defaultDays: 'default_days',
      allowHalfDay: 'allow_half_day',
      requiresApproval: 'requires_approval',
      isActive: 'is_active',
    };
    const entries = Object.entries(dto).filter(([, v]) => v !== undefined);
    const { rowCount } = await db
      .query(
        `UPDATE leave_types SET ${entries.map(([k], i) => `${map[k]} = $${i + 3}`).join(', ')} WHERE id = $1 AND organization_id = $2`,
        [id, orgId, ...entries.map(([, v]) => v)],
      )
      .catch(conflict(`A leave type named "${dto.name}"`));
    if (!rowCount) throw new NotFoundException('Leave type not found');
    await audit(ctx, { action: 'leave.type_update', entity: 'leave_type', entityId: id, details: dto });
    return this.listTypes(ctx, true);
  }

  /** Types with requests are kept for history — deactivate them instead. */
  async deleteType(id: number, ctx: RequestContext) {
    const orgId = tenantOf(ctx).organizationId;
    const { rows } = await db.query<{ n: number }>('SELECT COUNT(*)::int AS n FROM leave_requests WHERE leave_type_id = $1 AND organization_id = $2', [id, orgId]);
    if (rows[0]!.n > 0) throw new BadRequestException('This type has requests — deactivate it instead of deleting it');
    const { rowCount } = await db.query('DELETE FROM leave_types WHERE id = $1 AND organization_id = $2', [id, orgId]);
    if (!rowCount) throw new NotFoundException('Leave type not found');
    await audit(ctx, { action: 'leave.type_delete', entity: 'leave_type', entityId: id });
    return this.listTypes(ctx, true);
  }

  // ---------------------------------------------------------------- calendars & holidays

  async listCalendars(ctx: RequestContext): Promise<HolidayCalendar[]> {
    const orgId = tenantOf(ctx).organizationId;
    const { rows } = await db.query<HolidayCalendar>(
      `SELECT c.id, c.name, c.description, c.weekend_days AS "weekendDays", c.is_default AS "isDefault",
              (SELECT COUNT(*)::int FROM holidays h WHERE h.calendar_id = c.id AND h.date >= date_trunc('year', CURRENT_DATE)) AS "holidayCount",
              (SELECT COUNT(*)::int FROM organization_members m
                WHERE m.organization_id = c.organization_id AND m.status = 'active'
                  AND (m.holiday_calendar_id = c.id OR (m.holiday_calendar_id IS NULL AND c.is_default))) AS "memberCount"
         FROM holiday_calendars c WHERE c.organization_id = $1
        ORDER BY c.is_default DESC, lower(c.name)`,
      [orgId],
    );
    return rows;
  }

  async createCalendar(dto: CalendarDto, ctx: RequestContext) {
    const orgId = tenantOf(ctx).organizationId;
    await withTransaction(async (client) => {
      if (dto.isDefault) await client.query('UPDATE holiday_calendars SET is_default = FALSE WHERE organization_id = $1', [orgId]);
      await client
        .query(
          `INSERT INTO holiday_calendars (organization_id, name, description, weekend_days, is_default) VALUES ($1, $2, $3, $4, $5)`,
          [orgId, dto.name, dto.description ?? null, [...new Set(dto.weekendDays)], !!dto.isDefault],
        )
        .catch(conflict(`A calendar named "${dto.name}"`));
    });
    await audit(ctx, { action: 'leave.calendar_create', entity: 'holiday_calendar', details: { name: dto.name } });
    return this.listCalendars(ctx);
  }

  async updateCalendar(id: number, dto: UpdateCalendarDto, ctx: RequestContext) {
    const orgId = tenantOf(ctx).organizationId;
    await withTransaction(async (client) => {
      await this.assertCalendar(client, id, orgId);
      if (dto.isDefault) await client.query('UPDATE holiday_calendars SET is_default = FALSE WHERE organization_id = $1 AND id <> $2', [orgId, id]);
      await client
        .query(
          `UPDATE holiday_calendars SET name = COALESCE($3, name),
                  description  = CASE WHEN $4::boolean THEN $5 ELSE description END,
                  weekend_days = COALESCE($6::smallint[], weekend_days),
                  is_default   = is_default OR COALESCE($7, FALSE)
            WHERE id = $1 AND organization_id = $2`,
          [id, orgId, dto.name ?? null, dto.description !== undefined, dto.description ?? null, dto.weekendDays ? [...new Set(dto.weekendDays)] : null, dto.isDefault ?? null],
        )
        .catch(conflict(`A calendar named "${dto.name}"`));
    });
    await audit(ctx, { action: 'leave.calendar_update', entity: 'holiday_calendar', entityId: id, details: dto });
    return this.listCalendars(ctx);
  }

  /** The default calendar stays; members of a deleted calendar fall back to the default. */
  async deleteCalendar(id: number, ctx: RequestContext) {
    const orgId = tenantOf(ctx).organizationId;
    const cal = await this.assertCalendar(db, id, orgId);
    if (cal.isDefault) throw new BadRequestException('Make another calendar the default before deleting this one');
    await db.query('DELETE FROM holiday_calendars WHERE id = $1', [id]);
    await audit(ctx, { action: 'leave.calendar_delete', entity: 'holiday_calendar', entityId: id });
    return this.listCalendars(ctx);
  }

  async listHolidays(calendarId: number, year: number, ctx: RequestContext) {
    const orgId = tenantOf(ctx).organizationId;
    await this.assertCalendar(db, calendarId, orgId);
    const { rows } = await db.query(
      `SELECT id, to_char(date, 'YYYY-MM-DD') AS date, name, is_optional AS "isOptional"
         FROM holidays WHERE calendar_id = $1 AND EXTRACT(YEAR FROM date) = $2 ORDER BY date`,
      [calendarId, year],
    );
    return rows;
  }

  async addHolidays(calendarId: number, items: { date: string; name: string; isOptional: boolean }[], ctx: RequestContext) {
    const orgId = tenantOf(ctx).organizationId;
    await this.assertCalendar(db, calendarId, orgId);
    if (!items.length) throw new BadRequestException('No holidays to add');
    // same date again = rename (upsert), so pasting an updated list is safe
    await db.query(
      `INSERT INTO holidays (organization_id, calendar_id, date, name, is_optional)
       SELECT $1, $2, (h->>'date')::date, h->>'name', (h->>'isOptional')::boolean FROM jsonb_array_elements($3::jsonb) h
       ON CONFLICT (calendar_id, date) DO UPDATE SET name = EXCLUDED.name, is_optional = EXCLUDED.is_optional`,
      [orgId, calendarId, JSON.stringify(items)],
    );
    await audit(ctx, { action: 'leave.holidays_add', entity: 'holiday_calendar', entityId: calendarId, details: { count: items.length } });
    return { added: items.length };
  }

  async deleteHoliday(calendarId: number, holidayId: number, ctx: RequestContext) {
    const orgId = tenantOf(ctx).organizationId;
    const { rowCount } = await db.query('DELETE FROM holidays WHERE id = $1 AND calendar_id = $2 AND organization_id = $3', [holidayId, calendarId, orgId]);
    if (!rowCount) throw new NotFoundException('Holiday not found');
  }

  /** "2026-01-26, Republic Day" per line; ", optional" at the end marks an optional holiday. */
  parseHolidayList(text: string) {
    const items: { date: string; name: string; isOptional: boolean }[] = [];
    const errors: string[] = [];
    text.split(/\r?\n/).forEach((raw, i) => {
      const line = raw.trim();
      if (!line || line.startsWith('#')) return;
      const m = /^(\d{4}-\d{2}-\d{2})\s*[,;\t]\s*(.+?)(?:\s*[,;\t]\s*(optional))?$/i.exec(line);
      if (!m || Number.isNaN(new Date(`${m[1]}T00:00:00Z`).getTime()) || new Date(`${m[1]}T00:00:00Z`).toISOString().slice(0, 10) !== m[1]) {
        errors.push(`Line ${i + 1}: "${line}" — use "YYYY-MM-DD, Name"`);
        return;
      }
      items.push({ date: m[1]!, name: m[2]!.slice(0, 100), isOptional: !!m[3] });
    });
    if (errors.length) throw new BadRequestException(errors.slice(0, 5).join(' · '));
    return items;
  }

  // ---------------------------------------------------------------- who uses which calendar

  async listMembers(ctx: RequestContext) {
    const { rows } = await db.query(
      `SELECT u.id, u.name, u.email, m.holiday_calendar_id AS "calendarId"
         FROM organization_members m JOIN users u ON u.id = m.user_id
        WHERE m.organization_id = $1 AND m.status = 'active' ORDER BY lower(u.name)`,
      [tenantOf(ctx).organizationId],
    );
    return rows;
  }

  async setMemberCalendar(userId: number, calendarId: number | null, ctx: RequestContext) {
    const orgId = tenantOf(ctx).organizationId;
    if (calendarId) await this.assertCalendar(db, calendarId, orgId);
    const { rowCount } = await db.query('UPDATE organization_members SET holiday_calendar_id = $3 WHERE organization_id = $1 AND user_id = $2', [orgId, userId, calendarId]);
    if (!rowCount) throw new NotFoundException('Member not found');
    return this.listMembers(ctx);
  }

  // ---------------------------------------------------------------- allowances

  /** Everyone's balances for a year (who has how much left). */
  async teamBalances(year: number, ctx: RequestContext) {
    const orgId = tenantOf(ctx).organizationId;
    const { rows } = await db.query(
      `SELECT u.id AS "userId", u.name, t.id AS "leaveTypeId",
              COALESCE(b.entitled, t.default_days)::float AS entitled, COALESCE(b.carried_over, 0)::float AS "carriedOver",
              b.entitled IS NOT NULL AS overridden, b.note,
              COALESCE((SELECT SUM(r.days) FROM leave_requests r WHERE r.user_id = u.id AND r.leave_type_id = t.id
                         AND r.status = 'approved' AND EXTRACT(YEAR FROM r.start_date) = $2), 0)::float AS used,
              COALESCE((SELECT SUM(r.days) FROM leave_requests r WHERE r.user_id = u.id AND r.leave_type_id = t.id
                         AND r.status = 'pending' AND EXTRACT(YEAR FROM r.start_date) = $2), 0)::float AS pending
         FROM organization_members m
         JOIN users u ON u.id = m.user_id
         CROSS JOIN leave_types t
         LEFT JOIN leave_balances b ON b.user_id = u.id AND b.leave_type_id = t.id AND b.year = $2
        WHERE m.organization_id = $1 AND m.status = 'active' AND t.organization_id = $1 AND t.is_active
        ORDER BY lower(u.name), t.position`,
      [orgId, year],
    );
    return rows;
  }

  async setBalance(dto: SetBalanceDto, ctx: RequestContext) {
    const orgId = tenantOf(ctx).organizationId;
    try {
      await db.query(
        `INSERT INTO leave_balances (organization_id, user_id, leave_type_id, year, entitled, carried_over, note, updated_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (user_id, leave_type_id, year) DO UPDATE
            SET entitled = EXCLUDED.entitled, carried_over = EXCLUDED.carried_over, note = EXCLUDED.note,
                updated_by = EXCLUDED.updated_by, updated_at = NOW()`,
        [orgId, dto.userId, dto.leaveTypeId, dto.year, dto.entitled, dto.carriedOver, dto.note ?? null, ctx.user!.id],
      );
    } catch (err: any) {
      if (err.code === '23503') throw new BadRequestException('Unknown member or leave type');
      throw err;
    }
    await audit(ctx, { action: 'leave.balance_set', entity: 'leave_balance', entityId: dto.userId, details: dto });
    return this.teamBalances(dto.year, ctx);
  }

  private async assertCalendar(executor: Queryable, id: number, orgId: number) {
    const { rows } = await executor.query<{ isDefault: boolean }>(
      'SELECT is_default AS "isDefault" FROM holiday_calendars WHERE id = $1 AND organization_id = $2',
      [id, orgId],
    );
    if (!rows[0]) throw new NotFoundException('Holiday calendar not found');
    return rows[0];
  }
}
