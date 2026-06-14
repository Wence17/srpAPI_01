'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend,
  Filler,
  type ChartOptions,
} from 'chart.js'
import { Line } from 'react-chartjs-2'
import AppLayout from '@/components/layout/AppLayout'
import LoadingSpinner from '@/components/common/LoadingSpinner'
import Icon from '@/components/icons/Icon'
import DateRangePicker from '@/components/common/DateRangePicker'
import Select from '@/components/common/Select'
import ModelDistributionChart from '@/components/charts/ModelDistributionChart'
import TokenUsageTrend from '@/components/charts/TokenUsageTrend'
import { useI18n } from '@/lib/i18n'
import { useApp } from '@/context/AppContext'
import { useAuth } from '@/context/AuthContext'
import {
  getSnapshotV2,
  getUserSpendingRanking,
  getUserUsageTrend,
  type AdminDashboardStats,
  type ModelStat,
  type TrendDataPoint,
  type UserSpendingRankingItem,
  type UserUsageTrendPoint,
} from '@/lib/adminDashboard'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend, Filler)

const rankingLimit = 12

function formatLocalDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function getLast24HoursRangeDates(): { start: string; end: string } {
  const end = new Date()
  const start = new Date(end.getTime() - 24 * 60 * 60 * 1000)
  return {
    start: formatLocalDate(start),
    end: formatLocalDate(end),
  }
}

