// Moving work items between sprints — shared by item edits, the backlog and sprint start/complete.
// Every move is written to the item's history (field "sprint"); burndown charts are replayed from it.
import { BadRequestException } from '../../common/exceptions/http.exception.js';
import type { Queryable } from '../../database/db.js';

export interface SprintRef {
  id: number;
  name: string;
  status: 'planned' | 'active' | 'completed';
}

export const sprintEventValue = (s: Pick<SprintRef, 'id' | 'name'> | null) => (s ? { id: s.id, name: s.name } : null);

export async function loadSprint(sprintId: number, projectId: number, executor: Queryable): Promise<SprintRef> {
  const { rows } = await executor.query<SprintRef>('SELECT id, name, status FROM sprints WHERE id = $1 AND project_id = $2', [
    sprintId,
    projectId,
  ]);
  if (!rows[0]) throw new BadRequestException('Unknown sprint for this project');
  return rows[0];
}

/**
 * Puts items into `sprint` (null = backlog) and records one history event per item that really moved.
 * Returns the ids that moved. Two statements, whatever the number of items.
 */
export async function moveItemsToSprint(
  executor: Queryable,
  itemIds: number[],
  sprint: Pick<SprintRef, 'id' | 'name'> | null,
  organizationId: number,
  actorId: number | null,
): Promise<number[]> {
  if (!itemIds.length) return [];
  // In UPDATE ... FROM, the joined "old" row is the version BEFORE this update → we get the previous sprint
  const { rows } = await executor.query<{ id: number; old: { id: number; name: string } | null }>(
    `UPDATE work_items w SET sprint_id = $2, updated_at = NOW()
       FROM work_items old
       LEFT JOIN sprints sp ON sp.id = old.sprint_id
      WHERE w.id = ANY($1::int[]) AND old.id = w.id AND w.sprint_id IS DISTINCT FROM $2
      RETURNING w.id, CASE WHEN sp.id IS NULL THEN NULL ELSE json_build_object('id', sp.id, 'name', sp.name) END AS old`,
    [itemIds, sprint?.id ?? null],
  );
  if (!rows.length) return [];

  await executor.query(
    `INSERT INTO work_item_events (organization_id, work_item_id, actor_id, event_type, field, old_value, new_value)
     SELECT $1, (x->>'id')::int, $2, 'updated', 'sprint', x->'old', $3::jsonb
       FROM jsonb_array_elements($4::jsonb) x`,
    [organizationId, actorId, JSON.stringify(sprintEventValue(sprint)), JSON.stringify(rows)],
  );
  return rows.map((r) => r.id);
}
