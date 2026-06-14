'use client'

import { useCallback, useState } from 'react'
import { useApp } from '@/context/AppContext'
import { useI18n } from '@/lib/i18n'
import { apiClient } from '@/lib/apiClient'
import { extractApiErrorMessage } from '@/lib/apiError'

export interface AntigravityTokenInfo {
  access_token?: string
  refresh_token?: string
  token_type?: string
  expires_at?: number | string
  expires_in?: number
  project_id?: string
  email?: string
  [key: string]: unknown
}

interface AntigravityAuthUrlResponse {
  auth_url: string
  session_id: string
  state: string
}

export function useAntigravityOAuth() {
  const appStore = useApp()
  const { t } = useI18n()

  const [authUrl, setAuthUrl] = useState('')
  const [sessionId, setSessionId] = useState('')
  const [state, setState] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const resetState = useCallback(() => {
    setAuthUrl('')
    setSessionId('')
    setState('')
    setLoading(false)
    setError('')
  }, [])

  const generateAuthUrl = useCallback(
    async (proxyId: number | null | undefined): Promise<boolean> => {
      setLoading(true)
      setAuthUrl('')
      setSessionId('')
      setState('')
      setError('')

      try {
        const payload: Record<string, unknown> = {}
        if (proxyId) payload.proxy_id = proxyId

        const { data } = await apiClient.post<AntigravityAuthUrlResponse>(
          '/admin/antigravity/oauth/auth-url',
          payload,
        )
        setAuthUrl(data.auth_url)
        setSessionId(data.session_id)
        setState(data.state)
        return true
      } catch (err: unknown) {
        const message = extractApiErrorMessage(
          err,
          t('admin.accounts.oauth.antigravity.failedToGenerateUrl'),
        )
        setError(message)
        appStore.showError(message)
        return false
      } finally {
        setLoading(false)
      }
    },
    [appStore, t],
  )

  const exchangeAuthCode = useCallback(
    async (params: {
      code: string
      sessionId: string
      state: string
      proxyId?: number | null
    }): Promise<AntigravityTokenInfo | null> => {
      const code = params.code?.trim()
      if (!code || !params.sessionId || !params.state) {
        setError(t('admin.accounts.oauth.antigravity.missingExchangeParams'))
        return null
      }

      setLoading(true)
      setError('')

      try {
        const payload: Record<string, unknown> = {
          session_id: params.sessionId,
          state: params.state,
          code,
        }
        if (params.proxyId) payload.proxy_id = params.proxyId

        const { data } = await apiClient.post<AntigravityTokenInfo>(
          '/admin/antigravity/oauth/exchange-code',
          payload,
        )
        return data
      } catch (err: unknown) {
        const message = extractApiErrorMessage(
          err,
          t('admin.accounts.oauth.antigravity.failedToExchangeCode'),
        )
        setError(message)
        appStore.showError(message)
        return null
      } finally {
        setLoading(false)
      }
    },
    [appStore, t],
  )

  const buildCredentials = useCallback(
    (tokenInfo: AntigravityTokenInfo): Record<string, unknown> => {
      let expiresAt: string | undefined
      if (typeof tokenInfo.expires_at === 'number' && Number.isFinite(tokenInfo.expires_at)) {
        expiresAt = Math.floor(tokenInfo.expires_at).toString()
      } else if (typeof tokenInfo.expires_at === 'string' && tokenInfo.expires_at.trim()) {
        expiresAt = tokenInfo.expires_at.trim()
      }

      return {
        access_token: tokenInfo.access_token,
        refresh_token: tokenInfo.refresh_token,
        token_type: tokenInfo.token_type,
        expires_at: expiresAt,
        project_id: tokenInfo.project_id,
        email: tokenInfo.email,
      }
    },
    [],
  )

  const validateRefreshToken = useCallback(
    async (
      refreshToken: string,
      proxyId?: number | null,
    ): Promise<AntigravityTokenInfo | null> => {
      if (!refreshToken.trim()) {
        setError(t('admin.accounts.oauth.antigravity.pleaseEnterRefreshToken'))
        return null
      }

      setLoading(true)
      setError('')

      try {
        const payload: Record<string, unknown> = { refresh_token: refreshToken.trim() }
        if (proxyId) payload.proxy_id = proxyId

        const { data } = await apiClient.post<AntigravityTokenInfo>(
          '/admin/antigravity/oauth/refresh-token',
          payload,
        )
        return data
      } catch (err: unknown) {
        const message = extractApiErrorMessage(
          err,
          t('admin.accounts.oauth.antigravity.failedToValidateRT'),
        )
        setError(message)
        return null
      } finally {
        setLoading(false)
      }
    },
    [t],
  )

  return {
    authUrl,
    sessionId,
    state,
    loading,
    error,
    resetState,
    generateAuthUrl,
    exchangeAuthCode,
    validateRefreshToken,
    buildCredentials,
  }
}
