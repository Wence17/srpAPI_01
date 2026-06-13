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
import { apiClient } from '@/lib/apiClient'
import {
  completeLinuxDoOAuthRegistration,
  completeOIDCOAuthRegistration,
  exchangePendingOAuthCompletion,
  getOAuthCompletionKind,
  getPublicSettings,
  isOAuthLoginCompletion,
  login2FA,
  persistOAuthTokenContext,
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

type StandardVariant = 'linuxdo' | 'oidc' | 'dingtalk'

type PendingAccountAction = 'none' | 'choose_account_action' | 'create_account' | 'bind_login'

type PendingActionResponse = PendingOAuthExchangeResponse & {
  step?: string
  intent?: string
  email?: string
  resolved_email?: string
  pending_email?: string
  existing_account_email?: string
  suggested_email?: string
  compat_email?: string
  requires_2fa?: boolean
  temp_token?: string
  user_email_masked?: string
  requires_email_completion?: boolean
}

interface StandardPendingOAuthCallbackViewProps {
  variant: StandardVariant
  testIdPrefix: string
}

export default function StandardPendingOAuthCallbackView({
  variant,
  testIdPrefix,
}: StandardPendingOAuthCallbackViewProps) {
  const { t } = useI18n()
  const router = useRouter()
  const searchParams = useSearchParams()
  const authStore = useAuth()
  const appStore = useApp()

  const [isProcessing, setIsProcessing] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')
  const [needsInvitation, setNeedsInvitation] = useState(false)
  const [invitationCode, setInvitationCode] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [invitationError, setInvitationError] = useState('')
  const [redirectTo, setRedirectTo] = useState('/dashboard')
  const [providerName, setProviderName] = useState(
    variant === 'linuxdo' ? 'LinuxDo' : variant === 'dingtalk' ? '钉钉' : 'OIDC',
  )
  const [adoptionRequired, setAdoptionRequired] = useState(false)
  const [suggestedDisplayName, setSuggestedDisplayName] = useState('')
  const [suggestedAvatarUrl, setSuggestedAvatarUrl] = useState('')
  const [adoptDisplayName, setAdoptDisplayName] = useState(true)
  const [adoptAvatar, setAdoptAvatar] = useState(true)
  const [needsAdoptionConfirmation, setNeedsAdoptionConfirmation] = useState(false)
  const [pendingAccountAction, setPendingAccountAction] = useState<PendingAccountAction>('none')
  const [pendingAccountEmail, setPendingAccountEmail] = useState('')
  const [bindLoginEmail, setBindLoginEmail] = useState('')
  const [bindLoginPassword, setBindLoginPassword] = useState('')
  const [legacyPendingOAuthToken, setLegacyPendingOAuthToken] = useState('')
  const [accountActionError, setAccountActionError] = useState('')
  const [canReturnToCreateAccount, setCanReturnToCreateAccount] = useState(false)
  const [needsTotpChallenge, setNeedsTotpChallenge] = useState(false)
  const [totpTempToken, setTotpTempToken] = useState('')
  const [totpCode, setTotpCode] = useState('')
  const [totpError, setTotpError] = useState('')
  const [totpUserEmailMasked, setTotpUserEmailMasked] = useState('')

  const bindSuccessMessage = t('profile.authBindings.bindSuccess')
  const needsCreateAccount = pendingAccountAction === 'create_account'
  const needsChooser = pendingAccountAction === 'choose_account_action'
  const needsBindLogin = pendingAccountAction === 'bind_login'

  const i18nPrefix = variant === 'linuxdo' ? 'auth.linuxdo' : variant === 'dingtalk' ? 'auth.dingtalk' : 'auth.oidc'
  const useProviderNameInTitle = variant === 'oidc'

  const callbackTitle = useProviderNameInTitle
    ? t('auth.oidc.callbackTitle', { providerName })
    : t(`${i18nPrefix}.callbackTitle`)
  const callbackProcessing = useProviderNameInTitle
    ? t('auth.oidc.callbackProcessing', { providerName })
    : t(`${i18nPrefix}.callbackProcessing`)
  const callbackHint = useProviderNameInTitle
    ? t('auth.oidc.callbackHint')
    : t(`${i18nPrefix}.callbackHint`)
  const invitationRequiredText = useProviderNameInTitle
    ? t('auth.oidc.invitationRequired', { providerName })
    : t(`${i18nPrefix}.invitationRequired`)
  const completingText = useProviderNameInTitle
    ? t('auth.oidc.completing')
    : t(`${i18nPrefix}.completing`)
  const completeRegistrationText = useProviderNameInTitle
    ? t('auth.oidc.completeRegistration')
    : t(`${i18nPrefix}.completeRegistration`)
  const completeRegistrationFailedText = useProviderNameInTitle
    ? t('auth.oidc.completeRegistrationFailed')
    : t(`${i18nPrefix}.completeRegistrationFailed`)
  const callbackMissingTokenText = useProviderNameInTitle
    ? t('auth.oidc.callbackMissingToken')
    : t(`${i18nPrefix}.callbackMissingToken`)

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
        provider: variant,
        redirect: sanitizeRedirectPath(redirect || redirectTo),
      })
    },
    [authStore, redirectTo, variant],
  )

  const clearPendingAuthSession = useCallback(() => {
    authStore.clearPendingAuthSession()
  }, [authStore])

  const currentAdoptionDecision = (): OAuthAdoptionDecision => ({
    adoptDisplayName,
    adoptAvatar,
  })

  const applyAdoptionSuggestionState = (completion: PendingOAuthExchangeResponse) => {
    setAdoptionRequired(completion.adoption_required === true)
    setSuggestedDisplayName(completion.suggested_display_name || '')
    setSuggestedAvatarUrl(completion.suggested_avatar_url || '')
    if (!completion.suggested_display_name) setAdoptDisplayName(false)
    if (!completion.suggested_avatar_url) setAdoptAvatar(false)
  }

  const extractPendingAccountEmail = (completion: PendingActionResponse): string => {
    return (
      completion.pending_email ||
      completion.existing_account_email ||
      completion.email ||
      completion.resolved_email ||
      completion.suggested_email ||
      (variant === 'oidc' ? completion.compat_email : undefined) ||
      ''
    ).trim()
  }

  const resolvePendingAccountAction = (
    completion: PendingActionResponse,
  ): PendingAccountAction => {
    const raw = normalizedPendingState(completion.step || completion.error || completion.intent)
    if (
      raw === 'choice' ||
      raw === 'choose_account_action_required' ||
      raw === 'choose_account_action' ||
      raw === 'choose_account' ||
      raw === 'choose'
    ) {
      return 'choose_account_action'
    }
    if (raw === 'email_required' || raw === 'create_account_required' || raw === 'create_account') {
      return 'create_account'
    }
    if (
      raw === 'bind_login_required' ||
      raw === 'bind_login' ||
      raw === 'existing_account' ||
      raw === 'existing_account_required' ||
      raw === 'existing_account_binding_required' ||
      raw === 'adopt_existing_user_by_email'
    ) {
      return 'bind_login'
    }
    return 'none'
  }

  const applyPendingAccountAction = (completion: PendingActionResponse): PendingAccountAction => {
    const action = resolvePendingAccountAction(completion)
    setPendingAccountAction(action)
    setAccountActionError('')
    setNeedsTotpChallenge(false)
    setTotpTempToken('')
    setTotpCode('')
    setTotpError('')
    setTotpUserEmailMasked('')

    const email = extractPendingAccountEmail(completion)
    if (action === 'choose_account_action') {
      setPendingAccountEmail(email)
      setBindLoginEmail(email)
      setBindLoginPassword('')
      setCanReturnToCreateAccount(false)
      return action
    }
    if (action === 'create_account') {
      setPendingAccountEmail(email)
      setCanReturnToCreateAccount(true)
      return action
    }
    if (action === 'bind_login') {
      setBindLoginEmail(email)
      setBindLoginPassword('')
      setCanReturnToCreateAccount(false)
      return action
    }
    setCanReturnToCreateAccount(false)
    return action
  }

  const applyTotpChallenge = (completion: PendingActionResponse): boolean => {
    if (completion.requires_2fa !== true || !completion.temp_token) return false
    setPendingAccountAction('none')
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
    setBindLoginEmail((prev) => prev.trim() || nextEmail?.trim() || pendingAccountEmail.trim())
    setBindLoginPassword('')
    setAccountActionError('')
    setCanReturnToCreateAccount(true)
  }

  const switchToCreateAccountMode = () => {
    setPendingAccountAction('create_account')
    setPendingAccountEmail((prev) => prev.trim() || bindLoginEmail.trim())
    setAccountActionError('')
  }

  const redirectToEmailCompletion = (redirect: string) => {
    router.replace(`/auth/dingtalk/email-completion?redirect=${encodeURIComponent(redirect)}`)
  }

  const isEmailCompletionStep = (completion: PendingActionResponse) =>
    completion.step === 'email_completion' || completion.requires_email_completion === true

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
      throw new Error(callbackMissingTokenText)
    }

    persistOAuthTokenContext(completion)
    await authStore.setToken(completion.access_token)
    clearAllAffiliateReferralCodes()
    appStore.showSuccess(t('auth.loginSuccess'))
    router.replace(redirect)
  }

  const finalizePendingAccountResponse = async (completion: PendingActionResponse) => {
    applyAdoptionSuggestionState(completion)
    const redirect = sanitizeRedirectPath(completion.redirect || redirectTo)

    if (variant === 'dingtalk' && isEmailCompletionStep(completion)) {
      redirectToEmailCompletion(redirect)
      return
    }

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

  const completeRegistration = async (
    invitation: string,
    decision: OAuthAdoptionDecision,
    affCode?: string,
  ): Promise<PendingActionResponse> => {
    if (variant === 'dingtalk') {
      const { data } = await apiClient.post<PendingActionResponse>(
        '/auth/oauth/dingtalk/complete-registration',
        {
          pending_oauth_token: legacyPendingOAuthToken || undefined,
          invitation_code: invitation,
          ...oauthAffiliatePayload(affCode),
          ...serializeAdoptionDecision(decision),
        },
      )
      return data
    }

    if (legacyPendingOAuthToken) {
      const { data } = await apiClient.post<PendingActionResponse>(
        `/auth/oauth/${variant}/complete-registration`,
        {
          pending_oauth_token: legacyPendingOAuthToken,
          invitation_code: invitation,
          ...oauthAffiliatePayload(affCode),
          ...serializeAdoptionDecision(decision),
        },
      )
      return data
    }

    if (variant === 'linuxdo') {
      return affCode
        ? await completeLinuxDoOAuthRegistration(invitation, decision, affCode)
        : await completeLinuxDoOAuthRegistration(invitation, decision)
    }

    return affCode
      ? await completeOIDCOAuthRegistration(invitation, decision, affCode)
      : await completeOIDCOAuthRegistration(invitation, decision)
  }

  const handleSubmitInvitation = async () => {
    setInvitationError('')
    if (!invitationCode.trim()) return

    setIsSubmitting(true)
    try {
      const affCode = loadOAuthAffiliateCode()
      const completion = await completeRegistration(invitationCode.trim(), currentAdoptionDecision(), affCode)
      await finalizePendingAccountResponse(completion)
    } catch (e: unknown) {
      const err = e as { message?: string; response?: { data?: { message?: string } } }
      setInvitationError(
        err.response?.data?.message || err.message || completeRegistrationFailedText,
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
      )) as PendingActionResponse
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
      const { data } = await apiClient.post<PendingActionResponse>('/auth/oauth/pending/create-account', {
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
      const { data } = await apiClient.post<PendingActionResponse>('/auth/oauth/pending/bind-login', {
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
    if (variant !== 'oidc') return
    void getPublicSettings()
      .then((settings) => {
        const name = settings.oidc_oauth_provider_name?.trim()
        if (name) setProviderName(name)
      })
      .catch(() => {
        // Ignore; fallback remains OIDC
      })
  }, [variant])

  useEffect(() => {
    const params = parseFragmentParams()
    const legacyLogin = readLegacyFragmentLogin(params)
    const legacyPendingToken = params.get('pending_oauth_token')?.trim() || ''
    const error = params.get('error')
    const errorDesc = params.get('error_description') || params.get('error_message') || ''
    const redirect = sanitizeRedirectPath(
      params.get('redirect') || searchParams.get('redirect') || '/dashboard',
    )

    const run = async () => {
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
          if (variant === 'dingtalk') {
            const i18nKey = `auth.dingtalk.error.${error}`
            setErrorMessage(t(i18nKey, errorDesc || error))
          } else {
            setErrorMessage(errorDesc || error)
          }
          setIsProcessing(false)
          return
        }

        const completion = (await exchangePendingOAuthCompletion()) as PendingActionResponse
        const completionRedirect = sanitizeRedirectPath(
          completion.redirect || searchParams.get('redirect') || '/dashboard',
        )
        applyAdoptionSuggestionState(completion)
        setRedirectTo(completionRedirect)

        if (variant === 'dingtalk') {
          const wantsBindExisting = searchParams.get('bind') === '1'
          const presetEmail = (searchParams.get('email') || '').trim()
          if (isEmailCompletionStep(completion)) {
            if (wantsBindExisting) {
              setPendingAccountAction('bind_login')
              setBindLoginEmail(presetEmail)
              setBindLoginPassword('')
              setCanReturnToCreateAccount(true)
              setIsProcessing(false)
              persistPendingAuthSession(completionRedirect)
              return
            }
            redirectToEmailCompletion(completionRedirect)
            return
          }
        }

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
    needsAdoptionConfirmation ||
    needsChooser ||
    needsCreateAccount ||
    needsBindLogin ||
    needsTotpChallenge

  const chooserHint = pendingAccountEmail
    ? t('auth.oauthFlow.suggestedEmail', { email: pendingAccountEmail })
    : t('auth.oauthFlow.chooseAccountActionHint')

  return (
    <AuthLayout>
      <div className="space-y-6">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">{callbackTitle}</h2>
          <p className="mt-2 text-sm text-gray-500 dark:text-dark-400">
            {isProcessing ? callbackProcessing : callbackHint}
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
                <p className="text-sm text-gray-700 dark:text-gray-300">{invitationRequiredText}</p>
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
                  {isSubmitting ? completingText : completeRegistrationText}
                </button>
              </>
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

            {needsChooser ? (
              <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-dark-600 dark:bg-dark-800/60">
                <div className="space-y-4">
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-gray-900 dark:text-white">
                      {t('auth.oauthFlow.chooseHowToContinue')}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-dark-400">{chooserHint}</p>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <button
                      className="btn btn-secondary w-full"
                      disabled={isSubmitting}
                      onClick={() => switchToBindLoginMode()}
                      type="button"
                    >
                      {t('auth.oauthFlow.bindExistingAccount')}
                    </button>
                    <button
                      className="btn btn-primary w-full"
                      disabled={isSubmitting}
                      onClick={switchToCreateAccountMode}
                      type="button"
                    >
                      {t('auth.oauthFlow.createNewAccount')}
                    </button>
                  </div>
                </div>
              </div>
            ) : null}

            {needsCreateAccount ? (
              <>
                <p className="text-sm text-gray-700 dark:text-gray-300">
                  {t('auth.oauthFlow.createAccountHint')}
                </p>
                <PendingOAuthCreateAccountForm
                  testIdPrefix={testIdPrefix}
                  initialEmail={pendingAccountEmail}
                  isSubmitting={isSubmitting}
                  errorMessage={accountActionError}
                  onSubmit={handleCreateAccount}
                  onSwitchToBind={switchToBindLoginMode}
                />
              </>
            ) : null}

            {needsBindLogin ? (
              <>
                <p className="text-sm text-gray-700 dark:text-gray-300">
                  {t('auth.oauthFlow.bindLoginHint', { providerName })}
                </p>
                <div className="space-y-3">
                  <input
                    value={bindLoginEmail}
                    onChange={(e) => setBindLoginEmail(e.target.value)}
                    data-testid={`${testIdPrefix}-bind-login-email`}
                    type="email"
                    className="input w-full"
                    placeholder={t('auth.emailPlaceholder')}
                    disabled={isSubmitting}
                    onKeyUp={(e) => e.key === 'Enter' && handleBindLogin()}
                  />
                  <input
                    value={bindLoginPassword}
                    onChange={(e) => setBindLoginPassword(e.target.value)}
                    data-testid={`${testIdPrefix}-bind-login-password`}
                    type="password"
                    className="input w-full"
                    placeholder={t('auth.passwordPlaceholder')}
                    disabled={isSubmitting}
                    onKeyUp={(e) => e.key === 'Enter' && handleBindLogin()}
                  />
                  <button
                    data-testid={`${testIdPrefix}-bind-login-submit`}
                    className="btn btn-primary w-full"
                    disabled={isSubmitting || !bindLoginEmail.trim() || !bindLoginPassword}
                    onClick={handleBindLogin}
                    type="button"
                  >
                    {isSubmitting ? t('common.processing') : t('auth.oauthFlow.logInAndBind')}
                  </button>
                  {canReturnToCreateAccount ? (
                    <button
                      className="btn btn-secondary w-full"
                      disabled={isSubmitting}
                      onClick={switchToCreateAccountMode}
                      type="button"
                    >
                      {t('auth.oauthFlow.useDifferentEmail')}
                    </button>
                  ) : null}
                </div>
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
                    data-testid={`${testIdPrefix}-bind-login-totp`}
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    className="input w-full"
                    placeholder="123456"
                    disabled={isSubmitting}
                    onKeyUp={(e) => e.key === 'Enter' && handleSubmitTotpChallenge()}
                  />
                  <button
                    data-testid={`${testIdPrefix}-bind-login-totp-submit`}
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
