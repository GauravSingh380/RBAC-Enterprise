// Backlog: plan sprints. The active sprint, the planned sprints and the backlog (items without a
// sprint) are stacked sections; drag items between them or re-order to set priority.
// Sub-tasks are not listed — they follow their parent (moving a story moves its sub-tasks).
import { DndContext, DragOverlay, closestCorners, useDroppable } from '@dnd-kit/core'
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { DeleteOutlined, EditOutlined, MoreOutlined, PlusOutlined } from '@ant-design/icons'
import { Alert, App, Button, Card, Dropdown, Empty, Flex, Input, Skeleton, Tag, Tooltip, Typography, theme } from 'antd'
import { memo, useCallback, useMemo, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useFetch } from '../../../hooks/useFetch'
import { useLiveReload } from '../../../hooks/useRealtime'
import { getErrorMessage } from '../../../lib/api'
import { sprintsService, workItemsService } from '../../../services/projects.service'
import type { Sprint, WorkItemSummary } from '../../../types/projects'
import { columnDropId, groupInto, sumPoints } from '../shared/boardRules'
import { ItemTypeIcon, PriorityIcon, StatusTag, UserAvatar } from '../shared/ItemBits'
import { useProject } from '../shared/projectContext'
import { useDragColumns } from '../shared/useDragColumns'
import { CapacityDrawer, CapacitySummary } from './CapacityDrawer'
import { CompleteSprintModal, SprintFormModal, StartSprintModal } from './SprintModals'

