// /my-work — everything waiting for me, across all projects: my items (overdue → later),
// bugs waiting for my QA verdict, leave requests I can decide, unread @mentions. Live.
import { CheckOutlined } from '@ant-design/icons'
import { App, Button, Card, Col, Empty, Flex, Row, Segmented, Skeleton, Statistic, Tag, Typography, theme } from 'antd'
import { useCallback, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { PageHeader } from '../../components/ui'
import { useFetch } from '../../hooks/useFetch'
import { useNotificationsLive } from '../../hooks/useRealtime'
import { getErrorMessage } from '../../lib/api'
import { leaveService } from '../../services/leave.service'
import { notificationsService } from '../../services/notifications.service'
import { myWorkService } from '../../services/people.service'
import type { WorkItemSummary } from '../../types/projects'
import { describeLeaveDates } from '../leave/leaveMeta'
import { ItemTypeIcon, PriorityIcon, StatusTag } from '../projects/shared/ItemBits'
import { MyCalendar } from './MyCalendar'
import { groupByDue } from './myWorkMeta'

const projectKeyOf = (itemKey: string) => itemKey.slice(0, itemKey.lastIndexOf('-'))
const itemUrl = (i: WorkItemSummary) => `/projects/${projectKeyOf(i.key)}/items/${i.number}`

export default function MyWorkPage() {
  const { message } = App.useApp()
  const { token } = theme.useToken()
  const [view, setView] = useState<'list' | 'calendar'>('list')
  const navigate = useNavigate()
  // dates are taken when the data is loaded (not during render)
  const work = useFetch(
    useCallback(
      () =>
        myWorkService.get().then((w) => {
          const today = new Date().toISOString().slice(0, 10)
          const in7 = new Date(Date.now() + 6 * 86_400_000).toISOString().slice(0, 10)
          return { ...w, groups: groupByDue(w.assigned, today, in7) }
        }),
      [],
    ),
  )
  useNotificationsLive(work.reload) // assignments, mentions, leave requests arrive as notifications
  const w = work.data

  const groups = w?.groups ?? []

  const approve = async (id: number, name: string) => {
    try {
      await leaveService.approve(id)
      message.success(`Approved for ${name}`)
      work.reload()
    } catch (err) {
      message.error(getErrorMessage(err))
    }
  }

  return (
    <>
      <PageHeader
        help="my-work"
        title="My work"
        description="Everything waiting for you, across all projects."
        actions={
          <Segmented
            value={view}
            onChange={(v) => setView(v as 'list' | 'calendar')}
            options={[
              { value: 'list', label: 'List' },
              { value: 'calendar', label: 'Calendar' },
            ]}
          />
        }
      />
      {view === 'calendar' ? (
        <MyCalendar />
      ) : !w ? (
        <Skeleton active paragraph={{ rows: 10 }} />
      ) : (
        <>
          <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
            {[
              { title: 'Assigned to me', value: w.counts.assigned, hint: `${w.counts.inProgress} in progress` },
              { title: 'Overdue', value: w.counts.overdue, hint: `${w.counts.dueToday} due today`, danger: w.counts.overdue > 0 },
              { title: 'Waiting for my QA', value: w.counts.qa, hint: 'bugs ready for a verdict' },
              { title: 'Leave to approve', value: w.counts.leave, hint: `${w.counts.mentions} unread mention(s)` },
            ].map((t) => (
              <Col key={t.title} xs={12} lg={6}>
                <Card size="small">
                  <Statistic title={t.title} value={t.value} styles={t.danger ? { content: { color: token.colorError } } : undefined} />
                  <Typography.Text type="secondary" style={{ fontSize: '0.85em' }}>
                    {t.hint}
                  </Typography.Text>
                </Card>
              </Col>
            ))}
          </Row>

          <Row gutter={[16, 16]}>
            <Col xs={24} xl={15}>
              <Card title="Assigned to me" size="small">
                {!w.assigned.length ? (
                  <Empty description="Nothing assigned to you 🎉" />
                ) : (
                  groups
                    .filter((g) => g.items.length)
                    .map((g) => (
                      <div key={g.key} style={{ marginBottom: 16 }}>
                        <Typography.Text strong type={g.danger ? 'danger' : undefined}>
                          {g.title} ({g.items.length})
                        </Typography.Text>
                        {g.items.map((i) => (
                          <ItemRow key={i.id} item={i} onOpen={() => navigate(itemUrl(i))} overdue={!!g.danger} />
                        ))}
                      </div>
                    ))
                )}
              </Card>
            </Col>
            <Col xs={24} xl={9}>
              <Flex vertical gap={16}>
                <Card title={`Waiting for my QA (${w.qa.length})`} size="small">
                  {!w.qa.length ? (
                    <Typography.Text type="secondary">No bugs waiting for your verdict.</Typography.Text>
                  ) : (
                    w.qa.map((i) => <ItemRow key={i.id} item={i} onOpen={() => navigate(itemUrl(i))} />)
                  )}
                </Card>

                <Card title={`Leave to approve (${w.leave.length})`} size="small" extra={w.leave.length > 0 && <Link to="/leave/approvals">All requests</Link>}>
                  {!w.leave.length ? (
                    <Typography.Text type="secondary">Nothing to approve.</Typography.Text>
                  ) : (
                    w.leave.map((l) => (
                      <Flex key={l.id} align="center" gap={8} style={{ padding: '6px 0' }}>
                        <span style={{ width: 8, height: 8, borderRadius: 2, background: l.color, flexShrink: 0 }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <Typography.Text strong>{l.user.name}</Typography.Text>
                          <Typography.Text type="secondary" style={{ display: 'block', fontSize: '0.85em' }}>
                            {l.typeName} · {describeLeaveDates(l.startDate, l.endDate, l.portion as 'full')} · {l.days} d
                          </Typography.Text>
                        </div>
                        <Button size="small" type="primary" icon={<CheckOutlined />} onClick={() => approve(l.id, l.user.name)}>
                          Approve
                        </Button>
                      </Flex>
                    ))
                  )}
                </Card>

                <Card title={`Mentions (${w.mentions.length})`} size="small">
                  {!w.mentions.length ? (
                    <Typography.Text type="secondary">No unread mentions.</Typography.Text>
                  ) : (
                    w.mentions.map((m) => (
                      <div key={m.id} style={{ padding: '6px 0' }}>
                        <a
                          onClick={() => {
                            void notificationsService.markRead([m.id])
                            navigate(m.url)
                          }}
                        >
                          {m.title}
                        </a>
                        {m.body && (
                          <Typography.Text type="secondary" ellipsis style={{ display: 'block', fontSize: '0.85em' }}>
                            {m.body}
                          </Typography.Text>
                        )}
                      </div>
                    ))
                  )}
                </Card>
              </Flex>
            </Col>
          </Row>
        </>
      )}
    </>
  )
}

function ItemRow({ item, onOpen, overdue }: { item: WorkItemSummary; onOpen: () => void; overdue?: boolean }) {
  const { token } = theme.useToken()
  return (
    <Flex align="center" gap={8} onClick={onOpen} style={{ padding: '7px 4px', cursor: 'pointer', borderBottom: `1px solid ${token.colorBorderSecondary}` }}>
      <ItemTypeIcon type={item.type} size={12} />
      <Typography.Text type="secondary" style={{ whiteSpace: 'nowrap', fontSize: '0.85em' }}>
        {item.key}
      </Typography.Text>
      <Typography.Text ellipsis style={{ flex: 1, minWidth: 0 }}>
        {item.title}
      </Typography.Text>
      <PriorityIcon priority={item.priority} />
      {item.dueDate && (
        <Tag color={overdue ? 'red' : undefined} style={{ marginInlineEnd: 0 }}>
          {new Date(`${item.dueDate}T00:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
        </Tag>
      )}
      <StatusTag status={item.status} />
    </Flex>
  )
}
