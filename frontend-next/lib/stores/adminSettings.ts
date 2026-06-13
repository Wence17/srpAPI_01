/**
 * Admin Settings Store
 *
 * Ported from the original Pinia store (src/stores/adminSettings.ts) to a
 * singleton external store. Exposes the feature gates the sidebar relies on
 * (ops monitoring, payment) plus the admin custom menu items. Values are cached
 * in localStorage to avoid first-paint flicker, mirroring the original.
 *
 * Note: the original fetched payment status from a dedicated payment-config
 * endpoint; here `payment_enabled` is read from the same `/admin/settings`
 * payload, which exposes the identical flag.
 */

import { adminSettingsAPI } from '../adminSettings'
import type { CustomMenuItem } from '../types'
import { createStore, useStore } from '../createStore'

const readCachedBool = (key: string, defaultValue: boolean): boolean => {
  try {
    const raw = localStorage.getItem(key)
    if (raw === 'true') return true
    if (raw === 'false') return false
  } catch {
    // ignore localStorage failures
  }
  return defaultValue
}

const writeCachedBool = (key: string, value: boolean) => {
  try {
    localStorage.setItem(key, value ? 'true' : 'false')
  } catch {
    // ignore localStorage failures
  }
}

const readCachedString = (key: string, defaultValue: string): string => {
  try {
    const raw = localStorage.getItem(key)
    if (typeof raw === 'string' && raw.length > 0) return raw
  } catch {
    // ignore localStorage failures
  }
  return defaultValue
}

const writeCachedString = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value)
  } catch {
    // ignore localStorage failures
  }
}

const canUseDom = typeof window !== 'undefined'

interface AdminSettingsState {
  loaded: boolean
  loading: boolean
  opsMonitoringEnabled: boolean
  opsRealtimeMonitoringEnabled: boolean
  opsQueryModeDefault: string
  paymentEnabled: boolean
  customMenuItems: CustomMenuItem[]
}

const store = createStore<AdminSettingsState>({
  loaded: false,
  loading: false,
  opsMonitoringEnabled: canUseDom ? readCachedBool('ops_monitoring_enabled_cached', true) : true,
  opsRealtimeMonitoringEnabled: canUseDom
    ? readCachedBool('ops_realtime_monitoring_enabled_cached', true)
    : true,
  opsQueryModeDefault: canUseDom ? readCachedString('ops_query_mode_default_cached', 'auto') : 'auto',
  paymentEnabled: canUseDom ? readCachedBool('payment_enabled_cached', false) : false,
  customMenuItems: [],
})

async function fetch(force = false): Promise<void> {
  const state = store.getState()
  if (state.loaded && !force) return
  if (state.loading) return

  store.setState({ loading: true })
  try {
    const settings = await adminSettingsAPI.getSettings()

    const opsMonitoringEnabled = settings.ops_monitoring_enabled ?? true
    writeCachedBool('ops_monitoring_enabled_cached', opsMonitoringEnabled)

    const opsRealtimeMonitoringEnabled = settings.ops_realtime_monitoring_enabled ?? true
    writeCachedBool('ops_realtime_monitoring_enabled_cached', opsRealtimeMonitoringEnabled)

    const opsQueryModeDefault = settings.ops_query_mode_default || 'auto'
    writeCachedString('ops_query_mode_default_cached', opsQueryModeDefault)

    const customMenuItems = Array.isArray(settings.custom_menu_items)
      ? settings.custom_menu_items
      : []

    const paymentEnabled = settings.payment_enabled ?? false
    writeCachedBool('payment_enabled_cached', paymentEnabled)

    store.setState({
      opsMonitoringEnabled,
      opsRealtimeMonitoringEnabled,
      opsQueryModeDefault,
      customMenuItems,
      paymentEnabled,
      loaded: true,
    })
  } catch (err) {
    // Keep cached/default value: do not "flip" the UI based on a transient fetch failure.
    store.setState({ loaded: true })
    console.error('[adminSettings] Failed to fetch settings:', err)
  } finally {
    store.setState({ loading: false })
  }
}

function setOpsMonitoringEnabledLocal(value: boolean) {
  writeCachedBool('ops_monitoring_enabled_cached', value)
  store.setState({ opsMonitoringEnabled: value, loaded: true })
}

function setOpsRealtimeMonitoringEnabledLocal(value: boolean) {
  writeCachedBool('ops_realtime_monitoring_enabled_cached', value)
  store.setState({ opsRealtimeMonitoringEnabled: value, loaded: true })
}

function setPaymentEnabledLocal(value: boolean) {
  writeCachedBool('payment_enabled_cached', value)
  store.setState({ paymentEnabled: value, loaded: true })
}

function setOpsQueryModeDefaultLocal(value: string) {
  const next = value || 'auto'
  writeCachedString('ops_query_mode_default_cached', next)
  store.setState({ opsQueryModeDefault: next, loaded: true })
}

// Keep UI consistent if we learn that ops is disabled via feature-gated 404s.
// (event is dispatched from the axios interceptor)
let eventListenersInitialized = false
function initializeEventListeners() {
  if (eventListenersInitialized || !canUseDom) return
  eventListenersInitialized = true
  try {
    window.addEventListener('ops-monitoring-disabled', () => {
      setOpsMonitoringEnabledLocal(false)
    })
  } catch {
    // ignore window access failures (SSR)
  }
}

if (canUseDom) {
  initializeEventListeners()
}

export const adminSettingsStore = {
  getState: store.getState,
  subscribe: store.subscribe,
  fetch,
  setOpsMonitoringEnabledLocal,
  setOpsRealtimeMonitoringEnabledLocal,
  setPaymentEnabledLocal,
  setOpsQueryModeDefaultLocal,
}

export function useAdminSettingsStore() {
  const opsMonitoringEnabled = useStore(store, (s) => s.opsMonitoringEnabled)
  const opsRealtimeMonitoringEnabled = useStore(store, (s) => s.opsRealtimeMonitoringEnabled)
  const opsQueryModeDefault = useStore(store, (s) => s.opsQueryModeDefault)
  const paymentEnabled = useStore(store, (s) => s.paymentEnabled)
  const customMenuItems = useStore(store, (s) => s.customMenuItems)
  const loaded = useStore(store, (s) => s.loaded)
  const loading = useStore(store, (s) => s.loading)

  return {
    loaded,
    loading,
    opsMonitoringEnabled,
    opsRealtimeMonitoringEnabled,
    opsQueryModeDefault,
    paymentEnabled,
    customMenuItems,
    fetch,
    setOpsMonitoringEnabledLocal,
    setOpsRealtimeMonitoringEnabledLocal,
    setPaymentEnabledLocal,
    setOpsQueryModeDefaultLocal,
  }
}
