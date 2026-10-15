// Work items of a project as a filterable, sortable table with bulk editing.
// Filters live in the URL (?types=bug&assignees=me …) so a view can be bookmarked, shared or saved.
import { CommentOutlined, NodeIndexOutlined, PlusOutlined, ReloadOutlined } from '@ant-design/icons'
import { Alert, Badge, Button, Card, Empty, Flex, Select, Space, Table, Tag, Tooltip, Typography, theme, type TableProps } from 'antd'
import { useCallback, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useFetch } from '../../../hooks/useFetch'
import { useLiveReload } from '../../../hooks/useRealtime'
import { projectsService, sprintsService, workItemsService } from '../../../services/projects.service'
import type { WorkItemSummary } from '../../../types/projects'
import { FilterBar } from '../shared/FilterBar'
import { isOverdue } from '../shared/itemMeta'
import { ItemTypeIcon, PriorityIcon, StatusTag, UserAvatar } from '../shared/ItemBits'
import { useProject } from '../shared/projectContext'
import { FILTER_KEYS, useItemFilters } from '../shared/useItemFilters'
import { BulkEditBar } from './BulkEditBar'
import CreateItemModal from './CreateItemModal'

const timeAgo = (iso: string) => {
  const s = (Date.now() - new Date(iso).getTime()) / 1000
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}

