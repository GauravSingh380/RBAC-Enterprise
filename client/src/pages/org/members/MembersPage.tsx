import { DeleteOutlined, EditOutlined, ReloadOutlined, StopOutlined, UserAddOutlined } from '@ant-design/icons'
import { Alert, App, Avatar, Badge, Button, Card, Flex, Input, Popconfirm, Table, Tabs, Tag, Tooltip, Typography, type TableProps } from 'antd'
import { useCallback, useState } from 'react'
import { Can } from '../../../auth/Can'
import { useAuth } from '../../../auth/useAuth'
import { PageHeader } from '../../../components/ui'
import { PERMISSIONS } from '../../../config/permissions'
import { useFetch } from '../../../hooks/useFetch'
import { getErrorMessage } from '../../../lib/api'
import { invitationsService, membersService, organizationService, rolesService } from '../../../services/organization.service'
import type { Invitation, Member, Role } from '../../../types'
import InviteModal from './InviteModal'
import MemberDrawer from './MemberDrawer'
import { usageRows } from '../settings/planMeta'

export default function MembersPage() {
  const { user: me, organization, can } = useAuth()
  const { message } = App.useApp()
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState<Member | null>(null)
  const [inviting, setInviting] = useState(false)

  const canInvite = can(PERMISSIONS.USERS_INVITE)
  const canReadRoles = can(PERMISSIONS.ROLES_READ)
  const canEdit = can(PERMISSIONS.USERS_UPDATE) || can(PERMISSIONS.USERS_ASSIGN_ROLES)
  const canRemove = can(PERMISSIONS.USERS_REMOVE)

  const members = useFetch(useCallback(() => membersService.list({ page, limit: pageSize, search }), [page, pageSize, search]))
  const usage = useFetch(useCallback(() => organizationService.usage(), []))
  const roles = useFetch(useCallback(() => (canReadRoles ? rolesService.list() : Promise.resolve([] as Role[])), [canReadRoles]))
  const invitations = useFetch(
    useCallback(() => (canInvite ? invitationsService.listPending() : Promise.resolve([] as Invitation[])), [canInvite]),
  )

  const handleRemove = async (member: Member) => {
    try {
      await membersService.remove(member.id)
      message.success(`${member.name} removed from ${organization?.name}`)
      members.reload()
    } catch (err) {
      message.error(getErrorMessage(err))
    }
  }

  const handleRevoke = async (invitation: Invitation) => {
    try {
      await invitationsService.revoke(invitation.id)
      message.success('Invitation revoked')
      invitations.reload()
    } catch (err) {
      message.error(getErrorMessage(err))
    }
  }

  const memberColumns: TableProps<Member>['columns'] = [
    {
      title: 'Member',
      key: 'member',
      render: (_, m) => (
        <Flex align="center" gap={12}>
          <Avatar>{m.name.charAt(0).toUpperCase()}</Avatar>
          <div>
            <Typography.Text strong>{m.name}</Typography.Text>
            {m.id === me?.id && <Tag style={{ marginInlineStart: 8 }}>you</Tag>}
            <br />
            <Typography.Text type="secondary">{m.email}</Typography.Text>
          </div>
        </Flex>
      ),
    },
    {
      title: 'Roles',
      key: 'roles',
      render: (_, m) =>
        m.isGuest ? (
          <Flex wrap gap={4}>
            <Tag color="orange">Guest</Tag>
            {(m.guestProjects ?? []).map((p) => (
              <Tooltip key={p.id} title={`${p.name} · ${p.role === 'viewer' ? 'read & comment' : 'create & edit'}`}>
                <Tag>{p.key}</Tag>
              </Tooltip>
            ))}
          </Flex>
        ) : (
          <Flex wrap gap={4}>
            {m.roles.map((r) => (
              <Tag key={r.id} color={r.name === 'owner' ? 'purple' : 'blue'}>
                {r.displayName}
              </Tag>
            ))}
          </Flex>
        ),
    },
    {
      title: 'Status',
      dataIndex: 'isActive',
      render: (active: boolean) => <Badge status={active ? 'success' : 'error'} text={active ? 'Active' : 'Inactive'} />,
    },
    {
      title: 'Joined',
      dataIndex: 'joinedAt',
      responsive: ['md'],
      render: (v: string) => new Date(v).toLocaleDateString(),
    },
    {
      title: 'Last login',
      dataIndex: 'lastLoginAt',
      responsive: ['lg'],
      render: (v: string | null) => (v ? new Date(v).toLocaleString() : <Typography.Text type="secondary">Never</Typography.Text>),
    },
    {
      title: '',
      key: 'actions',
      align: 'right',
      render: (_, m) => (
        <Flex gap={4} justify="flex-end">
          {canEdit && (
            <Tooltip title="Edit roles / status">
              <Button type="text" icon={<EditOutlined />} onClick={() => setEditing(m)} />
            </Tooltip>
          )}
          {canRemove && m.id !== me?.id && (
            <Popconfirm
              title={`Remove ${m.name}?`}
              description="They lose access to this organization. Their account stays."
              okText="Remove"
              okButtonProps={{ danger: true }}
              onConfirm={() => handleRemove(m)}
            >
              <Tooltip title="Remove from organization">
                <Button type="text" danger icon={<DeleteOutlined />} />
              </Tooltip>
            </Popconfirm>
          )}
        </Flex>
      ),
    },
  ]

  const invitationColumns: TableProps<Invitation>['columns'] = [
    { title: 'Email', dataIndex: 'email' },
    {
      title: 'Role',
      key: 'role',
      render: (_, i) =>
        i.project ? (
          <Tooltip title={`Guest on ${i.project.name} · ${i.project.role === 'viewer' ? 'read & comment' : 'create & edit'}`}>
            <Tag color="orange">Guest · {i.project.key}</Tag>
          </Tooltip>
        ) : (
          <Tag color="blue">{i.role.displayName}</Tag>
        ),
    },
    { title: 'Invited by', key: 'by', render: (_, i) => i.invitedBy?.name ?? '—' },
    { title: 'Expires', dataIndex: 'expiresAt', render: (v: string) => new Date(v).toLocaleDateString() },
    {
      title: '',
      key: 'actions',
      align: 'right',
      render: (_, i) => (
        <Popconfirm title="Revoke this invitation?" okText="Revoke" okButtonProps={{ danger: true }} onConfirm={() => handleRevoke(i)}>
          <Button type="text" danger icon={<StopOutlined />}>
            Revoke
          </Button>
        </Popconfirm>
      ),
    },
  ]

  const membersTable = (
    <>
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
          <Button icon={<ReloadOutlined />} onClick={members.reload} />
        </Tooltip>
      </Flex>
      <Table<Member>
        rowKey="id"
        columns={memberColumns}
        dataSource={members.data?.items}
        loading={members.loading}
        scroll={{ x: 640 }}
        pagination={{
          current: page,
          pageSize,
          total: members.data?.total,
          showSizeChanger: true,
          showTotal: (total) => `${total} members`,
          onChange: (p, size) => {
            setPage(p)
            setPageSize(size)
          },
        }}
      />
    </>
  )

  return (
    <>
      <PageHeader help="setup-organization"
        title="Members"
        description={`People who can access ${organization?.name}, and their roles in it.`}
        actions={
          <Can permission={PERMISSIONS.USERS_INVITE}>
            <Button type="primary" icon={<UserAddOutlined />} onClick={() => setInviting(true)} disabled={!roles.data?.length}>
              Invite
            </Button>
          </Can>
        }
      />

      {members.error && <Alert type="error" showIcon title={members.error} style={{ marginBottom: 16 }} />}
      {usage.data && (
        <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
          {usageRows(usage.data)
            .filter((r) => r.kind !== 'projects')
            .map((r) => `${r.label}: ${r.text}`)
            .join(' · ')}{' '}
          on the {usage.data.plan.name} plan (pending invitations included)
        </Typography.Text>
      )}

      <Card>
        {canInvite ? (
          <Tabs
            items={[
              { key: 'members', label: 'Members', children: membersTable },
              {
                key: 'invitations',
                label: (
                  <span>
                    Pending invitations <Badge count={invitations.data?.length ?? 0} showZero color="gray" size="small" />
                  </span>
                ),
                children: (
                  <Table<Invitation>
                    rowKey="id"
                    columns={invitationColumns}
                    dataSource={invitations.data ?? []}
                    loading={invitations.loading}
                    pagination={false}
                    scroll={{ x: 560 }}
                  />
                ),
              },
            ]}
          />
        ) : (
          membersTable
        )}
      </Card>

      {editing && (
        <MemberDrawer
          key={editing.id}
          member={editing}
          roles={roles.data ?? []}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            members.reload()
            usage.reload()
          }}
        />
      )}

      {inviting && (
        <InviteModal
          roles={roles.data ?? []}
          onClose={() => setInviting(false)}
          onInvited={() => {
            invitations.reload()
            usage.reload()
          }}
        />
      )}
    </>
  )
}
