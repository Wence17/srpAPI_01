'use client'

import { useEffect, useState } from 'react'
import PageShell from '@/components/PageShell'
import { adminGroupsAPI, type AdminGroup, type GroupPlatform } from '@/lib/adminGroups'

const pageSize = 10
const platforms: Array<'all' | GroupPlatform> = ['all', 'openai', 'anthropic', 'gemini', 'antigravity']
const statuses = ['all', 'active', 'inactive'] as const

function formatDate(value?: string) {
  if (!value) return '—'
  return new Date(value).toLocaleString()
}

export default function GroupManagementPage() {
  const [groups, setGroups] = useState<AdminGroup[]>([])
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [search, setSearch] = useState('')
  const [platform, setPlatform] = useState<'all' | GroupPlatform>('all')
  const [status, setStatus] = useState<(typeof statuses)[number]>('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const controller = new AbortController()

    async function loadGroups() {
      setLoading(true)
      setError(null)

      try {
        const response = await adminGroupsAPI.list(page, pageSize, {
          search: search || undefined,
          platform: platform === 'all' ? undefined : platform,
          status: status === 'all' ? undefined : status,
          sort_by: 'updated_at',
          sort_order: 'desc',
        }, {
          signal: controller.signal,
        })

        if (cancelled) return
        setGroups(response.items)
        setTotal(response.total)
      } catch (err) {
        if (cancelled) return
        setError((err as Error)?.message || 'Unable to load group list.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    loadGroups()
    return () => {
      cancelled = true
      controller.abort()
    }
  }, [page, search, platform, status])

  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  return (
    <PageShell title="Group Management" description="Manage account groups" path="/admin/groups">
      <div className="space-y-6">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-xl font-semibold text-slate-900">Group management</h2>
              <p className="mt-2 text-sm text-slate-600">
                View account groups, platform routing, and status information for your admin-managed groups.
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search by group name"
                className="w-full rounded-2xl border border-slate-300 px-4 py-2 text-sm shadow-sm focus:border-brand-500 focus:ring-brand-200 sm:w-80"
              />
              <select
                value={platform}
                onChange={(event) => setPlatform(event.target.value as typeof platform)}
                className="rounded-2xl border border-slate-300 bg-white px-4 py-2 text-sm shadow-sm focus:border-brand-500 focus:ring-brand-200"
              >
                {platforms.map((option) => (
                  <option key={option} value={option}>
                    {option === 'all' ? 'All platforms' : option}
                  </option>
                ))}
              </select>
              <select
                value={status}
                onChange={(event) => setStatus(event.target.value as typeof status)}
                className="rounded-2xl border border-slate-300 bg-white px-4 py-2 text-sm shadow-sm focus:border-brand-500 focus:ring-brand-200"
              >
                {statuses.map((option) => (
                  <option key={option} value={option}>
                    {option === 'all' ? 'All statuses' : option}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="rounded-3xl border border-slate-200 bg-slate-50 p-8 text-center text-slate-600">
            Loading groups...
          </div>
        ) : error ? (
          <div className="rounded-3xl border border-rose-200 bg-rose-50 p-6 text-rose-700">
            <p className="font-semibold">Failed to load groups</p>
            <p className="mt-2 text-sm">{error}</p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-3xl border border-slate-200 bg-slate-50 p-6">
              <p className="text-sm text-slate-500">Showing {groups.length} of {total} groups</p>
            </div>

            <div className="overflow-x-auto rounded-3xl border border-slate-200 bg-white shadow-sm">
              <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                <thead className="bg-slate-50 text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Group</th>
                    <th className="px-4 py-3">Platform</th>
                    <th className="px-4 py-3">Subscription</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Exclusive</th>
                    <th className="px-4 py-3">Rate multiplier</th>
                    <th className="px-4 py-3">Accounts</th>
                    <th className="px-4 py-3">Updated</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 bg-white text-slate-700">
                  {groups.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-6 text-center text-slate-500">
                        No groups found for the current filter.
                      </td>
                    </tr>
                  ) : (
                    groups.map((group) => (
                      <tr key={group.id} className="odd:bg-slate-50">
                        <td className="px-4 py-4 font-medium text-slate-900">{group.name}</td>
                        <td className="px-4 py-4">{group.platform}</td>
                        <td className="px-4 py-4">{group.subscription_type}</td>
                        <td className="px-4 py-4">{group.status}</td>
                        <td className="px-4 py-4">{group.is_exclusive ? 'Yes' : 'No'}</td>
                        <td className="px-4 py-4">{group.rate_multiplier}</td>
                        <td className="px-4 py-4">{group.account_count ?? '—'}</td>
                        <td className="px-4 py-4">{formatDate(group.updated_at)}</td>
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
          </div>
        )}
      </div>
    </PageShell>
  )
}
