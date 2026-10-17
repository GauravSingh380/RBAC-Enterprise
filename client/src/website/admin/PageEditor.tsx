// Editor of one page: page settings (navigation, SEO), the list of sections (add, reorder, hide, duplicate, delete),
// and a live preview of the draft. Publish makes the draft what visitors see; Discard goes back to the published page.
import { CopyOutlined, DeleteOutlined, EditOutlined, ExportOutlined, EyeInvisibleOutlined, EyeOutlined, HolderOutlined, PlusOutlined, UndoOutlined } from '@ant-design/icons'
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Alert, App, Badge, Button, Card, Col, Collapse, Dropdown, Flex, Form, Input, InputNumber, Modal, Popconfirm, Row, Skeleton, Space, Switch, Tag, Tooltip, Typography, theme } from 'antd'
import { useCallback, useEffect, useState } from 'react'
import { useFetch } from '../../hooks/useFetch'
import { getErrorMessage } from '../../lib/api'
import { websiteAdminApi, websiteApi } from '../api'
import { SiteChrome } from '../public/WebsiteLayout'
import { SectionList } from '../sections/SectionRenderer'
import type { DraftPage, Section, SectionType } from '../types'
import { SECTION_CATALOG, sectionLabel, sectionSummary } from '../websiteMeta'
import { SectionEditor } from './SectionEditor'

export function PageEditor({ slug, onChanged }: { slug: string; onChanged: () => void }) {
  const { message } = App.useApp()
  const loaded = useFetch(useCallback(() => websiteAdminApi.page(slug), [slug]))
  const [page, setPage] = useState<DraftPage | null>(null)
  const [editing, setEditing] = useState<Section | null>(null)
  const [adding, setAdding] = useState<{ afterId: number | null } | null>(null)
  const [fullPreview, setFullPreview] = useState(false)
  const current = page ?? loaded.data
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }))

  const run = async (fn: () => Promise<DraftPage>, text?: string) => {
    try {
      setPage(await fn())
      if (text) message.success(text)
      onChanged()
    } catch (err) {
      message.error(getErrorMessage(err))
    }
  }

  if (loaded.error) return <Alert type="error" showIcon title={loaded.error} />
  if (!current) return <Skeleton active paragraph={{ rows: 10 }} />

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return
    const ids = current.sections.map((s) => s.id)
    const next = arrayMove(ids, ids.indexOf(Number(active.id)), ids.indexOf(Number(over.id)))
    setPage({ ...current, sections: next.map((id) => current.sections.find((s) => s.id === id)!) }) // optimistic
    void run(() => websiteAdminApi.reorder(slug, next))
  }

  return (
    <>
      <Card size="small" style={{ marginBottom: 16 }}>
        <Flex justify="space-between" align="center" gap={12} wrap>
          <Space wrap>
            {!current.publishedAt ? (
              <Badge status="default" text="Not published yet — visitors can't open this page" />
            ) : current.hasChanges ? (
              <Badge status="warning" text="Unpublished changes" />
            ) : (
              <Badge status="success" text="Published — visitors see this version" />
            )}
            {current.publishedAt && (
              <Typography.Text type="secondary" style={{ fontSize: '0.85em' }}>
                last published {new Date(current.publishedAt).toLocaleString()}
              </Typography.Text>
            )}
          </Space>
          <Space wrap>
            <a href={current.path} target="_blank" rel="noreferrer">
              <Button icon={<ExportOutlined />}>Open live page</Button>
            </a>
            <Button icon={<EyeOutlined />} onClick={() => setFullPreview(true)}>Full preview</Button>
            <Popconfirm title="Discard all unpublished changes?" description="The draft goes back to the published page." onConfirm={() => run(() => websiteAdminApi.discard(slug), 'Changes discarded')} disabled={!current.hasChanges || !current.publishedAt}>
              <Button icon={<UndoOutlined />} disabled={!current.hasChanges || !current.publishedAt}>Discard</Button>
            </Popconfirm>
            <Popconfirm title="Publish this page?" description="Visitors will see the new version right away." onConfirm={() => run(() => websiteAdminApi.publish(slug), 'Published — the page is live')} disabled={!current.hasChanges}>
              <Button type="primary" disabled={!current.hasChanges}>Publish</Button>
            </Popconfirm>
          </Space>
        </Flex>
      </Card>

      <Row gutter={[16, 16]}>
        <Col xs={24} xl={9}>
          <PageSettings page={current} onSave={(data) => run(() => websiteAdminApi.updateMeta(slug, data), 'Page settings saved to the draft')} />
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={current.sections.map((s) => s.id)} strategy={verticalListSortingStrategy}>
              <Flex vertical gap={8}>
                {current.sections.map((s) => (
                  <SectionCard
                    key={s.id}
                    section={s}
                    onEdit={() => setEditing(s)}
                    onToggle={() => run(() => websiteAdminApi.updateSection(s.id, { isVisible: !s.isVisible }))}
                    onDuplicate={() => run(() => websiteAdminApi.duplicateSection(s.id), 'Section duplicated')}
                    onDelete={() => run(() => websiteAdminApi.deleteSection(s.id), 'Section deleted')}
                    onAddBelow={() => setAdding({ afterId: s.id })}
                  />
                ))}
              </Flex>
            </SortableContext>
          </DndContext>
          <Button type="dashed" block icon={<PlusOutlined />} style={{ marginTop: 12 }} onClick={() => setAdding({ afterId: null })}>
            Add section
          </Button>
        </Col>
        <Col xs={24} xl={15}>
          <Card size="small" title="Live preview of the draft" styles={{ body: { padding: 0 } }}>
            <div style={{ maxHeight: '75vh', overflowY: 'auto', zoom: 0.72 }}>
              <SectionList sections={current.previewSections} preview />
            </div>
          </Card>
        </Col>
      </Row>

      {editing && (
        <SectionEditor
          key={editing.id}
          section={editing}
          plans={current.plans}
          onClose={() => setEditing(null)}
          onSaved={(p) => {
            setPage(p)
            setEditing(null)
            onChanged()
          }}
        />
      )}
      {adding && (
        <AddSectionModal
          onClose={() => setAdding(null)}
          onPick={(type) => {
            const afterId = adding.afterId
            setAdding(null)
            void run(() => websiteAdminApi.addSection(slug, type, afterId), `${sectionLabel(type)} added — edit it to fill it in`)
          }}
        />
      )}
      {fullPreview && <FullPreview page={current} onClose={() => setFullPreview(false)} />}
    </>
  )
}

