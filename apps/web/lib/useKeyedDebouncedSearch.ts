import { useCallback, useEffect, useRef } from 'react'

export interface KeyedDebouncedSearchContext {
  key: string
  signal: AbortSignal
}

interface UseKeyedDebouncedSearchOptions<T> {
  delay?: number
  search: (keyword: string, context: KeyedDebouncedSearchContext) => Promise<T>
  onSuccess: (key: string, result: T) => void
  onError?: (key: string, error: unknown) => void
}

export function useKeyedDebouncedSearch<T>(options: UseKeyedDebouncedSearchOptions<T>) {
  const delay = options.delay ?? 300
  const timersRef = useRef(new Map<string, ReturnType<typeof setTimeout>>())
  const controllersRef = useRef(new Map<string, AbortController>())
  const versionsRef = useRef(new Map<string, number>())
  const optionsRef = useRef(options)
  optionsRef.current = options

  const clearKey = useCallback((key: string) => {
    const timer = timersRef.current.get(key)
    if (timer) {
      clearTimeout(timer)
      timersRef.current.delete(key)
    }

    const controller = controllersRef.current.get(key)
    if (controller) {
      controller.abort()
      controllersRef.current.delete(key)
    }

    versionsRef.current.delete(key)
  }, [])

  const clearAll = useCallback(() => {
    const allKeys = new Set<string>([
      ...timersRef.current.keys(),
      ...controllersRef.current.keys(),
      ...versionsRef.current.keys(),
    ])
    allKeys.forEach((key) => clearKey(key))
  }, [clearKey])

  const trigger = useCallback(
    (key: string, keyword: string) => {
      const nextVersion = (versionsRef.current.get(key) ?? 0) + 1
      versionsRef.current.set(key, nextVersion)

      const existingTimer = timersRef.current.get(key)
      if (existingTimer) {
        clearTimeout(existingTimer)
        timersRef.current.delete(key)
      }

      const inFlight = controllersRef.current.get(key)
      if (inFlight) {
        inFlight.abort()
        controllersRef.current.delete(key)
      }

      const timer = setTimeout(async () => {
        timersRef.current.delete(key)

        const controller = new AbortController()
        controllersRef.current.set(key, controller)
        const requestVersion = versionsRef.current.get(key)

        try {
          const result = await optionsRef.current.search(keyword, {
            key,
            signal: controller.signal,
          })
          if (controller.signal.aborted) return
          if (versionsRef.current.get(key) !== requestVersion) return
          optionsRef.current.onSuccess(key, result)
        } catch (error) {
          if (controller.signal.aborted) return
          if (versionsRef.current.get(key) !== requestVersion) return
          optionsRef.current.onError?.(key, error)
        } finally {
          if (controllersRef.current.get(key) === controller) {
            controllersRef.current.delete(key)
          }
        }
      }, delay)

      timersRef.current.set(key, timer)
    },
    [delay],
  )

  useEffect(() => () => clearAll(), [clearAll])

  return {
    trigger,
    clearKey,
    clearAll,
  }
}
