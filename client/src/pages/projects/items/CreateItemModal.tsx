import { Alert, App, Button, Col, Collapse, DatePicker, Form, Input, InputNumber, Modal, Row, Select, Space, Typography } from 'antd'
import type { Dayjs } from 'dayjs'
import { useCallback, useState } from 'react'
import { useFetch } from '../../../hooks/useFetch'
import { getErrorMessage } from '../../../lib/api'
import { projectsService, workItemsService } from '../../../services/projects.service'
import { templatesService } from '../../../services/workspace.service'
import type { ItemTemplate } from '../../../types/workspace'
import type { ItemType, Priority, ProjectDetail, Severity, WorkItemDetail } from '../../../types/projects'
import { DuplicateSuggestions } from '../shared/DuplicateSuggestions'
import { ITEM_TYPES, PRIORITIES, SEVERITIES, ALLOWED_PARENTS, detectBrowser } from '../shared/itemMeta'
import { ItemTypeIcon, PriorityIcon, StatusTag } from '../shared/ItemBits'
import { MarkdownEditor } from '../shared/Markdown'
import { CustomFieldInput } from './CustomFieldInput'
import { awayLabel } from '../shared/availability'
import { useAvailability } from '../shared/useAvailability'

interface FormValues {
  type: ItemType
  title: string
  description?: string
  statusId?: number
  priority: Priority
  severity?: Severity
  assigneeId?: number
  parentId?: number
  dueDate?: Dayjs
  estimate?: number
  labelIds?: number[]
  environment?: string
  stepsToReproduce?: string
  expectedResult?: string
  actualResult?: string
  browser?: string
  os?: string
  foundInVersion?: string
  customFields?: Record<string, unknown>
}

interface Props {
  project: ProjectDetail
  /** Pre-fill (e.g. "add sub-task" under a parent) */
  defaults?: Partial<Pick<FormValues, 'type' | 'parentId' | 'statusId'>>
  onClose: () => void
  onCreated: (item: WorkItemDetail, createAnother: boolean) => void
}

