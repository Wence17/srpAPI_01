'use client'

import { useCallback, useState } from 'react'
import { useApp } from '@/context/AppContext'
import { useI18n } from '@/lib/i18n'
import { apiClient } from '@/lib/apiClient'
import { extractApiErrorMessage } from '@/lib/apiError'

export interface GeminiTokenInfo {
  access_token?: string
  refresh_token?: string
  token_type?: string
  scope?: string
  expires_at?: number | string
  project_id?: string
  oauth_type?: string
  tier_id?: string
  extra?: Record<string, unknown>
  [key: string]: unknown
}

interface GeminiAuthUrlResponse {
  auth_url: string
  session_id: string
  state: string
}

export interface GeminiOAuthCapabilities {
  ai_studio_oauth_enabled: boolean
  required_redirect_uris: string[]
}

export function useGeminiOAuth() {
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
    async (
      proxyId: number | null | undefined,
      projectId?: string | null,
      oauthType?: string,
      tierId?: string,
    ): Promise<boolean> => {
      setLoading(true)
      setAuthUrl('')
      setSessionId('')
      setState('')
      setError('')

      try {
        const payload: Record<string, unknown> = {}
        if (proxyId) payload.proxy_id = proxyId
        const trimmedProjectID = projectId?.trim()
        if (trimmedProjectID) payload.project_id = trimmedProjectID
        if (oauthType) payload.oauth_type = oauthType
        const trimmedTierID = tierId?.trim()
        if (trimmedTierID) payload.tier_id = trimmedTierID

        const { data } = await apiClient.post<GeminiAuthUrlResponse>(
          '/admin/gemini/oauth/auth-url',
          payload,
        )
        setAuthUrl(data.auth_url)
        setSessionId(data.session_id)
        setState(data.state)
        return true
      } catch (err: unknown) {
        const message = extractApiErrorMessage(
          err,
          t('admin.accounts.oauth.gemini.failedToGenerateUrl'),
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
      oauthType?: string
      tierId?: string
    }): Promise<GeminiTokenInfo | null> => {
      const code = params.code?.trim()
      if (!code || !params.sessionId || !params.state) {
        setError(t('admin.accounts.oauth.gemini.missingExchangeParams'))
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
        if (params.oauthType) payload.oauth_type = params.oauthType
        const trimmedTierID = params.tierId?.trim()
        if (trimmedTierID) payload.tier_id = trimmedTierID

        const { data } = await apiClient.post<GeminiTokenInfo>(
          '/admin/gemini/oauth/exchange-code',
          payload,
        )
        return data
      } catch (err: unknown) {
        const errorMessage = extractApiErrorMessage(err, '')
        const message = errorMessage.includes('missing project_id')
          ? t('admin.accounts.oauth.gemini.missingProjectId')
          : errorMessage || t('admin.accounts.oauth.gemini.failedToExchangeCode')
        setError(message)
        appStore.showError(message)
        return null
      } finally {
        setLoading(false)
      }
    },
    [appStore, t],
  )

  const buildCredentials = useCallback((tokenInfo: GeminiTokenInfo): Record<string, unknown> => {
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
      scope: tokenInfo.scope,
      project_id: tokenInfo.project_id,
      oauth_type: tokenInfo.oauth_type,
      tier_id: tokenInfo.tier_id,
    }
  }, [])

  const buildExtraInfo = useCallback(
    (tokenInfo: GeminiTokenInfo): Record<string, unknown> | undefined => {
      if (!tokenInfo.extra || typeof tokenInfo.extra !== 'object') return undefined
      return tokenInfo.extra
    },
    [],
  )

  const getCapabilities = useCallback(async (): Promise<GeminiOAuthCapabilities | null> => {
    try {
      const { data } = await apiClient.get<GeminiOAuthCapabilities>(
        '/admin/gemini/oauth/capabilities',
      )
      return data
    } catch {
      // Capabilities are optional for older servers; don't block the UI.
      return null
    }
  }, [])

  return {
    authUrl,
    sessionId,
    state,
    loading,
    error,
    resetState,
    generateAuthUrl,
    exchangeAuthCode,
    buildCredentials,
    buildExtraInfo,
    getCapabilities,
  }
}
