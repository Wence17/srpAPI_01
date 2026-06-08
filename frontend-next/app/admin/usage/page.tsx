'use client'

import { useEffect, useState } from 'react'
import PageShell from '@/components/PageShell'
import { useAuth } from '@/context/AuthContext'
import { adminUsageAPI, type AdminUsageLog, type AdminUsageStatsResponse } from '@/lib/adminUsage'

function formatNumber(value?: number | null): string {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(value ?? 0)
}

function formatCurrency(value?: number | null): string {
  return value !== undefined && value !== null ? `$${value.toFixed(2)}` : '$0.00'
}

export default function AdminUsagePage() {
  const auth = useAuth()
  const [usageLogs, setUsageLogs] = useState<AdminUsageLog[]>([])
  const [stats, setStats] = useState<AdminUsageStatsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function loadAdminUsage() {
      setLoading(true)
      try {
        const [usageResponse, statsResponse] = await Promise.all([
          adminUsageAPI.list({ page: 1, page_size: 8 }),
          adminUsageAPI.getStats({ period: '24h' }),
        ])
        if (cancelled) return
        setUsageLogs(usageResponse.items)
        setStats(statsResponse)
        setError(null)
      } catch (err) {
        if (cancelled) return
        setError((err as Error)?.message || 'Unable to load admin usage data.')
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    loadAdminUsage()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <PageShell title="Admin Usage" description="Administrative usage reports and details." path="/admin/usage">
      <div className="space-y-6">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-xl font-semibold text-slate-900">Admin Usage Reports</h2>
              <p className="mt-2 text-sm text-slate-600">
                This page now fetches admin usage statistics and the latest usage records from the backend.
              </p>
            </div>
            <div className="rounded-2xl bg-slate-100 px-4 py-2 text-sm text-slate-700">User: {auth.user?.email || 'unknown'}</div>
          </div>
        </div>

        {loading ? (
          <div className="rounded-3xl border border-slate-200 bg-slate-50 p-8 text-center text-slate-600">
            Loading admin usage data...
          </div>
        ) : error ? (
          <div className="rounded-3xl border border-rose-200 bg-rose-50 p-6 text-rose-700">
            <p className="font-semibold">Unable to load admin usage</p>
            <p className="mt-2 text-sm">{error}</p>
          </div>
        ) : (
          <>
            <div className="grid gap-6 sm:grid-cols-3">
              <div className="rounded-3xl border border-slate-200 bg-slate-50 p-6">
                <p className="text-sm uppercase tracking-[0.24em] text-slate-500">Total Requests</p>
                <p className="mt-4 text-3xl font-semibold text-slate-900">{formatNumber(stats?.total_requests)}</p>
              </div>
              <div className="rounded-3xl border border-slate-200 bg-slate-50 p-6">
                <p className="text-sm uppercase tracking-[0.24em] text-slate-500">Total Tokens</p>
                <p className="mt-4 text-3xl font-semibold text-slate-900">{formatNumber(stats?.total_tokens)}</p>
              </div>
              <div className="rounded-3xl border border-slate-200 bg-slate-50 p-6">
                <p className="text-sm uppercase tracking-[0.24em] text-slate-500">Total Cost</p>
                <p className="mt-4 text-3xl font-semibold text-slate-900">{formatCurrency(stats?.total_cost)}</p>
              </div>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h3 className="text-lg font-semibold text-slate-900">Latest usage records</h3>
                  <p className="mt-1 text-sm text-slate-600">Showing the most recent 8 usage entries.</p>
                </div>
              </div>

              <div className="mt-6 overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                  <thead className="bg-slate-50 text-slate-600">
                    <tr>
                      <th className="px-4 py-3">ID</th>
                      <th className="px-4 py-3">User</th>
                      <th className="px-4 py-3">API Key</th>
                      <th className="px-4 py-3">Type</th>
                      <th className="px-4 py-3">Model</th>
                      <th className="px-4 py-3">Tokens</th>
                      <th className="px-4 py-3">Cost</th>
                      <th className="px-4 py-3">Created</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {usageLogs.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="px-4 py-6 text-center text-slate-500">
                          No usage records found.
                        </td>
                      </tr>
                    ) : (
                      usageLogs.map((item) => (
                        <tr key={item.id} className="odd:bg-slate-50">
                          <td className="px-4 py-3 font-medium text-slate-900">{item.id}</td>
                          <td className="px-4 py-3 text-slate-700">{item.user_id ?? '—'}</td>
                          <td className="px-4 py-3 text-slate-700">{item.api_key_id ?? '—'}</td>
                          <td className="px-4 py-3 text-slate-700">{item.request_type || 'unknown'}</td>
                          <td className="px-4 py-3 text-slate-700">{item.model || '—'}</td>
                          <td className="px-4 py-3 text-slate-700">{formatNumber(item.total_tokens)}</td>
                          <td className="px-4 py-3 text-slate-700">{formatCurrency(item.cost)}</td>
                          <td className="px-4 py-3 text-slate-700">{new Date(item.created_at).toLocaleString()}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </PageShell>
  )
}
