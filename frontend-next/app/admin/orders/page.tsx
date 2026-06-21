'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useI18n } from '@/lib/i18n'
import { useApp } from '@/context/AppContext'
import { extractI18nErrorMessage } from '@/lib/apiError'
import { getPersistedPageSize, setPersistedPageSize } from '@/lib/usePersistedPageSize'
import {
  adminPaymentAPI,
  type OrderAuditLog,
  type OrderType,
  type PaymentType,
} from '@/lib/adminPayment'
import type { PaymentOrder } from '@/lib/payment/types'
import { formatOrderDateTime } from '@/lib/payment/orderUtils'
import AppLayout from '@/components/layout/AppLayout'
import Pagination from '@/components/common/Pagination'
import BaseDialog from '@/components/common/BaseDialog'
import Select from '@/components/common/Select'
import Icon from '@/components/icons/Icon'
import OrderTable from '@/components/payment/OrderTable'
import OrderStatusBadge from '@/components/payment/OrderStatusBadge'
import AdminRefundDialog, {
  type AdminRefundConfirmPayload,
} from '@/components/admin/payment/AdminRefundDialog'

export default function AdminOrdersPage() {
  const { t } = useI18n()
  const appStore = useApp()

  const [ordersLoading, setOrdersLoading] = useState(false)
  const [orders, setOrders] = useState<PaymentOrder[]>([])
  const [orderSearch, setOrderSearch] = useState('')
  const [orderFilters, setOrderFilters] = useState({
    status: '',
    payment_type: '',
    order_type: '',
  })
  const [orderPagination, setOrderPagination] = useState({
    page: 1,
    page_size: getPersistedPageSize(),
    total: 0,
  })

  const [selectedOrder, setSelectedOrder] = useState<PaymentOrder | null>(null)
  const [showDetailDialog, setShowDetailDialog] = useState(false)
  const [showRefundDialog, setShowRefundDialog] = useState(false)
  const [refundSubmitting, setRefundSubmitting] = useState(false)
  const [orderAuditLogs, setOrderAuditLogs] = useState<OrderAuditLog[]>([])

  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const orderSearchRef = useRef(orderSearch)
  orderSearchRef.current = orderSearch
  const orderFiltersRef = useRef(orderFilters)
  orderFiltersRef.current = orderFilters
  const orderPaginationRef = useRef(orderPagination)
  orderPaginationRef.current = orderPagination

  const loadOrders = useCallback(async () => {
    setOrdersLoading(true)
    try {
      const pagination = orderPaginationRef.current
      const filters = orderFiltersRef.current
      const res = await adminPaymentAPI.getOrders({
        page: pagination.page,
        page_size: pagination.page_size,
        keyword: orderSearchRef.current || undefined,
        status: (filters.status || undefined) as PaymentOrder['status'] | undefined,
        payment_type: (filters.payment_type || undefined) as PaymentType | undefined,
        order_type: (filters.order_type || undefined) as OrderType | undefined,
      })
      setOrders(res.items || [])
      setOrderPagination((prev) => ({ ...prev, total: res.total || 0 }))
    } catch (err: unknown) {
      appStore.showError(extractI18nErrorMessage(err, t, 'payment.errors', t('common.error')))
    } finally {
      setOrdersLoading(false)
    }
  }, [appStore, t])

  const debounceLoadOrders = useCallback(() => {
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current)
    debounceTimerRef.current = setTimeout(() => {
      loadOrders()
    }, 300)
  }, [loadOrders])

  useEffect(() => {
    loadOrders()
    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current)
    }
  }, [loadOrders])

  function handleOrderPageChange(page: number) {
    orderPaginationRef.current = { ...orderPaginationRef.current, page }
    setOrderPagination((prev) => ({ ...prev, page }))
    loadOrders()
  }

  function handleOrderPageSizeChange(size: number) {
    setPersistedPageSize(size)
    orderPaginationRef.current = { ...orderPaginationRef.current, page_size: size, page: 1 }
    setOrderPagination((prev) => ({ ...prev, page_size: size, page: 1 }))
    loadOrders()
  }

  const statusFilterOptions = useMemo(
    () => [
      { value: '', label: t('payment.admin.allStatuses') },
      { value: 'PENDING', label: t('payment.status.pending') },
      { value: 'PAID', label: t('payment.status.paid') },
      { value: 'COMPLETED', label: t('payment.status.completed') },
      { value: 'EXPIRED', label: t('payment.status.expired') },
      { value: 'CANCELLED', label: t('payment.status.cancelled') },
      { value: 'FAILED', label: t('payment.status.failed') },
      { value: 'REFUNDED', label: t('payment.status.refunded') },
      { value: 'REFUND_REQUESTED', label: t('payment.status.refund_requested') },
      { value: 'REFUND_FAILED', label: t('payment.status.refund_failed') },
    ],
    [t],
  )

  const paymentTypeFilterOptions = useMemo(
    () => [
      { value: '', label: t('payment.admin.allPaymentTypes') },
      { value: 'alipay', label: t('payment.methods.alipay') },
      { value: 'wxpay', label: t('payment.methods.wxpay') },
      { value: 'stripe', label: t('payment.methods.stripe') },
      { value: 'airwallex', label: t('payment.methods.airwallex') },
    ],
    [t],
  )

  const orderTypeFilterOptions = useMemo(
    () => [
      { value: '', label: t('payment.admin.allOrderTypes') },
      { value: 'balance', label: t('payment.admin.balanceOrder') },
      { value: 'subscription', label: t('payment.admin.subscriptionOrder') },
    ],
    [t],
  )

  async function showOrderDetail(order: PaymentOrder) {
    setSelectedOrder(order)
    setOrderAuditLogs([])
    setShowDetailDialog(true)
    try {
      const data = await adminPaymentAPI.getOrder(order.id)
      setSelectedOrder(data.order)
      setOrderAuditLogs(data.auditLogs)
    } catch {
      /* keep cached order data */
    }
  }

  async function handleCancelOrder(order: PaymentOrder) {
    try {
      await adminPaymentAPI.cancelOrder(order.id)
      appStore.showSuccess(t('payment.admin.orderCancelled'))
      loadOrders()
    } catch (err: unknown) {
      appStore.showError(extractI18nErrorMessage(err, t, 'payment.errors', t('common.error')))
    }
  }

  async function handleRetryOrder(order: PaymentOrder) {
    try {
      await adminPaymentAPI.retryRecharge(order.id)
      appStore.showSuccess(t('payment.admin.retrySuccess'))
      loadOrders()
    } catch (err: unknown) {
      appStore.showError(extractI18nErrorMessage(err, t, 'payment.errors', t('common.error')))
    }
  }

  function openRefundDialog(order: PaymentOrder) {
    setSelectedOrder(order)
    setShowRefundDialog(true)
  }

  async function handleRefund(data: AdminRefundConfirmPayload) {
    if (!selectedOrder) return
    setRefundSubmitting(true)
    try {
      await adminPaymentAPI.refundOrder(selectedOrder.id, data)
      appStore.showSuccess(t('payment.admin.refundSuccess'))
      setShowRefundDialog(false)
      loadOrders()
    } catch (err: unknown) {
      appStore.showError(extractI18nErrorMessage(err, t, 'payment.errors', t('common.error')))
    } finally {
      setRefundSubmitting(false)
    }
  }

  function renderOrderActions(row: PaymentOrder) {
    const currencySymbol = row.order_type === 'balance' ? '$' : '¥'
    return (
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => showOrderDetail(row)}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-dark-600"
        >
          <Icon name="eye" size="sm" />
          {t('common.view')}
        </button>
        {row.status === 'PENDING' ? (
          <button
            type="button"
            onClick={() => handleCancelOrder(row)}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-yellow-600 hover:bg-yellow-50 dark:text-yellow-400 dark:hover:bg-yellow-900/20"
          >
            <Icon name="x" size="sm" />
            {t('payment.orders.cancel')}
          </button>
        ) : null}
        {row.status === 'FAILED' ? (
          <button
            type="button"
            onClick={() => handleRetryOrder(row)}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-900/20"
          >
            <Icon name="refresh" size="sm" />
            {t('payment.admin.retry')}
          </button>
        ) : null}
        {row.status === 'REFUND_REQUESTED' ? (
          <>
            {row.refund_amount ? (
              <span className="rounded-full bg-purple-100 px-1.5 py-0.5 text-xs font-medium text-purple-700 dark:bg-purple-900/30 dark:text-purple-300">
                {currencySymbol}
                {row.refund_amount.toFixed(2)}
              </span>
            ) : null}
            <button
              type="button"
              onClick={() => openRefundDialog(row)}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-purple-600 hover:bg-purple-50 dark:text-purple-400 dark:hover:bg-purple-900/20"
            >
              <Icon name="check" size="sm" />
              {t('payment.admin.approveRefund')}
            </button>
          </>
        ) : null}
        {row.status === 'REFUND_FAILED' ? (
          <button
            type="button"
            onClick={() => openRefundDialog(row)}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-purple-600 hover:bg-purple-50 dark:text-purple-400 dark:hover:bg-purple-900/20"
          >
            <Icon name="refresh" size="sm" />
            {t('payment.admin.retryRefund')}
          </button>
        ) : null}
        {row.status === 'COMPLETED' || row.status === 'PARTIALLY_REFUNDED' ? (
          <button
            type="button"
            onClick={() => openRefundDialog(row)}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20"
          >
            <Icon name="dollar" size="sm" />
            {t('payment.admin.refund')}
          </button>
        ) : null}
      </div>
    )
  }

  return (
    <AppLayout>
      <div className="space-y-4">
        <div className="card p-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex-1 sm:max-w-64">
              <input
                type="text"
                value={orderSearch}
                onChange={(event) => {
                  setOrderSearch(event.target.value)
                  orderPaginationRef.current = { ...orderPaginationRef.current, page: 1 }
                  setOrderPagination((prev) => ({ ...prev, page: 1 }))
                  debounceLoadOrders()
                }}
                placeholder={t('payment.admin.searchOrders')}
                className="input"
              />
            </div>
            <Select
              modelValue={orderFilters.status}
              options={statusFilterOptions}
              className="w-36"
              onUpdateModelValue={(value) => {
                const next = (value ?? '') as string
                orderFiltersRef.current = { ...orderFiltersRef.current, status: next }
                setOrderFilters((prev) => ({ ...prev, status: next }))
              }}
              onChange={() => {
                orderPaginationRef.current = { ...orderPaginationRef.current, page: 1 }
                setOrderPagination((prev) => ({ ...prev, page: 1 }))
                loadOrders()
              }}
            />
            <Select
              modelValue={orderFilters.payment_type}
              options={paymentTypeFilterOptions}
              className="w-40"
              onUpdateModelValue={(value) => {
                const next = (value ?? '') as string
                orderFiltersRef.current = { ...orderFiltersRef.current, payment_type: next }
                setOrderFilters((prev) => ({ ...prev, payment_type: next }))
              }}
              onChange={() => {
                orderPaginationRef.current = { ...orderPaginationRef.current, page: 1 }
                setOrderPagination((prev) => ({ ...prev, page: 1 }))
                loadOrders()
              }}
            />
            <Select
              modelValue={orderFilters.order_type}
              options={orderTypeFilterOptions}
              className="w-36"
              onUpdateModelValue={(value) => {
                const next = (value ?? '') as string
                orderFiltersRef.current = { ...orderFiltersRef.current, order_type: next }
                setOrderFilters((prev) => ({ ...prev, order_type: next }))
              }}
              onChange={() => {
                orderPaginationRef.current = { ...orderPaginationRef.current, page: 1 }
                setOrderPagination((prev) => ({ ...prev, page: 1 }))
                loadOrders()
              }}
            />
            <div className="flex flex-1 flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => loadOrders()}
                disabled={ordersLoading}
                className="btn btn-secondary"
                title={t('common.refresh')}
              >
                <Icon name="refresh" size="md" className={ordersLoading ? 'animate-spin' : ''} />
              </button>
            </div>
          </div>
        </div>

        <OrderTable orders={orders} loading={ordersLoading} showUser renderActions={renderOrderActions} />

        {orderPagination.total > 0 ? (
          <Pagination
            page={orderPagination.page}
            total={orderPagination.total}
            pageSize={orderPagination.page_size}
            onUpdatePage={handleOrderPageChange}
            onUpdatePageSize={handleOrderPageSizeChange}
          />
        ) : null}
      </div>

      <BaseDialog
        show={showDetailDialog}
        title={t('payment.admin.orderDetail')}
        width="wide"
        onClose={() => setShowDetailDialog(false)}
      >
        {selectedOrder ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">{t('payment.orders.orderId')}</p>
                <p className="font-mono text-sm font-medium text-gray-900 dark:text-white">
                  #{selectedOrder.id}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">{t('payment.orders.orderNo')}</p>
                <p className="text-sm font-medium text-gray-900 dark:text-white">
                  {selectedOrder.out_trade_no}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">{t('payment.orders.status')}</p>
                <OrderStatusBadge status={selectedOrder.status} />
              </div>
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">{t('payment.orders.amount')}</p>
                <p className="text-sm font-medium text-gray-900 dark:text-white">
                  {selectedOrder.order_type === 'balance' ? '$' : '¥'}
                  {selectedOrder.amount.toFixed(2)}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">{t('payment.orders.payAmount')}</p>
                <p className="text-sm font-medium text-gray-900 dark:text-white">
                  ¥{selectedOrder.pay_amount.toFixed(2)}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">{t('payment.orders.paymentMethod')}</p>
                <p className="text-sm text-gray-700 dark:text-gray-300">
                  {t('payment.methods.' + selectedOrder.payment_type, selectedOrder.payment_type)}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">{t('payment.admin.feeRate')}</p>
                <p className="text-sm text-gray-700 dark:text-gray-300">{selectedOrder.fee_rate}%</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">{t('payment.orders.createdAt')}</p>
                <p className="text-sm text-gray-700 dark:text-gray-300">
                  {formatOrderDateTime(selectedOrder.created_at)}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">{t('payment.admin.expiresAt')}</p>
                <p className="text-sm text-gray-700 dark:text-gray-300">
                  {formatOrderDateTime(selectedOrder.expires_at)}
                </p>
              </div>
              {selectedOrder.paid_at ? (
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{t('payment.admin.paidAt')}</p>
                  <p className="text-sm text-gray-700 dark:text-gray-300">
                    {formatOrderDateTime(selectedOrder.paid_at)}
                  </p>
                </div>
              ) : null}
              {selectedOrder.refund_amount ? (
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{t('payment.admin.refundAmount')}</p>
                  <p className="text-sm font-medium text-red-600 dark:text-red-400">
                    {selectedOrder.order_type === 'balance' ? '$' : '¥'}
                    {selectedOrder.refund_amount.toFixed(2)}
                  </p>
                </div>
              ) : null}
              {selectedOrder.refund_reason ? (
                <div className="col-span-2">
                  <p className="text-xs text-gray-500 dark:text-gray-400">{t('payment.admin.refundReason')}</p>
                  <p className="text-sm text-gray-700 dark:text-gray-300">{selectedOrder.refund_reason}</p>
                </div>
              ) : null}
              {selectedOrder.refund_requested_at ? (
                <div className="col-span-2 border-t border-gray-200 pt-3 dark:border-dark-600">
                  <p className="mb-2 text-xs font-medium text-purple-600 dark:text-purple-400">
                    {t('payment.admin.refundRequestInfo')}
                  </p>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {t('payment.admin.refundRequestedAt')}
                      </p>
                      <p className="text-sm text-gray-700 dark:text-gray-300">
                        {formatOrderDateTime(selectedOrder.refund_requested_at)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {t('payment.admin.refundRequestedBy')}
                      </p>
                      <p className="text-sm text-gray-700 dark:text-gray-300">
                        #{selectedOrder.refund_requested_by}
                      </p>
                    </div>
                    <div className="col-span-2">
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {t('payment.admin.refundRequestReason')}
                      </p>
                      <p className="text-sm text-gray-700 dark:text-gray-300">
                        {selectedOrder.refund_request_reason}
                      </p>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>

            {orderAuditLogs.length > 0 ? (
              <div className="border-t border-gray-200 pt-4 dark:border-dark-600">
                <p className="mb-2 text-xs font-medium text-gray-500 dark:text-gray-400">
                  {t('payment.admin.auditLogs')}
                </p>
                <div className="max-h-48 space-y-2 overflow-y-auto">
                  {orderAuditLogs.map((log) => (
                    <div
                      key={log.id}
                      className="rounded-lg border border-gray-100 bg-gray-50 p-2.5 dark:border-dark-600 dark:bg-dark-800"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
                          {log.action}
                        </span>
                        <span className="text-xs text-gray-400">{formatOrderDateTime(log.created_at)}</span>
                      </div>
                      {log.detail ? (
                        <div className="mt-1 break-all text-xs text-gray-500 dark:text-gray-400">
                          {log.detail}
                        </div>
                      ) : null}
                      {log.operator ? (
                        <div className="mt-1 text-xs text-gray-400">
                          {t('payment.admin.operator')}: {log.operator}
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </BaseDialog>

      <AdminRefundDialog
        show={showRefundDialog}
        order={selectedOrder}
        submitting={refundSubmitting}
        onConfirm={handleRefund}
        onCancel={() => setShowRefundDialog(false)}
      />
    </AppLayout>
  )
}
