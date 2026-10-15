// The filter row shared by the list and the board (search, type, status, assignee, priority, label, views).
import { FilterOutlined } from '@ant-design/icons'
import { Button, Flex, Input, Select } from 'antd'
import type { ReactNode } from 'react'
import type { PersonOption, ProjectDetail } from '../../../types/projects'
import { ITEM_TYPES, PRIORITIES } from './itemMeta'
import { SavedViewsMenu } from './SavedViewsMenu'
import type { ItemFilters } from './useItemFilters'

interface Props {
  project: ProjectDetail
  filters: ItemFilters
  people: PersonOption[]
  viewType: 'list' | 'board'
  /** the board already shows statuses as columns */
  showStatus?: boolean
  /** extra controls on the left (e.g. sprint switch) */
  before?: ReactNode
  /** buttons on the right */
  children?: ReactNode
}

export function FilterBar({ project, filters, people, viewType, showStatus = true, before, children }: Props) {
  const multiSelect = (key: string, placeholder: string, options: { value: string | number; label: string }[], width = 150) => (
    <Select
      mode="multiple"
      allowClear
      maxTagCount="responsive"
      placeholder={placeholder}
      style={{ minWidth: width }}
      value={filters.listParam(key)}
      onChange={(v: string[]) => filters.update({ [key]: v.join(',') })}
      options={options.map((o) => ({ ...o, value: String(o.value) }))}
      optionFilterProp="label"
    />
  )

  return (
    <Flex gap={8} wrap align="center" style={{ marginBottom: 16 }}>
      {before}
      <Input.Search
        key={filters.params.get('q') ?? ''} // reset the box when a view / "clear" changes the search
        placeholder="Search title, description or key"
        allowClear
        defaultValue={filters.params.get('q') ?? undefined}
        onSearch={(v) => filters.update({ q: v.trim() })}
        style={{ width: 240 }}
      />
      {multiSelect('types', 'Type', ITEM_TYPES.map((t) => ({ value: t.value, label: t.label })), 120)}
      {showStatus && multiSelect('statusIds', 'Status', project.statuses.map((s) => ({ value: s.id, label: s.name })))}
      {multiSelect('assignees', 'Assignee', [
        { value: 'me', label: 'Me' },
        { value: 'none', label: 'Unassigned' },
        ...people.map((u) => ({ value: u.id, label: u.name })),
      ])}
      {multiSelect('priorities', 'Priority', PRIORITIES.map((p) => ({ value: p.value, label: p.label })), 120)}
      {project.labels.length > 0 && multiSelect('labelIds', 'Label', project.labels.map((l) => ({ value: l.id, label: l.name })), 120)}
      {filters.activeCount > 0 && (
        <Button type="link" onClick={filters.clear}>
          <FilterOutlined /> Clear {filters.activeCount}
        </Button>
      )}
      <div style={{ flex: 1 }} />
      <SavedViewsMenu project={project} viewType={viewType} filters={filters} />
      {children}
    </Flex>
  )
}
