'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useI18n } from '@/lib/i18n/I18nProvider'
import { useApp } from '@/context/AppContext'
import { paymentStore } from '@/lib/stores/payment'
import { paymentAPI } from '@/lib/payment/api'
import { extractI18nErrorMessage } from '@/lib/apiError'
import { getPaymentPopupFeatures } from '@/lib/payment/providerConfig'
import { formatPaymentAmount, normalizePaymentCurrency } from '@/lib/payment/currency'
import type { PaymentOrder } from '@/lib/payment/types'
import Icon from '@/components/icons/Icon'
import QRCode from 'qrcode'

const alipayIcon = '/icons/alipay.svg'
const wxpayIcon = '/icons/wxpay.svg'

type PaymentOutcome = 'success' | 'cancelled' | 'expired'

const VERIFY_RETRY_INTERVAL_MS = 15000
const VERIFY_RETRY_MAX_ATTEMPTS = 6

interface PaymentStatusPanelProps {
  orderId: number
  qrCode: string
  expiresAt: string
  paymentType: string
  payUrl?: string
  orderType?: string
  currency?: string
  onDone?: () => void
  onSuccess?: () => void
  onSettled?: (outcome: PaymentOutcome) => void
}

export default function PaymentStatusPanel(props: PaymentStatusPanelProps) {
  const { t, locale } = useI18n()
  const appStore = useApp()

  const qrCanvas = useRef<HTMLCanvasElement | null>(null)
  const [qrUrl, setQrUrl] = useState(props.qrCode)
  const [remainingSeconds, setRemainingSeconds] = useState(0)
  const [cancelling, setCancelling] = useState(false)
  const [paidOrder, setPaidOrder] = useState<PaymentOrder | null>(null)
  // Terminal outcome: null = still active, 'success' | 'cancelled' | 'expired'
  const [outcome, setOutcomeState] = useState<PaymentOutcome | null>(null)

  const paymentCurrency = useMemo(() => normalizePaymentCurrency(props.currency), [props.currency])
  const localeCode = locale

  // Mutable refs to mirror the original module-scope timer/verify state.
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null)
  const countdownTimer = useRef<ReturnType<typeof setInterval> | null>(null)
  const verifyAttempts = useRef(0)
  const lastVerifyAt = useRef(0)
  const outcomeRef = useRef<PaymentOutcome | null>(null)
  const cancellingRef = useRef(false)

  const isAlipay = props.paymentType.includes('alipay')
  const isWxpay = props.paymentType.includes('wxpay')

  const qrBorderClass = isAlipay
    ? 'border-[#00AEEF] bg-blue-50 dark:border-[#00AEEF]/70 dark:bg-blue-950/20'
    : isWxpay
      ? 'border-[#2BB741] bg-green-50 dark:border-[#2BB741]/70 dark:bg-green-950/20'
      : 'border-gray-200 bg-white dark:border-dark-600 dark:bg-dark-800'

  const qrLogoBgClass = isAlipay ? 'bg-[#00AEEF]' : isWxpay ? 'bg-[#2BB741]' : 'bg-gray-400'

  const scanTitle = isAlipay
    ? t('payment.qr.scanAlipay')
    : isWxpay
      ? t('payment.qr.scanWxpay')
      : t('payment.qr.scanToPay')

  const scanHint = isAlipay
    ? t('payment.qr.scanAlipayHint')
    : isWxpay
      ? t('payment.qr.scanWxpayHint')
      : ''

  const countdownDisplay = useMemo(() => {
    const m = Math.floor(remainingSeconds / 60)
    const s = remainingSeconds % 60
    return m.toString().padStart(2, '0') + ':' + s.toString().padStart(2, '0')
  }, [remainingSeconds])

  function formatGatewayAmount(value: number): string {
    return formatPaymentAmount(value, paymentCurrency, localeCode)
  }

  function isSuccessStatus(status: string | null | undefined): boolean {
    return status === 'COMPLETED' || status === 'PAID' || status === 'RECHARGING'
  }

  function reopenPopup() {
    if (props.payUrl) {
      const win = window.open(props.payUrl, 'paymentPopup', getPaymentPopupFeatures())
      if (!win || win.closed) {
        window.location.href = props.payUrl
      }
    }
  }

  function cleanup() {
    if (pollTimer.current) {
      clearInterval(pollTimer.current)
      pollTimer.current = null
    }
    if (countdownTimer.current) {
      clearInterval(countdownTimer.current)
      countdownTimer.current = null
    }
  }

  function setOutcome(next: PaymentOutcome) {
    if (outcomeRef.current === next) return
    outcomeRef.current = next
    setOutcomeState(next)
    props.onSettled?.(next)
  }

  async function renderQR() {
    if (!qrCanvas.current || !qrUrl) return
    await QRCode.toCanvas(qrCanvas.current, qrUrl, {
      width: 220,
      margin: 2,
      errorCorrectionLevel: 'M',
    })
  }

  async function tryRecoverPendingOrder(order: PaymentOrder): Promise<PaymentOrder> {
    if (!isWxpay) return order
    const outTradeNo = String(order.out_trade_no || '').trim()
    if (!outTradeNo) return order
    const normalizedStatus = String(order.status || '').trim().toUpperCase()
    if (normalizedStatus !== 'PENDING') return order
    const now = Date.now()
    if (verifyAttempts.current >= VERIFY_RETRY_MAX_ATTEMPTS || now - lastVerifyAt.current < VERIFY_RETRY_INTERVAL_MS) {
      return order
    }

    lastVerifyAt.current = now
    verifyAttempts.current += 1
    try {
      const result = await paymentAPI.verifyOrder(outTradeNo)
      return result.data ?? order
    } catch {
      return order
    }
  }

  async function pollStatus() {
    if (!props.orderId || outcomeRef.current) return
    let order = await paymentStore.pollOrderStatus(props.orderId)
    if (!order) return
    order = await tryRecoverPendingOrder(order)
    if (isSuccessStatus(order.status)) {
      cleanup()
      setPaidOrder(order)
      setOutcome('success')
      props.onSuccess?.()
    } else if (order.status === 'CANCELLED') {
      cleanup()
      setOutcome('cancelled')
    } else if (order.status === 'EXPIRED' || order.status === 'FAILED') {
      cleanup()
      setOutcome('expired')
    }
  }

  function startCountdown(seconds: number) {
    const initial = Math.max(0, seconds)
    setRemainingSeconds(initial)
    if (initial <= 0) {
      setOutcome('expired')
      return
    }
    countdownTimer.current = setInterval(() => {
      setRemainingSeconds((prev) => {
        const next = prev - 1
        if (next <= 0) {
          setOutcome('expired')
          cleanup()
          return 0
        }
        return next
      })
    }, 1000)
  }

  async function handleCancel() {
    if (!props.orderId || cancellingRef.current) return
    cancellingRef.current = true
    setCancelling(true)
    try {
      await paymentAPI.cancelOrder(props.orderId)
      cleanup()
      setOutcome('cancelled')
    } catch (err: unknown) {
      appStore.showError(extractI18nErrorMessage(err, t, 'payment.errors', t('common.error')))
    } finally {
      cancellingRef.current = false
      setCancelling(false)
    }
  }

  function handleDone() {
    cleanup()
    props.onDone?.()
  }

  // Initialize on mount (mirrors the Vue setup body + onUnmounted cleanup).
  useEffect(() => {
    setQrUrl(props.qrCode)
    verifyAttempts.current = 0
    lastVerifyAt.current = 0
    let seconds = 30 * 60
    if (props.expiresAt) {
      seconds = Math.floor((new Date(props.expiresAt).getTime() - Date.now()) / 1000)
    }
    startCountdown(seconds)
    pollTimer.current = setInterval(pollStatus, 3000)
    return () => cleanup()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Re-render the QR canvas whenever the QR payload changes.
  useEffect(() => {
    renderQR()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qrUrl, outcome])

  return (
    <div className="space-y-4">
      {/* ═══ Terminal States: show result, user clicks to return ═══ */}
      {outcome === 'success' ? (
        <div className="card p-6">
          <div className="flex flex-col items-center space-y-4 py-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
              <Icon name="check" size="lg" className="text-green-500" />
            </div>
            <p className="text-lg font-bold text-gray-900 dark:text-white">
              {props.orderType === 'subscription' ? t('payment.result.subscriptionSuccess') : t('payment.result.success')}
            </p>
            {paidOrder ? (
              <div className="w-full rounded-xl bg-gray-50 p-4 dark:bg-dark-800">
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-500 dark:text-gray-400">{t('payment.orders.orderId')}</span>
                    <span className="font-medium text-gray-900 dark:text-white">#{paidOrder.id}</span>
                  </div>
                  {paidOrder.out_trade_no ? (
                    <div className="flex justify-between">
                      <span className="text-gray-500 dark:text-gray-400">{t('payment.orders.orderNo')}</span>
                      <span className="font-medium text-gray-900 dark:text-white">{paidOrder.out_trade_no}</span>
                    </div>
                  ) : null}
                  <div className="flex justify-between">
                    <span className="text-gray-500 dark:text-gray-400">{t('payment.orders.amount')}</span>
                    <span className="font-medium text-gray-900 dark:text-white">
                      {paidOrder.order_type === 'balance' ? '$' + paidOrder.amount.toFixed(2) : formatGatewayAmount(paidOrder.amount)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500 dark:text-gray-400">{t('payment.orders.payAmount')}</span>
                    <span className="font-medium text-gray-900 dark:text-white">{formatGatewayAmount(paidOrder.pay_amount)}</span>
                  </div>
                </div>
              </div>
            ) : null}
            <button className="btn btn-primary" onClick={handleDone}>{t('common.confirm')}</button>
          </div>
        </div>
      ) : outcome === 'cancelled' ? (
        <div className="card p-6">
          <div className="flex flex-col items-center space-y-4 py-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gray-100 dark:bg-dark-700">
              <svg className="h-8 w-8 text-gray-400 dark:text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <p className="text-lg font-bold text-gray-900 dark:text-white">{t('payment.qr.cancelled')}</p>
            <p className="text-sm text-gray-500 dark:text-gray-400">{t('payment.qr.cancelledDesc')}</p>
            <button className="btn btn-primary" onClick={handleDone}>{t('common.confirm')}</button>
          </div>
        </div>
      ) : outcome === 'expired' ? (
        <div className="card p-6">
          <div className="flex flex-col items-center space-y-4 py-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-orange-100 dark:bg-orange-900/30">
              <svg className="h-8 w-8 text-orange-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <p className="text-lg font-bold text-gray-900 dark:text-white">{t('payment.qr.expired')}</p>
            <p className="text-sm text-gray-500 dark:text-gray-400">{t('payment.qr.expiredDesc')}</p>
            <button className="btn btn-primary" onClick={handleDone}>{t('common.confirm')}</button>
          </div>
        </div>
      ) : qrUrl ? (
        <>
          <div className="card p-6">
            <div className="flex flex-col items-center space-y-4">
              <p className="text-lg font-semibold text-gray-900 dark:text-white">{scanTitle}</p>
              <div className={['relative rounded-lg border-2 p-4', qrBorderClass].join(' ')}>
                <canvas ref={qrCanvas} className="mx-auto"></canvas>
                {/* Brand logo overlay */}
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                  <span className={['rounded-full p-2 shadow ring-2 ring-white', qrLogoBgClass].join(' ')}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={isAlipay ? alipayIcon : wxpayIcon} alt="" className="h-5 w-5 brightness-0 invert" />
                  </span>
                </div>
              </div>
              {scanHint ? <p className="text-center text-sm text-gray-500 dark:text-gray-400">{scanHint}</p> : null}
              {props.payUrl ? (
                <button className="btn btn-secondary text-sm" onClick={reopenPopup}>
                  {t('payment.qr.openPayWindow')}
                </button>
              ) : null}
            </div>
          </div>
          <div className="card p-4 text-center">
            <p className="text-sm text-gray-500 dark:text-gray-400">{t('payment.qr.expiresIn')}</p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-gray-900 dark:text-white">{countdownDisplay}</p>
            <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">{t('payment.qr.waitingPayment')}</p>
          </div>
          <button className="btn btn-secondary w-full" disabled={cancelling} onClick={handleCancel}>
            {cancelling ? t('common.processing') : t('payment.qr.cancelOrder')}
          </button>
        </>
      ) : (
        <>
          <div className="card p-6">
            <div className="flex flex-col items-center space-y-4 py-4">
              <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary-500 border-t-transparent"></div>
              <p className="text-sm text-gray-500 dark:text-gray-400">{t('payment.qr.payInNewWindowHint')}</p>
              {props.payUrl ? (
                <button className="btn btn-secondary text-sm" onClick={reopenPopup}>
                  {t('payment.qr.openPayWindow')}
                </button>
              ) : null}
            </div>
          </div>
          <div className="card p-4 text-center">
            <p className="mt-1 text-2xl font-bold tabular-nums text-gray-900 dark:text-white">{countdownDisplay}</p>
            <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">{t('payment.qr.waitingPayment')}</p>
          </div>
          <button className="btn btn-secondary w-full" disabled={cancelling} onClick={handleCancel}>
            {cancelling ? t('common.processing') : t('payment.qr.cancelOrder')}
          </button>
        </>
      )}
    </div>
  )
}
