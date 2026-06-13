'use client'

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { useI18n } from '@/lib/i18n/I18nProvider'
import { useAuth } from '@/context/AuthContext'
import { useApp } from '@/context/AppContext'
import { usePaymentStore } from '@/lib/stores/payment'
import { useSubscriptionStore } from '@/lib/stores/subscriptions'
import { paymentAPI } from '@/lib/payment/api'
import { extractApiErrorMessage, extractI18nErrorMessage } from '@/lib/apiError'
import { isMobileDevice } from '@/lib/device'
import type { SubscriptionPlan, CheckoutInfoResponse, CreateOrderResult, OrderType } from '@/lib/payment/types'
import AppLayout from '@/components/layout/AppLayout'
import AmountInput from '@/components/payment/AmountInput'
import PaymentMethodSelector, { type PaymentMethodOption } from '@/components/payment/PaymentMethodSelector'
import { METHOD_ORDER, getPaymentPopupFeatures } from '@/lib/payment/providerConfig'
import {
  PAYMENT_RECOVERY_STORAGE_KEY,
  buildCreateOrderPayload,
  clearPaymentRecoverySnapshot,
  decidePaymentLaunch,
  getVisibleMethods,
  normalizeVisibleMethod,
  readPaymentRecoverySnapshot,
  type PaymentRecoverySnapshot,
  writePaymentRecoverySnapshot,
} from '@/lib/payment/paymentFlow'
import {
  platformAccentBarClass,
  platformBadgeLightClass,
  platformBadgeClass,
  platformTextClass,
  platformLabel,
} from '@/lib/platformColors'
import SubscriptionPlanCard from '@/components/payment/SubscriptionPlanCard'
import PaymentStatusPanel from '@/components/payment/PaymentStatusPanel'
import Icon from '@/components/icons/Icon'
import { formatPaymentAmount, normalizePaymentCurrency } from '@/lib/payment/currency'
import { buildPaymentErrorToastMessage, describePaymentScenarioError } from '@/lib/payment/paymentUx'
import {
  hasWechatResumeQuery,
  parseWechatResumeRoute,
  searchParamsToQuery,
  stripWechatResumeQuery,
  type LocationQuery,
} from '@/lib/payment/paymentWechatResume'

interface CreateOrderOptions {
  openid?: string
  wechatResumeToken?: string
  paymentType?: string
  isResume?: boolean
  mobileQrFallbackAttempted?: boolean
}

interface WeixinJSBridgeLike {
  invoke(
    action: string,
    payload: Record<string, unknown>,
    callback: (result: Record<string, unknown>) => void,
  ): void
}

function emptyPaymentState(): PaymentRecoverySnapshot {
  return {
    orderId: 0,
    amount: 0,
    qrCode: '',
    expiresAt: '',
    paymentType: '',
    payUrl: '',
    outTradeNo: '',
    clientSecret: '',
    intentId: '',
    currency: '',
    countryCode: '',
    paymentEnv: '',
    payAmount: 0,
    orderType: '',
    paymentMode: '',
    resumeToken: '',
    createdAt: 0,
  }
}

function getWeixinJSBridge(): WeixinJSBridgeLike | undefined {
  return (window as Window & { WeixinJSBridge?: WeixinJSBridgeLike }).WeixinJSBridge
}

function waitForWeixinJSBridge(timeoutMs = 4000): Promise<WeixinJSBridgeLike | null> {
  const existing = getWeixinJSBridge()
  if (existing) return Promise.resolve(existing)

  return new Promise((resolve) => {
    let settled = false
    const finish = (bridge: WeixinJSBridgeLike | null) => {
      if (settled) return
      settled = true
      document.removeEventListener('WeixinJSBridgeReady', handleReady)
      document.removeEventListener('onWeixinJSBridgeReady', handleReady)
      window.clearTimeout(timer)
      resolve(bridge)
    }
    const handleReady = () => finish(getWeixinJSBridge() ?? null)
    const timer = window.setTimeout(() => finish(getWeixinJSBridge() ?? null), timeoutMs)
    document.addEventListener('WeixinJSBridgeReady', handleReady, false)
    document.addEventListener('onWeixinJSBridgeReady', handleReady, false)
  })
}

async function invokeWechatJsapiPayment(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
  const bridge = await waitForWeixinJSBridge()
  if (!bridge) {
    throw new Error('WECHAT_JSAPI_UNAVAILABLE')
  }
  return new Promise((resolve) => {
    bridge.invoke('getBrandWCPayRequest', payload, (result) => resolve(result || {}))
  })
}

function toQueryString(query: Record<string, unknown>): string {
  const params = new URLSearchParams()
  for (const [k, v] of Object.entries(query)) {
    if (v == null) continue
    if (Array.isArray(v)) {
      for (const item of v) {
        if (item != null && String(item) !== '') params.append(k, String(item))
      }
    } else {
      const s = String(v)
      if (s !== '') params.set(k, s)
    }
  }
  return params.toString()
}

function buildUrl(path: string, query: Record<string, unknown>): string {
  const qs = toQueryString(query)
  return qs ? `${path}?${qs}` : path
}

function isWechatBrowser(): boolean {
  return typeof window !== 'undefined' && /MicroMessenger/i.test(window.navigator.userAgent)
}

function buildWechatOAuthAuthorizeUrl(
  authorizeUrl: string,
  context: { paymentType: string; orderType: OrderType; planId?: number; orderAmount: number },
): string {
  const normalizedUrl = authorizeUrl.trim()
  if (!normalizedUrl || typeof window === 'undefined') {
    return normalizedUrl
  }

  try {
    const targetUrl = new URL(normalizedUrl, window.location.origin)
    const redirectPath = targetUrl.searchParams.get('redirect') || '/purchase'
    const redirectUrl = new URL(redirectPath, window.location.origin)
    const paymentType = normalizeVisibleMethod(context.paymentType) || context.paymentType.trim() || 'wxpay'

    redirectUrl.searchParams.set('payment_type', paymentType)
    redirectUrl.searchParams.set('order_type', context.orderType)

    if (context.planId) {
      redirectUrl.searchParams.set('plan_id', String(context.planId))
    } else {
      redirectUrl.searchParams.delete('plan_id')
    }

    if (context.orderAmount > 0) {
      redirectUrl.searchParams.set('amount', String(context.orderAmount))
    } else {
      redirectUrl.searchParams.delete('amount')
    }

    targetUrl.searchParams.set('redirect', `${redirectUrl.pathname}${redirectUrl.search}`)
    return targetUrl.toString()
  } catch {
    return normalizedUrl
  }
}

