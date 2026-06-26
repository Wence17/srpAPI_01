'use client'

import { useEffect, useMemo, useState } from 'react'
import { useApp } from '@/context/AppContext'
import { useI18n } from '@/lib/i18n'
import { adminAccountsAPI } from '@/lib/adminAccounts'
import { extractApiErrorMessage } from '@/lib/apiError'
import { formatDateTime } from '@/lib/format'
import BaseDialog from '@/components/common/BaseDialog'
import type { Account, TempUnschedulableStatus } from '@/lib/types'

interface TempUnschedStatusModalProps {
  show: boolean
  account: Account | null
  onClose: () => void
  onReset: (account: Account) => void
}

export default function TempUnschedStatusModal({
  show,
  account,
  onClose,
  onReset,
}: TempUnschedStatusModalProps) {
  const appStore = useApp()
  const { t } = useI18n()

  const [loading, setLoading] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [status, setStatus] = useState<TempUnschedulableStatus | null>(null)

  const state = status?.state || null

  const isActive = useMemo(() => {
    if (!status?.active || !state) return false
    return state.until_unix * 1000 > Date.now()
  }, [status, state])

  const ruleIndexDisplay = state ? state.rule_index + 1 : '-'

  const triggeredAtText = state?.triggered_at_unix
    ? formatDateTime(new Date(state.triggered_at_unix * 1000))
    : '-'

  const untilText = state?.until_unix ? formatDateTime(new Date(state.until_unix * 1000)) : '-'

  const remainingText = useMemo(() => {
    if (!state) return '-'
    const remainingMs = state.until_unix * 1000 - Date.now()
    if (remainingMs <= 0) return t('admin.accounts.tempUnschedulable.expired')
    const minutes = Math.ceil(remainingMs / 60000)
    if (minutes < 60) return t('admin.accounts.tempUnschedulable.remainingMinutes', { minutes })
    const hours = Math.floor(minutes / 60)
    const rest = minutes % 60
    if (rest === 0) return t('admin.accounts.tempUnschedulable.remainingHours', { hours })
    return t('admin.accounts.tempUnschedulable.remainingHoursMinutes', { hours, minutes: rest })
  }, [state, t])

  const loadStatus = async () => {
    if (!account) return
    setLoading(true)
    try {
      setStatus(await adminAccountsAPI.getTempUnschedulableStatus(account.id))
    } catch (error: unknown) {
      appStore.showError(extractApiErrorMessage(error, t('admin.accounts.tempUnschedulable.failedToLoad')))
      setStatus(null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (show && account) {
      void loadStatus()
    } else {
      setStatus(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show, account?.id])

  const handleReset = async () => {
    if (!account) return
    setResetting(true)
    try {
      const updated = await adminAccountsAPI.recoverState(account.id)
      appStore.showSuccess(t('admin.accounts.recoverStateSuccess'))
      onReset(updated)
      onClose()
    } catch (error: unknown) {
      appStore.showError(extractApiErrorMessage(error, t('admin.accounts.recoverStateFailed')))
    } finally {
      setResetting(false)
    }
  }

  return (
    <BaseDialog
      show={show}
      title={t('admin.accounts.tempUnschedulable.statusTitle')}
      width="normal"
      onClose={onClose}
      footer={
        <div className="flex justify-end gap-3">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            {t('common.close')}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={!isActive || resetting}
            onClick={() => void handleReset()}
          >
            {resetting ? (
              <svg className="-ml-1 mr-2 inline h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
            ) : null}
            {t('admin.accounts.recoverState')}
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <svg className="h-6 w-6 animate-spin text-gray-400" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
          </div>
        ) : !isActive ? (
          <div className="rounded-lg border border-gray-200 p-4 text-sm text-gray-500 dark:border-dark-600 dark:text-gray-400">
            {t('admin.accounts.tempUnschedulable.notActive')}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300">
              {t('admin.accounts.recoverStateHint')}
            </div>
            <div className="rounded-lg border border-gray-200 p-4 dark:border-dark-600">
              <p className="text-xs text-gray-500 dark:text-gray-400">{t('admin.accounts.tempUnschedulable.accountName')}</p>
              <p className="mt-1 text-sm font-medium text-gray-900 dark:text-gray-100">{account?.name || '-'}</p>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {[
                { label: t('admin.accounts.tempUnschedulable.triggeredAt'), value: triggeredAtText },
                { label: t('admin.accounts.tempUnschedulable.until'), value: untilText },
                { label: t('admin.accounts.tempUnschedulable.remaining'), value: remainingText },
                { label: t('admin.accounts.tempUnschedulable.errorCode'), value: state?.status_code || '-' },
                { label: t('admin.accounts.tempUnschedulable.matchedKeyword'), value: state?.matched_keyword || '-' },
                { label: t('admin.accounts.tempUnschedulable.ruleOrder'), value: ruleIndexDisplay },
              ].map((item) => (
                <div key={item.label} className="rounded-lg border border-gray-200 p-3 dark:border-dark-600">
                  <p className="text-xs text-gray-500 dark:text-gray-400">{item.label}</p>
                  <p className="mt-1 text-sm font-medium text-gray-900 dark:text-gray-100">{item.value}</p>
                </div>
              ))}
            </div>
            <div className="rounded-lg border border-gray-200 p-3 dark:border-dark-600">
              <p className="text-xs text-gray-500 dark:text-gray-400">{t('admin.accounts.tempUnschedulable.errorMessage')}</p>
              <div className="mt-2 rounded bg-gray-50 p-2 text-xs text-gray-700 dark:bg-dark-700 dark:text-gray-300">
                {state?.error_message || '-'}
              </div>
            </div>
          </div>
        )}
      </div>
    </BaseDialog>
  )
}
