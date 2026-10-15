import { ApartmentOutlined, RiseOutlined, TeamOutlined, UserOutlined } from '@ant-design/icons'
import { Alert, Card, Col, Flex, Row, Skeleton, Statistic, Tag, Typography } from 'antd'
import { useCallback } from 'react'
import { Link } from 'react-router-dom'
import { PageHeader } from '../../components/ui'
import { useFetch } from '../../hooks/useFetch'
import { platformService } from '../../services/platform.service'

export default function PlatformOverviewPage() {
  const stats = useFetch(useCallback(() => platformService.stats(), []))
  const s = stats.data

  return (
    <>
      <PageHeader title="Platform overview" description="You are the product owner. This view spans every organization (tenant)." />
      {stats.error && <Alert type="error" showIcon title={stats.error} style={{ marginBottom: 16 }} />}

      {!s ? (
        <Card>
          <Skeleton active />
        </Card>
      ) : (
        <>
          <Row gutter={[20, 20]}>
            <Col xs={24} sm={12} xl={6}>
              <Card>
                <Statistic title="Organizations" value={s.organizations} prefix={<ApartmentOutlined />} />
                <Typography.Text type="secondary">{s.activeOrganizations} active</Typography.Text>
              </Card>
            </Col>
            <Col xs={24} sm={12} xl={6}>
              <Card>
                <Statistic title="New organizations (30 days)" value={s.newOrganizations30d} prefix={<RiseOutlined />} />
              </Card>
            </Col>
            <Col xs={24} sm={12} xl={6}>
              <Card>
                <Statistic title="User accounts" value={s.users} prefix={<TeamOutlined />} />
              </Card>
            </Col>
            <Col xs={24} sm={12} xl={6}>
              <Card>
                <Statistic title="Active users (30 days)" value={s.activeUsers30d} prefix={<UserOutlined />} />
              </Card>
            </Col>
          </Row>

          <Card title="Organizations by plan" style={{ marginTop: 20 }} extra={<Link to="/platform/organizations">Manage</Link>}>
            <Flex gap={12} wrap>
              {Object.entries(s.byPlan).map(([plan, count]) => (
                <Tag key={plan} color={plan === 'enterprise' ? 'purple' : plan === 'pro' ? 'gold' : 'default'} style={{ fontSize: '1em', padding: '4px 12px' }}>
                  {plan}: <strong>{count}</strong>
                </Tag>
              ))}
            </Flex>
          </Card>
        </>
      )}
    </>
  )
}
