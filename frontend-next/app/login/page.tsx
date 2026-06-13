'use client'

import Link from 'next/link'
import { Suspense, useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import AuthLayout from '@/components/layout/AuthLayout'
import Icon from '@/components/icons/Icon'
import TurnstileWidget, { type TurnstileWidgetHandle } from '@/components/TurnstileWidget'
import EmailOAuthButtons from '@/components/auth/EmailOAuthButtons'
import LinuxDoOAuthSection from '@/components/auth/LinuxDoOAuthSection'
import DingTalkOAuthSection from '@/components/auth/DingTalkOAuthSection'
import OidcOAuthSection from '@/components/auth/OidcOAuthSection'
import WechatOAuthSection from '@/components/auth/WechatOAuthSection'
import LoginAgreementPrompt from '@/components/auth/LoginAgreementPrompt'
import TotpLoginModal, { type TotpLoginModalHandle } from '@/components/auth/TotpLoginModal'
import { useAuth } from '@/context/AuthContext'
import { useApp } from '@/context/AppContext'
import { useI18n } from '@/lib/i18n'
import { getPublicSettings, isTotp2FARequired, isWeChatWebOAuthEnabled } from '@/lib/auth'
import { extractI18nErrorMessage } from '@/lib/apiError'
import { clearAllAffiliateReferralCodes } from '@/lib/oauthAffiliate'
import type { LoginAgreementDocument, TotpLoginResponse } from '@/lib/types'

const LOGIN_AGREEMENT_STORAGE_KEY = 'sub2api_login_agreement_consent'

function LoginContent() {
  const { t } = useI18n()
  const auth = useAuth()
  const app = useApp()
  const router = useRouter()
  const searchParams = useSearchParams()
  const redirect = searchParams.get('redirect') || '/dashboard'

  const [isLoading, setIsLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [publicSettingsLoaded, setPublicSettingsLoaded] = useState(false)

  const [turnstileEnabled, setTurnstileEnabled] = useState(false)
  const [turnstileSiteKey, setTurnstileSiteKey] = useState('')
  const [linuxdoOAuthEnabled, setLinuxdoOAuthEnabled] = useState(false)
  const [dingtalkOAuthEnabled, setDingtalkOAuthEnabled] = useState(false)
  const [wechatOAuthEnabled, setWechatOAuthEnabled] = useState(false)
  const [backendModeEnabled, setBackendModeEnabled] = useState(false)
  const [oidcOAuthEnabled, setOidcOAuthEnabled] = useState(false)
  const [oidcOAuthProviderName, setOidcOAuthProviderName] = useState('OIDC')
  const [githubOAuthEnabled, setGithubOAuthEnabled] = useState(false)
  const [googleOAuthEnabled, setGoogleOAuthEnabled] = useState(false)
  const [passwordResetEnabled, setPasswordResetEnabled] = useState(false)
  const [loginAgreementEnabled, setLoginAgreementEnabled] = useState(false)
  const [loginAgreementMode, setLoginAgreementMode] = useState<'modal' | 'checkbox' | string>('modal')
  const [loginAgreementUpdatedAt, setLoginAgreementUpdatedAt] = useState('')
  const [loginAgreementRevision, setLoginAgreementRevision] = useState('')
  const [loginAgreementDocuments, setLoginAgreementDocuments] = useState<LoginAgreementDocument[]>([])
  const [agreementAccepted, setAgreementAccepted] = useState(false)
  const [showAgreementModal, setShowAgreementModal] = useState(false)

  const turnstileRef = useRef<TurnstileWidgetHandle>(null)
  const [turnstileToken, setTurnstileToken] = useState('')

  const [show2FAModal, setShow2FAModal] = useState(false)
  const [totpTempToken, setTotpTempToken] = useState('')
  const [totpUserEmailMasked, setTotpUserEmailMasked] = useState('')
  const totpModalRef = useRef<TotpLoginModalHandle>(null)

  const [formData, setFormData] = useState({ email: '', password: '' })
  const [errors, setErrors] = useState({ email: '', password: '', turnstile: '' })

  const validationToastMessage = errors.email || errors.password || errors.turnstile
  const agreementGateActive = loginAgreementEnabled && !agreementAccepted
  const authActionDisabled = isLoading || !publicSettingsLoaded || agreementGateActive

  const showOAuthLogin =
    !backendModeEnabled &&
    (linuxdoOAuthEnabled ||
      dingtalkOAuthEnabled ||
      wechatOAuthEnabled ||
      oidcOAuthEnabled ||
      githubOAuthEnabled ||
      googleOAuthEnabled)

  useEffect(() => {
    if (auth.isAuthenticated) {
      router.replace(auth.isAdmin ? '/admin/dashboard' : redirect)
    }
  }, [auth.isAuthenticated, auth.isAdmin, router, redirect])

  useEffect(() => {
    if (validationToastMessage) {
      app.showError(validationToastMessage)
    }
  }, [validationToastMessage, app])

  function hasAcceptedLoginAgreement(revision: string): boolean {
    if (!revision) return false
    try {
      const raw = localStorage.getItem(LOGIN_AGREEMENT_STORAGE_KEY)
      if (!raw) return false
      const parsed = JSON.parse(raw) as { revision?: string }
      return parsed.revision === revision
    } catch {
      return false
    }
  }

  function applyLoginAgreementSettings(settings: {
    login_agreement_enabled?: boolean
    login_agreement_mode?: string
    login_agreement_updated_at?: string
    login_agreement_revision?: string
    login_agreement_documents?: LoginAgreementDocument[]
  }): void {
    const documents = Array.isArray(settings.login_agreement_documents)
      ? settings.login_agreement_documents.filter((doc) => doc.title?.trim())
      : []
    setLoginAgreementDocuments(documents)
    const enabled = settings.login_agreement_enabled === true && documents.length > 0
    setLoginAgreementEnabled(enabled)
    const mode = settings.login_agreement_mode === 'checkbox' ? 'checkbox' : 'modal'
    setLoginAgreementMode(mode)
    const updatedAt = settings.login_agreement_updated_at || ''
    setLoginAgreementUpdatedAt(updatedAt)
    const revision =
      settings.login_agreement_revision ||
      `${updatedAt}:${documents.map((doc) => `${doc.id}:${doc.title}`).join('|')}`
    setLoginAgreementRevision(revision)
    setAgreementAccepted(!enabled || hasAcceptedLoginAgreement(revision))
    setShowAgreementModal(enabled && !hasAcceptedLoginAgreement(revision) && mode !== 'checkbox')
  }

  useEffect(() => {
    const expiredFlag = sessionStorage.getItem('auth_expired')
    if (expiredFlag) {
      sessionStorage.removeItem('auth_expired')
      const message = t('auth.reloginRequired')
      app.showWarning(message)
    }

    getPublicSettings()
      .then((settings) => {
        setTurnstileEnabled(settings.turnstile_enabled === true)
        setTurnstileSiteKey(settings.turnstile_site_key || '')
        setLinuxdoOAuthEnabled(settings.linuxdo_oauth_enabled === true)
        setDingtalkOAuthEnabled(settings.dingtalk_oauth_enabled ?? false)
        setWechatOAuthEnabled(isWeChatWebOAuthEnabled(settings))
        setBackendModeEnabled(settings.backend_mode_enabled === true)
        setOidcOAuthEnabled(settings.oidc_oauth_enabled === true)
        setOidcOAuthProviderName(settings.oidc_oauth_provider_name || 'OIDC')
        setGithubOAuthEnabled(settings.github_oauth_enabled === true)
        setGoogleOAuthEnabled(settings.google_oauth_enabled === true)
        setPasswordResetEnabled(settings.password_reset_enabled === true)
        applyLoginAgreementSettings(settings)
      })
      .catch((error) => {
        console.error('Failed to load public settings:', error)
        setLoginAgreementEnabled(false)
        setAgreementAccepted(true)
      })
      .finally(() => {
        setPublicSettingsLoaded(true)
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function acceptLoginAgreement(): void {
    if (loginAgreementRevision) {
      localStorage.setItem(
        LOGIN_AGREEMENT_STORAGE_KEY,
        JSON.stringify({
          revision: loginAgreementRevision,
          accepted_at: new Date().toISOString(),
        }),
      )
    }
    setAgreementAccepted(true)
    setShowAgreementModal(false)
  }

  function rejectLoginAgreement(): void {
    localStorage.removeItem(LOGIN_AGREEMENT_STORAGE_KEY)
    setAgreementAccepted(false)
    setShowAgreementModal(false)
    app.showWarning('未同意最新条款前，无法输入账号密码或使用快捷登录。')
  }

  function validateForm(): boolean {
    const nextErrors = { email: '', password: '', turnstile: '' }
    let isValid = true

    if (agreementGateActive) {
      app.showWarning('请先阅读并同意最新条款后再登录。')
      if (loginAgreementMode !== 'checkbox') {
        setShowAgreementModal(true)
      }
      return false
    }

    if (!formData.email.trim()) {
      nextErrors.email = t('auth.emailRequired')
      isValid = false
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      nextErrors.email = t('auth.invalidEmail')
      isValid = false
    }

    if (!formData.password) {
      nextErrors.password = t('auth.passwordRequired')
      isValid = false
    } else if (formData.password.length < 6) {
      nextErrors.password = t('auth.passwordMinLength')
      isValid = false
    }

    if (turnstileEnabled && !turnstileToken) {
      nextErrors.turnstile = t('auth.completeVerification')
      isValid = false
    }

    setErrors(nextErrors)
    return isValid
  }

  async function handleLogin(): Promise<void> {
    if (!validateForm()) {
      return
    }

    setIsLoading(true)

    try {
      const response = await auth.login({
        email: formData.email,
        password: formData.password,
        turnstile_token: turnstileEnabled ? turnstileToken : undefined,
      })

      if (isTotp2FARequired(response)) {
        const totpResponse = response as TotpLoginResponse
        setTotpTempToken(totpResponse.temp_token || '')
        setTotpUserEmailMasked(totpResponse.user_email_masked || '')
        setShow2FAModal(true)
        setIsLoading(false)
        return
      }

      clearAllAffiliateReferralCodes()
      app.showSuccess(t('auth.loginSuccess'))
      router.push(redirect)
    } catch (error: unknown) {
      turnstileRef.current?.reset()
      setTurnstileToken('')
      const message = extractI18nErrorMessage(error, t, 'auth.errors', t('auth.loginFailed'))
      app.showError(message)
    } finally {
      setIsLoading(false)
    }
  }

  async function handle2FAVerify(code: string): Promise<void> {
    totpModalRef.current?.setVerifying(true)

    try {
      await auth.login2FA({ temp_token: totpTempToken, totp_code: code })
      setShow2FAModal(false)
      clearAllAffiliateReferralCodes()
      app.showSuccess(t('auth.loginSuccess'))
      router.push(redirect)
    } catch (error: unknown) {
      const err = error as { message?: string; response?: { data?: { message?: string } } }
      const message = err.response?.data?.message || err.message || t('profile.totp.loginFailed')
      totpModalRef.current?.setError(message)
      totpModalRef.current?.setVerifying(false)
    }
  }

  function handle2FACancel(): void {
    setShow2FAModal(false)
    setTotpTempToken('')
    setTotpUserEmailMasked('')
  }

  return (
    <>
      <AuthLayout
        footer={
          !backendModeEnabled ? (
            <p className="text-gray-500 dark:text-dark-400">
              {t('auth.dontHaveAccount')}{' '}
              <Link
                href="/register"
                className="font-medium text-primary-600 transition-colors hover:text-primary-500 dark:text-primary-400 dark:hover:text-primary-300"
              >
                {t('auth.signUp')}
              </Link>
            </p>
          ) : undefined
        }
      >
        <div className="space-y-6">
          <div className="text-center">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">{t('auth.welcomeBack')}</h2>
            <p className="mt-2 text-sm text-gray-500 dark:text-dark-400">{t('auth.signInToAccount')}</p>
          </div>

          <form
            onSubmit={(event) => {
              event.preventDefault()
              handleLogin()
            }}
            className="space-y-5"
          >
            <div>
              <label htmlFor="email" className="input-label">
                {t('auth.emailLabel')}
              </label>
              <div className="relative">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5">
                  <Icon name="mail" size="md" className="text-gray-400 dark:text-dark-500" />
                </div>
                <input
                  id="email"
                  type="email"
                  required
                  autoFocus
                  autoComplete="email"
                  disabled={authActionDisabled}
                  value={formData.email}
                  onChange={(event) => setFormData((prev) => ({ ...prev, email: event.target.value }))}
                  className={`input pl-11 ${errors.email ? 'input-error' : ''}`}
                  placeholder={t('auth.emailPlaceholder')}
                />
              </div>
            </div>

            <div>
              <label htmlFor="password" className="input-label">
                {t('auth.passwordLabel')}
              </label>
              <div className="relative">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5">
                  <Icon name="lock" size="md" className="text-gray-400 dark:text-dark-500" />
                </div>
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  autoComplete="current-password"
                  disabled={authActionDisabled}
                  value={formData.password}
                  onChange={(event) => setFormData((prev) => ({ ...prev, password: event.target.value }))}
                  className={`input pl-11 pr-11 ${errors.password ? 'input-error' : ''}`}
                  placeholder={t('auth.passwordPlaceholder')}
                />
                <button
                  type="button"
                  disabled={authActionDisabled}
                  onClick={() => setShowPassword((value) => !value)}
                  className="absolute inset-y-0 right-0 flex items-center pr-3.5 text-gray-400 transition-colors hover:text-gray-600 dark:hover:text-dark-300"
                >
                  {showPassword ? <Icon name="eyeOff" size="md" /> : <Icon name="eye" size="md" />}
                </button>
              </div>
              <div className="mt-1 flex items-center justify-between">
                <span />
                {passwordResetEnabled && !backendModeEnabled && (
                  <Link
                    href="/forgot-password"
                    className="text-sm font-medium text-primary-600 transition-colors hover:text-primary-500 dark:text-primary-400 dark:hover:text-primary-300"
                  >
                    {t('auth.forgotPassword')}
                  </Link>
                )}
              </div>
            </div>

            {turnstileEnabled && turnstileSiteKey && (
              <TurnstileWidget
                ref={turnstileRef}
                siteKey={turnstileSiteKey}
                onVerify={(token) => {
                  setTurnstileToken(token)
                  setErrors((prev) => ({ ...prev, turnstile: '' }))
                }}
                onExpire={() => {
                  setTurnstileToken('')
                  setErrors((prev) => ({ ...prev, turnstile: t('auth.turnstileExpired') }))
                }}
                onError={() => {
                  setTurnstileToken('')
                  setErrors((prev) => ({ ...prev, turnstile: t('auth.turnstileFailed') }))
                }}
              />
            )}

            <button
              type="submit"
              disabled={authActionDisabled || (turnstileEnabled && !turnstileToken)}
              className="btn btn-primary w-full"
            >
              {isLoading ? (
                <svg className="-ml-1 mr-2 h-4 w-4 animate-spin text-white" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
              ) : (
                <Icon name="login" size="md" className="mr-2" />
              )}
              {isLoading ? t('auth.signingIn') : t('auth.signIn')}
            </button>

            {loginAgreementEnabled && (
              <LoginAgreementPrompt
                accepted={agreementAccepted}
                documents={loginAgreementDocuments}
                mode={loginAgreementMode}
                updatedAt={loginAgreementUpdatedAt}
                visible={showAgreementModal}
                onAccept={acceptLoginAgreement}
                onReject={rejectLoginAgreement}
                onOpen={() => setShowAgreementModal(true)}
              />
            )}

            {showOAuthLogin && (
              <div className="space-y-3 pt-1">
                <div className="flex items-center gap-3">
                  <div className="h-px flex-1 bg-gray-200 dark:bg-dark-700" />
                  <span className="text-xs text-gray-500 dark:text-dark-400">{t('auth.oauthOrContinue')}</span>
                  <div className="h-px flex-1 bg-gray-200 dark:bg-dark-700" />
                </div>

                <EmailOAuthButtons
                  disabled={authActionDisabled}
                  githubEnabled={githubOAuthEnabled}
                  googleEnabled={googleOAuthEnabled}
                  showDivider={false}
                />

                {linuxdoOAuthEnabled && (
                  <LinuxDoOAuthSection disabled={authActionDisabled} showDivider={false} />
                )}
                {dingtalkOAuthEnabled && (
                  <DingTalkOAuthSection disabled={authActionDisabled} showDivider={false} />
                )}
                {wechatOAuthEnabled && (
                  <WechatOAuthSection disabled={authActionDisabled} showDivider={false} />
                )}
                {oidcOAuthEnabled && (
                  <OidcOAuthSection
                    disabled={authActionDisabled}
                    providerName={oidcOAuthProviderName}
                    showDivider={false}
                  />
                )}
              </div>
            )}
          </form>
        </div>
      </AuthLayout>

      {show2FAModal && (
        <TotpLoginModal
          ref={totpModalRef}
          tempToken={totpTempToken}
          userEmailMasked={totpUserEmailMasked}
          onVerify={handle2FAVerify}
          onCancel={handle2FACancel}
        />
      )}
    </>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginContent />
    </Suspense>
  )
}
