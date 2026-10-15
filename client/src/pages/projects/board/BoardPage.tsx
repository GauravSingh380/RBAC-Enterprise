// Kanban / Scrum board: one column per workflow status, drag cards to change status or order.
//
//   * Scrum projects with an active sprint show that sprint by default ("All items" switches)
//   * epics are not cards (they group work) unless the type filter asks for them
//   * WIP limits: a column header turns red when it holds more items than its limit
//   * live: changes made by others appear within a second (realtime events → reload)
import { DndContext, DragOverlay, closestCorners, useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { PlusOutlined, ReloadOutlined } from '@ant-design/icons'
import { Alert, App, Badge, Button, Card, Empty, Flex, Input, Segmented, Skeleton, Tag, Tooltip, Typography, theme } from 'antd'
import { useCallback, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useFetch } from '../../../hooks/useFetch'
import { useLiveReload } from '../../../hooks/useRealtime'
import { getErrorMessage } from '../../../lib/api'
import { projectsService, sprintsService, workItemsService } from '../../../services/projects.service'
import type { ProjectStatus, WorkItemSummary } from '../../../types/projects'
import { columnDropId, groupInto, isOverWip, sumPoints } from '../shared/boardRules'
import { FilterBar } from '../shared/FilterBar'
import { useProject } from '../shared/projectContext'
import { useDragColumns } from '../shared/useDragColumns'
import { useItemFilters } from '../shared/useItemFilters'
import { BoardCard, BoardCardView } from './BoardCard'

const BOARD_TYPES = 'story,task,bug,subtask'
const daysLeft = (end: string) => Math.ceil((new Date(`${end}T23:59:59`).getTime() - Date.now()) / 86_400_000)

export default function BoardPage() {
  const { project, reloadProject } = useProject()
  const { message } = App.useApp()
  const navigate = useNavigate()
  const filters = useItemFilters()
  const { params } = filters

  const sprints = useFetch(useCallback(() => sprintsService.list(project.key, 'open'), [project.key]))
  const people = useFetch(useCallback(() => projectsService.assignableUsers(project.key), [project.key]))
  const activeSprint = sprints.data?.find((s) => s.status === 'active') ?? null
  const scope = activeSprint && params.get('scope') !== 'all' ? 'sprint' : 'all'

  const query = useMemo(
    () => ({
      limit: 500,
      sort: 'rank',
      order: 'asc' as const,
      search: params.get('q') ?? undefined,
      types: params.get('types') ?? BOARD_TYPES,
      assignees: params.get('assignees') ?? undefined,
      priorities: params.get('priorities') ?? undefined,
      labelIds: params.get('labelIds') ?? undefined,
      sprint: scope === 'sprint' ? 'active' : undefined,
    }),
    [params, scope],
  )
  const ready = !sprints.loading || sprints.data !== null
  const items = useFetch(useCallback(() => (ready ? workItemsService.list(project.key, query) : Promise.resolve(null)), [project.key, query, ready]))

  const grouped = useMemo(
    () => (items.data ? groupInto(project.statuses.map((s) => String(s.id)), items.data.items, (i) => String(i.status.id)) : null),
    [items.data, project.statuses],
  )

  const dnd = useDragColumns<WorkItemSummary>(grouped, async ({ item, from, to, prevId, nextId }) => {
    try {
      await workItemsService.move(item.id, { statusId: from !== to ? Number(to) : undefined, prevId, nextId })
      items.reload()
      if (from !== to) reloadProject() // status item counts
    } catch (err) {
      message.error(getErrorMessage(err))
      throw err
    }
  })

  const reloadAll = useCallback(() => {
    items.reload()
    sprints.reload()
  }, [items, sprints])
  useLiveReload(project.id, items.reload)
  useLiveReload(project.id, sprints.reload, ['sprints'])

  const open = (i: WorkItemSummary) => navigate(`/projects/${project.key}/items/${i.number}`)

  return (
    <Card styles={{ body: { paddingBottom: 12 } }}>
      <FilterBar
        project={project}
        filters={filters}
        people={people.data ?? []}
        viewType="board"
        showStatus={false}
        before={
          activeSprint && (
            <Segmented
              value={scope}
              onChange={(v) => filters.update({ scope: v === 'all' ? 'all' : undefined })}
              options={[
                { value: 'sprint', label: 'Active sprint' },
                { value: 'all', label: 'All items' },
              ]}
            />
          )
        }
      >
        <Tooltip title="Refresh">
          <Button icon={<ReloadOutlined />} onClick={reloadAll} aria-label="Refresh" />
        </Tooltip>
      </FilterBar>

      {scope === 'sprint' && activeSprint && (
        <Flex align="center" gap={10} wrap style={{ marginBottom: 12 }}>
          <Typography.Text strong>{activeSprint.name}</Typography.Text>
          {activeSprint.endDate && (
            <Tag color={daysLeft(activeSprint.endDate) < 0 ? 'red' : 'blue'}>
              {daysLeft(activeSprint.endDate) < 0 ? `${-daysLeft(activeSprint.endDate)} days over` : `${daysLeft(activeSprint.endDate)} days left`}
            </Tag>
          )}
          {activeSprint.goal && (
            <Typography.Text type="secondary" ellipsis style={{ maxWidth: 520 }}>
              Goal: {activeSprint.goal}
            </Typography.Text>
          )}
          <div style={{ flex: 1 }} />
          <Link to={`/projects/${project.key}/backlog`}>Plan &amp; complete in Backlog →</Link>
        </Flex>
      )}
      {!activeSprint && project.template === 'scrum' && sprints.data && (
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 12 }}
          title={
            <>
              No active sprint — showing all items. <Link to={`/projects/${project.key}/backlog`}>Plan and start a sprint in the Backlog</Link>.
            </>
          }
        />
      )}
      {items.error && <Alert type="error" showIcon title={items.error} style={{ marginBottom: 12 }} />}

      {!grouped ? (
        <Skeleton active paragraph={{ rows: 8 }} />
      ) : (
        <DndContext sensors={dnd.sensors} collisionDetection={closestCorners} {...dnd.handlers}>
          <div style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 8, alignItems: 'flex-start' }}>
            {project.statuses.map((s) => (
              <BoardColumn
                key={s.id}
                status={s}
                items={dnd.columns[String(s.id)] ?? []}
                canEdit={project.canEdit}
                onOpen={open}
                onQuickAdd={async (title) => {
                  try {
                    await workItemsService.create(project.key, {
                      type: project.defaultItemType === 'epic' ? 'task' : project.defaultItemType,
                      title,
                      statusId: s.id,
                      sprintId: scope === 'sprint' ? activeSprint?.id : undefined,
                    })
                    items.reload()
                    reloadProject()
                  } catch (err) {
                    message.error(getErrorMessage(err))
                  }
                }}
              />
            ))}
          </div>
          <DragOverlay>{dnd.activeItem ? <BoardCardView item={dnd.activeItem} overlay /> : null}</DragOverlay>
        </DndContext>
      )}
    </Card>
  )
}

