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
