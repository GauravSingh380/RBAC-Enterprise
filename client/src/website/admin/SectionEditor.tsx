// Drawer that edits one section: a form for its type. Saving updates the draft (visitors see it after Publish).
import { ArrowDownOutlined, ArrowUpOutlined, DeleteOutlined, PlusOutlined } from '@ant-design/icons'
import { App, Button, Card, Col, Drawer, Flex, Form, Input, InputNumber, Row, Segmented, Select, Space, Switch, Typography } from 'antd'
import type { FormListFieldData, FormListOperation } from 'antd/es/form/FormList'
import { useState, type ReactNode } from 'react'
import { getErrorMessage } from '../../lib/api'
import { MarkdownEditor } from '../../pages/projects/shared/Markdown'
import { websiteAdminApi } from '../api'
import { FeatureIcon } from '../icons'
import { ICON_NAMES } from '../iconMap'
import type { DraftPage, PlanInfo, Section } from '../types'
import { INQUIRY_TYPES, MOCK_OPTIONS, SAFE_HREF, sectionLabel } from '../websiteMeta'
import { cleanContent } from './formMeta'
import { MediaField } from './MediaLibrary'

const hrefRule = { pattern: SAFE_HREF, message: 'Use /a-page, https://… or mailto:…' }
const { TextArea } = Input

