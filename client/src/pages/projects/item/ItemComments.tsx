import { DeleteOutlined, EditOutlined, SmileOutlined } from '@ant-design/icons'
import { App, Button, Empty, Flex, Input, Popconfirm, Popover, Skeleton, Tag, Tooltip, Typography, theme } from 'antd'
import { useCallback, useRef, useState } from 'react'
import { useFetch } from '../../../hooks/useFetch'
import { useLiveReload } from '../../../hooks/useRealtime'
import { useProject } from '../shared/projectContext'
import { getErrorMessage } from '../../../lib/api'
import { workItemsService } from '../../../services/projects.service'
import type { Comment, PersonOption } from '../../../types/projects'
import { UserAvatar } from '../shared/ItemBits'
import { MarkdownView } from '../shared/Markdown'
import { MentionInput, type MentionInputHandle } from '../shared/MentionInput'

const REACTIONS = ['👍', '👎', '❤️', '🎉', '😄', '😕', '👀', '🚀']

interface Props {
  itemId: number
  canComment: boolean
  people: PersonOption[]
  onActivity: () => void
}

function CommentView({ comment, itemId, onChange, onDelete }: { comment: Comment; itemId: number; onChange: (c: Comment) => void; onDelete: () => void }) {
  const { message } = App.useApp()
  const { token } = theme.useToken()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(comment.body)

  const react = async (emoji: string) => {
    try {
      onChange(await workItemsService.react(itemId, comment.id, emoji))
    } catch (err) {
      message.error(getErrorMessage(err))
    }
  }

  const saveEdit = async () => {
    try {
      onChange(await workItemsService.editComment(itemId, comment.id, draft))
      setEditing(false)
    } catch (err) {
      message.error(getErrorMessage(err))
    }
  }

  return (
    <Flex gap={12} align="flex-start">
      <UserAvatar user={comment.author} size={32} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <Flex gap={8} align="baseline" wrap>
          <Typography.Text strong>{comment.author?.name ?? 'Deleted user'}</Typography.Text>
          <Tooltip title={new Date(comment.createdAt).toLocaleString()}>
            <Typography.Text type="secondary" style={{ fontSize: '0.85em' }}>
              {new Date(comment.createdAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
              {comment.editedAt && ' · edited'}
            </Typography.Text>
          </Tooltip>
          <div style={{ flex: 1 }} />
          {comment.canEdit && !editing && (
            <Button type="text" size="small" icon={<EditOutlined />} onClick={() => setEditing(true)} />
          )}
          {comment.canDelete && (
            <Popconfirm title="Delete this comment?" okText="Delete" okButtonProps={{ danger: true }} onConfirm={onDelete}>
              <Button type="text" size="small" danger icon={<DeleteOutlined />} />
            </Popconfirm>
          )}
        </Flex>
        {editing ? (
          <Flex vertical gap={8} style={{ marginTop: 4 }}>
            <Input.TextArea value={draft} onChange={(e) => setDraft(e.target.value)} autoSize={{ minRows: 2 }} />
            <Flex gap={8}>
              <Button type="primary" size="small" onClick={saveEdit} disabled={!draft.trim()}>
                Save
              </Button>
              <Button size="small" onClick={() => { setEditing(false); setDraft(comment.body) }}>
                Cancel
              </Button>
            </Flex>
          </Flex>
        ) : (
          <div style={{ marginTop: 4, padding: '8px 12px', background: token.colorFillQuaternary, borderRadius: token.borderRadius }}>
            <MarkdownView value={comment.body} />
          </div>
        )}
        <Flex gap={4} wrap style={{ marginTop: 6 }}>
          {comment.reactions.map((r) => (
            <Tooltip key={r.emoji} title={r.users.join(', ')}>
              <Tag.CheckableTag
                checked={r.reacted}
                onChange={() => react(r.emoji)}
                style={{ border: `1px solid ${token.colorBorderSecondary}`, borderRadius: 12 }}
              >
                {r.emoji} {r.count}
              </Tag.CheckableTag>
            </Tooltip>
          ))}
          <Popover
            trigger="click"
            content={
              <Flex gap={4}>
                {REACTIONS.map((e) => (
                  <Button key={e} type="text" onClick={() => react(e)} style={{ fontSize: 18, padding: '0 6px' }}>
                    {e}
                  </Button>
                ))}
              </Flex>
            }
          >
            <Button type="text" size="small" icon={<SmileOutlined />} aria-label="Add reaction" />
          </Popover>
        </Flex>
      </div>
    </Flex>
  )
}

export default function ItemComments({ itemId, canComment, people, onActivity }: Props) {
  const { message } = App.useApp()
  const comments = useFetch(useCallback(() => workItemsService.comments(itemId), [itemId]))
  const { project } = useProject()
  useLiveReload(project.id, comments.reload, ['items'], itemId)
  const [local, setLocal] = useState<Comment[] | null>(null)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const mentionRef = useRef<MentionInputHandle>(null)
  const list = local ?? comments.data

  const send = async () => {
    if (!draft.trim()) return
    setSending(true)
    try {
      const body = mentionRef.current?.encode(draft) ?? draft
      const created = await workItemsService.addComment(itemId, body)
      setLocal([...(list ?? []), created])
      setDraft('')
      mentionRef.current?.reset()
      onActivity()
    } catch (err) {
      message.error(getErrorMessage(err))
    } finally {
      setSending(false)
    }
  }

  if (!list) return <Skeleton active avatar />

  return (
    <Flex vertical gap={20}>
      {list.length === 0 && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No comments yet" />}
      {list.map((c) => (
        <CommentView
          key={c.id}
          comment={c}
          itemId={itemId}
          onChange={(updated) => setLocal(list.map((x) => (x.id === updated.id ? updated : x)))}
          onDelete={async () => {
            try {
              await workItemsService.deleteComment(itemId, c.id)
              setLocal(list.filter((x) => x.id !== c.id))
              onActivity()
            } catch (err) {
              message.error(getErrorMessage(err))
            }
          }}
        />
      ))}
      {canComment && (
        <Flex vertical gap={8}>
          <MentionInput ref={mentionRef} value={draft} onChange={setDraft} people={people} onSubmitShortcut={send} />
          <Flex justify="space-between" align="center">
            <Typography.Text type="secondary" style={{ fontSize: '0.82em' }}>
              Ctrl + Enter to send · @ to mention
            </Typography.Text>
            <Button type="primary" onClick={send} loading={sending} disabled={!draft.trim()}>
              Comment
            </Button>
          </Flex>
        </Flex>
      )}
    </Flex>
  )
}
