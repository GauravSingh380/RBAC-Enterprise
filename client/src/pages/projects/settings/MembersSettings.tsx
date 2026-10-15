import { DeleteOutlined, UserAddOutlined } from '@ant-design/icons'
import { Alert, App, Button, Card, Popconfirm, Select, Space, Table, Tag, Typography, type TableProps } from 'antd'
import { useCallback, useState } from 'react'
import { useAuth } from '../../../auth/useAuth'
import { useFetch } from '../../../hooks/useFetch'
import { getErrorMessage } from '../../../lib/api'
import { projectsService } from '../../../services/projects.service'
import type { ProjectDetail, ProjectMember, ProjectRole } from '../../../types/projects'
import { UserAvatar } from '../shared/ItemBits'

const ROLE_OPTIONS: { value: ProjectRole; label: string; description: string }[] = [
  { value: 'admin', label: 'Project admin', description: 'Settings, members, workflow' },
  { value: 'member', label: 'Member', description: 'Create and edit work items' },
  { value: 'viewer', label: 'Viewer', description: 'Read and comment' },
]

export default function MembersSettings({ project, reload }: { project: ProjectDetail; reload: () => void }) {
  const { message } = App.useApp()
  const { user } = useAuth()
  const members = useFetch(useCallback(() => projectsService.members(project.key), [project.key]))
  const candidates = useFetch(useCallback(() => projectsService.memberCandidates(project.key), [project.key]))
  const [adding, setAdding] = useState<number[]>([])
  const [addRole, setAddRole] = useState<ProjectRole>('member')

  const refresh = () => {
    members.reload()
    candidates.reload()
    reload()
  }

  const run = async (fn: () => Promise<unknown>, text: string) => {
    try {
      await fn()
      message.success(text)
      refresh()
    } catch (err) {
      message.error(getErrorMessage(err))
    }
  }

  const addMembers = async () => {
    for (const id of adding) {
      try {
        await projectsService.addMember(project.key, id, addRole)
      } catch (err) {
        message.error(getErrorMessage(err))
      }
    }
    setAdding([])
    message.success('Members added')
    refresh()
  }

  const columns: TableProps<ProjectMember>['columns'] = [
    {
      title: 'Member',
      key: 'member',
      render: (_, m) => (
        <Space>
          <UserAvatar user={m} size={28} />
          <div>
            <Typography.Text strong>{m.name}</Typography.Text>
            {m.id === user?.id && <Typography.Text type="secondary"> (you)</Typography.Text>}
            {m.isGuest && (
              <Tag color="orange" style={{ marginInlineStart: 8 }}>
                guest
              </Tag>
            )}
            <br />
            <Typography.Text type="secondary">{m.email}</Typography.Text>
          </div>
        </Space>
      ),
    },
    {
      title: 'Project role',
      key: 'role',
      width: 200,
      render: (_, m) => (
        <Select
          value={m.role}
          style={{ width: 170 }}
          onChange={(role) => run(() => projectsService.updateMember(project.key, m.id, role), `${m.name} is now ${role}`)}
          // guests can work in a project but never administer it
          options={ROLE_OPTIONS.map((r) => ({ value: r.value, label: r.label, disabled: m.isGuest && r.value === 'admin' }))}
        />
      ),
    },
    { title: 'Added', dataIndex: 'addedAt', responsive: ['md'], render: (v: string) => new Date(v).toLocaleDateString() },
    {
      title: '',
      key: 'actions',
      align: 'right',
      render: (_, m) => (
        <Popconfirm
          title={`Remove ${m.name} from the project?`}
          okText="Remove"
          okButtonProps={{ danger: true }}
          onConfirm={() => run(() => projectsService.removeMember(project.key, m.id), `${m.name} removed`)}
        >
          <Button type="text" danger icon={<DeleteOutlined />} />
        </Popconfirm>
      ),
    },
  ]

  return (
    <Card>
      {project.visibility === 'organization' && (
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
          title="This project is visible to the whole organization. Everyone can view and comment; add people here so they can create and edit work."
        />
      )}
      <Space.Compact style={{ width: '100%', marginBottom: 16 }}>
        <Select
          mode="multiple"
          allowClear
          showSearch={{ optionFilterProp: 'label' }}
          placeholder="Add people from the organization"
          value={adding}
          onChange={setAdding}
          style={{ flex: 1 }}
          loading={candidates.loading}
          options={(candidates.data ?? []).map((c) => ({ value: c.id, label: `${c.name} · ${c.email}${c.isGuest ? ' · guest' : ''}` }))}
        />
        <Select value={addRole} onChange={setAddRole} style={{ width: 150 }} options={ROLE_OPTIONS.map((r) => ({ value: r.value, label: r.label }))} />
        <Button type="primary" icon={<UserAddOutlined />} disabled={!adding.length} onClick={addMembers}>
          Add
        </Button>
      </Space.Compact>
      <Table<ProjectMember> rowKey="id" columns={columns} dataSource={members.data ?? []} loading={members.loading} pagination={false} scroll={{ x: 560 }} />
    </Card>
  )
}
