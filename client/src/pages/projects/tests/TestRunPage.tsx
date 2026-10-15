// /projects/:key/tests/runs/:runId — execute a test run.
// Left: every case of the run with its result. Right: the selected case — preconditions, steps with
// pass / fail / blocked per step, a comment, the overall result, and "File bug" for failures.
// Keyboard (when not typing): P pass · F fail · B blocked · S skip · J / K next / previous.
import {
  ArrowLeftOutlined,
  BugOutlined,
  CheckOutlined,
  CloseOutlined,
  DeleteOutlined,
  MinusCircleOutlined,
  StopOutlined,
  UndoOutlined,
} from '@ant-design/icons'
import { Alert, App, Breadcrumb, Button, Card, Col, Empty, Flex, Form, Input, Modal, Popconfirm, Row, Segmented, Select, Skeleton, Space, Tag, Typography, theme } from 'antd'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useFetch } from '../../../hooks/useFetch'
import { useLiveReload } from '../../../hooks/useRealtime'
import { getErrorMessage } from '../../../lib/api'
import { projectsService } from '../../../services/projects.service'
import { qaService, type BugDefaults } from '../../../services/qa.service'
import type { ResultStatus, StepResult, TestResult } from '../../../types/qa'
import { PRIORITIES, SEVERITIES } from '../shared/itemMeta'
import { StatusTag } from '../shared/ItemBits'
import { useProject } from '../shared/projectContext'
import { RESULT_LABELS, RESULT_TAG, describeSummary } from './qaMeta'
import { RunProgress } from './RunProgress'

const RESULT_ICONS: Record<ResultStatus, React.ReactNode> = {
  untested: <MinusCircleOutlined />,
  passed: <CheckOutlined />,
  failed: <CloseOutlined />,
  blocked: <StopOutlined />,
  skipped: <UndoOutlined />,
}

