// Shown to a logged-in user who belongs to no organization (e.g. removed from all of them).
import { ApartmentOutlined } from '@ant-design/icons'
import { App, Button, Card, Form, Input, Typography } from 'antd'
import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../../auth/useAuth'
import { getErrorMessage } from '../../lib/api'

export default function OnboardingPage() {
  const { user, organization, createOrganization } = useAuth()
  const { message } = App.useApp()
  const navigate = useNavigate()
  const [saving, setSaving] = useState(false)

  if (organization) return <Navigate to="/dashboard" replace />

  const handleFinish = async ({ name }: { name: string }) => {
    setSaving(true)
    try {
      await createOrganization(name)
      navigate('/dashboard', { replace: true })
    } catch (err) {
      message.error(getErrorMessage(err))
      setSaving(false)
    }
  }

  return (
    <Card style={{ maxWidth: 460, margin: '48px auto' }} styles={{ body: { padding: 32 } }}>
      <ApartmentOutlined style={{ fontSize: 36, marginBottom: 12 }} />
      <Typography.Title level={3} style={{ marginTop: 0 }}>
        Create your organization
      </Typography.Title>
      <Typography.Paragraph type="secondary">
        Hi {user?.name.split(' ')[0]}, you are not part of any organization yet. Create one to get started, or ask a
        teammate to send you an invitation link.
      </Typography.Paragraph>
      <Form layout="vertical" onFinish={handleFinish} requiredMark={false} size="large">
        <Form.Item name="name" label="Organization name" rules={[{ required: true, min: 2, max: 100 }]}>
          <Input placeholder="Acme Inc" autoFocus />
        </Form.Item>
        <Button type="primary" htmlType="submit" block loading={saving}>
          Create organization
        </Button>
      </Form>
    </Card>
  )
}