export function SectionEditor({ section, plans, onClose, onSaved }: { section: Section; plans: PlanInfo[]; onClose: () => void; onSaved: (p: DraftPage) => void }) {
  const { message } = App.useApp()
  const [form] = Form.useForm()
  const [saving, setSaving] = useState(false)

  const save = async () => {
    const values = await form.validateFields()
    setSaving(true)
    try {
      const page = await websiteAdminApi.updateSection(section.id, { content: cleanContent(values) })
      message.success('Saved to the draft — publish the page to make it live')
      onSaved(page)
    } catch (err) {
      message.error(getErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Drawer
      open
      onClose={onClose}
      size={720}
      title={`Edit: ${sectionLabel(section.type)}`}
      extra={
        <Space>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="primary" loading={saving} onClick={save}>Save</Button>
        </Space>
      }
    >
      <Form form={form} layout="vertical" initialValues={section.content} requiredMark="optional">
        <Fields type={section.type} plans={plans} />
      </Form>
    </Drawer>
  )
}

// ---------------------------------------------------------------- reusable bits

function CtaFields({ name, label }: { name: (string | number)[]; label: string }) {
  return (
    <Row gutter={8}>
      <Col span={10}>
        <Form.Item name={[...name, 'label']} label={`${label} — text`}>
          <Input maxLength={40} placeholder="Leave empty for no button" />
        </Form.Item>
      </Col>
      <Col span={14}>
        <Form.Item name={[...name, 'href']} label="Link" rules={[hrefRule]}>
          <Input placeholder="/register, /pricing, https://…" maxLength={500} />
        </Form.Item>
      </Col>
    </Row>
  )
}

/** A list of cards with add / move / remove. */
function ListEditor({ name, title, addLabel, newItem, max, children }: {
  name: string
  title: string
  addLabel: string
  newItem: object
  max: number
  children: (field: FormListFieldData) => ReactNode
}) {
  return (
    <Form.List name={name}>
      {(fields, ops: FormListOperation) => (
        <div style={{ marginBottom: 16 }}>
          <Typography.Text strong style={{ display: 'block', marginBottom: 8 }}>{title}</Typography.Text>
          <Flex vertical gap={12}>
            {fields.map((field, i) => (
              <Card
                key={field.key}
                size="small"
                title={`${i + 1}`}
                extra={
                  <Space size={0}>
                    <Button type="text" size="small" icon={<ArrowUpOutlined />} disabled={i === 0} onClick={() => ops.move(i, i - 1)} aria-label="Move up" />
                    <Button type="text" size="small" icon={<ArrowDownOutlined />} disabled={i === fields.length - 1} onClick={() => ops.move(i, i + 1)} aria-label="Move down" />
                    <Button type="text" size="small" danger icon={<DeleteOutlined />} onClick={() => ops.remove(i)} aria-label="Remove" />
                  </Space>
                }
              >
                {children(field)}
              </Card>
            ))}
          </Flex>
          <Button icon={<PlusOutlined />} onClick={() => ops.add(newItem)} disabled={fields.length >= max} style={{ marginTop: 12 }} block type="dashed">
            {addLabel}
          </Button>
        </div>
      )}
    </Form.List>
  )
}

const Title = ({ name = 'title', label = 'Heading', required = false }: { name?: string; label?: string; required?: boolean }) => (
  <Form.Item name={name} label={label} rules={required ? [{ required: true, message: 'Required' }] : undefined}>
    <Input maxLength={140} />
  </Form.Item>
)

// ---------------------------------------------------------------- one form per type

function Fields({ type, plans }: { type: Section['type']; plans: PlanInfo[] }) {
  switch (type) {
    case 'hero':
      return (
        <>
          <Form.Item name="autoplaySeconds" label="Change slide every (seconds)" tooltip="0 = don't slide automatically">
            <InputNumber min={0} max={30} />
          </Form.Item>
          <ListEditor name="slides" title="Slides" addLabel="Add slide" max={8} newItem={{ title: 'New slide', primaryCta: { label: 'Start free', href: '/register' } }}>
            {(f) => (
              <>
                <Form.Item name={[f.name, 'eyebrow']} label="Small text above the headline">
                  <Input maxLength={80} />
                </Form.Item>
                <Form.Item name={[f.name, 'title']} label="Headline" rules={[{ required: true, message: 'Required' }]}>
                  <Input maxLength={140} />
                </Form.Item>
                <Form.Item name={[f.name, 'subtitle']} label="Text">
                  <TextArea autoSize={{ minRows: 2, maxRows: 5 }} maxLength={400} showCount />
                </Form.Item>
                <Form.Item name={[f.name, 'mediaId']} label="Image" tooltip="Without an image, a drawn product preview is shown">
                  <MediaField emptyLabel="Drawn product preview" />
                </Form.Item>
                <CtaFields name={[f.name, 'primaryCta']} label="Main button" />
                <CtaFields name={[f.name, 'secondaryCta']} label="Second button" />
              </>
            )}
          </ListEditor>
        </>
      )
    case 'logos':
      return (
        <>
          <Title label="Text above the logos" />
          <ListEditor name="items" title="Logos" addLabel="Add logo" max={24} newItem={{ name: 'Company' }}>
            {(f) => (
              <>
                <Form.Item name={[f.name, 'name']} label="Name (shown when there is no image, and as alt text)" rules={[{ required: true }]}>
                  <Input maxLength={80} />
                </Form.Item>
                <Form.Item name={[f.name, 'mediaId']} label="Logo">
                  <MediaField emptyLabel="Shows the name" />
                </Form.Item>
                <Form.Item name={[f.name, 'href']} label="Link (optional)" rules={[hrefRule]}>
                  <Input />
                </Form.Item>
              </>
            )}
          </ListEditor>
        </>
      )
    case 'features_grid':
      return (
        <>
          <Title />
          <Form.Item name="subtitle" label="Text under the heading">
            <TextArea autoSize={{ minRows: 2 }} maxLength={300} />
          </Form.Item>
          <Form.Item name="columns" label="Columns">
            <Segmented options={[2, 3, 4]} />
          </Form.Item>
          <ListEditor name="items" title="Features" addLabel="Add feature" max={24} newItem={{ icon: 'check', title: 'New feature' }}>
            {(f) => (
              <Row gutter={8}>
                <Col span={8}>
                  <Form.Item name={[f.name, 'icon']} label="Icon">
                    <Select showSearch options={ICON_NAMES.map((n) => ({ value: n, label: <Space><FeatureIcon name={n} />{n}</Space> }))} />
                  </Form.Item>
                </Col>
                <Col span={16}>
                  <Form.Item name={[f.name, 'title']} label="Title" rules={[{ required: true }]}>
                    <Input maxLength={80} />
                  </Form.Item>
                </Col>
                <Col span={24}>
                  <Form.Item name={[f.name, 'text']} label="Text">
                    <TextArea autoSize={{ minRows: 2 }} maxLength={300} />
                  </Form.Item>
                </Col>
                <Col span={24}>
                  <Form.Item name={[f.name, 'href']} label="Link (optional)" rules={[hrefRule]}>
                    <Input />
                  </Form.Item>
                </Col>
              </Row>
            )}
          </ListEditor>
        </>
      )
    case 'feature_rows':
      return (
        <ListEditor name="items" title="Rows (image and text alternate sides)" addLabel="Add row" max={12} newItem={{ title: 'New feature', bullets: [] }}>
          {(f) => (
            <>
              <Form.Item name={[f.name, 'eyebrow']} label="Small text above">
                <Input maxLength={60} />
              </Form.Item>
              <Form.Item name={[f.name, 'title']} label="Title" rules={[{ required: true }]}>
                <Input maxLength={140} />
              </Form.Item>
              <Form.Item name={[f.name, 'text']} label="Text">
                <TextArea autoSize={{ minRows: 3 }} maxLength={1000} showCount />
              </Form.Item>
              <Form.Item name={[f.name, 'bullets']} label="Bullet points" tooltip="Type and press Enter">
                <Select mode="tags" tokenSeparators={['\n']} open={false} placeholder="Type a point and press Enter" />
              </Form.Item>
              <Form.Item name={[f.name, 'mediaId']} label="Image" tooltip="Without an image, a drawn product screen is shown">
                <MediaField emptyLabel="Drawn product screen" />
              </Form.Item>
              <Form.Item name={[f.name, 'mock']} label="Drawn screen (when there is no image)" tooltip="Empty = chosen from the row's topic">
                <Select allowClear placeholder="Automatic" options={MOCK_OPTIONS} />
              </Form.Item>
              <CtaFields name={[f.name, 'cta']} label="Button (optional)" />
            </>
          )}
        </ListEditor>
      )
    case 'stats':
      return (
        <ListEditor name="items" title="Numbers" addLabel="Add number" max={6} newItem={{ value: '100%', label: 'Something' }}>
          {(f) => (
            <Row gutter={8}>
              <Col span={8}>
                <Form.Item name={[f.name, 'value']} label="Value" rules={[{ required: true }]}>
                  <Input maxLength={20} />
                </Form.Item>
              </Col>
              <Col span={16}>
                <Form.Item name={[f.name, 'label']} label="Label" rules={[{ required: true }]}>
                  <Input maxLength={80} />
                </Form.Item>
              </Col>
            </Row>
          )}
        </ListEditor>
      )
    case 'testimonials':
      return (
        <>
          <Title />
          <ListEditor name="items" title="Quotes" addLabel="Add quote" max={12} newItem={{ quote: '', name: '' }}>
            {(f) => (
              <>
                <Form.Item name={[f.name, 'quote']} label="Quote" rules={[{ required: true }]}>
                  <TextArea autoSize={{ minRows: 2 }} maxLength={600} />
                </Form.Item>
                <Row gutter={8}>
                  <Col span={8}><Form.Item name={[f.name, 'name']} label="Name" rules={[{ required: true }]}><Input maxLength={80} /></Form.Item></Col>
                  <Col span={8}><Form.Item name={[f.name, 'role']} label="Role"><Input maxLength={80} /></Form.Item></Col>
                  <Col span={8}><Form.Item name={[f.name, 'company']} label="Company"><Input maxLength={80} /></Form.Item></Col>
                </Row>
                <Form.Item name={[f.name, 'mediaId']} label="Photo">
                  <MediaField emptyLabel="Initial" />
                </Form.Item>
              </>
            )}
          </ListEditor>
        </>
      )
    case 'cta':
      return (
        <>
          <Title required />
          <Form.Item name="text" label="Text">
            <TextArea autoSize={{ minRows: 2 }} maxLength={400} />
          </Form.Item>
          <CtaFields name={['primaryCta']} label="Main button" />
          <CtaFields name={['secondaryCta']} label="Second link" />
        </>
      )
    case 'rich_text':
      return (
        <>
          <Title />
          <Form.Item name="align" label="Alignment">
            <Segmented options={[{ value: 'left', label: 'Left' }, { value: 'center', label: 'Centre' }]} />
          </Form.Item>
          <Form.Item name="body" label="Text (markdown)">
            <MarkdownEditor rows={10} />
          </Form.Item>
        </>
      )
    case 'pricing':
      return (
        <>
          <Title />
          <Form.Item name="subtitle" label="Text under the heading">
            <TextArea autoSize={{ minRows: 2 }} maxLength={300} />
          </Form.Item>
          <Form.Item name="showLimits" label="Show each plan's limits (members, guests, projects)" valuePropName="checked" tooltip="Taken live from Platform → Plans">
            <Switch />
          </Form.Item>
          <ListEditor name="plans" title="Plans (name and limits come from Platform → Plans)" addLabel="Add plan" max={6} newItem={{ priceLabel: 'Free', features: [], highlight: false }}>
            {(f) => (
              <>
                <Row gutter={8}>
                  <Col span={12}>
                    <Form.Item name={[f.name, 'planKey']} label="Plan" rules={[{ required: true }]}>
                      <Select options={plans.map((p) => ({ value: p.key, label: `${p.name} (${p.key})` }))} />
                    </Form.Item>
                  </Col>
                  <Col span={6}>
                    <Form.Item name={[f.name, 'highlight']} label="Highlight" valuePropName="checked"><Switch /></Form.Item>
                  </Col>
                  <Col span={6}>
                    <Form.Item name={[f.name, 'badge']} label="Badge"><Input maxLength={30} placeholder="Most popular" /></Form.Item>
                  </Col>
                  <Col span={12}>
                    <Form.Item name={[f.name, 'priceLabel']} label="Price" rules={[{ required: true }]}><Input maxLength={30} placeholder="₹499" /></Form.Item>
                  </Col>
                  <Col span={12}>
                    <Form.Item name={[f.name, 'period']} label="Period"><Input maxLength={40} placeholder="per user / month" /></Form.Item>
                  </Col>
                </Row>
                <Form.Item name={[f.name, 'description']} label="Description (empty = the plan's own)">
                  <Input maxLength={200} />
                </Form.Item>
                <Form.Item name={[f.name, 'features']} label="What's included" tooltip="Type and press Enter">
                  <Select mode="tags" open={false} placeholder="Type a feature and press Enter" />
                </Form.Item>
                <CtaFields name={[f.name, 'cta']} label="Button" />
              </>
            )}
          </ListEditor>
          <Form.Item name="footnote" label="Small print under the plans">
            <Input maxLength={300} />
          </Form.Item>
        </>
      )
    case 'faq':
      return (
        <>
          <Title />
          <ListEditor name="items" title="Questions" addLabel="Add question" max={30} newItem={{ question: '', answer: '' }}>
            {(f) => (
              <>
                <Form.Item name={[f.name, 'question']} label="Question" rules={[{ required: true }]}><Input maxLength={200} /></Form.Item>
                <Form.Item name={[f.name, 'answer']} label="Answer (markdown)" rules={[{ required: true }]}>
                  <TextArea autoSize={{ minRows: 2 }} maxLength={2000} />
                </Form.Item>
              </>
            )}
          </ListEditor>
        </>
      )
    case 'steps':
      return (
        <>
          <Title />
          <Form.Item name="subtitle" label="Text under the heading">
            <TextArea autoSize={{ minRows: 2 }} maxLength={300} />
          </Form.Item>
          <ListEditor name="items" title="Steps (numbered automatically)" addLabel="Add step" max={6} newItem={{ icon: 'check', title: 'New step' }}>
            {(f) => (
              <Row gutter={8}>
                <Col span={8}>
                  <Form.Item name={[f.name, 'icon']} label="Icon">
                    <Select showSearch options={ICON_NAMES.map((n) => ({ value: n, label: <Space><FeatureIcon name={n} />{n}</Space> }))} />
                  </Form.Item>
                </Col>
                <Col span={16}>
                  <Form.Item name={[f.name, 'title']} label="Title" rules={[{ required: true }]}><Input maxLength={80} /></Form.Item>
                </Col>
                <Col span={24}>
                  <Form.Item name={[f.name, 'text']} label="Text"><TextArea autoSize={{ minRows: 2 }} maxLength={300} /></Form.Item>
                </Col>
              </Row>
            )}
          </ListEditor>
          <CtaFields name={['cta']} label="Button under the steps (optional)" />
        </>
      )
    case 'showcase':
      return (
        <>
          <Form.Item name="eyebrow" label="Small text above the heading"><Input maxLength={60} /></Form.Item>
          <Title />
          <Form.Item name="subtitle" label="Text under the heading">
            <TextArea autoSize={{ minRows: 2 }} maxLength={300} />
          </Form.Item>
          <ListEditor name="tabs" title="Tabs (one product screen each)" addLabel="Add tab" max={8} newItem={{ label: 'New tab', icon: 'board', title: 'A screen', bullets: [], mock: 'board' }}>
            {(f) => (
              <>
                <Row gutter={8}>
                  <Col span={8}><Form.Item name={[f.name, 'label']} label="Tab label" rules={[{ required: true }]}><Input maxLength={30} /></Form.Item></Col>
                  <Col span={8}>
                    <Form.Item name={[f.name, 'icon']} label="Icon">
                      <Select showSearch options={ICON_NAMES.map((n) => ({ value: n, label: <Space><FeatureIcon name={n} />{n}</Space> }))} />
                    </Form.Item>
                  </Col>
                  <Col span={8}>
                    <Form.Item name={[f.name, 'mock']} label="Drawn screen" tooltip="Shown when no screenshot is uploaded">
                      <Select options={MOCK_OPTIONS} />
                    </Form.Item>
                  </Col>
                </Row>
                <Form.Item name={[f.name, 'title']} label="Title" rules={[{ required: true }]}><Input maxLength={140} /></Form.Item>
                <Form.Item name={[f.name, 'text']} label="Text"><TextArea autoSize={{ minRows: 3 }} maxLength={600} showCount /></Form.Item>
                <Form.Item name={[f.name, 'bullets']} label="Bullet points" tooltip="Type and press Enter">
                  <Select mode="tags" open={false} placeholder="Type a point and press Enter" />
                </Form.Item>
                <Form.Item name={[f.name, 'mediaId']} label="Screenshot (optional)">
                  <MediaField emptyLabel="Uses the drawn screen" />
                </Form.Item>
              </>
            )}
          </ListEditor>
        </>
      )
    case 'contact_form':
      return (
        <>
          <Title label="Heading" />
          <Form.Item name="subtitle" label="Text next to the form">
            <TextArea autoSize={{ minRows: 2 }} maxLength={400} />
          </Form.Item>
          <Form.Item name="topics" label="Topics visitors can choose (the first one is pre-selected)" rules={[{ required: true, type: 'array', min: 1, message: 'Pick at least one topic' }]}>
            <Select mode="multiple" options={INQUIRY_TYPES} />
          </Form.Item>
          <Row gutter={8}>
            <Col span={8}><Form.Item name="showCompany" label="Ask for the company" valuePropName="checked"><Switch /></Form.Item></Col>
            <Col span={8}><Form.Item name="showTeamSize" label="Ask for the team size" valuePropName="checked"><Switch /></Form.Item></Col>
            <Col span={8}><Form.Item name="showPhone" label="Ask for a phone number" valuePropName="checked"><Switch /></Form.Item></Col>
          </Row>
          <Form.Item name="successTitle" label="Thank-you message" rules={[{ required: true }]}>
            <Input maxLength={140} />
          </Form.Item>
          <Form.Item name="successText" label="Thank-you text">
            <Input maxLength={400} />
          </Form.Item>
          <Form.Item name="responseTime" label="Response time badge" tooltip="Shown on the coloured panel, e.g. “Replies within 1 working day”">
            <Input maxLength={60} />
          </Form.Item>
          <Form.Item name="nextSteps" label="What happens next (up to 4 steps)" tooltip="Type a step and press Enter">
            <Select mode="tags" open={false} maxCount={4} placeholder="Type a step and press Enter" />
          </Form.Item>
          <ListEditor name="contactPoints" title="Contact details next to the form" addLabel="Add contact detail" max={6} newItem={{ icon: 'mail', label: 'Email', value: '' }}>
            {(f) => (
              <Row gutter={8}>
                <Col span={6}>
                  <Form.Item name={[f.name, 'icon']} label="Icon">
                    <Select showSearch options={ICON_NAMES.map((n) => ({ value: n, label: <Space><FeatureIcon name={n} />{n}</Space> }))} />
                  </Form.Item>
                </Col>
                <Col span={6}><Form.Item name={[f.name, 'label']} label="Label" rules={[{ required: true }]}><Input maxLength={40} /></Form.Item></Col>
                <Col span={12}><Form.Item name={[f.name, 'value']} label="Text" rules={[{ required: true }]}><Input maxLength={200} /></Form.Item></Col>
                <Col span={24}><Form.Item name={[f.name, 'href']} label="Link (optional)" rules={[hrefRule]}><Input placeholder="mailto:hello@your-domain.com" /></Form.Item></Col>
              </Row>
            )}
          </ListEditor>
          <Typography.Text type="secondary">Messages arrive in Website → Inquiries; you get an e-mail for each one.</Typography.Text>
        </>
      )
    default:
      return null
  }
}
