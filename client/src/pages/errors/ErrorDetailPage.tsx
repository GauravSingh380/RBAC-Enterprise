// One production error: what, where, how often, the latest occurrence (request / SQL / stack),
// and the actions: resolve / ignore / reopen, create a bug from it, or link an existing bug.
import { ArrowLeftOutlined, BugOutlined, CheckOutlined, EyeInvisibleOutlined, LinkOutlined, UndoOutlined } from '@ant-design/icons'
import {
  Alert,
  App,
  Breadcrumb,
  Button,
  Card,
  Col,
  Descriptions,
  Empty,
  Flex,
  Form,
  Input,
  Modal,
  Row,
  Select,
  Skeleton,
  Space,
  Statistic,
  Table,
  Tabs,
  Tag,
  Typography,
  theme,
} from 'antd'
import { useCallback, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useAuth } from '../../auth/useAuth'
import { PERMISSIONS } from '../../config/permissions'
import { useFetch } from '../../hooks/useFetch'
import { getErrorMessage } from '../../lib/api'
import { projectsService } from '../../services/projects.service'
import { errorsService } from '../../services/qa.service'
import type { Priority, Severity } from '../../types/projects'
import type { ErrorEvent, ErrorStatus } from '../../types/qa'
import { PRIORITIES, SEVERITIES } from '../projects/shared/itemMeta'
import { shortDate, useChartColors } from '../projects/reports/chartTheme'
import { STATUS_COLOR, timeAgo } from './errorMeta'

const mono = { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace', fontSize: '0.85em' }

export default function ErrorDetailPage({ platform = false }: { platform?: boolean }) {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const { message } = App.useApp()
  const { can } = useAuth()
  const c = useChartColors()
  const group = useFetch(useCallback(() => errorsService.get(Number(id), platform), [id, platform]))
  const [dialog, setDialog] = useState<'bug' | 'link' | null>(null)
  const base = platform ? '/platform/errors' : '/errors'
  const canManage = platform || can(PERMISSIONS.ERRORS_MANAGE)

  if (group.error && !group.data) return <Alert type="error" showIcon title={group.error} />
  if (!group.data) return <Skeleton active paragraph={{ rows: 12 }} />
  const g = group.data
  const latest = g.events[0]

  const setStatus = async (status: ErrorStatus) => {
    try {
      await errorsService.setStatus(g.id, status, platform)
      message.success(status === 'unresolved' ? 'Reopened' : `Marked ${status}`)
      group.reload()
    } catch (err) {
      message.error(getErrorMessage(err))
    }
  }

  return (
    <>
      <Flex align="center" gap={8} style={{ marginBottom: 12 }}>
        <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => navigate(base)} aria-label="Back" />
        <Breadcrumb items={[{ title: <Link to={base}>Production errors</Link> }, { title: `#${g.id}` }]} />
      </Flex>

      <Card style={{ marginBottom: 16 }}>
        <Flex gap={8} wrap align="center" style={{ marginBottom: 8 }}>
          <Tag color={g.source === 'server' ? 'purple' : 'cyan'}>{g.source === 'server' ? 'server' : 'browser'}</Tag>
          <Tag color={STATUS_COLOR[g.status]}>{g.status}</Tag>
          {g.regressedAt && <Tag color="red">regressed {timeAgo(g.regressedAt)}</Tag>}
          {platform && <Tag>{g.organizationName ?? 'no organization'}</Tag>}
        </Flex>
        <Typography.Title level={4} style={{ marginTop: 0, wordBreak: 'break-word' }}>
          {g.title}
        </Typography.Title>
        <Typography.Text type="secondary" style={mono}>
          {g.culprit}
        </Typography.Text>

        <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
          <Col xs={12} md={4}>
            <Statistic title="Events" value={g.occurrences} />
          </Col>
          <Col xs={12} md={4}>
            <Statistic title="Users affected" value={g.usersAffected} />
          </Col>
          <Col xs={12} md={5}>
            <Statistic title="First seen" value={timeAgo(g.firstSeenAt)} />
          </Col>
          <Col xs={12} md={5}>
            <Statistic title="Last seen" value={timeAgo(g.lastSeenAt)} />
          </Col>
          <Col xs={24} md={6}>
            <Statistic title="Release" value={g.lastRelease ?? '—'} />
          </Col>
        </Row>

        {canManage && (
          <Flex gap={8} wrap style={{ marginTop: 16 }}>
            {g.status !== 'resolved' && (
              <Button icon={<CheckOutlined />} onClick={() => setStatus('resolved')}>
                Resolve
              </Button>
            )}
            {g.status !== 'ignored' && (
              <Button icon={<EyeInvisibleOutlined />} onClick={() => setStatus('ignored')}>
                Ignore
              </Button>
            )}
            {g.status !== 'unresolved' && (
              <Button icon={<UndoOutlined />} onClick={() => setStatus('unresolved')}>
                Reopen
              </Button>
            )}
            {!platform && !g.bug && (
              <>
                <Button type="primary" danger icon={<BugOutlined />} onClick={() => setDialog('bug')}>
                  Create bug
                </Button>
                <Button icon={<LinkOutlined />} onClick={() => setDialog('link')}>
                  Link existing bug
                </Button>
              </>
            )}
          </Flex>
        )}
        {g.bug && (
          <Alert
            style={{ marginTop: 16 }}
            type={g.bug.status.category === 'done' ? 'success' : 'info'}
            showIcon
            icon={<BugOutlined />}
            title={
              <>
                Tracked as <Link to={`/projects/${g.bug.key.split('-')[0]}/items/${g.bug.key.split('-').pop()}`}>{g.bug.key}</Link> — {g.bug.title}{' '}
                <Tag style={{ marginLeft: 6 }}>{g.bug.status.name}</Tag>
              </>
            }
            description="When the bug is done this error is resolved automatically; if it happens again it re-opens as a regression."
          />
        )}
      </Card>

      <Row gutter={16}>
        <Col xs={24} xl={16}>
          <Card title="Latest occurrence" style={{ marginBottom: 16 }}>
            {latest ? <EventDetail event={latest} /> : <Empty />}
          </Card>
        </Col>
        <Col xs={24} xl={8}>
          {/* one series → no legend; the title names it */}
          <Card title="Events per day (recent)" style={{ marginBottom: 16 }}>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={g.daily.map((d) => ({ ...d, x: shortDate(d.date) }))} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                <CartesianGrid stroke={c.grid} vertical={false} />
                <XAxis dataKey="x" tick={c.tick} tickLine={false} axisLine={{ stroke: c.grid }} interval={3} />
                <YAxis tick={c.tick} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip {...c.tooltip} cursor={{ fill: c.grid, opacity: 0.4 }} />
                <Bar name="Events" dataKey="count" fill={c.series1} maxBarSize={24} radius={[4, 4, 0, 0]} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
            <Typography.Text type="secondary" style={{ fontSize: '0.8em' }}>
              Based on the newest {Math.min(100, g.occurrences)} stored occurrences.
            </Typography.Text>
          </Card>
          <Card title="Recent occurrences" styles={{ body: { padding: 0 } }}>
            <Table<ErrorEvent>
              size="small"
              rowKey="id"
              dataSource={g.events}
              pagination={false}
              scroll={{ y: 320 }}
              columns={[
                { title: 'When', dataIndex: 'occurredAt', render: (v: string) => timeAgo(v), width: 90 },
                { title: 'User', key: 'user', render: (_, e) => e.user?.name ?? <Typography.Text type="secondary">anonymous</Typography.Text> },
                { title: 'Release', dataIndex: 'release', width: 80, render: (v: string | null) => v ?? '—' },
              ]}
            />
          </Card>
        </Col>
      </Row>

      {dialog === 'bug' && (
        <CreateBugModal
          groupId={g.id}
          defaultTitle={`[Error] ${g.title}`.slice(0, 500)}
          severity={g.occurrences >= 100 ? 'critical' : 'major'}
          onClose={() => setDialog(null)}
          onCreated={(key) => {
            message.success(`${key} created and linked`)
            setDialog(null)
            group.reload()
          }}
        />
      )}
      {dialog === 'link' && (
        <LinkBugModal
          groupId={g.id}
          onClose={() => setDialog(null)}
          onLinked={() => {
            setDialog(null)
            group.reload()
          }}
        />
      )}
    </>
  )
}

