// Platform → Website → Inquiries: messages from the contact form. Read, keep notes, reply by e-mail, close, spam, delete.
import { DeleteOutlined, MailOutlined, SendOutlined } from '@ant-design/icons'
import { Alert, App, Button, Card, Checkbox, Descriptions, Drawer, Empty, Flex, Input, Popconfirm, Segmented, Select, Space, Table, Tag, Timeline, Typography, type TableProps } from 'antd'
import { useCallback, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useFetch } from '../../hooks/useFetch'
import { getErrorMessage } from '../../lib/api'
import { websiteAdminApi } from '../api'
import type { Inquiry, InquiryDetail, InquiryStatus, InquiryType } from '../types'
import { INQUIRY_STATUS, INQUIRY_TYPES, inquiryTypeLabel } from '../websiteMeta'

type Filter = InquiryStatus | 'open' | 'all'

export function InquiriesInbox({ onChanged }: { onChanged: () => void }) {
  const [params, setParams] = useSearchParams()
  const [status, setStatus] = useState<Filter>('open')
  const [type, setType] = useState<InquiryType>()
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const list = useFetch(useCallback(() => websiteAdminApi.inquiries({ status, type, search: search || undefined, page, limit: 20 }), [status, type, search, page]))
  // ?inquiry=12 (link in the "new inquiry" e-mail) opens it directly
  const openId = Number(params.get('inquiry')) || null
  const open = (id: number | null) => {
    const next = new URLSearchParams(params)
    if (id) next.set('inquiry', String(id))
    else next.delete('inquiry')
    setParams(next, { replace: true })
  }
  const changed = () => {
    list.reload()
    onChanged()
  }
  const c = list.data?.counts

  const columns: TableProps<Inquiry>['columns'] = [
    {
      title: 'From',
      key: 'from',
      render: (_, i) => (
        <div>
          <Typography.Text strong={i.status === 'new'}>{i.name}</Typography.Text>
          <Typography.Text type="secondary" style={{ display: 'block', fontSize: '0.85em' }}>
            {i.email}{i.company ? ` · ${i.company}` : ''}
          </Typography.Text>
        </div>
      ),
    },
    { title: 'Topic', dataIndex: 'type', render: (t: InquiryType) => <Tag>{inquiryTypeLabel(t)}</Tag>, responsive: ['md'] },
    {
      title: 'Message',
      dataIndex: 'message',
      responsive: ['lg'],
      render: (m: string) => <Typography.Text type="secondary" ellipsis style={{ maxWidth: 360, display: 'block' }}>{m}</Typography.Text>,
    },
    { title: 'Status', dataIndex: 'status', render: (s: InquiryStatus) => <Tag color={INQUIRY_STATUS[s].color}>{INQUIRY_STATUS[s].label}</Tag> },
    { title: 'Received', dataIndex: 'createdAt', render: (d: string) => new Date(d).toLocaleString(), responsive: ['sm'] },
  ]

  return (
    <Card>
      <Flex gap={12} wrap align="center" style={{ marginBottom: 16 }}>
        <Segmented<Filter>
          value={status}
          onChange={(v) => (setStatus(v), setPage(1))}
          options={[
            { value: 'open', label: `Open${c ? ` (${c.new + c.replied})` : ''}` },
            { value: 'new', label: `New${c ? ` (${c.new})` : ''}` },
            { value: 'replied', label: 'Replied' },
            { value: 'closed', label: 'Closed' },
            { value: 'spam', label: `Spam${c?.spam ? ` (${c.spam})` : ''}` },
            { value: 'all', label: 'All' },
          ]}
        />
        <Select allowClear placeholder="Any topic" style={{ width: 170 }} value={type} onChange={(v) => (setType(v), setPage(1))} options={INQUIRY_TYPES} />
        <Input.Search allowClear placeholder="Search name, email, company, message" style={{ maxWidth: 320 }} onSearch={(v) => (setSearch(v.trim()), setPage(1))} />
      </Flex>
      {list.error && <Alert type="error" showIcon title={list.error} style={{ marginBottom: 12 }} />}
      <Table<Inquiry>
        rowKey="id"
        columns={columns}
        dataSource={list.data?.items ?? []}
        loading={list.loading}
        onRow={(i) => ({ onClick: () => open(i.id), style: { cursor: 'pointer' } })}
        pagination={{ current: page, pageSize: 20, total: list.data?.total, onChange: setPage, hideOnSinglePage: true }}
        locale={{ emptyText: <Empty image={<MailOutlined style={{ fontSize: 40, opacity: 0.4 }} />} description="No messages here" /> }}
        scroll={{ x: 560 }}
      />
      {openId && <InquiryDrawer key={openId} id={openId} onClose={() => open(null)} onChanged={changed} />}
    </Card>
  )
}

