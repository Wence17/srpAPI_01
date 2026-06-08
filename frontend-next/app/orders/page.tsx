'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import PageShell from '@/components/PageShell'
import { paymentAPI, type OrderStatus, type PaymentOrder } from '@/lib/payment'

const pageSize = 20

function formatDate(value?: string | null) {
  if (!value) return '—'
  return new Date(value).toLocaleString()
}

function formatMoney(value: number, currency = 'USD') {
  return `${currency} ${value.toFixed(2)}`
}

export default function MyOrdersPage() {
  const router = useRouter()
  const [orders, setOrders] = useState<PaymentOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<OrderStatus | 'all'>('all')
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [cancelOrderId, setCancelOrderId] = useState<number | null>(null)
  const [refundTarget, setRefundTarget] = useState<PaymentOrder | null>(null)
  const [refundReason, setRefundReason] = useState('')
  const [actionLoading, setActionLoading] = useState(false)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [refundEligibleProviders, setRefundEligibleProviders] = useState<Set<string>>(new Set())

  const statusFilters = useMemo(
    () => [
      { value: 'all', label: 'All statuses' },
      { value: 'PENDING', label: 'Pending' },
      { value: 'PAID', label: 'Paid' },
      { value: 'RECHARGING', label: 'Recharging' },
      { value: 'COMPLETED', label: 'Completed' },
      { value: 'EXPIRED', label: 'Expired' },
      { value: 'CANCELLED', label: 'Cancelled' },
      { value: 'FAILED', label: 'Failed' },
      { value: 'REFUND_REQUESTED', label: 'Refund requested' },
      { value: 'REFUNDING', label: 'Refunding' },
      { value: 'PARTIALLY_REFUNDED', label: 'Partially refunded' },
      { value: 'REFUNDED', label: 'Refunded' },
      { value: 'REFUND_FAILED', label: 'Refund failed' },
    ],
    []
  )

  useEffect(() => {
    let cancelled = false

    async function loadOrders() {
      setLoading(true)
      setError(null)
      try {
        const response = await paymentAPI.getMyOrders({
          page,
          page_size: pageSize,
          status: status === 'all' ? undefined : status,
        })

        if (cancelled) return
        setOrders(response.items)
        setTotal(response.total)
      } catch (err) {
        if (cancelled) return
        setError((err as Error)?.message || 'Unable to load your orders.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    loadOrders()
    return () => {
      cancelled = true
    }
  }, [page, status])

  useEffect(() => {
    let cancelled = false

    async function loadRefundEligibleProviders() {
      try {
        const response = await paymentAPI.getRefundEligibleProviders()
        if (cancelled) return
        setRefundEligibleProviders(new Set(response.provider_instance_ids || []))
      } catch {
        // ignore and keep refund button hidden when providers are unavailable
      }
    }

    loadRefundEligibleProviders()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!statusMessage) return
    const timeout = window.setTimeout(() => setStatusMessage(null), 4000)
    return () => window.clearTimeout(timeout)
  }, [statusMessage])

  function handlePageChange(nextPage: number) {
    setPage(nextPage)
  }

  function handleCancel(orderId: number) {
    setCancelOrderId(orderId)
  }

  function openRefundDialog(order: PaymentOrder) {
    setRefundTarget(order)
    setRefundReason('')
  }

  function canRequestRefund(order: PaymentOrder) {
    return order.status === 'COMPLETED' && !!order.provider_instance_id && refundEligibleProviders.has(order.provider_instance_id)
  }

  async function confirmCancel() {
    if (!cancelOrderId) return
    setActionLoading(true)

    try {
      await paymentAPI.cancelOrder(cancelOrderId)
      setStatusMessage('Order cancellation requested successfully.')
      setCancelOrderId(null)
      setPage(1)
    } catch (err) {
      setStatusMessage((err as Error)?.message || 'Unable to cancel the order.')
    } finally {
      setActionLoading(false)
    }
  }

  async function confirmRefund() {
    if (!refundTarget || !refundReason.trim()) return
    setActionLoading(true)

    try {
      await paymentAPI.requestRefund(refundTarget.id, { reason: refundReason.trim() })
      setStatusMessage('Refund request submitted successfully.')
      setRefundTarget(null)
      setRefundReason('')
      setPage(1)
    } catch (err) {
      setStatusMessage((err as Error)?.message || 'Unable to submit the refund request.')
    } finally {
      setActionLoading(false)
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  return (
    <PageShell title="My Orders" description="Purchase orders and payment history" path="/orders">
      <div className="space-y-6">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="space-y-2">
              <h2 className="text-xl font-semibold text-slate-900">My orders</h2>
              <p className="text-sm text-slate-600">Review your payment history, cancel pending orders, and request refunds where eligible.</p>
            </div>
            <button
              type="button"
              onClick={() => router.push('/purchase')}
              className="inline-flex items-center justify-center rounded-2xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
            >
              Back to recharge
            </button>
          </div>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_240px]">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">Status</label>
                <select
                  value={status}
                  onChange={(event) => {
                    setStatus(event.target.value as OrderStatus | 'all')
                    setPage(1)
                  }}
                  className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm focus:border-brand-500 focus:ring-brand-200"
                >
                  {statusFilters.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex items-end justify-end">
              <button
                type="button"
                onClick={() => setPage(1)}
                className="inline-flex items-center justify-center rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
              >
                Refresh
              </button>
            </div>
          </div>
        </div>

        {statusMessage ? (
          <div className="rounded-3xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
            {statusMessage}
          </div>
        ) : null}

        {loading ? (
          <div className="rounded-3xl border border-slate-200 bg-slate-50 p-8 text-center text-slate-600">Loading orders…</div>
        ) : error ? (
          <div className="rounded-3xl border border-rose-200 bg-rose-50 p-6 text-rose-700">
            <p className="font-semibold">Unable to load orders</p>
            <p className="mt-2 text-sm">{error}</p>
          </div>
        ) : (
          <>
            <div className="rounded-3xl border border-slate-200 bg-slate-50 p-6">
              <p className="text-sm text-slate-600">Showing {orders.length} of {total} orders</p>
            </div>

            <div className="overflow-x-auto rounded-3xl border border-slate-200 bg-white shadow-sm">
              <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                <thead className="bg-slate-50 text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Order</th>
                    <th className="px-4 py-3">Type</th>
                    <th className="px-4 py-3">Payment</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Amount</th>
                    <th className="px-4 py-3">Created</th>
                    <th className="px-4 py-3">Paid</th>
                    <th className="px-4 py-3">Actions</th>
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
                        <td className="px-4 py-4 capitalize">{order.order_type}</td>
                        <td className="px-4 py-4">{order.payment_type}</td>
                        <td className="px-4 py-4 capitalize">{order.status.replace('_', ' ')}</td>
                        <td className="px-4 py-4">{formatMoney(order.amount, order.currency || 'USD')}</td>
                        <td className="px-4 py-4">{formatDate(order.created_at)}</td>
                        <td className="px-4 py-4">{formatDate(order.paid_at ?? null)}</td>
                        <td className="px-4 py-4">
                          <div className="flex flex-wrap gap-2">
                            {order.status === 'PENDING' ? (
                              <button
                                type="button"
                                onClick={() => handleCancel(order.id)}
                                className="rounded-2xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700 transition hover:bg-amber-100"
                              >
                                Cancel
                              </button>
                            ) : null}
                            {canRequestRefund(order) ? (
                              <button
                                type="button"
                                onClick={() => openRefundDialog(order)}
                                className="rounded-2xl border border-violet-300 bg-violet-50 px-3 py-2 text-xs font-semibold text-violet-700 transition hover:bg-violet-100"
                              >
                                Request refund
                              </button>
                            ) : null}
                          </div>
                        </td>
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
                  onClick={() => handlePageChange(Math.max(1, page - 1))}
                  disabled={page === 1}
                  className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-slate-700 ring-1 ring-slate-200 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Previous
                </button>
                <button
                  type="button"
                  onClick={() => handlePageChange(Math.min(totalPages, page + 1))}
                  disabled={page === totalPages}
                  className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-slate-700 ring-1 ring-slate-200 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            </div>
          </>
        )}

        {cancelOrderId !== null ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
            <div className="w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-6 shadow-xl">
              <h2 className="text-lg font-semibold text-slate-900">Cancel order</h2>
              <p className="mt-4 text-sm text-slate-600">Are you sure you want to cancel order #{cancelOrderId}? This cannot be undone.</p>
              <div className="mt-6 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setCancelOrderId(null)}
                  className="rounded-2xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  Close
                </button>
                <button
                  type="button"
                  onClick={confirmCancel}
                  disabled={actionLoading}
                  className="rounded-2xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {actionLoading ? 'Cancelling…' : 'Cancel order'}
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {refundTarget ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
            <div className="w-full max-w-xl rounded-3xl border border-slate-200 bg-white p-6 shadow-xl">
              <h2 className="text-lg font-semibold text-slate-900">Request refund</h2>
              <p className="mt-2 text-sm text-slate-600">Provide a reason and send a refund request for order #{refundTarget.id}.</p>

              <div className="mt-6 space-y-4 rounded-3xl border border-slate-100 bg-slate-50 p-4">
                <div className="grid gap-2 sm:grid-cols-2">
                  <div>
                    <p className="text-sm text-slate-500">Order</p>
                    <p className="mt-1 text-sm font-semibold text-slate-900">#{refundTarget.id}</p>
                  </div>
                  <div>
                    <p className="text-sm text-slate-500">Amount</p>
                    <p className="mt-1 text-sm font-semibold text-slate-900">{formatMoney(refundTarget.amount, refundTarget.currency || 'USD')}</p>
                  </div>
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700">Refund reason</label>
                  <textarea
                    rows={4}
                    value={refundReason}
                    onChange={(event) => setRefundReason(event.target.value)}
                    className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm focus:border-brand-500 focus:ring-brand-200"
                    placeholder="Describe why you are requesting a refund"
                  />
                </div>
              </div>

              <div className="mt-6 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setRefundTarget(null)}
                  className="rounded-2xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  Close
                </button>
                <button
                  type="button"
                  onClick={confirmRefund}
                  disabled={actionLoading || !refundReason.trim()}
                  className="rounded-2xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {actionLoading ? 'Submitting…' : 'Submit refund request'}
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </PageShell>
  )
}
