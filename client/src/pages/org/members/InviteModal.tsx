import { CheckCircleFilled, MailOutlined } from '@ant-design/icons'
import { Alert, App, Flex, Form, Input, Modal, Radio, Result, Segmented, Select, Typography } from 'antd'
import { useCallback, useState } from 'react'
import { useAuth } from '../../../auth/useAuth'
import { HelpLink } from '../../../components/HelpLink'
import { ROLES } from '../../../config/permissions'
import { useFetch } from '../../../hooks/useFetch'
import { getErrorMessage } from '../../../lib/api'
import { invitationsService, organizationService } from '../../../services/organization.service'
import { projectsService } from '../../../services/projects.service'
import type { Role } from '../../../types'
import { UsageBars } from '../settings/PlanUsageCard'

interface Props {
  roles: Role[]
  onClose: () => void
  onInvited: () => void
}

type Kind = 'member' | 'guest'
interface FormValues {
  email: string
  roleId?: number
  projectId?: number
  projectRole: 'member' | 'viewer'
}

/**
 * Invite someone by email — as a MEMBER (with a role) or as a GUEST (an outside collaborator who only sees one project).
 * The link is emailed and also shown here once, to share directly.
 */
export default function InviteModal({ roles, onClose, onInvited }: Props) {
  const { user, organization } = useAuth()
  const { message } = App.useApp()
  const [form] = Form.useForm<FormValues>()
  const [kind, setKind] = useState<Kind>('member')
  const [saving, setSaving] = useState(false)
  const [result, setResult] = useState<{ email: string; inviteUrl: string } | null>(null)
  const usage = useFetch(useCallback(() => organizationService.usage(), []))
  // guests join a project the inviter administers
  const projects = useFetch(
    useCallback(() => projectsService.list('active').then((ps) => ps.filter((p) => p.myRole === 'admin')), []),
  )

  const memberRoles = roles.filter((r) => !(r.isSystem && r.name === ROLES.GUEST))
  const defaultRole = memberRoles.find((r) => r.name === ROLES.MEMBER)?.id

  const handleFinish = async (values: FormValues) => {
    setSaving(true)
    try {
      const { inviteUrl } = await invitationsService.create(
        kind === 'member'
          ? { email: values.email, roleId: values.roleId }
          : { email: values.email, projectId: values.projectId, projectRole: values.projectRole },
      )
      setResult({ email: values.email, inviteUrl })
      onInvited()
    } catch (err) {
      message.error(getErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open
      title={`Invite to ${organization?.name}`}
      okText={result ? 'Done' : 'Create invitation'}
      confirmLoading={saving}
      onOk={() => (result ? onClose() : form.submit())}
      onCancel={onClose}
      cancelButtonProps={{ style: result ? { display: 'none' } : undefined }}
    >
      {result ? (
        <Result
          icon={<CheckCircleFilled />}
          status="success"
          title="Invitation sent"
          subTitle={`We emailed ${result.email}. You can also share this link — it works once and expires in 7 days.`}
          extra={
            <Typography.Paragraph
              copyable={{ text: result.inviteUrl, tooltips: ['Copy link', 'Copied!'] }}
              code
              style={{ wordBreak: 'break-all', margin: 0, textAlign: 'left' }}
            >
              {result.inviteUrl}
            </Typography.Paragraph>
          }
        />
      ) : (
        <>
          <Segmented<Kind>
            block
            value={kind}
            onChange={setKind}
            options={[
              { value: 'member', label: 'Member' },
              { value: 'guest', label: 'Guest (one project)' },
            ]}
            style={{ marginBottom: 16 }}
          />
          <Form form={form} layout="vertical" onFinish={handleFinish} initialValues={{ roleId: defaultRole, projectRole: 'viewer' }}>
            <Form.Item name="email" label="Email" rules={[{ required: true, type: 'email', message: 'Enter a valid email' }]}>
              <Input prefix={<MailOutlined />} placeholder={kind === 'member' ? 'teammate@company.com' : 'client@their-company.com'} autoFocus />
            </Form.Item>

            {kind === 'member' ? (
              <Form.Item name="roleId" label="Role" rules={[{ required: true }]}>
                <Select
                  options={memberRoles.map((r) => ({
                    value: r.id,
                    label: r.displayName,
                    disabled: r.name === ROLES.OWNER && !user?.isOwner,
                  }))}
                />
              </Form.Item>
            ) : (
              <>
                <Alert
                  type="info"
                  showIcon
                  style={{ marginBottom: 16 }}
                  title={
                    <span>
                      A guest sees only this project — no other projects, people or settings.{' '}
                      <HelpLink article="guest-access" label="More about guests" />
                    </span>
                  }
                />
                <Form.Item
                  name="projectId"
                  label="Project"
                  rules={[{ required: true, message: 'Pick the project' }]}
                  extra={projects.data?.length === 0 ? 'You can invite guests to projects you administer.' : undefined}
                >
                  <Select
                    showSearch
                    optionFilterProp="label"
                    loading={!projects.data}
                    placeholder="Pick a project"
                    options={(projects.data ?? []).map((p) => ({ value: p.id, label: `${p.name} (${p.key})` }))}
                  />
                </Form.Item>
                <Form.Item name="projectRole" label="In this project they can">
                  <Radio.Group
                    options={[
                      { value: 'viewer', label: 'Read and comment' },
                      { value: 'member', label: 'Create and edit work' },
                    ]}
                  />
                </Form.Item>
              </>
            )}
          </Form>
          {usage.data && (
            <Flex vertical style={{ marginTop: 4 }}>
              <UsageBars usage={usage.data} only={[kind === 'member' ? 'members' : 'guests']} />
            </Flex>
          )}
        </>
      )}
    </Modal>
  )
}
