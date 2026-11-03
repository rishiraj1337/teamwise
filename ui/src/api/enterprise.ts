import type { ReviewAnalyticsResponse, ReviewListResponse, ReviewQuery, ReviewRow, ReviewTaxonomy, ReviewUpdatePayload } from './reviews'
import { ensurePlatformSession, platformApiRequest } from './platformClient'
import { getStoredUserProfile } from './client'

export async function requireEnterpriseSession() {
  const token = await ensurePlatformSession()
  if (!token) {
    throw new Error(
      'Enterprise review platform is unavailable. Check ENTERPRISE_BRIDGE_* settings on Teamwise backend.',
    )
  }
  return token
}

type PlatformReviewList = {
  success: boolean
  reviews: ReviewRow[]
  total: number
  page: number
  limit: number
  totalPages: number
}

function queryToPlatformParams(query: ReviewQuery & { page?: number }) {
  const limit = query.limit ?? 20
  const page =
    query.page ??
    (query.offset != null && limit > 0 ? Math.floor(query.offset / limit) + 1 : 1)
  const params = new URLSearchParams()
  params.set('page', String(page))
  params.set('limit', String(limit))
  if (query.search?.trim()) params.set('search', query.search.trim())
  if (query.category && query.category !== 'All') params.set('category', query.category)
  if (query.channel && query.channel !== 'All') params.set('channel', query.channel)
  if (query.priority && query.priority !== 'All') params.set('priority', query.priority)
  if (query.status && query.status !== 'All') params.set('status', query.status)
  if (query.status_group === 'open' || query.status_group === 'resolved') {
    params.set('statusGroup', query.status_group)
  }
  if (query.min_rating != null && query.max_rating != null && query.min_rating === query.max_rating) {
    params.set('starRating', String(query.min_rating))
  } else {
    if (query.min_rating != null) params.set('minStarRating', String(query.min_rating))
    if (query.max_rating != null) params.set('maxStarRating', String(query.max_rating))
  }
  if (query.start_date) params.set('startDate', query.start_date)
  if (query.end_date) params.set('endDate', query.end_date)
  params.set('sortBy', query.sort_by ?? 'created_at')
  params.set('sortOrder', query.sort_order ?? 'DESC')
  return params
}

export type ReviewExportQuery = Omit<ReviewQuery, 'limit' | 'offset'>

function queryToExportParams(query: ReviewExportQuery) {
  const params = queryToPlatformParams({ ...query, limit: 1, page: 1 })
  params.delete('page')
  params.delete('limit')
  params.set('format', 'csv')
  return params
}

export async function enterpriseFetchReviews(query: ReviewQuery = {}): Promise<ReviewListResponse> {
  await requireEnterpriseSession()
  const limit = query.limit ?? 20
  const params = queryToPlatformParams(query)
  const response = await platformApiRequest<PlatformReviewList>(`/api/reviews?${params.toString()}`)
  const page = response.page || 1
  return {
    items: response.reviews ?? [],
    total: response.total ?? 0,
    limit: response.limit ?? limit,
    offset: (page - 1) * (response.limit ?? limit),
  }
}

export async function enterpriseFetchAllReviews(
  query: Omit<ReviewQuery, 'limit' | 'offset'> = {},
): Promise<ReviewRow[]> {
  await requireEnterpriseSession()
  const items: ReviewRow[] = []
  let page = 1
  let totalPages = 1
  const limit = 100

  while (page <= totalPages) {
    const response = await platformApiRequest<PlatformReviewList>(
      `/api/reviews?${queryToPlatformParams({ ...query, limit, page }).toString()}`,
    )
    items.push(...(response.reviews ?? []))
    totalPages = response.totalPages || 1
    page += 1
    if ((response.reviews ?? []).length === 0) break
  }

  return items
}

