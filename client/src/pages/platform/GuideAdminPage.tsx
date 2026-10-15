// /platform/guide — the platform owner writes the Help Center that every organization reads.
// Left: sections and their articles (drafts included). Right: the article editor.
// Who sees an article: status (draft / published) × visibility (all / selected organizations) × audience (everyone / admins).
import { DeleteOutlined, EditOutlined, EyeOutlined, LockOutlined, PlusOutlined } from '@ant-design/icons'
import {
  Alert, App, Button, Card, Col, Empty, Flex, Form, Input, InputNumber, Modal, Popconfirm, Radio, Row, Select, Skeleton, Space, Switch, Tag, Tooltip, Typography, theme,
} from 'antd'
import { useCallback, useEffect, useState } from 'react'
import { Icon } from '../../components/Icon'
import { ICON_NAMES } from '../../components/icons'
import { PageHeader } from '../../components/ui'
import { useFetch } from '../../hooks/useFetch'
import { getErrorMessage } from '../../lib/api'
import { guideAdminService } from '../../services/guide.service'
import { platformService } from '../../services/platform.service'
import type { GuideAdminSection, GuideArticleDetail, GuideArticleInput } from '../../types/guide'
import { MarkdownEditor } from '../projects/shared/Markdown'

const toSlug = (title: string) =>
  title
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)

type Editing = { kind: 'article'; id: number } | { kind: 'new-article'; sectionId: number } | null
type SectionEditing = GuideAdminSection | 'new' | null

export default function GuideAdminPage() {
  const { message } = App.useApp()
  const { token } = theme.useToken()
  const contents = useFetch(useCallback(() => guideAdminService.contents(), []))
  const [editing, setEditing] = useState<Editing>(null)
  const [sectionEditing, setSectionEditing] = useState<SectionEditing>(null)
  const sections = contents.data ?? []

  const deleteSection = async (s: GuideAdminSection) => {
    try {
      await guideAdminService.deleteSection(s.id)
      message.success(`Section "${s.title}" deleted`)
      contents.reload()
    } catch (err) {
      message.error(getErrorMessage(err))
    }
  }

  return (
    <>
      <PageHeader
        title="Help content"
        description="The product guide every organization reads at /guide. Publish an article for all organizations or only selected ones; mark it “admins” to show it to owners and admins only."
        actions={
          <Button icon={<PlusOutlined />} onClick={() => setSectionEditing('new')}>
            New section
          </Button>
        }
      />
      {contents.error && <Alert type="error" showIcon title={contents.error} style={{ marginBottom: 16 }} />}
      <Row gutter={[16, 16]}>
        <Col xs={24} lg={8}>
          {!contents.data ? (
            <Skeleton active paragraph={{ rows: 12 }} />
          ) : (
            <Flex vertical gap={12}>
              {sections.map((s) => (
                <Card
                  key={s.id}
                  size="small"
                  title={
                    <Space>
                      <Icon name={s.icon} />
                      {s.title}
                    </Space>
                  }
                  extra={
                    <Space size={0}>
                      <Tooltip title="New article">
                        <Button type="text" size="small" icon={<PlusOutlined />} aria-label={`New article in ${s.title}`} onClick={() => setEditing({ kind: 'new-article', sectionId: s.id })} />
                      </Tooltip>
                      <Tooltip title="Edit section">
                        <Button type="text" size="small" icon={<EditOutlined />} aria-label={`Edit section ${s.title}`} onClick={() => setSectionEditing(s)} />
                      </Tooltip>
                      <Popconfirm title="Delete this section?" description="Only empty sections can be deleted." onConfirm={() => deleteSection(s)}>
                        <Button type="text" size="small" danger icon={<DeleteOutlined />} aria-label={`Delete section ${s.title}`} />
                      </Popconfirm>
                    </Space>
                  }
                  styles={{ body: { padding: 4 } }}
                >
                  {s.articles.length === 0 ? (
                    <Typography.Text type="secondary" style={{ display: 'block', padding: 8 }}>
                      No articles yet.
                    </Typography.Text>
                  ) : (
                    s.articles.map((a) => {
                      const active = editing?.kind === 'article' && editing.id === a.id
                      return (
                        <button
                          key={a.id}
                          type="button"
                          onClick={() => setEditing({ kind: 'article', id: a.id })}
                          style={{
                            display: 'flex', width: '100%', gap: 6, alignItems: 'center', flexWrap: 'wrap', textAlign: 'start', cursor: 'pointer',
                            border: 0, borderRadius: token.borderRadiusSM, padding: '6px 8px', font: 'inherit', color: 'inherit',
                            background: active ? token.colorPrimaryBg : 'transparent',
                          }}
                        >
                          <span style={{ flex: 1, minWidth: 120 }}>{a.title}</span>
                          {a.status === 'draft' && <Tag color="orange">draft</Tag>}
                          {a.audience === 'admins' && <Tag icon={<LockOutlined />}>admins</Tag>}
                          {a.visibility === 'selected' && <Tag color="purple">{a.organizationIds.length} org(s)</Tag>}
                        </button>
                      )
                    })
                  )}
                </Card>
              ))}
            </Flex>
          )}
        </Col>
        <Col xs={24} lg={16}>
          {editing ? (
            <ArticleEditor
              key={editing.kind === 'article' ? `a${editing.id}` : `new${editing.sectionId}`}
              editing={editing}
              sections={sections}
              onSaved={(id) => {
                contents.reload()
                setEditing({ kind: 'article', id })
              }}
              onDeleted={() => {
                contents.reload()
                setEditing(null)
              }}
            />
          ) : (
            <Card>
              <Empty description="Pick an article to edit, or add a new one with + on a section." />
            </Card>
          )}
        </Col>
      </Row>
      {sectionEditing && (
        <SectionModal
          section={sectionEditing === 'new' ? null : sectionEditing}
          onClose={() => setSectionEditing(null)}
          onSaved={() => {
            setSectionEditing(null)
            contents.reload()
          }}
        />
      )}
    </>
  )
}

