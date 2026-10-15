// "Request leave": type, dates (or a half day), reason — with a live preview of what it costs.
import { App, Alert, DatePicker, Flex, Form, Input, Modal, Segmented, Select, Space, Tag, Typography } from 'antd'
import dayjs, { type Dayjs } from 'dayjs'
import { useEffect, useState } from 'react'
import { getErrorMessage } from '../../lib/api'
import { leaveService } from '../../services/leave.service'
import type { LeaveBalance, LeavePreview, Portion } from '../../types/leave'
import { describeLeaveDates, pluralDays } from './leaveMeta'

interface Values {
  leaveTypeId: number
  mode: 'days' | 'half'
  range?: [Dayjs, Dayjs]
  date?: Dayjs
  portion: Exclude<Portion, 'full'>
  reason?: string
}

const ISO = 'YYYY-MM-DD'

export function RequestLeaveModal({ balances, onClose, onCreated }: { balances: LeaveBalance[]; onClose: () => void; onCreated: () => void }) {
  const { message } = App.useApp()
  const [form] = Form.useForm<Values>()
  const [preview, setPreview] = useState<LeavePreview | null>(null)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const values = Form.useWatch([], form) as Values | undefined
  const balance = balances.find((b) => b.type.id === values?.leaveTypeId)

  const request = (v: Values | undefined) => {
    if (!v?.leaveTypeId) return null
    if (v.mode === 'half') return v.date ? { leaveTypeId: v.leaveTypeId, startDate: v.date.format(ISO), endDate: v.date.format(ISO), portion: v.portion } : null
    return v.range ? { leaveTypeId: v.leaveTypeId, startDate: v.range[0].format(ISO), endDate: v.range[1].format(ISO), portion: 'full' as const } : null
  }
  const input = request(values)
  const inputKey = JSON.stringify(input)

  // live preview: working days, skipped weekends / holidays, balance after, teammates out
  useEffect(() => {
    if (!input) return
    let alive = true
    const timer = setTimeout(() => {
      leaveService.preview(input).then(
        (p) => alive && (setPreview(p), setPreviewError(null)),
        (err) => alive && (setPreview(null), setPreviewError(getErrorMessage(err))),
      )
    }, 250)
    return () => {
      alive = false
      clearTimeout(timer)
    }
  }, [inputKey]) // eslint-disable-line react-hooks/exhaustive-deps

  const submit = async () => {
    const v = await form.validateFields()
    const data = request(v)
    if (!data) return
    setBusy(true)
    try {
      const created = await leaveService.create({ ...data, reason: v.reason?.trim() || undefined })
      message.success(created.status === 'approved' ? 'Leave booked' : 'Leave requested — your approvers were notified')
      onCreated()
      onClose()
    } catch (err) {
      message.error(getErrorMessage(err))
      setBusy(false)
    }
  }

  const shown = input ? preview : null
  const overdraw = shown?.balance && shown.balance.after < 0

  return (
    <Modal open title="Request leave" okText="Request" okButtonProps={{ disabled: !!previewError || !!overdraw }} confirmLoading={busy} onOk={submit} onCancel={onClose} width={560}>
      <Form<Values> form={form} layout="vertical" initialValues={{ mode: 'days', portion: 'am', leaveTypeId: balances[0]?.type.id }} requiredMark={false}>
        <Form.Item name="leaveTypeId" label="Type" rules={[{ required: true }]}>
          <Select
            options={balances.map((b) => ({
              value: b.type.id,
              label: (
                <Flex justify="space-between" gap={8}>
                  <span>
                    <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: b.type.color, marginRight: 8 }} />
                    {b.type.name}
                  </span>
                  <Typography.Text type="secondary">{b.available === null ? 'unlimited' : `${b.available} left`}</Typography.Text>
                </Flex>
              ),
            }))}
          />
        </Form.Item>
        {balance?.type.allowHalfDay !== false && (
          <Form.Item name="mode" style={{ marginBottom: 12 }}>
            <Segmented
              options={[
                { value: 'days', label: 'Full days' },
                { value: 'half', label: 'Half day' },
              ]}
            />
          </Form.Item>
        )}
        {values?.mode === 'half' && balance?.type.allowHalfDay !== false ? (
          <Space align="start" wrap>
            <Form.Item name="date" label="Date" rules={[{ required: true, message: 'Pick a date' }]}>
              <DatePicker />
            </Form.Item>
            <Form.Item name="portion" label="Part of the day">
              <Segmented
                options={[
                  { value: 'am', label: 'Morning' },
                  { value: 'pm', label: 'Afternoon' },
                ]}
              />
            </Form.Item>
          </Space>
        ) : (
          <Form.Item name="range" label="Dates" rules={[{ required: true, message: 'Pick the first and last day' }]}>
            <DatePicker.RangePicker style={{ width: '100%' }} disabledDate={(d) => d.isBefore(dayjs().subtract(60, 'day'))} />
          </Form.Item>
        )}

        {previewError && input && <Alert type="error" showIcon title={previewError} style={{ marginBottom: 16 }} />}
        {shown && (
          <Alert
            type={overdraw ? 'error' : 'info'}
            showIcon
            style={{ marginBottom: 16 }}
            title={
              <>
                {describeLeaveDates(input!.startDate, input!.endDate, input!.portion)} → <b>{pluralDays(shown.days)}</b>
                {shown.balance && (
                  <>
                    {' '}
                    · {shown.balance.available} available → <b>{shown.balance.after} after</b>
                  </>
                )}
              </>
            }
            description={
              <Flex vertical gap={4}>
                {shown.skipped.length > 0 && (
                  <span>
                    Not counted:{' '}
                    {shown.skipped.map((s) => (
                      <Tag key={s.date} style={{ marginBottom: 2 }}>
                        {dayjs(s.date).format('ddd D MMM')} · {s.reason}
                      </Tag>
                    ))}
                  </span>
                )}
                {overdraw && <span>Not enough balance for this request.</span>}
                {shown.teammatesOut.length > 0 && (
                  <span>
                    Also away: {shown.teammatesOut.map((t) => `${t.name} (${describeLeaveDates(t.startDate, t.endDate)})`).join(', ')}
                  </span>
                )}
              </Flex>
            }
          />
        )}
        <Form.Item name="reason" label="Reason (optional)">
          <Input.TextArea autoSize={{ minRows: 2 }} maxLength={2000} placeholder="Visible to the approvers" />
        </Form.Item>
      </Form>
    </Modal>
  )
}
