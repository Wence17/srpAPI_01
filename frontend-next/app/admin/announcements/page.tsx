'use client'

import { useEffect, useState } from 'react'
import PageShell from '@/components/PageShell'
import { adminAnnouncementsAPI, type Announcement, type AnnouncementStatus } from '@/lib/adminAnnouncements'

const pageSize = 10
const statuses: Array<'all' | AnnouncementStatus> = ['all', 'draft', 'active', 'archived']

function formatDate(value?: string) {
  if (!value) return '—'
  return new Date(value).toLocaleString()
}

export default function AnnouncementManagementPage() {
  const [announcements, setAnnouncements] = useState<Announcement[]>([])
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<'all' | AnnouncementStatus>('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const controller = new AbortController()

    async function loadAnnouncements() {
      setLoading(true)
      setError(null)

      try {
        const response = await adminAnnouncementsAPI.list(page, pageSize, {
          search: search || undefined,
          status: status === 'all' ? undefined : status,
          sort_by: 'created_at',
          sort_order: 'desc',
        }, {
          signal: controller.signal,
        })

        if (cancelled) return
        setAnnouncements(response.items)
        setTotal(response.total)
      } catch (err) {
        if (cancelled) return
        setError((err as Error)?.message || 'Unable to load announcements.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    loadAnnouncements()
    return () => {
      cancelled = true
      controller.abort()
    }
  }, [page, search, status])

  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  return (
    <PageShell title="Announcements" description="Manage announcements" path="/admin/announcements">
      <div className="space-y-6">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-xl font-semibold text-slate-900">Announcement management</h2>
              <p className="mt-2 text-sm text-slate-600">
                Review announcements created for users, including draft, active, and archived messages.
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search by title or content"
                className="w-full rounded-2xl border border-slate-300 px-4 py-2 text-sm shadow-sm focus:border-brand-500 focus:ring-brand-200 sm:w-80"
              />
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
            Loading announcements...
          </div>
        ) : error ? (
          <div className="rounded-3xl border border-rose-200 bg-rose-50 p-6 text-rose-700">
            <p className="font-semibold">Failed to load announcements</p>
            <p className="mt-2 text-sm">{error}</p>
          </div>
        ) : (
          <>
            <div className="rounded-3xl border border-slate-200 bg-slate-50 p-6">
              <p className="text-sm text-slate-500">Showing {announcements.length} of {total} announcements</p>
            </div>

            <div className="overflow-x-auto rounded-3xl border border-slate-200 bg-white shadow-sm">
              <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                <thead className="bg-slate-50 text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Title</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Notify mode</th>
                    <th className="px-4 py-3">Starts</th>
                    <th className="px-4 py-3">Ends</th>
                    <th className="px-4 py-3">Updated</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 bg-white text-slate-700">
                  {announcements.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-6 text-center text-slate-500">
                        No announcements found for the current filter.
                      </td>
                    </tr>
                  ) : (
                    announcements.map((item) => (
                      <tr key={item.id} className="odd:bg-slate-50">
                        <td className="px-4 py-4 font-medium text-slate-900">{item.title}</td>
                        <td className="px-4 py-4">{item.status}</td>
                        <td className="px-4 py-4">{item.notify_mode}</td>
                        <td className="px-4 py-4">{formatDate(item.starts_at)}</td>
                        <td className="px-4 py-4">{formatDate(item.ends_at)}</td>
                        <td className="px-4 py-4">{formatDate(item.updated_at)}</td>
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
