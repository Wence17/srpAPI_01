'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import AppLayout from '@/components/layout/AppLayout'
import BaseDialog from '@/components/common/BaseDialog'
import { useI18n } from '@/lib/i18n'
import { useApp } from '@/context/AppContext'
import { useAdminSettingsStore } from '@/lib/stores/adminSettings'
import {
  adminOpsAPI,
  type OpsDashboardOverview,
  type OpsErrorDistributionResponse,
  type OpsErrorTrendResponse,
  type OpsLatencyHistogramResponse,
  type OpsMetricThresholds,
  type OpsThroughputTrendResponse,
} from '@/lib/adminOps'
import OpsDashboardHeader from '@/components/admin/ops/OpsDashboardHeader'
import OpsDashboardSkeleton from '@/components/admin/ops/OpsDashboardSkeleton'
import OpsConcurrencyCard from '@/components/admin/ops/OpsConcurrencyCard'
import OpsErrorDetailModal from '@/components/admin/ops/OpsErrorDetailModal'
import OpsErrorDistributionChart from '@/components/admin/ops/OpsErrorDistributionChart'
import OpsErrorDetailsModal from '@/components/admin/ops/OpsErrorDetailsModal'
import OpsErrorTrendChart from '@/components/admin/ops/OpsErrorTrendChart'
import OpsLatencyChart from '@/components/admin/ops/OpsLatencyChart'
import OpsThroughputTrendChart from '@/components/admin/ops/OpsThroughputTrendChart'
import OpsSwitchRateTrendChart from '@/components/admin/ops/OpsSwitchRateTrendChart'
import OpsAlertEventsCard from '@/components/admin/ops/OpsAlertEventsCard'
import OpsOpenAITokenStatsCard from '@/components/admin/ops/OpsOpenAITokenStatsCard'
import OpsSystemLogTable from '@/components/admin/ops/OpsSystemLogTable'
import OpsRequestDetailsModal, {
  type OpsRequestDetailsPreset,
} from '@/components/admin/ops/OpsRequestDetailsModal'
import OpsSettingsDialog from '@/components/admin/ops/OpsSettingsDialog'
import OpsAlertRulesCard from '@/components/admin/ops/OpsAlertRulesCard'

type TimeRange = '5m' | '30m' | '1h' | '6h' | '24h' | 'custom'
type QueryMode = 'auto' | 'raw' | 'preagg'

const allowedTimeRanges = new Set<TimeRange>(['5m', '30m', '1h', '6h', '24h', 'custom'])
const allowedQueryModes = new Set<QueryMode>(['auto', 'raw', 'preagg'])

const QUERY_KEYS = {
  timeRange: 'tr',
  platform: 'platform',
  groupId: 'group_id',
  queryMode: 'mode',
  fullscreen: 'fullscreen',
  openErrorDetails: 'open_error_details',
  errorType: 'error_type',
  alertRuleId: 'alert_rule_id',
  openAlertRules: 'open_alert_rules',
} as const

const switchTrendWindowHours = 5
const switchTrendTimeRange = `${switchTrendWindowHours}h`
const switchTrendWindowMs = switchTrendWindowHours * 60 * 60 * 1000

function isCanceledRequest(err: unknown): boolean {
  return (
    !!err &&
    typeof err === 'object' &&
    'code' in err &&
    (err as Record<string, unknown>).code === 'ERR_CANCELED'
  )
}

function isOpsDisabledError(err: unknown): boolean {
  return (
    !!err &&
    typeof err === 'object' &&
    'code' in err &&
    typeof (err as Record<string, unknown>).code === 'string' &&
    (err as Record<string, unknown>).code === 'OPS_DISABLED'
  )
}

function readQueryString(searchParams: URLSearchParams, key: string): string {
  const value = searchParams.get(key)
  return value ?? ''
}

