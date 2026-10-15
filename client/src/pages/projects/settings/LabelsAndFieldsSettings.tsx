import { DeleteOutlined, PlusOutlined } from '@ant-design/icons'
import { App, Button, Card, Checkbox, Flex, Form, Input, Modal, Popconfirm, Select, Table, Tag, Typography, type TableProps } from 'antd'
import { useState } from 'react'
import { getErrorMessage } from '../../../lib/api'
import { projectsService } from '../../../services/projects.service'
import type { FieldType, ProjectDetail, ProjectField, ProjectLabel } from '../../../types/projects'
import { LABEL_COLORS } from '../shared/itemMeta'

function useRun(reload: () => void) {
  const { message } = App.useApp()
  return async (fn: () => Promise<unknown>, text?: string) => {
    try {
      await fn()
      if (text) message.success(text)
      reload()
      return true
    } catch (err) {
      message.error(getErrorMessage(err))
      return false
    }
  }
}

export function LabelsSettings({ project, reload }: { project: ProjectDetail; reload: () => void }) {
  const run = useRun(reload)
  const [name, setName] = useState('')
  const [color, setColor] = useState('blue')

  const colorSelect = (value: string, onChange: (c: string) => void) => (
    <Select value={value} onChange={onChange} style={{ width: 130 }} options={LABEL_COLORS.map((c) => ({ value: c, label: <Tag color={c}>{c}</Tag> }))} />
  )

  const columns: TableProps<ProjectLabel>['columns'] = [
    { title: 'Preview', key: 'preview', width: 160, render: (_, l) => <Tag color={l.color}>{l.name}</Tag> },
    {
      title: 'Name',
      key: 'name',
      render: (_, l) => (
        <Typography.Text editable={{ onChange: (v) => v.trim() && v !== l.name && run(() => projectsService.updateLabel(project.key, l.id, { name: v.trim() })) }}>
          {l.name}
        </Typography.Text>
      ),
    },
    { title: 'Colour', key: 'color', width: 160, render: (_, l) => colorSelect(l.color, (c) => run(() => projectsService.updateLabel(project.key, l.id, { color: c }))) },
    {
      title: '',
      key: 'actions',
      width: 60,
      render: (_, l) => (
        <Popconfirm title={`Delete label "${l.name}"?`} description="It is removed from every item." okButtonProps={{ danger: true }} onConfirm={() => run(() => projectsService.deleteLabel(project.key, l.id), 'Label deleted')}>
          <Button type="text" danger icon={<DeleteOutlined />} />
        </Popconfirm>
      ),
    },
  ]

  const add = () => name.trim() && run(() => projectsService.createLabel(project.key, name.trim(), color), 'Label added').then((ok) => ok && setName(''))

  return (
    <Card>
      <Table<ProjectLabel> rowKey="id" columns={columns} dataSource={project.labels} pagination={false} locale={{ emptyText: 'No labels yet' }} />
      <Flex gap={8} style={{ marginTop: 16 }} wrap>
        <Input placeholder="New label" value={name} onChange={(e) => setName(e.target.value)} onPressEnter={add} style={{ maxWidth: 240 }} />
        {colorSelect(color, setColor)}
        <Button icon={<PlusOutlined />} disabled={!name.trim()} onClick={add}>
          Add label
        </Button>
      </Flex>
    </Card>
  )
}

const FIELD_TYPES: { value: FieldType; label: string }[] = [
  { value: 'text', label: 'Text' },
  { value: 'number', label: 'Number' },
  { value: 'date', label: 'Date' },
  { value: 'select', label: 'Single select' },
  { value: 'multi_select', label: 'Multi select' },
  { value: 'checkbox', label: 'Checkbox' },
]

export function FieldsSettings({ project, reload }: { project: ProjectDetail; reload: () => void }) {
  const run = useRun(reload)
  const [open, setOpen] = useState(false)
  const [form] = Form.useForm<{ name: string; fieldType: FieldType; options?: string[]; required?: boolean }>()
  const fieldType = Form.useWatch('fieldType', form)

  const columns: TableProps<ProjectField>['columns'] = [
    {
      title: 'Field',
      key: 'name',
      render: (_, f) => (
        <Typography.Text editable={{ onChange: (v) => v.trim() && v !== f.name && run(() => projectsService.updateField(project.key, f.id, { name: v.trim() })) }}>
          {f.name}
        </Typography.Text>
      ),
    },
    { title: 'Type', key: 'type', width: 140, render: (_, f) => <Tag>{FIELD_TYPES.find((t) => t.value === f.fieldType)?.label}</Tag> },
    {
      title: 'Options',
      key: 'options',
      render: (_, f) =>
        ['select', 'multi_select'].includes(f.fieldType) ? (
          <Select
            mode="tags"
            value={f.options}
            style={{ minWidth: 220 }}
            onChange={(options: string[]) => options.length && run(() => projectsService.updateField(project.key, f.id, { options }))}
          />
        ) : (
          <Typography.Text type="secondary">—</Typography.Text>
        ),
    },
    {
      title: 'Required',
      key: 'required',
      width: 100,
      render: (_, f) => (
        <Checkbox checked={f.required} disabled={f.fieldType === 'checkbox'} onChange={(e) => run(() => projectsService.updateField(project.key, f.id, { required: e.target.checked }))} />
      ),
    },
    {
      title: '',
      key: 'actions',
      width: 60,
      render: (_, f) => (
        <Popconfirm title={`Delete field "${f.name}"?`} description="Its value is removed from every item." okButtonProps={{ danger: true }} onConfirm={() => run(() => projectsService.deleteField(project.key, f.id), 'Field deleted')}>
          <Button type="text" danger icon={<DeleteOutlined />} />
        </Popconfirm>
      ),
    },
  ]

  return (
    <Card
      extra={
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setOpen(true)}>
          Add field
        </Button>
      }
      title="Custom fields"
    >
      <Typography.Paragraph type="secondary">Extra information captured on every work item of this project (e.g. Browser, Customer, Release).</Typography.Paragraph>
      <Table<ProjectField> rowKey="id" columns={columns} dataSource={project.fields} pagination={false} locale={{ emptyText: 'No custom fields yet' }} scroll={{ x: 640 }} />
      <Modal
        open={open}
        title="Add custom field"
        okText="Add field"
        onCancel={() => setOpen(false)}
        onOk={() =>
          form.validateFields().then((v) =>
            run(() => projectsService.createField(project.key, { ...v, options: v.options ?? [] }), 'Field added').then((ok) => {
              if (ok) {
                setOpen(false)
                form.resetFields()
              }
            }),
          )
        }
        destroyOnHidden
      >
        <Form form={form} layout="vertical" initialValues={{ fieldType: 'text', required: false }} preserve={false}>
          <Form.Item name="name" label="Name" rules={[{ required: true, max: 100 }]}>
            <Input placeholder="e.g. Browser" autoFocus />
          </Form.Item>
          <Form.Item name="fieldType" label="Type">
            <Select options={FIELD_TYPES} />
          </Form.Item>
          {['select', 'multi_select'].includes(fieldType) && (
            <Form.Item name="options" label="Options" rules={[{ required: true, type: 'array', min: 1, message: 'Add at least one option' }]}>
              <Select mode="tags" placeholder="Type an option and press Enter" />
            </Form.Item>
          )}
          {fieldType !== 'checkbox' && (
            <Form.Item name="required" valuePropName="checked">
              <Checkbox>Required on every item</Checkbox>
            </Form.Item>
          )}
        </Form>
      </Modal>
    </Card>
  )
}
