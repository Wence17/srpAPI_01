'use client'

import { useMemo } from 'react'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js'
import { Line } from 'react-chartjs-2'
import { useI18n } from '@/lib/i18n'
import LoadingSpinner from '@/components/common/LoadingSpinner'
import type { TrendDataPoint } from '@/lib/usage'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler)

interface TokenUsageTrendProps {
  trendData: TrendDataPoint[]
  loading?: boolean
}

function formatTokens(value: number): string {
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(2)}B`
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`
  if (value >= 1_000) return `${(value / 1_000).toFixed(2)}K`
  return value.toLocaleString()
}

function formatCost(value: number): string {
  if (value >= 1000) return `${(value / 1000).toFixed(2)}K`
  if (value >= 1) return value.toFixed(2)
  if (value >= 0.01) return value.toFixed(3)
  return value.toFixed(4)
}

export default function TokenUsageTrend({ trendData, loading = false }: TokenUsageTrendProps) {
  const { t } = useI18n()

  const isDarkMode =
    typeof document !== 'undefined' && document.documentElement.classList.contains('dark')

  const chartColors = useMemo(
    () => ({
      text: isDarkMode ? '#e5e7eb' : '#374151',
      grid: isDarkMode ? '#374151' : '#e5e7eb',
      input: '#3b82f6',
      output: '#10b981',
      cacheCreation: '#f59e0b',
      cacheRead: '#06b6d4',
      cacheHitRate: '#8b5cf6',
    }),
    [isDarkMode],
  )

  const chartData = useMemo(() => {
    if (!trendData?.length) return null
    return {
      labels: trendData.map((d) => d.date),
      datasets: [
        {
          label: 'Input',
          data: trendData.map((d) => d.input_tokens),
          borderColor: chartColors.input,
          backgroundColor: `${chartColors.input}20`,
          fill: true,
          tension: 0.3,
        },
        {
          label: 'Output',
          data: trendData.map((d) => d.output_tokens),
          borderColor: chartColors.output,
          backgroundColor: `${chartColors.output}20`,
          fill: true,
          tension: 0.3,
        },
        {
          label: 'Cache Creation',
          data: trendData.map((d) => d.cache_creation_tokens),
          borderColor: chartColors.cacheCreation,
          backgroundColor: `${chartColors.cacheCreation}20`,
          fill: true,
          tension: 0.3,
        },
        {
          label: 'Cache Read',
          data: trendData.map((d) => d.cache_read_tokens),
          borderColor: chartColors.cacheRead,
          backgroundColor: `${chartColors.cacheRead}20`,
          fill: true,
          tension: 0.3,
        },
        {
          label: 'Cache Hit Rate',
          data: trendData.map((d) => {
            const totalPromptTokens = d.input_tokens + d.cache_read_tokens + d.cache_creation_tokens
            return totalPromptTokens > 0 ? (d.cache_read_tokens / totalPromptTokens) * 100 : 0
          }),
          borderColor: chartColors.cacheHitRate,
          backgroundColor: `${chartColors.cacheHitRate}20`,
          borderDash: [5, 5],
          fill: false,
          tension: 0.3,
          yAxisID: 'yPercent',
        },
      ],
    }
  }, [trendData, chartColors])

  const lineOptions = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      interaction: { intersect: false, mode: 'index' as const },
      plugins: {
        legend: {
          position: 'top' as const,
          labels: {
            color: chartColors.text,
            usePointStyle: true,
            pointStyle: 'circle',
            padding: 15,
            font: { size: 11 },
          },
        },
        tooltip: {
          callbacks: {
            label: (context: { dataset: { label?: string; yAxisID?: string }; raw: unknown }) => {
              if (context.dataset.yAxisID === 'yPercent') {
                return `${context.dataset.label}: ${Number(context.raw).toFixed(1)}%`
              }
              return `${context.dataset.label}: ${formatTokens(Number(context.raw))}`
            },
            footer: (tooltipItems: Array<{ dataIndex?: number }>) => {
              const dataIndex = tooltipItems[0]?.dataIndex
              if (dataIndex !== undefined && trendData[dataIndex]) {
                const data = trendData[dataIndex]
                return `Actual: $${formatCost(data.actual_cost)} | Standard: $${formatCost(data.cost)}`
              }
              return ''
            },
          },
        },
      },
      scales: {
        x: {
          grid: { color: chartColors.grid },
          ticks: { color: chartColors.text, font: { size: 10 } },
        },
        y: {
          grid: { color: chartColors.grid },
          ticks: {
            color: chartColors.text,
            font: { size: 10 },
            callback: (value: string | number) => formatTokens(Number(value)),
          },
        },
        yPercent: {
          position: 'right' as const,
          min: 0,
          max: 100,
          grid: { drawOnChartArea: false },
          ticks: {
            color: chartColors.cacheHitRate,
            font: { size: 10 },
            callback: (value: string | number) => `${value}%`,
          },
        },
      },
    }),
    [chartColors, trendData],
  )

  return (
    <div className="card p-4">
      <h3 className="mb-4 text-sm font-semibold text-gray-900 dark:text-white">
        {t('admin.dashboard.tokenUsageTrend')}
      </h3>
      {loading ? (
        <div className="flex h-48 items-center justify-center">
          <LoadingSpinner />
        </div>
      ) : trendData.length > 0 && chartData ? (
        <div className="h-48">
          <Line data={chartData} options={lineOptions} />
        </div>
      ) : (
        <div className="flex h-48 items-center justify-center text-sm text-gray-500 dark:text-gray-400">
          {t('admin.dashboard.noDataAvailable')}
        </div>
      )}
    </div>
  )
}