function formatTokens(value: number | undefined): string {
  if (value === undefined || value === null) return '0'
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

function formatDuration(ms: number): string {
  if (ms >= 1000) return `${(ms / 1000).toFixed(2)}s`
  return `${Math.round(ms)}ms`
}

export default function AdminDashboardPage() {
  const { t } = useI18n()
  const appStore = useApp()
  useAuth()

  const router = useRouter()
  const defaultRange = getLast24HoursRangeDates()

  const [stats, setStats] = useState<AdminDashboardStats | null>(null)
  const [loading, setLoading] = useState(false)
  const [chartsLoading, setChartsLoading] = useState(false)
  const [userTrendLoading, setUserTrendLoading] = useState(false)
  const [rankingLoading, setRankingLoading] = useState(false)
  const [rankingError, setRankingError] = useState(false)

  const [trendData, setTrendData] = useState<TrendDataPoint[]>([])
  const [modelStats, setModelStats] = useState<ModelStat[]>([])
  const [userTrend, setUserTrend] = useState<UserUsageTrendPoint[]>([])
  const [rankingItems, setRankingItems] = useState<UserSpendingRankingItem[]>([])
  const [rankingTotalActualCost, setRankingTotalActualCost] = useState(0)
  const [rankingTotalRequests, setRankingTotalRequests] = useState(0)
  const [rankingTotalTokens, setRankingTotalTokens] = useState(0)

  const chartLoadSeq = useRef(0)
  const usersTrendLoadSeq = useRef(0)
  const rankingLoadSeq = useRef(0)
  const statsRef = useRef<AdminDashboardStats | null>(null)
  statsRef.current = stats

  const [granularity, setGranularity] = useState<'day' | 'hour'>('hour')
  const [startDate, setStartDate] = useState(defaultRange.start)
  const [endDate, setEndDate] = useState(defaultRange.end)

  const granularityOptions = useMemo(
    () => [
      { value: 'day', label: t('admin.dashboard.day') },
      { value: 'hour', label: t('admin.dashboard.hour') },
    ],
    [t],
  )

  const isDarkMode =
    typeof document !== 'undefined' && document.documentElement.classList.contains('dark')

  const chartColors = useMemo(
    () => ({
      text: isDarkMode ? '#e5e7eb' : '#374151',
      grid: isDarkMode ? '#374151' : '#e5e7eb',
    }),
    [isDarkMode],
  )

  const lineOptions = useMemo<ChartOptions<'line'>>(
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
          itemSort: (a, b) => {
            const aValue = typeof a?.raw === 'number' ? a.raw : Number(a?.parsed?.y ?? 0)
            const bValue = typeof b?.raw === 'number' ? b.raw : Number(b?.parsed?.y ?? 0)
            return bValue - aValue
          },
          callbacks: {
            label: (context) =>
              `${context.dataset.label}: ${formatTokens(Number(context.raw))}`,
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
      },
    }),
    [chartColors],
  )

  const userTrendChartData = useMemo(() => {
    if (!userTrend?.length) return null

    const getDisplayName = (point: UserUsageTrendPoint): string => {
      const username = point.username?.trim()
      if (username) return username

      const email = point.email?.trim()
      if (email) return email

      return t('admin.redeem.userPrefix', { id: point.user_id })
    }

    const userGroups = new Map<number, { name: string; data: Map<string, number> }>()
    const allDates = new Set<string>()

    userTrend.forEach((point) => {
      allDates.add(point.date)
      const key = point.user_id
      if (!userGroups.has(key)) {
        userGroups.set(key, { name: getDisplayName(point), data: new Map() })
      }
      userGroups.get(key)!.data.set(point.date, point.tokens)
    })

    const sortedDates = Array.from(allDates).sort()
    const colors = [
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

    const datasets = Array.from(userGroups.values()).map((group, idx) => ({
      label: group.name,
      data: sortedDates.map((date) => group.data.get(date) || 0),
      borderColor: colors[idx % colors.length],
      backgroundColor: `${colors[idx % colors.length]}20`,
      fill: false,
      tension: 0.3,
    }))

    return {
      labels: sortedDates,
      datasets,
    }
  }, [userTrend, t])

  const goToUserUsage = useCallback(
    (item: UserSpendingRankingItem) => {
      router.push(
        `/admin/usage?user_id=${item.user_id}&start_date=${startDate}&end_date=${endDate}`,
      )
    },
    [router, startDate, endDate],
  )

  type ChartQuery = {
    start_date: string
    end_date: string
    granularity: 'day' | 'hour'
  }

  const loadDashboardSnapshot = useCallback(
    async (includeStats: boolean, query?: ChartQuery) => {
      const currentSeq = ++chartLoadSeq.current
      const chartQuery = query ?? {
        start_date: startDate,
        end_date: endDate,
        granularity,
      }
      if (includeStats && !statsRef.current) {
        setLoading(true)
      }
      setChartsLoading(true)
      try {
        const response = await getSnapshotV2({
          start_date: chartQuery.start_date,
          end_date: chartQuery.end_date,
          granularity: chartQuery.granularity,
          include_stats: includeStats,
          include_trend: true,
          include_model_stats: true,
          include_group_stats: false,
          include_users_trend: false,
        })
        if (currentSeq !== chartLoadSeq.current) return
        if (includeStats && response.stats) {
          setStats(response.stats)
        }
        setTrendData(response.trend || [])
        setModelStats(response.models || [])
      } catch (error) {
        if (currentSeq !== chartLoadSeq.current) return
        appStore.showError(t('admin.dashboard.failedToLoad'))
        console.error('Error loading dashboard snapshot:', error)
      } finally {
        if (currentSeq === chartLoadSeq.current) {
          setLoading(false)
          setChartsLoading(false)
        }
      }
    },
    [startDate, endDate, granularity, appStore, t],
  )

  const loadUsersTrend = useCallback(async (query?: ChartQuery) => {
    const currentSeq = ++usersTrendLoadSeq.current
    const chartQuery = query ?? {
      start_date: startDate,
      end_date: endDate,
      granularity,
    }
    setUserTrendLoading(true)
    try {
      const response = await getUserUsageTrend({
        start_date: chartQuery.start_date,
        end_date: chartQuery.end_date,
        granularity: chartQuery.granularity,
        limit: 12,
      })
      if (currentSeq !== usersTrendLoadSeq.current) return
      setUserTrend(response.trend || [])
    } catch (error) {
      if (currentSeq !== usersTrendLoadSeq.current) return
      console.error('Error loading users trend:', error)
      setUserTrend([])
    } finally {
      if (currentSeq === usersTrendLoadSeq.current) {
        setUserTrendLoading(false)
      }
    }
  }, [startDate, endDate, granularity])

  const loadUserSpendingRanking = useCallback(async (query?: Pick<ChartQuery, 'start_date' | 'end_date'>) => {
    const currentSeq = ++rankingLoadSeq.current
    const chartQuery = query ?? {
      start_date: startDate,
      end_date: endDate,
    }
    setRankingLoading(true)
    setRankingError(false)
    try {
      const response = await getUserSpendingRanking({
        start_date: chartQuery.start_date,
        end_date: chartQuery.end_date,
        limit: rankingLimit,
      })
      if (currentSeq !== rankingLoadSeq.current) return
      setRankingItems(response.ranking || [])
      setRankingTotalActualCost(response.total_actual_cost || 0)
      setRankingTotalRequests(response.total_requests || 0)
      setRankingTotalTokens(response.total_tokens || 0)
    } catch (error) {
      if (currentSeq !== rankingLoadSeq.current) return
      console.error('Error loading user spending ranking:', error)
      setRankingItems([])
      setRankingTotalActualCost(0)
      setRankingTotalRequests(0)
      setRankingTotalTokens(0)
      setRankingError(true)
    } finally {
      if (currentSeq === rankingLoadSeq.current) {
        setRankingLoading(false)
      }
    }
  }, [startDate, endDate])

  const loadDashboardStats = useCallback(async () => {
    await Promise.all([
      loadDashboardSnapshot(true),
      loadUsersTrend(),
      loadUserSpendingRanking(),
    ])
  }, [loadDashboardSnapshot, loadUsersTrend, loadUserSpendingRanking])

  const loadChartData = useCallback(
    async (query?: ChartQuery) => {
      await Promise.all([
        loadDashboardSnapshot(false, query),
        loadUsersTrend(query),
        loadUserSpendingRanking(query),
      ])
    },
    [loadDashboardSnapshot, loadUsersTrend, loadUserSpendingRanking],
  )

  const onDateRangeChange = useCallback(
    (range: { startDate: string; endDate: string; preset: string | null }) => {
      const start = new Date(range.startDate)
      const end = new Date(range.endDate)
      const daysDiff = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))
      const nextGranularity: 'day' | 'hour' = daysDiff <= 1 ? 'hour' : 'day'
      setGranularity(nextGranularity)
      void loadChartData({
        start_date: range.startDate,
        end_date: range.endDate,
        granularity: nextGranularity,
      })
    },
    [loadChartData],
  )

  useEffect(() => {
    void loadDashboardStats()
    // Match Vue onMounted: initial load only; refresh/date/granularity handlers reload explicitly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <AppLayout>
      <div className="space-y-6">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <LoadingSpinner />
          </div>
        ) : stats ? (
          <>
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <div className="card p-4">
                <div className="flex items-center gap-3">
                  <div className="rounded-lg bg-blue-100 p-2 dark:bg-blue-900/30">
                    <Icon name="key" size="md" className="text-blue-600 dark:text-blue-400" strokeWidth={2} />
                  </div>
                  <div>
                    <p className="text-xs font-medium text-gray-500 dark:text-gray-400">
                      {t('admin.dashboard.apiKeys')}
                    </p>
                    <p className="text-xl font-bold text-gray-900 dark:text-white">{stats.total_api_keys}</p>
                    <p className="text-xs text-green-600 dark:text-green-400">
                      {stats.active_api_keys} {t('common.active')}
                    </p>
                  </div>
                </div>
              </div>

              <div className="card p-4">
                <div className="flex items-center gap-3">
                  <div className="rounded-lg bg-purple-100 p-2 dark:bg-purple-900/30">
                    <Icon name="server" size="md" className="text-purple-600 dark:text-purple-400" strokeWidth={2} />
                  </div>
                  <div>
                    <p className="text-xs font-medium text-gray-500 dark:text-gray-400">
                      {t('admin.dashboard.accounts')}
                    </p>
                    <p className="text-xl font-bold text-gray-900 dark:text-white">{stats.total_accounts}</p>
                    <p className="text-xs">
                      <span className="text-green-600 dark:text-green-400">
                        {stats.normal_accounts} {t('common.active')}
                      </span>
                      {(stats.error_accounts ?? 0) > 0 ? (
                        <span className="ml-1 text-red-500">
                          {stats.error_accounts} {t('common.error')}
                        </span>
                      ) : null}
                    </p>
                  </div>
                </div>
              </div>

              <div className="card p-4">
                <div className="flex items-center gap-3">
                  <div className="rounded-lg bg-green-100 p-2 dark:bg-green-900/30">
                    <Icon name="chart" size="md" className="text-green-600 dark:text-green-400" strokeWidth={2} />
                  </div>
                  <div>
                    <p className="text-xs font-medium text-gray-500 dark:text-gray-400">
                      {t('admin.dashboard.todayRequests')}
                    </p>
                    <p className="text-xl font-bold text-gray-900 dark:text-white">{stats.today_requests}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {t('common.total')}: {formatNumber(stats.total_requests ?? 0)}
                    </p>
                  </div>
                </div>
              </div>

              <div className="card p-4">
                <div className="flex items-center gap-3">
                  <div className="rounded-lg bg-emerald-100 p-2 dark:bg-emerald-900/30">
                    <Icon
                      name="userPlus"
                      size="md"
                      className="text-emerald-600 dark:text-emerald-400"
                      strokeWidth={2}
                    />
                  </div>
                  <div>
                    <p className="text-xs font-medium text-gray-500 dark:text-gray-400">
                      {t('admin.dashboard.users')}
                    </p>
                    <p className="text-xl font-bold text-emerald-600 dark:text-emerald-400">
                      +{stats.today_new_users}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {t('common.total')}: {formatNumber(stats.total_users ?? 0)}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <div className="card p-4">
                <div className="flex items-center gap-3">
                  <div className="rounded-lg bg-amber-100 p-2 dark:bg-amber-900/30">
                    <Icon name="cube" size="md" className="text-amber-600 dark:text-amber-400" strokeWidth={2} />
                  </div>
                  <div>
                    <p className="text-xs font-medium text-gray-500 dark:text-gray-400">
                      {t('admin.dashboard.todayTokens')}
                    </p>
                    <p className="text-xl font-bold text-gray-900 dark:text-white">
                      {formatTokens(stats.today_tokens)}
                    </p>
                    <p className="text-xs">
                      <span className="text-green-600 dark:text-green-400" title={t('admin.dashboard.actual')}>
                        ${formatCost(stats.today_actual_cost ?? 0)}
                      </span>
                      <span className="text-gray-400 dark:text-gray-500"> / </span>
                      <span className="text-orange-500 dark:text-orange-400" title={t('admin.dashboard.accountCost')}>
                        ${formatCost(stats.today_account_cost ?? 0)}
                      </span>
                      <span className="text-gray-400 dark:text-gray-500"> / </span>
                      <span className="text-gray-400 dark:text-gray-500" title={t('admin.dashboard.standard')}>
                        ${formatCost(stats.today_cost ?? 0)}
                      </span>
                    </p>
                  </div>
                </div>
              </div>

              <div className="card p-4">
                <div className="flex items-center gap-3">
                  <div className="rounded-lg bg-indigo-100 p-2 dark:bg-indigo-900/30">
                    <Icon name="database" size="md" className="text-indigo-600 dark:text-indigo-400" strokeWidth={2} />
                  </div>
                  <div>
                    <p className="text-xs font-medium text-gray-500 dark:text-gray-400">
                      {t('admin.dashboard.totalTokens')}
                    </p>
                    <p className="text-xl font-bold text-gray-900 dark:text-white">
                      {formatTokens(stats.total_tokens)}
                    </p>
                    <p className="text-xs">
                      <span className="text-green-600 dark:text-green-400" title={t('admin.dashboard.actual')}>
                        ${formatCost(stats.total_actual_cost ?? 0)}
                      </span>
                      <span className="text-gray-400 dark:text-gray-500"> / </span>
                      <span className="text-orange-500 dark:text-orange-400" title={t('admin.dashboard.accountCost')}>
                        ${formatCost(stats.total_account_cost ?? 0)}
                      </span>
                      <span className="text-gray-400 dark:text-gray-500"> / </span>
                      <span className="text-gray-400 dark:text-gray-500" title={t('admin.dashboard.standard')}>
                        ${formatCost(stats.total_cost ?? 0)}
                      </span>
                    </p>
                  </div>
                </div>
              </div>

              <div className="card p-4">
                <div className="flex items-center gap-3">
                  <div className="rounded-lg bg-violet-100 p-2 dark:bg-violet-900/30">
                    <Icon name="bolt" size="md" className="text-violet-600 dark:text-violet-400" strokeWidth={2} />
                  </div>
                  <div className="flex-1">
                    <p className="text-xs font-medium text-gray-500 dark:text-gray-400">
                      {t('admin.dashboard.performance')}
                    </p>
                    <div className="flex items-baseline gap-2">
                      <p className="text-xl font-bold text-gray-900 dark:text-white">
                        {formatTokens(stats.rpm)}
                      </p>
                      <span className="text-xs text-gray-500 dark:text-gray-400">RPM</span>
                    </div>
                    <div className="flex items-baseline gap-2">
                      <p className="text-sm font-semibold text-violet-600 dark:text-violet-400">
                        {formatTokens(stats.tpm)}
                      </p>
                      <span className="text-xs text-gray-500 dark:text-gray-400">TPM</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="card p-4">
                <div className="flex items-center gap-3">
                  <div className="rounded-lg bg-rose-100 p-2 dark:bg-rose-900/30">
                    <Icon name="clock" size="md" className="text-rose-600 dark:text-rose-400" strokeWidth={2} />
                  </div>
                  <div>
                    <p className="text-xs font-medium text-gray-500 dark:text-gray-400">
                      {t('admin.dashboard.avgResponse')}
                    </p>
                    <p className="text-xl font-bold text-gray-900 dark:text-white">
                      {formatDuration(stats.average_duration_ms ?? 0)}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {stats.active_users} {t('admin.dashboard.activeUsers')}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-6">
              <div className="card p-4">
                <div className="flex flex-wrap items-center gap-4">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      {t('admin.dashboard.timeRange')}:
                    </span>
                    <DateRangePicker
                      startDate={startDate}
                      endDate={endDate}
                      onUpdateStartDate={setStartDate}
                      onUpdateEndDate={setEndDate}
                      onChange={onDateRangeChange}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => void loadDashboardStats()}
                    disabled={chartsLoading}
                    className="btn btn-secondary"
                  >
                    {t('common.refresh')}
                  </button>
                  <div className="ml-auto flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      {t('admin.dashboard.granularity')}:
                    </span>
                    <div className="w-28">
                      <Select
                        modelValue={granularity}
                        options={granularityOptions}
                        onChange={() => void loadChartData()}
                        onUpdateModelValue={(value) => setGranularity(value as 'day' | 'hour')}
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                <ModelDistributionChart
                  modelStats={modelStats}
                  enableRankingView
                  rankingItems={rankingItems}
                  rankingTotalActualCost={rankingTotalActualCost}
                  rankingTotalRequests={rankingTotalRequests}
                  rankingTotalTokens={rankingTotalTokens}
                  loading={chartsLoading}
                  rankingLoading={rankingLoading}
                  rankingError={rankingError}
                  startDate={startDate}
                  endDate={endDate}
                  onRankingClick={goToUserUsage}
                />
                <TokenUsageTrend trendData={trendData} loading={chartsLoading} />
              </div>

              <div className="card p-4">
                <h3 className="mb-4 text-sm font-semibold text-gray-900 dark:text-white">
                  {t('admin.dashboard.recentUsage')} (Top 12)
                </h3>
                <div className="h-64">
                  {userTrendLoading ? (
                    <div className="flex h-full items-center justify-center">
                      <LoadingSpinner size="md" />
                    </div>
                  ) : userTrendChartData ? (
                    <Line data={userTrendChartData} options={lineOptions} />
                  ) : (
                    <div className="flex h-full items-center justify-center text-sm text-gray-500 dark:text-gray-400">
                      {t('admin.dashboard.noDataAvailable')}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </>
        ) : null}
      </div>
    </AppLayout>
  )
}
