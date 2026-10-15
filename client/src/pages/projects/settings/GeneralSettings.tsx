import { DeleteOutlined, InboxOutlined, RollbackOutlined, SaveOutlined } from '@ant-design/icons'
import { App, Button, Card, Col, ColorPicker, Flex, Form, Input, Popconfirm, Radio, Row, Select, Typography } from 'antd'
import { useCallback, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../../auth/useAuth'
import { PERMISSIONS } from '../../../config/permissions'
import { useFetch } from '../../../hooks/useFetch'
import { getErrorMessage } from '../../../lib/api'
import { projectsService } from '../../../services/projects.service'
import type { ProjectDetail } from '../../../types/projects'

interface Values {
  name: string
  description?: string
  visibility: 'private' | 'organization'
  leadId?: number
  color?: string
}

export default function GeneralSettings({ project, reload }: { project: ProjectDetail; reload: () => void }) {
  const { message } = App.useApp()
  const { can } = useAuth()
  const navigate = useNavigate()
  const [saving, setSaving] = useState(false)
  const people = useFetch(useCallback(() => projectsService.members(project.key), [project.key]))
  const canDelete = can(PERMISSIONS.PROJECTS_MANAGE_ALL)

  const handleFinish = async (v: Values) => {
    setSaving(true)
    try {
      await projectsService.update(project.key, {
        name: v.name,
        description: v.description || null,
        visibility: v.visibility,
        leadId: v.leadId ?? null,
        color: v.color ?? undefined,
      })
      message.success('Project updated')
      reload()
    } catch (err) {
      message.error(getErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  const act = async (fn: () => Promise<unknown>, text: string, after?: () => void) => {
    try {
      await fn()
      message.success(text)
      if (after) after()
      else reload()
    } catch (err) {
      message.error(getErrorMessage(err))
    }
  }

  return (
    <Row gutter={[24, 24]}>
      <Col xs={24} lg={15}>
        <Card title="Details">
          <Form<Values>
            layout="vertical"
            onFinish={handleFinish}
            initialValues={{
              name: project.name,
              description: project.description ?? '',
              visibility: project.visibility,
              leadId: project.leadId ?? undefined,
              color: project.color ?? undefined,
            }}
          >
            <Row gutter={16}>
              <Col xs={24} sm={18}>
                <Form.Item name="name" label="Name" rules={[{ required: true, min: 2, max: 100 }]}>
                  <Input />
                </Form.Item>
              </Col>
              <Col xs={24} sm={6}>
                <Form.Item label="Key" tooltip="Keys cannot change: they are part of every item number.">
                  <Input value={project.key} disabled />
                </Form.Item>
              </Col>
            </Row>
            <Form.Item name="description" label="Description">
              <Input.TextArea rows={3} />
            </Form.Item>
            <Row gutter={16}>
              <Col xs={24} sm={16}>
                <Form.Item name="leadId" label="Project lead">
                  <Select
                    allowClear
                    placeholder="No lead"
                    options={(people.data ?? []).map((m) => ({ value: m.id, label: m.name }))}
                    loading={people.loading}
                  />
                </Form.Item>
              </Col>
              <Col xs={24} sm={8}>
                <Form.Item name="color" label="Colour" getValueFromEvent={(c) => c?.toHexString?.()}>
                  <ColorPicker presets={[{ label: 'Suggested', colors: ['#3e63dd', '#8e4ec6', '#30a46c', '#e5484d', '#f76b15', '#0d9ab8', '#d6409f'] }]} />
                </Form.Item>
              </Col>
            </Row>
            <Form.Item name="visibility" label="Visibility">
              <Radio.Group>
                <Radio value="organization">Organization — everyone can view, members edit</Radio>
                <Radio value="private">Private — project members only</Radio>
              </Radio.Group>
            </Form.Item>
            <Button type="primary" htmlType="submit" icon={<SaveOutlined />} loading={saving}>
              Save changes
            </Button>
          </Form>
        </Card>
      </Col>

      <Col xs={24} lg={9}>
        <Card title={<Typography.Text type="danger">Danger zone</Typography.Text>}>
          <Flex vertical gap={16}>
            {project.status === 'active' ? (
              <div>
                <Typography.Text strong>Archive project</Typography.Text>
                <Typography.Paragraph type="secondary">Makes it read-only and hides it from the active list. Reversible.</Typography.Paragraph>
                <Popconfirm title="Archive this project?" onConfirm={() => act(() => projectsService.archive(project.key), 'Project archived')}>
                  <Button icon={<InboxOutlined />}>Archive</Button>
                </Popconfirm>
              </div>
            ) : (
              <div>
                <Typography.Text strong>Restore project</Typography.Text>
                <Typography.Paragraph type="secondary">Make it active and editable again.</Typography.Paragraph>
                <Button icon={<RollbackOutlined />} onClick={() => act(() => projectsService.restore(project.key), 'Project restored')}>
                  Restore
                </Button>
              </div>
            )}
            {canDelete && (
              <div>
                <Typography.Text strong>Delete permanently</Typography.Text>
                <Typography.Paragraph type="secondary">
                  Deletes all work items, comments and files. Only possible for archived projects.
                </Typography.Paragraph>
                <Popconfirm
                  title={`Delete ${project.name} forever?`}
                  description="This cannot be undone."
                  okText="Delete"
                  okButtonProps={{ danger: true }}
                  disabled={project.status !== 'archived'}
                  onConfirm={() => act(() => projectsService.remove(project.key), 'Project deleted', () => navigate('/projects', { replace: true }))}
                >
                  <Button danger icon={<DeleteOutlined />} disabled={project.status !== 'archived'}>
                    Delete project
                  </Button>
                </Popconfirm>
              </div>
            )}
          </Flex>
        </Card>
      </Col>
    </Row>
  )
}
