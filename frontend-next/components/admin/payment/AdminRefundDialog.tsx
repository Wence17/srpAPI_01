'use client'

import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useI18n } from '@/lib/i18n'
import type { PaymentOrder } from '@/lib/payment/types'
import { formatOrderDateTime } from '@/lib/payment/orderUtils'
import BaseDialog from '@/components/common/BaseDialog'

export interface AdminRefundConfirmPayload {
  amount: number
  reason: string
  deduct_balance: boolean
  force: boolean
}

interface AdminRefundDialogProps {
  show: boolean
  order: PaymentOrder | null
  submitting?: boolean
  userBalance?: number | null
  requireForce?: boolean
  warning?: string
  onConfirm: (data: AdminRefundConfirmPayload) => void
  onCancel: () => void
}

function actuallyRefunded(order: PaymentOrder | null): number {
  if (!order) return 0
  if (order.status === 'PARTIALLY_REFUNDED' || order.status === 'REFUNDED') {
    return order.refund_amount || 0
  }
  return 0
}

export default function AdminRefundDialog({
  show,
  order,
  submitting = false,
  userBalance = null,
  requireForce = false,
  warning,
  onConfirm,
  onCancel,
}: AdminRefundDialogProps) {
  const { t } = useI18n()
  const [amount, setAmount] = useState(0)
  const [reason, setReason] = useState('')
  const [deductBalance, setDeductBalance] = useState(true)
  const [force, setForce] = useState(false)

  const refunded = useMemo(() => actuallyRefunded(order), [order])
  const maxRefundable = useMemo(() => (order ? order.amount - refunded : 0), [order, refunded])
  const balanceInsufficient = useMemo(() => {
    if (userBalance == null || !order) return false
    return userBalance < order.amount
  }, [order, userBalance])

  useEffect(() => {
    if (!show || !order) return
    if (order.status === 'REFUND_REQUESTED' && order.refund_amount) {
      setAmount(order.refund_amount)
    } else {
      setAmount(maxRefundable)
    }
    setReason(order.refund_request_reason || '')
    setDeductBalance(true)
    setForce(false)
  }, [show, order, maxRefundable])

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (amount <= 0 || amount > maxRefundable) return
    if (requireForce && !force) return
    onConfirm({ amount, reason, deduct_balance: deductBalance, force })
  }

  const currencySymbol = order?.order_type === 'balance' ? '$' : '¥'

  return (
    <BaseDialog show={show} title={t('payment.admin.refundOrder')} onClose={onCancel}>
      <form id="refund-form" onSubmit={handleSubmit} className="space-y-4">
        {order?.refund_requested_at || order?.refund_request_reason ? (
          <div className="rounded-lg border border-violet-200 bg-violet-50 p-3 dark:border-violet-800 dark:bg-violet-900/20">
            <div className="flex items-center gap-2 text-sm font-medium text-violet-700 dark:text-violet-300">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              {t('payment.admin.refundRequestInfo')}
            </div>
            {order?.refund_requested_at ? (
              <div className="mt-2 flex justify-between text-sm">
                <span className="text-violet-600 dark:text-violet-400">
                  {t('payment.admin.refundRequestedAt')}
                </span>
                <span className="text-violet-800 dark:text-violet-200">
                  {formatOrderDateTime(order.refund_requested_at)}
                </span>
              </div>
            ) : null}
            {order?.refund_request_reason ? (
              <div className="mt-1 text-sm">
                <span className="text-violet-600 dark:text-violet-400">
                  {t('payment.admin.refundRequestReason')}:
                </span>
                <span className="ml-1 text-violet-800 dark:text-violet-200">
                  {order.refund_request_reason}
                </span>
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="rounded-lg bg-gray-50 p-3 dark:bg-dark-700">
          <div className="flex justify-between text-sm">
            <span className="text-gray-500 dark:text-gray-400">{t('payment.orders.orderId')}</span>
            <span className="font-mono text-gray-900 dark:text-white">#{order?.id}</span>
          </div>
          <div className="mt-1 flex justify-between text-sm">
            <span className="text-gray-500 dark:text-gray-400">{t('payment.orders.creditedAmount')}</span>
            <span className="font-medium text-gray-900 dark:text-white">
              {currencySymbol}
              {order?.amount?.toFixed(2)}
            </span>
          </div>
          <div className="mt-1 flex justify-between text-sm">
            <span className="text-gray-500 dark:text-gray-400">{t('payment.orders.payAmount')}</span>
            <span className="font-medium text-gray-900 dark:text-white">¥{order?.pay_amount?.toFixed(2)}</span>
          </div>
          {refunded > 0 ? (
            <div className="mt-1 flex justify-between text-sm">
              <span className="text-gray-500 dark:text-gray-400">{t('payment.admin.alreadyRefunded')}</span>
              <span className="font-medium text-red-600 dark:text-red-400">
                {currencySymbol}
                {refunded.toFixed(2)}
              </span>
            </div>
          ) : null}
        </div>

        <div>
          <div className="flex items-center gap-2">
            <input
              id="deduct-balance"
              type="checkbox"
              checked={deductBalance}
              onChange={(event) => setDeductBalance(event.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
            />
            <label htmlFor="deduct-balance" className="text-sm text-gray-700 dark:text-gray-300">
              {t('payment.admin.deductBalance')}
            </label>
            <span className="text-xs text-gray-500 dark:text-gray-400">
              {t('payment.admin.deductBalanceHint')}
            </span>
          </div>

          {deductBalance && userBalance != null ? (
            <div className="mt-3 grid grid-cols-2 gap-3">
              <div className="rounded-lg bg-gray-50 p-3 text-sm dark:bg-dark-700">
                <div className="text-gray-500 dark:text-gray-400">{t('payment.admin.userBalance')}</div>
                <div className="mt-1 font-semibold text-gray-900 dark:text-white">
                  ${userBalance.toFixed(2)}
                </div>
              </div>
              <div className="rounded-lg bg-gray-50 p-3 text-sm dark:bg-dark-700">
                <div className="text-gray-500 dark:text-gray-400">{t('payment.admin.orderAmount')}</div>
                <div className="mt-1 font-semibold text-gray-900 dark:text-white">
                  {currencySymbol}
                  {order?.amount?.toFixed(2)}
                </div>
              </div>
            </div>
          ) : null}

          {deductBalance && balanceInsufficient ? (
            <div className="mt-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-700 dark:bg-amber-900/20 dark:text-amber-300">
              {t('payment.admin.insufficientBalance')}
            </div>
          ) : null}

          {!deductBalance ? (
            <div className="mt-2 rounded-lg bg-blue-50 p-3 text-sm text-blue-700 dark:bg-blue-900/20 dark:text-blue-300">
              {t('payment.admin.noDeduction')}
            </div>
          ) : null}
        </div>

        <div>
          <label className="input-label">{t('payment.admin.refundAmount')}</label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">{currencySymbol}</span>
            <input
              type="number"
              step="0.01"
              min="0.01"
              max={maxRefundable}
              value={amount}
              onChange={(event) => setAmount(Number(event.target.value))}
              className="input pl-7"
              required
            />
          </div>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            {t('payment.admin.maxRefundable')}: {currencySymbol}
            {maxRefundable.toFixed(2)}
          </p>
        </div>

        <div>
          <label className="input-label">{t('payment.admin.refundReason')}</label>
          <textarea
            rows={3}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            className="input"
            placeholder={t('payment.admin.refundReasonPlaceholder')}
            required
          />
        </div>

        {warning ? (
          <div className="rounded-lg bg-yellow-50 p-3 text-sm text-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-300">
            {warning}
          </div>
        ) : null}

        {requireForce ? (
          <div className="flex items-center gap-2">
            <input
              id="force-refund"
              type="checkbox"
              checked={force}
              onChange={(event) => setForce(event.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-red-600 focus:ring-red-500"
            />
            <label htmlFor="force-refund" className="text-sm font-medium text-red-600 dark:text-red-400">
              {t('payment.admin.forceRefund')}
            </label>
          </div>
        ) : null}
      </form>

      <div className="mt-6 flex justify-end gap-3">
        <button type="button" onClick={onCancel} className="btn btn-secondary">
          {t('common.cancel')}
        </button>
        <button
          type="submit"
          form="refund-form"
          disabled={submitting || amount <= 0 || (requireForce && !force)}
          className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 disabled:opacity-50 dark:focus:ring-offset-dark-800"
        >
          {submitting ? t('common.processing') : t('payment.admin.confirmRefund')}
        </button>
      </div>
    </BaseDialog>
  )
}
