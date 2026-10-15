// /org/leave — leave types, holiday calendars (+ who uses which) and per-person allowances (permission leave.manage).
import { DeleteOutlined, EditOutlined, ImportOutlined, PlusOutlined, StarOutlined } from '@ant-design/icons'
import {
  App,
  Button,
  Card,
  Checkbox,
  Col,
  ColorPicker,
  DatePicker,
  Empty,
  Flex,
  Form,
  Input,
  InputNumber,
  List,
  Modal,
  Popconfirm,
  Popover,
  Row,
  Select,
  Space,
  Switch,
  Table,
  Tabs,
  Tag,
  Typography,
} from 'antd'
import type { Dayjs } from 'dayjs'
import { useCallback, useState } from 'react'
import { PageHeader } from '../../components/ui'
import { useFetch } from '../../hooks/useFetch'
import { getErrorMessage } from '../../lib/api'
import { leaveService } from '../../services/leave.service'
import type { HolidayCalendar, LeaveType, TeamBalanceRow } from '../../types/leave'
import { WEEKDAYS } from './leaveMeta'

const thisYear = new Date().getFullYear()

export default function LeaveSettingsPage() {
  return (
    <>
      <PageHeader help="leave-and-holiday-setup" title="Leave & holidays" description="Leave types, holiday calendars and allowances of the organization." />
      <Tabs
        items={[
          { key: 'types', label: 'Leave types', children: <LeaveTypesTab /> },
          { key: 'calendars', label: 'Holiday calendars', children: <CalendarsTab /> },
          { key: 'allowances', label: 'Allowances', children: <AllowancesTab /> },
        ]}
      />
    </>
  )
}

function useAction(reload: () => void) {
  const { message } = App.useApp()
  return async (fn: () => Promise<unknown>, text?: string) => {
    try {
      await fn()
      if (text) message.success(text)
      reload()
      return true
    } catch (err) {
      message.error(getErrorMessage(err))
      return false
    }
  }
}

// ---------------------------------------------------------------- leave types

interface TypeForm {
  name: string
  color: string
  isPaid: boolean
  unlimited: boolean
  defaultDays?: number
  allowHalfDay: boolean
  requiresApproval: boolean
}

