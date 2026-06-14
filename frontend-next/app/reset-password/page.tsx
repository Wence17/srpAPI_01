'use client'

import Link from 'next/link'
import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import AuthLayout from '@/components/layout/AuthLayout'
import Icon from '@/components/icons/Icon'
import { useApp } from '@/context/AppContext'
import { useI18n } from '@/lib/i18n'
import { resetPassword } from '@/lib/auth'
import { extractI18nErrorMessage } from '@/lib/apiError'

function ResetPasswordContent() {
  const { t } = useI18n()
  const app = useApp()
  const searchParams = useSearchParams()

  const [isLoading, setIsLoading] = useState(false)
  const [isSuccess, setIsSuccess] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)

  const [email, setEmail] = useState('')
  const [token, setToken] = useState('')
  const [formData, setFormData] = useState({ password: '', confirmPassword: '' })
  const [errors, setErrors] = useState({ password: '', confirmPassword: '' })

  const isInvalidLink = !email || !token
  const validationToastMessage = errors.password || errors.confirmPassword

  useEffect(() => {
    const queryEmail = searchParams.get('email') || ''
    const queryToken = searchParams.get('token') || ''
    setEmail(queryEmail)
    setToken(queryToken)
    if (!queryEmail || !queryToken) {
      app.showError(t('auth.invalidResetLink'))
    }
  }, [searchParams, app, t])

  useEffect(() => {
    if (validationToastMessage) {
      app.showError(validationToastMessage)
    }
  }, [validationToastMessage, app])

  function validateForm(): boolean {
    const nextErrors = { password: '', confirmPassword: '' }
    let isValid = true

    if (!formData.password) {
      nextErrors.password = t('auth.passwordRequired')
      isValid = false
    } else if (formData.password.length < 6) {
      nextErrors.password = t('auth.passwordMinLength')
      isValid = false
    }

    if (!formData.confirmPassword) {
      nextErrors.confirmPassword = t('auth.confirmPasswordRequired')
      isValid = false
    } else if (formData.password !== formData.confirmPassword) {
      nextErrors.confirmPassword = t('auth.passwordsDoNotMatch')
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
      await resetPassword({
        email,
        token,
        new_password: formData.password,
      })
      setIsSuccess(true)
      app.showSuccess(t('auth.passwordResetSuccess'))
    } catch (error: unknown) {
      const err = error as { response?: { data?: { code?: string } } }
      if (err.response?.data?.code === 'INVALID_RESET_TOKEN') {
        app.showError(t('auth.invalidOrExpiredToken'))
      } else {
        app.showError(extractI18nErrorMessage(error, t, 'auth.errors', t('auth.resetPasswordFailed')))
      }
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
            {t('auth.resetPasswordTitle')}
          </h2>
          <p className="mt-2 text-sm text-gray-500 dark:text-dark-400">
            {t('auth.resetPasswordHint')}
          </p>
        </div>

        {isInvalidLink ? (
          <div className="space-y-6">
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 dark:border-amber-800/50 dark:bg-amber-900/20">
              <div className="flex flex-col items-center gap-4 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-800/50">
                  <Icon
                    name="exclamationCircle"
                    size="lg"
                    className="text-amber-600 dark:text-amber-400"
                  />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-amber-800 dark:text-amber-200">
                    {t('auth.invalidResetLink')}
                  </h3>
                  <p className="mt-2 text-sm text-amber-700 dark:text-amber-300">
                    {t('auth.invalidResetLinkHint')}
                  </p>
                </div>
              </div>
            </div>

            <div className="text-center">
              <Link
                href="/forgot-password"
                className="inline-flex items-center gap-2 font-medium text-primary-600 transition-colors hover:text-primary-500 dark:text-primary-400 dark:hover:text-primary-300"
              >
                {t('auth.requestNewResetLink')}
              </Link>
            </div>
          </div>
        ) : isSuccess ? (
          <div className="space-y-6">
            <div className="rounded-xl border border-green-200 bg-green-50 p-6 dark:border-green-800/50 dark:bg-green-900/20">
              <div className="flex flex-col items-center gap-4 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-100 dark:bg-green-800/50">
                  <Icon name="checkCircle" size="lg" className="text-green-600 dark:text-green-400" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-green-800 dark:text-green-200">
                    {t('auth.passwordResetSuccess')}
                  </h3>
                  <p className="mt-2 text-sm text-green-700 dark:text-green-300">
                    {t('auth.passwordResetSuccessHint')}
                  </p>
                </div>
              </div>
            </div>

            <div className="text-center">
              <Link href="/login" className="btn btn-primary inline-flex items-center gap-2">
                <Icon name="login" size="md" />
                {t('auth.signIn')}
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
                  value={email}
                  type="email"
                  readOnly
                  disabled
                  className="input bg-gray-50 pl-11 dark:bg-dark-700"
                />
              </div>
            </div>

            <div>
              <label htmlFor="password" className="input-label">
                {t('auth.newPassword')}
              </label>
              <div className="relative">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5">
                  <Icon name="lock" size="md" className="text-gray-400 dark:text-dark-500" />
                </div>
                <input
                  id="password"
                  value={formData.password}
                  onChange={(event) =>
                    setFormData((prev) => ({ ...prev, password: event.target.value }))
                  }
                  type={showPassword ? 'text' : 'password'}
                  required
                  autoComplete="new-password"
                  disabled={isLoading}
                  className={`input pl-11 pr-11${errors.password ? ' input-error' : ''}`}
                  placeholder={t('auth.newPasswordPlaceholder')}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((value) => !value)}
                  className="absolute inset-y-0 right-0 flex items-center pr-3.5 text-gray-400 transition-colors hover:text-gray-600 dark:hover:text-dark-300"
                >
                  {showPassword ? <Icon name="eyeOff" size="md" /> : <Icon name="eye" size="md" />}
                </button>
              </div>
            </div>

            <div>
              <label htmlFor="confirmPassword" className="input-label">
                {t('auth.confirmPassword')}
              </label>
              <div className="relative">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5">
                  <Icon name="lock" size="md" className="text-gray-400 dark:text-dark-500" />
                </div>
                <input
                  id="confirmPassword"
                  value={formData.confirmPassword}
                  onChange={(event) =>
                    setFormData((prev) => ({ ...prev, confirmPassword: event.target.value }))
                  }
                  type={showConfirmPassword ? 'text' : 'password'}
                  required
                  autoComplete="new-password"
                  disabled={isLoading}
                  className={`input pl-11 pr-11${errors.confirmPassword ? ' input-error' : ''}`}
                  placeholder={t('auth.confirmPasswordPlaceholder')}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword((value) => !value)}
                  className="absolute inset-y-0 right-0 flex items-center pr-3.5 text-gray-400 transition-colors hover:text-gray-600 dark:hover:text-dark-300"
                >
                  {showConfirmPassword ? (
                    <Icon name="eyeOff" size="md" />
                  ) : (
                    <Icon name="eye" size="md" />
                  )}
                </button>
              </div>
            </div>

            <button type="submit" disabled={isLoading} className="btn btn-primary w-full">
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
              {isLoading ? t('auth.resettingPassword') : t('auth.resetPassword')}
            </button>
          </form>
        )}
      </div>
    </AuthLayout>
  )
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordContent />
    </Suspense>
  )
}
