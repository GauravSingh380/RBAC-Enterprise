// One public page (home / features / pricing): its published sections, plus the browser title and description.
import { Button, Result, Skeleton } from 'antd'
import { useCallback, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useFetch } from '../../hooks/useFetch'
import { websiteApi } from '../api'
import { SectionList } from '../sections/SectionRenderer'

/** Sets <title> and the meta description (search engines and link previews read them). */
function useSeo(title: string | undefined, description: string | null | undefined) {
  useEffect(() => {
    if (!title) return
    const previous = document.title
    document.title = title
    let meta = document.querySelector<HTMLMetaElement>('meta[name="description"]')
    if (!meta) {
      meta = document.createElement('meta')
      meta.name = 'description'
      document.head.appendChild(meta)
    }
    const previousDescription = meta.content
    meta.content = description ?? ''
    return () => {
      document.title = previous
      if (meta) meta.content = previousDescription
    }
  }, [title, description])
}

export default function WebsitePage({ slug }: { slug: string }) {
  const page = useFetch(useCallback(() => websiteApi.page(slug), [slug]))
  useSeo(page.data ? (page.data.seoTitle ?? page.data.title) : undefined, page.data?.seoDescription)

  if (page.error) {
    return (
      <Result
        status="404"
        title="This page isn't available"
        extra={<Link to="/login"><Button type="primary">Log in</Button></Link>}
        style={{ padding: '96px 16px' }}
      />
    )
  }
  if (!page.data) return <Skeleton active paragraph={{ rows: 12 }} style={{ maxWidth: 1160, margin: '64px auto', padding: '0 16px' }} />
  return <SectionList sections={page.data.sections} />
}
