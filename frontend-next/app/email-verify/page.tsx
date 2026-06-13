'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import AuthLayout from '@/components/layout/AuthLayout'
import Icon from '@/components/icons/Icon'
import TurnstileWidget, { type TurnstileWidgetHandle } from '@/components/TurnstileWidget'
import { useAuth } from '@/context/AuthContext'
import { useApp } from '@/context/AppContext'
import { useI18n } from '@/lib/i18n'
import { apiClient } from '@/lib/apiClient'
import {
  getPublicSettings,
  isOAuthLoginCompletion,
  persistOAuthTokenContext,
  sendPendingOAuthVerifyCode,
  sendVerifyCode,
} from '@/lib/auth'
import { buildAuthErrorMessage } from '@/lib/authError'
import {
  formatRegistrationEmailSuffixWhitelistForMessage,
  isRegistrationEmailSuffixAllowed,
  normalizeRegistrationEmailSuffixWhitelist,
} from '@/lib/registrationEmailPolicy'
import {
  clearAllAffiliateReferralCodes,
  loadAffiliateReferralCode,
  oauthAffiliatePayload,
} from '@/lib/oauthAffiliate'
import type {
  OAuthTokenResponse,
  PendingAuthSessionSummary,
  PendingAuthTokenField,
  PendingOAuthSendVerifyCodeResponse,
} from '@/lib/types'

type PendingOAuthCreateAccountResponse = OAuthTokenResponse & {
  auth_result?: string
}