interface MobileQrFallbackContext {
  orderAmount: number
  orderType: OrderType
  planId?: number
  paymentType: string
  attempted: boolean
}

function shouldFallbackToDesktopQr(err: unknown, paymentMethod: string, attempted: boolean): boolean {
  if (attempted || !isMobileDevice()) {
    return false
  }

  const normalizedMethod = normalizeVisibleMethod(paymentMethod) || paymentMethod
  const reason = typeof err === 'object' && err && 'reason' in err && typeof (err as { reason?: unknown }).reason === 'string'
    ? (err as { reason: string }).reason
    : ''
  const message = err instanceof Error
    ? err.message
    : (typeof err === 'object' && err && 'message' in err && typeof (err as { message?: unknown }).message === 'string'
      ? (err as { message: string }).message
      : '')
  const normalizedMessage = message.toLowerCase()

  if (normalizedMethod === 'wxpay') {
    return reason === 'WECHAT_H5_NOT_AUTHORIZED'
      || reason === 'WECHAT_PAYMENT_MP_NOT_CONFIGURED'
      || reason === 'WECHAT_JSAPI_FAILED'
      || reason === 'PAYMENT_GATEWAY_ERROR'
      || reason === 'UNHANDLED_PAYMENT_SCENARIO'
      || normalizedMessage.includes('weixinjsbridge is unavailable')
      || normalizedMessage.includes('wechat_jsapi_unavailable')
  }

  if (normalizedMethod === 'alipay') {
    return reason === 'PAYMENT_GATEWAY_ERROR' || reason === 'UNHANDLED_PAYMENT_SCENARIO'
  }

  return false
}

function getDaysRemaining(expiresAt: string): number {
  const diff = new Date(expiresAt).getTime() - Date.now()
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)))
}

const EMPTY_CHECKOUT: CheckoutInfoResponse = {
  methods: {},
  global_min: 0,
  global_max: 0,
  plans: [],
  balance_disabled: false,
  balance_recharge_multiplier: 1,
  recharge_fee_rate: 0,
  help_text: '',
  help_image_url: '',
  stripe_publishable_key: '',
}