const BACKLOG = 'backlog'
const fmt = (d: string | null) => (d ? new Date(`${d}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '')

type Dialog =
  | { kind: 'form'; sprint: Sprint | null }
  | { kind: 'start'; sprint: Sprint }
  | { kind: 'complete'; sprint: Sprint }
  | { kind: 'capacity'; sprint: Sprint }
  | null

export default function BacklogPage() {
  const { project, reloadProject } = useProject()
  const { message, modal } = App.useApp()
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [dialog, setDialog] = useState<Dialog>(null)

  const sprints = useFetch(useCallback(() => sprintsService.list(project.key, 'all'), [project.key]))
  const items = useFetch(
    useCallback(
      () => workItemsService.list(project.key, { sprint: 'planning', types: 'story,task,bug', sort: 'rank', order: 'asc', limit: 500, search: search || undefined }),
      [project.key, search],
    ),
  )
  const openSprints = useMemo(() => (sprints.data ?? []).filter((s) => s.status !== 'completed'), [sprints.data])
  const active = openSprints.find((s) => s.status === 'active')
  const planned = openSprints.filter((s) => s.status === 'planned')

  const keys = useMemo(() => [...openSprints.map((s) => String(s.id)), BACKLOG], [openSprints])
  const grouped = useMemo(
    () => (items.data && sprints.data ? groupInto(keys, items.data.items, (i) => (i.sprint && i.sprint.status !== 'completed' ? String(i.sprint.id) : BACKLOG)) : null),
    [items.data, sprints.data, keys],
  )

  const { reload: reloadItems } = items
  const { reload: reloadSprints } = sprints
  const reload = useCallback(() => {
    reloadItems()
    reloadSprints()
  }, [reloadItems, reloadSprints])
  useLiveReload(project.id, reload, ['items', 'sprints'])

  const dnd = useDragColumns<WorkItemSummary>(grouped, async ({ item, from, to, prevId, nextId }) => {
    try {
      await workItemsService.move(item.id, { sprintId: from !== to ? (to === BACKLOG ? null : Number(to)) : undefined, prevId, nextId })
      reload()
    } catch (err) {
      message.error(getErrorMessage(err))
      throw err
    }
  })

  const quickAdd = (sprintId: number | null) => async (title: string) => {
    try {
      await workItemsService.create(project.key, { type: project.defaultItemType === 'epic' ? 'story' : project.defaultItemType, title, sprintId })
      reload()
      reloadProject()
    } catch (err) {
      message.error(getErrorMessage(err))
    }
  }

  const removeSprint = (s: Sprint) =>
    modal.confirm({
      title: `Delete ${s.name}?`,
      content: s.stats.itemCount ? `Its ${s.stats.itemCount} item(s) go back to the backlog.` : undefined,
      okText: 'Delete',
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await sprintsService.remove(project.key, s.id)
          reload()
        } catch (err) {
          message.error(getErrorMessage(err))
        }
      },
    })

  const open = (i: WorkItemSummary) => navigate(`/projects/${project.key}/items/${i.number}`)
  const canEdit = project.canEdit

  const sprintHeader = (s: Sprint, list: WorkItemSummary[]) => {
    const done = list.filter((i) => i.status.category === 'done').length
    return (
      <Flex align="center" gap={10} wrap>
        <Typography.Text strong style={{ fontSize: '1.05em' }}>
          {s.name}
        </Typography.Text>
        {s.status === 'active' && <Tag color="blue">Active</Tag>}
        {(s.startDate || s.endDate) && (
          <Typography.Text type="secondary">
            {fmt(s.startDate)} – {fmt(s.endDate)}
          </Typography.Text>
        )}
        <Typography.Text type="secondary">
          {list.length} item{list.length === 1 ? '' : 's'}
          {s.status === 'active' && ` · ${done} done`} · {sumPoints(list)} pts
        </Typography.Text>
        {/* capacity: people × working days − leave − holidays, vs the points planned */}
        <CapacitySummary project={project} sprint={s} onOpen={() => setDialog({ kind: 'capacity', sprint: s })} />
        <div style={{ flex: 1 }} />
        {canEdit && s.status === 'planned' && (
          <Tooltip title={active ? 'Complete the active sprint first' : undefined}>
            <Button size="small" type={planned[0]?.id === s.id ? 'primary' : 'default'} disabled={!!active} onClick={() => setDialog({ kind: 'start', sprint: s })}>
              Start sprint
            </Button>
          </Tooltip>
        )}
        {canEdit && s.status === 'active' && (
          <Button size="small" type="primary" onClick={() => setDialog({ kind: 'complete', sprint: s })}>
            Complete sprint
          </Button>
        )}
        {canEdit && (
          <Dropdown
            trigger={['click']}
            menu={{
              items: [
                { key: 'edit', icon: <EditOutlined />, label: 'Edit sprint', onClick: () => setDialog({ kind: 'form', sprint: s }) },
                { key: 'delete', icon: <DeleteOutlined />, danger: true, label: 'Delete sprint', onClick: () => removeSprint(s) },
              ],
            }}
          >
            <Button size="small" type="text" icon={<MoreOutlined />} aria-label={`${s.name} actions`} />
          </Dropdown>
        )}
      </Flex>
    )
  }

  return (
    <>
      <Flex gap={8} align="center" wrap style={{ marginBottom: 16 }}>
        <Input.Search placeholder="Search backlog" allowClear onSearch={(v) => setSearch(v.trim())} style={{ width: 260 }} />
        <div style={{ flex: 1 }} />
        {canEdit && (
          <Button icon={<PlusOutlined />} onClick={() => setDialog({ kind: 'form', sprint: null })}>
            Create sprint
          </Button>
        )}
      </Flex>
      {(items.error || sprints.error) && <Alert type="error" showIcon title={items.error ?? sprints.error} style={{ marginBottom: 12 }} />}

      {!grouped ? (
        <Skeleton active paragraph={{ rows: 10 }} />
      ) : (
        <DndContext sensors={dnd.sensors} collisionDetection={closestCorners} {...dnd.handlers}>
          <Flex vertical gap={16}>
            {openSprints.map((s) => {
              const list = dnd.columns[String(s.id)] ?? []
              return (
                <Section key={s.id} id={String(s.id)} header={sprintHeader(s, list)} goal={s.goal} items={list} canEdit={canEdit} onOpen={open} onQuickAdd={quickAdd(s.id)} highlight={s.status === 'active'} />
              )
            })}
            <Section
              id={BACKLOG}
              header={
                <Flex align="center" gap={10}>
                  <Typography.Text strong style={{ fontSize: '1.05em' }}>
                    Backlog
                  </Typography.Text>
                  <Typography.Text type="secondary">
                    {(dnd.columns[BACKLOG] ?? []).length} items · {sumPoints(dnd.columns[BACKLOG] ?? [])} pts
                  </Typography.Text>
                </Flex>
              }
              items={dnd.columns[BACKLOG] ?? []}
              canEdit={canEdit}
              onOpen={open}
              onQuickAdd={quickAdd(null)}
              empty={openSprints.length ? 'Drag items here to take them out of a sprint' : 'Create a sprint, then drag items into it'}
            />
          </Flex>
          <DragOverlay>{dnd.activeItem ? <Row item={dnd.activeItem} overlay /> : null}</DragOverlay>
        </DndContext>
      )}

      {dialog?.kind === 'form' && (
        <SprintFormModal project={project} sprint={dialog.sprint} nextNumber={(sprints.data?.length ?? 0) + 1} onClose={() => setDialog(null)} onSaved={reload} />
      )}
      {dialog?.kind === 'start' && <StartSprintModal project={project} sprint={dialog.sprint} onClose={() => setDialog(null)} onStarted={reload} />}
      {dialog?.kind === 'complete' && (
        <CompleteSprintModal project={project} sprint={dialog.sprint} planned={planned} onClose={() => setDialog(null)} onCompleted={reload} />
      )}
      {dialog?.kind === 'capacity' && <CapacityDrawer project={project} sprint={dialog.sprint} onClose={() => setDialog(null)} />}
    </>
  )
}

function Section({ id, header, goal, items, canEdit, onOpen, onQuickAdd, highlight, empty = 'Drag items here or create one' }: {
  id: string
  header: ReactNode
  goal?: string | null
  items: WorkItemSummary[]
  canEdit: boolean
  onOpen: (i: WorkItemSummary) => void
  onQuickAdd: (title: string) => Promise<void>
  highlight?: boolean
  empty?: string
}) {
  const { token } = theme.useToken()
  const { setNodeRef, isOver } = useDroppable({ id: columnDropId(id) })
  const [adding, setAdding] = useState(false)
  const [title, setTitle] = useState('')

  return (
    <Card
      size="small"
      title={header}
      style={{ borderColor: isOver ? token.colorPrimaryBorder : highlight ? token.colorPrimaryBorderHover : undefined }}
      styles={{ body: { padding: 6 } }}
    >
      {goal && (
        <Typography.Paragraph type="secondary" style={{ margin: '2px 8px 8px' }} ellipsis={{ rows: 2 }}>
          Goal: {goal}
        </Typography.Paragraph>
      )}
      <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
        <div ref={setNodeRef} style={{ minHeight: 44 }}>
          {items.map((i) => (
            <SortableRow key={i.id} item={i} onOpen={onOpen} disabled={!canEdit} />
          ))}
          {!items.length && (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={empty} style={{ margin: '8px 0', padding: 8, border: `1px dashed ${token.colorBorder}`, borderRadius: 8 }} />
          )}
        </div>
      </SortableContext>
      {canEdit &&
        (adding ? (
          <Input
            autoFocus
            placeholder="What needs to be done? (Enter to add, Esc to close)"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => !title.trim() && setAdding(false)}
            onKeyDown={(e) => e.key === 'Escape' && setAdding(false)}
            onPressEnter={async () => {
              if (!title.trim()) return
              await onQuickAdd(title.trim())
              setTitle('')
            }}
            style={{ marginTop: 6 }}
          />
        ) : (
          <Button type="text" icon={<PlusOutlined />} onClick={() => setAdding(true)} style={{ marginTop: 4 }}>
            Create
          </Button>
        ))}
    </Card>
  )
}

function SortableRow({ item, onOpen, disabled }: { item: WorkItemSummary; onOpen: (i: WorkItemSummary) => void; disabled: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id, disabled })
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.35 : 1 }} {...attributes} {...listeners}>
      <Row item={item} onOpen={onOpen} />
    </div>
  )
}

const Row = memo(function Row({ item, onOpen, overlay }: { item: WorkItemSummary; onOpen?: (i: WorkItemSummary) => void; overlay?: boolean }) {
  const { token } = theme.useToken()
  const done = item.status.category === 'done'
  return (
    <Flex
      align="center"
      gap={10}
      onClick={() => onOpen?.(item)}
      className="backlog-row"
      style={{
        padding: '7px 10px',
        borderRadius: 6,
        cursor: overlay ? 'grabbing' : 'pointer',
        background: overlay ? token.colorBgElevated : undefined,
        boxShadow: overlay ? token.boxShadowSecondary : undefined,
        borderBottom: overlay ? undefined : `1px solid ${token.colorBorderSecondary}`,
      }}
    >
      <ItemTypeIcon type={item.type} size={13} />
      <Typography.Text type="secondary" style={{ whiteSpace: 'nowrap', fontSize: '0.88em', minWidth: 64 }}>
        {item.key}
      </Typography.Text>
      <Typography.Text ellipsis style={{ flex: 1, minWidth: 0, textDecoration: done ? 'line-through' : undefined, opacity: done ? 0.65 : 1 }}>
        {item.title}
      </Typography.Text>
      {item.labels.slice(0, 2).map((l) => (
        <Tag key={l.id} color={l.color} style={{ marginInlineEnd: 0, fontSize: '0.75em', lineHeight: '16px' }}>
          {l.name}
        </Tag>
      ))}
      <StatusTag status={item.status} />
      <PriorityIcon priority={item.priority} />
      <Tag style={{ marginInlineEnd: 0, borderRadius: 10, minWidth: 28, textAlign: 'center', visibility: item.estimate === null ? 'hidden' : undefined }}>
        {item.estimate ?? 0}
      </Tag>
      <UserAvatar user={item.assignee} size={22} />
    </Flex>
  )
})
