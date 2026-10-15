// Roles & Access — role list (left) + role detail with permissions / members / settings (right).
// The selected role is kept in the URL (?role=12) so the page can be shared or refreshed.
import { PlusOutlined, SearchOutlined, TeamOutlined } from '@ant-design/icons'
import { Alert, App, Badge, Button, Card, Col, Empty, Flex, Input, Row, Skeleton, Typography, theme } from 'antd'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useBlocker, useSearchParams } from 'react-router-dom'
import { Can } from '../../../auth/Can'
import { useAuth } from '../../../auth/useAuth'
import { PageHeader } from '../../../components/ui'
import { PERMISSIONS } from '../../../config/permissions'
import { useFetch } from '../../../hooks/useFetch'
import { membersService, permissionsService, rolesService } from '../../../services/organization.service'
import type { Member, Role } from '../../../types'
import CreateRoleModal from './CreateRoleModal'
import { RoleAvatar } from './RoleAvatar'
import RoleDetail from './RoleDetail'

function RoleListItem({ role, active, onClick }: { role: Role; active: boolean; onClick: () => void }) {
  const { token } = theme.useToken()
  return (
    <Flex
      role="button"
      tabIndex={0}
      align="center"
      gap={12}
      onClick={onClick}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onClick()}
      style={{
        padding: '10px 12px',
        borderRadius: token.borderRadius,
        cursor: 'pointer',
        background: active ? token.colorPrimaryBg : undefined,
        border: `1px solid ${active ? token.colorPrimaryBorder : 'transparent'}`,
        transition: 'background 0.2s, border-color 0.2s',
      }}
    >
      <RoleAvatar name={role.name} size={34} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <Typography.Text strong style={{ color: active ? token.colorPrimary : undefined }}>
          {role.displayName}
        </Typography.Text>
        <Typography.Text type="secondary" ellipsis style={{ display: 'block', fontSize: '0.85em' }}>
          {role.description || role.name}
        </Typography.Text>
      </div>
      <Flex align="center" gap={4} style={{ color: token.colorTextSecondary, fontSize: '0.85em' }}>
        <TeamOutlined />
        {role.userCount}
      </Flex>
    </Flex>
  )
}

