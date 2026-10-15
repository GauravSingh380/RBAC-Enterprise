// Shown instead of the app while the account needs a new password
// (the organization's password rules changed, or an admin asked everyone to choose a new one).
// The server enforces it too: every API call except /api/auth/* answers 403 PASSWORD_CHANGE_REQUIRED.
import { SafetyOutlined } from '@ant-design/icons'
import { Button, Card, Flex, Typography } from 'antd'
import { useAuth } from '../../auth/useAuth'
import { ChangePasswordCard } from './AccountSecurity'

export default function PasswordChangeRequiredPage() {
  const { user, reloadProfile, logout } = useAuth()
  return (
    <Flex justify="center" style={{ padding: '48px 16px' }}>
      <Card style={{ width: '100%', maxWidth: 440 }} styles={{ body: { padding: 32 } }}>
        <SafetyOutlined style={{ fontSize: 36, marginBottom: 12 }} />
        <Typography.Title level={3} style={{ marginTop: 0 }}>
          Choose a new password
        </Typography.Title>
        <Typography.Paragraph type="secondary">
          Your organization asks for a new password before you continue
          {user?.email ? (
            <>
              {' '}
              as <strong>{user.email}</strong>
            </>
          ) : null}
          . Other devices will be signed out.
        </Typography.Paragraph>
        <ChangePasswordCard embedded onChanged={() => void reloadProfile()} />
        <Button type="link" onClick={() => logout()} style={{ marginTop: 12, paddingInline: 0 }}>
          Sign out instead
        </Button>
      </Card>
    </Flex>
  )
}
