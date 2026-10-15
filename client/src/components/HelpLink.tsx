// The small "?" next to a page title: opens the matching Help Center article.
// Hidden when the person may not read the guide (guide.view) or has no organization (platform console).
import { QuestionCircleOutlined } from '@ant-design/icons'
import { Tooltip, theme } from 'antd'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import { PERMISSIONS } from '../config/permissions'

export function HelpLink({ article, label = 'How does this page work?' }: { article: string; label?: string }) {
  const { can } = useAuth()
  const { token } = theme.useToken()
  if (!can(PERMISSIONS.GUIDE_VIEW)) return null
  return (
    <Tooltip title={label}>
      <Link to={`/guide/${article}`} aria-label={label} style={{ color: token.colorTextTertiary, fontSize: 16, lineHeight: 1 }}>
        <QuestionCircleOutlined />
      </Link>
    </Tooltip>
  )
}
