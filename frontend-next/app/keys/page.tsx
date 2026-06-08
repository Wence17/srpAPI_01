'use client'

'use client'

import { useEffect, useMemo, useState } from 'react'
import PageShell from '@/components/PageShell'
import { useAuth } from '@/context/AuthContext'
import { keysAPI } from '@/lib/keys'
import type { ApiKey } from '@/lib/types'

function maskKey(key: string) {
  if (key.length <= 10) return key
  return `${key.slice(0, 4)}...${key.slice(-4)}`
}

function formatDate(value: string) {
  return new Date(value).toLocaleString()
}

export default function KeysPage() {
  const auth = useAuth()
  const [keys, setKeys] = useState<ApiKey[]>([])
  const [page, setPage] = useState(1)
  const [refreshIndex, setRefreshIndex] = useState(0)
  const [total, setTotal] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')

  const activeCount = useMemo(() => keys.filter((item) => item.status === 'active').length, [keys])
  const inactiveCount = useMemo(() => keys.filter((item) => item.status !== 'active').length, [keys])

  useEffect(() => {
    async function loadKeys() {
      setIsLoading(true)
      setError('')

      try {
        const response = await keysAPI.listKeys(page, 10)
        setKeys(response.items)
        setTotal(response.total)
      } catch (err) {
        console.error('Failed to load API keys:', err)
        setError('Unable to fetch API keys. Please refresh the page.')
      } finally {
        setIsLoading(false)
      }
    }

    loadKeys()
  }, [page, refreshIndex])

  return (
    <PageShell title="API Keys" description="Manage your user's API keys and review their status." path="/keys">
      <div className="space-y-6">
        {error ? (
          <div className="rounded-3xl border border-rose-200 bg-rose-50 p-6 text-rose-900">
            <p className="font-semibold">Unable to load keys</p>
            <p className="mt-2 text-sm text-slate-700">{error}</p>
          </div>
        ) : null}

        <div className="grid gap-6 lg:grid-cols-3">
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <p className="text-sm uppercase tracking-[0.24em] text-slate-500">Owner</p>
            <h2 className="mt-3 text-2xl font-semibold text-slate-900">{auth.user?.username || auth.user?.email || 'Current user'}</h2>
            <p className="mt-3 text-sm text-slate-600">Manage and review your personal API keys from one place.</p>
          </div>
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <p className="text-sm uppercase tracking-[0.24em] text-slate-500">Active keys</p>
            <p className="mt-3 text-3xl font-semibold text-slate-900">{activeCount}</p>
            <p className="mt-2 text-sm text-slate-600">Keys currently available for requests.</p>
          </div>
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <p className="text-sm uppercase tracking-[0.24em] text-slate-500">Inactive / other</p>
            <p className="mt-3 text-3xl font-semibold text-slate-900">{inactiveCount}</p>
            <p className="mt-2 text-sm text-slate-600">Keys that are offline, expired, or disabled.</p>
          </div>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-lg font-semibold text-slate-900">Your API keys</h3>
              <p className="mt-2 text-sm text-slate-600">A snapshot of the latest keys and their status.</p>
            </div>
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => setRefreshIndex((value) => value + 1)}
                disabled={isLoading}
                className="rounded-full bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Refresh
              </button>
              <button
                type="button"
                disabled
                className="rounded-full bg-brand-500 px-4 py-2 text-sm font-semibold text-white opacity-80"
              >
                Create key (coming soon)
              </button>
            </div>
          </div>

          <div className="mt-6 overflow-hidden rounded-3xl border border-slate-200">
            <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-4 py-3 font-medium text-slate-600">Name</th>
                  <th className="px-4 py-3 font-medium text-slate-600">Key</th>
                  <th className="px-4 py-3 font-medium text-slate-600">Status</th>
                  <th className="px-4 py-3 font-medium text-slate-600">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 bg-white">
                {isLoading ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-6 text-center text-sm text-slate-500">
                      Loading keys…
                    </td>
                  </tr>
                ) : keys.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-6 text-center text-sm text-slate-500">
                      No API keys found for this account.
                    </td>
                  </tr>
                ) : (
                  keys.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-50">
                      <td className="px-4 py-4 text-slate-800">{item.name || `Key ${item.id}`}</td>
                      <td className="px-4 py-4 text-slate-500">{maskKey(item.key)}</td>
                      <td className="px-4 py-4 text-slate-700">{item.status}</td>
                      <td className="px-4 py-4 text-slate-500">{formatDate(item.created_at)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="flex items-center justify-between rounded-3xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
          <span>{`Showing ${keys.length} of ${total} keys`}</span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={page <= 1 || isLoading}
              onClick={() => setPage((value) => Math.max(1, value - 1))}
              className="rounded-full border border-slate-200 bg-white px-3 py-2 text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Prev
            </button>
            <button
              type="button"
              disabled={isLoading || page * 10 >= total}
              onClick={() => setPage((value) => value + 1)}
              className="rounded-full border border-slate-200 bg-white px-3 py-2 text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </PageShell>
  )
}
