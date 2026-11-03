import { apiRequest } from './client'

export type DepartmentOption = {
  id: number
  name: string
  code: string
}

export type RoleOption = {
  id: number
  name: string
}

export type RegistrationOptionsResponse = {
  departments: DepartmentOption[]
  roles: RoleOption[]
}

export function fetchRegistrationOptions() {
  return apiRequest<RegistrationOptionsResponse>('/api/v1/auth/registration-options')
}

export function formatRoleLabel(roleName: string) {
  if (!roleName) return roleName
  return roleName.charAt(0).toUpperCase() + roleName.slice(1)
}
