'use client'

import { useEffect, useState } from 'react'
import PageShell from '@/components/PageShell'
import { useAuth } from '@/context/AuthContext'
import { useApp } from '@/context/AppContext'
import {
  getRealtimeMetrics,
  getStats,
  type AdminDashboardStats,
  type RealtimeMetrics,
} from '@/lib/adminDashboard'

function formatNumber(value?: number): string {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(value ?? 0)
}

function formatCurrency(value?: number): string {
  return value !== undefined ? `$${value.toFixed(2)}` : '$0.00'
}

function formatDuration(value?: number): string {
  return value !== undefined ? `${Math.round(value)} ms` : '--'
}

export default function AdminDashboardPage() {
  const auth = useAuth()
  const app = useApp()
  const [stats, setStats] = useState<AdminDashboardStats | null>(null)
  const [metrics, setMetrics] = useState<RealtimeMetrics | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      try {
        const [dashboardStats, realtime] = await Promise.all([getStats(), getRealtimeMetrics()])
        if (cancelled) return
        setStats(dashboardStats)
        setMetrics(realtime)
        setError(null)
      } catch (err) {
        if (cancelled) return
        setError((err as Error)?.message || 'Unable to load admin dashboard data.')
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <PageShell title="Admin Dashboard" description="Administrative statistics and system controls." path="/admin/dashboard">
      <div className="space-y-6">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold text-slate-900">Welcome, {auth.user?.username || auth.user?.email || 'Admin'}</h2>
          <p className="mt-2 text-sm text-slate-600">This view now loads live admin dashboard statistics from the backend.</p>
        </div>

        {loading ? (
          <div className="rounded-3xl border border-slate-200 bg-slate-50 p-8 text-center text-slate-600">
            Loading admin metrics...
          </div>
        ) : error ? (
          <div className="rounded-3xl border border-rose-200 bg-rose-50 p-6 text-rose-700">
            <p className="font-semibold">Failed to load admin dashboard</p>
            <p className="mt-2 text-sm">{error}</p>
          </div>
        ) : (
          <>
            <div className="grid gap-6 xl:grid-cols-4">
              <div className="rounded-3xl border border-slate-200 bg-slate-50 p-6">
                <p className="text-sm uppercase tracking-[0.24em] text-slate-500">API Keys</p>
                <p className="mt-4 text-3xl font-semibold text-slate-900">{formatNumber(stats?.total_api_keys)}</p>
                <p className="mt-2 text-sm text-slate-600">Active keys: {formatNumber(stats?.active_api_keys)}</p>
              </div>
              <div className="rounded-3xl border border-slate-200 bg-slate-50 p-6">
                <p className="text-sm uppercase tracking-[0.24em] text-slate-500">Service Accounts</p>
                <p className="mt-4 text-3xl font-semibold text-slate-900">{formatNumber(stats?.total_accounts)}</p>
                <p className="mt-2 text-sm text-slate-600">
                  Active: {formatNumber(stats?.normal_accounts)} • Errors: {formatNumber(stats?.error_accounts)}
                </p>
              </div>
              <div className="rounded-3xl border border-slate-200 bg-slate-50 p-6">
                <p className="text-sm uppercase tracking-[0.24em] text-slate-500">Today's Requests</p>
                <p className="mt-4 text-3xl font-semibold text-slate-900">{formatNumber(stats?.today_requests)}</p>
                <p className="mt-2 text-sm text-slate-600">Total requests: {formatNumber(stats?.total_requests)}</p>
              </div>
              <div className="rounded-3xl border border-slate-200 bg-slate-50 p-6">
                <p className="text-sm uppercase tracking-[0.24em] text-slate-500">New Users Today</p>
                <p className="mt-4 text-3xl font-semibold text-slate-900">+{formatNumber(stats?.today_new_users)}</p>
                <p className="mt-2 text-sm text-slate-600">Total users: {formatNumber(stats?.total_users)}</p>
              </div>
            </div>

            <div className="grid gap-6 lg:grid-cols-3">
              <div className="rounded-3xl border border-slate-200 bg-slate-50 p-6">
                <p className="text-sm uppercase tracking-[0.24em] text-slate-500">Today Token Usage</p>
                <p className="mt-4 text-3xl font-semibold text-slate-900">{formatNumber(stats?.today_tokens)}</p>
                <p className="mt-2 text-sm text-slate-600">Cost: {formatCurrency(stats?.today_actual_cost)}</p>
              </div>
              <div className="rounded-3xl border border-slate-200 bg-slate-50 p-6">
                <p className="text-sm uppercase tracking-[0.24em] text-slate-500">Total Tokens</p>
                <p className="mt-4 text-3xl font-semibold text-slate-900">{formatNumber(stats?.total_tokens)}</p>
                <p className="mt-2 text-sm text-slate-600">Total cost: {formatCurrency(stats?.total_actual_cost)}</p>
              </div>
              <div className="rounded-3xl border border-slate-200 bg-slate-50 p-6">
                <p className="text-sm uppercase tracking-[0.24em] text-slate-500">Realtime Health</p>
                <p className="mt-4 text-3xl font-semibold text-slate-900">{formatNumber(metrics?.requests_per_minute)}</p>
                <p className="mt-2 text-sm text-slate-600">Avg latency: {formatDuration(metrics?.average_response_time)}</p>
              </div>
            </div>

            <div className="grid gap-6 xl:grid-cols-3">
              <div className="rounded-3xl border border-slate-200 bg-slate-50 p-6">
                <p className="text-sm uppercase tracking-[0.24em] text-slate-500">Active Requests</p>
                <p className="mt-4 text-3xl font-semibold text-slate-900">{formatNumber(metrics?.active_requests)}</p>
              </div>
              <div className="rounded-3xl border border-slate-200 bg-slate-50 p-6">
                <p className="text-sm uppercase tracking-[0.24em] text-slate-500">Error Rate</p>
                <p className="mt-4 text-3xl font-semibold text-slate-900">{metrics?.error_rate?.toFixed(2) ?? '0.00'}%</p>
              </div>
              <div className="rounded-3xl border border-slate-200 bg-slate-50 p-6">
                <p className="text-sm uppercase tracking-[0.24em] text-slate-500">Backend Mode</p>
                <p className="mt-4 text-3xl font-semibold text-slate-900">{app.backendModeEnabled ? 'Enabled' : 'Disabled'}</p>
                <p className="mt-2 text-sm text-slate-600">Current public site name: {app.siteName || 'Sub2API'}</p>
              </div>
            </div>
          </>
        )}
      </div>
    </PageShell>
  )
}
