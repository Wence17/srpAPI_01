'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import AuthLayout from '@/components/layout/AuthLayout'
import Icon from '@/components/icons/Icon'
import TurnstileWidget, { type TurnstileWidgetHandle } from '@/components/TurnstileWidget'
import { useApp } from '@/context/AppContext'
import { useI18n } from '@/lib/i18n'
import { forgotPassword, getPublicSettings } from '@/lib/auth'
import { extractI18nErrorMessage } from '@/lib/apiError'

export default function ForgotPasswordPage() {
  const { t } = useI18n()
  const app = useApp()

  const [isLoading, setIsLoading] = useState(false)
  const [isSubmitted, setIsSubmitted] = useState(false)
  const [turnstileEnabled, setTurnstileEnabled] = useState(false)
  const [turnstileSiteKey, setTurnstileSiteKey] = useState('')
  const turnstileRef = useRef<TurnstileWidgetHandle>(null)
  const [turnstileToken, setTurnstileToken] = useState('')

  const [formData, setFormData] = useState({ email: '' })
  const [errors, setErrors] = useState({ email: '', turnstile: '' })

  const validationToastMessage = errors.email || errors.turnstile

  useEffect(() => {
    if (validationToastMessage) {
      app.showError(validationToastMessage)
    }
  }, [validationToastMessage, app])

  useEffect(() => {
    getPublicSettings()
      .then((settings) => {
        setTurnstileEnabled(settings.turnstile_enabled === true)
        setTurnstileSiteKey(settings.turnstile_site_key || '')
      })
      .catch((error) => {
        console.error('Failed to load public settings:', error)
      })
  }, [])

  function onTurnstileVerify(token: string) {
    setTurnstileToken(token)
    setErrors((prev) => ({ ...prev, turnstile: '' }))
  }

  function onTurnstileExpire() {
    setTurnstileToken('')
    setErrors((prev) => ({ ...prev, turnstile: t('auth.turnstileExpired') }))
  }

  function onTurnstileError() {
    setTurnstileToken('')
    setErrors((prev) => ({ ...prev, turnstile: t('auth.turnstileFailed') }))
  }

  function validateForm(): boolean {
    const nextErrors = { email: '', turnstile: '' }
    let isValid = true

    if (!formData.email.trim()) {
      nextErrors.email = t('auth.emailRequired')
      isValid = false
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      nextErrors.email = t('auth.invalidEmail')
      isValid = false
    }

    if (turnstileEnabled && !turnstileToken) {
      nextErrors.turnstile = t('auth.completeVerification')
      isValid = false
    }

    setErrors(nextErrors)
    return isValid
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (!validateForm()) return

    setIsLoading(true)
    try {
      await forgotPassword({
        email: formData.email,
        turnstile_token: turnstileEnabled ? turnstileToken : undefined,
      })
      setIsSubmitted(true)
      app.showSuccess(t('auth.resetEmailSent'))
    } catch (error: unknown) {
      turnstileRef.current?.reset()
      setTurnstileToken('')
      app.showError(
        extractI18nErrorMessage(error, t, 'auth.errors', t('auth.sendResetLinkFailed')),
      )
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <AuthLayout
      footer={
        <p className="text-gray-500 dark:text-dark-400">
          {t('auth.rememberedPassword')}{' '}
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
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
            {t('auth.forgotPasswordTitle')}
          </h2>
          <p className="mt-2 text-sm text-gray-500 dark:text-dark-400">
            {t('auth.forgotPasswordHint')}
          </p>
        </div>

        {isSubmitted ? (
          <div className="space-y-6">
            <div className="rounded-xl border border-green-200 bg-green-50 p-6 dark:border-green-800/50 dark:bg-green-900/20">
              <div className="flex flex-col items-center gap-4 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-100 dark:bg-green-800/50">
                  <Icon name="checkCircle" size="lg" className="text-green-600 dark:text-green-400" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-green-800 dark:text-green-200">
                    {t('auth.resetEmailSent')}
                  </h3>
                  <p className="mt-2 text-sm text-green-700 dark:text-green-300">
                    {t('auth.resetEmailSentHint')}
                  </p>
                </div>
              </div>
            </div>

            <div className="text-center">
              <Link
                href="/login"
                className="inline-flex items-center gap-2 font-medium text-primary-600 transition-colors hover:text-primary-500 dark:text-primary-400 dark:hover:text-primary-300"
              >
                <Icon name="arrowLeft" size="sm" />
                {t('auth.backToLogin')}
              </Link>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
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
                  value={formData.email}
                  onChange={(event) => setFormData({ email: event.target.value })}
                  type="email"
                  required
                  autoFocus
                  autoComplete="email"
                  disabled={isLoading}
                  className={`input pl-11${errors.email ? ' input-error' : ''}`}
                  placeholder={t('auth.emailPlaceholder')}
                />
              </div>
            </div>

            {turnstileEnabled && turnstileSiteKey ? (
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
              disabled={isLoading || (turnstileEnabled && !turnstileToken)}
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
                <Icon name="mail" size="md" className="mr-2" />
              )}
              {isLoading ? t('auth.sendingResetLink') : t('auth.sendResetLink')}
            </button>
          </form>
        )}
      </div>
    </AuthLayout>
  )
}
