'use client'

import { useEffect, useState } from 'react'
import PageShell from '@/components/PageShell'
import { adminPaymentAPI, type DashboardStats } from '@/lib/adminPayment'

const DAY_OPTIONS = [7, 30, 90] as const

function formatMoney(value: number, currency = 'USD') {
  return `${currency} ${value.toFixed(2)}`
}

export default function PaymentDashboardPage() {
  const [days, setDays] = useState<typeof DAY_OPTIONS[number]>(30)
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function loadDashboard() {
      setLoading(true)
      setError(null)

      try {
        const data = await adminPaymentAPI.getDashboard(days)
        if (!cancelled) {
          setStats(data)
        }
      } catch (err) {
        if (!cancelled) {
          setError((err as Error)?.message || 'Unable to load payment dashboard.')
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    loadDashboard()
    return () => {
      cancelled = true
    }
  }, [days])

  return (
    <PageShell title="Payment Dashboard" description="Admin payment dashboard" path="/admin/orders/dashboard">
      <div className="space-y-6">
        <div className="flex flex-col gap-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-xl font-semibold text-slate-900">Payment dashboard</h2>
            <p className="mt-2 text-sm text-slate-600">
              View recent payment performance and revenue trends for the platform.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {DAY_OPTIONS.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setDays(option)}
                className={`rounded-full px-4 py-2 text-sm font-semibold ${days === option ? 'bg-brand-500 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
              >
                {option} days
              </button>
            ))}
            <button
              type="button"
              onClick={() => setDays(days)}
              disabled={loading}
              className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-slate-700 ring-1 ring-slate-200 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Refresh
            </button>
          </div>
        </div>

        {loading ? (
          <div className="rounded-3xl border border-slate-200 bg-slate-50 p-8 text-center text-slate-600">
            Loading dashboard data...
          </div>
        ) : error ? (
          <div className="rounded-3xl border border-rose-200 bg-rose-50 p-6 text-rose-700">
            <p className="font-semibold">Unable to load dashboard</p>
            <p className="mt-2 text-sm">{error}</p>
          </div>
        ) : stats ? (
          <div className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                <p className="text-sm text-slate-500">Total revenue</p>
                <p className="mt-3 text-3xl font-semibold text-slate-900">{formatMoney(stats.total_amount)}</p>
              </div>
              <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                <p className="text-sm text-slate-500">Revenue this period</p>
                <p className="mt-3 text-3xl font-semibold text-slate-900">{formatMoney(stats.today_amount)}</p>
              </div>
              <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                <p className="text-sm text-slate-500">Average order value</p>
                <p className="mt-3 text-3xl font-semibold text-slate-900">{formatMoney(stats.avg_amount)}</p>
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                <p className="text-sm font-semibold text-slate-900">Order volume</p>
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <div className="rounded-2xl bg-slate-50 p-4">
                    <p className="text-sm text-slate-500">Total orders</p>
                    <p className="mt-2 text-2xl font-semibold text-slate-900">{stats.total_count}</p>
                  </div>
                  <div className="rounded-2xl bg-slate-50 p-4">
                    <p className="text-sm text-slate-500">Orders this period</p>
                    <p className="mt-2 text-2xl font-semibold text-slate-900">{stats.today_count}</p>
                  </div>
                </div>
              </div>

              <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                <p className="text-sm font-semibold text-slate-900">Top payment methods</p>
                <div className="mt-4 space-y-3">
                  {stats.payment_methods.length === 0 ? (
                    <p className="text-sm text-slate-500">No payment method data available.</p>
                  ) : (
                    stats.payment_methods.map((method) => (
                      <div key={method.type} className="flex items-center justify-between rounded-2xl bg-slate-50 p-4">
                        <div>
                          <p className="text-sm font-medium text-slate-900">{method.type}</p>
                          <p className="text-xs text-slate-500">{method.count} orders</p>
                        </div>
                        <p className="text-sm font-semibold text-slate-900">{formatMoney(method.amount)}</p>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <p className="text-sm font-semibold text-slate-900">Top users</p>
              <div className="mt-4 space-y-3">
                {stats.top_users.length === 0 ? (
                  <p className="text-sm text-slate-500">No top user data available.</p>
                ) : (
                  stats.top_users.map((user, index) => (
                    <div key={user.user_id} className="flex items-center justify-between rounded-2xl bg-slate-50 p-4">
                      <div>
                        <p className="text-sm font-medium text-slate-900">#{index + 1} {user.email}</p>
                        <p className="text-xs text-slate-500">User ID {user.user_id}</p>
                      </div>
                      <p className="text-sm font-semibold text-slate-900">{formatMoney(user.amount)}</p>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </PageShell>
  )
}
