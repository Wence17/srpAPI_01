'use client'

import { useMemo } from 'react'
import { useI18n } from '@/lib/i18n'
import type { PlatformQuotaItem, PlatformQuotaPlatform } from '@/lib/types'

const PLATFORM_ORDER: PlatformQuotaPlatform[] = ['anthropic', 'openai', 'gemini', 'antigravity']

function fmtUsd(n: number): string {
  if (n == null || Number.isNaN(n)) return '0'
  return String(Math.round(n * 100) / 100)
}

function fmtLimit(n: number | null): string {
  return n == null ? '—' : fmtUsd(n)
}

interface UserPlatformQuotaCellProps {
  quotas?: PlatformQuotaItem[]
}

export default function UserPlatformQuotaCell({ quotas }: UserPlatformQuotaCellProps) {
  const { t } = useI18n()

  const configured = useMemo(() => {
    if (!quotas) return []
    return quotas
      .filter(
        (q) =>
          q.daily_limit_usd != null ||
          q.weekly_limit_usd != null ||
          q.monthly_limit_usd != null,
      )
      .slice()
      .sort(
        (a, b) =>
          PLATFORM_ORDER.indexOf(a.platform as PlatformQuotaPlatform) -
          PLATFORM_ORDER.indexOf(b.platform as PlatformQuotaPlatform),
      )
  }, [quotas])

  if (quotas === undefined) {
    return <span className="text-xs text-gray-400 dark:text-gray-500">…</span>
  }

  if (configured.length === 0) {
    return (
      <span className="text-xs text-gray-400 dark:text-gray-500">
        {t('admin.users.platformQuota.cellNotConfigured')}
      </span>
    )
  }

  return (
    <div className="space-y-0.5 text-xs">
      {configured.map((row) => (
        <div key={row.platform} className="flex items-center gap-2 whitespace-nowrap">
          <span className="w-20 shrink-0 font-mono text-gray-700 dark:text-gray-300">{row.platform}</span>
          <span className="text-gray-500 dark:text-gray-400">
            {t('admin.users.platformQuota.windowDaily')}{' '}
            <span className="text-gray-900 dark:text-white">
              {fmtUsd(row.daily_usage_usd ?? 0)}/{fmtLimit(row.daily_limit_usd ?? null)}
            </span>
          </span>
          <span className="text-gray-500 dark:text-gray-400">
            {t('admin.users.platformQuota.windowWeekly')}{' '}
            <span className="text-gray-900 dark:text-white">
              {fmtUsd(row.weekly_usage_usd ?? 0)}/{fmtLimit(row.weekly_limit_usd ?? null)}
            </span>
          </span>
          <span className="text-gray-500 dark:text-gray-400">
            {t('admin.users.platformQuota.windowMonthly')}{' '}
            <span className="text-gray-900 dark:text-white">
              {fmtUsd(row.monthly_usage_usd ?? 0)}/{fmtLimit(row.monthly_limit_usd ?? null)}
            </span>
          </span>
        </div>
      ))}
    </div>
  )
}
