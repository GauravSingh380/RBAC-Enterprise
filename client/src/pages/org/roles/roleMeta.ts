// Visual identity for roles and permission modules (icons + colours) on the Roles & Access page.
import {
  ApartmentOutlined,
  AppstoreOutlined,
  BugOutlined,
  CodeOutlined,
  CrownOutlined,
  DashboardOutlined,
  SafetyCertificateOutlined,
  SafetyOutlined,
  TeamOutlined,
  UserOutlined,
} from '@ant-design/icons'
import type { ComponentType } from 'react'

export interface RoleMeta {
  icon: ComponentType
  /** Foreground colour; the background uses the same colour with low opacity (works in light + dark). */
  color: string
}

const SYSTEM_ROLE_META: Record<string, RoleMeta> = {
  owner: { icon: CrownOutlined, color: '#d4a106' },
  admin: { icon: SafetyCertificateOutlined, color: '#3e63dd' },
  qa: { icon: BugOutlined, color: '#30a46c' },
  developer: { icon: CodeOutlined, color: '#8e4ec6' },
  member: { icon: UserOutlined, color: '#0d9ab8' },
}

const CUSTOM_ROLE_META: RoleMeta = { icon: AppstoreOutlined, color: '#d6409f' }

export const roleMeta = (name: string): RoleMeta => SYSTEM_ROLE_META[name] ?? CUSTOM_ROLE_META

export interface ModuleMeta {
  icon: ComponentType
  label: string
  description: string
}

const MODULE_META: Record<string, ModuleMeta> = {
  dashboard: { icon: DashboardOutlined, label: 'Dashboard', description: 'Access to the organization dashboard.' },
  members: { icon: TeamOutlined, label: 'Members', description: 'Who can see, invite and manage people.' },
  roles: { icon: SafetyOutlined, label: 'Roles & access', description: 'Who can view and change roles and permissions.' },
  organization: { icon: ApartmentOutlined, label: 'Organization', description: 'Settings, announcement and audit log.' },
}

export const moduleMeta = (module: string): ModuleMeta =>
  MODULE_META[module] ?? { icon: AppstoreOutlined, label: module.charAt(0).toUpperCase() + module.slice(1), description: '' }

/** Preferred display order of permission modules. */
export const MODULE_ORDER = ['dashboard', 'members', 'roles', 'organization']
