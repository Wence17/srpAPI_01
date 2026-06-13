'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useI18n } from '@/lib/i18n/I18nProvider'
import { useApp } from '@/context/AppContext'
import { totpAPI } from '@/lib/totp'

interface TotpDisableDialogProps {
  onClose: () => void
  onSuccess: () => void
}

export default function TotpDisableDialog({ onClose, onSuccess }: TotpDisableDialogProps) {
  const { t } = useI18n()
  const appStore = useApp()

  const [methodLoading, setMethodLoading] = useState(true)
  const [verificationMethod, setVerificationMethod] = useState<'email' | 'password'>('password')
  const [loading, setLoading] = useState(false)
  const [sendingCode, setSendingCode] = useState(false)
  const [codeCooldown, setCodeCooldown] = useState(0)
  const cooldownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const [form, setForm] = useState({ emailCode: '', password: '' })

  const canSubmit = useMemo(() => {
    if (verificationMethod === 'email') {
      return form.emailCode.length === 6
    }
    return form.password.length > 0
  }, [verificationMethod, form.emailCode, form.password])

  useEffect(() => {
    const loadVerificationMethod = async () => {
      setMethodLoading(true)
      try {
        const method = await totpAPI.getVerificationMethod()
        setVerificationMethod(method.method)
      } catch (err: unknown) {
        const error = err as { response?: { data?: { message?: string } } }
        appStore.showError(error.response?.data?.message || t('common.error'))
        onClose()
      } finally {
        setMethodLoading(false)
      }
    }
    void loadVerificationMethod()
  }, [appStore, onClose, t])

  useEffect(() => {
    return () => {
      if (cooldownTimerRef.current) {
        clearInterval(cooldownTimerRef.current)
        cooldownTimerRef.current = null
      }
    }
  }, [])

  const handleSendCode = async () => {
    setSendingCode(true)
    try {
      await totpAPI.sendVerifyCode()
      appStore.showSuccess(t('profile.totp.codeSent'))
      setCodeCooldown(60)
      if (cooldownTimerRef.current) {
        clearInterval(cooldownTimerRef.current)
        cooldownTimerRef.current = null
      }
      cooldownTimerRef.current = setInterval(() => {
        setCodeCooldown((prev) => {
          if (prev <= 1) {
            if (cooldownTimerRef.current) {
              clearInterval(cooldownTimerRef.current)
              cooldownTimerRef.current = null
            }
            return 0
          }
          return prev - 1
        })
      }, 1000)
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } }
      appStore.showError(error.response?.data?.message || t('profile.totp.sendCodeFailed'))
    } finally {
      setSendingCode(false)
    }
  }

  const handleDisable = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!canSubmit) return

    setLoading(true)
    try {
      const request =
        verificationMethod === 'email' ? { email_code: form.emailCode } : { password: form.password }
      await totpAPI.disable(request)
      appStore.showSuccess(t('profile.totp.disableSuccess'))
      onSuccess()
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } }
      appStore.showError(error.response?.data?.message || t('profile.totp.disableFailed'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto" onClick={onClose}>
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="fixed inset-0 bg-black/50 transition-opacity" onClick={onClose} />

        <div
          className="relative w-full max-w-md transform rounded-xl bg-white p-6 shadow-xl transition-all dark:bg-dark-800"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="mb-6">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30">
              <svg
                className="h-6 w-6 text-red-600 dark:text-red-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth="1.5"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
                />
              </svg>
            </div>
            <h3 className="mt-4 text-center text-xl font-semibold text-gray-900 dark:text-white">
              {t('profile.totp.disableTitle')}
            </h3>
            <p className="mt-2 text-center text-sm text-gray-500 dark:text-gray-400">
              {t('profile.totp.disableWarning')}
            </p>
          </div>

          {methodLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary-500" />
            </div>
          ) : (
            <form onSubmit={handleDisable} className="space-y-4">
              {verificationMethod === 'email' ? (
                <div>
                  <label className="input-label">{t('profile.totp.emailCode')}</label>
                  <div className="flex gap-2">
                    <input
                      value={form.emailCode}
                      onChange={(event) => setForm((prev) => ({ ...prev, emailCode: event.target.value }))}
                      type="text"
                      maxLength={6}
                      inputMode="numeric"
                      className="input flex-1"
                      placeholder={t('profile.totp.enterEmailCode')}
                    />
                    <button
                      type="button"
                      className="btn btn-secondary whitespace-nowrap"
                      disabled={sendingCode || codeCooldown > 0}
                      onClick={handleSendCode}
                    >
                      {codeCooldown > 0
                        ? `${codeCooldown}s`
                        : sendingCode
                          ? t('common.sending')
                          : t('profile.totp.sendCode')}
                    </button>
                  </div>
                </div>
              ) : (
                <div>
                  <label htmlFor="password" className="input-label">
                    {t('profile.currentPassword')}
                  </label>
                  <input
                    id="password"
                    value={form.password}
                    onChange={(event) => setForm((prev) => ({ ...prev, password: event.target.value }))}
                    type="password"
                    autoComplete="current-password"
                    className="input"
                    placeholder={t('profile.totp.enterPassword')}
                  />
                </div>
              )}

              <div className="flex justify-end gap-3 pt-4">
                <button type="button" className="btn btn-secondary" onClick={onClose}>
                  {t('common.cancel')}
                </button>
                <button type="submit" className="btn btn-danger" disabled={loading || !canSubmit}>
                  {loading ? t('common.processing') : t('profile.totp.confirmDisable')}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
