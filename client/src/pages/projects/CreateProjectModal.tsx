import { BugOutlined, FileOutlined, LockOutlined, ProjectOutlined, ScheduleOutlined, TeamOutlined } from '@ant-design/icons'
import { App, Card, Col, Form, Input, Modal, Radio, Row, Typography, theme } from 'antd'
import { useState } from 'react'
import { getErrorMessage } from '../../lib/api'
import { projectsService, type ProjectInput } from '../../services/projects.service'
import type { ProjectDetail } from '../../types/projects'

const TEMPLATES = [
  { key: 'kanban', name: 'Kanban', icon: <ProjectOutlined />, description: 'To Do → In Progress → Done. Continuous flow.' },
  { key: 'scrum', name: 'Scrum', icon: <ScheduleOutlined />, description: 'Backlog, review step and story points for sprints.' },
  { key: 'bug_tracking', name: 'Bug tracking', icon: <BugOutlined />, description: 'Open → Fix → QA → Verified. Only QA can verify.' },
  { key: 'blank', name: 'Blank', icon: <FileOutlined />, description: 'Two statuses. Build your own workflow.' },
]

/** "Customer Portal" → "CP", "Website" → "WEB" */
function suggestKey(name: string) {
  const words = name.toUpperCase().replace(/[^A-Z0-9 ]/g, '').split(/\s+/).filter(Boolean)
  if (!words.length) return ''
  const key = words.length > 1 ? words.map((w) => w[0]).join('') : words[0]!.slice(0, 4)
  return /^[A-Z]/.test(key) ? key.slice(0, 10) : `P${key}`.slice(0, 10)
}

export default function CreateProjectModal({ onClose, onCreated }: { onClose: () => void; onCreated: (p: ProjectDetail) => void }) {
  const { message } = App.useApp()
  const { token } = theme.useToken()
  const [form] = Form.useForm<ProjectInput>()
  const [saving, setSaving] = useState(false)
  const [keyTouched, setKeyTouched] = useState(false)
  const template = Form.useWatch('template', form) ?? 'kanban'

  const handleFinish = async (values: ProjectInput) => {
    setSaving(true)
    try {
      const project = await projectsService.create(values)
      message.success(`Project ${project.name} created`)
      onCreated(project)
    } catch (err) {
      message.error(getErrorMessage(err))
      setSaving(false)
    }
  }

  return (
    <Modal open title="Create project" okText="Create project" confirmLoading={saving} onOk={() => form.submit()} onCancel={onClose} width={680}>
      <Form<ProjectInput>
        form={form}
        layout="vertical"
        onFinish={handleFinish}
        requiredMark="optional"
        initialValues={{ template: 'kanban', visibility: 'organization' }}
      >
        <Form.Item label="Template" name="template">
          <Row gutter={[12, 12]}>
            {TEMPLATES.map((t) => {
              const active = template === t.key
              return (
                <Col xs={12} key={t.key}>
                  <Card
                    size="small"
                    hoverable
                    onClick={() => form.setFieldValue('template', t.key)}
                    style={{ height: '100%', borderColor: active ? token.colorPrimary : undefined, background: active ? token.colorPrimaryBg : undefined }}
                  >
                    <Typography.Text strong>
                      <span style={{ color: token.colorPrimary, marginRight: 8 }}>{t.icon}</span>
                      {t.name}
                    </Typography.Text>
                    <Typography.Paragraph type="secondary" style={{ margin: '4px 0 0', fontSize: '0.88em' }}>
                      {t.description}
                    </Typography.Paragraph>
                  </Card>
                </Col>
              )
            })}
          </Row>
        </Form.Item>

        <Row gutter={16}>
          <Col xs={24} sm={16}>
            <Form.Item name="name" label="Project name" rules={[{ required: true, min: 2, max: 100 }]}>
              <Input
                placeholder="e.g. Customer Portal"
                autoFocus
                onChange={(e) => !keyTouched && form.setFieldValue('key', suggestKey(e.target.value))}
              />
            </Form.Item>
          </Col>
          <Col xs={24} sm={8}>
            <Form.Item
              name="key"
              label="Key"
              tooltip="Prefix of item numbers, e.g. CP-123. Cannot be changed later."
              normalize={(v: string) => v?.toUpperCase()}
              rules={[{ required: true, pattern: /^[A-Z][A-Z0-9]{1,9}$/, message: '2–10 letters/digits' }]}
            >
              <Input placeholder="CP" maxLength={10} onChange={() => setKeyTouched(true)} />
            </Form.Item>
          </Col>
        </Row>

        <Form.Item name="description" label="Description">
          <Input.TextArea rows={2} placeholder="What is this project about?" />
        </Form.Item>

        <Form.Item name="visibility" label="Who can see it">
          <Radio.Group>
            <Radio value="organization">
              <TeamOutlined /> Everyone in the organization (non-members can view)
            </Radio>
            <Radio value="private">
              <LockOutlined /> Private — project members only
            </Radio>
          </Radio.Group>
        </Form.Item>
      </Form>
    </Modal>
  )
}
