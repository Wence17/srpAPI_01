'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useI18n } from '@/lib/i18n'
import { useAdminSettingsStore } from '@/lib/stores/adminSettings'
import Select from '@/components/common/Select'
import HelpTooltip from '@/components/common/HelpTooltip'
import BaseDialog from '@/components/common/BaseDialog'
import Icon from '@/components/icons/Icon'
import { adminOpsAPI, type OpsDashboardOverview, type OpsMetricThresholds, type OpsRealtimeTrafficSummary } from '@/lib/adminOps'
import { adminGroupsAPI } from '@/lib/adminGroups'
import { formatNumber } from '@/lib/format'
import type { OpsRequestDetailsPreset } from '@/components/admin/ops/OpsRequestDetailsModal'
import {
  REALTIME_WINDOW_MINUTES,
  TOOLBAR_RANGE_MINUTES,
  buildDiagnosisReport,
  formatCustomTimeRangeLabel,
  formatTimeShort,
  getRequestErrorRateThresholdLevel,
  getSLAThresholdLevel,
  getTTFTThresholdLevel,
  getThresholdColorClass,
  getUpstreamErrorRateThresholdLevel,
  type RealtimeWindow,
} from '@/components/admin/ops/opsDashboardHeaderLogic'

export interface OpsDashboardHeaderProps {
  overview?: OpsDashboardOverview | null
  platform: string
  groupId: number | null
  timeRange: string
  queryMode: string
  loading: boolean
  lastUpdated: Date | null
  thresholds?: OpsMetricThresholds | null
  autoRefreshEnabled?: boolean
  autoRefreshCountdown?: number
  fullscreen?: boolean
  customStartTime?: string | null
  customEndTime?: string | null
  onUpdateTimeRange: (value: string) => void
  onUpdatePlatform: (value: string) => void
  onUpdateGroup: (value: number | null) => void
  onUpdateQueryMode: (value: string) => void
  onUpdateCustomTimeRange: (startTime: string, endTime: string) => void
  onRefresh: () => void
  onOpenRequestDetails: (preset?: OpsRequestDetailsPreset) => void
  onOpenErrorDetails: (kind: 'request' | 'upstream') => void
  onOpenSettings: () => void
  onOpenAlertRules: () => void
  onEnterFullscreen: () => void
  onExitFullscreen: () => void
}

