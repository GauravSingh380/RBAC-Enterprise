import { db } from '../../database/db.js';
import type { Paginated, PaginationQuery } from '../../common/utils/pagination.js';

export interface AuditLog {
  id: number;
  action: string;
  entity: string | null;
  entityId: string | null;
  details: Record<string, unknown> | null;
  ipAddress: string | null;
  createdAt: Date;
  user: { id: number; name: string; email: string } | null;
  organization: { id: number; name: string } | null;
}

export class AuditLogsService {
  /**
   * organizationId = N    -> only that organization's entries (organization admins)
   * organizationId = null -> every entry across the platform (platform admins)
   */
  async findAll(query: PaginationQuery, organizationId: number | null): Promise<Paginated<AuditLog>> {
    const search = query.search ? `%${query.search}%` : null;
    const where = `($1::int IS NULL OR a.organization_id = $1)
                   AND ($2::text IS NULL OR a.action ILIKE $2 OR u.email ILIKE $2 OR o.name ILIKE $2)`;

    const [items, total] = await Promise.all([
      db.query<AuditLog>(
        `SELECT a.id::int, a.action, a.entity, a.entity_id AS "entityId", a.details,
                a.ip_address AS "ipAddress", a.created_at AS "createdAt",
                CASE WHEN u.id IS NULL THEN NULL
                     ELSE json_build_object('id', u.id, 'name', u.name, 'email', u.email) END AS "user",
                CASE WHEN o.id IS NULL THEN NULL
                     ELSE json_build_object('id', o.id, 'name', o.name) END AS organization
           FROM audit_logs a
           LEFT JOIN users u         ON u.id = a.user_id
           LEFT JOIN organizations o ON o.id = a.organization_id
          WHERE ${where}
          ORDER BY a.created_at DESC, a.id DESC
          LIMIT $3 OFFSET $4`,
        [organizationId, search, query.limit, (query.page - 1) * query.limit],
      ),
      db.query<{ count: number }>(
        `SELECT COUNT(*)::int AS count
           FROM audit_logs a
           LEFT JOIN users u         ON u.id = a.user_id
           LEFT JOIN organizations o ON o.id = a.organization_id
          WHERE ${where}`,
        [organizationId, search],
      ),
    ]);

    return { items: items.rows, total: total.rows[0]!.count, page: query.page, limit: query.limit };
  }
}