export default function CreateItemModal({ project, defaults, onClose, onCreated }: Props) {
  const { message } = App.useApp()
  const [form] = Form.useForm<FormValues>()
  const [saving, setSaving] = useState(false)
  const type = Form.useWatch('type', form) ?? defaults?.type ?? project.defaultItemType
  const title = Form.useWatch('title', form)
  const people = useFetch(useCallback(() => projectsService.assignableUsers(project.key), [project.key]))
  const availability = useAvailability(project.key)
  const [parentSearch, setParentSearch] = useState('')
  // "Use a template": fills the form and brings its checklist (not for sub-tasks)
  const templates = useFetch(useCallback(() => (defaults?.type === 'subtask' ? Promise.resolve([] as ItemTemplate[]) : templatesService.list(project.key)), [project.key, defaults?.type]))
  const [checklist, setChecklist] = useState<string[]>([])
  const applyTemplate = (id: number | undefined) => {
    const t = templates.data?.find((x) => x.id === id)
    if (!t) {
      setChecklist([])
      return
    }
    const today = new Date().toISOString().slice(0, 10)
    form.setFieldsValue({
      type: t.type,
      title: t.title.replaceAll('{date}', today),
      description: t.description ?? undefined,
      priority: t.priority,
      labelIds: t.labelIds.filter((l) => project.labels.some((pl) => pl.id === l)),
      parentId: undefined,
    })
    setChecklist(t.checklist)
  }
  const parentTypes = ALLOWED_PARENTS[type]
  const parents = useFetch(
    useCallback(
      () =>
        parentTypes.length
          ? workItemsService.list(project.key, { types: parentTypes.join(','), search: parentSearch || undefined, limit: 20, sort: 'updated' })
          : Promise.resolve(null),
      [project.key, parentTypes, parentSearch],
    ),
  )

  const submit = async (values: FormValues, createAnother: boolean) => {
    setSaving(true)
    try {
      const item = await workItemsService.create(project.key, {
        ...values,
        description: values.description || undefined,
        checklist: checklist.length ? checklist : undefined,
        dueDate: values.dueDate ? values.dueDate.format('YYYY-MM-DD') : undefined,
        customFields: values.customFields
          ? Object.fromEntries(Object.entries(values.customFields).filter(([, v]) => v !== undefined && v !== null && v !== ''))
          : undefined,
      })
      message.success(`${item.key} created`)
      onCreated(item, createAnother)
      if (createAnother) {
        form.resetFields(['title', 'description', 'stepsToReproduce', 'expectedResult', 'actualResult'])
        setChecklist([])
        setSaving(false)
      }
    } catch (err) {
      message.error(getErrorMessage(err))
      setSaving(false)
    }
  }

  return (
    <Modal
      open
      title={`Create work item in ${project.name}`}
      width={760}
      onCancel={onClose}
      okText="Create"
      confirmLoading={saving}
      onOk={() => form.validateFields().then((v) => submit(v, false))}
      footer={(_, { OkBtn, CancelBtn }) => (
        <Space>
          <CancelBtn />
          <a onClick={() => form.validateFields().then((v) => submit(v, true))} style={{ marginRight: 8 }}>
            Create &amp; add another
          </a>
          <OkBtn />
        </Space>
      )}
    >
      {!!templates.data?.length && (
        <Select
          allowClear
          placeholder="Use a template…"
          style={{ width: '100%', marginBottom: 16 }}
          onChange={applyTemplate}
          options={templates.data.map((t) => ({ value: t.id, label: `${t.name}${t.checklist.length ? ` · ${t.checklist.length}-step checklist` : ''}` }))}
          aria-label="Use a template"
        />
      )}
      {checklist.length > 0 && (
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
          title={`Checklist from the template: ${checklist.join(' · ')}`}
          action={
            <Button size="small" type="text" onClick={() => setChecklist([])}>
              Remove
            </Button>
          }
        />
      )}
      <Form<FormValues>
        form={form}
        layout="vertical"
        requiredMark="optional"
        initialValues={{ type: project.defaultItemType, priority: 'medium', ...defaults }}
      >
        <Row gutter={16}>
          <Col xs={24} sm={8}>
            <Form.Item name="type" label="Type" rules={[{ required: true }]}>
              <Select
                onChange={() => form.setFieldValue('parentId', undefined)}
                options={ITEM_TYPES.map((t) => ({
                  value: t.value,
                  label: (
                    <Space>
                      <ItemTypeIcon type={t.value} size={12} />
                      {t.label}
                    </Space>
                  ),
                }))}
              />
            </Form.Item>
          </Col>
          <Col xs={24} sm={16}>
            <Form.Item name="statusId" label="Status">
              <Select
                placeholder={project.statuses[0]?.name}
                options={project.statuses.map((s) => ({ value: s.id, label: <StatusTag status={s} /> }))}
              />
            </Form.Item>
          </Col>
        </Row>

        <Form.Item name="title" label="Title" rules={[{ required: true, whitespace: true, max: 500 }]}>
          <Input placeholder={type === 'bug' ? 'What is broken?' : 'What needs to be done?'} autoFocus />
        </Form.Item>
        <DuplicateSuggestions projectKey={project.key} title={title} />

        <Form.Item name="description" label="Description">
          <MarkdownEditor rows={4} />
        </Form.Item>

        {type === 'bug' && (
          <Collapse
            size="small"
            defaultActiveKey={['bug']}
            style={{ marginBottom: 16 }}
            items={[
              {
                key: 'bug',
                label: 'Bug details',
                children: (
                  <>
                    <Form.Item name="stepsToReproduce" label="Steps to reproduce">
                      <Input.TextArea autoSize={{ minRows: 3 }} placeholder={'1. Go to …\n2. Click …\n3. See error'} />
                    </Form.Item>
                    <Row gutter={16}>
                      <Col xs={24} sm={12}>
                        <Form.Item name="expectedResult" label="Expected result">
                          <Input.TextArea autoSize={{ minRows: 2 }} />
                        </Form.Item>
                      </Col>
                      <Col xs={24} sm={12}>
                        <Form.Item name="actualResult" label="Actual result">
                          <Input.TextArea autoSize={{ minRows: 2 }} />
                        </Form.Item>
                      </Col>
                    </Row>
                    <Row gutter={16}>
                      <Col xs={24} sm={12}>
                        <Form.Item name="environment" label="Environment">
                          <Input placeholder="e.g. staging, production" maxLength={255} />
                        </Form.Item>
                      </Col>
                      <Col xs={24} sm={12}>
                        <Form.Item name="foundInVersion" label="Found in version">
                          <Input placeholder="e.g. 2.4.0" maxLength={50} />
                        </Form.Item>
                      </Col>
                      <Col xs={12} sm={8}>
                        <Form.Item name="browser" label="Browser" style={{ marginBottom: 0 }}>
                          <Input placeholder="e.g. Chrome 128" maxLength={100} />
                        </Form.Item>
                      </Col>
                      <Col xs={12} sm={8}>
                        <Form.Item name="os" label="OS" style={{ marginBottom: 0 }}>
                          <Input placeholder="e.g. Windows 11" maxLength={100} />
                        </Form.Item>
                      </Col>
                      <Col xs={24} sm={8} style={{ display: 'flex', alignItems: 'flex-end' }}>
                        <Button block onClick={() => form.setFieldsValue({ ...detectBrowser(navigator.userAgent) } as Partial<FormValues>)}>
                          Use my browser
                        </Button>
                      </Col>
                    </Row>
                  </>
                ),
              },
            ]}
          />
        )}

        <Row gutter={16}>
          <Col xs={24} sm={12}>
            <Form.Item name="assigneeId" label="Assignee">
              <Select
                allowClear
                showSearch={{ optionFilterProp: 'label' }}
                placeholder="Unassigned"
                loading={people.loading}
                options={(people.data ?? []).map((u) => ({ value: u.id, label: u.name, away: awayLabel(availability.get(u.id)?.away ?? []) }))}
                optionRender={(o) => (
                  <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                    <span>{o.label}</span>
                    {o.data.away && <Typography.Text type="warning" style={{ fontSize: '0.85em' }}>🌴 {o.data.away}</Typography.Text>}
                  </Space>
                )}
              />
            </Form.Item>
          </Col>
          <Col xs={12} sm={6}>
            <Form.Item name="priority" label="Priority">
              <Select options={PRIORITIES.map((p) => ({ value: p.value, label: <PriorityIcon priority={p.value} showLabel /> }))} />
            </Form.Item>
          </Col>
          {type === 'bug' ? (
            <Col xs={12} sm={6}>
              <Form.Item name="severity" label="Severity">
                <Select allowClear options={SEVERITIES.map((s) => ({ value: s.value, label: s.label }))} />
              </Form.Item>
            </Col>
          ) : (
            <Col xs={12} sm={6}>
              <Form.Item name="estimate" label="Estimate">
                <InputNumber min={0} max={99999} style={{ width: '100%' }} placeholder="points" />
              </Form.Item>
            </Col>
          )}
        </Row>

        <Row gutter={16}>
          {parentTypes.length > 0 && (
            <Col xs={24} sm={12}>
              <Form.Item
                name="parentId"
                label={`Parent (${parentTypes.join(' / ')})`}
                rules={type === 'subtask' ? [{ required: true, message: 'A sub-task needs a parent' }] : []}
              >
                <Select
                  allowClear
                  showSearch
                  filterOption={false}
                  onSearch={setParentSearch}
                  placeholder="Search by key or title"
                  loading={parents.loading}
                  options={(parents.data?.items ?? []).map((i) => ({ value: i.id, label: `${i.key} · ${i.title}` }))}
                />
              </Form.Item>
            </Col>
          )}
          <Col xs={24} sm={parentTypes.length ? 12 : 24}>
            <Form.Item name="labelIds" label="Labels">
              <Select mode="multiple" allowClear placeholder="Add labels" options={project.labels.map((l) => ({ value: l.id, label: l.name }))} />
            </Form.Item>
          </Col>
        </Row>

        <Form.Item name="dueDate" label="Due date">
          <DatePicker style={{ width: '100%' }} />
        </Form.Item>

        {project.fields.length > 0 && (
          <>
            <Typography.Text strong>Custom fields</Typography.Text>
            <Row gutter={16} style={{ marginTop: 8 }}>
              {project.fields.map((f) => (
                <Col xs={24} sm={12} key={f.id}>
                  <Form.Item
                    name={['customFields', String(f.id)]}
                    label={f.name}
                    rules={f.required && f.fieldType !== 'checkbox' ? [{ required: true, message: `${f.name} is required` }] : []}
                  >
                    <CustomFieldInput field={f} />
                  </Form.Item>
                </Col>
              ))}
            </Row>
          </>
        )}
      </Form>
    </Modal>
  )
}
