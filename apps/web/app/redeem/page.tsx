'use client'

import { useCallback, useEffect, useState } from 'react'
import { useI18n } from '@/lib/i18n/I18nProvider'
import { useAuth } from '@/context/AuthContext'
import { useApp } from '@/context/AppContext'
import { useSubscriptionStore } from '@/lib/stores/subscriptions'
import { redeemAPI, type RedeemHistoryItem, type RedeemResult } from '@/lib/redeem'
import { extractApiErrorMessage } from '@/lib/apiError'
import { formatDateTime } from '@/lib/format'
import AppLayout from '@/components/layout/AppLayout'
import Icon from '@/components/icons/Icon'

function isBalanceType(type: string) {
  return type === 'balance' || type === 'admin_balance'
}

function isSubscriptionType(type: string) {
  return type === 'subscription'
}

function isAdminAdjustment(type: string) {
  return type === 'admin_balance' || type === 'admin_concurrency'
}

export default function RedeemPage() {
  const { t } = useI18n()
  const { user, refreshUser } = useAuth()
  const appStore = useApp()
  const subscriptionStore = useSubscriptionStore()

  const [redeemCode, setRedeemCode] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [redeemResult, setRedeemResult] = useState<RedeemResult | null>(null)
  const [errorMessage, setErrorMessage] = useState('')

  const [history, setHistory] = useState<RedeemHistoryItem[]>([])
  const [loadingHistory, setLoadingHistory] = useState(false)

  const contactInfo = appStore.contactInfo

  const getHistoryItemTitle = useCallback(
    (item: RedeemHistoryItem) => {
      if (item.type === 'balance') {
        return t('redeem.balanceAddedRedeem')
      } else if (item.type === 'admin_balance') {
        return item.value >= 0 ? t('redeem.balanceAddedAdmin') : t('redeem.balanceDeductedAdmin')
      } else if (item.type === 'concurrency') {
        return t('redeem.concurrencyAddedRedeem')
      } else if (item.type === 'admin_concurrency') {
        return item.value >= 0
          ? t('redeem.concurrencyAddedAdmin')
          : t('redeem.concurrencyReducedAdmin')
      } else if (item.type === 'subscription') {
        return t('redeem.subscriptionAssigned')
      }
      return t('common.unknown')
    },
    [t],
  )

  const formatHistoryValue = useCallback(
    (item: RedeemHistoryItem) => {
      if (isBalanceType(item.type)) {
        const sign = item.value >= 0 ? '+' : ''
        return `${sign}$${item.value.toFixed(2)}`
      } else if (isSubscriptionType(item.type)) {
        const days = item.validity_days || Math.round(item.value)
        const groupName = item.group?.name || ''
        return groupName ? `${days}${t('redeem.days')} - ${groupName}` : `${days}${t('redeem.days')}`
      } else {
        const sign = item.value >= 0 ? '+' : ''
        return `${sign}${item.value} ${t('redeem.requests')}`
      }
    },
    [t],
  )

  const fetchHistory = useCallback(async () => {
    setLoadingHistory(true)
    try {
      setHistory(await redeemAPI.getHistory())
    } catch (error) {
      console.error('Failed to fetch history:', error)
    } finally {
      setLoadingHistory(false)
    }
  }, [])

  const handleRedeem = async () => {
    if (!redeemCode.trim()) {
      appStore.showError(t('redeem.pleaseEnterCode'))
      return
    }

    setSubmitting(true)
    setErrorMessage('')
    setRedeemResult(null)

    try {
      const result = await redeemAPI.redeem(redeemCode.trim())
      setRedeemResult(result)

      await refreshUser()

      if (result.type === 'subscription') {
        try {
          await subscriptionStore.fetchActiveSubscriptions(true)
        } catch (error) {
          console.error('Failed to refresh subscriptions after redeem:', error)
          appStore.showWarning(t('redeem.subscriptionRefreshFailed'))
        }
      }

      setRedeemCode('')
      await fetchHistory()
      appStore.showSuccess(t('redeem.codeRedeemSuccess'))
    } catch (err: unknown) {
      setErrorMessage(extractApiErrorMessage(err, t('redeem.failedToRedeem')))
      appStore.showError(t('redeem.redeemFailed'))
    } finally {
      setSubmitting(false)
    }
  }

  useEffect(() => {
    fetchHistory()
  }, [fetchHistory])

  return (
    <AppLayout>
      <div className="mx-auto max-w-2xl space-y-6">
        {/* Current Balance Card */}
        <div className="card overflow-hidden">
          <div className="bg-gradient-to-br from-primary-500 to-primary-600 px-6 py-8 text-center">
            <div className="mb-4 inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-white/20 backdrop-blur-sm">
              <Icon name="creditCard" size="xl" className="text-white" />
            </div>
            <p className="text-sm font-medium text-primary-100">{t('redeem.currentBalance')}</p>
            <p className="mt-2 text-4xl font-bold text-white">
              ${user?.balance?.toFixed(2) || '0.00'}
            </p>
            <p className="mt-2 text-sm text-primary-100">
              {t('redeem.concurrency')}: {user?.concurrency || 0} {t('redeem.requests')}
            </p>
          </div>
        </div>

        {/* Redeem Form */}
        <div className="card">
          <div className="p-6">
            <form
              onSubmit={(e) => {
                e.preventDefault()
                handleRedeem()
              }}
              className="space-y-5"
            >
              <div>
                <label htmlFor="code" className="input-label">
                  {t('redeem.redeemCodeLabel')}
                </label>
                <div className="relative mt-1">
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4">
                    <Icon name="gift" size="md" className="text-gray-400 dark:text-dark-500" />
                  </div>
                  <input
                    id="code"
                    value={redeemCode}
                    onChange={(e) => setRedeemCode(e.target.value)}
                    type="text"
                    required
                    placeholder={t('redeem.redeemCodePlaceholder')}
                    disabled={submitting}
                    className="input py-3 pl-12 text-lg"
                  />
                </div>
                <p className="input-hint">{t('redeem.redeemCodeHint')}</p>
              </div>

              <button
                type="submit"
                disabled={!redeemCode || submitting}
                className="btn btn-primary w-full py-3"
              >
                {submitting ? (
                  <svg
                    className="-ml-1 mr-2 h-5 w-5 animate-spin"
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
                {submitting ? t('redeem.redeeming') : t('redeem.redeemButton')}
              </button>
            </form>
          </div>
        </div>

        {/* Success Message */}
        {redeemResult ? (
          <div className="fade-panel card border-emerald-200 bg-emerald-50 dark:border-emerald-800/50 dark:bg-emerald-900/20">
            <div className="p-6">
              <div className="flex items-start gap-4">
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-emerald-100 dark:bg-emerald-900/30">
                  <Icon name="checkCircle" size="md" className="text-emerald-600 dark:text-emerald-400" />
                </div>
                <div className="flex-1">
                  <h3 className="text-sm font-semibold text-emerald-800 dark:text-emerald-300">
                    {t('redeem.redeemSuccess')}
                  </h3>
                  <div className="mt-2 text-sm text-emerald-700 dark:text-emerald-400">
                    <p>{redeemResult.message}</p>
                    <div className="mt-3 space-y-1">
                      {redeemResult.type === 'balance' ? (
                        <p className="font-medium">
                          {t('redeem.added')}: ${redeemResult.value.toFixed(2)}
                        </p>
                      ) : redeemResult.type === 'concurrency' ? (
                        <p className="font-medium">
                          {t('redeem.added')}: {redeemResult.value}{' '}
                          {t('redeem.concurrentRequests')}
                        </p>
                      ) : redeemResult.type === 'subscription' ? (
                        <p className="font-medium">
                          {t('redeem.subscriptionAssigned')}
                          {redeemResult.group_name ? ` - ${redeemResult.group_name}` : null}
                          {redeemResult.validity_days ? (
                            <> ({t('redeem.subscriptionDays', { days: redeemResult.validity_days })})</>
                          ) : null}
                        </p>
                      ) : null}
                      {redeemResult.new_balance !== undefined ? (
                        <p>
                          {t('redeem.newBalance')}:{' '}
                          <span className="font-semibold">
                            ${redeemResult.new_balance.toFixed(2)}
                          </span>
                        </p>
                      ) : null}
                      {redeemResult.new_concurrency !== undefined ? (
                        <p>
                          {t('redeem.newConcurrency')}:{' '}
                          <span className="font-semibold">
                            {redeemResult.new_concurrency} {t('redeem.requests')}
                          </span>
                        </p>
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {/* Error Message */}
        {errorMessage ? (
          <div className="fade-panel card border-red-200 bg-red-50 dark:border-red-800/50 dark:bg-red-900/20">
            <div className="p-6">
              <div className="flex items-start gap-4">
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-red-100 dark:bg-red-900/30">
                  <Icon name="exclamationCircle" size="md" className="text-red-600 dark:text-red-400" />
                </div>
                <div className="flex-1">
                  <h3 className="text-sm font-semibold text-red-800 dark:text-red-300">
                    {t('redeem.redeemFailed')}
                  </h3>
                  <p className="mt-2 text-sm text-red-700 dark:text-red-400">{errorMessage}</p>
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {/* Information Card */}
        <div className="card border-primary-200 bg-primary-50 dark:border-primary-800/50 dark:bg-primary-900/20">
          <div className="p-6">
            <div className="flex items-start gap-4">
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-primary-100 dark:bg-primary-900/30">
                <Icon name="infoCircle" size="md" className="text-primary-600 dark:text-primary-400" />
              </div>
              <div className="flex-1">
                <h3 className="text-sm font-semibold text-primary-800 dark:text-primary-300">
                  {t('redeem.aboutCodes')}
                </h3>
                <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-primary-700 dark:text-primary-400">
                  <li>{t('redeem.codeRule1')}</li>
                  <li>{t('redeem.codeRule2')}</li>
                  <li>
                    {t('redeem.codeRule3')}
                    {contactInfo ? (
                      <span className="ml-1.5 inline-flex items-center rounded-md bg-primary-200/50 px-2 py-0.5 text-xs font-medium text-primary-800 dark:bg-primary-800/40 dark:text-primary-200">
                        {contactInfo}
                      </span>
                    ) : null}
                  </li>
                  <li>{t('redeem.codeRule4')}</li>
                </ul>
              </div>
            </div>
          </div>
        </div>

        {/* Recent Activity */}
        <div className="card">
          <div className="border-b border-gray-100 px-6 py-4 dark:border-dark-700">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              {t('redeem.recentActivity')}
            </h2>
          </div>
          <div className="p-6">
            {loadingHistory ? (
              <div className="flex items-center justify-center py-8">
                <svg className="h-6 w-6 animate-spin text-primary-500" fill="none" viewBox="0 0 24 24">
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
              </div>
            ) : history.length > 0 ? (
              <div className="space-y-3">
                {history.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between rounded-xl bg-gray-50 p-4 dark:bg-dark-800"
                  >
                    <div className="flex items-center gap-4">
                      <div
                        className={[
                          'flex h-10 w-10 items-center justify-center rounded-xl',
                          isBalanceType(item.type)
                            ? item.value >= 0
                              ? 'bg-emerald-100 dark:bg-emerald-900/30'
                              : 'bg-red-100 dark:bg-red-900/30'
                            : isSubscriptionType(item.type)
                              ? 'bg-purple-100 dark:bg-purple-900/30'
                              : item.value >= 0
                                ? 'bg-blue-100 dark:bg-blue-900/30'
                                : 'bg-orange-100 dark:bg-orange-900/30',
                        ].join(' ')}
                      >
                        {isBalanceType(item.type) ? (
                          <Icon
                            name="dollar"
                            size="md"
                            className={
                              item.value >= 0
                                ? 'text-emerald-600 dark:text-emerald-400'
                                : 'text-red-600 dark:text-red-400'
                            }
                          />
                        ) : isSubscriptionType(item.type) ? (
                          <Icon
                            name="badge"
                            size="md"
                            className="text-purple-600 dark:text-purple-400"
                          />
                        ) : (
                          <Icon
                            name="bolt"
                            size="md"
                            className={
                              item.value >= 0
                                ? 'text-blue-600 dark:text-blue-400'
                                : 'text-orange-600 dark:text-orange-400'
                            }
                          />
                        )}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-900 dark:text-white">
                          {getHistoryItemTitle(item)}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-dark-400">
                          {formatDateTime(item.used_at)}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p
                        className={[
                          'text-sm font-semibold',
                          isBalanceType(item.type)
                            ? item.value >= 0
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : 'text-red-600 dark:text-red-400'
                            : isSubscriptionType(item.type)
                              ? 'text-purple-600 dark:text-purple-400'
                              : item.value >= 0
                                ? 'text-blue-600 dark:text-blue-400'
                                : 'text-orange-600 dark:text-orange-400',
                        ].join(' ')}
                      >
                        {formatHistoryValue(item)}
                      </p>
                      {!isAdminAdjustment(item.type) ? (
                        <p className="font-mono text-xs text-gray-400 dark:text-dark-500">
                          {item.code.slice(0, 8)}...
                        </p>
                      ) : (
                        <p className="text-xs text-gray-400 dark:text-dark-500">
                          {t('redeem.adminAdjustment')}
                        </p>
                      )}
                      {item.notes ? (
                        <p
                          className="mt-1 max-w-[200px] truncate text-xs italic text-gray-500 dark:text-dark-400"
                          title={item.notes}
                        >
                          {item.notes}
                        </p>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty-state py-8">
                <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gray-100 dark:bg-dark-800">
                  <Icon name="clock" size="xl" className="text-gray-400 dark:text-dark-500" />
                </div>
                <p className="text-sm text-gray-500 dark:text-dark-400">
                  {t('redeem.historyWillAppear')}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </AppLayout>
  )
}
