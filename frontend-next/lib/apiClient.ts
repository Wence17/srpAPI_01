import axios, { AxiosInstance, AxiosError, type InternalAxiosRequestConfig, type AxiosResponse } from 'axios'
import { getLocale } from './i18n'

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || '/api/v1'

export function getApiBaseUrl(): string {
  return API_BASE_URL.replace(/\/$/, '')
}

export const apiClient: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json'
  }
})

// ==================== Token Refresh State ====================

let isRefreshing = false
let refreshSubscribers: Array<(token: string) => void> = []

function subscribeTokenRefresh(callback: (token: string) => void): void {
  refreshSubscribers.push(callback)
}

function onTokenRefreshed(token: string): void {
  refreshSubscribers.forEach((callback) => callback(token))
  refreshSubscribers = []
}

// ==================== Request Interceptor ====================

function getUserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone
  } catch {
    return 'UTC'
  }
}

apiClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`
    }

    if (config.headers) {
      config.headers['Accept-Language'] = getLocale()
    }

    if (config.method === 'get') {
      if (!config.params) {
        config.params = {}
      }
      config.params.timezone = getUserTimezone()
    }

    return config
  },
  (error) => Promise.reject(error)
)

// ==================== Response Interceptor ====================

apiClient.interceptors.response.use(
  (response: AxiosResponse) => {
    // Unwrap standard API response format { code, message, data }
    const apiResponse = response.data as Record<string, unknown>
    if (apiResponse && typeof apiResponse === 'object' && 'code' in apiResponse) {
      if (apiResponse.code === 0) {
        response.data = apiResponse.data
      } else {
        const resp = apiResponse as Record<string, unknown>
        return Promise.reject({
          status: response.status,
          code: apiResponse.code,
          message: apiResponse.message || 'Unknown error',
          reason: resp.reason,
          metadata: resp.metadata,
        })
      }
    }
    return response
  },
  async (error: AxiosError) => {
    // Request cancellation: keep the original axios cancellation error so callers can ignore it.
    if (error.code === 'ERR_CANCELED' || axios.isCancel(error)) {
      return Promise.reject(error)
    }

    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean }

    if (error.response) {
      const status = error.response.status
      const data = error.response.data
      const url = String(error.config?.url || '')

      const apiData = (typeof data === 'object' && data !== null ? data : {}) as Record<string, any>

      // Ops monitoring disabled: treat as feature-flagged 404, and proactively redirect away.
      if (status === 404 && apiData.message === 'Ops monitoring is disabled') {
        if (typeof window !== 'undefined') {
          try {
            localStorage.setItem('ops_monitoring_enabled_cached', 'false')
          } catch {
            // ignore localStorage failures
          }
          try {
            window.dispatchEvent(new CustomEvent('ops-monitoring-disabled'))
          } catch {
            // ignore event failures
          }
          if (window.location.pathname.startsWith('/admin/ops')) {
            window.location.href = '/admin/settings'
          }
        }

        return Promise.reject({
          status,
          code: 'OPS_DISABLED',
          message: apiData.message || error.message,
          url
        })
      }

      // 401: Try to refresh the token if we have a refresh token
      if (status === 401 && !originalRequest._retry) {
        const refreshToken = typeof window !== 'undefined' ? localStorage.getItem('refresh_token') : null
        const isAuthEndpoint =
          url.includes('/auth/login') || url.includes('/auth/register') || url.includes('/auth/refresh')

        if (refreshToken && !isAuthEndpoint) {
          if (isRefreshing) {
            return new Promise((resolve, reject) => {
              subscribeTokenRefresh((newToken: string) => {
                if (newToken) {
                  originalRequest._retry = true
                  if (originalRequest.headers) {
                    originalRequest.headers.Authorization = `Bearer ${newToken}`
                  }
                  resolve(apiClient(originalRequest))
                } else {
                  reject({
                    status,
                    code: apiData.code,
                    message: apiData.message || apiData.detail || error.message
                  })
                }
              })
            })
          }

          originalRequest._retry = true
          isRefreshing = true

          try {
            const refreshResponse = await axios.post(
              `${API_BASE_URL}/auth/refresh`,
              { refresh_token: refreshToken },
              { headers: { 'Content-Type': 'application/json' } }
            )

            const refreshData = refreshResponse.data as Record<string, any>

            if (refreshData?.code === 0 && refreshData.data) {
              const { access_token, refresh_token: newRefreshToken, expires_in } = refreshData.data as Record<string, any>

              if (typeof window !== 'undefined') {
                localStorage.setItem('auth_token', access_token)
                localStorage.setItem('refresh_token', newRefreshToken)
                localStorage.setItem('token_expires_at', String(Date.now() + expires_in * 1000))
              }

              onTokenRefreshed(access_token)

              if (originalRequest.headers) {
                originalRequest.headers.Authorization = `Bearer ${access_token}`
              }

              isRefreshing = false
              return apiClient(originalRequest)
            }

            throw new Error('Token refresh failed')
          } catch {
            onTokenRefreshed('')
            isRefreshing = false

            if (typeof window !== 'undefined') {
              localStorage.removeItem('auth_token')
              localStorage.removeItem('refresh_token')
              localStorage.removeItem('auth_user')
              localStorage.removeItem('token_expires_at')
              sessionStorage.setItem('auth_expired', '1')

              if (!window.location.pathname.includes('/login')) {
                window.location.href = '/login'
              }
            }

            return Promise.reject({
              status: 401,
              code: 'TOKEN_REFRESH_FAILED',
              message: 'Session expired. Please log in again.'
            })
          }
        }

        // No refresh token or is auth endpoint - clear auth and redirect
        if (typeof window !== 'undefined') {
          const hasToken = !!localStorage.getItem('auth_token')
          const headers = error.config?.headers as Record<string, unknown> | undefined
          const authHeader = headers?.Authorization ?? headers?.authorization
          const sentAuth =
            typeof authHeader === 'string'
              ? authHeader.trim() !== ''
              : Array.isArray(authHeader)
                ? authHeader.length > 0
                : !!authHeader

          localStorage.removeItem('auth_token')
          localStorage.removeItem('refresh_token')
          localStorage.removeItem('auth_user')
          localStorage.removeItem('token_expires_at')
          if ((hasToken || sentAuth) && !isAuthEndpoint) {
            sessionStorage.setItem('auth_expired', '1')
          }
          if (!window.location.pathname.includes('/login')) {
            window.location.href = '/login'
          }
        }
      }

      // Return structured error
      return Promise.reject({
        status,
        code: apiData.code,
        reason: apiData.reason,
        error: apiData.error,
        message: apiData.message || apiData.detail || error.message,
        metadata: apiData.metadata,
      })
    }

    // Network error
    return Promise.reject({
      status: 0,
      message: 'Network error. Please check your connection.'
    })
  }
)

export default apiClient
