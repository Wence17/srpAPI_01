'use client'

import { useEffect, useMemo, useState } from 'react'
import PageShell from '@/components/PageShell'
import { useApp } from '@/context/AppContext'
import { useAuth } from '@/context/AuthContext'
import { usageAPI, type TrendDataPoint, type ModelStat, type UserDashboardStats, type UsageLogItem } from '@/lib/usage'
import { getMyPlatformQuotas, type PlatformQuotaItem } from '@/lib/user'

function formatNumber(value: number | undefined) {
  return value !== undefined ? new Intl.NumberFormat('en-US').format(value) : '0'
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString()
}

export default function DashboardPage() {
  const app = useApp()
  const auth = useAuth()

  const [stats, setStats] = useState<UserDashboardStats | null>(null)
  const [trend, setTrend] = useState<TrendDataPoint[]>([])
  const [models, setModels] = useState<ModelStat[]>([])
  const [platformQuotas, setPlatformQuotas] = useState<PlatformQuotaItem[]>([])
  const [recentUsage, setRecentUsage] = useState<UsageLogItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')

  const userRole = useMemo(() => auth.user?.role || 'user', [auth.user])

  useEffect(() => {
    const startDate = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split('T')[0]
    const endDate = new Date().toISOString().split('T')[0]

    async function loadDashboard() {
      setIsLoading(true)
      setError('')

      try {
        const [statsResponse, trendResponse, modelResponse, quotasResponse, usageResponse] = await Promise.all([
          usageAPI.getDashboardStats(),
          usageAPI.getDashboardTrend({ start_date: startDate, end_date: endDate, granularity: 'day' }),
          usageAPI.getDashboardModels({ start_date: startDate, end_date: endDate }),
          getMyPlatformQuotas(),
          usageAPI.getByDateRange(startDate, endDate)
        ])

        setStats(statsResponse)
        setTrend(trendResponse.trend)
        setModels(modelResponse.models)
        setPlatformQuotas(quotasResponse.platform_quotas)
        setRecentUsage(usageResponse.items)
      } catch (err) {
        console.error('Failed to load dashboard data:', err)
        setError('Unable to load dashboard data right now. Please try again later.')
      } finally {
        setIsLoading(false)
      }
    }

    loadDashboard()
  }, [])

  return (
    <PageShell title="Dashboard" description="Overview of your Sub2API account usage and activity." path="/dashboard">
      <div className="space-y-8">
        {error ? (
          <div className="rounded-3xl border border-rose-200 bg-rose-50 p-6 text-rose-900">
            <p className="font-semibold">Dashboard error</p>
            <p className="mt-2 text-sm">{error}</p>
          </div>
        ) : null}

        <div className="grid gap-6 lg:grid-cols-3">
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <p className="text-sm uppercase tracking-[0.24em] text-slate-500">Welcome back</p>
            <h2 className="mt-3 text-2xl font-semibold text-slate-900">{auth.user?.username || auth.user?.email || 'User'}</h2>
            <p className="mt-3 text-sm text-slate-600">Role: {userRole}</p>
            <p className="mt-4 text-sm text-slate-600">{app.siteName || 'Sub2API'} dashboard gives you quick access to usage, quotas, and requests.</p>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <p className="text-sm uppercase tracking-[0.24em] text-slate-500">Recent requests</p>
            <p className="mt-3 text-3xl font-semibold text-slate-900">{formatNumber(stats?.today_requests)}</p>
            <p className="mt-2 text-sm text-slate-600">Requests today</p>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <p className="text-sm uppercase tracking-[0.24em] text-slate-500">Tokens used</p>
            <p className="mt-3 text-3xl font-semibold text-slate-900">{formatNumber(stats?.today_tokens)}</p>
            <p className="mt-2 text-sm text-slate-600">Tokens used today</p>
          </div>
        </div>

        <div className="grid gap-6 xl:grid-cols-[1.7fr_1fr]">
          <div className="space-y-6 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-slate-900">Usage trend</h3>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">Last 7 days</span>
            </div>
            <div className="space-y-3">
              {isLoading ? (
                <p className="text-sm text-slate-500">Loading chart data…</p>
              ) : trend.length === 0 ? (
                <p className="text-sm text-slate-500">No trend data available.</p>
              ) : (
                <div className="space-y-3">
                  {trend.map((point) => (
                    <div key={point.date} className="space-y-1">
                      <div className="flex items-center justify-between text-sm text-slate-600">
                        <span>{formatDate(point.date)}</span>
                        <span>{formatNumber(point.requests)} requests</span>
                      </div>
                      <div className="h-2 rounded-full bg-slate-100">
                        <div
                          className="h-2 rounded-full bg-brand-600"
                          style={{ width: `${Math.min(100, point.requests / Math.max(1, trend[0]?.requests || 1) * 100)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="space-y-6 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-slate-900">Platform quotas</h3>
              <span className="text-sm text-slate-500">Current usage</span>
            </div>
            {isLoading ? (
              <p className="text-sm text-slate-500">Loading quotas…</p>
            ) : platformQuotas.length === 0 ? (
              <p className="text-sm text-slate-500">No platform quota data available.</p>
            ) : (
              <div className="space-y-4">
                {platformQuotas.map((quota) => {
                  const ratio = Math.min(100, (quota.usage / Math.max(1, quota.limit)) * 100)
                  return (
                    <div key={quota.platform} className="space-y-2">
                      <div className="flex items-center justify-between text-sm font-medium text-slate-700">
                        <span>{quota.platform}</span>
                        <span>{ratio.toFixed(0)}%</span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                        <div className="h-full rounded-full bg-brand-600" style={{ width: `${ratio}%` }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        <div className="space-y-6 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-slate-900">Recent usage</h3>
            <span className="text-sm text-slate-500">Latest requests</span>
          </div>
          {isLoading ? (
            <p className="text-sm text-slate-500">Loading recent usage…</p>
          ) : recentUsage.length === 0 ? (
            <p className="text-sm text-slate-500">No usage records found for the selected period.</p>
          ) : (
            <div className="space-y-3">
              {recentUsage.map((item) => (
                <div key={item.id} className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3">
                  <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-sm font-medium text-slate-900">{item.model || 'Unknown model'}</p>
                    <p className="text-sm text-slate-500">{formatDate(item.created_at)}</p>
                  </div>
                  <p className="mt-2 text-sm text-slate-600">Tokens: {formatNumber(item.total_tokens)} / Cost: {item.cost ?? 0}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </PageShell>
  )
}
