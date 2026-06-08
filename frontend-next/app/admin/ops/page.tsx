'use client'

import { useEffect, useState } from 'react'
import PageShell from '@/components/PageShell'
import { useApp } from '@/context/AppContext'
import { adminOpsAPI, type OpsDashboardOverview } from '@/lib/adminOps'

function formatNumber(value?: number): string {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(value ?? 0)
}

function formatPercent(value?: number): string {
  return value !== undefined ? `${value.toFixed(2)}%` : '0.00%'
}

export default function AdminOpsPage() {
  const app = useApp()
  const [overview, setOverview] = useState<OpsDashboardOverview | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function loadOverview() {
      setLoading(true)
      try {
        const response = await adminOpsAPI.getDashboardOverview({ time_range: '5m' })
        if (cancelled) return
        setOverview(response)
        setError(null)
      } catch (err) {
        if (cancelled) return
        setError((err as Error)?.message || 'Unable to load ops overview data.')
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    loadOverview()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <PageShell title="Ops Monitoring" description="Operational monitoring and health checks for channels." path="/admin/ops">
      <div className="space-y-6">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold text-slate-900">Operations Overview</h2>
          <p className="mt-2 text-sm text-slate-600">
            Live operational metrics from the backend are now wired in for the admin ops dashboard.
          </p>
          <p className="mt-3 text-sm text-slate-500">Current backend mode: {app.backendModeEnabled ? 'Enabled' : 'Disabled'}</p>
        </div>

        {loading ? (
          <div className="rounded-3xl border border-slate-200 bg-slate-50 p-8 text-center text-slate-600">
            Loading ops overview...
          </div>
        ) : error ? (
          <div className="rounded-3xl border border-rose-200 bg-rose-50 p-6 text-rose-700">
            <p className="font-semibold">Unable to load ops monitoring data</p>
            <p className="mt-2 text-sm">{error}</p>
          </div>
        ) : (
          <div className="grid gap-6 lg:grid-cols-3">
            <div className="rounded-3xl border border-slate-200 bg-slate-50 p-6">
              <p className="text-sm uppercase tracking-[0.24em] text-slate-500">Total Requests</p>
              <p className="mt-4 text-3xl font-semibold text-slate-900">{formatNumber(overview?.request_count_total)}</p>
              <p className="mt-2 text-sm text-slate-600">SLA requests: {formatNumber(overview?.request_count_sla)}</p>
            </div>
            <div className="rounded-3xl border border-slate-200 bg-slate-50 p-6">
              <p className="text-sm uppercase tracking-[0.24em] text-slate-500">Success Count</p>
              <p className="mt-4 text-3xl font-semibold text-slate-900">{formatNumber(overview?.success_count)}</p>
              <p className="mt-2 text-sm text-slate-600">Errors: {formatNumber(overview?.error_count_total)}</p>
            </div>
            <div className="rounded-3xl border border-slate-200 bg-slate-50 p-6">
              <p className="text-sm uppercase tracking-[0.24em] text-slate-500">Error Rate</p>
              <p className="mt-4 text-3xl font-semibold text-slate-900">{formatPercent(overview?.error_rate)}</p>
              <p className="mt-2 text-sm text-slate-600">Upstream error rate: {formatPercent(overview?.upstream_error_rate)}</p>
            </div>
          </div>
        )}
      </div>
    </PageShell>
  )
}
