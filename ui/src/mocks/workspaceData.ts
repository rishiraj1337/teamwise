import type { Employee, Project, Task } from '../types/workspace'

export const employees: Employee[] = []
export const tasks: Task[] = []
export const projects: Project[] = []

export type IntegrationSeed = {
  name: string
  description: string
  initials: string
  color: string
}

export const integrationSeeds: IntegrationSeed[] = []

export type WorkspaceContent = {
  eyebrow: string
  title: string
  description: string
  metrics: [string, string, string, string][]
  focusTitle: string
  focus: string[]
}

export function getDepartmentContent(department: string): WorkspaceContent {
  const trimmed = department.trim()
  const label = !trimmed || trimmed.toUpperCase() === 'N/A' ? 'Workspace' : trimmed
  const eyebrow = label.toLowerCase() === 'operations'
    ? 'OPERATIONS WORKSPACE'
    : `${label.toUpperCase()} WORKSPACE`
  return {
    eyebrow,
    title: 'Your workspace overview.',
    description: 'Delivery, people, and tools will appear here as you connect data sources.',
    metrics: [
      ['Active projects', '0', 'No projects yet', 'violet'],
      ['Open tasks', '0', 'No tasks yet', 'green'],
      ['Blockers', '0', 'None reported', 'orange'],
      ['Integrations', '0', 'Not connected', 'blue'],
    ],
    focusTitle: 'Focus areas',
    focus: [
      'Your account is signed in and ready.',
      'Project and task data is not loaded in this build.',
      'Use your profile menu to review account details or change your password.',
    ],
  }
}
