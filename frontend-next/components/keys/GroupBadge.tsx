'use client'

import { useMemo } from 'react'
import { useI18n } from '@/lib/i18n'
import type { GroupPlatform, SubscriptionType } from '@/lib/types'
import PlatformIcon from '@/components/common/PlatformIcon'

interface GroupBadgeProps {
  name: string
  platform?: GroupPlatform
  subscriptionType?: SubscriptionType
  rateMultiplier?: number
  userRateMultiplier?: number | null
  showRate?: boolean
  daysRemaining?: number | null
  alwaysShowRate?: boolean
  className?: string
}

export default function GroupBadge({
  name,
  platform,
  subscriptionType = 'standard',
  rateMultiplier,
  userRateMultiplier = null,
  showRate = true,
  daysRemaining = null,
  alwaysShowRate = false,
  className,
}: GroupBadgeProps) {
  const { t } = useI18n()

  const isSubscription = subscriptionType === 'subscription'

  const hasCustomRate =
    userRateMultiplier !== null &&
    userRateMultiplier !== undefined &&
    rateMultiplier !== undefined &&
    userRateMultiplier !== rateMultiplier

  const showLabel = useMemo(() => {
    if (!showRate) return false
    if (isSubscription) return true
    return rateMultiplier !== undefined || hasCustomRate
  }, [showRate, isSubscription, rateMultiplier, hasCustomRate])

  const labelText = useMemo(() => {
    const rateLabel = rateMultiplier !== undefined ? `${rateMultiplier}x` : ''
    if (isSubscription && !alwaysShowRate) {
      if (daysRemaining !== null && daysRemaining !== undefined) {
        if (daysRemaining <= 0) return t('admin.users.expired')
        return t('admin.users.daysRemaining', { days: daysRemaining })
      }
      return t('groups.subscription')
    }
    return rateLabel
  }, [alwaysShowRate, daysRemaining, isSubscription, rateMultiplier, t])

  const labelClass = useMemo(() => {
    const base = 'px-1.5 py-0.5 rounded text-[10px] font-semibold'
    if (!isSubscription) {
      return `${base} bg-black/10 dark:bg-white/10`
    }
    if (daysRemaining !== null && daysRemaining !== undefined) {
      if (daysRemaining <= 0 || daysRemaining <= 3) {
        return `${base} bg-red-200/80 text-red-800 dark:bg-red-800/50 dark:text-red-300`
      }
      if (daysRemaining <= 7) {
        return `${base} bg-amber-200/80 text-amber-800 dark:bg-amber-800/50 dark:text-amber-300`
      }
    }
    if (platform === 'anthropic') {
      return `${base} bg-orange-200/60 text-orange-800 dark:bg-orange-800/40 dark:text-orange-300`
    }
    if (platform === 'openai') {
      return `${base} bg-emerald-200/60 text-emerald-800 dark:bg-emerald-800/40 dark:text-emerald-300`
    }
    if (platform === 'gemini') {
      return `${base} bg-blue-200/60 text-blue-800 dark:bg-blue-800/40 dark:text-blue-300`
    }
    return `${base} bg-violet-200/60 text-violet-800 dark:bg-violet-800/40 dark:text-violet-300`
  }, [daysRemaining, isSubscription, platform])

  const badgeClass = useMemo(() => {
    if (platform === 'anthropic') {
      return isSubscription
        ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400'
        : 'bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400'
    }
    if (platform === 'openai') {
      return isSubscription
        ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
        : 'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400'
    }
    if (platform === 'gemini') {
      return isSubscription
        ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
        : 'bg-sky-50 text-sky-700 dark:bg-sky-900/20 dark:text-sky-400'
    }
    return isSubscription
      ? 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400'
      : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
  }, [isSubscription, platform])

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium transition-colors ${badgeClass}${className ? ` ${className}` : ''}`}
    >
      {platform ? <PlatformIcon platform={platform} size="sm" /> : null}
      <span className="truncate">{name}</span>
      {showLabel ? (
        <span className={labelClass}>
          {hasCustomRate ? (
            <>
              <span className="line-through opacity-50 mr-0.5">{rateMultiplier}x</span>
              <span className="font-bold">{userRateMultiplier}x</span>
            </>
          ) : (
            labelText
          )}
        </span>
      ) : null}
    </span>
  )
}
