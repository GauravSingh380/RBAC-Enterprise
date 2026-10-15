// /leave/approvals — decide on the team's leave requests (permission leave.approve).
import { CheckOutlined, CloseOutlined } from '@ant-design/icons'
import { Alert, App, Badge, Button, Card, Empty, Input, Modal, Segmented, Space, Table, Tag, Tooltip, Typography } from 'antd'
import { useCallback, useState } from 'react'
import { PageHeader } from '../../components/ui'
import { useFetch } from '../../hooks/useFetch'
import { getErrorMessage } from '../../lib/api'
import { leaveService } from '../../services/leave.service'
import type { LeaveRequest, LeaveStatus } from '../../types/leave'
import { describeLeaveDates, STATUS_TAG } from './leaveMeta'

export default function ApprovalsPage() {
  const { message } = App.useApp()
  const [status, setStatus] = useState<LeaveStatus | 'all'>('pending')
  const [page, setPage] = useState(1)
  const [rejecting, setRejecting] = useState<LeaveRequest | null>(null)
  const [note, setNote] = useState('')
  const list = useFetch(useCallback(() => leaveService.requests({ scope: 'team', status, page, limit: 50 }), [status, page]))
  const pendingCount = useFetch(useCallback(() => leaveService.requests({ scope: 'team', status: 'pending', limit: 1 }), []))

  const act = async (fn: () => Promise<unknown>, text: string) => {
    try {
      await fn()
      message.success(text)
      list.reload()
      pendingCount.reload()
    } catch (err) {
      message.error(getErrorMessage(err))
    }
  }

  return (
    <>
      <PageHeader help="leave" title="Leave approvals" description="Requests of your direct reports (or everyone, for leave approvers). Pending first, oldest first." />
      {list.error && <Alert type="info" showIcon title="Only managers and leave approvers decide on leave." description={list.error} style={{ marginBottom: 16 }} />}
      <Card>
        <Segmented
          style={{ marginBottom: 16 }}
          value={status}
          onChange={(v) => (setStatus(v as LeaveStatus | 'all'), setPage(1))}
          options={[
            { value: 'pending', label: <span>Pending <Badge count={pendingCount.data?.total ?? 0} size="small" /></span> },
            { value: 'approved', label: 'Approved' },
            { value: 'rejected', label: 'Rejected' },
            { value: 'all', label: 'All' },
          ]}
        />
        <Table<LeaveRequest>
          rowKey="id"
          loading={list.loading}
          dataSource={list.data?.items}
          pagination={{ current: page, pageSize: 50, total: list.data?.total, onChange: setPage, showSizeChanger: false }}
          locale={{ emptyText: <Empty description={status === 'pending' ? 'Nothing waiting for you 🎉' : 'No requests'} /> }}
          scroll={{ x: 760 }}
          columns={[
            { title: 'Person', key: 'user', render: (_, r) => <Typography.Text strong>{r.user.name}</Typography.Text> },
            { title: 'Type', key: 'type', render: (_, r) => <Tag color={r.type.color}>{r.type.name}</Tag> },
            { title: 'Dates', key: 'dates', render: (_, r) => describeLeaveDates(r.startDate, r.endDate, r.portion) },
            { title: 'Days', dataIndex: 'days', width: 70, align: 'right' },
            {
              title: 'Reason',
              dataIndex: 'reason',
              ellipsis: true,
              responsive: ['lg'],
              render: (v: string | null) => (v ? <Tooltip title={v}>{v}</Tooltip> : <Typography.Text type="secondary">—</Typography.Text>),
            },
            { title: 'Requested', dataIndex: 'createdAt', width: 120, responsive: ['md'], render: (v: string) => new Date(v).toLocaleDateString() },
            {
              title: '',
              key: 'actions',
              width: 200,
              render: (_, r) =>
                r.canDecide ? (
                  <Space>
                    <Button size="small" type="primary" icon={<CheckOutlined />} onClick={() => act(() => leaveService.approve(r.id), `Approved for ${r.user.name}`)}>
                      Approve
                    </Button>
                    <Button size="small" danger icon={<CloseOutlined />} onClick={() => (setRejecting(r), setNote(''))}>
                      Reject
                    </Button>
                  </Space>
                ) : (
                  <Space>
                    <Tag color={STATUS_TAG[r.status]}>{r.status}</Tag>
                    {r.status === 'pending' && <Typography.Text type="secondary">your own</Typography.Text>}
                    {r.canCancel && r.status === 'approved' && (
                      <Button size="small" type="link" danger onClick={() => act(() => leaveService.cancel(r.id), 'Cancelled')}>
                        Cancel
                      </Button>
                    )}
                  </Space>
                ),
            },
          ]}
        />
      </Card>
      <Modal
        open={!!rejecting}
        title={`Reject ${rejecting?.user.name}'s request`}
        okText="Reject"
        okButtonProps={{ danger: true, disabled: note.trim().length < 3 }}
        onCancel={() => setRejecting(null)}
        onOk={() => rejecting && act(() => leaveService.reject(rejecting.id, note.trim()), 'Rejected').then(() => setRejecting(null))}
      >
        {rejecting && (
          <Typography.Paragraph type="secondary">
            {rejecting.type.name} · {describeLeaveDates(rejecting.startDate, rejecting.endDate, rejecting.portion)}
          </Typography.Paragraph>
        )}
        <Input.TextArea autoFocus autoSize={{ minRows: 3 }} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Why? (sent to the person)" />
      </Modal>
    </>
  )
}