type ArticleForm = Required<Pick<GuideArticleInput, 'sectionId' | 'slug' | 'title' | 'body' | 'audience' | 'visibility' | 'organizationIds'>> & {
  summary: string | null
  appPath: string | null
  position?: number
  published: boolean
}

function ArticleEditor({
  editing, sections, onSaved, onDeleted,
}: {
  editing: Exclude<Editing, null>
  sections: GuideAdminSection[]
  onSaved: (id: number) => void
  onDeleted: () => void
}) {
  const { message } = App.useApp()
  const [form] = Form.useForm<ArticleForm>()
  const isNew = editing.kind === 'new-article'
  const article = useFetch(
    useCallback(() => (editing.kind === 'article' ? guideAdminService.article(editing.id) : Promise.resolve(null as GuideArticleDetail | null)), [editing]),
  )
  const orgs = useFetch(useCallback(() => platformService.organizations({ limit: 100 }), []))
  const [saving, setSaving] = useState(false)
  const [slugTouched, setSlugTouched] = useState(!isNew)
  const visibility = Form.useWatch('visibility', form)
  const a = article.data

  useEffect(() => {
    if (isNew) {
      form.setFieldsValue({
        sectionId: editing.sectionId, title: '', slug: '', summary: null, body: '', audience: 'everyone', appPath: null,
        visibility: 'all', organizationIds: [], published: false,
      })
    } else if (a) {
      form.setFieldsValue({ ...a, published: a.status === 'published' })
    }
  }, [a, isNew, editing, form])

  const save = async (v: ArticleForm) => {
    setSaving(true)
    try {
      const { published, ...rest } = v
      const data: GuideArticleInput = {
        ...rest,
        summary: v.summary?.trim() || null,
        appPath: v.appPath?.trim() || null,
        position: v.position ?? undefined, // cleared → keep the current order (new: last)
        status: published ? 'published' : 'draft',
        organizationIds: v.visibility === 'selected' ? v.organizationIds : [],
      }
      const saved = isNew ? await guideAdminService.createArticle(data) : await guideAdminService.updateArticle(a!.id, data)
      message.success(published ? 'Saved and published' : 'Saved as draft')
      onSaved(saved.id)
    } catch (err) {
      message.error(getErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  const remove = async () => {
    try {
      await guideAdminService.deleteArticle(a!.id)
      message.success('Article deleted')
      onDeleted()
    } catch (err) {
      message.error(getErrorMessage(err))
    }
  }

  if (!isNew && !a) return article.error ? <Alert type="error" showIcon title={article.error} /> : <Skeleton active paragraph={{ rows: 14 }} />

  // the selected organizations may include some outside the first 100 loaded
  const orgOptions = [
    ...(orgs.data?.items ?? []).map((o) => ({ value: o.id, label: o.name })),
    ...(a?.organizationIds ?? []).filter((id) => !orgs.data?.items.some((o) => o.id === id)).map((id) => ({ value: id, label: `Organization #${id}` })),
  ]

  return (
    <Card
      title={isNew ? 'New article' : a!.title}
      extra={
        !isNew && (
          <Space>
            {a!.status === 'published' && (
              <Tooltip title="Organizations see it at this address">
                <Typography.Text code>/guide/{a!.slug}</Typography.Text>
              </Tooltip>
            )}
            <Popconfirm title="Delete this article?" description="Organizations will no longer see it." onConfirm={remove}>
              <Button danger icon={<DeleteOutlined />}>
                Delete
              </Button>
            </Popconfirm>
          </Space>
        )
      }
    >
      <Form form={form} layout="vertical" onFinish={save} requiredMark="optional">
        <Row gutter={16}>
          <Col xs={24} md={14}>
            <Form.Item name="title" label="Title" rules={[{ required: true, max: 200 }]}>
              <Input onChange={(e) => !slugTouched && form.setFieldValue('slug', toSlug(e.target.value))} />
            </Form.Item>
          </Col>
          <Col xs={24} md={10}>
            <Form.Item
              name="slug"
              label="Address (slug)"
              tooltip="The article's address: /guide/<slug>. Lowercase letters, digits and dashes."
              rules={[{ required: true }, { pattern: /^[a-z0-9]+(-[a-z0-9]+)*$/, message: 'Lowercase letters, digits and dashes' }]}
            >
              <Input addonBefore="/guide/" onChange={() => setSlugTouched(true)} />
            </Form.Item>
          </Col>
        </Row>
        <Form.Item name="summary" label="Summary" tooltip="One line under the title and in the article lists" rules={[{ max: 300 }]}>
          <Input />
        </Form.Item>
        <Row gutter={16}>
          <Col xs={24} md={8}>
            <Form.Item name="sectionId" label="Section" rules={[{ required: true }]}>
              <Select options={sections.map((s) => ({ value: s.id, label: s.title }))} />
            </Form.Item>
          </Col>
          <Col xs={24} md={10}>
            <Form.Item
              name="appPath"
              label="“Open this page” link"
              tooltip="A page of the app this article explains, e.g. /leave. Leave empty for none."
              rules={[{ pattern: /^\/[\w\-/?=&.]*$/, message: 'A path of the app, like /leave' }]}
            >
              <Input placeholder="/leave" />
            </Form.Item>
          </Col>
          <Col xs={24} md={6}>
            <Form.Item name="position" label="Order" tooltip="Lower comes first in its section">
              <InputNumber min={0} max={10000} style={{ width: '100%' }} placeholder="last" />
            </Form.Item>
          </Col>
        </Row>
        <Form.Item name="body" label="Article (markdown)" rules={[{ required: true, message: 'Write the article' }]}>
          <MarkdownEditor rows={16} placeholder={'## A heading\n\nText with **bold**, lists and [links](/leave) to pages of the app.'} />
        </Form.Item>

        <Card size="small" type="inner" title={<><EyeOutlined /> Who can see it</>} style={{ marginBottom: 16 }}>
          <Row gutter={16}>
            <Col xs={24} md={8}>
              <Form.Item name="published" label="Published" valuePropName="checked" tooltip="Drafts are visible here only">
                <Switch />
              </Form.Item>
            </Col>
            <Col xs={24} md={16}>
              <Form.Item name="audience" label="Inside an organization">
                <Radio.Group
                  options={[
                    { value: 'everyone', label: 'Everyone' },
                    { value: 'admins', label: 'Owners & admins only' },
                  ]}
                />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="visibility" label="Organizations">
            <Radio.Group
              options={[
                { value: 'all', label: 'All organizations' },
                { value: 'selected', label: 'Only selected organizations' },
              ]}
            />
          </Form.Item>
          {visibility === 'selected' && (
            <Form.Item name="organizationIds" rules={[{ required: true, type: 'array', min: 1, message: 'Pick at least one organization' }]}>
              <Select mode="multiple" showSearch optionFilterProp="label" placeholder="Pick organizations" options={orgOptions} loading={!orgs.data} />
            </Form.Item>
          )}
          <Typography.Text type="secondary" style={{ fontSize: '0.85em' }}>
            Organization owners can also hide the whole Help Center from a role (permission “Read the Help Center”).
          </Typography.Text>
        </Card>

        <Flex justify="space-between" align="center" gap={12} wrap>
          <Typography.Text type="secondary" style={{ fontSize: '0.85em' }}>
            {a ? `Last saved ${new Date(a.updatedAt).toLocaleString()}${a.updatedBy ? ` by ${a.updatedBy}` : ''}` : ''}
          </Typography.Text>
          <Button type="primary" htmlType="submit" loading={saving}>
            {isNew ? 'Create article' : 'Save'}
          </Button>
        </Flex>
      </Form>
    </Card>
  )
}

function SectionModal({ section, onClose, onSaved }: { section: GuideAdminSection | null; onClose: () => void; onSaved: () => void }) {
  const { message } = App.useApp()
  const [form] = Form.useForm<{ title: string; slug: string; icon: string | null; position?: number }>()
  const [saving, setSaving] = useState(false)

  const save = async () => {
    const v = await form.validateFields()
    setSaving(true)
    try {
      if (section) await guideAdminService.updateSection(section.id, { ...v, icon: v.icon ?? null })
      else await guideAdminService.createSection({ ...v, icon: v.icon ?? null })
      message.success('Section saved')
      onSaved()
    } catch (err) {
      message.error(getErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open title={section ? 'Edit section' : 'New section'} onCancel={onClose} onOk={save} okText="Save" confirmLoading={saving} destroyOnHidden>
      <Form
        form={form}
        layout="vertical"
        initialValues={section ?? { icon: 'file' }}
        onValuesChange={(changed) => !section && changed.title !== undefined && form.setFieldValue('slug', toSlug(changed.title).slice(0, 60))}
      >
        <Form.Item name="title" label="Title" rules={[{ required: true, max: 100 }]}>
          <Input autoFocus />
        </Form.Item>
        <Form.Item name="slug" label="Slug" rules={[{ required: true }, { pattern: /^[a-z0-9]+(-[a-z0-9]+)*$/, message: 'Lowercase letters, digits and dashes' }]}>
          <Input />
        </Form.Item>
        <Row gutter={16}>
          <Col span={14}>
            <Form.Item name="icon" label="Icon">
              <Select
                allowClear
                options={ICON_NAMES.map((n) => ({ value: n, label: <Space><Icon name={n} />{n}</Space> }))}
              />
            </Form.Item>
          </Col>
          <Col span={10}>
            <Form.Item name="position" label="Order">
              <InputNumber min={0} max={10000} style={{ width: '100%' }} placeholder="last" />
            </Form.Item>
          </Col>
        </Row>
      </Form>
    </Modal>
  )
}
