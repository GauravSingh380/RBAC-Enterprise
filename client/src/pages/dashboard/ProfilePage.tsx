import { LogoutOutlined } from '@ant-design/icons'
import { App, Avatar, Button, Card, Col, Descriptions, Flex, Popconfirm, Row, Tag, Typography, theme } from 'antd'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../auth/useAuth'
import { PageHeader } from '../../components/ui'
import { ChangePasswordCard, EditNameCard } from './AccountSecurity'
import { getErrorMessage } from '../../lib/api'

export default function ProfilePage() {
  const { user, organization, logoutAll } = useAuth()
  const { message } = App.useApp()
  const { token } = theme.useToken()
  const navigate = useNavigate()

  const handleLogoutAll = async () => {
    try {
      await logoutAll()
      navigate('/login', { replace: true })
    } catch (err) {
      message.error(getErrorMessage(err))
    }
  }

  if (!user) return null

  // Group permissions by module for easier reading
  const byModule = user.permissions.reduce<Record<string, string[]>>((acc, p) => {
    const [module] = p.split('.')
    ;(acc[module] ??= []).push(p)
    return acc
  }, {})

  return (
    <>
      <PageHeader title="My account" description="Your profile, access and sessions." />

      <Row gutter={[20, 20]}>
        <Col xs={24} lg={10}>
          <Card>
            <Flex align="center" gap={16} style={{ marginBottom: 20 }}>
              <Avatar size={64} style={{ background: token.colorPrimary, fontSize: 28 }}>
                {user.name.charAt(0).toUpperCase()}
              </Avatar>
              <div>
                <Typography.Title level={4} style={{ margin: 0 }}>
                  {user.name}
                </Typography.Title>
                <Typography.Text type="secondary">{user.email}</Typography.Text>
              </div>
            </Flex>
            <Descriptions
              column={1}
              size="small"
              items={[
                ...(user.isPlatformAdmin
                  ? [{ key: 'platform', label: 'Platform', children: <Tag color="purple">platform admin</Tag> }]
                  : []),
                {
                  key: 'organizations',
                  label: 'Organizations',
                  children: (
                    <Flex vertical gap={4}>
                      {user.organizations.map((o) => (
                        <span key={o.id}>
                          <Typography.Text strong={o.id === organization?.id}>{o.name}</Typography.Text>{' '}
                          <Typography.Text type="secondary">({o.roles.join(', ')})</Typography.Text>
                        </span>
                      ))}
                    </Flex>
                  ),
                },
                {
                  key: 'roles',
                  label: 'Roles here',
                  children: (
                    <Flex wrap gap={4}>
                      {user.roles.map((r) => (
                        <Tag key={r} color={r === 'owner' ? 'purple' : 'blue'}>
                          {r}
                        </Tag>
                      ))}
                    </Flex>
                  ),
                },
                { key: 'perms', label: 'Permissions', children: user.permissions.length },
              ]}
            />
          </Card>

          <Card title="Security" style={{ marginTop: 20 }}>
            <Typography.Paragraph type="secondary">
              Signed in somewhere you don&apos;t recognise? End every session at once.
            </Typography.Paragraph>
            <Popconfirm
              title="Sign out everywhere?"
              description="You will be signed out from every device, including this one."
              okText="Sign out all"
              okButtonProps={{ danger: true }}
              onConfirm={handleLogoutAll}
            >
              <Button danger icon={<LogoutOutlined />}>
                Sign out of all devices
              </Button>
            </Popconfirm>
          </Card>

          <EditNameCard />
          <ChangePasswordCard />
        </Col>

        <Col xs={24} lg={14}>
          <Card title={`What you can do in ${organization?.name ?? 'this organization'}`}>
            <Descriptions
              column={1}
              bordered
              size="small"
              items={Object.entries(byModule).map(([module, perms]) => ({
                key: module,
                label: <span style={{ textTransform: 'capitalize' }}>{module}</span>,
                children: (
                  <Flex wrap gap={4}>
                    {perms.map((p) => (
                      <Tag key={p}>{p.split('.')[1]}</Tag>
                    ))}
                  </Flex>
                ),
              }))}
            />
          </Card>
        </Col>
      </Row>
    </>
  )
}
