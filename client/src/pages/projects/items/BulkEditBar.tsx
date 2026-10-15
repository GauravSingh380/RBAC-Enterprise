// Appears above the table when rows are selected: apply one change to all of them (one request,
// all-or-nothing on the server, history recorded per item).
import { CloseOutlined } from '@ant-design/icons'
import { App, Button, Flex, Select, Typography, theme } from 'antd'
import { useState } from 'react'
import { getErrorMessage } from '../../../lib/api'
import { workItemsService, type BulkChanges } from '../../../services/projects.service'
import type { PersonOption, ProjectDetail, Sprint } from '../../../types/projects'
import { PRIORITIES } from '../shared/itemMeta'

interface Props {
  project: ProjectDetail
  selected: number[]
  people: PersonOption[]
  sprints: Sprint[]
  onDone: () => void
  onClear: () => void
}

export function BulkEditBar({ project, selected, people, sprints, onDone, onClear }: Props) {
  const { message } = App.useApp()
  const { token } = theme.useToken()
  const [busy, setBusy] = useState(false)

  const apply = async (changes: BulkChanges, what: string) => {
    setBusy(true)
    try {
      const { updated } = await workItemsService.bulkUpdate(project.key, selected, changes)
      message.success(`${what} — ${updated} item${updated === 1 ? '' : 's'} updated`)
      onDone()
    } catch (err) {
      message.error(getErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const select = (placeholder: string, options: { value: string | number; label: string }[], onPick: (v: string) => void, width = 150) => (
    <Select
      placeholder={placeholder}
      value={null}
      disabled={busy}
      style={{ width }}
      options={options.map((o) => ({ ...o, value: String(o.value) }))}
      onChange={(v: string) => onPick(v)}
      showSearch={{ optionFilterProp: 'label' }}
      popupMatchSelectWidth={false}
    />
  )

  return (
    <Flex
      gap={8}
      wrap
      align="center"
      style={{ marginBottom: 12, padding: '8px 12px', borderRadius: token.borderRadiusLG, background: token.colorPrimaryBg }}
    >
      <Typography.Text strong>{selected.length} selected</Typography.Text>
      {select('Set status', project.statuses.map((s) => ({ value: s.id, label: s.name })), (v) => apply({ statusId: Number(v) }, 'Status changed'))}
      {select(
        'Assign to',
        [{ value: 'none', label: 'Unassigned' }, ...people.map((p) => ({ value: p.id, label: p.name }))],
        (v) => apply({ assigneeId: v === 'none' ? null : Number(v) }, 'Assignee changed'),
      )}
      {select('Set priority', PRIORITIES.map((p) => ({ value: p.value, label: p.label })), (v) => apply({ priority: v as BulkChanges['priority'] }, 'Priority changed'), 130)}
      {sprints.length > 0 &&
        select(
          'Move to sprint',
          [{ value: 'backlog', label: 'Backlog (no sprint)' }, ...sprints.map((s) => ({ value: s.id, label: s.name }))],
          (v) => apply({ sprintId: v === 'backlog' ? null : Number(v) }, 'Sprint changed'),
        )}
      {project.labels.length > 0 &&
        select('Add label', project.labels.map((l) => ({ value: l.id, label: l.name })), (v) => apply({ addLabelIds: [Number(v)] }, 'Label added'), 130)}
      <div style={{ flex: 1 }} />
      <Button type="text" icon={<CloseOutlined />} onClick={onClear}>
        Clear selection
      </Button>
    </Flex>
  )
}
