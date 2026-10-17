// One component per section type. Content comes from Platform → Website (validated by the server).
import { CheckOutlined } from '@ant-design/icons'
import { Avatar, Carousel, Tag, Typography, theme } from 'antd'
import type { CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import { MarkdownView } from '../../pages/projects/shared/Markdown'
import { mediaUrl } from '../api'
import { FeatureIcon } from '../icons'
import type {
  CtaContent, FeatureRowsContent, FeaturesGridContent, HeroContent, HeroSlide, LogosContent, PricingContent, RichTextContent,
  StatsContent, TestimonialsContent,
} from '../types'
import { guessMock, isInternalHref, limitLines } from '../websiteMeta'
import { CtaButtons, CtaLink, Visual } from './parts'

function Heading({ title, subtitle, center = true }: { title?: string | null; subtitle?: string | null; center?: boolean }) {
  const { token } = theme.useToken()
  if (!title && !subtitle) return null
  return (
    <div className={center ? 'wf-center wf-narrow' : undefined} style={{ marginBottom: 40 }}>
      {title && <h2 className="wf-h2" style={{ color: token.colorText }}>{title}</h2>}
      {subtitle && <p className="wf-lead" style={{ color: token.colorTextSecondary, margin: 0 }}>{subtitle}</p>}
    </div>
  )
}

// ---------------------------------------------------------------- hero (slider)

function Slide({ slide, single }: { slide: HeroSlide; single: boolean }) {
  const { token } = theme.useToken()
  const text = (
    <div>
      {slide.eyebrow && <span className="wf-eyebrow" style={{ color: token.colorPrimary }}>{slide.eyebrow}</span>}
      <h1 className="wf-h1" style={{ color: token.colorText }}>{slide.title}</h1>
      {slide.subtitle && <p className="wf-lead" style={{ color: token.colorTextSecondary }}>{slide.subtitle}</p>}
      <CtaButtons primary={slide.primaryCta} secondary={slide.secondaryCta} />
    </div>
  )
  if (single && !slide.mediaId) return <div className="wf-hero-single">{text}</div>
  return (
    <div className="wf-hero-grid">
      {text}
      <Visual mediaId={slide.mediaId} alt={slide.title} variant={0} />
    </div>
  )
}

export function HeroSection({ content }: { content: HeroContent }) {
  const { token } = theme.useToken()
  const slides = content.slides ?? []
  const single = slides.length === 1
  return (
    <section className="wf-section" style={{ background: `radial-gradient(1200px 400px at 20% -10%, ${token.colorPrimaryBg}, transparent)` }}>
      <div className="wf-container">
        {single ? (
          <Slide slide={slides[0]!} single />
        ) : (
          <Carousel autoplay={content.autoplaySeconds > 0} autoplaySpeed={Math.max(3, content.autoplaySeconds) * 1000} dotPosition="bottom" draggable>
            {slides.map((s, i) => (
              <div key={i}>
                <Slide slide={s} single={false} />
              </div>
            ))}
          </Carousel>
        )}
      </div>
    </section>
  )
}

// ---------------------------------------------------------------- logos, stats

export function LogosSection({ content }: { content: LogosContent }) {
  const { token } = theme.useToken()
  if (!content.items?.length) return null
  return (
    <section className="wf-section" style={{ paddingBlock: 40 }}>
      <div className="wf-container wf-center">
        {content.title && <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 20 }}>{content.title}</Typography.Text>}
        <div className="wf-logos">
          {content.items.map((l, i) => {
            const inner = l.mediaId ? <img src={mediaUrl(l.mediaId)} alt={l.name} loading="lazy" /> : <span style={{ fontWeight: 700, fontSize: '1.1rem', color: token.colorTextTertiary }}>{l.name}</span>
            return l.href ? <a key={i} href={l.href} target="_blank" rel="noopener noreferrer">{inner}</a> : <span key={i}>{inner}</span>
          })}
        </div>
      </div>
    </section>
  )
}

