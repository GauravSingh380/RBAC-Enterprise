// Organization security settings (Organization → Settings → Security). Needs organization.manage.
import { z } from 'zod';
import { db, withTransaction } from '../../database/db.js';
import { audit } from '../../common/utils/audit.js';
import { tenantOf, type RequestContext } from '../../common/utils/request-context.js';
import { organizationPolicy, type SecurityPolicy } from './security-policy.js';

export const updateSecuritySchema = z
  .object({
    minLength: z.number().int().min(8).max(64),
    requireSymbol: z.boolean(),
    sessionIdleMinutes: z.number().int().min(15).max(43_200).nullable(), // 15 min … 30 days
    sessionMaxHours: z.number().int().min(1).max(8_760).nullable(), // 1 h … 1 year
  })
  .partial()
  .refine((d) => Object.keys(d).length > 0, { message: 'Nothing to update' });

export class SecurityService {
  get(ctx: RequestContext): Promise<SecurityPolicy> {
    return organizationPolicy(db, tenantOf(ctx).organizationId);
  }

  async update(dto: z.infer<typeof updateSecuritySchema>, ctx: RequestContext): Promise<SecurityPolicy> {
    const orgId = tenantOf(ctx).organizationId;
    const before = await this.get(ctx);
    await db.query(
      `UPDATE organizations SET
          password_min_length     = COALESCE($2, password_min_length),
          password_require_symbol = COALESCE($3, password_require_symbol),
          session_idle_minutes    = CASE WHEN $4::boolean THEN $5 ELSE session_idle_minutes END,
          session_max_hours       = CASE WHEN $6::boolean THEN $7 ELSE session_max_hours END,
          updated_at = NOW()
        WHERE id = $1`,
      [
        orgId,
        dto.minLength ?? null,
        dto.requireSymbol ?? null,
        dto.sessionIdleMinutes !== undefined,
        dto.sessionIdleMinutes ?? null,
        dto.sessionMaxHours !== undefined,
        dto.sessionMaxHours ?? null,
      ],
    );
    const after = await this.get(ctx);
    await audit(ctx, { action: 'organization.security_update', entity: 'organization', entityId: orgId, details: { before, after } });
    return after;
  }

  /** Everyone except the person asking must choose a new password on their next visit. */
  async requirePasswordChange(ctx: RequestContext): Promise<{ affected: number }> {
    const orgId = tenantOf(ctx).organizationId;
    return withTransaction(async (client) => {
      const { rowCount } = await client.query(
        `UPDATE users u SET password_change_required = TRUE
           FROM organization_members m
          WHERE m.user_id = u.id AND m.organization_id = $1 AND m.status = 'active' AND u.id <> $2`,
        [orgId, ctx.user!.id],
      );
      await audit(ctx, { action: 'organization.require_password_change', entity: 'organization', entityId: orgId, details: { affected: rowCount } }, client);
      return { affected: rowCount ?? 0 };
    });
  }
}
