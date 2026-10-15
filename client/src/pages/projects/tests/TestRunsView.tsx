// Test runs of a project + "New run" (all ready cases, some suites, or picked cases).
import { PlayCircleOutlined, PlusOutlined } from '@ant-design/icons'
import { App, Button, Card, Col, Empty, Form, Input, Modal, Radio, Row, Select, Table, Tag, Typography } from 'antd'
import { useCallback, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useFetch } from '../../../hooks/useFetch'
import { useLiveReload } from '../../../hooks/useRealtime'
import { getErrorMessage } from '../../../lib/api'
import { sprintsService } from '../../../services/projects.service'
import { qaService } from '../../../services/qa.service'
import type { ProjectDetail } from '../../../types/projects'
import type { TestRun } from '../../../types/qa'
import { RunProgress } from './RunProgress'

export function TestRunsView({ project }: { project: ProjectDetail }) {
  const navigate = useNavigate()
  const runs = useFetch(useCallback(() => qaService.runs(project.key), [project.key]))
  const [creating, setCreating] = useState(false)
  useLiveReload(project.id, runs.reload, ['tests'])
  const open = (r: TestRun) => navigate(`/projects/${project.key}/tests/runs/${r.id}`)

  return (
    <Card size="small">
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        {project.canEdit && (
          <Button type="primary" icon={<PlayCircleOutlined />} onClick={() => setCreating(true)}>
            New test run
          </Button>
        )}
      </div>
      <Table<TestRun>
        rowKey="id"
        loading={runs.loading}
        dataSource={runs.data ?? []}
        pagination={false}
        onRow={(r) => ({ onClick: () => open(r), style: { cursor: 'pointer' } })}
        locale={{ emptyText: <Empty description="No test runs yet — a run executes a set of test cases, e.g. a release regression." /> }}
        columns={[
          {
            title: 'Run',
            dataIndex: 'name',
            render: (n: string, r) => (
              <div>
                <Typography.Text strong>{n}</Typography.Text>
                <br />
                <Typography.Text type="secondary" style={{ fontSize: '0.82em' }}>
                  {[r.environment, r.buildVersion && `build ${r.buildVersion}`, r.sprint?.name].filter(Boolean).join(' · ') || '—'}
                </Typography.Text>
              </div>
            ),
          },
          { title: 'Progress', key: 'progress', width: 300, render: (_, r) => <RunProgress summary={r.summary} /> },
          {
            title: 'Pass rate',
            key: 'rate',
            width: 100,
            align: 'right',
            render: (_, r) => (r.summary.passRate !== null ? `${r.summary.passRate}%` : '—'),
          },
          {
            title: 'Status',
            dataIndex: 'status',
            width: 120,
            render: (s: string) => (s === 'completed' ? <Tag>completed</Tag> : <Tag color="processing">in progress</Tag>),
          },
          { title: 'Created', key: 'created', width: 170, responsive: ['lg'], render: (_, r) => `${new Date(r.createdAt).toLocaleDateString()} · ${r.createdBy?.name ?? ''}` },
        ]}
      />
      {creating && <CreateRunModal project={project} onClose={() => setCreating(false)} onCreated={(id) => navigate(`/projects/${project.key}/tests/runs/${id}`)} />}
    </Card>
  )
}

interface RunForm {
  name: string
  environment?: string
  buildVersion?: string
  sprintId?: number
  scope: 'all' | 'suites' | 'cases'
  suiteIds?: number[]
  caseIds?: number[]
}

function CreateRunModal({ project, onClose, onCreated }: { project: ProjectDetail; onClose: () => void; onCreated: (id: number) => void }) {
  const { message } = App.useApp()
  const [form] = Form.useForm<RunForm>()
  const [busy, setBusy] = useState(false)
  const scope = Form.useWatch('scope', form) ?? 'all'
  const suites = useFetch(useCallback(() => qaService.suites(project.key), [project.key]))
  const cases = useFetch(useCallback(() => qaService.cases(project.key, { status: 'ready', limit: 500 }), [project.key]))
  const sprints = useFetch(useCallback(() => sprintsService.list(project.key, 'open'), [project.key]))

  const submit = async () => {
    const v = await form.validateFields()
    setBusy(true)
    try {
      const run = await qaService.createRun(project.key, {
        name: v.name,
        environment: v.environment || null,
        buildVersion: v.buildVersion || null,
        sprintId: v.sprintId ?? null,
        scope: v.scope === 'all' ? { all: true } : v.scope === 'suites' ? { suiteIds: v.suiteIds } : { caseIds: v.caseIds },
      })
      message.success(`Run created with ${run.results.length} test case(s)`)
      onCreated(run.id)
    } catch (err) {
      message.error(getErrorMessage(err))
      setBusy(false)
    }
  }

  return (
    <Modal open title="New test run" okText="Create run" okButtonProps={{ icon: <PlusOutlined /> }} confirmLoading={busy} onOk={submit} onCancel={onClose} width={620}>
      <Form<RunForm> form={form} layout="vertical" initialValues={{ scope: 'all' }} requiredMark="optional">
        <Form.Item name="name" label="Name" rules={[{ required: true, max: 150 }]}>
          <Input autoFocus placeholder="e.g. Release 2.4 regression" />
        </Form.Item>
        <Row gutter={12}>
          <Col xs={24} sm={12}>
            <Form.Item name="environment" label="Environment" extra="Copied into bugs filed from this run">
              <Input placeholder="e.g. staging · Chrome 128" maxLength={255} />
            </Form.Item>
          </Col>
          <Col xs={12} sm={6}>
            <Form.Item name="buildVersion" label="Build / version">
              <Input placeholder="2.4.0" maxLength={50} />
            </Form.Item>
          </Col>
          <Col xs={12} sm={6}>
            <Form.Item name="sprintId" label="Sprint">
              <Select allowClear placeholder="None" options={(sprints.data ?? []).map((s) => ({ value: s.id, label: s.name }))} />
            </Form.Item>
          </Col>
        </Row>
        <Form.Item name="scope" label="Test cases (only READY cases are included)">
          <Radio.Group
            options={[
              { value: 'all', label: `All ready cases (${cases.data?.total ?? '…'})` },
              { value: 'suites', label: 'Suites' },
              { value: 'cases', label: 'Pick cases' },
            ]}
          />
        </Form.Item>
        {scope === 'suites' && (
          <Form.Item name="suiteIds" rules={[{ required: true, message: 'Choose at least one suite' }]}>
            <Select mode="multiple" placeholder="Suites" options={(suites.data ?? []).map((s) => ({ value: s.id, label: `${s.name} (${s.caseCount})` }))} />
          </Form.Item>
        )}
        {scope === 'cases' && (
          <Form.Item name="caseIds" rules={[{ required: true, message: 'Choose at least one case' }]}>
            <Select
              mode="multiple"
              placeholder="Search cases"
              optionFilterProp="label"
              options={(cases.data?.items ?? []).map((c) => ({ value: c.id, label: `${c.key} · ${c.title}` }))}
            />
          </Form.Item>
        )}
      </Form>
    </Modal>
  )
}
