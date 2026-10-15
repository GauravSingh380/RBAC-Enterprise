// Audit log table used by both the organization audit log and the platform-wide one.
import { ReloadOutlined } from '@ant-design/icons'
import { Alert, Button, Card, Flex, Input, Table, Tag, Tooltip, Typography, type TableProps } from 'antd'
import { useCallback, useState } from 'react'
import { PageHeader } from '../../components/ui'
import { useFetch } from '../../hooks/useFetch'
import type { AuditLog, Paginated } from '../../types'

// Colour audit actions by type for quick scanning
function actionColor(action: string) {
  if (action.includes('failed') || action.includes('reuse') || action.endsWith('.delete') || action.endsWith('.remove')) return 'red'
  if (action.startsWith('platform.')) return 'purple'
  if (action.startsWith('auth.')) return 'blue'
  if (action.endsWith('.create') || action.endsWith('.accept')) return 'green'
  return 'gold'
}

interface Props {
  title: string
  description: string
  load: (query: { page: number; limit: number; search: string }) => Promise<Paginated<AuditLog>>
  /** Show which organization each entry belongs to (platform view). */
  showOrganization?: boolean
}

export default function AuditLogsView({ title, description, load, showOrganization = false }: Props) {
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [search, setSearch] = useState('')
  const logs = useFetch(useCallback(() => load({ page, limit: pageSize, search }), [load, page, pageSize, search]))

  const columns: TableProps<AuditLog>['columns'] = [
    {
      title: 'When',
      dataIndex: 'createdAt',
      width: 190,
      render: (value: string) => <Typography.Text type="secondary">{new Date(value).toLocaleString()}</Typography.Text>,
    },
    ...(showOrganization
      ? [
          {
            title: 'Organization',
            dataIndex: 'organization',
            render: (org: AuditLog['organization']) => org?.name ?? <Typography.Text type="secondary">platform</Typography.Text>,
          },
        ]
      : []),
    {
      title: 'User',
      dataIndex: 'user',
      render: (user: AuditLog['user']) =>
        user ? (
          <Tooltip title={user.email}>
            <span>{user.name}</span>
          </Tooltip>
        ) : (
          <Typography.Text type="secondary">anonymous</Typography.Text>
        ),
    },
    {
      title: 'Action',
      dataIndex: 'action',
      render: (action: string) => <Tag color={actionColor(action)}>{action}</Tag>,
    },
    {
      title: 'Target',
      key: 'target',
      responsive: ['md'],
      render: (_, log) => (log.entity ? `${log.entity} #${log.entityId}` : '—'),
    },
    { title: 'IP', dataIndex: 'ipAddress', responsive: ['lg'], render: (ip: string | null) => ip ?? '—' },
  ]

  return (
    <>
      <PageHeader title={title} description={description} />
      {logs.error && <Alert type="error" showIcon title={logs.error} style={{ marginBottom: 16 }} />}

      <Card>
        <Flex gap={8} style={{ marginBottom: 16 }} wrap>
          <Input.Search
            placeholder={showOrganization ? 'Filter by action, email or organization' : 'Filter by action or email'}
            allowClear
            enterButton
            style={{ maxWidth: 420 }}
            onSearch={(value) => {
              setPage(1)
              setSearch(value.trim())
            }}
          />
          <Tooltip title="Refresh">
            <Button icon={<ReloadOutlined />} onClick={logs.reload} />
          </Tooltip>
        </Flex>

        <Table<AuditLog>
          rowKey="id"
          size="middle"
          columns={columns}
          dataSource={logs.data?.items}
          loading={logs.loading}
          scroll={{ x: 600 }}
          expandable={{
            rowExpandable: (log) => !!log.details,
            expandedRowRender: (log) => (
              <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{JSON.stringify(log.details, null, 2)}</pre>
            ),
          }}
          pagination={{
            current: page,
            pageSize,
            total: logs.data?.total,
            showSizeChanger: true,
            showTotal: (total) => `${total} entries`,
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
