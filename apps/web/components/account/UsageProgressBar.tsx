'use client'

import { useEffect, useMemo, useState } from 'react'
import { useI18n } from '@/lib/i18n'
import { formatCompactNumber } from '@/lib/format'
import type { WindowStats } from '@/lib/types'

interface UsageProgressBarProps {
  label: string
  utilization: number
  resetsAt?: string | null
  color: 'indigo' | 'emerald' | 'purple' | 'amber'
  windowStats?: WindowStats | null
  showNowWhenIdle?: boolean
}

const LABEL_CLASSES = {
  indigo: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300',
  emerald: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  purple: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
  amber: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
} as const

export default function UsageProgressBar({
  label,
  utilization,
  resetsAt,
  color,
  windowStats,
  showNowWhenIdle,
}: UsageProgressBarProps) {
  const { t } = useI18n()
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    if (!resetsAt) return
    setNow(new Date())
    const interval = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(interval)
  }, [resetsAt])

  const labelClass = LABEL_CLASSES[color]

  const barClass =
    utilization >= 100
      ? 'bg-red-500'
      : utilization >= 80
        ? 'bg-amber-500'
        : 'bg-green-500'

  const textClass =
    utilization >= 100
      ? 'text-red-600 dark:text-red-400'
      : utilization >= 80
        ? 'text-amber-600 dark:text-amber-400'
        : 'text-gray-600 dark:text-gray-400'

  const barWidth = `${Math.min(utilization, 100)}%`

  const displayPercent = useMemo(() => {
    const percent = Math.round(utilization)
    return percent > 999 ? '>999%' : `${percent}%`
  }, [utilization])

  const shouldShowResetTime = Boolean(resetsAt || (showNowWhenIdle && utilization <= 0))

  const formatResetTime = useMemo(() => {
    if (showNowWhenIdle && utilization <= 0) {
      return '现在'
    }

    if (!resetsAt) return '-'

    const date = new Date(resetsAt)
    const diffMs = date.getTime() - now.getTime()

    if (diffMs <= 0) return '现在'

    const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
    const diffMins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60))

    if (diffHours >= 24) {
      const days = Math.floor(diffHours / 24)
      return `${days}d ${diffHours % 24}h`
    }
    if (diffHours > 0) {
      return `${diffHours}h ${diffMins}m`
    }
    return `${diffMins}m`
  }, [now, resetsAt, showNowWhenIdle, utilization])

  const formatRequests = windowStats
    ? formatCompactNumber(windowStats.requests, { allowBillions: false })
    : ''
  const formatTokens = windowStats ? formatCompactNumber(windowStats.tokens) : ''
  const formatAccountCost = windowStats ? windowStats.cost.toFixed(2) : '0.00'
  const formatUserCost =
    windowStats && windowStats.user_cost != null ? windowStats.user_cost.toFixed(2) : '0.00'

  const showWindowStats =
    windowStats && (windowStats.requests > 0 || windowStats.tokens > 0)

  return (
    <div>
      {showWindowStats ? (
        <div className="mb-0.5 flex items-center">
          <div className="flex items-center gap-1.5 text-[9px] text-gray-500 dark:text-gray-400">
            <span className="rounded bg-gray-100 px-1.5 py-0.5 dark:bg-gray-800">
              {formatRequests} req
            </span>
            <span className="rounded bg-gray-100 px-1.5 py-0.5 dark:bg-gray-800">
              {formatTokens}
            </span>
            <span
              className="rounded bg-gray-100 px-1.5 py-0.5 dark:bg-gray-800"
              title={t('usage.accountBilled')}
            >
              A ${formatAccountCost}
            </span>
            {windowStats?.user_cost != null ? (
              <span
                className="rounded bg-gray-100 px-1.5 py-0.5 dark:bg-gray-800"
                title={t('usage.userBilled')}
              >
                U ${formatUserCost}
              </span>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="flex items-center gap-1">
        <span
          className={`w-[32px] shrink-0 rounded px-1 text-center text-[10px] font-medium ${labelClass}`}
        >
          {label}
        </span>

        <div className="h-1.5 w-8 shrink-0 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
          <div
            className={`h-full transition-all duration-300 ${barClass}`}
            style={{ width: barWidth }}
          />
        </div>

        <span className={`w-[32px] shrink-0 text-right text-[10px] font-medium ${textClass}`}>
          {displayPercent}
        </span>

        {shouldShowResetTime ? (
          <span className="shrink-0 text-[10px] text-gray-400">{formatResetTime}</span>
        ) : null}
      </div>
    </div>
  )
}
