'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useI18n } from '@/lib/i18n'
import { useApp } from '@/context/AppContext'
import subscriptionsAPI from '@/lib/subscriptions'
import type { UserSubscription } from '@/lib/types'
import AppLayout from '@/components/layout/AppLayout'
import Icon from '@/components/icons/Icon'
import { formatDateOnly } from '@/lib/format'
import {
  platformBorderClass,
  platformBadgeClass,
  platformButtonClass,
  platformLabel,
} from '@/lib/platformColors'
import {
  getRemainingDurationParts,
  isOneTimeDailyQuota,
  type RemainingDurationParts,
} from '@/lib/subscriptionQuota'

function platformAccentDotClass(p: string): string {
  switch (p) {
    case 'anthropic':
      return 'bg-orange-500'
    case 'openai':
      return 'bg-emerald-500'
    case 'antigravity':
      return 'bg-purple-500'
    case 'gemini':
      return 'bg-blue-500'
    default:
      return 'bg-gray-400'
  }
}

export default function SubscriptionsPage() {
  const { t } = useI18n()
  const router = useRouter()
  const appStore = useApp()
  const [subscriptions, setSubscriptions] = useState<UserSubscription[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function loadSubscriptions() {
      try {
        setLoading(true)
        const data = await subscriptionsAPI.getMySubscriptions()
        setSubscriptions(data)
      } catch (error) {
        console.error('Failed to load subscriptions:', error)
        appStore.showError(t('userSubscriptions.failedToLoad'))
      } finally {
        setLoading(false)
      }
    }
    loadSubscriptions()
  }, [appStore, t])

  function getProgressWidth(used: number | undefined, limit: number | null | undefined): string {
    if (!limit || limit === 0) return '0%'
    const percentage = Math.min(((used || 0) / limit) * 100, 100)
    return `${percentage}%`
  }

  function getProgressBarClass(used: number | undefined, limit: number | null | undefined): string {
    if (!limit || limit === 0) return 'bg-gray-400'
    const percentage = ((used || 0) / limit) * 100
    if (percentage >= 90) return 'bg-red-500'
    if (percentage >= 70) return 'bg-orange-500'
    return 'bg-green-500'
  }

  function formatExpirationDate(expiresAt: string): string {
    const now = new Date()
    const expires = new Date(expiresAt)
    const diff = expires.getTime() - now.getTime()
    const days = Math.ceil(diff / (1000 * 60 * 60 * 24))

    if (days < 0) {
      return t('userSubscriptions.status.expired')
    }

    const dateStr = formatDateOnly(expires)

    if (days === 0) {
      return `${dateStr} (${t('common.today')})`
    }
    if (days === 1) {
      return `${dateStr} (${t('common.tomorrow')})`
    }

    return `${t('userSubscriptions.daysRemaining', { days })} (${dateStr})`
  }

  function getExpirationClass(expiresAt: string): string {
    const now = new Date()
    const expires = new Date(expiresAt)
    const diff = expires.getTime() - now.getTime()
    const days = Math.ceil(diff / (1000 * 60 * 60 * 24))

    if (days <= 0) return 'text-red-600 dark:text-red-400 font-medium'
    if (days <= 3) return 'text-red-600 dark:text-red-400'
    if (days <= 7) return 'text-orange-600 dark:text-orange-400'
    return 'text-gray-700 dark:text-gray-300'
  }

  function formatDurationParts(parts: RemainingDurationParts): string {
    if (parts.days > 0) {
      return `${parts.days}d ${parts.hours}h`
    }
    if (parts.hours > 0) {
      return `${parts.hours}h ${parts.minutes}m`
    }
    return `${parts.minutes}m`
  }

  function formatDailyUsageWindow(subscription: UserSubscription): string {
    if (isOneTimeDailyQuota(subscription) && subscription.expires_at) {
      const parts = getRemainingDurationParts(subscription.expires_at)
      if (!parts) return t('userSubscriptions.windowNotActive')
      return t('userSubscriptions.quotaEndsIn', { time: formatDurationParts(parts) })
    }

    return t('userSubscriptions.resetIn', {
      time: formatResetTime(subscription.daily_window_start, 24),
    })
  }

  function formatResetTime(windowStart: string | null, windowHours: number): string {
    if (!windowStart) return t('userSubscriptions.windowNotActive')

    const start = new Date(windowStart)
    const end = new Date(start.getTime() + windowHours * 60 * 60 * 1000)
    const parts = getRemainingDurationParts(end)

    return parts ? formatDurationParts(parts) : t('userSubscriptions.windowNotActive')
  }

  return (
    <AppLayout>
      <div className="space-y-6">
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary-500 border-t-transparent" />
          </div>
        ) : subscriptions.length === 0 ? (
          <div className="card p-12 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gray-100 dark:bg-dark-700">
              <Icon name="creditCard" size="xl" className="text-gray-400" />
            </div>
            <h3 className="mb-2 text-lg font-semibold text-gray-900 dark:text-white">
              {t('userSubscriptions.noActiveSubscriptions')}
            </h3>
            <p className="text-gray-500 dark:text-dark-400">
              {t('userSubscriptions.noActiveSubscriptionsDesc')}
            </p>
          </div>
        ) : (
          <div className="grid gap-6 lg:grid-cols-2">
            {subscriptions.map((subscription) => (
              <div
                key={subscription.id}
                className={`overflow-hidden rounded-2xl border bg-white dark:bg-dark-800 ${platformBorderClass(subscription.group?.platform || '')}`}
              >
                <div className="flex items-center justify-between border-b border-gray-100 p-4 dark:border-dark-700">
                  <div className="flex items-center gap-3">
                    <div
                      className={`h-1.5 w-1.5 shrink-0 rounded-full ${platformAccentDotClass(subscription.group?.platform || '')}`}
                    />
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-gray-900 dark:text-white">
                          {subscription.group?.name || `Group #${subscription.group_id}`}
                        </h3>
                        <span
                          className={`rounded-md border px-2 py-0.5 text-[11px] font-medium ${platformBadgeClass(subscription.group?.platform || '')}`}
                        >
                          {platformLabel(subscription.group?.platform || '')}
                        </span>
                      </div>
                      {subscription.group?.description ? (
                        <p className="mt-0.5 text-xs text-gray-500 dark:text-dark-400">
                          {subscription.group.description}
                        </p>
                      ) : null}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        subscription.status === 'active'
                          ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                          : subscription.status === 'expired'
                            ? 'bg-gray-100 text-gray-600 dark:bg-dark-700 dark:text-gray-400'
                            : 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
                      }`}
                    >
                      {t(`userSubscriptions.status.${subscription.status}`)}
                    </span>
                    {subscription.status === 'active' ? (
                      <button
                        type="button"
                        className={`rounded-lg px-3 py-1.5 text-xs font-semibold text-white transition-colors ${platformButtonClass(subscription.group?.platform || '')}`}
                        onClick={() =>
                          router.push(
                            `/purchase?tab=subscription&group=${String(subscription.group_id)}`,
                          )
                        }
                      >
                        {t('payment.renewNow')}
                      </button>
                    ) : null}
                  </div>
                </div>

                <div className="space-y-4 p-4">
                  {subscription.expires_at ? (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-500 dark:text-dark-400">
                        {t('userSubscriptions.expires')}
                      </span>
                      <span className={getExpirationClass(subscription.expires_at)}>
                        {formatExpirationDate(subscription.expires_at)}
                      </span>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-500 dark:text-dark-400">
                        {t('userSubscriptions.expires')}
                      </span>
                      <span className="text-gray-700 dark:text-gray-300">
                        {t('userSubscriptions.noExpiration')}
                      </span>
                    </div>
                  )}

                  {subscription.group?.daily_limit_usd ? (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                          {t('userSubscriptions.daily')}
                        </span>
                        <span className="text-sm text-gray-500 dark:text-dark-400">
                          ${(subscription.daily_usage_usd || 0).toFixed(2)} / $
                          {subscription.group.daily_limit_usd.toFixed(2)}
                        </span>
                      </div>
                      <div className="relative h-2 overflow-hidden rounded-full bg-gray-200 dark:bg-dark-600">
                        <div
                          className={`absolute inset-y-0 left-0 rounded-full transition-all duration-300 ${getProgressBarClass(subscription.daily_usage_usd, subscription.group.daily_limit_usd)}`}
                          style={{
                            width: getProgressWidth(
                              subscription.daily_usage_usd,
                              subscription.group.daily_limit_usd,
                            ),
                          }}
                        />
                      </div>
                      {subscription.daily_window_start ? (
                        <p className="text-xs text-gray-500 dark:text-dark-400">
                          {formatDailyUsageWindow(subscription)}
                        </p>
                      ) : null}
                    </div>
                  ) : null}

                  {subscription.group?.weekly_limit_usd ? (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                          {t('userSubscriptions.weekly')}
                        </span>
                        <span className="text-sm text-gray-500 dark:text-dark-400">
                          ${(subscription.weekly_usage_usd || 0).toFixed(2)} / $
                          {subscription.group.weekly_limit_usd.toFixed(2)}
                        </span>
                      </div>
                      <div className="relative h-2 overflow-hidden rounded-full bg-gray-200 dark:bg-dark-600">
                        <div
                          className={`absolute inset-y-0 left-0 rounded-full transition-all duration-300 ${getProgressBarClass(subscription.weekly_usage_usd, subscription.group.weekly_limit_usd)}`}
                          style={{
                            width: getProgressWidth(
                              subscription.weekly_usage_usd,
                              subscription.group.weekly_limit_usd,
                            ),
                          }}
                        />
                      </div>
                      {subscription.weekly_window_start ? (
                        <p className="text-xs text-gray-500 dark:text-dark-400">
                          {t('userSubscriptions.resetIn', {
                            time: formatResetTime(subscription.weekly_window_start, 168),
                          })}
                        </p>
                      ) : null}
                    </div>
                  ) : null}

                  {subscription.group?.monthly_limit_usd ? (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                          {t('userSubscriptions.monthly')}
                        </span>
                        <span className="text-sm text-gray-500 dark:text-dark-400">
                          ${(subscription.monthly_usage_usd || 0).toFixed(2)} / $
                          {subscription.group.monthly_limit_usd.toFixed(2)}
                        </span>
                      </div>
                      <div className="relative h-2 overflow-hidden rounded-full bg-gray-200 dark:bg-dark-600">
                        <div
                          className={`absolute inset-y-0 left-0 rounded-full transition-all duration-300 ${getProgressBarClass(subscription.monthly_usage_usd, subscription.group.monthly_limit_usd)}`}
                          style={{
                            width: getProgressWidth(
                              subscription.monthly_usage_usd,
                              subscription.group.monthly_limit_usd,
                            ),
                          }}
                        />
                      </div>
                      {subscription.monthly_window_start ? (
                        <p className="text-xs text-gray-500 dark:text-dark-400">
                          {t('userSubscriptions.resetIn', {
                            time: formatResetTime(subscription.monthly_window_start, 720),
                          })}
                        </p>
                      ) : null}
                    </div>
                  ) : null}

                  {!subscription.group?.daily_limit_usd &&
                  !subscription.group?.weekly_limit_usd &&
                  !subscription.group?.monthly_limit_usd ? (
                    <div className="flex items-center justify-center rounded-xl bg-gradient-to-r from-emerald-50 to-teal-50 py-6 dark:from-emerald-900/20 dark:to-teal-900/20">
                      <div className="flex items-center gap-3">
                        <span className="text-4xl text-emerald-600 dark:text-emerald-400">∞</span>
                        <div>
                          <p className="text-sm font-medium text-emerald-700 dark:text-emerald-300">
                            {t('userSubscriptions.unlimited')}
                          </p>
                          <p className="text-xs text-emerald-600/70 dark:text-emerald-400/70">
                            {t('userSubscriptions.unlimitedDesc')}
                          </p>
                        </div>
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  )
}
