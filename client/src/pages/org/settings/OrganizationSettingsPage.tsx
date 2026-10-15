// Settings of the active organization + "leave organization" danger zone.
import { LogoutOutlined, SaveOutlined } from '@ant-design/icons'
import { App, Button, Card, Col, Descriptions, Form, Input, Popconfirm, Row, Skeleton, Typography } from 'antd'
import { useCallback, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../../auth/useAuth'
import { PageHeader } from '../../../components/ui'
import { PERMISSIONS } from '../../../config/permissions'
import { useFetch } from '../../../hooks/useFetch'
import { getErrorMessage } from '../../../lib/api'
import { organizationService } from '../../../services/organization.service'
import { PlanUsageCard } from './PlanUsageCard'
import { SecuritySettingsCard } from './SecuritySettingsCard'

export default function OrganizationSettingsPage() {
  const { can, reloadProfile } = useAuth()
  const { message } = App.useApp()
  const navigate = useNavigate()
  const [saving, setSaving] = useState(false)
  const org = useFetch(useCallback(() => organizationService.current(), []))
  const canManage = can(PERMISSIONS.ORGANIZATION_MANAGE)

  const handleSave = async ({ name }: { name: string }) => {
    setSaving(true)
    try {
      await organizationService.update(name)
      await reloadProfile() // header / switcher show the new name
      org.reload()
      message.success('Organization updated')
    } catch (err) {
      message.error(getErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  const handleLeave = async () => {
    try {
      await organizationService.leave()
      await reloadProfile() // falls back to another organization (or onboarding)
      message.success('You left the organization')
      navigate('/dashboard', { replace: true })
    } catch (err) {
      message.error(getErrorMessage(err))
    }
  }

  if (!org.data) return <Skeleton active />

  return (
    <>
      <PageHeader title="Organization settings" description="Details of the organization you are working in." />

      <Row gutter={[20, 20]}>
        <Col xs={24} lg={14}>
          <Card title="General">
            <Form layout="vertical" initialValues={{ name: org.data.name }} onFinish={handleSave} disabled={!canManage}>
              <Form.Item name="name" label="Organization name" rules={[{ required: true, min: 2, max: 100 }]}>
                <Input />
              </Form.Item>
              <Button type="primary" htmlType="submit" icon={<SaveOutlined />} loading={saving}>
                Save
              </Button>
            </Form>
          </Card>
          {canManage && <SecuritySettingsCard style={{ marginTop: 20 }} />}
        </Col>

        <Col xs={24} lg={10}>
          <Card title="Details">
            <Descriptions
              column={1}
              size="small"
              items={[
                { key: 'slug', label: 'Slug', children: <Typography.Text code>{org.data.slug}</Typography.Text> },
                { key: 'id', label: 'Organization ID', children: org.data.id },
                { key: 'members', label: 'Active members', children: org.data.memberCount },
                { key: 'created', label: 'Created', children: new Date(org.data.createdAt).toLocaleDateString() },
              ]}
            />
          </Card>

          <PlanUsageCard style={{ marginTop: 20 }} />
          <Card title="Danger zone" style={{ marginTop: 20 }}>
            <Typography.Paragraph type="secondary">
              Leaving removes your access to this organization. Your account and other organizations are not affected.
            </Typography.Paragraph>
            <Popconfirm
              title="Leave this organization?"
              okText="Leave"
              okButtonProps={{ danger: true }}
              onConfirm={handleLeave}
            >
              <Button danger icon={<LogoutOutlined />}>
                Leave organization
              </Button>
            </Popconfirm>
          </Card>
        </Col>
      </Row>
    </>
  )
}
