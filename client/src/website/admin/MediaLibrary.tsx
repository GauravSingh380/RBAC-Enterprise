// Images of the website: upload, alt text, delete (refused while used) — and a picker for the section forms.
import { CopyOutlined, DeleteOutlined, PictureOutlined, UploadOutlined } from '@ant-design/icons'
import { App, Button, Card, Empty, Flex, Input, Modal, Popconfirm, Space, Tooltip, Typography, Upload, theme } from 'antd'
import { useCallback, useState } from 'react'
import { useFetch } from '../../hooks/useFetch'
import { getErrorMessage } from '../../lib/api'
import { mediaUrl, websiteAdminApi } from '../api'
import type { MediaItem } from '../types'

const ACCEPT = 'image/png,image/jpeg,image/webp,image/gif'

function UploadButton({ onUploaded }: { onUploaded: (m: MediaItem) => void }) {
  const { message } = App.useApp()
  const [busy, setBusy] = useState(false)
  return (
    <Upload
      accept={ACCEPT}
      showUploadList={false}
      customRequest={async ({ file }) => {
        setBusy(true)
        try {
          const m = await websiteAdminApi.upload(file as File)
          message.success('Image uploaded')
          onUploaded(m)
        } catch (err) {
          message.error(getErrorMessage(err))
        } finally {
          setBusy(false)
        }
      }}
    >
      <Button icon={<UploadOutlined />} loading={busy}>
        Upload image
      </Button>
    </Upload>
  )
}

function Thumb({ m, selected, onClick }: { m: MediaItem; selected?: boolean; onClick?: () => void }) {
  const { token } = theme.useToken()
  return (
    <button
      type="button"
      onClick={onClick}
      title={m.fileName}
      style={{
        display: 'block', width: '100%', padding: 0, cursor: onClick ? 'pointer' : 'default', background: token.colorFillQuaternary,
        border: `2px solid ${selected ? token.colorPrimary : token.colorBorderSecondary}`, borderRadius: 10, overflow: 'hidden', aspectRatio: '4 / 3',
      }}
    >
      <img src={mediaUrl(m.id)} alt={m.altText ?? m.fileName} loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
    </button>
  )
}

/** Platform → Website → Images */
export function MediaLibrary() {
  const { message } = App.useApp()
  const media = useFetch(useCallback(() => websiteAdminApi.media(), []))

  const remove = async (m: MediaItem) => {
    try {
      await websiteAdminApi.deleteMedia(m.id)
      message.success('Image deleted')
      media.reload()
    } catch (err) {
      message.error(getErrorMessage(err))
    }
  }
  const saveAlt = async (m: MediaItem, altText: string) => {
    try {
      await websiteAdminApi.updateMedia(m.id, altText.trim() || null)
      media.reload()
    } catch (err) {
      message.error(getErrorMessage(err))
    }
  }

  return (
    <Card>
      <Flex justify="space-between" align="center" gap={12} wrap style={{ marginBottom: 16 }}>
        <Typography.Text type="secondary">PNG, JPG, WebP or GIF, up to 5 MB. Use them in any section with “Choose image”.</Typography.Text>
        <UploadButton onUploaded={media.reload} />
      </Flex>
      {media.data?.length === 0 ? (
        <Empty image={<PictureOutlined style={{ fontSize: 48, opacity: 0.4 }} />} description="No images yet — sections show a drawn product preview until you add one." />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 16 }}>
          {(media.data ?? []).map((m) => (
            <div key={m.id}>
              <Thumb m={m} />
              <Typography.Text ellipsis style={{ display: 'block', marginTop: 6 }} title={m.fileName}>{m.fileName}</Typography.Text>
              <Typography.Text type="secondary" style={{ fontSize: '0.8em' }}>{Math.round(m.sizeBytes / 1024)} KB · #{m.id}</Typography.Text>
              <Input
                size="small"
                placeholder="Alt text (describe the image)"
                defaultValue={m.altText ?? ''}
                onBlur={(e) => e.target.value !== (m.altText ?? '') && saveAlt(m, e.target.value)}
                style={{ marginTop: 6 }}
                maxLength={255}
              />
              <Space size={0} style={{ marginTop: 4 }}>
                <Tooltip title="Copy the image address">
                  <Button
                    type="text"
                    size="small"
                    icon={<CopyOutlined />}
                    onClick={() => void navigator.clipboard?.writeText(new URL(mediaUrl(m.id), window.location.origin).toString())}
                    aria-label="Copy image address"
                  />
                </Tooltip>
                <Popconfirm title="Delete this image?" description="Refused while a page or the header uses it." onConfirm={() => remove(m)}>
                  <Button type="text" size="small" danger icon={<DeleteOutlined />} aria-label={`Delete ${m.fileName}`} />
                </Popconfirm>
              </Space>
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}

/** Form field: an image from the library (value = media id, or null for the drawn preview / none). */
export function MediaField({ value, onChange, emptyLabel = 'No image' }: { value?: number | null; onChange?: (v: number | null) => void; emptyLabel?: string }) {
  const { token } = theme.useToken()
  const [open, setOpen] = useState(false)
  return (
    <Flex gap={12} align="center">
      <div style={{ width: 96, height: 64, borderRadius: 8, overflow: 'hidden', background: token.colorFillTertiary, display: 'grid', placeItems: 'center', flex: 'none' }}>
        {value ? <img src={mediaUrl(value)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <PictureOutlined style={{ opacity: 0.4 }} />}
      </div>
      <Space wrap>
        <Button size="small" onClick={() => setOpen(true)}>{value ? 'Change image' : 'Choose image'}</Button>
        {value ? <Button size="small" type="text" danger onClick={() => onChange?.(null)}>Remove</Button> : <Typography.Text type="secondary" style={{ fontSize: '0.85em' }}>{emptyLabel}</Typography.Text>}
      </Space>
      {open && <MediaPicker current={value ?? null} onClose={() => setOpen(false)} onPick={(id) => (onChange?.(id), setOpen(false))} />}
    </Flex>
  )
}

function MediaPicker({ current, onClose, onPick }: { current: number | null; onClose: () => void; onPick: (id: number) => void }) {
  const media = useFetch(useCallback(() => websiteAdminApi.media(), []))
  return (
    <Modal open title="Choose an image" onCancel={onClose} footer={null} width={760}>
      <Flex justify="end" style={{ marginBottom: 12 }}>
        <UploadButton onUploaded={(m) => onPick(m.id)} />
      </Flex>
      {media.data?.length === 0 ? (
        <Empty description="No images yet — upload one" />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 12, maxHeight: 460, overflowY: 'auto' }}>
          {(media.data ?? []).map((m) => (
            <Thumb key={m.id} m={m} selected={m.id === current} onClick={() => onPick(m.id)} />
          ))}
        </div>
      )}
    </Modal>
  )
}
