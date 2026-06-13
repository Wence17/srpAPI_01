'use client'

import { Suspense, useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useI18n } from '@/lib/i18n/I18nProvider'
import AppLayout from '@/components/layout/AppLayout'
import { paymentStore } from '@/lib/stores/payment'
import { paymentAPI } from '@/lib/payment/api'
import { extractI18nErrorMessage } from '@/lib/apiError'
import { useApp } from '@/context/AppContext'
import QRCode from 'qrcode'

const alipayIcon = '/icons/alipay.svg'
const wxpayIcon = '/icons/wxpay.svg'

function PaymentQRCodeView() {
  const { t } = useI18n()
  const router = useRouter()
  const searchParams = useSearchParams()
  const appStore = useApp()

  const qrCanvas = useRef<HTMLCanvasElement | null>(null)
  const [qrUrl, setQrUrl] = useState('')
  const [payUrl, setPayUrl] = useState('')
  const [orderId, setOrderId] = useState(0)
  const [remainingSeconds, setRemainingSeconds] = useState(0)
  const [expired, setExpired] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [paymentType, setPaymentType] = useState('')

  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null)
  const countdownTimer = useRef<ReturnType<typeof setInterval> | null>(null)
  const cancellingRef = useRef(false)
  const orderIdRef = useRef(0)
  const qrUrlRef = useRef('')
  const paymentTypeRef = useRef('')

  const m = Math.floor(remainingSeconds / 60)
  const s = remainingSeconds % 60
  const countdownDisplay = m.toString().padStart(2, '0') + ':' + s.toString().padStart(2, '0')

  const isAlipay = paymentType.includes('alipay')
  const isWxpay = paymentType.includes('wxpay')

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

  function getLogoForType(): string | null {
    if (paymentTypeRef.current.includes('alipay')) return alipayIcon
    if (paymentTypeRef.current.includes('wxpay')) return wxpayIcon
    return null
  }

  async function renderQR() {
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
    if (!qrCanvas.current || !qrUrlRef.current) return

    const logoSrc = getLogoForType()
    await QRCode.toCanvas(qrCanvas.current, qrUrlRef.current, {
      width: 256,
      margin: 2,
      errorCorrectionLevel: logoSrc ? 'M' : 'L',
    })

    if (!logoSrc) return

    const canvas = qrCanvas.current
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const img = new Image()
    img.src = logoSrc
    img.onload = () => {
      const logoSize = 48
      const x = (canvas.width - logoSize) / 2
      const y = (canvas.height - logoSize) / 2
      const pad = 5
      ctx.fillStyle = '#FFFFFF'
      ctx.beginPath()
      const r = 6
      ctx.moveTo(x - pad + r, y - pad)
      ctx.arcTo(x + logoSize + pad, y - pad, x + logoSize + pad, y + logoSize + pad, r)
      ctx.arcTo(x + logoSize + pad, y + logoSize + pad, x - pad, y + logoSize + pad, r)
      ctx.arcTo(x - pad, y + logoSize + pad, x - pad, y - pad, r)
      ctx.arcTo(x - pad, y - pad, x + logoSize + pad, y - pad, r)
      ctx.fill()
      ctx.drawImage(img, x, y, logoSize, logoSize)
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

  async function pollStatus() {
    if (!orderIdRef.current) return
    const order = await paymentStore.pollOrderStatus(orderIdRef.current)
    if (!order) return
    if (order.status === 'COMPLETED' || order.status === 'PAID') {
      cleanup()
      const params = new URLSearchParams({ order_id: String(orderIdRef.current), status: 'success' })
      router.push(`/payment/result?${params.toString()}`)
    } else if (order.status === 'EXPIRED' || order.status === 'CANCELLED' || order.status === 'FAILED') {
      cleanup()
      setExpired(true)
    }
  }

  function startCountdown(seconds: number) {
    const initial = Math.max(0, seconds)
    setRemainingSeconds(initial)
    if (initial <= 0) {
      setExpired(true)
      return
    }
    countdownTimer.current = setInterval(() => {
      setRemainingSeconds((prev) => {
        const next = prev - 1
        if (next <= 0) {
          setExpired(true)
          cleanup()
          return 0
        }
        return next
      })
    }, 1000)
  }

  async function handleCancel() {
    if (!orderIdRef.current || cancellingRef.current) return
    setCancelling(true)
    cancellingRef.current = true
    try {
      await paymentAPI.cancelOrder(orderIdRef.current)
      cleanup()
      router.push('/purchase')
    } catch (err: unknown) {
      appStore.showError(extractI18nErrorMessage(err, t, 'payment.errors', t('common.error')))
    } finally {
      setCancelling(false)
      cancellingRef.current = false
    }
  }

  useEffect(() => {
    const id = Number(searchParams.get('order_id')) || 0
    const qr = String(searchParams.get('qr') || '')
    const pay = String(searchParams.get('pay_url') || '')
    const type = String(searchParams.get('payment_type') || '')

    orderIdRef.current = id
    qrUrlRef.current = qr
    paymentTypeRef.current = type
    setOrderId(id)
    setQrUrl(qr)
    setPayUrl(pay)
    setPaymentType(type)

    const expiresAtStr = String(searchParams.get('expires_at') || '')
    let seconds = 30 * 60
    if (expiresAtStr) {
      const expiresAt = new Date(expiresAtStr)
      const now = new Date()
      seconds = Math.floor((expiresAt.getTime() - now.getTime()) / 1000)
    }
    startCountdown(seconds)
    pollTimer.current = setInterval(pollStatus, 3000)
    renderQR()

    return () => cleanup()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Re-render QR when the URL becomes available.
  useEffect(() => {
    qrUrlRef.current = qrUrl
    renderQR()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qrUrl])

  return (
    <AppLayout>
      <div className="mx-auto flex max-w-md flex-col items-center space-y-6 py-8">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
          {qrUrl ? scanTitle : t('payment.qr.payInNewWindow')}
        </h2>
        {qrUrl ? (
          <div className="rounded-2xl bg-white p-6 shadow-lg dark:bg-dark-800">
            <canvas ref={qrCanvas} className="mx-auto"></canvas>
          </div>
        ) : null}
        {qrUrl && !expired && scanHint ? (
          <p className="text-center text-sm text-gray-500 dark:text-gray-400">{scanHint}</p>
        ) : null}
        {expired ? (
          <div className="text-center">
            <p className="text-lg font-medium text-red-500">{t('payment.qr.expired')}</p>
            <button className="btn btn-primary mt-4" onClick={() => router.push('/purchase')}>{t('payment.result.backToRecharge')}</button>
          </div>
        ) : (
          <div className="text-center">
            <p className="text-sm text-gray-500 dark:text-gray-400">{qrUrl ? t('payment.qr.expiresIn') : t('payment.qr.payInNewWindowHint')}</p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-gray-900 dark:text-white">{countdownDisplay}</p>
            <p className="mt-2 text-sm text-gray-400 dark:text-gray-500">{t('payment.qr.waitingPayment')}</p>
          </div>
        )}
        {payUrl && !qrUrl && !expired ? (
          <a href={payUrl} target="_blank" rel="noopener noreferrer" className="btn btn-primary w-full py-3">
            {t('payment.qr.openPayWindow')}
          </a>
        ) : null}
        {!expired && orderId ? (
          <button className="btn btn-secondary w-full" disabled={cancelling} onClick={handleCancel}>
            {cancelling ? t('common.processing') : t('payment.qr.cancelOrder')}
          </button>
        ) : null}
      </div>
    </AppLayout>
  )
}

export default function PaymentQRCodePage() {
  return (
    <Suspense fallback={null}>
      <PaymentQRCodeView />
    </Suspense>
  )
}