export default function VerifyEmailPage() {
  const { t, locale } = useI18n()
  const auth = useAuth()
  const app = useApp()
  const router = useRouter()

  const [isLoading, setIsLoading] = useState(false)
  const [isSendingCode, setIsSendingCode] = useState(false)
  const [codeSent, setCodeSent] = useState(false)
  const [verifyCode, setVerifyCodeValue] = useState('')
  const [countdown, setCountdown] = useState(0)

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [initialTurnstileToken, setInitialTurnstileToken] = useState('')
  const [promoCode, setPromoCode] = useState('')
  const [invitationCode, setInvitationCode] = useState('')
  const [affCode, setAffCode] = useState('')
  const [pendingAuthToken, setPendingAuthToken] = useState('')
  const [pendingAuthTokenField, setPendingAuthTokenField] =
    useState<PendingAuthTokenField>('pending_auth_token')
  const [pendingProvider, setPendingProvider] = useState('')
  const [pendingRedirect, setPendingRedirect] = useState('')
  const [pendingAdoptionDecision, setPendingAdoptionDecision] = useState<{
    adoptDisplayName?: boolean
    adoptAvatar?: boolean
  } | null>(null)
  const [hasRegisterData, setHasRegisterData] = useState(false)

  const [turnstileEnabled, setTurnstileEnabled] = useState(false)
  const [turnstileSiteKey, setTurnstileSiteKey] = useState('')
  const [siteName, setSiteName] = useState('Sub2API')
  const [registrationEmailSuffixWhitelist, setRegistrationEmailSuffixWhitelist] = useState<string[]>(
    [],
  )

  const turnstileRef = useRef<TurnstileWidgetHandle>(null)
  const [resendTurnstileToken, setResendTurnstileToken] = useState('')
  const [showResendTurnstile, setShowResendTurnstile] = useState(false)
  const [errors, setErrors] = useState({ code: '', turnstile: '' })

  const countdownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const validationToastMessage = errors.code || errors.turnstile

  useEffect(() => {
    if (validationToastMessage) {
      app.showError(validationToastMessage)
    }
  }, [validationToastMessage, app])

  useEffect(() => {
    return () => {
      if (countdownTimerRef.current) {
        clearInterval(countdownTimerRef.current)
      }
    }
  }, [])

  useEffect(() => {
    const activePendingSession = auth.pendingAuthSession as PendingAuthSessionSummary | null
    const registerDataStr = sessionStorage.getItem('register_data')

    if (registerDataStr) {
      try {
        const registerData = JSON.parse(registerDataStr) as Record<string, unknown>
        const nextEmail = typeof registerData.email === 'string' ? registerData.email : ''
        const nextPassword = typeof registerData.password === 'string' ? registerData.password : ''
        setEmail(nextEmail)
        setPassword(nextPassword)
        setInitialTurnstileToken(
          typeof registerData.turnstile_token === 'string' ? registerData.turnstile_token : '',
        )
        setPromoCode(typeof registerData.promo_code === 'string' ? registerData.promo_code : '')
        setInvitationCode(
          typeof registerData.invitation_code === 'string' ? registerData.invitation_code : '',
        )
        setAffCode(
          typeof registerData.aff_code === 'string'
            ? registerData.aff_code
            : loadAffiliateReferralCode(),
        )
        setPendingAuthToken(
          typeof registerData.pending_auth_token === 'string'
            ? registerData.pending_auth_token
            : activePendingSession?.token || '',
        )
        setPendingAuthTokenField(
          registerData.pending_auth_token_field === 'pending_oauth_token'
            ? 'pending_oauth_token'
            : activePendingSession?.token_field || 'pending_auth_token',
        )
        setPendingProvider(
          typeof registerData.pending_provider === 'string'
            ? registerData.pending_provider
            : activePendingSession?.provider || '',
        )
        setPendingRedirect(
          typeof registerData.pending_redirect === 'string'
            ? registerData.pending_redirect
            : activePendingSession?.redirect || '',
        )
        const adoption = registerData.pending_adoption_decision as
          | { adopt_display_name?: boolean; adopt_avatar?: boolean }
          | undefined
        setPendingAdoptionDecision(
          adoption
            ? {
                adoptDisplayName: adoption.adopt_display_name === true,
                adoptAvatar: adoption.adopt_avatar === true,
              }
            : null,
        )
        setHasRegisterData(Boolean(nextEmail && nextPassword))
      } catch {
        setHasRegisterData(false)
      }
    } else if (activePendingSession) {
      setPendingAuthToken(activePendingSession.token)
      setPendingAuthTokenField(activePendingSession.token_field)
      setPendingProvider(activePendingSession.provider)
      setPendingRedirect(activePendingSession.redirect || '')
    }

    getPublicSettings()
      .then((settings) => {
        setTurnstileEnabled(settings.turnstile_enabled)
        setTurnstileSiteKey(settings.turnstile_site_key || '')
        setSiteName(settings.site_name || 'Sub2API')
        setRegistrationEmailSuffixWhitelist(
          normalizeRegistrationEmailSuffixWhitelist(
            settings.registration_email_suffix_whitelist || [],
          ),
        )
      })
      .catch((error) => {
        console.error('Failed to load public settings:', error)
      })
  }, [auth.pendingAuthSession])

  useEffect(() => {
    if (hasRegisterData) {
      void sendCode()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasRegisterData])

  function startCountdown(seconds: number) {
    setCountdown(seconds)
    if (countdownTimerRef.current) {
      clearInterval(countdownTimerRef.current)
    }
    countdownTimerRef.current = setInterval(() => {
      setCountdown((value) => {
        if (value <= 1) {
          if (countdownTimerRef.current) {
            clearInterval(countdownTimerRef.current)
            countdownTimerRef.current = null
          }
          return 0
        }
        return value - 1
      })
    }, 1000)
  }

  function onTurnstileVerify(token: string) {
    setResendTurnstileToken(token)
    setErrors((prev) => ({ ...prev, turnstile: '' }))
  }

  function onTurnstileExpire() {
    setResendTurnstileToken('')
    setErrors((prev) => ({ ...prev, turnstile: t('auth.turnstileExpired') }))
  }

  function onTurnstileError() {
    setResendTurnstileToken('')
    setErrors((prev) => ({ ...prev, turnstile: t('auth.turnstileFailed') }))
  }

  function isPendingOAuthFlow() {
    return Boolean(pendingProvider.trim())
  }

  function shouldBypassRegistrationEmailPolicy() {
    return isPendingOAuthFlow() || Boolean(pendingAuthToken.trim())
  }

  function resolvePendingOAuthCallbackRoute(provider: string) {
    switch (provider.trim().toLowerCase()) {
      case 'linuxdo':
        return '/auth/linuxdo/callback'
      case 'oidc':
        return '/auth/oidc/callback'
      case 'wechat':
        return '/auth/wechat/callback'
      default:
        return '/auth/callback'
    }
  }

  function isPendingOAuthSessionResponse(data: PendingOAuthCreateAccountResponse) {
    return data.auth_result === 'pending_session'
  }

  function getPendingOAuthSendCodeSessionResponse(data: PendingOAuthSendVerifyCodeResponse) {
    return data.auth_result === 'pending_session' ? data : null
  }

  function persistPendingOAuthSession(provider: string, redirect?: string) {
    auth.setPendingAuthSession({
      token: pendingAuthToken,
      token_field: pendingAuthTokenField,
      provider: provider.trim() || pendingProvider.trim(),
      redirect: redirect || pendingRedirect || undefined,
    })
  }

  function buildEmailSuffixNotAllowedMessage() {
    const normalizedWhitelist = normalizeRegistrationEmailSuffixWhitelist(
      registrationEmailSuffixWhitelist,
    )
    if (normalizedWhitelist.length === 0) {
      return t('auth.emailSuffixNotAllowed')
    }
    const separator = String(locale || '').toLowerCase().startsWith('zh') ? '、' : ', '
    return t('auth.emailSuffixNotAllowedWithAllowed', {
      suffixes: formatRegistrationEmailSuffixWhitelistForMessage(normalizedWhitelist, {
        separator,
        more: (count) => t('auth.emailSuffixAllowedMore', { count }),
      }),
    })
  }

  async function sendCode() {
    setIsSendingCode(true)
    try {
      if (
        !shouldBypassRegistrationEmailPolicy() &&
        !isRegistrationEmailSuffixAllowed(email, registrationEmailSuffixWhitelist)
      ) {
        app.showError(buildEmailSuffixNotAllowedMessage())
        return
      }

      const requestPayload = {
        email,
        [pendingAuthTokenField]: pendingAuthToken || undefined,
        turnstile_token: resendTurnstileToken || initialTurnstileToken || undefined,
      } as Parameters<typeof sendVerifyCode>[0]

      const response = isPendingOAuthFlow()
        ? await sendPendingOAuthVerifyCode(requestPayload)
        : await sendVerifyCode(requestPayload)

      const pendingSendCodeSession = isPendingOAuthFlow()
        ? getPendingOAuthSendCodeSessionResponse(response as PendingOAuthSendVerifyCodeResponse)
        : null

      if (pendingSendCodeSession) {
        sessionStorage.removeItem('register_data')
        persistPendingOAuthSession(
          pendingSendCodeSession.provider || pendingProvider,
          pendingSendCodeSession.redirect,
        )
        router.push(
          resolvePendingOAuthCallbackRoute(
            pendingSendCodeSession.provider || pendingProvider,
          ),
        )
        return
      }

      setCodeSent(true)
      startCountdown(response.countdown)
      setInitialTurnstileToken('')
      setShowResendTurnstile(false)
      setResendTurnstileToken('')
    } catch (error: unknown) {
      app.showError(buildAuthErrorMessage(error, { fallback: t('auth.sendCodeFailed') }))
    } finally {
      setIsSendingCode(false)
    }
  }

  async function handleResendCode() {
    if (turnstileEnabled && !showResendTurnstile) {
      setShowResendTurnstile(true)
      return
    }
    if (turnstileEnabled && !resendTurnstileToken) {
      setErrors((prev) => ({ ...prev, turnstile: t('auth.completeVerification') }))
      return
    }
    await sendCode()
  }

  function validateForm() {
    if (!verifyCode.trim()) {
      setErrors({ code: t('auth.codeRequired'), turnstile: '' })
      return false
    }
    if (!/^\d{6}$/.test(verifyCode.trim())) {
      setErrors({ code: t('auth.invalidCode'), turnstile: '' })
      return false
    }
    setErrors({ code: '', turnstile: '' })
    return true
  }

  async function handleVerify(event: React.FormEvent) {
    event.preventDefault()
    if (!validateForm()) return

    setIsLoading(true)
    try {
      if (
        !shouldBypassRegistrationEmailPolicy() &&
        !isRegistrationEmailSuffixAllowed(email, registrationEmailSuffixWhitelist)
      ) {
        app.showError(buildEmailSuffixNotAllowedMessage())
        return
      }

      if (isPendingOAuthFlow()) {
        const { data } = await apiClient.post<PendingOAuthCreateAccountResponse>(
          '/auth/oauth/pending/create-account',
          {
            email,
            password,
            verify_code: verifyCode.trim(),
            invitation_code: invitationCode || undefined,
            ...oauthAffiliatePayload(affCode || loadAffiliateReferralCode()),
            adopt_display_name: pendingAdoptionDecision?.adoptDisplayName,
            adopt_avatar: pendingAdoptionDecision?.adoptAvatar,
          },
        )

        if (isPendingOAuthSessionResponse(data)) {
          sessionStorage.removeItem('register_data')
          persistPendingOAuthSession(data.provider || pendingProvider, data.redirect)
          router.push(resolvePendingOAuthCallbackRoute(data.provider || pendingProvider))
          return
        }

        if (!isOAuthLoginCompletion(data)) {
          throw new Error(t('auth.verifyFailed'))
        }

        persistOAuthTokenContext(data)
        await auth.setToken(data.access_token)
        auth.clearPendingAuthSession()
      } else {
        await auth.register({
          email,
          password,
          verify_code: verifyCode.trim(),
          turnstile_token: initialTurnstileToken || undefined,
          promo_code: promoCode || undefined,
          invitation_code: invitationCode || undefined,
          ...(affCode ? { aff_code: affCode } : {}),
        })
      }

      sessionStorage.removeItem('register_data')
      clearAllAffiliateReferralCodes()
      app.showSuccess(t('auth.accountCreatedSuccess', { siteName }))
      router.push(pendingRedirect || '/dashboard')
    } catch (error: unknown) {
      app.showError(buildAuthErrorMessage(error, { fallback: t('auth.verifyFailed') }))
    } finally {
      setIsLoading(false)
    }
  }

  function handleBack() {
    sessionStorage.removeItem('register_data')
    router.push('/register')
  }

  return (
    <AuthLayout
      footer={
        <button
          type="button"
          onClick={handleBack}
          className="flex items-center gap-2 text-gray-500 transition-colors hover:text-gray-700 dark:text-dark-400 dark:hover:text-gray-300"
        >
          <Icon name="arrowLeft" size="sm" />
          {t('auth.backToRegistration')}
        </button>
      }
    >
      <div className="space-y-6">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
            {t('auth.verifyYourEmail')}
          </h2>
          <p className="mt-2 text-sm text-gray-500 dark:text-dark-400">
            {t('auth.sendCodeDesc')}{' '}
            <span className="font-medium text-gray-700 dark:text-gray-300">{email}</span>
          </p>
        </div>

        {!hasRegisterData ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-800/50 dark:bg-amber-900/20">
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0">
                <Icon name="exclamationCircle" size="md" className="text-amber-500" />
              </div>
              <div className="text-sm text-amber-700 dark:text-amber-400">
                <p className="font-medium">{t('auth.sessionExpired')}</p>
                <p className="mt-1">{t('auth.sessionExpiredDesc')}</p>
              </div>
            </div>
          </div>
        ) : (
          <form onSubmit={handleVerify} className="space-y-5">
            <div>
              <label htmlFor="code" className="input-label text-center">
                {t('auth.verificationCode')}
              </label>
              <input
                id="code"
                value={verifyCode}
                onChange={(event) => setVerifyCodeValue(event.target.value)}
                type="text"
                required
                autoComplete="one-time-code"
                inputMode="numeric"
                maxLength={6}
                disabled={isLoading}
                className={`input py-3 text-center font-mono text-xl tracking-[0.5em]${errors.code ? ' input-error' : ''}`}
                placeholder="000000"
              />
              <p className="input-hint text-center">{t('auth.verificationCodeHint')}</p>
            </div>

            {codeSent ? (
              <div className="rounded-xl border border-green-200 bg-green-50 p-4 dark:border-green-800/50 dark:bg-green-900/20">
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0">
                    <Icon name="checkCircle" size="md" className="text-green-500" />
                  </div>
                  <p className="text-sm text-green-700 dark:text-green-400">
                    {t('auth.codeSentSuccess')}
                  </p>
                </div>
              </div>
            ) : null}

            {turnstileEnabled && turnstileSiteKey && showResendTurnstile ? (
              <div>
                <TurnstileWidget
                  ref={turnstileRef}
                  siteKey={turnstileSiteKey}
                  onVerify={onTurnstileVerify}
                  onExpire={onTurnstileExpire}
                  onError={onTurnstileError}
                />
              </div>
            ) : null}

            <button
              type="submit"
              disabled={isLoading || !verifyCode}
              className="btn btn-primary w-full"
            >
              {isLoading ? (
                <svg
                  className="-ml-1 mr-2 h-4 w-4 animate-spin text-white"
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
              ) : (
                <Icon name="checkCircle" size="md" className="mr-2" />
              )}
              {isLoading ? t('auth.verifying') : t('auth.verifyAndCreate')}
            </button>

            <div className="text-center">
              {countdown > 0 ? (
                <button
                  type="button"
                  disabled
                  className="cursor-not-allowed text-sm text-gray-400 dark:text-dark-500"
                >
                  {t('auth.resendCountdown', { countdown })}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => void handleResendCode()}
                  disabled={
                    isSendingCode ||
                    (turnstileEnabled && showResendTurnstile && !resendTurnstileToken)
                  }
                  className="text-sm text-primary-600 transition-colors hover:text-primary-500 disabled:cursor-not-allowed disabled:opacity-50 dark:text-primary-400 dark:hover:text-primary-300"
                >
                  {isSendingCode ? (
                    t('auth.sendingCode')
                  ) : turnstileEnabled && !showResendTurnstile ? (
                    t('auth.clickToResend')
                  ) : (
                    t('auth.resendCode')
                  )}
                </button>
              )}
            </div>
          </form>
        )}
      </div>
    </AuthLayout>
  )
}
