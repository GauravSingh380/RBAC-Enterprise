// Test case library: suites on the left, cases on the right, drawer to create / edit.
import { DeleteOutlined, EditOutlined, FolderOutlined, PlusOutlined } from '@ant-design/icons'
import { App, Button, Card, Col, Empty, Flex, Input, Menu, Modal, Popconfirm, Row, Select, Space, Table, Tag, Tooltip, Typography } from 'antd'
import { useCallback, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useFetch } from '../../../hooks/useFetch'
import { getErrorMessage } from '../../../lib/api'
import { qaService } from '../../../services/qa.service'
import type { ProjectDetail } from '../../../types/projects'
import type { CaseStatus, TestCase, TestSuite } from '../../../types/qa'
import { CaseDrawer } from './CaseDrawer'
import { CASE_PRIORITIES, CASE_STATUSES, CASE_TYPES, RESULT_LABELS, RESULT_TAG } from './qaMeta'

export function TestCasesView({ project }: { project: ProjectDetail }) {
  const { message } = App.useApp()
  const [params, setParams] = useSearchParams()
  const [suite, setSuite] = useState<number | 'none' | 'all'>('all')
  const [status, setStatus] = useState<CaseStatus | undefined>()
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [newSuite, setNewSuite] = useState('')
  const openNumber = params.get('case') // ?case=12 opens TC-12
  const [creating, setCreating] = useState(false)
  const [renaming, setRenaming] = useState<{ suite: TestSuite; name: string } | null>(null)

  const suites = useFetch(useCallback(() => qaService.suites(project.key), [project.key]))
  const cases = useFetch(
    useCallback(
      () => qaService.cases(project.key, { suiteId: suite === 'all' ? undefined : suite, status, search: search || undefined, page, limit: 50 }),
      [project.key, suite, status, search, page],
    ),
  )
  const reload = () => {
    cases.reload()
    suites.reload()
  }
  const openCase = (n: number | null) => {
    const next = new URLSearchParams(params)
    if (n) next.set('case', String(n))
    else next.delete('case')
    setParams(next, { replace: true })
  }

  const suiteAction = async (fn: () => Promise<unknown>) => {
    try {
      await fn()
      reload()
    } catch (err) {
      message.error(getErrorMessage(err))
    }
  }

  const label = (text: string, count?: number) => (
    <Flex justify="space-between" gap={8}>
      <Typography.Text ellipsis>{text}</Typography.Text>
      {count !== undefined && <Typography.Text type="secondary">{count}</Typography.Text>}
    </Flex>
  )

  return (
    <Row gutter={16}>
      <Col xs={24} md={7} lg={6}>
        <Card size="small" title="Suites" styles={{ body: { padding: 4 } }}>
          <Menu
            mode="inline"
            style={{ borderInlineEnd: 0 }}
            selectedKeys={[String(suite)]}
            onClick={({ key }) => {
              setSuite(key === 'all' || key === 'none' ? key : Number(key))
              setPage(1)
            }}
            items={[
              { key: 'all', label: label('All cases') },
              ...(suites.data ?? []).map((s) => ({
                key: String(s.id),
                icon: <FolderOutlined />,
                label: (
                  <Flex justify="space-between" align="center" gap={4} className="suite-row">
                    <Typography.Text ellipsis style={{ flex: 1 }}>
                      {s.name}
                    </Typography.Text>
                    <Typography.Text type="secondary">{s.caseCount}</Typography.Text>
                    {project.canEdit && (
                      <Space size={0} onClick={(e) => e.stopPropagation()}>
                        <Tooltip title="Rename">
                          <Button
                            type="text"
                            size="small"
                            icon={<EditOutlined />}
                            onClick={() => setRenaming({ suite: s, name: s.name })}
                          />
                        </Tooltip>
                        <Popconfirm title={`Delete suite "${s.name}"?`} description="Its cases are kept (without a suite)." okButtonProps={{ danger: true }} onConfirm={() => suiteAction(() => qaService.deleteSuite(project.key, s.id))}>
                          <Button type="text" size="small" danger icon={<DeleteOutlined />} />
                        </Popconfirm>
                      </Space>
                    )}
                  </Flex>
                ),
              })),
              { key: 'none', label: label('No suite') },
            ]}
          />
          {project.canEdit && (
            <Space.Compact style={{ width: '100%', padding: 8 }}>
              <Input
                size="small"
                placeholder="New suite"
                value={newSuite}
                onChange={(e) => setNewSuite(e.target.value)}
                onPressEnter={() => newSuite.trim() && suiteAction(() => qaService.createSuite(project.key, { name: newSuite.trim() })).then(() => setNewSuite(''))}
              />
              <Button size="small" icon={<PlusOutlined />} disabled={!newSuite.trim()} onClick={() => suiteAction(() => qaService.createSuite(project.key, { name: newSuite.trim() })).then(() => setNewSuite(''))} />
            </Space.Compact>
          )}
        </Card>
      </Col>
      <Col xs={24} md={17} lg={18}>
        <Card size="small">
          <Flex gap={8} wrap align="center" style={{ marginBottom: 12 }}>
            <Input.Search placeholder="Search title or TC-12" allowClear onSearch={(v) => (setSearch(v.trim()), setPage(1))} style={{ width: 240 }} />
            <Select allowClear placeholder="Status" style={{ width: 140 }} value={status} onChange={(v) => (setStatus(v), setPage(1))} options={CASE_STATUSES.map((s) => ({ value: s.value, label: s.label }))} />
            <div style={{ flex: 1 }} />
            {project.canEdit && (
              <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreating(true)}>
                New test case
              </Button>
            )}
          </Flex>
          <Table<TestCase>
            rowKey="id"
            size="middle"
            loading={cases.loading}
            dataSource={cases.data?.items}
            onRow={(c) => ({ onClick: () => openCase(c.number), style: { cursor: 'pointer' } })}
            pagination={{ current: page, pageSize: 50, total: cases.data?.total, onChange: setPage, showSizeChanger: false }}
            locale={{
              emptyText: (
                <Empty description={search || status ? 'No test cases match' : 'No test cases yet'}>
                  {project.canEdit && !search && !status && (
                    <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreating(true)}>
                      Write the first test case
                    </Button>
                  )}
                </Empty>
              ),
            }}
            columns={[
              { title: 'Key', dataIndex: 'key', width: 80, render: (k: string) => <Typography.Text type="secondary">{k}</Typography.Text> },
              {
                title: 'Title',
                dataIndex: 'title',
                render: (t: string, c) => (
                  <Flex vertical>
                    <Typography.Text style={{ opacity: c.status === 'deprecated' ? 0.55 : 1 }}>{t}</Typography.Text>
                    {(c.suite || c.workItem) && (
                      <Typography.Text type="secondary" style={{ fontSize: '0.82em' }}>
                        {c.suite?.name}
                        {c.suite && c.workItem && ' · '}
                        {c.workItem && (
                          <Link to={`/projects/${project.key}/items/${c.workItem.key.split('-').pop()}`} onClick={(e) => e.stopPropagation()}>
                            covers {c.workItem.key}
                          </Link>
                        )}
                      </Typography.Text>
                    )}
                  </Flex>
                ),
              },
              { title: 'Steps', key: 'steps', width: 70, align: 'right', render: (_, c) => c.steps.length, responsive: ['lg'] },
              {
                title: 'Priority',
                dataIndex: 'priority',
                width: 100,
                responsive: ['md'],
                render: (p: string) => {
                  const meta = CASE_PRIORITIES.find((x) => x.value === p)!
                  return <Tag color={meta.color}>{meta.label}</Tag>
                },
              },
              { title: 'Type', dataIndex: 'caseType', width: 110, responsive: ['xl'], render: (t: string) => CASE_TYPES.find((x) => x.value === t)?.label },
              {
                title: 'Status',
                dataIndex: 'status',
                width: 100,
                render: (s: string) => {
                  const meta = CASE_STATUSES.find((x) => x.value === s)!
                  return <Tag color={meta.color}>{meta.label}</Tag>
                },
              },
              {
                title: 'Last result',
                key: 'last',
                width: 120,
                render: (_, c) =>
                  c.lastResult ? (
                    <Tooltip title={`${c.lastResult.runName}${c.lastResult.executedAt ? ' · ' + new Date(c.lastResult.executedAt).toLocaleString() : ''}`}>
                      <Tag color={RESULT_TAG[c.lastResult.status]}>{RESULT_LABELS[c.lastResult.status]}</Tag>
                    </Tooltip>
                  ) : (
                    <Typography.Text type="secondary">not run</Typography.Text>
                  ),
              },
            ]}
          />
        </Card>
      </Col>

      <Modal
        open={!!renaming}
        title="Rename suite"
        okText="Save"
        okButtonProps={{ disabled: !renaming?.name.trim() }}
        onCancel={() => setRenaming(null)}
        onOk={() =>
          renaming && suiteAction(() => qaService.updateSuite(project.key, renaming.suite.id, { name: renaming.name.trim() })).then(() => setRenaming(null))
        }
        destroyOnHidden
      >
        <Input autoFocus maxLength={100} value={renaming?.name} onChange={(e) => renaming && setRenaming({ ...renaming, name: e.target.value })} />
      </Modal>

      {(creating || openNumber) && (
        <CaseDrawer
          key={openNumber ?? 'new'}
          project={project}
          suites={suites.data ?? []}
          number={creating ? null : Number(openNumber)}
          defaultSuiteId={typeof suite === 'number' ? suite : undefined}
          onClose={() => (creating ? setCreating(false) : openCase(null))}
          onSaved={reload}
        />
      )}
    </Row>
  )
}
