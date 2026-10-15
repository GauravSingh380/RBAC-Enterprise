// Dashboard announcement for the active organization (content.manage).
import { SaveOutlined } from '@ant-design/icons'
import { Alert, App, Button, Card, Form, Input, Skeleton } from 'antd'
import { useCallback, useState } from 'react'
import { useAuth } from '../../../auth/useAuth'
import { PageHeader } from '../../../components/ui'
import { useFetch } from '../../../hooks/useFetch'
import { getErrorMessage } from '../../../lib/api'
import { contentService } from '../../../services/organization.service'
import type { DashboardContent } from '../../../types'

export default function AnnouncementPage() {
  const { organization } = useAuth()
  const { message } = App.useApp()
  const [saving, setSaving] = useState(false)
  const content = useFetch(useCallback(() => contentService.get<DashboardContent>('dashboard'), []))

  const handleFinish = async (values: DashboardContent) => {
    setSaving(true)
    try {
      await contentService.save('dashboard', { announcement: values.announcement ?? '' })
      message.success('Announcement saved')
    } catch (err) {
      message.error(getErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <PageHeader title="Announcement" description={`Shown to every member of ${organization?.name} at the top of their dashboard.`} />
      {content.error && <Alert type="error" showIcon title={content.error} style={{ marginBottom: 16 }} />}
      <Card>
        {content.data ? (
          <Form<DashboardContent>
            layout="vertical"
            initialValues={{ announcement: content.data.content.announcement ?? '' }}
            onFinish={handleFinish}
          >
            <Form.Item name="announcement" label="Announcement" extra="Leave empty to hide it.">
              <Input.TextArea rows={3} showCount maxLength={500} />
            </Form.Item>
            <Button type="primary" htmlType="submit" icon={<SaveOutlined />} loading={saving}>
              Save announcement
            </Button>
          </Form>
        ) : (
          <Skeleton active />
        )}
      </Card>
    </>
  )
}
