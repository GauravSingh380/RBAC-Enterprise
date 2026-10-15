// /people — who is who: directory, teams and the org chart.
// Everyone can look; people with users.update (Admin) edit job titles, managers and teams.
import { ApartmentOutlined, DeleteOutlined, EditOutlined, PlusOutlined, TeamOutlined } from '@ant-design/icons'
import { App, Avatar, Button, Card, Col, ColorPicker, Descriptions, Drawer, Empty, Flex, Form, Input, Modal, Popconfirm, Row, Select, Space, Table, Tabs, Tag, Tree, Typography } from 'antd'
import { useCallback, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '../../auth/useAuth'
import { PageHeader } from '../../components/ui'
import { PERMISSIONS } from '../../config/permissions'
import { useFetch } from '../../hooks/useFetch'
import { getErrorMessage } from '../../lib/api'
import { peopleService } from '../../services/people.service'
import type { Person, Team } from '../../types/people'
import { UserAvatar } from '../projects/shared/ItemBits'

export default function PeoplePage() {
  const [params, setParams] = useSearchParams()
  const tab = params.get('tab') ?? 'directory'
  const people = useFetch(useCallback(() => peopleService.directory(), []))
  const teams = useFetch(useCallback(() => peopleService.teams(), []))
  const reload = () => (people.reload(), teams.reload())

  return (
    <>
      <PageHeader help="people-and-teams" title="People" description="Who works here, in which team, and who they report to." />
      <Tabs
        activeKey={tab}
        onChange={(k) => setParams(k === 'directory' ? {} : { tab: k }, { replace: true })}
        items={[
          { key: 'directory', label: 'Directory', children: <Directory people={people.data} teams={teams.data ?? []} onChanged={reload} /> },
          { key: 'teams', label: `Teams${teams.data ? ` (${teams.data.length})` : ''}`, children: <Teams teams={teams.data} people={people.data ?? []} onChanged={reload} /> },
          { key: 'chart', label: 'Org chart', children: <OrgChart people={people.data ?? []} /> },
        ]}
      />
    </>
  )
}

// ---------------------------------------------------------------- directory

function Directory({ people, teams, onChanged }: { people: Person[] | null; teams: Team[]; onChanged: () => void }) {
  const [search, setSearch] = useState('')
  const [teamId, setTeamId] = useState<number>()
  const [openId, setOpenId] = useState<number | null>(null)
  const q = search.trim().toLowerCase()
  const rows = (people ?? []).filter(
    (p) =>
      (!q || [p.name, p.email, p.jobTitle ?? '', ...p.teams.map((t) => t.name)].some((v) => v.toLowerCase().includes(q))) &&
      (!teamId || p.teams.some((t) => t.id === teamId)),
  )
  return (
    <Card>
      <Flex gap={8} wrap style={{ marginBottom: 16 }}>
        <Input.Search placeholder="Search name, email, title or team" allowClear onChange={(e) => setSearch(e.target.value)} style={{ width: 300 }} />
        <Select allowClear placeholder="Team" style={{ width: 180 }} value={teamId} onChange={setTeamId} options={teams.map((t) => ({ value: t.id, label: t.name }))} />
        <div style={{ flex: 1 }} />
        <Typography.Text type="secondary" style={{ alignSelf: 'center' }}>
          {rows.length} {rows.length === 1 ? 'person' : 'people'}
        </Typography.Text>
      </Flex>
      <Table<Person>
        rowKey="id"
        loading={!people}
        dataSource={rows}
        pagination={rows.length > 50 ? { pageSize: 50 } : false}
        onRow={(p) => ({ onClick: () => setOpenId(p.id), style: { cursor: 'pointer' } })}
        scroll={{ x: 760 }}
        columns={[
          {
            title: 'Name',
            key: 'name',
            render: (_, p) => (
              <Flex align="center" gap={10}>
                <UserAvatar user={p} size={32} />
                <div>
                  <Typography.Text strong>{p.name}</Typography.Text>
                  {p.awayToday && <Tag style={{ marginLeft: 8 }}>🌴 away today</Tag>}
                  <br />
                  <Typography.Text type="secondary" style={{ fontSize: '0.85em' }}>
                    {p.jobTitle ?? p.email}
                  </Typography.Text>
                </div>
              </Flex>
            ),
          },
          { title: 'Teams', key: 'teams', render: (_, p) => p.teams.map((t) => <Tag key={t.id} color={t.color}>{t.name}</Tag>) },
          { title: 'Manager', key: 'manager', width: 170, render: (_, p) => p.manager?.name ?? <Typography.Text type="secondary">—</Typography.Text> },
          { title: 'Roles', key: 'roles', width: 160, responsive: ['lg'], render: (_, p) => <Typography.Text type="secondary">{p.roles.join(', ')}</Typography.Text> },
          { title: 'Reports', dataIndex: 'directReports', width: 80, align: 'right', responsive: ['md'] },
        ]}
      />
      {openId && <PersonDrawer userId={openId} people={people ?? []} onClose={() => setOpenId(null)} onChanged={onChanged} onOpen={setOpenId} />}
    </Card>
  )
}

function PersonDrawer({ userId, people, onClose, onChanged, onOpen }: { userId: number; people: Person[]; onClose: () => void; onChanged: () => void; onOpen: (id: number) => void }) {
  const { message } = App.useApp()
  const { can } = useAuth()
  const canEdit = can(PERMISSIONS.USERS_UPDATE)
  const person = useFetch(useCallback(() => peopleService.get(userId), [userId]))
  const [editing, setEditing] = useState(false)
  const [form] = Form.useForm<{ jobTitle?: string; managerId?: number | null }>()
  const p = person.data

  const save = async () => {
    const v = await form.validateFields()
    try {
      await peopleService.update(userId, { jobTitle: v.jobTitle?.trim() || null, managerId: v.managerId ?? null })
      message.success('Saved')
      setEditing(false)
      person.reload()
      onChanged()
    } catch (err) {
      message.error(getErrorMessage(err))
    }
  }

  return (
    <Drawer
      open
      onClose={onClose}
      title={p?.name ?? ''}
      extra={
        canEdit &&
        p &&
        !editing && (
          <Button icon={<EditOutlined />} onClick={() => (form.setFieldsValue({ jobTitle: p.jobTitle ?? '', managerId: p.manager?.id ?? null }), setEditing(true))}>
            Edit
          </Button>
        )
      }
    >
      {!p ? null : editing ? (
        <Form form={form} layout="vertical">
          <Form.Item name="jobTitle" label="Job title" rules={[{ max: 100 }]}>
            <Input placeholder="e.g. Frontend developer" />
          </Form.Item>
          <Form.Item name="managerId" label="Manager" extra="The manager approves this person's leave.">
            <Select
              allowClear
              showSearch={{ optionFilterProp: 'label' }}
              placeholder="No manager"
              options={people.filter((x) => x.id !== p.id).map((x) => ({ value: x.id, label: x.name }))}
            />
          </Form.Item>
          <Space>
            <Button type="primary" onClick={save}>
              Save
            </Button>
            <Button onClick={() => setEditing(false)}>Cancel</Button>
          </Space>
        </Form>
      ) : (
        <>
          <Flex align="center" gap={12} style={{ marginBottom: 16 }}>
            <Avatar size={56} style={{ fontSize: 24 }}>
              {p.name.charAt(0).toUpperCase()}
            </Avatar>
            <div>
              <Typography.Title level={5} style={{ margin: 0 }}>
                {p.name}
              </Typography.Title>
              <Typography.Text type="secondary">{p.jobTitle ?? 'No job title'}</Typography.Text>
              {p.awayToday && <Tag style={{ marginLeft: 8 }}>🌴 away today</Tag>}
            </div>
          </Flex>
          <Descriptions
            column={1}
            size="small"
            items={[
              { key: 'email', label: 'Email', children: <Typography.Text copyable>{p.email}</Typography.Text> },
              { key: 'manager', label: 'Manager', children: p.manager ? <a onClick={() => onOpen(p.manager!.id)}>{p.manager.name}</a> : '—' },
              { key: 'teams', label: 'Teams', children: p.teams.length ? p.teams.map((t) => <Tag key={t.id} color={t.color}>{t.name}</Tag>) : '—' },
              { key: 'roles', label: 'Roles', children: p.roles.join(', ') || '—' },
              { key: 'joined', label: 'Joined', children: new Date(p.joinedAt).toLocaleDateString() },
            ]}
          />
          <Typography.Text strong style={{ display: 'block', margin: '16px 0 8px' }}>
            Direct reports ({p.reports.length})
          </Typography.Text>
          {p.reports.length ? (
            p.reports.map((r) => (
              <div key={r.id} style={{ marginBottom: 6 }}>
                <a onClick={() => onOpen(r.id)}>{r.name}</a>
                {r.jobTitle && <Typography.Text type="secondary"> · {r.jobTitle}</Typography.Text>}
              </div>
            ))
          ) : (
            <Typography.Text type="secondary">Nobody reports to {p.name.split(' ')[0]}.</Typography.Text>
          )}
        </>
      )}
    </Drawer>
  )
}

// ---------------------------------------------------------------- teams

function Teams({ teams, people, onChanged }: { teams: Team[] | null; people: Person[]; onChanged: () => void }) {
  const { message } = App.useApp()
  const { can } = useAuth()
  const canEdit = can(PERMISSIONS.USERS_UPDATE)
  const [editing, setEditing] = useState<Team | 'new' | null>(null)
  const [form] = Form.useForm<{ name: string; description?: string; color: string; leadId?: number | null; memberIds: number[] }>()

  const open = (t: Team | 'new') => {
    setEditing(t)
    form.setFieldsValue(
      t === 'new'
        ? { name: '', description: '', color: '#1677ff', leadId: null, memberIds: [] }
        : { name: t.name, description: t.description ?? '', color: t.color, leadId: t.lead?.id ?? null, memberIds: t.members.map((m) => m.id) },
    )
  }
  const save = async () => {
    const v = await form.validateFields()
    const data = { name: v.name, description: v.description || null, color: v.color, leadId: v.leadId ?? null }
    try {
      if (editing === 'new') await peopleService.createTeam({ ...data, memberIds: v.memberIds })
      else {
        await peopleService.updateTeam((editing as Team).id, data)
        await peopleService.setTeamMembers((editing as Team).id, v.memberIds)
      }
      message.success('Team saved')
      setEditing(null)
      onChanged()
    } catch (err) {
      message.error(getErrorMessage(err))
    }
  }
  const remove = async (t: Team) => {
    try {
      await peopleService.deleteTeam(t.id)
      onChanged()
    } catch (err) {
      message.error(getErrorMessage(err))
    }
  }

  const options = people.map((p) => ({ value: p.id, label: p.name }))
  return (
    <>
      {canEdit && (
        <Button type="primary" icon={<PlusOutlined />} onClick={() => open('new')} style={{ marginBottom: 16 }}>
          New team
        </Button>
      )}
      {teams && !teams.length && <Empty description="No teams yet — group people (Frontend, QA, Support …) to filter capacity and insights by team." />}
      <Row gutter={[16, 16]}>
        {(teams ?? []).map((t) => (
          <Col key={t.id} xs={24} md={12} xl={8}>
            <Card
              size="small"
              title={
                <Space>
                  <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 3, background: t.color }} />
                  {t.name}
                </Space>
              }
              extra={
                canEdit && (
                  <Space size={0}>
                    <Button type="text" size="small" icon={<EditOutlined />} onClick={() => open(t)} aria-label={`Edit ${t.name}`} />
                    <Popconfirm title={`Delete team "${t.name}"?`} description="People stay; only the team goes." okButtonProps={{ danger: true }} onConfirm={() => remove(t)}>
                      <Button type="text" size="small" danger icon={<DeleteOutlined />} aria-label={`Delete ${t.name}`} />
                    </Popconfirm>
                  </Space>
                )
              }
              style={{ height: '100%' }}
            >
              {t.description && <Typography.Paragraph type="secondary">{t.description}</Typography.Paragraph>}
              <Typography.Text type="secondary">Lead: </Typography.Text>
              <Typography.Text>{t.lead?.name ?? '—'}</Typography.Text>
              <Flex gap={6} wrap style={{ marginTop: 10 }}>
                {t.members.map((m) => (
                  <Tag key={m.id} icon={m.id === t.lead?.id ? <TeamOutlined /> : undefined}>
                    {m.name}
                  </Tag>
                ))}
                {!t.members.length && <Typography.Text type="secondary">No members</Typography.Text>}
              </Flex>
            </Card>
          </Col>
        ))}
      </Row>
      <Modal open={!!editing} title={editing === 'new' ? 'New team' : 'Edit team'} okText="Save" onOk={save} onCancel={() => setEditing(null)} forceRender>
        <Form form={form} layout="vertical">
          <Flex gap={12}>
            <Form.Item name="name" label="Name" rules={[{ required: true, max: 100 }]} style={{ flex: 1 }}>
              <Input placeholder="e.g. Frontend" />
            </Form.Item>
            <Form.Item name="color" label="Colour" getValueFromEvent={(c) => c.toHexString()}>
              <ColorPicker />
            </Form.Item>
          </Flex>
          <Form.Item name="description" label="Description">
            <Input />
          </Form.Item>
          <Form.Item name="leadId" label="Team lead">
            <Select allowClear showSearch={{ optionFilterProp: 'label' }} placeholder="No lead" options={options} />
          </Form.Item>
          <Form.Item name="memberIds" label="Members">
            <Select mode="multiple" showSearch={{ optionFilterProp: 'label' }} placeholder="Add people" options={options} />
          </Form.Item>
        </Form>
      </Modal>
    </>
  )
}

