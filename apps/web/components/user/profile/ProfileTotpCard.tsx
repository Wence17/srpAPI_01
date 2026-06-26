'use client'

import { useEffect, useState } from 'react'
import { useI18n } from '@/lib/i18n/I18nProvider'
import { totpAPI } from '@/lib/totp'
import type { TotpStatus } from '@/lib/types'
import TotpSetupModal from './TotpSetupModal'
import TotpDisableDialog from './TotpDisableDialog'

export default function ProfileTotpCard() {
  const { t } = useI18n()

  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState<TotpStatus | null>(null)
  const [showSetupModal, setShowSetupModal] = useState(false)
  const [showDisableDialog, setShowDisableDialog] = useState(false)

  const loadStatus = async () => {
    setLoading(true)
    try {
      setStatus(await totpAPI.getStatus())
    } catch (error) {
      console.error('Failed to load TOTP status:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadStatus()
  }, [])

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp * 1000)
    return date.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  return (
    <div className="card">
      <div className="border-b border-gray-100 px-6 py-4 dark:border-dark-700">
        <h2 className="text-lg font-medium text-gray-900 dark:text-white">{t('profile.totp.title')}</h2>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{t('profile.totp.description')}</p>
      </div>
      <div className="px-6 py-6">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary-500" />
          </div>
        ) : status && !status.feature_enabled ? (
          <div className="flex items-center gap-4 py-4">
            <div className="flex-shrink-0 rounded-full bg-gray-100 p-3 dark:bg-dark-700">
              <svg
                className="h-6 w-6 text-gray-400"
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
            <div>
              <p className="font-medium text-gray-700 dark:text-gray-300">{t('profile.totp.featureDisabled')}</p>
              <p className="text-sm text-gray-500 dark:text-gray-400">{t('profile.totp.featureDisabledHint')}</p>
            </div>
          </div>
        ) : status?.enabled ? (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="flex-shrink-0 rounded-full bg-green-100 p-3 dark:bg-green-900/30">
                <svg
                  className="h-6 w-6 text-green-600 dark:text-green-400"
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
              <div>
                <p className="font-medium text-gray-900 dark:text-white">{t('profile.totp.enabled')}</p>
                {status.enabled_at && (
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {t('profile.totp.enabledAt')}: {formatDate(status.enabled_at)}
                  </p>
                )}
              </div>
            </div>
            <button type="button" className="btn btn-outline-danger" onClick={() => setShowDisableDialog(true)}>
              {t('profile.totp.disable')}
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="flex-shrink-0 rounded-full bg-gray-100 p-3 dark:bg-dark-700">
                <svg
                  className="h-6 w-6 text-gray-400"
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
              <div>
                <p className="font-medium text-gray-700 dark:text-gray-300">{t('profile.totp.notEnabled')}</p>
                <p className="text-sm text-gray-500 dark:text-gray-400">{t('profile.totp.notEnabledHint')}</p>
              </div>
            </div>
            <button type="button" className="btn btn-primary" onClick={() => setShowSetupModal(true)}>
              {t('profile.totp.enable')}
            </button>
          </div>
        )}
      </div>

      {showSetupModal && (
        <TotpSetupModal
          onClose={() => setShowSetupModal(false)}
          onSuccess={() => {
            setShowSetupModal(false)
            void loadStatus()
          }}
        />
      )}

      {showDisableDialog && (
        <TotpDisableDialog
          onClose={() => setShowDisableDialog(false)}
          onSuccess={() => {
            setShowDisableDialog(false)
            void loadStatus()
          }}
        />
      )}
    </div>
  )
}
