import { apiRequest } from './client'

export type AuditLogRow = {
  id: number
  created_at: string
  actor_emp_id: string | null
  actor_email: string | null
  action: string
  resource_type: string
  resource_id: string | null
  summary: string
  metadata_json: string | null
  ip_address: string | null
  source?: string
}

export type AuditLogListResponse = {
  items: AuditLogRow[]
  total: number
  limit: number
  offset: number
}

export const AUDIT_PAGE_SIZE_OPTIONS = [25, 50, 100] as const

export const AUDIT_ACTION_PRESETS = [
  '',
  'auth.login.success',
  'auth.login.failure',
  'auth.logout',
  'review.update',
  'REVIEW_UPDATED',
  'review.export_csv',
  'review.export_json',
  'REVIEWS_EXPORTED',
  'review.export_csv',
  'review.category_breakdown.export_csv',
  'POLLING_SETTINGS_UPDATED',
  'AI_SETTINGS_UPDATED',
] as const

export function fetchAuditLogs(query: {
  limit?: number
  offset?: number
  action?: string
  resource?: string
  resource_type?: string
  search?: string
  start_date?: string
  end_date?: string
} = {}) {
  const params = new URLSearchParams()
  params.set('limit', String(query.limit ?? 50))
  params.set('offset', String(query.offset ?? 0))
  if (query.action?.trim()) params.set('action', query.action.trim())
  const resource = query.resource_type ?? query.resource
  if (resource?.trim()) params.set('resource_type', resource.trim())
  if (query.search?.trim()) params.set('search', query.search.trim())
  if (query.start_date) params.set('start_date', query.start_date)
  if (query.end_date) params.set('end_date', query.end_date)
  return apiRequest<AuditLogListResponse>(`/api/v1/audit-logs?${params.toString()}`)
}
