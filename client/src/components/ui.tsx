// Small shared building blocks on top of Ant Design
import { Flex, Spin, Typography } from 'antd'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { HelpLink } from './HelpLink'

export function FullPageSpinner() {
  return (
    <div className="full-page-center">
      <Spin size="large" />
    </div>
  )
}

/** `help` = slug of a Help Center article, shown as a small "?" next to the title. */
export function PageHeader({ title, description, actions, help }: { title: string; description?: string; actions?: ReactNode; help?: string }) {
  return (
    <Flex justify="space-between" align="flex-start" gap={16} wrap style={{ marginBottom: 24 }}>
      <div>
        <Flex align="center" gap={6}>
          <Typography.Title level={3} style={{ margin: 0 }}>
            {title}
          </Typography.Title>
          {help && <HelpLink article={help} />}
        </Flex>
        {description && (
          <Typography.Text type="secondary" style={{ display: 'block', marginTop: 4 }}>
            {description}
          </Typography.Text>
        )}
      </div>
      {actions && <Flex gap={8}>{actions}</Flex>}
    </Flex>
  )
}

export function Brand({ collapsed = false }: { collapsed?: boolean }) {
  return (
    <Link to="/" className="brand">
      <span className="brand-logo">TF</span>
      {!collapsed && <Typography.Text style={{ fontSize: 'inherit', fontWeight: 700 }}>Team-Flex</Typography.Text>}
    </Link>
  )
}