export default function RolesPage() {
  const { can, organization } = useAuth()
  const { modal } = App.useApp()
  const [params, setParams] = useSearchParams()
  const [search, setSearch] = useState('')
  const [creating, setCreating] = useState<{ copyFromId?: number } | null>(null)
  const [dirty, setDirty] = useState(false)

  const canReadMembers = can(PERMISSIONS.USERS_READ)
  const roles = useFetch(useCallback(() => rolesService.list(), []))
  const permissions = useFetch(useCallback(() => permissionsService.list(), []))
  const members = useFetch(
    useCallback(
      () => (canReadMembers ? membersService.list({ limit: 100 }).then((r) => r.items) : Promise.resolve(null as Member[] | null)),
      [canReadMembers],
    ),
  )

  const selectedId = Number(params.get('role')) || null
  const selected = roles.data?.find((r) => r.id === selectedId) ?? roles.data?.[0] ?? null

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    const list = (roles.data ?? []).filter(
      (r) => !term || r.displayName.toLowerCase().includes(term) || r.name.includes(term) || (r.description ?? '').toLowerCase().includes(term),
    )
    return { system: list.filter((r) => r.isSystem), custom: list.filter((r) => !r.isSystem) }
  }, [roles.data, search])

  const handleDirtyChange = useCallback((value: boolean) => setDirty(value), [])

  // Warn before leaving a role with unsaved changes
  const guard = (action: () => void) => {
    if (!dirty) return action()
    modal.confirm({
      title: 'Discard unsaved changes?',
      content: 'Your changes to this role have not been saved.',
      okText: 'Discard',
      okButtonProps: { danger: true },
      onOk: () => {
        setDirty(false)
        action()
      },
    })
  }

  // Also protect against leaving the page (sidebar links, back button, closing the tab)
  const blocker = useBlocker(({ currentLocation, nextLocation }) => dirty && currentLocation.pathname !== nextLocation.pathname)
  useEffect(() => {
    if (blocker.state !== 'blocked') return
    modal.confirm({
      title: 'Leave without saving?',
      content: 'Your changes to this role will be lost.',
      okText: 'Leave page',
      okButtonProps: { danger: true },
      onOk: () => blocker.proceed(),
      onCancel: () => blocker.reset(),
    })
  }, [blocker, modal])

  useEffect(() => {
    if (!dirty) return
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [dirty])

  const selectRole = (id: number) => guard(() => setParams({ role: String(id) }, { replace: true }))

  const renderGroup = (title: string, list: Role[]) =>
    list.length > 0 && (
      <div>
        <Typography.Text type="secondary" style={{ fontSize: '0.78em', textTransform: 'uppercase', letterSpacing: '0.06em', padding: '0 12px' }}>
          {title} · {list.length}
        </Typography.Text>
        <Flex vertical gap={2} style={{ marginTop: 6 }}>
          {list.map((role) => (
            <RoleListItem key={role.id} role={role} active={selected?.id === role.id} onClick={() => selectRole(role.id)} />
          ))}
        </Flex>
      </div>
    )

  const error = roles.error ?? permissions.error

  return (
    <>
      <PageHeader help="roles-and-permissions"
        title="Roles & Access"
        description={`Control what each role can do in ${organization?.name}. Changes apply immediately to everyone with the role.`}
        actions={
          <Can permission={PERMISSIONS.ROLES_CREATE}>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => guard(() => setCreating({}))}>
              New role
            </Button>
          </Can>
        }
      />

      {error && <Alert type="error" showIcon title={error} style={{ marginBottom: 16 }} />}

      {!roles.data || !permissions.data ? (
        <Row gutter={[20, 20]}>
          <Col xs={24} lg={8} xl={7}>
            <Card>
              <Skeleton active avatar paragraph={{ rows: 6 }} />
            </Card>
          </Col>
          <Col xs={24} lg={16} xl={17}>
            <Card>
              <Skeleton active avatar paragraph={{ rows: 10 }} />
            </Card>
          </Col>
        </Row>
      ) : (
        <Row gutter={[20, 20]} align="top">
          {/* Role list */}
          <Col xs={24} lg={8} xl={7}>
            <Card
              styles={{ body: { padding: 12 } }}
              style={{ position: 'sticky', top: 80 }}
              title={
                <Flex align="center" gap={8}>
                  Roles <Badge count={roles.data.length} color="gray" />
                </Flex>
              }
            >
              <Input
                allowClear
                prefix={<SearchOutlined />}
                placeholder="Search roles"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{ marginBottom: 12 }}
              />
              <Flex vertical gap={16}>
                {renderGroup('Custom roles', filtered.custom)}
                {renderGroup('System roles', filtered.system)}
                {filtered.system.length + filtered.custom.length === 0 && (
                  <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No roles match" />
                )}
              </Flex>
            </Card>
          </Col>

          {/* Role detail */}
          <Col xs={24} lg={16} xl={17}>
            {selected && (
              <RoleDetail
                key={`${selected.id}-${selected.permissionIds.join()}-${selected.displayName}-${selected.description}`}
                role={selected}
                permissions={permissions.data}
                members={members.data ?? null}
                onDirtyChange={handleDirtyChange}
                onSaved={roles.reload}
                onDuplicate={() => setCreating({ copyFromId: selected.id })}
                onDeleted={() => {
                  setDirty(false)
                  setParams({}, { replace: true })
                  roles.reload()
                }}
              />
            )}
          </Col>
        </Row>
      )}

      {creating && roles.data && (
        <CreateRoleModal
          roles={roles.data}
          copyFromId={creating.copyFromId}
          onClose={() => setCreating(null)}
          onCreated={(role) => {
            setCreating(null)
            setParams({ role: String(role.id) }, { replace: true })
            roles.reload()
          }}
        />
      )}
    </>
  )
}
