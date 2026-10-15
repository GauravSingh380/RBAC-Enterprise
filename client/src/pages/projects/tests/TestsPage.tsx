// /projects/:key/tests — test case library and test runs.
import { Tabs } from 'antd'
import { useSearchParams } from 'react-router-dom'
import { useProject } from '../shared/projectContext'
import { TestCasesView } from './TestCasesView'
import { TestRunsView } from './TestRunsView'

export default function TestsPage() {
  const { project } = useProject()
  const [params, setParams] = useSearchParams()
  const tab = params.get('tab') === 'runs' ? 'runs' : 'cases'

  return (
    <Tabs
      activeKey={tab}
      onChange={(k) => setParams(k === 'runs' ? { tab: 'runs' } : {}, { replace: true })}
      items={[
        { key: 'cases', label: 'Test cases', children: <TestCasesView project={project} /> },
        { key: 'runs', label: 'Test runs', children: <TestRunsView project={project} /> },
      ]}
    />
  )
}