// ---------------------------------------------------------------- org chart

function OrgChart({ people }: { people: Person[] }) {
  // a tree from the "manager" of each person; people without a manager are the roots
  const treeData = useMemo(() => {
    const byManager = new Map<number | null, Person[]>()
    for (const p of people) byManager.set(p.manager?.id ?? null, [...(byManager.get(p.manager?.id ?? null) ?? []), p])
    const node = (p: Person, seen: Set<number>): { key: number; title: React.ReactNode; children: unknown[] } => ({
      key: p.id,
      title: (
        <span>
          <Typography.Text strong>{p.name}</Typography.Text>
          {p.jobTitle && <Typography.Text type="secondary"> · {p.jobTitle}</Typography.Text>}
          {p.teams.map((t) => (
            <Tag key={t.id} color={t.color} style={{ marginLeft: 6 }}>
              {t.name}
            </Tag>
          ))}
        </span>
      ),
      children: seen.has(p.id) ? [] : (byManager.get(p.id) ?? []).map((c) => node(c, new Set([...seen, p.id]))),
    })
    return (byManager.get(null) ?? []).map((p) => node(p, new Set()))
  }, [people])

  if (!people.length) return <Empty />
  return (
    <Card>
      <Typography.Paragraph type="secondary" style={{ marginTop: 0 }}>
        <ApartmentOutlined /> Built from each person's manager. People without a manager are at the top level.
      </Typography.Paragraph>
      <Tree showLine defaultExpandAll selectable={false} treeData={treeData as never} />
    </Card>
  )
}
