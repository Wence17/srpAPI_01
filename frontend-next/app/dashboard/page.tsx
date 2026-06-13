'use client'

import { useCallback, useEffect, useState } from 'react'
import AppLayout from '@/components/layout/AppLayout'
import LoadingSpinner from '@/components/common/LoadingSpinner'
import UserDashboardStatsPanel from '@/components/user/dashboard/UserDashboardStats'
import UserDashboardCharts from '@/components/user/dashboard/UserDashboardCharts'
import UserDashboardRecentUsage from '@/components/user/dashboard/UserDashboardRecentUsage'
import UserDashboardQuickActions from '@/components/user/dashboard/UserDashboardQuickActions'
import { useAuth } from '@/context/AuthContext'
import { usageAPI } from '@/lib/usage'
import { getMyPlatformQuotas } from '@/lib/user'
import type { ModelStat, TrendDataPoint, UserDashboardStats } from '@/lib/usage'
import type { PlatformQuotaItem, UsageLog } from '@/lib/types'

function formatLocalDate(d: Date): string {
  return d.toISOString().split('T')[0]
}

export default function DashboardPage() {
  const auth = useAuth()

  const [stats, setStats] = useState<UserDashboardStats | null>(null)
  const [loading, setLoading] = useState(false)
  const [loadingUsage, setLoadingUsage] = useState(false)
  const [loadingCharts, setLoadingCharts] = useState(false)
  const [trendData, setTrendData] = useState<TrendDataPoint[]>([])
  const [modelStats, setModelStats] = useState<ModelStat[]>([])
  const [recentUsage, setRecentUsage] = useState<UsageLog[]>([])
  const [platformQuotas, setPlatformQuotas] = useState<PlatformQuotaItem[] | null>(null)

  const [startDate, setStartDate] = useState(() => formatLocalDate(new Date(Date.now() - 6 * 86400000)))
  const [endDate, setEndDate] = useState(() => formatLocalDate(new Date()))
  const [granularity, setGranularity] = useState('day')

  const loadStats = useCallback(async () => {
    setLoading(true)
    try {
      await auth.refreshUser()
      setStats(await usageAPI.getDashboardStats())
    } catch (error) {
      console.error('Failed to load dashboard stats:', error)
    } finally {
      setLoading(false)
    }
  }, [auth])

  const loadCharts = useCallback(async () => {
    setLoadingCharts(true)
    try {
      const [trendRes, modelRes] = await Promise.all([
        usageAPI.getDashboardTrend({
          start_date: startDate,
          end_date: endDate,
          granularity: granularity as 'day' | 'hour',
        }),
        usageAPI.getDashboardModels({ start_date: startDate, end_date: endDate }),
      ])
      setTrendData(trendRes.trend || [])
      setModelStats(modelRes.models || [])
    } catch (error) {
      console.error('Failed to load charts:', error)
    } finally {
      setLoadingCharts(false)
    }
  }, [startDate, endDate, granularity])

  const loadRecent = useCallback(async () => {
    setLoadingUsage(true)
    try {
      const res = await usageAPI.getByDateRange(startDate, endDate)
      setRecentUsage(res.items.slice(0, 5))
    } catch (error) {
      console.error('Failed to load recent usage:', error)
    } finally {
      setLoadingUsage(false)
    }
  }, [startDate, endDate])

  const loadPlatformQuotas = useCallback(async () => {
    try {
      const data = await getMyPlatformQuotas()
      setPlatformQuotas(data.platform_quotas ?? [])
    } catch (error) {
      console.warn('Failed to load platform quotas:', error)
      setPlatformQuotas([])
    }
  }, [])

  const refreshAll = useCallback(() => {
    loadStats()
    loadCharts()
    loadRecent()
    loadPlatformQuotas()
  }, [loadStats, loadCharts, loadRecent, loadPlatformQuotas])

  useEffect(() => {
    refreshAll()
  }, [refreshAll])

  return (
    <AppLayout>
      <div className="space-y-6">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <LoadingSpinner />
          </div>
        ) : stats ? (
          <>
            <UserDashboardStatsPanel
              stats={stats}
              balance={auth.user?.balance || 0}
              isSimple={auth.isSimpleMode}
              platformQuotas={platformQuotas}
            />
            <UserDashboardCharts
              loading={loadingCharts}
              startDate={startDate}
              endDate={endDate}
              granularity={granularity}
              trend={trendData}
              models={modelStats}
              onStartDateChange={setStartDate}
              onEndDateChange={setEndDate}
              onGranularityChange={setGranularity}
              onDateRangeChange={loadCharts}
              onRefresh={refreshAll}
            />
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
              <div className="lg:col-span-2">
                <UserDashboardRecentUsage data={recentUsage} loading={loadingUsage} />
              </div>
              <div className="lg:col-span-1">
                <UserDashboardQuickActions />
              </div>
            </div>
          </>
        ) : null}
      </div>
    </AppLayout>
  )
}
