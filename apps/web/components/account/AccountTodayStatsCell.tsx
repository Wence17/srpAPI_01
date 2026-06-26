'use client'

import { useI18n } from '@/lib/i18n'
import { formatCurrency, formatNumber } from '@/lib/format'
import type { WindowStats } from '@/lib/types'

interface AccountTodayStatsCellProps {
  stats?: WindowStats | null
  loading?: boolean
  error?: string | null
}

function formatTokens(tokens: number): string {
  if (tokens >= 1000000) return `${(tokens / 1000000).toFixed(2)}M`
  if (tokens >= 1000) return `${(tokens / 1000).toFixed(1)}K`
  return tokens.toString()
}

export default function AccountTodayStatsCell({
  stats = null,
  loading = false,
  error = null,
}: AccountTodayStatsCellProps) {
  const { t } = useI18n()

  if (loading && !stats) {
    return (
      <div className="space-y-0.5">
        <div className="h-3 w-12 animate-pulse rounded bg-gray-200 dark:bg-gray-700" />
        <div className="h-3 w-16 animate-pulse rounded bg-gray-200 dark:bg-gray-700" />
        <div className="h-3 w-10 animate-pulse rounded bg-gray-200 dark:bg-gray-700" />
      </div>
    )
  }

  if (error && !stats) {
    return <div className="text-xs text-red-500">{error}</div>
  }

  if (stats) {
    return (
      <div className="space-y-0.5 text-xs">
        <div className="flex items-center gap-1">
          <span className="text-gray-500 dark:text-gray-400">{t('admin.accounts.stats.requests')}:</span>
          <span className="font-medium text-gray-700 dark:text-gray-300">{formatNumber(stats.requests)}</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-gray-500 dark:text-gray-400">{t('admin.accounts.stats.tokens')}:</span>
          <span className="font-medium text-gray-700 dark:text-gray-300">{formatTokens(stats.tokens)}</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-gray-500 dark:text-gray-400">{t('usage.accountBilled')}:</span>
          <span className="font-medium text-emerald-600 dark:text-emerald-400">{formatCurrency(stats.cost)}</span>
        </div>
        {stats.user_cost != null ? (
          <div className="flex items-center gap-1">
            <span className="text-gray-500 dark:text-gray-400">{t('usage.userBilled')}:</span>
            <span className="font-medium text-gray-700 dark:text-gray-300">{formatCurrency(stats.user_cost)}</span>
          </div>
        ) : null}
      </div>
    )
  }

  return <div className="text-xs text-gray-400">-</div>
}
