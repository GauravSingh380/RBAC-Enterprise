// Project → Settings → Templates: ready-made items; a template can also repeat (weekdays / weekly / monthly).
import { DeleteOutlined, EditOutlined, PlusOutlined, SyncOutlined } from '@ant-design/icons'
import { Alert, App, Button, Card, Col, Form, Input, InputNumber, Modal, Popconfirm, Row, Select, Space, Table, Tag, Tooltip, Typography, type TableProps } from 'antd'
import { useCallback, useState } from 'react'
import { HelpLink } from '../../../components/HelpLink'
import { useFetch } from '../../../hooks/useFetch'
import { getErrorMessage } from '../../../lib/api'
import { projectsService } from '../../../services/projects.service'
import { templatesService } from '../../../services/workspace.service'
import type { ProjectDetail } from '../../../types/projects'
import type { ItemTemplate, ItemTemplateInput } from '../../../types/workspace'
import { ITEM_TYPES, PRIORITIES } from '../shared/itemMeta'
import { ItemTypeIcon } from '../shared/ItemBits'
import { MarkdownEditor } from '../shared/Markdown'
import { describeRepeat, WEEKDAYS } from './templateMeta'

export default function TemplatesSettings({ project }: { project: ProjectDetail; reload: () => void }) {
  const { message } = App.useApp()
  const templates = useFetch(useCallback(() => templatesService.list(project.key), [project.key]))
  const [editing, setEditing] = useState<ItemTemplate | 'new' | null>(null)

  const remove = async (t: ItemTemplate) => {
    try {
      await templatesService.remove(project.key, t.id)
      message.success(`Template "${t.name}" deleted`)
      templates.reload()
    } catch (err) {
      message.error(getErrorMessage(err))
    }
  }

  const columns: TableProps<ItemTemplate>['columns'] = [
    {
      title: 'Template',
      key: 'name',
      render: (_, t) => (
        <Space>
          <ItemTypeIcon type={t.type} size={12} />
          <div>
            <Typography.Text strong>{t.name}</Typography.Text>
            <Typography.Text type="secondary" style={{ display: 'block', fontSize: '0.85em' }}>
              {t.title}
              {t.checklist.length > 0 && ` · ${t.checklist.length}-step checklist`}
            </Typography.Text>
          </div>
        </Space>
      ),
    },
    {
      title: 'Repeats',
      key: 'repeat',
      render: (_, t) =>
        t.repeat === 'never' ? (
          <Typography.Text type="secondary">—</Typography.Text>
        ) : (
          <div>
            <Tag icon={<SyncOutlined />} color={t.nextRunOn ? 'blue' : 'orange'}>
              {describeRepeat(t)}
            </Tag>
            <Typography.Text type="secondary" style={{ display: 'block', fontSize: '0.85em' }}>
              {t.nextRunOn ? `Next: ${new Date(`${t.nextRunOn}T00:00:00`).toLocaleDateString()}` : 'Paused — save the template to restart it'}
              {t.assignee && ` · for ${t.assignee.name}`}
            </Typography.Text>
          </div>
        ),
    },
    {
      title: '',
      key: 'actions',
      align: 'right',
      render: (_, t) => (
        <Space size={0}>
          <Tooltip title="Edit">
            <Button type="text" icon={<EditOutlined />} onClick={() => setEditing(t)} aria-label={`Edit ${t.name}`} />
          </Tooltip>
          <Popconfirm title={`Delete the template "${t.name}"?`} description="Items created from it stay." onConfirm={() => remove(t)}>
            <Button type="text" danger icon={<DeleteOutlined />} aria-label={`Delete ${t.name}`} />
          </Popconfirm>
        </Space>
      ),
    },
  ]

  return (
    <Card>
      <Space style={{ marginBottom: 16, width: '100%', justifyContent: 'space-between' }} wrap>
        <Typography.Text type="secondary">
          Ready-made items for <strong>Create → Use a template</strong>. A template can also create its item by itself on a schedule.{' '}
          <HelpLink article="checklists-and-templates" label="How templates and repeating work" />
        </Typography.Text>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setEditing('new')}>
          New template
        </Button>
      </Space>
      <Table<ItemTemplate> rowKey="id" columns={columns} dataSource={templates.data ?? []} loading={templates.loading} pagination={false} scroll={{ x: 560 }} />
      {editing && (
        <TemplateModal
          project={project}
          template={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            templates.reload()
          }}
        />
      )}
    </Card>
  )
}

type FormValues = Omit<ItemTemplateInput, 'checklist'> & { checklistText: string }

