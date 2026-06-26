'use client'

import { useCallback, useState } from 'react'
import { useApp } from '@/context/AppContext'
import { useI18n } from '@/lib/i18n'
import { adminAccountsAPI } from '@/lib/adminAccounts'
import { extractApiErrorMessage, extractI18nErrorMessage } from '@/lib/apiError'

export interface OpenAITokenInfo {
  access_token?: string
  refresh_token?: string
  client_id?: string
  id_token?: string
  token_type?: string
  expires_in?: number
  expires_at?: number
  scope?: string
  email?: string
  name?: string
  plan_type?: string
  privacy_mode?: string
  chatgpt_account_id?: string
  chatgpt_user_id?: string
  organization_id?: string
  [key: string]: unknown
}

export function useOpenAIOAuth() {
  const appStore = useApp()
  const { t } = useI18n()
  const endpointPrefix = '/admin/openai'

  const [authUrl, setAuthUrl] = useState('')
  const [sessionId, setSessionId] = useState('')
  const [oauthState, setOauthState] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const resetState = useCallback(() => {
    setAuthUrl('')
    setSessionId('')
    setOauthState('')
    setLoading(false)
    setError('')
  }, [])

  const generateAuthUrl = useCallback(
    async (proxyId?: number | null, redirectUri?: string): Promise<boolean> => {
      setLoading(true)
      setAuthUrl('')
      setSessionId('')
      setOauthState('')
      setError('')

      try {
        const payload: Record<string, unknown> = {}
        if (proxyId) payload.proxy_id = proxyId
        if (redirectUri) payload.redirect_uri = redirectUri

        const response = await adminAccountsAPI.generateAuthUrl(
          `${endpointPrefix}/generate-auth-url`,
          payload,
        )
        setAuthUrl(response.auth_url)
        setSessionId(response.session_id)
        try {
          const parsed = new URL(response.auth_url)
          setOauthState(parsed.searchParams.get('state') || '')
        } catch {
          setOauthState('')
        }
        return true
      } catch (err: unknown) {
        const message = extractApiErrorMessage(
          err,
          t('admin.accounts.oauth.openai.failedToGenerateUrl'),
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
    async (
      code: string,
      currentSessionId: string,
      state: string,
      proxyId?: number | null,
    ): Promise<OpenAITokenInfo | null> => {
      if (!code.trim() || !currentSessionId || !state.trim()) {
        setError('Missing auth code, session ID, or state')
        return null
      }

      setLoading(true)
      setError('')

      try {
        const payload: { session_id: string; code: string; state: string; proxy_id?: number } = {
          session_id: currentSessionId,
          code: code.trim(),
          state: state.trim(),
        }
        if (proxyId) payload.proxy_id = proxyId

        const tokenInfo = await adminAccountsAPI.exchangeCode(
          `${endpointPrefix}/exchange-code`,
          payload,
        )
        return tokenInfo as OpenAITokenInfo
      } catch (err: unknown) {
        const message = extractI18nErrorMessage(
          err,
          t,
          'admin.accounts.oauth.openai.errors',
          t('admin.accounts.oauth.openai.failedToExchangeCode'),
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

  const buildCredentials = useCallback((tokenInfo: OpenAITokenInfo): Record<string, unknown> => {
    const creds: Record<string, unknown> = {
      access_token: tokenInfo.access_token,
      expires_at: tokenInfo.expires_at,
    }
    if (tokenInfo.refresh_token) creds.refresh_token = tokenInfo.refresh_token
    if (tokenInfo.id_token) creds.id_token = tokenInfo.id_token
    if (tokenInfo.email) creds.email = tokenInfo.email
    if (tokenInfo.chatgpt_account_id) creds.chatgpt_account_id = tokenInfo.chatgpt_account_id
    if (tokenInfo.chatgpt_user_id) creds.chatgpt_user_id = tokenInfo.chatgpt_user_id
    if (tokenInfo.organization_id) creds.organization_id = tokenInfo.organization_id
    if (tokenInfo.plan_type) creds.plan_type = tokenInfo.plan_type
    if (tokenInfo.client_id) creds.client_id = tokenInfo.client_id
    return creds
  }, [])

  const buildExtraInfo = useCallback(
    (tokenInfo: OpenAITokenInfo): Record<string, string> | undefined => {
      const extra: Record<string, string> = {}
      if (tokenInfo.email) extra.email = tokenInfo.email
      if (tokenInfo.name) extra.name = tokenInfo.name
      if (tokenInfo.privacy_mode) extra.privacy_mode = tokenInfo.privacy_mode
      return Object.keys(extra).length > 0 ? extra : undefined
    },
    [],
  )

  const validateRefreshToken = useCallback(
    async (
      refreshToken: string,
      proxyId?: number | null,
      clientId?: string,
    ): Promise<OpenAITokenInfo | null> => {
      if (!refreshToken.trim()) {
        setError('Missing refresh token')
        return null
      }

      setLoading(true)
      setError('')

      try {
        const tokenInfo = await adminAccountsAPI.refreshOpenAIToken(
          refreshToken.trim(),
          proxyId,
          `${endpointPrefix}/refresh-token`,
          clientId,
        )
        return tokenInfo as OpenAITokenInfo
      } catch (err: unknown) {
        const message = extractI18nErrorMessage(
          err,
          t,
          'admin.accounts.oauth.openai.errors',
          t('admin.accounts.oauth.openai.failedToValidateRT'),
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

  return {
    authUrl,
    sessionId,
    oauthState,
    loading,
    error,
    resetState,
    generateAuthUrl,
    exchangeAuthCode,
    validateRefreshToken,
    buildCredentials,
    buildExtraInfo,
  }
}
