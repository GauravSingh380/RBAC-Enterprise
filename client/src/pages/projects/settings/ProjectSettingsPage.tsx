import { Result, Tabs } from 'antd'
import { useSearchParams } from 'react-router-dom'
import { useProject } from '../shared/projectContext'
import GeneralSettings from './GeneralSettings'
import { FieldsSettings, LabelsSettings } from './LabelsAndFieldsSettings'
import MembersSettings from './MembersSettings'
import TemplatesSettings from './TemplatesSettings'
import WorkflowSettings from './WorkflowSettings'

export default function ProjectSettingsPage() {
  const { project, reloadProject } = useProject()
  const [params, setParams] = useSearchParams()

  if (!project.canManage) return <Result status="403" title="Project admins only" />

  const props = { project, reload: reloadProject }
  return (
    <Tabs
      tabPosition="top"
      activeKey={params.get('tab') ?? 'general'}
      onChange={(tab) => setParams({ tab }, { replace: true })}
      items={[
        { key: 'general', label: 'General', children: <GeneralSettings {...props} /> },
        { key: 'members', label: `Members (${project.memberCount})`, children: <MembersSettings {...props} /> },
        { key: 'workflow', label: 'Workflow', children: <WorkflowSettings {...props} /> },
        { key: 'labels', label: 'Labels', children: <LabelsSettings {...props} /> },
        { key: 'fields', label: 'Custom fields', children: <FieldsSettings {...props} /> },
        { key: 'templates', label: 'Templates', children: <TemplatesSettings {...props} /> },
      ]}
    />
  )
}
