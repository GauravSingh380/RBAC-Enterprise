// Ctrl+K / ⌘K — jump anywhere: work items (by key "TF-12" or text), projects, pages, quick actions.
// Keyboard: ↑ ↓ to move, Enter to open, Esc to close. Opened items are remembered as "Recent".
import { ArrowRightOutlined, BulbOutlined, FileTextOutlined, ProjectOutlined, SearchOutlined } from '@ant-design/icons'
import { Empty, Flex, Input, Modal, Spin, Tag, Typography, theme, type InputRef } from 'antd'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import { projectsService, workItemsService } from '../services/projects.service'
import { useTheme } from '../theme/useTheme'
import type { MenuNode } from '../types'
import type { ProjectSummary, WorkItemSummary } from '../types/projects'

interface Entry {
  id: string
  group: string
  icon: ReactNode
  title: ReactNode
  hint?: ReactNode
  run: () => void
}

const RECENT_KEY = 'tf.palette.recent'
type Recent = { key: string; number: number; title: string; projectKey: string }

function readRecent(): Recent[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]') as Recent[]
  } catch {
    return []
  }
}
function remember(r: Recent) {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify([r, ...readRecent().filter((x) => x.key !== r.key)].slice(0, 6)))
  } catch {
    /* storage unavailable (private mode) — recent list is optional */
  }
}