function readQueryNumber(searchParams: URLSearchParams, key: string): number | null {
  const raw = readQueryString(searchParams, key)
  if (!raw) return null
  const n = Number.parseInt(raw, 10)
  return Number.isFinite(n) ? n : null
}

export default function AdminOpsPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const appStore = useApp()
  const adminSettingsStore = useAdminSettingsStore()
  const { t } = useI18n()

  const opsEnabled = adminSettingsStore.opsMonitoringEnabled

  const isFullscreen = useMemo(() => {
    const val = searchParams.get(QUERY_KEYS.fullscreen)
    return val === '1' || val === 'true'
  }, [searchParams])

  const [loading, setLoading] = useState(true)
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [lastUpdated, setLastUpdated] = useState<Date | null>(new Date())

  const [timeRange, setTimeRange] = useState<TimeRange>('1h')
  const [platform, setPlatform] = useState('')
  const [groupId, setGroupId] = useState<number | null>(null)
  const [queryMode, setQueryMode] = useState<QueryMode>('auto')
  const [customStartTime, setCustomStartTime] = useState<string | null>(null)
  const [customEndTime, setCustomEndTime] = useState<string | null>(null)

  const [overview, setOverview] = useState<OpsDashboardOverview | null>(null)
  const [metricThresholds, setMetricThresholds] = useState<OpsMetricThresholds | null>(null)
  const [throughputTrend, setThroughputTrend] = useState<OpsThroughputTrendResponse | null>(null)
  const [loadingTrend, setLoadingTrend] = useState(false)
  const [switchTrend, setSwitchTrend] = useState<OpsThroughputTrendResponse | null>(null)
  const [loadingSwitchTrend, setLoadingSwitchTrend] = useState(false)
  const [latencyHistogram, setLatencyHistogram] = useState<OpsLatencyHistogramResponse | null>(null)
  const [loadingLatency, setLoadingLatency] = useState(false)
  const [errorTrend, setErrorTrend] = useState<OpsErrorTrendResponse | null>(null)
  const [loadingErrorTrend, setLoadingErrorTrend] = useState(false)
  const [errorDistribution, setErrorDistribution] = useState<OpsErrorDistributionResponse | null>(null)
  const [loadingErrorDistribution, setLoadingErrorDistribution] = useState(false)

  const [selectedErrorId, setSelectedErrorId] = useState<number | null>(null)
  const [showErrorModal, setShowErrorModal] = useState(false)
  const [showErrorDetails, setShowErrorDetails] = useState(false)
  const [errorDetailsType, setErrorDetailsType] = useState<'request' | 'upstream'>('request')
  const [showRequestDetails, setShowRequestDetails] = useState(false)
  const [requestDetailsPreset, setRequestDetailsPreset] = useState<OpsRequestDetailsPreset>({
    title: '',
    kind: 'all',
    sort: 'created_at_desc',
  })
  const [showSettingsDialog, setShowSettingsDialog] = useState(false)
  const [showAlertRulesCard, setShowAlertRulesCard] = useState(false)

  const [showAlertEvents, setShowAlertEvents] = useState(true)
  const [showOpenAITokenStats, setShowOpenAITokenStats] = useState(false)
  const [autoRefreshEnabled, setAutoRefreshEnabled] = useState(false)
  const [autoRefreshIntervalMs, setAutoRefreshIntervalMs] = useState(30000)
  const [autoRefreshCountdown, setAutoRefreshCountdown] = useState(0)
  const [dashboardRefreshToken, setDashboardRefreshToken] = useState(0)

  const isApplyingRouteQuery = useRef(false)
  const isSyncingRouteQuery = useRef(false)
  const dashboardFetchController = useRef<AbortController | null>(null)
  const dashboardFetchSeq = useRef(0)
  const countdownPaused = useRef(true)
  const countdownTimer = useRef<ReturnType<typeof setInterval> | null>(null)
  const syncQueryTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const initialized = useRef(false)

  const abortDashboardFetch = useCallback(() => {
    if (dashboardFetchController.current) {
      dashboardFetchController.current.abort()
      dashboardFetchController.current = null
    }
  }, [])

  const applyRouteQueryToState = useCallback(() => {
    const nextTimeRange = readQueryString(searchParams, QUERY_KEYS.timeRange)
    if (nextTimeRange && allowedTimeRanges.has(nextTimeRange as TimeRange)) {
      setTimeRange(nextTimeRange as TimeRange)
    }

    setPlatform(readQueryString(searchParams, QUERY_KEYS.platform) || '')

    const groupIdRaw = readQueryNumber(searchParams, QUERY_KEYS.groupId)
    setGroupId(typeof groupIdRaw === 'number' && groupIdRaw > 0 ? groupIdRaw : null)

    const nextMode = readQueryString(searchParams, QUERY_KEYS.queryMode)
    if (nextMode && allowedQueryModes.has(nextMode as QueryMode)) {
      setQueryMode(nextMode as QueryMode)
    } else {
      const fallback = adminSettingsStore.opsQueryModeDefault || 'auto'
      setQueryMode(allowedQueryModes.has(fallback as QueryMode) ? (fallback as QueryMode) : 'auto')
    }

    const openRules = readQueryString(searchParams, QUERY_KEYS.openAlertRules)
    if (openRules === '1' || openRules === 'true') {
      setShowAlertRulesCard(true)
    }

    const ruleID = readQueryNumber(searchParams, QUERY_KEYS.alertRuleId)
    if (typeof ruleID === 'number' && ruleID > 0) {
      setShowAlertRulesCard(true)
    }

    const openErr = readQueryString(searchParams, QUERY_KEYS.openErrorDetails)
    if (openErr === '1' || openErr === 'true') {
      const typ = readQueryString(searchParams, QUERY_KEYS.errorType)
      setErrorDetailsType(typ === 'upstream' ? 'upstream' : 'request')
      setShowErrorDetails(true)
    }
  }, [searchParams, adminSettingsStore.opsQueryModeDefault])

  const buildQueryFromState = useCallback(() => {
    const next = new URLSearchParams(searchParams.toString())

    Object.values(QUERY_KEYS).forEach((k) => {
      next.delete(k)
    })

    if (timeRange !== '1h') next.set(QUERY_KEYS.timeRange, timeRange)
    if (platform) next.set(QUERY_KEYS.platform, platform)
    if (typeof groupId === 'number' && groupId > 0) next.set(QUERY_KEYS.groupId, String(groupId))
    if (queryMode !== 'auto') next.set(QUERY_KEYS.queryMode, queryMode)

    return next
  }, [searchParams, timeRange, platform, groupId, queryMode])

  const syncQueryToRoute = useCallback(() => {
    if (isApplyingRouteQuery.current) return
    if (syncQueryTimer.current) clearTimeout(syncQueryTimer.current)
    syncQueryTimer.current = setTimeout(() => {
      const nextQuery = buildQueryFromState()
      const curr = new URLSearchParams(searchParams.toString())
      const nextStr = nextQuery.toString()
      const currStr = curr.toString()
      if (nextStr === currStr) return

      isSyncingRouteQuery.current = true
      const path = nextStr ? `/admin/ops?${nextStr}` : '/admin/ops'
      router.replace(path)
      isSyncingRouteQuery.current = false
    }, 250)
  }, [buildQueryFromState, router, searchParams])

  const buildApiParams = useCallback(() => {
    const params: Record<string, unknown> = {
      platform: platform || undefined,
      group_id: groupId ?? undefined,
      mode: queryMode,
    }

    if (timeRange === 'custom') {
      if (customStartTime && customEndTime) {
        params.start_time = customStartTime
        params.end_time = customEndTime
      } else {
        params.time_range = '1h'
      }
    } else {
      params.time_range = timeRange
    }

    return params
  }, [platform, groupId, queryMode, timeRange, customStartTime, customEndTime])

  const buildSwitchTrendParams = useCallback(() => {
    const params: Record<string, unknown> = {
      platform: platform || undefined,
      group_id: groupId ?? undefined,
      mode: queryMode,
    }
    const endTime = new Date()
    const startTime = new Date(endTime.getTime() - switchTrendWindowMs)
    params.start_time = startTime.toISOString()
    params.end_time = endTime.toISOString()
    return params
  }, [platform, groupId, queryMode])

  const loadDashboardAdvancedSettings = useCallback(async () => {
    try {
      const settings = await adminOpsAPI.getAdvancedSettings()
      setShowAlertEvents(settings.display_alert_events)
      setShowOpenAITokenStats(settings.display_openai_token_stats)
      setAutoRefreshEnabled(settings.auto_refresh_enabled)
      setAutoRefreshIntervalMs(settings.auto_refresh_interval_seconds * 1000)
      setAutoRefreshCountdown(settings.auto_refresh_interval_seconds)
    } catch (err) {
      console.error('[OpsDashboard] Failed to load dashboard advanced settings', err)
      setShowAlertEvents(true)
      setShowOpenAITokenStats(false)
      setAutoRefreshEnabled(false)
      setAutoRefreshIntervalMs(30000)
      setAutoRefreshCountdown(0)
    }
  }, [])

  const loadThresholds = useCallback(async () => {
    try {
      const thresholds = await adminOpsAPI.getMetricThresholds()
      setMetricThresholds(thresholds || null)
    } catch (err) {
      console.warn('[OpsDashboard] Failed to load thresholds', err)
      setMetricThresholds(null)
    }
  }, [])

  const refreshOverviewWithCancel = useCallback(
    async (fetchSeq: number, signal: AbortSignal) => {
      if (!opsEnabled) return
      try {
        const data = await adminOpsAPI.getDashboardOverview(buildApiParams(), { signal })
        if (fetchSeq !== dashboardFetchSeq.current) return
        setOverview(data)
      } catch (err: unknown) {
        if (fetchSeq !== dashboardFetchSeq.current || isCanceledRequest(err)) return
        setOverview(null)
        appStore.showError((err as Error)?.message || t('admin.ops.failedToLoadOverview'))
      }
    },
    [opsEnabled, buildApiParams, appStore, t],
  )

  const refreshSwitchTrendWithCancel = useCallback(
    async (fetchSeq: number, signal: AbortSignal) => {
      if (!opsEnabled) return
      setLoadingSwitchTrend(true)
      try {
        const data = await adminOpsAPI.getThroughputTrend(buildSwitchTrendParams(), { signal })
        if (fetchSeq !== dashboardFetchSeq.current) return
        setSwitchTrend(data)
      } catch (err: unknown) {
        if (fetchSeq !== dashboardFetchSeq.current || isCanceledRequest(err)) return
        setSwitchTrend(null)
        appStore.showError((err as Error)?.message || t('admin.ops.failedToLoadSwitchTrend'))
      } finally {
        if (fetchSeq === dashboardFetchSeq.current) setLoadingSwitchTrend(false)
      }
    },
    [opsEnabled, buildSwitchTrendParams, appStore, t],
  )

  const refreshThroughputTrendWithCancel = useCallback(
    async (fetchSeq: number, signal: AbortSignal) => {
      if (!opsEnabled) return
      setLoadingTrend(true)
      try {
        const data = await adminOpsAPI.getThroughputTrend(buildApiParams(), { signal })
        if (fetchSeq !== dashboardFetchSeq.current) return
        setThroughputTrend(data)
      } catch (err: unknown) {
        if (fetchSeq !== dashboardFetchSeq.current || isCanceledRequest(err)) return
        setThroughputTrend(null)
        appStore.showError((err as Error)?.message || t('admin.ops.failedToLoadThroughputTrend'))
      } finally {
        if (fetchSeq === dashboardFetchSeq.current) setLoadingTrend(false)
      }
    },
    [opsEnabled, buildApiParams, appStore, t],
  )

  const refreshErrorTrendWithCancel = useCallback(
    async (fetchSeq: number, signal: AbortSignal) => {
      if (!opsEnabled) return
      setLoadingErrorTrend(true)
      try {
        const data = await adminOpsAPI.getErrorTrend(buildApiParams(), { signal })
        if (fetchSeq !== dashboardFetchSeq.current) return
        setErrorTrend(data)
      } catch (err: unknown) {
        if (fetchSeq !== dashboardFetchSeq.current || isCanceledRequest(err)) return
        setErrorTrend(null)
        appStore.showError((err as Error)?.message || t('admin.ops.failedToLoadErrorTrend'))
      } finally {
        if (fetchSeq === dashboardFetchSeq.current) setLoadingErrorTrend(false)
      }
    },
    [opsEnabled, buildApiParams, appStore, t],
  )

  const refreshCoreSnapshotWithCancel = useCallback(
    async (fetchSeq: number, signal: AbortSignal) => {
      if (!opsEnabled) return
      setLoadingTrend(true)
      setLoadingErrorTrend(true)
      try {
        const data = await adminOpsAPI.getDashboardSnapshotV2(buildApiParams(), { signal })
        if (fetchSeq !== dashboardFetchSeq.current) return
        setOverview(data.overview)
        setThroughputTrend(data.throughput_trend)
        setErrorTrend(data.error_trend)
      } catch (err: unknown) {
        if (fetchSeq !== dashboardFetchSeq.current || isCanceledRequest(err)) return
        await Promise.all([
          refreshOverviewWithCancel(fetchSeq, signal),
          refreshThroughputTrendWithCancel(fetchSeq, signal),
          refreshErrorTrendWithCancel(fetchSeq, signal),
        ])
      } finally {
        if (fetchSeq === dashboardFetchSeq.current) {
          setLoadingTrend(false)
          setLoadingErrorTrend(false)
        }
      }
    },
    [
      opsEnabled,
      buildApiParams,
      refreshOverviewWithCancel,
      refreshThroughputTrendWithCancel,
      refreshErrorTrendWithCancel,
    ],
  )

  const refreshLatencyHistogramWithCancel = useCallback(
    async (fetchSeq: number, signal: AbortSignal) => {
      if (!opsEnabled) return
      setLoadingLatency(true)
      try {
        const data = await adminOpsAPI.getLatencyHistogram(buildApiParams(), { signal })
        if (fetchSeq !== dashboardFetchSeq.current) return
        setLatencyHistogram(data)
      } catch (err: unknown) {
        if (fetchSeq !== dashboardFetchSeq.current || isCanceledRequest(err)) return
        setLatencyHistogram(null)
        appStore.showError((err as Error)?.message || t('admin.ops.failedToLoadLatencyHistogram'))
      } finally {
        if (fetchSeq === dashboardFetchSeq.current) setLoadingLatency(false)
      }
    },
    [opsEnabled, buildApiParams, appStore, t],
  )

  const refreshErrorDistributionWithCancel = useCallback(
    async (fetchSeq: number, signal: AbortSignal) => {
      if (!opsEnabled) return
      setLoadingErrorDistribution(true)
      try {
        const data = await adminOpsAPI.getErrorDistribution(buildApiParams(), { signal })
        if (fetchSeq !== dashboardFetchSeq.current) return
        setErrorDistribution(data)
      } catch (err: unknown) {
        if (fetchSeq !== dashboardFetchSeq.current || isCanceledRequest(err)) return
        setErrorDistribution(null)
        appStore.showError((err as Error)?.message || t('admin.ops.failedToLoadErrorDistribution'))
      } finally {
        if (fetchSeq === dashboardFetchSeq.current) setLoadingErrorDistribution(false)
      }
    },
    [opsEnabled, buildApiParams, appStore, t],
  )

  const refreshDeferredPanels = useCallback(
    async (fetchSeq: number, signal: AbortSignal) => {
      if (!opsEnabled) return
      await Promise.all([
        refreshLatencyHistogramWithCancel(fetchSeq, signal),
        refreshErrorDistributionWithCancel(fetchSeq, signal),
      ])
    },
    [opsEnabled, refreshLatencyHistogramWithCancel, refreshErrorDistributionWithCancel],
  )

  const fetchData = useCallback(async () => {
    if (!opsEnabled) return

    abortDashboardFetch()
    dashboardFetchSeq.current += 1
    const fetchSeq = dashboardFetchSeq.current
    dashboardFetchController.current = new AbortController()

    setLoading(true)
    setErrorMessage('')
    try {
      await Promise.all([
        refreshCoreSnapshotWithCancel(fetchSeq, dashboardFetchController.current.signal),
        refreshSwitchTrendWithCancel(fetchSeq, dashboardFetchController.current.signal),
      ])
      if (fetchSeq !== dashboardFetchSeq.current) return

      setLastUpdated(new Date())
      setDashboardRefreshToken((v) => v + 1)

      if (autoRefreshEnabled) {
        setAutoRefreshCountdown(Math.floor(autoRefreshIntervalMs / 1000))
      }

      void refreshDeferredPanels(fetchSeq, dashboardFetchController.current.signal)
    } catch (err) {
      if (!isOpsDisabledError(err)) {
        console.error('[ops] failed to fetch dashboard data', err)
        setErrorMessage(t('admin.ops.failedToLoadData'))
      }
    } finally {
      if (fetchSeq === dashboardFetchSeq.current) {
        setLoading(false)
        setHasLoadedOnce(true)
      }
    }
  }, [
    opsEnabled,
    abortDashboardFetch,
    refreshCoreSnapshotWithCancel,
    refreshSwitchTrendWithCancel,
    refreshDeferredPanels,
    autoRefreshEnabled,
    autoRefreshIntervalMs,
    t,
  ])

  const exitFullscreen = useCallback(() => {
    const next = new URLSearchParams(searchParams.toString())
    next.delete(QUERY_KEYS.fullscreen)
    const path = next.toString() ? `/admin/ops?${next.toString()}` : '/admin/ops'
    router.replace(path)
  }, [router, searchParams])

  const enterFullscreen = useCallback(() => {
    const next = new URLSearchParams(searchParams.toString())
    next.set(QUERY_KEYS.fullscreen, '1')
    router.replace(`/admin/ops?${next.toString()}`)
  }, [router, searchParams])

  const handleOpenRequestDetails = useCallback(
    (preset?: OpsRequestDetailsPreset) => {
      const basePreset: OpsRequestDetailsPreset = {
        title: t('admin.ops.requestDetails.title'),
        kind: 'all',
        sort: 'created_at_desc',
      }
      const merged = { ...basePreset, ...(preset ?? {}) }
      if (!merged.title) merged.title = basePreset.title
      setShowErrorDetails(false)
      setShowErrorModal(false)
      setRequestDetailsPreset(merged)
      setShowRequestDetails(true)
    },
    [t],
  )

  const openErrorDetails = useCallback((kind: 'request' | 'upstream') => {
    setErrorDetailsType(kind)
    setShowRequestDetails(false)
    setShowErrorModal(false)
    setShowErrorDetails(true)
  }, [])

  const openError = useCallback((id: number) => {
    setSelectedErrorId(id)
    setShowErrorDetails(false)
    setShowRequestDetails(false)
    setShowErrorModal(true)
  }, [])

  const onSettingsSaved = useCallback(async () => {
    await loadDashboardAdvancedSettings()
    loadThresholds()
    fetchData()
  }, [loadDashboardAdvancedSettings, loadThresholds, fetchData])

  useEffect(() => {
    const handleKeydown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isFullscreen) exitFullscreen()
    }
    window.addEventListener('keydown', handleKeydown)
    return () => window.removeEventListener('keydown', handleKeydown)
  }, [isFullscreen, exitFullscreen])

  useEffect(() => {
    if (initialized.current) return
    initialized.current = true

    void (async () => {
      await adminSettingsStore.fetch()
      if (!adminSettingsStore.opsMonitoringEnabled) {
        router.replace('/admin/settings')
        return
      }
      loadThresholds()
      await loadDashboardAdvancedSettings()
      applyRouteQueryToState()
      if (opsEnabled) await fetchData()
    })()

    return () => {
      abortDashboardFetch()
      if (countdownTimer.current) clearInterval(countdownTimer.current)
      if (syncQueryTimer.current) clearTimeout(syncQueryTimer.current)
    }
  }, [])

  useEffect(() => {
    if (isSyncingRouteQuery.current) return
    isApplyingRouteQuery.current = true
    applyRouteQueryToState()
    isApplyingRouteQuery.current = false
  }, [searchParams, applyRouteQueryToState])

  useEffect(() => {
    if (isApplyingRouteQuery.current) return
    if (opsEnabled) fetchData()
    syncQueryToRoute()
  }, [timeRange, platform, groupId, queryMode])

  useEffect(() => {
    if (autoRefreshEnabled) {
      setAutoRefreshCountdown(Math.floor(autoRefreshIntervalMs / 1000))
      countdownPaused.current = false
      if (countdownTimer.current) clearInterval(countdownTimer.current)
      countdownTimer.current = setInterval(() => {
        if (countdownPaused.current || !autoRefreshEnabled || !opsEnabled || loading) return
        setAutoRefreshCountdown((prev) => {
          if (prev <= 0) {
            void fetchData()
            return Math.floor(autoRefreshIntervalMs / 1000)
          }
          return prev - 1
        })
      }, 1000)
    } else {
      countdownPaused.current = true
      if (countdownTimer.current) clearInterval(countdownTimer.current)
      setAutoRefreshCountdown(0)
    }
    return () => {
      if (countdownTimer.current) clearInterval(countdownTimer.current)
    }
  }, [autoRefreshEnabled, autoRefreshIntervalMs, opsEnabled, loading, fetchData])

  useEffect(() => {
    if (!showSettingsDialog) {
      void loadDashboardAdvancedSettings()
    }
  }, [showSettingsDialog, loadDashboardAdvancedSettings])

  const content = (
    <div className={`${isFullscreen ? 'p-4 md:p-6' : ''} space-y-6 pb-12`}>
      {errorMessage && (
        <div className="rounded-2xl bg-red-50 p-4 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400">
          {errorMessage}
        </div>
      )}

      {loading && !hasLoadedOnce ? (
        <OpsDashboardSkeleton fullscreen={isFullscreen} />
      ) : opsEnabled ? (
        <OpsDashboardHeader
          overview={overview}
          platform={platform}
          groupId={groupId}
          timeRange={timeRange}
          queryMode={queryMode}
          loading={loading}
          lastUpdated={lastUpdated}
          thresholds={metricThresholds}
          autoRefreshEnabled={autoRefreshEnabled}
          autoRefreshCountdown={autoRefreshCountdown}
          fullscreen={isFullscreen}
          customStartTime={customStartTime}
          customEndTime={customEndTime}
          onUpdateTimeRange={(v: string) => setTimeRange(v as TimeRange)}
          onUpdatePlatform={setPlatform}
          onUpdateGroup={setGroupId}
          onUpdateQueryMode={(v: string) => setQueryMode(v as QueryMode)}
          onUpdateCustomTimeRange={(start: string, end: string) => {
            setCustomStartTime(start)
            setCustomEndTime(end)
          }}
          onRefresh={fetchData}
          onOpenRequestDetails={handleOpenRequestDetails}
          onOpenErrorDetails={openErrorDetails}
          onOpenSettings={() => setShowSettingsDialog(true)}
          onOpenAlertRules={() => setShowAlertRulesCard(true)}
          onEnterFullscreen={enterFullscreen}
          onExitFullscreen={exitFullscreen}
        />
      ) : null}

      {opsEnabled && !(loading && !hasLoadedOnce) && (
        <>
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-4">
            <div className="min-h-[360px] lg:col-span-1">
              <OpsConcurrencyCard
                platformFilter={platform}
                groupIdFilter={groupId}
                refreshToken={dashboardRefreshToken}
              />
            </div>
            <div className="min-h-[360px] lg:col-span-1">
              <OpsSwitchRateTrendChart
                points={switchTrend?.points ?? []}
                loading={loadingSwitchTrend}
                timeRange={switchTrendTimeRange}
                fullscreen={isFullscreen}
              />
            </div>
            <div className="min-h-[360px] lg:col-span-2">
              <OpsThroughputTrendChart
                points={throughputTrend?.points ?? []}
                byPlatform={throughputTrend?.by_platform ?? []}
                topGroups={throughputTrend?.top_groups ?? []}
                loading={loadingTrend}
                timeRange={timeRange}
                fullscreen={isFullscreen}
                onSelectPlatform={(next) => {
                  setPlatform(next || '')
                  setGroupId(null)
                }}
                onSelectGroup={(nextGroupId) => {
                  setGroupId(Number.isFinite(nextGroupId) && nextGroupId > 0 ? nextGroupId : null)
                }}
                onOpenDetails={() => handleOpenRequestDetails()}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
            <OpsLatencyChart latencyData={latencyHistogram} loading={loadingLatency} />
            <OpsErrorDistributionChart
              data={errorDistribution}
              loading={loadingErrorDistribution}
              onOpenDetails={() => openErrorDetails('request')}
            />
            <OpsErrorTrendChart
              points={errorTrend?.points ?? []}
              loading={loadingErrorTrend}
              timeRange={timeRange}
              onOpenRequestErrors={() => openErrorDetails('request')}
              onOpenUpstreamErrors={() => openErrorDetails('upstream')}
            />
          </div>

          {showOpenAITokenStats && (
            <div className="grid grid-cols-1 gap-6">
              <OpsOpenAITokenStatsCard
                platformFilter={platform}
                groupIdFilter={groupId}
                refreshToken={dashboardRefreshToken}
              />
            </div>
          )}

          {showAlertEvents && <OpsAlertEventsCard />}

          <OpsSystemLogTable platformFilter={platform} refreshToken={dashboardRefreshToken} />
        </>
      )}

      {!isFullscreen && (
        <>
          <OpsSettingsDialog
            show={showSettingsDialog}
            onClose={() => setShowSettingsDialog(false)}
            onSaved={onSettingsSaved}
          />

          <BaseDialog
            show={showAlertRulesCard}
            title={t('admin.ops.alertRules.title')}
            width="extra-wide"
            onClose={() => setShowAlertRulesCard(false)}
          >
            <OpsAlertRulesCard />
          </BaseDialog>

          <OpsErrorDetailsModal
            show={showErrorDetails}
            timeRange={timeRange}
            platform={platform}
            groupId={groupId}
            errorType={errorDetailsType}
            onUpdateShow={setShowErrorDetails}
            onOpenErrorDetail={openError}
          />

          <OpsErrorDetailModal
            show={showErrorModal}
            errorId={selectedErrorId}
            errorType={errorDetailsType}
            onUpdateShow={setShowErrorModal}
          />

          <OpsRequestDetailsModal
            show={showRequestDetails}
            timeRange={timeRange}
            preset={requestDetailsPreset}
            platform={platform}
            groupId={groupId}
            onUpdateShow={setShowRequestDetails}
            onOpenErrorDetail={openError}
          />
        </>
      )}
    </div>
  )

  if (isFullscreen) {
    return (
      <div className="flex min-h-screen flex-col justify-center bg-gray-50 dark:bg-dark-950">
        {content}
      </div>
    )
  }

  return <AppLayout>{content}</AppLayout>
}
