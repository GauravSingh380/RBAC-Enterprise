// Renders the right input for a project custom field.
import { Checkbox, DatePicker, Input, InputNumber, Select } from 'antd'
import dayjs from 'dayjs'
import type { ProjectField } from '../../../types/projects'

interface Props {
  field: ProjectField
  value?: unknown
  onChange?: (value: unknown) => void
  disabled?: boolean
}

export function CustomFieldInput({ field, value, onChange, disabled }: Props) {
  switch (field.fieldType) {
    case 'number':
      return <InputNumber style={{ width: '100%' }} value={value as number | null} onChange={(v) => onChange?.(v)} disabled={disabled} />
    case 'date':
      return (
        <DatePicker
          style={{ width: '100%' }}
          value={value ? dayjs(value as string) : null}
          onChange={(d) => onChange?.(d ? d.format('YYYY-MM-DD') : null)}
          disabled={disabled}
        />
      )
    case 'checkbox':
      return <Checkbox checked={!!value} onChange={(e) => onChange?.(e.target.checked)} disabled={disabled} />
    case 'select':
      return (
        <Select
          allowClear
          value={(value as string) ?? undefined}
          onChange={(v) => onChange?.(v ?? null)}
          options={field.options.map((o) => ({ value: o, label: o }))}
          disabled={disabled}
        />
      )
    case 'multi_select':
      return (
        <Select
          mode="multiple"
          allowClear
          value={(value as string[]) ?? []}
          onChange={(v) => onChange?.(v)}
          options={field.options.map((o) => ({ value: o, label: o }))}
          disabled={disabled}
        />
      )
    default:
      return <Input value={(value as string) ?? ''} onChange={(e) => onChange?.(e.target.value)} disabled={disabled} />
  }
}
