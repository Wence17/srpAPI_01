'use client'

import { useMemo, useRef } from 'react'
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
import type { Chart, TooltipItem } from 'chart.js'
import { useI18n } from '@/lib/i18n'
import HelpTooltip from '@/components/common/HelpTooltip'
import EmptyState from '@/components/common/EmptyState'
import { formatNumber } from '@/lib/format'
import type {
  OpsThroughputGroupBreakdownItem,
  OpsThroughputPlatformBreakdownItem,
  OpsThroughputTrendPoint,
} from '@/lib/adminOps'
import type { ChartState } from '@/lib/opsTypes'
import { formatHistoryLabel, sumNumbers } from '@/lib/adminOpsFormatters'

ChartJS.register(Title, Tooltip, Legend, LineElement, LinearScale, PointElement, CategoryScale, Filler)

interface OpsThroughputTrendChartProps {
  points: OpsThroughputTrendPoint[]
  loading: boolean
  timeRange: string
  byPlatform?: OpsThroughputPlatformBreakdownItem[]
  topGroups?: OpsThroughputGroupBreakdownItem[]
  fullscreen?: boolean
  onSelectPlatform?: (platform: string) => void
  onSelectGroup?: (groupId: number) => void
  onOpenDetails?: () => void
}

export default function OpsThroughputTrendChart({
  points,
  loading,
  timeRange,
  byPlatform = [],
  topGroups = [],
  fullscreen = false,
  onSelectPlatform,
  onSelectGroup,
  onOpenDetails,
}: OpsThroughputTrendChartProps) {
  const { t } = useI18n()
  const chartRef = useRef<Chart<'line'> | null>(null)

  const isDarkMode =
    typeof document !== 'undefined' && document.documentElement.classList.contains('dark')

  const colors = useMemo(
    () => ({
      blue: '#3b82f6',
      blueAlpha: '#3b82f620',
      green: '#10b981',
      greenAlpha: '#10b98120',
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
          label: 'QPS',
          data: points.map((p) => p.qps ?? 0),
          borderColor: colors.blue,
          backgroundColor: colors.blueAlpha,
          fill: true,
          tension: 0.4,
          pointRadius: 0,
          pointHitRadius: 10,
        },
        {
          label: t('admin.ops.tpsK'),
          data: points.map((p) => (p.tps ?? 0) / 1000),
          borderColor: colors.green,
          backgroundColor: colors.greenAlpha,
          fill: true,
          tension: 0.4,
          pointRadius: 0,
          pointHitRadius: 10,
          yAxisID: 'y1',
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
              let label = context.dataset.label || ''
              if (label) label += ': '
              if (context.parsed.y != null) label += context.parsed.y.toFixed(1)
              return label
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
          ticks: { color: c.text, font: { size: 10 } },
        },
        y1: {
          type: 'linear' as const,
          display: true,
          position: 'right' as const,
          grid: { display: false },
          ticks: { color: c.green, font: { size: 10 } },
        },
      },
    }
  }, [colors, isDarkMode])

  const resetZoom = () => {
    const chart = chartRef.current
    if (chart && typeof (chart as unknown as { resetZoom?: () => void }).resetZoom === 'function') {
      ;(chart as unknown as { resetZoom: () => void }).resetZoom()
    }
  }

  const downloadChart = () => {
    const chart = chartRef.current
    if (!chart || typeof chart.toBase64Image !== 'function') return
    const url = chart.toBase64Image('image/png', 1)
    const a = document.createElement('a')
    a.href = url
    a.download = `ops-throughput-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.png`
    a.click()
  }

  return (
    <div className="flex h-full flex-col rounded-3xl bg-white p-6 shadow-sm ring-1 ring-gray-900/5 dark:bg-dark-800 dark:ring-dark-700">
      <div className="mb-4 flex shrink-0 items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-bold text-gray-900 dark:text-white">
          <svg className="h-4 w-4 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
          </svg>
          {t('admin.ops.throughputTrend')}
          {!fullscreen && <HelpTooltip content={t('admin.ops.tooltips.throughputTrend')} />}
        </h3>
        <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-blue-500" />
            QPS
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-green-500" />
            {t('admin.ops.tpsK')}
          </span>
          {!fullscreen && (
            <>
              <button
                type="button"
                className="ml-2 inline-flex items-center rounded-lg border border-gray-200 bg-white px-2 py-1 text-[11px] font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-50 dark:border-dark-700 dark:bg-dark-900 dark:text-gray-300 dark:hover:bg-dark-800"
                disabled={state !== 'ready'}
                title={t('admin.ops.requestDetails.title')}
                onClick={() => onOpenDetails?.()}
              >
                {t('admin.ops.requestDetails.details')}
              </button>
              <button
                type="button"
                className="ml-2 inline-flex items-center rounded-lg border border-gray-200 bg-white px-2 py-1 text-[11px] font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-50 dark:border-dark-700 dark:bg-dark-900 dark:text-gray-300 dark:hover:bg-dark-800"
                disabled={state !== 'ready'}
                title={t('admin.ops.charts.resetZoomHint')}
                onClick={resetZoom}
              >
                {t('admin.ops.charts.resetZoom')}
              </button>
              <button
                type="button"
                className="inline-flex items-center rounded-lg border border-gray-200 bg-white px-2 py-1 text-[11px] font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-50 dark:border-dark-700 dark:bg-dark-900 dark:text-gray-300 dark:hover:bg-dark-800"
                disabled={state !== 'ready'}
                title={t('admin.ops.charts.downloadChartHint')}
                onClick={downloadChart}
              >
                {t('admin.ops.charts.downloadChart')}
              </button>
            </>
          )}
        </div>
      </div>

      {topGroups.length > 0 ? (
        <div className="mb-3 flex flex-wrap gap-2">
          {topGroups.map((g) => (
            <button
              key={g.group_id}
              type="button"
              className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-3 py-1 text-[11px] font-semibold text-gray-700 hover:bg-gray-50 dark:border-dark-700 dark:bg-dark-900 dark:text-gray-200 dark:hover:bg-dark-800"
              onClick={() => onSelectGroup?.(g.group_id)}
            >
              <span className="max-w-[180px] truncate">{g.group_name || `#${g.group_id}`}</span>
              <span className="text-gray-400 dark:text-gray-500">{formatNumber(g.request_count)}</span>
            </button>
          ))}
        </div>
      ) : byPlatform.length > 0 ? (
        <div className="mb-3 flex flex-wrap gap-2">
          {byPlatform.map((p) => (
            <button
              key={p.platform}
              type="button"
              className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-3 py-1 text-[11px] font-semibold text-gray-700 hover:bg-gray-50 dark:border-dark-700 dark:bg-dark-900 dark:text-gray-200 dark:hover:bg-dark-800"
              onClick={() => onSelectPlatform?.(p.platform)}
            >
              <span className="uppercase">{p.platform}</span>
              <span className="text-gray-400 dark:text-gray-500">{formatNumber(p.request_count)}</span>
            </button>
          ))}
        </div>
      ) : null}

      <div className="min-h-0 flex-1">
        {state === 'ready' && chartData ? (
          <Line ref={chartRef} data={chartData} options={options} />
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
