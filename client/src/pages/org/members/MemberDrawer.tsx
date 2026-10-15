import { Alert, App, Button, Checkbox, Col, Divider, Drawer, Flex, Form, Popconfirm, Row, Select, Switch, Tag, Tooltip, Typography } from 'antd'
import { useState } from 'react'
import { useAuth } from '../../../auth/useAuth'
import { PERMISSIONS, ROLES } from '../../../config/permissions'
import { getErrorMessage } from '../../../lib/api'
import { membersService } from '../../../services/organization.service'
import type { Member, Role } from '../../../types'

interface Props {
  member: Member
  roles: Role[]
  onSaved: () => void
  onClose: () => void
}

interface FormValues {
  isActive: boolean
  roleIds: number[]
}

/** Edit a member's roles and status in THIS organization (their account is global and not edited here). */
export default function MemberDrawer({ member, roles, onSaved, onClose }: Props) {
  const { user: me, can, isPlatformAdmin } = useAuth()
  const { message } = App.useApp()
  const [form] = Form.useForm<FormValues>()
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const isSelf = member.id === me?.id
  const targetIsOwner = member.roles.some((r) => r.name === ROLES.OWNER)
  const lockedForMe = targetIsOwner && !me?.isOwner
  const canEditStatus = can(PERMISSIONS.USERS_UPDATE) && !isSelf && !lockedForMe
  const canEditRoles = can(PERMISSIONS.USERS_ASSIGN_ROLES) && !isSelf && !lockedForMe

  const memberRoles = roles.filter((r) => !(r.isSystem && r.name === ROLES.GUEST))
  const [newRoleId, setNewRoleId] = useState(memberRoles.find((r) => r.name === ROLES.MEMBER)?.id)

  const makeMember = async () => {
    if (!newRoleId) return
    setError(null)
    try {
      await membersService.makeMember(member.id, [newRoleId])
      message.success(`${member.name} is now a full member`)
      onSaved()
    } catch (err) {
      setError(getErrorMessage(err))
    }
  }

  const handleFinish = async (values: FormValues) => {
    setError(null)
    setSaving(true)
    try {
      if (canEditStatus && values.isActive !== member.isActive) await membersService.setStatus(member.id, values.isActive)
      const before = member.roles.map((r) => r.id).sort().join(',')
      if (canEditRoles && !member.isGuest && before !== [...values.roleIds].sort().join(',')) await membersService.setRoles(member.id, values.roleIds)
      message.success(`${member.name} updated`)
      onSaved()
    } catch (err) {
      setError(getErrorMessage(err))
      setSaving(false)
    }
  }

  return (
    <Drawer
      open
      onClose={onClose}
      size={480}
      title={member.name}
      extra={
        <Flex gap={8}>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="primary" loading={saving} disabled={!canEditStatus && !canEditRoles} onClick={() => form.submit()}>
            Save
          </Button>
        </Flex>
      }
    >
      <Typography.Paragraph type="secondary">{member.email}</Typography.Paragraph>
      {isSelf && <Alert type="info" showIcon title="You cannot change your own roles or status." style={{ marginBottom: 16 }} />}
      {lockedForMe && <Alert type="info" showIcon title="Only an owner can manage another owner." style={{ marginBottom: 16 }} />}
      {error && <Alert type="error" showIcon title={error} style={{ marginBottom: 16 }} />}

      <Form<FormValues>
        form={form}
        layout="vertical"
        onFinish={handleFinish}
        initialValues={{ isActive: member.isActive, roleIds: member.roles.map((r) => r.id) }}
      >
        <Form.Item
          name="isActive"
          label="Status in this organization"
          valuePropName="checked"
          extra="Inactive members cannot open this organization. Their account and other organizations are unaffected."
        >
          <Switch checkedChildren="Active" unCheckedChildren="Inactive" disabled={!canEditStatus} />
        </Form.Item>

        {member.isGuest ? (
          <>
            <Typography.Title level={5}>Guest</Typography.Title>
            <Typography.Paragraph type="secondary">
              An outside collaborator: sees only these projects. Add them to another project from its Settings → Members.
            </Typography.Paragraph>
            <Flex wrap gap={4} style={{ marginBottom: 16 }}>
              {(member.guestProjects ?? []).map((p) => (
                <Tag key={p.id}>
                  {p.name} · {p.role === 'viewer' ? 'read & comment' : 'create & edit'}
                </Tag>
              ))}
            </Flex>
            {canEditRoles && (
              <>
                <Divider />
                <Typography.Title level={5}>Make full member</Typography.Title>
                <Typography.Paragraph type="secondary">
                  They join the organization with a role (and use a member seat). Their projects stay.
                </Typography.Paragraph>
                <Flex gap={8} wrap>
                  <Select
                    value={newRoleId}
                    onChange={setNewRoleId}
                    style={{ minWidth: 180 }}
                    options={memberRoles.map((r) => ({ value: r.id, label: r.displayName, disabled: r.name === ROLES.OWNER && !me?.isOwner }))}
                  />
                  <Popconfirm title={`Make ${member.name} a full member?`} onConfirm={makeMember}>
                    <Button>Make full member</Button>
                  </Popconfirm>
                </Flex>
              </>
            )}
          </>
        ) : (
        <Form.Item name="roleIds" label="Roles" rules={[{ required: true, type: 'array', min: 1, message: 'Select at least one role' }]}>
          <Checkbox.Group disabled={!canEditRoles} style={{ width: '100%' }}>
            <Row gutter={[8, 8]}>
              {memberRoles.map((role) => {
                const locked = role.name === ROLES.OWNER && !me?.isOwner
                return (
                  <Col span={12} key={role.id}>
                    <Tooltip title={locked ? 'Only an owner can grant this role' : role.description}>
                      <Checkbox value={role.id} disabled={locked}>
                        {role.displayName}
                      </Checkbox>
                    </Tooltip>
                  </Col>
                )
              })}
            </Row>
          </Checkbox.Group>
        </Form.Item>
        )}
      </Form>
      {isPlatformAdmin && (
        <Typography.Paragraph type="secondary" style={{ fontSize: '0.9em' }}>
          To disable this person&apos;s account everywhere, use Platform → All Users.
        </Typography.Paragraph>
      )}
    </Drawer>
  )
}
