// Pure work-item rules and formatting helpers (no UI imports, so they are cheap to test).
import type { ItemType, ProjectDetail, Resolution } from '../../../types/projects'

/** Which types may be the parent of each type (mirrors the server rule). */
export const ALLOWED_PARENTS: Record<ItemType, ItemType[]> = {
  epic: [],
  story: ['epic'],
  task: ['epic'],
  bug: ['epic'],
  subtask: ['story', 'task', 'bug'],
}

export const formatBytes = (bytes: number) =>
  bytes < 1024 ? `${bytes} B` : bytes < 1024 ** 2 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1024 ** 2).toFixed(1)} MB`

export const isOverdue = (dueDate: string | null, category: string) =>
  !!dueDate && category !== 'done' && new Date(`${dueDate}T23:59:59`) < new Date()

export const RESOLUTION_LABELS: Record<Resolution, string> = {
  fixed: 'Fixed',
  duplicate: 'Duplicate',
  wont_fix: "Won't fix",
  cannot_reproduce: 'Cannot reproduce',
  by_design: 'By design',
}

/** Where an item stands in the project's QA verification flow. */
export function qaState(
  project: Pick<ProjectDetail, 'qaReadyStatusId' | 'qaPassedStatusId' | 'qaFailedStatusId'>,
  statusId: number,
): 'none' | 'waiting' | 'passed' | 'failed' | 'other' {
  if (!project.qaReadyStatusId || !project.qaPassedStatusId || !project.qaFailedStatusId) return 'none'
  if (statusId === project.qaReadyStatusId) return 'waiting'
  if (statusId === project.qaPassedStatusId) return 'passed'
  if (statusId === project.qaFailedStatusId) return 'failed'
  return 'other'
}

/** Small user-agent reader to pre-fill "Browser" / "OS" on a bug report (mirrors the server's). */
export function detectBrowser(ua: string): { browser: string | null; os: string | null } {
  const browsers: [string, RegExp][] = [
    ['Edge', /Edg\/(\d+)/],
    ['Opera', /OPR\/(\d+)/],
    ['Firefox', /Firefox\/(\d+)/],
    ['Chrome', /Chrome\/(\d+)/],
    ['Safari', /Version\/(\d+).*Safari/],
  ]
  let browser: string | null = null
  for (const [name, re] of browsers) {
    const m = re.exec(ua)
    if (m) {
      browser = `${name} ${m[1]}`
      break
    }
  }
  const os = /Windows NT 10/.test(ua)
    ? 'Windows 10/11'
    : /Windows NT/.test(ua)
      ? 'Windows'
      : /iPhone|iPad/.test(ua)
        ? 'iOS'
        : /Mac OS X/.test(ua)
          ? 'macOS'
          : /Android/.test(ua)
            ? 'Android'
            : /Linux/.test(ua)
              ? 'Linux'
              : null
  return { browser, os }
}
