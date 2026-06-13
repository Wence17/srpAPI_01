'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import AuthLayout from '@/components/layout/AuthLayout'
import OAuthProfileAdoptionSection from '@/components/auth/OAuthProfileAdoptionSection'
import PendingOAuthCreateAccountForm, {
  type PendingOAuthCreateAccountPayload,
} from '@/components/auth/PendingOAuthCreateAccountForm'
import { useAuth } from '@/context/AuthContext'
import { useApp } from '@/context/AppContext'
import { useI18n } from '@/lib/i18n'
import { apiClient, getApiBaseUrl } from '@/lib/apiClient'
import {
  completeWeChatOAuthRegistration,
  exchangePendingOAuthCompletion,
  getAuthToken,
  getOAuthCompletionKind,
  hasExplicitWeChatOAuthCapabilities,
  isOAuthLoginCompletion,
  login2FA,
  prepareOAuthBindAccessTokenCookie,
  persistOAuthTokenContext,
  resolveWeChatOAuthStartStrict,
} from '@/lib/auth'
import type { OAuthAdoptionDecision, PendingOAuthExchangeResponse } from '@/lib/types'
import {
  clearAllAffiliateReferralCodes,
  loadOAuthAffiliateCode,
  oauthAffiliatePayload,
} from '@/lib/oauthAffiliate'
import {
  getRequestErrorMessage,
  hasSuggestedProfile,
  isCreateAccountRecoveryError,
  normalizedPendingState,
  parseFragmentParams,
  readLegacyFragmentLogin,
  sanitizeRedirectPath,
  serializeAdoptionDecision,
} from '@/lib/oauthCallback'

type WeChatPendingAction = 'none' | 'choice' | 'create_account' | 'bind_login'

type PendingWeChatCompletion = PendingOAuthExchangeResponse & {
  step?: string
  status?: string
  state?: string
  pending_email?: string
  resolved_email?: string
  existing_account_email?: string
  email?: string
  intent?: string
  requires_2fa?: boolean
  temp_token?: string
  user_email_masked?: string
}

