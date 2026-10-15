// Every email the platform sends. With EMAIL_DRIVER=outbox (default in development)
// nothing leaves the machine — this page IS the inbox.
import { EyeOutlined, LinkOutlined, ReloadOutlined, SendOutlined } from '@ant-design/icons'
import { Alert, App, Badge, Button, Card, Drawer, Flex, Input, Segmented, Skeleton, Table, Tabs, Tag, Tooltip, Typography, type TableProps } from 'antd'
import { useCallback, useState } from 'react'
import { PageHeader } from '../../components/ui'
import { useFetch } from '../../hooks/useFetch'
import { getErrorMessage } from '../../lib/api'
import { platformService } from '../../services/platform.service'
import type { EmailSummary } from '../../types'

const STATUS_BADGE = { sent: 'success', queued: 'processing', failed: 'error' } as const

function EmailViewer({ id, onClose }: { id: number; onClose: () => void }) {
  const email = useFetch(useCallback(() => platformService.email(id), [id]))
  const e = email.data
  return (
    <Drawer open onClose={onClose} size={760} title={e?.subject ?? 'Email'}>
      {!e ? (
        <Skeleton active />
      ) : (
        <Flex vertical gap={12}>
          <Typography.Text>
            <Typography.Text type="secondary">To:</Typography.Text> {e.to} · <Tag>{e.template}</Tag>
            <Badge status={STATUS_BADGE[e.status]} text={e.status} />
          </Typography.Text>
          {e.previewUrl && (
            <a href={e.previewUrl} target="_blank" rel="noreferrer">
              <LinkOutlined /> Open in Ethereal
            </a>
          )}
          {e.error && <Alert type="error" showIcon title={e.error} />}
          {e.html ? (
            <Tabs
              items={[
                {
                  key: 'html',
                  label: 'Preview',
                  // sandboxed iframe: email HTML can't run scripts or touch this page
                  children: <iframe title="email" sandbox="allow-popups allow-popups-to-escape-sandbox" srcDoc={e.html} style={{ width: '100%', height: '70vh', border: 0, borderRadius: 8, background: '#fff' }} />,
                },
                { key: 'text', label: 'Plain text', children: <pre style={{ whiteSpace: 'pre-wrap' }}>{e.text}</pre> },
              ]}
            />
          ) : (
            <Alert type="info" showIcon title="The body was discarded after sending (production setting)." />
          )}
        </Flex>
      )}
    </Drawer>
  )
}

export default function MailboxPage() {
  const { message } = App.useApp()
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<string>('all')
  const [openId, setOpenId] = useState<number | null>(null)
  const emails = useFetch(
    useCallback(() => platformService.emails({ page, limit: 20, search, status: status === 'all' ? undefined : status }), [page, search, status]),
  )

  const resend = async (id: number) => {
    try {
      await platformService.resendEmail(id)
      message.success('Queued again')
      emails.reload()
    } catch (err) {
      message.error(getErrorMessage(err))
    }
  }

  const columns: TableProps<EmailSummary>['columns'] = [
    { title: 'When', dataIndex: 'createdAt', width: 180, render: (v: string) => new Date(v).toLocaleString() },
    { title: 'To', dataIndex: 'to' },
    {
      title: 'Subject',
      dataIndex: 'subject',
      render: (s: string, e) => (
        <Typography.Link onClick={() => setOpenId(e.id)}>
          {s}
        </Typography.Link>
      ),
    },
    { title: 'Template', dataIndex: 'template', responsive: ['lg'], render: (t: string) => <Tag>{t}</Tag> },
    { title: 'Organization', dataIndex: 'organization', responsive: ['xl'], render: (o: string | null) => o ?? '—' },
    {
      title: 'Status',
      dataIndex: 'status',
      render: (s: EmailSummary['status'], e) => (
        <Tooltip title={e.error ?? `${e.attempts} attempt(s) via ${e.driver}`}>
          <Badge status={STATUS_BADGE[s]} text={s} />
        </Tooltip>
      ),
    },
    {
      title: '',
      key: 'actions',
      align: 'right',
      render: (_, e) => (
        <Flex gap={4} justify="flex-end">
          <Tooltip title="View">
            <Button type="text" icon={<EyeOutlined />} onClick={() => setOpenId(e.id)} />
          </Tooltip>
          {e.status !== 'queued' && (
            <Tooltip title="Send again">
              <Button type="text" icon={<SendOutlined />} onClick={() => resend(e.id)} />
            </Tooltip>
          )}
        </Flex>
      ),
    },
  ]

  return (
    <>
      <PageHeader
        title="Mailbox"
        description="Every email sent by the platform. In development (EMAIL_DRIVER=outbox) emails only appear here."
      />
      {emails.error && <Alert type="error" showIcon title={emails.error} style={{ marginBottom: 16 }} />}
      <Card>
        <Flex gap={8} wrap style={{ marginBottom: 16 }}>
          <Input.Search
            placeholder="Search recipient or subject"
            allowClear
            enterButton
            style={{ maxWidth: 360 }}
            onSearch={(v) => {
              setPage(1)
              setSearch(v.trim())
            }}
          />
          <Segmented
            value={status}
            onChange={(v) => {
              setPage(1)
              setStatus(String(v))
            }}
            options={['all', 'sent', 'queued', 'failed']}
          />
          <Button icon={<ReloadOutlined />} onClick={emails.reload} />
        </Flex>
        <Table<EmailSummary>
          rowKey="id"
          size="middle"
          columns={columns}
          dataSource={emails.data?.items}
          loading={emails.loading}
          scroll={{ x: 760 }}
          pagination={{ current: page, pageSize: 20, total: emails.data?.total, onChange: setPage, showTotal: (t) => `${t} emails` }}
        />
      </Card>
      {openId && <EmailViewer id={openId} onClose={() => setOpenId(null)} />}
    </>
  )
}
