// Platform → Website: the platform owner edits the public pages (Home, Features, Pricing), the header & footer,
// and the images. Changes are drafts until published.
import { ExportOutlined } from '@ant-design/icons'
import { Badge, Button, Tabs } from 'antd'
import { useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { PageHeader } from '../../components/ui'
import { useFetch } from '../../hooks/useFetch'
import { websiteAdminApi } from '../api'
import { InquiriesInbox } from './InquiriesInbox'
import { MediaLibrary } from './MediaLibrary'
import { PageEditor } from './PageEditor'
import { SettingsEditor } from './SettingsEditor'

export default function WebsiteAdminPage() {
  const pages = useFetch(useCallback(() => websiteAdminApi.pages(), []))
  const settings = useFetch(useCallback(() => websiteAdminApi.settings(), []))
  const inbox = useFetch(useCallback(() => websiteAdminApi.inquiries({ status: 'new', limit: 1 }), []))
  const [params, setParams] = useSearchParams()
  const tab = params.get('tab') ?? 'home'
  const refresh = () => {
    pages.reload()
    settings.reload()
    inbox.reload()
  }
  const label = (text: string, changed?: boolean) => (changed ? <Badge dot offset={[6, 0]}>{text}</Badge> : text)

  return (
    <>
      <PageHeader
        title="Website"
        description="The public pages every visitor sees. Edit sections, reorder them, change images — then publish. Nothing changes for visitors until you publish."
        actions={
          <a href="/" target="_blank" rel="noreferrer">
            <Button icon={<ExportOutlined />}>Open website</Button>
          </a>
        }
      />
      <Tabs
        activeKey={tab}
        onChange={(t) => setParams({ tab: t }, { replace: true })}
        destroyOnHidden
        items={[
          ...(pages.data ?? []).map((p) => ({ key: p.slug, label: label(p.title, p.hasChanges), children: <PageEditor slug={p.slug} onChanged={refresh} /> })),
          { key: 'settings', label: label('Header & footer', settings.data?.hasChanges), children: <SettingsEditor onChanged={refresh} /> },
          { key: 'media', label: 'Images', children: <MediaLibrary /> },
          {
            key: 'inquiries',
            label: (
              <Badge count={inbox.data?.counts.new ?? 0} size="small" offset={[10, 0]}>
                Inquiries
              </Badge>
            ),
            children: <InquiriesInbox onChanged={inbox.reload} />,
          },
        ]}
      />
    </>
  )
}
