import { apiClient } from './apiClient'
import type { LoginRequest, RegisterRequest, AuthResponse, LoginResponse, TotpLoginResponse } from './types'

const AUTH_TOKEN_KEY = 'auth_token'
const REFRESH_TOKEN_KEY = 'refresh_token'
const TOKEN_EXPIRES_AT_KEY = 'token_expires_at'
const AUTH_USER_KEY = 'auth_user'

export function setAuthToken(token: string): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(AUTH_TOKEN_KEY, token)
}

export function setRefreshToken(token: string): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(REFRESH_TOKEN_KEY, token)
}

export function setTokenExpiresAt(expiresIn: number): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(TOKEN_EXPIRES_AT_KEY, String(Date.now() + expiresIn * 1000))
}

export function setAuthUser(user: unknown): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(AUTH_USER_KEY, JSON.stringify(user))
}

export function getAuthToken(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem(AUTH_TOKEN_KEY)
}

export function getRefreshToken(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem(REFRESH_TOKEN_KEY)
}

export function getTokenExpiresAt(): number | null {
  if (typeof window === 'undefined') return null
  const raw = localStorage.getItem(TOKEN_EXPIRES_AT_KEY)
  return raw ? parseInt(raw, 10) : null
}

export function getPersistedAuthUser() {
  if (typeof window === 'undefined') return null
  const raw = localStorage.getItem(AUTH_USER_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

export function clearAuthStorage(): void {
  if (typeof window === 'undefined') return
  localStorage.removeItem(AUTH_TOKEN_KEY)
  localStorage.removeItem(REFRESH_TOKEN_KEY)
  localStorage.removeItem(TOKEN_EXPIRES_AT_KEY)
  localStorage.removeItem(AUTH_USER_KEY)
}

export function isTotp2FARequired(response: LoginResponse): response is TotpLoginResponse {
  return typeof response === 'object' && response !== null && 'requires_2fa' in response && response.requires_2fa === true
}

export async function login(credentials: LoginRequest): Promise<LoginResponse> {
  const response = await apiClient.post<LoginResponse>('/auth/login', credentials)
  const data = response.data
  if (!isTotp2FARequired(data)) {
    setAuthToken(data.access_token)
    if (data.refresh_token) {
      setRefreshToken(data.refresh_token)
    }
    if (data.expires_in) {
      setTokenExpiresAt(data.expires_in)
    }
    setAuthUser(data.user)
  }
  return data
}

export async function login2FA(request: { temp_token: string; totp_code: string }): Promise<AuthResponse> {
  const response = await apiClient.post<AuthResponse>('/auth/login/2fa', request)
  const data = response.data
  setAuthToken(data.access_token)
  if (data.refresh_token) {
    setRefreshToken(data.refresh_token)
  }
  if (data.expires_in) {
    setTokenExpiresAt(data.expires_in)
  }
  setAuthUser(data.user)
  return data
}

export async function register(userData: RegisterRequest): Promise<AuthResponse> {
  const response = await apiClient.post<AuthResponse>('/auth/register', userData)
  const data = response.data
  setAuthToken(data.access_token)
  if (data.refresh_token) {
    setRefreshToken(data.refresh_token)
  }
  if (data.expires_in) {
    setTokenExpiresAt(data.expires_in)
  }
  setAuthUser(data.user)
  return data
}

export async function getCurrentUser(): Promise<{ user: { id: string; email: string; role?: string } }> {
  const response = await apiClient.get<{ user: { id: string; email: string; role?: string } }>('/auth/me')
  return response.data
}

export async function logout(): Promise<void> {
  const refreshToken = getRefreshToken()
  if (refreshToken) {
    try {
      await apiClient.post('/auth/logout', { refresh_token: refreshToken })
    } catch {
      // ignore
    }
  }
  clearAuthStorage()
}

export async function refreshToken(): Promise<{ access_token: string; refresh_token: string; expires_in: number }> {
  const refreshTokenValue = getRefreshToken()
  if (!refreshTokenValue) {
    throw new Error('No refresh token available')
  }
  const response = await apiClient.post<{ access_token: string; refresh_token: string; expires_in: number }>('/auth/refresh', {
    refresh_token: refreshTokenValue
  })
  return response.data
}

export async function getPublicSettings(): Promise<unknown> {
  const response = await apiClient.get<unknown>('/settings/public')
  return response.data
}
