// Icons and labels per notification category (no JSX → importable from anywhere).
import { AlertOutlined, BarChartOutlined, CalendarOutlined, CommentOutlined, EyeOutlined, SafetyCertificateOutlined, UserAddOutlined } from '@ant-design/icons'
import type { ComponentType } from 'react'
import type { NotificationCategory } from '../types/notifications'

export const CATEGORY_ICON: Record<NotificationCategory, ComponentType> = {
  assignments: UserAddOutlined,
  mentions: CommentOutlined,
  watching: EyeOutlined,
  qa: SafetyCertificateOutlined,
  leave: CalendarOutlined,
  errors: AlertOutlined,
  reports: BarChartOutlined,
}

export const CATEGORY_LABEL: Record<NotificationCategory, string> = {
  assignments: 'Assignments',
  mentions: 'Mentions',
  watching: 'Watching',
  qa: 'QA',
  leave: 'Leave',
  errors: 'Errors',
  reports: 'Reports',
}

export const timeAgo = (iso: string, now = Date.now()) => {
  const s = Math.max(0, (now - new Date(iso).getTime()) / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)}m`
  if (s < 86400) return `${Math.floor(s / 3600)}h`
  if (s < 7 * 86400) return `${Math.floor(s / 86400)}d`
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
}
