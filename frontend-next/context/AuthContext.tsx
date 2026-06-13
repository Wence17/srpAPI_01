'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { getAuthToken, getPersistedAuthUser, getTokenExpiresAt, setTokenExpiresAt, setAuthToken, setAuthUser, setRefreshToken, clearAuthStorage, getCurrentUser, login as authLogin, login2FA as authLogin2FA, register as authRegister, logout as authLogout, refreshToken as authRefreshToken, getPersistedPendingAuthSession, persistPendingAuthSession, clearPendingAuthSessionStorage } from '@/lib/auth'
import type { AuthResponse, LoginRequest, LoginResponse, RegisterRequest, TotpLoginResponse, PendingAuthSessionSummary, User } from '@/lib/types'

interface AuthContextValue {
  user: User | null
  token: string | null
  pendingAuthSession: PendingAuthSessionSummary | null
  isAuthenticated: boolean
  isAdmin: boolean
  isSimpleMode: boolean
  login: (credentials: LoginRequest) => Promise<LoginResponse>
  login2FA: (payload: { temp_token: string; totp_code: string }) => Promise<AuthResponse>
  register: (payload: RegisterRequest) => Promise<AuthResponse>
  logout: () => Promise<void>
  setToken: (newToken: string) => Promise<User>
  setPendingAuthSession: (session: PendingAuthSessionSummary | null) => void
  clearPendingAuthSession: () => void
  refreshUser: () => Promise<void>
  updateUser: (user: User) => void
  checkAuth: () => void
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

const AUTO_REFRESH_INTERVAL = 60 * 1000
const TOKEN_REFRESH_BUFFER = 120 * 1000

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(() => {
    const persisted = getPersistedAuthUser()
    return persisted as User | null
  })
  const [token, setTokenState] = useState<string | null>(() => getAuthToken())
  const [pendingAuthSession, setPendingAuthSessionState] = useState<PendingAuthSessionSummary | null>(
    () => getPersistedPendingAuthSession(),
  )
  const [isReady, setIsReady] = useState(false)

  const isAuthenticated = useMemo(() => !!token && !!user, [token, user])
  const isAdmin = useMemo(() => user?.role === 'admin', [user])
  const isSimpleMode = useMemo(() => user?.run_mode === 'simple', [user])

  const updateUser = useCallback((nextUser: User) => {
    setUser(nextUser)
    setAuthUser(nextUser)
  }, [])

  const refreshUser = useCallback(async () => {
    try {
      const response = await getCurrentUser()
      setUser(response)
      if (response && token) {
        setAuthUser(response)
      }
    } catch (error) {
      console.error('Failed to refresh user:', error)
      setUser(null)
    }
  }, [token])

  const scheduleTokenRefresh = useCallback(() => {
    const expiresAt = getTokenExpiresAt()
    if (!expiresAt) {
      return
    }
    const refreshAt = expiresAt - TOKEN_REFRESH_BUFFER
    const delay = Math.max(0, refreshAt - Date.now())
    if (delay <= 0) {
      return
    }
    const timer = window.setTimeout(async () => {
      try {
        const refreshData = await authRefreshToken()
        setTokenState(refreshData.access_token)
        setAuthToken(refreshData.access_token)
        if (refreshData.refresh_token) {
          setRefreshToken(refreshData.refresh_token)
        }
        if (typeof refreshData.expires_in === 'number') {
          setTokenExpiresAt(refreshData.expires_in)
        }
      } catch {
        await logout()
      }
    }, delay)

    return () => window.clearTimeout(timer)
  }, [])

  const login = useCallback(async (credentials: LoginRequest) => {
    const response = await authLogin(credentials)
    if (!('requires_2fa' in response)) {
      setTokenState(response.access_token)
      setAuthToken(response.access_token)
      if (response.refresh_token) {
        setRefreshToken(response.refresh_token)
      }
      if (response.expires_in) {
        setTokenExpiresAt(response.expires_in)
      }
      setUser(response.user)
    }
    return response
  }, [])

  const login2FA = useCallback(async (payload: { temp_token: string; totp_code: string }) => {
    const response = await authLogin2FA(payload)
    setTokenState(response.access_token)
    setAuthToken(response.access_token)
    if (response.refresh_token) {
      setRefreshToken(response.refresh_token)
    }
    if (response.expires_in) {
      setTokenExpiresAt(response.expires_in)
    }
    setUser(response.user)
    return response
  }, [])

  const register = useCallback(async (payload: RegisterRequest) => {
    const response = await authRegister(payload)
    setTokenState(response.access_token)
    setAuthToken(response.access_token)
    if (response.refresh_token) {
      setRefreshToken(response.refresh_token)
    }
    if (response.expires_in) {
      setTokenExpiresAt(response.expires_in)
    }
    setUser(response.user)
    return response
  }, [])

  const setToken = useCallback(async (newToken: string) => {
    setTokenState(newToken)
    setAuthToken(newToken)
    const userData = await getCurrentUser()
    setUser(userData)
    setAuthUser(userData)
    clearPendingAuthSessionStorage()
    setPendingAuthSessionState(null)
    return userData
  }, [])

  const setPendingAuthSession = useCallback((session: PendingAuthSessionSummary | null) => {
    setPendingAuthSessionState(session)
    if (session) {
      persistPendingAuthSession(session)
    } else {
      clearPendingAuthSessionStorage()
    }
  }, [])

  const clearPendingAuthSession = useCallback(() => {
    setPendingAuthSessionState(null)
    clearPendingAuthSessionStorage()
  }, [])

  const logout = useCallback(async () => {
    try {
      await authLogout()
    } finally {
      clearAuthStorage()
      setUser(null)
      setTokenState(null)
    }
  }, [])

  const checkAuth = useCallback(() => {
    const authToken = getAuthToken()
    const persistedUser = getPersistedAuthUser() as User | null
    setTokenState(authToken)
    setUser(persistedUser)
    setPendingAuthSessionState(getPersistedPendingAuthSession())
    setIsReady(true)
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    checkAuth()
  }, [checkAuth])

  useEffect(() => {
    if (!isReady || !token) return
    const stopRefresh = scheduleTokenRefresh()
    return () => {
      if (stopRefresh) stopRefresh()
    }
  }, [isReady, token, scheduleTokenRefresh])

  useEffect(() => {
    if (isAuthenticated) {
      const interval = window.setInterval(() => {
        refreshUser().catch(console.error)
      }, AUTO_REFRESH_INTERVAL)
      return () => window.clearInterval(interval)
    }
    return undefined
  }, [isAuthenticated, refreshUser])

  const value = useMemo(
    () => ({
      user,
      token,
      pendingAuthSession,
      isAuthenticated,
      isAdmin,
      isSimpleMode,
      login,
      login2FA,
      register,
      logout,
      setToken,
      setPendingAuthSession,
      clearPendingAuthSession,
      refreshUser,
      updateUser,
      checkAuth,
    }),
    [
      user,
      token,
      pendingAuthSession,
      isAuthenticated,
      isAdmin,
      isSimpleMode,
      login,
      login2FA,
      register,
      logout,
      setToken,
      setPendingAuthSession,
      clearPendingAuthSession,
      refreshUser,
      updateUser,
      checkAuth,
    ],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return context
}
