'use client'

import { Suspense, useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useI18n } from '@/lib/i18n/I18nProvider'
import OrderStatusBadge from '@/components/payment/OrderStatusBadge'
import {
  PAYMENT_RECOVERY_STORAGE_KEY,
  clearPaymentRecoverySnapshot,
  readPaymentRecoverySnapshot,
} from '@/lib/payment/paymentFlow'
import { paymentStore } from '@/lib/stores/payment'
import { paymentAPI } from '@/lib/payment/api'
import type { PaymentOrder } from '@/lib/payment/types'
import { formatPaymentAmount, normalizePaymentCurrency } from '@/lib/payment/currency'
import { normalizePaymentMethodForDisplay, paymentMethodI18nKey } from '@/lib/payment/paymentUx'

interface ReturnInfo {
  outTradeNo: string
  money: string
  type: string
  tradeStatus: string
}

const SUCCESS_STATUSES = new Set(['COMPLETED', 'PAID', 'RECHARGING'])
const PENDING_STATUSES = new Set(['PENDING', 'CREATED', 'WAITING', 'PROCESSING'])
const STATUS_REFRESH_INTERVAL_MS = 2000
const STATUS_REFRESH_MAX_ATTEMPTS = 15

function normalizeOrderStatus(status: string | null | undefined): string {
  return String(status || '').trim().toUpperCase()
}

function isSuccessStatus(status: string | null | undefined): boolean {
  return SUCCESS_STATUSES.has(normalizeOrderStatus(status))
}

function isPendingStatus(status: string | null | undefined): boolean {
  return PENDING_STATUSES.has(normalizeOrderStatus(status))
}