export default function WechatOAuthCallbackView() {
  const { t } = useI18n()
  const router = useRouter()
  const searchParams = useSearchParams()
  const authStore = useAuth()
  const appStore = useApp()

  const [isProcessing, setIsProcessing] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')
  const [needsInvitation, setNeedsInvitation] = useState(false)
  const [needsChooser, setNeedsChooser] = useState(false)
  const [invitationCode, setInvitationCode] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [invitationError, setInvitationError] = useState('')
  const [redirectTo, setRedirectTo] = useState('/dashboard')
  const [adoptionRequired, setAdoptionRequired] = useState(false)
  const [suggestedDisplayName, setSuggestedDisplayName] = useState('')
  const [suggestedAvatarUrl, setSuggestedAvatarUrl] = useState('')
  const [existingAccountEmail, setExistingAccountEmail] = useState('')
  const [adoptDisplayName, setAdoptDisplayName] = useState(true)
  const [adoptAvatar, setAdoptAvatar] = useState(true)
  const [needsAdoptionConfirmation, setNeedsAdoptionConfirmation] = useState(false)
  const [pendingAccountAction, setPendingAccountAction] = useState<WeChatPendingAction>('none')
  const [pendingAccountEmail, setPendingAccountEmail] = useState('')
  const [bindLoginEmail, setBindLoginEmail] = useState('')
  const [bindLoginPassword, setBindLoginPassword] = useState('')
  const [legacyPendingOAuthToken, setLegacyPendingOAuthToken] = useState('')
  const [accountActionError, setAccountActionError] = useState('')
  const [needsTotpChallenge, setNeedsTotpChallenge] = useState(false)
  const [totpTempToken, setTotpTempToken] = useState('')
  const [totpCode, setTotpCode] = useState('')
  const [totpError, setTotpError] = useState('')
  const [totpUserEmailMasked, setTotpUserEmailMasked] = useState('')

  const providerName = t('auth.wechatProviderName')
  const bindSuccessMessage = t('profile.authBindings.bindSuccess')
  const hasCurrentAuthToken = Boolean(getAuthToken())
  const showBackToChooser =
    pendingAccountAction === 'create_account' || pendingAccountAction === 'bind_login'
  const needsCreateAccount = pendingAccountAction === 'create_account'
  const needsBindLogin = pendingAccountAction === 'bind_login'

  useEffect(() => {
    if (invitationError) appStore.showError(invitationError)
  }, [invitationError, appStore])

  useEffect(() => {
    if (accountActionError) appStore.showError(accountActionError)
  }, [accountActionError, appStore])

  useEffect(() => {
    if (totpError) appStore.showError(totpError)
  }, [totpError, appStore])

  useEffect(() => {
    if (errorMessage) appStore.showError(errorMessage)
  }, [errorMessage, appStore])

  const persistPendingAuthSession = useCallback(
    (redirect?: string) => {
      authStore.setPendingAuthSession({
        token: '',
        token_field: 'pending_oauth_token',
        provider: 'wechat',
        redirect: sanitizeRedirectPath(redirect || redirectTo),
      })
    },
    [authStore, redirectTo],
  )

  const clearPendingAuthSession = useCallback(() => {
    authStore.clearPendingAuthSession()
  }, [authStore])

  const resolveConfiguredWeChatOAuthMode = (): 'open' | 'mp' | null => {
    if (!hasExplicitWeChatOAuthCapabilities(appStore.cachedPublicSettings)) return null
    return resolveWeChatOAuthStartStrict(appStore.cachedPublicSettings).mode
  }

  const resolveWeChatOAuthUnavailableMessage = (): string => {
    const resolved = resolveWeChatOAuthStartStrict(appStore.cachedPublicSettings)
    switch (resolved.unavailableReason) {
      case 'capability_unknown':
        return t('auth.oauthFlow.wechatAvailabilityUnknown')
      case 'external_browser_required':
        return t('auth.oauthFlow.wechatSystemBrowserOnly')
      case 'wechat_browser_required':
        return t('auth.oauthFlow.wechatBrowserOnly')
      case 'native_app_required':
        return 'This WeChat sign-in flow is only available from the native mobile app.'
      case 'not_configured':
        return t('auth.oauthFlow.wechatNotConfigured')
      default:
        return t('auth.loginFailed')
    }
  }

  const normalizeWeChatOAuthMode = (value: unknown): 'open' | 'mp' | null =>
    value === 'open' || value === 'mp' ? value : null

  const resolveRuntimeWeChatOAuthMode = (): 'open' | 'mp' =>
    typeof navigator !== 'undefined' && /MicroMessenger/i.test(navigator.userAgent) ? 'mp' : 'open'

  const resolveRequestedWeChatOAuthMode = (): 'open' | 'mp' | null => {
    const configuredMode = resolveConfiguredWeChatOAuthMode()
    if (configuredMode) return configuredMode
    const queryMode = normalizeWeChatOAuthMode(searchParams.get('mode'))
    if (queryMode) return queryMode
    return resolveRuntimeWeChatOAuthMode()
  }

  const resolveRedirectTarget = () =>
    sanitizeRedirectPath(searchParams.get('redirect') || redirectTo || '/dashboard')

  const resolveWeChatStartURL = (intent: 'bind_current_user' | 'adopt_existing_user_by_email'): string | null => {
    const normalized = getApiBaseUrl()
    const mode = resolveRequestedWeChatOAuthMode()
    if (!mode) return null
    const params = new URLSearchParams({
      mode,
      redirect: resolveRedirectTarget(),
      intent,
    })
    return `${normalized}/auth/oauth/wechat/start?${params.toString()}`
  }

  const buildExistingAccountResumePath = (): string | null => {
    const mode = resolveRequestedWeChatOAuthMode()
    if (!mode) return null
    const params = new URLSearchParams({
      wechat_bind_existing: '1',
      redirect: resolveRedirectTarget(),
      mode,
    })
    const email = existingAccountEmail.trim()
    if (email) params.set('email', email)
    return `/auth/wechat/callback?${params.toString()}`
  }

  const currentAdoptionDecision = (): OAuthAdoptionDecision => ({
    adoptDisplayName,
    adoptAvatar,
  })

  const resolveResumeEmail = () => (searchParams.get('email') || '').trim()

  const applyAdoptionSuggestionState = (completion: PendingOAuthExchangeResponse) => {
    setAdoptionRequired(completion.adoption_required === true)
    setSuggestedDisplayName(completion.suggested_display_name || '')
    setSuggestedAvatarUrl(completion.suggested_avatar_url || '')
    if (!completion.suggested_display_name) setAdoptDisplayName(false)
    if (!completion.suggested_avatar_url) setAdoptAvatar(false)
  }

  const extractPendingAccountEmail = (completion: PendingWeChatCompletion): string =>
    (
      completion.pending_email ||
      completion.existing_account_email ||
      completion.resolved_email ||
      completion.email ||
      resolveResumeEmail() ||
      ''
    ).trim()

  const resolvePendingAccountAction = (completion: PendingWeChatCompletion): WeChatPendingAction => {
    const raw = normalizedPendingState(
      completion.step || completion.status || completion.state || completion.error || completion.intent,
    )
    if (
      raw === 'choice' ||
      raw === 'choose_account_action_required' ||
      raw === 'choose_account_action' ||
      raw === 'choose_account' ||
      raw === 'choose'
    ) {
      return 'choice'
    }
    if (raw === 'email_required' || raw === 'create_account_required' || raw === 'create_account') {
      return 'create_account'
    }
    if (
      raw === 'existing_account' ||
      raw === 'existing_account_required' ||
      raw === 'existing_account_binding_required' ||
      raw === 'adopt_existing_user_by_email' ||
      raw === 'bind_login_required' ||
      raw === 'bind_login'
    ) {
      return 'bind_login'
    }
    return 'none'
  }

  const applyPendingAccountAction = (completion: PendingWeChatCompletion): WeChatPendingAction => {
    const action = resolvePendingAccountAction(completion)
    setPendingAccountAction(action)
    setAccountActionError('')
    setNeedsChooser(false)
    setNeedsTotpChallenge(false)
    setTotpTempToken('')
    setTotpCode('')
    setTotpError('')
    setTotpUserEmailMasked('')

    const email = extractPendingAccountEmail(completion)
    setPendingAccountEmail(email)

    if (action === 'create_account') return action
    if (action === 'bind_login') {
      setBindLoginEmail(email)
      setBindLoginPassword('')
      return action
    }
    if (action === 'choice') {
      setNeedsChooser(true)
      setBindLoginPassword('')
      return action
    }
    return action
  }

  const applyTotpChallenge = (completion: PendingWeChatCompletion): boolean => {
    if (completion.requires_2fa !== true || !completion.temp_token) return false
    setPendingAccountAction('none')
    setNeedsChooser(false)
    setNeedsInvitation(false)
    setNeedsAdoptionConfirmation(false)
    setNeedsTotpChallenge(true)
    setTotpTempToken(completion.temp_token)
    setTotpCode('')
    setTotpError('')
    setTotpUserEmailMasked(completion.user_email_masked || '')
    setIsProcessing(false)
    return true
  }

  const switchToBindLoginMode = (nextEmail?: string) => {
    setPendingAccountAction('bind_login')
    setNeedsChooser(false)
    setBindLoginEmail((prev) => prev.trim() || nextEmail?.trim() || pendingAccountEmail.trim())
    setBindLoginPassword('')
    setAccountActionError('')
  }

  const switchToCreateAccountMode = () => {
    setPendingAccountAction('create_account')
    setNeedsChooser(false)
    setPendingAccountEmail((prev) => prev.trim() || bindLoginEmail.trim())
    setAccountActionError('')
  }

  const handleBindCurrentAccount = async () => {
    const unavailableMessage =
      resolveConfiguredWeChatOAuthMode() === null ? resolveWeChatOAuthUnavailableMessage() : ''
    const startURL = resolveWeChatStartURL('bind_current_user')
    if (!startURL) {
      setErrorMessage(unavailableMessage || resolveWeChatOAuthUnavailableMessage())
      return
    }
    try {
      await prepareOAuthBindAccessTokenCookie()
      window.location.href = startURL
    } catch (e: unknown) {
      setErrorMessage(getRequestErrorMessage(e, t('auth.loginFailed')))
    }
  }

  const handleExistingAccountBinding = async () => {
    if (getAuthToken()) {
      await handleBindCurrentAccount()
      return
    }
    const resumePath = buildExistingAccountResumePath()
    if (!resumePath) {
      setErrorMessage(resolveWeChatOAuthUnavailableMessage())
      return
    }
    const params = new URLSearchParams({ redirect: resumePath })
    const email = existingAccountEmail.trim()
    if (email) params.set('email', email)
    router.replace(`/login?${params.toString()}`)
  }

  const finalizeCompletion = async (completion: PendingOAuthExchangeResponse, redirect: string) => {
    if (getOAuthCompletionKind(completion) === 'bind') {
      const bindRedirect = sanitizeRedirectPath(completion.redirect || '/profile')
      clearPendingAuthSession()
      clearAllAffiliateReferralCodes()
      appStore.showSuccess(bindSuccessMessage)
      router.replace(bindRedirect)
      return
    }
    if (!isOAuthLoginCompletion(completion)) {
      throw new Error(t('auth.oidc.callbackMissingToken'))
    }
    persistOAuthTokenContext(completion)
    await authStore.setToken(completion.access_token)
    clearAllAffiliateReferralCodes()
    appStore.showSuccess(t('auth.loginSuccess'))
    router.replace(redirect)
  }

  const finalizePendingAccountResponse = async (completion: PendingWeChatCompletion) => {
    applyAdoptionSuggestionState(completion)
    const redirect = sanitizeRedirectPath(completion.redirect || redirectTo)

    if (completion.error === 'invitation_required') {
      setPendingAccountAction('none')
      setNeedsInvitation(true)
      setNeedsAdoptionConfirmation(false)
      setIsProcessing(false)
      persistPendingAuthSession(redirect)
      return
    }

    if (applyTotpChallenge(completion)) {
      persistPendingAuthSession(redirect)
      return
    }

    const action = applyPendingAccountAction(completion)
    if (action !== 'none') {
      setNeedsInvitation(false)
      setNeedsAdoptionConfirmation(false)
      setIsProcessing(false)
      persistPendingAuthSession(redirect)
      return
    }

    if (completion.auth_result === 'pending_session') {
      setNeedsInvitation(false)
      setNeedsAdoptionConfirmation(false)
      setIsProcessing(false)
      persistPendingAuthSession(redirect)
      return
    }

    await finalizeCompletion(completion, redirect)
  }

  const handleSubmitInvitation = async () => {
    setInvitationError('')
    if (!invitationCode.trim()) return

    setIsSubmitting(true)
    try {
      const affCode = loadOAuthAffiliateCode()
      const decision = currentAdoptionDecision()
      const completion: PendingWeChatCompletion = legacyPendingOAuthToken
        ? (
            await apiClient.post<PendingWeChatCompletion>('/auth/oauth/wechat/complete-registration', {
              pending_oauth_token: legacyPendingOAuthToken,
              invitation_code: invitationCode.trim(),
              ...oauthAffiliatePayload(affCode),
              ...serializeAdoptionDecision(decision),
            })
          ).data
        : affCode
          ? await completeWeChatOAuthRegistration(invitationCode.trim(), decision, affCode)
          : await completeWeChatOAuthRegistration(invitationCode.trim(), decision)
      await finalizePendingAccountResponse(completion)
    } catch (e: unknown) {
      const err = e as { message?: string; response?: { data?: { message?: string } } }
      setInvitationError(
        err.response?.data?.message || err.message || t('auth.oidc.completeRegistrationFailed'),
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleContinueLogin = async () => {
    setIsSubmitting(true)
    try {
      const completion = (await exchangePendingOAuthCompletion(
        currentAdoptionDecision(),
      )) as PendingWeChatCompletion
      await finalizePendingAccountResponse(completion)
    } catch (e: unknown) {
      setErrorMessage(getRequestErrorMessage(e, t('auth.loginFailed')))
      setNeedsAdoptionConfirmation(false)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleCreateAccount = async (payload: PendingOAuthCreateAccountPayload) => {
    setAccountActionError('')
    if (!payload.email || !payload.password) return

    setIsSubmitting(true)
    try {
      const { data } = await apiClient.post<PendingWeChatCompletion>('/auth/oauth/pending/create-account', {
        email: payload.email,
        password: payload.password,
        verify_code: payload.verifyCode || undefined,
        invitation_code: payload.invitationCode || undefined,
        ...oauthAffiliatePayload(loadOAuthAffiliateCode()),
        ...serializeAdoptionDecision(currentAdoptionDecision()),
      })
      await finalizePendingAccountResponse(data)
    } catch (e: unknown) {
      if (isCreateAccountRecoveryError(e)) {
        switchToBindLoginMode(payload.email.trim())
        return
      }
      setAccountActionError(getRequestErrorMessage(e, t('auth.loginFailed')))
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleBindLogin = async () => {
    setAccountActionError('')
    const email = bindLoginEmail.trim()
    const password = bindLoginPassword
    if (!email || !password) return

    setIsSubmitting(true)
    try {
      const { data } = await apiClient.post<PendingWeChatCompletion>('/auth/oauth/pending/bind-login', {
        email,
        password,
        ...serializeAdoptionDecision(currentAdoptionDecision()),
      })
      await finalizePendingAccountResponse(data)
    } catch (e: unknown) {
      setAccountActionError(getRequestErrorMessage(e, t('auth.loginFailed')))
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleSubmitTotpChallenge = async () => {
    setTotpError('')
    const code = totpCode.trim()
    if (!totpTempToken || code.length !== 6) return

    setIsSubmitting(true)
    try {
      const completion = await login2FA({
        temp_token: totpTempToken,
        totp_code: code,
      })
      persistOAuthTokenContext(completion)
      await authStore.setToken(completion.access_token)
      clearAllAffiliateReferralCodes()
      appStore.showSuccess(t('auth.loginSuccess'))
      router.replace(redirectTo)
    } catch (e: unknown) {
      setTotpError(getRequestErrorMessage(e, t('auth.loginFailed')))
    } finally {
      setIsSubmitting(false)
    }
  }

  useEffect(() => {
    const email = searchParams.get('email')?.trim()
    if (email) {
      setExistingAccountEmail(email)
      setBindLoginEmail(email)
      setPendingAccountEmail(email)
    }
  }, [searchParams])

  useEffect(() => {
    const run = async () => {
      try {
        if (!hasExplicitWeChatOAuthCapabilities(appStore.cachedPublicSettings) && !appStore.publicSettingsLoaded) {
          await appStore.fetchPublicSettings()
        }
      } catch {
        // Binding recovery requires confirmed capability flags.
      }

      if (searchParams.get('wechat_bind_existing') === '1') {
        if (getAuthToken()) {
          await handleBindCurrentAccount()
          return
        }
        const resumePath = buildExistingAccountResumePath()
        if (!resumePath) {
          setErrorMessage(resolveWeChatOAuthUnavailableMessage())
          setIsProcessing(false)
          return
        }
        const params = new URLSearchParams({ redirect: resumePath })
        const email = existingAccountEmail.trim()
        if (email) params.set('email', email)
        router.replace(`/login?${params.toString()}`)
        return
      }

      const params = parseFragmentParams()
      const legacyLogin = readLegacyFragmentLogin(params)
      const legacyPendingToken = params.get('pending_oauth_token')?.trim() || ''
      const error = params.get('error')
      const errorDesc = params.get('error_description') || params.get('error_message') || ''
      const redirect = sanitizeRedirectPath(
        params.get('redirect') || searchParams.get('redirect') || '/dashboard',
      )

      try {
        if (legacyLogin) {
          persistOAuthTokenContext(legacyLogin)
          await authStore.setToken(legacyLogin.access_token)
          clearAllAffiliateReferralCodes()
          appStore.showSuccess(t('auth.loginSuccess'))
          router.replace(redirect)
          return
        }

        if (error === 'invitation_required' && legacyPendingToken) {
          setLegacyPendingOAuthToken(legacyPendingToken)
          setRedirectTo(redirect)
          setNeedsInvitation(true)
          setIsProcessing(false)
          return
        }

        if (error) {
          setErrorMessage(errorDesc || error)
          setIsProcessing(false)
          return
        }

        const completion = (await exchangePendingOAuthCompletion()) as PendingWeChatCompletion
        const completionRedirect = sanitizeRedirectPath(
          completion.redirect || searchParams.get('redirect') || '/dashboard',
        )
        applyAdoptionSuggestionState(completion)
        setRedirectTo(completionRedirect)

        if (completion.error === 'invitation_required') {
          setNeedsInvitation(true)
          setIsProcessing(false)
          persistPendingAuthSession(completionRedirect)
          return
        }

        if (applyTotpChallenge(completion)) {
          persistPendingAuthSession(completionRedirect)
          return
        }

        const action = applyPendingAccountAction(completion)
        if (action !== 'none') {
          setIsProcessing(false)
          persistPendingAuthSession(completionRedirect)
          return
        }

        if (
          (completion.adoption_required === true || adoptionRequired) &&
          hasSuggestedProfile(completion)
        ) {
          setNeedsAdoptionConfirmation(true)
          setIsProcessing(false)
          persistPendingAuthSession(completionRedirect)
          return
        }

        await finalizeCompletion(completion, completionRedirect)
      } catch (e: unknown) {
        clearPendingAuthSession()
        setErrorMessage(getRequestErrorMessage(e, t('auth.loginFailed')))
        setIsProcessing(false)
      }
    }

    void run()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const showInteractivePanel =
    needsInvitation ||
    needsChooser ||
    needsAdoptionConfirmation ||
    needsCreateAccount ||
    needsBindLogin ||
    needsTotpChallenge

  return (
    <AuthLayout>
      <div className="space-y-6">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
            {t('auth.oidc.callbackTitle', { providerName })}
          </h2>
          <p className="mt-2 text-sm text-gray-500 dark:text-dark-400">
            {isProcessing
              ? t('auth.oidc.callbackProcessing', { providerName })
              : t('auth.oidc.callbackHint')}
          </p>
        </div>

        {showInteractivePanel ? (
          <div className="animate-in fade-in slide-in-from-top-2 space-y-4 duration-300">
            <OAuthProfileAdoptionSection
              providerName={providerName}
              adoptionRequired={adoptionRequired}
              suggestedDisplayName={suggestedDisplayName}
              suggestedAvatarUrl={suggestedAvatarUrl}
              adoptDisplayName={adoptDisplayName}
              adoptAvatar={adoptAvatar}
              onAdoptDisplayNameChange={setAdoptDisplayName}
              onAdoptAvatarChange={setAdoptAvatar}
              t={t}
            />

            {needsInvitation ? (
              <>
                <p className="text-sm text-gray-700 dark:text-gray-300">
                  {t('auth.oidc.invitationRequired', { providerName })}
                </p>
                <div>
                  <input
                    value={invitationCode}
                    onChange={(e) => setInvitationCode(e.target.value)}
                    type="text"
                    className="input w-full"
                    placeholder={t('auth.invitationCodePlaceholder')}
                    disabled={isSubmitting}
                    onKeyUp={(e) => e.key === 'Enter' && handleSubmitInvitation()}
                  />
                </div>
                <button
                  className="btn btn-primary w-full"
                  disabled={isSubmitting || !invitationCode.trim()}
                  onClick={handleSubmitInvitation}
                  type="button"
                >
                  {isSubmitting ? t('auth.oidc.completing') : t('auth.oidc.completeRegistration')}
                </button>

                <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-dark-600 dark:bg-dark-800/60">
                  <div className="space-y-3">
                    <div className="space-y-1">
                      <p className="text-sm font-medium text-gray-900 dark:text-white">
                        {t('auth.alreadyHaveAccount')}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-dark-400">
                        {hasCurrentAuthToken
                          ? t('auth.oauthFlow.bindCurrentAccountDescription', { providerName })
                          : t('auth.oauthFlow.signInThenBindDescription', { providerName })}
                      </p>
                    </div>

                    {!hasCurrentAuthToken ? (
                      <input
                        value={existingAccountEmail}
                        onChange={(e) => setExistingAccountEmail(e.target.value)}
                        data-testid="existing-account-email"
                        type="email"
                        className="input w-full"
                        placeholder={t('auth.emailPlaceholder')}
                        disabled={isSubmitting}
                      />
                    ) : null}

                    <button
                      data-testid="existing-account-submit"
                      type="button"
                      className="btn btn-secondary w-full"
                      disabled={isSubmitting}
                      onClick={handleExistingAccountBinding}
                    >
                      {hasCurrentAuthToken
                        ? t('auth.oauthFlow.bindCurrentAccount')
                        : t('auth.signIn')}
                    </button>
                  </div>
                </div>
              </>
            ) : null}

            {needsChooser ? (
              <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-dark-600 dark:bg-dark-800/60">
                <div className="space-y-4">
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-gray-900 dark:text-white">
                      {t('auth.oauthFlow.chooseHowToContinue')}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-dark-400">
                      {t('auth.oauthFlow.chooseAccountActionHint')}
                    </p>
                  </div>

                  <button
                    data-testid="wechat-choice-bind-existing"
                    type="button"
                    className="btn btn-primary w-full"
                    disabled={isSubmitting}
                    onClick={() => switchToBindLoginMode()}
                  >
                    {t('auth.oauthFlow.bindExistingAccount')}
                  </button>

                  <button
                    data-testid="wechat-choice-create-account"
                    type="button"
                    className="btn btn-secondary w-full"
                    disabled={isSubmitting}
                    onClick={switchToCreateAccountMode}
                  >
                    {t('auth.oauthFlow.createNewAccount')}
                  </button>
                </div>
              </div>
            ) : null}

            {needsAdoptionConfirmation ? (
              <>
                <p className="text-sm text-gray-700 dark:text-gray-300">
                  {t('auth.oauthFlow.reviewProfileBeforeContinue', { providerName })}
                </p>
                <button
                  className="btn btn-primary w-full"
                  disabled={isSubmitting}
                  onClick={handleContinueLogin}
                  type="button"
                >
                  {isSubmitting ? t('common.processing') : t('auth.continue')}
                </button>
              </>
            ) : null}

            {needsCreateAccount ? (
              <>
                <p className="text-sm text-gray-700 dark:text-gray-300">
                  {t('auth.oauthFlow.createAccountHint')}
                </p>
                <PendingOAuthCreateAccountForm
                  testIdPrefix="wechat"
                  initialEmail={pendingAccountEmail}
                  isSubmitting={isSubmitting}
                  errorMessage={accountActionError}
                  onSubmit={handleCreateAccount}
                  onSwitchToBind={switchToBindLoginMode}
                />
                {showBackToChooser ? (
                  <button
                    className="btn btn-secondary w-full"
                    disabled={isSubmitting}
                    onClick={switchToCreateAccountMode}
                    type="button"
                  >
                    {t('auth.oauthFlow.createNewAccount')}
                  </button>
                ) : null}
              </>
            ) : null}

            {needsBindLogin ? (
              <>
                <p className="text-sm text-gray-700 dark:text-gray-300">
                  {t('auth.oauthFlow.bindSignInToExistingAccount', { providerName })}
                </p>
                {hasCurrentAuthToken ? (
                  <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-dark-600 dark:bg-dark-800/60">
                    <div className="space-y-3">
                      <div className="space-y-1">
                        <p className="text-sm font-medium text-gray-900 dark:text-white">
                          {t('auth.oauthFlow.bindCurrentAccountTitle')}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-dark-400">
                          {t('auth.oauthFlow.bindCurrentAccountDescription', { providerName })}
                        </p>
                      </div>
                      <button
                        data-testid="existing-account-submit"
                        type="button"
                        className="btn btn-primary w-full"
                        disabled={isSubmitting}
                        onClick={handleBindCurrentAccount}
                      >
                        {isSubmitting ? t('common.processing') : t('auth.oauthFlow.bindCurrentAccount')}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <input
                      value={bindLoginEmail}
                      onChange={(e) => setBindLoginEmail(e.target.value)}
                      data-testid="wechat-bind-login-email"
                      type="email"
                      className="input w-full"
                      placeholder={t('auth.emailPlaceholder')}
                      disabled={isSubmitting}
                      onKeyUp={(e) => e.key === 'Enter' && handleBindLogin()}
                    />
                    <input
                      value={bindLoginPassword}
                      onChange={(e) => setBindLoginPassword(e.target.value)}
                      data-testid="wechat-bind-login-password"
                      type="password"
                      className="input w-full"
                      placeholder={t('auth.passwordPlaceholder')}
                      disabled={isSubmitting}
                      onKeyUp={(e) => e.key === 'Enter' && handleBindLogin()}
                    />
                    <button
                      data-testid="wechat-bind-login-submit"
                      className="btn btn-primary w-full"
                      disabled={isSubmitting || !bindLoginEmail.trim() || !bindLoginPassword}
                      onClick={handleBindLogin}
                      type="button"
                    >
                      {isSubmitting ? t('common.processing') : t('auth.oauthFlow.logInAndBind')}
                    </button>
                  </div>
                )}
                {showBackToChooser ? (
                  <button
                    className="btn btn-secondary w-full"
                    disabled={isSubmitting}
                    onClick={switchToCreateAccountMode}
                    type="button"
                  >
                    {t('auth.oauthFlow.createNewAccount')}
                  </button>
                ) : null}
              </>
            ) : null}

            {needsTotpChallenge ? (
              <>
                <p className="text-sm text-gray-700 dark:text-gray-300">
                  {t('auth.oauthFlow.totpHint', {
                    providerName,
                    account: totpUserEmailMasked || t('auth.oauthFlow.yourAccount'),
                  })}
                </p>
                <div className="space-y-3">
                  <input
                    value={totpCode}
                    onChange={(e) => setTotpCode(e.target.value)}
                    data-testid="wechat-bind-login-totp"
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    className="input w-full"
                    placeholder="123456"
                    disabled={isSubmitting}
                    onKeyUp={(e) => e.key === 'Enter' && handleSubmitTotpChallenge()}
                  />
                  <button
                    data-testid="wechat-bind-login-totp-submit"
                    className="btn btn-primary w-full"
                    disabled={isSubmitting || totpCode.trim().length !== 6}
                    onClick={handleSubmitTotpChallenge}
                    type="button"
                  >
                    {isSubmitting ? t('common.processing') : t('auth.oauthFlow.verifyAndContinue')}
                  </button>
                </div>
              </>
            ) : null}
          </div>
        ) : null}
      </div>
    </AuthLayout>
  )
}
