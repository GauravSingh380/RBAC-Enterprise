import { db } from '../../database/db.js';
import { BadRequestException, ConflictException, NotFoundException } from '../../common/exceptions/http.exception.js';
import { audit } from '../../common/utils/audit.js';
import type { RequestContext } from '../../common/utils/request-context.js';
import type { CreateMenuDto, UpdateMenuDto } from './menus.dto.js';

const UNIQUE_VIOLATION = '23505';
const FK_VIOLATION = '23503';

export interface Menu {
  id: number;
  key: string;
  label: string;
  path: string | null;
  icon: string | null;
  scope: 'organization' | 'platform';
  parentId: number | null;
  permissionId: number | null;
  permission: string | null;
  sortOrder: number;
  isActive: boolean;
}

const MENU_SELECT = `
  SELECT m.id, m.key, m.label, m.path, m.icon, m.scope,
         m.parent_id     AS "parentId",
         m.permission_id AS "permissionId",
         p.name          AS permission,
         m.sort_order    AS "sortOrder",
         m.is_active     AS "isActive"
    FROM menus m
    LEFT JOIN permissions p ON p.id = m.permission_id`;

// Maps DTO fields to DB columns for partial updates
const COLUMN_MAP: Record<keyof UpdateMenuDto, string> = {
  label: 'label',
  path: 'path',
  icon: 'icon',
  scope: 'scope',
  parentId: 'parent_id',
  permissionId: 'permission_id',
  sortOrder: 'sort_order',
  isActive: 'is_active',
};

export class MenusService {
  async findAll(): Promise<Menu[]> {
    const { rows } = await db.query<Menu>(`${MENU_SELECT} ORDER BY m.scope DESC, m.parent_id NULLS FIRST, m.sort_order, m.id`);
    return rows;
  }

  async findOne(id: number): Promise<Menu> {
    const { rows } = await db.query<Menu>(`${MENU_SELECT} WHERE m.id = $1`, [id]);
    if (!rows[0]) throw new NotFoundException(`Menu with id ${id} not found`);
    return rows[0];
  }

  async create(dto: CreateMenuDto, ctx: RequestContext): Promise<Menu> {
    try {
      const { rows } = await db.query<{ id: number }>(
        `INSERT INTO menus (key, label, path, icon, parent_id, permission_id, sort_order, is_active, scope)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
        [
          dto.key,
          dto.label,
          dto.path ?? null,
          dto.icon ?? null,
          dto.parentId ?? null,
          dto.permissionId ?? null,
          dto.sortOrder ?? 0,
          dto.isActive ?? true,
          dto.scope ?? 'organization',
        ],
      );
      const id = rows[0]!.id;
      await audit(ctx, { action: 'menu.create', entity: 'menu', entityId: id, details: { key: dto.key } });
      return this.findOne(id);
    } catch (err: any) {
      throw this.mapDbError(err);
    }
  }

  async update(id: number, dto: UpdateMenuDto, ctx: RequestContext): Promise<Menu> {
    await this.findOne(id);
    if (dto.parentId === id) throw new BadRequestException('A menu cannot be its own parent');

    const entries = Object.entries(dto).filter(([, v]) => v !== undefined) as [keyof UpdateMenuDto, unknown][];
    if (entries.length > 0) {
      const sets = entries.map(([field], i) => `${COLUMN_MAP[field]} = $${i + 1}`);
      try {
        await db.query(`UPDATE menus SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $${entries.length + 1}`, [
          ...entries.map(([, v]) => v),
          id,
        ]);
      } catch (err: any) {
        throw this.mapDbError(err);
      }
    }

    await audit(ctx, { action: 'menu.update', entity: 'menu', entityId: id, details: dto });
    return this.findOne(id);
  }

  async remove(id: number, ctx: RequestContext): Promise<void> {
    const menu = await this.findOne(id);
    await db.query('DELETE FROM menus WHERE id = $1', [id]);
    await audit(ctx, { action: 'menu.delete', entity: 'menu', entityId: id, details: { key: menu.key } });
  }

  private mapDbError(err: any): Error {
    if (err.code === UNIQUE_VIOLATION) return new ConflictException('A menu with this key already exists');
    if (err.code === FK_VIOLATION) return new BadRequestException('Parent menu or permission does not exist');
    return err;
  }
}
