'use client'

import { useEffect, useRef, useState } from 'react'
import { useI18n } from '@/lib/i18n'
import { useApp } from '@/context/AppContext'
import { adminAccountsAPI } from '@/lib/adminAccounts'
import { extractApiErrorMessage } from '@/lib/apiError'
import { useAccountOAuth, type AddMethod } from '@/hooks/useAccountOAuth'
import { useOpenAIOAuth } from '@/hooks/useOpenAIOAuth'
import { useGeminiOAuth } from '@/hooks/useGeminiOAuth'
import { useAntigravityOAuth } from '@/hooks/useAntigravityOAuth'
import BaseDialog from '@/components/common/BaseDialog'
import Icon from '@/components/icons/Icon'
import OAuthAuthorizationFlow, {
  type OAuthAuthorizationFlowHandle,
} from '@/components/account/OAuthAuthorizationFlow'
import type { Account } from '@/lib/types'

interface ReAuthAccountModalProps {
  show: boolean
  account: Account | null
  onClose: () => void
  onReauthorized: () => void
}

type GeminiOAuthType = 'code_assist' | 'google_one' | 'ai_studio'

export default function ReAuthAccountModal({
  show,
  account,
  onClose,
  onReauthorized,
}: ReAuthAccountModalProps) {
  const appStore = useApp()
  const { t } = useI18n()

  const claudeOAuth = useAccountOAuth()
  const openaiOAuth = useOpenAIOAuth()
  const geminiOAuth = useGeminiOAuth()
  const antigravityOAuth = useAntigravityOAuth()
  const oauthFlowRef = useRef<OAuthAuthorizationFlowHandle | null>(null)

  const [addMethod, setAddMethod] = useState<AddMethod>('oauth')
  const [geminiOAuthType, setGeminiOAuthType] = useState<GeminiOAuthType>('code_assist')

  const isOpenAI = account?.platform === 'openai'
  const isOpenAILike = isOpenAI
  const isGemini = account?.platform === 'gemini'
  const isAnthropic = account?.platform === 'anthropic'
  const isAntigravity = account?.platform === 'antigravity'

  const currentAuthUrl = isOpenAILike
    ? openaiOAuth.authUrl
    : isGemini
      ? geminiOAuth.authUrl
      : isAntigravity
        ? antigravityOAuth.authUrl
        : claudeOAuth.authUrl

  const currentSessionId = isOpenAILike
    ? openaiOAuth.sessionId
    : isGemini
      ? geminiOAuth.sessionId
      : isAntigravity
        ? antigravityOAuth.sessionId
        : claudeOAuth.sessionId

  const currentLoading = isOpenAILike
    ? openaiOAuth.loading
    : isGemini
      ? geminiOAuth.loading
      : isAntigravity
        ? antigravityOAuth.loading
        : claudeOAuth.loading

  const currentError = isOpenAILike
    ? openaiOAuth.error
    : isGemini
      ? geminiOAuth.error
      : isAntigravity
        ? antigravityOAuth.error
        : claudeOAuth.error

  const isManualInputMethod =
    isOpenAILike ||
    isGemini ||
    isAntigravity ||
    oauthFlowRef.current?.inputMethod === 'manual'

  const canExchangeCode = Boolean(
    oauthFlowRef.current?.authCode.trim() && currentSessionId && !currentLoading,
  )

  const resetState = () => {
    setAddMethod('oauth')
    setGeminiOAuthType('code_assist')
    claudeOAuth.resetState()
    openaiOAuth.resetState()
    geminiOAuth.resetState()
    antigravityOAuth.resetState()
    oauthFlowRef.current?.reset()
  }

  useEffect(() => {
    if (show && account) {
      if (
        account.platform === 'anthropic' &&
        (account.type === 'oauth' || account.type === 'setup-token')
      ) {
        setAddMethod(account.type as AddMethod)
      }
      if (account.platform === 'gemini') {
        const creds = (account.credentials || {}) as Record<string, unknown>
        setGeminiOAuthType(
          creds.oauth_type === 'google_one'
            ? 'google_one'
            : creds.oauth_type === 'ai_studio'
              ? 'ai_studio'
              : 'code_assist',
        )
      }
    } else {
      resetState()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show, account])

  const handleClose = () => onClose()

  const handleGenerateUrl = async () => {
    if (!account) return

    if (isOpenAILike) {
      await openaiOAuth.generateAuthUrl(account.proxy_id)
    } else if (isGemini) {
      const creds = (account.credentials || {}) as Record<string, unknown>
      const tierId = typeof creds.tier_id === 'string' ? creds.tier_id : undefined
      const projectId =
        geminiOAuthType === 'code_assist' ? oauthFlowRef.current?.projectId : undefined
      await geminiOAuth.generateAuthUrl(account.proxy_id, projectId, geminiOAuthType, tierId)
    } else if (isAntigravity) {
      await antigravityOAuth.generateAuthUrl(account.proxy_id)
    } else {
      await claudeOAuth.generateAuthUrl(addMethod, account.proxy_id)
    }
  }

  const handleExchangeCode = async () => {
    if (!account) return

    const authCode = oauthFlowRef.current?.authCode || ''
    if (!authCode.trim()) return

    if (isOpenAILike) {
      const sessionId = openaiOAuth.sessionId
      if (!sessionId) return
      const stateToUse = (
        oauthFlowRef.current?.oauthState ||
        openaiOAuth.oauthState ||
        ''
      ).trim()
      if (!stateToUse) {
        appStore.showError(t('admin.accounts.oauth.authFailed'))
        return
      }

      const tokenInfo = await openaiOAuth.exchangeAuthCode(
        authCode.trim(),
        sessionId,
        stateToUse,
        account.proxy_id,
      )
      if (!tokenInfo) return

      try {
        await adminAccountsAPI.update(account.id, {
          type: 'oauth',
          credentials: openaiOAuth.buildCredentials(tokenInfo),
          extra: openaiOAuth.buildExtraInfo(tokenInfo),
        })
        await adminAccountsAPI.clearError(account.id)
        appStore.showSuccess(t('admin.accounts.reAuthorizedSuccess'))
        onReauthorized()
        handleClose()
      } catch (error: unknown) {
        appStore.showError(
          extractApiErrorMessage(error, t('admin.accounts.oauth.authFailed')),
        )
      }
    } else if (isGemini) {
      const sessionId = geminiOAuth.sessionId
      if (!sessionId) return

      const stateFromInput = oauthFlowRef.current?.oauthState || ''
      const stateToUse = stateFromInput || geminiOAuth.state
      if (!stateToUse) return

      const creds = (account.credentials || {}) as Record<string, unknown>
      const tokenInfo = await geminiOAuth.exchangeAuthCode({
        code: authCode.trim(),
        sessionId,
        state: stateToUse,
        proxyId: account.proxy_id,
        oauthType: geminiOAuthType,
        tierId: typeof creds.tier_id === 'string' ? creds.tier_id : undefined,
      })
      if (!tokenInfo) return

      try {
        await adminAccountsAPI.update(account.id, {
          type: 'oauth',
          credentials: geminiOAuth.buildCredentials(tokenInfo),
        })
        await adminAccountsAPI.clearError(account.id)
        appStore.showSuccess(t('admin.accounts.reAuthorizedSuccess'))
        onReauthorized()
        handleClose()
      } catch (error: unknown) {
        appStore.showError(
          extractApiErrorMessage(error, t('admin.accounts.oauth.authFailed')),
        )
      }
    } else if (isAntigravity) {
      const sessionId = antigravityOAuth.sessionId
      if (!sessionId) return

      const stateFromInput = oauthFlowRef.current?.oauthState || ''
      const stateToUse = stateFromInput || antigravityOAuth.state
      if (!stateToUse) return

      const tokenInfo = await antigravityOAuth.exchangeAuthCode({
        code: authCode.trim(),
        sessionId,
        state: stateToUse,
        proxyId: account.proxy_id,
      })
      if (!tokenInfo) return

      try {
        await adminAccountsAPI.update(account.id, {
          type: 'oauth',
          credentials: antigravityOAuth.buildCredentials(tokenInfo),
        })
        await adminAccountsAPI.clearError(account.id)
        appStore.showSuccess(t('admin.accounts.reAuthorizedSuccess'))
        onReauthorized()
        handleClose()
      } catch (error: unknown) {
        appStore.showError(
          extractApiErrorMessage(error, t('admin.accounts.oauth.authFailed')),
        )
      }
    } else {
      const sessionId = claudeOAuth.sessionId
      if (!sessionId) return

      try {
        const proxyConfig = account.proxy_id ? { proxy_id: account.proxy_id } : {}
        const endpoint =
          addMethod === 'oauth'
            ? '/admin/accounts/exchange-code'
            : '/admin/accounts/exchange-setup-token-code'

        const tokenInfo = await adminAccountsAPI.exchangeCode(endpoint, {
          session_id: sessionId,
          code: authCode.trim(),
          ...proxyConfig,
        })

        await adminAccountsAPI.update(account.id, {
          type: addMethod,
          credentials: tokenInfo,
          extra: claudeOAuth.buildExtraInfo(tokenInfo),
        })
        await adminAccountsAPI.clearError(account.id)

        appStore.showSuccess(t('admin.accounts.reAuthorizedSuccess'))
        onReauthorized()
        handleClose()
      } catch (error: unknown) {
        appStore.showError(
          extractApiErrorMessage(error, t('admin.accounts.oauth.authFailed')),
        )
      }
    }
  }

  const handleCookieAuth = async (sessionKey: string) => {
    if (!account || isOpenAILike) return

    try {
      const proxyConfig = account.proxy_id ? { proxy_id: account.proxy_id } : {}
      const endpoint =
        addMethod === 'oauth'
          ? '/admin/accounts/cookie-auth'
          : '/admin/accounts/setup-token-cookie-auth'

      const tokenInfo = await adminAccountsAPI.exchangeCode(endpoint, {
        session_id: '',
        code: sessionKey.trim(),
        ...proxyConfig,
      })

      await adminAccountsAPI.update(account.id, {
        type: addMethod,
        credentials: tokenInfo,
        extra: claudeOAuth.buildExtraInfo(tokenInfo),
      })
      await adminAccountsAPI.clearError(account.id)

      appStore.showSuccess(t('admin.accounts.reAuthorizedSuccess'))
      onReauthorized()
      handleClose()
    } catch (error: unknown) {
      appStore.showError(
        extractApiErrorMessage(error, t('admin.accounts.oauth.cookieAuthFailed')),
      )
    }
  }

  return (
    <BaseDialog
      show={show}
      title={t('admin.accounts.reAuthorizeAccount')}
      width="normal"
      onClose={handleClose}
      footer={
        account ? (
          <div className="flex justify-between gap-3">
            <button type="button" className="btn btn-secondary" onClick={handleClose}>
              {t('common.cancel')}
            </button>
            {isManualInputMethod ? (
              <button
                type="button"
                disabled={!canExchangeCode}
                className="btn btn-primary"
                onClick={() => void handleExchangeCode()}
              >
                {currentLoading ? (
                  <svg
                    className="-ml-1 mr-2 h-4 w-4 animate-spin"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                ) : null}
                {currentLoading
                  ? t('admin.accounts.oauth.verifying')
                  : t('admin.accounts.oauth.completeAuth')}
              </button>
            ) : null}
          </div>
        ) : undefined
      }
    >
      {account ? (
        <div className="space-y-4">
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-dark-600 dark:bg-dark-700">
            <div className="flex items-center gap-3">
              <div
                className={`flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br ${
                  isOpenAILike
                    ? 'from-green-500 to-green-600'
                    : isGemini
                      ? 'from-blue-500 to-blue-600'
                      : isAntigravity
                        ? 'from-purple-500 to-purple-600'
                        : 'from-orange-500 to-orange-600'
                }`}
              >
                <Icon name="sparkles" size="md" className="text-white" />
              </div>
              <div>
                <span className="block font-semibold text-gray-900 dark:text-white">
                  {account.name}
                </span>
                <span className="text-sm text-gray-500 dark:text-gray-400">
                  {isOpenAI
                    ? t('admin.accounts.openaiAccount')
                    : isGemini
                      ? t('admin.accounts.geminiAccount')
                      : isAntigravity
                        ? t('admin.accounts.antigravityAccount')
                        : t('admin.accounts.claudeCodeAccount')}
                </span>
              </div>
            </div>
          </div>

          {isAnthropic ? (
            <fieldset className="border-0 p-0">
              <legend className="input-label">{t('admin.accounts.oauth.authMethod')}</legend>
              <div className="mt-2 flex gap-4">
                {(['oauth', 'setup-token'] as const).map((method) => (
                  <label key={method} className="flex cursor-pointer items-center">
                    <input
                      type="radio"
                      value={method}
                      checked={addMethod === method}
                      className="mr-2 text-primary-600 focus:ring-primary-500"
                      onChange={() => setAddMethod(method)}
                    />
                    <span className="text-sm text-gray-700 dark:text-gray-300">
                      {method === 'oauth'
                        ? t('admin.accounts.types.oauth')
                        : t('admin.accounts.setupTokenLongLived')}
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
          ) : null}

          {isGemini ? (
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-dark-600 dark:bg-dark-700">
              <div className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                {t('admin.accounts.oauth.gemini.oauthTypeLabel')}
              </div>
              <div className="flex items-center gap-3">
                <div
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                    geminiOAuthType === 'google_one'
                      ? 'bg-purple-500 text-white'
                      : geminiOAuthType === 'code_assist'
                        ? 'bg-blue-500 text-white'
                        : 'bg-amber-500 text-white'
                  }`}
                >
                  {geminiOAuthType === 'google_one' ? (
                    <Icon name="user" size="sm" />
                  ) : geminiOAuthType === 'code_assist' ? (
                    <Icon name="cloud" size="sm" />
                  ) : (
                    <Icon name="sparkles" size="sm" />
                  )}
                </div>
                <div>
                  <span className="block text-sm font-medium text-gray-900 dark:text-white">
                    {geminiOAuthType === 'google_one'
                      ? 'Google One'
                      : geminiOAuthType === 'code_assist'
                        ? t('admin.accounts.gemini.oauthType.builtInTitle')
                        : t('admin.accounts.gemini.oauthType.customTitle')}
                  </span>
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    {geminiOAuthType === 'google_one'
                      ? '个人账号'
                      : geminiOAuthType === 'code_assist'
                        ? t('admin.accounts.gemini.oauthType.builtInDesc')
                        : t('admin.accounts.gemini.oauthType.customDesc')}
                  </span>
                </div>
              </div>
            </div>
          ) : null}

          <OAuthAuthorizationFlow
            ref={oauthFlowRef}
            addMethod={addMethod}
            authUrl={currentAuthUrl}
            sessionId={currentSessionId}
            loading={currentLoading}
            error={currentError}
            showHelp={isAnthropic}
            showProxyWarning={isAnthropic}
            showCookieOption={isAnthropic}
            allowMultiple={false}
            methodLabel={t('admin.accounts.inputMethod')}
            platform={
              isOpenAI ? 'openai' : isGemini ? 'gemini' : isAntigravity ? 'antigravity' : 'anthropic'
            }
            showProjectId={isGemini && geminiOAuthType === 'code_assist'}
            onGenerateUrl={() => void handleGenerateUrl()}
            onCookieAuth={(sessionKey) => void handleCookieAuth(sessionKey)}
          />
        </div>
      ) : null}
    </BaseDialog>
  )
}
