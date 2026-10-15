// Background job queue: what is waiting, running, done or failed — and retry failed jobs.
import { RedoOutlined, ReloadOutlined } from '@ant-design/icons'
import { Alert, App, Badge, Button, Card, Col, Flex, Row, Segmented, Statistic, Table, Tag, Tooltip, Typography, type TableProps } from 'antd'
import { useCallback, useState } from 'react'
import { PageHeader } from '../../components/ui'
import { useFetch } from '../../hooks/useFetch'
import { getErrorMessage } from '../../lib/api'
import { platformService } from '../../services/platform.service'
import type { Job } from '../../types'

const STATUS_BADGE = { pending: 'default', running: 'processing', completed: 'success', failed: 'error' } as const

export default function JobsPage() {
  const { message } = App.useApp()
  const [page, setPage] = useState(1)
  const [status, setStatus] = useState('all')
  const stats = useFetch(useCallback(() => platformService.jobStats(), []))
  const jobs = useFetch(useCallback(() => platformService.jobs({ page, limit: 20, status: status === 'all' ? undefined : status }), [page, status]))

  const refresh = () => {
    stats.reload()
    jobs.reload()
  }

  const retry = async (id: number) => {
    try {
      await platformService.retryJob(id)
      message.success(`Job #${id} queued again`)
      refresh()
    } catch (err) {
      message.error(getErrorMessage(err))
    }
  }

  const columns: TableProps<Job>['columns'] = [
    { title: '#', dataIndex: 'id', width: 70 },
    { title: 'Queue', dataIndex: 'queue', render: (q: string) => <Tag color="blue">{q}</Tag> },
    { title: 'Status', dataIndex: 'status', render: (s: Job['status']) => <Badge status={STATUS_BADGE[s]} text={s} /> },
    { title: 'Attempts', key: 'attempts', render: (_, j) => `${j.attempts} / ${j.maxAttempts}` },
    { title: 'Created', dataIndex: 'createdAt', responsive: ['md'], render: (v: string) => new Date(v).toLocaleString() },
    {
      title: 'Next run / done',
      key: 'when',
      responsive: ['lg'],
      render: (_, j) => (j.completedAt ? new Date(j.completedAt).toLocaleString() : new Date(j.runAt).toLocaleString()),
    },
    {
      title: 'Error',
      dataIndex: 'lastError',
      ellipsis: true,
      render: (e: string | null) => (e ? <Tooltip title={e}><Typography.Text type="danger">{e}</Typography.Text></Tooltip> : '—'),
    },
    {
      title: '',
      key: 'actions',
      align: 'right',
      render: (_, j) =>
        j.status === 'failed' && (
          <Button size="small" icon={<RedoOutlined />} onClick={() => retry(j.id)}>
            Retry
          </Button>
        ),
    },
  ]

  return (
    <>
      <PageHeader
        title="Background jobs"
        description="Work done outside API requests (emails, …). Failed jobs retry automatically with backoff."
        actions={<Button icon={<ReloadOutlined />} onClick={refresh}>Refresh</Button>}
      />
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        {(['pending', 'running', 'completed', 'failed'] as const).map((s) => (
          <Col xs={12} md={6} key={s}>
            <Card size="small">
              <Statistic title={s.charAt(0).toUpperCase() + s.slice(1)} value={stats.data?.[s] ?? 0} styles={{ content: s === 'failed' && stats.data?.failed ? { color: '#dc3e42' } : undefined }} />
            </Card>
          </Col>
        ))}
      </Row>
      {jobs.error && <Alert type="error" showIcon title={jobs.error} style={{ marginBottom: 16 }} />}
      <Card>
        <Flex style={{ marginBottom: 16 }}>
          <Segmented
            value={status}
            onChange={(v) => {
              setPage(1)
              setStatus(String(v))
            }}
            options={['all', 'pending', 'running', 'completed', 'failed']}
          />
        </Flex>
        <Table<Job>
          rowKey="id"
          size="middle"
          columns={columns}
          dataSource={jobs.data?.items}
          loading={jobs.loading}
          scroll={{ x: 760 }}
          expandable={{ expandedRowRender: (j) => <pre style={{ margin: 0 }}>{JSON.stringify(j.payload, null, 2)}</pre> }}
          pagination={{ current: page, pageSize: 20, total: jobs.data?.total, onChange: setPage }}
        />
      </Card>
    </>
  )
}
