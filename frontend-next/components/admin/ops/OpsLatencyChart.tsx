'use client'

import { useMemo } from 'react'
import { Chart as ChartJS, BarElement, CategoryScale, Legend, LinearScale, Tooltip } from 'chart.js'
import { Bar } from 'react-chartjs-2'
import { useI18n } from '@/lib/i18n'
import HelpTooltip from '@/components/common/HelpTooltip'
import EmptyState from '@/components/common/EmptyState'
import type { OpsLatencyHistogramResponse } from '@/lib/adminOps'
import type { ChartState } from '@/lib/opsTypes'

ChartJS.register(BarElement, CategoryScale, LinearScale, Tooltip, Legend)

interface OpsLatencyChartProps {
  latencyData: OpsLatencyHistogramResponse | null
  loading: boolean
}

export default function OpsLatencyChart({ latencyData, loading }: OpsLatencyChartProps) {
  const { t } = useI18n()

  const isDarkMode =
    typeof document !== 'undefined' && document.documentElement.classList.contains('dark')

  const colors = useMemo(
    () => ({
      blue: '#3b82f6',
      grid: isDarkMode ? '#374151' : '#f3f4f6',
      text: isDarkMode ? '#9ca3af' : '#6b7280',
    }),
    [isDarkMode],
  )

  const hasData = (latencyData?.total_requests ?? 0) > 0
  const state: ChartState = hasData ? 'ready' : loading ? 'loading' : 'empty'

  const chartData = useMemo(() => {
    if (!latencyData || !hasData) return null
    return {
      labels: latencyData.buckets.map((b) => b.range),
      datasets: [
        {
          label: t('admin.ops.requests'),
          data: latencyData.buckets.map((b) => b.count),
          backgroundColor: colors.blue,
          borderRadius: 4,
          barPercentage: 0.6,
        },
      ],
    }
  }, [latencyData, hasData, colors.blue, t])

  const options = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: colors.text, font: { size: 10 } },
        },
        y: {
          beginAtZero: true,
          grid: { color: colors.grid, borderDash: [4, 4] },
          ticks: { color: colors.text, font: { size: 10 } },
        },
      },
    }),
    [colors],
  )

  return (
    <div className="flex h-full flex-col rounded-3xl bg-white p-6 shadow-sm ring-1 ring-gray-900/5 dark:bg-dark-800 dark:ring-dark-700">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-bold text-gray-900 dark:text-white">
          <svg className="h-4 w-4 text-purple-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          {t('admin.ops.latencyHistogram')}
          <HelpTooltip content={t('admin.ops.tooltips.latencyHistogram')} />
        </h3>
      </div>

      <div className="min-h-0 flex-1">
        {state === 'ready' && chartData ? (
          <Bar data={chartData} options={options} />
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
