'use client'

import { useMemo } from 'react'
import { Chart as ChartJS, ArcElement, Legend, Tooltip } from 'chart.js'
import { Doughnut } from 'react-chartjs-2'
import { useI18n } from '@/lib/i18n'
import HelpTooltip from '@/components/common/HelpTooltip'
import EmptyState from '@/components/common/EmptyState'
import type { OpsErrorDistributionResponse } from '@/lib/adminOps'
import type { ChartState } from '@/lib/opsTypes'

ChartJS.register(ArcElement, Tooltip, Legend)

interface OpsErrorDistributionChartProps {
  data: OpsErrorDistributionResponse | null
  loading: boolean
  onOpenDetails?: () => void
}

interface ErrorCategory {
  label: string
  count: number
  color: string
}

export default function OpsErrorDistributionChart({
  data,
  loading,
  onOpenDetails,
}: OpsErrorDistributionChartProps) {
  const { t } = useI18n()

  const isDarkMode =
    typeof document !== 'undefined' && document.documentElement.classList.contains('dark')

  const colors = useMemo(
    () => ({
      blue: '#3b82f6',
      red: '#ef4444',
      orange: '#f59e0b',
      gray: '#9ca3af',
      text: isDarkMode ? '#9ca3af' : '#6b7280',
    }),
    [isDarkMode],
  )

  const totalSlaErrors = useMemo(
    () => (data?.items ?? []).reduce((total, item) => total + Number(item.sla || 0), 0),
    [data],
  )

  const hasData = totalSlaErrors > 0
  const state: ChartState = hasData ? 'ready' : loading ? 'loading' : 'empty'

  const categories = useMemo((): ErrorCategory[] => {
    if (!data) return []

    let upstream = 0
    let client = 0
    let system = 0
    let other = 0

    for (const item of data.items || []) {
      const code = Number(item.status_code || 0)
      const count = Number(item.sla || 0)
      if (!Number.isFinite(code) || !Number.isFinite(count)) continue

      if ([502, 503, 504].includes(code)) upstream += count
      else if (code >= 400 && code < 500) client += count
      else if (code === 500) system += count
      else other += count
    }

    const out: ErrorCategory[] = []
    if (upstream > 0) out.push({ label: t('admin.ops.upstream'), count: upstream, color: colors.orange })
    if (client > 0) out.push({ label: t('admin.ops.client'), count: client, color: colors.blue })
    if (system > 0) out.push({ label: t('admin.ops.system'), count: system, color: colors.red })
    if (other > 0) out.push({ label: t('admin.ops.other'), count: other, color: colors.gray })
    return out
  }, [data, colors, t])

  const topReason = useMemo(() => {
    if (categories.length === 0) return null
    return categories.reduce((prev, cur) => (cur.count > prev.count ? cur : prev))
  }, [categories])

  const chartData = useMemo(() => {
    if (!hasData || categories.length === 0) return null
    return {
      labels: categories.map((c) => c.label),
      datasets: [
        {
          data: categories.map((c) => c.count),
          backgroundColor: categories.map((c) => c.color),
          borderWidth: 0,
        },
      ],
    }
  }, [hasData, categories])

  const options = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: isDarkMode ? '#1f2937' : '#ffffff',
          titleColor: isDarkMode ? '#f3f4f6' : '#111827',
          bodyColor: isDarkMode ? '#d1d5db' : '#4b5563',
        },
      },
    }),
    [isDarkMode],
  )

  return (
    <div className="flex h-full flex-col rounded-3xl bg-white p-6 shadow-sm ring-1 ring-gray-900/5 dark:bg-dark-800 dark:ring-dark-700">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-bold text-gray-900 dark:text-white">
          <svg className="h-4 w-4 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
          {t('admin.ops.errorDistribution')}
          <HelpTooltip content={t('admin.ops.tooltips.errorDistribution')} />
        </h3>
        <button
          type="button"
          className="inline-flex items-center rounded-lg border border-gray-200 bg-white px-2 py-1 text-[11px] font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-50 dark:border-dark-700 dark:bg-dark-900 dark:text-gray-300 dark:hover:bg-dark-800"
          disabled={state !== 'ready'}
          title={t('admin.ops.errorTrend')}
          onClick={() => onOpenDetails?.()}
        >
          {t('admin.ops.requestDetails.details')}
        </button>
      </div>

      <div className="relative min-h-0 flex-1">
        {state === 'ready' && chartData ? (
          <div className="flex h-full flex-col">
            <div className="flex-1">
              <Doughnut data={chartData} options={{ ...options, cutout: '65%' }} />
            </div>
            <div className="mt-4 flex flex-col items-center gap-2">
              {topReason && (
                <div className="text-xs font-bold text-gray-900 dark:text-white">
                  {t('admin.ops.top')}: <span style={{ color: topReason.color }}>{topReason.label}</span>
                </div>
              )}
              <div className="flex flex-wrap justify-center gap-3">
                {categories.map((item) => (
                  <div key={item.label} className="flex items-center gap-1.5 text-xs">
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: item.color }} />
                    <span className="text-gray-500 dark:text-gray-400">{item.count}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex h-full items-center justify-center">
            {state === 'loading' ? (
              <div className="animate-pulse text-sm text-gray-400">{t('common.loading')}</div>
            ) : (
              <EmptyState title={t('common.noData')} description={t('admin.ops.charts.emptyError')} />
            )}
          </div>
        )}
      </div>
    </div>
  )
}
