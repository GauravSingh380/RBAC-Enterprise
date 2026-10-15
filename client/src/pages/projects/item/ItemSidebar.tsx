// Right column of the work item page: every field editable in place (saved immediately).
import { EyeInvisibleOutlined, EyeOutlined, LockOutlined, PlusOutlined } from '@ant-design/icons'
import { App, Avatar, Button, Card, DatePicker, Descriptions, Divider, Flex, Input, InputNumber, Select, Space, Tooltip, Typography } from 'antd'
import dayjs from 'dayjs'
import { useCallback, useState } from 'react'
import { useFetch } from '../../../hooks/useFetch'
import { useAuth } from '../../../auth/useAuth'
import { getErrorMessage } from '../../../lib/api'
import { projectsService, sprintsService, workItemsService, type WorkItemInput } from '../../../services/projects.service'
import type { PersonOption, ProjectDetail, Resolution, WorkItemDetail } from '../../../types/projects'
import { PRIORITIES, RESOLUTION_LABELS, SEVERITIES, isOverdue } from '../shared/itemMeta'
import { PriorityIcon, StatusTag, UserAvatar } from '../shared/ItemBits'
import { CustomFieldInput } from '../items/CustomFieldInput'
import { absenceOn, awayLabel } from '../shared/availability'
import { useAvailability } from '../shared/useAvailability'

interface Props {
  item: WorkItemDetail
  project: ProjectDetail
  people: PersonOption[]
  save: (changes: WorkItemInput) => Promise<void>
  onItemChanged: (item: WorkItemDetail) => void
  reloadProject: () => void
}

