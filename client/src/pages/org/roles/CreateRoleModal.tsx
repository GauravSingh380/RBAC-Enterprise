import { App, Form, Input, Modal, Select, Space, Typography } from 'antd'
import { useState } from 'react'
import { getErrorMessage } from '../../../lib/api'
import { rolesService } from '../../../services/organization.service'
import type { Role } from '../../../types'
import { RoleAvatar } from './RoleAvatar'

interface Props {
  roles: Role[]
  /** Pre-select a role to copy permissions from ("Duplicate role"). */
  copyFromId?: number
  onClose: () => void
  onCreated: (role: Role) => void
}

interface FormValues {
  displayName: string
  name: string
  description?: string
  copyFromId?: number
}

const toKey = (text: string) =>
  text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/^(\d)/, 'r_$1')

export default function CreateRoleModal({ roles, copyFromId, onClose, onCreated }: Props) {
  const { message } = App.useApp()
  const [form] = Form.useForm<FormValues>()
  const [saving, setSaving] = useState(false)
  const source = roles.find((r) => r.id === copyFromId)

  const handleFinish = async (values: FormValues) => {
    setSaving(true)
    try {
      const copyFrom = roles.find((r) => r.id === values.copyFromId)
      const role = await rolesService.create({
        name: values.name,
        displayName: values.displayName,
        description: values.description,
        permissionIds: copyFrom?.permissionIds,
      })
      message.success(`Role "${role.displayName}" created`)
      onCreated(role)
    } catch (err) {
      message.error(getErrorMessage(err))
      setSaving(false)
    }
  }

  return (
    <Modal
      open
      title={source ? `Duplicate "${source.displayName}"` : 'Create a custom role'}
      okText="Create role"
      confirmLoading={saving}
      onOk={() => form.submit()}
      onCancel={onClose}
      width={520}
    >
      <Typography.Paragraph type="secondary">
        Custom roles let you give people exactly the access they need. You can fine-tune permissions after creating it.
      </Typography.Paragraph>
      <Form<FormValues>
        form={form}
        layout="vertical"
        onFinish={handleFinish}
        requiredMark="optional"
        initialValues={{
          copyFromId,
          displayName: source ? `${source.displayName} (copy)` : undefined,
          name: source ? `${source.name}_copy` : undefined,
          description: source?.description ?? undefined,
        }}
      >
        <Form.Item name="displayName" label="Role name" rules={[{ required: true, min: 2, max: 100 }]}>
          <Input
            placeholder="e.g. Project Manager"
            autoFocus
            onChange={(e) => form.setFieldValue('name', toKey(e.target.value))}
          />
        </Form.Item>
        <Form.Item
          name="name"
          label="Key"
          tooltip="Used in code and the API. Cannot be changed later."
          rules={[{ required: true, pattern: /^[a-z][a-z0-9_]{1,49}$/, message: 'Lowercase letters, numbers and _ (e.g. project_manager)' }]}
        >
          <Input placeholder="project_manager" />
        </Form.Item>
        <Form.Item name="description" label="Description" rules={[{ max: 500 }]}>
          <Input.TextArea rows={2} placeholder="What is this role for?" showCount maxLength={500} />
        </Form.Item>
        <Form.Item name="copyFromId" label="Start with permissions from">
          <Select
            allowClear
            placeholder="No permissions (start empty)"
            options={roles.map((r) => ({
              value: r.id,
              label: (
                <Space>
                  <RoleAvatar name={r.name} size={20} />
                  {r.displayName}
                  <Typography.Text type="secondary">· {r.permissionIds.length} permissions</Typography.Text>
                </Space>
              ),
            }))}
          />
        </Form.Item>
      </Form>
    </Modal>
  )
}
