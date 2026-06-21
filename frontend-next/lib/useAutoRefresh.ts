'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

export interface UseAutoRefreshOptions {
  storageKey: string
  intervals?: readonly number[]
  defaultInterval?: number
  onRefresh: () => Promise<void> | void
  shouldPause?: () => boolean
}

export function useAutoRefresh(options: UseAutoRefreshOptions) {
  const {
    storageKey,
    intervals = [5, 10, 15, 30] as const,
    defaultInterval,
    onRefresh,
    shouldPause,
  } = options

  const onRefreshRef = useRef(onRefresh)
  onRefreshRef.current = onRefresh
  const shouldPauseRef = useRef(shouldPause)
  shouldPauseRef.current = shouldPause

  const [enabled, setEnabledState] = useState(false)
  const [intervalSeconds, setIntervalSecondsState] = useState(
    defaultInterval ?? intervals[intervals.length - 1],
  )
  const [countdown, setCountdown] = useState(0)
  const [fetching, setFetching] = useState(false)

  const enabledRef = useRef(enabled)
  enabledRef.current = enabled
  const intervalSecondsRef = useRef(intervalSeconds)
  intervalSecondsRef.current = intervalSeconds
  const fetchingRef = useRef(fetching)
  fetchingRef.current = fetching

  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey)
      if (!saved) return
      const parsed = JSON.parse(saved) as { enabled?: boolean; interval_seconds?: number }
      if (parsed.enabled === true) setEnabledState(true)
      const iv = Number(parsed.interval_seconds)
      if (intervals.includes(iv)) setIntervalSecondsState(iv)
    } catch {
      /* ignore */
    }
  }, [intervals, storageKey])

  const saveToStorage = useCallback(
    (nextEnabled: boolean, nextInterval: number) => {
      try {
        localStorage.setItem(
          storageKey,
          JSON.stringify({ enabled: nextEnabled, interval_seconds: nextInterval }),
        )
      } catch {
        /* ignore */
      }
    },
    [storageKey],
  )

  const resetCountdown = useCallback(() => {
    setCountdown(intervalSecondsRef.current)
  }, [])

  useEffect(() => {
    const timerId = window.setInterval(async () => {
      if (!enabledRef.current) return
      if (shouldPauseRef.current?.()) return
      if (fetchingRef.current) return

      setCountdown((current) => {
        if (current <= 0) {
          void (async () => {
            setFetching(true)
            try {
              await onRefreshRef.current()
            } finally {
              setFetching(false)
            }
          })()
          return intervalSecondsRef.current
        }
        return current - 1
      })
    }, 1000)

    return () => window.clearInterval(timerId)
  }, [])

  const setEnabled = useCallback(
    (value: boolean) => {
      setEnabledState(value)
      saveToStorage(value, intervalSecondsRef.current)
      if (value) {
        setCountdown(intervalSecondsRef.current)
      } else {
        setCountdown(0)
      }
    },
    [saveToStorage],
  )

  const setInterval = useCallback(
    (seconds: number) => {
      setIntervalSecondsState(seconds)
      saveToStorage(enabledRef.current, seconds)
      if (enabledRef.current) setCountdown(seconds)
    },
    [saveToStorage],
  )

  const start = useCallback(() => {
    if (!enabledRef.current) setEnabled(true)
  }, [setEnabled])

  const stop = useCallback(() => {
    if (enabledRef.current) setEnabled(false)
  }, [setEnabled])

  return {
    enabled,
    intervalSeconds,
    countdown,
    fetching,
    intervals,
    setEnabled,
    setInterval,
    resetCountdown,
    start,
    stop,
  }
}