function SectionCard({ section, onEdit, onToggle, onDuplicate, onDelete, onAddBelow }: {
  section: Section
  onEdit: () => void
  onToggle: () => void
  onDuplicate: () => void
  onDelete: () => void
  onAddBelow: () => void
}) {
  const { token } = theme.useToken()
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: section.id })
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.7 : 1 }}>
      <Card size="small" styles={{ body: { padding: '8px 12px' } }} style={{ opacity: section.isVisible ? 1 : 0.6, borderColor: isDragging ? token.colorPrimary : undefined }}>
        <Flex align="center" gap={8}>
          <span {...attributes} {...listeners} style={{ cursor: 'grab', color: token.colorTextTertiary }} aria-label="Drag to reorder">
            <HolderOutlined />
          </span>
          <div style={{ flex: 1, minWidth: 0, cursor: 'pointer' }} onClick={onEdit}>
            <Space size={6}>
              <Typography.Text strong>{sectionLabel(section.type)}</Typography.Text>
              {!section.isVisible && <Tag>hidden</Tag>}
            </Space>
            <Typography.Text type="secondary" ellipsis style={{ display: 'block', fontSize: '0.85em' }}>
              {sectionSummary(section.type, section.content)}
            </Typography.Text>
          </div>
          <Tooltip title="Edit"><Button type="text" size="small" icon={<EditOutlined />} onClick={onEdit} aria-label="Edit section" /></Tooltip>
          <Tooltip title={section.isVisible ? 'Hide from the page' : 'Show on the page'}>
            <Button type="text" size="small" icon={section.isVisible ? <EyeOutlined /> : <EyeInvisibleOutlined />} onClick={onToggle} aria-label="Show or hide" />
          </Tooltip>
          <Dropdown
            menu={{
              items: [
                { key: 'below', icon: <PlusOutlined />, label: 'Add a section below', onClick: onAddBelow },
                { key: 'dup', icon: <CopyOutlined />, label: 'Duplicate', onClick: onDuplicate },
                { key: 'del', icon: <DeleteOutlined />, label: 'Delete', danger: true, onClick: onDelete },
              ],
            }}
          >
            <Button type="text" size="small" aria-label="More">⋯</Button>
          </Dropdown>
        </Flex>
      </Card>
    </div>
  )
}

