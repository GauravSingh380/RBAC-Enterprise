// Child items (sub-tasks / stories of an epic) and linked items.
import { CloseOutlined, LinkOutlined, NodeIndexOutlined, PlusOutlined } from '@ant-design/icons'
import { App, Button, Card, Empty, Flex, Input, Progress, Select, Space, Tooltip, Typography, theme } from 'antd'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { getErrorMessage } from '../../../lib/api'
import { workItemsService } from '../../../services/projects.service'
import type { ItemType, LinkType, ProjectDetail, WorkItemDetail, WorkItemSummary } from '../../../types/projects'
import { ITEM_TYPES, ALLOWED_PARENTS } from '../shared/itemMeta'
import { ItemTypeIcon, PriorityIcon, StatusTag, UserAvatar } from '../shared/ItemBits'

const itemUrl = (key: string) => {
  const [projectKey, number] = key.split('-')
  return `/projects/${projectKey}/items/${number}`
}

export function ChildItems({ item, project, onChanged }: { item: WorkItemDetail; project: ProjectDetail; onChanged: () => void }) {
  const { message } = App.useApp()
  const { token } = theme.useToken()
  const childTypes = ITEM_TYPES.filter((t) => ALLOWED_PARENTS[t.value].includes(item.type))
  const [title, setTitle] = useState('')
  const [type, setType] = useState<ItemType | undefined>(childTypes[0]?.value)
  const [adding, setAdding] = useState(false)

  if (!childTypes.length) return null
  const done = item.children.filter((c) => c.status.category === 'done').length

  const add = async () => {
    if (!title.trim() || !type) return
    setAdding(true)
    try {
      await workItemsService.create(project.key, { type, title: title.trim(), parentId: item.id })
      setTitle('')
      onChanged()
    } catch (err) {
      message.error(getErrorMessage(err))
    } finally {
      setAdding(false)
    }
  }

  return (
    <Card
      size="small"
      title={
        <span>
          <NodeIndexOutlined /> {item.type === 'epic' ? 'Items in this epic' : 'Sub-tasks'}
        </span>
      }
      extra={item.children.length > 0 && <Progress percent={Math.round((done / item.children.length) * 100)} size="small" style={{ width: 140, margin: 0 }} format={() => `${done}/${item.children.length}`} />}
    >
      <Flex vertical gap={4}>
        {item.children.map((c) => (
          <ChildRow key={c.id} child={c} />
        ))}
        {item.children.length === 0 && <Typography.Text type="secondary">None yet</Typography.Text>}
      </Flex>
      {item.permissions.canEdit && (
        <Space.Compact style={{ width: '100%', marginTop: 12 }}>
          {childTypes.length > 1 && (
            <Select value={type} onChange={setType} style={{ width: 120 }} options={childTypes.map((t) => ({ value: t.value, label: t.label }))} />
          )}
          <Input placeholder={`Add a ${type === 'subtask' ? 'sub-task' : type}…`} value={title} onChange={(e) => setTitle(e.target.value)} onPressEnter={add} style={{ borderColor: token.colorBorder }} />
          <Button icon={<PlusOutlined />} loading={adding} onClick={add} disabled={!title.trim()} />
        </Space.Compact>
      )}
    </Card>
  )
}

function ChildRow({ child }: { child: WorkItemSummary }) {
  const { token } = theme.useToken()
  return (
    <Flex align="center" gap={10} style={{ padding: '6px 8px', borderRadius: 6, background: token.colorFillQuaternary }}>
      <ItemTypeIcon type={child.type} size={12} />
      <Link to={itemUrl(child.key)}>
        <Typography.Text type="secondary" style={{ whiteSpace: 'nowrap' }}>
          {child.key}
        </Typography.Text>
      </Link>
      <Typography.Text ellipsis style={{ flex: 1, textDecoration: child.status.category === 'done' ? 'line-through' : undefined }}>
        {child.title}
      </Typography.Text>
      <PriorityIcon priority={child.priority} />
      <UserAvatar user={child.assignee} size={20} />
      <StatusTag status={child.status} />
    </Flex>
  )
}

