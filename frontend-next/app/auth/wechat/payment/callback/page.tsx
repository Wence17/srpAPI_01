'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useI18n } from '@/lib/i18n/I18nProvider'
import { useApp } from '@/context/AppContext'

function WechatPaymentCallbackView() {
  const { t } = useI18n()
  const router = useRouter()
  const searchParams = useSearchParams()
  const appStore = useApp()

  const [errorMessage, setErrorMessage] = useState('')

  useEffect(() => {
    if (errorMessage) {
      appStore.showError(errorMessage)
    }
  }, [errorMessage, appStore])

  const callbackProcessingText = t('auth.wechatPayment.callbackProcessing')
  const callbackTitleText = t('auth.wechatPayment.callbackTitle')
  const backToPaymentText = t('auth.wechatPayment.backToPayment')

  function readQueryString(key: string): string {
    return searchParams.get(key) || ''
  }

  function parseFragmentParams(): URLSearchParams {
    const raw = typeof window !== 'undefined' ? window.location.hash : ''
    const hash = raw.startsWith('#') ? raw.slice(1) : raw
    return new URLSearchParams(hash)
  }

  function normalizeRedirectPath(path: string | null | undefined): string {
    const value = (path || '').trim()
    if (!value) return '/purchase'
    if (!value.startsWith('/')) return '/purchase'
    if (value.startsWith('//') || value.includes('://')) return '/purchase'
    if (value === '/payment') return '/purchase'
    if (value.startsWith('/payment?')) return '/purchase' + value.slice('/payment'.length)
    return value
  }

  function appendQueryParam(query: Record<string, string>, key: string, value: string) {
    if (value) {
      query[key] = value
    }
  }

  function goBackToPayment() {
    void router.replace('/purchase')
  }

  useEffect(() => {
    const fragment = parseFragmentParams()
    const readParam = (key: string) => fragment.get(key) || readQueryString(key)

    const error = readParam('error') || readParam('err_msg') || readParam('errmsg')
    const errorDescription = readParam('error_description') || readParam('message')

    if (error) {
      setErrorMessage(errorDescription || error)
      return
    }

    const resumeToken = readParam('wechat_resume_token')
    const openid = readParam('openid')
    const state = readParam('state')
    const scope = readParam('scope')
    const paymentType = readParam('payment_type')
    const amount = readParam('amount')
    const orderType = readParam('order_type')
    const planId = readParam('plan_id')
    const redirectURL = new URL(normalizeRedirectPath(readParam('redirect')), window.location.origin)

    if (!resumeToken && !openid) {
      setErrorMessage(t('auth.wechatPayment.callbackMissingResumeToken'))
      return
    }

    const query: Record<string, string> = {
      ...Object.fromEntries(redirectURL.searchParams.entries()),
      wechat_resume: '1',
    }

    if (resumeToken) {
      query.wechat_resume_token = resumeToken
    } else {
      query.openid = openid
      appendQueryParam(query, 'state', state)
      appendQueryParam(query, 'scope', scope)
      appendQueryParam(query, 'payment_type', paymentType)
      appendQueryParam(query, 'amount', amount)
      appendQueryParam(query, 'order_type', orderType)
      appendQueryParam(query, 'plan_id', planId)
    }

    const params = new URLSearchParams(query)
    const qs = params.toString()
    router.replace(qs ? `${redirectURL.pathname}?${qs}` : redirectURL.pathname)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-10 dark:bg-dark-900">
      <div className="mx-auto max-w-2xl">
        <div className="card p-6">
          <h1 className="text-lg font-semibold text-gray-900 dark:text-white">{callbackTitleText}</h1>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">{errorMessage || callbackProcessingText}</p>

          {!errorMessage ? (
            <div className="mt-6 flex items-center justify-center py-10">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-500 border-t-transparent"></div>
            </div>
          ) : (
            <div className="mt-6 rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-dark-700 dark:bg-dark-800/80">
              <p className="text-sm text-gray-700 dark:text-gray-300">{errorMessage}</p>
              <button className="btn btn-primary mt-4" type="button" onClick={goBackToPayment}>{backToPaymentText}</button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default function WechatPaymentCallbackPage() {
  return (
    <Suspense fallback={null}>
      <WechatPaymentCallbackView />
    </Suspense>
  )
}
