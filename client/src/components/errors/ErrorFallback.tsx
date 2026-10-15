import { BugOutlined, HomeOutlined, ReloadOutlined, RedoOutlined } from '@ant-design/icons'
import { Button, Card, Collapse, Flex, Result, Tag, Typography, theme } from 'antd'
import { APP_ENV } from '../../config/env'

interface Props {
  error: Error
  errorId?: string | null
  componentStack?: string | null
  /** "page" keeps the app shell (sidebar/header) around the error; "app" fills the screen. */
  variant?: 'page' | 'app'
  onRetry?: () => void
}

/** First "at Component" line of the component stack = where rendering broke. */
function brokenComponent(componentStack?: string | null) {
  const match = componentStack?.match(/at (\w+)/)
  return match?.[1]
}

export function ErrorFallback({ error, errorId, componentStack, variant = 'page', onRetry }: Props) {
  const { token } = theme.useToken()
  const component = brokenComponent(componentStack)

  const report = [
    `Error ID: ${errorId ?? 'n/a'}`,
    `URL: ${window.location.href}`,
    `Time: ${new Date().toISOString()}`,
    `Error: ${error.name}: ${error.message}`,
    component ? `Component: ${component}` : null,
    '',
    error.stack ?? '',
    componentStack ? `\nComponent stack:${componentStack}` : '',
  ]
    .filter((line) => line !== null)
    .join('\n')

  const codeBlock = (text: string) => (
    <pre
      style={{
        margin: 0,
        maxHeight: 320,
        overflow: 'auto',
        fontSize: '0.8em',
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
        padding: 12,
        borderRadius: token.borderRadius,
        background: token.colorFillTertiary,
      }}
    >
      {text}
    </pre>
  )

  const content = (
    <Result
      status="error"
      icon={<BugOutlined style={{ color: token.colorError }} />}
      title="Something went wrong"
      subTitle={
        <Flex vertical gap={8} align="center">
          <span>
            This part of the app ran into an unexpected problem. The error has been reported automatically.
          </span>
          {errorId && (
            <span>
              Error ID:{' '}
              <Typography.Text code copyable={{ text: errorId, tooltips: ['Copy error ID', 'Copied!'] }}>
                {errorId.slice(0, 8)}
              </Typography.Text>
            </span>
          )}
        </Flex>
      }
      extra={
        <Flex gap={8} justify="center" wrap>
          {onRetry && (
            <Button type="primary" icon={<RedoOutlined />} onClick={onRetry}>
              Try again
            </Button>
          )}
          <Button icon={<ReloadOutlined />} onClick={() => window.location.reload()}>
            Reload page
          </Button>
          <Button icon={<HomeOutlined />} href="/">
            Go home
          </Button>
        </Flex>
      }
    >
      {/* Technical details: always in development, never shown to users in production */}
      {APP_ENV.isDev && (
        <Flex vertical gap={12} style={{ textAlign: 'left' }}>
          <Flex wrap gap={8} align="center">
            <Tag color="red">{error.name}</Tag>
            <Typography.Text strong>{error.message}</Typography.Text>
            {component && (
              <Tag color="orange">
                in &lt;{component} /&gt;
              </Tag>
            )}
          </Flex>
          <Collapse
            size="small"
            defaultActiveKey={['stack']}
            items={[
              { key: 'stack', label: 'Stack trace', children: codeBlock(error.stack ?? 'No stack available') },
              ...(componentStack
                ? [{ key: 'components', label: 'Component stack (where it broke)', children: codeBlock(componentStack.trim()) }]
                : []),
            ]}
          />
          <Typography.Text copyable={{ text: report, tooltips: ['Copy full report', 'Copied!'] }} type="secondary">
            Copy full error report
          </Typography.Text>
        </Flex>
      )}
    </Result>
  )

  if (variant === 'app') {
    return (
      <Flex align="center" justify="center" style={{ minHeight: '100vh', padding: 16, background: token.colorBgLayout }}>
        <Card style={{ width: '100%', maxWidth: 820 }}>{content}</Card>
      </Flex>
    )
  }
  return <Card>{content}</Card>
}