function InquiryDrawer({ id, onClose, onChanged }: { id: number; onClose: () => void; onChanged: () => void }) {
  const { message } = App.useApp()
  const loaded = useFetch(useCallback(() => websiteAdminApi.inquiry(id), [id]))
  const [item, setItem] = useState<InquiryDetail | null>(null)
  const current = item ?? loaded.data
  const [reply, setReply] = useState('')
  const [close, setClose] = useState(false)
  const [sending, setSending] = useState(false)

  const run = async (fn: () => Promise<InquiryDetail>, text?: string) => {
    try {
      setItem(await fn())
      if (text) message.success(text)
      onChanged()
    } catch (err) {
      message.error(getErrorMessage(err))
    }
  }

  const send = async () => {
    if (!reply.trim()) return
    setSending(true)
    await run(() => websiteAdminApi.replyInquiry(id, reply.trim(), close), 'Reply sent by e-mail')
    setReply('')
    setSending(false)
  }

  const remove = async () => {
    try {
      await websiteAdminApi.deleteInquiry(id)
      message.success('Inquiry deleted')
      onChanged()
      onClose()
    } catch (err) {
      message.error(getErrorMessage(err))
    }
  }

  return (
    <Drawer
      open
      onClose={onClose}
      size={640}
      title={current ? `${current.name} — ${inquiryTypeLabel(current.type)}` : 'Inquiry'}
      extra={
        current && (
          <Space>
            <Select<InquiryStatus>
              value={current.status}
              style={{ width: 130 }}
              onChange={(s) => run(() => websiteAdminApi.updateInquiry(id, { status: s }), `Marked as ${INQUIRY_STATUS[s].label.toLowerCase()}`)}
              options={(Object.keys(INQUIRY_STATUS) as InquiryStatus[]).map((s) => ({ value: s, label: INQUIRY_STATUS[s].label }))}
            />
            <Popconfirm title="Delete this inquiry?" description="The message and the replies are removed." onConfirm={remove}>
              <Button danger icon={<DeleteOutlined />} aria-label="Delete inquiry" />
            </Popconfirm>
          </Space>
        )
      }
    >
      {loaded.error && <Alert type="error" showIcon title={loaded.error} />}
      {current && (
        <>
          <Descriptions
            size="small"
            column={1}
            bordered
            items={[
              { key: 'email', label: 'Email', children: <a href={`mailto:${current.email}`}>{current.email}</a> },
              ...(current.company ? [{ key: 'company', label: 'Company', children: current.company }] : []),
              ...(current.teamSize ? [{ key: 'size', label: 'Team size', children: `${current.teamSize} people` }] : []),
              ...(current.phone ? [{ key: 'phone', label: 'Phone', children: <a href={`tel:${current.phone}`}>{current.phone}</a> }] : []),
              { key: 'when', label: 'Received', children: `${new Date(current.createdAt).toLocaleString()}${current.sourcePath ? ` · from ${current.sourcePath}` : ''}` },
            ]}
          />
          <Typography.Title level={5} style={{ marginTop: 20 }}>Message</Typography.Title>
          <Typography.Paragraph style={{ whiteSpace: 'pre-wrap' }}>{current.message}</Typography.Paragraph>

          {current.replies.length > 0 && (
            <>
              <Typography.Title level={5}>Replies</Typography.Title>
              <Timeline
                items={current.replies.map((r) => ({
                  children: (
                    <div>
                      <Typography.Text type="secondary" style={{ fontSize: '0.85em' }}>
                        {r.sentBy?.name ?? 'Someone'} · {new Date(r.createdAt).toLocaleString()}
                      </Typography.Text>
                      <div style={{ whiteSpace: 'pre-wrap' }}>{r.body}</div>
                    </div>
                  ),
                }))}
              />
            </>
          )}

          {current.status !== 'spam' && (
            <>
              <Typography.Title level={5}>Reply</Typography.Title>
              <Input.TextArea
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                autoSize={{ minRows: 4, maxRows: 12 }}
                maxLength={10_000}
                placeholder={`Hi ${current.name.split(' ')[0]}, …`}
              />
              <Flex justify="space-between" align="center" gap={12} wrap style={{ marginTop: 8 }}>
                <Checkbox checked={close} onChange={(e) => setClose(e.target.checked)}>Close after sending</Checkbox>
                <Button type="primary" icon={<SendOutlined />} loading={sending} disabled={!reply.trim()} onClick={send}>
                  Send by e-mail
                </Button>
              </Flex>
              <Typography.Text type="secondary" style={{ display: 'block', marginTop: 6, fontSize: '0.85em' }}>
                Sent to {current.email} with their original message quoted; kept here.
              </Typography.Text>
            </>
          )}

          <Typography.Title level={5} style={{ marginTop: 24 }}>Internal notes</Typography.Title>
          <Input.TextArea
            defaultValue={current.notes ?? ''}
            autoSize={{ minRows: 2, maxRows: 8 }}
            maxLength={10_000}
            placeholder="Only visible here — never sent"
            onBlur={(e) => e.target.value !== (current.notes ?? '') && run(() => websiteAdminApi.updateInquiry(id, { notes: e.target.value || null }), 'Notes saved')}
          />
        </>
      )}
    </Drawer>
  )
}
