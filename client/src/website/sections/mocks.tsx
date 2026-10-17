// Drawn product screens: a realistic glimpse of Team-Flex (board, QA, docs, calendar, leave, insights)
// shown wherever the platform owner hasn't uploaded a screenshot. Decorative (aria-hidden), theme-aware.
import { CheckCircleFilled, CheckSquareOutlined, ClockCircleOutlined, FileTextOutlined, ThunderboltFilled } from '@ant-design/icons'
import { theme } from 'antd'
import type { CSSProperties, ReactNode } from 'react'
import type { MockName } from '../types'

type Tok = ReturnType<typeof theme.useToken>['token']

const PEOPLE = [
  { i: 'NG', c: '#7c3aed' },
  { i: 'VR', c: '#0891b2' },
  { i: 'MN', c: '#db2777' },
  { i: 'AI', c: '#059669' },
  { i: 'KS', c: '#ea580c' },
]

function Avatar({ n, size = 18 }: { n: number; size?: number }) {
  const p = PEOPLE[n % PEOPLE.length]!
  return (
    <span style={{ width: size, height: size, borderRadius: '50%', background: p.c, color: '#fff', fontSize: size * 0.45, fontWeight: 700, display: 'inline-grid', placeItems: 'center', flex: 'none' }}>
      {p.i}
    </span>
  )
}

function Pill({ children, color, bg }: { children: ReactNode; color: string; bg: string }) {
  return <span style={{ fontSize: 10, fontWeight: 600, padding: '1px 7px', borderRadius: 10, color, background: bg, whiteSpace: 'nowrap' }}>{children}</span>
}

