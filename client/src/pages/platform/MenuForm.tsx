import { Alert, App, Col, Form, Input, InputNumber, Modal, Row, Select, Space, Switch } from 'antd'
import { useState } from 'react'
import { Icon } from '../../components/Icon'
import { ICON_NAMES } from '../../components/icons'
import { getErrorMessage } from '../../lib/api'
import { menusService } from '../../services/platform.service'
import type { Menu, Permission } from '../../types'

interface Props {
  menu: Menu | null // null = create
  parents: Menu[]
  permissions: Permission[]
  onSaved: () => void
  onClose: () => void
}

interface MenuFormValues {
  key: string
  label: string
  path?: string
  icon?: string
  scope: 'organization' | 'platform'
  parentId?: number
  permissionId?: number
  sortOrder: number
  isActive: boolean
}

export default function MenuForm({ menu, parents, permissions, onSaved, onClose }: Props) {
  const { message } = App.useApp()
  const [form] = Form.useForm<MenuFormValues>()
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const handleFinish = async (values: MenuFormValues) => {
    setError(null)
    setSaving(true)
    const data = {
      label: values.label,
      path: values.path?.trim() || null,
      icon: values.icon ?? null,
      scope: values.scope,
      parentId: values.parentId ?? null,
      permissionId: values.permissionId ?? null,
      sortOrder: values.sortOrder,
      isActive: values.isActive,
    }
    try {
      if (menu) await menusService.update(menu.id, data)
      else await menusService.create({ ...data, key: values.key })
      message.success(`Menu "${values.label}" saved`)
      onSaved()
    } catch (err) {
      setError(getErrorMessage(err))
      setSaving(false)
    }
  }

  return (
    <Modal
      open
      width={640}
      title={menu ? `Edit "${menu.label}"` : 'New menu item'}
      okText="Save"
      confirmLoading={saving}
      onOk={() => form.submit()}
      onCancel={onClose}
    >
      {error && <Alert type="error" showIcon title={error} style={{ marginBottom: 16 }} />}
      <Form<MenuFormValues>
        form={form}
        layout="vertical"
        onFinish={handleFinish}
        initialValues={{
          key: menu?.key,
          label: menu?.label,
          path: menu?.path ?? undefined,
          icon: menu?.icon ?? undefined,
          scope: menu?.scope ?? 'organization',
          parentId: menu?.parentId ?? undefined,
          permissionId: menu?.permissionId ?? undefined,
          sortOrder: menu?.sortOrder ?? 0,
          isActive: menu?.isActive ?? true,
        }}
      >
        <Row gutter={16}>
          <Col xs={24} sm={12}>
            <Form.Item
              name="key"
              label="Key"
              rules={[{ required: true, pattern: /^[a-z][a-z0-9_]{1,49}$/, message: 'e.g. projects' }]}
            >
              <Input disabled={!!menu} placeholder="projects" />
            </Form.Item>
          </Col>
          <Col xs={24} sm={12}>
            <Form.Item name="label" label="Label" rules={[{ required: true }]}>
              <Input placeholder="Projects" />
            </Form.Item>
          </Col>
          <Col xs={24} sm={12}>
            <Form.Item
              name="path"
              label="Path"
              extra="Leave empty to make a group heading."
              rules={[{ pattern: /^\/[A-Za-z0-9\-_/]*$/, message: 'Must start with "/"' }]}
            >
              <Input placeholder="/projects" />
            </Form.Item>
          </Col>
          <Col xs={24} sm={12}>
            <Form.Item name="icon" label="Icon">
              <Select
                allowClear
                placeholder="Choose an icon"
                options={ICON_NAMES.map((name) => ({
                  value: name,
                  label: (
                    <Space>
                      <Icon name={name} />
                      {name}
                    </Space>
                  ),
                }))}
              />
            </Form.Item>
          </Col>
          <Col xs={24} sm={12}>
            <Form.Item
              name="scope"
              label="Scope"
              extra="Organization: inside an organization (by permission). Platform: platform admins only."
            >
              <Select
                options={[
                  { value: 'organization', label: 'Organization' },
                  { value: 'platform', label: 'Platform' },
                ]}
              />
            </Form.Item>
          </Col>
          <Col xs={24} sm={12}>
            <Form.Item name="parentId" label="Parent">
              <Select
                allowClear
                placeholder="Top level"
                options={parents.filter((p) => p.id !== menu?.id).map((p) => ({ value: p.id, label: p.label }))}
              />
            </Form.Item>
          </Col>
          <Col xs={24} sm={12}>
            <Form.Item name="permissionId" label="Required permission" extra="Empty = every logged-in user.">
              <Select
                allowClear
                showSearch={{ optionFilterProp: 'label' }}
                placeholder="Any logged-in user"
                options={permissions.map((p) => ({ value: p.id, label: p.name }))}
              />
            </Form.Item>
          </Col>
          <Col xs={12}>
            <Form.Item name="sortOrder" label="Sort order">
              <InputNumber min={0} max={10000} style={{ width: '100%' }} />
            </Form.Item>
          </Col>
          <Col xs={12}>
            <Form.Item name="isActive" label="Visible" valuePropName="checked">
              <Switch />
            </Form.Item>
          </Col>
        </Row>
      </Form>
    </Modal>
  )
}