export default function ItemSidebar({ item, project, people, save, onItemChanged, reloadProject }: Props) {
  const { user } = useAuth()
  const { message } = App.useApp()
  const editable = item.permissions.canEdit
  const [newLabel, setNewLabel] = useState('')
  const availability = useAvailability(project.key)
  const assigneeAbsence = item.assignee && item.dueDate && item.status.category !== 'done' ? absenceOn(availability.get(item.assignee.id), item.dueDate) : null
  const sprints = useFetch(useCallback(() => sprintsService.list(project.key, 'open'), [project.key]))
  const sprintOptions = [
    ...(item.sprint?.status === 'completed' ? [{ value: item.sprint.id, label: `${item.sprint.name} (completed)`, disabled: true }] : []),
    ...(sprints.data ?? []).map((s) => ({ value: s.id, label: s.status === 'active' ? `${s.name} (active)` : s.name })),
  ]

  const toggleWatch = async () => {
    try {
      const res = item.isWatching ? await workItemsService.unwatch(item.id) : await workItemsService.watch(item.id)
      onItemChanged({ ...item, isWatching: res.isWatching, watchers: res.watchers })
    } catch (err) {
      message.error(getErrorMessage(err))
    }
  }

  const createLabel = async () => {
    const name = newLabel.trim()
    if (!name) return
    try {
      const label = await projectsService.createLabel(project.key, name)
      setNewLabel('')
      reloadProject()
      await save({ labelIds: [...item.labels.map((l) => l.id), label.id] })
    } catch (err) {
      message.error(getErrorMessage(err))
    }
  }

  const myRoles = user?.roles ?? []
  const statusOptions = project.statuses.map((s) => {
    const locked = s.restrictedRoles.length > 0 && project.myRole !== 'admin' && !s.restrictedRoles.some((r) => myRoles.includes(r))
    return {
      value: s.id,
      disabled: locked,
      label: (
        <Space>
          <StatusTag status={s} />
          {s.restrictedRoles.length > 0 && (
            <Tooltip title={`Only ${s.restrictedRoles.join(' / ')}`}>
              <LockOutlined style={{ opacity: 0.6 }} />
            </Tooltip>
          )}
        </Space>
      ),
    }
  })

  const row = (label: string, children: React.ReactNode) => ({ key: label, label, children })

  return (
    <Flex vertical gap={16}>
      <Card size="small" styles={{ body: { padding: 16 } }}>
        <Select
          value={item.status.id}
          onChange={(statusId) => save({ statusId })}
          options={statusOptions}
          disabled={!editable}
          style={{ width: '100%' }}
          size="large"
        />
        <Divider style={{ margin: '16px 0 8px' }} />
        <Descriptions
          column={1}
          size="small"
          styles={{ label: { width: 110 } }}
          items={[
            row(
              'Assignee',
              <Select
                variant="borderless"
                allowClear
                showSearch={{ optionFilterProp: 'label' }}
                placeholder="Unassigned"
                value={item.assignee?.id}
                onChange={(assigneeId) => save({ assigneeId: assigneeId ?? null })}
                disabled={!editable}
                style={{ width: '100%', marginLeft: -11 }}
                labelRender={() => <UserAvatar user={item.assignee} size={22} showName />}
                options={people.map((p) => {
                  const away = awayLabel(availability.get(p.id)?.away ?? [])
                  return { value: p.id, label: p.name, title: away ?? undefined, away }
                })}
                optionRender={(o) => (
                  <Flex justify="space-between" gap={8}>
                    <span>{o.label}</span>
                    {o.data.away && <Typography.Text type="warning" style={{ fontSize: '0.85em' }}>🌴 {o.data.away}</Typography.Text>}
                  </Flex>
                )}
                popupRender={(menu) => (
                  <>
                    {user && people.some((p) => p.id === user.id) && item.assignee?.id !== user.id && (
                      <Button type="link" size="small" onClick={() => save({ assigneeId: user.id })}>
                        Assign to me
                      </Button>
                    )}
                    {menu}
                  </>
                )}
              />,
            ),
            row('Reporter', <UserAvatar user={item.reporter} size={22} showName />),
            ...(item.type !== 'epic' && (sprintOptions.length > 0 || item.sprint)
              ? [
                  row(
                    'Sprint',
                    <Tooltip title={item.type === 'subtask' ? 'Sub-tasks normally follow their parent' : undefined}>
                      <Select
                        variant="borderless"
                        allowClear
                        placeholder="Backlog"
                        value={item.sprint?.id}
                        onChange={(sprintId?: number) => save({ sprintId: sprintId ?? null })}
                        disabled={!editable}
                        style={{ width: '100%', marginLeft: -11 }}
                        options={sprintOptions}
                      />
                    </Tooltip>,
                  ),
                ]
              : []),
            row(
              'Priority',
              <Select
                variant="borderless"
                value={item.priority}
                onChange={(priority) => save({ priority })}
                disabled={!editable}
                style={{ width: '100%', marginLeft: -11 }}
                options={PRIORITIES.map((p) => ({ value: p.value, label: <PriorityIcon priority={p.value} showLabel /> }))}
              />,
            ),
            ...(item.type === 'bug'
              ? [
                  row(
                    'Severity',
                    <Select
                      variant="borderless"
                      allowClear
                      placeholder="Not set"
                      value={item.severity ?? undefined}
                      onChange={(severity) => save({ severity: severity ?? null })}
                      disabled={!editable}
                      style={{ width: '100%', marginLeft: -11 }}
                      options={SEVERITIES.map((s) => ({ value: s.value, label: s.label }))}
                    />,
                  ),
                ]
              : []),
            ...(item.type === 'bug' || item.resolution
              ? [
                  row(
                    'Resolution',
                    <Tooltip title={item.status.category !== 'done' ? 'Set automatically when the bug is done (“Fixed”)' : undefined}>
                      <Select
                        variant="borderless"
                        allowClear
                        placeholder="Unresolved"
                        value={item.resolution ?? undefined}
                        onChange={(resolution?: Resolution) => save({ resolution: resolution ?? null })}
                        disabled={!editable}
                        style={{ width: '100%', marginLeft: -11 }}
                        options={Object.entries(RESOLUTION_LABELS).map(([value, label]) => ({ value, label }))}
                      />
                    </Tooltip>,
                  ),
                ]
              : []),
            row(
              'Labels',
              <Select
                mode="multiple"
                variant="borderless"
                placeholder="None"
                value={item.labels.map((l) => l.id)}
                onChange={(labelIds) => save({ labelIds })}
                disabled={!editable}
                style={{ width: '100%', marginLeft: -11 }}
                options={project.labels.map((l) => ({ value: l.id, label: l.name }))}
                popupRender={(menu) => (
                  <>
                    {menu}
                    <Divider style={{ margin: '6px 0' }} />
                    <Space.Compact style={{ padding: '0 8px 6px', width: '100%' }}>
                      <Input size="small" placeholder="New label" value={newLabel} onChange={(e) => setNewLabel(e.target.value)} onKeyDown={(e) => e.stopPropagation()} onPressEnter={createLabel} />
                      <Button size="small" icon={<PlusOutlined />} onClick={createLabel} />
                    </Space.Compact>
                  </>
                )}
              />,
            ),
            row(
              'Due date',
              <DatePicker
                variant="borderless"
                value={item.dueDate ? dayjs(item.dueDate) : null}
                onChange={(d) => save({ dueDate: d ? d.format('YYYY-MM-DD') : null })}
                disabled={!editable}
                status={isOverdue(item.dueDate, item.status.category) ? 'error' : assigneeAbsence ? 'warning' : undefined}
                style={{ marginLeft: -11 }}
                placeholder="None"
              />,
            ),
            ...(assigneeAbsence
              ? [
                  row(
                    '',
                    <Typography.Text type="warning" style={{ fontSize: '0.85em' }}>
                      ⚠ {item.assignee!.name} {assigneeAbsence} on the due date
                    </Typography.Text>,
                  ),
                ]
              : []),
            row(
              'Estimate',
              <InputNumber
                variant="borderless"
                min={0}
                max={99999}
                placeholder="—"
                defaultValue={item.estimate ?? undefined}
                onBlur={(e) => {
                  const v = e.target.value === '' ? null : Number(e.target.value)
                  if (v !== item.estimate) save({ estimate: v })
                }}
                disabled={!editable}
                style={{ marginLeft: -11 }}
              />,
            ),
          ]}
        />
      </Card>

      {project.fields.length > 0 && (
        <Card size="small" title="Fields">
          <Flex vertical gap={12}>
            {project.fields.map((f) => (
              <div key={f.id}>
                <Typography.Text type="secondary" style={{ fontSize: '0.88em' }}>
                  {f.name}
                  {f.required && ' *'}
                </Typography.Text>
                {f.fieldType === 'text' ? (
                  // free text: save when leaving the field, not on every keystroke
                  <Input
                    key={String(item.customFields[String(f.id)] ?? '')}
                    defaultValue={(item.customFields[String(f.id)] as string) ?? ''}
                    disabled={!editable}
                    onBlur={(e) => {
                      if (e.target.value !== (item.customFields[String(f.id)] ?? '')) save({ customFields: { [String(f.id)]: e.target.value || null } })
                    }}
                  />
                ) : (
                  <CustomFieldInput
                    field={f}
                    value={item.customFields[String(f.id)]}
                    disabled={!editable}
                    onChange={(value) => save({ customFields: { [String(f.id)]: value ?? null } })}
                  />
                )}
              </div>
            ))}
          </Flex>
        </Card>
      )}

      <Card size="small">
        <Flex justify="space-between" align="center">
          <Space>
            <Avatar.Group max={{ count: 5 }} size="small">
              {item.watchers.map((w) => (
                <UserAvatar key={w.id} user={w} size={24} />
              ))}
            </Avatar.Group>
            <Typography.Text type="secondary">
              {item.watchers.length} watching
            </Typography.Text>
          </Space>
          <Button size="small" icon={item.isWatching ? <EyeInvisibleOutlined /> : <EyeOutlined />} onClick={toggleWatch}>
            {item.isWatching ? 'Unwatch' : 'Watch'}
          </Button>
        </Flex>
        <Divider style={{ margin: '12px 0' }} />
        <Typography.Text type="secondary" style={{ fontSize: '0.85em' }}>
          Created {new Date(item.createdAt).toLocaleString()}
          <br />
          Updated {new Date(item.updatedAt).toLocaleString()}
          {item.completedAt && (
            <>
              <br />
              Completed {new Date(item.completedAt).toLocaleString()}
            </>
          )}
        </Typography.Text>
      </Card>
    </Flex>
  )
}