function LeaveTypesTab() {
  const types = useFetch(useCallback(() => leaveService.allTypes(), []))
  const run = useAction(types.reload)
  const [editing, setEditing] = useState<LeaveType | 'new' | null>(null)
  const [form] = Form.useForm<TypeForm>()
  const unlimited = Form.useWatch('unlimited', form)

  const open = (t: LeaveType | 'new') => {
    setEditing(t)
    form.setFieldsValue(
      t === 'new'
        ? { name: '', color: '#1677ff', isPaid: true, unlimited: false, defaultDays: 10, allowHalfDay: true, requiresApproval: true }
        : { ...t, unlimited: t.defaultDays === null, defaultDays: t.defaultDays ?? undefined },
    )
  }
  const save = async () => {
    const v = await form.validateFields()
    const data = { name: v.name, color: v.color, isPaid: v.isPaid, defaultDays: v.unlimited ? null : (v.defaultDays ?? 0), allowHalfDay: v.allowHalfDay, requiresApproval: v.requiresApproval }
    const ok = await run(() => (editing === 'new' ? leaveService.createType(data) : leaveService.updateType((editing as LeaveType).id, data)), 'Saved')
    if (ok) setEditing(null)
  }

  return (
    <Card
      extra={
        <Button type="primary" icon={<PlusOutlined />} onClick={() => open('new')}>
          New leave type
        </Button>
      }
      title="Leave types"
    >
      <Table<LeaveType>
        rowKey="id"
        loading={types.loading}
        dataSource={types.data ?? []}
        pagination={false}
        columns={[
          {
            title: 'Name',
            key: 'name',
            render: (_, t) => (
              <Space>
                <span style={{ display: 'inline-block', width: 12, height: 12, borderRadius: 3, background: t.color }} />
                <Typography.Text strong delete={!t.isActive}>
                  {t.name}
                </Typography.Text>
                {!t.isPaid && <Tag>unpaid</Tag>}
              </Space>
            ),
          },
          { title: 'Yearly allowance', dataIndex: 'defaultDays', width: 150, render: (d: number | null) => (d === null ? <Tag>unlimited</Tag> : `${d} days`) },
          { title: 'Half days', dataIndex: 'allowHalfDay', width: 100, render: (v: boolean) => (v ? 'yes' : 'no') },
          { title: 'Approval', dataIndex: 'requiresApproval', width: 110, render: (v: boolean) => (v ? 'required' : <Tag color="green">automatic</Tag>) },
          { title: 'Requests', dataIndex: 'requestCount', width: 90, align: 'right' },
          {
            title: 'Active',
            key: 'active',
            width: 80,
            render: (_, t) => <Switch size="small" checked={t.isActive} onChange={(isActive) => run(() => leaveService.updateType(t.id, { isActive }))} />,
          },
          {
            title: '',
            key: 'actions',
            width: 90,
            render: (_, t) => (
              <Space size={0}>
                <Button type="text" icon={<EditOutlined />} onClick={() => open(t)} aria-label={`Edit ${t.name}`} />
                <Popconfirm
                  title={`Delete "${t.name}"?`}
                  description={t.requestCount ? 'It has requests — deactivate it instead.' : undefined}
                  okButtonProps={{ danger: true, disabled: t.requestCount > 0 }}
                  onConfirm={() => run(() => leaveService.deleteType(t.id), 'Deleted')}
                >
                  <Button type="text" danger icon={<DeleteOutlined />} aria-label={`Delete ${t.name}`} />
                </Popconfirm>
              </Space>
            ),
          },
        ]}
      />
      <Modal open={!!editing} title={editing === 'new' ? 'New leave type' : 'Edit leave type'} okText="Save" onOk={save} onCancel={() => setEditing(null)} forceRender>
        <Form<TypeForm> form={form} layout="vertical">
          <Flex gap={12}>
            <Form.Item name="name" label="Name" rules={[{ required: true, max: 50 }]} style={{ flex: 1 }}>
              <Input placeholder="e.g. Parental leave" />
            </Form.Item>
            <Form.Item name="color" label="Colour" getValueFromEvent={(c) => c.toHexString()}>
              <ColorPicker />
            </Form.Item>
          </Flex>
          <Flex gap={16} align="center" wrap>
            <Form.Item name="unlimited" valuePropName="checked" style={{ marginBottom: 12 }}>
              <Checkbox>Unlimited (no yearly allowance)</Checkbox>
            </Form.Item>
            {!unlimited && (
              <Form.Item name="defaultDays" label="Days per year" rules={[{ required: true }]} style={{ marginBottom: 12 }}>
                <InputNumber min={0} max={365} step={0.5} />
              </Form.Item>
            )}
          </Flex>
          <Form.Item name="isPaid" valuePropName="checked" style={{ marginBottom: 4 }}>
            <Checkbox>Paid</Checkbox>
          </Form.Item>
          <Form.Item name="allowHalfDay" valuePropName="checked" style={{ marginBottom: 4 }}>
            <Checkbox>Half days allowed</Checkbox>
          </Form.Item>
          <Form.Item name="requiresApproval" valuePropName="checked" style={{ marginBottom: 0 }}>
            <Checkbox>Needs approval (otherwise booked immediately)</Checkbox>
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  )
}

// ---------------------------------------------------------------- calendars & holidays