function PurchaseView() {
  const { t, locale } = useI18n()
  const router = useRouter()
  const searchParams = useSearchParams()
  const pathname = usePathname()
  const { user, refreshUser } = useAuth()
  const appStore = useApp()
  const paymentStore = usePaymentStore()
  const subscriptionStore = useSubscriptionStore()

  const activeSubscriptions = subscriptionStore.activeSubscriptions

  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [activeTab, setActiveTab] = useState<'recharge' | 'subscription'>('recharge')
  const [amount, setAmount] = useState<number | null>(null)
  const [selectedMethod, setSelectedMethod] = useState('')
  const [selectedPlan, setSelectedPlan] = useState<SubscriptionPlan | null>(null)
  const [previewImage, setPreviewImage] = useState('')
  const [paymentPhase, setPaymentPhase] = useState<'select' | 'paying'>('select')
  const [paymentState, setPaymentState] = useState<PaymentRecoverySnapshot>(emptyPaymentState())
  const [checkout, setCheckout] = useState<CheckoutInfoResponse>(EMPTY_CHECKOUT)
  const [showRenewalModal, setShowRenewalModal] = useState(false)
  const [renewGroupId, setRenewGroupId] = useState<number | null>(null)

  // errorMessage/errorHint mirror the Vue refs; they only feed toast messages.
  const errorMessageRef = useRef('')
  const errorHintRef = useRef('')
  const submittingRef = useRef(false)

  const localeCode = locale

  const routeQuery = useMemo<LocationQuery>(() => searchParamsToQuery(searchParams), [searchParams])

  function persistRecoverySnapshot(snapshot: PaymentRecoverySnapshot) {
    if (typeof window === 'undefined' || !snapshot.orderId) return
    writePaymentRecoverySnapshot(window.localStorage, snapshot, PAYMENT_RECOVERY_STORAGE_KEY)
  }

  function removeRecoverySnapshot() {
    if (typeof window === 'undefined') return
    clearPaymentRecoverySnapshot(window.localStorage, PAYMENT_RECOVERY_STORAGE_KEY)
  }

  function resetPayment() {
    setPaymentPhase('select')
    setPaymentState(emptyPaymentState())
    removeRecoverySnapshot()
  }

  async function redirectToPaymentResult(state: PaymentRecoverySnapshot): Promise<void> {
    const query: Record<string, string | undefined> = {}
    if (state.orderId > 0) {
      query.order_id = String(state.orderId)
    }
    if (state.outTradeNo) {
      query.out_trade_no = state.outTradeNo
    }
    if (state.resumeToken) {
      query.resume_token = state.resumeToken
    }
    router.push(buildUrl('/payment/result', query))
  }

  function onPaymentDone() {
    const wasSubscription = paymentState.orderType === 'subscription'
    resetPayment()
    setSelectedPlan(null)
    if (wasSubscription) {
      subscriptionStore.fetchActiveSubscriptions(true).catch(() => {})
    }
  }

  function onPaymentSuccess() {
    removeRecoverySnapshot()
    refreshUser()
    if (paymentState.orderType === 'subscription') {
      subscriptionStore.fetchActiveSubscriptions(true).catch(() => {})
    }
  }

  function onPaymentSettled() {
    removeRecoverySnapshot()
  }

  // ==================== Derived values (computed) ====================

  const tabs = useMemo(() => {
    const result: { key: 'recharge' | 'subscription'; label: string }[] = []
    if (!checkout.balance_disabled) result.push({ key: 'recharge', label: t('payment.tabTopUp') })
    result.push({ key: 'subscription', label: t('payment.tabSubscribe') })
    return result
  }, [checkout.balance_disabled, t])

  const visibleMethods = useMemo(() => getVisibleMethods(checkout.methods), [checkout.methods])
  const enabledMethods = useMemo(() => Object.keys(visibleMethods), [visibleMethods])
  const validAmount = amount ?? 0
  const balanceRechargeMultiplier = useMemo(() => {
    const multiplier = checkout.balance_recharge_multiplier
    return multiplier > 0 ? multiplier : 1
  }, [checkout.balance_recharge_multiplier])
  const creditedAmount = Math.round(validAmount * balanceRechargeMultiplier * 100) / 100

  const planGridClass = useMemo(() => {
    const n = checkout.plans.length
    if (n <= 2) return 'grid grid-cols-1 gap-5 sm:grid-cols-2'
    return 'grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3'
  }, [checkout.plans.length])

  const amountFitsMethod = useCallback(
    (amt: number, methodType: string): boolean => {
      if (amt <= 0) return true
      const ml = visibleMethods[methodType]
      if (!ml) return false
      if (ml.single_min > 0 && amt < ml.single_min) return false
      if (ml.single_max > 0 && amt > ml.single_max) return false
      return true
    },
    [visibleMethods],
  )

  const globalMinAmount = useMemo(() => {
    const limits = Object.values(visibleMethods)
    if (limits.length === 0) return 0
    if (limits.some((limit) => limit.single_min <= 0)) return 0
    return Math.min(...limits.map((limit) => limit.single_min))
  }, [visibleMethods])

  const globalMaxAmount = useMemo(() => {
    const limits = Object.values(visibleMethods)
    if (limits.length === 0) return 0
    if (limits.some((limit) => limit.single_max <= 0)) return 0
    return Math.max(...limits.map((limit) => limit.single_max))
  }, [visibleMethods])

  const selectedLimit = visibleMethods[selectedMethod]
  const selectedCurrency = useMemo(() => normalizePaymentCurrency(selectedLimit?.currency), [selectedLimit])

  const formatSelectedPaymentAmount = useCallback(
    (value: number): string => formatPaymentAmount(value, selectedCurrency, localeCode),
    [selectedCurrency, localeCode],
  )

  const methodOptions = useMemo<PaymentMethodOption[]>(
    () =>
      enabledMethods.map((type) => {
        const ml = visibleMethods[type]
        return {
          type,
          fee_rate: ml?.fee_rate ?? 0,
          available: ml?.available !== false && amountFitsMethod(validAmount, type),
        }
      }),
    [enabledMethods, visibleMethods, amountFitsMethod, validAmount],
  )

  const feeRate = checkout?.recharge_fee_rate ?? 0
  const feeAmount =
    feeRate > 0 && validAmount > 0 ? Math.ceil(((validAmount * feeRate) / 100) * 100) / 100 : 0
  const totalAmount =
    feeRate > 0 && validAmount > 0 ? Math.round((validAmount + feeAmount) * 100) / 100 : validAmount

  const amountError = useMemo(() => {
    if (validAmount <= 0) return ''
    if (!enabledMethods.some((m) => amountFitsMethod(validAmount, m))) {
      return t('payment.amountNoMethod')
    }
    const ml = selectedLimit
    if (ml) {
      if (ml.single_min > 0 && validAmount < ml.single_min) return t('payment.amountTooLow', { min: formatSelectedPaymentAmount(ml.single_min) })
      if (ml.single_max > 0 && validAmount > ml.single_max) return t('payment.amountTooHigh', { max: formatSelectedPaymentAmount(ml.single_max) })
    }
    return ''
  }, [validAmount, enabledMethods, amountFitsMethod, selectedLimit, t, formatSelectedPaymentAmount])

  const canSubmit =
    validAmount > 0 && amountFitsMethod(validAmount, selectedMethod) && selectedLimit?.available !== false

  const subMethodOptions = useMemo<PaymentMethodOption[]>(() => {
    const planPrice = selectedPlan?.price ?? 0
    return enabledMethods.map((type) => {
      const ml = visibleMethods[type]
      return {
        type,
        fee_rate: ml?.fee_rate ?? 0,
        available: ml?.available !== false && amountFitsMethod(planPrice, type),
      }
    })
  }, [selectedPlan, enabledMethods, visibleMethods, amountFitsMethod])

  const subFeeAmount = useMemo(() => {
    const price = selectedPlan?.price ?? 0
    if (feeRate <= 0 || price <= 0) return 0
    return Math.ceil(((price * feeRate) / 100) * 100) / 100
  }, [selectedPlan, feeRate])

  const subTotalAmount = useMemo(() => {
    const price = selectedPlan?.price ?? 0
    if (feeRate <= 0 || price <= 0) return price
    return Math.round((price + subFeeAmount) * 100) / 100
  }, [selectedPlan, feeRate, subFeeAmount])

  const canSubmitSubscription =
    selectedPlan !== null &&
    amountFitsMethod(selectedPlan.price, selectedMethod) &&
    selectedLimit?.available !== false

  // Auto-switch to first available method when current selection can't handle the amount
  useEffect(() => {
    if (validAmount <= 0 || amountFitsMethod(validAmount, selectedMethod)) return
    const available = enabledMethods.find((m) => amountFitsMethod(validAmount, m))
    if (available) setSelectedMethod(available)
  }, [validAmount, selectedMethod, enabledMethods, amountFitsMethod])

  const paymentButtonClass = useMemo(() => {
    const m = selectedMethod
    if (!m) return 'btn-primary'
    if (m.includes('alipay')) return 'btn-alipay'
    if (m.includes('wxpay')) return 'btn-wxpay'
    if (m === 'stripe') return 'btn-stripe'
    if (m === 'airwallex') return 'btn-airwallex'
    return 'btn-primary'
  }, [selectedMethod])

  const planBadgeClass = platformBadgeClass(selectedPlan?.group_platform || '')
  const planTextClass = platformTextClass(selectedPlan?.group_platform || '')

  const renewalPlans = useMemo(() => {
    if (renewGroupId == null) return []
    return checkout.plans.filter((p) => p.group_id === renewGroupId)
  }, [renewGroupId, checkout.plans])

  const planValiditySuffix = useMemo(() => {
    if (!selectedPlan) return ''
    const u = selectedPlan.validity_unit || 'day'
    if (u === 'month') return t('payment.perMonth')
    if (u === 'year') return t('payment.perYear')
    return `${selectedPlan.validity_days}${t('payment.days')}`
  }, [selectedPlan, t])

  function selectPlan(plan: SubscriptionPlan) {
    setSelectedPlan(plan)
    errorMessageRef.current = ''
  }

  function selectPlanFromModal(plan: SubscriptionPlan) {
    setShowRenewalModal(false)
    setRenewGroupId(null)
    setSelectedPlan(plan)
    errorMessageRef.current = ''
  }

  function closeRenewalModal() {
    setShowRenewalModal(false)
    setRenewGroupId(null)
  }

  async function handleSubmitRecharge() {
    if (!canSubmit || submittingRef.current) return
    await createOrder(validAmount, 'balance')
  }

  async function confirmSubscribe() {
    if (!selectedPlan || submittingRef.current) return
    await createOrder(selectedPlan.price, 'subscription', selectedPlan.id)
  }

  function applyScenarioError(err: unknown, paymentMethod: string): boolean {
    const descriptor = describePaymentScenarioError(err, {
      paymentMethod,
      isMobile: isMobileDevice(),
      isWechatBrowser: isWechatBrowser(),
    })
    if (!descriptor) {
      errorMessageRef.current = ''
      errorHintRef.current = ''
      return false
    }
    errorMessageRef.current = t(descriptor.messageKey)
    errorHintRef.current = descriptor.hintKey ? t(descriptor.hintKey) : ''
    appStore.showError(buildPaymentErrorToastMessage(errorMessageRef.current, errorHintRef.current))
    return true
  }

  async function attemptMobileQrFallback(err: unknown, context: MobileQrFallbackContext): Promise<boolean> {
    if (!shouldFallbackToDesktopQr(err, context.paymentType, context.attempted)) {
      return false
    }

    try {
      const visibleMethod = normalizeVisibleMethod(context.paymentType) || context.paymentType
      const payload = buildCreateOrderPayload({
        amount: context.orderAmount,
        paymentType: visibleMethod,
        orderType: context.orderType,
        planId: context.planId,
        origin: typeof window !== 'undefined' ? window.location.origin : '',
        isMobile: false,
        isWechatBrowser: false,
      })
      const result = (await paymentStore.createOrder(payload)) as CreateOrderResult & { resume_token?: string }
      const stripeMethod = visibleMethod === 'wxpay' ? 'wechat_pay' : 'alipay'
      const stripeRouteUrl = result.client_secret
        ? buildUrl('/payment/stripe', {
            order_id: String(result.order_id),
            client_secret: result.client_secret,
            method: stripeMethod,
            resume_token: result.resume_token || undefined,
          })
        : ''
      const decision = decidePaymentLaunch(result, {
        visibleMethod,
        orderType: context.orderType,
        isMobile: false,
        isWechatBrowser: false,
        stripePopupUrl: stripeRouteUrl,
        stripeRouteUrl,
      })

      if (decision.kind !== 'qr_waiting' || !decision.paymentState.qrCode) {
        return false
      }

      errorMessageRef.current = ''
      errorHintRef.current = ''
      setPaymentState(decision.paymentState)
      setPaymentPhase('paying')
      persistRecoverySnapshot(decision.recovery)
      appStore.showWarning(t('payment.errors.mobilePaymentFallbackToQr'))
      return true
    } catch {
      return false
    }
  }

  async function createOrder(orderAmount: number, orderType: OrderType, planId?: number, options: CreateOrderOptions = {}) {
    setSubmitting(true)
    submittingRef.current = true
    errorMessageRef.current = ''
    errorHintRef.current = ''
    const requestType = normalizeVisibleMethod(options.paymentType || selectedMethod) || options.paymentType || selectedMethod
    try {
      const payload = buildCreateOrderPayload({
        amount: orderAmount,
        paymentType: requestType,
        orderType,
        planId,
        origin: typeof window !== 'undefined' ? window.location.origin : '',
        isMobile: isMobileDevice(),
        isWechatBrowser: isWechatBrowser(),
        forceQRCode: !!(checkout.alipay_force_qrcode && normalizeVisibleMethod(requestType) === 'alipay'),
      })
      if (options.openid) {
        payload.openid = options.openid
      }
      if (options.wechatResumeToken) {
        payload.wechat_resume_token = options.wechatResumeToken
      }

      const result = (await paymentStore.createOrder(payload)) as CreateOrderResult & { resume_token?: string }
      const openWindow = (url: string) => {
        const win = window.open(url, 'paymentPopup', getPaymentPopupFeatures())
        if (!win || win.closed) {
          window.location.href = url
        }
      }
      const visibleMethod = normalizeVisibleMethod(requestType) || requestType
      const stripeMethod = visibleMethod === 'stripe'
        ? ''
        : visibleMethod === 'wxpay' ? 'wechat_pay' : 'alipay'
      const stripeRouteUrl = result.client_secret && visibleMethod !== 'airwallex'
        ? buildUrl('/payment/stripe', {
            order_id: String(result.order_id),
            client_secret: result.client_secret,
            method: stripeMethod || undefined,
            resume_token: result.resume_token || undefined,
          })
        : ''
      const airwallexRouteUrl = result.client_secret && result.intent_id
        ? buildUrl('/payment/airwallex', {
            order_id: String(result.order_id),
            out_trade_no: result.out_trade_no || undefined,
            resume_token: result.resume_token || undefined,
          })
        : ''
      const decision = decidePaymentLaunch(result, {
        visibleMethod,
        orderType,
        isMobile: isMobileDevice(),
        isWechatBrowser: isWechatBrowser(),
        forceQRCode: !!(checkout.alipay_force_qrcode && visibleMethod === 'alipay'),
        stripePopupUrl: stripeRouteUrl,
        stripeRouteUrl,
        airwallexRouteUrl,
      })

      if (decision.kind === 'wechat_oauth' && decision.oauth?.authorize_url) {
        window.location.href = buildWechatOAuthAuthorizeUrl(decision.oauth.authorize_url, {
          paymentType: visibleMethod,
          orderType,
          planId,
          orderAmount,
        })
        return
      }

      if (decision.kind === 'unhandled') {
        applyScenarioError({ reason: 'UNHANDLED_PAYMENT_SCENARIO' }, visibleMethod)
        return
      }

      setPaymentState(decision.paymentState)
      setPaymentPhase('paying')
      persistRecoverySnapshot(decision.recovery)

      if (decision.kind === 'stripe_popup') {
        openWindow(decision.paymentState.payUrl)
        return
      }
      if (decision.kind === 'stripe_route') {
        window.location.href = decision.paymentState.payUrl
        return
      }
      if (decision.kind === 'airwallex_route') {
        window.location.href = decision.paymentState.payUrl
        return
      }
      if (decision.kind === 'wechat_jsapi' && decision.jsapi) {
        try {
          const jsapiResult = await invokeWechatJsapiPayment(decision.jsapi as Record<string, unknown>)
          const errMsg = String(jsapiResult.err_msg || '').toLowerCase()
          if (errMsg.includes('cancel')) {
            appStore.showInfo(t('payment.qr.cancelled'))
            resetPayment()
          } else if (errMsg && !errMsg.includes('ok')) {
            resetPayment()
            const fallbackApplied = await attemptMobileQrFallback(
              { reason: 'WECHAT_JSAPI_FAILED', message: errMsg },
              {
                orderAmount,
                orderType,
                planId,
                paymentType: visibleMethod,
                attempted: options.mobileQrFallbackAttempted === true,
              },
            )
            if (!fallbackApplied) {
              applyScenarioError({ reason: 'WECHAT_JSAPI_FAILED', message: errMsg }, visibleMethod)
            }
          } else {
            const resultState = { ...decision.paymentState }
            resetPayment()
            await redirectToPaymentResult(resultState)
          }
        } catch (err: unknown) {
          resetPayment()
          const fallbackApplied = await attemptMobileQrFallback(err, {
            orderAmount,
            orderType,
            planId,
            paymentType: visibleMethod,
            attempted: options.mobileQrFallbackAttempted === true,
          })
          if (!fallbackApplied) {
            throw err
          }
        }
        return
      }
      if (decision.kind === 'redirect_waiting' && decision.paymentState.payUrl) {
        if (isMobileDevice()) {
          window.location.href = decision.paymentState.payUrl
          return
        }
        openWindow(decision.paymentState.payUrl)
      }
    } catch (err: unknown) {
      const apiErr = err as Record<string, unknown>
      if (apiErr.reason === 'TOO_MANY_PENDING') {
        const metadata = apiErr.metadata as Record<string, unknown> | undefined
        errorMessageRef.current = t('payment.errors.tooManyPending', { max: metadata?.max || '' })
        errorHintRef.current = ''
      } else if (apiErr.reason === 'CANCEL_RATE_LIMITED') {
        errorMessageRef.current = t('payment.errors.cancelRateLimited')
        errorHintRef.current = ''
      } else if (
        await attemptMobileQrFallback(err, {
          orderAmount,
          orderType,
          planId,
          paymentType: requestType,
          attempted: options.mobileQrFallbackAttempted === true,
        })
      ) {
        return
      } else {
        const handled = applyScenarioError(
          err,
          normalizeVisibleMethod(options.paymentType || selectedMethod) || selectedMethod,
        )
        if (!handled) {
          errorMessageRef.current = extractI18nErrorMessage(err, t, 'payment.errors', extractApiErrorMessage(err, t('payment.result.failed')))
          errorHintRef.current = ''
        }
        if (handled) {
          return
        }
      }
      appStore.showError(buildPaymentErrorToastMessage(errorMessageRef.current, errorHintRef.current))
    } finally {
      setSubmitting(false)
      submittingRef.current = false
    }
  }

  async function resumeWechatPaymentFromQuery(currentCheckout: CheckoutInfoResponse) {
    const resume = parseWechatResumeRoute(routeQuery, currentCheckout.plans, validAmount)
    if (!resume) {
      return
    }

    setSelectedMethod(resume.paymentType)
    if (resume.orderType === 'balance' && resume.orderAmount > 0) {
      setAmount(resume.orderAmount)
    }
    if (resume.orderType === 'subscription' && resume.planId) {
      setSelectedPlan(currentCheckout.plans.find((plan) => plan.id === resume.planId) ?? null)
    }

    router.replace(buildUrl(pathname, stripWechatResumeQuery(routeQuery)))

    if (resume.wechatResumeToken) {
      await createOrder(0, resume.orderType, resume.planId, {
        wechatResumeToken: resume.wechatResumeToken,
        paymentType: resume.paymentType,
        isResume: true,
      })
      return
    }

    if (resume.orderAmount > 0 && resume.openid) {
      await createOrder(resume.orderAmount, resume.orderType, resume.planId, {
        openid: resume.openid,
        paymentType: resume.paymentType,
        isResume: true,
      })
    }
  }

  // onMounted
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await paymentAPI.getCheckoutInfo()
        if (cancelled) return
        const data = res.data
        setCheckout(data)
        const localEnabled = Object.keys(getVisibleMethods(data.methods))
        if (localEnabled.length) {
          const order: readonly string[] = METHOD_ORDER
          const sorted = [...localEnabled].sort((a, b) => {
            const ai = order.indexOf(a)
            const bi = order.indexOf(b)
            return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi)
          })
          setSelectedMethod(sorted[0])
        }
        if (typeof window !== 'undefined') {
          if (hasWechatResumeQuery(routeQuery)) {
            removeRecoverySnapshot()
          }
          const routeResumeToken = typeof routeQuery.resume_token === 'string'
            ? routeQuery.resume_token
            : typeof routeQuery.wechat_resume_token === 'string'
              ? routeQuery.wechat_resume_token
              : undefined
          const restored = readPaymentRecoverySnapshot(
            window.localStorage.getItem(PAYMENT_RECOVERY_STORAGE_KEY),
            { resumeToken: routeResumeToken },
          )
          if (restored) {
            setPaymentState(restored)
            setPaymentPhase('paying')
            const restoredMethod = normalizeVisibleMethod(restored.paymentType)
            if (restoredMethod) {
              setSelectedMethod(restoredMethod)
            }
          } else {
            removeRecoverySnapshot()
          }
        }
        await resumeWechatPaymentFromQuery(data)
        if (data.balance_disabled) {
          setActiveTab('subscription')
        }
        if (routeQuery.tab === 'subscription') {
          setActiveTab('subscription')
          if (routeQuery.group) {
            const groupId = Number(routeQuery.group)
            const groupPlans = data.plans.filter((p) => p.group_id === groupId)
            if (groupPlans.length === 1) {
              setSelectedPlan(groupPlans[0])
            } else if (groupPlans.length > 1) {
              setRenewGroupId(groupId)
              setShowRenewalModal(true)
            }
          }
        }
      } catch (err: unknown) {
        appStore.showError(extractI18nErrorMessage(err, t, 'payment.errors', t('common.error')))
      } finally {
        if (!cancelled) setLoading(false)
      }
      // Fetch active subscriptions (uses cache, non-blocking)
      subscriptionStore.fetchActiveSubscriptions().catch(() => {})
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <AppLayout>
      <div className="mx-auto max-w-4xl space-y-6">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-500 border-t-transparent"></div>
          </div>
        ) : (
          <>
            {/* Tab Switcher (hide during payment and subscription confirm) */}
            {tabs.length > 1 && paymentPhase === 'select' && !selectedPlan ? (
              <div className="flex space-x-1 rounded-xl bg-gray-100 p-1 dark:bg-dark-800">
                {tabs.map((tab) => (
                  <button
                    key={tab.key}
                    className={[
                      'flex-1 rounded-lg px-4 py-2.5 text-sm font-medium transition-all',
                      activeTab === tab.key
                        ? 'bg-white text-gray-900 shadow dark:bg-dark-700 dark:text-white'
                        : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300',
                    ].join(' ')}
                    onClick={() => setActiveTab(tab.key)}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            ) : null}

            {/* Payment in progress (shared by recharge and subscription) */}
            {paymentPhase === 'paying' ? (
              <PaymentStatusPanel
                orderId={paymentState.orderId}
                qrCode={paymentState.qrCode}
                expiresAt={paymentState.expiresAt}
                paymentType={paymentState.paymentType}
                payUrl={paymentState.payUrl}
                orderType={paymentState.orderType || undefined}
                currency={paymentState.currency || selectedCurrency}
                onDone={onPaymentDone}
                onSuccess={onPaymentSuccess}
                onSettled={onPaymentSettled}
              />
            ) : (
              <>
                {/* Top-up Tab */}
                {activeTab === 'recharge' ? (
                  <>
                    {/* Recharge Account Card */}
                    <div className="card p-5">
                      <p className="text-xs font-medium text-gray-400 dark:text-gray-500">{t('payment.rechargeAccount')}</p>
                      <p className="mt-1 text-base font-semibold text-gray-900 dark:text-white">{user?.username || ''}</p>
                      <p className="mt-0.5 text-sm font-medium text-green-600 dark:text-green-400">
                        {t('payment.currentBalance')}: {user?.balance?.toFixed(2) || '0.00'}
                      </p>
                    </div>
                    {enabledMethods.length === 0 ? (
                      <div className="card py-16 text-center">
                        <p className="text-gray-500 dark:text-gray-400">{t('payment.notAvailable')}</p>
                      </div>
                    ) : (
                      <>
                        <div className="card p-6">
                          <AmountInput
                            modelValue={amount}
                            onChange={setAmount}
                            amounts={[10, 20, 50, 100, 200, 500, 1000, 2000, 5000]}
                            min={globalMinAmount}
                            max={globalMaxAmount}
                          />
                          {amountError ? <p className="mt-2 text-xs text-amber-600 dark:text-amber-300">{amountError}</p> : null}
                        </div>
                        {enabledMethods.length >= 1 ? (
                          <div className="card p-6">
                            <PaymentMethodSelector methods={methodOptions} selected={selectedMethod} onSelect={setSelectedMethod} />
                          </div>
                        ) : null}
                        {validAmount > 0 ? (
                          <div className="card p-6">
                            <div className="space-y-2 text-sm">
                              <div className="flex justify-between">
                                <span className="text-gray-500 dark:text-gray-400">{t('payment.paymentAmount')}</span>
                                <span className="text-gray-900 dark:text-white">{formatSelectedPaymentAmount(validAmount)}</span>
                              </div>
                              {feeRate > 0 ? (
                                <div className="flex justify-between">
                                  <span className="text-gray-500 dark:text-gray-400">{t('payment.fee')} ({feeRate}%)</span>
                                  <span className="text-gray-900 dark:text-white">{formatSelectedPaymentAmount(feeAmount)}</span>
                                </div>
                              ) : null}
                              {feeRate > 0 ? (
                                <div className="flex justify-between border-t border-gray-200 pt-2 dark:border-dark-600">
                                  <span className="font-medium text-gray-700 dark:text-gray-300">{t('payment.actualPay')}</span>
                                  <span className="text-lg font-bold text-primary-600 dark:text-primary-400">{formatSelectedPaymentAmount(totalAmount)}</span>
                                </div>
                              ) : null}
                              {balanceRechargeMultiplier !== 1 ? (
                                <div className={['flex justify-between', feeRate <= 0 ? 'border-t border-gray-200 pt-2 dark:border-dark-600' : ''].join(' ')}>
                                  <span className="text-gray-500 dark:text-gray-400">{t('payment.creditedBalance')}</span>
                                  <span className="text-gray-900 dark:text-white">${creditedAmount.toFixed(2)}</span>
                                </div>
                              ) : null}
                              {balanceRechargeMultiplier !== 1 ? (
                                <p className="border-t border-gray-200 pt-2 text-xs text-gray-500 dark:border-dark-600 dark:text-gray-400">
                                  {t('payment.rechargeRatePreview', { usd: balanceRechargeMultiplier.toFixed(2) })}
                                </p>
                              ) : null}
                            </div>
                          </div>
                        ) : null}
                        <button className={['btn w-full py-3 text-base font-medium', paymentButtonClass].join(' ')} disabled={!canSubmit || submitting} onClick={handleSubmitRecharge}>
                          {submitting ? (
                            <span className="flex items-center justify-center gap-2">
                              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"></span>
                              {t('common.processing')}
                            </span>
                          ) : (
                            <span>{t('payment.createOrder')} {formatSelectedPaymentAmount(totalAmount)}</span>
                          )}
                        </button>
                      </>
                    )}
                  </>
                ) : activeTab === 'subscription' ? (
                  <>
                    {selectedPlan ? (
                      <>
                        <div className="card p-5">
                          {/* Header: platform badge + plan name */}
                          <div className="mb-3 flex flex-wrap items-center gap-2">
                            <span className={['rounded-md border px-2 py-0.5 text-xs font-medium', planBadgeClass].join(' ')}>
                              {platformLabel(selectedPlan.group_platform || '')}
                            </span>
                            <h3 className="text-lg font-bold text-gray-900 dark:text-white">{selectedPlan.name}</h3>
                          </div>
                          {/* Price */}
                          <div className="flex items-baseline gap-2">
                            {selectedPlan.original_price ? (
                              <span className="text-sm text-gray-400 line-through dark:text-gray-500">
                                {formatSelectedPaymentAmount(selectedPlan.original_price)}
                              </span>
                            ) : null}
                            <span className={['text-3xl font-bold', planTextClass].join(' ')}>{formatSelectedPaymentAmount(selectedPlan.price)}</span>
                            <span className="text-sm text-gray-500 dark:text-gray-400">/ {planValiditySuffix}</span>
                          </div>
                          {/* Description */}
                          {selectedPlan.description ? (
                            <p className="mt-2 text-sm leading-relaxed text-gray-500 dark:text-gray-400">{selectedPlan.description}</p>
                          ) : null}
                          {/* Rate + Limits grid */}
                          <div className="mt-3 grid grid-cols-2 gap-3">
                            <div>
                              <span className="text-xs text-gray-400 dark:text-gray-500">{t('payment.planCard.rate')}</span>
                              <div className="flex items-baseline">
                                <span className={['text-lg font-bold', planTextClass].join(' ')}>×{selectedPlan.rate_multiplier ?? 1}</span>
                              </div>
                            </div>
                            {selectedPlan.daily_limit_usd != null ? (
                              <div>
                                <span className="text-xs text-gray-400 dark:text-gray-500">{t('payment.planCard.dailyLimit')}</span>
                                <div className="text-lg font-semibold text-gray-800 dark:text-gray-200">${selectedPlan.daily_limit_usd}</div>
                              </div>
                            ) : null}
                            {selectedPlan.weekly_limit_usd != null ? (
                              <div>
                                <span className="text-xs text-gray-400 dark:text-gray-500">{t('payment.planCard.weeklyLimit')}</span>
                                <div className="text-lg font-semibold text-gray-800 dark:text-gray-200">${selectedPlan.weekly_limit_usd}</div>
                              </div>
                            ) : null}
                            {selectedPlan.monthly_limit_usd != null ? (
                              <div>
                                <span className="text-xs text-gray-400 dark:text-gray-500">{t('payment.planCard.monthlyLimit')}</span>
                                <div className="text-lg font-semibold text-gray-800 dark:text-gray-200">${selectedPlan.monthly_limit_usd}</div>
                              </div>
                            ) : null}
                            {selectedPlan.daily_limit_usd == null && selectedPlan.weekly_limit_usd == null && selectedPlan.monthly_limit_usd == null ? (
                              <div>
                                <span className="text-xs text-gray-400 dark:text-gray-500">{t('payment.planCard.quota')}</span>
                                <div className="text-lg font-semibold text-gray-800 dark:text-gray-200">{t('payment.planCard.unlimited')}</div>
                              </div>
                            ) : null}
                          </div>
                        </div>
                        {enabledMethods.length >= 1 ? (
                          <div className="card p-6">
                            <PaymentMethodSelector methods={subMethodOptions} selected={selectedMethod} onSelect={setSelectedMethod} />
                          </div>
                        ) : null}
                        {feeRate > 0 && selectedPlan.price > 0 ? (
                          <div className="card p-6">
                            <div className="space-y-2 text-sm">
                              <div className="flex justify-between">
                                <span className="text-gray-500 dark:text-gray-400">{t('payment.amountLabel')}</span>
                                <span className="text-gray-900 dark:text-white">{formatSelectedPaymentAmount(selectedPlan.price)}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-gray-500 dark:text-gray-400">{t('payment.fee')} ({feeRate}%)</span>
                                <span className="text-gray-900 dark:text-white">{formatSelectedPaymentAmount(subFeeAmount)}</span>
                              </div>
                              <div className="flex justify-between border-t border-gray-200 pt-2 dark:border-dark-600">
                                <span className="font-medium text-gray-700 dark:text-gray-300">{t('payment.actualPay')}</span>
                                <span className="text-lg font-bold text-primary-600 dark:text-primary-400">{formatSelectedPaymentAmount(subTotalAmount)}</span>
                              </div>
                            </div>
                          </div>
                        ) : null}
                        <button className={['btn w-full py-3 text-base font-medium', paymentButtonClass].join(' ')} disabled={!canSubmitSubscription || submitting} onClick={confirmSubscribe}>
                          {submitting ? (
                            <span className="flex items-center justify-center gap-2">
                              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"></span>
                              {t('common.processing')}
                            </span>
                          ) : (
                            <span>{t('payment.createOrder')} {formatSelectedPaymentAmount(feeRate > 0 ? subTotalAmount : selectedPlan.price)}</span>
                          )}
                        </button>
                        <button className="btn btn-secondary w-full" onClick={() => setSelectedPlan(null)}>{t('common.cancel')}</button>
                      </>
                    ) : (
                      <>
                        {checkout.plans.length === 0 ? (
                          <div className="card py-16 text-center">
                            <Icon name="gift" size="xl" className="mx-auto mb-3 text-gray-300 dark:text-dark-600" />
                            <p className="text-gray-500 dark:text-gray-400">{t('payment.noPlans')}</p>
                          </div>
                        ) : (
                          <div className={planGridClass}>
                            {checkout.plans.map((plan) => (
                              <SubscriptionPlanCard key={plan.id} plan={plan} activeSubscriptions={activeSubscriptions} onSelect={selectPlan} />
                            ))}
                          </div>
                        )}
                        {/* Active subscriptions (compact, below plan list) */}
                        {activeSubscriptions.length > 0 ? (
                          <div>
                            <p className="mb-2 text-xs font-medium text-gray-400 dark:text-gray-500">{t('payment.activeSubscription')}</p>
                            <div className="space-y-2">
                              {activeSubscriptions.map((sub) => (
                                <div key={sub.id} className="flex items-center gap-3 rounded-xl border border-gray-100 bg-white px-3 py-2 dark:border-dark-700 dark:bg-dark-800">
                                  <div className={['h-6 w-1 shrink-0 rounded-full', platformAccentBarClass(sub.group?.platform || '')].join(' ')} />
                                  <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-1.5">
                                      <span className="truncate text-xs font-semibold text-gray-900 dark:text-white">{sub.group?.name || t('payment.groupFallback', { id: sub.group_id })}</span>
                                      <span className={['shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-medium', platformBadgeLightClass(sub.group?.platform || '')].join(' ')}>{platformLabel(sub.group?.platform || '')}</span>
                                    </div>
                                    <div className="flex flex-wrap gap-x-3 text-[11px] text-gray-400 dark:text-gray-500">
                                      <span>{t('payment.planCard.rate')}: ×{sub.group?.rate_multiplier ?? 1}</span>
                                      {sub.group?.daily_limit_usd == null && sub.group?.weekly_limit_usd == null && sub.group?.monthly_limit_usd == null ? (
                                        <span>{t('payment.planCard.quota')}: {t('payment.planCard.unlimited')}</span>
                                      ) : null}
                                      {sub.expires_at ? (
                                        <span>{t('userSubscriptions.daysRemaining', { days: getDaysRemaining(sub.expires_at) })}</span>
                                      ) : (
                                        <span>{t('userSubscriptions.noExpiration')}</span>
                                      )}
                                    </div>
                                  </div>
                                  <span className="badge badge-success shrink-0 text-[10px]">{t('userSubscriptions.status.active')}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        ) : null}
                      </>
                    )}
                  </>
                ) : null}
              </>
            )}

            {(checkout.help_text || checkout.help_image_url) && paymentPhase === 'select' && !selectedPlan ? (
              <div className="card p-4">
                <div className="flex flex-col items-center gap-3">
                  {checkout.help_image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={checkout.help_image_url}
                      alt=""
                      className="h-40 max-w-full cursor-pointer rounded-lg object-contain transition-opacity hover:opacity-80"
                      onClick={() => setPreviewImage(checkout.help_image_url)}
                    />
                  ) : null}
                  {checkout.help_text ? <p className="text-center text-sm text-gray-500 dark:text-gray-400">{checkout.help_text}</p> : null}
                </div>
              </div>
            ) : null}
          </>
        )}
      </div>

      {/* Renewal Plan Selection Modal */}
      {showRenewalModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={(e) => { if (e.target === e.currentTarget) closeRenewalModal() }}>
          <div className="relative w-full max-w-lg rounded-2xl border border-gray-200 bg-white p-6 shadow-2xl dark:border-dark-700 dark:bg-dark-900">
            <button className="absolute right-4 top-4 rounded-lg p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-dark-700 dark:hover:text-gray-200" onClick={closeRenewalModal}>
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
            <h3 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">{t('payment.selectPlan')}</h3>
            <div className="space-y-4">
              {renewalPlans.map((plan) => (
                <SubscriptionPlanCard key={plan.id} plan={plan} activeSubscriptions={activeSubscriptions} onSelect={selectPlanFromModal} />
              ))}
            </div>
          </div>
        </div>
      ) : null}

      {/* Image Preview Overlay */}
      {previewImage ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={() => setPreviewImage('')}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={previewImage} alt="" className="max-h-[85vh] max-w-[90vw] rounded-xl object-contain shadow-2xl" />
        </div>
      ) : null}
    </AppLayout>
  )
}

export default function PurchasePage() {
  return (
    <Suspense fallback={null}>
      <PurchaseView />
    </Suspense>
  )
}
