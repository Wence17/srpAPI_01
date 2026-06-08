'use client'

import { useEffect, useState } from 'react'
import PageShell from '@/components/PageShell'
import { adminProxiesAPI, type Proxy } from '@/lib/adminProxies'

const pageSize = 10

function formatDate(value?: string | null) {
  if (!value) return '—'
  return new Date(value).toLocaleString()
}

export default function ProxyManagementPage() {
  const [proxies, setProxies] = useState<Proxy[]>([])
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const controller = new AbortController()

    async function loadProxies() {
      setLoading(true)
      setError(null)

      try {
        const response = await adminProxiesAPI.list(page, pageSize, {
          search: search || undefined,
        }, {
          signal: controller.signal,
        })

        if (cancelled) return
        setProxies(response.items)
        setTotal(response.total)
      } catch (err) {
        if (cancelled) return
        setError((err as Error)?.message || 'Unable to load proxy list.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    loadProxies()
    return () => {
      cancelled = true
      controller.abort()
    }
  }, [page, search])

  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  return (
    <PageShell title="Proxy Management" description="Manage proxy settings" path="/admin/proxies">
      <div className="space-y-6">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-xl font-semibold text-slate-900">Proxy management</h2>
              <p className="mt-2 text-sm text-slate-600">
                Review and manage proxy servers used by your AI routing layer.
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search by host, protocol, or status"
                className="w-full rounded-2xl border border-slate-300 px-4 py-2 text-sm shadow-sm focus:border-brand-500 focus:ring-brand-200 sm:w-80"
              />
            </div>
          </div>
        </div>

        {loading ? (
          <div className="rounded-3xl border border-slate-200 bg-slate-50 p-8 text-center text-slate-600">
            Loading proxy configuration...
          </div>
        ) : error ? (
          <div className="rounded-3xl border border-rose-200 bg-rose-50 p-6 text-rose-700">
            <p className="font-semibold">Failed to load proxies</p>
            <p className="mt-2 text-sm">{error}</p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-3xl border border-slate-200 bg-slate-50 p-6">
              <p className="text-sm text-slate-500">Showing {proxies.length} of {total} proxies</p>
            </div>

            <div className="overflow-x-auto rounded-3xl border border-slate-200 bg-white shadow-sm">
              <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                <thead className="bg-slate-50 text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Host</th>
                    <th className="px-4 py-3">Protocol</th>
                    <th className="px-4 py-3">Port</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Accounts</th>
                    <th className="px-4 py-3">Last used</th>
                    <th className="px-4 py-3">Updated</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 bg-white text-slate-700">
                  {proxies.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-6 text-center text-slate-500">
                        No proxies found for the current filter.
                      </td>
                    </tr>
                  ) : (
                    proxies.map((proxy) => (
                      <tr key={proxy.id} className="odd:bg-slate-50">
                        <td className="px-4 py-4 font-medium text-slate-900">{proxy.host}</td>
                        <td className="px-4 py-4">{proxy.protocol}</td>
                        <td className="px-4 py-4">{proxy.port}</td>
                        <td className="px-4 py-4">
                          <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${proxy.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-700'}`}>
                            {proxy.status}
                          </span>
                        </td>
                        <td className="px-4 py-4">{proxy.account_count ?? '—'}</td>
                        <td className="px-4 py-4">{formatDate(proxy.last_used_at)}</td>
                        <td className="px-4 py-4">{formatDate(proxy.updated_at)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="flex flex-col gap-3 rounded-3xl border border-slate-200 bg-slate-50 p-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-slate-600">
                Page {page} of {totalPages}
              </p>
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
          </div>
        )}
      </div>
    </PageShell>
  )
}