export async function enterpriseUpdateReview(uniqueId: string, payload: ReviewUpdatePayload) {
  await requireEnterpriseSession()
  const result = await platformApiRequest<{ review: ReviewRow }>(
    `/api/reviews/${encodeURIComponent(uniqueId)}`,
    { method: 'PUT', body: JSON.stringify(payload) },
  )
  return result.review
}

export async function enterpriseFetchReviewTaxonomy(): Promise<ReviewTaxonomy> {
  await requireEnterpriseSession()
  const response = await platformApiRequest<{
    success: boolean
    priorities: string[]
    categories: { name: string; subcategories: string[] }[]
    statuses: string[]
  }>('/api/reviews/taxonomy')
  return {
    priorities: response.priorities,
    categories: response.categories,
    statuses: response.statuses,
  }
}

export async function enterpriseFetchReviewAnalytics(filters?: {
  start_date?: string
  end_date?: string
}): Promise<ReviewAnalyticsResponse> {
  await requireEnterpriseSession()
  const params = new URLSearchParams()
  if (filters?.start_date) params.set('startDate', filters.start_date)
  if (filters?.end_date) params.set('endDate', filters.end_date)
  const suffix = params.toString() ? `?${params.toString()}` : ''
  const response = await platformApiRequest<{ success: boolean } & ReviewAnalyticsResponse>(
    `/api/reviews/analytics${suffix}`,
  )
  const { success: _s, ...analytics } = response
  return analytics as ReviewAnalyticsResponse
}

export async function enterpriseDownloadReviewExport(
  query: ReviewExportQuery = {},
  format: 'csv' | 'json' = 'csv',
): Promise<Blob> {
  await requireEnterpriseSession()
  const token = localStorage.getItem('teamwise_platform_token')
  const API_BASE = import.meta.env.VITE_API_URL ?? ''
  const params = queryToExportParams(query)
  if (format === 'json') params.set('format', 'json')
  const headers = new Headers({ Authorization: `Bearer ${token}` })
  const actor = getStoredUserProfile()
  if (actor?.email) {
    headers.set('X-Teamwise-Actor-Email', actor.email)
    headers.set('X-Teamwise-Actor-Emp-Id', actor.emp_id)
    headers.set('X-Teamwise-Actor-Name', actor.name)
  }
  const response = await fetch(`${API_BASE}/api/reviews/export?${params.toString()}`, {
    headers,
  })
  if (!response.ok) {
    throw new Error('Export failed')
  }
  return response.blob()
}

export function downloadReviewExportBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

export type EnterpriseAuditLogRow = {
  id: number
  created_at: string
  user_email: string | null
  action: string
  resource: string
  details: string | null
  ip_address: string | null
}

export async function enterpriseFetchAuditLogs(query: {
  page?: number
  limit?: number
  action?: string
  resource?: string
} = {}) {
  await requireEnterpriseSession()
  const params = new URLSearchParams()
  params.set('page', String(query.page ?? 1))
  params.set('limit', String(query.limit ?? 50))
  if (query.action?.trim()) params.set('action', query.action.trim())
  if (query.resource?.trim()) params.set('resource', query.resource.trim())
  const response = await platformApiRequest<{
    success: boolean
    logs: EnterpriseAuditLogRow[]
    total: number
  }>(`/api/admin/audit-logs?${params.toString()}`)
  return {
    items: (response.logs ?? []).map((row) => ({
      id: row.id,
      created_at: row.created_at,
      actor_emp_id: null,
      actor_email: row.user_email,
      action: row.action,
      resource_type: row.resource,
      resource_id: null,
      summary: row.action.replace(/_/g, ' '),
      metadata_json: row.details,
      ip_address: row.ip_address,
    })),
    total: response.total ?? 0,
    limit: query.limit ?? 50,
    offset: ((query.page ?? 1) - 1) * (query.limit ?? 50),
  }
}

