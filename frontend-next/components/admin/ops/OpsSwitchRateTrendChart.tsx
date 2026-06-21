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
import type { TooltipItem } from 'chart.js'
import { Line } from 'react-chartjs-2'
import { useI18n } from '@/lib/i18n'
import HelpTooltip from '@/components/common/HelpTooltip'
import EmptyState from '@/components/common/EmptyState'
import type { OpsThroughputTrendPoint } from '@/lib/adminOps'
import type { ChartState } from '@/lib/opsTypes'
import { formatHistoryLabel, sumNumbers } from '@/lib/adminOpsFormatters'

ChartJS.register(Title, Tooltip, Legend, LineElement, LinearScale, PointElement, CategoryScale, Filler)

interface OpsSwitchRateTrendChartProps {
  points: OpsThroughputTrendPoint[]
  loading: boolean
  timeRange: string
  fullscreen?: boolean
}

export default function OpsSwitchRateTrendChart({
  points,
  loading,
  timeRange,
  fullscreen = false,
}: OpsSwitchRateTrendChartProps) {
  const { t } = useI18n()

  const isDarkMode =
    typeof document !== 'undefined' && document.documentElement.classList.contains('dark')

  const colors = useMemo(
    () => ({
      teal: '#14b8a6',
      tealAlpha: '#14b8a620',
      grid: isDarkMode ? '#374151' : '#f3f4f6',
      text: isDarkMode ? '#9ca3af' : '#6b7280',
    }),
    [isDarkMode],
  )

  const totalRequests = useMemo(() => sumNumbers(points.map((p) => p.request_count)), [points])

  const chartData = useMemo(() => {
    if (!points.length || totalRequests <= 0) return null
    return {
      labels: points.map((p) => formatHistoryLabel(p.bucket_start, timeRange)),
      datasets: [
        {
          label: t('admin.ops.switchRate'),
          data: points.map((p) => {
            const requests = p.request_count ?? 0
            const switches = p.switch_count ?? 0
            if (requests <= 0) return 0
            return switches / requests
          }),
          borderColor: colors.teal,
          backgroundColor: colors.tealAlpha,
          fill: true,
          tension: 0.35,
          pointRadius: 0,
          pointHitRadius: 10,
        },
      ],
    }
  }, [points, timeRange, totalRequests, colors, t])

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
          callbacks: {
            label: (context: TooltipItem<'line'>) => {
              const value = typeof context.parsed?.y === 'number' ? context.parsed.y : 0
              return `${t('admin.ops.switchRate')}: ${value.toFixed(3)}`
            },
          },
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
          ticks: {
            color: c.text,
            font: { size: 10 },
            callback: (value: string | number) => Number(value).toFixed(3),
          },
        },
      },
    }
  }, [colors, isDarkMode, t])

  return (
    <div className="flex h-full flex-col rounded-3xl bg-white p-6 shadow-sm ring-1 ring-gray-900/5 dark:bg-dark-800 dark:ring-dark-700">
      <div className="mb-4 flex shrink-0 items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-bold text-gray-900 dark:text-white">
          <svg className="h-4 w-4 text-teal-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h10M7 12h6m-6 5h3" />
          </svg>
          {t('admin.ops.switchRateTrend')}
          {!fullscreen && <HelpTooltip content={t('admin.ops.tooltips.switchRateTrend')} />}
        </h3>
      </div>

      <div className="min-h-0 flex-1">
        {state === 'ready' && chartData ? (
          <Line data={chartData} options={options} />
        ) : (
          <div className="flex h-full items-center justify-center">
            {state === 'loading' ? (
              <div className="animate-pulse text-sm text-gray-400">{t('common.loading')}</div>
            ) : (
              <EmptyState title={t('common.noData')} description={t('admin.ops.charts.emptyRequest')} />
            )}
          </div>
        )}
      </div>
    </div>
  )
}
