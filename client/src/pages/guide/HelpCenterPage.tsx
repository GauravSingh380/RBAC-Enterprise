// /guide and /guide/:slug — the Help Center (product guide written by the platform owner).
//   home     getting-started checklist (owners / admins) + every section with its articles
//   ?q=      search results with highlighted snippets
//   :slug    one article: markdown, "Open this page", previous / next
import { ArrowLeftOutlined, ArrowRightOutlined, ExportOutlined, LockOutlined, RocketOutlined } from '@ant-design/icons'
import { Alert, Breadcrumb, Button, Card, Col, Empty, Flex, Input, List, Menu, Row, Skeleton, Tag, Typography, theme } from 'antd'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Icon } from '../../components/Icon'
import { PageHeader } from '../../components/ui'
import { useFetch } from '../../hooks/useFetch'
import { getErrorMessage } from '../../lib/api'
import { guideService } from '../../services/guide.service'
import type { GettingStarted, GuideSearchHit, GuideSection } from '../../types/guide'
import { MarkdownView } from '../projects/shared/Markdown'
import { GettingStartedCard } from './GettingStartedCard'
import { isAppPath, splitSnippet } from './guideMeta'

export default function HelpCenterPage() {
  const { slug } = useParams()
  const [params, setParams] = useSearchParams()
  const q = params.get('q') ?? ''
  const [draft, setDraft] = useState(q)
  const contents = useFetch(useCallback(() => guideService.contents(), []))

  // type → search after a short pause; the query lives in the address bar (shareable, back button works)
  useEffect(() => {
    const t = setTimeout(() => {
      const next = draft.trim()
      if (next !== q) setParams(next ? { q: next } : {}, { replace: true })
    }, 300)
    return () => clearTimeout(t)
  }, [draft, q, setParams])

  const sections = contents.data ?? []
  const searching = q.length >= 2

  return (
    <>
      <PageHeader title="Help Center" description="How Team-Flex works — and how to get the most out of it." />
      <Input.Search
        allowClear
        size="large"
        placeholder="Search the guide — e.g. leave, sprint, QA, holidays"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onSearch={(v) => setDraft(v)}
        style={{ maxWidth: 640, marginBottom: 24 }}
        aria-label="Search the Help Center"
      />
      {contents.error && <Alert type="error" showIcon title={contents.error} style={{ marginBottom: 16 }} />}
      <Row gutter={[24, 24]}>
        <Col xs={0} lg={6}>
          <Contents sections={sections} active={searching ? undefined : slug} loading={!contents.data} />
        </Col>
        <Col xs={24} lg={18}>
          {searching ? <SearchResults q={q} /> : slug ? <ArticleView key={slug} slug={slug} /> : <Home sections={sections} loading={!contents.data} />}
        </Col>
      </Row>
    </>
  )
}

function Contents({ sections, active, loading }: { sections: GuideSection[]; active?: string; loading: boolean }) {
  const navigate = useNavigate()
  if (loading) return <Skeleton active paragraph={{ rows: 10 }} />
  return (
    <Card size="small" styles={{ body: { padding: 4 } }} style={{ position: 'sticky', top: 16 }}>
      <Menu
        mode="inline"
        selectedKeys={active ? [active] : []}
        defaultOpenKeys={sections.map((s) => s.slug)}
        style={{ borderInlineEnd: 0 }}
        onClick={({ key }) => navigate(`/guide/${key}`)}
        items={sections.map((s) => ({
          key: s.slug,
          label: s.title,
          icon: <Icon name={s.icon} />,
          children: s.articles.map((a) => ({ key: a.slug, label: a.title })),
        }))}
      />
    </Card>
  )
}

function Home({ sections, loading }: { sections: GuideSection[]; loading: boolean }) {
  const [checklist, setChecklist] = useState<GettingStarted | null>(null)
  const loaded = useFetch(useCallback(() => guideService.gettingStarted(), []))
  const gs = checklist ?? loaded.data

  const restore = async () => setChecklist(await guideService.restoreGettingStarted())

  if (loading) return <Skeleton active paragraph={{ rows: 12 }} />
  if (sections.length === 0) return <Empty description="The guide is empty for now." />
  return (
    <>
      {gs && <GettingStartedCard data={gs} onChange={setChecklist} style={{ marginBottom: 24 }} />}
      <Row gutter={[16, 16]}>
        {sections.map((s) => (
          <Col key={s.id} xs={24} md={12}>
            <Card
              size="small"
              style={{ height: '100%' }}
              title={
                <Flex gap={8} align="center">
                  <Icon name={s.icon} /> {s.title}
                </Flex>
              }
            >
              <List
                size="small"
                split={false}
                dataSource={s.articles}
                renderItem={(a) => (
                  <List.Item style={{ padding: '6px 0', display: 'block' }}>
                    <Link to={`/guide/${a.slug}`} style={{ fontWeight: 500 }}>
                      {a.title}
                    </Link>
                    {a.audience === 'admins' && <AdminsTag />}
                    {a.summary && (
                      <Typography.Text type="secondary" style={{ display: 'block', fontSize: '0.85em' }}>
                        {a.summary}
                      </Typography.Text>
                    )}
                  </List.Item>
                )}
              />
            </Card>
          </Col>
        ))}
      </Row>
      {gs?.visible && gs.dismissed && (
        <Typography.Text type="secondary" style={{ display: 'block', marginTop: 24 }}>
          <RocketOutlined /> The getting-started checklist is hidden.{' '}
          <Typography.Link onClick={restore}>Show it again</Typography.Link>
        </Typography.Text>
      )}
    </>
  )
}

