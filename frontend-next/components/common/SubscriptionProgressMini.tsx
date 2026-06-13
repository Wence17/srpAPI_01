'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useI18n } from '@/lib/i18n/I18nProvider'
import { useSubscriptionStore } from '@/lib/stores/subscriptions'
import type { UserSubscription } from '@/lib/types'
import Icon from '@/components/icons/Icon'

function getMaxUsagePercentage(sub: UserSubscription): number {
  const percentages: number[] = []
  if (sub.group?.daily_limit_usd) {
    percentages.push(((sub.daily_usage_usd || 0) / sub.group.daily_limit_usd) * 100)
  }
  if (sub.group?.weekly_limit_usd) {
    percentages.push(((sub.weekly_usage_usd || 0) / sub.group.weekly_limit_usd) * 100)
  }
  if (sub.group?.monthly_limit_usd) {
    percentages.push(((sub.monthly_usage_usd || 0) / sub.group.monthly_limit_usd) * 100)
  }
  return percentages.length > 0 ? Math.max(...percentages) : 0
}

function isUnlimited(sub: UserSubscription): boolean {
  return !sub.group?.daily_limit_usd && !sub.group?.weekly_limit_usd && !sub.group?.monthly_limit_usd
}

function getProgressDotClass(sub: UserSubscription): string {
  if (isUnlimited(sub)) return 'bg-emerald-500'
  const maxPercentage = getMaxUsagePercentage(sub)
  if (maxPercentage >= 90) return 'bg-red-500'
  if (maxPercentage >= 70) return 'bg-orange-500'
  return 'bg-green-500'
}

function getProgressBarClass(used: number | undefined, limit: number | null | undefined): string {
  if (!limit || limit === 0) return 'bg-gray-400'
  const percentage = ((used || 0) / limit) * 100
  if (percentage >= 90) return 'bg-red-500'
  if (percentage >= 70) return 'bg-orange-500'
  return 'bg-green-500'
}

function getProgressWidth(used: number | undefined, limit: number | null | undefined): string {
  if (!limit || limit === 0) return '0%'
  const percentage = Math.min(((used || 0) / limit) * 100, 100)
  return `${percentage}%`
}

function formatUsage(used: number | undefined, limit: number | null | undefined): string {
  const usedValue = (used || 0).toFixed(2)
  const limitValue = limit?.toFixed(2) || '∞'
  return `$${usedValue}/$${limitValue}`
}