export default function TestRunPage() {
  const { project } = useProject()
  const { runId = '' } = useParams()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const { message } = App.useApp()
  const { token } = theme.useToken()
  const run = useFetch(useCallback(() => qaService.getRun(project.key, Number(runId)), [project.key, runId]))
  useLiveReload(project.id, run.reload, ['tests']) // several testers can execute the same run
  const [filter, setFilter] = useState<ResultStatus | 'all'>('all')
  const [filingBug, setFilingBug] = useState<TestResult | null>(null)

  const results = useMemo(() => run.data?.results ?? [], [run.data])
  const visible = filter === 'all' ? results : results.filter((r) => r.status === filter)
  const selectedId = Number(params.get('result')) || visible[0]?.id
  const selected = results.find((r) => r.id === selectedId) ?? null
  const editable = project.canEdit && run.data?.status === 'in_progress'

  const select = useCallback(
    (id: number) => {
      const next = new URLSearchParams(params)
      next.set('result', String(id))
      setParams(next, { replace: true })
    },
    [params, setParams],
  )

  const update = useCallback(
    async (result: TestResult, data: { status?: ResultStatus; stepResults?: StepResult[]; comment?: string | null }, advance = false) => {
      try {
        await qaService.updateResult(project.key, Number(runId), result.id, data)
        run.reload()
        if (advance) {
          const index = visible.findIndex((r) => r.id === result.id)
          const next = visible.slice(index + 1).find((r) => r.status === 'untested') ?? visible[index + 1]
          if (next) select(next.id)
        }
      } catch (err) {
        message.error(getErrorMessage(err))
      }
    },
    [project.key, runId, run, visible, select, message],
  )

  // keyboard shortcuts for fast execution
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      if (!selected || target.closest('input, textarea, [contenteditable="true"], .ant-select') || e.ctrlKey || e.metaKey || e.altKey) return
      const index = visible.findIndex((r) => r.id === selected.id)
      const key = e.key.toLowerCase()
      if (key === 'j' && visible[index + 1]) select(visible[index + 1]!.id)
      else if (key === 'k' && visible[index - 1]) select(visible[index - 1]!.id)
      else if (editable) {
        const status = ({ p: 'passed', f: 'failed', b: 'blocked', s: 'skipped' } as const)[key as 'p' | 'f' | 'b' | 's']
        if (status) void update(selected, { status }, status === 'passed' || status === 'skipped')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selected, visible, editable, select, update])

  if (run.error && !run.data) return <Alert type="error" showIcon title={run.error} />
  if (!run.data) return <Skeleton active paragraph={{ rows: 10 }} />
  const r = run.data

  const lifecycle = async (fn: () => Promise<unknown>, text: string) => {
    try {
      await fn()
      message.success(text)
      run.reload()
    } catch (err) {
      message.error(getErrorMessage(err))
    }
  }

  return (
    <>
      <Flex align="center" gap={8} wrap style={{ marginBottom: 12 }}>
        <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => navigate(`/projects/${project.key}/tests?tab=runs`)} aria-label="Back to runs" />
        <Breadcrumb items={[{ title: <Link to={`/projects/${project.key}/tests?tab=runs`}>Test runs</Link> }, { title: r.name }]} />
      </Flex>

      <Card style={{ marginBottom: 16 }}>
        <Flex gap={16} wrap align="center">
          <div style={{ flex: '1 1 300px' }}>
            <Flex align="center" gap={8} wrap>
              <Typography.Title level={4} style={{ margin: 0 }}>
                {r.name}
              </Typography.Title>
              {r.status === 'completed' ? <Tag>completed</Tag> : <Tag color="processing">in progress</Tag>}
            </Flex>
            <Typography.Text type="secondary">
              {[r.environment, r.buildVersion && `build ${r.buildVersion}`, r.sprint?.name].filter(Boolean).join(' · ') || 'No environment set'} · {describeSummary(r.summary)}
            </Typography.Text>
          </div>
          <div style={{ flex: '1 1 320px' }}>
            <RunProgress summary={r.summary} height={10} />
          </div>
          {project.canEdit && (
            <Space>
              {r.status === 'in_progress' ? (
                <Popconfirm
                  title="Complete this run?"
                  description={r.summary.untested ? `${r.summary.untested} case(s) are still untested.` : 'Results become read-only.'}
                  onConfirm={() => lifecycle(() => qaService.completeRun(project.key, r.id), 'Run completed')}
                >
                  <Button type="primary">Complete run</Button>
                </Popconfirm>
              ) : (
                <Button onClick={() => lifecycle(() => qaService.reopenRun(project.key, r.id), 'Run reopened')}>Reopen</Button>
              )}
              <Popconfirm
                title="Delete this run and its results?"
                okButtonProps={{ danger: true }}
                okText="Delete"
                onConfirm={async () => {
                  try {
                    await qaService.deleteRun(project.key, r.id)
                    navigate(`/projects/${project.key}/tests?tab=runs`, { replace: true })
                  } catch (err) {
                    message.error(getErrorMessage(err))
                  }
                }}
              >
                <Button danger icon={<DeleteOutlined />} aria-label="Delete run" />
              </Popconfirm>
            </Space>
          )}
        </Flex>
      </Card>

      <Row gutter={16}>
        <Col xs={24} lg={9}>
          <Card size="small" styles={{ body: { padding: 6 } }}>
            <Segmented
              block
              size="small"
              value={filter}
              onChange={(v) => setFilter(v as ResultStatus | 'all')}
              options={[
                { value: 'all', label: `All ${results.length}` },
                { value: 'untested', label: `To do ${r.summary.untested}` },
                { value: 'failed', label: `Failed ${r.summary.failed}` },
              ]}
              style={{ marginBottom: 6 }}
            />
            <div style={{ maxHeight: '65vh', overflowY: 'auto' }}>
              {visible.length === 0 && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Nothing here" />}
              {visible.map((res, i) => {
                const header = res.suiteName !== visible[i - 1]?.suiteName || i === 0
                return (
                  <div key={res.id}>
                    {header && (
                      <Typography.Text type="secondary" style={{ display: 'block', padding: '8px 8px 2px', fontSize: '0.78em', textTransform: 'uppercase' }}>
                        {res.suiteName ?? 'No suite'}
                      </Typography.Text>
                    )}
                    <Flex
                      align="center"
                      gap={8}
                      onClick={() => select(res.id)}
                      style={{
                        padding: '7px 8px',
                        borderRadius: 6,
                        cursor: 'pointer',
                        background: res.id === selected?.id ? token.colorPrimaryBg : undefined,
                      }}
                    >
                      <Tag color={RESULT_TAG[res.status]} icon={RESULT_ICONS[res.status]} style={{ marginInlineEnd: 0, minWidth: 82 }}>
                        {RESULT_LABELS[res.status]}
                      </Tag>
                      <Typography.Text type="secondary" style={{ fontSize: '0.85em' }}>
                        {res.caseKey}
                      </Typography.Text>
                      <Typography.Text ellipsis style={{ flex: 1, minWidth: 0 }}>
                        {res.title}
                      </Typography.Text>
                      {res.bug && <BugOutlined style={{ color: token.colorError }} title={`Bug ${res.bug.key}`} />}
                    </Flex>
                  </div>
                )
              })}
            </div>
          </Card>
        </Col>
        <Col xs={24} lg={15}>
          {selected ? (
            <Executor key={selected.id} result={selected} editable={editable} projectKey={project.key} onUpdate={update} onFileBug={() => setFilingBug(selected)} />
          ) : (
            <Card>
              <Empty description="Select a test case" />
            </Card>
          )}
        </Col>
      </Row>

      {filingBug && (
        <FileBugModal
          projectKey={project.key}
          result={filingBug}
          onClose={() => setFilingBug(null)}
          onFiled={async (data) => {
            const bug = await qaService.fileBug(project.key, r.id, filingBug.id, data)
            message.success(`${bug.key} filed`)
            setFilingBug(null)
            run.reload()
          }}
        />
      )}
    </>
  )
}

