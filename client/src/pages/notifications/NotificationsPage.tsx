// /notifications — every notification (filter, mark read / unread) and the settings per category.
import { CheckOutlined } from '@ant-design/icons'
import { App, Avatar, Button, Card, Empty, Flex, List, Segmented, Select, Switch, Table, Tabs, Tag, Tooltip, Typography, theme } from 'antd'
import { useCallback, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { CATEGORY_ICON, CATEGORY_LABEL, timeAgo } from '../../components/notificationMeta'
import { PageHeader } from '../../components/ui'
import { useFetch } from '../../hooks/useFetch'
import { useNotificationsLive } from '../../hooks/useRealtime'
import { getErrorMessage } from '../../lib/api'
import { notificationsService } from '../../services/notifications.service'
import type { AppNotification, EmailMode, NotificationCategory, NotificationPreference } from '../../types/notifications'

export default function NotificationsPage() {
  const [params, setParams] = useSearchParams()
  const tab = params.get('tab') === 'settings' ? 'settings' : 'inbox'
  return (
    <>
      <PageHeader help="notifications" title="Notifications" description="What happened while you were away — and how you want to hear about it." />
      <Tabs
        activeKey={tab}
        onChange={(k) => setParams(k === 'settings' ? { tab: 'settings' } : {}, { replace: true })}
        items={[
          { key: 'inbox', label: 'Inbox', children: <Inbox /> },
          { key: 'settings', label: 'Settings', children: <Settings /> },
        ]}
      />
    </>
  )
}

function Inbox() {
  const { token } = theme.useToken()
  const { message } = App.useApp()
  const navigate = useNavigate()
  const [unreadOnly, setUnreadOnly] = useState(false)
  const [category, setCategory] = useState<NotificationCategory | undefined>()
  const [page, setPage] = useState(1)
  const list = useFetch(useCallback(() => notificationsService.list({ unread: unreadOnly, category, page, limit: 30 }), [unreadOnly, category, page]))
  useNotificationsLive(list.reload)

  const act = async (fn: () => Promise<unknown>) => {
    try {
      await fn()
      list.reload()
    } catch (err) {
      message.error(getErrorMessage(err))
    }
  }

  return (
    <Card>
      <Flex gap={8} wrap align="center" style={{ marginBottom: 12 }}>
        <Segmented value={unreadOnly ? 'unread' : 'all'} onChange={(v) => (setUnreadOnly(v === 'unread'), setPage(1))} options={[{ value: 'all', label: 'All' }, { value: 'unread', label: `Unread (${list.data?.unread ?? 0})` }]} />
        <Select
          allowClear
          placeholder="Category"
          style={{ width: 160 }}
          value={category}
          onChange={(v) => (setCategory(v), setPage(1))}
          options={(Object.keys(CATEGORY_LABEL) as NotificationCategory[]).map((c) => ({ value: c, label: CATEGORY_LABEL[c] }))}
        />
        <div style={{ flex: 1 }} />
        <Button icon={<CheckOutlined />} disabled={!list.data?.unread} onClick={() => act(() => notificationsService.markAllRead())}>
          Mark all as read
        </Button>
      </Flex>
      <List<AppNotification>
        loading={list.loading}
        dataSource={list.data?.items ?? []}
        locale={{ emptyText: <Empty description={unreadOnly ? "You're all caught up 🎉" : 'No notifications yet'} /> }}
        pagination={list.data && list.data.total > 30 ? { current: page, pageSize: 30, total: list.data.total, onChange: setPage, showSizeChanger: false } : false}
        renderItem={(n) => {
          const Icon = CATEGORY_ICON[n.category]
          return (
            <List.Item
              style={{ background: n.readAt ? undefined : token.colorPrimaryBg, paddingInline: 12, borderRadius: 6, cursor: 'pointer' }}
              onClick={() => {
                if (!n.readAt) void notificationsService.markRead([n.id])
                navigate(n.url)
              }}
              actions={[
                <Tooltip key="r" title={n.readAt ? 'Mark as unread' : 'Mark as read'}>
                  <Button
                    size="small"
                    type="text"
                    onClick={(e) => {
                      e.stopPropagation()
                      void act(() => (n.readAt ? notificationsService.markUnread(n.id) : notificationsService.markRead([n.id])))
                    }}
                  >
                    {n.readAt ? 'Unread' : 'Read'}
                  </Button>
                </Tooltip>,
              ]}
            >
              <List.Item.Meta
                avatar={<Avatar icon={<Icon />} style={{ background: token.colorFillSecondary, color: token.colorText }} />}
                title={
                  <Flex gap={8} align="center" wrap>
                    <Typography.Text strong={!n.readAt}>{n.title}</Typography.Text>
                    {n.count > 1 && <Tag style={{ marginInlineEnd: 0 }}>×{n.count}</Tag>}
                    <Tag style={{ marginInlineEnd: 0 }}>{CATEGORY_LABEL[n.category]}</Tag>
                  </Flex>
                }
                description={
                  <>
                    {n.body && <Typography.Text type="secondary">{n.body} · </Typography.Text>}
                    <Tooltip title={new Date(n.updatedAt).toLocaleString()}>
                      <Typography.Text type="secondary">{timeAgo(n.updatedAt)}</Typography.Text>
                    </Tooltip>
                  </>
                }
              />
            </List.Item>
          )
        }}
      />
    </Card>
  )
}

function Settings() {
  const { message } = App.useApp()
  const prefs = useFetch(useCallback(() => notificationsService.preferences(), []))
  const save = async (p: NotificationPreference, change: Partial<Pick<NotificationPreference, 'inApp' | 'email'>>) => {
    try {
      await notificationsService.savePreferences([{ category: p.category, inApp: change.inApp ?? p.inApp, email: change.email ?? p.email }])
      message.success('Saved')
      prefs.reload()
    } catch (err) {
      message.error(getErrorMessage(err))
    }
  }
  return (
    <Card>
      <Typography.Paragraph type="secondary" style={{ marginTop: 0 }}>
        <b>Instant</b> emails wait a minute and are skipped if you already saw the notification in the app. <b>Daily</b> collects everything unread
        into one email at 08:00. You never get notified about your own actions. These settings apply to this organization.
      </Typography.Paragraph>
      <Table<NotificationPreference>
        rowKey="category"
        loading={prefs.loading}
        dataSource={prefs.data ?? []}
        pagination={false}
        columns={[
          {
            title: 'What',
            key: 'what',
            render: (_, p) => (
              <div>
                <Typography.Text strong>{p.label}</Typography.Text>
                <br />
                <Typography.Text type="secondary">{p.description}</Typography.Text>
              </div>
            ),
          },
          {
            title: 'In the app',
            key: 'inApp',
            width: 120,
            render: (_, p) =>
              p.category === 'reports' ? (
                <Typography.Text type="secondary">email only</Typography.Text>
              ) : (
                <Switch checked={p.inApp} onChange={(inApp) => save(p, { inApp })} aria-label={`${p.label} in the app`} />
              ),
          },
          {
            title: 'Email',
            key: 'email',
            width: 170,
            render: (_, p) => (
              <Select<EmailMode>
                value={p.email}
                style={{ width: 150 }}
                onChange={(email) => save(p, { email })}
                options={
                  p.category === 'reports'
                    ? [
                        { value: 'instant', label: 'Every Monday' },
                        { value: 'off', label: 'Off' },
                      ]
                    : [
                        { value: 'instant', label: 'Instantly' },
                        { value: 'daily', label: 'Daily digest' },
                        { value: 'off', label: 'Off' },
                      ]
                }
              />
            ),
          },
        ]}
      />
    </Card>
  )
}
