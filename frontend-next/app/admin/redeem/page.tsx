'use client'

import { useEffect, useState } from 'react'
import PageShell from '@/components/PageShell'
import { adminRedeemAPI, type RedeemCode, type RedeemCodeStatus, type RedeemCodeType } from '@/lib/adminRedeem'

const pageSize = 10
const redeemTypes: RedeemCodeType[] = ['balance', 'concurrency', 'subscription', 'invitation']
const redeemStatuses: RedeemCodeStatus[] = ['active', 'unused', 'used', 'expired', 'disabled']

function formatDate(value?: string | null) {
  if (!value) return '—'
  return new Date(value).toLocaleString()
}

export default function RedeemCodeManagementPage() {
  const [codes, setCodes] = useState<RedeemCode[]>([])
  const [stats, setStats] = useState<null | {
    total_codes: number
    active_codes: number
    used_codes: number
    expired_codes: number
    total_value_distributed: number
    by_type: Record<RedeemCodeType, number>
  }>(null)
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<'all' | RedeemCodeType>('all')
  const [statusFilter, setStatusFilter] = useState<'all' | RedeemCodeStatus>('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const controller = new AbortController()

    async function loadData() {
      setLoading(true)
      setError(null)

      try {
        const [listResponse, statsResponse] = await Promise.all([
          adminRedeemAPI.list(page, pageSize, {
            search: search || undefined,
            type: typeFilter === 'all' ? undefined : typeFilter,
            status: statusFilter === 'all' ? undefined : statusFilter,
            sort_by: 'created_at',
            sort_order: 'desc',
          }, {
            signal: controller.signal,
          }),
          adminRedeemAPI.getStats(),
        ])

        if (cancelled) return
        setCodes(listResponse.items)
        setTotal(listResponse.total)
        setStats(statsResponse)
      } catch (err) {
        if (cancelled) return
        setError((err as Error)?.message || 'Unable to load redeem codes.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    loadData()
    return () => {
      cancelled = true
      controller.abort()
    }
  }, [page, search, typeFilter, statusFilter])

  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  return (
    <PageShell title="Redeem Code Management" description="Manage redeem codes" path="/admin/redeem">
      <div className="space-y-6">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-xl font-semibold text-slate-900">Redeem code management</h2>
              <p className="mt-2 text-sm text-slate-600">
                Browse redeem codes created for balance, concurrency, subscriptions, and invitations.
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search by code or notes"
                className="w-full rounded-2xl border border-slate-300 px-4 py-2 text-sm shadow-sm focus:border-brand-500 focus:ring-brand-200 sm:w-80"
              />
              <select
                value={typeFilter}
                onChange={(event) => setTypeFilter(event.target.value as typeof typeFilter)}
                className="rounded-2xl border border-slate-300 bg-white px-4 py-2 text-sm shadow-sm focus:border-brand-500 focus:ring-brand-200"
              >
                <option value="all">All types</option>
                {redeemTypes.map((type) => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </select>
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}
                className="rounded-2xl border border-slate-300 bg-white px-4 py-2 text-sm shadow-sm focus:border-brand-500 focus:ring-brand-200"
              >
                <option value="all">All statuses</option>
                {redeemStatuses.map((status) => (
                  <option key={status} value={status}>{status}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="rounded-3xl border border-slate-200 bg-slate-50 p-8 text-center text-slate-600">
            Loading redeem codes...
          </div>
        ) : error ? (
          <div className="rounded-3xl border border-rose-200 bg-rose-50 p-6 text-rose-700">
            <p className="font-semibold">Failed to load redeem codes</p>
            <p className="mt-2 text-sm">{error}</p>
          </div>
        ) : (
          <>
            {stats ? (
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="rounded-3xl border border-slate-200 bg-slate-50 p-6">
                  <p className="text-sm text-slate-500">Total codes</p>
                  <p className="mt-2 text-3xl font-semibold text-slate-900">{stats.total_codes}</p>
                </div>
                <div className="rounded-3xl border border-slate-200 bg-slate-50 p-6">
                  <p className="text-sm text-slate-500">Active codes</p>
                  <p className="mt-2 text-3xl font-semibold text-slate-900">{stats.active_codes}</p>
                </div>
                <div className="rounded-3xl border border-slate-200 bg-slate-50 p-6">
                  <p className="text-sm text-slate-500">Distributed value</p>
                  <p className="mt-2 text-3xl font-semibold text-slate-900">{stats.total_value_distributed}</p>
                </div>
              </div>
            ) : null}

            <div className="rounded-3xl border border-slate-200 bg-slate-50 p-6">
              <p className="text-sm text-slate-500">Showing {codes.length} of {total} redeem codes</p>
            </div>

            <div className="overflow-x-auto rounded-3xl border border-slate-200 bg-white shadow-sm">
              <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                <thead className="bg-slate-50 text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Code</th>
                    <th className="px-4 py-3">Type</th>
                    <th className="px-4 py-3">Value</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Used by</th>
                    <th className="px-4 py-3">Used at</th>
                    <th className="px-4 py-3">Expires</th>
                    <th className="px-4 py-3">Updated</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 bg-white text-slate-700">
                  {codes.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-6 text-center text-slate-500">
                        No redeem codes found for the current filter.
                      </td>
                    </tr>
                  ) : (
                    codes.map((code) => (
                      <tr key={code.id} className="odd:bg-slate-50">
                        <td className="px-4 py-4 font-medium text-slate-900">{code.code}</td>
                        <td className="px-4 py-4">{code.type}</td>
                        <td className="px-4 py-4">{code.value}</td>
                        <td className="px-4 py-4">{code.status}</td>
                        <td className="px-4 py-4">{code.user?.email ?? code.used_by ?? '—'}</td>
                        <td className="px-4 py-4">{formatDate(code.used_at)}</td>
                        <td className="px-4 py-4">{formatDate(code.expires_at)}</td>
                        <td className="px-4 py-4">{formatDate(code.updated_at)}</td>
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