function Executor({
  result,
  editable,
  projectKey,
  onUpdate,
  onFileBug,
}: {
  result: TestResult
  editable: boolean
  projectKey: string
  onUpdate: (result: TestResult, data: { status?: ResultStatus; stepResults?: StepResult[]; comment?: string | null }, advance?: boolean) => Promise<void>
  onFileBug: () => void
}) {
  const { token } = theme.useToken()
  const [comment, setComment] = useState(result.comment ?? '')
  const stepResults = result.steps.map((_, i) => result.stepResults[i] ?? null)

  const setStep = (index: number, value: StepResult) => {
    const next = [...stepResults]
    next[index] = next[index] === value ? null : value
    void onUpdate(result, { stepResults: next })
  }

  return (
    <Card
      title={
        <Flex align="center" gap={8}>
          <Typography.Text type="secondary">{result.caseKey}</Typography.Text>
          <Typography.Text strong ellipsis>
            {result.title}
          </Typography.Text>
        </Flex>
      }
      extra={<Tag color={RESULT_TAG[result.status]}>{RESULT_LABELS[result.status]}</Tag>}
    >
      {result.preconditions && (
        <Alert type="info" title="Preconditions" description={<span style={{ whiteSpace: 'pre-wrap' }}>{result.preconditions}</span>} style={{ marginBottom: 16 }} />
      )}
      {result.steps.length === 0 && <Typography.Paragraph type="secondary">This case has no steps — judge it as a whole.</Typography.Paragraph>}
      <Flex vertical gap={8} style={{ marginBottom: 16 }}>
        {result.steps.map((step, i) => (
          <Flex
            key={i}
            gap={12}
            align="flex-start"
            style={{
              padding: 10,
              borderRadius: 8,
              border: `1px solid ${stepResults[i] === 'failed' ? token.colorErrorBorder : stepResults[i] === 'passed' ? token.colorSuccessBorder : token.colorBorderSecondary}`,
            }}
          >
            <Typography.Text strong style={{ width: 22 }}>
              {i + 1}.
            </Typography.Text>
            <div style={{ flex: 1 }}>
              <Typography.Paragraph style={{ marginBottom: 4, whiteSpace: 'pre-wrap' }}>{step.action}</Typography.Paragraph>
              {step.expected && (
                <Typography.Text type="secondary" style={{ whiteSpace: 'pre-wrap' }}>
                  Expected: {step.expected}
                </Typography.Text>
              )}
            </div>
            <Space.Compact>
              <Button size="small" type={stepResults[i] === 'passed' ? 'primary' : 'default'} icon={<CheckOutlined />} disabled={!editable} onClick={() => setStep(i, 'passed')} aria-label={`Step ${i + 1} passed`} />
              <Button size="small" danger={stepResults[i] === 'failed'} type={stepResults[i] === 'failed' ? 'primary' : 'default'} icon={<CloseOutlined />} disabled={!editable} onClick={() => setStep(i, 'failed')} aria-label={`Step ${i + 1} failed`} />
              <Button size="small" type={stepResults[i] === 'blocked' ? 'primary' : 'default'} icon={<StopOutlined />} disabled={!editable} onClick={() => setStep(i, 'blocked')} aria-label={`Step ${i + 1} blocked`} />
            </Space.Compact>
          </Flex>
        ))}
      </Flex>

      <Typography.Text strong>Actual result / notes</Typography.Text>
      <Input.TextArea
        value={comment}
        disabled={!editable}
        onChange={(e) => setComment(e.target.value)}
        onBlur={() => comment !== (result.comment ?? '') && onUpdate(result, { comment: comment || null })}
        autoSize={{ minRows: 2 }}
        placeholder="What did you see? (becomes the bug's actual result)"
        style={{ margin: '4px 0 16px' }}
      />

      <Flex gap={8} wrap align="center">
        <Button type="primary" icon={<CheckOutlined />} disabled={!editable} onClick={() => onUpdate(result, { status: 'passed' }, true)}>
          Pass <Typography.Text keyboard style={{ color: 'inherit' }}>P</Typography.Text>
        </Button>
        <Button danger icon={<CloseOutlined />} disabled={!editable} onClick={() => onUpdate(result, { status: 'failed' })}>
          Fail <Typography.Text keyboard>F</Typography.Text>
        </Button>
        <Button icon={<StopOutlined />} disabled={!editable} onClick={() => onUpdate(result, { status: 'blocked' })}>
          Blocked <Typography.Text keyboard>B</Typography.Text>
        </Button>
        <Button icon={<UndoOutlined />} disabled={!editable} onClick={() => onUpdate(result, { status: 'skipped' }, true)}>
          Skip <Typography.Text keyboard>S</Typography.Text>
        </Button>
        {result.status !== 'untested' && editable && (
          <Button type="link" onClick={() => onUpdate(result, { status: 'untested', stepResults: [] })}>
            Reset
          </Button>
        )}
        <div style={{ flex: 1 }} />
        {result.bug ? (
          <Space>
            <BugOutlined style={{ color: token.colorError }} />
            <Link to={`/projects/${projectKey}/items/${result.bug.number}`}>{result.bug.key}</Link>
            <StatusTag status={result.bug.status} />
          </Space>
        ) : (
          (result.status === 'failed' || result.status === 'blocked') &&
          editable && (
            <Button danger type="dashed" icon={<BugOutlined />} onClick={onFileBug}>
              File bug
            </Button>
          )
        )}
      </Flex>
      {result.executedBy && (
        <Typography.Paragraph type="secondary" style={{ marginTop: 12, marginBottom: 0, fontSize: '0.85em' }}>
          {RESULT_LABELS[result.status]} by {result.executedBy.name}
          {result.executedAt && ` · ${new Date(result.executedAt).toLocaleString()}`}
        </Typography.Paragraph>
      )}
    </Card>
  )
}

