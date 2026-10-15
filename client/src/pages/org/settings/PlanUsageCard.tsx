// "Plan & usage": the organization's plan and how much of it is used (members, guests, active projects).
// The server enforces the limits; this only shows them.
import { CrownOutlined } from '@ant-design/icons'
import { Card, Flex, Progress, Skeleton, Tag, Typography, theme } from 'antd'
import { useCallback } from 'react'
import { HelpLink } from '../../../components/HelpLink'
import { useFetch } from '../../../hooks/useFetch'
import { organizationService } from '../../../services/organization.service'
import type { LimitKind, PlanUsage } from '../../../types'
import { usageRows } from './planMeta'

export function PlanUsageCard({ style }: { style?: React.CSSProperties }) {
  const usage = useFetch(useCallback(() => organizationService.usage(), []))
  return (
    <Card
      style={style}
      title={
        <Flex align="center" gap={8}>
          <CrownOutlined /> Plan &amp; usage <HelpLink article="plans-and-limits" label="What do the limits mean?" />
        </Flex>
      }
      extra={usage.data && <Tag color="gold">{usage.data.plan.name}</Tag>}
    >
      {!usage.data ? <Skeleton active paragraph={{ rows: 3 }} /> : <UsageBars usage={usage.data} />}
    </Card>
  )
}

export function UsageBars({ usage, only }: { usage: PlanUsage; only?: LimitKind[] }) {
  const { token } = theme.useToken()
  return (
    <Flex vertical gap={12}>
      {usageRows(usage)
        .filter((r) => !only || only.includes(r.kind))
        .map((r) => (
          <div key={r.kind}>
            <Flex justify="space-between" gap={8}>
              <Typography.Text>{r.label}</Typography.Text>
              <Typography.Text type={r.full ? 'danger' : 'secondary'}>{r.text}</Typography.Text>
            </Flex>
            {r.percent !== null && (
              <Progress
                percent={r.percent}
                showInfo={false}
                size="small"
                strokeColor={r.full ? token.colorError : r.percent >= 80 ? token.colorWarning : undefined}
                style={{ margin: 0 }}
              />
            )}
            {r.hint && (
              <Typography.Text type="secondary" style={{ fontSize: '0.85em' }}>
                {r.hint}
              </Typography.Text>
            )}
          </div>
        ))}
    </Flex>
  )
}
