'use client'

import { useCallback, useEffect, useState } from 'react'
import { adminSettingsAPI } from '@/lib/adminSettings'
import {
  QUOTA_THRESHOLD_TYPE_FIXED,
  type QuotaThresholdType,
} from '@/lib/constants/account'

export const QUOTA_NOTIFY_DIMS = ['daily', 'weekly', 'total'] as const
export type QuotaNotifyDim = (typeof QUOTA_NOTIFY_DIMS)[number]

interface DimState {
  enabled: boolean | null
  threshold: number | null
  thresholdType: QuotaThresholdType | null
}

const initialDimState = (): Record<QuotaNotifyDim, DimState> => ({
  daily: { enabled: null, threshold: null, thresholdType: null },
  weekly: { enabled: null, threshold: null, thresholdType: null },
  total: { enabled: null, threshold: null, thresholdType: null },
})

export function useQuotaNotifyState() {
  const [globalEnabled, setGlobalEnabled] = useState(false)
  const [state, setState] = useState<Record<QuotaNotifyDim, DimState>>(initialDimState)

  const loadGlobalState = useCallback(() => {
    adminSettingsAPI
      .getSettings()
      .then((settings) => {
        setGlobalEnabled(
          (settings as { account_quota_notify_enabled?: boolean }).account_quota_notify_enabled ===
            true,
        )
      })
      .catch(() => {
        setGlobalEnabled(false)
      })
  }, [])

  useEffect(() => {
    loadGlobalState()
  }, [loadGlobalState])

  const loadFromExtra = useCallback((extra: Record<string, unknown> | null | undefined) => {
    setState((prev) => {
      const next = { ...prev }
      for (const d of QUOTA_NOTIFY_DIMS) {
        next[d] = {
          enabled: (extra?.[`quota_notify_${d}_enabled`] as boolean) ?? null,
          threshold: (extra?.[`quota_notify_${d}_threshold`] as number) ?? null,
          thresholdType:
            (extra?.[`quota_notify_${d}_threshold_type`] as QuotaThresholdType) ?? null,
        }
      }
      return next
    })
  }, [])

  const writeToExtra = useCallback(
    (extra: Record<string, unknown>, mode: 'create' | 'update') => {
      for (const d of QUOTA_NOTIFY_DIMS) {
        const s = state[d]
        if (s.enabled) {
          extra[`quota_notify_${d}_enabled`] = true
          if (s.threshold != null) {
            extra[`quota_notify_${d}_threshold`] = s.threshold
          } else if (mode === 'update') {
            delete extra[`quota_notify_${d}_threshold`]
          }
          extra[`quota_notify_${d}_threshold_type`] = s.thresholdType || QUOTA_THRESHOLD_TYPE_FIXED
        } else if (mode === 'update') {
          delete extra[`quota_notify_${d}_enabled`]
          delete extra[`quota_notify_${d}_threshold`]
          delete extra[`quota_notify_${d}_threshold_type`]
        }
      }
    },
    [state],
  )

  const reset = useCallback(() => {
    setState(initialDimState())
  }, [])

  const updateDim = useCallback(
    (dim: QuotaNotifyDim, patch: Partial<DimState>) => {
      setState((prev) => ({
        ...prev,
        [dim]: { ...prev[dim], ...patch },
      }))
    },
    [],
  )

  return {
    globalEnabled,
    state,
    setState,
    updateDim,
    loadGlobalState,
    loadFromExtra,
    writeToExtra,
    reset,
  }
}
