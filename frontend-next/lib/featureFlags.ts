/**
 * Feature flag registry — single source of truth for public-settings-driven
 * feature switches used by the sidebar, routes, and views.
 *
 * Ported from src/utils/featureFlags.ts. The original reads the active app
 * store inside `isFeatureFlagEnabled`; in React the resolved public settings
 * are passed in explicitly so the helper stays pure and side-effect free.
 *
 * Modes:
 *   - `opt-out` (default enabled)  — visible when settings unloaded, hidden
 *     only when the backend explicitly sends `false`.
 *   - `opt-in`  (default disabled) — hidden when settings unloaded, visible
 *     only when the backend explicitly sends `true`.
 */

import type { PublicSettings } from './types'

export type FeatureFlagMode = 'opt-in' | 'opt-out'

export interface FeatureFlagDefinition {
  /** Public-settings key used for lookup. */
  readonly key: keyof PublicSettings
  /** Resolution mode when the key is missing/undefined. */
  readonly mode: FeatureFlagMode
  /** Short human label for logs and debug tooling. */
  readonly label: string
}

function defineFlag<K extends keyof PublicSettings>(def: {
  key: K
  mode: FeatureFlagMode
  label: string
}): FeatureFlagDefinition {
  return def
}

export const FeatureFlags = {
  channelMonitor: defineFlag({
    key: 'channel_monitor_enabled',
    mode: 'opt-out',
    label: 'Channel Monitor',
  }),
  availableChannels: defineFlag({
    key: 'available_channels_enabled',
    mode: 'opt-in',
    label: 'Available Channels',
  }),
  payment: defineFlag({
    key: 'payment_enabled',
    mode: 'opt-out',
    label: 'Payment',
  }),
  riskControl: defineFlag({
    key: 'risk_control_enabled',
    mode: 'opt-in',
    label: 'Risk Control',
  }),
  affiliate: defineFlag({
    key: 'affiliate_enabled',
    mode: 'opt-in',
    label: 'Affiliate',
  }),
} as const

export type RegisteredFeatureFlag = keyof typeof FeatureFlags

/**
 * Read the current value of a flag, honoring the mode's fallback.
 * `true`  → the feature is enabled (menu/route should render).
 * `false` → the feature is disabled (menu/route should hide).
 */
export function isFeatureFlagEnabled(
  flag: FeatureFlagDefinition,
  settings: PublicSettings | null | undefined,
): boolean {
  const raw = settings?.[flag.key] as boolean | undefined
  if (typeof raw === 'boolean') return raw
  // Settings not yet loaded → fall back to the flag's declared mode.
  return flag.mode === 'opt-out'
}

/**
 * Returns a getter compatible with the sidebar `NavItem.featureFlag` contract
 * (`false` hides the entry), bound to the provided public settings snapshot.
 */
export function makeSidebarFlag(
  flag: FeatureFlagDefinition,
  settings: PublicSettings | null | undefined,
): () => boolean {
  return () => isFeatureFlagEnabled(flag, settings)
}