/** A product window: title bar with the page name. */
function Screen({ title, right, children, minHeight = 330 }: { title: string; right?: ReactNode; children: ReactNode; minHeight?: number }) {
  const { token } = theme.useToken()
  return (
    <div
      aria-hidden
      style={{
        borderRadius: 14,
        overflow: 'hidden',
        border: `1px solid ${token.colorBorderSecondary}`,
        background: token.colorBgContainer,
        boxShadow: '0 24px 60px -24px rgba(15, 23, 42, 0.35)',
        fontSize: 12,
        color: token.colorText,
        textAlign: 'start',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px', background: token.colorFillQuaternary, borderBottom: `1px solid ${token.colorBorderSecondary}` }}>
        {['#ff5f57', '#febc2e', '#28c840'].map((c) => (
          <span key={c} style={{ width: 9, height: 9, borderRadius: '50%', background: c }} />
        ))}
        <span style={{ marginInlineStart: 8, fontWeight: 600, color: token.colorTextSecondary, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{title}</span>
        <span style={{ marginInlineStart: 'auto' }}>{right}</span>
      </div>
      <div style={{ padding: 12, minHeight }}>{children}</div>
    </div>
  )
}

const card = (token: Tok, accent: string): CSSProperties => ({
  background: token.colorBgContainer,
  border: `1px solid ${token.colorBorderSecondary}`,
  borderInlineStart: `3px solid ${accent}`,
  borderRadius: 8,
  padding: '7px 8px',
  display: 'grid',
  gap: 5,
})

// ---------------------------------------------------------------- board
function BoardMock() {
  const { token } = theme.useToken()
  const cols: { name: string; wip?: string; color: string; cards: { k: string; t: string; p: number; tag?: string; check?: string }[] }[] = [
    { name: 'To Do', color: token.colorTextQuaternary, cards: [{ k: 'WEB-47', t: 'Promo codes in checkout', p: 1, tag: 'checkout' }, { k: 'WEB-52', t: 'Keyboard navigation', p: 0, tag: 'a11y' }] },
    { name: 'In Progress', wip: '2 / 4', color: token.colorPrimary, cards: [{ k: 'WEB-41', t: 'One-page checkout form', p: 0, tag: 'frontend', check: '2/5' }, { k: 'WEB-49', t: 'Hero flickers on Safari', p: 0, tag: 'bug' }] },
    { name: 'In Review', color: '#722ed1', cards: [{ k: 'WEB-44', t: 'Saved cards (tokenised)', p: 1, tag: 'backend' }] },
    { name: 'Done', color: token.colorSuccess, cards: [{ k: 'WEB-38', t: 'Hero section A/B variants', p: 0 }, { k: 'WEB-50', t: 'Checkout design review', p: 2, check: '3/3' }] },
  ]
  return (
    <Screen
      title="Website Redesign · Board — Sprint 3"
      right={<Pill color={token.colorSuccess} bg={token.colorSuccessBg}>● Live</Pill>}
    >
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 8 }}>
        {cols.map((col) => (
          <div key={col.name} style={{ background: token.colorFillQuaternary, borderRadius: 10, padding: 7, display: 'grid', gap: 7, alignContent: 'start' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 600, fontSize: 11 }}>
              <span>{col.name}</span>
              <span style={{ color: token.colorTextTertiary }}>{col.wip ?? col.cards.length}</span>
            </div>
            {col.cards.map((c, i) => (
              <div key={c.k} style={card(token, col.color)}>
                <span style={{ fontWeight: 500, lineHeight: 1.3, fontSize: 11 }}>{c.t}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
                  <span style={{ color: token.colorTextTertiary, fontSize: 10 }}>{c.k}</span>
                  {c.tag && <Pill color={token.colorPrimary} bg={token.colorPrimaryBg}>{c.tag}</Pill>}
                  {c.check && <span style={{ fontSize: 10, color: token.colorTextTertiary }}><CheckSquareOutlined /> {c.check}</span>}
                  <span style={{ marginInlineStart: 'auto' }}><Avatar n={c.p + i} /></span>
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </Screen>
  )
}

// ---------------------------------------------------------------- QA
function QaMock() {
  const { token } = theme.useToken()
  const rows = [
    { k: 'BUG-12', t: 'Payment fails with 3-D Secure cards', sev: ['Critical', token.colorError, token.colorErrorBg], st: ['Ready for QA', token.colorInfo, token.colorInfoBg], p: 1 },
    { k: 'BUG-9', t: 'Search ignores accents (é, ü)', sev: ['Major', token.colorWarning, token.colorWarningBg], st: ['Verified ✓', token.colorSuccess, token.colorSuccessBg], p: 1 },
    { k: 'BUG-15', t: 'Password reset email sent twice', sev: ['Minor', token.colorTextSecondary, token.colorFillSecondary], st: ['Reopened ×2', '#c41d7f', '#fff0f6'], p: 1 },
    { k: 'BUG-7', t: 'Cart badge shows wrong count', sev: ['Major', token.colorWarning, token.colorWarningBg], st: ['In Progress', token.colorPrimary, token.colorPrimaryBg], p: 0 },
  ]
  return (
    <Screen title="Bug Tracker · Waiting for QA" right={<span style={{ color: token.colorTextTertiary, fontSize: 11 }}>4 open</span>}>
      <div style={{ display: 'grid', gap: 7 }}>
        {rows.map((r) => (
          <div key={r.k} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 8, border: `1px solid ${token.colorBorderSecondary}` }}>
            <span style={{ color: token.colorTextTertiary, fontSize: 10, width: 44, flex: 'none' }}>{r.k}</span>
            <span style={{ fontWeight: 500, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.t}</span>
            <Pill color={r.sev[1]!} bg={r.sev[2]!}>{r.sev[0]}</Pill>
            <Pill color={r.st[1]!} bg={r.st[2]!}>{r.st[0]}</Pill>
            <Avatar n={r.p} />
          </div>
        ))}
      </div>
      <div style={{ marginTop: 14, padding: 10, borderRadius: 10, background: token.colorFillQuaternary }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 600, marginBottom: 6 }}>
          <span>Test run · Release 2.4 regression</span>
          <span style={{ color: token.colorSuccess }}>80% passed</span>
        </div>
        <div style={{ display: 'flex', height: 8, borderRadius: 4, overflow: 'hidden', gap: 2 }}>
          <span style={{ flex: 8, background: token.colorSuccess }} />
          <span style={{ flex: 1.5, background: token.colorError }} />
          <span style={{ flex: 0.5, background: token.colorWarning }} />
        </div>
        <div style={{ display: 'flex', gap: 14, marginTop: 6, color: token.colorTextSecondary, fontSize: 11 }}>
          <span>8 passed</span><span>2 failed → bugs filed</span><span>1 blocked</span>
        </div>
      </div>
    </Screen>
  )
}

// ---------------------------------------------------------------- docs
function DocsMock() {
  const { token } = theme.useToken()
  const tree = [['Project overview', 0, true], ['Architecture', 0], ['API conventions', 1], ['Meeting notes', 0], ['Sprint 3 planning', 1], ['Sprint 2 retro', 1], ['Design', 0]] as const
  const line = (w: string, h = 7, c = token.colorFillSecondary) => <div style={{ height: h, width: w, background: c, borderRadius: 4 }} />
  return (
    <Screen title="Website Redesign · Docs">
      <div style={{ display: 'grid', gridTemplateColumns: '38% 1fr', gap: 12 }}>
        <div style={{ borderInlineEnd: `1px solid ${token.colorBorderSecondary}`, paddingInlineEnd: 8, display: 'grid', gap: 3, alignContent: 'start' }}>
          {tree.map(([t, depth, active]) => (
            <div key={t} style={{ padding: '4px 6px', paddingInlineStart: 6 + depth * 14, borderRadius: 6, background: active ? token.colorPrimaryBg : undefined, color: active ? token.colorPrimary : token.colorText, fontWeight: active ? 600 : 400, fontSize: 11, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              <FileTextOutlined style={{ marginInlineEnd: 5, opacity: 0.6 }} />{t}
            </div>
          ))}
        </div>
        <div style={{ display: 'grid', gap: 9, alignContent: 'start' }}>
          <div style={{ fontSize: 16, fontWeight: 700 }}>Project overview</div>
          <div style={{ color: token.colorTextTertiary, fontSize: 10 }}>Last edited by Rohan · 2 hours ago · History</div>
          <div style={{ fontWeight: 600, marginTop: 4 }}>Goals</div>
          <div style={{ display: 'grid', gap: 5 }}>
            {['+20% conversion by January', 'Lighthouse 90+ on mobile', 'WCAG 2.2 AA'].map((g) => (
              <div key={g} style={{ display: 'flex', gap: 6, alignItems: 'center' }}><CheckCircleFilled style={{ color: token.colorSuccess }} />{g}</div>
            ))}
          </div>
          <div style={{ fontWeight: 600, marginTop: 4 }}>Timeline</div>
          {line('92%')}{line('78%')}{line('85%')}{line('60%')}
        </div>
      </div>
    </Screen>
  )
}

// ---------------------------------------------------------------- calendar
function CalendarMock() {
  const { token } = theme.useToken()
  const chips: Record<number, [string, string]> = { 3: ['Design review', token.colorSuccess], 6: ['Checkout form', token.colorPrimary], 9: ['Saved cards', '#722ed1'], 13: ['Promo codes', token.colorPrimary], 16: ['Release 2.5', token.colorError], 22: ['Retro', token.colorWarning] }
  return (
    <Screen title="Website Redesign · Calendar — October">
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 4 }}>
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
          <div key={d} style={{ fontSize: 10, fontWeight: 600, color: token.colorTextTertiary, padding: '0 4px' }}>{d}</div>
        ))}
        {Array.from({ length: 28 }, (_, i) => {
          const day = i + 1
          const weekend = i % 7 >= 5
          const inSprint = day >= 5 && day <= 16
          return (
            <div key={i} style={{ minHeight: 52, borderRadius: 6, padding: 4, background: weekend ? token.colorFillQuaternary : token.colorBgContainer, border: `1px solid ${token.colorBorderSecondary}`, display: 'grid', alignContent: 'start', gap: 3 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10 }}>
                <span style={{ fontWeight: day === 6 ? 700 : 400, color: day === 6 ? token.colorPrimary : undefined }}>{day}</span>
                {(day === 7 || day === 8) && <span>🌴</span>}
                {day === 20 && <span>🎉</span>}
              </div>
              {inSprint && <div style={{ height: 4, borderRadius: 2, background: token.colorPrimaryBorder }} />}
              {chips[day] && (
                <div style={{ fontSize: 9, padding: '1px 4px', borderRadius: 3, borderInlineStart: `2px solid ${chips[day]![1]}`, background: token.colorFillTertiary, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {chips[day]![0]}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </Screen>
  )
}

// ---------------------------------------------------------------- leave
function LeaveMock() {
  const { token } = theme.useToken()
  const people = [
    ['Neha Gupta', 2, 5, token.colorSuccess],
    ['Vikram Rao', 9, 2, token.colorWarning],
    ['Meera Nair', 6, 1, token.colorInfo],
    ['Kabir Singh', 11, 3, token.colorPrimary],
  ] as const
  return (
    <Screen title="Leave · Team calendar">
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8, marginBottom: 12 }}>
        {[['Annual leave', '14 of 20 days left', token.colorPrimary], ['Sick leave', '9 of 10 days left', token.colorWarning], ['Work from home', 'Unlimited', token.colorSuccess]].map(([t, v, c]) => (
          <div key={t} style={{ padding: 8, borderRadius: 8, border: `1px solid ${token.colorBorderSecondary}`, borderTop: `3px solid ${c}` }}>
            <div style={{ fontWeight: 600, fontSize: 11 }}>{t}</div>
            <div style={{ color: token.colorTextSecondary, fontSize: 10 }}>{v}</div>
          </div>
        ))}
      </div>
      <div style={{ display: 'grid', gap: 6 }}>
        {people.map(([name, start, len, c], i) => (
          <div key={name} style={{ display: 'grid', gridTemplateColumns: '92px 1fr', alignItems: 'center', gap: 8 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, whiteSpace: 'nowrap' }}><Avatar n={i} size={16} />{name.split(' ')[0]}</span>
            <div style={{ position: 'relative', height: 18, borderRadius: 4, background: token.colorFillQuaternary }}>
              <span style={{ position: 'absolute', insetInlineStart: `${(start / 14) * 100}%`, width: `${(len / 14) * 100}%`, top: 2, bottom: 2, borderRadius: 3, background: c, opacity: 0.8 }} />
            </div>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 12, padding: 10, borderRadius: 10, background: token.colorFillQuaternary, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <Avatar n={4} />
        <span style={{ flex: 1, minWidth: 140 }}><strong>Kabir</strong> · Annual leave · 26–30 Oct · 5 days</span>
        <Pill color="#fff" bg={token.colorSuccess}>Approve</Pill>
        <Pill color={token.colorTextSecondary} bg={token.colorFillSecondary}>Reject</Pill>
      </div>
    </Screen>
  )
}

// ---------------------------------------------------------------- insights
function InsightsMock() {
  const { token } = theme.useToken()
  const tiles = [['Open work', '128', token.colorText], ['Overdue', '9', token.colorError], ['Open bugs', '23', token.colorWarning], ['Test pass rate', '94%', token.colorSuccess]] as const
  const weeks = [[12, 9], [15, 13], [11, 14], [18, 16], [14, 17], [20, 19], [16, 21], [19, 22]]
  return (
    <Screen title="Organization · Insights — last 30 days">
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 8 }}>
        {tiles.map(([l, v, c]) => (
          <div key={l} style={{ padding: 8, borderRadius: 8, border: `1px solid ${token.colorBorderSecondary}` }}>
            <div style={{ color: token.colorTextTertiary, fontSize: 10 }}>{l}</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: c }}>{v}</div>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 12, padding: 10, borderRadius: 10, border: `1px solid ${token.colorBorderSecondary}` }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 600, marginBottom: 8 }}>
          <span>Created vs completed</span>
          <span style={{ display: 'flex', gap: 10, fontSize: 10, fontWeight: 400, color: token.colorTextSecondary }}>
            <span><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: token.colorPrimaryBorder }} /> created</span>
            <span><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: token.colorPrimary }} /> completed</span>
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 110 }}>
          {weeks.map(([a, b], i) => (
            <div key={i} style={{ flex: 1, display: 'flex', alignItems: 'flex-end', gap: 2, height: '100%' }}>
              <span style={{ flex: 1, height: `${(a / 22) * 100}%`, borderRadius: '3px 3px 0 0', background: token.colorPrimaryBorder }} />
              <span style={{ flex: 1, height: `${(b / 22) * 100}%`, borderRadius: '3px 3px 0 0', background: token.colorPrimary }} />
            </div>
          ))}
        </div>
      </div>
      <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 8, background: token.colorErrorBg, color: token.colorError }}>
        <ThunderboltFilled /> <strong>Needs attention:</strong> <span style={{ color: token.colorText }}>Mobile App — 3 critical bugs, 4 overdue</span>
        <ClockCircleOutlined style={{ marginInlineStart: 'auto', opacity: 0.6 }} />
      </div>
    </Screen>
  )
}

