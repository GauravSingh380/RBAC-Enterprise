import {
  CopyOutlined,
  DeleteOutlined,
  InfoCircleOutlined,
  LockOutlined,
  MoreOutlined,
  SearchOutlined,
  TeamOutlined,
} from '@ant-design/icons'
import {
  Affix,
  Alert,
  App,
  Avatar,
  Button,
  Card,
  Descriptions,
  Divider,
  Dropdown,
  Empty,
  Flex,
  Form,
  Input,
  Progress,
  Tabs,
  Tag,
  Tooltip,
  Typography,
  theme,
} from 'antd'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../../auth/useAuth'
import { PERMISSIONS, ROLES } from '../../../config/permissions'
import { getErrorMessage } from '../../../lib/api'
import { rolesService } from '../../../services/organization.service'
import type { Member, Permission, Role } from '../../../types'
import PermissionMatrix from './PermissionMatrix'
import { RoleAvatar } from './RoleAvatar'

interface Props {
  role: Role
  permissions: Permission[]
  /** Members of the organization (null = current user may not view members). */
  members: Member[] | null
  onSaved: () => void
  onDeleted: () => void
  onDuplicate: () => void
  onDirtyChange: (dirty: boolean) => void
}

const sameIds = (a: number[], b: number[]) => [...a].sort().join() === [...b].sort().join()

