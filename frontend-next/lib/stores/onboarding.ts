/**
 * Onboarding Store (stub)
 *
 * The original Pinia onboarding store drives the interactive product tour
 * (driver.js based) via `useOnboardingTour`. That tour is a separate, sizeable
 * subsystem that has not been migrated yet. This stub preserves the public
 * surface the layout/sidebar/header depend on so they compile and behave
 * gracefully (no tour steps active) until the full tour is ported:
 *
 *   - setReplayCallback(cb) — registers AppLayout's replay handler
 *   - replay()             — invokes the registered handler if present
 *   - isCurrentStep(sel)   — always false (no active step)
 *   - nextStep(delay)      — no-op
 */

import { createStore, useStore } from '../createStore'

type ReplayCallback = () => void

let replayCallback: ReplayCallback | null = null

interface OnboardingState {
  // Currently active tour step selector, or null when no tour is running.
  currentStepSelector: string | null
}

const store = createStore<OnboardingState>({
  currentStepSelector: null,
})

function setReplayCallback(cb: ReplayCallback | null) {
  replayCallback = cb
}

function replay() {
  replayCallback?.()
}

function isCurrentStep(selector: string): boolean {
  return store.getState().currentStepSelector === selector
}

function nextStep(_delay = 0): void {
  // No-op until the interactive tour is migrated.
  void _delay
}

export const onboardingStore = {
  getState: store.getState,
  subscribe: store.subscribe,
  setReplayCallback,
  replay,
  isCurrentStep,
  nextStep,
}

export function useOnboardingStore() {
  const currentStepSelector = useStore(store, (s) => s.currentStepSelector)
  return {
    currentStepSelector,
    setReplayCallback,
    replay,
    isCurrentStep,
    nextStep,
  }
}
