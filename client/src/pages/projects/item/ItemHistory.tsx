// History tab: work_item_events rendered as readable sentences.
import { Empty, Skeleton, Tag, Timeline, Typography } from 'antd'
import type { ReactNode } from 'react'
import { useCallback } from 'react'
import { useFetch } from '../../../hooks/useFetch'
import { workItemsService } from '../../../services/projects.service'
import type { WorkItemEvent } from '../../../types/projects'

const FIELD_LABELS: Record<string, string> = {
  title: 'title',
  priority: 'priority',
  severity: 'severity',
  dueDate: 'due date',
  estimate: 'estimate',
  description: 'description',
  environment: 'environment',
  stepsToReproduce: 'steps to reproduce',
  expectedResult: 'expected result',
  actualResult: 'actual result',
  type: 'type',
  labels: 'labels',
  parent: 'parent',
}
const LINK_WORDS: Record<string, string> = {
  blocks: 'blocks',
  blocked_by: 'is blocked by',
  duplicates: 'duplicates',
  duplicated_by: 'is duplicated by',
  relates_to: 'relates to',
  'blocks:reverse': 'is blocked by',
  'blocked_by:reverse': 'blocks',
  'duplicates:reverse': 'is duplicated by',
  'duplicated_by:reverse': 'duplicates',
  'relates_to:reverse': 'relates to',
}

const show = (v: unknown): ReactNode => {
  if (v === null || v === undefined || v === '') return <Typography.Text type="secondary">none</Typography.Text>
  if (Array.isArray(v)) return v.length ? v.map((x) => <Tag key={String(x)}>{String(x)}</Tag>) : <Typography.Text type="secondary">none</Typography.Text>
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>
    return <strong>{String(o.name ?? o.key ?? JSON.stringify(o))}</strong>
  }
  return <strong>{String(v)}</strong>
}

function describe(e: WorkItemEvent): ReactNode {
  const nv = e.newValue as Record<string, unknown> | null
  const ov = e.oldValue as Record<string, unknown> | null
  switch (e.eventType) {
    case 'created':
      return <>created this {String(nv?.type ?? 'item')} in {show(nv?.status)}</>
    case 'commented':
      return <>commented: <Typography.Text type="secondary">“{String(nv?.excerpt ?? '')}”</Typography.Text></>
    case 'comment_edited':
      return <>edited a comment</>
    case 'comment_deleted':
      return <>deleted a comment</>
    case 'attachment_added':
      return <>attached {show(nv?.fileName)}</>
    case 'attachment_removed':
      return <>removed attachment {show(ov?.fileName)}</>
    case 'link_added':
      return <>linked: {LINK_WORDS[String(nv?.linkType)] ?? String(nv?.linkType)} {show(nv?.item)}</>
    case 'link_removed':
      return <>removed link to {show(ov?.item)}</>
    case 'updated': {
      if (e.field?.startsWith('custom:')) {
        const n = e.newValue as { name: string; value: unknown }
        const o = e.oldValue as { name: string; value: unknown }
        return <>changed <strong>{n.name}</strong> from {show(o?.value)} to {show(n?.value)}</>
      }
      const label = FIELD_LABELS[e.field ?? ''] ?? e.field
      if (e.oldValue === null && e.newValue === null) return <>updated the {label}</>
      if (e.field === 'assignee') return e.newValue ? <>assigned to {show(e.newValue)}</> : <>removed the assignee {show(e.oldValue)}</>
      return <>changed the {label} from {show(e.oldValue)} to {show(e.newValue)}</>
    }
    default:
      return e.eventType
  }
}

export default function ItemHistory({ itemId, refreshKey }: { itemId: number; refreshKey: number }) {
  // refreshKey changes after every save so the history updates
  const events = useFetch(useCallback(() => workItemsService.events(itemId), [itemId, refreshKey])) // eslint-disable-line react-hooks/exhaustive-deps
  if (!events.data) return <Skeleton active />
  if (!events.data.length) return <Empty description="No history yet" />
  return (
    <Timeline
      style={{ marginTop: 8 }}
      items={events.data.map((e) => ({
        key: e.id,
        content: (
          <>
            <Typography.Text strong>{e.actor?.name ?? 'Someone'}</Typography.Text> {describe(e)}
            <br />
            <Typography.Text type="secondary" style={{ fontSize: '0.82em' }}>
              {new Date(e.createdAt).toLocaleString()}
            </Typography.Text>
          </>
        ),
      }))}
    />
  )
}