function CalendarsTab() {
  const calendars = useFetch(useCallback(() => leaveService.calendars(), []))
  const members = useFetch(useCallback(() => leaveService.members(), []))
  const run = useAction(() => (calendars.reload(), members.reload()))
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [editing, setEditing] = useState<HolidayCalendar | 'new' | null>(null)
  const [form] = Form.useForm<{ name: string; description?: string; weekendDays: number[] }>()
  const selected = calendars.data?.find((c) => c.id === selectedId) ?? calendars.data?.[0] ?? null

  const openForm = (c: HolidayCalendar | 'new') => {
    setEditing(c)
    form.setFieldsValue(c === 'new' ? { name: '', description: '', weekendDays: [0, 6] } : { name: c.name, description: c.description ?? '', weekendDays: c.weekendDays })
  }
  const save = async () => {
    const v = await form.validateFields()
    const ok = await run(
      () => (editing === 'new' ? leaveService.createCalendar({ ...v, description: v.description || null }) : leaveService.updateCalendar((editing as HolidayCalendar).id, { ...v, description: v.description || null })),
      'Saved',
    )
    if (ok) setEditing(null)
  }

  return (
    <Row gutter={16}>
      <Col xs={24} lg={8}>
        <Card
          title="Calendars"
          size="small"
          extra={
            <Button size="small" icon={<PlusOutlined />} onClick={() => openForm('new')}>
              New
            </Button>
          }
        >
          <List
            loading={calendars.loading}
            dataSource={calendars.data ?? []}
            renderItem={(c) => (
              <List.Item
                onClick={() => setSelectedId(c.id)}
                style={{ cursor: 'pointer', paddingInline: 8, borderRadius: 6, background: c.id === selected?.id ? 'rgba(22,119,255,0.08)' : undefined }}
                actions={[
                  <Button key="e" size="small" type="text" icon={<EditOutlined />} onClick={(e) => (e.stopPropagation(), openForm(c))} aria-label="Edit" />,
                  ...(!c.isDefault
                    ? [
                        <Button key="d" size="small" type="text" icon={<StarOutlined />} title="Make default" onClick={(e) => (e.stopPropagation(), run(() => leaveService.updateCalendar(c.id, { isDefault: true }), 'Default calendar changed'))} />,
                        <Popconfirm key="x" title={`Delete "${c.name}"?`} description="Its members move to the default calendar." okButtonProps={{ danger: true }} onConfirm={() => run(() => leaveService.deleteCalendar(c.id), 'Deleted')}>
                          <Button size="small" type="text" danger icon={<DeleteOutlined />} onClick={(e) => e.stopPropagation()} aria-label="Delete" />
                        </Popconfirm>,
                      ]
                    : []),
                ]}
              >
                <List.Item.Meta
                  title={
                    <Space>
                      {c.name}
                      {c.isDefault && <Tag color="blue">default</Tag>}
                    </Space>
                  }
                  description={`Weekend: ${c.weekendDays.map((d) => WEEKDAYS[d]).join(', ') || 'none'} · ${c.holidayCount} holidays · ${c.memberCount} people`}
                />
              </List.Item>
            )}
          />
        </Card>
        <Card title="Who uses which calendar" size="small" style={{ marginTop: 16 }}>
          <Table
            size="small"
            rowKey="id"
            dataSource={members.data ?? []}
            pagination={false}
            scroll={{ y: 320 }}
            columns={[
              { title: 'Person', dataIndex: 'name', ellipsis: true },
              {
                title: 'Calendar',
                key: 'calendar',
                width: 170,
                render: (_, m) => (
                  <Select
                    size="small"
                    style={{ width: '100%' }}
                    value={m.calendarId ?? 0}
                    onChange={(v: number) => run(() => leaveService.setMemberCalendar(m.id, v || null))}
                    options={[{ value: 0, label: 'Default' }, ...(calendars.data ?? []).filter((c) => !c.isDefault).map((c) => ({ value: c.id, label: c.name }))]}
                  />
                ),
              },
            ]}
          />
        </Card>
      </Col>
      <Col xs={24} lg={16}>{selected ? <HolidaysCard key={selected.id} calendar={selected} onChanged={calendars.reload} /> : <Empty />}</Col>
      <Modal open={!!editing} title={editing === 'new' ? 'New holiday calendar' : 'Edit calendar'} okText="Save" onOk={save} onCancel={() => setEditing(null)} forceRender>
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="Name" rules={[{ required: true, max: 100 }]}>
            <Input placeholder="e.g. India office" />
          </Form.Item>
          <Form.Item name="description" label="Description">
            <Input />
          </Form.Item>
          <Form.Item name="weekendDays" label="Weekend days (not working, never counted as leave)">
            <Checkbox.Group options={WEEKDAYS.map((d, i) => ({ value: i, label: d }))} />
          </Form.Item>
        </Form>
      </Modal>
    </Row>
  )
}

