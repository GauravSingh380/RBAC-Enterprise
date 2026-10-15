// Self-serve signup: create an account + a new organization,
// or (from an invitation link: /register?invite=…&email=…) join an existing one.
import { ApartmentOutlined, LockOutlined, MailOutlined, UserOutlined } from '@ant-design/icons'
import { Alert, Button, Card, Form, Input, Typography } from 'antd'
import { useCallback, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useAuth } from '../../auth/useAuth'
import { getErrorMessage } from '../../lib/api'
import { useFetch } from '../../hooks/useFetch'
import { describePasswordPolicy, passwordRules, policyPasswordRules } from '../../lib/validation'
import { authService } from '../../services/auth.service'

interface RegisterForm {
  name: string
  email: string
  organizationName?: string
  password: string
  confirmPassword: string
}

export default function RegisterPage() {
  const { register } = useAuth()
  const [params] = useSearchParams()
  const invitationToken = params.get('invite') ?? undefined
  const invitedEmail = params.get('email') ?? undefined
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  // joining an organization: its password rules (it may ask for more than the minimum)
  const invite = useFetch(useCallback(() => (invitationToken ? authService.previewInvitation(invitationToken) : Promise.resolve(null)), [invitationToken]))
  const policy = invite.data?.passwordPolicy

  const handleFinish = async (values: RegisterForm) => {
    setError(null)
    setSubmitting(true)
    try {
      await register({
        name: values.name,
        email: values.email,
        password: values.password,
        ...(invitationToken ? { invitationToken } : { organizationName: values.organizationName }),
      })
    } catch (err) {
      setError(getErrorMessage(err))
      setSubmitting(false)
    }
  }

  return (
    <Card style={{ maxWidth: 460, margin: '48px auto' }} styles={{ body: { padding: 32 } }}>
      <Typography.Title level={3} style={{ marginTop: 0 }}>
        {invitationToken ? 'Create your account' : 'Start your organization'}
      </Typography.Title>
      <Typography.Paragraph type="secondary">
        {invitationToken
          ? 'You will join the organization that invited you.'
          : 'Create an account and a workspace for your team. You can invite teammates next.'}
      </Typography.Paragraph>

      {error && <Alert type="error" title={error} showIcon style={{ marginBottom: 16 }} />}

      <Form<RegisterForm>
        layout="vertical"
        onFinish={handleFinish}
        requiredMark={false}
        size="large"
        initialValues={{ email: invitedEmail }}
      >
        <Form.Item name="name" label="Full name" rules={[{ required: true, min: 2, message: 'Enter your name' }]}>
          <Input prefix={<UserOutlined />} placeholder="Jane Doe" autoComplete="name" />
        </Form.Item>
        <Form.Item name="email" label="Work email" rules={[{ required: true, type: 'email', message: 'Enter a valid email' }]}>
          <Input prefix={<MailOutlined />} placeholder="you@company.com" autoComplete="email" disabled={!!invitedEmail} />
        </Form.Item>
        {!invitationToken && (
          <Form.Item
            name="organizationName"
            label="Organization name"
            rules={[{ required: true, min: 2, max: 100, message: 'Enter your organization name' }]}
          >
            <Input prefix={<ApartmentOutlined />} placeholder="Acme Inc" autoComplete="organization" />
          </Form.Item>
        )}
        <Form.Item
          name="password"
          label="Password"
          rules={policy ? policyPasswordRules(policy) : passwordRules}
          extra={policy && <Typography.Text type="secondary">{describePasswordPolicy(policy)}</Typography.Text>}
          hasFeedback
        >
          <Input.Password prefix={<LockOutlined />} autoComplete="new-password" />
        </Form.Item>
        <Form.Item
          name="confirmPassword"
          label="Confirm password"
          dependencies={['password']}
          hasFeedback
          rules={[
            { required: true, message: 'Confirm your password' },
            ({ getFieldValue }) => ({
              validator: (_, value) =>
                !value || getFieldValue('password') === value ? Promise.resolve() : Promise.reject(new Error('Passwords do not match')),
            }),
          ]}
        >
          <Input.Password prefix={<LockOutlined />} autoComplete="new-password" />
        </Form.Item>
        <Button type="primary" htmlType="submit" block loading={submitting}>
          {invitationToken ? 'Create account & join' : 'Create account'}
        </Button>
      </Form>

      <Typography.Paragraph type="secondary" style={{ textAlign: 'center', margin: '20px 0 0' }}>
        Already have an account? <Link to="/login">Log in</Link>
      </Typography.Paragraph>
    </Card>
  )
}
