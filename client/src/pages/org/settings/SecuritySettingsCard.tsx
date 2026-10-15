// Organization → Settings → Security: password & session rules (organization.manage).
import { KeyOutlined, SafetyOutlined } from '@ant-design/icons'
import { Alert, App, Button, Card, Col, Divider, Flex, Form, InputNumber, Popconfirm, Row, Select, Skeleton, Switch, Typography } from 'antd'
import { useCallback, useEffect, useState } from 'react'
import { HelpLink } from '../../../components/HelpLink'
import { useFetch } from '../../../hooks/useFetch'
import { getErrorMessage } from '../../../lib/api'
import { organizationService } from '../../../services/organization.service'
import type { SecurityPolicy } from '../../../types'
import { IDLE_CHOICES, MAX_SESSION_CHOICES, sessionFromForm, sessionToForm, withCurrent } from './planMeta'

export function SecuritySettingsCard({ style }: { style?: React.CSSProperties }) {
  const { message } = App.useApp()
  const [form] = Form.useForm<SecurityPolicy>()
  const policy = useFetch(useCallback(() => organizationService.security(), []))
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (policy.data) form.setFieldsValue(sessionToForm(policy.data))
  }, [policy.data, form])

  const save = async (values: SecurityPolicy) => {
    setSaving(true)
    try {
      const saved = await organizationService.updateSecurity(sessionFromForm(values))
      form.setFieldsValue(sessionToForm(saved))
      message.success('Security rules saved. Weak passwords are caught at the next sign-in.')
    } catch (err) {
      message.error(getErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  const requireChange = async () => {
    try {
      const { affected } = await organizationService.requirePasswordChange()
      message.success(`${affected} member(s) will choose a new password on their next visit`)
    } catch (err) {
      message.error(getErrorMessage(err))
    }
  }

  const p = policy.data
  return (
    <Card
      style={style}
      title={
        <Flex align="center" gap={8}>
          <SafetyOutlined /> Security <HelpLink article="security-policy" label="How do these rules work?" />
        </Flex>
      }
    >
      {!p ? (
        <Skeleton active paragraph={{ rows: 6 }} />
      ) : (
        <Form form={form} layout="vertical" onFinish={save} requiredMark={false} initialValues={sessionToForm(p)}>
          <Typography.Title level={5} style={{ marginTop: 0 }}>
            Passwords
          </Typography.Title>
          <Row gutter={16}>
            <Col xs={24} sm={12}>
              <Form.Item name="minLength" label="Minimum length" tooltip="8 to 64 characters. A letter and a number are always required.">
                <InputNumber min={8} max={64} addonAfter="characters" style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="requireSymbol" label="Require a symbol" valuePropName="checked" tooltip="For example ! # % or @">
                <Switch />
              </Form.Item>
            </Col>
          </Row>

          <Typography.Title level={5}>Sessions</Typography.Title>
          <Row gutter={16}>
            <Col xs={24} sm={12}>
              <Form.Item name="sessionIdleMinutes" label="Sign out after inactivity">
                <Select options={withCurrent(IDLE_CHOICES, p.sessionIdleMinutes, 'minutes')} />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="sessionMaxHours" label="Sign in again" tooltip="Even when active">
                <Select options={withCurrent(MAX_SESSION_CHOICES, p.sessionMaxHours, 'hours')} />
              </Form.Item>
            </Col>
          </Row>
          <Alert
            type="info"
            showIcon
            title="People who belong to several organizations follow the strictest rules of all of them."
            style={{ marginBottom: 16 }}
          />
          <Button type="primary" htmlType="submit" loading={saving}>
            Save security rules
          </Button>

          <Divider />
          <Flex justify="space-between" align="center" gap={12} wrap>
            <Typography.Text type="secondary" style={{ flex: 1, minWidth: 220 }}>
              New rules apply to new passwords and are checked at the next sign-in. Need everyone to change now?
            </Typography.Text>
            <Popconfirm
              title="Ask everyone to set a new password?"
              description="Every member except you must choose a new password on their next visit."
              okText="Ask everyone"
              onConfirm={requireChange}
            >
              <Button icon={<KeyOutlined />}>Ask everyone to set a new password</Button>
            </Popconfirm>
          </Flex>
        </Form>
      )}
    </Card>
  )
}
