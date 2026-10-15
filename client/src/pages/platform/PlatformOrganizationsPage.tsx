import { CheckCircleOutlined, PauseCircleOutlined, ReloadOutlined } from '@ant-design/icons'
import { Alert, App, Avatar, Badge, Button, Card, Flex, Input, Popconfirm, Select, Table, Tooltip, Typography, type TableProps } from 'antd'
import { useCallback, useState } from 'react'
import { PageHeader } from '../../components/ui'
import { useFetch } from '../../hooks/useFetch'
import { getErrorMessage } from '../../lib/api'
import { plansService, platformService } from '../../services/platform.service'
import type { PlatformOrganization } from '../../types'

export default function PlatformOrganizationsPage() {
  const { message } = App.useApp()
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [search, setSearch] = useState('')
  const orgs = useFetch(useCallback(() => platformService.organizations({ page, limit: pageSize, search }), [page, pageSize, search]))
  const plans = useFetch(useCallback(() => plansService.list(), []))

  const update = async (org: PlatformOrganization, data: { status?: 'active' | 'suspended'; plan?: string }, text: string) => {
    try {
      await platformService.updateOrganization(org.id, data)
      message.success(text)
      orgs.reload()
    } catch (err) {
      message.error(getErrorMessage(err))
    }
  }

  const columns: TableProps<PlatformOrganization>['columns'] = [
    {
      title: 'Organization',
      key: 'org',
      render: (_, o) => (
        <Flex align="center" gap={12}>
          <Avatar shape="square">{o.name.charAt(0).toUpperCase()}</Avatar>
          <div>
            <Typography.Text strong>{o.name}</Typography.Text>
            <br />
            <Typography.Text type="secondary" code>
              {o.slug}
            </Typography.Text>
          </div>
        </Flex>
      ),
    },
    {
      title: 'Owners',
      dataIndex: 'owners',
      responsive: ['md'],
      render: (owners: string[]) => owners.join(', ') || '—',
    },
    {
      title: 'Usage',
      key: 'usage',
      responsive: ['md'],
      // used / plan limit (∞ = unlimited); red when the limit is reached
      render: (_, o) => (
        <Flex vertical style={{ fontSize: '0.85em' }}>
          {(
            [
              ['Members', o.memberCount - o.guestCount, o.limits.members],
              ['Guests', o.guestCount, o.limits.guests],
              ['Projects', o.projectCount, o.limits.projects],
            ] as const
          ).map(([label, used, max]) => (
            <Typography.Text key={label} type={max !== null && used >= max ? 'danger' : undefined}>
              {label} {used} / {max ?? '∞'}
            </Typography.Text>
          ))}
        </Flex>
      ),
    },
    {
      title: 'Plan',
      key: 'plan',
      width: 150,
      render: (_, o) => (
        <Select
          size="small"
          value={o.plan}
          style={{ width: 120 }}
          loading={!plans.data}
          options={(plans.data ?? []).map((p) => ({ value: p.key, label: p.name }))}
          onChange={(plan) => update(o, { plan }, `${o.name} moved to ${plan}`)}
        />
      ),
    },
    {
      title: 'Status',
      dataIndex: 'status',
      render: (status: string) => <Badge status={status === 'active' ? 'success' : 'error'} text={status} />,
    },
    { title: 'Created', dataIndex: 'createdAt', responsive: ['lg'], render: (v: string) => new Date(v).toLocaleDateString() },
    {
      title: '',
      key: 'actions',
      align: 'right',
      render: (_, o) =>
        o.status === 'active' ? (
          <Popconfirm
            title={`Suspend ${o.name}?`}
            description="All its members lose access immediately. Data is kept."
            okText="Suspend"
            okButtonProps={{ danger: true }}
            onConfirm={() => update(o, { status: 'suspended' }, `${o.name} suspended`)}
          >
            <Button danger type="text" icon={<PauseCircleOutlined />}>
              Suspend
            </Button>
          </Popconfirm>
        ) : (
          <Button type="text" icon={<CheckCircleOutlined />} onClick={() => update(o, { status: 'active' }, `${o.name} reactivated`)}>
            Reactivate
          </Button>
        ),
    },
  ]

  return (
    <>
      <PageHeader title="Organizations" description="Every tenant on the platform. Suspend, reactivate or change plans." />
      {orgs.error && <Alert type="error" showIcon title={orgs.error} style={{ marginBottom: 16 }} />}
      <Card>
        <Flex gap={8} style={{ marginBottom: 16 }} wrap>
          <Input.Search
            placeholder="Search by name or slug"
            allowClear
            enterButton
            style={{ maxWidth: 380 }}
            onSearch={(value) => {
              setPage(1)
              setSearch(value.trim())
            }}
          />
          <Tooltip title="Refresh">
            <Button icon={<ReloadOutlined />} onClick={orgs.reload} />
          </Tooltip>
        </Flex>
        <Table<PlatformOrganization>
          rowKey="id"
          columns={columns}
          dataSource={orgs.data?.items}
          loading={orgs.loading}
          scroll={{ x: 760 }}
          pagination={{
            current: page,
            pageSize,
            total: orgs.data?.total,
            showSizeChanger: true,
            showTotal: (total) => `${total} organizations`,
            onChange: (p, size) => {
              setPage(p)
              setPageSize(size)
            },
          }}
        />
      </Card>
    </>
  )
}
