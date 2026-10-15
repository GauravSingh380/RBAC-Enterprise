// Workflow = the ordered statuses of a project, their category and who may move items into them.
import { ArrowDownOutlined, ArrowUpOutlined, DeleteOutlined, LockOutlined, PlusOutlined } from '@ant-design/icons'
import { App, Button, Card, ColorPicker, Flex, Input, InputNumber, Modal, Select, Space, Table, Tag, Tooltip, Typography, type TableProps } from 'antd'
import { useState } from 'react'
import { getErrorMessage } from '../../../lib/api'
import { projectsService } from '../../../services/projects.service'
import type { ProjectDetail, ProjectStatus, StatusCategory } from '../../../types/projects'
import { STATUS_COLORS } from '../shared/itemMeta'

const CATEGORIES: { value: StatusCategory; label: string; color: string }[] = [
  { value: 'todo', label: 'To do', color: 'default' },
  { value: 'in_progress', label: 'In progress', color: 'processing' },
  { value: 'done', label: 'Done', color: 'success' },
]
const ROLE_NAMES = ['owner', 'admin', 'qa', 'developer', 'member']

export default function WorkflowSettings({ project, reload }: { project: ProjectDetail; reload: () => void }) {
  const { message, modal } = App.useApp()
  const [name, setName] = useState('')
  const [category, setCategory] = useState<StatusCategory>('in_progress')
  const [deleting, setDeleting] = useState<ProjectStatus | null>(null)
  const [moveTo, setMoveTo] = useState<number>()
  const statuses = project.statuses

  const run = async (fn: () => Promise<unknown>, text?: string) => {
    try {
      await fn()
      if (text) message.success(text)
      reload()
    } catch (err) {
      message.error(getErrorMessage(err))
    }
  }

  const move = (index: number, dir: -1 | 1) => {
    const ids = statuses.map((s) => s.id)
    ;[ids[index], ids[index + dir]] = [ids[index + dir]!, ids[index]!]
    run(() => projectsService.reorderStatuses(project.key, ids))
  }

  const columns: TableProps<ProjectStatus>['columns'] = [
    {
      title: '',
      key: 'order',
      width: 80,
      render: (_, _s, i) => (
        <Space size={0}>
          <Button type="text" size="small" icon={<ArrowUpOutlined />} disabled={i === 0} onClick={() => move(i, -1)} />
          <Button type="text" size="small" icon={<ArrowDownOutlined />} disabled={i === statuses.length - 1} onClick={() => move(i, 1)} />
        </Space>
      ),
    },
    {
      title: 'Status',
      key: 'name',
      render: (_, s) => (
        <Space>
          <ColorPicker
            size="small"
            value={s.color}
            presets={[{ label: 'Colours', colors: STATUS_COLORS }]}
            onChangeComplete={(c) => run(() => projectsService.updateStatus(project.key, s.id, { color: c.toHexString() }))}
          />
          <Typography.Text
            editable={{ onChange: (v) => v.trim() && v !== s.name && run(() => projectsService.updateStatus(project.key, s.id, { name: v.trim() })) }}
          >
            {s.name}
          </Typography.Text>
        </Space>
      ),
    },
    {
      title: 'Category',
      key: 'category',
      width: 160,
      render: (_, s) => (
        <Select
          value={s.category}
          style={{ width: 140 }}
          onChange={(category) => run(() => projectsService.updateStatus(project.key, s.id, { category }))}
          options={CATEGORIES.map((c) => ({ value: c.value, label: <Tag color={c.color}>{c.label}</Tag> }))}
        />
      ),
    },
    {
      title: (
        <Tooltip title="Only these organization roles (or project admins) can move items INTO this status. Empty = anyone who can edit.">
          <span>
            <LockOutlined /> Restricted to
          </span>
        </Tooltip>
      ),
      key: 'restricted',
      render: (_, s) => (
        <Select
          mode="tags"
          allowClear
          placeholder="Anyone"
          value={s.restrictedRoles}
          style={{ minWidth: 200 }}
          onChange={(restrictedRoles: string[]) => run(() => projectsService.updateStatus(project.key, s.id, { restrictedRoles }))}
          options={ROLE_NAMES.map((r) => ({ value: r, label: r }))}
        />
      ),
    },
    {
      title: (
        <Tooltip title="Work-in-progress limit: the board column turns red when it holds more items. Empty = no limit.">
          <span>WIP limit</span>
        </Tooltip>
      ),
      key: 'wip',
      width: 110,
      render: (_, s) => (
        <InputNumber
          min={1}
          max={999}
          placeholder="—"
          defaultValue={s.wipLimit ?? undefined}
          style={{ width: 80 }}
          onBlur={(e) => {
            const v = e.target.value === '' ? null : Number(e.target.value)
            if (v !== s.wipLimit && (v === null || v >= 1)) run(() => projectsService.updateStatus(project.key, s.id, { wipLimit: v }))
          }}
        />
      ),
    },
    { title: 'Items', dataIndex: 'itemCount', width: 80 },
    {
      title: '',
      key: 'actions',
      width: 60,
      render: (_, s) => (
        <Button
          type="text"
          danger
          icon={<DeleteOutlined />}
          disabled={statuses.length === 1}
          onClick={() => {
            if (s.itemCount === 0) {
              modal.confirm({ title: `Delete status "${s.name}"?`, okButtonProps: { danger: true }, onOk: () => run(() => projectsService.deleteStatus(project.key, s.id), 'Status deleted') })
            } else {
              setMoveTo(undefined)
              setDeleting(s)
            }
          }}
        />
      ),
    },
  ]

  return (
    <Card>
      <Typography.Paragraph type="secondary">
        Statuses appear in this order on boards. Items in a <Tag color="success">Done</Tag> status count as completed.
      </Typography.Paragraph>
      <Table<ProjectStatus> rowKey="id" columns={columns} dataSource={statuses} pagination={false} scroll={{ x: 760 }} />
      <QaFlowCard project={project} run={run} />
      <Flex gap={8} style={{ marginTop: 16 }} wrap>
        <Input placeholder="New status name" value={name} onChange={(e) => setName(e.target.value)} style={{ maxWidth: 240 }} onPressEnter={() => name.trim() && run(() => projectsService.createStatus(project.key, { name: name.trim(), category }).then(() => setName('')), 'Status added')} />
        <Select value={category} onChange={setCategory} options={CATEGORIES.map((c) => ({ value: c.value, label: c.label }))} style={{ width: 140 }} />
        <Button icon={<PlusOutlined />} disabled={!name.trim()} onClick={() => run(() => projectsService.createStatus(project.key, { name: name.trim(), category }).then(() => setName('')), 'Status added')}>
          Add status
        </Button>
      </Flex>

      <Modal
        open={!!deleting}
        title={`Delete status "${deleting?.name}"`}
        okText="Move items and delete"
        okButtonProps={{ danger: true, disabled: !moveTo }}
        onCancel={() => setDeleting(null)}
        onOk={() =>
          deleting &&
          run(() => projectsService.deleteStatus(project.key, deleting.id, moveTo), 'Status deleted').then(() => setDeleting(null))
        }
      >
        <Typography.Paragraph>
          {deleting?.itemCount} item(s) are in this status. Where should they go?
        </Typography.Paragraph>
        <Select
          style={{ width: '100%' }}
          placeholder="Choose a status"
          value={moveTo}
          onChange={setMoveTo}
          options={statuses.filter((s) => s.id !== deleting?.id).map((s) => ({ value: s.id, label: s.name }))}
        />
      </Modal>
    </Card>
  )
}

