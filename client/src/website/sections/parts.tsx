// Small building blocks of the website sections: buttons and images (a drawn product screen until the
// platform owner uploads a real screenshot — see mocks.tsx).
import { Button, theme } from 'antd'
import { Link } from 'react-router-dom'
import { mediaUrl } from '../api'
import type { Cta, MockName } from '../types'
import { isInternalHref } from '../websiteMeta'
import { ProductScreen } from './mocks'

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

/** An uploaded image, or a drawn product screen when there is none. */
export function Visual({ mediaId, alt, variant = 0, mock }: { mediaId?: number | null; alt: string; variant?: number; mock?: MockName }) {
  const { token } = theme.useToken()
  if (mediaId) {
    return <img className="wf-img" src={mediaUrl(mediaId)} alt={alt} loading="lazy" style={{ boxShadow: token.boxShadowSecondary }} />
  }
  return <ProductScreen name={mock} index={variant} />
}