function HolidaysCard({ calendar, onChanged }: { calendar: HolidayCalendar; onChanged: () => void }) {
  const [year, setYear] = useState(thisYear)
  const holidays = useFetch(useCallback(() => leaveService.holidays(calendar.id, year), [calendar.id, year]))
  const run = useAction(() => (holidays.reload(), onChanged()))
  const [form] = Form.useForm<{ date: Dayjs; name: string; isOptional: boolean }>()
  const [importing, setImporting] = useState(false)
  const [text, setText] = useState('')

  const add = async () => {
    const v = await form.validateFields()
    const ok = await run(() => leaveService.addHoliday(calendar.id, { date: v.date.format('YYYY-MM-DD'), name: v.name, isOptional: !!v.isOptional }), 'Holiday added')
    if (ok) form.resetFields()
  }

  return (
    <Card
      title={`Holidays — ${calendar.name}`}
      extra={
        <Space>
          <Select value={year} onChange={setYear} options={[thisYear - 1, thisYear, thisYear + 1].map((y) => ({ value: y, label: y }))} style={{ width: 100 }} />
          <Button icon={<ImportOutlined />} onClick={() => setImporting(true)}>
            Paste list
          </Button>
        </Space>
      }
    >
      <Form form={form} layout="inline" style={{ marginBottom: 16, rowGap: 8 }} initialValues={{ isOptional: false }}>
        <Form.Item name="date" rules={[{ required: true, message: 'Date' }]}>
          <DatePicker />
        </Form.Item>
        <Form.Item name="name" rules={[{ required: true, message: 'Name' }]}>
          <Input placeholder="Holiday name" maxLength={100} />
        </Form.Item>
        <Form.Item name="isOptional" valuePropName="checked">
          <Checkbox>Optional</Checkbox>
        </Form.Item>
        <Button type="primary" icon={<PlusOutlined />} onClick={add}>
          Add
        </Button>
      </Form>
      <Table
        size="small"
        rowKey="id"
        loading={holidays.loading}
        dataSource={holidays.data ?? []}
        pagination={false}
        locale={{ emptyText: <Empty description={`No holidays in ${year} yet — add them or paste a list`} /> }}
        columns={[
          { title: 'Date', dataIndex: 'date', width: 170, render: (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) },
          { title: 'Holiday', dataIndex: 'name' },
          { title: '', dataIndex: 'isOptional', width: 110, render: (v: boolean) => (v ? <Tag>optional</Tag> : null) },
          {
            title: '',
            key: 'x',
            width: 50,
            render: (_, h) => (
              <Popconfirm title={`Remove "${h.name}"?`} onConfirm={() => run(() => leaveService.deleteHoliday(calendar.id, h.id), 'Removed')}>
                <Button type="text" size="small" danger icon={<DeleteOutlined />} aria-label="Remove" />
              </Popconfirm>
            ),
          },
        ]}
      />
      <Typography.Paragraph type="secondary" style={{ marginTop: 12, marginBottom: 0, fontSize: '0.85em' }}>
        Holidays are not counted when someone requests leave. <b>Optional</b> holidays are normal working days that people may take as leave.
      </Typography.Paragraph>
      <Modal
        open={importing}
        title="Paste holidays"
        okText="Import"
        okButtonProps={{ disabled: !text.trim() }}
        onCancel={() => setImporting(false)}
        onOk={async () => (await run(() => leaveService.importHolidays(calendar.id, text), 'Holidays imported')) && (setImporting(false), setText(''))}
      >
        <Typography.Paragraph type="secondary">
          One per line: <code>YYYY-MM-DD, Name</code> — add <code>, optional</code> for optional holidays. Existing dates are renamed.
        </Typography.Paragraph>
        <Input.TextArea
          rows={10}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={`${thisYear}-01-26, Republic Day\n${thisYear}-08-15, Independence Day\n${thisYear}-10-20, Diwali, optional`}
          style={{ fontFamily: 'monospace' }}
        />
      </Modal>
    </Card>
  )
}

