'use client'

'use client'

import { useEffect, useState } from 'react'
import PageShell from '@/components/PageShell'
import { usageAPI, type UsageLogItem } from '@/lib/usage'

function formatNumber(value: number | undefined) {
  return value !== undefined ? new Intl.NumberFormat('en-US').format(value) : '0'
}

function formatDate(value: string) {
  return new Date(value).toLocaleString()
}

export default function UsagePage() {
  const [usageLog, setUsageLog] = useState<UsageLogItem[]>([])
  const [page, setPage] = useState(1)
  const [refreshIndex, setRefreshIndex] = useState(0)
  const [total, setTotal] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    async function loadUsage() {
      setIsLoading(true)
      setError('')

      try {
        const response = await usageAPI.listUsage(page, 10)
        setUsageLog(response.items)
        setTotal(response.total)
      } catch (err) {
        console.error('Failed to load usage records:', err)
        setError('Unable to fetch usage data. Please refresh the page.')
      } finally {
        setIsLoading(false)
      }
    }

    loadUsage()
  }, [page, refreshIndex])

  return (
    <PageShell title="Usage Records" description="Review your API request history and cost details." path="/usage">
      <div className="space-y-6">
        {error ? (
          <div className="rounded-3xl border border-rose-200 bg-rose-50 p-6 text-rose-900">
            <p className="font-semibold">Unable to load usage</p>
            <p className="mt-2 text-sm text-slate-700">{error}</p>
          </div>
        ) : null}

        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-2xl font-semibold text-slate-900">Recent usage</h2>
              <p className="mt-2 text-sm text-slate-600">Showing the latest API usage for your account.</p>
            </div>
            <button
              type="button"
              onClick={() => setRefreshIndex((value) => value + 1)}
              disabled={isLoading}
              className="rounded-full bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Refresh
            </button>
          </div>

          <div className="mt-6 overflow-hidden rounded-3xl border border-slate-200">
            <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-4 py-3 font-medium text-slate-600">Time</th>
                  <th className="px-4 py-3 font-medium text-slate-600">Model</th>
                  <th className="px-4 py-3 font-medium text-slate-600">Tokens</th>
                  <th className="px-4 py-3 font-medium text-slate-600">Cost</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 bg-white">
                {isLoading ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-6 text-center text-sm text-slate-500">
                      Loading usage records…
                    </td>
                  </tr>
                ) : usageLog.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-6 text-center text-sm text-slate-500">
                      No usage records found for the selected date range.
                    </td>
                  </tr>
                ) : (
                  usageLog.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-50">
                      <td className="px-4 py-4 text-slate-700">{formatDate(item.created_at)}</td>
                      <td className="px-4 py-4 text-slate-700">{item.model || 'Unknown'}</td>
                      <td className="px-4 py-4 text-slate-700">{formatNumber(item.total_tokens)}</td>
                      <td className="px-4 py-4 text-slate-700">${item.cost?.toFixed(4) ?? '0.0000'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="mt-6 flex items-center justify-between rounded-3xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
            <span>{`Showing ${usageLog.length} of ${total} records`}</span>
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
      </div>
    </PageShell>
  )
}
