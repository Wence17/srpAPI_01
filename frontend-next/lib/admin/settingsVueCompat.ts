import { useEffect, useMemo, useReducer, useRef } from 'react'

/**
 * Minimal Vue composition-api shims for the SettingsView port.
 * Shared bump() re-renders the component when ref/reactive values change.
 */
export function useVueSetup() {
  const [tick, bump] = useReducer((n: number) => n + 1, 0)

  function ref<T>(initial: T) {
    const holder = useRef<{ value: T } | null>(null)
    if (holder.current === null) {
      holder.current = { value: initial }
    }
    return new Proxy(holder.current, {
      set(target, prop, value) {
        Reflect.set(target, prop, value)
        bump()
        return true
      },
      get(target, prop) {
        return Reflect.get(target, prop)
      },
    }) as { value: T }
  }

  function reactive<T extends object>(initial: T): T {
    const holder = useRef<T | null>(null)
    if (holder.current === null) {
      holder.current = { ...initial }
    }
    return new Proxy(holder.current as T, {
      set(target, prop, value) {
        Reflect.set(target, prop, value)
        bump()
        return true
      },
      get(target, prop) {
        const val = Reflect.get(target, prop)
        if (Array.isArray(val)) {
          return wrapArray(val, bump)
        }
        return val
      },
    })
  }

  function computed<T>(fn: () => T): { readonly value: T } {
    const value = useMemo(fn, [tick])
    return { get value() { return value } }
  }

  function onMounted(fn: () => void) {
    useEffect(() => {
      fn()
    }, [])
  }

  function watch<T>(
    source: () => T,
    cb: (value: T, oldValue: T | undefined) => void,
  ) {
    const prev = useRef<T | undefined>(undefined)
    useEffect(() => {
      const next = source()
      cb(next, prev.current)
      prev.current = next
    }, [tick, source])
  }

  return { ref, reactive, computed, onMounted, watch, tick, bump }
}

function wrapArray<T>(arr: T[], bump: () => void): T[] {
  return new Proxy(arr, {
    set(target, prop, value) {
      Reflect.set(target, prop, value)
      bump()
      return true
    },
  }) as T[]
}
