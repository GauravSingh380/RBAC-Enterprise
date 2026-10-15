import { LockOutlined, MailOutlined } from '@ant-design/icons'
import { Alert, Button, Card, Form, Input, Typography } from 'antd'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../auth/useAuth'
import { getErrorMessage, takeSessionEndMessage } from '../../lib/api'

interface LoginForm {
  email: string
  password: string
}

export default function LoginPage() {
  const { login } = useAuth()
  const [error, setError] = useState<string | null>(null)
  // "You were signed out after a period of inactivity" (organization session rules) — shown once
  const [ended] = useState(() => takeSessionEndMessage())
  const [submitting, setSubmitting] = useState(false)

  // After a successful login the <GuestOnly> guard redirects automatically
  const handleFinish = async (values: LoginForm) => {
    setError(null)
    setSubmitting(true)
    try {
      await login(values.email, values.password)
    } catch (err) {
      setError(getErrorMessage(err))
      setSubmitting(false)
    }
  }

  return (
    <Card style={{ maxWidth: 420, margin: '48px auto' }} styles={{ body: { padding: 32 } }}>
      <Typography.Title level={3} style={{ marginTop: 0 }}>
        Welcome back
      </Typography.Title>
      <Typography.Paragraph type="secondary">Log in to your Team-Flex account.</Typography.Paragraph>

      {ended && !error && <Alert type="info" title={ended} showIcon style={{ marginBottom: 16 }} />}
      {error && <Alert type="error" title={error} showIcon style={{ marginBottom: 16 }} />}

      <Form<LoginForm> layout="vertical" onFinish={handleFinish} requiredMark={false} size="large">
        <Form.Item name="email" label="Email" rules={[{ required: true, type: 'email', message: 'Enter a valid email' }]}>
          <Input prefix={<MailOutlined />} placeholder="you@company.com" autoComplete="email" />
        </Form.Item>
        <Form.Item name="password" label="Password" rules={[{ required: true, message: 'Enter your password' }]} style={{ marginBottom: 8 }}>
          <Input.Password prefix={<LockOutlined />} placeholder="Password" autoComplete="current-password" />
        </Form.Item>
        <div style={{ textAlign: 'right', marginBottom: 20 }}>
          <Link to="/forgot-password">Forgot password?</Link>
        </div>
        <Button type="primary" htmlType="submit" block loading={submitting}>
          Log in
        </Button>
      </Form>

      <Typography.Paragraph type="secondary" style={{ textAlign: 'center', margin: '20px 0 0' }}>
        Don&apos;t have an account? <Link to="/register">Sign up</Link>
      </Typography.Paragraph>
    </Card>
  )
}
