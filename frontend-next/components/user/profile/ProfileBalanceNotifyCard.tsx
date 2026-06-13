'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useI18n } from '@/lib/i18n/I18nProvider'
import { useAuth } from '@/context/AuthContext'
import { useApp } from '@/context/AppContext'
import { userAPI } from '@/lib/user'
import { extractApiErrorMessage } from '@/lib/apiError'
import type { NotifyEmailEntry } from '@/lib/types'

const maxTotalEmails = 3

interface PendingEmail {
  email: string
  codeSent: boolean
  code: string
  sending: boolean
  verifying: boolean
  countdown: number
  timer: ReturnType<typeof setInterval> | null
}

interface ProfileBalanceNotifyCardProps {
  enabled: boolean
  threshold: number | null | undefined
  extraEmails: NotifyEmailEntry[]
  systemDefaultThreshold: number
  userEmail: string
}

export default function ProfileBalanceNotifyCard({
  enabled,
  threshold,
  extraEmails,
  systemDefaultThreshold,
  userEmail,
}: ProfileBalanceNotifyCardProps) {
  const { t } = useI18n()
  const { updateUser } = useAuth()
  const appStore = useApp()

  const [notifyEnabled, setNotifyEnabled] = useState(enabled)
  const [customThreshold, setCustomThreshold] = useState<number | null>(threshold ?? null)
  const [emailEntries, setEmailEntries] = useState<NotifyEmailEntry[]>([...extraEmails])
  const [pendingEmails, setPendingEmails] = useState<PendingEmail[]>([])
  const [newEmail, setNewEmail] = useState('')
  const [savingThreshold, setSavingThreshold] = useState(false)

  const [verifyingEmail, setVerifyingEmail] = useState('')
  const [verifyCode, setVerifyCode] = useState('')
  const [verifyingSaved, setVerifyingSaved] = useState(false)
  const [sendingSavedCode, setSendingSavedCode] = useState(false)
  const [verifyCountdown, setVerifyCountdown] = useState(0)
  const verifyTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const canAddMore = useMemo(
    () => emailEntries.length + pendingEmails.length < maxTotalEmails,
    [emailEntries.length, pendingEmails.length],
  )

  useEffect(() => {
    setNotifyEnabled(enabled)
  }, [enabled])

  useEffect(() => {
    setCustomThreshold(threshold ?? null)
  }, [threshold])

  useEffect(() => {
    setEmailEntries([...extraEmails])
  }, [extraEmails])

  useEffect(() => {
    if (emailEntries.length === 0 && userEmail) {
      setNewEmail(userEmail)
    }
  }, [emailEntries.length, userEmail])

  useEffect(() => {
    return () => {
      for (const pe of pendingEmails) {
        if (pe.timer) clearInterval(pe.timer)
      }
      if (verifyTimerRef.current) clearInterval(verifyTimerRef.current)
    }
  }, [pendingEmails])

  const handleToggle = async (nextEnabled: boolean) => {
    try {
      const updated = await userAPI.updateProfile({ balance_notify_enabled: nextEnabled })
      updateUser(updated)
    } catch (err: unknown) {
      appStore.showError(extractApiErrorMessage(err, t('common.error')))
      setNotifyEnabled((prev) => !prev)
    }
  }

  const handleThresholdUpdate = async () => {
    setSavingThreshold(true)
    try {
      const nextThreshold = customThreshold && customThreshold > 0 ? customThreshold : 0
      const updated = await userAPI.updateProfile({ balance_notify_threshold: nextThreshold })
      updateUser(updated)
      appStore.showSuccess(t('common.saved'))
    } catch (err: unknown) {
      appStore.showError(extractApiErrorMessage(err, t('common.error')))
    } finally {
      setSavingThreshold(false)
    }
  }

  const handleEmailToggle = async (entry: NotifyEmailEntry) => {
    const newDisabled = !entry.disabled
    try {
      const updated = await userAPI.toggleNotifyEmail(entry.email, newDisabled)
      updateUser(updated)
      setEmailEntries([...(updated.balance_notify_extra_emails || [])])
    } catch (err: unknown) {
      appStore.showError(extractApiErrorMessage(err, t('common.error')))
    }
  }

  const addPendingEmail = () => {
    const email = newEmail.trim()
    if (!email) return
    const isDuplicate =
      emailEntries.some((e) => e.email.toLowerCase() === email.toLowerCase()) ||
      pendingEmails.some((p) => p.email.toLowerCase() === email.toLowerCase())
    if (isDuplicate) {
      appStore.showError(t('profile.balanceNotify.emailDuplicate'))
      return
    }
    setPendingEmails((prev) => [
      ...prev,
      { email, codeSent: false, code: '', sending: false, verifying: false, countdown: 0, timer: null },
    ])
    setNewEmail('')
  }

  const sendCodeFor = async (idx: number) => {
    const pe = pendingEmails[idx]
    if (!pe) return
    setPendingEmails((prev) => {
      const next = [...prev]
      next[idx] = { ...next[idx], sending: true }
      return next
    })
    try {
      await userAPI.sendNotifyEmailCode(pe.email)
      const timer = setInterval(() => {
        setPendingEmails((prev) => {
          const next = [...prev]
          const current = next[idx]
          if (!current) return prev
          const countdown = current.countdown - 1
          if (countdown <= 0 && current.timer) {
            clearInterval(current.timer)
          }
          next[idx] = { ...current, countdown: Math.max(0, countdown), timer: countdown > 0 ? current.timer : null }
          return next
        })
      }, 1000)
      setPendingEmails((prev) => {
        const next = [...prev]
        next[idx] = { ...next[idx], codeSent: true, countdown: 60, timer, sending: false }
        return next
      })
      appStore.showSuccess(t('profile.balanceNotify.codeSent'))
    } catch (err: unknown) {
      appStore.showError(extractApiErrorMessage(err, t('common.error')))
      setPendingEmails((prev) => {
        const next = [...prev]
        next[idx] = { ...next[idx], sending: false }
        return next
      })
    }
  }

  const verifyPending = async (idx: number) => {
    const pe = pendingEmails[idx]
    if (!pe || !pe.code || pe.code.length !== 6) return
    setPendingEmails((prev) => {
      const next = [...prev]
      next[idx] = { ...next[idx], verifying: true }
      return next
    })
    try {
      await userAPI.verifyNotifyEmail(pe.email, pe.code)
      if (pe.timer) clearInterval(pe.timer)
      setPendingEmails((prev) => prev.filter((_, i) => i !== idx))
      appStore.showSuccess(t('profile.balanceNotify.verifySuccess'))
      const updated = await userAPI.getProfile()
      updateUser(updated)
      setEmailEntries([...(updated.balance_notify_extra_emails || [])])
    } catch (err: unknown) {
      appStore.showError(extractApiErrorMessage(err, t('common.error')))
    } finally {
      setPendingEmails((prev) => {
        const next = [...prev]
        if (next[idx]) next[idx] = { ...next[idx], verifying: false }
        return next
      })
    }
  }

  const handleRemoveEmail = async (email: string) => {
    try {
      await userAPI.removeNotifyEmail(email)
      appStore.showSuccess(t('profile.balanceNotify.removeSuccess'))
      const updated = await userAPI.getProfile()
      updateUser(updated)
      setEmailEntries([...(updated.balance_notify_extra_emails || [])])
    } catch (err: unknown) {
      appStore.showError(extractApiErrorMessage(err, t('common.error')))
    }
  }

  const sendCodeForSaved = async (email: string) => {
    setSendingSavedCode(true)
    try {
      await userAPI.sendNotifyEmailCode(email)
      setVerifyingEmail(email)
      setVerifyCode('')
      setVerifyCountdown(60)
      if (verifyTimerRef.current) clearInterval(verifyTimerRef.current)
      verifyTimerRef.current = setInterval(() => {
        setVerifyCountdown((prev) => {
          if (prev <= 1) {
            if (verifyTimerRef.current) {
              clearInterval(verifyTimerRef.current)
              verifyTimerRef.current = null
            }
            return 0
          }
          return prev - 1
        })
      }, 1000)
      appStore.showSuccess(t('profile.balanceNotify.codeSent'))
    } catch (err: unknown) {
      appStore.showError(extractApiErrorMessage(err, t('common.error')))
    } finally {
      setSendingSavedCode(false)
    }
  }

  const verifySavedEmail = async (email: string) => {
    if (!verifyCode || verifyCode.length !== 6) return
    setVerifyingSaved(true)
    try {
      await userAPI.verifyNotifyEmail(email, verifyCode)
      setVerifyingEmail('')
      setVerifyCode('')
      if (verifyTimerRef.current) {
        clearInterval(verifyTimerRef.current)
        verifyTimerRef.current = null
      }
      appStore.showSuccess(t('profile.balanceNotify.verifySuccess'))
      const updated = await userAPI.getProfile()
      updateUser(updated)
      setEmailEntries([...(updated.balance_notify_extra_emails || [])])
    } catch (err: unknown) {
      appStore.showError(extractApiErrorMessage(err, t('common.error')))
    } finally {
      setVerifyingSaved(false)
    }
  }

  return (
    <div className="card">
      <div className="border-b border-gray-100 px-6 py-4 dark:border-dark-700">
        <h2 className="text-lg font-medium text-gray-900 dark:text-white">{t('profile.balanceNotify.title')}</h2>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{t('profile.balanceNotify.description')}</p>
      </div>
      <div className="space-y-6 px-6 py-6">
        <div className="flex items-center justify-between">
          <label className="input-label mb-0">{t('profile.balanceNotify.enabled')}</label>
          <label className="relative inline-flex cursor-pointer items-center">
            <input
              type="checkbox"
              checked={notifyEnabled}
              onChange={(event) => {
                const nextEnabled = event.target.checked
                setNotifyEnabled(nextEnabled)
                void handleToggle(nextEnabled)
              }}
              className="peer sr-only"
            />
            <div className="h-6 w-11 rounded-full bg-gray-200 after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:border after:border-gray-300 after:bg-white after:transition-all after:content-[''] peer-checked:bg-primary-600 peer-checked:after:translate-x-full peer-checked:after:border-white peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-300 dark:bg-gray-700 dark:after:border-gray-600 dark:peer-focus:ring-primary-800" />
          </label>
        </div>

        {notifyEnabled && (
          <>
            <div>
              <label className="input-label">
                {t('profile.balanceNotify.threshold')}
                <span className="ml-2 text-xs text-gray-400">{t('profile.balanceNotify.thresholdHint')}</span>
              </label>
              <div className="flex items-center gap-2">
                <span className="text-gray-500">$</span>
                <input
                  value={customThreshold ?? ''}
                  onChange={(event) =>
                    setCustomThreshold(event.target.value === '' ? null : Number(event.target.value))
                  }
                  type="number"
                  min={0}
                  step={0.01}
                  className="input flex-1"
                  placeholder={
                    systemDefaultThreshold > 0
                      ? `${t('profile.balanceNotify.systemDefault')} $${systemDefaultThreshold}`
                      : t('profile.balanceNotify.thresholdPlaceholder')
                  }
                />
                <button
                  onClick={handleThresholdUpdate}
                  disabled={savingThreshold}
                  className="btn btn-primary btn-sm whitespace-nowrap"
                >
                  {savingThreshold ? t('common.saving') : t('common.save')}
                </button>
              </div>
            </div>

            <div>
              <label className="input-label">{t('profile.balanceNotify.extraEmails')}</label>
              <p className="mb-2 text-xs text-yellow-600 dark:text-yellow-400">
                {t('profile.balanceNotify.extraEmailsHint')}
              </p>

              {emailEntries.length > 0 && (
                <div className="mb-3 space-y-2">
                  {emailEntries.map((entry, idx) => (
                    <div
                      key={`${entry.email}-${idx}`}
                      className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2 dark:bg-dark-700"
                    >
                      <div className="flex min-w-0 flex-1 items-center gap-2">
                        <label className="relative inline-flex shrink-0 cursor-pointer items-center">
                          <input
                            type="checkbox"
                            checked={!entry.disabled}
                            onChange={() => void handleEmailToggle(entry)}
                            className="peer sr-only"
                          />
                          <div className="h-5 w-9 rounded-full bg-gray-200 after:absolute after:left-[2px] after:top-[2px] after:h-4 after:w-4 after:rounded-full after:border after:border-gray-300 after:bg-white after:transition-all after:content-[''] peer-checked:bg-primary-600 peer-checked:after:translate-x-full peer-checked:after:border-white peer-focus:outline-none dark:bg-gray-600 dark:after:border-gray-500" />
                        </label>
                        <span className="truncate text-sm text-gray-700 dark:text-gray-300">{entry.email}</span>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        {!entry.verified ? (
                          verifyingEmail === entry.email ? (
                            <>
                              <input
                                value={verifyCode}
                                onChange={(event) => setVerifyCode(event.target.value)}
                                type="text"
                                maxLength={6}
                                className="w-20 rounded border border-gray-300 px-2 py-1 text-xs dark:border-dark-500 dark:bg-dark-700"
                                placeholder={t('profile.balanceNotify.codePlaceholder')}
                              />
                              <button
                                onClick={() => void verifySavedEmail(entry.email)}
                                disabled={!verifyCode || verifyCode.length !== 6 || verifyingSaved}
                                className="text-xs text-primary-600 hover:text-primary-700"
                              >
                                {t('profile.balanceNotify.verify')}
                              </button>
                              {verifyCountdown > 0 ? (
                                <span className="text-xs text-gray-400">{verifyCountdown}s</span>
                              ) : (
                                <button
                                  onClick={() => void sendCodeForSaved(entry.email)}
                                  disabled={sendingSavedCode}
                                  className="text-xs text-gray-500 hover:text-gray-700"
                                >
                                  {t('profile.balanceNotify.resend')}
                                </button>
                              )}
                              <button
                                onClick={() => setVerifyingEmail('')}
                                className="text-xs text-gray-400 hover:text-gray-600"
                              >
                                {t('common.cancel')}
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                onClick={() => void sendCodeForSaved(entry.email)}
                                disabled={sendingSavedCode}
                                className="text-xs text-primary-600 hover:text-primary-700"
                              >
                                {t('profile.balanceNotify.verify')}
                              </button>
                              <span className="text-xs text-yellow-500">{t('profile.balanceNotify.unverified')}</span>
                            </>
                          )
                        ) : (
                          <span className="text-xs text-green-500">{t('profile.balanceNotify.verified')}</span>
                        )}
                        <button
                          onClick={() => void handleRemoveEmail(entry.email)}
                          className="text-xs text-red-500 hover:text-red-700"
                        >
                          {t('profile.balanceNotify.removeEmail')}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {pendingEmails.length > 0 && (
                <div className="mb-3 space-y-2">
                  {pendingEmails.map((pe, idx) => (
                    <div
                      key={pe.email}
                      className="flex items-center gap-2 rounded-lg border border-yellow-200 bg-yellow-50 px-3 py-2 dark:border-yellow-800 dark:bg-yellow-900/10"
                    >
                      <span className="flex-1 text-sm text-gray-700 dark:text-gray-300">{pe.email}</span>
                      {!pe.codeSent ? (
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => void sendCodeFor(idx)}
                            disabled={pe.sending}
                            className="text-xs text-primary-600 hover:text-primary-700"
                          >
                            {t('profile.balanceNotify.sendCode')}
                          </button>
                          <button
                            onClick={() => setPendingEmails((prev) => prev.filter((_, i) => i !== idx))}
                            className="ml-1 text-xs text-red-500 hover:text-red-700"
                          >
                            {t('profile.balanceNotify.removeEmail')}
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1">
                          <input
                            value={pe.code}
                            onChange={(event) => {
                              const value = event.target.value
                              setPendingEmails((prev) => {
                                const next = [...prev]
                                next[idx] = { ...next[idx], code: value }
                                return next
                              })
                            }}
                            type="text"
                            maxLength={6}
                            className="w-20 rounded border border-gray-300 px-2 py-1 text-xs dark:border-dark-500 dark:bg-dark-700"
                            placeholder={t('profile.balanceNotify.codePlaceholder')}
                          />
                          <button
                            onClick={() => void verifyPending(idx)}
                            disabled={!pe.code || pe.code.length !== 6 || pe.verifying}
                            className="text-xs text-primary-600 hover:text-primary-700"
                          >
                            {t('profile.balanceNotify.verify')}
                          </button>
                          {pe.countdown > 0 ? (
                            <span className="text-xs text-gray-400">{pe.countdown}s</span>
                          ) : (
                            <button
                              onClick={() => void sendCodeFor(idx)}
                              disabled={pe.sending}
                              className="text-xs text-gray-500 hover:text-gray-700"
                            >
                              {t('profile.balanceNotify.resend')}
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {canAddMore ? (
                <div className="flex gap-2">
                  <input
                    value={newEmail}
                    onChange={(event) => setNewEmail(event.target.value)}
                    type="email"
                    className="input flex-1"
                    placeholder={t('profile.balanceNotify.emailPlaceholder')}
                    onKeyUp={(event) => {
                      if (event.key === 'Enter') addPendingEmail()
                    }}
                  />
                  <button onClick={addPendingEmail} disabled={!newEmail} className="btn btn-secondary whitespace-nowrap">
                    {t('common.add')}
                  </button>
                </div>
              ) : (
                <p className="text-xs text-gray-400">{t('profile.balanceNotify.maxEmailsReached')}</p>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
