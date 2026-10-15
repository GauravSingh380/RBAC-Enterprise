import { DeleteOutlined, DownloadOutlined, FileOutlined, InboxOutlined, PaperClipOutlined } from '@ant-design/icons'
import { App, Button, Card, Flex, Image, Popconfirm, Progress, Skeleton, Tooltip, Typography, Upload, theme } from 'antd'
import { useCallback, useEffect, useState } from 'react'
import { useFetch } from '../../../hooks/useFetch'
import { getErrorMessage, saveBlob } from '../../../lib/api'
import { workItemsService } from '../../../services/projects.service'
import type { Attachment } from '../../../types/projects'
import { formatBytes } from '../shared/itemMeta'

const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp']

/** Images need the auth header, so they are fetched as blobs and shown through object URLs. */
function Thumb({ itemId, att }: { itemId: number; att: Attachment }) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    let objectUrl: string | null = null
    let active = true
    workItemsService
      .download(itemId, att.id, true)
      .then((blob) => {
        if (!active) return
        objectUrl = URL.createObjectURL(blob)
        setUrl(objectUrl)
      })
      .catch(() => undefined)
    return () => {
      active = false
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [itemId, att.id])
  if (!url) return <Skeleton.Image active style={{ width: 56, height: 56 }} />
  return <Image src={url} width={56} height={56} style={{ objectFit: 'cover', borderRadius: 6 }} />
}

export default function ItemAttachments({ itemId, canEdit, onActivity }: { itemId: number; canEdit: boolean; onActivity: () => void }) {
  const { message } = App.useApp()
  const { token } = theme.useToken()
  const loaded = useFetch(useCallback(() => workItemsService.attachments(itemId), [itemId]))
  const [local, setLocal] = useState<Attachment[] | null>(null)
  const [progress, setProgress] = useState<number | null>(null)
  const list = local ?? loaded.data

  const download = async (att: Attachment) => {
    try {
      saveBlob(await workItemsService.download(itemId, att.id), att.fileName)
    } catch (err) {
      message.error(getErrorMessage(err))
    }
  }

  const remove = async (att: Attachment) => {
    try {
      await workItemsService.deleteAttachment(itemId, att.id)
      setLocal((list ?? []).filter((a) => a.id !== att.id))
      onActivity()
    } catch (err) {
      message.error(getErrorMessage(err))
    }
  }

  return (
    <Card
      size="small"
      title={
        <span>
          <PaperClipOutlined /> Attachments {list ? `(${list.length})` : ''}
        </span>
      }
    >
      {canEdit && (
        <Upload.Dragger
          multiple
          showUploadList={false}
          customRequest={async ({ file, onSuccess, onError }) => {
            try {
              setProgress(0)
              const updated = await workItemsService.upload(itemId, file as File, setProgress)
              setLocal(updated)
              onSuccess?.(updated)
              onActivity()
            } catch (err) {
              message.error(getErrorMessage(err))
              onError?.(err as Error)
            } finally {
              setProgress(null)
            }
          }}
          style={{ marginBottom: list?.length ? 12 : 0 }}
        >
          <p style={{ margin: 0 }}>
            <InboxOutlined style={{ fontSize: 22, color: token.colorPrimary }} />
          </p>
          <Typography.Text type="secondary">Drop files here or click to upload (max 10 MB)</Typography.Text>
          {progress !== null && <Progress percent={progress} size="small" style={{ margin: '8px 16px 0' }} />}
        </Upload.Dragger>
      )}
      {!list ? (
        <Skeleton active />
      ) : (
        <Flex vertical gap={8}>
          {list.map((att) => (
            <Flex key={att.id} align="center" gap={12} style={{ padding: 6, borderRadius: 8, border: `1px solid ${token.colorBorderSecondary}` }}>
              {IMAGE_TYPES.includes(att.mimeType) ? (
                <Thumb itemId={itemId} att={att} />
              ) : (
                <Flex align="center" justify="center" style={{ width: 56, height: 56, borderRadius: 6, background: token.colorFillTertiary, fontSize: 22 }}>
                  <FileOutlined />
                </Flex>
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <Typography.Link ellipsis onClick={() => download(att)} style={{ display: 'block' }}>
                  {att.fileName}
                </Typography.Link>
                <Typography.Text type="secondary" style={{ fontSize: '0.85em' }}>
                  {formatBytes(att.sizeBytes)} · {att.uploadedBy?.name ?? 'Someone'} · {new Date(att.createdAt).toLocaleDateString()}
                </Typography.Text>
              </div>
              <Tooltip title="Download">
                <Button type="text" icon={<DownloadOutlined />} onClick={() => download(att)} />
              </Tooltip>
              {att.canDelete && (
                <Popconfirm title={`Delete ${att.fileName}?`} okText="Delete" okButtonProps={{ danger: true }} onConfirm={() => remove(att)}>
                  <Button type="text" danger icon={<DeleteOutlined />} />
                </Popconfirm>
              )}
            </Flex>
          ))}
        </Flex>
      )}
    </Card>
  )
}
