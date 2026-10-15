// Profile cards: edit own name + change password.
import { EditOutlined, KeyOutlined } from '@ant-design/icons'
import { App, Button, Card, Form, Input, Typography } from 'antd'
import { useCallback, useState } from 'react'
import { useAuth } from '../../auth/useAuth'
import { getErrorMessage } from '../../lib/api'
import { useFetch } from '../../hooks/useFetch'
import { describePasswordPolicy, policyPasswordRules } from '../../lib/validation'
import { authService } from '../../services/auth.service'

export function EditNameCard() {
  const { user, reloadProfile } = useAuth()
  const { message } = App.useApp()
  const [saving, setSaving] = useState(false)

  const handleFinish = async ({ name }: { name: string }) => {
    setSaving(true)
    try {
      await authService.updateProfile(name)
      await reloadProfile()
      message.success('Name updated')
    } catch (err) {
      message.error(getErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card title={<><EditOutlined /> Your name</>} style={{ marginTop: 20 }}>
      <Form layout="inline" initialValues={{ name: user?.name }} onFinish={handleFinish} style={{ rowGap: 8 }}>
        <Form.Item name="name" rules={[{ required: true, min: 2, max: 100 }]} style={{ flex: 1, minWidth: 200 }}>
          <Input />
        </Form.Item>
        <Button type="primary" htmlType="submit" loading={saving}>
          Save
        </Button>
      </Form>
    </Card>
  )
}

/** `onChanged` — e.g. the "choose a new password" screen reloads the profile afterwards */
export function ChangePasswordCard({ onChanged, embedded }: { onChanged?: () => void; embedded?: boolean } = {}) {
  const { message } = App.useApp()
  const [form] = Form.useForm()
  const [saving, setSaving] = useState(false)
  // the strictest rules of all my organizations
  const policy = useFetch(useCallback(() => authService.passwordPolicy(), []))

  const handleFinish = async (values: { currentPassword: string; newPassword: string }) => {
    setSaving(true)
    try {
      await authService.changePassword(values.currentPassword, values.newPassword)
      form.resetFields()
      message.success('Password changed. Other devices were signed out.')
      onChanged?.()
    } catch (err) {
      message.error(getErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  const content = (
    <Form form={form} layout="vertical" onFinish={handleFinish} requiredMark={false}>
      <Form.Item name="currentPassword" label="Current password" rules={[{ required: true }]}>
        <Input.Password autoComplete="current-password" />
      </Form.Item>
      <Form.Item
        name="newPassword"
        label="New password"
        rules={policyPasswordRules(policy.data)}
        extra={policy.data && <Typography.Text type="secondary">{describePasswordPolicy(policy.data)}</Typography.Text>}
        hasFeedback
      >
        <Input.Password autoComplete="new-password" />
      </Form.Item>
      <Button type="primary" htmlType="submit" loading={saving} block={embedded}>
        Change password
      </Button>
    </Form>
  )
  if (embedded) return content
  return (
    <Card title={<><KeyOutlined /> Change password</>} style={{ marginTop: 20 }}>
      {content}
    </Card>
  )
}