export default function RoleDetail({ role, permissions, members, onSaved, onDeleted, onDuplicate, onDirtyChange }: Props) {
  const { can, reloadProfile } = useAuth()
  const { message, modal } = App.useApp()
  const { token } = theme.useToken()

  const isOwnerRole = role.name === ROLES.OWNER
  const canUpdate = can(PERMISSIONS.ROLES_UPDATE)
  const canCreate = can(PERMISSIONS.ROLES_CREATE)
  const canDelete = can(PERMISSIONS.ROLES_DELETE) && !role.isSystem

  const [displayName, setDisplayName] = useState(role.displayName)
  const [description, setDescription] = useState(role.description ?? '')
  const [selected, setSelected] = useState<number[]>(role.permissionIds)
  const [search, setSearch] = useState('')
  const [saving, setSaving] = useState(false)

  const detailsDirty = displayName.trim() !== role.displayName || description.trim() !== (role.description ?? '')
  const permissionsDirty = !isOwnerRole && !sameIds(selected, role.permissionIds)
  const dirty = detailsDirty || permissionsDirty
  const changedCount = permissions.filter((p) => selected.includes(p.id) !== role.permissionIds.includes(p.id)).length

  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange])

  const grantedCount = isOwnerRole ? permissions.length : selected.length
  const roleMembers = useMemo(() => members?.filter((m) => m.roles.some((r) => r.id === role.id)) ?? [], [members, role.id])

  const discard = () => {
    setDisplayName(role.displayName)
    setDescription(role.description ?? '')
    setSelected(role.permissionIds)
  }

  const save = async () => {
    if (displayName.trim().length < 2) {
      message.error('Role name must be at least 2 characters')
      return
    }
    setSaving(true)
    try {
      if (detailsDirty) await rolesService.update(role.id, { displayName: displayName.trim(), description: description.trim() })
      if (permissionsDirty) await rolesService.setPermissions(role.id, selected)
      message.success(`"${displayName.trim()}" saved`)
      onDirtyChange(false)
      onSaved()
      await reloadProfile() // your own sidebar/permissions may have changed
    } catch (err) {
      message.error(getErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  const confirmDelete = () =>
    modal.confirm({
      title: `Delete the "${role.displayName}" role?`,
      icon: <DeleteOutlined style={{ color: token.colorError }} />,
      content: 'This cannot be undone.',
      okText: 'Delete role',
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await rolesService.remove(role.id)
          message.success(`Role "${role.displayName}" deleted`)
          onDeleted()
        } catch (err) {
          message.error(getErrorMessage(err))
        }
      },
    })

  const deleteDisabledReason = role.isSystem
    ? 'System roles cannot be deleted'
    : role.userCount > 0
      ? `Assigned to ${role.userCount} member(s) — reassign them first`
      : undefined

  // ------------------------------------------------------------------ tabs

  const permissionsTab = (
    <Flex vertical gap={16}>
      <Flex align="center" gap={16} wrap>
        <Flex align="center" gap={12} style={{ flex: '1 1 260px' }}>
          <Progress
            type="circle"
            size={44}
            percent={Math.round((grantedCount / Math.max(permissions.length, 1)) * 100)}
            format={() => grantedCount}
          />
          <div>
            <Typography.Text strong>
              {grantedCount} of {permissions.length} permissions
            </Typography.Text>
            <br />
            <Typography.Text type="secondary">
              {isOwnerRole ? 'Owners always have full access' : 'granted to this role'}
            </Typography.Text>
          </div>
        </Flex>
        <Input
          allowClear
          prefix={<SearchOutlined />}
          placeholder="Search permissions"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ maxWidth: 280 }}
        />
      </Flex>

      {isOwnerRole && (
        <Alert
          type="info"
          showIcon
          icon={<LockOutlined />}
          title="The Owner role always has every permission"
          description="This keeps at least one person able to manage the organization. It cannot be edited."
        />
      )}
      {!isOwnerRole && !canUpdate && (
        <Alert type="warning" showIcon title="View only" description="You need the “Edit roles and their permissions” permission to change this role." />
      )}

      <PermissionMatrix
        permissions={permissions}
        selected={selected}
        saved={role.permissionIds}
        onChange={setSelected}
        disabled={!canUpdate}
        allGranted={isOwnerRole}
        search={search}
      />
    </Flex>
  )

  const membersTab = (
    <Flex vertical gap={8}>
      {roleMembers.length === 0 ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Nobody has this role yet">
          <Link to="/org/members">
            <Button icon={<TeamOutlined />}>Assign from Members</Button>
          </Link>
        </Empty>
      ) : (
        roleMembers.map((m) => (
          <Flex
            key={m.id}
            align="center"
            gap={12}
            style={{ padding: '10px 12px', border: `1px solid ${token.colorBorderSecondary}`, borderRadius: token.borderRadius }}
          >
            <Avatar>{m.name.charAt(0).toUpperCase()}</Avatar>
            <div style={{ flex: 1, minWidth: 0 }}>
              <Typography.Text strong>{m.name}</Typography.Text>
              {!m.isActive && (
                <Tag color="error" style={{ marginInlineStart: 8 }}>
                  inactive
                </Tag>
              )}
              <br />
              <Typography.Text type="secondary">{m.email}</Typography.Text>
            </div>
            <Flex wrap gap={4} justify="flex-end">
              {m.roles
                .filter((r) => r.id !== role.id)
                .map((r) => (
                  <Tag key={r.id}>{r.displayName}</Tag>
                ))}
            </Flex>
          </Flex>
        ))
      )}
    </Flex>
  )

  const settingsTab = (
    <Flex vertical gap={24} style={{ maxWidth: 640 }}>
      <Form layout="vertical" disabled={!canUpdate}>
        <Form.Item label="Role name" required>
          <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={100} />
        </Form.Item>
        <Form.Item label="Description">
          <Input.TextArea
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            showCount
            maxLength={500}
            placeholder="What is this role for?"
          />
        </Form.Item>
      </Form>

      <Descriptions
        column={1}
        size="small"
        bordered
        items={[
          { key: 'key', label: 'Key', children: <Typography.Text code copyable>{role.name}</Typography.Text> },
          {
            key: 'type',
            label: 'Type',
            children: role.isSystem ? 'System role (from the default templates)' : 'Custom role (created in this organization)',
          },
          { key: 'id', label: 'Role ID', children: role.id },
        ]}
      />

      {!role.isSystem && can(PERMISSIONS.ROLES_DELETE) && (
        <Card size="small" title={<Typography.Text type="danger">Danger zone</Typography.Text>} style={{ borderColor: token.colorErrorBorder }}>
          <Flex justify="space-between" align="center" gap={16} wrap>
            <div>
              <Typography.Text strong>Delete this role</Typography.Text>
              <br />
              <Typography.Text type="secondary">
                {role.userCount > 0 ? `Assigned to ${role.userCount} member(s). Reassign them first.` : 'Permanently remove this custom role.'}
              </Typography.Text>
            </div>
            <Button danger icon={<DeleteOutlined />} disabled={role.userCount > 0} onClick={confirmDelete}>
              Delete role
            </Button>
          </Flex>
        </Card>
      )}
    </Flex>
  )

  return (
    <Card styles={{ body: { padding: 0 } }}>
      {/* Header */}
      <Flex align="flex-start" gap={16} style={{ padding: '20px 24px' }}>
        <RoleAvatar name={role.name} size={48} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <Flex align="center" gap={8} wrap>
            <Typography.Title level={4} style={{ margin: 0 }}>
              {role.displayName}
            </Typography.Title>
            {role.isSystem ? (
              <Tooltip title="Created from the default templates. Cannot be deleted.">
                <Tag icon={<LockOutlined />}>System</Tag>
              </Tooltip>
            ) : (
              <Tag color="magenta">Custom</Tag>
            )}
          </Flex>
          <Typography.Paragraph type="secondary" style={{ margin: '4px 0 0' }} ellipsis={{ rows: 2 }}>
            {role.description || 'No description'}
          </Typography.Paragraph>
          <Flex gap={16} style={{ marginTop: 8 }} wrap>
            <Typography.Text type="secondary">
              <TeamOutlined /> {role.userCount} {role.userCount === 1 ? 'member' : 'members'}
            </Typography.Text>
            <Typography.Text type="secondary">
              <InfoCircleOutlined /> {isOwnerRole ? 'All' : role.permissionIds.length} permissions
            </Typography.Text>
          </Flex>
        </div>
        <Dropdown
          trigger={['click']}
          placement="bottomRight"
          menu={{
            items: [
              { key: 'duplicate', icon: <CopyOutlined />, label: 'Duplicate role', disabled: !canCreate, onClick: onDuplicate },
              { type: 'divider' },
              {
                key: 'delete',
                icon: <DeleteOutlined />,
                danger: true,
                disabled: !canDelete || role.userCount > 0,
                label: deleteDisabledReason ? <Tooltip title={deleteDisabledReason}>Delete role</Tooltip> : 'Delete role',
                onClick: confirmDelete,
              },
            ],
          }}
        >
          <Button icon={<MoreOutlined />} aria-label="Role actions" />
        </Dropdown>
      </Flex>

      <Divider style={{ margin: 0 }} />

      <Tabs
        style={{ padding: '0 24px 24px' }}
        items={[
          { key: 'permissions', label: 'Permissions', children: permissionsTab },
          ...(members
            ? [{ key: 'members', label: `Members (${roleMembers.length})`, children: membersTab }]
            : []),
          { key: 'settings', label: 'Settings', children: settingsTab },
        ]}
      />

      {/* Contextual save bar — only visible with unsaved changes */}
      {dirty && canUpdate && (
        <Affix offsetBottom={16}>
          <Flex
            align="center"
            gap={12}
            wrap
            style={{
              margin: '0 16px 16px',
              padding: '12px 16px',
              borderRadius: token.borderRadiusLG,
              background: token.colorBgElevated,
              border: `1px solid ${token.colorPrimaryBorder}`,
              boxShadow: token.boxShadowSecondary,
            }}
          >
            <InfoCircleOutlined style={{ color: token.colorPrimary }} />
            <Typography.Text style={{ flex: 1 }}>
              Unsaved changes
              {permissionsDirty && (
                <Typography.Text type="secondary">
                  {' '}
                  · {changedCount} permission {changedCount === 1 ? 'change' : 'changes'}
                </Typography.Text>
              )}
              {detailsDirty && <Typography.Text type="secondary"> · name / description</Typography.Text>}
            </Typography.Text>
            <Button onClick={discard} disabled={saving}>
              Discard
            </Button>
            <Button type="primary" loading={saving} onClick={save}>
              Save changes
            </Button>
          </Flex>
        </Affix>
      )}
    </Card>
  )
}
