'use client'

import { useMemo } from 'react'
import { useI18n } from '@/lib/i18n/I18nProvider'
import type { SubscriptionPlan } from '@/lib/payment/types'
import type { UserSubscription } from '@/lib/types'
import {
  platformAccentBarClass,
  platformBadgeLightClass,
  platformBorderClass,
  platformTextClass,
  platformIconClass,
  platformButtonClass,
  platformDiscountClass,
  platformLabel,
} from '@/lib/platformColors'

const MODEL_SCOPE_LABELS: Record<string, string> = {
  claude: 'Claude',
  gemini_text: 'Gemini',
  gemini_image: 'Imagen',
}

interface SubscriptionPlanCardProps {
  plan: SubscriptionPlan
  activeSubscriptions?: UserSubscription[]
  onSelect: (plan: SubscriptionPlan) => void
}

export default function SubscriptionPlanCard({ plan, activeSubscriptions, onSelect }: SubscriptionPlanCardProps) {
  const { t } = useI18n()

  const platform = plan.group_platform || ''
  const isRenewal =
    activeSubscriptions?.some((s) => s.group_id === plan.group_id && s.status === 'active') ?? false

  // Derived color classes from central config
  const accentClass = platformAccentBarClass(platform)
  const borderClass = platformBorderClass(platform)
  const badgeLightClass = platformBadgeLightClass(platform)
  const textClass = platformTextClass(platform)
  const iconClass = platformIconClass(platform)
  const btnClass = platformButtonClass(platform)
  const discountClass = platformDiscountClass(platform)
  const pLabel = platformLabel(platform)

  const discountText = useMemo(() => {
    if (!plan.original_price || plan.original_price <= 0) return ''
    const pct = Math.round((1 - plan.price / plan.original_price) * 100)
    return pct > 0 ? `-${pct}%` : ''
  }, [plan.original_price, plan.price])

  const rateDisplay = useMemo(() => {
    const rate = plan.rate_multiplier ?? 1
    return `×${Number(rate.toPrecision(10))}`
  }, [plan.rate_multiplier])

  const modelScopeLabels = useMemo(() => {
    if (platform !== 'antigravity') return []
    const scopes = plan.supported_model_scopes
    if (!scopes || scopes.length === 0) return []
    return scopes.map((s) => MODEL_SCOPE_LABELS[s] || s)
  }, [platform, plan.supported_model_scopes])

  const validitySuffix = useMemo(() => {
    const u = plan.validity_unit || 'day'
    if (u === 'month') return t('payment.perMonth')
    if (u === 'year') return t('payment.perYear')
    return `${plan.validity_days}${t('payment.days')}`
  }, [plan.validity_unit, plan.validity_days, t])

  const noLimits =
    plan.daily_limit_usd == null && plan.weekly_limit_usd == null && plan.monthly_limit_usd == null

  return (
    <div
      className={[
        'group relative flex flex-col overflow-hidden rounded-2xl border transition-all',
        'hover:shadow-xl hover:-translate-y-0.5',
        borderClass,
        'bg-white dark:bg-dark-800',
      ].join(' ')}
    >
      {/* Colored top accent bar */}
      <div className={['h-1.5', accentClass].join(' ')} />

      <div className="flex flex-1 flex-col p-4">
        {/* Header: name + badge + price */}
        <div className="mb-3 flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h3 className="truncate text-base font-bold text-gray-900 dark:text-white">{plan.name}</h3>
              <span className={['shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium', badgeLightClass].join(' ')}>
                {pLabel}
              </span>
            </div>
            {plan.description ? (
              <p className="mt-0.5 text-xs leading-relaxed text-gray-500 dark:text-dark-400 line-clamp-2">
                {plan.description}
              </p>
            ) : null}
          </div>
          <div className="shrink-0 text-right">
            <div className="flex items-baseline gap-1">
              <span className="text-xs text-gray-400 dark:text-dark-500">$</span>
              <span className={['text-2xl font-extrabold tracking-tight', textClass].join(' ')}>{plan.price}</span>
            </div>
            <span className="text-[11px] text-gray-400 dark:text-dark-500">/ {validitySuffix}</span>
            {plan.original_price ? (
              <div className="mt-0.5 flex items-center justify-end gap-1.5">
                <span className="text-xs text-gray-400 line-through dark:text-dark-500">${plan.original_price}</span>
                <span className={['rounded px-1 py-0.5 text-[10px] font-semibold', discountClass].join(' ')}>{discountText}</span>
              </div>
            ) : null}
          </div>
        </div>

        {/* Group quota info (compact) */}
        <div className="mb-3 grid grid-cols-2 gap-x-3 gap-y-1 rounded-lg bg-gray-50 px-3 py-2 text-xs dark:bg-dark-700/50">
          <div className="flex items-center justify-between">
            <span className="text-gray-400 dark:text-dark-500">{t('payment.planCard.rate')}</span>
            <span className="font-medium text-gray-700 dark:text-gray-300">{rateDisplay}</span>
          </div>
          {plan.daily_limit_usd != null ? (
            <div className="flex items-center justify-between">
              <span className="text-gray-400 dark:text-dark-500">{t('payment.planCard.dailyLimit')}</span>
              <span className="font-medium text-gray-700 dark:text-gray-300">${plan.daily_limit_usd}</span>
            </div>
          ) : null}
          {plan.weekly_limit_usd != null ? (
            <div className="flex items-center justify-between">
              <span className="text-gray-400 dark:text-dark-500">{t('payment.planCard.weeklyLimit')}</span>
              <span className="font-medium text-gray-700 dark:text-gray-300">${plan.weekly_limit_usd}</span>
            </div>
          ) : null}
          {plan.monthly_limit_usd != null ? (
            <div className="flex items-center justify-between">
              <span className="text-gray-400 dark:text-dark-500">{t('payment.planCard.monthlyLimit')}</span>
              <span className="font-medium text-gray-700 dark:text-gray-300">${plan.monthly_limit_usd}</span>
            </div>
          ) : null}
          {noLimits ? (
            <div className="flex items-center justify-between">
              <span className="text-gray-400 dark:text-dark-500">{t('payment.planCard.quota')}</span>
              <span className="font-medium text-gray-700 dark:text-gray-300">{t('payment.planCard.unlimited')}</span>
            </div>
          ) : null}
          {modelScopeLabels.length > 0 ? (
            <div className="col-span-2 flex items-center justify-between">
              <span className="text-gray-400 dark:text-dark-500">{t('payment.planCard.models')}</span>
              <div className="flex flex-wrap justify-end gap-1">
                {modelScopeLabels.map((scope) => (
                  <span
                    key={scope}
                    className="rounded bg-gray-200/80 px-1.5 py-0.5 text-[10px] font-medium text-gray-600 dark:bg-dark-600 dark:text-gray-300"
                  >
                    {scope}
                  </span>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        {/* Features list (compact) */}
        {plan.features.length > 0 ? (
          <div className="mb-3 space-y-1">
            {plan.features.map((feature) => (
              <div key={feature} className="flex items-start gap-1.5">
                <svg className={['mt-0.5 h-3.5 w-3.5 flex-shrink-0', iconClass].join(' ')} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
                <span className="text-xs text-gray-600 dark:text-gray-300">{feature}</span>
              </div>
            ))}
          </div>
        ) : null}

        <div className="flex-1" />

        {/* Subscribe Button */}
        <button
          type="button"
          className={['w-full rounded-xl py-2.5 text-sm font-semibold transition-all active:scale-[0.98]', btnClass].join(' ')}
          onClick={() => onSelect(plan)}
        >
          {isRenewal ? t('payment.renewNow') : t('payment.subscribeNow')}
        </button>
      </div>
    </div>
  )
}