// ---------------------------------------------------------------- allowances

function AllowancesTab() {
  const [year, setYear] = useState(thisYear)
  const types = useFetch(useCallback(() => leaveService.allTypes(), []))
  const balances = useFetch(useCallback(() => leaveService.teamBalances(year), [year]))
  const run = useAction(balances.reload)
  const limited = (types.data ?? []).filter((t) => t.isActive && t.defaultDays !== null)
  const people = [...new Map((balances.data ?? []).map((b) => [b.userId, b.name])).entries()].map(([id, name]) => ({ id, name }))
  const cellOf = (userId: number, typeId: number) => balances.data?.find((b) => b.userId === userId && b.leaveTypeId === typeId)

  return (
    <Card
      title="Allowances"
      extra={<Select value={year} onChange={setYear} options={[thisYear - 1, thisYear, thisYear + 1].map((y) => ({ value: y, label: y }))} style={{ width: 100 }} />}
    >
      <Typography.Paragraph type="secondary" style={{ marginTop: 0 }}>
        Everyone gets the type's yearly allowance; click a cell to give someone a different allowance or carry days over. Shown: <b>available</b> / total.
      </Typography.Paragraph>
      <Table
        size="small"
        rowKey="id"
        loading={balances.loading}
        dataSource={people}
        pagination={false}
        scroll={{ x: 200 + limited.length * 150 }}
        columns={[
          { title: 'Person', dataIndex: 'name', fixed: 'left', width: 200 },
          ...limited.map((t) => ({
            title: (
              <Space>
                <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: t.color }} />
                {t.name}
              </Space>
            ),
            key: String(t.id),
            width: 150,
            render: (_: unknown, p: { id: number; name: string }) => {
              const b = cellOf(p.id, t.id)
              return b ? <AllowanceCell row={b} year={year} onSave={(data) => run(() => leaveService.setBalance(data), 'Allowance updated')} /> : '—'
            },
          })),
        ]}
      />
    </Card>
  )
}

function AllowanceCell({ row, year, onSave }: { row: TeamBalanceRow; year: number; onSave: (d: { userId: number; leaveTypeId: number; year: number; entitled: number; carriedOver: number; note?: string | null }) => Promise<boolean> }) {
  const [open, setOpen] = useState(false)
  const [form] = Form.useForm<{ entitled: number; carriedOver: number; note?: string }>()
  const total = (row.entitled ?? 0) + row.carriedOver
  const available = Math.round((total - row.used - row.pending) * 10) / 10
  return (
    <Popover
      open={open}
      onOpenChange={(o) => (setOpen(o), o && form.setFieldsValue({ entitled: row.entitled ?? 0, carriedOver: row.carriedOver, note: row.note ?? '' }))}
      trigger="click"
      title={`${row.name} — ${year}`}
      content={
        <Form form={form} layout="vertical" style={{ width: 240 }}>
          <Form.Item name="entitled" label="Allowance (days)" rules={[{ required: true }]}>
            <InputNumber min={0} max={365} step={0.5} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="carriedOver" label="Carried over from last year">
            <InputNumber min={0} max={365} step={0.5} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="note" label="Note">
            <Input maxLength={255} placeholder="e.g. joined in July" />
          </Form.Item>
          <Button
            type="primary"
            block
            onClick={async () => {
              const v = await form.validateFields()
              if (await onSave({ userId: row.userId, leaveTypeId: row.leaveTypeId, year, entitled: v.entitled, carriedOver: v.carriedOver ?? 0, note: v.note || null })) setOpen(false)
            }}
          >
            Save
          </Button>
        </Form>
      }
    >
      <Button type="text" size="small" style={{ paddingInline: 4 }}>
        <Typography.Text strong={available > 0} type={available <= 0 ? 'danger' : undefined}>
          {available}
        </Typography.Text>
        <Typography.Text type="secondary"> / {total}</Typography.Text>
        {row.overridden && <EditOutlined style={{ marginLeft: 4, opacity: 0.5 }} title={row.note ?? 'Custom allowance'} />}
      </Button>
    </Popover>
  )
}