function BoardColumn({
  status,
  items,
  canEdit,
  onOpen,
  onQuickAdd,
}: {
  status: ProjectStatus
  items: WorkItemSummary[]
  canEdit: boolean
  onOpen: (i: WorkItemSummary) => void
  onQuickAdd: (title: string) => Promise<void>
}) {
  const { token } = theme.useToken()
  const { setNodeRef, isOver } = useDroppable({ id: columnDropId(String(status.id)) })
  const [adding, setAdding] = useState(false)
  const [title, setTitle] = useState('')
  const over = isOverWip(items.length, status.wipLimit)
  const points = sumPoints(items)

  const submit = async () => {
    if (!title.trim()) return setAdding(false)
    await onQuickAdd(title.trim())
    setTitle('')
  }

  return (
    <div
      style={{
        flex: '0 0 280px',
        background: over ? token.colorErrorBg : token.colorFillQuaternary,
        border: `1px solid ${over ? token.colorErrorBorder : isOver ? token.colorPrimaryBorder : 'transparent'}`,
        borderRadius: token.borderRadiusLG,
        padding: 8,
      }}
    >
      <Flex align="center" gap={8} style={{ padding: '4px 4px 10px' }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: status.color, flexShrink: 0 }} />
        <Typography.Text strong ellipsis style={{ textTransform: 'uppercase', fontSize: '0.8em', letterSpacing: 0.4 }}>
          {status.name}
        </Typography.Text>
        <Tooltip title={status.wipLimit ? `WIP limit ${status.wipLimit}${over ? ' — exceeded' : ''}` : 'Items in this column'}>
          <Badge
            count={status.wipLimit ? `${items.length} / ${status.wipLimit}` : items.length}
            showZero
            color={over ? token.colorError : token.colorTextQuaternary}
          />
        </Tooltip>
        <div style={{ flex: 1 }} />
        {points > 0 && (
          <Typography.Text type="secondary" style={{ fontSize: '0.8em' }}>
            {points} pts
          </Typography.Text>
        )}
      </Flex>

      <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
        <div ref={setNodeRef} style={{ display: 'flex', flexDirection: 'column', gap: 8, minHeight: 60 }}>
          {items.map((i) => (
            <BoardCard key={i.id} item={i} onOpen={onOpen} disabled={!canEdit} />
          ))}
          {!items.length && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No items" style={{ margin: '12px 0' }} />}
        </div>
      </SortableContext>

      {canEdit &&
        (adding ? (
          <Input.TextArea
            autoFocus
            autoSize={{ minRows: 2 }}
            placeholder="What needs to be done? (Enter to add, Esc to close)"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => !title.trim() && setAdding(false)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setAdding(false)
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                void submit()
              }
            }}
            style={{ marginTop: 8 }}
          />
        ) : (
          <Button type="text" block icon={<PlusOutlined />} onClick={() => setAdding(true)} style={{ marginTop: 8, justifyContent: 'flex-start' }}>
            Create
          </Button>
        ))}
    </div>
  )
}
