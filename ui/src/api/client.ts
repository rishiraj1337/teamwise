import { parseApiErrorBody } from '../utils/apiErrors'

const API_BASE = import.meta.env.VITE_API_URL ?? ''

const TOKEN_KEY = 'teamwise_access_token'
const USER_PROFILE_KEY = 'teamwise_user_profile'

export type StoredUserProfile = {
  email: string
  emp_id: string
  name: string
}

export function getStoredToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

export function setStoredToken(token: string | null) {
  if (token) localStorage.setItem(TOKEN_KEY, token)
  else localStorage.removeItem(TOKEN_KEY)
}

export function getStoredUserProfile(): StoredUserProfile | null {
  const raw = localStorage.getItem(USER_PROFILE_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw) as StoredUserProfile
  } catch {
    return null
  }
}

export function setStoredUserProfile(profile: StoredUserProfile | null) {
  if (profile) localStorage.setItem(USER_PROFILE_KEY, JSON.stringify(profile))
  else localStorage.removeItem(USER_PROFILE_KEY)
}

export class ApiError extends Error {
  status: number
  fieldErrors: Record<string, string>

  constructor(status: number, message: string, fieldErrors: Record<string, string> = {}) {
    super(message)
    this.status = status
    this.fieldErrors = fieldErrors
  }
}

async function readErrorResponse(response: Response): Promise<{ message: string; fieldErrors: Record<string, string> }> {
  try {
    const body = await response.json()
    return parseApiErrorBody(body, response.status)
  } catch {
    return { message: response.statusText || 'Request failed', fieldErrors: {} }
  }
}

export async function apiRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getStoredToken()
  const headers = new Headers(options.headers)
  if (options.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }
  if (token) {
    headers.set('Authorization', `Bearer ${token}`)
  }

  const response = await fetch(`${API_BASE}${path}`, { ...options, headers })
  if (!response.ok) {
    const { message, fieldErrors } = await readErrorResponse(response)
    throw new ApiError(response.status, message, fieldErrors)
  }
  if (response.status === 204) {
    return undefined as T
  }
  return (await response.json()) as T
}
