'use client'

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react'
import { useI18n } from '@/lib/i18n'
import { useApp } from '@/context/AppContext'

export interface TotpLoginModalHandle {
  setVerifying: (value: boolean) => void
  setError: (message: string) => void
}

interface TotpLoginModalProps {
  tempToken: string
  userEmailMasked?: string
  onVerify: (code: string) => void
  onCancel: () => void
}

const TotpLoginModal = forwardRef<TotpLoginModalHandle, TotpLoginModalProps>(function TotpLoginModal(
  { userEmailMasked, onVerify, onCancel },
  ref,
) {
  const { t } = useI18n()
  const { showError } = useApp()
  const [verifying, setVerifying] = useState(false)
  const [code, setCode] = useState<string[]>(['', '', '', '', '', ''])
  const inputRefs = useRef<(HTMLInputElement | null)[]>([])
  const hiddenOtpInputRef = useRef<HTMLInputElement>(null)

  useImperativeHandle(ref, () => ({
    setVerifying: (value: boolean) => setVerifying(value),
    setError: (message: string) => {
      if (message) {
        showError(message)
      }
      setCode(['', '', '', '', '', ''])
      inputRefs.current.forEach((input) => {
        if (input) input.value = ''
      })
      if (hiddenOtpInputRef.current) {
        hiddenOtpInputRef.current.value = ''
      }
      setTimeout(() => {
        inputRefs.current[0]?.focus()
      }, 0)
    },
  }))

  useEffect(() => {
    const joined = code.join('')
    if (joined.length === 6 && !verifying) {
      onVerify(joined)
    }
  }, [code, verifying, onVerify])

  useEffect(() => {
    setTimeout(() => {
      inputRefs.current[0]?.focus()
    }, 0)
  }, [])

  const handleCodeInput = (event: React.ChangeEvent<HTMLInputElement>, index: number) => {
    const value = event.target.value.replace(/[^0-9]/g, '')
    setCode((prev) => {
      const next = [...prev]
      next[index] = value
      return next
    })
    if (value && index < 5) {
      setTimeout(() => {
        inputRefs.current[index + 1]?.focus()
      }, 0)
    }
  }

  const handleHiddenOtpInput = (event: React.ChangeEvent<HTMLInputElement>) => {
    const digits = event.target.value.replace(/[^0-9]/g, '').slice(0, 6).split('')
    const next = ['', '', '', '', '', '']
    digits.forEach((digit, i) => {
      next[i] = digit
      if (inputRefs.current[i]) {
        inputRefs.current[i]!.value = digit
      }
    })
    for (let i = digits.length; i < 6; i++) {
      if (inputRefs.current[i]) {
        inputRefs.current[i]!.value = ''
      }
    }
    setCode(next)
  }

  const handleKeydown = (event: React.KeyboardEvent<HTMLInputElement>, index: number) => {
    if (event.key === 'Backspace') {
      const input = event.target as HTMLInputElement
      if (!input.value && index > 0) {
        event.preventDefault()
        inputRefs.current[index - 1]?.focus()
      }
    }
  }

  const handlePaste = (event: React.ClipboardEvent<HTMLInputElement>) => {
    event.preventDefault()
    const pastedData = event.clipboardData?.getData('text') || ''
    const digits = pastedData.replace(/[^0-9]/g, '').slice(0, 6).split('')
    const next = ['', '', '', '', '', '']
    digits.forEach((digit, index) => {
      next[index] = digit
      if (inputRefs.current[index]) {
        inputRefs.current[index]!.value = digit
      }
    })
    for (let i = digits.length; i < 6; i++) {
      if (inputRefs.current[i]) {
        inputRefs.current[i]!.value = ''
      }
    }
    setCode(next)
    const focusIndex = Math.min(digits.length, 5)
    setTimeout(() => {
      inputRefs.current[focusIndex]?.focus()
    }, 0)
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="fixed inset-0 bg-black/50 transition-opacity" />

        <div className="relative w-full max-w-md transform rounded-xl bg-white p-6 shadow-xl transition-all dark:bg-dark-800">
          <div className="mb-6 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary-100 dark:bg-primary-900/30">
              <svg
                className="h-6 w-6 text-primary-600 dark:text-primary-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth="1.5"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z"
                />
              </svg>
            </div>
            <h3 className="mt-4 text-xl font-semibold text-gray-900 dark:text-white">
              {t('profile.totp.loginTitle')}
            </h3>
            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">{t('profile.totp.loginHint')}</p>
            {userEmailMasked && (
              <p className="mt-1 text-sm font-medium text-gray-700 dark:text-gray-300">{userEmailMasked}</p>
            )}
          </div>

          <div className="mb-6">
            <input
              ref={hiddenOtpInputRef}
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              className="pointer-events-none absolute left-0 top-0 h-px w-px opacity-0"
              aria-hidden="true"
              tabIndex={-1}
              onChange={handleHiddenOtpInput}
            />
            <div className="flex justify-center gap-2">
              {Array.from({ length: 6 }).map((_, index) => (
                <input
                  key={index}
                  ref={(el) => {
                    inputRefs.current[index] = el
                  }}
                  type="text"
                  maxLength={1}
                  inputMode="numeric"
                  pattern="[0-9]"
                  autoComplete="off"
                  className="h-12 w-10 rounded-lg border border-gray-300 text-center text-lg font-semibold focus:border-primary-500 focus:ring-primary-500 dark:border-dark-600 dark:bg-dark-700"
                  disabled={verifying}
                  onChange={(event) => handleCodeInput(event, index)}
                  onKeyDown={(event) => handleKeydown(event, index)}
                  onPaste={handlePaste}
                />
              ))}
            </div>
            {verifying && (
              <div className="mt-3 flex items-center justify-center gap-2 text-sm text-gray-500">
                <div className="h-4 w-4 animate-spin rounded-full border-b-2 border-primary-500" />
                {t('common.verifying')}
              </div>
            )}
          </div>

          <button type="button" className="btn btn-secondary w-full" disabled={verifying} onClick={onCancel}>
            {t('common.cancel')}
          </button>
        </div>
      </div>
    </div>
  )
})

export default TotpLoginModal