const flatten = (nodes: MenuNode[]): MenuNode[] => nodes.flatMap((n) => [...(n.path ? [n] : []), ...flatten(n.children)])
const matches = (q: string, ...texts: (string | null | undefined)[]) => texts.some((t) => t?.toLowerCase().includes(q))
const projectKeyOf = (itemKey: string) => itemKey.slice(0, itemKey.lastIndexOf('-'))

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const { user, organization } = useAuth()
  const { isDark, toggleDark } = useTheme()
  const { token } = theme.useToken()
  const inputRef = useRef<InputRef>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const [projects, setProjects] = useState<ProjectSummary[]>([])
  const [items, setItems] = useState<WorkItemSummary[]>([])
  const [searching, setSearching] = useState(false)
  const q = query.trim().toLowerCase()

  // projects once per opening
  useEffect(() => {
    if (!open || !organization) return
    let alive = true
    projectsService.list('active').then((p) => alive && setProjects(p), () => undefined)
    return () => {
      alive = false
    }
  }, [open, organization])

  // work item search, debounced
  useEffect(() => {
    if (!open || !organization || !q) return
    let alive = true
    const timer = setTimeout(() => {
      setSearching(true)
      workItemsService
        .search(query.trim())
        .then((r) => alive && setItems(r), () => alive && setItems([]))
        .finally(() => alive && setSearching(false))
    }, 200)
    return () => {
      alive = false
      clearTimeout(timer)
    }
  }, [open, organization, q, query])

  const close = () => {
    onClose()
    setQuery('')
    setItems([])
    setActive(0)
  }
  const go = (path: string) => {
    close()
    navigate(path)
  }

  const currentProject = /^\/projects\/([^/]+)/.exec(pathname)?.[1]
  const entries = useMemo<Entry[]>(() => {
    const list: Entry[] = []
    const openItem = (r: Recent) => {
      remember(r)
      go(`/projects/${r.projectKey}/items/${r.number}`)
    }

    if (!q) {
      for (const r of readRecent()) {
        list.push({ id: `recent:${r.key}`, group: 'Recent', icon: <FileTextOutlined />, title: r.title, hint: r.key, run: () => openItem(r) })
      }
    } else {
      for (const i of q ? items : []) {
        const r = { key: i.key, number: i.number, title: i.title, projectKey: projectKeyOf(i.key) }
        list.push({
          id: `item:${i.id}`,
          group: 'Work items',
          icon: <FileTextOutlined />,
          title: i.title,
          hint: (
            <Flex gap={6} align="center">
              <Tag style={{ marginInlineEnd: 0 }}>{i.status.name}</Tag>
              {i.key}
            </Flex>
          ),
          run: () => openItem(r),
        })
      }
    }

    for (const p of projects.filter((p) => !q || matches(q, p.name, p.key)).slice(0, q ? 6 : 4)) {
      list.push({ id: `project:${p.id}`, group: 'Projects', icon: <ProjectOutlined />, title: p.name, hint: p.key, run: () => go(`/projects/${p.key}`) })
    }

    if (currentProject) {
      for (const [label, suffix] of [['Board', ''], ['Backlog', '/backlog'], ['List', '/list'], ['Reports', '/reports']] as const) {
        if (!q || matches(q, label, `${currentProject} ${label}`)) {
          list.push({ id: `nav:${suffix}`, group: `Project ${currentProject}`, icon: <ArrowRightOutlined />, title: label, run: () => go(`/projects/${currentProject}${suffix}`) })
        }
      }
    }

    for (const m of flatten(user?.menus ?? []).filter((m) => !q || matches(q, m.label, m.path))) {
      list.push({ id: `page:${m.path}`, group: 'Pages', icon: <ArrowRightOutlined />, title: m.label, hint: m.path, run: () => go(m.path!) })
    }
    if (!q || matches(q, 'dark mode', 'light mode', 'theme')) {
      list.push({ id: 'action:theme', group: 'Actions', icon: <BulbOutlined />, title: isDark ? 'Switch to light mode' : 'Switch to dark mode', run: () => (toggleDark(), close()) })
    }
    return list
  }, [q, items, projects, user?.menus, currentProject, isDark]) // eslint-disable-line react-hooks/exhaustive-deps

  const safeActive = Math.min(active, Math.max(0, entries.length - 1))
  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${safeActive}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [safeActive])

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((a) => Math.min(a + 1, entries.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((a) => Math.max(a - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      entries[safeActive]?.run()
    }
  }

  let lastGroup = ''
  return (
    <Modal
      open={open}
      onCancel={close}
      footer={null}
      closable={false}
      width={640}
      styles={{ body: { padding: 0 } }}
      style={{ top: 80 }}
      afterOpenChange={(o) => o && inputRef.current?.focus()}
      destroyOnHidden
    >
      <div style={{ padding: 12, borderBottom: `1px solid ${token.colorBorderSecondary}` }}>
        <Input
          ref={inputRef}
          size="large"
          variant="borderless"
          prefix={searching ? <Spin size="small" /> : <SearchOutlined />}
          placeholder="Search work items (TF-12 or text), projects, pages…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setActive(0)
            if (!e.target.value.trim()) setItems([])
          }}
          onKeyDown={onKeyDown}
          aria-label="Command palette search"
        />
      </div>
      <div ref={listRef} role="listbox" style={{ maxHeight: 420, overflowY: 'auto', padding: 6 }}>
        {entries.length === 0 && !searching && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Nothing found" style={{ padding: 24 }} />}
        {entries.map((e, index) => {
          const header = e.group !== lastGroup
          lastGroup = e.group
          return (
            <div key={e.id}>
              {header && (
                <Typography.Text type="secondary" style={{ display: 'block', padding: '8px 10px 4px', fontSize: '0.78em', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  {e.group}
                </Typography.Text>
              )}
              <Flex
                role="option"
                aria-selected={index === safeActive}
                data-index={index}
                align="center"
                gap={10}
                onMouseEnter={() => setActive(index)}
                onClick={e.run}
                style={{
                  padding: '8px 10px',
                  borderRadius: 6,
                  cursor: 'pointer',
                  background: index === safeActive ? token.colorPrimaryBg : undefined,
                }}
              >
                <span style={{ color: token.colorTextSecondary }}>{e.icon}</span>
                <Typography.Text ellipsis style={{ flex: 1 }}>
                  {e.title}
                </Typography.Text>
                {e.hint && (
                  <Typography.Text type="secondary" style={{ fontSize: '0.85em', whiteSpace: 'nowrap' }}>
                    {e.hint}
                  </Typography.Text>
                )}
              </Flex>
            </div>
          )
        })}
      </div>
      <Flex gap={16} style={{ padding: '8px 14px', borderTop: `1px solid ${token.colorBorderSecondary}`, color: token.colorTextTertiary, fontSize: '0.8em' }}>
        <span>↑ ↓ navigate</span>
        <span>Enter open</span>
        <span>Esc close</span>
      </Flex>
    </Modal>
  )
}
