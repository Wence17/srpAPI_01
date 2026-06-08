'use client'

import { useEffect, useState } from 'react'
import PageShell from '@/components/PageShell'
import { adminUsersAPI, type AdminUser } from '@/lib/adminUsers'

const pageSize = 10

function formatDate(value?: string | null) {
  if (!value) return '—'
  return new Date(value).toLocaleString()
}

export default function UserManagementPage() {
  const [users, setUsers] = useState<AdminUser[]>([])
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<'all' | 'active' | 'disabled'>('all')
  const [role, setRole] = useState<'all' | 'admin' | 'user'>('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const controller = new AbortController()

    async function loadUsers() {
      setLoading(true)
      setError(null)

      try {
        const response = await adminUsersAPI.list(page, pageSize, {
          search: search || undefined,
          status: status === 'all' ? undefined : status,
          role: role === 'all' ? undefined : role,
        }, {
          signal: controller.signal,
        })

        if (cancelled) return
        setUsers(response.items)
        setTotal(response.total)
      } catch (err) {
        if (cancelled) return
        setError((err as Error)?.message || 'Unable to load users.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    loadUsers()
    return () => {
      cancelled = true
      controller.abort()
    }
  }, [page, search, status, role])

  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  return (
    <PageShell title="User Management" description="Manage registered users" path="/admin/users">
      <div className="space-y-6">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-xl font-semibold text-slate-900">User management</h2>
              <p className="mt-2 text-sm text-slate-600">
                Browse registered users and filter by status, role, or keyword.
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search email or username"
                className="w-full rounded-2xl border border-slate-300 px-4 py-2 text-sm shadow-sm focus:border-brand-500 focus:ring-brand-200 sm:w-80"
              />
              <select
                value={status}
                onChange={(event) => setStatus(event.target.value as typeof status)}
                className="rounded-2xl border border-slate-300 bg-white px-4 py-2 text-sm shadow-sm focus:border-brand-500 focus:ring-brand-200"
              >
                <option value="all">All statuses</option>
                <option value="active">Active</option>
                <option value="disabled">Disabled</option>
              </select>
              <select
                value={role}
                onChange={(event) => setRole(event.target.value as typeof role)}
                className="rounded-2xl border border-slate-300 bg-white px-4 py-2 text-sm shadow-sm focus:border-brand-500 focus:ring-brand-200"
              >
                <option value="all">All roles</option>
                <option value="admin">Admin</option>
                <option value="user">User</option>
              </select>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="rounded-3xl border border-slate-200 bg-slate-50 p-8 text-center text-slate-600">
            Loading users...
          </div>
        ) : error ? (
          <div className="rounded-3xl border border-rose-200 bg-rose-50 p-6 text-rose-700">
            <p className="font-semibold">Unable to load users</p>
            <p className="mt-2 text-sm">{error}</p>
          </div>
        ) : (
          <>
            <div className="rounded-3xl border border-slate-200 bg-slate-50 p-6">
              <p className="text-sm text-slate-500">Displaying {users.length} of {total} users</p>
            </div>

            <div className="overflow-x-auto rounded-3xl border border-slate-200 bg-white shadow-sm">
              <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                <thead className="bg-slate-50 text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Email</th>
                    <th className="px-4 py-3">Username</th>
                    <th className="px-4 py-3">Role</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Balance</th>
                    <th className="px-4 py-3">Concurrency</th>
                    <th className="px-4 py-3">Last active</th>
                    <th className="px-4 py-3">Created</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 bg-white text-slate-700">
                  {users.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-6 text-center text-slate-500">
                        No users matched the current filters.
                      </td>
                    </tr>
                  ) : (
                    users.map((user) => (
                      <tr key={user.id} className="odd:bg-slate-50">
                        <td className="px-4 py-4 font-medium text-slate-900">{user.email}</td>
                        <td className="px-4 py-4">{user.username}</td>
                        <td className="px-4 py-4">{user.role}</td>
                        <td className="px-4 py-4">{user.status}</td>
                        <td className="px-4 py-4">{user.balance ?? '—'}</td>
                        <td className="px-4 py-4">{user.concurrency ?? '—'}</td>
                        <td className="px-4 py-4">{formatDate(user.last_active_at)}</td>
                        <td className="px-4 py-4">{formatDate(user.created_at)}</td>
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
