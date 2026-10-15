// /projects/:projectKey/items/:number — full work item view.
// Every field saves immediately (PATCH) and the server answers with the fresh item.
import { ArrowLeftOutlined, CopyOutlined, DeleteOutlined, EditOutlined, MoreOutlined, RollbackOutlined, SwapOutlined } from '@ant-design/icons'
import { App, Breadcrumb, Button, Card, Col, Dropdown, Flex, Result, Row, Select, Skeleton, Space, Tabs, Tag, Tooltip, Typography, theme } from 'antd'
import { useCallback, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useFetch } from '../../../hooks/useFetch'
import { useLiveReload } from '../../../hooks/useRealtime'
import { getErrorMessage } from '../../../lib/api'
import { projectsService, workItemsService, type WorkItemInput } from '../../../services/projects.service'
import type { ItemType, WorkItemDetail } from '../../../types/projects'
import { ITEM_TYPES, ALLOWED_PARENTS, RESOLUTION_LABELS } from '../shared/itemMeta'
import { ItemTypeIcon, StatusTag } from '../shared/ItemBits'
import { MarkdownEditor, MarkdownView } from '../shared/Markdown'
import { useProject } from '../shared/projectContext'
import ItemAttachments from './ItemAttachments'
import { ItemChecklist } from './ItemChecklist'
import ItemComments from './ItemComments'
import ItemHistory from './ItemHistory'
import { ChildItems, LinkedItems } from './ItemRelations'
import ItemSidebar from './ItemSidebar'
import { CloseDuplicateModal } from './CloseDuplicateModal'
import { QaPanel } from './QaPanel'
import { QualityPanels } from './QualityPanels'

/** A markdown block that shows rendered text and switches to an editor on click. */
function EditableMarkdown({ label, value, canEdit, onSave, placeholder }: { label: string; value: string | null; canEdit: boolean; onSave: (v: string | null) => Promise<void>; placeholder: string }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value ?? '')
  const [saving, setSaving] = useState(false)
  const { token } = theme.useToken()

  const save = async () => {
    setSaving(true)
    try {
      await onSave(draft.trim() ? draft : null)
      setEditing(false)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ marginBottom: 20 }}>
      <Flex justify="space-between" align="center" style={{ marginBottom: 6 }}>
        <Typography.Text strong>{label}</Typography.Text>
        {canEdit && !editing && <Button type="text" size="small" icon={<EditOutlined />} onClick={() => { setDraft(value ?? ''); setEditing(true) }} />}
      </Flex>
      {editing ? (
        <>
          <MarkdownEditor value={draft} onChange={setDraft} autoFocus rows={5} />
          <Space style={{ marginTop: 8 }}>
            <Button type="primary" size="small" loading={saving} onClick={save}>
              Save
            </Button>
            <Button size="small" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </Space>
        </>
      ) : (
        <div
          onClick={() => canEdit && !value && setEditing(true)}
          style={{ padding: value ? 0 : 10, borderRadius: token.borderRadius, border: value ? undefined : `1px dashed ${token.colorBorder}`, cursor: canEdit && !value ? 'pointer' : undefined }}
        >
          <MarkdownView value={value} empty={canEdit ? placeholder : 'None'} />
        </div>
      )}
    </div>
  )
}

