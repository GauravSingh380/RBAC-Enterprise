import { db, type Queryable } from '../../database/db.js';
import type { RequestContext } from './request-context.js';

interface AuditEntry {
  action: string;
  entity?: string;
  entityId?: string | number;
  details?: Record<string, unknown>;
  /** Override the acting user (e.g. on register/login where ctx.user is not set yet). */
  userId?: number | null;
  /** Override the organization (defaults to the active organization of the request). */
  organizationId?: number | null;
}

/**
 * Writes an audit log row, tagged with the active organization (if any).
 * Pass a transaction client as `executor` when the log must be part of the same transaction.
 */
export async function audit(ctx: RequestContext, entry: AuditEntry, executor: Queryable = db): Promise<void> {
  await executor.query(
    `INSERT INTO audit_logs (organization_id, user_id, action, entity, entity_id, details, ip_address)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      entry.organizationId !== undefined ? entry.organizationId : (ctx.tenant?.organizationId ?? null),
      entry.userId !== undefined ? entry.userId : (ctx.user?.id ?? null),
      entry.action,
      entry.entity ?? null,
      entry.entityId !== undefined ? String(entry.entityId) : null,
      entry.details ? JSON.stringify(entry.details) : null,
      ctx.ip,
    ],
  );
}
