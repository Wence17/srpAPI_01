'use client'

import Link from 'next/link'
import { Suspense, useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import AuthLayout from '@/components/layout/AuthLayout'
import Icon from '@/components/icons/Icon'
import TurnstileWidget, { type TurnstileWidgetHandle } from '@/components/TurnstileWidget'
import EmailOAuthButtons from '@/components/auth/EmailOAuthButtons'
import LinuxDoOAuthSection from '@/components/auth/LinuxDoOAuthSection'
import OidcOAuthSection from '@/components/auth/OidcOAuthSection'
import WechatOAuthSection from '@/components/auth/WechatOAuthSection'
import LoginAgreementPrompt from '@/components/auth/LoginAgreementPrompt'
import { useAuth } from '@/context/AuthContext'
import { useApp } from '@/context/AppContext'
import { useI18n } from '@/lib/i18n'
import {
  getPublicSettings,
  isWeChatWebOAuthEnabled,
  validatePromoCode,
  validateInvitationCode,
} from '@/lib/auth'
import { buildAuthErrorMessage } from '@/lib/authError'
import {
  formatRegistrationEmailSuffixWhitelistForMessage,
  isRegistrationEmailSuffixAllowed,
  normalizeRegistrationEmailSuffixWhitelist,
} from '@/lib/registrationEmailPolicy'
import {
  clearAffiliateReferralCode,
  loadAffiliateReferralCode,
  resolveAffiliateReferralCode,
} from '@/lib/oauthAffiliate'
import type { LoginAgreementDocument } from '@/lib/types'

const LOGIN_AGREEMENT_STORAGE_KEY = 'sub2api_login_agreement_consent'

function RegisterContent() {
  const { t, locale } = useI18n()
  const auth = useAuth()
  const app = useApp()
  const router = useRouter()
  const searchParams = useSearchParams()

  const [isLoading, setIsLoading] = useState(false)
  const [settingsLoaded, setSettingsLoaded] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  const [registrationEnabled, setRegistrationEnabled] = useState(true)
  const [emailVerifyEnabled, setEmailVerifyEnabled] = useState(false)
  const [promoCodeEnabled, setPromoCodeEnabled] = useState(true)
  const [invitationCodeEnabled, setInvitationCodeEnabled] = useState(false)
  const [turnstileEnabled, setTurnstileEnabled] = useState(false)
  const [turnstileSiteKey, setTurnstileSiteKey] = useState('')
  const [siteName, setSiteName] = useState('Sub2API')
  const [linuxdoOAuthEnabled, setLinuxdoOAuthEnabled] = useState(false)
  const [wechatOAuthEnabled, setWechatOAuthEnabled] = useState(false)
  const [oidcOAuthEnabled, setOidcOAuthEnabled] = useState(false)
  const [oidcOAuthProviderName, setOidcOAuthProviderName] = useState('OIDC')
  const [githubOAuthEnabled, setGithubOAuthEnabled] = useState(false)
  const [googleOAuthEnabled, setGoogleOAuthEnabled] = useState(false)
  const [registrationEmailSuffixWhitelist, setRegistrationEmailSuffixWhitelist] = useState<string[]>([])
  const [loginAgreementEnabled, setLoginAgreementEnabled] = useState(false)
  const [loginAgreementMode, setLoginAgreementMode] = useState<'modal' | 'checkbox' | string>('modal')
  const [loginAgreementUpdatedAt, setLoginAgreementUpdatedAt] = useState('')
  const [loginAgreementRevision, setLoginAgreementRevision] = useState('')
  const [loginAgreementDocuments, setLoginAgreementDocuments] = useState<LoginAgreementDocument[]>([])
  const [agreementAccepted, setAgreementAccepted] = useState(false)
  const [showAgreementModal, setShowAgreementModal] = useState(false)

  const turnstileRef = useRef<TurnstileWidgetHandle>(null)
  const [turnstileToken, setTurnstileToken] = useState('')

  const [promoValidating, setPromoValidating] = useState(false)
  const [promoValidation, setPromoValidation] = useState({
    valid: false,
    invalid: false,
    bonusAmount: null as number | null,
    message: '',
  })
  const promoValidateTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [invitationValidating, setInvitationValidating] = useState(false)
  const [invitationValidation, setInvitationValidation] = useState({
    valid: false,
    invalid: false,
    message: '',
  })
  const invitationValidateTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [formData, setFormData] = useState({
    email: '',
    password: '',
    promo_code: '',
    invitation_code: '',
    aff_code: '',
  })
  const [errors, setErrors] = useState({
    email: '',
    password: '',
    turnstile: '',
    invitation_code: '',
  })
  const [errorMessage, setErrorMessage] = useState('')

  const validationToastMessage =
    errors.email ||
    errors.password ||
    (invitationValidation.invalid ? invitationValidation.message : '') ||
    errors.invitation_code ||
    (promoValidation.invalid ? promoValidation.message : '') ||
    errors.turnstile

  const showOAuthLogin =
    linuxdoOAuthEnabled ||
    wechatOAuthEnabled ||
    oidcOAuthEnabled ||
    githubOAuthEnabled ||
    googleOAuthEnabled

  const agreementGateActive = loginAgreementEnabled && !agreementAccepted
  const registrationActionDisabled = isLoading || !settingsLoaded || agreementGateActive

  useEffect(() => {
    if (auth.isAuthenticated) {
      router.replace(auth.isAdmin ? '/admin/dashboard' : '/dashboard')
    }
  }, [auth.isAuthenticated, auth.isAdmin, router])

  useEffect(() => {
    if (validationToastMessage) {
      app.showError(validationToastMessage)
    }
  }, [validationToastMessage, app])

  function syncAffiliateReferralCode(): string {
    const code = resolveAffiliateReferralCode(searchParams.get('aff'), searchParams.get('aff_code'))
    if (code) {
      setFormData((prev) => ({ ...prev, aff_code: code }))
    }
    return code
  }

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
    syncAffiliateReferralCode()

    getPublicSettings()
      .then(async (settings) => {
        setRegistrationEnabled(settings.registration_enabled !== false)
        setEmailVerifyEnabled(settings.email_verify_enabled === true)
        setPromoCodeEnabled(settings.promo_code_enabled !== false)
        setInvitationCodeEnabled(settings.invitation_code_enabled === true)
        setTurnstileEnabled(settings.turnstile_enabled === true)
        setTurnstileSiteKey(settings.turnstile_site_key || '')
        setSiteName(settings.site_name || 'Sub2API')
        setLinuxdoOAuthEnabled(settings.linuxdo_oauth_enabled === true)
        setWechatOAuthEnabled(isWeChatWebOAuthEnabled(settings))
        setOidcOAuthEnabled(settings.oidc_oauth_enabled === true)
        setOidcOAuthProviderName(settings.oidc_oauth_provider_name || 'OIDC')
        setGithubOAuthEnabled(settings.github_oauth_enabled === true)
        setGoogleOAuthEnabled(settings.google_oauth_enabled === true)
        setRegistrationEmailSuffixWhitelist(
          normalizeRegistrationEmailSuffixWhitelist(settings.registration_email_suffix_whitelist || []),
        )
        applyLoginAgreementSettings(settings)

        if (settings.promo_code_enabled !== false) {
          const promoParam = searchParams.get('promo')
          if (promoParam) {
            setFormData((prev) => ({ ...prev, promo_code: promoParam }))
            await validatePromoCodeDebounced(promoParam)
          }
        }
        syncAffiliateReferralCode()
      })
      .catch((error) => {
        console.error('Failed to load public settings:', error)
        setLoginAgreementEnabled(false)
        setAgreementAccepted(true)
      })
      .finally(() => {
        setSettingsLoaded(true)
      })

    return () => {
      if (promoValidateTimeoutRef.current) clearTimeout(promoValidateTimeoutRef.current)
      if (invitationValidateTimeoutRef.current) clearTimeout(invitationValidateTimeoutRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    syncAffiliateReferralCode()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams.get('aff'), searchParams.get('aff_code')])

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
    app.showWarning('未同意最新条款前，无法注册或使用快捷登录。')
  }

  function getPromoErrorMessage(errorCode?: string): string {
    switch (errorCode) {
      case 'PROMO_CODE_NOT_FOUND':
        return t('auth.promoCodeNotFound')
      case 'PROMO_CODE_EXPIRED':
        return t('auth.promoCodeExpired')
      case 'PROMO_CODE_DISABLED':
        return t('auth.promoCodeDisabled')
      case 'PROMO_CODE_MAX_USED':
        return t('auth.promoCodeMaxUsed')
      case 'PROMO_CODE_ALREADY_USED':
        return t('auth.promoCodeAlreadyUsed')
      default:
        return t('auth.promoCodeInvalid')
    }
  }

  async function validatePromoCodeDebounced(code: string): Promise<void> {
    if (!code.trim()) return

    setPromoValidating(true)
    try {
      const result = await validatePromoCode(code)
      if (result.valid) {
        setPromoValidation({
          valid: true,
          invalid: false,
          bonusAmount: result.bonus_amount || 0,
          message: '',
        })
      } else {
        setPromoValidation({
          valid: false,
          invalid: true,
          bonusAmount: null,
          message: getPromoErrorMessage(result.error_code),
        })
      }
    } catch (error) {
      console.error('Failed to validate promo code:', error)
      setPromoValidation({
        valid: false,
        invalid: true,
        bonusAmount: null,
        message: t('auth.promoCodeInvalid'),
      })
    } finally {
      setPromoValidating(false)
    }
  }

  function handlePromoCodeInput(value: string): void {
    setFormData((prev) => ({ ...prev, promo_code: value }))
    setPromoValidation({ valid: false, invalid: false, bonusAmount: null, message: '' })

    if (!value.trim()) {
      setPromoValidating(false)
      return
    }

    if (promoValidateTimeoutRef.current) {
      clearTimeout(promoValidateTimeoutRef.current)
    }
    promoValidateTimeoutRef.current = setTimeout(() => {
      validatePromoCodeDebounced(value)
    }, 500)
  }

  function getInvitationErrorMessage(errorCode?: string): string {
    switch (errorCode) {
      case 'INVITATION_CODE_NOT_FOUND':
      case 'INVITATION_CODE_INVALID':
      case 'INVITATION_CODE_USED':
      case 'INVITATION_CODE_DISABLED':
        return t('auth.invitationCodeInvalid')
      default:
        return t('auth.invitationCodeInvalid')
    }
  }

  async function validateInvitationCodeDebounced(code: string): Promise<boolean> {
    setInvitationValidating(true)
    try {
      const result = await validateInvitationCode(code)
      if (result.valid) {
        setInvitationValidation({ valid: true, invalid: false, message: '' })
        return true
      }
      setInvitationValidation({
        valid: false,
        invalid: true,
        message: getInvitationErrorMessage(result.error_code),
      })
      return false
    } catch {
      setInvitationValidation({
        valid: false,
        invalid: true,
        message: t('auth.invitationCodeInvalid'),
      })
      return false
    } finally {
      setInvitationValidating(false)
    }
  }

  function handleInvitationCodeInput(value: string): void {
    setFormData((prev) => ({ ...prev, invitation_code: value }))
    setInvitationValidation({ valid: false, invalid: false, message: '' })
    setErrors((prev) => ({ ...prev, invitation_code: '' }))

    if (!value.trim()) return

    if (invitationValidateTimeoutRef.current) {
      clearTimeout(invitationValidateTimeoutRef.current)
    }
    invitationValidateTimeoutRef.current = setTimeout(() => {
      validateInvitationCodeDebounced(value)
    }, 500)
  }

  function buildEmailSuffixNotAllowedMessage(): string {
    const normalizedWhitelist = normalizeRegistrationEmailSuffixWhitelist(registrationEmailSuffixWhitelist)
    if (normalizedWhitelist.length === 0) {
      return t('auth.emailSuffixNotAllowed')
    }
    const separator = locale.startsWith('zh') ? '、' : ', '
    return t('auth.emailSuffixNotAllowedWithAllowed', {
      suffixes: formatRegistrationEmailSuffixWhitelistForMessage(normalizedWhitelist, {
        separator,
        more: (count) => t('auth.emailSuffixAllowedMore', { count }),
      }),
    })
  }

  function validateForm(): boolean {
    const nextErrors = { email: '', password: '', turnstile: '', invitation_code: '' }
    let isValid = true

    if (agreementGateActive) {
      app.showWarning('请先阅读并同意最新条款后再注册。')
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
    } else if (!isRegistrationEmailSuffixAllowed(formData.email, registrationEmailSuffixWhitelist)) {
      nextErrors.email = buildEmailSuffixNotAllowedMessage()
      isValid = false
    }

    if (!formData.password) {
      nextErrors.password = t('auth.passwordRequired')
      isValid = false
    } else if (formData.password.length < 6) {
      nextErrors.password = t('auth.passwordMinLength')
      isValid = false
    }

    if (invitationCodeEnabled && !formData.invitation_code.trim()) {
      nextErrors.invitation_code = t('auth.invitationCodeRequired')
      isValid = false
    }

    if (turnstileEnabled && !turnstileToken) {
      nextErrors.turnstile = t('auth.completeVerification')
      isValid = false
    }

    setErrors(nextErrors)
    return isValid
  }

  async function handleRegister(): Promise<void> {
    setErrorMessage('')

    if (!validateForm()) {
      return
    }

    if (formData.promo_code.trim()) {
      if (promoValidating) {
        setErrorMessage(t('auth.promoCodeValidating'))
        return
      }
      if (promoValidation.invalid) {
        setErrorMessage(t('auth.promoCodeInvalidCannotRegister'))
        return
      }
    }

    if (invitationCodeEnabled) {
      if (invitationValidating) {
        setErrorMessage(t('auth.invitationCodeValidating'))
        return
      }
      if (invitationValidation.invalid) {
        setErrorMessage(t('auth.invitationCodeInvalidCannotRegister'))
        return
      }
      if (formData.invitation_code.trim() && !invitationValidation.valid) {
        setErrorMessage(t('auth.invitationCodeValidating'))
        const valid = await validateInvitationCodeDebounced(formData.invitation_code.trim())
        if (!valid) {
          setErrorMessage(t('auth.invitationCodeInvalidCannotRegister'))
          return
        }
      }
    }

    setIsLoading(true)

    try {
      const affCode = formData.aff_code.trim() || loadAffiliateReferralCode()

      if (emailVerifyEnabled) {
        sessionStorage.setItem(
          'register_data',
          JSON.stringify({
            email: formData.email,
            password: formData.password,
            turnstile_token: turnstileToken,
            promo_code: formData.promo_code || undefined,
            invitation_code: formData.invitation_code || undefined,
            ...(affCode ? { aff_code: affCode } : {}),
          }),
        )
        router.push('/email-verify')
        return
      }

      await auth.register({
        email: formData.email,
        password: formData.password,
        turnstile_token: turnstileEnabled ? turnstileToken : undefined,
        promo_code: formData.promo_code || undefined,
        invitation_code: formData.invitation_code || undefined,
        ...(affCode ? { aff_code: affCode } : {}),
      })
      clearAffiliateReferralCode()
      app.showSuccess(t('auth.accountCreatedSuccess', { siteName }))
      router.push('/dashboard')
    } catch (error: unknown) {
      turnstileRef.current?.reset()
      setTurnstileToken('')
      const message = buildAuthErrorMessage(error, { fallback: t('auth.registrationFailed') })
      setErrorMessage(message)
      app.showError(message)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <AuthLayout
      footer={
        <p className="text-gray-500 dark:text-dark-400">
          {t('auth.alreadyHaveAccount')}{' '}
          <Link
            href="/login"
            className="font-medium text-primary-600 transition-colors hover:text-primary-500 dark:text-primary-400 dark:hover:text-primary-300"
          >
            {t('auth.signIn')}
          </Link>
        </p>
      }
    >
      <div className="space-y-6">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">{t('auth.createAccount')}</h2>
          <p className="mt-2 text-sm text-gray-500 dark:text-dark-400">
            {t('auth.signUpToStart', { siteName })}
          </p>
        </div>

        {!registrationEnabled && settingsLoaded && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-800/50 dark:bg-amber-900/20">
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0">
                <Icon name="exclamationCircle" size="md" className="text-amber-500" />
              </div>
              <p className="text-sm text-amber-700 dark:text-amber-400">{t('auth.registrationDisabled')}</p>
            </div>
          </div>
        )}

        {registrationEnabled && (
          <form
            onSubmit={(event) => {
              event.preventDefault()
              handleRegister()
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
                  disabled={registrationActionDisabled}
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
                  autoComplete="new-password"
                  disabled={registrationActionDisabled}
                  value={formData.password}
                  onChange={(event) => setFormData((prev) => ({ ...prev, password: event.target.value }))}
                  className={`input pl-11 pr-11 ${errors.password ? 'input-error' : ''}`}
                  placeholder={t('auth.createPasswordPlaceholder')}
                />
                <button
                  type="button"
                  disabled={registrationActionDisabled}
                  onClick={() => setShowPassword((value) => !value)}
                  className="absolute inset-y-0 right-0 flex items-center pr-3.5 text-gray-400 transition-colors hover:text-gray-600 dark:hover:text-dark-300"
                >
                  {showPassword ? <Icon name="eyeOff" size="md" /> : <Icon name="eye" size="md" />}
                </button>
              </div>
              <p className="input-hint">{t('auth.passwordHint')}</p>
            </div>

            {invitationCodeEnabled && (
              <div>
                <label htmlFor="invitation_code" className="input-label">
                  {t('auth.invitationCodeLabel')}
                </label>
                <div className="relative">
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5">
                    <Icon
                      name="key"
                      size="md"
                      className={
                        invitationValidation.valid
                          ? 'text-green-500'
                          : 'text-gray-400 dark:text-dark-500'
                      }
                    />
                  </div>
                  <input
                    id="invitation_code"
                    type="text"
                    disabled={registrationActionDisabled}
                    value={formData.invitation_code}
                    onChange={(event) => handleInvitationCodeInput(event.target.value)}
                    className={`input pl-11 pr-10 ${
                      invitationValidation.valid
                        ? 'border-green-500 focus:border-green-500 focus:ring-green-500'
                        : invitationValidation.invalid || errors.invitation_code
                          ? 'border-red-500 focus:border-red-500 focus:ring-red-500'
                          : ''
                    }`}
                    placeholder={t('auth.invitationCodePlaceholder')}
                  />
                  {invitationValidating && (
                    <div className="absolute inset-y-0 right-0 flex items-center pr-3.5">
                      <svg className="h-4 w-4 animate-spin text-gray-400" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                        />
                      </svg>
                    </div>
                  )}
                  {!invitationValidating && invitationValidation.valid && (
                    <div className="absolute inset-y-0 right-0 flex items-center pr-3.5">
                      <Icon name="checkCircle" size="md" className="text-green-500" />
                    </div>
                  )}
                  {!invitationValidating && (invitationValidation.invalid || errors.invitation_code) && (
                    <div className="absolute inset-y-0 right-0 flex items-center pr-3.5">
                      <Icon name="exclamationCircle" size="md" className="text-red-500" />
                    </div>
                  )}
                </div>
                {invitationValidation.valid && (
                  <div className="fade-panel mt-2 flex items-center gap-2 rounded-lg bg-green-50 px-3 py-2 dark:bg-green-900/20">
                    <Icon name="checkCircle" size="sm" className="text-green-600 dark:text-green-400" />
                    <span className="text-sm text-green-700 dark:text-green-400">
                      {t('auth.invitationCodeValid')}
                    </span>
                  </div>
                )}
              </div>
            )}

            {promoCodeEnabled && (
              <div>
                <label htmlFor="promo_code" className="input-label">
                  {t('auth.promoCodeLabel')}
                  <span className="ml-1 text-xs font-normal text-gray-400 dark:text-dark-500">
                    ({t('common.optional')})
                  </span>
                </label>
                <div className="relative">
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5">
                    <Icon
                      name="gift"
                      size="md"
                      className={promoValidation.valid ? 'text-green-500' : 'text-gray-400 dark:text-dark-500'}
                    />
                  </div>
                  <input
                    id="promo_code"
                    type="text"
                    disabled={registrationActionDisabled}
                    value={formData.promo_code}
                    onChange={(event) => handlePromoCodeInput(event.target.value)}
                    className={`input pl-11 pr-10 ${
                      promoValidation.valid
                        ? 'border-green-500 focus:border-green-500 focus:ring-green-500'
                        : promoValidation.invalid
                          ? 'border-red-500 focus:border-red-500 focus:ring-red-500'
                          : ''
                    }`}
                    placeholder={t('auth.promoCodePlaceholder')}
                  />
                  {promoValidating && (
                    <div className="absolute inset-y-0 right-0 flex items-center pr-3.5">
                      <svg className="h-4 w-4 animate-spin text-gray-400" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                        />
                      </svg>
                    </div>
                  )}
                  {!promoValidating && promoValidation.valid && (
                    <div className="absolute inset-y-0 right-0 flex items-center pr-3.5">
                      <Icon name="checkCircle" size="md" className="text-green-500" />
                    </div>
                  )}
                  {!promoValidating && promoValidation.invalid && (
                    <div className="absolute inset-y-0 right-0 flex items-center pr-3.5">
                      <Icon name="exclamationCircle" size="md" className="text-red-500" />
                    </div>
                  )}
                </div>
                {promoValidation.valid && (
                  <div className="fade-panel mt-2 flex items-center gap-2 rounded-lg bg-green-50 px-3 py-2 dark:bg-green-900/20">
                    <Icon name="gift" size="sm" className="text-green-600 dark:text-green-400" />
                    <span className="text-sm text-green-700 dark:text-green-400">
                      {t('auth.promoCodeValid', { amount: promoValidation.bonusAmount?.toFixed(2) })}
                    </span>
                  </div>
                )}
              </div>
            )}

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

            <button
              type="submit"
              disabled={registrationActionDisabled || (turnstileEnabled && !turnstileToken)}
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
                <Icon name="userPlus" size="md" className="mr-2" />
              )}
              {isLoading
                ? t('auth.processing')
                : emailVerifyEnabled
                  ? t('auth.continue')
                  : t('auth.createAccount')}
            </button>
          </form>
        )}

        {showOAuthLogin && (
          <div className="space-y-3 pt-1">
            <div className="flex items-center gap-3">
              <div className="h-px flex-1 bg-gray-200 dark:bg-dark-700" />
              <span className="text-xs text-gray-500 dark:text-dark-400">{t('auth.oauthOrContinue')}</span>
              <div className="h-px flex-1 bg-gray-200 dark:bg-dark-700" />
            </div>

            <EmailOAuthButtons
              disabled={registrationActionDisabled}
              affCode={formData.aff_code}
              githubEnabled={githubOAuthEnabled}
              googleEnabled={googleOAuthEnabled}
              showDivider={false}
            />

            {linuxdoOAuthEnabled && (
              <LinuxDoOAuthSection
                disabled={registrationActionDisabled}
                affCode={formData.aff_code}
                showDivider={false}
              />
            )}
            {wechatOAuthEnabled && (
              <WechatOAuthSection
                disabled={registrationActionDisabled}
                affCode={formData.aff_code}
                showDivider={false}
              />
            )}
            {oidcOAuthEnabled && (
              <OidcOAuthSection
                disabled={registrationActionDisabled}
                providerName={oidcOAuthProviderName}
                affCode={formData.aff_code}
                showDivider={false}
              />
            )}
          </div>
        )}

        {errorMessage && (
          <p className="text-sm text-red-600 dark:text-red-400">{errorMessage}</p>
        )}
      </div>
    </AuthLayout>
  )
}

export default function RegisterPage() {
  return (
    <Suspense fallback={null}>
      <RegisterContent />
    </Suspense>
  )
}