export default function OpsDashboardHeader({
  overview = null,
  platform,
  groupId,
  timeRange,
  queryMode,
  loading,
  lastUpdated,
  thresholds = null,
  autoRefreshEnabled = false,
  autoRefreshCountdown,
  fullscreen = false,
  customStartTime = null,
  customEndTime = null,
  onUpdateTimeRange,
  onUpdatePlatform,
  onUpdateGroup,
  onUpdateQueryMode,
  onUpdateCustomTimeRange,
  onRefresh,
  onOpenRequestDetails,
  onOpenErrorDetails,
  onOpenSettings,
  onOpenAlertRules,
  onEnterFullscreen,
}: OpsDashboardHeaderProps) {
  const { t } = useI18n()
  const adminSettingsStore = useAdminSettingsStore()

  const [realtimeWindow, setRealtimeWindow] = useState<RealtimeWindow>('1min')
  const [groups, setGroups] = useState<Array<{ id: number; name: string; platform: string }>>([])
  const [showCustomTimeRangeDialog, setShowCustomTimeRangeDialog] = useState(false)
  const [customStartTimeInput, setCustomStartTimeInput] = useState('')
  const [customEndTimeInput, setCustomEndTimeInput] = useState('')
  const [realtimeTrafficSummary, setRealtimeTrafficSummary] = useState<OpsRealtimeTrafficSummary | null>(null)
  const [realtimeTrafficLoading, setRealtimeTrafficLoading] = useState(false)
  const [showJobsDetails, setShowJobsDetails] = useState(false)

  const loadingRealtimeRef = useRef(false)

  const systemMetrics = overview?.system_metrics ?? null

  const availableRealtimeWindows = useMemo(() => {
    const toolbarMinutes = TOOLBAR_RANGE_MINUTES[timeRange] ?? 60
    return (['1min', '5min', '30min', '1h'] as const).filter((w) => REALTIME_WINDOW_MINUTES[w] <= toolbarMinutes)
  }, [timeRange])

  const platformOptions = useMemo(
    () => [
      { value: '', label: t('common.all') },
      { value: 'openai', label: 'OpenAI' },
      { value: 'anthropic', label: 'Anthropic' },
      { value: 'gemini', label: 'Gemini' },
      { value: 'antigravity', label: 'Antigravity' },
    ],
    [t],
  )

  const timeRangeOptions = useMemo(
    () => [
      { value: '5m', label: t('admin.ops.timeRange.5m') },
      { value: '30m', label: t('admin.ops.timeRange.30m') },
      { value: '1h', label: t('admin.ops.timeRange.1h') },
      { value: '6h', label: t('admin.ops.timeRange.6h') },
      { value: '24h', label: t('admin.ops.timeRange.24h') },
      {
        value: 'custom',
        label:
          timeRange === 'custom' && customStartTime && customEndTime
            ? `${t('admin.ops.timeRange.custom')} (${formatCustomTimeRangeLabel(customStartTime, customEndTime)})`
            : t('admin.ops.timeRange.custom'),
      },
    ],
    [t, timeRange, customStartTime, customEndTime],
  )

  const queryModeOptions = useMemo(
    () => [
      { value: 'auto', label: t('admin.ops.queryMode.auto') },
      { value: 'raw', label: t('admin.ops.queryMode.raw') },
      { value: 'preagg', label: t('admin.ops.queryMode.preagg') },
    ],
    [t],
  )

  const groupOptions = useMemo(() => {
    const filtered = platform ? groups.filter((g) => g.platform === platform) : groups
    return [{ value: null, label: t('common.all') }, ...filtered.map((g) => ({ value: g.id, label: g.name }))]
  }, [groups, platform, t])

  const makeZeroRealtimeTrafficSummary = useCallback((): OpsRealtimeTrafficSummary => {
    const now = new Date().toISOString()
    return {
      window: realtimeWindow,
      start_time: now,
      end_time: now,
      platform,
      group_id: groupId,
      qps: { current: 0, peak: 0, avg: 0 },
      tps: { current: 0, peak: 0, avg: 0 },
    }
  }, [realtimeWindow, platform, groupId])

  const loadRealtimeTrafficSummary = useCallback(async () => {
    if (loadingRealtimeRef.current) return
    if (!adminSettingsStore.opsRealtimeMonitoringEnabled) {
      setRealtimeTrafficSummary(makeZeroRealtimeTrafficSummary())
      return
    }
    loadingRealtimeRef.current = true
    setRealtimeTrafficLoading(true)
    try {
      const res = await adminOpsAPI.getRealtimeTrafficSummary(realtimeWindow, platform, groupId)
      if (res && res.enabled === false) {
        adminSettingsStore.setOpsRealtimeMonitoringEnabledLocal(false)
      }
      setRealtimeTrafficSummary(res?.summary ?? null)
    } catch (err) {
      console.error('[OpsDashboardHeader] Failed to load realtime traffic summary', err)
      setRealtimeTrafficSummary(null)
    } finally {
      loadingRealtimeRef.current = false
      setRealtimeTrafficLoading(false)
    }
  }, [adminSettingsStore, makeZeroRealtimeTrafficSummary, realtimeWindow, platform, groupId])

  useEffect(() => {
    void (async () => {
      try {
        const list = await adminGroupsAPI.getAll()
        setGroups(list.map((g) => ({ id: g.id, name: g.name, platform: g.platform })))
      } catch (e) {
        console.error('[OpsDashboardHeader] Failed to load groups', e)
        setGroups([])
      }
    })()
  }, [])

  useEffect(() => {
    if (!platform) return
    const currentGroup = groups.find((g) => g.id === groupId)
    if (currentGroup && currentGroup.platform !== platform) onUpdateGroup(null)
  }, [platform, groupId, groups, onUpdateGroup])

  useEffect(() => {
    setRealtimeWindow('1min')
    void loadRealtimeTrafficSummary()
  }, [timeRange, loadRealtimeTrafficSummary])

  useEffect(() => {
    void loadRealtimeTrafficSummary()
  }, [realtimeWindow, platform, groupId, loadRealtimeTrafficSummary])

  useEffect(() => {
    if (!adminSettingsStore.opsRealtimeMonitoringEnabled) {
      setRealtimeTrafficSummary(makeZeroRealtimeTrafficSummary())
    } else {
      void loadRealtimeTrafficSummary()
    }
  }, [adminSettingsStore.opsRealtimeMonitoringEnabled, loadRealtimeTrafficSummary, makeZeroRealtimeTrafficSummary])

  useEffect(() => {
    if (!autoRefreshEnabled || loading) return
    if (autoRefreshCountdown === 0) void loadRealtimeTrafficSummary()
  }, [autoRefreshEnabled, autoRefreshCountdown, loading, loadRealtimeTrafficSummary])

  const totalRequestsLabel = formatNumber(overview?.request_count_total ?? 0)
  const totalTokensLabel = formatNumber(overview?.token_consumed ?? 0)

  const displayRealTimeQps = realtimeTrafficSummary?.qps?.current ?? 0
  const displayRealTimeTps = realtimeTrafficSummary?.tps?.current ?? 0
  const fmtRate = (v?: number) => (typeof v === 'number' && Number.isFinite(v) ? v.toFixed(1) : '-')

  const qpsAvgLabel = typeof overview?.qps?.avg === 'number' ? overview.qps.avg.toFixed(1) : '-'
  const tpsAvgLabel = typeof overview?.tps?.avg === 'number' ? overview.tps.avg.toFixed(1) : '-'

  const slaPercent = typeof overview?.sla === 'number' ? overview.sla * 100 : null
  const errorRatePercent = typeof overview?.error_rate === 'number' ? overview.error_rate * 100 : null
  const upstreamErrorRatePercent = typeof overview?.upstream_error_rate === 'number' ? overview.upstream_error_rate * 100 : null

  const durationP99Ms = overview?.duration?.p99_ms ?? null
  const durationP95Ms = overview?.duration?.p95_ms ?? null
  const durationP90Ms = overview?.duration?.p90_ms ?? null
  const durationP50Ms = overview?.duration?.p50_ms ?? null
  const durationAvgMs = overview?.duration?.avg_ms ?? null
  const durationMaxMs = overview?.duration?.max_ms ?? null

  const ttftP99Ms = overview?.ttft?.p99_ms ?? null
  const ttftP95Ms = overview?.ttft?.p95_ms ?? null
  const ttftP90Ms = overview?.ttft?.p90_ms ?? null
  const ttftP50Ms = overview?.ttft?.p50_ms ?? null
  const ttftAvgMs = overview?.ttft?.avg_ms ?? null
  const ttftMaxMs = overview?.ttft?.max_ms ?? null

  const isSystemIdle = !overview || ((overview.qps?.current ?? 0) === 0 && (overview.error_rate ?? 0) === 0)
  const healthScoreValue = typeof overview?.health_score === 'number' && Number.isFinite(overview.health_score) ? overview.health_score : null

  const healthScoreColor = isSystemIdle ? '#9ca3af' : healthScoreValue == null ? '#9ca3af' : healthScoreValue >= 90 ? '#10b981' : healthScoreValue >= 60 ? '#f59e0b' : '#ef4444'
  const healthScoreClass = isSystemIdle ? 'text-gray-400' : healthScoreValue == null ? 'text-gray-400' : healthScoreValue >= 90 ? 'text-green-500' : healthScoreValue >= 60 ? 'text-yellow-500' : 'text-red-500'

  const circleSize = fullscreen ? 140 : 100
  const strokeWidth = fullscreen ? 10 : 8
  const radius = (circleSize - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const dashOffset = isSystemIdle || healthScoreValue == null ? 0 : circumference - (Math.max(0, Math.min(100, healthScoreValue)) / 100) * circumference

  const diagnosisReport = useMemo(
    () => buildDiagnosisReport(overview, isSystemIdle, healthScoreValue, t),
    [overview, isSystemIdle, healthScoreValue, t],
  )

  const cpuPercentValue = typeof systemMetrics?.cpu_usage_percent === 'number' ? systemMetrics.cpu_usage_percent : null
  const memPercentValue = typeof systemMetrics?.memory_usage_percent === 'number' ? systemMetrics.memory_usage_percent : null
  const dbConnActiveValue = typeof systemMetrics?.db_conn_active === 'number' ? systemMetrics.db_conn_active : null
  const dbConnIdleValue = typeof systemMetrics?.db_conn_idle === 'number' ? systemMetrics.db_conn_idle : null
  const dbConnWaitingValue = typeof systemMetrics?.db_conn_waiting === 'number' ? systemMetrics.db_conn_waiting : null
  const dbConnOpenValue = dbConnActiveValue != null && dbConnIdleValue != null ? dbConnActiveValue + dbConnIdleValue : null
  const dbMaxOpenConnsValue = typeof systemMetrics?.db_max_open_conns === 'number' ? systemMetrics.db_max_open_conns : null
  const dbUsagePercent = dbConnOpenValue != null && dbMaxOpenConnsValue != null && dbMaxOpenConnsValue > 0 ? Math.min(100, Math.max(0, (dbConnOpenValue / dbMaxOpenConnsValue) * 100)) : null

  const redisConnTotalValue = typeof systemMetrics?.redis_conn_total === 'number' ? systemMetrics.redis_conn_total : null
  const redisConnIdleValue = typeof systemMetrics?.redis_conn_idle === 'number' ? systemMetrics.redis_conn_idle : null
  const redisConnActiveValue = redisConnTotalValue != null && redisConnIdleValue != null ? Math.max(redisConnTotalValue - redisConnIdleValue, 0) : null
  const redisPoolSizeValue = typeof systemMetrics?.redis_pool_size === 'number' ? systemMetrics.redis_pool_size : null
  const redisUsagePercent = redisConnTotalValue != null && redisPoolSizeValue != null && redisPoolSizeValue > 0 ? Math.min(100, Math.max(0, (redisConnTotalValue / redisPoolSizeValue) * 100)) : null

  const goroutineCountValue = typeof systemMetrics?.goroutine_count === 'number' ? systemMetrics.goroutine_count : null
  const goroutinesWarnThreshold = 8_000
  const goroutinesCriticalThreshold = 15_000
  const goroutineStatus = goroutineCountValue == null ? 'unknown' : goroutineCountValue >= goroutinesCriticalThreshold ? 'critical' : goroutineCountValue >= goroutinesWarnThreshold ? 'warning' : 'ok'

  const jobHeartbeats = overview?.job_heartbeats ?? []
  const jobsWarnCount = jobHeartbeats.filter((hb) => hb?.last_error_at && (!hb.last_success_at || hb.last_error_at > hb.last_success_at)).length
  const jobsStatus = jobHeartbeats.length === 0 ? 'unknown' : jobsWarnCount > 0 ? 'warn' : 'ok'

  const handlePlatformChange = (val: unknown) => onUpdatePlatform(String(val || ''))
  const handleGroupChange = (val: unknown) => {
    if (val === null || val === '' || typeof val === 'boolean') {
      onUpdateGroup(null)
      return
    }
    const id = typeof val === 'number' ? val : Number.parseInt(String(val), 10)
    onUpdateGroup(Number.isFinite(id) && id > 0 ? id : null)
  }

  const handleTimeRangeChange = (val: unknown) => {
    const newValue = String(val || '1h')
    if (newValue === 'custom') {
      const now = new Date()
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000)
      setCustomStartTimeInput(oneHourAgo.toISOString().slice(0, 16))
      setCustomEndTimeInput(now.toISOString().slice(0, 16))
      setShowCustomTimeRangeDialog(true)
    } else {
      onUpdateTimeRange(newValue)
    }
  }

  const handleCustomTimeRangeConfirm = () => {
    if (!customStartTimeInput || !customEndTimeInput) return
    onUpdateCustomTimeRange(new Date(customStartTimeInput).toISOString(), new Date(customEndTimeInput).toISOString())
    onUpdateTimeRange('custom')
    setShowCustomTimeRangeDialog(false)
  }

  const handleToolbarRefresh = () => {
    void loadRealtimeTrafficSummary()
    onRefresh()
  }

  const pctClass = (v: number | null, warn: number, crit: number) => {
    if (v == null) return 'text-gray-900 dark:text-white'
    if (v >= crit) return 'text-rose-600 dark:text-rose-400'
    if (v >= warn) return 'text-yellow-600 dark:text-yellow-400'
    return 'text-emerald-600 dark:text-emerald-400'
  }

  const dbMiddleLabel = systemMetrics?.db_ok === false ? 'FAIL' : dbUsagePercent != null ? `${dbUsagePercent.toFixed(0)}%` : systemMetrics?.db_ok === true ? t('admin.ops.ok') : t('admin.ops.noData')
  const redisMiddleLabel = systemMetrics?.redis_ok === false ? 'FAIL' : redisUsagePercent != null ? `${redisUsagePercent.toFixed(0)}%` : systemMetrics?.redis_ok === true ? t('admin.ops.ok') : t('admin.ops.noData')

  return (
    <div className={`flex flex-col gap-4 rounded-3xl bg-white shadow-sm ring-1 ring-gray-900/5 dark:bg-dark-800 dark:ring-dark-700 ${fullscreen ? 'p-8' : 'p-6'}`}>
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-gray-100 pb-4 dark:border-dark-700">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-black text-gray-900 dark:text-white">
            <svg className="h-6 w-6 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            {t('admin.ops.title')}
          </h1>
          {!fullscreen && (
            <div className="mt-1 flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
              <span className="flex items-center gap-1.5" title={loading ? t('admin.ops.loadingText') : t('admin.ops.ready')}>
                <span className="relative flex h-2 w-2">
                  <span className={`relative inline-flex h-2 w-2 rounded-full ${loading ? 'bg-gray-400' : 'bg-green-500'}`} />
                </span>
                {loading ? t('admin.ops.loadingText') : t('admin.ops.ready')}
              </span>
              <span>·</span>
              <span>
                {t('common.refresh')}:{' '}
                {lastUpdated
                  ? lastUpdated.toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).replace(/\//g, '-')
                  : t('common.unknown')}
              </span>
              {autoRefreshEnabled && autoRefreshCountdown !== undefined && (
                <>
                  <span>·</span>
                  <span>剩余 {autoRefreshCountdown}s</span>
                </>
              )}
            </div>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {!fullscreen && (
            <>
              <Select modelValue={platform} options={platformOptions} className="w-full sm:w-[140px]" onUpdateModelValue={handlePlatformChange} />
              <Select modelValue={groupId} options={groupOptions} className="w-full sm:w-[160px]" onUpdateModelValue={handleGroupChange} />
              <div className="mx-1 hidden h-4 w-[1px] bg-gray-200 dark:bg-dark-700 sm:block" />
              <Select modelValue={timeRange} options={timeRangeOptions} className="relative w-full sm:w-[150px]" onUpdateModelValue={handleTimeRangeChange} />
            </>
          )}
          {false && (
            <Select modelValue={queryMode} options={queryModeOptions} className="relative w-full sm:w-[170px]" onUpdateModelValue={(v) => onUpdateQueryMode(String(v || 'auto'))} />
          )}
          {!fullscreen && (
            <button
              type="button"
              className="flex h-8 w-8 items-center justify-center rounded-lg bg-gray-100 text-gray-500 transition-colors hover:bg-gray-200 dark:bg-dark-700 dark:text-gray-400 dark:hover:bg-dark-600"
              disabled={loading}
              title={t('common.refresh')}
              onClick={handleToolbarRefresh}
            >
              <svg className={`h-4 w-4 ${loading || realtimeTrafficLoading ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
          )}
          {!fullscreen && <div className="mx-1 hidden h-4 w-[1px] bg-gray-200 dark:bg-dark-700 sm:block" />}
          {!fullscreen && (
            <>
              <button type="button" className="flex h-8 items-center gap-1.5 rounded-lg bg-blue-100 px-3 text-xs font-bold text-blue-700 transition-colors hover:bg-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:hover:bg-blue-900/50" title={t('admin.ops.alertRules.title')} onClick={onOpenAlertRules}>
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
                <span className="hidden sm:inline">{t('admin.ops.alertRules.manage')}</span>
              </button>
              <button type="button" className="flex h-8 items-center gap-1.5 rounded-lg bg-gray-100 px-3 text-xs font-bold text-gray-700 transition-colors hover:bg-gray-200 dark:bg-dark-700 dark:text-gray-300 dark:hover:bg-dark-600" title={t('admin.ops.settings.title')} onClick={onOpenSettings}>
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                <span className="hidden sm:inline">{t('common.settings')}</span>
              </button>
              <button type="button" className="flex h-8 w-8 items-center justify-center rounded-lg bg-gray-100 text-gray-700 transition-colors hover:bg-gray-200 dark:bg-dark-700 dark:text-gray-300 dark:hover:bg-dark-600" title={t('admin.ops.fullscreen.enter')} onClick={onEnterFullscreen}>
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                </svg>
              </button>
            </>
          )}
        </div>
      </div>

      {overview && (
        <>
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
            <div className={`rounded-2xl bg-gray-50 dark:bg-dark-900 lg:col-span-5 ${fullscreen ? 'p-6' : 'p-4'}`}>
              <div className="grid h-full grid-cols-1 gap-6 md:grid-cols-[200px_1fr] md:items-center">
                <div className="group relative flex cursor-pointer flex-col items-center justify-center rounded-xl py-2 transition-all hover:bg-white/60 dark:hover:bg-dark-800/60 md:border-r md:border-gray-200 md:pr-6 dark:md:border-dark-700">
                  <div className="pointer-events-none absolute left-1/2 top-full z-50 mt-2 w-72 -translate-x-1/2 opacity-0 transition-opacity duration-200 group-hover:pointer-events-auto group-hover:opacity-100 md:left-full md:top-0 md:ml-2 md:mt-0 md:translate-x-0">
                    <div className="rounded-xl bg-white p-4 shadow-xl ring-1 ring-black/5 dark:bg-gray-800 dark:ring-white/10">
                      <h4 className="mb-3 flex items-center gap-2 border-b border-gray-100 pb-2 text-sm font-bold text-gray-900 dark:border-gray-700 dark:text-white">
                        <Icon name="brain" size="sm" className="text-blue-500" />
                        {t('admin.ops.diagnosis.title')}
                      </h4>
                      <div className="space-y-3">
                        {diagnosisReport.map((item, idx) => (
                          <div key={idx} className="flex gap-3">
                            <div className="mt-0.5 shrink-0">
                              {item.type === 'critical' ? (
                                <svg className="h-4 w-4 text-red-500" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" /></svg>
                              ) : item.type === 'warning' ? (
                                <svg className="h-4 w-4 text-yellow-500" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" /></svg>
                              ) : (
                                <svg className="h-4 w-4 text-blue-500" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-3a1 1 0 100 2 1 1 0 000-2zm-1 3a1 1 0 012 0v4a1 1 0 11-2 0v-4z" clipRule="evenodd" /></svg>
                              )}
                            </div>
                            <div className="flex-1">
                              <div className="text-xs font-semibold text-gray-900 dark:text-white">{item.message}</div>
                              <div className="mt-0.5 text-[11px] text-gray-500 dark:text-gray-400">{item.impact}</div>
                              {item.action && (
                                <div className="mt-1 flex items-center gap-1 text-[11px] text-blue-600 dark:text-blue-400">
                                  <Icon name="lightbulb" size="xs" />
                                  {item.action}
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                      <div className="mt-3 border-t border-gray-100 pt-2 text-[10px] text-gray-400 dark:border-gray-700">{t('admin.ops.diagnosis.footer')}</div>
                    </div>
                  </div>
                  <div className="relative flex items-center justify-center">
                    <svg width={circleSize} height={circleSize} className="-rotate-90 transform">
                      <circle cx={circleSize / 2} cy={circleSize / 2} r={radius} strokeWidth={strokeWidth} fill="transparent" className="text-gray-200 dark:text-dark-700" stroke="currentColor" />
                      <circle cx={circleSize / 2} cy={circleSize / 2} r={radius} strokeWidth={strokeWidth} fill="transparent" stroke={healthScoreColor} strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={dashOffset} className="transition-all duration-1000 ease-out" />
                    </svg>
                    <div className="absolute flex flex-col items-center">
                      <span className={`${fullscreen ? 'text-5xl' : 'text-3xl'} font-black ${healthScoreClass}`}>
                        {isSystemIdle ? t('admin.ops.idleStatus') : (overview.health_score ?? '--')}
                      </span>
                      <span className={`${fullscreen ? 'text-xs' : 'text-[10px]'} font-bold uppercase tracking-wider text-gray-400`}>{t('admin.ops.health')}</span>
                    </div>
                  </div>
                  {!fullscreen && (
                    <div className="mt-4 text-center">
                      <div className="flex items-center justify-center gap-1 text-xs font-medium text-gray-500">
                        {t('admin.ops.healthCondition')}
                        <HelpTooltip content={t('admin.ops.healthHelp')} />
                      </div>
                      <div className={`mt-1 text-xs font-bold ${healthScoreClass}`}>
                        {isSystemIdle ? t('admin.ops.idleStatus') : typeof overview.health_score === 'number' && overview.health_score >= 90 ? t('admin.ops.healthyStatus') : t('admin.ops.riskyStatus')}
                      </div>
                    </div>
                  )}
                </div>
                <div className="flex h-full flex-col justify-center py-2">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <div className="relative flex h-3 w-3 shrink-0">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-75" />
                        <span className="relative inline-flex h-3 w-3 rounded-full bg-blue-500" />
                      </div>
                      <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400">{t('admin.ops.realtime.title')}</h3>
                      {!fullscreen && <HelpTooltip content={t('admin.ops.tooltips.qps')} />}
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {availableRealtimeWindows.map((window) => (
                        <button
                          key={window}
                          type="button"
                          className={`rounded px-1.5 py-0.5 text-[9px] font-bold transition-colors sm:px-2 sm:text-[10px] ${realtimeWindow === window ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-600 hover:bg-gray-300 dark:bg-dark-700 dark:text-gray-400 dark:hover:bg-dark-600'}`}
                          onClick={() => setRealtimeWindow(window)}
                        >
                          {window}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className={fullscreen ? 'space-y-4' : 'space-y-3'}>
                    <div>
                      <div className={`${fullscreen ? 'text-xs' : 'text-[10px]'} font-bold uppercase text-gray-400`}>{t('admin.ops.current')}</div>
                      <div className="mt-1 flex flex-wrap items-baseline gap-x-4 gap-y-2">
                        <div className="flex items-baseline gap-1.5">
                          <span className={`${fullscreen ? 'text-4xl' : 'text-xl sm:text-2xl'} font-black text-gray-900 dark:text-white`}>{displayRealTimeQps.toFixed(1)}</span>
                          <span className={`${fullscreen ? 'text-sm' : 'text-xs'} font-bold text-gray-500`}>QPS</span>
                        </div>
                        <div className="flex items-baseline gap-1.5">
                          <span className={`${fullscreen ? 'text-4xl' : 'text-xl sm:text-2xl'} font-black text-gray-900 dark:text-white`}>{displayRealTimeTps.toFixed(1)}</span>
                          <span className={`${fullscreen ? 'text-sm' : 'text-xs'} font-bold text-gray-500`}>{t('admin.ops.tps')}</span>
                        </div>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <div className={`${fullscreen ? 'text-xs' : 'text-[10px]'} font-bold uppercase text-gray-400`}>{t('admin.ops.peak')}</div>
                        <div className={`${fullscreen ? 'text-base' : 'text-sm'} mt-1 space-y-0.5 font-medium text-gray-600 dark:text-gray-400`}>
                          <div className="flex items-baseline gap-1.5"><span className="font-black text-gray-900 dark:text-white">{fmtRate(realtimeTrafficSummary?.qps?.peak)}</span><span className="text-xs">QPS</span></div>
                          <div className="flex items-baseline gap-1.5"><span className="font-black text-gray-900 dark:text-white">{fmtRate(realtimeTrafficSummary?.tps?.peak)}</span><span className="text-xs">{t('admin.ops.tps')}</span></div>
                        </div>
                      </div>
                      <div>
                        <div className={`${fullscreen ? 'text-xs' : 'text-[10px]'} font-bold uppercase text-gray-400`}>{t('admin.ops.average')}</div>
                        <div className={`${fullscreen ? 'text-base' : 'text-sm'} mt-1 space-y-0.5 font-medium text-gray-600 dark:text-gray-400`}>
                          <div className="flex items-baseline gap-1.5"><span className="font-black text-gray-900 dark:text-white">{fmtRate(realtimeTrafficSummary?.qps?.avg)}</span><span className="text-xs">QPS</span></div>
                          <div className="flex items-baseline gap-1.5"><span className="font-black text-gray-900 dark:text-white">{fmtRate(realtimeTrafficSummary?.tps?.avg)}</span><span className="text-xs">{t('admin.ops.tps')}</span></div>
                        </div>
                      </div>
                    </div>
                    <div className="h-8 w-full overflow-hidden opacity-50">
                      <svg className="h-full w-full" viewBox="0 0 280 32" preserveAspectRatio="none">
                        <path d="M0 16 Q 20 16, 40 16 T 80 16 T 120 10 T 160 22 T 200 16 T 240 16 T 280 16" fill="none" stroke="#3b82f6" strokeWidth="2" vectorEffect="non-scaling-stroke">
                          <animate attributeName="d" dur="2s" repeatCount="indefinite" values="M0 16 Q 20 16, 40 16 T 80 16 T 120 10 T 160 22 T 200 16 T 240 16 T 280 16;M0 16 Q 20 16, 40 16 T 80 16 T 120 16 T 160 16 T 200 10 T 240 22 T 280 16;M0 16 Q 20 16, 40 16 T 80 16 T 120 16 T 160 16 T 200 16 T 240 16 T 280 16" keyTimes="0;0.5;1" />
                        </path>
                      </svg>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid h-full grid-cols-1 content-center gap-4 sm:grid-cols-2 lg:col-span-7 lg:grid-cols-3">
              {/* Requests */}
              <div className="rounded-2xl bg-gray-50 p-4 dark:bg-dark-900" style={{ order: 1 }}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] font-bold uppercase text-gray-400">{t('admin.ops.requestsTitle')}</span>
                    {!fullscreen && <HelpTooltip content={t('admin.ops.tooltips.totalRequests')} />}
                  </div>
                  {!fullscreen && (
                    <button type="button" className="text-[10px] font-bold text-blue-500 hover:underline" onClick={() => onOpenRequestDetails({ title: t('admin.ops.requestDetails.title') })}>
                      {t('admin.ops.requestDetails.details')}
                    </button>
                  )}
                </div>
                <div className="mt-2 space-y-2 text-xs">
                  <div className="flex justify-between"><span className="text-gray-500">{t('admin.ops.requests')}:</span><span className="font-bold text-gray-900 dark:text-white">{totalRequestsLabel}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">{t('admin.ops.tokens')}:</span><span className="font-bold text-gray-900 dark:text-white">{totalTokensLabel}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">{t('admin.ops.avgQps')}:</span><span className="font-bold text-gray-900 dark:text-white">{qpsAvgLabel}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">{t('admin.ops.avgTps')}:</span><span className="font-bold text-gray-900 dark:text-white">{tpsAvgLabel}</span></div>
                </div>
              </div>

              {/* SLA */}
              <div className="rounded-2xl bg-gray-50 p-4 dark:bg-dark-900" style={{ order: 2 }}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold uppercase text-gray-400">{t('admin.ops.sla')}</span>
                    {!fullscreen && <HelpTooltip content={t('admin.ops.tooltips.sla')} />}
                    <span className={`h-1.5 w-1.5 rounded-full ${getSLAThresholdLevel(slaPercent, thresholds) === 'critical' ? 'bg-red-500' : getSLAThresholdLevel(slaPercent, thresholds) === 'warning' ? 'bg-yellow-500' : 'bg-green-500'}`} />
                  </div>
                  {!fullscreen && (
                    <button type="button" className="text-[10px] font-bold text-blue-500 hover:underline" onClick={() => onOpenRequestDetails({ title: t('admin.ops.requestDetails.title'), kind: 'error' })}>
                      {t('admin.ops.requestDetails.details')}
                    </button>
                  )}
                </div>
                <div className={`mt-2 text-3xl font-black ${getThresholdColorClass(getSLAThresholdLevel(slaPercent, thresholds))}`}>
                  {slaPercent == null ? '-' : `${slaPercent.toFixed(3)}%`}
                </div>
                <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-dark-700">
                  <div className={`h-full transition-all ${getSLAThresholdLevel(slaPercent, thresholds) === 'critical' ? 'bg-red-500' : getSLAThresholdLevel(slaPercent, thresholds) === 'warning' ? 'bg-yellow-500' : 'bg-green-500'}`} style={{ width: `${Math.max((slaPercent ?? 0) - 90, 0) * 10}%` }} />
                </div>
                <div className="mt-3 text-xs">
                  <div className="flex justify-between">
                    <span className="text-gray-500">{t('admin.ops.exceptions')}:</span>
                    <span className="font-bold text-red-600 dark:text-red-400">{formatNumber((overview.request_count_sla ?? 0) - (overview.success_count ?? 0))}</span>
                  </div>
                </div>
              </div>

              {/* Request Errors */}
              <div className="rounded-2xl bg-gray-50 p-4 dark:bg-dark-900" style={{ order: 3 }}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] font-bold uppercase text-gray-400">{t('admin.ops.requestErrors')}</span>
                    {!fullscreen && <HelpTooltip content={t('admin.ops.tooltips.errors')} />}
                  </div>
                  {!fullscreen && (
                    <button type="button" className="text-[10px] font-bold text-blue-500 hover:underline" onClick={() => onOpenErrorDetails('request')}>
                      {t('admin.ops.requestDetails.details')}
                    </button>
                  )}
                </div>
                <div className={`mt-2 text-3xl font-black ${getThresholdColorClass(getRequestErrorRateThresholdLevel(errorRatePercent, thresholds))}`}>
                  {errorRatePercent == null ? '-' : `${errorRatePercent.toFixed(2)}%`}
                </div>
                <div className="mt-3 space-y-1 text-xs">
                  <div className="flex justify-between"><span className="text-gray-500">{t('admin.ops.errorCount')}:</span><span className="font-bold text-gray-900 dark:text-white">{formatNumber(overview.error_count_sla ?? 0)}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">{t('admin.ops.businessLimited')}:</span><span className="font-bold text-gray-900 dark:text-white">{formatNumber(overview.business_limited_count ?? 0)}</span></div>
                </div>
              </div>

              {/* Duration */}
              <div className="rounded-2xl bg-gray-50 p-4 dark:bg-dark-900" style={{ order: 4 }}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] font-bold uppercase text-gray-400">{t('admin.ops.latencyDuration')}</span>
                    {!fullscreen && <HelpTooltip content={t('admin.ops.tooltips.latency')} />}
                  </div>
                  {!fullscreen && (
                    <button type="button" className="text-[10px] font-bold text-blue-500 hover:underline" onClick={() => onOpenRequestDetails({ title: t('admin.ops.latencyDuration'), sort: 'duration_desc' })}>
                      {t('admin.ops.requestDetails.details')}
                    </button>
                  )}
                </div>
                <div className="mt-2 flex items-baseline gap-2">
                  <div className="text-3xl font-black text-gray-900 dark:text-white">{durationP99Ms ?? '-'}</div>
                  <span className="text-xs font-bold text-gray-400">ms (P99)</span>
                </div>
                <div className="mt-3 grid grid-cols-1 gap-x-3 gap-y-1 text-xs 2xl:grid-cols-2">
                  {([['P95', durationP95Ms], ['P90', durationP90Ms], ['P50', durationP50Ms], ['Avg', durationAvgMs], ['Max', durationMaxMs]] as const).map(([label, val]) => (
                    <div key={label} className="flex items-baseline gap-1 whitespace-nowrap">
                      <span className="text-gray-500">{label}:</span>
                      <span className="font-bold text-gray-900 dark:text-white">{val ?? '-'}</span>
                      <span className="text-gray-400">ms</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* TTFT */}
              <div className="rounded-2xl bg-gray-50 p-4 dark:bg-dark-900" style={{ order: 5 }}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] font-bold uppercase text-gray-400">TTFT</span>
                    {!fullscreen && <HelpTooltip content={t('admin.ops.tooltips.ttft')} />}
                  </div>
                  {!fullscreen && (
                    <button type="button" className="text-[10px] font-bold text-blue-500 hover:underline" onClick={() => onOpenRequestDetails({ title: t('admin.ops.ttftLabel'), sort: 'duration_desc' })}>
                      {t('admin.ops.requestDetails.details')}
                    </button>
                  )}
                </div>
                <div className="mt-2 flex items-baseline gap-2">
                  <div className={`text-3xl font-black ${getThresholdColorClass(getTTFTThresholdLevel(ttftP99Ms, thresholds))}`}>{ttftP99Ms ?? '-'}</div>
                  <span className="text-xs font-bold text-gray-400">ms (P99)</span>
                </div>
                <div className="mt-3 grid grid-cols-1 gap-x-3 gap-y-1 text-xs 2xl:grid-cols-2">
                  {([['P95', ttftP95Ms], ['P90', ttftP90Ms], ['P50', ttftP50Ms], ['Avg', ttftAvgMs], ['Max', ttftMaxMs]] as const).map(([label, val]) => (
                    <div key={label} className="flex items-baseline gap-1 whitespace-nowrap">
                      <span className="text-gray-500">{label}:</span>
                      <span className={`font-bold ${getThresholdColorClass(getTTFTThresholdLevel(val, thresholds))}`}>{val ?? '-'}</span>
                      <span className="text-gray-400">ms</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Upstream Errors */}
              <div className="rounded-2xl bg-gray-50 p-4 dark:bg-dark-900" style={{ order: 6 }}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] font-bold uppercase text-gray-400">{t('admin.ops.upstreamErrors')}</span>
                    {!fullscreen && <HelpTooltip content={t('admin.ops.tooltips.upstreamErrors')} />}
                  </div>
                  {!fullscreen && (
                    <button type="button" className="text-[10px] font-bold text-blue-500 hover:underline" onClick={() => onOpenErrorDetails('upstream')}>
                      {t('admin.ops.requestDetails.details')}
                    </button>
                  )}
                </div>
                <div className={`mt-2 text-3xl font-black ${getThresholdColorClass(getUpstreamErrorRateThresholdLevel(upstreamErrorRatePercent, thresholds))}`}>
                  {upstreamErrorRatePercent == null ? '-' : `${upstreamErrorRatePercent.toFixed(2)}%`}
                </div>
                <div className="mt-3 space-y-1 text-xs">
                  <div className="flex justify-between"><span className="text-gray-500">{t('admin.ops.errorCountExcl429529')}:</span><span className="font-bold text-gray-900 dark:text-white">{formatNumber(overview.upstream_error_count_excl_429_529 ?? 0)}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">429/529:</span><span className="font-bold text-gray-900 dark:text-white">{formatNumber((overview.upstream_429_count ?? 0) + (overview.upstream_529_count ?? 0))}</span></div>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-2 border-t border-gray-100 pt-4 dark:border-dark-700">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              <div className="rounded-xl bg-gray-50 p-3 dark:bg-dark-900">
                <div className="flex items-center gap-1">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400">CPU</div>
                  {!fullscreen && <HelpTooltip content={t('admin.ops.tooltips.cpu')} />}
                </div>
                <div className={`mt-1 text-lg font-black ${pctClass(cpuPercentValue, 80, 95)}`}>{cpuPercentValue == null ? '-' : `${cpuPercentValue.toFixed(1)}%`}</div>
                {!fullscreen && <div className="mt-1 text-[10px] text-gray-500 dark:text-gray-400">{t('common.warning')} 80% · {t('common.critical')} 95%</div>}
              </div>
              <div className="rounded-xl bg-gray-50 p-3 dark:bg-dark-900">
                <div className="flex items-center gap-1">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400">{t('admin.ops.memory')}</div>
                  {!fullscreen && <HelpTooltip content={t('admin.ops.tooltips.memory')} />}
                </div>
                <div className={`mt-1 text-lg font-black ${pctClass(memPercentValue, 85, 95)}`}>{memPercentValue == null ? '-' : `${memPercentValue.toFixed(1)}%`}</div>
                {!fullscreen && (
                  <div className="mt-1 text-[10px] text-gray-500 dark:text-gray-400">
                    {systemMetrics?.memory_used_mb == null || systemMetrics?.memory_total_mb == null ? '-' : `${formatNumber(systemMetrics.memory_used_mb)} / ${formatNumber(systemMetrics.memory_total_mb)} MB`}
                  </div>
                )}
              </div>
              <div className="rounded-xl bg-gray-50 p-3 dark:bg-dark-900">
                <div className="flex items-center gap-1">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400">{t('admin.ops.db')}</div>
                  {!fullscreen && <HelpTooltip content={t('admin.ops.tooltips.db')} />}
                </div>
                <div className={`mt-1 text-lg font-black ${systemMetrics?.db_ok === false ? 'text-rose-600 dark:text-rose-400' : dbUsagePercent != null ? pctClass(dbUsagePercent, 70, 90) : systemMetrics?.db_ok === true ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-900 dark:text-white'}`}>{dbMiddleLabel}</div>
                {!fullscreen && (
                  <div className="mt-1 text-[10px] text-gray-500 dark:text-gray-400">
                    {t('admin.ops.conns')} {dbConnOpenValue ?? '-'} / {dbMaxOpenConnsValue ?? '-'} · {t('admin.ops.active')} {dbConnActiveValue ?? '-'} · {t('admin.ops.idle')} {dbConnIdleValue ?? '-'}
                    {dbConnWaitingValue != null && <> · {t('admin.ops.waiting')} {dbConnWaitingValue}</>}
                  </div>
                )}
              </div>
              <div className="rounded-xl bg-gray-50 p-3 dark:bg-dark-900">
                <div className="flex items-center gap-1">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Redis</div>
                  {!fullscreen && <HelpTooltip content={t('admin.ops.tooltips.redis')} />}
                </div>
                <div className={`mt-1 text-lg font-black ${systemMetrics?.redis_ok === false ? 'text-rose-600 dark:text-rose-400' : redisUsagePercent != null ? pctClass(redisUsagePercent, 70, 90) : systemMetrics?.redis_ok === true ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-900 dark:text-white'}`}>{redisMiddleLabel}</div>
                {!fullscreen && (
                  <div className="mt-1 text-[10px] text-gray-500 dark:text-gray-400">
                    {t('admin.ops.conns')} {redisConnTotalValue ?? '-'} / {redisPoolSizeValue ?? '-'}
                    {redisConnActiveValue != null && <> · {t('admin.ops.active')} {redisConnActiveValue}</>}
                    {redisConnIdleValue != null && <> · {t('admin.ops.idle')} {redisConnIdleValue}</>}
                  </div>
                )}
              </div>
              <div className="rounded-xl bg-gray-50 p-3 dark:bg-dark-900">
                <div className="flex items-center gap-1">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400">{t('admin.ops.goroutines')}</div>
                  {!fullscreen && <HelpTooltip content={t('admin.ops.tooltips.goroutines')} />}
                </div>
                <div className={`mt-1 text-lg font-black ${goroutineStatus === 'ok' ? 'text-emerald-600 dark:text-emerald-400' : goroutineStatus === 'warning' ? 'text-yellow-600 dark:text-yellow-400' : goroutineStatus === 'critical' ? 'text-rose-600 dark:text-rose-400' : 'text-gray-900 dark:text-white'}`}>
                  {goroutineStatus === 'ok' ? t('admin.ops.ok') : goroutineStatus === 'warning' ? t('common.warning') : goroutineStatus === 'critical' ? t('common.critical') : t('admin.ops.noData')}
                </div>
                {!fullscreen && (
                  <div className="mt-1 text-[10px] text-gray-500 dark:text-gray-400">
                    {t('admin.ops.current')} <span className="font-mono">{goroutineCountValue ?? '-'}</span> · {t('common.warning')} <span className="font-mono">{goroutinesWarnThreshold}</span> · {t('common.critical')} <span className="font-mono">{goroutinesCriticalThreshold}</span>
                    {systemMetrics?.concurrency_queue_depth != null && <> · {t('admin.ops.queue')} <span className="font-mono">{systemMetrics.concurrency_queue_depth}</span></>}
                  </div>
                )}
              </div>
              <div className="rounded-xl bg-gray-50 p-3 dark:bg-dark-900">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400">{t('admin.ops.jobs')}</div>
                    {!fullscreen && <HelpTooltip content={t('admin.ops.tooltips.jobs')} />}
                  </div>
                  {!fullscreen && (
                    <button type="button" className="text-[10px] font-bold text-blue-500 hover:underline" onClick={() => setShowJobsDetails(true)}>
                      {t('admin.ops.requestDetails.details')}
                    </button>
                  )}
                </div>
                <div className={`mt-1 text-lg font-black ${jobsStatus === 'ok' ? 'text-emerald-600 dark:text-emerald-400' : jobsStatus === 'warn' ? 'text-yellow-600 dark:text-yellow-400' : 'text-gray-900 dark:text-white'}`}>
                  {jobsStatus === 'ok' ? t('admin.ops.ok') : jobsStatus === 'warn' ? t('common.warning') : t('admin.ops.noData')}
                </div>
                {!fullscreen && (
                  <div className="mt-1 text-[10px] text-gray-500 dark:text-gray-400">
                    {t('common.total')} <span className="font-mono">{jobHeartbeats.length}</span> · {t('common.warning')} <span className="font-mono">{jobsWarnCount}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </>
      )}

      <BaseDialog show={showJobsDetails} title={t('admin.ops.jobs')} width="wide" onClose={() => setShowJobsDetails(false)}>
        {!jobHeartbeats.length ? (
          <div className="text-sm text-gray-500 dark:text-gray-400">{t('admin.ops.noData')}</div>
        ) : (
          <div className="space-y-3">
            {jobHeartbeats.map((hb) => (
              <div key={hb.job_name} className="rounded-xl border border-gray-100 bg-white p-4 dark:border-dark-700 dark:bg-dark-900">
                <div className="flex items-center justify-between gap-3">
                  <div className="truncate text-sm font-semibold text-gray-900 dark:text-white">{hb.job_name}</div>
                  <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
                    {hb.last_duration_ms != null && <span className="font-mono">{hb.last_duration_ms}ms</span>}
                    <span>{formatTimeShort(hb.updated_at)}</span>
                  </div>
                </div>
                <div className="mt-2 grid grid-cols-1 gap-2 text-xs text-gray-600 dark:text-gray-300 sm:grid-cols-2">
                  <div>{t('admin.ops.lastSuccess')} <span className="font-mono">{formatTimeShort(hb.last_success_at)}</span></div>
                  <div>{t('admin.ops.lastError')} <span className="font-mono">{formatTimeShort(hb.last_error_at)}</span></div>
                  <div>{t('admin.ops.result')} <span className="font-mono">{hb.last_result || '-'}</span></div>
                </div>
                {hb.last_error && (
                  <div className="mt-3 rounded-lg bg-rose-50 p-2 text-xs text-rose-700 dark:bg-rose-900/20 dark:text-rose-300">{hb.last_error}</div>
                )}
              </div>
            ))}
          </div>
        )}
      </BaseDialog>

      <BaseDialog show={showCustomTimeRangeDialog} title={t('admin.ops.timeRange.custom')} width="narrow" onClose={() => setShowCustomTimeRangeDialog(false)}>
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">{t('admin.ops.customTimeRange.startTime')}</label>
            <input type="datetime-local" className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-dark-600 dark:bg-dark-800 dark:text-white" value={customStartTimeInput} onChange={(e) => setCustomStartTimeInput(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">{t('admin.ops.customTimeRange.endTime')}</label>
            <input type="datetime-local" className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-dark-600 dark:bg-dark-800 dark:text-white" value={customEndTimeInput} onChange={(e) => setCustomEndTimeInput(e.target.value)} />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" className="rounded-lg bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200 dark:bg-dark-700 dark:text-gray-300 dark:hover:bg-dark-600" onClick={() => setShowCustomTimeRangeDialog(false)}>
              {t('common.cancel')}
            </button>
            <button type="button" className="rounded-lg bg-blue-500 px-4 py-2 text-sm font-medium text-white hover:bg-blue-600" onClick={handleCustomTimeRangeConfirm}>
              {t('common.confirm')}
            </button>
          </div>
        </div>
      </BaseDialog>
    </div>
  )
}
