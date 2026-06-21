'use client'

import { useMemo } from 'react'
import {
  Chart as ChartJS,
  CategoryScale,
  Filler,
  Legend,
  LineElement,
  LinearScale,
  PointElement,
  Title,
  Tooltip,
} from 'chart.js'
import { Line } from 'react-chartjs-2'
import { useI18n } from '@/lib/i18n'
import HelpTooltip from '@/components/common/HelpTooltip'
import EmptyState from '@/components/common/EmptyState'
import type { OpsErrorTrendPoint } from '@/lib/adminOps'
import type { ChartState } from '@/lib/opsTypes'
import { formatHistoryLabel, sumNumbers } from '@/lib/adminOpsFormatters'

ChartJS.register(Title, Tooltip, Legend, LineElement, LinearScale, PointElement, CategoryScale, Filler)

interface OpsErrorTrendChartProps {
  points: OpsErrorTrendPoint[]
  loading: boolean
  timeRange: string
  onOpenRequestErrors?: () => void
  onOpenUpstreamErrors?: () => void
}

export default function OpsErrorTrendChart({
  points,
  loading,
  timeRange,
  onOpenRequestErrors,
  onOpenUpstreamErrors,
}: OpsErrorTrendChartProps) {
  const { t } = useI18n()

  const isDarkMode =
    typeof document !== 'undefined' && document.documentElement.classList.contains('dark')

  const colors = useMemo(
    () => ({
      red: '#ef4444',
      redAlpha: '#ef444420',
      purple: '#8b5cf6',
      purpleAlpha: '#8b5cf620',
      gray: '#9ca3af',
      grid: isDarkMode ? '#374151' : '#f3f4f6',
      text: isDarkMode ? '#9ca3af' : '#6b7280',
    }),
    [isDarkMode],
  )

  const totalRequestErrors = useMemo(
    () => sumNumbers(points.map((p) => p.error_count_sla ?? 0)),
    [points],
  )

  const totalUpstreamErrors = useMemo(
    () =>
      sumNumbers(
        points.map(
          (p) =>
            (p.upstream_error_count_excl_429_529 ?? 0) +
            (p.upstream_429_count ?? 0) +
            (p.upstream_529_count ?? 0),
        ),
      ),
    [points],
  )

  const totalDisplayed = useMemo(
    () =>
      sumNumbers(
        points.map(
          (p) =>
            (p.error_count_sla ?? 0) +
            (p.upstream_error_count_excl_429_529 ?? 0) +
            (p.business_limited_count ?? 0),
        ),
      ),
    [points],
  )

  const hasRequestErrors = totalRequestErrors > 0
  const hasUpstreamErrors = totalUpstreamErrors > 0

  const chartData = useMemo(() => {
    if (!points.length || totalDisplayed <= 0) return null
    return {
      labels: points.map((p) => formatHistoryLabel(p.bucket_start, timeRange)),
      datasets: [
        {
          label: t('admin.ops.errorsSla'),
          data: points.map((p) => p.error_count_sla ?? 0),
          borderColor: colors.red,
          backgroundColor: colors.redAlpha,
          fill: true,
          tension: 0.35,
          pointRadius: 0,
          pointHitRadius: 10,
        },
        {
          label: t('admin.ops.upstreamExcl429529'),
          data: points.map((p) => p.upstream_error_count_excl_429_529 ?? 0),
          borderColor: colors.purple,
          backgroundColor: colors.purpleAlpha,
          fill: true,
          tension: 0.35,
          pointRadius: 0,
          pointHitRadius: 10,
        },
        {
          label: t('admin.ops.businessLimited'),
          data: points.map((p) => p.business_limited_count ?? 0),
          borderColor: colors.gray,
          backgroundColor: 'transparent',
          borderDash: [6, 6],
          fill: false,
          tension: 0.35,
          pointRadius: 0,
          pointHitRadius: 10,
        },
      ],
    }
  }, [points, timeRange, totalDisplayed, colors, t])

  const state: ChartState = chartData ? 'ready' : loading ? 'loading' : 'empty'

  const options = useMemo(() => {
    const c = colors
    return {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { intersect: false, mode: 'index' as const },
      plugins: {
        legend: {
          position: 'top' as const,
          align: 'end' as const,
          labels: { color: c.text, usePointStyle: true, boxWidth: 6, font: { size: 10 } },
        },
        tooltip: {
          backgroundColor: isDarkMode ? '#1f2937' : '#ffffff',
          titleColor: isDarkMode ? '#f3f4f6' : '#111827',
          bodyColor: isDarkMode ? '#d1d5db' : '#4b5563',
          borderColor: c.grid,
          borderWidth: 1,
          padding: 10,
          displayColors: true,
        },
      },
      scales: {
        x: {
          type: 'category' as const,
          grid: { display: false },
          ticks: {
            color: c.text,
            font: { size: 10 },
            maxTicksLimit: 8,
            autoSkip: true,
            autoSkipPadding: 10,
          },
        },
        y: {
          type: 'linear' as const,
          display: true,
          position: 'left' as const,
          grid: { color: c.grid, borderDash: [4, 4] },
          ticks: { color: c.text, font: { size: 10 }, precision: 0 },
        },
      },
    }
  }, [colors, isDarkMode])

  return (
    <div className="flex h-full flex-col rounded-3xl bg-white p-6 shadow-sm ring-1 ring-gray-900/5 dark:bg-dark-800 dark:ring-dark-700">
      <div className="mb-4 flex shrink-0 items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-bold text-gray-900 dark:text-white">
          <svg className="h-4 w-4 text-rose-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M13 17h8m0 0V9m0 8l-8-8-4 4-6-6"
            />
          </svg>
          {t('admin.ops.errorTrend')}
          <HelpTooltip content={t('admin.ops.tooltips.errorTrend')} />
        </h3>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="inline-flex items-center rounded-lg border border-gray-200 bg-white px-2 py-1 text-[11px] font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-50 dark:border-dark-700 dark:bg-dark-900 dark:text-gray-300 dark:hover:bg-dark-800"
            disabled={!hasRequestErrors}
            onClick={() => onOpenRequestErrors?.()}
          >
            {t('admin.ops.errorDetails.requestErrors')}
          </button>
          <button
            type="button"
            className="inline-flex items-center rounded-lg border border-gray-200 bg-white px-2 py-1 text-[11px] font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-50 dark:border-dark-700 dark:bg-dark-900 dark:text-gray-300 dark:hover:bg-dark-800"
            disabled={!hasUpstreamErrors}
            onClick={() => onOpenUpstreamErrors?.()}
          >
            {t('admin.ops.errorDetails.upstreamErrors')}
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1">
        {state === 'ready' && chartData ? (
          <Line data={chartData} options={options} />
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