export type ReviewConfigResponse = {
  priorities: { id: number; name: string; is_active: boolean }[]
  categories: {
    id: number
    name: string
    is_active: boolean
    subcategories: { id: number; name: string; is_active: boolean }[]
  }[]
}

export async function enterpriseFetchReviewConfig(): Promise<ReviewConfigResponse> {
  await requireEnterpriseSession()
  const response = await platformApiRequest<{ success: boolean } & ReviewConfigResponse>(
    '/api/admin/review-config',
  )
  return { priorities: response.priorities, categories: response.categories }
}

export async function enterpriseCreateReviewCategory(name: string) {
  await requireEnterpriseSession()
  return platformApiRequest(`/api/admin/review-config/categories`, {
    method: 'POST',
    body: JSON.stringify({ name }),
  })
}

export async function enterpriseUpdateReviewCategory(
  categoryId: number,
  payload: { name?: string; is_active?: boolean },
) {
  await requireEnterpriseSession()
  return platformApiRequest(`/api/admin/review-config/categories/${categoryId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  })
}

export async function enterpriseCreateReviewSubcategory(categoryId: number, name: string) {
  await requireEnterpriseSession()
  return platformApiRequest(`/api/admin/review-config/categories/${categoryId}/subcategories`, {
    method: 'POST',
    body: JSON.stringify({ name }),
  })
}

export async function enterpriseUpdateReviewSubcategory(
  subcategoryId: number,
  payload: { name?: string; is_active?: boolean },
) {
  await requireEnterpriseSession()
  return platformApiRequest(`/api/admin/review-config/subcategories/${subcategoryId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  })
}

export type ChatbotTicket = {
  id: string
  complaint_id: string
  category_name: string
  ticket_category: string
  status: number
  payer_name: string
  mob_no: string
  amount: number
  txn_type: string
  created_at: string
  review_unique_id: string | null
}

export async function enterpriseFetchChatbotTickets(query: {
  page?: number
  limit?: number
  categoryName?: string
  search?: string
} = {}) {
  await requireEnterpriseSession()
  const params = new URLSearchParams()
  params.set('page', String(query.page ?? 1))
  params.set('limit', String(query.limit ?? 20))
  if (query.categoryName) params.set('categoryName', query.categoryName)
  if (query.search) params.set('search', query.search)
  return platformApiRequest<{
    success: boolean
    items: ChatbotTicket[]
    total: number
    page: number
    limit: number
    totalPages: number
  }>(`/api/chatbot/tickets?${params.toString()}`)
}

export async function enterpriseFetchChatbotTicket(id: string) {
  await requireEnterpriseSession()
  const response = await platformApiRequest<{ success: boolean; ticket: Record<string, unknown> }>(
    `/api/chatbot/tickets/${encodeURIComponent(id)}`,
  )
  return response.ticket
}

export async function enterpriseFetchChatbotCategories() {
  await requireEnterpriseSession()
  const response = await platformApiRequest<{
    success: boolean
    categories: { id: string; name: string; active: boolean }[]
  }>('/api/chatbot/categories')
  return response.categories ?? []
}

export async function enterpriseFetchEmailFilteredStats() {
  await requireEnterpriseSession()
  const response = await platformApiRequest<{ success: boolean; stats: Record<string, number> }>(
    '/api/ingestion/email/filtered/stats',
  )
  return response.stats
}

export async function enterpriseFetchPlatformAuthMe() {
  await requireEnterpriseSession()
  return platformApiRequest<{ success: boolean; user: Record<string, unknown> }>('/api/auth/me')
}

export async function enterpriseFetchAiSettings() {
  await requireEnterpriseSession()
  const response = await platformApiRequest<{ success: boolean; aiConfig: Record<string, unknown> }>(
    '/api/admin/settings/ai',
  )
  return response.aiConfig
}

function positiveIntervalMinutes(value: unknown): number | undefined {
  const n = Number(value)
  if (!Number.isFinite(n) || n <= 0) return undefined
  return Math.round(n)
}

