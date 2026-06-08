import axios, { AxiosInstance, AxiosError, type InternalAxiosRequestConfig } from 'axios'
import { getLocale } from './i18n'

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || '/api/v1'

export const apiClient: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json'
  }
})

let isRefreshing = false
let refreshSubscribers: Array<(token: string) => void> = []

function subscribeTokenRefresh(callback: (token: string) => void): void {
  refreshSubscribers.push(callback)
}

function onTokenRefreshed(token: string): void {
  refreshSubscribers.forEach((callback) => callback(token))
  refreshSubscribers = []
}

function getUserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone
  } catch {
    return 'UTC'
  }
}

apiClient.interceptors.request.use((config) => {
  const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null
  if (token && config.headers) {
    config.headers.Authorization = `Bearer ${token}`
  }
  if (config.headers) {
    config.headers['Accept-Language'] = getLocale()
  }
  if (config.method === 'get') {
    config.params = {
      ...(config.params || {}),
      timezone: getUserTimezone()
    }
  }
  return config
})

apiClient.interceptors.response.use(
  (response) => {
    const apiResponse = response.data as Record<string, unknown>
    if (apiResponse && typeof apiResponse === 'object' && 'code' in apiResponse) {
      if (apiResponse.code === 0) {
        response.data = apiResponse.data
      } else {
        const message = apiResponse.message || 'Unknown error'
        return Promise.reject({
          status: response.status,
          code: apiResponse.code,
          message,
          details: apiResponse
        })
      }
    }
    return response
  },
  async (error: AxiosError) => {
    if (axios.isCancel(error) || error.code === 'ERR_CANCELED') {
      return Promise.reject(error)
    }

    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean }
    const response = error.response
    const url = String(originalRequest?.url || '')

    if (response) {
      const status = response.status
      const data = response.data as Record<string, any>

      const apiData = typeof data === 'object' && data !== null ? data : {}
      if (status === 404 && apiData.message === 'Ops monitoring is disabled') {
        if (typeof window !== 'undefined') {
          try {
            localStorage.setItem('ops_monitoring_enabled_cached', 'false')
          } catch {
            // ignore
          }
          if (window.location.pathname.startsWith('/admin/ops')) {
            window.location.href = '/admin/settings'
          }
        }
        return Promise.reject({ status, code: 'OPS_DISABLED', message: apiData.message || error.message, url })
      }

      if (status === 401 && !originalRequest._retry) {
        const refreshToken = typeof window !== 'undefined' ? localStorage.getItem('refresh_token') : null
        const isAuthEndpoint = url.includes('/auth/login') || url.includes('/auth/register') || url.includes('/auth/refresh')

        if (refreshToken && !isAuthEndpoint) {
          if (isRefreshing) {
            return new Promise((resolve, reject) => {
              subscribeTokenRefresh((newToken) => {
                if (newToken) {
                  originalRequest._retry = true
                  if (originalRequest.headers) {
                    originalRequest.headers.Authorization = `Bearer ${newToken}`
                  }
                  resolve(apiClient(originalRequest))
                } else {
                  reject(error)
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
                if (newRefreshToken) {
                  localStorage.setItem('refresh_token', newRefreshToken)
                }
                if (typeof expires_in === 'number') {
                  localStorage.setItem('token_expires_at', String(Date.now() + expires_in * 1000))
                }
              }
              onTokenRefreshed(access_token)
              isRefreshing = false
              if (originalRequest.headers) {
                originalRequest.headers.Authorization = `Bearer ${access_token}`
              }
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
              if (!window.location.pathname.includes('/login')) {
                window.location.href = '/login'
              }
            }
            return Promise.reject({ status: 401, code: 'TOKEN_REFRESH_FAILED', message: 'Session expired. Please log in again.' })
          }
        }

        if (typeof window !== 'undefined') {
          localStorage.removeItem('auth_token')
          localStorage.removeItem('refresh_token')
          localStorage.removeItem('auth_user')
          localStorage.removeItem('token_expires_at')
          if (!window.location.pathname.includes('/login')) {
            window.location.href = '/login'
          }
        }
      }
    }

    return Promise.reject(error)
  }
)
