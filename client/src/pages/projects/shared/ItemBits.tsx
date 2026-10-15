// Small presentational pieces reused across lists, boards and the item page.
import { Avatar, Tag, Tooltip, Typography } from 'antd'
import type { CSSProperties } from 'react'
import type { ItemType, Priority, StatusRef, UserRef } from '../../../types/projects'
import { priorityMeta, typeMeta } from './itemMeta'

export function ItemTypeIcon({ type, size = 16 }: { type: ItemType; size?: number }) {
  const meta = typeMeta(type)
  const Icon = meta.icon
  return (
    <Tooltip title={meta.label}>
      <span
        style={{
          display: 'inline-grid',
          placeItems: 'center',
          width: size + 6,
          height: size + 6,
          borderRadius: 5,
          background: `${meta.color}1f`,
          color: meta.color,
          fontSize: size * 0.8,
          flexShrink: 0,
        }}
      >
        <Icon />
      </span>
    </Tooltip>
  )
}

export function PriorityIcon({ priority, showLabel = false }: { priority: Priority; showLabel?: boolean }) {
  const meta = priorityMeta(priority)
  const Icon = meta.icon
  const style: CSSProperties = { color: meta.color, transform: priority === 'urgent' ? 'rotate(-90deg)' : undefined, display: 'inline-block' }
  return (
    <Tooltip title={showLabel ? undefined : `${meta.label} priority`}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        <span style={style}>
          <Icon />
        </span>
        {showLabel && meta.label}
      </span>
    </Tooltip>
  )
}

export function StatusTag({ status }: { status: Pick<StatusRef, 'name' | 'color'> }) {
  return (
    <Tag variant="filled" style={{ background: `${status.color}22`, color: status.color, fontWeight: 500, marginInlineEnd: 0 }}>
      <span style={{ display: 'inline-block', width: 7, height: 7, borderRadius: '50%', background: status.color, marginRight: 6 }} />
      {status.name}
    </Tag>
  )
}

const AVATAR_COLORS = ['#3e63dd', '#8e4ec6', '#30a46c', '#e5484d', '#f76b15', '#0d9ab8', '#d6409f', '#ad7f58']

export function UserAvatar({ user, size = 24, showName = false }: { user: UserRef | null; size?: number; showName?: boolean }) {
  if (!user) {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
        <Avatar size={size} style={{ border: '1px dashed #8b8d98', background: 'transparent', color: '#8b8d98', fontSize: size * 0.45 }}>
          ?
        </Avatar>
        {showName && <Typography.Text type="secondary">Unassigned</Typography.Text>}
      </span>
    )
  }
  const avatar = (
    <Avatar size={size} style={{ background: AVATAR_COLORS[user.id % AVATAR_COLORS.length], fontSize: size * 0.45, flexShrink: 0 }}>
      {user.name.charAt(0).toUpperCase()}
    </Avatar>
  )
  if (!showName) return <Tooltip title={user.name}>{avatar}</Tooltip>
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
      {avatar}
      <Typography.Text ellipsis>{user.name}</Typography.Text>
    </span>
  )
}
