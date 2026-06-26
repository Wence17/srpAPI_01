'use client'

import { Fragment, useCallback, useMemo, useState } from 'react'
import {
  Chart as ChartJS,
  ArcElement,
  Tooltip,
  Legend,
} from 'chart.js'
import { Doughnut } from 'react-chartjs-2'
import { useI18n } from '@/lib/i18n'
import LoadingSpinner from '@/components/common/LoadingSpinner'
import UserBreakdownSubTable from '@/components/charts/UserBreakdownSubTable'
import {
  getUserBreakdown,
  type ModelStat,
  type UserBreakdownItem,
  type UserSpendingRankingItem,
} from '@/lib/adminDashboard'

ChartJS.register(ArcElement, Tooltip, Legend)

type DistributionMetric = 'tokens' | 'actual_cost'
type ModelSource = 'requested' | 'upstream' | 'mapping'
type RankingDisplayItem = UserSpendingRankingItem & { isOther?: boolean }

interface ModelDistributionChartProps {
  modelStats: ModelStat[]
  upstreamModelStats?: ModelStat[]
  mappingModelStats?: ModelStat[]
  source?: ModelSource
  enableRankingView?: boolean
  rankingItems?: UserSpendingRankingItem[]
  rankingTotalActualCost?: number
  rankingTotalRequests?: number
  rankingTotalTokens?: number
  loading?: boolean
  metric?: DistributionMetric
  showSourceToggle?: boolean
  showMetricToggle?: boolean
  rankingLoading?: boolean
  rankingError?: boolean
  startDate?: string
  endDate?: string
  filters?: Record<string, unknown>
  onUpdateMetric?: (value: DistributionMetric) => void
  onUpdateSource?: (value: ModelSource) => void
  onRankingClick?: (item: UserSpendingRankingItem) => void
}

const chartColors = [
  '#3b82f6',
  '#10b981',
  '#f59e0b',
  '#ef4444',
  '#8b5cf6',
  '#ec4899',
  '#14b8a6',
  '#f97316',
  '#6366f1',
  '#84cc16',
  '#06b6d4',
  '#a855f7',
]

function formatTokens(value: number): string {
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(2)}B`
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`
  if (value >= 1_000) return `${(value / 1_000).toFixed(2)}K`
  return value.toLocaleString()
}

function formatNumber(value: number): string {
  return value.toLocaleString()
}

function formatCost(value: number): string {
  if (value >= 1000) return `${(value / 1000).toFixed(2)}K`
  if (value >= 1) return value.toFixed(2)
  if (value >= 0.01) return value.toFixed(3)
  return value.toFixed(4)
}

