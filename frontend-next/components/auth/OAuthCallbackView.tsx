'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useAuth } from '@/context/AuthContext'
import { useApp } from '@/context/AppContext'
import { useI18n } from '@/lib/i18n'
import { useClipboard } from '@/lib/useClipboard'
import { apiClient } from '@/lib/apiClient'
import { getApiBaseUrl } from '@/lib/apiClient'
import {
  exchangePendingOAuthCompletion,
  persistOAuthTokenContext,
} from '@/lib/auth'
import type { OAuthTokenResponse } from '@/lib/types'
import {
  clearAllAffiliateReferralCodes,
  loadOAuthAffiliateCode,
  oauthAffiliatePayload,
} from '@/lib/oauthAffiliate'
import {
  parseFragmentParams,
  readTokenResponseFromFragment,
  sanitizeRedirectPath,
} from '@/lib/oauthCallback'

const EMAIL_OAUTH_PENDING_PROVIDER_KEY = 'email_oauth_pending_provider'

type EmailOAuthPendingCompletion = Partial<OAuthTokenResponse> & {
  error?: string
  provider?: string
  redirect?: string
  email?: string
  resolved_email?: string
  invitation_required?: boolean
}

interface OAuthCallbackViewProps {
  isEmailOAuthRoute?: boolean
}

