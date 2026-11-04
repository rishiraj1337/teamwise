import { apiRequest } from './client'

export type TeamwiseDirectoryUser = {
  id: number
  emp_id: string
  email: string
  name: string
  department: string
  role: string
  status: string
}

export type RoleOption = {
  id: number
  name: string
}

export type PermissionOption = {
  id: number
  resource: string
  action: string
  key: string
}

export type RolesMatrixData = {
  roles: RoleOption[]
  permissions: PermissionOption[]
  matrix: Record<string, number[]>
}

export async function fetchTeamwiseDirectoryUsers(params?: { limit?: number; offset?: number }) {
  const limit = params?.limit ?? 200
  const offset = params?.offset ?? 0
  const response = await apiRequest<{
    users: TeamwiseDirectoryUser[]
    total: number
    limit: number
    offset: number
  }>(`/api/v1/admin/users?limit=${limit}&offset=${offset}`)
  return response
}

export async function fetchRolesMatrix(): Promise<RolesMatrixData> {
  return apiRequest<RolesMatrixData>('/api/v1/admin/roles-matrix')
}

export async function updateRolesMatrix(matrix: Record<string, number[]>): Promise<RolesMatrixData> {
  return apiRequest<RolesMatrixData>('/api/v1/admin/roles-matrix', {
    method: 'PUT',
    body: JSON.stringify({ matrix }),
  })
}

export async function assignUserRole(
  userId: number,
  roleName: string,
): Promise<{ success: boolean; user_id: number; role: string; message: string }> {
  return apiRequest<{ success: boolean; user_id: number; role: string; message: string }>(
    `/api/v1/admin/users/${userId}/role`,
    {
      method: 'PUT',
      body: JSON.stringify({ role_name: roleName }),
    },
  )
}
