'use client'

import { useMemo } from 'react'
import { useI18n } from '@/lib/i18n'
import Icon from '@/components/icons/Icon'
import type { PlatformUsage } from '@/lib/adminDashboard'

const OTHER_THRESHOLD = 0.0001

const PLATFORM_LABELS: Record<string, string> = {
  anthropic: 'Claude',
  openai: 'OpenAI',
  gemini: 'Gemini',
  antigravity: 'Antigravity',
}

interface BreakdownRow extends PlatformUsage {
  isOther?: boolean
}

interface PlatformUsageBreakdownProps {
  today: number
  total: number
  byPlatform?: PlatformUsage[]
}

function platformLabel(platform: string): string {
  return PLATFORM_LABELS[platform] ?? platform
}

export default function PlatformUsageBreakdown({
  today,
  total,
  byPlatform,
}: PlatformUsageBreakdownProps) {
  const { t } = useI18n()

  const sortedBreakdown = useMemo<BreakdownRow[]>(() => {
    const list = byPlatform ?? []
    const rows: BreakdownRow[] = [...list]
      .sort((a, b) => b.total_actual_cost - a.total_actual_cost)
      .map((p) => ({ ...p }))

    const sumTotal = rows.reduce((s, r) => s + r.total_actual_cost, 0)
    const sumToday = rows.reduce((s, r) => s + r.today_actual_cost, 0)
    const diffTotal = Math.max(0, total - sumTotal)
    const diffToday = Math.max(0, today - sumToday)
    if (diffTotal > OTHER_THRESHOLD || diffToday > OTHER_THRESHOLD) {
      rows.push({
        platform: '__other__',
        today_actual_cost: diffToday,
        total_actual_cost: diffTotal,
        isOther: true,
      })
    }
    return rows
  }, [byPlatform, today, total])

  const hasBreakdown = sortedBreakdown.length > 0

  return (
    <div className="group/usage relative text-sm">
      <div className="flex items-center gap-1.5">
        <span className="text-gray-500 dark:text-gray-400">{t('admin.users.today')}:</span>
        <span className="font-medium text-gray-900 dark:text-white">${today.toFixed(4)}</span>
        {hasBreakdown ? (
          <Icon name="infoCircle" size="xs" className="text-gray-400 dark:text-gray-500" />
        ) : null}
      </div>
      <div className="mt-0.5 flex items-center gap-1.5">
        <span className="text-gray-500 dark:text-gray-400">{t('admin.users.total')}:</span>
        <span className="font-medium text-gray-900 dark:text-white">${total.toFixed(4)}</span>
      </div>

      {hasBreakdown ? (
        <div className="pointer-events-none absolute left-full top-0 z-50 ml-2 min-w-[220px] whitespace-nowrap rounded-md bg-gray-900 px-3 py-2 text-xs text-white opacity-0 shadow-xl transition-opacity duration-100 group-hover/usage:opacity-100 dark:bg-dark-600">
          <div className="mb-1.5 flex items-center justify-between gap-3 border-b border-white/10 pb-1 text-[11px] opacity-80">
            <span>{t('admin.users.platformBreakdown')}</span>
            <span className="font-mono">
              {t('admin.users.today')} / {t('admin.users.total')}
            </span>
          </div>
          {sortedBreakdown.map((item) => (
            <div
              key={item.platform}
              className={`flex items-center justify-between gap-3 py-0.5 ${item.isOther ? 'italic opacity-70' : ''}`}
            >
              <span className="capitalize">
                {item.isOther ? t('admin.users.platformOther') : platformLabel(item.platform)}
              </span>
              <span className="font-mono">
                ${item.today_actual_cost.toFixed(4)}
                <span className="opacity-50"> / </span>
                ${item.total_actual_cost.toFixed(4)}
              </span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}
