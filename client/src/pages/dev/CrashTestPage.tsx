// Development-only page (/dev/crash) to see the error boundary and error reporting in action.
import { BugOutlined, ThunderboltOutlined } from '@ant-design/icons'
import { Button, Card, Flex, Typography } from 'antd'
import { useState } from 'react'
import { PageHeader } from '../../components/ui'

function BrokenWidget(): never {
  throw new Error('BrokenWidget failed to render (this is a test error)')
}

export default function CrashTestPage() {
  const [crash, setCrash] = useState(false)

  return (
    <>
      <PageHeader title="Error handling test" description="Only available in development." />
      <Card>
        <Flex vertical gap={16}>
          <Typography.Paragraph>
            <strong>Render error</strong> — caught by the page error boundary. The sidebar and header stay usable, and
            the error is logged by the server (<code>server/logs/error-*.log</code>).
          </Typography.Paragraph>
          <Button danger icon={<BugOutlined />} onClick={() => setCrash(true)} style={{ width: 'fit-content' }}>
            Crash this page
          </Button>

          <Typography.Paragraph>
            <strong>Async / event handler error</strong> — boundaries can&apos;t catch these; the global handler reports it
            (check the server log).
          </Typography.Paragraph>
          <Button
            icon={<ThunderboltOutlined />}
            style={{ width: 'fit-content' }}
            onClick={() => {
              setTimeout(() => {
                throw new Error('Async test error from CrashTestPage')
              })
            }}
          >
            Throw async error
          </Button>
        </Flex>
        {crash && <BrokenWidget />}
      </Card>
    </>
  )
}
