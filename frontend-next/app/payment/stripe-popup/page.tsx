'use client'

import { Suspense, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { useI18n } from '@/lib/i18n/I18nProvider'
import { extractI18nErrorMessage } from '@/lib/apiError'
import { isMobileDevice } from '@/lib/device'

interface StripeWithWechatPay {
  confirmWechatPayPayment(
    clientSecret: string,
    options: Record<string, unknown>,
  ): Promise<{ error?: { message?: string }; paymentIntent?: { status: string } }>
}

const METHOD_COLORS: Record<string, string> = {
  alipay: '#00AEEF',
  wechat_pay: '#07C160',
}
const DEFAULT_METHOD_COLOR = '#635bff'

function StripePopupView() {
  const { t } = useI18n()
  const searchParams = useSearchParams()

  const orderId = String(searchParams.get('order_id') || '')
  const method = String(searchParams.get('method') || 'alipay')
  const amount = String(searchParams.get('amount') || '')

  const methodColor = METHOD_COLORS[method] || DEFAULT_METHOD_COLOR

  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [hint, setHint] = useState(t('payment.stripePopup.redirecting'))

  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null)
  const errorRef = useRef('')
  const successRef = useRef(false)

  function setErrorValue(v: string) {
    errorRef.current = v
    setError(v)
  }
  function setSuccessValue(v: boolean) {
    successRef.current = v
    setSuccess(v)
  }

  function closeWindow() {
    window.close()
  }

  function startPolling() {
    pollTimer.current = setInterval(async () => {
      try {
        const token =
          document.cookie.split('; ').find((c) => c.startsWith('token='))?.split('=')[1] ||
          localStorage.getItem('token') ||
          ''
        const res = await fetch('/api/v1/payment/orders/' + orderId, {
          headers: token ? { Authorization: 'Bearer ' + token } : {},
          credentials: 'include',
        })
        if (!res.ok) return
        const data = await res.json()
        const status = data?.data?.status
        if (status === 'COMPLETED' || status === 'PAID') {
          if (pollTimer.current) {
            clearInterval(pollTimer.current)
            pollTimer.current = null
          }
          setSuccessValue(true)
          setTimeout(closeWindow, 2000)
        }
      } catch {
        /* ignore */
      }
    }, 3000)
  }

  async function initStripe(clientSecret: string, publishableKey: string) {
    if (!clientSecret || !publishableKey) {
      setErrorValue(t('payment.stripeMissingParams'))
      return
    }
    try {
      const { loadStripe } = await import('@stripe/stripe-js')
      const stripe = await loadStripe(publishableKey)
      if (!stripe) {
        setErrorValue(t('payment.stripeLoadFailed'))
        return
      }

      const returnUrl = window.location.origin + '/payment/result?order_id=' + orderId + '&status=success'

      if (method === 'alipay') {
        const { error: err } = await stripe.confirmAlipayPayment(clientSecret, { return_url: returnUrl })
        if (err) setErrorValue(err.message || t('payment.result.failed'))
      } else if (method === 'wechat_pay') {
        setHint(t('payment.stripePopup.loadingQr'))
        const result = await (stripe as unknown as StripeWithWechatPay).confirmWechatPayPayment(clientSecret, {
          payment_method_options: { wechat_pay: { client: isMobileDevice() ? 'mobile_web' : 'web' } },
        })
        if (result.error) {
          setErrorValue(result.error.message || t('payment.result.failed'))
        } else if (result.paymentIntent?.status === 'succeeded') {
          setSuccessValue(true)
          setTimeout(closeWindow, 2000)
        } else {
          startPolling()
        }
      }
    } catch (err: unknown) {
      setErrorValue(extractI18nErrorMessage(err, t, 'payment.errors', t('payment.stripeLoadFailed')))
    }
  }

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return
      if (event.data?.type !== 'STRIPE_POPUP_INIT') return
      window.removeEventListener('message', handler)
      initStripe(event.data.clientSecret, event.data.publishableKey)
    }
    window.addEventListener('message', handler)

    if (window.opener) {
      window.opener.postMessage({ type: 'STRIPE_POPUP_READY' }, window.location.origin)
    }

    const timeout = setTimeout(() => {
      if (!errorRef.current && !successRef.current) {
        setErrorValue(t('payment.stripePopup.timeout'))
      }
    }, 15000)

    return () => {
      window.removeEventListener('message', handler)
      clearTimeout(timeout)
      if (pollTimer.current) clearInterval(pollTimer.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4 dark:bg-slate-950">
      <div className="w-full max-w-md space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-lg dark:border-slate-700 dark:bg-slate-900">
        {amount ? (
          <div className="text-center">
            <p className="text-3xl font-bold" style={{ color: methodColor }}>¥{amount}</p>
            {orderId ? (
              <p className="mt-1 text-sm text-gray-500 dark:text-slate-400">{t('payment.orders.orderId')}: {orderId}</p>
            ) : null}
          </div>
        ) : null}

        {error ? (
          <div className="space-y-3">
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600 dark:border-red-700 dark:bg-red-900/30 dark:text-red-400">
              {error}
            </div>
            <button className="w-full text-sm underline dark:text-blue-400 dark:hover:text-blue-300" style={{ color: methodColor }} onClick={closeWindow}>
              {t('common.close')}
            </button>
          </div>
        ) : success ? (
          <div className="space-y-3 py-4 text-center">
            <div className="text-5xl text-green-600 dark:text-green-400">✓</div>
            <p className="text-sm text-gray-500 dark:text-slate-400">{t('payment.result.success')}</p>
            <button className="text-sm underline dark:text-blue-400 dark:hover:text-blue-300" style={{ color: methodColor }} onClick={closeWindow}>
              {t('common.close')}
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-center py-8">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-t-transparent" style={{ borderColor: methodColor, borderTopColor: 'transparent' }} />
            <span className="ml-3 text-sm text-gray-500 dark:text-slate-400">{hint}</span>
          </div>
        )}
      </div>
    </div>
  )
}

export default function StripePopupPage() {
  return (
    <Suspense fallback={null}>
      <StripePopupView />
    </Suspense>
  )
}