function EventDetail({ event }: { event: ErrorEvent }) {
  const { token } = theme.useToken()
  const ctx = event.context
  const pre = { ...mono, background: token.colorFillQuaternary, padding: 12, borderRadius: 8, whiteSpace: 'pre-wrap' as const, wordBreak: 'break-all' as const, maxHeight: 360, overflow: 'auto', margin: 0 }

  return (
    <>
      <Descriptions
        size="small"
        column={{ xs: 1, md: 2 }}
        items={[
          { key: 'when', label: 'When', children: new Date(event.occurredAt).toLocaleString() },
          { key: 'user', label: 'User', children: event.user?.name ?? 'anonymous' },
          ...(event.method ? [{ key: 'req', label: 'Request', children: <span style={mono}>{event.method} {event.url}</span> }] : []),
          ...(!event.method && event.url ? [{ key: 'page', label: 'Page', children: <span style={mono}>{event.url}</span> }] : []),
          ...(event.requestId
            ? [
                {
                  key: 'rid',
                  label: event.method ? 'Request id' : 'Error id',
                  children: (
                    <Typography.Text copyable style={mono}>
                      {event.requestId}
                    </Typography.Text>
                  ),
                },
              ]
            : []),
          ...(ctx.code ? [{ key: 'code', label: 'Code', children: <span style={mono}>{ctx.code}</span> }] : []),
          ...(event.userAgent ? [{ key: 'ua', label: 'User agent', children: <Typography.Text type="secondary" style={{ fontSize: '0.85em' }}>{event.userAgent}</Typography.Text> }] : []),
        ]}
      />
      {event.method && event.requestId && (
        <Typography.Paragraph type="secondary" style={{ fontSize: '0.85em' }}>
          Full request, response and SQL: search the request id in <code>server/logs/http-*.log</code>.
        </Typography.Paragraph>
      )}
      <Tabs
        items={[
          { key: 'stack', label: 'Stack trace', children: event.stack ? <pre style={pre}>{event.stack}</pre> : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} /> },
          ...(ctx.queries?.length
            ? [
                {
                  key: 'sql',
                  label: `SQL (${ctx.queries.length})`,
                  children: (
                    <Space direction="vertical" style={{ width: '100%' }}>
                      <Typography.Text type="secondary" style={{ fontSize: '0.85em' }}>
                        The last statements this request ran, values filled in (the failing one is usually last).
                      </Typography.Text>
                      {ctx.queries.map((q, i) => (
                        <div key={i}>
                          <Flex gap={8} style={{ marginBottom: 4 }}>
                            <Tag>{q.durationMs} ms</Tag>
                            {q.error && <Tag color="error">{q.error}</Tag>}
                          </Flex>
                          <Typography.Paragraph copyable={{ text: q.sql }} style={{ marginBottom: 0 }}>
                            <pre style={pre}>{q.sql}</pre>
                          </Typography.Paragraph>
                        </div>
                      ))}
                    </Space>
                  ),
                },
              ]
            : []),
          ...(ctx.componentStack ? [{ key: 'components', label: 'Component stack', children: <pre style={pre}>{ctx.componentStack}</pre> }] : []),
        ]}
      />
    </>
  )
}

