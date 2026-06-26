'use client'

import { useMemo } from 'react'
import { useI18n } from '@/lib/i18n'
import Icon from '@/components/icons/Icon'
import type { Account } from '@/lib/types'
import {
  formatCountdown,
  formatCountdownWithSuffix,
  formatDateTime,
  formatTime,
} from '@/lib/format'

type AccountModelStatusItem = {
  kind: 'rate_limit' | 'credits_exhausted' | 'credits_active'
  model: string
  reset_at: string
}

interface AccountStatusIndicatorProps {
  account: Account
  onShowTempUnsched?: (account: Account) => void
}

const SCOPE_ALIASES: Record<string, string> = {
  'claude-opus-4-6': 'COpus46',
  'claude-opus-4-6-thinking': 'COpus46T',
  'claude-opus-4-7': 'COpus47',
  'claude-opus-4-8': 'COpus48',
  'claude-sonnet-4-6': 'CSon46',
  'claude-sonnet-4-5': 'CSon45',
  'claude-sonnet-4-5-thinking': 'CSon45T',
  'gemini-2.5-flash': 'G25F',
  'gemini-2.5-flash-lite': 'G25FL',
  'gemini-2.5-flash-thinking': 'G25FT',
  'gemini-2.5-pro': 'G25P',
  'gemini-2.5-flash-image': 'G25I',
  'gemini-3.5-flash': 'G35F',
  'gemini-3-flash': 'G3F',
  'gemini-3.1-pro-high': 'G3PH',
  'gemini-3.1-pro-low': 'G3PL',
  'gemini-3-pro-image': 'G3PI',
  'gemini-3.1-flash-image': 'G31FI',
  'gpt-oss-120b-medium': 'GPT120',
  tab_flash_lite_preview: 'TabFL',
  claude: 'Claude',
  claude_sonnet: 'CSon',
  claude_opus: 'COpus',
  claude_haiku: 'CHaiku',
  gemini_text: 'Gemini',
  gemini_image: 'GImg',
  gemini_flash: 'GFlash',
  gemini_pro: 'GPro',
}

function formatScopeName(scope: string): string {
  return SCOPE_ALIASES[scope] || scope
}

function formatModelResetTime(resetAt: string): string {
  const date = new Date(resetAt)
  const now = new Date()
  const diffMs = date.getTime() - now.getTime()
  if (diffMs <= 0) return ''
  const totalSecs = Math.floor(diffMs / 1000)
  const h = Math.floor(totalSecs / 3600)
  const m = Math.floor((totalSecs % 3600) / 60)
  const s = totalSecs % 60
  if (h > 0) return `${h}h${m}m`
  if (m > 0) return `${m}m${s}s`
  return `${s}s`
}

