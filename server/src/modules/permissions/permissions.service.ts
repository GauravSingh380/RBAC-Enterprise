import { db } from '../../database/db.js';

export interface PermissionRow {
  id: number;
  name: string;
  module: string;
  description: string | null;
}

export class PermissionsService {
  async findAll(): Promise<PermissionRow[]> {
    const { rows } = await db.query<PermissionRow>(
      'SELECT id, name, module, description FROM permissions ORDER BY module, id',
    );
    return rows;
  }
}
