// Landing page of an invitation link: /invite/:token
//   logged out  -> create an account (joins directly) or log in and come back here
//   logged in   -> accept (only with the invited email address)
import { MailOutlined, TeamOutlined } from '@ant-design/icons'
import { Alert, App, Button, Card, Flex, Result, Skeleton, Typography } from 'antd'
import { useCallback, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../../auth/useAuth'
import { useFetch } from '../../hooks/useFetch'
import { getErrorMessage } from '../../lib/api'
import { authService } from '../../services/auth.service'

export default function InvitePage() {
  const { token = '' } = useParams()
  const { user, status, acceptInvitation, logout } = useAuth()
  const { message } = App.useApp()
  const navigate = useNavigate()
  const [accepting, setAccepting] = useState(false)
  const invite = useFetch(useCallback(() => authService.previewInvitation(token), [token]))

  if (invite.loading || status === 'loading') return <Skeleton active style={{ maxWidth: 480, margin: '48px auto' }} />
  if (invite.error || !invite.data) {
    return <Result status="warning" title="Invitation not found" subTitle={invite.error ?? 'This link is invalid.'} />
  }

  const inv = invite.data
  if (inv.status !== 'pending') {
    const text = { accepted: 'This invitation has already been used.', revoked: 'This invitation was cancelled.', expired: 'This invitation has expired.' }[inv.status]
    return (
      <Result
        status="info"
        title={`Invitation to ${inv.organizationName}`}
        subTitle={`${text} Ask an admin of ${inv.organizationName} for a new one.`}
        extra={<Link to={user ? '/dashboard' : '/login'}><Button type="primary">{user ? 'Go to dashboard' : 'Log in'}</Button></Link>}
      />
    )
  }

  const handleAccept = async () => {
    setAccepting(true)
    try {
      await acceptInvitation(token)
      message.success(`Welcome to ${inv.organizationName}!`)
      navigate('/dashboard', { replace: true })
    } catch (err) {
      message.error(getErrorMessage(err))
      setAccepting(false)
    }
  }

  const wrongAccount = user && user.email.toLowerCase() !== inv.email.toLowerCase()

  return (
    <Card style={{ maxWidth: 480, margin: '48px auto', textAlign: 'center' }} styles={{ body: { padding: 32 } }}>
      <TeamOutlined style={{ fontSize: 40, marginBottom: 12 }} />
      <Typography.Title level={3} style={{ marginTop: 0 }}>
        Join {inv.organizationName}
      </Typography.Title>
      <Typography.Paragraph type="secondary">
        {inv.projectName ? (
          <>
            {inv.invitedBy ?? 'An admin'} invited <strong>{inv.email}</strong> as a <strong>guest</strong> on the project{' '}
            <strong>{inv.projectName}</strong>. You will see that project only.
          </>
        ) : (
          <>
            {inv.invitedBy ?? 'An admin'} invited <strong>{inv.email}</strong> to join as <strong>{inv.roleName}</strong>.
          </>
        )}
      </Typography.Paragraph>

      {!user && (
        <Flex vertical gap={8}>
          <Link to={`/register?invite=${encodeURIComponent(token)}&email=${encodeURIComponent(inv.email)}`}>
            <Button type="primary" block size="large" icon={<MailOutlined />}>
              Create account &amp; join
            </Button>
          </Link>
          <Link to="/login" state={{ from: `/invite/${token}` }}>
            <Button block size="large">
              I already have an account
            </Button>
          </Link>
        </Flex>
      )}

      {user && !wrongAccount && (
        <Button type="primary" block size="large" loading={accepting} onClick={handleAccept}>
          Accept invitation
        </Button>
      )}

      {wrongAccount && (
        <Flex vertical gap={12}>
          <Alert
            type="warning"
            showIcon
            title={`You are logged in as ${user.email}, but this invitation is for ${inv.email}.`}
          />
          <Button onClick={() => logout()}>Log out and switch account</Button>
        </Flex>
      )}
    </Card>
  )
}
