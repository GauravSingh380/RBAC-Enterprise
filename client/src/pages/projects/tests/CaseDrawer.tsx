// Create / edit a test case: title, suite, covered item, preconditions and numbered steps (action + expected).
import { ArrowDownOutlined, ArrowUpOutlined, DeleteOutlined, PlusOutlined } from '@ant-design/icons'
import { App, Button, Col, Drawer, Empty, Flex, Form, Input, Popconfirm, Row, Select, Space, Table, Tabs, Tag, Typography } from 'antd'
import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useFetch } from '../../../hooks/useFetch'
import { getErrorMessage } from '../../../lib/api'
import { workItemsService } from '../../../services/projects.service'
import { qaService, type TestCaseInput } from '../../../services/qa.service'
import type { ProjectDetail, WorkItemSummary } from '../../../types/projects'
import type { CasePriority, CaseStatus, CaseType, TestStep, TestSuite } from '../../../types/qa'
import { CASE_PRIORITIES, CASE_STATUSES, CASE_TYPES, RESULT_LABELS, RESULT_TAG } from './qaMeta'

interface Values {
  title: string
  suiteId?: number | null
  workItemRef?: string | null
  preconditions?: string
  steps: TestStep[]
  priority: CasePriority
  caseType: CaseType
  status: CaseStatus
}

interface Props {
  project: ProjectDetail
  suites: TestSuite[]
  /** case number to edit, or null for a new case */
  number: number | null
  defaultSuiteId?: number
  onClose: () => void
  onSaved: () => void
}

