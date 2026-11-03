import type { ReviewListResponse, ReviewQuery, ReviewRow, ReviewUpdatePayload } from './reviews'
import { platformApiRequest } from './platformClient'

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
  if (query.min_rating != null) params.set('starRating', String(query.min_rating))
  params.set('sortBy', query.sort_by ?? 'created_at')
  params.set('sortOrder', query.sort_order ?? 'DESC')
  return params
}

export async function fetchPlatformReviews(query: ReviewQuery = {}): Promise<ReviewListResponse> {
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

export async function fetchAllPlatformReviews(
  query: Omit<ReviewQuery, 'limit' | 'offset'> = {},
): Promise<ReviewRow[]> {
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

export function updatePlatformReview(uniqueId: string, payload: ReviewUpdatePayload) {
  return platformApiRequest<{ review: ReviewRow }>(`/api/reviews/${encodeURIComponent(uniqueId)}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  }).then((result) => result.review)
}

export async function downloadPlatformReviewExport(format: 'csv' | 'json' = 'csv'): Promise<Blob> {
  const token = localStorage.getItem('teamwise_platform_token')
  if (!token) throw new Error('Enterprise platform session is not available.')
  const API_BASE = import.meta.env.VITE_API_URL ?? ''
  const response = await fetch(`${API_BASE}/api/reviews/export?format=${format}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!response.ok) {
    throw new Error('Export failed')
  }
  return response.blob()
}
