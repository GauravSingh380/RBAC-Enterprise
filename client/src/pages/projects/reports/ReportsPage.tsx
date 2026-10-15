// /projects/:key/reports — Overview, Bugs, Cycle time, Burndown, Velocity (recharts is loaded only on this page).
import { Skeleton, Tabs } from 'antd'
import { useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useFetch } from '../../../hooks/useFetch'
import { sprintsService } from '../../../services/projects.service'
import { useProject } from '../shared/projectContext'
import { OverviewReport } from './OverviewReport'
import { BugsReport, CycleTimeReport } from './QualityReports'
import { BurndownReport, VelocityReport } from './SprintReports'

export default function ReportsPage() {
  const { project } = useProject()
  const [params, setParams] = useSearchParams()
  const sprints = useFetch(useCallback(() => sprintsService.list(project.key, 'all'), [project.key]))
  const tab = params.get('report') ?? 'overview'

  return (
    <Tabs
      activeKey={tab}
      onChange={(k) => setParams({ report: k }, { replace: true })}
      items={[
        { key: 'overview', label: 'Overview', children: <OverviewReport project={project} /> },
        { key: 'bugs', label: 'Bugs', children: <BugsReport project={project} /> },
        { key: 'cycle', label: 'Cycle & lead time', children: <CycleTimeReport project={project} /> },
        {
          key: 'burndown',
          label: 'Sprint burndown',
          children: sprints.data ? <BurndownReport project={project} sprints={sprints.data} /> : <Skeleton active />,
        },
        { key: 'velocity', label: 'Velocity', children: <VelocityReport project={project} /> },
      ]}
    />
  )
}
