import { ReloadOutlined } from '@ant-design/icons'
import { Alert, App, Avatar, Button, Card, Flex, Input, Popconfirm, Switch, Table, Tag, Tooltip, Typography, type TableProps } from 'antd'
import { useCallback, useState } from 'react'
import { useAuth } from '../../auth/useAuth'
import { PageHeader } from '../../components/ui'
import { useFetch } from '../../hooks/useFetch'
import { getErrorMessage } from '../../lib/api'
import { platformService } from '../../services/platform.service'
import type { PlatformUser } from '../../types'

export default function PlatformUsersPage() {
  const { user: me } = useAuth()
  const { message } = App.useApp()
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [search, setSearch] = useState('')
  const users = useFetch(useCallback(() => platformService.users({ page, limit: pageSize, search }), [page, pageSize, search]))

  const update = async (u: PlatformUser, data: { isActive?: boolean; isPlatformAdmin?: boolean }, text: string) => {
    try {
      await platformService.updateUser(u.id, data)
      message.success(text)
      users.reload()
    } catch (err) {
      message.error(getErrorMessage(err))
    }
  }

  const columns: TableProps<PlatformUser>['columns'] = [
    {
      title: 'User',
      key: 'user',
      render: (_, u) => (
        <Flex align="center" gap={12}>
          <Avatar>{u.name.charAt(0).toUpperCase()}</Avatar>
          <div>
            <Typography.Text strong>{u.name}</Typography.Text>
            {u.id === me?.id && <Tag style={{ marginInlineStart: 8 }}>you</Tag>}
            <br />
            <Typography.Text type="secondary">{u.email}</Typography.Text>
          </div>
        </Flex>
      ),
    },
    {
      title: 'Organizations',
      dataIndex: 'organizations',
      render: (orgs: PlatformUser['organizations']) =>
        orgs.length ? (
          <Flex wrap gap={4}>
            {orgs.map((o) => (
              <Tooltip key={o.id} title={o.roles.join(', ')}>
                <Tag>{o.name}</Tag>
              </Tooltip>
            ))}
          </Flex>
        ) : (
          <Typography.Text type="secondary">none</Typography.Text>
        ),
    },
    {
      title: 'Last login',
      dataIndex: 'lastLoginAt',
      responsive: ['lg'],
      render: (v: string | null) => (v ? new Date(v).toLocaleString() : <Typography.Text type="secondary">Never</Typography.Text>),
    },
    {
      title: 'Platform admin',
      key: 'platformAdmin',
      render: (_, u) => (
        <Popconfirm
          title={u.isPlatformAdmin ? 'Remove platform admin access?' : 'Make platform admin?'}
          description={u.isPlatformAdmin ? undefined : 'They will see and manage ALL organizations.'}
          onConfirm={() => update(u, { isPlatformAdmin: !u.isPlatformAdmin }, 'Platform access updated')}
          disabled={u.id === me?.id}
        >
          <Switch checked={u.isPlatformAdmin} disabled={u.id === me?.id} size="small" />
        </Popconfirm>
      ),
    },
    {
      title: 'Account',
      key: 'active',
      render: (_, u) => (
        <Popconfirm
          title={u.isActive ? `Disable ${u.name}'s account?` : `Enable ${u.name}'s account?`}
          description={u.isActive ? 'They are signed out everywhere and cannot log in to any organization.' : undefined}
          okButtonProps={{ danger: u.isActive }}
          onConfirm={() => update(u, { isActive: !u.isActive }, u.isActive ? 'Account disabled' : 'Account enabled')}
          disabled={u.id === me?.id}
        >
          <Switch checked={u.isActive} checkedChildren="Active" unCheckedChildren="Disabled" disabled={u.id === me?.id} />
        </Popconfirm>
      ),
    },
  ]

  return (
    <>
      <PageHeader title="All users" description="Every account on the platform and the organizations it belongs to." />
      {users.error && <Alert type="error" showIcon title={users.error} style={{ marginBottom: 16 }} />}
      <Card>
        <Flex gap={8} style={{ marginBottom: 16 }} wrap>
          <Input.Search
            placeholder="Search by name or email"
            allowClear
            enterButton
            style={{ maxWidth: 380 }}
            onSearch={(value) => {
              setPage(1)
              setSearch(value.trim())
            }}
          />
          <Tooltip title="Refresh">
            <Button icon={<ReloadOutlined />} onClick={users.reload} />
          </Tooltip>
        </Flex>
        <Table<PlatformUser>
          rowKey="id"
          columns={columns}
          dataSource={users.data?.items}
          loading={users.loading}
          scroll={{ x: 760 }}
          pagination={{
            current: page,
            pageSize,
            total: users.data?.total,
            showSizeChanger: true,
            showTotal: (total) => `${total} users`,
            onChange: (p, size) => {
              setPage(p)
              setPageSize(size)
            },
          }}
        />
      </Card>
    </>
  )
}
