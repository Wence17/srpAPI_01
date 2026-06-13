'use client'

import { Suspense, useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useI18n } from '@/lib/i18n/I18nProvider'
import AppLayout from '@/components/layout/AppLayout'
import Icon from '@/components/icons/Icon'
import {
  PAYMENT_RECOVERY_STORAGE_KEY,
  readPaymentRecoverySnapshot,
  type PaymentRecoverySnapshot,
} from '@/lib/payment/paymentFlow'

function AirwallexPaymentView() {
  const { t, locale } = useI18n()
  const router = useRouter()
  const searchParams = useSearchParams()

  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')
  const searchParamsRef = useRef(searchParams)
  searchParamsRef.current = searchParams

  function queryString(key: string): string {
    return searchParamsRef.current.get(key) || ''
  }

  function buildSuccessUrl(snapshot: PaymentRecoverySnapshot): string {
    const url = new URL('/payment/result', window.location.origin)
    const orderId = queryString('order_id')
    const outTradeNo = queryString('out_trade_no')
    const resumeToken = queryString('resume_token')

    if (orderId || snapshot.orderId > 0) url.searchParams.set('order_id', orderId || String(snapshot.orderId))
    if (outTradeNo || snapshot.outTradeNo) url.searchParams.set('out_trade_no', outTradeNo || snapshot.outTradeNo)
    if (resumeToken || snapshot.resumeToken) url.searchParams.set('resume_token', resumeToken || snapshot.resumeToken)
    return url.toString()
  }

  function restoreAirwallexSnapshot(): PaymentRecoverySnapshot | null {
    if (typeof window === 'undefined') {
      return null
    }

    const orderId = Number(queryString('order_id')) || 0
    const outTradeNo = queryString('out_trade_no')
    const resumeToken = queryString('resume_token')
    const snapshot = readPaymentRecoverySnapshot(
      window.localStorage.getItem(PAYMENT_RECOVERY_STORAGE_KEY),
      resumeToken ? { resumeToken } : {},
    )

    if (!snapshot || snapshot.paymentType !== 'airwallex') {
      return null
    }
    if (orderId > 0 && snapshot.orderId !== orderId) {
      return null
    }
    if (outTradeNo && snapshot.outTradeNo !== outTradeNo) {
      return null
    }
    if (!snapshot.intentId || !snapshot.clientSecret) {
      return null
    }
    return snapshot
  }

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const snapshot = restoreAirwallexSnapshot()
      const checkoutLocale = locale.toLowerCase().startsWith('zh') ? 'zh' : 'en'

      if (!snapshot) {
        setLoading(false)
        setErrorMessage(t('payment.airwallexMissingParams'))
        return
      }

      try {
        const airwallex = await import('@airwallex/components-sdk')
        const result = await airwallex.init({
          env: snapshot.paymentEnv === 'prod' ? 'prod' : 'demo',
          enabledElements: ['payments'],
          locale: checkoutLocale,
        })

        if (cancelled) return
        setLoading(false)
        const checkoutOptions = {
          intent_id: snapshot.intentId,
          client_secret: snapshot.clientSecret,
          currency: snapshot.currency || 'CNY',
          country_code: snapshot.countryCode || 'CN',
          successUrl: buildSuccessUrl(snapshot),
        }
        if (!result.payments) {
          throw new Error(t('payment.airwallexLoadFailed'))
        }
        const redirectResult = result.payments.redirectToCheckout(checkoutOptions)

        if (typeof redirectResult === 'string' && redirectResult) {
          window.location.assign(redirectResult)
        }
      } catch (err: unknown) {
        if (cancelled) return
        setLoading(false)
        setErrorMessage(err instanceof Error && err.message ? err.message : t('payment.airwallexLoadFailed'))
      }
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <AppLayout>
      <div className="mx-auto max-w-lg space-y-6 py-8">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-emerald-500 border-t-transparent"></div>
          </div>
        ) : errorMessage ? (
          <div className="card p-8 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30">
              <Icon name="exclamationCircle" size="xl" className="text-red-500" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{t('payment.airwallexLoadFailed')}</h3>
            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">{errorMessage}</p>
            <button className="btn btn-primary mt-6" onClick={() => router.push('/purchase')}>{t('payment.result.backToRecharge')}</button>
          </div>
        ) : (
          <div className="card p-6">
            <div className="flex flex-col items-center space-y-4 py-4">
              <div className="h-10 w-10 animate-spin rounded-full border-4 border-emerald-500 border-t-transparent"></div>
              <p className="text-sm text-gray-500 dark:text-gray-400">{t('payment.qr.payInNewWindowHint')}</p>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  )
}

export default function AirwallexPaymentPage() {
  return (
    <Suspense fallback={null}>
      <AirwallexPaymentView />
    </Suspense>
  )
}
