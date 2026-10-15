import { DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons'
import { Alert, App, Badge, Button, Card, Flex, Popconfirm, Space, Table, Tag, Tooltip, Typography, type TableProps } from 'antd'
import { useCallback, useMemo, useState } from 'react'
import { useAuth } from '../../auth/useAuth'
import { Icon } from '../../components/Icon'
import { PageHeader } from '../../components/ui'
import { PERMISSIONS } from '../../config/permissions'
import { useFetch } from '../../hooks/useFetch'
import { getErrorMessage } from '../../lib/api'
import { menusService, permissionsService } from '../../services/platform.service'
import type { Menu, Permission } from '../../types'
import MenuForm from './MenuForm'

type MenuRow = Menu & { children?: MenuRow[] }

export default function MenusPage() {
  const { can, reloadProfile } = useAuth()
  const { message } = App.useApp()
  const canReadPermissions = can(PERMISSIONS.ROLES_READ)
  const menus = useFetch(useCallback(() => menusService.list(), []))
  const permissions = useFetch(
    useCallback(() => (canReadPermissions ? permissionsService.list() : Promise.resolve([] as Permission[])), [canReadPermissions]),
  )
  const [editing, setEditing] = useState<Menu | 'new' | null>(null)

  // Build a tree for the table (parents with their children)
  const tree = useMemo<MenuRow[]>(() => {
    const all = menus.data ?? []
    return all
      .filter((m) => m.parentId === null)
      .map((parent) => {
        const children = all.filter((m) => m.parentId === parent.id)
        return children.length ? { ...parent, children } : parent
      })
  }, [menus.data])

  const refreshAll = async () => {
    menus.reload()
    await reloadProfile() // update the sidebar right away
  }

  const handleDelete = async (menu: Menu) => {
    try {
      await menusService.remove(menu.id)
      message.success(`Menu "${menu.label}" deleted`)
      await refreshAll()
    } catch (err) {
      message.error(getErrorMessage(err))
    }
  }

  const columns: TableProps<MenuRow>['columns'] = [
    {
      title: 'Label',
      dataIndex: 'label',
      render: (label: string, menu) => (
        <Space>
          <Icon name={menu.icon} />
          <Typography.Text strong={!menu.path}>{label}</Typography.Text>
        </Space>
      ),
    },
    {
      title: 'Path',
      dataIndex: 'path',
      render: (path: string | null) => (path ? <Typography.Text code>{path}</Typography.Text> : <Tag>group</Tag>),
    },
    {
      title: 'Scope',
      dataIndex: 'scope',
      render: (scope: string) => <Tag color={scope === 'platform' ? 'purple' : 'blue'}>{scope}</Tag>,
    },
    {
      title: 'Permission',
      dataIndex: 'permission',
      responsive: ['md'],
      render: (p: string | null) => (p ? <Tag color="geekblue">{p}</Tag> : <Typography.Text type="secondary">—</Typography.Text>),
    },
    { title: 'Order', dataIndex: 'sortOrder', width: 80, responsive: ['sm'] },
    {
      title: 'Status',
      dataIndex: 'isActive',
      render: (active: boolean) => <Badge status={active ? 'success' : 'default'} text={active ? 'Visible' : 'Hidden'} />,
    },
    {
      title: '',
      key: 'actions',
      align: 'right',
      render: (_, menu) => (
        <Flex gap={4} justify="flex-end">
          <Tooltip title="Edit">
            <Button type="text" icon={<EditOutlined />} onClick={() => setEditing(menu)} />
          </Tooltip>
          <Popconfirm
            title={`Delete "${menu.label}"?`}
            description={menu.path ? undefined : 'All items inside this group will be deleted too.'}
            okText="Delete"
            okButtonProps={{ danger: true }}
            onConfirm={() => handleDelete(menu)}
          >
            <Tooltip title="Delete">
              <Button type="text" danger icon={<DeleteOutlined />} />
            </Tooltip>
          </Popconfirm>
        </Flex>
      ),
    },
  ]

  return (
    <>
      <PageHeader
        title="Menus"
        description="Product-wide sidebar for every organization (and the platform section). Set labels, order, icons and the permission needed."
        actions={
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setEditing('new')}>
            New menu item
          </Button>
        }
      />
      {menus.error && <Alert type="error" showIcon title={menus.error} style={{ marginBottom: 16 }} />}
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        title={
          <>
            A menu only controls visibility. New pages also need a route in <code>client/src/router.tsx</code>.
          </>
        }
      />

      <Card>
        <Table<MenuRow>
          rowKey="id"
          columns={columns}
          dataSource={tree}
          loading={menus.loading}
          pagination={false}
          expandable={{ defaultExpandAllRows: true }}
          scroll={{ x: 560 }}
        />
      </Card>

      {editing && (
        <MenuForm
          key={editing === 'new' ? 'new' : editing.id}
          menu={editing === 'new' ? null : editing}
          parents={(menus.data ?? []).filter((m) => m.parentId === null)}
          permissions={permissions.data ?? []}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null)
            await refreshAll()
          }}
        />
      )}
    </>
  )
}
