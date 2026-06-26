'use client'

import { useCallback, useState } from 'react'
import { useApp } from '@/context/AppContext'
import { adminAccountsAPI } from '@/lib/adminAccounts'
import { extractApiErrorMessage } from '@/lib/apiError'

export type AddMethod = 'oauth' | 'setup-token'
export type AuthInputMethod =
  | 'manual'
  | 'cookie'
  | 'refresh_token'
  | 'mobile_refresh_token'
  | 'session_token'
  | 'access_token'
  | 'codex_session'

export interface TokenInfo {
  org_uuid?: string
  account_uuid?: string
  email_address?: string
  [key: string]: unknown
}

export function useAccountOAuth() {
  const appStore = useApp()
  const [authUrl, setAuthUrl] = useState('')
  const [authCode, setAuthCode] = useState('')
  const [sessionId, setSessionId] = useState('')
  const [sessionKey, setSessionKey] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const resetState = useCallback(() => {
    setAuthUrl('')
    setAuthCode('')
    setSessionId('')
    setSessionKey('')
    setLoading(false)
    setError('')
  }, [])

  const generateAuthUrl = useCallback(
    async (addMethod: AddMethod, proxyId?: number | null): Promise<boolean> => {
      setLoading(true)
      setAuthUrl('')
      setSessionId('')
      setError('')

      try {
        const proxyConfig = proxyId ? { proxy_id: proxyId } : {}
        const endpoint =
          addMethod === 'oauth'
            ? '/admin/accounts/generate-auth-url'
            : '/admin/accounts/generate-setup-token-url'

        const response = await adminAccountsAPI.generateAuthUrl(endpoint, proxyConfig)
        setAuthUrl(response.auth_url)
        setSessionId(response.session_id)
        return true
      } catch (err: unknown) {
        const message = extractApiErrorMessage(err, 'Failed to generate auth URL')
        setError(message)
        appStore.showError(message)
        return false
      } finally {
        setLoading(false)
      }
    },
    [appStore],
  )

  const exchangeAuthCode = useCallback(
    async (addMethod: AddMethod, proxyId?: number | null): Promise<TokenInfo | null> => {
      if (!authCode.trim() || !sessionId) {
        setError('Missing auth code or session ID')
        return null
      }

      setLoading(true)
      setError('')

      try {
        const proxyConfig = proxyId ? { proxy_id: proxyId } : {}
        const endpoint =
          addMethod === 'oauth'
            ? '/admin/accounts/exchange-code'
            : '/admin/accounts/exchange-setup-token-code'

        const tokenInfo = await adminAccountsAPI.exchangeCode(endpoint, {
          session_id: sessionId,
          code: authCode.trim(),
          ...proxyConfig,
        })

        return tokenInfo as TokenInfo
      } catch (err: unknown) {
        const message = extractApiErrorMessage(err, 'Failed to exchange auth code')
        setError(message)
        appStore.showError(message)
        return null
      } finally {
        setLoading(false)
      }
    },
    [appStore, authCode, sessionId],
  )

  const cookieAuth = useCallback(
    async (
      addMethod: AddMethod,
      sessionKeyValue: string,
      proxyId?: number | null,
    ): Promise<TokenInfo | null> => {
      if (!sessionKeyValue.trim()) {
        setError('Please enter sessionKey')
        return null
      }

      setLoading(true)
      setError('')

      try {
        const proxyConfig = proxyId ? { proxy_id: proxyId } : {}
        const endpoint =
          addMethod === 'oauth'
            ? '/admin/accounts/cookie-auth'
            : '/admin/accounts/setup-token-cookie-auth'

        const tokenInfo = await adminAccountsAPI.exchangeCode(endpoint, {
          session_id: '',
          code: sessionKeyValue.trim(),
          ...proxyConfig,
        })

        return tokenInfo as TokenInfo
      } catch (err: unknown) {
        const message = extractApiErrorMessage(err, 'Cookie authorization failed')
        setError(message)
        return null
      } finally {
        setLoading(false)
      }
    },
    [],
  )

  const parseSessionKeys = useCallback((input: string): string[] => {
    return input
      .split('\n')
      .map((k) => k.trim())
      .filter((k) => k)
  }, [])

  const buildExtraInfo = useCallback((tokenInfo: TokenInfo): Record<string, string> | undefined => {
    const extra: Record<string, string> = {}
    if (tokenInfo.org_uuid) extra.org_uuid = tokenInfo.org_uuid
    if (tokenInfo.account_uuid) extra.account_uuid = tokenInfo.account_uuid
    if (tokenInfo.email_address) extra.email_address = tokenInfo.email_address
    return Object.keys(extra).length > 0 ? extra : undefined
  }, [])

  return {
    authUrl,
    authCode,
    sessionId,
    sessionKey,
    loading,
    error,
    setAuthCode,
    setSessionKey,
    resetState,
    generateAuthUrl,
    exchangeAuthCode,
    cookieAuth,
    parseSessionKeys,
    buildExtraInfo,
  }
}
