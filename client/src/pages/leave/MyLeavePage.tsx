// /leave — my balances and my requests.
import { PlusOutlined } from '@ant-design/icons'
import { App, Button, Card, Col, Empty, Flex, Popconfirm, Progress, Row, Select, Skeleton, Table, Tag, Tooltip, Typography, theme } from 'antd'
import { useCallback, useState } from 'react'
import { PageHeader } from '../../components/ui'
import { useFetch } from '../../hooks/useFetch'
import { getErrorMessage } from '../../lib/api'
import { leaveService } from '../../services/leave.service'
import type { LeaveBalance, LeaveRequest } from '../../types/leave'
import { describeLeaveDates, pluralDays, STATUS_TAG } from './leaveMeta'
import { RequestLeaveModal } from './RequestLeaveModal'

const thisYear = new Date().getFullYear()

export default function MyLeavePage() {
  const { message } = App.useApp()
  const [year, setYear] = useState(thisYear)
  const [requesting, setRequesting] = useState(false)
  const balances = useFetch(useCallback(() => leaveService.balances(year), [year]))
  const requests = useFetch(useCallback(() => leaveService.requests({ scope: 'mine', year, limit: 200 }), [year]))
  const reload = () => {
    balances.reload()
    requests.reload()
  }

  const cancel = async (r: LeaveRequest) => {
    try {
      await leaveService.cancel(r.id)
      message.success('Request cancelled')
      reload()
    } catch (err) {
      message.error(getErrorMessage(err))
    }
  }

  return (
    <>
      <PageHeader help="leave"
        title="My leave"
        description="Your balances and requests. Weekends and public holidays of your calendar are never counted."
        actions={
          <Flex gap={8}>
            <Select value={year} onChange={setYear} options={[thisYear - 1, thisYear, thisYear + 1].map((y) => ({ value: y, label: y }))} style={{ width: 100 }} />
            <Button type="primary" icon={<PlusOutlined />} disabled={!balances.data?.length} onClick={() => setRequesting(true)}>
              Request leave
            </Button>
          </Flex>
        }
      />

      {!balances.data ? (
        <Skeleton active />
      ) : (
        <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
          {balances.data.map((b) => (
            <Col key={b.type.id} xs={24} sm={12} lg={8} xl={6}>
              <BalanceCard balance={b} />
            </Col>
          ))}
        </Row>
      )}

      <Card title={`Requests in ${year}`}>
        <Table<LeaveRequest>
          rowKey="id"
          loading={requests.loading}
          dataSource={requests.data?.items}
          pagination={false}
          locale={{ emptyText: <Empty description="No leave requested this year" /> }}
          columns={[
            { title: 'Dates', key: 'dates', render: (_, r) => describeLeaveDates(r.startDate, r.endDate, r.portion) },
            { title: 'Type', key: 'type', render: (_, r) => <Tag color={r.type.color}>{r.type.name}</Tag> },
            { title: 'Days', dataIndex: 'days', width: 80, align: 'right' },
            { title: 'Status', dataIndex: 'status', width: 110, render: (s: LeaveRequest['status']) => <Tag color={STATUS_TAG[s]}>{s}</Tag> },
            {
              title: 'Decision',
              key: 'decision',
              responsive: ['md'],
              render: (_, r) =>
                r.decidedBy ? (
                  <Typography.Text type="secondary">
                    {r.decidedBy.name}
                    {r.decisionNote && ` — “${r.decisionNote}”`}
                  </Typography.Text>
                ) : (
                  '—'
                ),
            },
            {
              title: '',
              key: 'actions',
              width: 90,
              render: (_, r) =>
                r.canCancel && (
                  <Popconfirm title="Cancel this request?" onConfirm={() => cancel(r)}>
                    <Button size="small" danger type="link">
                      Cancel
                    </Button>
                  </Popconfirm>
                ),
            },
          ]}
        />
      </Card>

      {requesting && balances.data && <RequestLeaveModal balances={balances.data} onClose={() => setRequesting(false)} onCreated={reload} />}
    </>
  )
}

/** Meter: used (solid) + pending (lighter step of the same colour) out of the allowance. */
function BalanceCard({ balance: b }: { balance: LeaveBalance }) {
  const { token } = theme.useToken()
  const total = (b.entitled ?? 0) + b.carriedOver
  return (
    <Card size="small" style={{ height: '100%' }}>
      <Flex align="center" gap={8} style={{ marginBottom: 6 }}>
        <span style={{ width: 10, height: 10, borderRadius: 3, background: b.type.color }} />
        <Typography.Text strong>{b.type.name}</Typography.Text>
        {!b.type.isPaid && <Tag style={{ marginInlineEnd: 0 }}>unpaid</Tag>}
      </Flex>
      {b.entitled === null ? (
        <>
          <Typography.Title level={3} style={{ margin: 0 }}>
            {b.used}
          </Typography.Title>
          <Typography.Text type="secondary">{pluralDays(b.used)} taken · no limit</Typography.Text>
        </>
      ) : (
        <>
          <Typography.Title level={3} style={{ margin: 0 }}>
            {b.available} <Typography.Text type="secondary" style={{ fontSize: 14, fontWeight: 400 }}>of {total} left</Typography.Text>
          </Typography.Title>
          <Tooltip title={`${b.used} used · ${b.pending} pending approval · ${b.available} available`}>
            <Progress
              percent={total ? ((b.used + b.pending) / total) * 100 : 0}
              success={{ percent: total ? (b.used / total) * 100 : 0, strokeColor: b.type.color }}
              strokeColor={`${b.type.color}66`}
              railColor={token.colorFillSecondary}
              showInfo={false}
              size="small"
            />
          </Tooltip>
          <Typography.Text type="secondary" style={{ fontSize: '0.85em' }}>
            {b.used} used{b.pending ? ` · ${b.pending} pending` : ''}
            {b.carriedOver ? ` · incl. ${b.carriedOver} carried over` : ''}
          </Typography.Text>
        </>
      )}
    </Card>
  )
}
