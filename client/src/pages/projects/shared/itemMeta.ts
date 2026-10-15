// Visual vocabulary for work items: type icons/colours, priorities, severities.
import {
  ArrowDownOutlined,
  ArrowUpOutlined,
  BookOutlined,
  BugOutlined,
  CheckSquareOutlined,
  DoubleRightOutlined,
  MinusOutlined,
  NodeIndexOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons'
import type { ComponentType } from 'react'
import type { ItemType, Priority, Severity } from '../../../types/projects'

export { ALLOWED_PARENTS, RESOLUTION_LABELS, detectBrowser, formatBytes, isOverdue, qaState } from './itemRules'

export const ITEM_TYPES: { value: ItemType; label: string; icon: ComponentType; color: string; hint: string }[] = [
  { value: 'epic', label: 'Epic', icon: ThunderboltOutlined, color: '#8e4ec6', hint: 'A large body of work, split into stories / tasks' },
  { value: 'story', label: 'Story', icon: BookOutlined, color: '#30a46c', hint: 'A user-facing feature' },
  { value: 'task', label: 'Task', icon: CheckSquareOutlined, color: '#3e63dd', hint: 'A piece of work to do' },
  { value: 'bug', label: 'Bug', icon: BugOutlined, color: '#e5484d', hint: 'Something is broken' },
  { value: 'subtask', label: 'Sub-task', icon: NodeIndexOutlined, color: '#0d9ab8', hint: 'Part of a story, task or bug' },
]
export const typeMeta = (t: ItemType) => ITEM_TYPES.find((x) => x.value === t) ?? ITEM_TYPES[2]!

export const PRIORITIES: { value: Priority; label: string; icon: ComponentType; color: string }[] = [
  { value: 'urgent', label: 'Urgent', icon: DoubleRightOutlined, color: '#e5484d' },
  { value: 'high', label: 'High', icon: ArrowUpOutlined, color: '#f76b15' },
  { value: 'medium', label: 'Medium', icon: MinusOutlined, color: '#ffb224' },
  { value: 'low', label: 'Low', icon: ArrowDownOutlined, color: '#3e63dd' },
  { value: 'none', label: 'No priority', icon: MinusOutlined, color: '#8b8d98' },
]
export const priorityMeta = (p: Priority) => PRIORITIES.find((x) => x.value === p) ?? PRIORITIES[2]!

export const SEVERITIES: { value: Severity; label: string; color: string }[] = [
  { value: 'critical', label: 'Critical', color: 'red' },
  { value: 'major', label: 'Major', color: 'orange' },
  { value: 'minor', label: 'Minor', color: 'gold' },
  { value: 'trivial', label: 'Trivial', color: 'default' },
]

export const LABEL_COLORS = ['blue', 'purple', 'magenta', 'red', 'volcano', 'orange', 'gold', 'green', 'cyan', 'geekblue']
export const STATUS_COLORS = ['#8c8c8c', '#bfbfbf', '#1677ff', '#722ed1', '#13c2c2', '#52c41a', '#fa541c', '#eb2f96', '#faad14']
