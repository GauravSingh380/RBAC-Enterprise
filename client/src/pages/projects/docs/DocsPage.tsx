// /projects/:key/docs[/:pageId] — project docs: page tree on the left, the page on the right.
// Write / Preview editor, history (restore a version), search, sub-pages, delete → trash.
import { DeleteOutlined, EditOutlined, FileTextOutlined, HistoryOutlined, PlusOutlined, SaveOutlined } from '@ant-design/icons'
import { Alert, App, Button, Card, Col, Drawer, Empty, Flex, Input, List, Modal, Popconfirm, Row, Skeleton, Space, Tree, Typography, theme } from 'antd'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { HelpLink } from '../../../components/HelpLink'
import { useFetch } from '../../../hooks/useFetch'
import { ApiError, getErrorMessage } from '../../../lib/api'
import { pagesService } from '../../../services/workspace.service'
import type { Page, PageSearchHit, PageVersion } from '../../../types/workspace'
import { splitSnippet } from '../../guide/guideMeta'
import { MarkdownEditor, MarkdownView } from '../shared/Markdown'
import { useProject } from '../shared/projectContext'
import { pageTree } from './docsMeta'

export default function DocsPage() {
  const { project } = useProject()
  const { pageId } = useParams()
  const navigate = useNavigate()
  const { message } = App.useApp()
  const base = `/projects/${project.key}/docs`
  const pages = useFetch(useCallback(() => pagesService.list(project.key), [project.key]))
  const tree = useMemo(() => pageTree(pages.data ?? []), [pages.data])
  const selected = pageId ? Number(pageId) : undefined
  const [q, setQ] = useState('')
  const [hits, setHits] = useState<{ q: string; rows: PageSearchHit[] } | null>(null)

  // search after a short pause
  useEffect(() => {
    const text = q.trim()
    if (text.length < 2) return
    let active = true
    const t = setTimeout(() => {
      pagesService.search(project.key, text).then((rows) => active && setHits({ q: text, rows }))
    }, 300)
    return () => {
      active = false
      clearTimeout(t)
    }
  }, [q, project.key])

  const create = async (parentId: number | null) => {
    try {
      const page = await pagesService.create(project.key, { title: parentId ? 'New sub-page' : 'New page', parentId })
      pages.reload()
      navigate(`${base}/${page.id}?edit=1`)
    } catch (err) {
      message.error(getErrorMessage(err))
    }
  }

  const searching = q.trim().length >= 2
  return (
    <Row gutter={[16, 16]}>
      <Col xs={24} md={8} lg={6}>
        <Card size="small" styles={{ body: { padding: 8 } }}>
          <Flex gap={6} style={{ marginBottom: 8 }}>
            <Input.Search allowClear placeholder="Search docs" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search docs" />
            {project.canEdit && <Button icon={<PlusOutlined />} onClick={() => create(null)} aria-label="New page" />}
          </Flex>
          {searching ? (
            <List
              size="small"
              loading={hits?.q !== q.trim()}
              dataSource={hits?.q === q.trim() ? hits.rows : []}
              locale={{ emptyText: 'Nothing found' }}
              renderItem={(h) => (
                <List.Item style={{ display: 'block', cursor: 'pointer' }} onClick={() => navigate(`${base}/${h.id}`)}>
                  <Typography.Text strong>{h.title}</Typography.Text>
                  <Typography.Paragraph type="secondary" style={{ margin: 0, fontSize: '0.85em' }} ellipsis={{ rows: 2 }}>
                    {splitSnippet(h.snippet).map((p, i) => (p.hit ? <mark key={i}>{p.text}</mark> : <span key={i}>{p.text}</span>))}
                  </Typography.Paragraph>
                </List.Item>
              )}
            />
          ) : !pages.data ? (
            <Skeleton active paragraph={{ rows: 6 }} />
          ) : tree.length === 0 ? (
            <Typography.Text type="secondary" style={{ display: 'block', padding: 8 }}>
              No pages yet.
            </Typography.Text>
          ) : (
            <Tree
              blockNode
              showIcon
              defaultExpandAll
              selectedKeys={selected ? [selected] : []}
              treeData={tree}
              icon={<FileTextOutlined />}
              onSelect={(keys) => keys[0] && navigate(`${base}/${keys[0]}`)}
            />
          )}
        </Card>
      </Col>
      <Col xs={24} md={16} lg={18}>
        {selected ? (
          <PageView key={selected} pageId={selected} onChanged={pages.reload} onAddChild={() => create(selected)} onDeleted={() => (pages.reload(), navigate(base))} />
        ) : (
          <Card>
            <Empty
              image={<FileTextOutlined style={{ fontSize: 48, opacity: 0.4 }} />}
              description={
                <span>
                  Specs, meeting notes and decisions live here, next to the work. <HelpLink article="project-docs" label="How docs work" />
                </span>
              }
            >
              {project.canEdit && (
                <Button type="primary" icon={<PlusOutlined />} onClick={() => create(null)}>
                  {tree.length ? 'New page' : 'Write the first page'}
                </Button>
              )}
            </Empty>
          </Card>
        )}
      </Col>
    </Row>
  )
}

