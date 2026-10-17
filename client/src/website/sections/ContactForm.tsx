// Contact form section: a coloured side panel (how to reach us, response time, what happens next) and the form
// (topic cards, details, message) → POST /api/website/inquiries.
// A hidden "website" field and the time taken to fill in the form tell bots apart (the server files those as spam).
import { CheckCircleFilled, ClockCircleOutlined, LockOutlined } from '@ant-design/icons'
import { App, Button, Col, Form, Input, Result, Row, Select, Tooltip, theme } from 'antd'
import { useContext, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useAuth } from '../../auth/useAuth'
import { getErrorMessage } from '../../lib/api'
import { websiteApi } from '../api'
import { FeatureIcon } from '../icons'
import type { ContactFormContent, InquiryInput, InquiryType } from '../types'
import { INQUIRY_TYPES, initialTopic, isInternalHref, TEAM_SIZES, TOPIC_DETAILS } from '../websiteMeta'
import { PreviewContext } from './previewContext'

function TopicCards({ value, onChange, topics }: { value?: InquiryType; onChange?: (v: InquiryType) => void; topics: typeof INQUIRY_TYPES }) {
  const { token } = theme.useToken()
  return (
    <div role="radiogroup" aria-label="What is it about?" className="wf-topic-grid">
      {topics.map((t) => {
        const on = value === t.value
        return (
          <button
            key={t.value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange?.(t.value)}
            className="wf-topic"
            style={{
              borderColor: on ? token.colorPrimary : token.colorBorderSecondary,
              background: on ? token.colorPrimaryBg : token.colorBgContainer,
              boxShadow: on ? `0 0 0 3px ${token.colorPrimaryBg}` : undefined,
            }}
          >
            <span style={{ fontSize: 18, color: on ? token.colorPrimary : token.colorTextSecondary }}><FeatureIcon name={TOPIC_DETAILS[t.value].icon} /></span>
            <span style={{ fontWeight: 600, color: token.colorText }}>{t.label}</span>
            <span style={{ fontSize: '0.82em', color: token.colorTextSecondary }}>{TOPIC_DETAILS[t.value].hint}</span>
          </button>
        )
      })}
    </div>
  )
}