export function StatsSection({ content }: { content: StatsContent }) {
  const { token } = theme.useToken()
  return (
    <section className="wf-section" style={{ paddingBlock: 40, borderBlock: `1px solid ${token.colorBorderSecondary}` }}>
      <div className="wf-container">
        <div className="wf-grid wf-cols-4 wf-center">
          {content.items.map((s, i) => (
            <div key={i}>
              <div style={{ fontSize: 'clamp(1.8rem, 3.5vw, 2.6rem)', fontWeight: 800, color: token.colorPrimary }}>{s.value}</div>
              <div style={{ color: token.colorTextSecondary }}>{s.label}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ---------------------------------------------------------------- features

export function FeaturesGridSection({ content }: { content: FeaturesGridContent }) {
  const { token } = theme.useToken()
  return (
    <section className="wf-section">
      <div className="wf-container">
        <Heading title={content.title} subtitle={content.subtitle} />
        <div className={`wf-grid wf-cols-${content.columns ?? 3}`}>
          {content.items.map((f, i) => {
            const card = (
              <div className="wf-card" style={{ background: token.colorBgContainer, border: `1px solid ${token.colorBorderSecondary}` }}>
                <div style={{ width: 44, height: 44, borderRadius: 12, display: 'grid', placeItems: 'center', fontSize: 22, color: token.colorPrimary, background: token.colorPrimaryBg, marginBottom: 14 }}>
                  <FeatureIcon name={f.icon} />
                </div>
                <div style={{ fontWeight: 650, fontSize: '1.05rem', marginBottom: 6, color: token.colorText }}>{f.title}</div>
                {f.text && <div style={{ color: token.colorTextSecondary, lineHeight: 1.55 }}>{f.text}</div>}
              </div>
            )
            if (!f.href) return <div key={i}>{card}</div>
            return isInternalHref(f.href) ? <Link key={i} to={f.href}>{card}</Link> : <a key={i} href={f.href}>{card}</a>
          })}
        </div>
      </div>
    </section>
  )
}

export function FeatureRowsSection({ content }: { content: FeatureRowsContent }) {
  const { token } = theme.useToken()
  return (
    <section className="wf-section">
      <div className="wf-container">
        {content.items.map((r, i) => (
          <div key={i} className={`wf-row${i % 2 ? ' wf-reverse' : ''}`}>
            <div>
              {r.eyebrow && <span className="wf-eyebrow" style={{ color: token.colorPrimary }}>{r.eyebrow}</span>}
              <h2 className="wf-h2" style={{ color: token.colorText }}>{r.title}</h2>
              {r.text && <p className="wf-lead" style={{ color: token.colorTextSecondary, marginBottom: 16 }}>{r.text}</p>}
              {r.bullets?.length > 0 && (
                <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 20px', display: 'grid', gap: 8 }}>
                  {r.bullets.map((b, j) => (
                    <li key={j} style={{ display: 'flex', gap: 10, color: token.colorText }}>
                      <CheckOutlined style={{ color: token.colorSuccess, marginTop: 4 }} /> {b}
                    </li>
                  ))}
                </ul>
              )}
              {r.cta && <CtaLink cta={r.cta} size="middle" />}
            </div>
            <Visual mediaId={r.mediaId} alt={r.title} variant={i + 1} mock={r.mock ?? guessMock(`${r.eyebrow ?? ''} ${r.title}`)} />
          </div>
        ))}
      </div>
    </section>
  )
}

// ---------------------------------------------------------------- testimonials, cta, text

export function TestimonialsSection({ content }: { content: TestimonialsContent }) {
  const { token } = theme.useToken()
  if (!content.items?.length) return null
  return (
    <section className="wf-section" style={{ background: token.colorFillQuaternary }}>
      <div className="wf-container">
        <Heading title={content.title} />
        <div className="wf-grid wf-cols-3">
          {content.items.map((t, i) => (
            <figure key={i} className="wf-card" style={{ margin: 0, background: token.colorBgContainer, border: `1px solid ${token.colorBorderSecondary}` }}>
              <blockquote style={{ margin: '0 0 16px', fontSize: '1.02rem', lineHeight: 1.6, color: token.colorText }}>“{t.quote}”</blockquote>
              <figcaption style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <Avatar src={t.mediaId ? mediaUrl(t.mediaId) : undefined}>{t.name.charAt(0)}</Avatar>
                <div>
                  <div style={{ fontWeight: 600, color: token.colorText }}>{t.name}</div>
                  <div style={{ color: token.colorTextSecondary, fontSize: '0.9em' }}>{[t.role, t.company].filter(Boolean).join(', ')}</div>
                </div>
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  )
}

export function CtaSection({ content }: { content: CtaContent }) {
  const { token } = theme.useToken()
  return (
    <section className="wf-section">
      <div
        className="wf-container wf-center"
        style={{
          borderRadius: 24,
          padding: 'clamp(32px, 6vw, 64px) 24px',
          background: `linear-gradient(135deg, ${token.colorPrimary}, ${token.colorInfo})`,
          color: '#fff',
        }}
      >
        <h2 className="wf-h2" style={{ color: '#fff' }}>{content.title}</h2>
        {content.text && <p className="wf-lead" style={{ color: 'rgba(255,255,255,0.88)', maxWidth: 680, marginInline: 'auto' }}>{content.text}</p>}
        <div className="wf-buttons" style={{ justifyContent: 'center' }}>
          {content.primaryCta && <CtaLink cta={content.primaryCta} />}
          {content.secondaryCta &&
            (isInternalHref(content.secondaryCta.href) ? (
              <Link to={content.secondaryCta.href} style={{ color: '#fff', alignSelf: 'center', textDecoration: 'underline' }}>
                {content.secondaryCta.label}
              </Link>
            ) : (
              <a href={content.secondaryCta.href} style={{ color: '#fff', alignSelf: 'center', textDecoration: 'underline' }}>
                {content.secondaryCta.label}
              </a>
            ))}
        </div>
      </div>
    </section>
  )
}

export function RichTextSection({ content }: { content: RichTextContent }) {
  return (
    <section className="wf-section">
      <div className={`wf-narrow${content.align === 'center' ? ' wf-center' : ''}`}>
        <Heading title={content.title} center={content.align === 'center'} />
        <div style={{ fontSize: '1.05rem' }}>
          <MarkdownView value={content.body} empty="" />
        </div>
      </div>
    </section>
  )
}

// ---------------------------------------------------------------- pricing

export function PricingSection({ content }: { content: PricingContent }) {
  const { token } = theme.useToken()
  const cards = content.plans.filter((p) => p.plan)
  return (
    <section className="wf-section">
      <div className="wf-container">
        <Heading title={content.title} subtitle={content.subtitle} />
        <div className={`wf-grid ${cards.length >= 4 ? 'wf-cols-4' : 'wf-cols-3'}`} style={{ alignItems: 'stretch' }}>
          {cards.map((c) => {
            const style: CSSProperties = {
              background: token.colorBgContainer,
              border: `${c.highlight ? 2 : 1}px solid ${c.highlight ? token.colorPrimary : token.colorBorderSecondary}`,
              boxShadow: c.highlight ? token.boxShadowSecondary : undefined,
              display: 'flex',
              flexDirection: 'column',
              position: 'relative',
            }
            return (
              <div key={c.planKey} className="wf-card" style={style}>
                {c.badge && (
                  <Tag color="blue" style={{ position: 'absolute', top: -12, insetInlineStart: 24, margin: 0 }}>
                    {c.badge}
                  </Tag>
                )}
                <div style={{ fontWeight: 650, fontSize: '1.1rem', color: token.colorText }}>{c.plan!.name}</div>
                {(c.description ?? c.plan!.description) && (
                  <div style={{ color: token.colorTextSecondary, marginTop: 4 }}>{c.description ?? c.plan!.description}</div>
                )}
                <div style={{ margin: '20px 0' }}>
                  <span style={{ fontSize: '2.2rem', fontWeight: 800, color: token.colorText }}>{c.priceLabel}</span>
                  {c.period && <span style={{ color: token.colorTextSecondary, marginInlineStart: 6 }}>{c.period}</span>}
                </div>
                <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 24px', display: 'grid', gap: 8, flex: 1 }}>
                  {(content.showLimits ? limitLines(c.plan!) : []).map((l) => (
                    <li key={l} style={{ display: 'flex', gap: 10, fontWeight: 500, color: token.colorText }}>
                      <CheckOutlined style={{ color: token.colorPrimary, marginTop: 4 }} /> {l}
                    </li>
                  ))}
                  {c.features.map((f) => (
                    <li key={f} style={{ display: 'flex', gap: 10, color: token.colorText }}>
                      <CheckOutlined style={{ color: token.colorSuccess, marginTop: 4 }} /> {f}
                    </li>
                  ))}
                </ul>
                {c.cta && (
                  <div style={{ display: 'grid' }}>
                    <CtaLink cta={c.cta} primary={c.highlight} />
                  </div>
                )}
              </div>
            )
          })}
        </div>
        {content.footnote && (
          <Typography.Paragraph type="secondary" className="wf-center" style={{ marginTop: 24 }}>
            {content.footnote}
          </Typography.Paragraph>
        )}
      </div>
    </section>
  )
}