/** Map enterprise polling config to minute-based fields (handles legacy seconds/days/hours). */
export function normalizePollingConfig(
  raw: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  if (!raw || typeof raw !== 'object') {
    return {
      emailEnabled: true,
      emailIntervalMinutes: 1,
      playstoreEnabled: true,
      playstoreIntervalMinutes: 1440,
      chatbotEnabled: true,
      chatbotIntervalMinutes: 60,
    }
  }

  const emailIntervalMinutes =
    positiveIntervalMinutes(raw.emailIntervalMinutes) ??
    (positiveIntervalMinutes(raw.emailIntervalSeconds) != null
      ? Math.max(1, Math.round(positiveIntervalMinutes(raw.emailIntervalSeconds)! / 60))
      : undefined) ??
    1

  const playstoreIntervalMinutes =
    positiveIntervalMinutes(raw.playstoreIntervalMinutes) ??
    (positiveIntervalMinutes(raw.playstoreIntervalDays) != null
      ? Math.max(1, Math.round(positiveIntervalMinutes(raw.playstoreIntervalDays)! * 1440))
      : undefined) ??
    1440

  const chatbotIntervalMinutes =
    positiveIntervalMinutes(raw.chatbotIntervalMinutes) ??
    (positiveIntervalMinutes(raw.chatbotIntervalHours) != null
      ? Math.max(1, Math.round(positiveIntervalMinutes(raw.chatbotIntervalHours)! * 60))
      : undefined) ??
    60

  return {
    ...raw,
    emailEnabled: raw.emailEnabled ?? true,
    emailIntervalMinutes,
    playstoreEnabled: raw.playstoreEnabled ?? true,
    playstoreIntervalMinutes,
    chatbotEnabled: raw.chatbotEnabled ?? true,
    chatbotIntervalMinutes,
  }
}

/** Build PUT body without clobbering intervals with hardcoded defaults. */
export function buildPollingSettingsPayload(state: Record<string, unknown>): Record<string, unknown> {
  const normalized = normalizePollingConfig(state)
  return {
    emailEnabled: Boolean(state.emailEnabled ?? normalized.emailEnabled),
    emailIntervalMinutes:
      positiveIntervalMinutes(state.emailIntervalMinutes) ?? normalized.emailIntervalMinutes,
    playstoreEnabled: Boolean(state.playstoreEnabled ?? normalized.playstoreEnabled),
    playstoreIntervalMinutes:
      positiveIntervalMinutes(state.playstoreIntervalMinutes) ?? normalized.playstoreIntervalMinutes,
    chatbotEnabled: Boolean(state.chatbotEnabled ?? normalized.chatbotEnabled),
    chatbotIntervalMinutes:
      positiveIntervalMinutes(state.chatbotIntervalMinutes) ?? normalized.chatbotIntervalMinutes,
  }
}

export async function enterpriseUpdateAiSettings(payload: Record<string, unknown>) {
  await requireEnterpriseSession()
  const response = await platformApiRequest<{ success: boolean; aiConfig: Record<string, unknown> }>(
    '/api/admin/settings/ai',
    { method: 'PUT', body: JSON.stringify(payload) },
  )
  return response.aiConfig
}

export async function enterpriseFetchPollingSettings() {
  await requireEnterpriseSession()
  const response = await platformApiRequest<{ success: boolean; pollingConfig: Record<string, unknown> }>(
    '/api/admin/settings/polling',
  )
  return normalizePollingConfig(response.pollingConfig)
}

export async function enterpriseUpdatePollingSettings(payload: Record<string, unknown>) {
  await requireEnterpriseSession()
  const response = await platformApiRequest<{ success: boolean; pollingConfig: Record<string, unknown> }>(
    '/api/admin/settings/polling',
    { method: 'PUT', body: JSON.stringify(payload) },
  )
  return normalizePollingConfig(response.pollingConfig)
}