const LINK_OPTIONS: { value: LinkType; label: string }[] = [
  { value: 'blocks', label: 'blocks' },
  { value: 'blocked_by', label: 'is blocked by' },
  { value: 'relates_to', label: 'relates to' },
  { value: 'duplicates', label: 'duplicates' },
  { value: 'duplicated_by', label: 'is duplicated by' },
]

export function LinkedItems({ item, onChanged }: { item: WorkItemDetail; onChanged: (updated?: WorkItemDetail) => void }) {
  const { message } = App.useApp()
  const { token } = theme.useToken()
  const [open, setOpen] = useState(false)
  const [linkType, setLinkType] = useState<LinkType>('relates_to')
  const [target, setTarget] = useState<string>()
  const [options, setOptions] = useState<WorkItemSummary[]>([])
  const [searching, setSearching] = useState(false)

  const groups = useMemo(() => {
    const map = new Map<string, WorkItemDetail['links']>()
    for (const l of item.links) map.set(l.label, [...(map.get(l.label) ?? []), l])
    return [...map.entries()]
  }, [item.links])

  const search = async (q: string) => {
    if (!q.trim()) return setOptions([])
    setSearching(true)
    try {
      setOptions(await workItemsService.search(q.trim(), item.id))
    } finally {
      setSearching(false)
    }
  }

  const add = async () => {
    if (!target) return
    try {
      onChanged(await workItemsService.addLink(item.id, target, linkType))
      setTarget(undefined)
      setOpen(false)
    } catch (err) {
      message.error(getErrorMessage(err))
    }
  }

  const remove = async (linkId: number) => {
    try {
      await workItemsService.removeLink(item.id, linkId)
      onChanged()
    } catch (err) {
      message.error(getErrorMessage(err))
    }
  }

  return (
    <Card
      size="small"
      title={
        <span>
          <LinkOutlined /> Linked items
        </span>
      }
      extra={item.permissions.canEdit && !open && <Button size="small" icon={<PlusOutlined />} onClick={() => setOpen(true)}>Link</Button>}
    >
      {open && (
        <Space.Compact style={{ width: '100%', marginBottom: 12 }}>
          <Select value={linkType} onChange={setLinkType} options={LINK_OPTIONS} style={{ width: 150 }} />
          <Select
            showSearch
            filterOption={false}
            placeholder="Search by key (TF-12) or title"
            value={target}
            onSearch={search}
            onChange={setTarget}
            loading={searching}
            notFoundContent={null}
            style={{ flex: 1 }}
            options={options.map((o) => ({ value: o.key, label: `${o.key} · ${o.title}` }))}
          />
          <Button type="primary" onClick={add} disabled={!target}>
            Add
          </Button>
          <Button icon={<CloseOutlined />} onClick={() => setOpen(false)} />
        </Space.Compact>
      )}
      {groups.length === 0 && !open && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No linked items" style={{ margin: 0 }} />}
      <Flex vertical gap={12}>
        {groups.map(([label, links]) => (
          <div key={label}>
            <Typography.Text type="secondary" style={{ fontSize: '0.85em', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              {label}
            </Typography.Text>
            <Flex vertical gap={4} style={{ marginTop: 4 }}>
              {links.map((l) => (
                <Flex key={l.linkId} align="center" gap={10} style={{ padding: '6px 8px', borderRadius: 6, background: token.colorFillQuaternary }}>
                  <ItemTypeIcon type={l.item.type} size={12} />
                  <Link to={itemUrl(l.item.key)}>
                    <Typography.Text type="secondary">{l.item.key}</Typography.Text>
                  </Link>
                  <Typography.Text ellipsis style={{ flex: 1 }}>
                    {l.item.title}
                  </Typography.Text>
                  <StatusTag status={l.item.status} />
                  {item.permissions.canEdit && (
                    <Tooltip title="Remove link">
                      <Button type="text" size="small" icon={<CloseOutlined />} onClick={() => remove(l.linkId)} />
                    </Tooltip>
                  )}
                </Flex>
              ))}
            </Flex>
          </div>
        ))}
      </Flex>
    </Card>
  )
}
