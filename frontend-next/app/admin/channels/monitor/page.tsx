'use client'

import { useEffect, useState } from 'react'
import PageShell from '@/components/PageShell'
import { adminChannelMonitorAPI, type ChannelMonitor, type Provider } from '@/lib/adminChannelMonitor'

const pageSize = 10

function formatDate(value?: string | null) {
  if (!value) return '—'
  return new Date(value).toLocaleString()
}

export default function ChannelMonitorPage() {
  const [monitors, setMonitors] = useState<ChannelMonitor[]>([])
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [provider, setProvider] = useState<Provider | 'all'>('all')
  const [enabled, setEnabled] = useState<'all' | 'enabled' | 'disabled'>('all')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const controller = new AbortController()

    async function loadMonitors() {
      setLoading(true)
      setError(null)

      try {
        const response = await adminChannelMonitorAPI.list({
          page,
          page_size: pageSize,
          provider: provider === 'all' ? undefined : provider,
          enabled: enabled === 'all' ? undefined : enabled === 'enabled',
          search: search.trim() || undefined,
        }, {
          signal: controller.signal,
        })

        if (cancelled) return
        setMonitors(response.items)
        setTotal(response.total)
      } catch (err) {
        if (cancelled) return
        setError((err as Error)?.message || 'Unable to load channel monitors.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    loadMonitors()
    return () => {
      cancelled = true
      controller.abort()
    }
  }, [page, provider, enabled, search])

  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  return (
    <PageShell title="Channel Monitor" description="Monitor upstream channel health" path="/admin/channels/monitor">
      <div className="space-y-6">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-xl font-semibold text-slate-900">Channel monitor</h2>
              <p className="mt-2 text-sm text-slate-600">
                Track the health of upstream channels and verify monitor status.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
              <select
                value={provider}
                onChange={(event) => {
                  setProvider(event.target.value as Provider | 'all')
                  setPage(1)
                }}
                className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-2 text-sm shadow-sm focus:border-brand-500 focus:ring-brand-200"
              >
                <option value="all">All providers</option>
                <option value="openai">OpenAI</option>
                <option value="anthropic">Anthropic</option>
                <option value="gemini">Gemini</option>
              </select>
              <select
                value={enabled}
                onChange={(event) => {
                  setEnabled(event.target.value as 'all' | 'enabled' | 'disabled')
                  setPage(1)
                }}
                className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-2 text-sm shadow-sm focus:border-brand-500 focus:ring-brand-200"
              >
                <option value="all">All monitors</option>
                <option value="enabled">Enabled</option>
                <option value="disabled">Disabled</option>
              </select>
              <input
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value)
                  setPage(1)
                }}
                placeholder="Search monitors"
                className="w-full rounded-2xl border border-slate-300 px-4 py-2 text-sm shadow-sm focus:border-brand-500 focus:ring-brand-200"
              />
            </div>
          </div>
        </div>

        {loading ? (
          <div className="rounded-3xl border border-slate-200 bg-slate-50 p-8 text-center text-slate-600">
            Loading channel monitors...
          </div>
        ) : error ? (
          <div className="rounded-3xl border border-rose-200 bg-rose-50 p-6 text-rose-700">
            <p className="font-semibold">Unable to load monitors</p>
            <p className="mt-2 text-sm">{error}</p>
          </div>
        ) : (
          <>
            <div className="rounded-3xl border border-slate-200 bg-slate-50 p-6">
              <p className="text-sm text-slate-500">Showing {monitors.length} of {total} monitors</p>
            </div>

            <div className="overflow-x-auto rounded-3xl border border-slate-200 bg-white shadow-sm">
              <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                <thead className="bg-slate-50 text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Name</th>
                    <th className="px-4 py-3">Provider</th>
                    <th className="px-4 py-3">Primary model</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Latency</th>
                    <th className="px-4 py-3">Availability</th>
                    <th className="px-4 py-3">Last checked</th>
                    <th className="px-4 py-3">Enabled</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 bg-white text-slate-700">
                  {monitors.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-6 text-center text-slate-500">
                        No monitors match the current filters.
                      </td>
                    </tr>
                  ) : (
                    monitors.map((monitor) => (
                      <tr key={monitor.id} className="odd:bg-slate-50">
                        <td className="px-4 py-4 font-medium text-slate-900">{monitor.name}</td>
                        <td className="px-4 py-4 capitalize">{monitor.provider}</td>
                        <td className="px-4 py-4">{monitor.primary_model}</td>
                        <td className="px-4 py-4 capitalize">{monitor.primary_status || 'unknown'}</td>
                        <td className="px-4 py-4">{monitor.primary_latency_ms != null ? `${monitor.primary_latency_ms} ms` : '—'}</td>
                        <td className="px-4 py-4">{monitor.availability_7d.toFixed(1)}%</td>
                        <td className="px-4 py-4">{formatDate(monitor.last_checked_at)}</td>
                        <td className="px-4 py-4">{monitor.enabled ? 'Yes' : 'No'}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="flex flex-col gap-3 rounded-3xl border border-slate-200 bg-slate-50 p-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-slate-600">Page {page} of {totalPages}</p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                  disabled={page === 1}
                  className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-slate-700 ring-1 ring-slate-200 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Previous
                </button>
                <button
                  type="button"
                  onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                  disabled={page === totalPages}
                  className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-slate-700 ring-1 ring-slate-200 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </PageShell>
  )
}
