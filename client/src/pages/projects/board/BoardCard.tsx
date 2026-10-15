// One work item card on the board (draggable).
import { CheckSquareOutlined, CommentOutlined, NodeIndexOutlined } from '@ant-design/icons'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Card, Flex, Space, Tag, Tooltip, Typography, theme } from 'antd'
import { memo } from 'react'
import type { WorkItemSummary } from '../../../types/projects'
import { isOverdue } from '../shared/itemMeta'
import { ItemTypeIcon, PriorityIcon, UserAvatar } from '../shared/ItemBits'

interface CardProps {
  item: WorkItemSummary
  onOpen?: (item: WorkItemSummary) => void
  overlay?: boolean
}

export const BoardCardView = memo(function BoardCardView({ item, onOpen, overlay }: CardProps) {
  const { token } = theme.useToken()
  const done = item.status.category === 'done'
  return (
    <Card
      size="small"
      hoverable
      onClick={() => onOpen?.(item)}
      style={{ cursor: overlay ? 'grabbing' : 'pointer', boxShadow: overlay ? token.boxShadowSecondary : undefined }}
      styles={{ body: { padding: 10 } }}
    >
      <Typography.Paragraph
        ellipsis={{ rows: 3 }}
        style={{ marginBottom: 8, textDecoration: done ? 'line-through' : undefined, opacity: done ? 0.7 : 1 }}
      >
        {item.title}
      </Typography.Paragraph>
      {item.labels.length > 0 && (
        <Space size={4} wrap style={{ marginBottom: 8 }}>
          {item.labels.map((l) => (
            <Tag key={l.id} color={l.color} style={{ marginInlineEnd: 0, fontSize: '0.75em', lineHeight: '16px' }}>
              {l.name}
            </Tag>
          ))}
        </Space>
      )}
      <Flex align="center" gap={6}>
        <ItemTypeIcon type={item.type} size={12} />
        <Typography.Text type="secondary" style={{ fontSize: '0.82em', whiteSpace: 'nowrap' }}>
          {item.key}
        </Typography.Text>
        <PriorityIcon priority={item.priority} />
        {item.childCount > 0 && (
          <Typography.Text type="secondary" style={{ fontSize: '0.8em' }}>
            <NodeIndexOutlined /> {item.childCount}
          </Typography.Text>
        )}
        {item.commentCount > 0 && (
          <Typography.Text type="secondary" style={{ fontSize: '0.8em' }}>
            <CommentOutlined /> {item.commentCount}
          </Typography.Text>
        )}
        {item.checklist.total > 0 && (
          <Tooltip title="Checklist">
            <Typography.Text type={item.checklist.done === item.checklist.total ? 'success' : 'secondary'} style={{ fontSize: '0.8em' }}>
              <CheckSquareOutlined /> {item.checklist.done}/{item.checklist.total}
            </Typography.Text>
          </Tooltip>
        )}
        {item.dueDate && isOverdue(item.dueDate, item.status.category) && (
          <Tooltip title={`Due ${new Date(`${item.dueDate}T00:00:00`).toLocaleDateString()}`}>
            <Tag color="red" style={{ marginInlineEnd: 0, fontSize: '0.72em', lineHeight: '16px' }}>
              overdue
            </Tag>
          </Tooltip>
        )}
        <div style={{ flex: 1 }} />
        {item.estimate !== null && (
          <Tooltip title="Estimate (points)">
            <Tag style={{ marginInlineEnd: 0, borderRadius: 10, fontSize: '0.75em', lineHeight: '16px' }}>{item.estimate}</Tag>
          </Tooltip>
        )}
        <UserAvatar user={item.assignee} size={22} />
      </Flex>
    </Card>
  )
})

/** Sortable wrapper: the whole card is the drag handle (keyboard: focus + space, arrows, space). */
export function BoardCard({ item, onOpen, disabled }: CardProps & { disabled?: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id, disabled })
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.35 : 1 }}
      {...attributes}
      {...listeners}
      aria-label={`${item.key} ${item.title}`}
    >
      <BoardCardView item={item} onOpen={onOpen} />
    </div>
  )
}