function PageView({ pageId, onChanged, onAddChild, onDeleted }: { pageId: number; onChanged: () => void; onAddChild: () => void; onDeleted: () => void }) {
  const { project } = useProject()
  const { message } = App.useApp()
  const { token } = theme.useToken()
  const loaded = useFetch(useCallback(() => pagesService.get(project.key, pageId), [project.key, pageId]))
  const [page, setPage] = useState<Page | null>(null)
  const current = page ?? loaded.data
  const [editing, setEditing] = useState(() => new URLSearchParams(window.location.search).has('edit'))
  const [draft, setDraft] = useState<{ title: string; body: string } | null>(null)
  const [saving, setSaving] = useState(false)
  const [conflict, setConflict] = useState<string | null>(null)
  const [history, setHistory] = useState(false)

  if (loaded.error) return <Card><Empty description={loaded.error} /></Card>
  if (!current) return <Card><Skeleton active paragraph={{ rows: 10 }} /></Card>

  const value = draft ?? { title: current.title, body: current.body }
  const startEdit = () => {
    setDraft({ title: current.title, body: current.body })
    setConflict(null)
    setEditing(true)
  }
  const save = async () => {
    if (!value.title.trim()) return void message.error('Give the page a title')
    setSaving(true)
    try {
      const saved = await pagesService.update(project.key, pageId, { title: value.title.trim(), body: value.body, baseUpdatedAt: current.updatedAt })
      setPage(saved)
      setDraft(null)
      setEditing(false)
      onChanged()
      message.success('Saved')
    } catch (err) {
      // someone else saved meanwhile: keep the draft, explain
      if (err instanceof ApiError && err.reason === 'PAGE_CHANGED') setConflict(err.message)
      else message.error(getErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }
  const remove = async () => {
    try {
      const { trashed } = await pagesService.remove(project.key, pageId)
      message.success(trashed > 1 ? `Moved to the trash with ${trashed - 1} sub-page(s)` : 'Moved to the trash')
      onDeleted()
    } catch (err) {
      message.error(getErrorMessage(err))
    }
  }

  return (
    <Card>
      <Flex justify="space-between" align="flex-start" gap={12} wrap style={{ marginBottom: 12 }}>
        {editing ? (
          <Input
            value={value.title}
            onChange={(e) => setDraft({ ...value, title: e.target.value })}
            maxLength={200}
            size="large"
            style={{ flex: 1, minWidth: 220, fontWeight: 600 }}
            aria-label="Page title"
          />
        ) : (
          <div style={{ flex: 1, minWidth: 220 }}>
            <Typography.Title level={3} style={{ margin: 0 }}>
              {current.title}
            </Typography.Title>
            <Typography.Text type="secondary" style={{ fontSize: '0.85em' }}>
              Last edited {new Date(current.updatedAt).toLocaleString()}
              {current.updatedBy && ` by ${current.updatedBy.name}`}
            </Typography.Text>
          </div>
        )}
        <Space wrap>
          {editing ? (
            <>
              <Button onClick={() => (setEditing(false), setDraft(null), setConflict(null))}>Cancel</Button>
              <Button type="primary" icon={<SaveOutlined />} loading={saving} onClick={save}>
                Save
              </Button>
            </>
          ) : (
            <>
              <Button icon={<HistoryOutlined />} onClick={() => setHistory(true)}>
                History
              </Button>
              {current.canEdit && (
                <>
                  <Button icon={<PlusOutlined />} onClick={onAddChild}>
                    Sub-page
                  </Button>
                  <Popconfirm title="Delete this page?" description="It goes to the trash with its sub-pages (30 days)." okButtonProps={{ danger: true }} onConfirm={remove}>
                    <Button danger icon={<DeleteOutlined />} aria-label="Delete page" />
                  </Popconfirm>
                  <Button type="primary" icon={<EditOutlined />} onClick={startEdit}>
                    Edit
                  </Button>
                </>
              )}
            </>
          )}
        </Space>
      </Flex>
      {conflict && <Alert type="warning" showIcon title={conflict} style={{ marginBottom: 12 }} />}
      {editing ? (
        <MarkdownEditor value={value.body} onChange={(body) => setDraft({ ...value, body })} rows={18} placeholder={'## Goal\n\nWhat we decided, why, and what happens next.'} />
      ) : (
        <div style={{ maxWidth: 860, borderTop: `1px solid ${token.colorBorderSecondary}`, paddingTop: 12 }}>
          <MarkdownView value={current.body} empty={current.canEdit ? 'Empty page — click Edit to write.' : 'Empty page.'} />
        </div>
      )}
      {history && (
        <HistoryDrawer
          pageId={pageId}
          canEdit={current.canEdit}
          onClose={() => setHistory(false)}
          onRestored={(p) => (setPage(p), setHistory(false), onChanged())}
        />
      )}
    </Card>
  )
}

function HistoryDrawer({ pageId, canEdit, onClose, onRestored }: { pageId: number; canEdit: boolean; onClose: () => void; onRestored: (p: Page) => void }) {
  const { project } = useProject()
  const { message } = App.useApp()
  const versions = useFetch(useCallback(() => pagesService.versions(project.key, pageId), [project.key, pageId]))
  const [open, setOpen] = useState<(PageVersion & { body: string }) | null>(null)

  const show = async (v: PageVersion) => {
    try {
      setOpen(await pagesService.version(project.key, pageId, v.id))
    } catch (err) {
      message.error(getErrorMessage(err))
    }
  }
  const restore = async () => {
    if (!open) return
    try {
      onRestored(await pagesService.restoreVersion(project.key, pageId, open.id))
      message.success('That version is the current text again')
    } catch (err) {
      message.error(getErrorMessage(err))
    }
  }

  return (
    <Drawer open onClose={onClose} title="History" size={420}>
      <List
        loading={!versions.data}
        dataSource={versions.data ?? []}
        renderItem={(v, i) => (
          <List.Item actions={[<Button key="view" type="link" onClick={() => show(v)}>View</Button>]}>
            <List.Item.Meta
              title={`${new Date(v.createdAt).toLocaleString()}${i === 0 ? ' · current' : ''}`}
              description={`${v.editedBy?.name ?? 'Someone'} · ${v.title}`}
            />
          </List.Item>
        )}
      />
      {open && (
        <Modal
          open
          width={760}
          title={`${open.title} — ${new Date(open.createdAt).toLocaleString()}`}
          onCancel={() => setOpen(null)}
          footer={
            canEdit
              ? [
                  <Button key="close" onClick={() => setOpen(null)}>Close</Button>,
                  <Button key="restore" type="primary" onClick={restore}>Restore this version</Button>,
                ]
              : null
          }
        >
          <MarkdownView value={open.body} empty="(empty)" />
        </Modal>
      )}
    </Drawer>
  )
}
