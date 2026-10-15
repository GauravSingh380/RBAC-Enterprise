// /platform/plans — plans and their limits (members, guests, active projects). Empty limit = unlimited.
// Organizations are moved between plans in Platform → Organizations. Limits are enforced by the server.
import { DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons'
import { Alert, App, Button, Card, Col, Form, Input, InputNumber, Modal, Popconfirm, Row, Space, Table, Tag, Tooltip, Typography, type TableProps } from 'antd'
import { useCallback, useState } from 'react'
import { PageHeader } from '../../components/ui'
import { useFetch } from '../../hooks/useFetch'
import { getErrorMessage } from '../../lib/api'
import { plansService, type PlanInput } from '../../services/platform.service'
import type { Plan } from '../../types'

const limit = (v: number | null) => (v === null ? <Tag>unlimited</Tag> : v)

export default function PlansPage() {
  const { message } = App.useApp()
  const plans = useFetch(useCallback(() => plansService.list(), []))
  const [editing, setEditing] = useState<Plan | 'new' | null>(null)

  const remove = async (p: Plan) => {
    try {
      await plansService.remove(p.key)
      message.success(`Plan "${p.name}" deleted`)
      plans.reload()
    } catch (err) {
      message.error(getErrorMessage(err))
    }
  }

  const columns: TableProps<Plan>['columns'] = [
    {
      title: 'Plan',
      key: 'plan',
      render: (_, p) => (
        <div>
          <Typography.Text strong>{p.name}</Typography.Text> <Typography.Text code>{p.key}</Typography.Text>
          {p.description && (
            <Typography.Text type="secondary" style={{ display: 'block', fontSize: '0.85em' }}>
              {p.description}
            </Typography.Text>
          )}
        </div>
      ),
    },
    { title: 'Members', dataIndex: 'maxMembers', render: limit },
    { title: 'Guests', dataIndex: 'maxGuests', render: limit },
    { title: 'Active projects', dataIndex: 'maxProjects', render: limit },
    { title: 'Organizations', dataIndex: 'organizations', responsive: ['md'] },
    {
      title: '',
      key: 'actions',
      align: 'right',
      render: (_, p) => (
        <Space size={0}>
          <Tooltip title="Edit">
            <Button type="text" icon={<EditOutlined />} aria-label={`Edit ${p.name}`} onClick={() => setEditing(p)} />
          </Tooltip>
          <Popconfirm
            title={`Delete the plan "${p.name}"?`}
            description={p.organizations ? 'Move its organizations to another plan first.' : undefined}
            okButtonProps={{ danger: true, disabled: p.organizations > 0 }}
            onConfirm={() => remove(p)}
          >
            <Button type="text" danger icon={<DeleteOutlined />} aria-label={`Delete ${p.name}`} />
          </Popconfirm>
        </Space>
      ),
    },
  ]

  return (
    <>
      <PageHeader
        title="Plans"
        description="What each plan includes. Organizations can't grow past their plan; nothing is removed when they are over it."
        actions={
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setEditing('new')}>
            New plan
          </Button>
        }
      />
      {plans.error && <Alert type="error" showIcon title={plans.error} style={{ marginBottom: 16 }} />}
      <Card>
        <Table<Plan> rowKey="key" columns={columns} dataSource={plans.data ?? []} loading={plans.loading} pagination={false} scroll={{ x: 640 }} />
        <Typography.Paragraph type="secondary" style={{ marginTop: 16, marginBottom: 0 }}>
          Members and guests include pending invitations. Archived projects don&apos;t count. Change an organization&apos;s plan in
          Platform → Organizations.
        </Typography.Paragraph>
      </Card>
      {editing && (
        <PlanModal
          plan={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            plans.reload()
          }}
        />
      )}
    </>
  )
}

type FormValues = Omit<PlanInput, 'sortOrder'> & { sortOrder?: number }

function PlanModal({ plan, onClose, onSaved }: { plan: Plan | null; onClose: () => void; onSaved: () => void }) {
  const { message } = App.useApp()
  const [form] = Form.useForm<FormValues>()
  const [saving, setSaving] = useState(false)

  const save = async () => {
    const v = await form.validateFields()
    // an empty number box = unlimited
    const data = { ...v, maxMembers: v.maxMembers ?? null, maxGuests: v.maxGuests ?? null, maxProjects: v.maxProjects ?? null, description: v.description || null }
    setSaving(true)
    try {
      if (plan) {
        // the key can't change
        await plansService.update(plan.key, { name: data.name, description: data.description, maxMembers: data.maxMembers, maxGuests: data.maxGuests, maxProjects: data.maxProjects })
      } else {
        await plansService.create(data)
      }
      message.success('Plan saved')
      onSaved()
    } catch (err) {
      message.error(getErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open title={plan ? `Edit ${plan.name}` : 'New plan'} onCancel={onClose} onOk={save} okText="Save" confirmLoading={saving} destroyOnHidden>
      <Form form={form} layout="vertical" initialValues={plan ?? { maxMembers: 10, maxGuests: 5, maxProjects: 5 }} requiredMark="optional">
        <Row gutter={16}>
          <Col span={14}>
            <Form.Item name="name" label="Name" rules={[{ required: true, max: 60 }]}>
              <Input autoFocus />
            </Form.Item>
          </Col>
          <Col span={10}>
            <Form.Item
              name="key"
              label="Key"
              tooltip="Stored on each organization; can't be changed later"
              rules={[{ required: true }, { pattern: /^[a-z0-9][a-z0-9_-]{0,29}$/, message: 'Lowercase letters, digits, - and _' }]}
            >
              <Input disabled={!!plan} />
            </Form.Item>
          </Col>
        </Row>
        <Form.Item name="description" label="Description" rules={[{ max: 300 }]}>
          <Input />
        </Form.Item>
        <Typography.Text type="secondary">Leave a limit empty for unlimited.</Typography.Text>
        <Row gutter={16} style={{ marginTop: 8 }}>
          <Col xs={24} sm={8}>
            <Form.Item name="maxMembers" label="Members">
              <InputNumber min={1} style={{ width: '100%' }} placeholder="unlimited" />
            </Form.Item>
          </Col>
          <Col xs={24} sm={8}>
            <Form.Item name="maxGuests" label="Guests">
              <InputNumber min={0} style={{ width: '100%' }} placeholder="unlimited" />
            </Form.Item>
          </Col>
          <Col xs={24} sm={8}>
            <Form.Item name="maxProjects" label="Active projects">
              <InputNumber min={0} style={{ width: '100%' }} placeholder="unlimited" />
            </Form.Item>
          </Col>
        </Row>
      </Form>
    </Modal>
  )
}
