// "Possible duplicates" under the title field: asks the server for similar items while you type.
import { CopyOutlined } from '@ant-design/icons'
import { Alert, Flex, Tag, Typography } from 'antd'
import { useEffect, useState } from 'react'
import { workItemsService } from '../../../services/projects.service'
import type { WorkItemSummary } from '../../../types/projects'
import { RESOLUTION_LABELS } from './itemMeta'
import { ItemTypeIcon, StatusTag } from './ItemBits'

export function DuplicateSuggestions({ projectKey, title, excludeId }: { projectKey: string; title: string | undefined; excludeId?: number }) {
  const [matches, setMatches] = useState<WorkItemSummary[]>([])
  const query = (title ?? '').trim()

  useEffect(() => {
    if (query.length < 4) return
    let alive = true
    const timer = setTimeout(() => {
      workItemsService.similar(projectKey, query, excludeId).then(
        (r) => alive && setMatches(r),
        () => alive && setMatches([]),
      )
    }, 400)
    return () => {
      alive = false
      clearTimeout(timer)
    }
  }, [projectKey, query, excludeId])

  if (query.length < 4 || !matches.length) return null
  return (
    <Alert
      type="warning"
      showIcon
      icon={<CopyOutlined />}
      style={{ marginTop: -12, marginBottom: 16 }}
      title="Possible duplicates — is it already reported?"
      description={
        <Flex vertical gap={4} style={{ marginTop: 4 }}>
          {matches.map((m) => (
            <Flex key={m.id} align="center" gap={8}>
              <ItemTypeIcon type={m.type} size={11} />
              {/* opens in a new tab so the form keeps its content */}
              <a href={`/projects/${projectKey}/items/${m.number}`} target="_blank" rel="noreferrer">
                {m.key}
              </a>
              <Typography.Text ellipsis style={{ flex: 1, minWidth: 0 }}>
                {m.title}
              </Typography.Text>
              <StatusTag status={m.status} />
              {m.resolution && <Tag style={{ marginInlineEnd: 0 }}>{RESOLUTION_LABELS[m.resolution]}</Tag>}
            </Flex>
          ))}
        </Flex>
      }
    />
  )
}
