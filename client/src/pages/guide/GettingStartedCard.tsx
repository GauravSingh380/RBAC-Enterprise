// "Getting started" checklist for owners / admins — on the dashboard and the Help Center home.
// Each step is ticked by the server from real data (a project exists, people were invited, …).
import { CheckCircleFilled, CloseOutlined, RocketOutlined } from '@ant-design/icons'
import { App, Button, Card, Flex, Progress, Tooltip, Typography, theme } from 'antd'
import { Link } from 'react-router-dom'
import { getErrorMessage } from '../../lib/api'
import { guideService } from '../../services/guide.service'
import type { GettingStarted } from '../../types/guide'

export function GettingStartedCard({ data, onChange, style }: { data: GettingStarted; onChange: (d: GettingStarted) => void; style?: React.CSSProperties }) {
  const { message } = App.useApp()
  const { token } = theme.useToken()
  if (!data.visible || data.dismissed) return null

  const dismiss = async () => {
    try {
      onChange(await guideService.dismissGettingStarted())
      message.info('Hidden. You can bring it back from the Help Center.')
    } catch (err) {
      message.error(getErrorMessage(err))
    }
  }
  const allDone = data.completed === data.total

  return (
    <Card
      size="small"
      style={style}
      title={
        <Flex align="center" gap={8}>
          <RocketOutlined style={{ color: token.colorPrimary }} />
          {allDone ? 'All set — your organization is ready' : 'Getting started'}
        </Flex>
      }
      extra={
        <Tooltip title="Hide this checklist">
          <Button type="text" size="small" icon={<CloseOutlined />} onClick={dismiss} aria-label="Hide the getting started checklist" />
        </Tooltip>
      }
    >
      <Flex align="center" gap={12} style={{ marginBottom: 12 }}>
        <Progress percent={Math.round((data.completed / data.total) * 100)} showInfo={false} style={{ flex: 1, margin: 0 }} />
        <Typography.Text type="secondary" style={{ whiteSpace: 'nowrap' }}>
          {data.completed} of {data.total} done
        </Typography.Text>
      </Flex>
      <Flex vertical gap={10}>
        {data.steps.map((s) => (
          <Flex key={s.key} gap={10} align="flex-start">
            {s.done ? (
              <CheckCircleFilled style={{ color: token.colorSuccess, fontSize: 18, marginTop: 2 }} aria-label="done" />
            ) : (
              <span aria-label="to do" style={{ width: 18, height: 18, marginTop: 2, borderRadius: '50%', border: `2px solid ${token.colorBorder}`, flex: 'none' }} />
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <Link to={s.path} style={{ fontWeight: 500, color: s.done ? token.colorTextSecondary : undefined, textDecoration: s.done ? 'line-through' : undefined }}>
                {s.title}
              </Link>
              <Typography.Text type="secondary" style={{ display: 'block', fontSize: '0.85em' }}>
                {s.description} <Link to={`/guide/${s.article}`}>Learn how</Link>
              </Typography.Text>
            </div>
          </Flex>
        ))}
      </Flex>
    </Card>
  )
}
