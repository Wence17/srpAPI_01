'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
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
import { adminAccountsAPI } from '@/lib/adminAccounts'
import BaseDialog from '@/components/common/BaseDialog'
import LoadingSpinner from '@/components/common/LoadingSpinner'
import ModelDistributionChart from '@/components/charts/ModelDistributionChart'
import EndpointDistributionChart from '@/components/charts/EndpointDistributionChart'
import Icon from '@/components/icons/Icon'
import type { Account, AccountUsageStatsResponse } from '@/lib/types'

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
)

interface AccountStatsModalProps {
  show: boolean
  account: Account | null
  onClose: () => void
}

function formatCost(value: number): string {
  if (value >= 1000) return `${(value / 1000).toFixed(2)}K`
  if (value >= 1) return value.toFixed(2)
  if (value >= 0.01) return value.toFixed(3)
  return value.toFixed(4)
}

function formatNumber(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`
  if (value >= 1_000) return `${(value / 1_000).toFixed(2)}K`
  return value.toLocaleString()
}

function formatTokens(value: number): string {
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(2)}B`
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`
  if (value >= 1_000) return `${(value / 1_000).toFixed(2)}K`
  return value.toLocaleString()
}

function formatDuration(ms: number): string {
  if (ms >= 1000) return `${(ms / 1000).toFixed(2)}s`
  return `${Math.round(ms)}ms`
}

function useIsDarkMode(): boolean {
  const [isDarkMode, setIsDarkMode] = useState(false)

  useEffect(() => {
    const update = () => setIsDarkMode(document.documentElement.classList.contains('dark'))
    update()
    const observer = new MutationObserver(update)
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    return () => observer.disconnect()
  }, [])

  return isDarkMode
}

export default function AccountStatsModal({ show, account, onClose }: AccountStatsModalProps) {
  const { t } = useI18n()
  const isDarkMode = useIsDarkMode()
  const [loading, setLoading] = useState(false)
  const [stats, setStats] = useState<AccountUsageStatsResponse | null>(null)

  const chartColors = useMemo(
    () => ({
      text: isDarkMode ? '#e5e7eb' : '#374151',
      grid: isDarkMode ? '#374151' : '#e5e7eb',
    }),
    [isDarkMode],
  )

  const loadStats = useCallback(async () => {
    if (!account) return
    setLoading(true)
    try {
      setStats(await adminAccountsAPI.getStats(account.id, 30))
    } catch (error) {
      console.error('Failed to load account stats:', error)
      setStats(null)
    } finally {
      setLoading(false)
    }
  }, [account])

  useEffect(() => {
    if (show && account) {
      void loadStats()
    } else {
      setStats(null)
    }
  }, [show, account, loadStats])

  const trendChartData = useMemo(() => {
    if (!stats?.history?.length) return null
    return {
      labels: stats.history.map((h) => h.label),
      datasets: [
        {
          label: `${t('usage.accountBilled')} (USD)`,
          data: stats.history.map((h) => h.actual_cost),
          borderColor: '#3b82f6',
          backgroundColor: 'rgba(59, 130, 246, 0.1)',
          fill: true,
          tension: 0.3,
          yAxisID: 'y',
        },
        {
          label: `${t('usage.userBilled')} (USD)`,
          data: stats.history.map((h) => h.user_cost),
          borderColor: '#10b981',
          backgroundColor: 'rgba(16, 185, 129, 0.08)',
          fill: false,
          tension: 0.3,
          borderDash: [5, 5],
          yAxisID: 'y',
        },
        {
          label: t('admin.accounts.stats.requests'),
          data: stats.history.map((h) => h.requests),
          borderColor: '#f97316',
          backgroundColor: 'rgba(249, 115, 22, 0.1)',
          fill: false,
          tension: 0.3,
          yAxisID: 'y1',
        },
      ],
    }
  }, [stats, t])

  const lineChartOptions = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        intersect: false,
        mode: 'index' as const,
      },
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
            label: (context: { dataset: { label?: string }; raw: unknown }) => {
              const label = context.dataset.label || ''
              const value = context.raw as number
              if (label.includes('USD')) return `${label}: $${formatCost(value)}`
              return `${label}: ${formatNumber(value)}`
            },
          },
        },
      },
      scales: {
        x: {
          grid: { color: chartColors.grid },
          ticks: {
            color: chartColors.text,
            font: { size: 10 },
            maxRotation: 45,
            minRotation: 0,
          },
        },
        y: {
          type: 'linear' as const,
          display: true,
          position: 'left' as const,
          grid: { color: chartColors.grid },
          ticks: {
            color: '#3b82f6',
            font: { size: 10 },
            callback: (value: string | number) => `$${formatCost(Number(value))}`,
          },
          title: {
            display: true,
            text: `${t('usage.accountBilled')} (USD)`,
            color: '#3b82f6',
            font: { size: 11 },
          },
        },
        y1: {
          type: 'linear' as const,
          display: true,
          position: 'right' as const,
          grid: { drawOnChartArea: false },
          ticks: {
            color: '#f97316',
            font: { size: 10 },
            callback: (value: string | number) => formatNumber(Number(value)),
          },
          title: {
            display: true,
            text: t('admin.accounts.stats.requests'),
            color: '#f97316',
            font: { size: 11 },
          },
        },
      },
    }),
    [chartColors, t],
  )

  return (
    <BaseDialog
      show={show}
      title={t('admin.accounts.usageStatistics')}
      width="extra-wide"
      onClose={onClose}
      footer={
        <div className="flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-200 dark:bg-dark-600 dark:text-gray-300 dark:hover:bg-dark-500"
          >
            {t('common.close')}
          </button>
        </div>
      }
    >
      <div className="space-y-6">
        {account ? (
          <div className="flex items-center justify-between rounded-xl border border-primary-200 bg-gradient-to-r from-primary-50 to-primary-100 p-3 dark:border-primary-700/50 dark:from-primary-900/20 dark:to-primary-800/20">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-primary-500 to-primary-600">
                <Icon name="chartBar" size="md" className="text-white" />
              </div>
              <div>
                <div className="font-semibold text-gray-900 dark:text-gray-100">{account.name}</div>
                <div className="text-xs text-gray-500 dark:text-gray-400">
                  {t('admin.accounts.last30DaysUsage')}
                </div>
              </div>
            </div>
            <span
              className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                account.status === 'active'
                  ? 'bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-400'
                  : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'
              }`}
            >
              {account.status}
            </span>
          </div>
        ) : null}

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <LoadingSpinner />
          </div>
        ) : stats ? (
          <>
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <div className="card border-emerald-200 bg-gradient-to-br from-emerald-50 to-white p-4 dark:border-emerald-800/30 dark:from-emerald-900/10 dark:to-dark-700">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
                    {t('admin.accounts.stats.totalCost')}
                  </span>
                  <div className="rounded-lg bg-emerald-100 p-1.5 dark:bg-emerald-900/30">
                    <Icon name="dollar" size="sm" className="text-emerald-600 dark:text-emerald-400" />
                  </div>
                </div>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  ${formatCost(stats.summary.total_cost)}
                </p>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  {t('admin.accounts.stats.accumulatedCost')}{' '}
                  <span className="text-gray-400 dark:text-gray-500">
                    ({t('usage.userBilled')}: ${formatCost(stats.summary.total_user_cost)} ·{' '}
                    {t('admin.accounts.stats.standardCost')}: $
                    {formatCost(stats.summary.total_standard_cost)})
                  </span>
                </p>
              </div>

              <div className="card border-blue-200 bg-gradient-to-br from-blue-50 to-white p-4 dark:border-blue-800/30 dark:from-blue-900/10 dark:to-dark-700">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
                    {t('admin.accounts.stats.totalRequests')}
                  </span>
                  <div className="rounded-lg bg-blue-100 p-1.5 dark:bg-blue-900/30">
                    <Icon name="bolt" size="sm" className="text-blue-600 dark:text-blue-400" />
                  </div>
                </div>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  {formatNumber(stats.summary.total_requests)}
                </p>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  {t('admin.accounts.stats.totalCalls')}
                </p>
              </div>

              <div className="card border-amber-200 bg-gradient-to-br from-amber-50 to-white p-4 dark:border-amber-800/30 dark:from-amber-900/10 dark:to-dark-700">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
                    {t('admin.accounts.stats.avgDailyCost')}
                  </span>
                  <div className="rounded-lg bg-amber-100 p-1.5 dark:bg-amber-900/30">
                    <Icon name="calculator" size="sm" className="text-amber-600 dark:text-amber-400" />
                  </div>
                </div>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  ${formatCost(stats.summary.avg_daily_cost)}
                </p>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  {t('admin.accounts.stats.basedOnActualDays', {
                    days: stats.summary.actual_days_used,
                  })}{' '}
                  <span className="text-gray-400 dark:text-gray-500">
                    ({t('usage.userBilled')}: ${formatCost(stats.summary.avg_daily_user_cost)})
                  </span>
                </p>
              </div>

              <div className="card border-purple-200 bg-gradient-to-br from-purple-50 to-white p-4 dark:border-purple-800/30 dark:from-purple-900/10 dark:to-dark-700">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
                    {t('admin.accounts.stats.avgDailyRequests')}
                  </span>
                  <div className="rounded-lg bg-purple-100 p-1.5 dark:bg-purple-900/30">
                    <svg
                      className="h-4 w-4 text-purple-600 dark:text-purple-400"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z"
                      />
                    </svg>
                  </div>
                </div>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  {formatNumber(Math.round(stats.summary.avg_daily_requests))}
                </p>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  {t('admin.accounts.stats.avgDailyUsage')}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              <div className="card p-4">
                <div className="mb-3 flex items-center gap-2">
                  <div className="rounded-lg bg-cyan-100 p-1.5 dark:bg-cyan-900/30">
                    <Icon name="clock" size="sm" className="text-cyan-600 dark:text-cyan-400" />
                  </div>
                  <span className="text-sm font-semibold text-gray-900 dark:text-white">
                    {t('admin.accounts.stats.todayOverview')}
                  </span>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-500 dark:text-gray-400">{t('usage.accountBilled')}</span>
                    <span className="text-sm font-semibold text-gray-900 dark:text-white">
                      ${formatCost(stats.summary.today?.cost || 0)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-500 dark:text-gray-400">{t('usage.userBilled')}</span>
                    <span className="text-sm font-semibold text-gray-900 dark:text-white">
                      ${formatCost(stats.summary.today?.user_cost || 0)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      {t('admin.accounts.stats.requests')}
                    </span>
                    <span className="text-sm font-semibold text-gray-900 dark:text-white">
                      {formatNumber(stats.summary.today?.requests || 0)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      {t('admin.accounts.stats.tokens')}
                    </span>
                    <span className="text-sm font-semibold text-gray-900 dark:text-white">
                      {formatTokens(stats.summary.today?.tokens || 0)}
                    </span>
                  </div>
                </div>
              </div>

              <div className="card p-4">
                <div className="mb-3 flex items-center gap-2">
                  <div className="rounded-lg bg-orange-100 p-1.5 dark:bg-orange-900/30">
                    <Icon name="fire" size="sm" className="text-orange-600 dark:text-orange-400" />
                  </div>
                  <span className="text-sm font-semibold text-gray-900 dark:text-white">
                    {t('admin.accounts.stats.highestCostDay')}
                  </span>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      {t('admin.accounts.stats.date')}
                    </span>
                    <span className="text-sm font-semibold text-gray-900 dark:text-white">
                      {stats.summary.highest_cost_day?.label || '-'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-500 dark:text-gray-400">{t('usage.accountBilled')}</span>
                    <span className="text-sm font-semibold text-orange-600 dark:text-orange-400">
                      ${formatCost(stats.summary.highest_cost_day?.cost || 0)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-500 dark:text-gray-400">{t('usage.userBilled')}</span>
                    <span className="text-sm font-semibold text-gray-900 dark:text-white">
                      ${formatCost(stats.summary.highest_cost_day?.user_cost || 0)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      {t('admin.accounts.stats.requests')}
                    </span>
                    <span className="text-sm font-semibold text-gray-900 dark:text-white">
                      {formatNumber(stats.summary.highest_cost_day?.requests || 0)}
                    </span>
                  </div>
                </div>
              </div>

              <div className="card p-4">
                <div className="mb-3 flex items-center gap-2">
                  <div className="rounded-lg bg-indigo-100 p-1.5 dark:bg-indigo-900/30">
                    <Icon name="trendingUp" size="sm" className="text-indigo-600 dark:text-indigo-400" />
                  </div>
                  <span className="text-sm font-semibold text-gray-900 dark:text-white">
                    {t('admin.accounts.stats.highestRequestDay')}
                  </span>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      {t('admin.accounts.stats.date')}
                    </span>
                    <span className="text-sm font-semibold text-gray-900 dark:text-white">
                      {stats.summary.highest_request_day?.label || '-'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      {t('admin.accounts.stats.requests')}
                    </span>
                    <span className="text-sm font-semibold text-indigo-600 dark:text-indigo-400">
                      {formatNumber(stats.summary.highest_request_day?.requests || 0)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-500 dark:text-gray-400">{t('usage.accountBilled')}</span>
                    <span className="text-sm font-semibold text-gray-900 dark:text-white">
                      ${formatCost(stats.summary.highest_request_day?.cost || 0)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-500 dark:text-gray-400">{t('usage.userBilled')}</span>
                    <span className="text-sm font-semibold text-gray-900 dark:text-white">
                      ${formatCost(stats.summary.highest_request_day?.user_cost || 0)}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              <div className="card p-4">
                <div className="mb-3 flex items-center gap-2">
                  <div className="rounded-lg bg-teal-100 p-1.5 dark:bg-teal-900/30">
                    <Icon name="cube" size="sm" className="text-teal-600 dark:text-teal-400" />
                  </div>
                  <span className="text-sm font-semibold text-gray-900 dark:text-white">
                    {t('admin.accounts.stats.accumulatedTokens')}
                  </span>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      {t('admin.accounts.stats.totalTokens')}
                    </span>
                    <span className="text-sm font-semibold text-gray-900 dark:text-white">
                      {formatTokens(stats.summary.total_tokens)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      {t('admin.accounts.stats.dailyAvgTokens')}
                    </span>
                    <span className="text-sm font-semibold text-gray-900 dark:text-white">
                      {formatTokens(Math.round(stats.summary.avg_daily_tokens))}
                    </span>
                  </div>
                </div>
              </div>

              <div className="card p-4">
                <div className="mb-3 flex items-center gap-2">
                  <div className="rounded-lg bg-rose-100 p-1.5 dark:bg-rose-900/30">
                    <Icon name="bolt" size="sm" className="text-rose-600 dark:text-rose-400" />
                  </div>
                  <span className="text-sm font-semibold text-gray-900 dark:text-white">
                    {t('admin.accounts.stats.performance')}
                  </span>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      {t('admin.accounts.stats.avgResponseTime')}
                    </span>
                    <span className="text-sm font-semibold text-gray-900 dark:text-white">
                      {formatDuration(stats.summary.avg_duration_ms)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      {t('admin.accounts.stats.daysActive')}
                    </span>
                    <span className="text-sm font-semibold text-gray-900 dark:text-white">
                      {stats.summary.actual_days_used} / {stats.summary.days}
                    </span>
                  </div>
                </div>
              </div>

              <div className="card p-4">
                <div className="mb-3 flex items-center gap-2">
                  <div className="rounded-lg bg-lime-100 p-1.5 dark:bg-lime-900/30">
                    <Icon name="clipboard" size="sm" className="text-lime-600 dark:text-lime-400" />
                  </div>
                  <span className="text-sm font-semibold text-gray-900 dark:text-white">
                    {t('admin.accounts.stats.recentActivity')}
                  </span>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      {t('admin.accounts.stats.todayRequests')}
                    </span>
                    <span className="text-sm font-semibold text-gray-900 dark:text-white">
                      {formatNumber(stats.summary.today?.requests || 0)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      {t('admin.accounts.stats.todayTokens')}
                    </span>
                    <span className="text-sm font-semibold text-gray-900 dark:text-white">
                      {formatTokens(stats.summary.today?.tokens || 0)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      {t('admin.accounts.stats.todayCost')}
                    </span>
                    <span className="text-sm font-semibold text-gray-900 dark:text-white">
                      ${formatCost(stats.summary.today?.cost || 0)}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="card p-4">
              <h3 className="mb-4 text-sm font-semibold text-gray-900 dark:text-white">
                {t('admin.accounts.stats.usageTrend')}
              </h3>
              <div className="h-64">
                {trendChartData ? (
                  <Line data={trendChartData} options={lineChartOptions} />
                ) : (
                  <div className="flex h-full items-center justify-center text-sm text-gray-500 dark:text-gray-400">
                    {t('admin.dashboard.noDataAvailable')}
                  </div>
                )}
              </div>
            </div>

            <ModelDistributionChart modelStats={stats.models} loading={false} />
            <EndpointDistributionChart
              endpointStats={stats.endpoints || []}
              loading={false}
              title={t('usage.inboundEndpoint')}
            />
            <EndpointDistributionChart
              endpointStats={stats.upstream_endpoints || []}
              loading={false}
              title={t('usage.upstreamEndpoint')}
            />
          </>
        ) : (
          <div className="flex flex-col items-center justify-center py-12 text-gray-500 dark:text-gray-400">
            <Icon name="chartBar" size="xl" className="mb-4 h-12 w-12" />
            <p className="text-sm">{t('admin.accounts.stats.noData')}</p>
          </div>
        )}
      </div>
    </BaseDialog>
  )
}
