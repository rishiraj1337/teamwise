export type Department = string

export type Employee = {
  id: string
  name: string
  username: string
  title: string
  department: Department
  managerId: string | null
  location: string
  initials: string
  color: string
  focus: string
}

export type Task = {
  id: string
  title: string
  project: string
  ownerId: string
  due: string
  status: 'In progress' | 'Blocked' | 'Review' | 'Done' | 'To do'
  priority: 'High' | 'Medium' | 'Low'
  source: string
}

export type Project = {
  id: string
  name: string
  department: Department
  leadId: string
  progress: number
  status: 'On track' | 'At risk' | 'Complete'
  due: string
  source: string
  description: string
}

export type Page =
  | 'Overview'
  | 'My work'
  | 'People & teams'
  | 'Organization chart'
  | 'Projects'
  | 'Integrations'
  | 'Reviews and Remarks'
  | 'Audit log'
  | 'Manage categories'
  | 'Chatbot tickets'
  | 'Platform settings'
