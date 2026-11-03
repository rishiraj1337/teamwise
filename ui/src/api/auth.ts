import { apiRequest } from './client'
import type { ChangePasswordPayload, TokenResponse, UserPublic, UserRegister } from '../types/auth'

export function login(email: string, password: string) {
  return apiRequest<TokenResponse>('/api/v1/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  })
}

export function register(payload: UserRegister) {
  return apiRequest<UserPublic>('/api/v1/auth/register', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function fetchCurrentUser() {
  return apiRequest<UserPublic>('/api/v1/auth/me')
}

export function changePassword(payload: ChangePasswordPayload) {
  return apiRequest<void>('/api/v1/auth/change-password', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function requestForgotPassword(email: string) {
  return apiRequest<{ message: string }>('/api/v1/auth/forgot-password', {
    method: 'POST',
    body: JSON.stringify({ email }),
  })
}

export function verifyResetOtp(email: string, otp: string) {
  return apiRequest<void>('/api/v1/auth/verify-reset-otp', {
    method: 'POST',
    body: JSON.stringify({ email, otp }),
  })
}

export function resetPassword(payload: {
  email: string
  otp: string
  new_password: string
  confirm_new_password: string
}) {
  return apiRequest<void>('/api/v1/auth/reset-password', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function logout() {
  return apiRequest<void>('/api/v1/auth/logout', { method: 'POST' })
}

export function checkHealth() {
  return apiRequest<{ status: string }>('/api/v1/health')
}
