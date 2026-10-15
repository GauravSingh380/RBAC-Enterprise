// Starting configuration copied into a new project. After creation everything is editable
// per project (Project settings → Workflow / Labels).

export type StatusCategory = 'todo' | 'in_progress' | 'done';

export interface TemplateStatus {
  name: string;
  category: StatusCategory;
  color: string;
  /** Organization role names allowed to move items INTO this status ([] = anyone who can edit). */
  restrictedRoles?: string[];
}

export interface ProjectTemplate {
  key: string;
  name: string;
  description: string;
  defaultItemType: 'task' | 'story' | 'bug';
  statuses: TemplateStatus[];
  labels: { name: string; color: string }[];
  /** QA verification flow, by status name: waiting for QA → passed / failed */
  qaFlow?: { ready: string; passed: string; failed: string };
}

export const PROJECT_TEMPLATES: Record<string, ProjectTemplate> = {
  kanban: {
    key: 'kanban',
    name: 'Kanban',
    description: 'Continuous flow of work. Simple To Do → In Progress → Done.',
    defaultItemType: 'task',
    statuses: [
      { name: 'To Do', category: 'todo', color: '#8c8c8c' },
      { name: 'In Progress', category: 'in_progress', color: '#1677ff' },
      { name: 'Done', category: 'done', color: '#52c41a' },
    ],
    labels: [
      { name: 'frontend', color: 'blue' },
      { name: 'backend', color: 'purple' },
      { name: 'design', color: 'magenta' },
    ],
  },
  scrum: {
    key: 'scrum',
    name: 'Scrum',
    description: 'Plan work in sprints with a backlog, review step and story points.',
    defaultItemType: 'story',
    statuses: [
      { name: 'Backlog', category: 'todo', color: '#bfbfbf' },
      { name: 'To Do', category: 'todo', color: '#8c8c8c' },
      { name: 'In Progress', category: 'in_progress', color: '#1677ff' },
      { name: 'In Review', category: 'in_progress', color: '#722ed1' },
      { name: 'Done', category: 'done', color: '#52c41a' },
    ],
    labels: [
      { name: 'frontend', color: 'blue' },
      { name: 'backend', color: 'purple' },
      { name: 'tech-debt', color: 'orange' },
    ],
  },
  bug_tracking: {
    key: 'bug_tracking',
    name: 'Bug tracking',
    description: 'Report, fix and verify bugs. Only QA (or admins) can mark a bug Verified.',
    defaultItemType: 'bug',
    statuses: [
      { name: 'Open', category: 'todo', color: '#fa541c' },
      { name: 'In Progress', category: 'in_progress', color: '#1677ff' },
      { name: 'Ready for QA', category: 'in_progress', color: '#13c2c2' },
      { name: 'Verified', category: 'done', color: '#52c41a', restrictedRoles: ['qa', 'admin', 'owner'] },
      { name: 'Reopened', category: 'todo', color: '#eb2f96' },
      { name: "Won't Fix", category: 'done', color: '#8c8c8c' },
    ],
    qaFlow: { ready: 'Ready for QA', passed: 'Verified', failed: 'Reopened' },
    labels: [
      { name: 'ui', color: 'blue' },
      { name: 'api', color: 'purple' },
      { name: 'performance', color: 'orange' },
      { name: 'regression', color: 'red' },
    ],
  },
  blank: {
    key: 'blank',
    name: 'Blank',
    description: 'Start minimal and build your own workflow.',
    defaultItemType: 'task',
    statuses: [
      { name: 'To Do', category: 'todo', color: '#8c8c8c' },
      { name: 'Done', category: 'done', color: '#52c41a' },
    ],
    labels: [],
  },
};

export const TEMPLATE_KEYS = Object.keys(PROJECT_TEMPLATES) as [string, ...string[]];
