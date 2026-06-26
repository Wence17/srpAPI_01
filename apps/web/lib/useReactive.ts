'use client'

import { useCallback, useRef, useState } from 'react'

const ARRAY_MUTATORS = new Set([
  'push',
  'pop',
  'shift',
  'unshift',
  'splice',
  'sort',
  'reverse',
])

/**
 * Vue reactive()-like mutable state for verbatim migrations.
 * Mutations (including nested objects and array methods) trigger re-renders.
 */
export function useReactive<T extends object>(initial: T): T {
  const [, setTick] = useState(0)
  const bump = useCallback(() => setTick((n) => n + 1), [])
  const rootRef = useRef(initial)
  const proxyCache = useRef(new WeakMap<object, object>())

  const wrap = useCallback(
    (target: object): object => {
      const cached = proxyCache.current.get(target)
      if (cached) return cached

      const handler: ProxyHandler<object> = {
        set(obj, prop, value) {
          const record = obj as Record<string | symbol, unknown>
          if (record[prop] === value) return true
          if (value !== null && typeof value === 'object') {
            record[prop] = wrap(value as object)
          } else {
            record[prop] = value
          }
          bump()
          return true
        },
        get(obj, prop) {
          const val = (obj as Record<string | symbol, unknown>)[prop]
          if (typeof prop === 'string' && ARRAY_MUTATORS.has(prop) && Array.isArray(obj)) {
            const original = (obj as unknown[])[prop as keyof unknown[]] as (...args: unknown[]) => unknown
            if (typeof original === 'function') {
              return (...args: unknown[]) => {
                const result = original.apply(obj, args)
                bump()
                return result
              }
            }
          }
          if (val !== null && typeof val === 'object') {
            return wrap(val as object)
          }
          return val
        },
      }

      const proxy = new Proxy(target, handler)
      proxyCache.current.set(target, proxy)
      return proxy
    },
    [bump],
  )

  return wrap(rootRef.current) as T
}
