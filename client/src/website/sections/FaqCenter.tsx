// FAQ: one FAQ section = a two-column accordion; several FAQ sections in a row = a help centre
// (search across all questions, categories on the side — each section is a category).
import { MessageOutlined, MinusOutlined, PlusOutlined, SearchOutlined } from '@ant-design/icons'
import { Button, Collapse, Empty, Input, theme } from 'antd'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { MarkdownView } from '../../pages/projects/shared/Markdown'
import type { FaqContent, Section } from '../types'
import { faqMatches } from '../websiteMeta'

function Accordion({ items }: { items: FaqContent['items'] }) {
  const { token } = theme.useToken()
  return (
    <Collapse
      bordered={false}
      expandIconPlacement="end"
      expandIcon={({ isActive }) => (
        <span style={{ width: 26, height: 26, borderRadius: '50%', display: 'grid', placeItems: 'center', background: isActive ? token.colorPrimary : token.colorFillSecondary, color: isActive ? '#fff' : token.colorText }}>
          {isActive ? <MinusOutlined /> : <PlusOutlined />}
        </span>
      )}
      style={{ background: 'transparent' }}
      items={items.map((q, i) => ({
        key: i,
        label: <span style={{ fontWeight: 600, fontSize: '1.02rem' }}>{q.question}</span>,
        children: <div style={{ color: token.colorTextSecondary }}><MarkdownView value={q.answer} empty="" /></div>,
        style: { marginBottom: 10, background: token.colorBgContainer, borderRadius: 12, border: `1px solid ${token.colorBorderSecondary}`, overflow: 'hidden' },
      }))}
    />
  )
}

/** A single FAQ section: heading on the left, questions on the right. */
export function FaqSection({ content }: { content: FaqContent }) {
  const { token } = theme.useToken()
  return (
    <section className="wf-section">
      <div className="wf-container wf-faq-split">
        <div>
          {content.title && <h2 className="wf-h2" style={{ color: token.colorText }}>{content.title}</h2>}
          <p style={{ color: token.colorTextSecondary }}>
            Can't find what you need? <Link to="/contact">Contact us</Link>.
          </p>
        </div>
        <Accordion items={content.items} />
      </div>
    </section>
  )
}

/** Several FAQ sections in a row: searchable, with categories. */
export function FaqCenter({ groups }: { groups: Section<FaqContent>[] }) {
  const { token } = theme.useToken()
  const [q, setQ] = useState('')
  const [category, setCategory] = useState<number | 'all'>('all')
  const filtered = useMemo(
    () => groups.map((g, i) => ({ i, title: g.content.title ?? `Questions ${i + 1}`, items: g.content.items.filter((it) => faqMatches(q, it)) })),
    [groups, q],
  )
  const shown = filtered.filter((g) => g.items.length && (q.trim() || category === 'all' || category === g.i))
  const total = filtered.reduce((n, g) => n + g.items.length, 0)

  return (
    <section className="wf-section" style={{ paddingTop: 24 }}>
      <div className="wf-container">
        <div className="wf-narrow" style={{ marginBottom: 32 }}>
          <Input
            size="large"
            allowClear
            prefix={<SearchOutlined style={{ color: token.colorTextTertiary }} />}
            placeholder="Search questions — e.g. guests, trash, pricing"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="Search the FAQ"
            style={{ borderRadius: 999, padding: '10px 18px', boxShadow: token.boxShadowTertiary }}
          />
          {q.trim() && <div style={{ textAlign: 'center', marginTop: 8, color: token.colorTextSecondary }}>{total} matching question{total === 1 ? '' : 's'}</div>}
        </div>

        <div className="wf-faq-center">
          <nav aria-label="FAQ categories" className="wf-faq-nav">
            {[{ i: 'all' as const, title: 'All questions', n: groups.reduce((n, g) => n + g.content.items.length, 0) }, ...groups.map((g, i) => ({ i, title: g.content.title ?? `Questions ${i + 1}`, n: g.content.items.length }))].map((c) => {
              const on = !q.trim() && category === c.i
              return (
                <button
                  key={String(c.i)}
                  type="button"
                  onClick={() => (setQ(''), setCategory(c.i))}
                  className="wf-faq-cat"
                  style={{ background: on ? token.colorPrimaryBg : 'transparent', color: on ? token.colorPrimary : token.colorText, fontWeight: on ? 600 : 500 }}
                >
                  <span>{c.title}</span>
                  <span style={{ color: token.colorTextTertiary, fontSize: '0.85em' }}>{c.n}</span>
                </button>
              )
            })}
            <div className="wf-card" style={{ marginTop: 20, background: token.colorFillQuaternary, padding: 18 }}>
              <MessageOutlined style={{ fontSize: 22, color: token.colorPrimary }} />
              <div style={{ fontWeight: 650, margin: '8px 0 4px', color: token.colorText }}>Still have a question?</div>
              <div style={{ color: token.colorTextSecondary, fontSize: '0.92em', marginBottom: 12 }}>Our team answers within one working day.</div>
              <Link to="/contact"><Button type="primary" block>Contact us</Button></Link>
            </div>
          </nav>

          <div>
            {shown.length === 0 ? (
              <Empty description={<span>No question matches “{q}”. <Link to="/contact">Ask us directly</Link>.</span>} />
            ) : (
              shown.map((g) => (
                <div key={g.i} style={{ marginBottom: 32 }}>
                  <h3 className="wf-h3" style={{ color: token.colorText, marginBottom: 14 }}>{g.title}</h3>
                  <Accordion items={g.items} />
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </section>
  )
}
