// Contact form section: topic, name, e-mail, (company, team size, phone), message → POST /api/website/inquiries.
// A hidden "website" field and the time taken to fill in the form tell bots apart (the server files those as spam).
import { App, Button, Col, Flex, Form, Input, Result, Row, Segmented, Select, Tooltip, Typography, theme } from 'antd'
import { useContext, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useAuth } from '../../auth/useAuth'
import { getErrorMessage } from '../../lib/api'
import { websiteApi } from '../api'
import { FeatureIcon } from '../icons'
import type { ContactFormContent, InquiryInput } from '../types'
import { INQUIRY_TYPES, initialTopic, isInternalHref, TEAM_SIZES } from '../websiteMeta'
import { PreviewContext } from './previewContext'

export function ContactFormSection({ content }: { content: ContactFormContent }) {
  const { token } = theme.useToken()
  const { message } = App.useApp()
  const { user } = useAuth()
  const preview = useContext(PreviewContext)
  const [params] = useSearchParams()
  const [form] = Form.useForm<InquiryInput>()
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  // when the form was shown (a person needs a few seconds; bots don't)
  const [shownAt] = useState(() => Date.now())
  const topics = INQUIRY_TYPES.filter((t) => content.topics.includes(t.value))

  const submit = async (values: InquiryInput) => {
    if (preview) return
    setSending(true)
    try {
      await websiteApi.sendInquiry({ ...values, sourcePath: window.location.pathname, elapsedMs: Date.now() - shownAt })
      setSent(true)
    } catch (err) {
      message.error(getErrorMessage(err))
    } finally {
      setSending(false)
    }
  }

  return (
    <section className="wf-section">
      <div className="wf-container">
        <div className="wf-row" style={{ alignItems: 'start' }}>
          <div>
            {content.title && <h1 className="wf-h1" style={{ color: token.colorText }}>{content.title}</h1>}
            {content.subtitle && <p className="wf-lead" style={{ color: token.colorTextSecondary }}>{content.subtitle}</p>}
            <Flex vertical gap={16} style={{ marginTop: 8 }}>
              {content.contactPoints.map((c, i) => {
                const value = c.href ? (
                  isInternalHref(c.href) ? <Link to={c.href}>{c.value}</Link> : <a href={c.href}>{c.value}</a>
                ) : (
                  <span style={{ color: token.colorText }}>{c.value}</span>
                )
                return (
                  <Flex key={i} gap={14} align="flex-start">
                    <div style={{ width: 40, height: 40, borderRadius: 10, display: 'grid', placeItems: 'center', color: token.colorPrimary, background: token.colorPrimaryBg, fontSize: 18, flex: 'none' }}>
                      <FeatureIcon name={c.icon} />
                    </div>
                    <div>
                      <div style={{ fontWeight: 600, color: token.colorText }}>{c.label}</div>
                      {value}
                    </div>
                  </Flex>
                )
              })}
            </Flex>
          </div>

          <div className="wf-card" style={{ background: token.colorBgContainer, border: `1px solid ${token.colorBorderSecondary}`, boxShadow: token.boxShadowTertiary }}>
            {sent ? (
              <Result status="success" title={content.successTitle} subTitle={content.successText ?? undefined} extra={<Button onClick={() => (form.resetFields(), setSent(false))}>Send another message</Button>} />
            ) : (
              <Form
                form={form}
                layout="vertical"
                requiredMark="optional"
                onFinish={submit}
                initialValues={{ type: initialTopic(params.get('type'), content.topics), name: user?.name, email: user?.email }}
              >
                {topics.length > 1 && (
                  <Form.Item name="type" label="What is it about?">
                    <Segmented block options={topics} />
                  </Form.Item>
                )}
                {topics.length === 1 && <Form.Item name="type" hidden><Input /></Form.Item>}
                <Row gutter={12}>
                  <Col xs={24} sm={12}>
                    <Form.Item name="name" label="Your name" rules={[{ required: true, message: 'Tell us your name' }]}>
                      <Input maxLength={100} autoComplete="name" />
                    </Form.Item>
                  </Col>
                  <Col xs={24} sm={12}>
                    <Form.Item name="email" label="Work email" rules={[{ required: true, type: 'email', message: 'A valid email address, please' }]}>
                      <Input maxLength={255} autoComplete="email" />
                    </Form.Item>
                  </Col>
                  {content.showCompany && (
                    <Col xs={24} sm={content.showTeamSize ? 14 : 24}>
                      <Form.Item name="company" label="Company"><Input maxLength={150} autoComplete="organization" /></Form.Item>
                    </Col>
                  )}
                  {content.showTeamSize && (
                    <Col xs={24} sm={content.showCompany ? 10 : 24}>
                      <Form.Item name="teamSize" label="Team size">
                        <Select allowClear options={TEAM_SIZES.map((s) => ({ value: s, label: `${s} people` }))} />
                      </Form.Item>
                    </Col>
                  )}
                  {content.showPhone && (
                    <Col xs={24}>
                      <Form.Item name="phone" label="Phone"><Input maxLength={40} autoComplete="tel" /></Form.Item>
                    </Col>
                  )}
                </Row>
                <Form.Item name="message" label="Message" rules={[{ required: true, min: 10, message: 'A few more words, please (at least 10 characters)' }]}>
                  <Input.TextArea autoSize={{ minRows: 4, maxRows: 10 }} maxLength={5000} showCount />
                </Form.Item>
                {/* honeypot: hidden from people (and screen readers); bots fill it in */}
                <div aria-hidden style={{ position: 'absolute', left: '-10000px', width: 1, height: 1, overflow: 'hidden' }}>
                  <label>
                    Website
                    <Form.Item name="website" noStyle><Input tabIndex={-1} autoComplete="off" /></Form.Item>
                  </label>
                </div>
                <Tooltip title={preview ? 'Preview — the form does not send anything here' : undefined}>
                  <Button type="primary" htmlType="submit" size="large" block loading={sending} disabled={preview}>
                    Send message
                  </Button>
                </Tooltip>
                <Typography.Paragraph type="secondary" style={{ marginTop: 12, marginBottom: 0, fontSize: '0.85em' }}>
                  We only use your details to answer you.
                </Typography.Paragraph>
              </Form>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}
