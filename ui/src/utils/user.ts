import type { UserPublic } from '../types/auth'
import type { Employee } from '../types/workspace'

const AVATAR_COLORS = ['violet', 'blue', 'green', 'orange', 'pink', 'teal'] as const

export function avatarColorForId(id: string): string {
  let hash = 0
  for (let i = 0; i < id.length; i += 1) {
    hash = (hash + id.charCodeAt(i) * (i + 1)) % AVATAR_COLORS.length
  }
  return AVATAR_COLORS[hash]
}

export function initialsFromName(name: string) {
  return name
    .split(' ')
    .filter(Boolean)
    .map((part) => part[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()
}

export function formatDepartmentLabel(department: string) {
  const trimmed = department.trim()
  if (!trimmed || trimmed.toUpperCase() === 'N/A') {
    return 'Workspace'
  }
  return trimmed
}

export function userToEmployee(user: UserPublic): Employee {
  return {
    id: user.emp_id,
    name: user.name,
    username: user.email,
    title: user.job_title,
    department: formatDepartmentLabel(user.department),
    managerId: null,
    location: '—',
    initials: initialsFromName(user.name),
    color: avatarColorForId(user.emp_id),
    focus: user.role,
  }
}