export default function OAuthCallbackView({ isEmailOAuthRoute = false }: OAuthCallbackViewProps) {
  const { t } = useI18n()
  const router = useRouter()
  const searchParams = useSearchParams()
  const authStore = useAuth()
  const appStore = useApp()
  const { copyToClipboard } = useClipboard()

  const [isProcessing, setIsProcessing] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [needsRegistrationCompletion, setNeedsRegistrationCompletion] = useState(false)
  const [invitationRequired, setInvitationRequired] = useState(false)
  const [registrationEmail, setRegistrationEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [invitationCode, setInvitationCode] = useState('')
  const [registrationError, setRegistrationError] = useState('')
  const [pendingProvider, setPendingProvider] = useState<'github' | 'google'>('github')
  const [redirectTo, setRedirectTo] = useState('/dashboard')
  const [invalidCallback, setInvalidCallback] = useState(false)

  const code = searchParams.get('code') || ''
  const state = searchParams.get('state') || ''
  const error = searchParams.get('error') || searchParams.get('error_description') || ''

  const fullUrl = useMemo(() => {
    if (typeof window === 'undefined') return ''
    return window.location.href
  }, [])

  const providerName = pendingProvider === 'google' ? 'Google' : 'GitHub'
  const registrationHint = invitationRequired
    ? t('auth.oidc.invitationRequired', { providerName })
    : t('auth.oidc.completeRegistration')

  const canSubmitRegistration =
    registrationEmail.trim() !== '' &&
    password.length >= 6 &&
    password === confirmPassword &&
    (!invitationRequired || invitationCode.trim() !== '')

  const readPendingEmailOAuthProvider = (): 'github' | 'google' | null => {
    if (typeof window === 'undefined') return null
    const provider = window.sessionStorage.getItem(EMAIL_OAUTH_PENDING_PROVIDER_KEY)
    if (provider === 'github' || provider === 'google') return provider
    return null
  }

  const redirectProviderCallbackToBackend = useCallback(
    (provider: 'github' | 'google') => {
      if (typeof window === 'undefined') return
      const normalized = getApiBaseUrl()
      const params = new URLSearchParams()
      searchParams.forEach((value, key) => {
        params.append(key, value)
      })
      const suffix = params.toString() ? `?${params.toString()}` : ''
      window.location.href = `${normalized}/auth/oauth/${provider}/callback${suffix}`
    },
    [searchParams],
  )

  const finalizeTokenResponse = useCallback(
    async (tokenResponse: OAuthTokenResponse, redirect: string) => {
      persistOAuthTokenContext(tokenResponse)
      await authStore.setToken(tokenResponse.access_token)
      if (typeof window !== 'undefined') {
        window.sessionStorage.removeItem(EMAIL_OAUTH_PENDING_PROVIDER_KEY)
      }
      clearAllAffiliateReferralCodes()
      appStore.showSuccess(t('auth.loginSuccess'))
      router.replace(sanitizeRedirectPath(redirect))
    },
    [authStore, appStore, router, t],
  )

  const hasOAuthTokenResponse = (value: Partial<OAuthTokenResponse>): value is OAuthTokenResponse => {
    return typeof value.access_token === 'string' && value.access_token.trim() !== ''
  }

  const resumePendingEmailOAuth = useCallback(async () => {
    setIsProcessing(true)
    let registrationNeeded = false
    try {
      const completion = (await exchangePendingOAuthCompletion()) as EmailOAuthPendingCompletion
      const completionRedirect = completion.redirect || '/dashboard'
      if (hasOAuthTokenResponse(completion)) {
        await finalizeTokenResponse(completion, completionRedirect)
        return
      }

      const provider = String(completion.provider || '').toLowerCase()
      if (provider === 'github' || provider === 'google') {
        setPendingProvider(provider)
      }
      setRedirectTo(sanitizeRedirectPath(completionRedirect))

      if (
        completion.error === 'invitation_required' ||
        completion.error === 'registration_completion_required'
      ) {
        registrationNeeded = true
        setInvitationRequired(
          completion.error === 'invitation_required' || completion.invitation_required === true,
        )
        setRegistrationEmail(String(completion.resolved_email || completion.email || '').trim())
        setNeedsRegistrationCompletion(true)
        setIsProcessing(false)
        return
      }

      appStore.showError(completion.error || t('auth.loginFailed'))
    } catch (e: unknown) {
      const err = e as { message?: string; response?: { data?: { message?: string } } }
      const message = err.response?.data?.message || err.message || t('auth.loginFailed')
      appStore.showError(message)
      setInvalidCallback(true)
    } finally {
      if (!registrationNeeded) {
        setIsProcessing(false)
      }
    }
  }, [appStore, finalizeTokenResponse, t])

  const handleSubmitRegistration = async () => {
    setRegistrationError('')
    if (!registrationEmail.trim()) {
      setRegistrationError(t('auth.emailRequired'))
      return
    }
    if (password.length < 6) {
      setRegistrationError(t('auth.passwordMinLength'))
      return
    }
    if (password !== confirmPassword) {
      setRegistrationError(t('auth.passwordsDoNotMatch'))
      return
    }
    const codeValue = invitationCode.trim()
    if (invitationRequired && !codeValue) return

    setIsSubmitting(true)
    try {
      const payload: { password: string; invitation_code?: string; aff_code?: string } = {
        password,
        ...oauthAffiliatePayload(loadOAuthAffiliateCode()),
      }
      if (invitationRequired) {
        payload.invitation_code = codeValue
      }
      const { data } = await apiClient.post<OAuthTokenResponse>(
        `/auth/oauth/${pendingProvider}/complete-registration`,
        payload,
      )
      await finalizeTokenResponse(data, redirectTo)
    } catch (e: unknown) {
      const err = e as { message?: string; response?: { data?: { message?: string } } }
      setRegistrationError(
        err.response?.data?.message || err.message || t('auth.oidc.completeRegistrationFailed'),
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  useEffect(() => {
    if (error) {
      appStore.showError(error)
    }
  }, [error, appStore])

  useEffect(() => {
    const params = parseFragmentParams()
    const tokenResponse = readTokenResponseFromFragment(params)
    const fragmentError = params.get('error') || ''
    const fragmentErrorDescription =
      params.get('error_description') || params.get('error_message') || ''

    if (fragmentError) {
      appStore.showError(fragmentErrorDescription || fragmentError)
      return
    }

    if (!tokenResponse) {
      if (isEmailOAuthRoute) {
        const pendingEmailOAuthProvider = readPendingEmailOAuthProvider()
        if (pendingEmailOAuthProvider && code && state) {
          redirectProviderCallbackToBackend(pendingEmailOAuthProvider)
          return
        }
        void resumePendingEmailOAuth()
      }
      return
    }

    setIsProcessing(true)
    finalizeTokenResponse(tokenResponse, params.get('redirect') || '/dashboard').catch((err: unknown) => {
      const message = (err as { message?: string })?.message || t('auth.loginFailed')
      appStore.showError(message)
      setIsProcessing(false)
    })
  }, [
    appStore,
    code,
    finalizeTokenResponse,
    isEmailOAuthRoute,
    redirectProviderCallbackToBackend,
    resumePendingEmailOAuth,
    state,
    t,
  ])

  const copy = (value: string) => {
    if (!value) return
    void copyToClipboard(value)
  }

  if (isProcessing) {
    return (
      <div className="min-h-screen bg-gray-50 px-4 py-10 dark:bg-dark-900">
        <div className="mx-auto max-w-2xl">
          <div className="card p-6 text-center">
            <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-primary-500 border-t-transparent" />
            <h1 className="mt-4 text-lg font-semibold text-gray-900 dark:text-white">
              {t('auth.oauth.callbackTitle')}
            </h1>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">{t('auth.oauth.callbackHint')}</p>
          </div>
        </div>
      </div>
    )
  }

  if (needsRegistrationCompletion) {
    return (
      <div className="min-h-screen bg-gray-50 px-4 py-10 dark:bg-dark-900">
        <div className="mx-auto max-w-2xl">
          <div className="card p-6">
            <h1 className="text-lg font-semibold text-gray-900 dark:text-white">
              {t('auth.oidc.callbackTitle', { providerName })}
            </h1>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">{registrationHint}</p>

            <div className="mt-6 space-y-4">
              <div>
                <label className="input-label">{t('auth.emailLabel')}</label>
                <input
                  className="input w-full"
                  type="email"
                  value={registrationEmail}
                  readOnly
                  disabled
                />
              </div>
              <div>
                <label className="input-label">{t('auth.passwordLabel')}</label>
                <input
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  type="password"
                  className="input w-full"
                  placeholder={t('auth.createPasswordPlaceholder')}
                  disabled={isSubmitting}
                  autoComplete="new-password"
                  onKeyUp={(e) => e.key === 'Enter' && handleSubmitRegistration()}
                />
              </div>
              <div>
                <label className="input-label">{t('auth.confirmPassword')}</label>
                <input
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  type="password"
                  className="input w-full"
                  placeholder={t('auth.confirmPasswordPlaceholder')}
                  disabled={isSubmitting}
                  autoComplete="new-password"
                  onKeyUp={(e) => e.key === 'Enter' && handleSubmitRegistration()}
                />
              </div>
              {invitationRequired && (
                <div>
                  <label className="input-label">{t('auth.invitationCodeLabel')}</label>
                  <input
                    value={invitationCode}
                    onChange={(e) => setInvitationCode(e.target.value)}
                    type="text"
                    className="input w-full"
                    placeholder={t('auth.invitationCodePlaceholder')}
                    disabled={isSubmitting}
                    onKeyUp={(e) => e.key === 'Enter' && handleSubmitRegistration()}
                  />
                </div>
              )}
              {registrationError && (
                <p className="text-sm text-red-600 dark:text-red-400">{registrationError}</p>
              )}
              <button
                className="btn btn-primary w-full"
                type="button"
                disabled={isSubmitting || !canSubmitRegistration}
                onClick={handleSubmitRegistration}
              >
                {isSubmitting ? t('common.processing') : t('auth.oidc.completeRegistration')}
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (invalidCallback) {
    return (
      <div className="min-h-screen bg-gray-50 px-4 py-10 dark:bg-dark-900">
        <div className="mx-auto max-w-2xl">
          <div className="card p-6 text-center">
            <h1 className="text-lg font-semibold text-gray-900 dark:text-white">
              {t('auth.oauth.invalidCallbackTitle')}
            </h1>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
              {t('auth.oauth.invalidCallbackHint')}
            </p>
            <button
              className="btn btn-primary mt-6"
              type="button"
              onClick={() => router.replace('/login')}
            >
              {t('auth.backToLogin')}
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-10 dark:bg-dark-900">
      <div className="mx-auto max-w-2xl">
        <div className="card p-6">
          <h1 className="text-lg font-semibold text-gray-900 dark:text-white">
            {t('auth.oauth.callbackTitle')}
          </h1>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">{t('auth.oauth.callbackHint')}</p>

          <div className="mt-6 space-y-4">
            <div>
              <label className="input-label">{t('auth.oauth.code')}</label>
              <div className="flex gap-2">
                <input className="input flex-1 font-mono text-sm" value={code} readOnly />
                <button
                  className="btn btn-secondary"
                  type="button"
                  disabled={!code}
                  onClick={() => copy(code)}
                >
                  {t('common.copy')}
                </button>
              </div>
            </div>

            <div>
              <label className="input-label">{t('auth.oauth.state')}</label>
              <div className="flex gap-2">
                <input className="input flex-1 font-mono text-sm" value={state} readOnly />
                <button
                  className="btn btn-secondary"
                  type="button"
                  disabled={!state}
                  onClick={() => copy(state)}
                >
                  {t('common.copy')}
                </button>
              </div>
            </div>

            <div>
              <label className="input-label">{t('auth.oauth.fullUrl')}</label>
              <div className="flex gap-2">
                <input className="input flex-1 font-mono text-xs" value={fullUrl} readOnly />
                <button
                  className="btn btn-secondary"
                  type="button"
                  disabled={!fullUrl}
                  onClick={() => copy(fullUrl)}
                >
                  {t('common.copy')}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
