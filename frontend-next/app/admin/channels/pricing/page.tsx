'use client'

import { useEffect, useState } from 'react'
import PageShell from '@/components/PageShell'
import { adminChannelsAPI, type Channel, type ChannelStatus } from '@/lib/adminChannels'

const pageSize = 10

function formatDate(value?: string | null) {
  if (!value) return '—'
  return new Date(value).toLocaleString()
}

export default function ChannelManagementPage() {
  const [channels, setChannels] = useState<Channel[]>([])
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [status, setStatus] = useState<ChannelStatus | 'all'>('all')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const controller = new AbortController()

    async function loadChannels() {
      setLoading(true)
      setError(null)

      try {
        const response = await adminChannelsAPI.list(page, pageSize, {
          status: status === 'all' ? undefined : status,
          search: search.trim() || undefined,
        }, {
          signal: controller.signal,
        })

        if (cancelled) return
        setChannels(response.items)
        setTotal(response.total)
      } catch (err) {
        if (cancelled) return
        setError((err as Error)?.message || 'Unable to load channels.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    loadChannels()
    return () => {
      cancelled = true
      controller.abort()
    }
  }, [page, status, search])

  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  return (
    <PageShell title="Channel Management" description="Manage pricing channels" path="/admin/channels/pricing">
      <div className="space-y-6">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-xl font-semibold text-slate-900">Channel pricing</h2>
              <p className="mt-2 text-sm text-slate-600">
                Browse and filter pricing channels configured for upstream AI providers.
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <input
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value)
                  setPage(1)
                }}
                placeholder="Search channels"
                className="w-full rounded-2xl border border-slate-300 px-4 py-2 text-sm shadow-sm focus:border-brand-500 focus:ring-brand-200 sm:w-80"
              />
              <select
                value={status}
                onChange={(event) => {
                  setStatus(event.target.value as ChannelStatus | 'all')
                  setPage(1)
                }}
                className="rounded-2xl border border-slate-300 bg-white px-4 py-2 text-sm shadow-sm focus:border-brand-500 focus:ring-brand-200"
              >
                <option value="all">All statuses</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
                <option value="disabled">Disabled</option>
              </select>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="rounded-3xl border border-slate-200 bg-slate-50 p-8 text-center text-slate-600">
            Loading pricing channels...
          </div>
        ) : error ? (
          <div className="rounded-3xl border border-rose-200 bg-rose-50 p-6 text-rose-700">
            <p className="font-semibold">Unable to load channels</p>
            <p className="mt-2 text-sm">{error}</p>
          </div>
        ) : (
          <>
            <div className="rounded-3xl border border-slate-200 bg-slate-50 p-6">
              <p className="text-sm text-slate-500">Showing {channels.length} of {total} channels</p>
            </div>

            <div className="overflow-x-auto rounded-3xl border border-slate-200 bg-white shadow-sm">
              <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                <thead className="bg-slate-50 text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Name</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Billing source</th>
                    <th className="px-4 py-3">Groups</th>
                    <th className="px-4 py-3">Pricing rules</th>
                    <th className="px-4 py-3">Updated</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 bg-white text-slate-700">
                  {channels.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-6 text-center text-slate-500">
                        No channels match the current filters.
                      </td>
                    </tr>
                  ) : (
                    channels.map((channel) => (
                      <tr key={channel.id} className="odd:bg-slate-50">
                        <td className="px-4 py-4 font-medium text-slate-900">{channel.name}</td>
                        <td className="px-4 py-4 capitalize">{channel.status}</td>
                        <td className="px-4 py-4">{channel.billing_model_source}</td>
                        <td className="px-4 py-4">{channel.group_ids.length}</td>
                        <td className="px-4 py-4">{Array.isArray(channel.model_pricing) ? channel.model_pricing.length : 0}</td>
                        <td className="px-4 py-4">{formatDate(channel.updated_at)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="flex flex-col gap-3 rounded-3xl border border-slate-200 bg-slate-50 p-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-slate-600">Page {page} of {Math.max(1, Math.ceil(total / pageSize))}</p>
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
                  onClick={() => setPage((current) => Math.min(Math.max(1, Math.ceil(total / pageSize)), current + 1))}
                  disabled={page >= Math.max(1, Math.ceil(total / pageSize))}
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
