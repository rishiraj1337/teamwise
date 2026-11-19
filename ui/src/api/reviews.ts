import { apiRequest } from './client'

export type ChartSlice = {
  label: string
  value: number
}

export type ReviewFilterOptions = {
  categories: string[]
  priorities: string[]
  statuses: string[]
  channels: string[]
}

export const REVIEW_CHANNELS = [
  'All',
  'Google Playstore',
  'Email',
  'Chatbot',
] as const

export type ReviewParsedMetadata = {
  amount?: string
  txn_id?: string
  rrn?: string
  payment_mode?: string
  thread_reference?: string | null
  source_channel?: string
  app_version?: string
  ingest_time?: string | null
  extracted_tags?: string[]
}

export type ReviewRow = {
  unique_id: string
  channel: string
  review_timestamp: string
  star_ratings: number
  review_text: string
  category: string
  subcategory: string
  priority: string
  status: string
  resolution: string
  department: string
  response_timestamp: string | null
  resolution_date: string | null
  developer_reply_time: string | null
  developer_reply_text: string
  review_link: string
  app_version_code?: string
  app_version_name?: string
  parsed_metadata?: ReviewParsedMetadata
  created_at: string
  updated_at: string
}

export type ReviewUpdatePayload = {
  category: string
  subcategory: string
  priority: string
  status: string
  department: string
  resolution: string
  response_timestamp: string | null
  developer_reply_text: string
  developer_reply_time: string | null
  review_link: string
}

export type ReviewListResponse = {
  items: ReviewRow[]
  total: number
  limit: number
  offset: number
}

export type CategoryBreakdown = {
  category: string
  count: number
  subcategories: ChartSlice[]
}

export type ReviewAnalyticsResponse = {
  category_breakdown: ChartSlice[]
  category_detail: CategoryBreakdown[]
  sentiment_breakdown: ChartSlice[]
  priority_breakdown: ChartSlice[]
  ticket_breakdown: ChartSlice[]
  filter_options: ReviewFilterOptions
}

export type ReviewQuery = {
  limit?: number
  offset?: number
  search?: string
  category?: string
  priority?: string
  status?: string
  min_rating?: number
  max_rating?: number
  channel?: string
  sort_by?: string
  sort_order?: 'ASC' | 'DESC'
  status_group?: 'open' | 'resolved'
  start_date?: string
  end_date?: string
}

export const REVIEW_PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const

export type ReviewTaxonomy = {
  priorities: string[]
  categories: { name: string; subcategories: string[] }[]
  statuses: string[]
}

export function fetchReviewTaxonomy() {
  return apiRequest<ReviewTaxonomy>('/api/v1/reviews/taxonomy')
}

export function fetchReviewAnalytics(filters?: { start_date?: string; end_date?: string }) {
  const params = new URLSearchParams()
  if (filters?.start_date) params.set('start_date', filters.start_date)
  if (filters?.end_date) params.set('end_date', filters.end_date)
  const suffix = params.toString() ? `?${params.toString()}` : ''
  return apiRequest<ReviewAnalyticsResponse>(`/api/v1/reviews/analytics${suffix}`)
}

function buildReviewQueryParams(query: ReviewQuery = {}) {
  const params = new URLSearchParams()
  if (query.limit != null) params.set('limit', String(query.limit))
  if (query.offset != null) params.set('offset', String(query.offset))
  if (query.search?.trim()) params.set('search', query.search.trim())
  if (query.category && query.category !== 'All') params.set('category', query.category)
  if (query.priority && query.priority !== 'All') params.set('priority', query.priority)
  if (query.status && query.status !== 'All') params.set('status', query.status)
  if (query.status_group) params.set('status_group', query.status_group)
  if (query.min_rating != null) params.set('min_rating', String(query.min_rating))
  if (query.max_rating != null) params.set('max_rating', String(query.max_rating))
  if (query.channel && query.channel !== 'All') params.set('channel', query.channel)
  if (query.start_date) params.set('start_date', query.start_date)
  if (query.end_date) params.set('end_date', query.end_date)
  if (query.sort_by) params.set('sort_by', query.sort_by)
  if (query.sort_order) params.set('sort_order', query.sort_order)
  return params
}

export function fetchReviews(query: ReviewQuery = {}) {
  const suffix = buildReviewQueryParams(query).toString()
  return apiRequest<ReviewListResponse>(`/api/v1/reviews${suffix ? `?${suffix}` : ''}`)
}

const EXPORT_PAGE_SIZE = 200

export async function fetchAllReviews(
  query: Omit<ReviewQuery, 'limit' | 'offset'> = {},
): Promise<ReviewRow[]> {
  const items: ReviewRow[] = []
  let offset = 0
  let total = Number.POSITIVE_INFINITY

  while (offset < total) {
    const response = await fetchReviews({ ...query, limit: EXPORT_PAGE_SIZE, offset })
    items.push(...response.items)
    total = response.total
    offset += response.items.length
    if (response.items.length === 0) break
  }

  return items
}

export function updateReview(uniqueId: string, payload: ReviewUpdatePayload) {
  return apiRequest<ReviewRow>(`/api/v1/reviews/${encodeURIComponent(uniqueId)}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  })
}

export type ReviewExportAuditPayload = {
  row_count: number
  export_type?: 'category_breakdown'
  search?: string
  category?: string
  priority?: string
  status?: string
  min_rating?: number
  max_rating?: number
  channel?: string
  start_date?: string
  end_date?: string
}

export function logReviewCsvExport(payload: ReviewExportAuditPayload) {
  return apiRequest<void>('/api/v1/reviews/export-audit', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export async function fetchReviewsUnified(query: ReviewQuery = {}): Promise<ReviewListResponse> {
  return fetchReviews(query)
}

export async function fetchAllReviewsUnified(
  query: Omit<ReviewQuery, 'limit' | 'offset'> = {},
): Promise<ReviewRow[]> {
  return fetchAllReviews(query)
}

export async function updateReviewUnified(uniqueId: string, payload: ReviewUpdatePayload) {
  return updateReview(uniqueId, payload)
}
