'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useI18n } from '@/lib/i18n'
import { useApp } from '@/context/AppContext'
import { extractApiErrorMessage } from '@/lib/apiError'
import {
  channelMonitorUserAPI,
  type UserMonitorDetail,
  type UserMonitorView,
} from '@/lib/channelMonitorUser'
import { DEFAULT_INTERVAL_SECONDS, STATUS_OPERATIONAL } from '@/lib/channelMonitorConstants'
import { useAutoRefresh } from '@/lib/useAutoRefresh'
import AppLayout from '@/components/layout/AppLayout'
import MonitorHero, { type MonitorWindow, type OverallStatus } from '@/components/user/monitor/MonitorHero'
import MonitorCardGrid from '@/components/user/monitor/MonitorCardGrid'
import MonitorDetailDialog from '@/components/user/monitor/MonitorDetailDialog'

export default function ChannelStatusPage() {
  const { t } = useI18n()
  const appStore = useApp()

  const [items, setItems] = useState<UserMonitorView[]>([])
  const [loading, setLoading] = useState(false)
  const [currentWindow, setCurrentWindow] = useState<MonitorWindow>('7d')
  const [detailCache, setDetailCache] = useState<Record<number, UserMonitorDetail>>({})
  const [showDetail, setShowDetail] = useState(false)
  const [detailTarget, setDetailTarget] = useState<UserMonitorView | null>(null)

  const abortControllerRef = useRef<AbortController | null>(null)
  const loadingRef = useRef(loading)
  loadingRef.current = loading
  const itemsRef = useRef(items)
  itemsRef.current = items
  const currentWindowRef = useRef(currentWindow)
  currentWindowRef.current = currentWindow

  const autoRefreshRef = useRef<ReturnType<typeof useAutoRefresh> | null>(null)

  const reload = useCallback(
    async (silent = false) => {
      if (abortControllerRef.current) abortControllerRef.current.abort()
      const controller = new AbortController()
      abortControllerRef.current = controller
      if (!silent) setLoading(true)

      try {
        const res = await channelMonitorUserAPI.list({ signal: controller.signal })
        if (controller.signal.aborted || abortControllerRef.current !== controller) return
        setItems(res.items || [])
      } catch (err: unknown) {
        const error = err as { name?: string; code?: string }
        if (error?.name === 'AbortError' || error?.code === 'ERR_CANCELED') return
        appStore.showError(extractApiErrorMessage(err, t('channelStatus.loadError')))
      } finally {
        if (abortControllerRef.current === controller) {
          if (!silent) setLoading(false)
          autoRefreshRef.current?.resetCountdown()
          abortControllerRef.current = null
        }
      }
    },
    [appStore, t],
  )

  const autoRefresh = useAutoRefresh({
    storageKey: 'channel-status-auto-refresh',
    intervals: [30, 60, 120] as const,
    defaultInterval: DEFAULT_INTERVAL_SECONDS,
    onRefresh: () => reload(true),
    shouldPause: () =>
      typeof document !== 'undefined' &&
      (document.hidden || loadingRef.current),
  })
  autoRefreshRef.current = autoRefresh

  const loadDetail = useCallback(
    async (id: number, force = false) => {
      if (!force) {
        let cached = false
        setDetailCache((prev) => {
          cached = Boolean(prev[id])
          return prev
        })
        if (cached) return
      }
      try {
        const detail = await channelMonitorUserAPI.status(id)
        setDetailCache((prev) => ({ ...prev, [id]: detail }))
      } catch (err: unknown) {
        appStore.showError(extractApiErrorMessage(err, t('channelStatus.detailLoadError')))
      }
    },
    [appStore, t],
  )

  const ensureDetailsForWindow = useCallback(async () => {
    if (currentWindowRef.current === '7d') return
    await Promise.all(itemsRef.current.map((item) => loadDetail(item.id)))
  }, [loadDetail])

  useEffect(() => {
    void reload(false)
    if (appStore.cachedPublicSettings?.channel_monitor_enabled !== false) {
      autoRefresh.setEnabled(true)
    }
    return () => {
      abortControllerRef.current?.abort()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (appStore.cachedPublicSettings?.channel_monitor_enabled === false) {
      autoRefresh.stop()
    } else if (autoRefresh.enabled) {
      autoRefresh.start()
    }
  }, [appStore.cachedPublicSettings?.channel_monitor_enabled, autoRefresh])

  useEffect(() => {
    void ensureDetailsForWindow()
  }, [items, ensureDetailsForWindow])

  const overallStatus = useMemo<OverallStatus>(() => {
    if (items.length === 0) return 'operational'
    for (const item of items) {
      if (item.primary_status === 'failed' || item.primary_status === 'error') return 'degraded'
      if (item.primary_status !== STATUS_OPERATIONAL) return 'degraded'
    }
    return 'operational'
  }, [items])

  const detailTitle = detailTarget?.name || t('channelStatus.detailTitle')

  async function manualReload() {
    await reload(false)
    if (currentWindowRef.current !== '7d') {
      await Promise.all(itemsRef.current.map((item) => loadDetail(item.id, true)))
    }
  }

  async function handleWindowChange(value: MonitorWindow) {
    setCurrentWindow(value)
    currentWindowRef.current = value
    if (value !== '7d') {
      await Promise.all(itemsRef.current.map((item) => loadDetail(item.id)))
    }
  }

  function openDetail(row: UserMonitorView) {
    setDetailTarget(row)
    setShowDetail(true)
  }

  function closeDetail() {
    setShowDetail(false)
    setDetailTarget(null)
  }

  return (
    <AppLayout>
      <MonitorHero
        overallStatus={overallStatus}
        intervalSeconds={DEFAULT_INTERVAL_SECONDS}
        window={currentWindow}
        loading={loading}
        autoRefresh={autoRefresh}
        onUpdateWindow={handleWindowChange}
        onRefresh={() => void manualReload()}
      />

      <MonitorCardGrid
        items={items}
        window={currentWindow}
        countdownSeconds={autoRefresh.countdown}
        loading={loading}
        detailCache={detailCache}
        onCardClick={openDetail}
      />

      <MonitorDetailDialog
        show={showDetail}
        monitorId={detailTarget?.id ?? null}
        title={detailTitle}
        onClose={closeDetail}
      />
    </AppLayout>
  )
}