// ---------------------------------------------------------------- work item detail
function ItemMock() {
  const { token } = theme.useToken()
  const steps = [['Address form', true], ['Shipping options', true], ['Payment step', false], ['Order summary', false]] as const
  return (
    <Screen title="WEB-41 · One-page checkout form">
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 34%', gap: 12 }}>
        <div style={{ display: 'grid', gap: 10, alignContent: 'start' }}>
          <div style={{ fontSize: 15, fontWeight: 700 }}>One-page checkout form</div>
          <div style={{ display: 'grid', gap: 5 }}>
            {['92%', '80%', '64%'].map((w) => <div key={w} style={{ height: 7, width: w, background: token.colorFillSecondary, borderRadius: 4 }} />)}
          </div>
          <div style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
            <CheckSquareOutlined /> Checklist
            <span style={{ flex: 1, height: 6, borderRadius: 3, background: token.colorFillSecondary, overflow: 'hidden' }}>
              <span style={{ display: 'block', width: '50%', height: '100%', background: token.colorSuccess }} />
            </span>
            <span style={{ fontWeight: 400, color: token.colorTextTertiary }}>2/4</span>
          </div>
          {steps.map(([t, done]) => (
            <div key={t} style={{ display: 'flex', gap: 8, alignItems: 'center', color: done ? token.colorTextTertiary : token.colorText, textDecoration: done ? 'line-through' : undefined }}>
              <span style={{ width: 13, height: 13, borderRadius: 3, border: `1.5px solid ${done ? token.colorPrimary : token.colorBorder}`, background: done ? token.colorPrimary : undefined, flex: 'none' }} />
              {t}
            </div>
          ))}
          <div style={{ display: 'flex', gap: 8, padding: 8, borderRadius: 8, background: token.colorFillQuaternary }}>
            <Avatar n={1} />
            <div style={{ fontSize: 11 }}><strong>Rohan</strong> <span style={{ color: token.colorPrimary }}>@Neha</span> can we reuse the address component? <span style={{ marginInlineStart: 4 }}>👍 2</span></div>
          </div>
        </div>
        <div style={{ display: 'grid', gap: 8, alignContent: 'start', fontSize: 11 }}>
          {[['Status', <Pill key="s" color={token.colorPrimary} bg={token.colorPrimaryBg}>In Progress</Pill>], ['Assignee', <span key="a" style={{ display: 'flex', gap: 5, alignItems: 'center' }}><Avatar n={0} size={16} />Neha</span>], ['Priority', <Pill key="p" color={token.colorWarning} bg={token.colorWarningBg}>High</Pill>], ['Sprint', 'Sprint 3'], ['Estimate', '8 points'], ['Due', 'Fri, 10 Oct']].map(([k, v]) => (
            <div key={String(k)} style={{ display: 'grid', gap: 2 }}>
              <span style={{ color: token.colorTextTertiary, fontSize: 10 }}>{k}</span>
              <span>{v}</span>
            </div>
          ))}
        </div>
      </div>
    </Screen>
  )
}