function FileBugModal({ projectKey, result, onClose, onFiled }: { projectKey: string; result: TestResult; onClose: () => void; onFiled: (data: BugDefaults) => Promise<void> }) {
  const { message } = App.useApp()
  const [form] = Form.useForm<BugDefaults>()
  const [busy, setBusy] = useState(false)
  const people = useFetch(useCallback(() => projectsService.assignableUsers(projectKey), [projectKey]))

  const submit = async () => {
    const v = await form.validateFields()
    setBusy(true)
    try {
      await onFiled({ ...v, assigneeId: v.assigneeId ?? null })
    } catch (err) {
      message.error(getErrorMessage(err))
      setBusy(false)
    }
  }

  return (
    <Modal open title={`File a bug for ${result.caseKey}`} okText="File bug" okButtonProps={{ danger: true }} confirmLoading={busy} onOk={submit} onCancel={onClose}>
      <Typography.Paragraph type="secondary">
        Steps to reproduce, expected and actual result, environment and version are filled in from the test and this run.
      </Typography.Paragraph>
      <Form form={form} layout="vertical" initialValues={{ title: `[${result.caseKey}] ${result.title} fails`, priority: 'high', severity: 'major' }}>
        <Form.Item name="title" label="Title" rules={[{ required: true, max: 500 }]}>
          <Input />
        </Form.Item>
        <Flex gap={12}>
          <Form.Item name="severity" label="Severity" style={{ flex: 1 }}>
            <Select options={SEVERITIES.map((s) => ({ value: s.value, label: s.label }))} />
          </Form.Item>
          <Form.Item name="priority" label="Priority" style={{ flex: 1 }}>
            <Select options={PRIORITIES.map((p) => ({ value: p.value, label: p.label }))} />
          </Form.Item>
        </Flex>
        <Form.Item name="assigneeId" label="Assignee">
          <Select allowClear showSearch={{ optionFilterProp: 'label' }} placeholder="Unassigned" options={(people.data ?? []).map((u) => ({ value: u.id, label: u.name }))} />
        </Form.Item>
      </Form>
    </Modal>
  )
}
