import { parseApiErrorBody } from '../utils/apiErrors'
import { ApiError, getStoredUserProfile } from './client'

const PLATFORM_TOKEN_KEY = 'teamwise_platform_token'

export function getPlatformToken(): string | null {
  return localStorage.getItem(PLATFORM_TOKEN_KEY)
}

export function setPlatformToken(token: string | null) {
  if (token) localStorage.setItem(PLATFORM_TOKEN_KEY, token)
  else localStorage.removeItem(PLATFORM_TOKEN_KEY)
}

export async function fetchPlatformAccessToken(): Promise<string> {
  const { apiRequest } = await import('./client')
  const response = await apiRequest<{ token: string }>('/api/v1/platform/access-token')
  return response.token
}

export async function ensurePlatformSession(): Promise<string | null> {
  const existing = getPlatformToken()
  if (existing) return existing
  try {
    const token = await fetchPlatformAccessToken()
    setPlatformToken(token)
    return token
  } catch {
    setPlatformToken(null)
    return null
  }
}

export function clearPlatformSession() {
  setPlatformToken(null)
}

async function readErrorResponse(response: Response) {
  try {
    const body = await response.json()
    return parseApiErrorBody(body, response.status)
  } catch {
    return { message: response.statusText || 'Request failed', fieldErrors: {} }
  }
}

export async function platformApiRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getPlatformToken()
  if (!token) {
    throw new ApiError(401, 'Enterprise platform session is not available.')
  }

  const API_BASE = import.meta.env.VITE_API_URL ?? ''
  const headers = new Headers(options.headers)
  if (options.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }
  headers.set('Authorization', `Bearer ${token}`)
  const actor = getStoredUserProfile()
  if (actor?.email) {
    headers.set('X-Teamwise-Actor-Email', actor.email)
    headers.set('X-Teamwise-Actor-Emp-Id', actor.emp_id)
    headers.set('X-Teamwise-Actor-Name', actor.name)
  }

  const response = await fetch(`${API_BASE}${path}`, { ...options, headers })
  if (!response.ok) {
    const { message, fieldErrors } = await readErrorResponse(response)
    throw new ApiError(response.status, message, fieldErrors)
  }
  if (response.status === 204) {
    return undefined as T
  }

  const contentType = response.headers.get('Content-Type') ?? ''
  if (contentType.includes('application/json')) {
    return (await response.json()) as T
  }
  return (await response.text()) as T
}
