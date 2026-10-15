// Icons the platform owner can pick for feature cards (stored by name).
import {
  AlertOutlined, ApiOutlined, AppstoreOutlined, BarChartOutlined, BellOutlined, BugOutlined, BulbOutlined, CalendarOutlined,
  CheckCircleOutlined, ClockCircleOutlined, CloudOutlined, DashboardOutlined, ExperimentOutlined, FileTextOutlined, GlobalOutlined,
  HeartOutlined, LockOutlined, MobileOutlined, QuestionCircleOutlined, RocketOutlined, SafetyOutlined, SearchOutlined, SmileOutlined,
  StarOutlined, TeamOutlined, ThunderboltOutlined,
} from '@ant-design/icons'
import type { ComponentType } from 'react'

export const FEATURE_ICONS: Record<string, ComponentType> = {
  check: CheckCircleOutlined,
  board: AppstoreOutlined,
  bug: BugOutlined,
  experiment: ExperimentOutlined,
  alert: AlertOutlined,
  calendar: CalendarOutlined,
  file: FileTextOutlined,
  chart: BarChartOutlined,
  team: TeamOutlined,
  safety: SafetyOutlined,
  lock: LockOutlined,
  thunder: ThunderboltOutlined,
  bell: BellOutlined,
  dashboard: DashboardOutlined,
  search: SearchOutlined,
  help: QuestionCircleOutlined,
  moon: BulbOutlined,
  rocket: RocketOutlined,
  star: StarOutlined,
  heart: HeartOutlined,
  global: GlobalOutlined,
  cloud: CloudOutlined,
  mobile: MobileOutlined,
  clock: ClockCircleOutlined,
  api: ApiOutlined,
  smile: SmileOutlined,
}

export const ICON_NAMES = Object.keys(FEATURE_ICONS)
