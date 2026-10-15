// Quality context on the item page: linked production errors, test cases covering it, the failed test it came from.
import { AlertOutlined, ExperimentOutlined } from '@ant-design/icons'
import { Card, Flex, Tag, Typography } from 'antd'
import { Link } from 'react-router-dom'
import { useAuth } from '../../../auth/useAuth'
import { PERMISSIONS } from '../../../config/permissions'
import type { ProjectDetail, WorkItemDetail } from '../../../types/projects'

const RESULT_COLORS: Record<string, string> = { passed: 'success', failed: 'error', blocked: 'warning', skipped: 'default' }
const ERROR_COLORS: Record<string, string> = { unresolved: 'error', resolved: 'success', ignored: 'default' }

export function QualityPanels({ item, project }: { item: WorkItemDetail; project: ProjectDetail }) {
  const { can } = useAuth()
  const canSeeErrors = can(PERMISSIONS.ERRORS_READ)
  if (!item.productionErrors.length && !item.testCases.length && !item.foundByTest) return null

  return (
    <Flex vertical gap={12} style={{ marginBottom: 20 }}>
      {item.productionErrors.length > 0 && (
        <Card size="small" title={<span><AlertOutlined /> Production errors</span>}>
          {item.productionErrors.map((e) => (
            <Flex key={e.id} align="center" gap={8} style={{ padding: '4px 0' }}>
              <Tag color={ERROR_COLORS[e.status]} style={{ marginInlineEnd: 0 }}>
                {e.status}
              </Tag>
              <Tag style={{ marginInlineEnd: 0 }}>{e.source}</Tag>
              <Typography.Text ellipsis style={{ flex: 1, minWidth: 0 }}>
                {canSeeErrors ? <Link to={`/errors/${e.id}`}>{e.title}</Link> : e.title}
              </Typography.Text>
              <Typography.Text type="secondary" style={{ whiteSpace: 'nowrap' }}>
                ×{e.occurrences} · last {new Date(e.lastSeenAt).toLocaleString()}
              </Typography.Text>
            </Flex>
          ))}
          <Typography.Text type="secondary" style={{ fontSize: '0.85em' }}>
            Errors resolve automatically when this item is done — and re-open (regression) if they happen again.
          </Typography.Text>
        </Card>
      )}
      {item.foundByTest && (
        <Card size="small" title={<span><ExperimentOutlined /> Found by test</span>}>
          <Link to={`/projects/${project.key}/tests/runs/${item.foundByTest.runId}?result=${item.foundByTest.resultId}`}>
            TC-{item.foundByTest.caseNumber} {item.foundByTest.caseTitle}
          </Link>{' '}
          <Typography.Text type="secondary">in run “{item.foundByTest.runName}”</Typography.Text>
        </Card>
      )}
      {item.testCases.length > 0 && (
        <Card size="small" title={<span><ExperimentOutlined /> Test coverage</span>}>
          {item.testCases.map((c) => (
            <Flex key={c.id} align="center" gap={8} style={{ padding: '3px 0' }}>
              <Link to={`/projects/${project.key}/tests?case=${c.number}`}>TC-{c.number}</Link>
              <Typography.Text ellipsis style={{ flex: 1, minWidth: 0 }}>
                {c.title}
              </Typography.Text>
              {c.lastResult ? <Tag color={RESULT_COLORS[c.lastResult]}>{c.lastResult}</Tag> : <Tag>not run</Tag>}
            </Flex>
          ))}
        </Card>
      )}
    </Flex>
  )
}