export function ContactFormSection({ content }: { content: ContactFormContent }) {
  const { token } = theme.useToken()
  const { message } = App.useApp()
  const { user } = useAuth()
  const preview = useContext(PreviewContext)
  const [params] = useSearchParams()
  const [form] = Form.useForm<InquiryInput>()
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState<string | null>(null)
  // when the form was shown (a person needs a few seconds; bots don't)
  const [shownAt] = useState(() => Date.now())
  const topics = INQUIRY_TYPES.filter((t) => content.topics.includes(t.value))

  const submit = async (values: InquiryInput) => {
    if (preview) return
    setSending(true)
    try {
      await websiteApi.sendInquiry({ ...values, sourcePath: window.location.pathname, elapsedMs: Date.now() - shownAt })
      setSent(values.email)
    } catch (err) {
      message.error(getErrorMessage(err))
    } finally {
      setSending(false)
    }
  }

  return (
    <section className="wf-section" style={{ background: `radial-gradient(900px 380px at 85% -10%, ${token.colorPrimaryBg}, transparent)` }}>
      <div className="wf-container wf-contact-grid">
        {/* ---- side panel */}
        <aside
          className="wf-contact-panel"
          style={{ background: `linear-gradient(160deg, ${token.colorPrimary}, #4338ca)`, color: '#fff' }}
        >
          <span className="wf-eyebrow" style={{ color: 'rgba(255,255,255,0.8)' }}>Contact</span>
          {content.title && <h1 className="wf-h1" style={{ color: '#fff', fontSize: 'clamp(1.8rem, 3.4vw, 2.6rem)' }}>{content.title}</h1>}
          {content.subtitle && <p style={{ color: 'rgba(255,255,255,0.88)', lineHeight: 1.6, fontSize: '1.02rem' }}>{content.subtitle}</p>}
          {content.responseTime && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'rgba(255,255,255,0.16)', borderRadius: 999, padding: '6px 14px', fontWeight: 600, fontSize: '0.9em' }}>
              <ClockCircleOutlined /> {content.responseTime}
            </span>
          )}

          {content.contactPoints.length > 0 && (
            <div style={{ display: 'grid', gap: 12, marginTop: 28 }}>
              {content.contactPoints.map((c, i) => {
                const value = c.href ? (
                  isInternalHref(c.href) ? <Link to={c.href} style={{ color: '#fff', textDecoration: 'underline' }}>{c.value}</Link> : <a href={c.href} style={{ color: '#fff', textDecoration: 'underline' }}>{c.value}</a>
                ) : (
                  <span>{c.value}</span>
                )
                return (
                  <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', background: 'rgba(255,255,255,0.1)', borderRadius: 12, padding: '12px 14px' }}>
                    <span style={{ width: 36, height: 36, borderRadius: 10, display: 'grid', placeItems: 'center', background: 'rgba(255,255,255,0.18)', fontSize: 16, flex: 'none' }}>
                      <FeatureIcon name={c.icon} />
                    </span>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: '0.8em', opacity: 0.8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{c.label}</div>
                      <div style={{ fontWeight: 600, overflowWrap: 'anywhere' }}>{value}</div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {!!content.nextSteps?.length && (
            <div style={{ marginTop: 28 }}>
              <div style={{ fontWeight: 700, marginBottom: 12 }}>What happens next</div>
              <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 12 }}>
                {content.nextSteps.map((s, i) => (
                  <li key={i} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                    <span style={{ width: 24, height: 24, borderRadius: '50%', background: '#fff', color: token.colorPrimary, display: 'grid', placeItems: 'center', fontWeight: 700, fontSize: 12, flex: 'none' }}>{i + 1}</span>
                    <span style={{ opacity: 0.92, lineHeight: 1.5 }}>{s}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </aside>

        {/* ---- form */}
        <div className="wf-card" style={{ background: token.colorBgContainer, border: `1px solid ${token.colorBorderSecondary}`, boxShadow: '0 24px 60px -30px rgba(15, 23, 42, 0.35)', padding: 'clamp(20px, 3vw, 32px)' }}>
          {sent ? (
            <Result
              icon={<CheckCircleFilled style={{ color: token.colorSuccess }} />}
              title={content.successTitle}
              subTitle={
                <>
                  {content.successText}
                  <div style={{ marginTop: 6 }}>A copy was sent to <strong>{sent}</strong>.</div>
                </>
              }
              extra={[
                <Button key="again" onClick={() => (form.resetFields(), setSent(null))}>Send another message</Button>,
                <Link key="home" to="/"><Button type="primary">Back to the home page</Button></Link>,
              ]}
            />
          ) : (
            <Form
              form={form}
              layout="vertical"
              requiredMark={false}
              size="large"
              onFinish={submit}
              initialValues={{ type: initialTopic(params.get('type'), content.topics), name: user?.name, email: user?.email }}
            >
              <div style={{ fontWeight: 700, fontSize: '1.15rem', marginBottom: 4, color: token.colorText }}>Send us a message</div>
              <div style={{ color: token.colorTextSecondary, marginBottom: 20 }}>Fields marked * are required.</div>
              {topics.length > 1 ? (
                <Form.Item name="type" label="What is it about? *">
                  <TopicCards topics={topics} />
                </Form.Item>
              ) : (
                <Form.Item name="type" hidden><Input /></Form.Item>
              )}
              <Row gutter={12}>
                <Col xs={24} sm={12}>
                  <Form.Item name="name" label="Full name *" rules={[{ required: true, message: 'Tell us your name' }]}>
                    <Input maxLength={100} autoComplete="name" placeholder="Jane Doe" />
                  </Form.Item>
                </Col>
                <Col xs={24} sm={12}>
                  <Form.Item name="email" label="Work email *" rules={[{ required: true, type: 'email', message: 'A valid email address, please' }]}>
                    <Input maxLength={255} autoComplete="email" placeholder="jane@company.com" />
                  </Form.Item>
                </Col>
                {content.showCompany && (
                  <Col xs={24} sm={content.showTeamSize ? 14 : 24}>
                    <Form.Item name="company" label="Company"><Input maxLength={150} autoComplete="organization" placeholder="Company name" /></Form.Item>
                  </Col>
                )}
                {content.showTeamSize && (
                  <Col xs={24} sm={content.showCompany ? 10 : 24}>
                    <Form.Item name="teamSize" label="Team size">
                      <Select allowClear placeholder="Choose" options={TEAM_SIZES.map((s) => ({ value: s, label: `${s} people` }))} />
                    </Form.Item>
                  </Col>
                )}
                {content.showPhone && (
                  <Col xs={24}>
                    <Form.Item name="phone" label="Phone"><Input maxLength={40} autoComplete="tel" /></Form.Item>
                  </Col>
                )}
              </Row>
              <Form.Item name="message" label="How can we help? *" rules={[{ required: true, min: 10, message: 'A few more words, please (at least 10 characters)' }]}>
                <Input.TextArea autoSize={{ minRows: 5, maxRows: 12 }} maxLength={5000} showCount placeholder="Tell us about your team and what you'd like to achieve…" />
              </Form.Item>
              {/* honeypot: hidden from people (and screen readers); bots fill it in */}
              <div aria-hidden style={{ position: 'absolute', left: '-10000px', width: 1, height: 1, overflow: 'hidden' }}>
                <label>
                  Website
                  <Form.Item name="website" noStyle><Input tabIndex={-1} autoComplete="off" /></Form.Item>
                </label>
              </div>
              <Tooltip title={preview ? 'Preview — the form does not send anything here' : undefined}>
                <Button type="primary" htmlType="submit" size="large" block loading={sending} disabled={preview} style={{ height: 48, fontWeight: 600 }}>
                  Send message
                </Button>
              </Tooltip>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'center', marginTop: 14, color: token.colorTextTertiary, fontSize: '0.85em' }}>
                <LockOutlined /> We only use your details to answer you — no newsletters, no sharing.
              </div>
            </Form>
          )}
        </div>
      </div>
    </section>
  )
}
