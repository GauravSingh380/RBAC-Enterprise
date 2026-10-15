// The project loaded by <ProjectShell> is shared with its child pages through the router outlet.
import { useOutletContext } from 'react-router-dom'
import type { ProjectDetail } from '../../../types/projects'

export interface ProjectOutletContext {
  project: ProjectDetail
  reloadProject: () => void
}

export const useProject = () => useOutletContext<ProjectOutletContext>()