/** QA verification flow: which statuses mean "waiting for QA", "QA passed", "QA failed". */
function QaFlowCard({ project, run }: { project: ProjectDetail; run: (fn: () => Promise<unknown>, text?: string) => Promise<void> }) {
  const fields = [
    ['qaReadyStatusId', 'Waiting for QA', 'Bugs here show Pass / Fail buttons to QA'],
    ['qaPassedStatusId', 'QA passed', 'Where “Pass” moves the item (its role restriction decides who may give verdicts)'],
    ['qaFailedStatusId', 'QA failed', 'Where “Fail” moves the item (reopen count + 1)'],
  ] as const
  const configured = fields.every(([key]) => project[key])
  return (
    <Card size="small" style={{ marginTop: 16 }} title="QA verification flow" extra={configured ? <Tag color="success">on</Tag> : <Tag>off</Tag>}>
      <Typography.Paragraph type="secondary" style={{ marginTop: 0 }}>
        Fixed → <b>waiting for QA</b> → QA passes (verified) or fails (reopened, with the reason as a comment). Set all three to turn it on.
      </Typography.Paragraph>
      <Flex gap={16} wrap>
        {fields.map(([key, label, hint]) => (
          <div key={key} style={{ minWidth: 220, flex: 1 }}>
            <Tooltip title={hint}>
              <Typography.Text strong>{label}</Typography.Text>
            </Tooltip>
            <Select
              allowClear
              placeholder="Not set"
              style={{ width: '100%', marginTop: 4 }}
              value={project[key] ?? undefined}
              onChange={(v?: number) => run(() => projectsService.update(project.key, { [key]: v ?? null }), 'QA flow updated')}
              options={project.statuses.map((s) => ({ value: s.id, label: s.name }))}
            />
          </div>
        ))}
      </Flex>
    </Card>
  )
}
