// Header dropdown: shows the active organization, lets the user switch between
// their organizations, or create a new one (self-serve).
import { CheckOutlined, DownOutlined, PlusOutlined } from '@ant-design/icons'
import { App, Avatar, Button, Dropdown, Flex, Form, Input, Modal, Tag, Typography, theme, type MenuProps } from 'antd'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import { getErrorMessage } from '../lib/api'

function OrgAvatar({ name, size = 24 }: { name: string; size?: number }) {
  const { token } = theme.useToken()
  return (
    <Avatar shape="square" size={size} style={{ background: token.colorPrimary, flexShrink: 0, fontSize: size * 0.5 }}>
      {name.charAt(0).toUpperCase()}
    </Avatar>
  )
}

export function OrganizationSwitcher({ compact = false }: { compact?: boolean }) {
  const { user, organization, switchOrganization, createOrganization } = useAuth()
  const { message } = App.useApp()
  const navigate = useNavigate()
  const [creating, setCreating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form] = Form.useForm<{ name: string }>()

  if (!user) return null

  const handleSwitch = async (organizationId: number) => {
    if (organizationId === organization?.id) return
    try {
      await switchOrganization(organizationId)
      navigate('/dashboard')
      message.success('Switched organization')
    } catch (err) {
      message.error(getErrorMessage(err))
    }
  }

  const handleCreate = async ({ name }: { name: string }) => {
    setSaving(true)
    try {
      await createOrganization(name)
      setCreating(false)
      form.resetFields()
      navigate('/dashboard')
      message.success(`Organization "${name}" created`)
    } catch (err) {
      message.error(getErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  const items: MenuProps['items'] = [
    { type: 'group', label: 'Your organizations' },
    ...user.organizations.map((org) => ({
      key: String(org.id),
      icon: <OrgAvatar name={org.name} size={22} />,
      label: (
        <Flex justify="space-between" align="center" gap={16} style={{ minWidth: 220 }}>
          <span>
            <Typography.Text strong={org.id === organization?.id}>{org.name}</Typography.Text>
            <br />
            <Typography.Text type="secondary" style={{ fontSize: '0.85em' }}>
              {org.roles.join(', ') || 'member'}
            </Typography.Text>
          </span>
          {org.id === organization?.id && <CheckOutlined />}
        </Flex>
      ),
      onClick: () => handleSwitch(org.id),
    })),
    { type: 'divider' },
    { key: 'new', icon: <PlusOutlined />, label: 'Create organization', onClick: () => setCreating(true) },
  ]

  return (
    <>
      <Dropdown menu={{ items }} trigger={['click']} placement="bottomLeft">
        <Button type="text" style={{ height: 'auto', paddingBlock: 4 }}>
          <Flex align="center" gap={8}>
            {organization ? (
              <>
                <OrgAvatar name={organization.name} />
                {!compact && <Typography.Text strong>{organization.name}</Typography.Text>}
                {!compact && organization.plan !== 'free' && <Tag color="gold">{organization.plan}</Tag>}
              </>
            ) : (
              <Typography.Text type="secondary">No organization</Typography.Text>
            )}
            <DownOutlined style={{ fontSize: 10 }} />
          </Flex>
        </Button>
      </Dropdown>

      <Modal
        title="Create a new organization"
        open={creating}
        okText="Create"
        confirmLoading={saving}
        onOk={() => form.submit()}
        onCancel={() => setCreating(false)}
        destroyOnHidden
      >
        <Typography.Paragraph type="secondary">
          You will be the owner. Its members, roles and data are completely separate from your other organizations.
        </Typography.Paragraph>
        <Form form={form} layout="vertical" onFinish={handleCreate} preserve={false}>
          <Form.Item name="name" label="Organization name" rules={[{ required: true, min: 2, max: 100 }]}>
            <Input placeholder="Acme Inc" autoFocus />
          </Form.Item>
        </Form>
      </Modal>
    </>
  )
}