export default function ItemsListPage() {
  const { project, reloadProject } = useProject()
  const { token } = theme.useToken()
  const navigate = useNavigate()
  const itemFilters = useItemFilters()
  const { params, update } = itemFilters
  const [creating, setCreating] = useState(false)
  const [selected, setSelected] = useState<number[]>([])

  const filters = useMemo(
    () => ({
      page: Number(params.get('page') ?? 1),
      limit: Number(params.get('limit') ?? 25),
      search: params.get('q') ?? undefined,
      sort: params.get('sort') ?? 'number',
      order: (params.get('order') as 'asc' | 'desc') ?? 'desc',
      ...Object.fromEntries(FILTER_KEYS.map((k) => [k, params.get(k) ?? undefined])),
    }),
    [params],
  )
  const activeFilters = itemFilters.activeCount

  const items = useFetch(useCallback(() => workItemsService.list(project.key, filters), [project.key, filters]))
  const people = useFetch(useCallback(() => projectsService.assignableUsers(project.key), [project.key]))
  const sprints = useFetch(useCallback(() => sprintsService.list(project.key, 'open'), [project.key]))
  useLiveReload(project.id, items.reload)

  const columns: TableProps<WorkItemSummary>['columns'] = [
    {
      title: 'Key',
      dataIndex: 'number',
      key: 'number',
      width: 110,
      sorter: true,
      sortOrder: filters.sort === 'number' ? (filters.order === 'asc' ? 'ascend' : 'descend') : null,
      render: (_, i) => (
        <Space size={6}>
          <ItemTypeIcon type={i.type} size={13} />
          <Link to={`/projects/${project.key}/items/${i.number}`}>
            <Typography.Text type="secondary" style={{ whiteSpace: 'nowrap' }}>
              {i.key}
            </Typography.Text>
          </Link>
        </Space>
      ),
    },
    {
      title: 'Title',
      dataIndex: 'title',
      render: (title: string, i) => (
        <Flex vertical gap={2}>
          <Link to={`/projects/${project.key}/items/${i.number}`} style={{ color: token.colorText }}>
            <Typography.Text strong={false} style={{ textDecoration: i.status.category === 'done' ? 'line-through' : undefined, opacity: i.status.category === 'done' ? 0.65 : 1 }}>
              {title}
            </Typography.Text>
          </Link>
          {(i.labels.length > 0 || i.childCount > 0 || i.commentCount > 0) && (
            <Space size={4} wrap>
              {i.labels.map((l) => (
                <Tag key={l.id} color={l.color} style={{ marginInlineEnd: 0, fontSize: '0.78em', lineHeight: '18px' }}>
                  {l.name}
                </Tag>
              ))}
              {i.childCount > 0 && (
                <Typography.Text type="secondary" style={{ fontSize: '0.82em' }}>
                  <NodeIndexOutlined /> {i.childCount}
                </Typography.Text>
              )}
              {i.commentCount > 0 && (
                <Typography.Text type="secondary" style={{ fontSize: '0.82em' }}>
                  <CommentOutlined /> {i.commentCount}
                </Typography.Text>
              )}
            </Space>
          )}
        </Flex>
      ),
    },
    { title: 'Status', key: 'status', width: 150, render: (_, i) => <StatusTag status={i.status} /> },
    ...(sprints.data?.length
      ? [
          {
            title: 'Sprint',
            key: 'sprint',
            width: 140,
            responsive: ['lg' as const],
            render: (_: unknown, i: WorkItemSummary) =>
              i.sprint ? (
                <Tag color={i.sprint.status === 'active' ? 'blue' : undefined} style={{ marginInlineEnd: 0 }}>
                  {i.sprint.name}
                </Tag>
              ) : (
                <Typography.Text type="secondary">—</Typography.Text>
              ),
          },
        ]
      : []),
    {
      title: 'Priority',
      key: 'priority',
      width: 110,
      sorter: true,
      sortOrder: filters.sort === 'priority' ? (filters.order === 'asc' ? 'ascend' : 'descend') : null,
      render: (_, i) => <PriorityIcon priority={i.priority} showLabel />,
      responsive: ['md'],
    },
    { title: 'Assignee', key: 'assignee', width: 170, render: (_, i) => <UserAvatar user={i.assignee} showName />, responsive: ['sm'] },
    {
      title: 'Due',
      key: 'due',
      width: 110,
      sorter: true,
      sortOrder: filters.sort === 'due' ? (filters.order === 'asc' ? 'ascend' : 'descend') : null,
      responsive: ['lg'],
      render: (_, i) =>
        i.dueDate ? (
          <Typography.Text type={isOverdue(i.dueDate, i.status.category) ? 'danger' : undefined}>
            {new Date(`${i.dueDate}T00:00:00`).toLocaleDateString()}
          </Typography.Text>
        ) : (
          '—'
        ),
    },
    {
      title: 'Updated',
      key: 'updated',
      width: 110,
      sorter: true,
      sortOrder: filters.sort === 'updated' ? (filters.order === 'asc' ? 'ascend' : 'descend') : null,
      responsive: ['xl'],
      render: (_, i) => (
        <Tooltip title={new Date(i.updatedAt).toLocaleString()}>
          <Typography.Text type="secondary">{timeAgo(i.updatedAt)}</Typography.Text>
        </Tooltip>
      ),
    },
  ]

  return (
    <>
      <Card styles={{ body: { paddingBottom: 8 } }}>
        <FilterBar
          project={project}
          filters={itemFilters}
          people={people.data ?? []}
          viewType="list"
          before={
            (sprints.data?.length ?? 0) > 0 && (
              <Select
                allowClear
                placeholder="Sprint"
                style={{ minWidth: 150 }}
                value={params.get('sprint') ?? undefined}
                onChange={(v?: string) => update({ sprint: v })}
                options={[
                  { value: 'active', label: 'Active sprint' },
                  { value: 'backlog', label: 'Backlog (no sprint)' },
                  ...(sprints.data ?? []).map((sp) => ({ value: String(sp.id), label: sp.name })),
                ]}
              />
            )
          }
        >
          <Tooltip title="Refresh">
            <Button icon={<ReloadOutlined />} onClick={items.reload} aria-label="Refresh" />
          </Tooltip>
          {project.canEdit && (
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreating(true)}>
              Create
            </Button>
          )}
        </FilterBar>

        {selected.length > 0 && (
          <BulkEditBar
            project={project}
            selected={selected}
            people={people.data ?? []}
            sprints={sprints.data ?? []}
            onClear={() => setSelected([])}
            onDone={() => {
              items.reload()
              reloadProject()
            }}
          />
        )}

        {items.error && <Alert type="error" showIcon title={items.error} style={{ marginBottom: 16 }} />}

        <Table<WorkItemSummary>
          rowKey="id"
          size="middle"
          rowSelection={
            project.canEdit
              ? { selectedRowKeys: selected, onChange: (keys) => setSelected(keys.map(Number)), preserveSelectedRowKeys: true }
              : undefined
          }
          columns={columns}
          dataSource={items.data?.items}
          loading={items.loading}
          scroll={{ x: 760 }}
          onRow={(i) => ({ onDoubleClick: () => navigate(`/projects/${project.key}/items/${i.number}`) })}
          locale={{
            emptyText: (
              <Empty description={activeFilters || filters.search ? 'No items match these filters' : 'No work items yet'}>
                {project.canEdit && !activeFilters && !filters.search && (
                  <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreating(true)}>
                    Create the first item
                  </Button>
                )}
              </Empty>
            ),
          }}
          onChange={(pagination, _f, sorter) => {
            const s = Array.isArray(sorter) ? sorter[0] : sorter
            const sortMap: Record<string, string> = { number: 'number', priority: 'priority', due: 'due', updated: 'updated' }
            update({
              page: pagination.current,
              limit: pagination.pageSize,
              sort: s?.order ? sortMap[String(s.columnKey)] : undefined,
              order: s?.order === 'ascend' ? 'asc' : s?.order === 'descend' ? 'desc' : undefined,
            })
          }}
          pagination={{
            current: filters.page,
            pageSize: filters.limit,
            total: items.data?.total,
            showSizeChanger: true,
            pageSizeOptions: [25, 50, 100],
            showTotal: (t) => (
              <Badge color={token.colorPrimary} text={`${t} items`} />
            ),
          }}
        />
      </Card>

      {creating && (
        <CreateItemModal
          project={project}
          onClose={() => setCreating(false)}
          onCreated={(item, another) => {
            items.reload()
            reloadProject()
            if (!another) {
              setCreating(false)
              navigate(`/projects/${project.key}/items/${item.number}`)
            }
          }}
        />
      )}
    </>
  )
}
