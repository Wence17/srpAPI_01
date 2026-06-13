/**
 * Subscription Store
 * Global state management for user subscriptions with caching and deduplication.
 * Ported from the original Pinia store (src/stores/subscriptions.ts) to a singleton
 * external store so caching/deduplication behaviour is shared app-wide.
 */

import subscriptionsAPI from '../subscriptions'
import type { UserSubscription } from '../types'
import { createStore, useStore } from '../createStore'

// Cache TTL: 60 seconds
const CACHE_TTL_MS = 60_000

// Request generation counter to invalidate stale in-flight responses
let requestGeneration = 0

interface SubscriptionStoreState {
  activeSubscriptions: UserSubscription[]
  loading: boolean
  loaded: boolean
  lastFetchedAt: number | null
}

const store = createStore<SubscriptionStoreState>({
  activeSubscriptions: [],
  loading: false,
  loaded: false,
  lastFetchedAt: null,
})

// In-flight request deduplication
let activePromise: Promise<UserSubscription[]> | null = null

// Auto-refresh interval
let pollerInterval: ReturnType<typeof setInterval> | null = null

/**
 * Fetch active subscriptions with caching and deduplication
 * @param force - Force refresh even if cache is valid
 */
async function fetchActiveSubscriptions(force = false): Promise<UserSubscription[]> {
  const now = Date.now()
  const state = store.getState()

  // Return cached data if valid
  if (!force && state.loaded && state.lastFetchedAt && now - state.lastFetchedAt < CACHE_TTL_MS) {
    return state.activeSubscriptions
  }

  // Return in-flight request if exists (deduplication)
  if (activePromise && !force) {
    return activePromise
  }

  const currentGeneration = ++requestGeneration

  // Start new request
  store.setState({ loading: true })
  const requestPromise = subscriptionsAPI
    .getActiveSubscriptions()
    .then((data) => {
      if (currentGeneration === requestGeneration) {
        store.setState({ activeSubscriptions: data, loaded: true, lastFetchedAt: Date.now() })
      }
      return data
    })
    .catch((error) => {
      console.error('Failed to fetch active subscriptions:', error)
      throw error
    })
    .finally(() => {
      if (activePromise === requestPromise) {
        store.setState({ loading: false })
        activePromise = null
      }
    })

  activePromise = requestPromise

  return activePromise
}

/**
 * Start auto-refresh polling
 */
function startPolling() {
  if (pollerInterval) return

  pollerInterval = setInterval(() => {
    fetchActiveSubscriptions(true).catch((error) => {
      console.error('Subscription polling failed:', error)
    })
  }, 5 * 60 * 1000)
}

/**
 * Stop auto-refresh polling
 */
function stopPolling() {
  if (pollerInterval) {
    clearInterval(pollerInterval)
    pollerInterval = null
  }
}

/**
 * Clear all subscription data and stop polling
 */
function clear() {
  requestGeneration++
  activePromise = null
  store.setState({ activeSubscriptions: [], loaded: false, lastFetchedAt: null })
  stopPolling()
}

/**
 * Invalidate cache (force next fetch to reload)
 */
function invalidateCache() {
  store.setState({ lastFetchedAt: null })
}

export const subscriptionStore = {
  getState: store.getState,
  subscribe: store.subscribe,
  fetchActiveSubscriptions,
  startPolling,
  stopPolling,
  clear,
  invalidateCache,
}

/**
 * React hook exposing the subscription store state and actions.
 * Mirrors `useSubscriptionStore()` from the original Pinia store.
 */
export function useSubscriptionStore() {
  const activeSubscriptions = useStore(store, (s) => s.activeSubscriptions)
  const loading = useStore(store, (s) => s.loading)
  const hasActiveSubscriptions = activeSubscriptions.length > 0

  return {
    activeSubscriptions,
    loading,
    hasActiveSubscriptions,
    fetchActiveSubscriptions,
    startPolling,
    stopPolling,
    clear,
    invalidateCache,
  }
}