export default function ModelDistributionChart({
  modelStats,
  upstreamModelStats = [],
  mappingModelStats = [],
  source = 'requested',
  enableRankingView = false,
  rankingItems = [],
  rankingTotalActualCost = 0,
  rankingTotalRequests = 0,
  rankingTotalTokens = 0,
  loading = false,
  metric = 'tokens',
  showSourceToggle = false,
  showMetricToggle = false,
  rankingLoading = false,
  rankingError = false,
  startDate,
  endDate,
  filters,
  onUpdateMetric,
  onUpdateSource,
  onRankingClick,
}: ModelDistributionChartProps) {
  const { t } = useI18n()
  const [activeView, setActiveView] = useState<'model_distribution' | 'spending_ranking'>('model_distribution')
  const [expandedKey, setExpandedKey] = useState<string | null>(null)
  const [breakdownItems, setBreakdownItems] = useState<UserBreakdownItem[]>([])
  const [breakdownLoading, setBreakdownLoading] = useState(false)

  const displayModelStats = useMemo(() => {
    const sourceStats =
      source === 'upstream'
        ? upstreamModelStats
        : source === 'mapping'
          ? mappingModelStats
          : modelStats
    if (!sourceStats?.length) return []

    const metricKey = metric === 'actual_cost' ? 'actual_cost' : 'total_tokens'
    return [...sourceStats].sort((a, b) => b[metricKey] - a[metricKey])
  }, [source, upstreamModelStats, mappingModelStats, modelStats, metric])

  const getRankingUserLabel = useCallback(
    (item: UserSpendingRankingItem): string => {
      if (item.email) return item.email
      return t('admin.redeem.userPrefix', { id: item.user_id })
    },
    [t],
  )

  const otherRankingItem = useMemo<RankingDisplayItem | null>(() => {
    if (!rankingItems?.length) return null

    const rankedActualCost = rankingItems.reduce((sum, item) => sum + item.actual_cost, 0)
    const rankedRequests = rankingItems.reduce((sum, item) => sum + item.requests, 0)
    const rankedTokens = rankingItems.reduce((sum, item) => sum + item.tokens, 0)

    const otherActualCost = Math.max((rankingTotalActualCost || 0) - rankedActualCost, 0)
    const otherRequests = Math.max((rankingTotalRequests || 0) - rankedRequests, 0)
    const otherTokens = Math.max((rankingTotalTokens || 0) - rankedTokens, 0)

    if (otherActualCost <= 0.000001 && otherRequests <= 0 && otherTokens <= 0) return null

    return {
      user_id: 0,
      email: '',
      actual_cost: otherActualCost,
      requests: otherRequests,
      tokens: otherTokens,
      isOther: true,
    }
  }, [rankingItems, rankingTotalActualCost, rankingTotalRequests, rankingTotalTokens])

  const rankingDisplayItems = useMemo<RankingDisplayItem[]>(() => {
    if (!rankingItems?.length) return []
    return otherRankingItem ? [...rankingItems, otherRankingItem] : [...rankingItems]
  }, [rankingItems, otherRankingItem])

  const chartData = useMemo(() => {
    if (!displayModelStats.length) return null

    return {
      labels: displayModelStats.map((m) => m.model),
      datasets: [
        {
          data: displayModelStats.map((m) => (metric === 'actual_cost' ? m.actual_cost : m.total_tokens)),
          backgroundColor: chartColors.slice(0, displayModelStats.length),
          borderWidth: 0,
        },
      ],
    }
  }, [displayModelStats, metric])

  const rankingChartData = useMemo(() => {
    if (!rankingItems?.length) return null

    const labels = rankingItems.map((item, index) => `#${index + 1} ${getRankingUserLabel(item)}`)
    const data = rankingItems.map((item) => item.actual_cost)
    const backgroundColor = chartColors.slice(0, rankingItems.length)

    if (otherRankingItem) {
      labels.push(t('admin.dashboard.spendingRankingOther'))
      data.push(otherRankingItem.actual_cost)
      backgroundColor.push('#94a3b8')
    }

    return {
      labels,
      datasets: [
        {
          data,
          backgroundColor,
          borderWidth: 0,
        },
      ],
    }
  }, [rankingItems, otherRankingItem, getRankingUserLabel, t])

  const doughnutOptions = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (context: { label?: string; raw: unknown; dataset: { data: number[] } }) => {
              const value = context.raw as number
              const total = context.dataset.data.reduce((a, b) => a + b, 0)
              const percentage = total > 0 ? ((value / total) * 100).toFixed(1) : '0.0'
              const formattedValue =
                metric === 'actual_cost' ? `$${formatCost(value)}` : formatTokens(value)
              return `${context.label}: ${formattedValue} (${percentage}%)`
            },
          },
        },
      },
    }),
    [metric],
  )

  const rankingDoughnutOptions = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (context: { label?: string; raw: unknown; dataset: { data: number[] } }) => {
              const value = context.raw as number
              const total = context.dataset.data.reduce((a, b) => a + b, 0)
              const percentage = total > 0 ? ((value / total) * 100).toFixed(1) : '0.0'
              return `${context.label}: $${formatCost(value)} (${percentage}%)`
            },
          },
        },
      },
    }),
    [],
  )

  const getRankingRowLabel = (item: RankingDisplayItem): string => {
    if (item.isOther) return t('admin.dashboard.spendingRankingOther')
    return getRankingUserLabel(item)
  }

  const toggleBreakdown = async (type: string, id: string) => {
    const key = `${type}-${id}`
    if (expandedKey === key) {
      setExpandedKey(null)
      return
    }
    setExpandedKey(key)
    setBreakdownLoading(true)
    setBreakdownItems([])
    try {
      const res = await getUserBreakdown({
        ...filters,
        start_date: startDate,
        end_date: endDate,
        model: id,
        model_source: source,
      })
      setBreakdownItems(res.users || [])
    } catch {
      setBreakdownItems([])
    } finally {
      setBreakdownLoading(false)
    }
  }

  return (
    <div className="card p-4">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
          {!enableRankingView || activeView === 'model_distribution'
            ? t('admin.dashboard.modelDistribution')
            : t('admin.dashboard.spendingRankingTitle')}
        </h3>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {showSourceToggle ? (
            <div className="inline-flex rounded-lg border border-gray-200 bg-gray-50 p-0.5 dark:border-gray-700 dark:bg-dark-800">
              {(['requested', 'upstream', 'mapping'] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                    source === value
                      ? 'bg-white text-gray-900 shadow-sm dark:bg-dark-700 dark:text-white'
                      : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
                  }`}
                  onClick={() => onUpdateSource?.(value)}
                >
                  {value === 'requested'
                    ? t('usage.requestedModel')
                    : value === 'upstream'
                      ? t('usage.upstreamModel')
                      : t('usage.mapping')}
                </button>
              ))}
            </div>
          ) : null}
          {showMetricToggle ? (
            <div className="inline-flex rounded-lg border border-gray-200 bg-gray-50 p-0.5 dark:border-gray-700 dark:bg-dark-800">
              <button
                type="button"
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                  metric === 'tokens'
                    ? 'bg-white text-gray-900 shadow-sm dark:bg-dark-700 dark:text-white'
                    : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
                }`}
                onClick={() => onUpdateMetric?.('tokens')}
              >
                {t('admin.dashboard.metricTokens')}
              </button>
              <button
                type="button"
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                  metric === 'actual_cost'
                    ? 'bg-white text-gray-900 shadow-sm dark:bg-dark-700 dark:text-white'
                    : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
                }`}
                onClick={() => onUpdateMetric?.('actual_cost')}
              >
                {t('admin.dashboard.metricActualCost')}
              </button>
            </div>
          ) : null}
          {enableRankingView ? (
            <div className="inline-flex rounded-lg bg-gray-100 p-1 dark:bg-dark-800">
              <button
                type="button"
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                  activeView === 'model_distribution'
                    ? 'bg-white text-gray-900 shadow-sm dark:bg-dark-700 dark:text-white'
                    : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
                }`}
                onClick={() => setActiveView('model_distribution')}
              >
                {t('admin.dashboard.viewModelDistribution')}
              </button>
              <button
                type="button"
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                  activeView === 'spending_ranking'
                    ? 'bg-white text-gray-900 shadow-sm dark:bg-dark-700 dark:text-white'
                    : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
                }`}
                onClick={() => setActiveView('spending_ranking')}
              >
                {t('admin.dashboard.viewSpendingRanking')}
              </button>
            </div>
          ) : null}
        </div>
      </div>

      {activeView === 'model_distribution' && loading ? (
        <div className="flex h-48 items-center justify-center">
          <LoadingSpinner />
        </div>
      ) : activeView === 'model_distribution' && displayModelStats.length > 0 && chartData ? (
        <div className="flex items-center gap-6">
          <div className="h-48 w-48">
            <Doughnut data={chartData} options={doughnutOptions} />
          </div>
          <div className="max-h-48 flex-1 overflow-y-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-gray-500 dark:text-gray-400">
                  <th className="pb-2 text-left">{t('admin.dashboard.model')}</th>
                  <th className="pb-2 text-right">{t('admin.dashboard.requests')}</th>
                  <th className="pb-2 text-right">{t('admin.dashboard.tokens')}</th>
                  <th className="pb-2 text-right">{t('admin.dashboard.actual')}</th>
                  <th className="pb-2 text-right">{t('admin.dashboard.accountCost')}</th>
                  <th className="pb-2 text-right">{t('admin.dashboard.standard')}</th>
                </tr>
              </thead>
              <tbody>
                {displayModelStats.map((model) => (
                  <Fragment key={model.model}>
                    <tr
                      className="cursor-pointer border-t border-gray-100 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-dark-700/40"
                      onClick={() => toggleBreakdown('model', model.model)}
                    >
                      <td
                        className="max-w-[100px] truncate py-1.5 font-medium text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
                        title={model.model}
                      >
                        <span className="inline-flex items-center gap-1">
                          {expandedKey === `model-${model.model}` ? (
                            <svg className="h-3 w-3 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                            </svg>
                          ) : (
                            <svg className="h-3 w-3 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                            </svg>
                          )}
                          {model.model}
                        </span>
                      </td>
                      <td className="py-1.5 text-right text-gray-600 dark:text-gray-400">
                        {formatNumber(model.requests)}
                      </td>
                      <td className="py-1.5 text-right text-gray-600 dark:text-gray-400">
                        {formatTokens(model.total_tokens)}
                      </td>
                      <td className="py-1.5 text-right text-green-600 dark:text-green-400">
                        ${formatCost(model.actual_cost)}
                      </td>
                      <td className="py-1.5 text-right text-orange-500 dark:text-orange-400">
                        ${formatCost(model.account_cost ?? 0)}
                      </td>
                      <td className="py-1.5 text-right text-gray-400 dark:text-gray-500">
                        ${formatCost(model.cost)}
                      </td>
                    </tr>
                    {expandedKey === `model-${model.model}` ? (
                      <tr>
                        <td colSpan={6} className="p-0">
                          <UserBreakdownSubTable items={breakdownItems} loading={breakdownLoading} />
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : activeView === 'model_distribution' ? (
        <div className="flex h-48 items-center justify-center text-sm text-gray-500 dark:text-gray-400">
          {t('admin.dashboard.noDataAvailable')}
        </div>
      ) : rankingLoading ? (
        <div className="flex h-48 items-center justify-center">
          <LoadingSpinner />
        </div>
      ) : rankingError ? (
        <div className="flex h-48 items-center justify-center text-sm text-gray-500 dark:text-gray-400">
          {t('admin.dashboard.failedToLoad')}
        </div>
      ) : rankingDisplayItems.length > 0 && rankingChartData ? (
        <div className="flex items-center gap-6">
          <div className="h-48 w-48">
            <Doughnut data={rankingChartData} options={rankingDoughnutOptions} />
          </div>
          <div className="max-h-48 flex-1 overflow-y-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-gray-500 dark:text-gray-400">
                  <th className="pb-2 text-left">{t('admin.dashboard.spendingRankingUser')}</th>
                  <th className="pb-2 text-right">{t('admin.dashboard.spendingRankingRequests')}</th>
                  <th className="pb-2 text-right">{t('admin.dashboard.spendingRankingTokens')}</th>
                  <th className="pb-2 text-right">{t('admin.dashboard.spendingRankingSpend')}</th>
                </tr>
              </thead>
              <tbody>
                {rankingDisplayItems.map((item, index) => (
                  <tr
                    key={item.isOther ? 'others' : `${item.user_id}-${index}`}
                    className={`border-t border-gray-100 transition-colors dark:border-gray-700 ${
                      item.isOther
                        ? 'bg-gray-50/70 dark:bg-dark-700/20'
                        : 'cursor-pointer hover:bg-gray-50 dark:hover:bg-dark-700/40'
                    }`}
                    onClick={() => {
                      if (!item.isOther) onRankingClick?.(item)
                    }}
                  >
                    <td className="py-1.5">
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="shrink-0 text-[11px] font-semibold text-gray-500 dark:text-gray-400">
                          {item.isOther ? 'Σ' : `#${index + 1}`}
                        </span>
                        <span
                          className="block max-w-[140px] truncate font-medium text-gray-900 dark:text-white"
                          title={getRankingRowLabel(item)}
                        >
                          {getRankingRowLabel(item)}
                        </span>
                      </div>
                    </td>
                    <td className="py-1.5 text-right text-gray-600 dark:text-gray-400">
                      {formatNumber(item.requests)}
                    </td>
                    <td className="py-1.5 text-right text-gray-600 dark:text-gray-400">
                      {formatTokens(item.tokens)}
                    </td>
                    <td className="py-1.5 text-right text-green-600 dark:text-green-400">
                      ${formatCost(item.actual_cost)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="flex h-48 items-center justify-center text-sm text-gray-500 dark:text-gray-400">
          {t('admin.dashboard.noDataAvailable')}
        </div>
      )}
    </div>
  )
}
