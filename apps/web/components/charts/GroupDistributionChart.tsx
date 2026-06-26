'use client'

import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
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
import { getUserBreakdown, type UserBreakdownItem } from '@/lib/adminDashboard'
import type { GroupStat } from '@/lib/types'

ChartJS.register(ArcElement, Tooltip, Legend)

type DistributionMetric = 'tokens' | 'actual_cost'

interface GroupDistributionChartProps {
  groupStats: GroupStat[]
  loading?: boolean
  metric?: DistributionMetric
  showMetricToggle?: boolean
  startDate?: string
  endDate?: string
  filters?: Record<string, unknown>
  onUpdateMetric?: (value: DistributionMetric) => void
}

const chartColors = [
  '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
  '#ec4899', '#14b8a6', '#f97316', '#6366f1', '#84cc16',
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

export default function GroupDistributionChart({
  groupStats,
  loading = false,
  metric = 'tokens',
  showMetricToggle = false,
  startDate,
  endDate,
  filters = {},
  onUpdateMetric,
}: GroupDistributionChartProps) {
  const { t } = useI18n()
  const [expandedKey, setExpandedKey] = useState<string | null>(null)
  const [breakdownItems, setBreakdownItems] = useState<UserBreakdownItem[]>([])
  const [breakdownLoading, setBreakdownLoading] = useState(false)

  const displayGroupStats = useMemo(() => {
    if (!groupStats?.length) return []
    const metricKey = metric === 'actual_cost' ? 'actual_cost' : 'total_tokens'
    return [...groupStats].sort((a, b) => b[metricKey] - a[metricKey])
  }, [groupStats, metric])

  const chartData = useMemo(() => {
    if (!displayGroupStats.length) return null
    return {
      labels: displayGroupStats.map((g) => g.group_name || String(g.group_id)),
      datasets: [
        {
          data: displayGroupStats.map((g) => (metric === 'actual_cost' ? g.actual_cost : g.total_tokens)),
          backgroundColor: chartColors.slice(0, displayGroupStats.length),
          borderWidth: 0,
        },
      ],
    }
  }, [displayGroupStats, metric])

  const doughnutOptions = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (context: { raw: unknown; label?: string; dataset: { data: number[] } }) => {
              const value = context.raw as number
              const total = context.dataset.data.reduce((a, b) => a + b, 0)
              const percentage = total > 0 ? ((value / total) * 100).toFixed(1) : '0.0'
              const formattedValue = metric === 'actual_cost' ? `$${formatCost(value)}` : formatTokens(value)
              return `${context.label}: ${formattedValue} (${percentage}%)`
            },
          },
        },
      },
    }),
    [metric],
  )

  const toggleBreakdown = useCallback(
    async (groupId: number) => {
      const key = `group-${groupId}`
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
          group_id: groupId,
        })
        setBreakdownItems(res.users || [])
      } catch {
        setBreakdownItems([])
      } finally {
        setBreakdownLoading(false)
      }
    },
    [expandedKey, filters, startDate, endDate],
  )

  return (
    <div className="card p-4">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
          {t('admin.dashboard.groupDistribution')}
        </h3>
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
      </div>

      {loading ? (
        <div className="flex h-48 items-center justify-center">
          <LoadingSpinner />
        </div>
      ) : displayGroupStats.length > 0 && chartData ? (
        <div className="flex items-center gap-6">
          <div className="h-48 w-48">
            <Doughnut data={chartData} options={doughnutOptions} />
          </div>
          <div className="max-h-48 flex-1 overflow-y-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-gray-500 dark:text-gray-400">
                  <th className="pb-2 text-left">{t('admin.dashboard.group')}</th>
                  <th className="pb-2 text-right">{t('admin.dashboard.requests')}</th>
                  <th className="pb-2 text-right">{t('admin.dashboard.tokens')}</th>
                  <th className="pb-2 text-right">{t('admin.dashboard.actual')}</th>
                  <th className="pb-2 text-right">{t('admin.dashboard.accountCost')}</th>
                  <th className="pb-2 text-right">{t('admin.dashboard.standard')}</th>
                </tr>
              </thead>
              <tbody>
                {displayGroupStats.map((group) => (
                  <Fragment key={group.group_id}>
                    <tr
                      className={`border-t border-gray-100 transition-colors dark:border-gray-700 ${
                        group.group_id > 0 ? 'cursor-pointer hover:bg-gray-50 dark:hover:bg-dark-700/40' : ''
                      }`}
                      onClick={() => group.group_id > 0 && void toggleBreakdown(group.group_id)}
                    >
                      <td
                        className={`max-w-[100px] truncate py-1.5 font-medium ${
                          group.group_id > 0
                            ? 'text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300'
                            : 'text-gray-900 dark:text-white'
                        }`}
                        title={group.group_name || String(group.group_id)}
                      >
                        <span className="inline-flex items-center gap-1">
                          {group.group_id > 0 ? (
                            expandedKey === `group-${group.group_id}` ? (
                              <svg className="h-3 w-3 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                              </svg>
                            ) : (
                              <svg className="h-3 w-3 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                              </svg>
                            )
                          ) : null}
                          {group.group_name || t('admin.dashboard.noGroup')}
                        </span>
                      </td>
                      <td className="py-1.5 text-right text-gray-600 dark:text-gray-400">{formatNumber(group.requests)}</td>
                      <td className="py-1.5 text-right text-gray-600 dark:text-gray-400">{formatTokens(group.total_tokens)}</td>
                      <td className="py-1.5 text-right text-green-600 dark:text-green-400">${formatCost(group.actual_cost)}</td>
                      <td className="py-1.5 text-right text-orange-500 dark:text-orange-400">${formatCost(group.account_cost)}</td>
                      <td className="py-1.5 text-right text-gray-400 dark:text-gray-500">${formatCost(group.cost)}</td>
                    </tr>
                    {expandedKey === `group-${group.group_id}` ? (
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
      ) : (
        <div className="flex h-48 items-center justify-center text-sm text-gray-500 dark:text-gray-400">
          {t('admin.dashboard.noDataAvailable')}
        </div>
      )}
    </div>
  )
}
