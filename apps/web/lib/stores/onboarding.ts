/**
 * Onboarding store — manages tour state and control methods across components.
 * Verbatim port of frontend/src/stores/onboarding.ts.
 */

import type { Driver } from 'driver.js'

type VoidCallback = () => void
type NextStepCallback = (delay?: number) => Promise<void>
type IsCurrentStepCallback = (selector: string) => boolean

let replayCallback: VoidCallback | null = null
let nextStepCallback: NextStepCallback | null = null
let isCurrentStepCallback: IsCurrentStepCallback | null = null
let driverInstance: Driver | null = null

function setReplayCallback(callback: VoidCallback | null): void {
  replayCallback = callback
}

function setControlMethods(methods: {
  nextStep: NextStepCallback
  isCurrentStep: IsCurrentStepCallback
}): void {
  nextStepCallback = methods.nextStep
  isCurrentStepCallback = methods.isCurrentStep
}

function clearControlMethods(): void {
  nextStepCallback = null
  isCurrentStepCallback = null
}

function setDriverInstance(driver: Driver | null): void {
  driverInstance = driver
}

function getDriverInstance(): Driver | null {
  return driverInstance
}

function isDriverActive(): boolean {
  return driverInstance?.isActive?.() ?? false
}

function replay(): void {
  replayCallback?.()
}

async function nextStep(delay = 0): Promise<void> {
  if (nextStepCallback) {
    await nextStepCallback(delay)
  }
}

function isCurrentStep(selector: string): boolean {
  if (isCurrentStepCallback) {
    return isCurrentStepCallback(selector)
  }
  return false
}

export const onboardingStore = {
  setReplayCallback,
  setControlMethods,
  clearControlMethods,
  setDriverInstance,
  getDriverInstance,
  isDriverActive,
  replay,
  nextStep,
  isCurrentStep,
}

export function useOnboardingStore() {
  return {
    setReplayCallback,
    replay,
    isCurrentStep,
    nextStep,
  }
}
