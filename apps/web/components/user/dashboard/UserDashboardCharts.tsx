'use client'

import { useMemo } from 'react'
import {
  Chart as ChartJS,
  ArcElement,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js'
import { Doughnut } from 'react-chartjs-2'
import { useI18n } from '@/lib/i18n'
import LoadingSpinner from '@/components/common/LoadingSpinner'
import DateRangePicker from '@/components/common/DateRangePicker'
import Select from '@/components/common/Select'
import TokenUsageTrend from '@/components/charts/TokenUsageTrend'
import type { ModelStat, TrendDataPoint } from '@/lib/usage'

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler,
)

interface UserDashboardChartsProps {
  loading: boolean
  startDate: string
  endDate: string
  granularity: string
  trend: TrendDataPoint[]
  models: ModelStat[]
  onStartDateChange: (value: string) => void
  onEndDateChange: (value: string) => void
  onGranularityChange: (value: string) => void
  onDateRangeChange: () => void
  onRefresh: () => void
}

function formatNumber(n: number): string {
  return n.toLocaleString()
}

function formatCost(c: number): string {
  return c.toFixed(4)
}

function formatTokens(t: number): string {
  if (t >= 1_000_000) return `${(t / 1_000_000).toFixed(1)}M`
  if (t >= 1000) return `${(t / 1000).toFixed(1)}K`
  return t.toString()
}

export default function UserDashboardCharts({
  loading,
  startDate,
  endDate,
  granularity,
  trend,
  models,
  onStartDateChange,
  onEndDateChange,
  onGranularityChange,
  onDateRangeChange,
  onRefresh,
}: UserDashboardChartsProps) {
  const { t } = useI18n()

  const modelData = useMemo(() => {
    if (!models?.length) return null
    return {
      labels: models.map((m) => m.model),
      datasets: [
        {
          data: models.map((m) => m.total_tokens),
          backgroundColor: ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'],
        },
      ],
    }
  }, [models])

  const doughnutOptions = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (context: { label?: string; parsed: number }) =>
              `${context.label}: ${formatTokens(context.parsed)} tokens`,
          },
        },
      },
    }),
    [],
  )

  return (
    <div className="space-y-6">
      <div className="card p-4">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{t('dashboard.timeRange')}:</span>
            <DateRangePicker
              startDate={startDate}
              endDate={endDate}
              onUpdateStartDate={onStartDateChange}
              onUpdateEndDate={onEndDateChange}
              onChange={onDateRangeChange}
            />
          </div>
          <button type="button" onClick={onRefresh} disabled={loading} className="btn btn-secondary">
            {t('common.refresh')}
          </button>
          <div className="ml-auto flex items-center gap-2">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{t('dashboard.granularity')}:</span>
            <div className="w-28">
              <Select
                modelValue={granularity}
                options={[
                  { value: 'day', label: t('dashboard.day') },
                  { value: 'hour', label: t('dashboard.hour') },
                ]}
                onUpdateModelValue={(value) => onGranularityChange(String(value))}
                onChange={() => onDateRangeChange()}
              />
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="card relative overflow-hidden p-4">
          {loading && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/50 backdrop-blur-sm dark:bg-dark-800/50">
              <LoadingSpinner size="md" />
            </div>
          )}
          <h3 className="mb-4 text-sm font-semibold text-gray-900 dark:text-white">{t('dashboard.modelDistribution')}</h3>
          <div className="flex items-center gap-6">
            <div className="h-48 w-48">
              {modelData ? (
                <Doughnut data={modelData} options={doughnutOptions} />
              ) : (
                <div className="flex h-full items-center justify-center text-sm text-gray-500 dark:text-gray-400">
                  {t('dashboard.noDataAvailable')}
                </div>
              )}
            </div>
            <div className="max-h-48 flex-1 overflow-y-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-gray-500 dark:text-gray-400">
                    <th className="pb-2 text-left">{t('dashboard.model')}</th>
                    <th className="pb-2 text-right">{t('dashboard.requests')}</th>
                    <th className="pb-2 text-right">{t('dashboard.tokens')}</th>
                    <th className="pb-2 text-right">{t('dashboard.actual')}</th>
                    <th className="pb-2 text-right">{t('dashboard.standard')}</th>
                  </tr>
                </thead>
                <tbody>
                  {models.map((model) => (
                    <tr key={model.model} className="border-t border-gray-100 dark:border-gray-700">
                      <td
                        className="max-w-[100px] truncate py-1.5 font-medium text-gray-900 dark:text-white"
                        title={model.model}
                      >
                        {model.model}
                      </td>
                      <td className="py-1.5 text-right text-gray-600 dark:text-gray-400">{formatNumber(model.requests)}</td>
                      <td className="py-1.5 text-right text-gray-600 dark:text-gray-400">{formatTokens(model.total_tokens)}</td>
                      <td className="py-1.5 text-right text-green-600 dark:text-green-400">${formatCost(model.actual_cost)}</td>
                      <td className="py-1.5 text-right text-gray-400 dark:text-gray-500">${formatCost(model.cost)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <TokenUsageTrend trendData={trend} loading={loading} />
      </div>
    </div>
  )
}