// ---------------------------------------------------------------- roles & permissions
function RolesMock() {
  const { token } = theme.useToken()
  const roles = ['Owner', 'Admin', 'Developer', 'QA', 'Guest']
  const perms: [string, boolean[]][] = [
    ['Invite members', [true, true, false, false, false]],
    ['Manage all projects', [true, true, false, false, false]],
    ['Resolve production errors', [true, true, true, true, false]],
    ['Approve leave', [true, true, false, false, false]],
    ['Organization insights', [true, true, false, false, false]],
    ['Read the Help Center', [true, true, true, true, true]],
  ]
  return (
    <Screen title="Organization · Roles & Access" right={<Pill color={token.colorTextSecondary} bg={token.colorFillSecondary}>Audit log on</Pill>}>
      <div style={{ display: 'grid', gridTemplateColumns: `1.6fr repeat(${roles.length}, minmax(0, 1fr))`, gap: '6px 4px', alignItems: 'center' }}>
        <span />
        {roles.map((r) => <span key={r} style={{ fontWeight: 600, fontSize: 10, textAlign: 'center' }}>{r}</span>)}
        {perms.map(([p, on]) => (
          <div key={p} style={{ display: 'contents' }}>
            <span style={{ fontSize: 11, paddingBlock: 4, borderTop: `1px solid ${token.colorBorderSecondary}` }}>{p}</span>
            {on.map((v, i) => (
              <span key={i} style={{ textAlign: 'center', borderTop: `1px solid ${token.colorBorderSecondary}`, paddingBlock: 4 }}>
                {v ? <CheckCircleFilled style={{ color: token.colorSuccess }} /> : <span style={{ color: token.colorTextQuaternary }}>—</span>}
              </span>
            ))}
          </div>
        ))}
      </div>
      <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
        <div style={{ padding: 8, borderRadius: 8, background: token.colorFillQuaternary, fontSize: 11 }}><strong>Passwords</strong><br />12+ characters, symbol required</div>
        <div style={{ padding: 8, borderRadius: 8, background: token.colorFillQuaternary, fontSize: 11 }}><strong>Sessions</strong><br />Sign out after 1 hour idle</div>
      </div>
    </Screen>
  )
}

const MOCKS: Record<MockName, () => ReactNode> = {
  board: BoardMock, qa: QaMock, docs: DocsMock, calendar: CalendarMock, leave: LeaveMock, insights: InsightsMock, item: ItemMock, roles: RolesMock,
}
const ORDER: MockName[] = ['board', 'qa', 'insights', 'calendar', 'docs', 'leave', 'item', 'roles']

/** A drawn screen by name — or by position (feature rows without images cycle through them). */
export function ProductScreen({ name, index = 0 }: { name?: MockName; index?: number }) {
  const Mock = MOCKS[name ?? ORDER[index % ORDER.length]!]
  return <Mock />
}
