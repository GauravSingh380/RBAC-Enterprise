import { MailOutlined } from '@ant-design/icons'
import { Alert, Button, Card, Form, Input, Result, Typography } from 'antd'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { getErrorMessage } from '../../lib/api'
import { authService } from '../../services/auth.service'

export default function ForgotPasswordPage() {
  const [sentTo, setSentTo] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const handleFinish = async ({ email }: { email: string }) => {
    setError(null)
    setSubmitting(true)
    try {
      await authService.forgotPassword(email)
      setSentTo(email)
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setSubmitting(false)
    }
  }

  if (sentTo) {
    return (
      <Card style={{ maxWidth: 460, margin: '48px auto' }}>
        <Result
          status="success"
          icon={<MailOutlined />}
          title="Check your inbox"
          subTitle={`If an account exists for ${sentTo}, we sent a link to reset your password. It is valid for 60 minutes.`}
          extra={<Link to="/login"><Button type="primary">Back to log in</Button></Link>}
        />
      </Card>
    )
  }

  return (
    <Card style={{ maxWidth: 420, margin: '48px auto' }} styles={{ body: { padding: 32 } }}>
      <Typography.Title level={3} style={{ marginTop: 0 }}>
        Forgot your password?
      </Typography.Title>
      <Typography.Paragraph type="secondary">Enter your email and we&apos;ll send you a link to choose a new one.</Typography.Paragraph>
      {error && <Alert type="error" showIcon title={error} style={{ marginBottom: 16 }} />}
      <Form layout="vertical" onFinish={handleFinish} requiredMark={false} size="large">
        <Form.Item name="email" label="Email" rules={[{ required: true, type: 'email', message: 'Enter a valid email' }]}>
          <Input prefix={<MailOutlined />} placeholder="you@company.com" autoComplete="email" autoFocus />
        </Form.Item>
        <Button type="primary" htmlType="submit" block loading={submitting}>
          Send reset link
        </Button>
      </Form>
      <Typography.Paragraph type="secondary" style={{ textAlign: 'center', margin: '20px 0 0' }}>
        Remembered it? <Link to="/login">Log in</Link>
      </Typography.Paragraph>
    </Card>
  )
}