function CreateBugModal({ groupId, defaultTitle, severity, onClose, onCreated }: { groupId: number; defaultTitle: string; severity: Severity; onClose: () => void; onCreated: (key: string) => void }) {
  const { message } = App.useApp()
  const [form] = Form.useForm<{ projectRef: string; title: string; priority: Priority; severity: Severity }>()
  const [busy, setBusy] = useState(false)
  // projects where the user can create items
  const projects = useFetch(useCallback(() => projectsService.list('active'), []))
  const writable = (projects.data ?? []).filter((p) => p.myRole !== 'viewer')

  const submit = async () => {
    const v = await form.validateFields()
    setBusy(true)
    try {
      const { bug } = await errorsService.createBug(groupId, v)
      onCreated(bug.key)
    } catch (err) {
      message.error(getErrorMessage(err))
      setBusy(false)
    }
  }

  return (
    <Modal open title="Create a bug from this error" okText="Create bug" okButtonProps={{ danger: true }} confirmLoading={busy} onOk={submit} onCancel={onClose}>
      <Typography.Paragraph type="secondary">
        The bug gets the occurrences, route, release, request id and stack trace; browser and OS come from the latest occurrence.
      </Typography.Paragraph>
      <Form form={form} layout="vertical" initialValues={{ title: defaultTitle, priority: 'high', severity }}>
        <Form.Item name="projectRef" label="Project" rules={[{ required: true, message: 'Choose a project' }]}>
          <Select
            showSearch={{ optionFilterProp: 'label' }}
            placeholder="Project"
            loading={projects.loading}
            options={writable.map((p) => ({ value: p.key, label: `${p.name} (${p.key})` }))}
          />
        </Form.Item>
        <Form.Item name="title" label="Title" rules={[{ required: true, max: 500 }]}>
          <Input />
        </Form.Item>
        <Flex gap={12}>
          <Form.Item name="severity" label="Severity" style={{ flex: 1 }}>
            <Select options={SEVERITIES.map((s) => ({ value: s.value, label: s.label }))} />
          </Form.Item>
          <Form.Item name="priority" label="Priority" style={{ flex: 1 }}>
            <Select options={PRIORITIES.map((p) => ({ value: p.value, label: p.label }))} />
          </Form.Item>
        </Flex>
      </Form>
    </Modal>
  )
}

function LinkBugModal({ groupId, onClose, onLinked }: { groupId: number; onClose: () => void; onLinked: () => void }) {
  const { message } = App.useApp()
  const [key, setKey] = useState('')
  const [busy, setBusy] = useState(false)
  const submit = async () => {
    setBusy(true)
    try {
      await errorsService.linkBug(groupId, key.trim().toUpperCase())
      message.success('Linked')
      onLinked()
    } catch (err) {
      message.error(getErrorMessage(err))
      setBusy(false)
    }
  }
  return (
    <Modal open title="Link an existing bug" okText="Link" okButtonProps={{ disabled: !/^[A-Za-z][A-Za-z0-9]{1,9}-\d+$/.test(key.trim()) }} confirmLoading={busy} onOk={submit} onCancel={onClose}>
      <Input autoFocus placeholder="Item key, e.g. TF-12" value={key} onChange={(e) => setKey(e.target.value)} onPressEnter={submit} />
    </Modal>
  )
}