function TemplateModal({ project, template, onClose, onSaved }: { project: ProjectDetail; template: ItemTemplate | null; onClose: () => void; onSaved: () => void }) {
  const { message } = App.useApp()
  const [form] = Form.useForm<FormValues>()
  const [saving, setSaving] = useState(false)
  const repeat = Form.useWatch('repeat', form) ?? template?.repeat ?? 'never'
  const people = useFetch(useCallback(() => projectsService.assignableUsers(project.key), [project.key]))

  const save = async () => {
    const { checklistText, ...v } = await form.validateFields()
    const data: ItemTemplateInput = {
      ...v,
      description: v.description || null,
      checklist: (checklistText ?? '').split('\n').map((l) => l.trim()).filter(Boolean),
      repeatWeekday: v.repeat === 'weekly' ? v.repeatWeekday : null,
      repeatMonthDay: v.repeat === 'monthly' ? v.repeatMonthDay : null,
      assigneeId: v.repeat === 'never' ? null : (v.assigneeId ?? null),
      dueInDays: v.repeat === 'never' ? null : (v.dueInDays ?? null),
    }
    setSaving(true)
    try {
      if (template) await templatesService.update(project.key, template.id, data)
      else await templatesService.create(project.key, data)
      message.success('Template saved')
      onSaved()
    } catch (err) {
      message.error(getErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open width={720} title={template ? `Edit "${template.name}"` : 'New template'} onCancel={onClose} onOk={save} okText="Save" confirmLoading={saving} destroyOnHidden>
      <Form<FormValues>
        form={form}
        layout="vertical"
        requiredMark="optional"
        initialValues={
          template
            ? { ...template, assigneeId: template.assignee?.id ?? null, checklistText: template.checklist.join('\n') }
            : { type: 'task', priority: 'medium', labelIds: [], repeat: 'never', repeatWeekday: 1, repeatMonthDay: 1, checklistText: '' }
        }
      >
        <Row gutter={16}>
          <Col xs={24} sm={12}>
            <Form.Item name="name" label="Template name" rules={[{ required: true, max: 100 }]}>
              <Input placeholder="Release checklist" autoFocus />
            </Form.Item>
          </Col>
          <Col xs={12} sm={6}>
            <Form.Item name="type" label="Type">
              <Select options={ITEM_TYPES.filter((t) => t.value !== 'subtask').map((t) => ({ value: t.value, label: t.label }))} />
            </Form.Item>
          </Col>
          <Col xs={12} sm={6}>
            <Form.Item name="priority" label="Priority">
              <Select options={PRIORITIES.map((p) => ({ value: p.value, label: p.label }))} />
            </Form.Item>
          </Col>
        </Row>
        <Form.Item name="title" label="Item title" rules={[{ required: true, max: 500 }]} extra="{date} becomes the day the item is created.">
          <Input placeholder="Weekly deploy check — {date}" />
        </Form.Item>
        <Form.Item name="description" label="Description">
          <MarkdownEditor rows={4} />
        </Form.Item>
        <Row gutter={16}>
          <Col xs={24} sm={12}>
            <Form.Item name="checklistText" label="Checklist" extra="One step per line.">
              <Input.TextArea autoSize={{ minRows: 3, maxRows: 10 }} placeholder={'Run the tests\nTag the release\nTell the team'} />
            </Form.Item>
          </Col>
          <Col xs={24} sm={12}>
            <Form.Item name="labelIds" label="Labels">
              <Select mode="multiple" allowClear options={project.labels.map((l) => ({ value: l.id, label: l.name }))} />
            </Form.Item>
          </Col>
        </Row>

        <Card size="small" type="inner" title={<><SyncOutlined /> Repeat</>}>
          <Row gutter={16}>
            <Col xs={24} sm={8}>
              <Form.Item name="repeat" label="Create it automatically">
                <Select
                  options={[
                    { value: 'never', label: 'Never (manual only)' },
                    { value: 'weekdays', label: 'Every weekday (Mon–Fri)' },
                    { value: 'weekly', label: 'Every week' },
                    { value: 'monthly', label: 'Every month' },
                  ]}
                />
              </Form.Item>
            </Col>
            {repeat === 'weekly' && (
              <Col xs={24} sm={8}>
                <Form.Item name="repeatWeekday" label="On" rules={[{ required: true }]}>
                  <Select options={WEEKDAYS.map((d, i) => ({ value: i, label: d }))} />
                </Form.Item>
              </Col>
            )}
            {repeat === 'monthly' && (
              <Col xs={24} sm={8}>
                <Form.Item name="repeatMonthDay" label="On day" rules={[{ required: true }]} tooltip="1 to 28, so it exists in every month">
                  <InputNumber min={1} max={28} style={{ width: '100%' }} />
                </Form.Item>
              </Col>
            )}
          </Row>
          {repeat !== 'never' && (
            <>
              <Row gutter={16}>
                <Col xs={24} sm={12}>
                  <Form.Item name="assigneeId" label="Assign to">
                    <Select
                      allowClear
                      showSearch
                      optionFilterProp="label"
                      placeholder="Nobody"
                      loading={!people.data}
                      options={(people.data ?? []).map((p) => ({ value: p.id, label: p.name }))}
                    />
                  </Form.Item>
                </Col>
                <Col xs={24} sm={12}>
                  <Form.Item name="dueInDays" label="Due" tooltip="Days after the item is created; empty = no due date">
                    <InputNumber min={0} max={365} addonAfter="days later" style={{ width: '100%' }} placeholder="no due date" />
                  </Form.Item>
                </Col>
              </Row>
              <Alert type="info" showIcon title="Items are created early in the morning, as you (you need to stay able to edit this project)." />
            </>
          )}
        </Card>
      </Form>
    </Modal>
  )
}
