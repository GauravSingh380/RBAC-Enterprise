// Activity history of work items (table work_item_events).
// Every change is one row: who, when, which field, old value, new value.
// This feeds the History tab today and reports / automation / AI later.
import { db, type Queryable } from '../../database/db.js';

export type EventType =
  | 'created'
  | 'updated'
  | 'commented'
  | 'comment_edited'
  | 'comment_deleted'
  | 'attachment_added'
  | 'attachment_removed'
  | 'link_added'
  | 'link_removed'
  | 'qa_passed' // QA verdicts (bug verification flow)
  | 'qa_failed'
  | 'closed_duplicate'
  | 'error_linked' // a production error was turned into / linked to this bug
  | 'error_regressed' // ...and happened again after being resolved
  | 'test_failed' // filed from a failed test case
  | 'restored' // brought back from the trash
  | 'from_template'; // created by a repeating template

export interface NewEvent {
  type: EventType;
  field?: string;
  oldValue?: unknown;
  newValue?: unknown;
}

export interface WorkItemEvent {
  id: number;
  eventType: EventType;
  field: string | null;
  oldValue: unknown;
  newValue: unknown;
  actor: { id: number; name: string } | null;
  createdAt: Date;
}

export async function recordEvents(
  executor: Queryable,
  item: { id: number; organizationId: number },
  actorId: number | null,
  events: NewEvent[],
): Promise<void> {
  if (!events.length) return;
  const values: unknown[] = [];
  const rows = events.map((e, i) => {
    const o = i * 7;
    values.push(
      item.organizationId,
      item.id,
      actorId,
      e.type,
      e.field ?? null,
      e.oldValue === undefined ? null : JSON.stringify(e.oldValue),
      e.newValue === undefined ? null : JSON.stringify(e.newValue),
    );
    return `($${o + 1}, $${o + 2}, $${o + 3}, $${o + 4}, $${o + 5}, $${o + 6}, $${o + 7})`;
  });
  await executor.query(
    `INSERT INTO work_item_events (organization_id, work_item_id, actor_id, event_type, field, old_value, new_value)
     VALUES ${rows.join(', ')}`,
    values,
  );
}

export async function listEvents(workItemId: number): Promise<WorkItemEvent[]> {
  const { rows } = await db.query<WorkItemEvent>(
    `SELECT e.id::int, e.event_type AS "eventType", e.field, e.old_value AS "oldValue", e.new_value AS "newValue",
            CASE WHEN u.id IS NULL THEN NULL ELSE json_build_object('id', u.id, 'name', u.name) END AS actor,
            e.created_at AS "createdAt"
       FROM work_item_events e LEFT JOIN users u ON u.id = e.actor_id
      WHERE e.work_item_id = $1
      ORDER BY e.created_at DESC, e.id DESC
      LIMIT 500`,
    [workItemId],
  );
  return rows;
}
