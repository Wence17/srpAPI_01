'use client'

import { useEffect, useRef, useState } from 'react'
import { useI18n } from '@/lib/i18n/I18nProvider'
import { useApp } from '@/context/AppContext'
import { extractI18nErrorMessage } from '@/lib/apiError'
import { paymentAPI } from '@/lib/payment/api'
import { getPaymentPopupFeatures } from '@/lib/payment/providerConfig'
import type { Stripe, StripeElements } from '@stripe/stripe-js'
import Icon from '@/components/icons/Icon'

// Stripe payment methods that open a popup (redirect or QR code)
const POPUP_METHODS = new Set(['alipay', 'wechat_pay'])

interface StripePaymentInlineProps {
  orderId: number
  amount: number
  clientSecret: string
  orderType?: 'balance' | 'subscription'
  publishableKey: string
  payAmount: number
  onSuccess?: () => void
  onDone?: () => void
  onBack?: () => void
  onRedirect?: (orderId: number, payUrl: string) => void
}

export default function StripePaymentInline(props: StripePaymentInlineProps) {
  const { t } = useI18n()
  const appStore = useApp()

  const stripeMount = useRef<HTMLDivElement | null>(null)
  const [loading, setLoading] = useState(true)
  const [initError, setInitError] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [success, setSuccess] = useState(false)
  const [ready, setReady] = useState(false)

  const stripeInstance = useRef<Stripe | null>(null)
  const elementsInstance = useRef<StripeElements | null>(null)
  const selectedType = useRef('')
  const submittingRef = useRef(false)
  const cancellingRef = useRef(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const { loadStripe } = await import('@stripe/stripe-js')
        const stripe = await loadStripe(props.publishableKey)
        if (cancelled) return
        if (!stripe) {
          setInitError(t('payment.stripeLoadFailed'))
          return
        }

        stripeInstance.current = stripe
        setLoading(false)
        // Wait a tick for the mount node to render.
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
        if (cancelled || !stripeMount.current) return

        const isDark = document.documentElement.classList.contains('dark')
        const elements = stripe.elements({
          clientSecret: props.clientSecret,
          appearance: { theme: isDark ? 'night' : 'stripe', variables: { borderRadius: '8px' } },
        })
        elementsInstance.current = elements
        const paymentElement = elements.create('payment', {
          layout: 'tabs',
          paymentMethodOrder: ['alipay', 'wechat_pay', 'card', 'link'],
        } as Record<string, unknown>)
        paymentElement.mount(stripeMount.current)
        paymentElement.on('ready', () => setReady(true))
        paymentElement.on('change', (event: { value: { type: string } }) => {
          selectedType.current = event.value.type
        })
      } catch (err: unknown) {
        if (!cancelled) setInitError(extractI18nErrorMessage(err, t, 'payment.errors', t('payment.stripeLoadFailed')))
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handlePay() {
    if (!stripeInstance.current || !elementsInstance.current || submittingRef.current) return

    if (POPUP_METHODS.has(selectedType.current)) {
      const params = new URLSearchParams({
        order_id: String(props.orderId),
        method: selectedType.current,
        amount: String(props.payAmount),
      })
      const popupUrl = `/payment/stripe-popup?${params.toString()}`
      const popup = window.open(popupUrl, 'paymentPopup', getPaymentPopupFeatures())

      const onReady = (event: MessageEvent) => {
        if (event.source !== popup || event.data?.type !== 'STRIPE_POPUP_READY') return
        window.removeEventListener('message', onReady)
        popup?.postMessage(
          {
            type: 'STRIPE_POPUP_INIT',
            clientSecret: props.clientSecret,
            publishableKey: props.publishableKey,
          },
          window.location.origin,
        )
      }
      window.addEventListener('message', onReady)

      props.onRedirect?.(props.orderId, popupUrl)
      return
    }

    setSubmitting(true)
    submittingRef.current = true
    setError('')
    try {
      const { error: stripeError } = await stripeInstance.current.confirmPayment({
        elements: elementsInstance.current,
        confirmParams: {
          return_url: window.location.origin + '/payment/result?order_id=' + props.orderId + '&status=success',
        },
        redirect: 'if_required',
      })
      if (stripeError) {
        setError(stripeError.message || t('payment.result.failed'))
      } else {
        setSuccess(true)
        props.onSuccess?.()
      }
    } catch (err: unknown) {
      setError(extractI18nErrorMessage(err, t, 'payment.errors', t('payment.result.failed')))
    } finally {
      setSubmitting(false)
      submittingRef.current = false
    }
  }

  async function handleCancel() {
    if (!props.orderId || cancellingRef.current) return
    setCancelling(true)
    cancellingRef.current = true
    try {
      await paymentAPI.cancelOrder(props.orderId)
      props.onBack?.()
    } catch (err: unknown) {
      appStore.showError(extractI18nErrorMessage(err, t, 'payment.errors', t('common.error')))
    } finally {
      setCancelling(false)
      cancellingRef.current = false
    }
  }

  return (
    <div className="space-y-4">
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-500 border-t-transparent"></div>
        </div>
      ) : initError ? (
        <div className="card p-6 text-center">
          <p className="text-sm text-red-600 dark:text-red-400">{initError}</p>
          <button className="btn btn-secondary mt-4" onClick={() => props.onBack?.()}>{t('payment.result.backToRecharge')}</button>
        </div>
      ) : success ? (
        <div className="card p-6">
          <div className="flex flex-col items-center space-y-4 py-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
              <Icon name="check" size="lg" className="text-green-500" />
            </div>
            <p className="text-lg font-bold text-gray-900 dark:text-white">{t('payment.result.success')}</p>
            <div className="w-full rounded-xl bg-gray-50 p-4 dark:bg-dark-800">
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500 dark:text-gray-400">{t('payment.orders.orderId')}</span>
                  <span className="font-medium text-gray-900 dark:text-white">#{props.orderId}</span>
                </div>
                {props.amount > 0 ? (
                  <div className="flex justify-between">
                    <span className="text-gray-500 dark:text-gray-400">{t('payment.orders.amount')}</span>
                    <span className="font-medium text-gray-900 dark:text-white">{props.orderType === 'balance' ? '$' : '¥'}{props.amount.toFixed(2)}</span>
                  </div>
                ) : null}
                <div className="flex justify-between">
                  <span className="text-gray-500 dark:text-gray-400">{t('payment.orders.payAmount')}</span>
                  <span className="font-medium text-gray-900 dark:text-white">¥{props.payAmount.toFixed(2)}</span>
                </div>
              </div>
            </div>
            <button className="btn btn-primary" onClick={() => props.onDone?.()}>{t('common.confirm')}</button>
          </div>
        </div>
      ) : (
        <>
          <div className="card overflow-hidden">
            <div className="bg-gradient-to-br from-[#635bff] to-[#4f46e5] px-6 py-5 text-center">
              <p className="text-sm font-medium text-indigo-200">{t('payment.actualPay')}</p>
              <p className="mt-1 text-3xl font-bold text-white">¥{props.payAmount.toFixed(2)}</p>
            </div>
          </div>
          <div className="card p-6">
            <div ref={stripeMount} className="min-h-[200px]"></div>
            {error ? <p className="mt-4 text-sm text-red-600 dark:text-red-400">{error}</p> : null}
            <button className="btn btn-stripe mt-6 w-full py-3 text-base" disabled={submitting || !ready} onClick={handlePay}>
              {submitting ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"></span>
                  {t('common.processing')}
                </span>
              ) : (
                <span>{t('payment.stripePay')}</span>
              )}
            </button>
          </div>
          <button className="btn btn-secondary w-full" disabled={cancelling} onClick={handleCancel}>
            {cancelling ? t('common.processing') : t('payment.qr.cancelOrder')}
          </button>
        </>
      )}
    </div>
  )
}
