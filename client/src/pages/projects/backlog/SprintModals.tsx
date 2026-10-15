// Create / edit, start and complete sprint dialogs.
import { Alert, App, DatePicker, Form, Input, Modal, Radio, Select, Space, Statistic, Typography } from 'antd'
import dayjs, { type Dayjs } from 'dayjs'
import { useState } from 'react'
import { getErrorMessage } from '../../../lib/api'
import { sprintsService } from '../../../services/projects.service'
import type { ProjectDetail, Sprint } from '../../../types/projects'

const FORMAT = 'YYYY-MM-DD'
const toRange = (s?: Sprint | null): [Dayjs, Dayjs] | undefined =>
  s?.startDate && s.endDate ? [dayjs(s.startDate), dayjs(s.endDate)] : undefined
const PRESETS = [1, 2, 3, 4].map((weeks) => ({
  label: `${weeks} week${weeks > 1 ? 's' : ''}`,
  value: [dayjs(), dayjs().add(weeks * 7, 'day')] as [Dayjs, Dayjs],
}))

interface FormValues {
  name?: string
  goal?: string
  dates?: [Dayjs, Dayjs] | null
}

/** Create a new sprint, or edit name / goal / dates of an existing one. */
export function SprintFormModal({ project, sprint, nextNumber, onClose, onSaved }: {
  project: ProjectDetail
  sprint: Sprint | null
  nextNumber: number
  onClose: () => void
  onSaved: () => void
}) {
  const { message } = App.useApp()
  const [form] = Form.useForm<FormValues>()
  const [busy, setBusy] = useState(false)
  const completed = sprint?.status === 'completed'

  const submit = async () => {
    const v = await form.validateFields()
    setBusy(true)
    try {
      const dates = completed
        ? {}
        : { startDate: v.dates ? v.dates[0].format(FORMAT) : null, endDate: v.dates ? v.dates[1].format(FORMAT) : null }
      const data = { name: v.name?.trim() || undefined, goal: v.goal?.trim() || null, ...dates }
      if (sprint) await sprintsService.update(project.key, sprint.id, data)
      else await sprintsService.create(project.key, data)
      message.success(sprint ? 'Sprint updated' : 'Sprint created')
      onSaved()
      onClose()
    } catch (err) {
      message.error(getErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open title={sprint ? `Edit ${sprint.name}` : 'Create sprint'} okText={sprint ? 'Save' : 'Create'} onOk={submit} confirmLoading={busy} onCancel={onClose}>
      <Form form={form} layout="vertical" initialValues={{ name: sprint?.name, goal: sprint?.goal ?? undefined, dates: toRange(sprint) }}>
        <Form.Item name="name" label="Name" rules={[{ max: 100 }]}>
          <Input placeholder={`${project.key} Sprint ${nextNumber}`} autoFocus />
        </Form.Item>
        <Form.Item name="goal" label="Sprint goal" rules={[{ max: 2000 }]}>
          <Input.TextArea autoSize={{ minRows: 2, maxRows: 5 }} placeholder="What should this sprint achieve?" />
        </Form.Item>
        {!completed && (
          <Form.Item name="dates" label="Dates" extra="Optional while planning — you can set them when you start the sprint.">
            <DatePicker.RangePicker style={{ width: '100%' }} presets={PRESETS} />
          </Form.Item>
        )}
      </Form>
    </Modal>
  )
}

export function StartSprintModal({ project, sprint, onClose, onStarted }: {
  project: ProjectDetail
  sprint: Sprint
  onClose: () => void
  onStarted: () => void
}) {
  const { message } = App.useApp()
  const [form] = Form.useForm<FormValues>()
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    const v = await form.validateFields()
    setBusy(true)
    try {
      await sprintsService.start(project.key, sprint.id, {
        name: v.name?.trim() || undefined,
        goal: v.goal?.trim() || null,
        startDate: v.dates![0].format(FORMAT),
        endDate: v.dates![1].format(FORMAT),
      })
      message.success(`${v.name || sprint.name} started`)
      onStarted()
      onClose()
    } catch (err) {
      message.error(getErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open title="Start sprint" okText="Start" onOk={submit} confirmLoading={busy} onCancel={onClose}>
      <Typography.Paragraph type="secondary">
        <b>{sprint.stats.itemCount}</b> item{sprint.stats.itemCount === 1 ? '' : 's'} ({sprint.stats.points} points) will be the
        sprint's commitment — velocity compares it with what gets done.
      </Typography.Paragraph>
      {sprint.stats.itemCount === 0 && <Alert type="warning" showIcon title="This sprint is empty. Drag items into it first." style={{ marginBottom: 16 }} />}
      <Form
        form={form}
        layout="vertical"
        initialValues={{ name: sprint.name, goal: sprint.goal ?? undefined, dates: toRange(sprint) ?? [dayjs(), dayjs().add(14, 'day')] }}
      >
        <Form.Item name="name" label="Name" rules={[{ required: true, max: 100 }]}>
          <Input />
        </Form.Item>
        <Form.Item name="dates" label="Duration" rules={[{ required: true, message: 'Choose the sprint dates' }]}>
          <DatePicker.RangePicker style={{ width: '100%' }} presets={PRESETS} />
        </Form.Item>
        <Form.Item name="goal" label="Sprint goal" rules={[{ max: 2000 }]}>
          <Input.TextArea autoSize={{ minRows: 2, maxRows: 5 }} />
        </Form.Item>
      </Form>
    </Modal>
  )
}

export function CompleteSprintModal({ project, sprint, planned, onClose, onCompleted }: {
  project: ProjectDetail
  sprint: Sprint
  planned: Sprint[]
  onClose: () => void
  onCompleted: () => void
}) {
  const { message } = App.useApp()
  const [target, setTarget] = useState<'backlog' | number>(planned[0]?.id ?? 'backlog')
  const [busy, setBusy] = useState(false)
  const open = sprint.stats.itemCount - sprint.stats.doneCount

  const submit = async () => {
    setBusy(true)
    try {
      const res = await sprintsService.complete(project.key, sprint.id, target)
      message.success(`${sprint.name} completed${res.movedCount ? ` — ${res.movedCount} unfinished item(s) moved` : ''}`)
      onCompleted()
      onClose()
    } catch (err) {
      message.error(getErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open title={`Complete ${sprint.name}`} okText="Complete sprint" onOk={submit} confirmLoading={busy} onCancel={onClose}>
      <Space size={40} style={{ margin: '8px 0 16px' }}>
        <Statistic title="Completed" value={sprint.stats.doneCount} suffix={`/ ${sprint.stats.itemCount}`} />
        <Statistic title="Points done" value={sprint.stats.donePoints} suffix={`/ ${sprint.stats.points}`} />
        <Statistic title="Unfinished" value={open} />
      </Space>
      {open > 0 ? (
        <>
          <Typography.Paragraph>Move the {open} unfinished item{open === 1 ? '' : 's'} (and their sub-tasks) to:</Typography.Paragraph>
          {planned.length ? (
            <Select
              style={{ width: '100%' }}
              value={String(target)}
              onChange={(v: string) => setTarget(v === 'backlog' ? 'backlog' : Number(v))}
              options={[...planned.map((s) => ({ value: String(s.id), label: s.name })), { value: 'backlog', label: 'Backlog' }]}
            />
          ) : (
            <Radio checked>Backlog</Radio>
          )}
        </>
      ) : (
        <Alert type="success" showIcon title="Everything in this sprint is done." />
      )}
    </Modal>
  )
}