export default function SubscriptionProgressMini() {
  const { t } = useI18n()
  const { activeSubscriptions, hasActiveSubscriptions, fetchActiveSubscriptions } = useSubscriptionStore()

  const containerRef = useRef<HTMLDivElement | null>(null)
  const [tooltipOpen, setTooltipOpen] = useState(false)

  const displaySubscriptions = useMemo(() => {
    return [...activeSubscriptions].sort((a, b) => getMaxUsagePercentage(b) - getMaxUsagePercentage(a))
  }, [activeSubscriptions])

  function formatDaysRemaining(expiresAt: string): string {
    const now = new Date()
    const expires = new Date(expiresAt)
    const diff = expires.getTime() - now.getTime()
    if (diff < 0) return t('subscriptionProgress.expired')
    const days = Math.ceil(diff / (1000 * 60 * 60 * 24))
    if (days === 0) return t('subscriptionProgress.expiresToday')
    if (days === 1) return t('subscriptionProgress.expiresTomorrow')
    return t('subscriptionProgress.daysRemaining', { days })
  }

  function getDaysRemainingClass(expiresAt: string): string {
    const now = new Date()
    const expires = new Date(expiresAt)
    const diff = expires.getTime() - now.getTime()
    const days = Math.ceil(diff / (1000 * 60 * 60 * 24))
    if (days <= 3) return 'text-red-600 dark:text-red-400'
    if (days <= 7) return 'text-orange-600 dark:text-orange-400'
    return 'text-gray-500 dark:text-dark-400'
  }

  function toggleTooltip() {
    setTooltipOpen((prev) => !prev)
  }

  function closeTooltip() {
    setTooltipOpen(false)
  }

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        closeTooltip()
      }
    }
    document.addEventListener('click', handleClickOutside)
    return () => document.removeEventListener('click', handleClickOutside)
  }, [])

  useEffect(() => {
    fetchActiveSubscriptions().catch((error) => {
      console.error('Failed to load subscriptions in SubscriptionProgressMini:', error)
    })
  }, [fetchActiveSubscriptions])

  if (!hasActiveSubscriptions) {
    return null
  }

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={toggleTooltip}
        className="flex cursor-pointer items-center gap-2 rounded-xl bg-purple-50 px-3 py-1.5 transition-colors hover:bg-purple-100 dark:bg-purple-900/20 dark:hover:bg-purple-900/30"
        title={t('subscriptionProgress.viewDetails')}
      >
        <Icon name="creditCard" size="sm" className="text-purple-600 dark:text-purple-400" />
        <div className="flex items-center gap-1.5">
          <div className="flex items-center gap-0.5">
            {displaySubscriptions.slice(0, 3).map((sub, index) => (
              <div key={index} className={`h-2 w-2 rounded-full ${getProgressDotClass(sub)}`} />
            ))}
          </div>
          <span className="text-xs font-medium text-purple-700 dark:text-purple-300">
            {activeSubscriptions.length}
          </span>
        </div>
      </button>

      {tooltipOpen ? (
        <div className="absolute right-0 z-50 mt-2 w-[340px] overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl dark:border-dark-700 dark:bg-dark-800">
          <div className="border-b border-gray-100 p-3 dark:border-dark-700">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
              {t('subscriptionProgress.title')}
            </h3>
            <p className="mt-0.5 text-xs text-gray-500 dark:text-dark-400">
              {t('subscriptionProgress.activeCount', { count: activeSubscriptions.length })}
            </p>
          </div>

          <div className="max-h-64 overflow-y-auto">
            {displaySubscriptions.map((subscription) => (
              <div
                key={subscription.id}
                className="border-b border-gray-50 p-3 last:border-b-0 dark:border-dark-700/50"
              >
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-900 dark:text-white">
                    {subscription.group?.name || `Group #${subscription.group_id}`}
                  </span>
                  {subscription.expires_at ? (
                    <span className={`text-xs ${getDaysRemainingClass(subscription.expires_at)}`}>
                      {formatDaysRemaining(subscription.expires_at)}
                    </span>
                  ) : null}
                </div>

                <div className="space-y-1.5">
                  {isUnlimited(subscription) ? (
                    <div className="flex items-center gap-2 rounded-lg bg-gradient-to-r from-emerald-50 to-teal-50 px-2.5 py-1.5 dark:from-emerald-900/20 dark:to-teal-900/20">
                      <span className="text-lg text-emerald-600 dark:text-emerald-400">∞</span>
                      <span className="text-xs font-medium text-emerald-700 dark:text-emerald-300">
                        {t('subscriptionProgress.unlimited')}
                      </span>
                    </div>
                  ) : (
                    <>
                      {subscription.group?.daily_limit_usd ? (
                        <div className="flex items-center gap-2">
                          <span className="w-8 flex-shrink-0 text-[10px] text-gray-500">
                            {t('subscriptionProgress.daily')}
                          </span>
                          <div className="h-1.5 min-w-0 flex-1 rounded-full bg-gray-200 dark:bg-dark-600">
                            <div
                              className={`h-1.5 rounded-full transition-all ${getProgressBarClass(
                                subscription.daily_usage_usd,
                                subscription.group?.daily_limit_usd,
                              )}`}
                              style={{
                                width: getProgressWidth(
                                  subscription.daily_usage_usd,
                                  subscription.group?.daily_limit_usd,
                                ),
                              }}
                            />
                          </div>
                          <span className="w-24 flex-shrink-0 text-right text-[10px] text-gray-500">
                            {formatUsage(subscription.daily_usage_usd, subscription.group?.daily_limit_usd)}
                          </span>
                        </div>
                      ) : null}

                      {subscription.group?.weekly_limit_usd ? (
                        <div className="flex items-center gap-2">
                          <span className="w-8 flex-shrink-0 text-[10px] text-gray-500">
                            {t('subscriptionProgress.weekly')}
                          </span>
                          <div className="h-1.5 min-w-0 flex-1 rounded-full bg-gray-200 dark:bg-dark-600">
                            <div
                              className={`h-1.5 rounded-full transition-all ${getProgressBarClass(
                                subscription.weekly_usage_usd,
                                subscription.group?.weekly_limit_usd,
                              )}`}
                              style={{
                                width: getProgressWidth(
                                  subscription.weekly_usage_usd,
                                  subscription.group?.weekly_limit_usd,
                                ),
                              }}
                            />
                          </div>
                          <span className="w-24 flex-shrink-0 text-right text-[10px] text-gray-500">
                            {formatUsage(subscription.weekly_usage_usd, subscription.group?.weekly_limit_usd)}
                          </span>
                        </div>
                      ) : null}

                      {subscription.group?.monthly_limit_usd ? (
                        <div className="flex items-center gap-2">
                          <span className="w-8 flex-shrink-0 text-[10px] text-gray-500">
                            {t('subscriptionProgress.monthly')}
                          </span>
                          <div className="h-1.5 min-w-0 flex-1 rounded-full bg-gray-200 dark:bg-dark-600">
                            <div
                              className={`h-1.5 rounded-full transition-all ${getProgressBarClass(
                                subscription.monthly_usage_usd,
                                subscription.group?.monthly_limit_usd,
                              )}`}
                              style={{
                                width: getProgressWidth(
                                  subscription.monthly_usage_usd,
                                  subscription.group?.monthly_limit_usd,
                                ),
                              }}
                            />
                          </div>
                          <span className="w-24 flex-shrink-0 text-right text-[10px] text-gray-500">
                            {formatUsage(subscription.monthly_usage_usd, subscription.group?.monthly_limit_usd)}
                          </span>
                        </div>
                      ) : null}
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="border-t border-gray-100 p-2 dark:border-dark-700">
            <Link
              href="/subscriptions"
              onClick={closeTooltip}
              className="block w-full py-1 text-center text-xs text-primary-600 hover:underline dark:text-primary-400"
            >
              {t('subscriptionProgress.viewAll')}
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  )
}
