// Footer of the public website: brand + buttons + social on the left, link columns, a bottom bar with the
// copyright and the legal links. Dark in both themes (a calm end to every page).
import { FacebookFilled, GithubFilled, InstagramFilled, LinkedinFilled, XOutlined, YoutubeFilled } from '@ant-design/icons'
import { Button } from 'antd'
import type { ComponentType } from 'react'
import { Link } from 'react-router-dom'
import { mediaUrl } from '../api'
import type { Cta, SiteData, SiteSettings, SocialNetwork } from '../types'
import { fillYear, isInternalHref } from '../websiteMeta'

const SOCIAL: Record<SocialNetwork, { icon: ComponentType; label: string }> = {
  linkedin: { icon: LinkedinFilled, label: 'LinkedIn' },
  x: { icon: XOutlined, label: 'X' },
  github: { icon: GithubFilled, label: 'GitHub' },
  youtube: { icon: YoutubeFilled, label: 'YouTube' },
  facebook: { icon: FacebookFilled, label: 'Facebook' },
  instagram: { icon: InstagramFilled, label: 'Instagram' },
}

const MUTED = 'rgba(226, 232, 240, 0.72)'

function FooterLink({ href, children }: { href: string; children: React.ReactNode }) {
  const style = { color: MUTED }
  return isInternalHref(href) ? <Link to={href} className="wf-footer-link" style={style}>{children}</Link> : <a href={href} className="wf-footer-link" style={style}>{children}</a>
}

function FooterButton({ cta, primary }: { cta: Cta; primary?: boolean }) {
  const btn = (
    <Button type={primary ? 'primary' : 'default'} ghost={!primary} style={primary ? undefined : { color: '#fff', borderColor: 'rgba(255,255,255,0.4)' }}>
      {cta.label}
    </Button>
  )
  return isInternalHref(cta.href) ? <Link to={cta.href}>{btn}</Link> : <a href={cta.href}>{btn}</a>
}

export function SiteFooter({ s, site }: { s: SiteSettings; site: SiteData }) {
  return (
    <footer style={{ background: '#0b1220', color: '#e2e8f0', padding: 'clamp(48px, 7vw, 72px) 16px 28px' }}>
      <div className="wf-container">
        <div className="wf-footer-grid" style={{ ['--wf-cols' as string]: Math.max(1, s.footer.columns.length) }}>
          <div style={{ maxWidth: 380 }}>
            <Link to="/" style={{ display: 'inline-flex', alignItems: 'center', gap: 10, color: '#fff' }} aria-label={`${s.brandName} home`}>
              {s.logoMediaId ? (
                <img src={mediaUrl(s.logoMediaId)} alt={s.brandName} style={{ height: 32, width: 'auto' }} />
              ) : (
                <span className="brand-logo">{s.brandName.slice(0, 2).toUpperCase()}</span>
              )}
              <span style={{ fontWeight: 700, fontSize: '1.15rem' }}>{s.brandName}</span>
            </Link>
            {s.footer.text && <p style={{ color: MUTED, lineHeight: 1.6, margin: '14px 0 20px' }}>{s.footer.text}</p>}
            {(s.footer.primaryCta || s.footer.secondaryCta) && (
              <div className="wf-buttons" style={{ marginBottom: 20 }}>
                {s.footer.primaryCta && <FooterButton cta={s.footer.primaryCta} primary />}
                {s.footer.secondaryCta && <FooterButton cta={s.footer.secondaryCta} />}
              </div>
            )}
            {!!s.social?.length && (
              <div style={{ display: 'flex', gap: 10 }}>
                {s.social.map((x) => {
                  const S = SOCIAL[x.network]
                  return (
                    <a key={x.network} href={x.href} target="_blank" rel="noopener noreferrer" aria-label={S.label} className="wf-social">
                      <S.icon />
                    </a>
                  )
                })}
              </div>
            )}
          </div>
          {s.footer.columns.map((c) => (
            <div key={c.title}>
              <div style={{ fontWeight: 650, color: '#fff', marginBottom: 14, fontSize: '0.95rem' }}>{c.title}</div>
              <div style={{ display: 'grid', gap: 10 }}>
                {c.links.map((l) => (
                  <FooterLink key={l.label} href={l.href}>{l.label}</FooterLink>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="wf-footer-bottom">
          <span style={{ color: MUTED, fontSize: '0.9em' }}>{s.footer.copyright ? fillYear(s.footer.copyright) : ''}</span>
          {/* published pages with "in the footer links" (Privacy, Terms, …) */}
          {!!site.footerLinks?.length && (
            <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', fontSize: '0.9em' }}>
              {site.footerLinks.map((l) => (
                <FooterLink key={l.path} href={l.path}>{l.label}</FooterLink>
              ))}
            </div>
          )}
        </div>
      </div>
    </footer>
  )
}