export default function WorkItemPage() {
  const { project, reloadProject } = useProject()
  const { number = '' } = useParams()
  const navigate = useNavigate()
  const { message, modal } = App.useApp()
  const itemKey = `${project.key}-${number}`

  const loaded = useFetch(useCallback(() => workItemsService.get(itemKey), [itemKey]))
  const people = useFetch(useCallback(() => projectsService.assignableUsers(project.key), [project.key]))
  const [local, setLocal] = useState<WorkItemDetail | null>(null)
  const [historyKey, setHistoryKey] = useState(0)
  const [closingDuplicate, setClosingDuplicate] = useState(false)
  const item = local && local.key === itemKey ? local : loaded.data

  const bumpHistory = () => setHistoryKey((k) => k + 1)

  const save = async (changes: WorkItemInput) => {
    if (!item) return
    try {
      const updated = await workItemsService.update(item.id, changes)
      setLocal(updated)
      bumpHistory()
    } catch (err) {
      message.error(getErrorMessage(err))
      throw err
    }
  }

  const reloadItem = () => {
    setLocal(null)
    loaded.reload()
    bumpHistory()
  }
  // someone else edited / commented on this item → show it without a manual refresh
  useLiveReload(project.id, reloadItem, ['items'], item?.id)

  if (loaded.error && !item) {
    return <Result status="404" title="Work item not found" subTitle={loaded.error} extra={<Link to={`/projects/${project.key}`}>Back to {project.name}</Link>} />
  }
  if (!item) return <Skeleton active paragraph={{ rows: 10 }} />

  const canEdit = item.permissions.canEdit
  const allowedTypes = ITEM_TYPES.filter((t) => {
    const parentOk = item.parent ? ALLOWED_PARENTS[t.value].includes(item.parent.type) : t.value !== 'subtask'
    const childrenOk = item.children.every((c) => ALLOWED_PARENTS[c.type].includes(t.value))
    return parentOk && childrenOk
  })

  const remove = async () => {
    try {
      await workItemsService.remove(item.id)
      message.success(`${item.key} moved to the trash`)
      reloadProject()
      navigate(`/projects/${project.key}`, { replace: true })
    } catch (err) {
      message.error(getErrorMessage(err))
    }
  }

  const confirmDelete = () =>
    modal.confirm({
      title: `Delete ${item.key}?`,
      content: 'It goes to the trash with its sub-tasks, comments and files. Restore it within 30 days from the Trash of the project.',
      okText: 'Delete',
      okButtonProps: { danger: true },
      onOk: remove,
    })

  return (
    <>
      <Flex align="center" gap={8} wrap style={{ marginBottom: 12 }}>
        <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => navigate(`/projects/${project.key}`)} />
        <Breadcrumb
          items={[
            { title: <Link to={`/projects/${project.key}`}>{project.name}</Link> },
            ...(item.parent ? [{ title: <Link to={`/projects/${project.key}/items/${item.parent.key.split('-')[1]}`}>{item.parent.key}</Link> }] : []),
            { title: item.key },
          ]}
        />
        <div style={{ flex: 1 }} />
        <Typography.Text type="secondary" copyable={{ text: `${window.location.origin}/projects/${project.key}/items/${number}`, icon: [<CopyOutlined key="c" />, <CopyOutlined key="d" />], tooltips: ['Copy link', 'Link copied'] }}>
          {item.key}
        </Typography.Text>
        {(canEdit || item.permissions.canDelete) && (
          <Dropdown
            trigger={['click']}
            menu={{
              items: [
                ...(canEdit && item.resolution !== 'duplicate'
                  ? [{ key: 'duplicate', icon: <SwapOutlined />, label: 'Close as duplicate…', onClick: () => setClosingDuplicate(true) }]
                  : []),
                ...(item.permissions.canDelete ? [{ key: 'delete', danger: true, icon: <DeleteOutlined />, label: 'Delete item', onClick: confirmDelete }] : []),
              ],
            }}
          >
            <Button icon={<MoreOutlined />} aria-label="More actions" />
          </Dropdown>
        )}
      </Flex>

      <Row gutter={[24, 24]}>
        <Col xs={24} lg={16}>
          <Card>
            <Flex align="center" gap={10} style={{ marginBottom: 8 }}>
              {canEdit ? (
                <Select
                  variant="borderless"
                  value={item.type}
                  onChange={(type: ItemType) => save({ type }).catch(() => undefined)}
                  popupMatchSelectWidth={false}
                  options={allowedTypes.map((t) => ({ value: t.value, label: <Space><ItemTypeIcon type={t.value} size={12} />{t.label}</Space> }))}
                  style={{ marginLeft: -11 }}
                />
              ) : (
                <Space>
                  <ItemTypeIcon type={item.type} />
                  {ITEM_TYPES.find((t) => t.value === item.type)?.label}
                </Space>
              )}
              <StatusTag status={item.status} />
              {item.resolution && <Tag style={{ marginInlineEnd: 0 }}>{RESOLUTION_LABELS[item.resolution]}</Tag>}
              {item.reopenCount > 0 && (
                <Tooltip title="Times QA sent it back">
                  <Tag color="magenta" icon={<RollbackOutlined />} style={{ marginInlineEnd: 0 }}>
                    reopened ×{item.reopenCount}
                  </Tag>
                </Tooltip>
              )}
            </Flex>

            <QaPanel item={item} project={project} onChanged={(updated) => (setLocal(updated), bumpHistory())} />

            <Typography.Title
              level={3}
              style={{ marginTop: 0 }}
              editable={
                canEdit
                  ? {
                      triggerType: ['text', 'icon'],
                      onChange: (title) => title.trim() && title !== item.title && save({ title: title.trim() }).catch(() => undefined),
                    }
                  : false
              }
            >
              {item.title}
            </Typography.Title>

            <EditableMarkdown
              label="Description"
              value={item.description}
              canEdit={canEdit}
              placeholder="Add a description…"
              onSave={(description) => save({ description })}
            />

            <ItemChecklist
              item={item}
              canEdit={canEdit}
              onChanged={(list) => {
                setLocal({ ...item, checklistItems: list, checklist: { done: list.filter((c) => c.done).length, total: list.length } })
                bumpHistory()
              }}
            />

            {item.type === 'bug' && (
              <Card size="small" title="Bug details" style={{ marginBottom: 20 }}>
                <EditableMarkdown label="Steps to reproduce" value={item.stepsToReproduce} canEdit={canEdit} placeholder="1. Go to … 2. Click …" onSave={(v) => save({ stepsToReproduce: v })} />
                <Row gutter={16}>
                  <Col xs={24} md={12}>
                    <EditableMarkdown label="Expected result" value={item.expectedResult} canEdit={canEdit} placeholder="What should happen?" onSave={(v) => save({ expectedResult: v })} />
                  </Col>
                  <Col xs={24} md={12}>
                    <EditableMarkdown label="Actual result" value={item.actualResult} canEdit={canEdit} placeholder="What happens instead?" onSave={(v) => save({ actualResult: v })} />
                  </Col>
                </Row>
                <Row gutter={[16, 8]}>
                  {(
                    [
                      ['environment', 'Environment', 255],
                      ['browser', 'Browser', 100],
                      ['os', 'OS', 100],
                      ['foundInVersion', 'Found in version', 50],
                      ['fixedInVersion', 'Fixed in version', 50],
                    ] as const
                  ).map(([field, label, max]) => (
                    <Col xs={12} md={field === 'environment' ? 24 : 6} key={field}>
                      <Typography.Text strong>{label}</Typography.Text>
                      <Typography.Paragraph
                        type={item[field] ? undefined : 'secondary'}
                        editable={
                          canEdit
                            ? { maxLength: max, onChange: (v) => v !== (item[field] ?? '') && save({ [field]: v.trim() || null }).catch(() => undefined) }
                            : false
                        }
                        style={{ marginTop: 4, marginBottom: 0 }}
                      >
                        {item[field] ?? (canEdit ? '' : '—')}
                      </Typography.Paragraph>
                    </Col>
                  ))}
                </Row>
              </Card>
            )}

            <QualityPanels item={item} project={project} />

            <Flex vertical gap={16}>
              <ChildItems item={item} project={project} onChanged={reloadItem} />
              <LinkedItems item={item} onChanged={(updated) => (updated ? (setLocal(updated), bumpHistory()) : reloadItem())} />
              <ItemAttachments itemId={item.id} canEdit={canEdit} onActivity={bumpHistory} />
            </Flex>
          </Card>

          <Card style={{ marginTop: 24 }}>
            <Tabs
              items={[
                {
                  key: 'comments',
                  label: `Comments${item.commentCount ? ` (${item.commentCount})` : ''}`,
                  children: <ItemComments itemId={item.id} canComment={item.permissions.canComment} people={people.data ?? []} onActivity={bumpHistory} />,
                },
                { key: 'history', label: 'History', children: <ItemHistory itemId={item.id} refreshKey={historyKey} /> },
              ]}
            />
          </Card>
        </Col>

        <Col xs={24} lg={8}>
          <div style={{ position: 'sticky', top: 80 }}>
            <ItemSidebar
              item={item}
              project={project}
              people={people.data ?? []}
              save={(changes) => save(changes).catch(() => undefined)}
              onItemChanged={setLocal}
              reloadProject={reloadProject}
            />
          </div>
        </Col>
      </Row>
      {closingDuplicate && <CloseDuplicateModal item={item} onClose={() => setClosingDuplicate(false)} onClosed={(updated) => (setLocal(updated), bumpHistory())} />}
    </>
  )
}
