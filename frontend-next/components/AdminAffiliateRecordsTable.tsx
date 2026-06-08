'use client'

import { useEffect, useMemo, useState } from 'react'
import { adminAffiliatesAPI, type AffiliateInviteRecord, type AffiliateRebateRecord, type AffiliateTransferRecord, type AffiliateUserOverview } from '@/lib/adminAffiliates'

type RecordType = 'invites' | 'rebates' | 'transfers'

type AffiliateRecord = AffiliateInviteRecord | AffiliateRebateRecord | AffiliateTransferRecord

function formatDate(value?: string | null) {
  if (!value) return '—'
  return new Date(value).toLocaleString()
}

function formatCurrency(value?: number | null) {
  if (value == null) return '$0.00'
  return `$${value.toFixed(2)}`
}

interface AdminAffiliateRecordsTableProps {
  type: RecordType
}

export default function AdminAffiliateRecordsTable({ type }: AdminAffiliateRecordsTableProps) {
  const [records, setRecords] = useState<AffiliateRecord[]>([])
  const [page, setPage] = useState(1)
  const [pageSize] = useState(20)
  const [total, setTotal] = useState(0)
  const [search, setSearch] = useState('')
  const [startAt, setStartAt] = useState('')
  const [endAt, setEndAt] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refreshIndex, setRefreshIndex] = useState(0)
  const [overviewOpen, setOverviewOpen] = useState(false)
  const [overviewLoading, setOverviewLoading] = useState(false)
  const [selectedOverview, setSelectedOverview] = useState<AffiliateUserOverview | null>(null)

  const columns = useMemo(() => {
    if (type === 'invites') {
      return [
        { label: 'Inviter', key: 'inviter' },
        { label: 'Invitee', key: 'invitee' },
        { label: 'Affiliate code', key: 'aff_code' },
        { label: 'Total rebate', key: 'total_rebate' },
        { label: 'Invited at', key: 'created_at' },
      ]
    }

    if (type === 'rebates') {
      return [
        { label: 'Order', key: 'order' },
        { label: 'Inviter', key: 'inviter' },
        { label: 'Invitee', key: 'invitee' },
        { label: 'Order amount', key: 'order_amount' },
        { label: 'Paid amount', key: 'pay_amount' },
        { label: 'Rebate amount', key: 'rebate_amount' },
        { label: 'Payment type', key: 'payment_type' },
        { label: 'Order status', key: 'order_status' },
        { label: 'Rebated at', key: 'created_at' },
      ]
    }

    return [
      { label: 'User', key: 'user' },
      { label: 'Amount', key: 'amount' },
      { label: 'Balance after', key: 'balance_after' },
      { label: 'Available quota after', key: 'available_quota_after' },
      { label: 'Frozen quota after', key: 'frozen_quota_after' },
      { label: 'History quota after', key: 'history_quota_after' },
      { label: 'Transferred at', key: 'created_at' },
    ]
  }, [type])

  useEffect(() => {
    let cancelled = false
    const controller = new AbortController()

    async function loadRecords() {
      setLoading(true)
      setError(null)

      try {
        const params = {
          page,
          page_size: pageSize,
          search: search.trim() || undefined,
          start_at: startAt || undefined,
          end_at: endAt || undefined,
          sort_by: 'created_at',
          sort_order: 'desc' as const,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        }

        const response =
          type === 'invites'
            ? await adminAffiliatesAPI.listInviteRecords(params, { signal: controller.signal })
            : type === 'rebates'
            ? await adminAffiliatesAPI.listRebateRecords(params, { signal: controller.signal })
            : await adminAffiliatesAPI.listTransferRecords(params, { signal: controller.signal })

        if (cancelled) return

        setRecords(response.items)
        setTotal(response.total)
      } catch (err) {
        if (cancelled) return
        setError((err as Error)?.message || 'Unable to load affiliate records.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    loadRecords()
    return () => {
      cancelled = true
      controller.abort()
    }
  }, [page, pageSize, search, startAt, endAt, refreshIndex, type])

  async function openUserOverview(userId: number) {
    if (!userId) return
    setOverviewOpen(true)
    setOverviewLoading(true)
    setSelectedOverview(null)

    try {
      const overview = await adminAffiliatesAPI.getUserOverview(userId)
      setSelectedOverview(overview)
    } catch (err) {
      setError((err as Error)?.message || 'Unable to load user overview.')
      setOverviewOpen(false)
    } finally {
      setOverviewLoading(false)
    }
  }

  function closeOverview() {
    setOverviewOpen(false)
    setSelectedOverview(null)
    setOverviewLoading(false)
  }

  useEffect(() => {
    if (!overviewOpen) return

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        closeOverview()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [overviewOpen])

  function renderUserCell(userId: number, email: string, username: string, clickable: boolean) {
    const content = (
      <>
        <div className="font-medium text-slate-900">#{userId} {email}</div>
        <div className="text-sm text-slate-600">{username}</div>
      </>
    )

    if (!clickable) {
      return <div className="space-y-0.5">{content}</div>
    }

    return (
      <button
        type="button"
        onClick={() => openUserOverview(userId)}
        className="w-full text-left text-slate-900 transition hover:text-slate-700"
      >
        <div className="space-y-0.5">
          {content}
        </div>
      </button>
    )
  }

  function formatPercent(value?: number | null) {
    if (value == null) return '0%'
    return `${value}%`
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-xl font-semibold text-slate-900">
              {type === 'invites'
                ? 'Affiliate Invite Records'
                : type === 'rebates'
                ? 'Affiliate Rebate Records'
                : 'Affiliate Transfer Records'}
            </h2>
            <p className="mt-2 text-sm text-slate-600">
              Browse admin affiliate records and filter by search or date range.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setRefreshIndex((prev) => prev + 1)}
            className="inline-flex items-center justify-center rounded-2xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
          >
            Refresh
          </button>
        </div>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="grid gap-3 sm:grid-cols-3">
          <input
            type="text"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value)
              setPage(1)
            }}
            placeholder="Search affiliate records"
            className="w-full rounded-2xl border border-slate-300 px-4 py-2 text-sm shadow-sm focus:border-brand-500 focus:ring-brand-200"
          />
          <input
            type="date"
            value={startAt}
            onChange={(event) => {
              setStartAt(event.target.value)
              setPage(1)
            }}
            className="w-full rounded-2xl border border-slate-300 px-4 py-2 text-sm shadow-sm focus:border-brand-500 focus:ring-brand-200"
          />
          <input
            type="date"
            value={endAt}
            onChange={(event) => {
              setEndAt(event.target.value)
              setPage(1)
            }}
            className="w-full rounded-2xl border border-slate-300 px-4 py-2 text-sm shadow-sm focus:border-brand-500 focus:ring-brand-200"
          />
        </div>
      </div>

      {loading ? (
        <div className="rounded-3xl border border-slate-200 bg-slate-50 p-8 text-center text-slate-600">
          Loading affiliate records...
        </div>
      ) : error ? (
        <div className="rounded-3xl border border-rose-200 bg-rose-50 p-6 text-rose-700">
          <p className="font-semibold">Unable to load records</p>
          <p className="mt-2 text-sm">{error}</p>
        </div>
      ) : (
        <>
          <div className="overflow-x-auto rounded-3xl border border-slate-200 bg-white shadow-sm">
            <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  {columns.map((column) => (
                    <th key={column.key} className="px-4 py-3">
                      {column.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 bg-white text-slate-700">
                {records.length === 0 ? (
                  <tr>
                    <td colSpan={columns.length} className="px-4 py-6 text-center text-slate-500">
                      No records match the current filters.
                    </td>
                  </tr>
                ) : (
                  records.map((record, index) => {
                    if (type === 'invites') {
                      const item = record as AffiliateInviteRecord
                      return (
                        <tr key={`${item.inviter_id}-${item.invitee_id}-${index}`} className="odd:bg-slate-50">
                          <td className="px-4 py-4 font-medium text-slate-900">
                            {renderUserCell(item.inviter_id, item.inviter_email, item.inviter_username, true)}
                          </td>
                          <td className="px-4 py-4">
                            {renderUserCell(item.invitee_id, item.invitee_email, item.invitee_username, true)}
                          </td>
                          <td className="px-4 py-4 font-mono text-sm text-slate-700">{item.aff_code || '—'}</td>
                          <td className="px-4 py-4">{formatCurrency(item.total_rebate)}</td>
                          <td className="px-4 py-4">{formatDate(item.created_at)}</td>
                        </tr>
                      )
                    }

                    if (type === 'rebates') {
                      const item = record as AffiliateRebateRecord
                      return (
                        <tr key={`${item.order_id}-${index}`} className="odd:bg-slate-50">
                          <td className="px-4 py-4 font-mono text-sm text-slate-900">#{item.order_id}</td>
                          <td className="px-4 py-4">
                            {renderUserCell(item.inviter_id, item.inviter_email, item.inviter_username, true)}
                          </td>
                          <td className="px-4 py-4">
                            {renderUserCell(item.invitee_id, item.invitee_email, item.invitee_username, true)}
                          </td>
                          <td className="px-4 py-4">{formatCurrency(item.order_amount)}</td>
                          <td className="px-4 py-4">{formatCurrency(item.pay_amount)}</td>
                          <td className="px-4 py-4 font-semibold text-emerald-600">{formatCurrency(item.rebate_amount)}</td>
                          <td className="px-4 py-4 capitalize">{item.payment_type || '—'}</td>
                          <td className="px-4 py-4 capitalize">{item.order_status || '—'}</td>
                          <td className="px-4 py-4">{formatDate(item.created_at)}</td>
                        </tr>
                      )
                    }

                    const item = record as AffiliateTransferRecord
                    return (
                      <tr key={`${item.ledger_id}-${index}`} className="odd:bg-slate-50">
                        <td className="px-4 py-4 font-medium text-slate-900">
                          {renderUserCell(item.user_id, item.user_email, item.username, true)}
                        </td>
                        <td className="px-4 py-4 font-semibold text-emerald-600">{formatCurrency(item.amount)}</td>
                        <td className="px-4 py-4">{item.balance_after != null ? formatCurrency(item.balance_after) : '—'}</td>
                        <td className="px-4 py-4">{item.available_quota_after != null ? formatCurrency(item.available_quota_after) : '—'}</td>
                        <td className="px-4 py-4">{item.frozen_quota_after != null ? formatCurrency(item.frozen_quota_after) : '—'}</td>
                        <td className="px-4 py-4">{item.history_quota_after != null ? formatCurrency(item.history_quota_after) : '—'}</td>
                        <td className="px-4 py-4">{formatDate(item.created_at)}</td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>

          <div className="flex flex-col gap-3 rounded-3xl border border-slate-200 bg-slate-50 p-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-slate-600">
              Showing {records.length} of {total} records
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
              <span className="text-sm text-slate-600">
                Page {page} of {totalPages}
              </span>
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

      {overviewOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
          onClick={(event) => {
            if (event.currentTarget === event.target) {
              closeOverview()
            }
          }}
        >
          <div className="w-full max-w-3xl overflow-hidden rounded-3xl bg-white shadow-2xl">
            <div className="flex items-start justify-between border-b border-slate-200 px-6 py-4">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">Affiliate User Overview</h3>
                <p className="text-sm text-slate-600">View affiliate details for the selected user.</p>
              </div>
              <button
                type="button"
                onClick={() => setOverviewOpen(false)}
                className="rounded-full bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-200"
              >
                Close
              </button>
            </div>
            <div className="p-6">
              {overviewLoading ? (
                <div className="flex justify-center py-10">
                  <div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-900 border-t-transparent" />
                </div>
              ) : selectedOverview ? (
                <div className="space-y-6">
                  <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
                    <div className="font-mono text-sm text-slate-900">#{selectedOverview.user_id}</div>
                    <div className="mt-1 text-sm font-medium text-slate-900">{selectedOverview.email}</div>
                    <div className="text-sm text-slate-600">{selectedOverview.username}</div>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="rounded-3xl border border-slate-200 bg-white p-4">
                      <p className="text-sm text-slate-500">Affiliate Code</p>
                      <p className="mt-2 font-mono text-lg text-slate-900">{selectedOverview.aff_code || '—'}</p>
                    </div>
                    <div className="rounded-3xl border border-slate-200 bg-white p-4">
                      <p className="text-sm text-slate-500">Rebate Rate</p>
                      <p className="mt-2 text-lg font-semibold text-slate-900">{formatPercent(selectedOverview.rebate_rate_percent)}</p>
                    </div>
                    <div className="rounded-3xl border border-slate-200 bg-white p-4">
                      <p className="text-sm text-slate-500">Invited Count</p>
                      <p className="mt-2 text-lg font-semibold text-slate-900">{selectedOverview.invited_count}</p>
                    </div>
                    <div className="rounded-3xl border border-slate-200 bg-white p-4">
                      <p className="text-sm text-slate-500">Rebated Invitees</p>
                      <p className="mt-2 text-lg font-semibold text-slate-900">{selectedOverview.rebated_invitee_count}</p>
                    </div>
                    <div className="rounded-3xl border border-slate-200 bg-white p-4">
                      <p className="text-sm text-slate-500">Available Quota</p>
                      <p className="mt-2 text-lg font-semibold text-slate-900">{formatCurrency(selectedOverview.available_quota)}</p>
                    </div>
                    <div className="rounded-3xl border border-slate-200 bg-white p-4">
                      <p className="text-sm text-slate-500">History Quota</p>
                      <p className="mt-2 text-lg font-semibold text-slate-900">{formatCurrency(selectedOverview.history_quota)}</p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="rounded-3xl border border-slate-200 bg-slate-50 p-8 text-center text-slate-600">No user overview available.</div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