export function CaseDrawer({ project, suites, number, defaultSuiteId, onClose, onSaved }: Props) {
  const { message } = App.useApp()
  const [form] = Form.useForm<Values>()
  const [saving, setSaving] = useState(false)
  const [itemSearch, setItemSearch] = useState('')
  const [items, setItems] = useState<WorkItemSummary[]>([])
  const existing = useFetch(useCallback(() => (number ? qaService.getCase(project.key, number) : Promise.resolve(null)), [project.key, number]))
  const tc = existing.data
  const canEdit = project.canEdit

  // stories / tasks to link (search within the project)
  useEffect(() => {
    let alive = true
    const timer = setTimeout(() => {
      workItemsService.list(project.key, { search: itemSearch || undefined, types: 'story,task,epic,bug', limit: 20, sort: 'updated' }).then(
        (r) => alive && setItems(r.items),
        () => undefined,
      )
    }, 250)
    return () => {
      alive = false
      clearTimeout(timer)
    }
  }, [project.key, itemSearch])

  const submit = async () => {
    const v = await form.validateFields()
    setSaving(true)
    const data: TestCaseInput = {
      title: v.title,
      suiteId: v.suiteId ?? null,
      workItemRef: v.workItemRef ?? null,
      preconditions: v.preconditions?.trim() || null,
      steps: (v.steps ?? []).filter((s) => s?.action?.trim()).map((s) => ({ action: s.action.trim(), expected: (s.expected ?? '').trim() })),
      priority: v.priority,
      caseType: v.caseType,
      status: v.status,
    }
    try {
      if (number) await qaService.updateCase(project.key, number, data)
      else await qaService.createCase(project.key, { ...data, title: v.title })
      message.success(number ? `TC-${number} saved` : 'Test case created')
      onSaved()
      onClose()
    } catch (err) {
      message.error(getErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  const remove = async () => {
    try {
      await qaService.deleteCase(project.key, number!)
      message.success(`TC-${number} deleted (past runs keep their copy)`)
      onSaved()
      onClose()
    } catch (err) {
      message.error(getErrorMessage(err))
    }
  }

  const ready = !number || tc
  const initial: Partial<Values> = tc
    ? {
        title: tc.title,
        suiteId: tc.suite?.id ?? null,
        workItemRef: tc.workItem?.key ?? null,
        preconditions: tc.preconditions ?? undefined,
        steps: tc.steps.length ? tc.steps : [{ action: '', expected: '' }],
        priority: tc.priority,
        caseType: tc.caseType,
        status: tc.status,
      }
    : { suiteId: defaultSuiteId ?? null, steps: [{ action: '', expected: '' }], priority: 'medium', caseType: 'functional', status: 'ready' }

  const editor = ready && (
    <Form<Values> form={form} layout="vertical" initialValues={initial} disabled={!canEdit} requiredMark="optional">
      <Form.Item name="title" label="Title" rules={[{ required: true, whitespace: true, max: 500 }]}>
        <Input placeholder="e.g. Login with a valid password" autoFocus={!number} />
      </Form.Item>
      <Row gutter={12}>
        <Col xs={24} sm={12}>
          <Form.Item name="suiteId" label="Suite">
            <Select allowClear placeholder="No suite" options={suites.map((s) => ({ value: s.id, label: s.name }))} />
          </Form.Item>
        </Col>
        <Col xs={24} sm={12}>
          <Form.Item name="workItemRef" label="Covers (story / requirement)">
            <Select
              allowClear
              showSearch
              filterOption={false}
              onSearch={setItemSearch}
              placeholder="Search items"
              options={[
                ...(tc?.workItem && !items.some((i) => i.key === tc.workItem!.key) ? [{ value: tc.workItem.key, label: `${tc.workItem.key} · ${tc.workItem.title}` }] : []),
                ...items.map((i) => ({ value: i.key, label: `${i.key} · ${i.title}` })),
              ]}
            />
          </Form.Item>
        </Col>
        <Col xs={8}>
          <Form.Item name="priority" label="Priority">
            <Select options={CASE_PRIORITIES.map((p) => ({ value: p.value, label: p.label }))} />
          </Form.Item>
        </Col>
        <Col xs={8}>
          <Form.Item name="caseType" label="Type">
            <Select options={CASE_TYPES} />
          </Form.Item>
        </Col>
        <Col xs={8}>
          <Form.Item name="status" label="Status" tooltip="Only READY cases are added to new runs">
            <Select options={CASE_STATUSES.map((s) => ({ value: s.value, label: s.label }))} />
          </Form.Item>
        </Col>
      </Row>
      <Form.Item name="preconditions" label="Preconditions">
        <Input.TextArea autoSize={{ minRows: 2 }} placeholder="e.g. A registered user with an active subscription" />
      </Form.Item>

      <Typography.Text strong>Steps</Typography.Text>
      <Form.List name="steps">
        {(fields, { add, remove: removeStep, move }) => (
          <Flex vertical gap={8} style={{ marginTop: 8 }}>
            {fields.map((field, index) => (
              <Flex key={field.key} gap={8} align="flex-start">
                <Typography.Text type="secondary" style={{ width: 22, paddingTop: 5, textAlign: 'right' }}>
                  {index + 1}.
                </Typography.Text>
                <Form.Item name={[field.name, 'action']} style={{ flex: 1, marginBottom: 0 }} rules={[{ max: 2000 }]}>
                  <Input.TextArea autoSize placeholder="Action — what the tester does" />
                </Form.Item>
                <Form.Item name={[field.name, 'expected']} style={{ flex: 1, marginBottom: 0 }} rules={[{ max: 2000 }]}>
                  <Input.TextArea autoSize placeholder="Expected result" />
                </Form.Item>
                {canEdit && (
                  <Space size={0}>
                    <Button type="text" size="small" icon={<ArrowUpOutlined />} disabled={index === 0} onClick={() => move(index, index - 1)} aria-label="Move up" />
                    <Button type="text" size="small" icon={<ArrowDownOutlined />} disabled={index === fields.length - 1} onClick={() => move(index, index + 1)} aria-label="Move down" />
                    <Button type="text" size="small" danger icon={<DeleteOutlined />} onClick={() => removeStep(field.name)} aria-label="Remove step" />
                  </Space>
                )}
              </Flex>
            ))}
            {canEdit && (
              <Button type="dashed" icon={<PlusOutlined />} onClick={() => add({ action: '', expected: '' })}>
                Add step
              </Button>
            )}
          </Flex>
        )}
      </Form.List>
    </Form>
  )

  return (
    <Drawer
      open
      size="large"
      onClose={onClose}
      title={number ? `${tc?.key ?? `TC-${number}`} ${tc ? '· ' + tc.title : ''}` : 'New test case'}
      extra={
        canEdit && (
          <Space>
            {number && (
              <Popconfirm title="Delete this test case?" description="Past runs keep their copy." okButtonProps={{ danger: true }} okText="Delete" onConfirm={remove}>
                <Button danger icon={<DeleteOutlined />}>
                  Delete
                </Button>
              </Popconfirm>
            )}
            <Button type="primary" loading={saving} onClick={submit}>
              {number ? 'Save' : 'Create'}
            </Button>
          </Space>
        )
      }
    >
      {number && tc ? (
        <Tabs
          items={[
            { key: 'case', label: 'Case', children: editor },
            {
              key: 'history',
              label: `History (${tc.history.length})`,
              children: tc.history.length ? (
                <Table
                  size="small"
                  rowKey="id"
                  dataSource={tc.history}
                  pagination={false}
                  columns={[
                    { title: 'Run', dataIndex: 'runName', render: (v: string, h) => <Link to={`/projects/${project.key}/tests/runs/${h.runId}?result=${h.id}`}>{v}</Link> },
                    { title: 'Result', dataIndex: 'status', width: 100, render: (v: keyof typeof RESULT_LABELS) => <Tag color={RESULT_TAG[v]}>{RESULT_LABELS[v]}</Tag> },
                    { title: 'By', key: 'by', width: 130, render: (_, h) => h.executedBy?.name ?? '—' },
                    { title: 'When', dataIndex: 'executedAt', width: 170, render: (v: string | null) => (v ? new Date(v).toLocaleString() : '—') },
                    { title: 'Bug', key: 'bug', width: 100, render: (_, h) => (h.bug ? <Link to={`/projects/${project.key}/items/${h.bug.key.split('-').pop()}`}>{h.bug.key}</Link> : '—') },
                  ]}
                />
              ) : (
                <Empty description="Not executed in any run yet" />
              ),
            },
          ]}
        />
      ) : (
        editor
      )}
    </Drawer>
  )
}
