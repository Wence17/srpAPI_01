'use client'

import { useEffect, useMemo, useState } from 'react'
import PageShell from '@/components/PageShell'
import { adminSubscriptionsAPI, type SubscriptionStatus } from '@/lib/adminSubscriptions'
import type { UserSubscription } from '@/lib/types'

const pageSize = 10

function formatDate(value?: string | null) {
  if (!value) return '—'
  return new Date(value).toLocaleString()
}

function formatUsd(value: number) {
  return `$${value.toFixed(2)}`
}

export default function SubscriptionManagementPage() {
  const [subscriptions, setSubscriptions] = useState<UserSubscription[]>([])
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [status, setStatus] = useState<SubscriptionStatus | 'all'>('all')
  const [userId, setUserId] = useState('')
  const [groupId, setGroupId] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const controller = new AbortController()

    async function loadSubscriptions() {
      setLoading(true)
      setError(null)

      try {
        const response = await adminSubscriptionsAPI.list(page, pageSize, {
          status: status === 'all' ? undefined : status,
          user_id: userId.trim() ? Number(userId.trim()) : undefined,
          group_id: groupId.trim() ? Number(groupId.trim()) : undefined,
        }, {
          signal: controller.signal,
        })

        if (cancelled) return
        setSubscriptions(response.items)
        setTotal(response.total)
      } catch (err) {
        if (cancelled) return
        setError((err as Error)?.message || 'Unable to load subscriptions.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    loadSubscriptions()
    return () => {
      cancelled = true
      controller.abort()
    }
  }, [page, status, userId, groupId])

  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const currentFilters = useMemo(() => {
    const filters: string[] = []
    if (status !== 'all') filters.push(`Status: ${status}`)
    if (userId.trim()) filters.push(`User ID: ${userId.trim()}`)
    if (groupId.trim()) filters.push(`Group ID: ${groupId.trim()}`)
    return filters
  }, [status, userId, groupId])

  return (
    <PageShell title="Subscription Management" description="Manage subscriptions" path="/admin/subscriptions">
      <div className="space-y-6">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-xl font-semibold text-slate-900">Subscription management</h2>
              <p className="mt-2 text-sm text-slate-600">
                Browse active subscriptions, filter by status, user, or group, and inspect usage details.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <select
                value={status}
                onChange={(event) => {
                  setStatus(event.target.value as SubscriptionStatus | 'all')
                  setPage(1)
                }}
                className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-2 text-sm shadow-sm focus:border-brand-500 focus:ring-brand-200"
              >
                <option value="all">All statuses</option>
                <option value="active">Active</option>
                <option value="expired">Expired</option>
                <option value="revoked">Revoked</option>
              </select>
              <input
                type="number"
                value={userId}
                onChange={(event) => {
                  setUserId(event.target.value)
                  setPage(1)
                }}
                placeholder="Filter by user ID"
                className="w-full rounded-2xl border border-slate-300 px-4 py-2 text-sm shadow-sm focus:border-brand-500 focus:ring-brand-200"
              />
              <input
                type="number"
                value={groupId}
                onChange={(event) => {
                  setGroupId(event.target.value)
                  setPage(1)
                }}
                placeholder="Filter by group ID"
                className="w-full rounded-2xl border border-slate-300 px-4 py-2 text-sm shadow-sm focus:border-brand-500 focus:ring-brand-200"
              />
            </div>
          </div>
        </div>

        {loading ? (
          <div className="rounded-3xl border border-slate-200 bg-slate-50 p-8 text-center text-slate-600">
            Loading subscriptions...
          </div>
        ) : error ? (
          <div className="rounded-3xl border border-rose-200 bg-rose-50 p-6 text-rose-700">
            <p className="font-semibold">Unable to load subscriptions</p>
            <p className="mt-2 text-sm">{error}</p>
          </div>
        ) : (
          <>
            <div className="rounded-3xl border border-slate-200 bg-slate-50 p-6">
              <p className="text-sm text-slate-500">Showing {subscriptions.length} of {total} subscriptions</p>
              {currentFilters.length > 0 ? (
                <p className="mt-2 text-sm text-slate-600">Filtered by {currentFilters.join(', ')}</p>
              ) : null}
            </div>

            <div className="overflow-x-auto rounded-3xl border border-slate-200 bg-white shadow-sm">
              <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                <thead className="bg-slate-50 text-slate-500">
                  <tr>
                    <th className="px-4 py-3">ID</th>
                    <th className="px-4 py-3">User</th>
                    <th className="px-4 py-3">Group</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Started</th>
                    <th className="px-4 py-3">Expires</th>
                    <th className="px-4 py-3">Daily</th>
                    <th className="px-4 py-3">Weekly</th>
                    <th className="px-4 py-3">Monthly</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 bg-white text-slate-700">
                  {subscriptions.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="px-4 py-6 text-center text-slate-500">
                        No subscriptions found for the current filters.
                      </td>
                    </tr>
                  ) : (
                    subscriptions.map((subscription) => (
                      <tr key={subscription.id} className="odd:bg-slate-50">
                        <td className="px-4 py-4 font-medium text-slate-900">#{subscription.id}</td>
                        <td className="px-4 py-4">
                          {subscription.user?.username ?? subscription.user?.email ?? `#${subscription.user_id}`}
                        </td>
                        <td className="px-4 py-4">{subscription.group?.name ?? `#${subscription.group_id}`}</td>
                        <td className="px-4 py-4 capitalize">{subscription.status}</td>
                        <td className="px-4 py-4">{formatDate(subscription.starts_at)}</td>
                        <td className="px-4 py-4">{formatDate(subscription.expires_at)}</td>
                        <td className="px-4 py-4">{formatUsd(subscription.daily_usage_usd)}</td>
                        <td className="px-4 py-4">{formatUsd(subscription.weekly_usage_usd)}</td>
                        <td className="px-4 py-4">{formatUsd(subscription.monthly_usage_usd)}</td>
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
