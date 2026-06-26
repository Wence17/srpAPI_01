/**
 * Payment Store
 * Manages payment configuration, current order state, and subscription plans.
 * Ported from the original Pinia store (src/stores/payment.ts) to a singleton
 * external store so the shared-reactive-state semantics are preserved.
 */

import { paymentAPI } from '../payment/api'
import type { PaymentConfig, PaymentOrder, SubscriptionPlan, CreateOrderRequest } from '../payment/types'
import { createStore, useStore } from '../createStore'

interface PaymentStoreState {
  /** Payment configuration from backend */
  config: PaymentConfig | null
  /** Currently active order (for payment flow) */
  currentOrder: PaymentOrder | null
  /** Available subscription plans */
  plans: SubscriptionPlan[]
  configLoading: boolean
  configLoaded: boolean
}

const store = createStore<PaymentStoreState>({
  config: null,
  currentOrder: null,
  plans: [],
  configLoading: false,
  configLoaded: false,
})

// ==================== Actions ====================

/** Fetch payment configuration */
async function fetchConfig(force = false): Promise<PaymentConfig | null> {
  const state = store.getState()
  if (state.configLoaded && !force) return state.config
  if (state.configLoading) return state.config

  store.setState({ configLoading: true })
  try {
    const response = await paymentAPI.getConfig()
    store.setState({ config: response.data, configLoaded: true })
    return store.getState().config
  } catch (error: unknown) {
    console.error('[payment] Failed to fetch config:', error)
    return null
  } finally {
    store.setState({ configLoading: false })
  }
}

/** Fetch available subscription plans */
async function fetchPlans(): Promise<SubscriptionPlan[]> {
  try {
    const response = await paymentAPI.getPlans()
    // Backend returns features as newline-separated string; parse to array
    const plans = (response.data || []).map(
      (p: Omit<SubscriptionPlan, 'features'> & { features: string | string[] }) => ({
        ...p,
        features:
          typeof p.features === 'string'
            ? p.features.split('\n').map((f: string) => f.trim()).filter(Boolean)
            : p.features || [],
      })
    )
    store.setState({ plans })
    return store.getState().plans
  } catch (error: unknown) {
    console.error('[payment] Failed to fetch plans:', error)
    return []
  }
}

/** Create a new order and set it as current */
async function createOrder(params: CreateOrderRequest) {
  const response = await paymentAPI.createOrder(params)
  return response.data
}

/** Poll order status by ID (read-only, no upstream check) */
async function pollOrderStatus(orderId: number): Promise<PaymentOrder | null> {
  try {
    const response = await paymentAPI.getOrder(orderId)
    const order = response.data
    if (store.getState().currentOrder?.id === orderId) {
      store.setState({ currentOrder: order })
    }
    return order
  } catch (error: unknown) {
    console.error('[payment] Failed to poll order status:', error)
    return null
  }
}

/** Clear current order state */
function clearCurrentOrder() {
  store.setState({ currentOrder: null })
}

/** Directly set the current order (used by views when resuming a payment) */
function setCurrentOrder(order: PaymentOrder | null) {
  store.setState({ currentOrder: order })
}

export const paymentStore = {
  getState: store.getState,
  subscribe: store.subscribe,
  fetchConfig,
  fetchPlans,
  createOrder,
  pollOrderStatus,
  clearCurrentOrder,
  setCurrentOrder,
}

/**
 * React hook exposing the payment store state and actions.
 * Mirrors `usePaymentStore()` from the original Pinia store.
 */
export function usePaymentStore() {
  const config = useStore(store, (s) => s.config)
  const currentOrder = useStore(store, (s) => s.currentOrder)
  const plans = useStore(store, (s) => s.plans)
  const configLoading = useStore(store, (s) => s.configLoading)
  const configLoaded = useStore(store, (s) => s.configLoaded)

  return {
    config,
    currentOrder,
    plans,
    configLoading,
    configLoaded,
    fetchConfig,
    fetchPlans,
    createOrder,
    pollOrderStatus,
    clearCurrentOrder,
    setCurrentOrder,
  }
}
