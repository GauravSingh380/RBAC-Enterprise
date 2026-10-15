// /projects/:key/trash — deleted items and doc pages of the project (kept 30 days).
// Restore: project admins anything, others what they deleted. Delete forever: project admins.
import { DeleteOutlined, FileTextOutlined, RollbackOutlined } from '@ant-design/icons'
import { Alert, App, Button, Card, Empty, Flex, Popconfirm, Result, Space, Table, Tooltip, Typography, type TableProps } from 'antd'
import { useCallback } from 'react'
import { HelpLink } from '../../../components/HelpLink'
import { useFetch } from '../../../hooks/useFetch'
import { getErrorMessage } from '../../../lib/api'
import { trashService } from '../../../services/workspace.service'
import type { ItemType } from '../../../types/projects'
import type { TrashEntry } from '../../../types/workspace'
import { ItemTypeIcon } from '../shared/ItemBits'
import { useProject } from '../shared/projectContext'

const daysLeft = (iso: string) => Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000))

export default function TrashPage() {
  const { project, reloadProject } = useProject()
  const { message } = App.useApp()
  // "days left" is computed when the data loads (not during render)
  const trash = useFetch(
    useCallback(() => trashService.list(project.key).then((rows) => rows.map((r) => ({ ...r, daysLeft: daysLeft(r.purgeAt) }))), [project.key]),
  )

  if (!project.canEdit && !project.canManage) return <Result status="403" title="Only project members can see the trash" />

  const run = async (fn: () => Promise<unknown>, text: string) => {
    try {
      await fn()
      message.success(text)
      trash.reload()
      reloadProject()
    } catch (err) {
      message.error(getErrorMessage(err))
    }
  }

  const columns: TableProps<TrashEntry & { daysLeft: number }>['columns'] = [
    {
      title: 'Deleted',
      key: 'what',
      render: (_, e) => (
        <Space>
          {e.kind === 'item' ? <ItemTypeIcon type={e.type as ItemType} size={12} /> : <FileTextOutlined />}
          <div>
            <Typography.Text strong>
              {e.key && <Typography.Text type="secondary">{e.key} </Typography.Text>}
              {e.title}
            </Typography.Text>
            <Typography.Text type="secondary" style={{ display: 'block', fontSize: '0.85em' }}>
              {e.kind === 'page' ? 'Doc page' : 'Work item'}
              {e.withChildren > 0 && ` · with ${e.withChildren} ${e.kind === 'page' ? 'sub-page' : 'sub-item'}${e.withChildren > 1 ? 's' : ''}`}
            </Typography.Text>
          </div>
        </Space>
      ),
    },
    {
      title: 'By',
      key: 'by',
      responsive: ['md'],
      render: (_, e) => (
        <div>
          {e.deletedBy?.name ?? '—'}
          <Typography.Text type="secondary" style={{ display: 'block', fontSize: '0.85em' }}>
            {new Date(e.deletedAt).toLocaleString()}
          </Typography.Text>
        </div>
      ),
    },
    {
      title: 'Removed for good in',
      dataIndex: 'daysLeft',
      responsive: ['sm'],
      render: (d: number) => <Typography.Text type={d <= 3 ? 'danger' : 'secondary'}>{d} day{d === 1 ? '' : 's'}</Typography.Text>,
    },
    {
      title: '',
      key: 'actions',
      align: 'right',
      render: (_, e) => (
        <Space size={0}>
          <Tooltip title={e.canRestore ? undefined : 'Only project admins or the person who deleted it'}>
            <Button
              type="text"
              icon={<RollbackOutlined />}
              disabled={!e.canRestore}
              onClick={() => run(() => trashService.restore(project.key, e.kind, e.id), `"${e.title}" restored`)}
            >
              Restore
            </Button>
          </Tooltip>
          {project.canManage && (
            <Popconfirm
              title="Delete for good?"
              description="This can't be undone — comments and files go too."
              okText="Delete for good"
              okButtonProps={{ danger: true }}
              onConfirm={() => run(() => trashService.deleteForever(project.key, e.kind, e.id), `"${e.title}" deleted for good`)}
            >
              <Button type="text" danger icon={<DeleteOutlined />} aria-label={`Delete ${e.title} for good`} />
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ]

  return (
    <Card>
      <Flex align="center" gap={8} style={{ marginBottom: 12 }}>
        <Typography.Title level={4} style={{ margin: 0 }}>
          Trash
        </Typography.Title>
        <HelpLink article="trash" label="How the trash works" />
      </Flex>
      <Typography.Paragraph type="secondary">
        Deleted items and doc pages stay here for 30 days. Restoring brings everything back — comments, files, history, checklist and sub-items.
      </Typography.Paragraph>
      {project.status === 'archived' && <Alert type="warning" showIcon title="The project is archived — restore it from the archive to restore items." style={{ marginBottom: 12 }} />}
      {trash.error && <Alert type="error" showIcon title={trash.error} style={{ marginBottom: 12 }} />}
      <Table
        rowKey={(e) => `${e.kind}-${e.id}`}
        columns={columns}
        dataSource={trash.data ?? []}
        loading={trash.loading}
        pagination={{ pageSize: 25, hideOnSinglePage: true }}
        locale={{ emptyText: <Empty description="The trash is empty" /> }}
        scroll={{ x: 560 }}
      />
    </Card>
  )
}
