// Small building blocks of the website sections: buttons, images, and a drawn product preview
// (shown until the platform owner uploads a real screenshot).
import { Button, theme } from 'antd'
import { Link } from 'react-router-dom'
import { mediaUrl } from '../api'
import type { Cta } from '../types'
import { isInternalHref } from '../websiteMeta'

export function CtaLink({ cta, primary, size = 'large' }: { cta: Cta; primary?: boolean; size?: 'large' | 'middle' }) {
  const button = (
    <Button type={primary ? 'primary' : 'default'} size={size}>
      {cta.label}
    </Button>
  )
  if (isInternalHref(cta.href)) return <Link to={cta.href}>{button}</Link>
  const external = /^https?:/.test(cta.href)
  return (
    <a href={cta.href} target={external ? '_blank' : undefined} rel={external ? 'noopener noreferrer' : undefined}>
      {button}
    </a>
  )
}

export function CtaButtons({ primary, secondary }: { primary?: Cta | null; secondary?: Cta | null }) {
  if (!primary && !secondary) return null
  return (
    <div className="wf-buttons">
      {primary && <CtaLink cta={primary} primary />}
      {secondary && <CtaLink cta={secondary} />}
    </div>
  )
}

/** An uploaded image, or the drawn product preview when there is none. */
export function Visual({ mediaId, alt, variant = 0 }: { mediaId?: number | null; alt: string; variant?: number }) {
  const { token } = theme.useToken()
  if (mediaId) {
    return <img className="wf-img" src={mediaUrl(mediaId)} alt={alt} loading="lazy" style={{ boxShadow: token.boxShadowSecondary }} />
  }
  return <ProductMock variant={variant} />
}

const MOCKS = ['board', 'qa', 'chart', 'calendar'] as const

/** A drawn, theme-aware sketch of the product (board / QA / chart / calendar). Decorative. */
export function ProductMock({ variant = 0 }: { variant?: number }) {
  const { token } = theme.useToken()
  const kind = MOCKS[variant % MOCKS.length]
  const bar = (w: string, c: string, h = 8) => <div style={{ height: h, width: w, background: c, borderRadius: 4 }} />
  const card = (accent: string, w1: string, w2: string) => (
    <div style={{ background: token.colorBgContainer, borderRadius: 8, padding: 10, borderInlineStart: `3px solid ${accent}`, display: 'grid', gap: 6, boxShadow: token.boxShadowTertiary }}>
      {bar(w1, token.colorTextQuaternary)}
      {bar(w2, token.colorFillSecondary, 6)}
    </div>
  )
  return (
    <div
      aria-hidden
      style={{
        borderRadius: 16,
        padding: 16,
        background: `linear-gradient(135deg, ${token.colorPrimaryBg}, ${token.colorFillQuaternary})`,
        border: `1px solid ${token.colorBorderSecondary}`,
        boxShadow: token.boxShadowSecondary,
        minHeight: 260,
      }}
    >
      <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
        {[token.colorError, token.colorWarning, token.colorSuccess].map((c) => (
          <span key={c} style={{ width: 10, height: 10, borderRadius: '50%', background: c, opacity: 0.7 }} />
        ))}
      </div>
      {kind === 'board' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
          {[
            [token.colorTextQuaternary, 3],
            [token.colorPrimary, 2],
            [token.colorSuccess, 3],
          ].map(([c, n], col) => (
            <div key={col} style={{ background: token.colorFillTertiary, borderRadius: 10, padding: 8, display: 'grid', gap: 8, alignContent: 'start' }}>
              {bar('50%', token.colorTextTertiary, 6)}
              {Array.from({ length: n as number }, (_, i) => (
                <div key={i}>{card(c as string, `${70 - i * 12}%`, `${45 + i * 10}%`)}</div>
              ))}
            </div>
          ))}
        </div>
      )}
      {kind === 'qa' && (
        <div style={{ display: 'grid', gap: 10 }}>
          {[
            [token.colorError, 'Open'],
            [token.colorInfo, 'Ready for QA'],
            [token.colorSuccess, 'Verified'],
            [token.colorWarning, 'Reopened'],
          ].map(([c], i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, background: token.colorBgContainer, borderRadius: 8, padding: 10 }}>
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: c }} />
              {bar(`${60 - i * 8}%`, token.colorTextQuaternary)}
              <span style={{ marginInlineStart: 'auto', width: 56, height: 16, borderRadius: 8, background: c, opacity: 0.25 }} />
            </div>
          ))}
        </div>
      )}
      {kind === 'chart' && (
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, height: 200, padding: '0 8px', background: token.colorBgContainer, borderRadius: 10 }}>
          {[40, 65, 50, 80, 70, 95, 85].map((h, i) => (
            <div key={i} style={{ flex: 1, height: `${h}%`, borderRadius: '6px 6px 0 0', background: i % 2 ? token.colorPrimary : token.colorPrimaryBorder }} />
          ))}
        </div>
      )}
      {kind === 'calendar' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6 }}>
          {Array.from({ length: 28 }, (_, i) => (
            <div key={i} style={{ background: token.colorBgContainer, borderRadius: 6, height: 44, padding: 4, display: 'grid', alignContent: 'start', gap: 3 }}>
              {i % 3 === 0 && bar('80%', token.colorPrimary, 6)}
              {i % 5 === 1 && bar('60%', token.colorSuccess, 6)}
              {i % 7 === 4 && bar('70%', token.colorWarning, 6)}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