function PaymentResultView() {
  const { t, locale } = useI18n()
  const router = useRouter()
  const searchParams = useSearchParams()

  const [order, setOrder] = useState<PaymentOrder | null>(null)
  const [loading, setLoading] = useState(true)
  const [returnInfo, setReturnInfo] = useState<ReturnInfo | null>(null)
  const [currency, setCurrency] = useState('CNY')

  const orderRef = useRef<PaymentOrder | null>(null)
  const refreshAttempts = useRef(0)
  const statusRefreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const localeCode = locale

  const baseAmount = (() => {
    if (!order) return 0
    const feeRate = Number(order.fee_rate) || 0
    if (feeRate <= 0) return order.pay_amount ?? 0
    return Math.round((order.pay_amount / (1 + feeRate / 100)) * 100) / 100
  })()

  const feeAmount = (() => {
    if (!order) return 0
    const feeRate = Number(order.fee_rate) || 0
    if (feeRate <= 0) return 0
    return Math.round((order.pay_amount - baseAmount) * 100) / 100
  })()

  const isSuccess = isSuccessStatus(order?.status)
  const isPending = isPendingStatus(order?.status)

  const statusTitle = isSuccess
    ? t('payment.result.success')
    : isPending
      ? t('payment.result.processing')
      : t('payment.result.failed')

  function normalizedOrderPaymentType(paymentType: string): string {
    return normalizePaymentMethodForDisplay(paymentType) || paymentType
  }

  function formatGatewayAmount(value: number): string {
    return formatPaymentAmount(value, currency, localeCode)
  }

  function setResolvedOrder(nextOrder: PaymentOrder | null): void {
    orderRef.current = nextOrder
    setOrder(nextOrder)
    if (nextOrder?.currency) {
      setCurrency(normalizePaymentCurrency(nextOrder.currency))
    }
  }

  function readRouteQueryString(key: string): string {
    return searchParams.get(key) || ''
  }

  function restoreRecoverySnapshot(context: { resumeToken: string; routeOrderId: number; routeOutTradeNo: string }) {
    if (typeof window === 'undefined') {
      return null
    }

    const rawSnapshot = window.localStorage.getItem(PAYMENT_RECOVERY_STORAGE_KEY)
    if (!rawSnapshot) {
      return null
    }

    if (context.resumeToken) {
      return readPaymentRecoverySnapshot(rawSnapshot, { resumeToken: context.resumeToken })
    }

    if (!context.routeOrderId && !context.routeOutTradeNo) {
      return null
    }

    const restored = readPaymentRecoverySnapshot(rawSnapshot)
    if (!restored) {
      return null
    }

    if (context.routeOrderId > 0 && restored.orderId !== context.routeOrderId) {
      return null
    }

    if (context.routeOutTradeNo && restored.outTradeNo !== context.routeOutTradeNo) {
      return null
    }

    return restored
  }

  async function resolveOrderFromResumeToken(resumeToken: string): Promise<PaymentOrder | null> {
    try {
      const result = await paymentAPI.resolveOrderPublicByResumeToken(resumeToken)
      return result.data
    } catch {
      return null
    }
  }

  async function resolveOrderFromOutTradeNo(outTradeNo: string): Promise<PaymentOrder | null> {
    try {
      const result = await paymentAPI.verifyOrder(outTradeNo)
      return result.data
    } catch {
      try {
        const result = await paymentAPI.verifyOrderPublic(outTradeNo)
        return result.data
      } catch {
        return null
      }
    }
  }

  function clearStatusRefreshTimer(): void {
    if (statusRefreshTimer.current !== null) {
      clearTimeout(statusRefreshTimer.current)
      statusRefreshTimer.current = null
    }
  }

  function clearRecoverySnapshot(): void {
    if (typeof window === 'undefined') return
    clearPaymentRecoverySnapshot(window.localStorage, PAYMENT_RECOVERY_STORAGE_KEY)
  }

  function clearRecoverySnapshotForTerminalStatus(status: string | null | undefined): void {
    if (!status) return
    if (!isPendingStatus(status)) {
      clearRecoverySnapshot()
    }
  }

  function scheduleStatusRefresh(refreshOrder: (() => Promise<PaymentOrder | null>) | null): void {
    clearStatusRefreshTimer()
    if (!refreshOrder || !isPendingStatus(orderRef.current?.status) || refreshAttempts.current >= STATUS_REFRESH_MAX_ATTEMPTS) {
      return
    }

    statusRefreshTimer.current = setTimeout(async () => {
      refreshAttempts.current += 1
      const refreshedOrder = await refreshOrder()
      if (refreshedOrder) {
        setResolvedOrder(refreshedOrder)
        clearRecoverySnapshotForTerminalStatus(refreshedOrder.status)
      }

      if (isPendingStatus(orderRef.current?.status)) {
        scheduleStatusRefresh(refreshOrder)
      }
    }, STATUS_REFRESH_INTERVAL_MS)
  }

  useEffect(() => {
    ;(async () => {
      const resumeToken = readRouteQueryString('resume_token')
      const routeOrderId = Number(readRouteQueryString('order_id')) || 0
      let outTradeNo = readRouteQueryString('out_trade_no')
      let orderId = 0
      let resumeTokenLookupFailed = false
      let returnInfoSet = false

      const restored = restoreRecoverySnapshot({
        resumeToken,
        routeOrderId,
        routeOutTradeNo: outTradeNo,
      })
      if (restored?.orderId) {
        orderId = restored.orderId
      }
      if (restored?.currency) {
        setCurrency(normalizePaymentCurrency(restored.currency))
      }
      if (!outTradeNo && restored?.outTradeNo) {
        outTradeNo = restored.outTradeNo
      }

      if (resumeToken) {
        const resolvedOrder = await resolveOrderFromResumeToken(resumeToken)
        if (resolvedOrder) {
          setResolvedOrder(resolvedOrder)
          if (!orderId) {
            orderId = resolvedOrder.id
          }
        } else if (routeOrderId > 0) {
          resumeTokenLookupFailed = true
          orderId = routeOrderId
        } else {
          resumeTokenLookupFailed = true
        }
      } else if (routeOrderId > 0) {
        orderId = routeOrderId
      }

      const hasLegacyFallbackContext = readRouteQueryString('trade_status').trim() !== ''
      const shouldUsePublicOutTradeNo = outTradeNo !== '' && (hasLegacyFallbackContext || routeOrderId > 0 || orderId > 0)

      if (!orderRef.current && orderId && (!resumeToken || routeOrderId > 0)) {
        try {
          setResolvedOrder(await paymentStore.pollOrderStatus(orderId))
        } catch {
          // Order lookup failed, will try legacy fallback below when possible.
        }
      }

      if (!orderRef.current && shouldUsePublicOutTradeNo && (!resumeToken || resumeTokenLookupFailed)) {
        const legacyOrder = await resolveOrderFromOutTradeNo(outTradeNo)
        if (legacyOrder) {
          setResolvedOrder(legacyOrder)
          if (!orderId) {
            orderId = legacyOrder.id
          }
        }
      }

      if (!orderRef.current && !orderId && outTradeNo && hasLegacyFallbackContext) {
        setReturnInfo({
          outTradeNo,
          money: readRouteQueryString('money'),
          type: readRouteQueryString('type'),
          tradeStatus: readRouteQueryString('trade_status'),
        })
        returnInfoSet = true
      }

      const refreshOrder = async (): Promise<PaymentOrder | null> => {
        if (resumeToken) {
          const resolvedOrder = await resolveOrderFromResumeToken(resumeToken)
          if (resolvedOrder) {
            return resolvedOrder
          }
        }

        if (orderId) {
          try {
            return await paymentStore.pollOrderStatus(orderId)
          } catch {
            // Fall through to legacy public verification when order polling is unavailable.
          }
        }

        if (shouldUsePublicOutTradeNo) {
          return await resolveOrderFromOutTradeNo(outTradeNo)
        }

        return null
      }

      if (isPendingStatus(orderRef.current?.status)) {
        scheduleStatusRefresh(refreshOrder)
      } else if (orderRef.current) {
        clearRecoverySnapshotForTerminalStatus(orderRef.current.status)
      } else if (returnInfoSet) {
        clearRecoverySnapshot()
      }
      setLoading(false)
    })()

    return () => clearStatusRefreshTimer()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 dark:bg-dark-900">
      <div className="w-full max-w-md space-y-6">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-500 border-t-transparent"></div>
          </div>
        ) : (
          <>
            <div className="text-center">
              {isSuccess ? (
                <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
                  <svg className="h-10 w-10 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </div>
              ) : isPending ? (
                <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-yellow-100 dark:bg-yellow-900/30">
                  <div className="h-10 w-10 animate-spin rounded-full border-4 border-yellow-500 border-t-transparent"></div>
                </div>
              ) : (
                <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30">
                  <svg className="h-10 w-10 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </div>
              )}
              <h2 className="mt-4 text-2xl font-bold text-gray-900 dark:text-white">{statusTitle}</h2>
              {isPending ? <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">{t('payment.result.processingHint')}</p> : null}
            </div>

            {order ? (
              <div className="rounded-xl bg-white p-5 shadow-sm dark:bg-dark-800">
                <div className="space-y-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-500 dark:text-gray-400">{t('payment.orders.orderId')}</span>
                    <span className="font-medium text-gray-900 dark:text-white">#{order.id}</span>
                  </div>
                  {order.out_trade_no ? (
                    <div className="flex justify-between">
                      <span className="text-gray-500 dark:text-gray-400">{t('payment.orders.orderNo')}</span>
                      <span className="font-medium text-gray-900 dark:text-white">{order.out_trade_no}</span>
                    </div>
                  ) : null}
                  <div className="flex justify-between">
                    <span className="text-gray-500 dark:text-gray-400">{t('payment.orders.baseAmount')}</span>
                    <span className="font-medium text-gray-900 dark:text-white">{formatGatewayAmount(baseAmount)}</span>
                  </div>
                  {order.fee_rate > 0 ? (
                    <div className="flex justify-between">
                      <span className="text-gray-500 dark:text-gray-400">{t('payment.orders.fee')} ({order.fee_rate}%)</span>
                      <span className="font-medium text-gray-900 dark:text-white">{formatGatewayAmount(feeAmount)}</span>
                    </div>
                  ) : null}
                  <div className="flex justify-between">
                    <span className="text-gray-500 dark:text-gray-400">{t('payment.orders.payAmount')}</span>
                    <span className="font-bold text-primary-600 dark:text-primary-400">{formatGatewayAmount(order.pay_amount)}</span>
                  </div>
                  {order.amount !== order.pay_amount ? (
                    <div className="flex justify-between">
                      <span className="text-gray-500 dark:text-gray-400">{t('payment.orders.creditedAmount')}</span>
                      <span className="font-medium text-gray-900 dark:text-white">{order.order_type === 'balance' ? '$' + order.amount.toFixed(2) : formatGatewayAmount(order.amount)}</span>
                    </div>
                  ) : null}
                  <div className="flex justify-between">
                    <span className="text-gray-500 dark:text-gray-400">{t('payment.orders.paymentMethod')}</span>
                    <span className="font-medium text-gray-900 dark:text-white">{t(paymentMethodI18nKey(order.payment_type), normalizedOrderPaymentType(order.payment_type))}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500 dark:text-gray-400">{t('payment.orders.status')}</span>
                    <OrderStatusBadge status={order.status} />
                  </div>
                </div>
              </div>
            ) : returnInfo ? (
              <div className="rounded-xl bg-white p-5 shadow-sm dark:bg-dark-800">
                <div className="space-y-3 text-sm">
                  {returnInfo.outTradeNo ? (
                    <div className="flex justify-between">
                      <span className="text-gray-500 dark:text-gray-400">{t('payment.orders.orderId')}</span>
                      <span className="font-medium text-gray-900 dark:text-white">{returnInfo.outTradeNo}</span>
                    </div>
                  ) : null}
                  {returnInfo.money ? (
                    <div className="flex justify-between">
                      <span className="text-gray-500 dark:text-gray-400">{t('payment.orders.payAmount')}</span>
                      <span className="font-medium text-gray-900 dark:text-white">{formatGatewayAmount(Number(returnInfo.money) || 0)}</span>
                    </div>
                  ) : null}
                  {returnInfo.type ? (
                    <div className="flex justify-between">
                      <span className="text-gray-500 dark:text-gray-400">{t('payment.orders.paymentMethod')}</span>
                      <span className="font-medium text-gray-900 dark:text-white">{t(paymentMethodI18nKey(returnInfo.type), normalizedOrderPaymentType(returnInfo.type))}</span>
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}

            <div className="flex gap-3">
              <button className="btn btn-secondary flex-1" onClick={() => router.push('/purchase')}>{t('payment.result.backToRecharge')}</button>
              <button className="btn btn-primary flex-1" onClick={() => router.push('/orders')}>{t('payment.result.viewOrders')}</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

export default function PaymentResultPage() {
  return (
    <Suspense fallback={null}>
      <PaymentResultView />
    </Suspense>
  )
}