function AddSectionModal({ onClose, onPick }: { onClose: () => void; onPick: (t: SectionType) => void }) {
  const { token } = theme.useToken()
  return (
    <Modal open title="Add a section" onCancel={onClose} footer={null} width={720}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
        {SECTION_CATALOG.map((s) => (
          <button
            key={s.type}
            type="button"
            onClick={() => onPick(s.type)}
            style={{ textAlign: 'start', padding: 12, borderRadius: 10, border: `1px solid ${token.colorBorderSecondary}`, background: token.colorBgContainer, cursor: 'pointer', font: 'inherit', color: 'inherit' }}
          >
            <Typography.Text strong>{s.label}</Typography.Text>
            <Typography.Text type="secondary" style={{ display: 'block', fontSize: '0.85em' }}>{s.description}</Typography.Text>
          </button>
        ))}
      </div>
    </Modal>
  )
}

function PageSettings({ page, onSave }: { page: DraftPage; onSave: (data: Partial<DraftPage>) => void }) {
  const [form] = Form.useForm()
  useEffect(() => form.setFieldsValue(page), [page, form])
  return (
    <Collapse
      size="small"
      style={{ marginBottom: 12 }}
      items={[
        {
          key: 'meta',
          label: 'Page settings (menu, search engines)',
          children: (
            <Form form={form} layout="vertical" initialValues={page} onFinish={(v) => onSave({ ...v, navLabel: v.navLabel || null, seoTitle: v.seoTitle || null, seoDescription: v.seoDescription || null })}>
              <Row gutter={8}>
                <Col span={12}><Form.Item name="title" label="Page name" rules={[{ required: true }]}><Input maxLength={100} /></Form.Item></Col>
                <Col span={12}><Form.Item name="navLabel" label="Menu label"><Input maxLength={40} /></Form.Item></Col>
                <Col span={8}><Form.Item name="showInNav" label="In the top menu" valuePropName="checked"><Switch /></Form.Item></Col>
                <Col span={8}><Form.Item name="showInFooter" label="In the footer links" valuePropName="checked" tooltip="Small links at the bottom of every page (e.g. Privacy, Terms)"><Switch /></Form.Item></Col>
                <Col span={8}><Form.Item name="navOrder" label="Order"><InputNumber min={0} max={1000} style={{ width: '100%' }} /></Form.Item></Col>
              </Row>
              <Form.Item name="seoTitle" label="Browser / Google title" tooltip="Up to about 60 characters"><Input maxLength={70} showCount /></Form.Item>
              <Form.Item name="seoDescription" label="Google description" tooltip="Up to about 155 characters"><Input.TextArea maxLength={170} showCount autoSize={{ minRows: 2 }} /></Form.Item>
              <Button htmlType="submit">Save page settings</Button>
            </Form>
          ),
        },
      ]}
    />
  )
}

function FullPreview({ page, onClose }: { page: DraftPage; onClose: () => void }) {
  const site = useFetch(useCallback(() => websiteApi.site(), []))
  return (
    <Modal open onCancel={onClose} footer={null} width="96vw" style={{ top: 16 }} title={`Preview: ${page.title} (draft)`} styles={{ body: { padding: 0, maxHeight: '85vh', overflowY: 'auto' } }}>
      <SiteChrome site={site.data ?? { settings: null, nav: [] }} preview>
        <SectionList sections={page.previewSections} preview />
      </SiteChrome>
    </Modal>
  )
}