export default function AccountStatusIndicator({
  account,
  onShowTempUnsched,
}: AccountStatusIndicatorProps) {
  const { t } = useI18n()

  const isRateLimited = useMemo(() => {
    if (!account.rate_limit_reset_at) return false
    return new Date(account.rate_limit_reset_at) > new Date()
  }, [account.rate_limit_reset_at])

  const activeModelStatuses = useMemo<AccountModelStatusItem[]>(() => {
    const extra = account.extra as Record<string, unknown> | undefined
    const modelLimits = extra?.model_rate_limits as
      | Record<string, { rate_limited_at: string; rate_limit_reset_at: string }>
      | undefined
    const now = new Date()
    const items: AccountModelStatusItem[] = []

    if (!modelLimits) return items

    const aiCreditsEntry = modelLimits['AICredits']
    const hasActiveAICredits =
      aiCreditsEntry && new Date(aiCreditsEntry.rate_limit_reset_at) > now
    const allowOverages = !!extra?.allow_overages

    for (const [model, info] of Object.entries(modelLimits)) {
      if (new Date(info.rate_limit_reset_at) <= now) continue

      if (model === 'AICredits') {
        items.push({ kind: 'credits_exhausted', model, reset_at: info.rate_limit_reset_at })
      } else if (allowOverages && !hasActiveAICredits) {
        items.push({ kind: 'credits_active', model, reset_at: info.rate_limit_reset_at })
      } else {
        items.push({ kind: 'rate_limit', model, reset_at: info.rate_limit_reset_at })
      }
    }

    return items
  }, [account.extra])

  const isOverloaded = useMemo(() => {
    if (!account.overload_until) return false
    return new Date(account.overload_until) > new Date()
  }, [account.overload_until])

  const isTempUnschedulable = useMemo(() => {
    if (!account.temp_unschedulable_until) return false
    return new Date(account.temp_unschedulable_until) > new Date()
  }, [account.temp_unschedulable_until])

  const hasError = account.status === 'error'

  const isQuotaExceeded = useMemo(() => {
    const exceeded = (used?: number | null, limit?: number | null) =>
      typeof limit === 'number' && limit > 0 && typeof used === 'number' && used >= limit
    return (
      exceeded(account.quota_used, account.quota_limit) ||
      exceeded(account.quota_daily_used, account.quota_daily_limit) ||
      exceeded(account.quota_weekly_used, account.quota_weekly_limit)
    )
  }, [
    account.quota_used,
    account.quota_limit,
    account.quota_daily_used,
    account.quota_daily_limit,
    account.quota_weekly_used,
    account.quota_weekly_limit,
  ])

  const rateLimitCountdown = formatCountdown(account.rate_limit_reset_at, t)
  const rateLimitResumeText = rateLimitCountdown
    ? t('admin.accounts.status.rateLimitedAutoResume', { time: rateLimitCountdown })
    : ''
  const overloadCountdown = formatCountdownWithSuffix(account.overload_until, t)

  const statusClass = useMemo(() => {
    if (hasError) return 'badge-danger'
    if (isTempUnschedulable) return 'badge-warning'
    if (account.status !== 'active') {
      return account.status === 'error' ? 'badge-danger' : 'badge-gray'
    }
    if (isQuotaExceeded) return 'badge-warning'
    if (!account.schedulable) return 'badge-gray'
    return 'badge-success'
  }, [account.status, account.schedulable, hasError, isQuotaExceeded, isTempUnschedulable])

  const statusText = useMemo(() => {
    if (hasError) return t('admin.accounts.status.error')
    if (isTempUnschedulable) return t('admin.accounts.status.tempUnschedulable')
    if (account.status !== 'active') {
      return t(`admin.accounts.status.${account.status}`)
    }
    if (isQuotaExceeded) return t('admin.accounts.status.quotaExceeded')
    if (!account.schedulable) return t('admin.accounts.status.paused')
    return t(`admin.accounts.status.${account.status}`)
  }, [account.status, account.schedulable, hasError, isQuotaExceeded, isTempUnschedulable, t])

  const handleTempUnschedClick = () => {
    if (!isTempUnschedulable) return
    onShowTempUnsched?.(account)
  }

  const modelStatusLayoutClass =
    activeModelStatuses.length <= 4
      ? 'flex flex-col gap-1'
      : activeModelStatuses.length <= 8
        ? 'columns-2 gap-x-2'
        : 'columns-3 gap-x-2'

  return (
    <div className="flex items-center gap-2">
      {isRateLimited ? (
        <div className="flex flex-col items-center gap-1">
          <span className="badge text-xs badge-warning">
            {t('admin.accounts.status.rateLimited')}
          </span>
          <span className="text-[11px] text-gray-400 dark:text-gray-500">{rateLimitResumeText}</span>
        </div>
      ) : isOverloaded ? (
        <div className="flex flex-col items-center gap-1">
          <span className="badge text-xs badge-danger">
            {t('admin.accounts.status.overloaded')}
          </span>
          <span className="text-[11px] text-gray-400 dark:text-gray-500">{overloadCountdown}</span>
        </div>
      ) : (
        <>
          {isTempUnschedulable ? (
            <button
              type="button"
              className={`badge text-xs ${statusClass} cursor-pointer`}
              title={t('admin.accounts.status.viewTempUnschedDetails')}
              onClick={handleTempUnschedClick}
            >
              {statusText}
            </button>
          ) : (
            <span className={`badge text-xs ${statusClass}`}>{statusText}</span>
          )}
        </>
      )}

      {hasError && account.error_message ? (
        <div className="group/error relative">
          <svg
            className="h-4 w-4 cursor-help text-red-500 transition-colors hover:text-red-600 dark:text-red-400 dark:hover:text-red-300"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z"
            />
          </svg>
          <div className="invisible absolute left-0 top-full z-[100] mt-1.5 min-w-[200px] max-w-[300px] rounded-lg bg-gray-800 px-3 py-2 text-xs text-white opacity-0 shadow-xl transition-all duration-200 group-hover/error:visible group-hover/error:opacity-100 dark:bg-gray-900">
            <div className="whitespace-pre-wrap break-words leading-relaxed text-gray-300">
              {account.error_message}
            </div>
            <div className="absolute bottom-full left-3 border-[6px] border-transparent border-b-gray-800 dark:border-b-gray-900" />
          </div>
        </div>
      ) : null}

      {isRateLimited ? (
        <div className="group relative">
          <span className="inline-flex items-center gap-1 rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
            <Icon name="exclamationTriangle" size="xs" strokeWidth={2} />
            429
          </span>
          <div className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 w-56 -translate-x-1/2 whitespace-normal rounded bg-gray-900 px-3 py-2 text-center text-xs leading-relaxed text-white opacity-0 transition-opacity group-hover:opacity-100 dark:bg-gray-700">
            {t('admin.accounts.status.rateLimitedUntil', {
              time: formatDateTime(account.rate_limit_reset_at),
            })}
            <div className="absolute left-1/2 top-full -translate-x-1/2 border-4 border-transparent border-t-gray-900 dark:border-t-gray-700" />
          </div>
        </div>
      ) : null}

      {activeModelStatuses.length > 0 ? (
        <div className={modelStatusLayoutClass}>
          {activeModelStatuses.map((item) => (
            <div
              key={`${item.kind}-${item.model}`}
              className="group relative mb-1 break-inside-avoid"
            >
              {item.kind === 'credits_exhausted' ? (
                <span className="inline-flex items-center gap-1 rounded bg-red-100 px-1.5 py-0.5 text-xs font-medium text-red-700 dark:bg-red-900/30 dark:text-red-400">
                  <Icon name="exclamationTriangle" size="xs" strokeWidth={2} />
                  {t('admin.accounts.status.creditsExhausted')}
                  <span className="text-[10px] opacity-70">
                    {formatModelResetTime(item.reset_at)}
                  </span>
                </span>
              ) : item.kind === 'credits_active' ? (
                <span className="inline-flex items-center gap-1 rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                  <span>⚡</span>
                  {formatScopeName(item.model)}
                  <span className="text-[10px] opacity-70">
                    {formatModelResetTime(item.reset_at)}
                  </span>
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded bg-purple-100 px-1.5 py-0.5 text-xs font-medium text-purple-700 dark:bg-purple-900/30 dark:text-purple-400">
                  <Icon name="exclamationTriangle" size="xs" strokeWidth={2} />
                  {formatScopeName(item.model)}
                  <span className="text-[10px] opacity-70">
                    {formatModelResetTime(item.reset_at)}
                  </span>
                </span>
              )}
              <div className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 w-56 -translate-x-1/2 whitespace-normal rounded bg-gray-900 px-3 py-2 text-center text-xs leading-relaxed text-white opacity-0 transition-opacity group-hover:opacity-100 dark:bg-gray-700">
                {item.kind === 'credits_exhausted'
                  ? t('admin.accounts.status.creditsExhaustedUntil', {
                      time: formatTime(item.reset_at),
                    })
                  : item.kind === 'credits_active'
                    ? t('admin.accounts.status.modelCreditOveragesUntil', {
                        model: formatScopeName(item.model),
                        time: formatTime(item.reset_at),
                      })
                    : t('admin.accounts.status.modelRateLimitedUntil', {
                        model: formatScopeName(item.model),
                        time: formatTime(item.reset_at),
                      })}
                <div className="absolute left-1/2 top-full -translate-x-1/2 border-4 border-transparent border-t-gray-900 dark:border-t-gray-700" />
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {isOverloaded ? (
        <div className="group relative">
          <span className="inline-flex items-center gap-1 rounded bg-red-100 px-1.5 py-0.5 text-xs font-medium text-red-700 dark:bg-red-900/30 dark:text-red-400">
            <Icon name="exclamationTriangle" size="xs" strokeWidth={2} />
            529
          </span>
          <div className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 w-56 -translate-x-1/2 whitespace-normal rounded bg-gray-900 px-3 py-2 text-center text-xs leading-relaxed text-white opacity-0 transition-opacity group-hover:opacity-100 dark:bg-gray-700">
            {t('admin.accounts.status.overloadedUntil', {
              time: formatTime(account.overload_until),
            })}
            <div className="absolute left-1/2 top-full -translate-x-1/2 border-4 border-transparent border-t-gray-900 dark:border-t-gray-700" />
          </div>
        </div>
      ) : null}
    </div>
  )
}
