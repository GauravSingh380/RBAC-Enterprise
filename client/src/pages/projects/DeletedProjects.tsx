// Projects → Trash (organization project admins): deleted projects, restorable for 30 days (they come back archived).
import { DeleteOutlined, RollbackOutlined } from '@ant-design/icons'
import { Alert, App, Avatar, Button, Card, Empty, Popconfirm, Space, Table, Typography, type TableProps } from 'antd'
import { useCallback } from 'react'
import { useFetch } from '../../hooks/useFetch'
import { getErrorMessage } from '../../lib/api'
import { trashService } from '../../services/workspace.service'
import type { DeletedProject } from '../../types/workspace'

export function DeletedProjects() {
  const { message } = App.useApp()
  const projects = useFetch(useCallback(() => trashService.deletedProjects(), []))

  const run = async (fn: () => Promise<unknown>, text: string) => {
    try {
      await fn()
      message.success(text)
      projects.reload()
    } catch (err) {
      message.error(getErrorMessage(err))
    }
  }

  const columns: TableProps<DeletedProject>['columns'] = [
    {
      title: 'Project',
      key: 'p',
      render: (_, p) => (
        <Space>
          <Avatar shape="square" size="small" style={{ background: p.color ?? undefined }}>
            {p.key.slice(0, 2)}
          </Avatar>
          <div>
            <Typography.Text strong>{p.name}</Typography.Text> <Typography.Text type="secondary">{p.key}</Typography.Text>
            <Typography.Text type="secondary" style={{ display: 'block', fontSize: '0.85em' }}>
              {p.itemCount} item(s)
            </Typography.Text>
          </div>
        </Space>
      ),
    },
    {
      title: 'Deleted',
      key: 'd',
      render: (_, p) => (
        <div>
          {new Date(p.deletedAt).toLocaleString()}
          <Typography.Text type="secondary" style={{ display: 'block', fontSize: '0.85em' }}>
            {p.deletedBy ? `by ${p.deletedBy.name} · ` : ''}removed for good on {new Date(p.purgeAt).toLocaleDateString()}
          </Typography.Text>
        </div>
      ),
    },
    {
      title: '',
      key: 'a',
      align: 'right',
      render: (_, p) => (
        <Space size={0}>
          <Button type="text" icon={<RollbackOutlined />} onClick={() => run(() => trashService.restoreProject(p.id), `${p.name} restored (archived)`)}>
            Restore
          </Button>
          <Popconfirm
            title={`Delete ${p.name} for good?`}
            description="All its items, docs, comments and files are removed. This can't be undone."
            okText="Delete for good"
            okButtonProps={{ danger: true }}
            onConfirm={() => run(() => trashService.deleteProjectForever(p.id), `${p.name} deleted for good`)}
          >
            <Button type="text" danger icon={<DeleteOutlined />} aria-label={`Delete ${p.name} for good`} />
          </Popconfirm>
        </Space>
      ),
    },
  ]

  return (
    <Card>
      <Typography.Paragraph type="secondary">
        Deleted projects stay here for 30 days. A restored project comes back <strong>archived</strong> — restore it from the archive to work in it again.
      </Typography.Paragraph>
      {projects.error && <Alert type="error" showIcon title={projects.error} style={{ marginBottom: 12 }} />}
      <Table<DeletedProject>
        rowKey="id"
        columns={columns}
        dataSource={projects.data ?? []}
        loading={projects.loading}
        pagination={false}
        locale={{ emptyText: <Empty description="No deleted projects" /> }}
        scroll={{ x: 560 }}
      />
    </Card>
  )
}
