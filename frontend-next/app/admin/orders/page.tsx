'use client'

import { useEffect, useMemo, useState } from 'react'
import PageShell from '@/components/PageShell'
import { adminPaymentAPI, type OrderStatus, type PaymentOrder, type PaymentType } from '@/lib/adminPayment'

const pageSize = 10

function formatDate(value?: string | null) {
  if (!value) return '—'
  return new Date(value).toLocaleString()
}

function formatMoney(value: number, currency = 'USD') {
  return `${currency} ${value.toFixed(2)}`
}

export default function OrderManagementPage() {
  const [orders, setOrders] = useState<PaymentOrder[]>([])
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [status, setStatus] = useState<OrderStatus | 'all'>('all')
  const [paymentType, setPaymentType] = useState<PaymentType | 'all'>('all')
  const [userId, setUserId] = useState('')
  const [keyword, setKeyword] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const controller = new AbortController()

    async function loadOrders() {
      setLoading(true)
      setError(null)

      try {
        const response = await adminPaymentAPI.getOrders({
          page,
          page_size: pageSize,
          status: status === 'all' ? undefined : status,
          payment_type: paymentType === 'all' ? undefined : paymentType,
          user_id: userId.trim() ? Number(userId.trim()) : undefined,
          keyword: keyword.trim() || undefined,
        })

        if (cancelled) return
        setOrders(response.items)
        setTotal(response.total)
      } catch (err) {
        if (cancelled) return
        setError((err as Error)?.message || 'Unable to load order records.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    loadOrders()
    return () => {
      cancelled = true
      controller.abort()
    }
  }, [page, status, paymentType, userId, keyword])

  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const currentFilters = useMemo(() => {
    const activeFilters: string[] = []
    if (status !== 'all') activeFilters.push(`Status: ${status}`)
    if (paymentType !== 'all') activeFilters.push(`Payment: ${paymentType}`)
    if (userId.trim()) activeFilters.push(`User ID: ${userId.trim()}`)
    if (keyword.trim()) activeFilters.push(`Keyword: ${keyword.trim()}`)
    return activeFilters
  }, [status, paymentType, userId, keyword])

  return (
    <PageShell title="Order Management" description="Manage orders" path="/admin/orders">
      <div className="space-y-6">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-xl font-semibold text-slate-900">Order management</h2>
              <p className="mt-2 text-sm text-slate-600">
                Search and inspect payment orders, filtered by status, payment type, user, or keyword.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <select
                value={status}
                onChange={(event) => {
                  setStatus(event.target.value as OrderStatus | 'all')
                  setPage(1)
                }}
                className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-2 text-sm shadow-sm focus:border-brand-500 focus:ring-brand-200"
              >
                <option value="all">All statuses</option>
                <option value="PENDING">Pending</option>
                <option value="PAID">Paid</option>
                <option value="RECHARGING">Recharging</option>
                <option value="COMPLETED">Completed</option>
                <option value="EXPIRED">Expired</option>
                <option value="CANCELLED">Cancelled</option>
                <option value="FAILED">Failed</option>
                <option value="REFUND_REQUESTED">Refund requested</option>
                <option value="REFUNDING">Refunding</option>
                <option value="PARTIALLY_REFUNDED">Partially refunded</option>
                <option value="REFUNDED">Refunded</option>
                <option value="REFUND_FAILED">Refund failed</option>
              </select>
              <select
                value={paymentType}
                onChange={(event) => {
                  setPaymentType(event.target.value as PaymentType | 'all')
                  setPage(1)
                }}
                className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-2 text-sm shadow-sm focus:border-brand-500 focus:ring-brand-200"
              >
                <option value="all">All payment types</option>
                <option value="alipay">Alipay</option>
                <option value="wxpay">WeChat Pay</option>
                <option value="alipay_direct">Alipay Direct</option>
                <option value="wxpay_direct">WeChat Direct</option>
                <option value="stripe">Stripe</option>
                <option value="easypay">Easypay</option>
                <option value="airwallex">Airwallex</option>
              </select>
              <input
                type="number"
                value={userId}
                onChange={(event) => {
                  setUserId(event.target.value)
                  setPage(1)
                }}
                placeholder="User ID"
                className="w-full rounded-2xl border border-slate-300 px-4 py-2 text-sm shadow-sm focus:border-brand-500 focus:ring-brand-200"
              />
              <input
                value={keyword}
                onChange={(event) => {
                  setKeyword(event.target.value)
                  setPage(1)
                }}
                placeholder="Search by order or trade ID"
                className="w-full rounded-2xl border border-slate-300 px-4 py-2 text-sm shadow-sm focus:border-brand-500 focus:ring-brand-200"
              />
            </div>
          </div>
        </div>

        {loading ? (
          <div className="rounded-3xl border border-slate-200 bg-slate-50 p-8 text-center text-slate-600">
            Loading orders...
          </div>
        ) : error ? (
          <div className="rounded-3xl border border-rose-200 bg-rose-50 p-6 text-rose-700">
            <p className="font-semibold">Unable to load orders</p>
            <p className="mt-2 text-sm">{error}</p>
          </div>
        ) : (
          <>
            <div className="rounded-3xl border border-slate-200 bg-slate-50 p-6">
              <p className="text-sm text-slate-500">Showing {orders.length} of {total} orders</p>
              {currentFilters.length > 0 ? (
                <p className="mt-2 text-sm text-slate-600">Filtered by {currentFilters.join(', ')}</p>
              ) : null}
            </div>

            <div className="overflow-x-auto rounded-3xl border border-slate-200 bg-white shadow-sm">
              <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                <thead className="bg-slate-50 text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Order</th>
                    <th className="px-4 py-3">User</th>
                    <th className="px-4 py-3">Type</th>
                    <th className="px-4 py-3">Payment</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Amount</th>
                    <th className="px-4 py-3">Created</th>
                    <th className="px-4 py-3">Paid</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 bg-white text-slate-700">
                  {orders.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-6 text-center text-slate-500">
                        No orders found for the current filters.
                      </td>
                    </tr>
                  ) : (
                    orders.map((order) => (
                      <tr key={order.id} className="odd:bg-slate-50">
                        <td className="px-4 py-4 font-medium text-slate-900">#{order.id}</td>
                        <td className="px-4 py-4">#{order.user_id}</td>
                        <td className="px-4 py-4 capitalize">{order.order_type}</td>
                        <td className="px-4 py-4">{order.payment_type}</td>
                        <td className="px-4 py-4 capitalize">{order.status.replace('_', ' ')}</td>
                        <td className="px-4 py-4">{formatMoney(order.amount, order.currency || 'USD')}</td>
                        <td className="px-4 py-4">{formatDate(order.created_at)}</td>
                        <td className="px-4 py-4">{formatDate(order.paid_at ?? null)}</td>
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
