'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useI18n } from '@/lib/i18n/I18nProvider'
import { useApp } from '@/context/AppContext'
import { paymentAPI } from '@/lib/payment/api'
import { extractI18nErrorMessage } from '@/lib/apiError'
import type { PaymentOrder } from '@/lib/payment/types'
import AppLayout from '@/components/layout/AppLayout'
import Pagination from '@/components/common/Pagination'
import BaseDialog from '@/components/common/BaseDialog'
import Select from '@/components/common/Select'
import Icon from '@/components/icons/Icon'
import OrderTable from '@/components/payment/OrderTable'

export default function UserOrdersPage() {
  const { t } = useI18n()
  const router = useRouter()
  const appStore = useApp()

  const [loading, setLoading] = useState(false)
  const [actionLoading, setActionLoading] = useState(false)
  const [orders, setOrders] = useState<PaymentOrder[]>([])
  const [refundEligibleProviders, setRefundEligibleProviders] = useState<Set<string>>(new Set())
  const [currentFilter, setCurrentFilter] = useState('')
  const [cancelTargetId, setCancelTargetId] = useState<number | null>(null)
  const [refundTarget, setRefundTarget] = useState<PaymentOrder | null>(null)
  const [refundReason, setRefundReason] = useState('')
  const [pagination, setPagination] = useState({ page: 1, page_size: 20, total: 0 })

  const currentFilterRef = useRef(currentFilter)
  currentFilterRef.current = currentFilter
  const paginationRef = useRef(pagination)
  paginationRef.current = pagination

  const statusFilters = useMemo(
    () => [
      { value: '', label: t('common.all') },
      { value: 'PENDING', label: t('payment.status.pending') },
      { value: 'COMPLETED', label: t('payment.status.completed') },
      { value: 'FAILED', label: t('payment.status.failed') },
      { value: 'REFUNDED', label: t('payment.status.refunded') },
    ],
    [t],
  )

  const fetchOrders = useCallback(async () => {
    setLoading(true)
    try {
      const res = await paymentAPI.getMyOrders({
        page: paginationRef.current.page,
        page_size: paginationRef.current.page_size,
        status: currentFilterRef.current || undefined,
      })
      setOrders(res.data.items || [])
      setPagination((prev) => ({ ...prev, total: res.data.total || 0 }))
    } catch (err: unknown) {
      appStore.showError(extractI18nErrorMessage(err, t, 'payment.errors', t('common.error')))
    } finally {
      setLoading(false)
    }
  }, [appStore, t])

  function handlePageChange(page: number) {
    paginationRef.current = { ...paginationRef.current, page }
    setPagination((prev) => ({ ...prev, page }))
    fetchOrders()
  }

  function handlePageSizeChange(size: number) {
    paginationRef.current = { ...paginationRef.current, page_size: size, page: 1 }
    setPagination((prev) => ({ ...prev, page_size: size, page: 1 }))
    fetchOrders()
  }

  function handleCancel(orderId: number) {
    setCancelTargetId(orderId)
  }

  async function confirmCancel() {
    if (!cancelTargetId) return
    setActionLoading(true)
    try {
      await paymentAPI.cancelOrder(cancelTargetId)
      appStore.showSuccess(t('common.success'))
      setCancelTargetId(null)
      await fetchOrders()
    } catch (err: unknown) {
      appStore.showError(extractI18nErrorMessage(err, t, 'payment.errors', t('common.error')))
    } finally {
      setActionLoading(false)
    }
  }

  function openRefundDialog(order: PaymentOrder) {
    setRefundTarget(order)
    setRefundReason('')
  }

  async function confirmRefund() {
    if (!refundTarget || !refundReason.trim()) return
    setActionLoading(true)
    try {
      await paymentAPI.requestRefund(refundTarget.id, { reason: refundReason.trim() })
      appStore.showSuccess(t('common.success'))
      setRefundTarget(null)
      setRefundReason('')
      await fetchOrders()
    } catch (err: unknown) {
      appStore.showError(extractI18nErrorMessage(err, t, 'payment.errors', t('common.error')))
    } finally {
      setActionLoading(false)
    }
  }

  function canRequestRefund(order: PaymentOrder): boolean {
    if (order.status !== 'COMPLETED') return false
    if (!order.provider_instance_id) return false
    return refundEligibleProviders.has(order.provider_instance_id)
  }

  const loadRefundEligibility = useCallback(async () => {
    try {
      const res = await paymentAPI.getRefundEligibleProviders()
      setRefundEligibleProviders(new Set(res.data.provider_instance_ids || []))
    } catch {
      /* ignore — default to hiding refund button */
    }
  }, [])

  useEffect(() => {
    fetchOrders()
    loadRefundEligibility()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <AppLayout>
      <div className="space-y-4">
        {/* Filters */}
        <div className="card p-4">
          <div className="flex flex-wrap items-center gap-3">
            <Select
              modelValue={currentFilter}
              options={statusFilters}
              className="w-36"
              onUpdateModelValue={(value) => {
                const next = (value ?? '') as string
                currentFilterRef.current = next
                setCurrentFilter(next)
              }}
              onChange={() => fetchOrders()}
            />
            <div className="flex flex-1 items-center justify-end gap-2">
              <button
                onClick={() => fetchOrders()}
                disabled={loading}
                className="btn btn-secondary"
                title={t('common.refresh')}
              >
                <Icon name="refresh" size="md" className={loading ? 'animate-spin' : ''} />
              </button>
              <button className="btn btn-primary" onClick={() => router.push('/purchase')}>
                {t('payment.result.backToRecharge')}
              </button>
            </div>
          </div>
        </div>

        {/* Table */}
        <OrderTable
          orders={orders}
          loading={loading}
          renderActions={(row) => (
            <div className="flex items-center gap-2">
              {row.status === 'PENDING' ? (
                <button
                  onClick={() => handleCancel(row.id)}
                  className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-yellow-600 hover:bg-yellow-50 dark:text-yellow-400 dark:hover:bg-yellow-900/20"
                >
                  <Icon name="x" size="sm" />
                  <span>{t('payment.orders.cancel')}</span>
                </button>
              ) : null}
              {canRequestRefund(row) ? (
                <button
                  onClick={() => openRefundDialog(row)}
                  className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-purple-600 hover:bg-purple-50 dark:text-purple-400 dark:hover:bg-purple-900/20"
                >
                  <Icon name="dollar" size="sm" />
                  <span>{t('payment.orders.requestRefund')}</span>
                </button>
              ) : null}
            </div>
          )}
        />

        {/* Pagination */}
        {pagination.total > 0 ? (
          <Pagination
            page={pagination.page}
            total={pagination.total}
            pageSize={pagination.page_size}
            onUpdatePage={handlePageChange}
            onUpdatePageSize={handlePageSizeChange}
          />
        ) : null}
      </div>

      {/* Cancel Confirm Dialog */}
      <BaseDialog
        show={!!cancelTargetId}
        title={t('payment.orders.cancel')}
        width="narrow"
        onClose={() => setCancelTargetId(null)}
        footer={
          <div className="flex justify-end gap-3">
            <button className="btn btn-secondary" onClick={() => setCancelTargetId(null)}>
              {t('common.cancel')}
            </button>
            <button className="btn btn-danger" disabled={actionLoading} onClick={confirmCancel}>
              {actionLoading ? t('common.processing') : t('payment.orders.cancel')}
            </button>
          </div>
        }
      >
        <p className="text-sm text-gray-600 dark:text-gray-300">{t('payment.confirmCancel')}</p>
      </BaseDialog>

      {/* Refund Dialog */}
      <BaseDialog
        show={!!refundTarget}
        title={t('payment.orders.requestRefund')}
        onClose={() => setRefundTarget(null)}
        footer={
          <div className="flex justify-end gap-3">
            <button className="btn btn-secondary" onClick={() => setRefundTarget(null)}>
              {t('common.cancel')}
            </button>
            <button
              className="btn btn-primary"
              disabled={actionLoading || !refundReason.trim()}
              onClick={confirmRefund}
            >
              {actionLoading ? t('common.processing') : t('payment.orders.requestRefund')}
            </button>
          </div>
        }
      >
        {refundTarget ? (
          <div className="space-y-4">
            <div className="rounded-xl bg-gray-50 p-4 dark:bg-dark-800">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500 dark:text-gray-400">{t('payment.orders.orderId')}</span>
                <span className="font-mono text-gray-900 dark:text-white">#{refundTarget.id}</span>
              </div>
              <div className="mt-2 flex justify-between text-sm">
                <span className="text-gray-500 dark:text-gray-400">{t('payment.orders.amount')}</span>
                <span className="text-gray-900 dark:text-white">${refundTarget.amount.toFixed(2)}</span>
              </div>
            </div>
            <div>
              <label className="input-label">{t('payment.refundReason')}</label>
              <textarea
                value={refundReason}
                onChange={(e) => setRefundReason(e.target.value)}
                rows={3}
                className="input mt-1 w-full"
                placeholder={t('payment.refundReasonPlaceholder')}
              />
            </div>
          </div>
        ) : null}
      </BaseDialog>
    </AppLayout>
  )
}
