'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import TurnstileWidget, { type TurnstileWidgetHandle } from '@/components/TurnstileWidget'
import { useApp } from '@/context/AppContext'
import { useI18n } from '@/lib/i18n'
import { getPublicSettings, sendPendingOAuthVerifyCode } from '@/lib/auth'
import { getRequestErrorMessage } from '@/lib/oauthCallback'

export type PendingOAuthCreateAccountPayload = {
  email: string
  password: string
  verifyCode: string
  invitationCode?: string
}

interface PendingOAuthCreateAccountFormProps {
  initialEmail: string
  testIdPrefix: string
  isSubmitting: boolean
  errorMessage?: string
  onSubmit: (payload: PendingOAuthCreateAccountPayload) => void
  onSwitchToBind: (email: string) => void
}

export default function PendingOAuthCreateAccountForm({
  initialEmail,
  testIdPrefix,
  isSubmitting,
  errorMessage,
  onSubmit,
  onSwitchToBind,
}: PendingOAuthCreateAccountFormProps) {
  const { t } = useI18n()
  const appStore = useApp()

  const [email, setEmail] = useState(initialEmail)
  const [password, setPassword] = useState('')
  const [verifyCode, setVerifyCode] = useState('')
  const [invitationCode, setInvitationCode] = useState('')
  const [isSendingCode, setIsSendingCode] = useState(false)
  const [sendCodeError, setSendCodeError] = useState('')
  const [sendCodeSuccess, setSendCodeSuccess] = useState(false)
  const [countdown, setCountdown] = useState(0)
  const [invitationCodeEnabled, setInvitationCodeEnabled] = useState(false)
  const [turnstileEnabled, setTurnstileEnabled] = useState(false)
  const [turnstileSiteKey, setTurnstileSiteKey] = useState('')
  const [turnstileToken, setTurnstileToken] = useState('')

  const turnstileRef = useRef<TurnstileWidgetHandle>(null)
  const countdownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const clearCountdown = useCallback(() => {
    if (countdownTimerRef.current) {
      clearInterval(countdownTimerRef.current)
      countdownTimerRef.current = null
    }
  }, [])

  const startCountdown = useCallback(
    (seconds: number) => {
      clearCountdown()
      setCountdown(Math.max(0, seconds))
      if (seconds <= 0) return

      countdownTimerRef.current = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
            clearCountdown()
            return 0
          }
          return prev - 1
        })
      }, 1000)
    },
    [clearCountdown],
  )

  useEffect(() => {
    setEmail(initialEmail || '')
  }, [initialEmail])

  useEffect(() => {
    if (sendCodeError) {
      appStore.showError(sendCodeError)
    }
  }, [sendCodeError, appStore])

  useEffect(() => {
    if (errorMessage) {
      appStore.showError(errorMessage)
    }
  }, [errorMessage, appStore])

  useEffect(() => {
    getPublicSettings()
      .then((settings) => {
        setInvitationCodeEnabled(settings.invitation_code_enabled === true)
        setTurnstileEnabled(settings.turnstile_enabled === true)
        setTurnstileSiteKey(settings.turnstile_site_key || '')
      })
      .catch(() => {
        setInvitationCodeEnabled(false)
        setTurnstileEnabled(false)
        setTurnstileSiteKey('')
      })
  }, [])

  useEffect(() => () => clearCountdown(), [clearCountdown])

  const resetTurnstile = () => {
    setTurnstileToken('')
    turnstileRef.current?.reset()
  }

  const handleSendCode = async () => {
    const trimmedEmail = email.trim()
    if (!trimmedEmail) return

    if (turnstileEnabled && !turnstileToken) {
      setSendCodeError(t('auth.completeVerification'))
      return
    }

    setIsSendingCode(true)
    setSendCodeError('')
    setSendCodeSuccess(false)

    try {
      const response = await sendPendingOAuthVerifyCode({
        email: trimmedEmail,
        turnstile_token: turnstileEnabled ? turnstileToken : undefined,
      })
      setSendCodeSuccess(true)
      startCountdown(response.countdown)
      if (turnstileEnabled) {
        resetTurnstile()
      }
    } catch (error: unknown) {
      setSendCodeError(getRequestErrorMessage(error, t('auth.sendCodeFailed')))
    } finally {
      setIsSendingCode(false)
    }
  }

  const handleSubmit = () => {
    const trimmedEmail = email.trim()
    if (!trimmedEmail || password.length < 6) return

    onSubmit({
      email: trimmedEmail,
      password,
      verifyCode: verifyCode.trim(),
      invitationCode: invitationCode.trim() || undefined,
    })
  }

  return (
    <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); handleSubmit() }}>
      <input
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        data-testid={`${testIdPrefix}-create-account-email`}
        type="email"
        className="input w-full"
        placeholder={t('auth.emailPlaceholder')}
        disabled={isSubmitting || isSendingCode}
      />
      <input
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        data-testid={`${testIdPrefix}-create-account-password`}
        type="password"
        className="input w-full"
        placeholder={t('auth.passwordPlaceholder')}
        disabled={isSubmitting}
      />
      {turnstileEnabled && turnstileSiteKey && (
        <div className="space-y-2">
          <TurnstileWidget
            ref={turnstileRef}
            siteKey={turnstileSiteKey}
            onVerify={(token) => {
              setTurnstileToken(token)
              setSendCodeError('')
            }}
            onExpire={() => {
              setTurnstileToken('')
              setSendCodeError(t('auth.turnstileExpired'))
            }}
            onError={() => {
              setTurnstileToken('')
              setSendCodeError(t('auth.turnstileFailed'))
            }}
          />
        </div>
      )}
      <div className="flex gap-3">
        <input
          value={verifyCode}
          onChange={(e) => setVerifyCode(e.target.value)}
          data-testid={`${testIdPrefix}-create-account-verify-code`}
          type="text"
          inputMode="numeric"
          maxLength={6}
          className="input min-w-0 flex-1"
          placeholder="123456"
          disabled={isSubmitting}
        />
        <button
          data-testid={`${testIdPrefix}-create-account-send-code`}
          type="button"
          className="btn btn-secondary shrink-0"
          disabled={
            isSubmitting ||
            isSendingCode ||
            countdown > 0 ||
            !email.trim() ||
            (turnstileEnabled && !turnstileToken)
          }
          onClick={handleSendCode}
        >
          {isSendingCode
            ? t('auth.sendingCode')
            : countdown > 0
              ? t('auth.resendCountdown', { countdown })
              : t('auth.sendCode')}
        </button>
      </div>
      {sendCodeSuccess ? (
        <p className="text-sm text-green-600 dark:text-green-400">{t('auth.codeSentSuccess')}</p>
      ) : (
        <p className="text-xs text-gray-500 dark:text-dark-400">{t('auth.verificationCodeHint')}</p>
      )}
      {invitationCodeEnabled && (
        <input
          value={invitationCode}
          onChange={(e) => setInvitationCode(e.target.value)}
          data-testid={`${testIdPrefix}-create-account-invitation-code`}
          type="text"
          className="input w-full"
          placeholder={t('auth.invitationCodePlaceholder')}
          disabled={isSubmitting}
        />
      )}
      <button
        data-testid={`${testIdPrefix}-create-account-submit`}
        type="button"
        className="btn btn-primary w-full"
        disabled={
          isSubmitting ||
          !email.trim() ||
          password.length < 6 ||
          (invitationCodeEnabled && !invitationCode.trim())
        }
        onClick={handleSubmit}
      >
        {isSubmitting ? t('common.processing') : t('auth.createAccount')}
      </button>
      <button
        type="button"
        className="btn btn-secondary w-full"
        disabled={isSubmitting}
        onClick={() => onSwitchToBind(email.trim())}
      >
        {t('auth.alreadyHaveAccount')}
      </button>
    </form>
  )
}