function AdminsTag() {
  return (
    <Tag icon={<LockOutlined />} style={{ marginInlineStart: 8 }}>
      admins
    </Tag>
  )
}

function SearchResults({ q }: { q: string }) {
  const { token } = theme.useToken()
  const [state, setState] = useState<{ q: string; hits: GuideSearchHit[] | null; error: string | null }>({ q: '', hits: null, error: null })

  useEffect(() => {
    let active = true
    guideService
      .search(q)
      .then((hits) => active && setState({ q, hits, error: null }))
      .catch((err) => active && setState({ q, hits: [], error: getErrorMessage(err) }))
    return () => {
      active = false
    }
  }, [q])

  if (state.q !== q || !state.hits) return <Skeleton active paragraph={{ rows: 6 }} />
  if (state.error) return <Alert type="error" showIcon title={state.error} />
  if (state.hits.length === 0) return <Empty description={`Nothing found for "${q}". Try another word.`} />
  return (
    <List
      header={<Typography.Text type="secondary">{state.hits.length} result(s) for “{q}”</Typography.Text>}
      dataSource={state.hits}
      renderItem={(h) => (
        <List.Item style={{ display: 'block' }}>
          <Typography.Text type="secondary" style={{ fontSize: '0.8em' }}>
            {h.section}
          </Typography.Text>
          <div>
            <Link to={`/guide/${h.slug}`} style={{ fontWeight: 600, fontSize: '1.05em' }}>
              {h.title}
            </Link>
            {h.audience === 'admins' && <AdminsTag />}
          </div>
          <Typography.Paragraph type="secondary" style={{ margin: '4px 0 0' }}>
            {splitSnippet(h.snippet).map((p, i) =>
              p.hit ? (
                <mark key={i} style={{ background: token.colorWarningBg, color: 'inherit', padding: 0 }}>
                  {p.text}
                </mark>
              ) : (
                <span key={i}>{p.text}</span>
              ),
            )}
            …
          </Typography.Paragraph>
        </List.Item>
      )}
    />
  )
}

function ArticleView({ slug }: { slug: string }) {
  const { token } = theme.useToken()
  const article = useFetch(useCallback(() => guideService.article(slug), [slug]))
  const a = article.data
  const updated = useMemo(() => (a ? new Date(a.updatedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : ''), [a])

  if (article.error) {
    return (
      <Empty description={article.error}>
        <Link to="/guide">Back to the Help Center</Link>
      </Empty>
    )
  }
  if (!a) return <Skeleton active paragraph={{ rows: 14 }} />
  return (
    <Card>
      <Breadcrumb style={{ marginBottom: 8 }} items={[{ title: <Link to="/guide">Help Center</Link> }, { title: a.section.title }]} />
      <Flex justify="space-between" align="flex-start" gap={16} wrap>
        <div style={{ flex: 1, minWidth: 240 }}>
          <Typography.Title level={2} style={{ margin: 0 }}>
            {a.title}
            {a.audience === 'admins' && <AdminsTag />}
          </Typography.Title>
          {a.summary && (
            <Typography.Text type="secondary" style={{ display: 'block', marginTop: 4, fontSize: '1.05em' }}>
              {a.summary}
            </Typography.Text>
          )}
        </div>
        {isAppPath(a.appPath) && (
          <Link to={a.appPath}>
            <Button type="primary" icon={<ExportOutlined />}>
              Open this page
            </Button>
          </Link>
        )}
      </Flex>
      <div style={{ marginTop: 20, maxWidth: 780, fontSize: '1.02em' }}>
        <MarkdownView value={a.body} />
      </div>
      <Flex justify="space-between" gap={12} wrap style={{ marginTop: 32, paddingTop: 16, borderTop: `1px solid ${token.colorBorderSecondary}` }}>
        {a.previous ? (
          <Link to={`/guide/${a.previous.slug}`}>
            <ArrowLeftOutlined /> {a.previous.title}
          </Link>
        ) : (
          <span />
        )}
        {a.next && (
          <Link to={`/guide/${a.next.slug}`}>
            {a.next.title} <ArrowRightOutlined />
          </Link>
        )}
      </Flex>
      <Typography.Text type="secondary" style={{ display: 'block', marginTop: 16, fontSize: '0.8em' }}>
        Last updated {updated}
      </Typography.Text>
    </Card>
  )
}
