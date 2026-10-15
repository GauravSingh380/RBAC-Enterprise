import { LockOutlined, PlusOutlined, ProjectOutlined, TeamOutlined } from '@ant-design/icons'
import { Alert, Avatar, Button, Card, Col, Empty, Flex, Input, Progress, Row, Segmented, Skeleton, Tag, Tooltip, Typography, theme } from 'antd'
import { useCallback, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Can } from '../../auth/Can'
import { PageHeader } from '../../components/ui'
import { PERMISSIONS } from '../../config/permissions'
import { useFetch } from '../../hooks/useFetch'
import { projectsService } from '../../services/projects.service'
import type { ProjectSummary } from '../../types/projects'
import CreateProjectModal from './CreateProjectModal'
import { DeletedProjects } from './DeletedProjects'
import { useAuth } from '../../auth/useAuth'

const ROLE_COLORS = { admin: 'gold', member: 'blue', viewer: 'default' } as const

function ProjectCard({ project, onOpen }: { project: ProjectSummary; onOpen: () => void }) {
  const { token } = theme.useToken()
  const done = project.itemCount - project.openItemCount
  const percent = project.itemCount ? Math.round((done / project.itemCount) * 100) : 0
  return (
    <Card hoverable onClick={onOpen} style={{ height: '100%', opacity: project.status === 'archived' ? 0.7 : 1 }}>
      <Flex gap={12} align="flex-start">
        <Avatar shape="square" size={42} style={{ background: project.color ?? token.colorPrimary, fontWeight: 700, flexShrink: 0 }}>
          {project.key.slice(0, 2)}
        </Avatar>
        <div style={{ flex: 1, minWidth: 0 }}>
          <Flex align="center" gap={6}>
            <Typography.Text strong ellipsis style={{ fontSize: '1.05em' }}>
              {project.name}
            </Typography.Text>
            {project.visibility === 'private' && (
              <Tooltip title="Private project">
                <LockOutlined style={{ color: token.colorTextSecondary }} />
              </Tooltip>
            )}
          </Flex>
          <Typography.Text type="secondary" code>
            {project.key}
          </Typography.Text>
        </div>
        <Tag color={ROLE_COLORS[project.myRole]} style={{ marginInlineEnd: 0 }}>
          {project.myRole}
        </Tag>
      </Flex>
      <Typography.Paragraph type="secondary" ellipsis={{ rows: 2 }} style={{ margin: '12px 0', minHeight: 44 }}>
        {project.description || 'No description'}
      </Typography.Paragraph>
      <Progress percent={percent} size="small" format={() => `${done}/${project.itemCount}`} />
      <Flex justify="space-between" style={{ marginTop: 8 }}>
        <Typography.Text type="secondary">
          <TeamOutlined /> {project.memberCount} members
        </Typography.Text>
        <Typography.Text type="secondary">{project.openItemCount} open</Typography.Text>
      </Flex>
      {project.status === 'archived' && (
        <Tag color="default" style={{ marginTop: 8 }}>
          archived
        </Tag>
      )}
    </Card>
  )
}

export default function ProjectsPage() {
  const navigate = useNavigate()
  const [status, setStatus] = useState<'active' | 'archived' | 'trash'>('active')
  const { can } = useAuth()
  const orgProjectAdmin = can(PERMISSIONS.PROJECTS_MANAGE_ALL)
  const [search, setSearch] = useState('')
  const [creating, setCreating] = useState(false)
  const projects = useFetch(
    useCallback(() => (status === 'trash' ? Promise.resolve([]) : projectsService.list(status, search || undefined)), [status, search]),
  )

  return (
    <>
      <PageHeader help="first-project"
        title="Projects"
        description="Projects you can access in this organization."
        actions={
          <Can permission={PERMISSIONS.PROJECTS_CREATE}>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreating(true)}>
              New project
            </Button>
          </Can>
        }
      />

      <Flex gap={12} wrap style={{ marginBottom: 20 }}>
        <Input.Search placeholder="Search projects" allowClear style={{ maxWidth: 320 }} onSearch={(v) => setSearch(v.trim())} />
        <Segmented
          value={status}
          onChange={(v) => setStatus(v as 'active' | 'archived' | 'trash')}
          options={[
            { value: 'active', label: 'Active' },
            { value: 'archived', label: 'Archived' },
            ...(orgProjectAdmin ? [{ value: 'trash', label: 'Trash' }] : []),
          ]}
        />
      </Flex>
      {status === 'trash' && <DeletedProjects />}

      {projects.error && <Alert type="error" showIcon title={projects.error} style={{ marginBottom: 16 }} />}

      {status === 'trash' ? null : !projects.data ? (
        <Row gutter={[20, 20]}>
          {[1, 2, 3].map((i) => (
            <Col xs={24} md={12} xl={8} key={i}>
              <Card>
                <Skeleton active avatar />
              </Card>
            </Col>
          ))}
        </Row>
      ) : projects.data.length === 0 ? (
        <Card>
          <Empty image={<ProjectOutlined style={{ fontSize: 56, opacity: 0.4 }} />} description={status === 'active' ? 'No projects yet' : 'No archived projects'}>
            {status === 'active' && (
              <Can permission={PERMISSIONS.PROJECTS_CREATE}>
                <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreating(true)}>
                  Create your first project
                </Button>
              </Can>
            )}
          </Empty>
        </Card>
      ) : (
        <Row gutter={[20, 20]}>
          {projects.data.map((p) => (
            <Col xs={24} md={12} xl={8} key={p.id}>
              <ProjectCard project={p} onOpen={() => navigate(`/projects/${p.key}`)} />
            </Col>
          ))}
        </Row>
      )}

      {creating && (
        <CreateProjectModal onClose={() => setCreating(false)} onCreated={(p) => navigate(`/projects/${p.key}`)} />
      )}
    </>
  )
}
