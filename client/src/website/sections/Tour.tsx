// "Product tour" (tabs with product screens) and "How it works" (numbered steps).
import { ArrowRightOutlined, CheckOutlined } from '@ant-design/icons'
import { theme } from 'antd'
import { useState } from 'react'
import { FeatureIcon } from '../icons'
import type { ShowcaseContent, StepsContent } from '../types'
import { CtaLink, Visual } from './parts'

export function ShowcaseSection({ content }: { content: ShowcaseContent }) {
  const { token } = theme.useToken()
  const [active, setActive] = useState(0)
  const tab = content.tabs[Math.min(active, content.tabs.length - 1)]
  if (!tab) return null
  return (
    <section className="wf-section" id="tour" style={{ background: `linear-gradient(180deg, ${token.colorFillQuaternary}, transparent)` }}>
      <div className="wf-container">
        <div className="wf-center wf-narrow" style={{ marginBottom: 28 }}>
          {content.eyebrow && <span className="wf-eyebrow" style={{ color: token.colorPrimary }}>{content.eyebrow}</span>}
          {content.title && <h2 className="wf-h2" style={{ color: token.colorText }}>{content.title}</h2>}
          {content.subtitle && <p className="wf-lead" style={{ color: token.colorTextSecondary, margin: 0 }}>{content.subtitle}</p>}
        </div>

        <div role="tablist" aria-label={content.title ?? 'Product tour'} className="wf-tabs">
          {content.tabs.map((t, i) => {
            const on = i === active
            return (
              <button
                key={t.label}
                role="tab"
                type="button"
                aria-selected={on}
                onClick={() => setActive(i)}
                className="wf-tab"
                style={{
                  color: on ? token.colorPrimary : token.colorTextSecondary,
                  background: on ? token.colorBgContainer : 'transparent',
                  borderColor: on ? token.colorPrimaryBorder : 'transparent',
                  boxShadow: on ? token.boxShadowTertiary : undefined,
                }}
              >
                <FeatureIcon name={t.icon} /> {t.label}
              </button>
            )
          })}
        </div>

        <div role="tabpanel" className="wf-showcase" key={active}>
          <div>
            <h3 className="wf-h3" style={{ color: token.colorText }}>{tab.title}</h3>
            {tab.text && <p style={{ color: token.colorTextSecondary, lineHeight: 1.65, fontSize: '1.02rem' }}>{tab.text}</p>}
            <ul style={{ listStyle: 'none', padding: 0, margin: '16px 0 0', display: 'grid', gap: 10 }}>
              {tab.bullets.map((b) => (
                <li key={b} style={{ display: 'flex', gap: 10, color: token.colorText }}>
                  <span style={{ width: 22, height: 22, borderRadius: '50%', display: 'grid', placeItems: 'center', background: token.colorSuccessBg, color: token.colorSuccess, flex: 'none', fontSize: 11 }}>
                    <CheckOutlined />
                  </span>
                  {b}
                </li>
              ))}
            </ul>
            {content.tabs.length > 1 && (
              <button type="button" className="wf-linkbtn" onClick={() => setActive((active + 1) % content.tabs.length)} style={{ color: token.colorPrimary, marginTop: 22 }}>
                Next: {content.tabs[(active + 1) % content.tabs.length]!.label} <ArrowRightOutlined />
              </button>
            )}
          </div>
          <div className="wf-fade-in">
            <Visual mediaId={tab.mediaId} alt={tab.title} mock={tab.mock} />
          </div>
        </div>
      </div>
    </section>
  )
}

export function StepsSection({ content }: { content: StepsContent }) {
  const { token } = theme.useToken()
  return (
    <section className="wf-section">
      <div className="wf-container">
        <div className="wf-center wf-narrow" style={{ marginBottom: 40 }}>
          {content.title && <h2 className="wf-h2" style={{ color: token.colorText }}>{content.title}</h2>}
          {content.subtitle && <p className="wf-lead" style={{ color: token.colorTextSecondary, margin: 0 }}>{content.subtitle}</p>}
        </div>
        <ol className="wf-steps" style={{ ['--wf-line' as string]: token.colorBorderSecondary }}>
          {content.items.map((s, i) => (
            <li key={i} className="wf-step">
              <div className="wf-step-badge" style={{ background: token.colorBgContainer, border: `2px solid ${token.colorPrimary}`, color: token.colorPrimary }}>
                <FeatureIcon name={s.icon} />
              </div>
              <div style={{ color: token.colorPrimary, fontWeight: 700, fontSize: '0.8rem', letterSpacing: '0.08em', marginTop: 14 }}>STEP {String(i + 1).padStart(2, '0')}</div>
              <div style={{ fontWeight: 650, fontSize: '1.08rem', margin: '4px 0 6px', color: token.colorText }}>{s.title}</div>
              {s.text && <div style={{ color: token.colorTextSecondary, lineHeight: 1.55 }}>{s.text}</div>}
            </li>
          ))}
        </ol>
        {content.cta && (
          <div className="wf-center" style={{ marginTop: 36 }}>
            <CtaLink cta={content.cta} primary />
          </div>
        )}
      </div>
    </section>
  )
}
