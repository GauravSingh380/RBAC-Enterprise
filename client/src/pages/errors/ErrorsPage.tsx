// Production error inbox: server 500s and browser crashes, grouped by fingerprint (like Sentry).
//   /errors           — the active organization (permission errors.read)
//   /platform/errors  — every organization + errors outside any organization (platform admins)
import { BugOutlined, ExperimentOutlined, ReloadOutlined } from '@ant-design/icons'
import { App, Badge, Button, Card, Dropdown, Flex, Input, Segmented, Select, Table, Tag, Tooltip, Typography } from 'antd'
import { useCallback, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../auth/useAuth'
import { HelpLink } from '../../components/HelpLink'
import { PERMISSIONS } from '../../config/permissions'
import { APP_ENV } from '../../config/env'
import { useFetch } from '../../hooks/useFetch'
import { errorsService } from '../../services/qa.service'
import type { ErrorGroup, ErrorStatus } from '../../types/qa'
import { timeAgo } from './errorMeta'

export default function ErrorsPage({ platform = false }: { platform?: boolean }) {
  const navigate = useNavigate()
  const { message } = App.useApp()
  const { can } = useAuth()
  const [status, setStatus] = useState<ErrorStatus | 'all'>('unresolved')
  const [source, setSource] = useState<'server' | 'client' | undefined>()
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState('last_seen')
  const [page, setPage] = useState(1)
  const list = useFetch(useCallback(() => errorsService.list({ status, source, search: search || undefined, sort, page, limit: 25 }, platform), [status, source, search, sort, page, platform]))
  const counts = list.data?.counts ?? {}
  const base = platform ? '/platform/errors' : '/errors'

  const simulate = async (kind: 'generic' | 'type') => {
    try {
      await errorsService.simulate(kind)
    } catch {
      // the 500 is the point — it is now in the inbox
      message.info('A server error was produced — it appears here in a moment.')
      setTimeout(list.reload, 600)
    }
  }

  return (
    <>
      <Flex align="center" gap={12} wrap style={{ marginBottom: 16 }}>
        <div style={{ flex: 1 }}>
          <Flex align="center" gap={6}>
            <Typography.Title level={3} style={{ margin: 0 }}>
              {platform ? 'All production errors' : 'Production errors'}
            </Typography.Title>
            {!platform && <HelpLink article="production-errors" />}
          </Flex>
          <Typography.Text type="secondary">
            Server errors (HTTP 500) and browser crashes, grouped by cause. Turn one into a bug in a click — it resolves when the bug is done and re-opens if it comes back.
          </Typography.Text>
        </div>
        {APP_ENV.isDev && !platform && can(PERMISSIONS.ERRORS_MANAGE) && (
          <Dropdown
            menu={{
              items: [
                { key: 'generic', label: 'Simulate a server error', onClick: () => simulate('generic') },
                { key: 'type', label: 'Simulate a TypeError', onClick: () => simulate('type') },
              ],
            }}
          >
            <Button icon={<ExperimentOutlined />}>Try it (dev)</Button>
          </Dropdown>
        )}
      </Flex>

      <Card>
        <Flex gap={8} wrap align="center" style={{ marginBottom: 16 }}>
          <Segmented
            value={status}
            onChange={(v) => (setStatus(v as ErrorStatus | 'all'), setPage(1))}
            options={(['unresolved', 'resolved', 'ignored', 'all'] as const).map((s) => ({
              value: s,
              label: (
                <span>
                  {s[0]!.toUpperCase() + s.slice(1)}{' '}
                  {s !== 'all' && <Badge count={counts[s] ?? 0} showZero color={s === 'unresolved' ? undefined : '#8c8c8c'} size="small" overflowCount={999} />}
                </span>
              ),
            }))}
          />
          <Select
            allowClear
            placeholder="Source"
            style={{ width: 130 }}
            value={source}
            onChange={(v) => (setSource(v), setPage(1))}
            options={[
              { value: 'server', label: 'Server' },
              { value: 'client', label: 'Browser' },
            ]}
          />
          <Input.Search placeholder="Search message or route" allowClear onSearch={(v) => (setSearch(v.trim()), setPage(1))} style={{ width: 260 }} />
          <div style={{ flex: 1 }} />
          <Select
            value={sort}
            onChange={setSort}
            style={{ width: 170 }}
            options={[
              { value: 'last_seen', label: 'Last seen' },
              { value: 'first_seen', label: 'Newest first' },
              { value: 'occurrences', label: 'Most frequent' },
            ]}
          />
          <Tooltip title="Refresh">
            <Button icon={<ReloadOutlined />} onClick={list.reload} aria-label="Refresh" />
          </Tooltip>
        </Flex>

        <Table<ErrorGroup>
          rowKey="id"
          loading={list.loading}
          dataSource={list.data?.items}
          onRow={(g) => ({ onClick: () => navigate(`${base}/${g.id}`), style: { cursor: 'pointer' } })}
          pagination={{ current: page, pageSize: 25, total: list.data?.total, onChange: setPage, showSizeChanger: false }}
          locale={{ emptyText: status === 'unresolved' ? 'No unresolved errors 🎉' : 'Nothing here' }}
          scroll={{ x: 820 }}
          columns={[
            {
              title: 'Error',
              key: 'title',
              render: (_, g) => (
                <Flex vertical style={{ minWidth: 0 }}>
                  <Flex align="center" gap={6}>
                    <Tag color={g.source === 'server' ? 'purple' : 'cyan'} style={{ marginInlineEnd: 0 }}>
                      {g.source === 'server' ? 'server' : 'browser'}
                    </Tag>
                    {g.regressedAt && g.status === 'unresolved' && (
                      <Tooltip title={`Came back ${new Date(g.regressedAt).toLocaleString()} after being resolved`}>
                        <Tag color="red" style={{ marginInlineEnd: 0 }}>
                          regression
                        </Tag>
                      </Tooltip>
                    )}
                    <Typography.Text strong ellipsis style={{ maxWidth: 560 }}>
                      {g.title}
                    </Typography.Text>
                  </Flex>
                  <Typography.Text type="secondary" ellipsis style={{ fontSize: '0.85em', maxWidth: 620 }}>
                    {g.culprit}
                    {platform && ` · ${g.organizationName ?? 'no organization'}`}
                  </Typography.Text>
                </Flex>
              ),
            },
            { title: 'Events', dataIndex: 'occurrences', width: 90, align: 'right', render: (v: number) => <Typography.Text strong>{v.toLocaleString()}</Typography.Text> },
            { title: 'Users', dataIndex: 'usersAffected', width: 80, align: 'right' },
            {
              title: 'Last seen',
              dataIndex: 'lastSeenAt',
              width: 120,
              render: (v: string, g) => (
                <Tooltip title={`First seen ${new Date(g.firstSeenAt).toLocaleString()}`}>
                  <span>{timeAgo(v)}</span>
                </Tooltip>
              ),
            },
            { title: 'Release', dataIndex: 'lastRelease', width: 100, responsive: ['xl'], render: (v: string | null) => v ?? '—' },
            {
              title: 'Bug',
              key: 'bug',
              width: 130,
              render: (_, g) =>
                g.bug ? (
                  <Tooltip title={`${g.bug.title} — ${g.bug.status.name}`}>
                    <Tag icon={<BugOutlined />} color={g.bug.status.category === 'done' ? 'success' : 'processing'}>
                      {g.bug.key}
                    </Tag>
                  </Tooltip>
                ) : (
                  <Typography.Text type="secondary">—</Typography.Text>
                ),
            },
          ]}
        />
      </Card>
    </>
  )
}
