// Permissions grouped by module: one card per module, one row per permission with a switch.
import { Avatar, Checkbox, Empty, Flex, Switch, Tag, Tooltip, Typography, theme } from 'antd'
import { useMemo } from 'react'
import type { Permission } from '../../../types'
import { MODULE_ORDER, moduleMeta } from './roleMeta'

interface Props {
  permissions: Permission[]
  selected: number[]
  /** Saved state — rows that differ from it are marked "modified". */
  saved: number[]
  onChange: (ids: number[]) => void
  disabled?: boolean
  /** Owner: everything on, nothing editable. */
  allGranted?: boolean
  search?: string
}

export default function PermissionMatrix({ permissions, selected, saved, onChange, disabled, allGranted, search = '' }: Props) {
  const { token } = theme.useToken()

  const groups = useMemo(() => {
    const term = search.trim().toLowerCase()
    const visible = permissions.filter(
      (p) => !term || p.name.toLowerCase().includes(term) || (p.description ?? '').toLowerCase().includes(term),
    )
    const map = new Map<string, Permission[]>()
    for (const p of visible) map.set(p.module, [...(map.get(p.module) ?? []), p])
    return [...map.entries()].sort(([a], [b]) => {
      const ia = MODULE_ORDER.indexOf(a)
      const ib = MODULE_ORDER.indexOf(b)
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib)
    })
  }, [permissions, search])

  const isOn = (id: number) => allGranted || selected.includes(id)

  const toggle = (id: number, on: boolean) => onChange(on ? [...new Set([...selected, id])] : selected.filter((x) => x !== id))

  const toggleModule = (ids: number[], on: boolean) =>
    onChange(on ? [...new Set([...selected, ...ids])] : selected.filter((x) => !ids.includes(x)))

  if (groups.length === 0) return <Empty description="No permissions match your search" />

  return (
    <Flex vertical gap={16}>
      {groups.map(([module, perms]) => {
        const meta = moduleMeta(module)
        const ids = perms.map((p) => p.id)
        const onCount = ids.filter(isOn).length
        const ModuleIcon = meta.icon

        return (
          <div
            key={module}
            style={{ border: `1px solid ${token.colorBorderSecondary}`, borderRadius: token.borderRadiusLG, overflow: 'hidden' }}
          >
            {/* Module header */}
            <Flex
              align="center"
              gap={12}
              style={{ padding: '12px 16px', background: token.colorFillQuaternary, borderBottom: `1px solid ${token.colorBorderSecondary}` }}
            >
              <Avatar
                shape="square"
                size={32}
                icon={<ModuleIcon />}
                style={{ background: token.colorPrimaryBg, color: token.colorPrimary, flexShrink: 0 }}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <Typography.Text strong>{meta.label}</Typography.Text>
                <br />
                <Typography.Text type="secondary" style={{ fontSize: '0.88em' }}>
                  {meta.description}
                </Typography.Text>
              </div>
              <Typography.Text type="secondary" style={{ whiteSpace: 'nowrap' }}>
                {onCount} / {ids.length}
              </Typography.Text>
              <Checkbox
                checked={onCount === ids.length}
                indeterminate={onCount > 0 && onCount < ids.length}
                disabled={disabled || allGranted}
                onChange={(e) => toggleModule(ids, e.target.checked)}
              >
                <span style={{ whiteSpace: 'nowrap' }}>All</span>
              </Checkbox>
            </Flex>

            {/* Permission rows */}
            {perms.map((p, i) => {
              const modified = !allGranted && selected.includes(p.id) !== saved.includes(p.id)
              return (
                <Flex
                  key={p.id}
                  align="center"
                  gap={16}
                  style={{
                    padding: '12px 16px',
                    borderTop: i === 0 ? undefined : `1px solid ${token.colorBorderSecondary}`,
                    background: modified ? token.colorPrimaryBg : undefined,
                    transition: 'background 0.2s',
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <Flex align="center" gap={8} wrap>
                      <Typography.Text>{p.description ?? p.name}</Typography.Text>
                      {modified && (
                        <Tag color="processing" variant="filled" style={{ marginInlineEnd: 0 }}>
                          {selected.includes(p.id) ? 'will be granted' : 'will be removed'}
                        </Tag>
                      )}
                    </Flex>
                    <Typography.Text type="secondary" code style={{ fontSize: '0.82em' }}>
                      {p.name}
                    </Typography.Text>
                  </div>
                  <Tooltip title={allGranted ? 'Owners always have every permission' : undefined}>
                    <Switch checked={isOn(p.id)} disabled={disabled || allGranted} onChange={(on) => toggle(p.id, on)} />
                  </Tooltip>
                </Flex>
              )
            })}
          </div>
        )
      })}
    </Flex>
  )
}
