import { LockOutlined } from '@ant-design/icons'
import { Alert, Button, Card, Form, Input, Result, Skeleton, Typography } from 'antd'
import { useCallback, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useFetch } from '../../hooks/useFetch'
import { getErrorMessage } from '../../lib/api'
import { passwordRules } from '../../lib/validation'
import { authService } from '../../services/auth.service'

export default function ResetPasswordPage() {
  const [params] = useSearchParams()
  const token = params.get('token') ?? ''
  const check = useFetch(useCallback(() => (token ? authService.checkResetToken(token) : Promise.resolve({ valid: false } as { valid: boolean; email?: string })), [token]))
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const handleFinish = async ({ password }: { password: string }) => {
    setError(null)
    setSubmitting(true)
    try {
      await authService.resetPassword(token, password)
      setDone(true)
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setSubmitting(false)
    }
  }

  if (check.loading) return <Skeleton active style={{ maxWidth: 420, margin: '48px auto' }} />

  if (done) {
    return (
      <Card style={{ maxWidth: 460, margin: '48px auto' }}>
        <Result
          status="success"
          title="Password changed"
          subTitle="For your security you were signed out on every device. Log in with your new password."
          extra={<Link to="/login"><Button type="primary">Log in</Button></Link>}
        />
      </Card>
    )
  }

  if (!check.data?.valid) {
    return (
      <Card style={{ maxWidth: 460, margin: '48px auto' }}>
        <Result
          status="warning"
          title="This link is invalid or has expired"
          subTitle="Reset links work once and only for 60 minutes. Request a new one."
          extra={<Link to="/forgot-password"><Button type="primary">Request a new link</Button></Link>}
        />
      </Card>
    )
  }

  return (
    <Card style={{ maxWidth: 420, margin: '48px auto' }} styles={{ body: { padding: 32 } }}>
      <Typography.Title level={3} style={{ marginTop: 0 }}>
        Choose a new password
      </Typography.Title>
      <Typography.Paragraph type="secondary">For {check.data.email}</Typography.Paragraph>
      {error && <Alert type="error" showIcon title={error} style={{ marginBottom: 16 }} />}
      <Form layout="vertical" onFinish={handleFinish} requiredMark={false} size="large">
        <Form.Item name="password" label="New password" rules={passwordRules} hasFeedback>
          <Input.Password prefix={<LockOutlined />} autoComplete="new-password" autoFocus />
        </Form.Item>
        <Form.Item
          name="confirm"
          label="Confirm password"
          dependencies={['password']}
          hasFeedback
          rules={[
            { required: true, message: 'Confirm your password' },
            ({ getFieldValue }) => ({
              validator: (_, v) => (!v || getFieldValue('password') === v ? Promise.resolve() : Promise.reject(new Error('Passwords do not match'))),
            }),
          ]}
        >
          <Input.Password prefix={<LockOutlined />} autoComplete="new-password" />
        </Form.Item>
        <Button type="primary" htmlType="submit" block loading={submitting}>
          Set new password
        </Button>
      </Form>
    </Card>
  )
}
