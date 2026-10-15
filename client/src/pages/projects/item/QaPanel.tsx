// QA verification flow on the item page: "Waiting for QA" with Pass / Fail.
import { CheckCircleOutlined, CloseCircleOutlined, SafetyCertificateOutlined } from '@ant-design/icons'
import { Alert, App, Button, Form, Input, Modal, Space } from 'antd'
import { useState } from 'react'
import { useAuth } from '../../../auth/useAuth'
import { getErrorMessage } from '../../../lib/api'
import { workItemsService } from '../../../services/projects.service'
import type { ProjectDetail, WorkItemDetail } from '../../../types/projects'
import { qaState } from '../shared/itemMeta'

export function QaPanel({ item, project, onChanged }: { item: WorkItemDetail; project: ProjectDetail; onChanged: (item: WorkItemDetail) => void }) {
  const { message } = App.useApp()
  const { user } = useAuth()
  const [verdict, setVerdict] = useState<'pass' | 'fail' | null>(null)
  const [busy, setBusy] = useState(false)
  const [form] = Form.useForm<{ comment?: string; fixedInVersion?: string }>()

  if (qaState(project, item.status.id) !== 'waiting') return null
  // QA verdicts need the rights of the "passed" status (e.g. only QA / admins may verify)
  const passed = project.statuses.find((s) => s.id === project.qaPassedStatusId)
  const allowed =
    item.permissions.canEdit &&
    (!passed?.restrictedRoles.length || project.myRole === 'admin' || passed.restrictedRoles.some((r) => user?.roles.includes(r)))

  const submit = async () => {
    const values = await form.validateFields()
    setBusy(true)
    try {
      const updated = await workItemsService.qaVerdict(item.id, { verdict: verdict!, comment: values.comment?.trim() || undefined, fixedInVersion: values.fixedInVersion?.trim() || undefined })
      message.success(verdict === 'pass' ? `${item.key} verified` : `${item.key} sent back to development`)
      setVerdict(null)
      form.resetFields()
      onChanged(updated)
    } catch (err) {
      message.error(getErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Alert
        type="info"
        showIcon
        icon={<SafetyCertificateOutlined />}
        style={{ marginBottom: 16 }}
        title="Waiting for QA verification"
        description={allowed ? 'Test the fix, then pass it or send it back with what still fails.' : `Only ${passed?.restrictedRoles.join(' / ')} can give the QA verdict.`}
        action={
          allowed && (
            <Space direction="vertical">
              <Button type="primary" icon={<CheckCircleOutlined />} onClick={() => setVerdict('pass')} block>
                Pass
              </Button>
              <Button danger icon={<CloseCircleOutlined />} onClick={() => setVerdict('fail')} block>
                Fail
              </Button>
            </Space>
          )
        }
      />
      <Modal
        open={verdict !== null}
        title={verdict === 'pass' ? `Verify ${item.key}` : `Send ${item.key} back`}
        okText={verdict === 'pass' ? 'Mark verified' : 'Reopen'}
        okButtonProps={{ danger: verdict === 'fail' }}
        confirmLoading={busy}
        onOk={submit}
        onCancel={() => setVerdict(null)}
        destroyOnHidden
      >
        <Form form={form} layout="vertical" initialValues={{ fixedInVersion: item.fixedInVersion ?? undefined }}>
          {verdict === 'pass' && (
            <Form.Item name="fixedInVersion" label="Fixed in version" extra="The release / build you tested">
              <Input placeholder="e.g. 2.4.1" maxLength={50} />
            </Form.Item>
          )}
          <Form.Item
            name="comment"
            label={verdict === 'pass' ? 'Note (optional)' : 'What still fails?'}
            rules={verdict === 'fail' ? [{ required: true, min: 3, message: 'Explain what still fails' }] : []}
          >
            <Input.TextArea autoSize={{ minRows: 3 }} autoFocus placeholder={verdict === 'fail' ? 'Steps, data and what you saw…' : undefined} />
          </Form.Item>
        </Form>
      </Modal>
    </>
  )
}
