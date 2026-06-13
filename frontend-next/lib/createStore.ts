import { useSyncExternalStore } from 'react'

/**
 * Minimal external store that mirrors the singleton, shared-reactive-state
 * semantics of a Pinia store. State lives at module scope so every component
 * and non-component caller observes the exact same instance, just like the
 * original `defineStore` setup stores.
 */
export interface ExternalStore<T> {
  getState: () => T
  setState: (partial: Partial<T> | ((prev: T) => Partial<T>)) => void
  subscribe: (listener: () => void) => () => void
}

export function createStore<T extends object>(initialState: T): ExternalStore<T> {
  let state = initialState
  const listeners = new Set<() => void>()

  const getState = () => state

  const setState: ExternalStore<T>['setState'] = (partial) => {
    const next = typeof partial === 'function' ? partial(state) : partial
    state = { ...state, ...next }
    listeners.forEach((listener) => listener())
  }

  const subscribe: ExternalStore<T>['subscribe'] = (listener) => {
    listeners.add(listener)
    return () => listeners.delete(listener)
  }

  return { getState, setState, subscribe }
}

/**
 * React hook to select a slice from an external store. The selector result is
 * compared with `Object.is`; return primitives or memo-stable references.
 */
export function useStore<T extends object, S>(store: ExternalStore<T>, selector: (state: T) => S): S {
  return useSyncExternalStore(
    store.subscribe,
    () => selector(store.getState()),
    () => selector(store.getState()),
  )
}
