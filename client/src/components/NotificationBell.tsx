// The bell in the header: unread count (live), the latest notifications, mark read, open.
// The tab title shows the count too — "(3) Team-Flex" — so you notice from another tab.
import { BellOutlined, CheckOutlined, SettingOutlined } from '@ant-design/icons'
import { App, Avatar, Badge, Button, Empty, Flex, Popover, Segmented, Spin, Tooltip, Typography, theme } from 'antd'
import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useNotificationsLive } from '../hooks/useRealtime'
import { getErrorMessage } from '../lib/api'
import { notificationsService } from '../services/notifications.service'
import type { AppNotification } from '../types/notifications'
import { CATEGORY_ICON, timeAgo } from './notificationMeta'

export function NotificationBell() {
  const { token } = theme.useToken()
  const { message } = App.useApp()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [filter, setFilter] = useState<'unread' | 'all'>('unread')
  const [unread, setUnread] = useState(0)
  const [items, setItems] = useState<AppNotification[] | null>(null)

  const refreshCount = useCallback(() => {
    notificationsService.unreadCount().then((r) => setUnread(r.unread), () => undefined)
  }, [])
  const loadList = useCallback(() => {
    notificationsService.list({ unread: filter === 'unread', limit: 15 }).then(
      (r) => {
        setItems(r.items)
        setUnread(r.unread)
      },
      () => setItems([]),
    )
  }, [filter])

  useEffect(refreshCount, [refreshCount])
  useEffect(() => {
    if (open) loadList()
  }, [open, loadList])
  useNotificationsLive(() => (open ? loadList() : refreshCount()))

  // "(3) Team-Flex" in the browser tab
  useEffect(() => {
    const base = document.title.replace(/^\(\d+\+?\) /, '')
    document.title = unread ? `(${unread > 99 ? '99+' : unread}) ${base}` : base
  }, [unread])

  const openOne = async (n: AppNotification) => {
    setOpen(false)
    if (!n.readAt) notificationsService.markRead([n.id]).then((r) => setUnread(r.unread), () => undefined)
    navigate(n.url)
  }
  const readAll = async () => {
    try {
      const r = await notificationsService.markAllRead()
      setUnread(r.unread)
      loadList()
    } catch (err) {
      message.error(getErrorMessage(err))
    }
  }

  const content = (
    <div style={{ width: 380, maxWidth: 'calc(100vw - 32px)' }}>
      <Flex align="center" gap={8} style={{ marginBottom: 8 }}>
        <Segmented
          size="small"
          value={filter}
          onChange={(v) => setFilter(v as 'unread' | 'all')}
          options={[
            { value: 'unread', label: `Unread${unread ? ` (${unread})` : ''}` },
            { value: 'all', label: 'All' },
          ]}
        />
        <div style={{ flex: 1 }} />
        <Tooltip title="Mark all as read">
          <Button size="small" type="text" icon={<CheckOutlined />} disabled={!unread} onClick={readAll} aria-label="Mark all as read" />
        </Tooltip>
        <Tooltip title="Notification settings">
          <Button size="small" type="text" icon={<SettingOutlined />} onClick={() => (setOpen(false), navigate('/notifications?tab=settings'))} aria-label="Settings" />
        </Tooltip>
      </Flex>
      <div style={{ maxHeight: 420, overflowY: 'auto', margin: '0 -12px' }}>
        {items === null ? (
          <Flex justify="center" style={{ padding: 24 }}>
            <Spin />
          </Flex>
        ) : items.length === 0 ? (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={filter === 'unread' ? "You're all caught up" : 'No notifications yet'} />
        ) : (
          items.map((n) => {
            const Icon = CATEGORY_ICON[n.category]
            return (
              <Flex
                key={n.id}
                gap={10}
                onClick={() => openOne(n)}
                style={{ padding: '10px 12px', cursor: 'pointer', background: n.readAt ? undefined : token.colorPrimaryBg, borderBottom: `1px solid ${token.colorBorderSecondary}` }}
              >
                <Avatar size={30} icon={<Icon />} style={{ background: token.colorFillSecondary, color: token.colorText, flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <Typography.Text strong={!n.readAt} style={{ display: 'block' }}>
                    {n.title}
                    {n.count > 1 && <Typography.Text type="secondary"> (+{n.count - 1})</Typography.Text>}
                  </Typography.Text>
                  {n.body && (
                    <Typography.Text type="secondary" ellipsis style={{ display: 'block', fontSize: '0.88em' }}>
                      {n.body}
                    </Typography.Text>
                  )}
                </div>
                <Typography.Text type="secondary" style={{ fontSize: '0.8em', whiteSpace: 'nowrap' }}>
                  {timeAgo(n.updatedAt)}
                </Typography.Text>
              </Flex>
            )
          })
        )}
      </div>
      <Button type="link" block onClick={() => (setOpen(false), navigate('/notifications'))} style={{ marginTop: 4 }}>
        View all notifications
      </Button>
    </div>
  )

  return (
    <Popover open={open} onOpenChange={setOpen} trigger="click" placement="bottomRight" content={content} arrow={false}>
      <Button type="text" shape="circle" aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`}>
        <Badge count={unread} size="small" overflowCount={99}>
          <BellOutlined style={{ fontSize: 18 }} />
        </Badge>
      </Button>
    </Popover>
  )
}
