'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { saveAs } from 'file-saver'
import AppLayout from '@/components/layout/AppLayout'
import DateRangePicker from '@/components/common/DateRangePicker'
import Select from '@/components/common/Select'
import Pagination from '@/components/common/Pagination'
import Icon from '@/components/icons/Icon'
import UsageStatsCards from '@/components/admin/usage/UsageStatsCards'
import UsageFilters from '@/components/admin/usage/UsageFilters'
import UsageTable from '@/components/admin/usage/UsageTable'
import UsageExportProgress from '@/components/admin/usage/UsageExportProgress'
import UsageCleanupDialog from '@/components/admin/usage/UsageCleanupDialog'
import UserBalanceHistoryModal from '@/components/admin/user/UserBalanceHistoryModal'
import OpsErrorLogTable from '@/components/admin/ops/OpsErrorLogTable'
import OpsErrorDetailModal from '@/components/admin/ops/OpsErrorDetailModal'
import ModelDistributionChart from '@/components/charts/ModelDistributionChart'
import GroupDistributionChart from '@/components/charts/GroupDistributionChart'
import TokenUsageTrend from '@/components/charts/TokenUsageTrend'
import EndpointDistributionChart from '@/components/charts/EndpointDistributionChart'
import { useI18n } from '@/lib/i18n'
import { useApp } from '@/context/AppContext'
import { adminUsageAPI, type AdminUsageQueryParams, type AdminUsageStatsResponse } from '@/lib/adminUsage'
import { getSnapshotV2, getModelStats } from '@/lib/adminDashboard'
import type { ModelStat } from '@/lib/adminDashboard'
import { adminOpsAPI, type OpsErrorLog } from '@/lib/adminOps'
import { adminUsersAPI } from '@/lib/adminUsers'
import { getPersistedPageSize } from '@/lib/usePersistedPageSize'
import { formatReasoningEffort } from '@/lib/format'
import { requestTypeToLegacyStream, resolveUsageRequestType } from '@/lib/usageRequestType'
import type { AdminUsageLog, AdminUser, EndpointStat, GroupStat } from '@/lib/types'
import type { TrendDataPoint } from '@/lib/usage'
import type { Column } from '@/components/common/types'

type DistributionMetric = 'tokens' | 'actual_cost'
type EndpointSource = 'inbound' | 'upstream' | 'path'
type ModelDistributionSource = 'requested' | 'upstream' | 'mapping'

const HIDDEN_COLUMNS_KEY = 'usage-hidden-columns'
const ALWAYS_VISIBLE = ['user', 'created_at']
const DEFAULT_HIDDEN_COLUMNS = ['reasoning_effort', 'user_agent']

function formatLocalDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function getLast24HoursRangeDates(): { start: string; end: string } {
  const end = new Date()
  const start = new Date(end.getTime() - 24 * 60 * 60 * 1000)
  return { start: formatLocalDate(start), end: formatLocalDate(end) }
}

function getGranularityForRange(start: string, end: string): 'day' | 'hour' {
  const startTime = new Date(`${start}T00:00:00`).getTime()
  const endTime = new Date(`${end}T00:00:00`).getTime()
  const daysDiff = Math.ceil((endTime - startTime) / (1000 * 60 * 60 * 24))
  return daysDiff <= 1 ? 'hour' : 'day'
}

function getSingleQueryValue(value: string | null): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

function getNumericQueryValue(value: string | null): number | undefined {
  if (!value) return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

function toRFC3339(d: string | undefined, endOfDay = false): string | undefined {
  return d ? new Date(d + (endOfDay ? 'T23:59:59.999' : 'T00:00:00')).toISOString() : undefined
}

export default function AdminUsagePage() {
  const { t } = useI18n()
  const appStore = useApp()
  const searchParams = useSearchParams()

  const defaultRange = getLast24HoursRangeDates()

  const [usageStats, setUsageStats] = useState<AdminUsageStatsResponse | null>(null)
  const [usageLogs, setUsageLogs] = useState<AdminUsageLog[]>([])
  const [loading, setLoading] = useState(false)
  const [exporting, setExporting] = useState(false)

  const [trendData, setTrendData] = useState<TrendDataPoint[]>([])
  const [requestedModelStats, setRequestedModelStats] = useState<ModelStat[]>([])
  const [upstreamModelStats, setUpstreamModelStats] = useState<ModelStat[]>([])
  const [mappingModelStats, setMappingModelStats] = useState<ModelStat[]>([])
  const [groupStats, setGroupStats] = useState<GroupStat[]>([])
  const [chartsLoading, setChartsLoading] = useState(false)
  const [modelStatsLoading, setModelStatsLoading] = useState(false)

  const [granularity, setGranularity] = useState<'day' | 'hour'>(() =>
    getGranularityForRange(defaultRange.start, defaultRange.end),
  )
  const [modelDistributionMetric, setModelDistributionMetric] = useState<DistributionMetric>('tokens')
  const [modelDistributionSource, setModelDistributionSource] = useState<ModelDistributionSource>('requested')
  const loadedModelSourcesRef = useRef<Record<ModelDistributionSource, boolean>>({
    requested: false,
    upstream: false,
    mapping: false,
  })

  const [groupDistributionMetric, setGroupDistributionMetric] = useState<DistributionMetric>('tokens')
  const [endpointDistributionMetric, setEndpointDistributionMetric] = useState<DistributionMetric>('tokens')
  const [endpointDistributionSource, setEndpointDistributionSource] = useState<EndpointSource>('inbound')
  const [inboundEndpointStats, setInboundEndpointStats] = useState<EndpointStat[]>([])
  const [upstreamEndpointStats, setUpstreamEndpointStats] = useState<EndpointStat[]>([])
  const [endpointPathStats, setEndpointPathStats] = useState<EndpointStat[]>([])
  const [endpointStatsLoading, setEndpointStatsLoading] = useState(false)

  const abortControllerRef = useRef<AbortController | null>(null)
  const exportAbortControllerRef = useRef<AbortController | null>(null)
  const chartReqSeqRef = useRef(0)
  const statsReqSeqRef = useRef(0)
  const modelStatsReqSeqRef = useRef(0)

  const [exportProgress, setExportProgress] = useState({
    show: false,
    progress: 0,
    current: 0,
    total: 0,
    estimatedTime: '',
  })

  const [cleanupDialogVisible, setCleanupDialogVisible] = useState(false)
  const [showBalanceHistoryModal, setShowBalanceHistoryModal] = useState(false)
  const [balanceHistoryUser, setBalanceHistoryUser] = useState<AdminUser | null>(null)

  const [startDate, setStartDate] = useState(defaultRange.start)
  const [endDate, setEndDate] = useState(defaultRange.end)
  const [filters, setFilters] = useState<AdminUsageQueryParams>({
    start_date: defaultRange.start,
    end_date: defaultRange.end,
  })

  const [pagination, setPagination] = useState({
    page: 1,
    page_size: getPersistedPageSize(),
    total: 0,
  })
  const [sortState, setSortState] = useState({
    sort_by: 'created_at',
    sort_order: 'desc' as 'asc' | 'desc',
  })

  const [hiddenColumns, setHiddenColumns] = useState<Set<string>>(() => new Set(DEFAULT_HIDDEN_COLUMNS))
  const [showColumnDropdown, setShowColumnDropdown] = useState(false)
  const columnDropdownRef = useRef<HTMLDivElement | null>(null)

  const [activeTab, setActiveTab] = useState<'usage' | 'errors'>('usage')
  const [errRows, setErrRows] = useState<OpsErrorLog[]>([])
  const [errLoading, setErrLoading] = useState(false)
  const [errPage, setErrPage] = useState(1)
  const [errPageSize, setErrPageSize] = useState(20)
  const [errTotal, setErrTotal] = useState(0)
  const [showErrorModal, setShowErrorModal] = useState(false)
  const [selectedErrorId, setSelectedErrorId] = useState<number | null>(null)

  const [initialized, setInitialized] = useState(false)

  const breakdownFilters = useMemo(() => {
    const f: Record<string, unknown> = {}
    if (filters.user_id) f.user_id = filters.user_id
    if (filters.api_key_id) f.api_key_id = filters.api_key_id
    if (filters.account_id) f.account_id = filters.account_id
    if (filters.group_id) f.group_id = filters.group_id
    if (filters.request_type != null) f.request_type = filters.request_type
    if (filters.billing_type != null) f.billing_type = filters.billing_type
    return f
  }, [filters])

  const modelNameOptions = useMemo(
    () => Array.from(new Set(requestedModelStats.map((m) => m.model).filter(Boolean))).sort(),
    [requestedModelStats],
  )

  const granularityOptions = useMemo(
    () => [
      { value: 'day', label: t('admin.dashboard.day') },
      { value: 'hour', label: t('admin.dashboard.hour') },
    ],
    [t],
  )

  const allColumns = useMemo<Column[]>(
    () => [
      { key: 'user', label: t('admin.usage.user'), sortable: false },
      { key: 'api_key', label: t('usage.apiKeyFilter'), sortable: false },
      { key: 'account', label: t('admin.usage.account'), sortable: false },
      { key: 'model', label: t('usage.model'), sortable: true },
      { key: 'reasoning_effort', label: t('usage.reasoningEffort'), sortable: false },
      { key: 'endpoint', label: t('usage.endpoint'), sortable: false },
      { key: 'group', label: t('admin.usage.group'), sortable: false },
      { key: 'stream', label: t('usage.type'), sortable: false },
      { key: 'billing_mode', label: t('admin.usage.billingMode'), sortable: false },
      { key: 'tokens', label: t('usage.tokens'), sortable: false },
      { key: 'cost', label: t('usage.cost'), sortable: false },
      { key: 'first_token', label: t('usage.firstToken'), sortable: false },
      { key: 'duration', label: t('usage.duration'), sortable: false },
      { key: 'created_at', label: t('usage.time'), sortable: true },
      { key: 'user_agent', label: t('usage.userAgent'), sortable: false },
      { key: 'ip_address', label: t('admin.usage.ipAddress'), sortable: false },
    ],
    [t],
  )

  const toggleableColumns = useMemo(
    () => allColumns.filter((col) => !ALWAYS_VISIBLE.includes(col.key)),
    [allColumns],
  )

  const visibleColumns = useMemo(
    () => allColumns.filter((col) => ALWAYS_VISIBLE.includes(col.key) || !hiddenColumns.has(col.key)),
    [allColumns, hiddenColumns],
  )

  const buildUsageListParams = useCallback(
    (page: number, pageSize: number, exactTotal: boolean): AdminUsageQueryParams => {
      const requestType = filters.request_type
      const legacyStream = requestType ? requestTypeToLegacyStream(requestType) : filters.stream
      return {
        page,
        page_size: pageSize,
        exact_total: exactTotal,
        ...filters,
        stream: legacyStream === null ? undefined : legacyStream,
        sort_by: sortState.sort_by,
        sort_order: sortState.sort_order,
      }
    },
    [filters, sortState],
  )

  const invalidateModelStatsCache = useCallback(() => {
    loadedModelSourcesRef.current = { requested: false, upstream: false, mapping: false }
  }, [])

  const loadLogs = useCallback(async () => {
    abortControllerRef.current?.abort()
    const controller = new AbortController()
    abortControllerRef.current = controller
    setLoading(true)
    try {
      const res = await adminUsageAPI.list(
        buildUsageListParams(pagination.page, pagination.page_size, false),
        { signal: controller.signal },
      )
      if (!controller.signal.aborted) {
        setUsageLogs(res.items)
        setPagination((prev) => ({ ...prev, total: res.total }))
      }
    } catch (error: unknown) {
      if ((error as Error)?.name !== 'AbortError') {
        console.error('Failed to load usage logs:', error)
      }
    } finally {
      if (abortControllerRef.current === controller) setLoading(false)
    }
  }, [buildUsageListParams, pagination.page, pagination.page_size])

  const loadStats = useCallback(
    async (force = false) => {
      const seq = ++statsReqSeqRef.current
      setEndpointStatsLoading(true)
      try {
        const requestType = filters.request_type
        const legacyStream = requestType ? requestTypeToLegacyStream(requestType) : filters.stream
        const stats = await adminUsageAPI.getStats({
          user_id: filters.user_id,
          api_key_id: filters.api_key_id,
          account_id: filters.account_id,
          group_id: filters.group_id,
          model: filters.model ?? undefined,
          request_type: filters.request_type ?? undefined,
          billing_type: filters.billing_type,
          billing_mode: filters.billing_mode ?? undefined,
          start_date: filters.start_date,
          end_date: filters.end_date,
          stream: legacyStream === null ? undefined : legacyStream,
          ...(force ? { nocache: 1 } : {}),
        })
        if (seq !== statsReqSeqRef.current) return
        setUsageStats(stats)
        setInboundEndpointStats(stats.endpoints || [])
        setUpstreamEndpointStats(stats.upstream_endpoints || [])
        setEndpointPathStats(stats.endpoint_paths || [])
      } catch (error) {
        if (seq !== statsReqSeqRef.current) return
        console.error('Failed to load usage stats:', error)
        setInboundEndpointStats([])
        setUpstreamEndpointStats([])
        setEndpointPathStats([])
      } finally {
        if (seq === statsReqSeqRef.current) setEndpointStatsLoading(false)
      }
    },
    [filters],
  )

  const loadModelStats = useCallback(
    async (source: ModelDistributionSource, force = false) => {
      if (!force && loadedModelSourcesRef.current[source]) return

      const seq = ++modelStatsReqSeqRef.current
      setModelStatsLoading(true)
      try {
        const requestType = filters.request_type
        const legacyStream = requestType ? requestTypeToLegacyStream(requestType) : filters.stream
        const baseParams = {
          start_date: filters.start_date || startDate,
          end_date: filters.end_date || endDate,
          user_id: filters.user_id,
          model: filters.model ?? undefined,
          api_key_id: filters.api_key_id,
          account_id: filters.account_id,
          group_id: filters.group_id,
          request_type: requestType ?? undefined,
          stream: legacyStream === null ? undefined : legacyStream,
          billing_type: filters.billing_type,
        }

        const response = await getModelStats({ ...baseParams, model_source: source })
        if (seq !== modelStatsReqSeqRef.current) return

        const models = response.models || []
        if (source === 'requested') setRequestedModelStats(models)
        else if (source === 'upstream') setUpstreamModelStats(models)
        else setMappingModelStats(models)
        loadedModelSourcesRef.current[source] = true
      } catch (error) {
        if (seq !== modelStatsReqSeqRef.current) return
        console.error('Failed to load model stats:', error)
        if (source === 'requested') setRequestedModelStats([])
        else if (source === 'upstream') setUpstreamModelStats([])
        else setMappingModelStats([])
        loadedModelSourcesRef.current[source] = false
      } finally {
        if (seq === modelStatsReqSeqRef.current) setModelStatsLoading(false)
      }
    },
    [filters, startDate, endDate],
  )

  const loadChartData = useCallback(async () => {
    const seq = ++chartReqSeqRef.current
    setChartsLoading(true)
    try {
      const requestType = filters.request_type
      const legacyStream = requestType ? requestTypeToLegacyStream(requestType) : filters.stream
      const snapshot = await getSnapshotV2({
        start_date: filters.start_date || startDate,
        end_date: filters.end_date || endDate,
        granularity,
        user_id: filters.user_id,
        model: filters.model ?? undefined,
        api_key_id: filters.api_key_id,
        account_id: filters.account_id,
        group_id: filters.group_id,
        request_type: requestType ?? undefined,
        stream: legacyStream === null ? undefined : legacyStream,
        billing_type: filters.billing_type,
        include_stats: false,
        include_trend: true,
        include_model_stats: false,
        include_group_stats: true,
        include_users_trend: false,
      })
      if (seq !== chartReqSeqRef.current) return
      setTrendData(snapshot.trend || [])
      setGroupStats(snapshot.groups || [])
    } catch (error) {
      console.error('Failed to load chart data:', error)
    } finally {
      if (seq === chartReqSeqRef.current) setChartsLoading(false)
    }
  }, [filters, startDate, endDate, granularity])

  const loadAdminErrors = useCallback(async () => {
    setErrLoading(true)
    try {
      const resp = await adminOpsAPI.listErrorLogs({
        page: errPage,
        page_size: errPageSize,
        view: 'all',
        start_time: toRFC3339(filters.start_date),
        end_time: toRFC3339(filters.end_date, true),
        user_id: filters.user_id ?? undefined,
        api_key_id: filters.api_key_id ?? undefined,
        account_id: filters.account_id ?? undefined,
        group_id: filters.group_id ?? undefined,
        model: filters.model || undefined,
      })
      setErrRows(resp.items)
      setErrTotal(resp.total)
    } catch (error) {
      console.error('Failed to load admin errors:', error)
      appStore.showError(t('usage.errors.failedToLoad'))
    } finally {
      setErrLoading(false)
    }
  }, [appStore, errPage, errPageSize, filters, t])

  const applyFilters = useCallback(() => {
    setPagination((prev) => ({ ...prev, page: 1 }))
    invalidateModelStatsCache()
    void loadLogs()
    void loadStats()
    void loadModelStats(modelDistributionSource, true)
    void loadChartData()
    setErrPage(1)
    if (activeTab === 'errors') void loadAdminErrors()
    else setErrRows([])
  }, [
    activeTab,
    invalidateModelStatsCache,
    loadAdminErrors,
    loadChartData,
    loadLogs,
    loadModelStats,
    loadStats,
    modelDistributionSource,
  ])

  const refreshData = useCallback(() => {
    invalidateModelStatsCache()
    void loadLogs()
    void loadStats(true)
    void loadModelStats(modelDistributionSource, true)
    void loadChartData()
    if (activeTab === 'errors') void loadAdminErrors()
  }, [
    activeTab,
    invalidateModelStatsCache,
    loadAdminErrors,
    loadChartData,
    loadLogs,
    loadModelStats,
    loadStats,
    modelDistributionSource,
  ])

  useEffect(() => {
    if (!initialized) return
    void loadLogs()
  }, [pagination.page, pagination.page_size, sortState.sort_by, sortState.sort_order, initialized, loadLogs])

  const resetFiltersAndApply = useCallback(() => {
    const range = getLast24HoursRangeDates()
    setStartDate(range.start)
    setEndDate(range.end)
    setGranularity(getGranularityForRange(range.start, range.end))
    setFilters({
      start_date: range.start,
      end_date: range.end,
      request_type: undefined,
      billing_type: null,
      billing_mode: undefined,
    })
    setPagination((prev) => ({ ...prev, page: 1 }))
    invalidateModelStatsCache()
    window.setTimeout(() => {
      void loadLogs()
      void loadStats()
      void loadModelStats(modelDistributionSource, true)
      void loadChartData()
      setErrPage(1)
      setErrRows([])
    }, 0)
  }, [
    invalidateModelStatsCache,
    loadChartData,
    loadLogs,
    loadModelStats,
    loadStats,
    modelDistributionSource,
  ])

  const getRequestTypeLabel = useCallback(
    (log: AdminUsageLog): string => {
      const requestType = resolveUsageRequestType(log)
      if (requestType === 'ws_v2') return t('usage.ws')
      if (requestType === 'stream') return t('usage.stream')
      if (requestType === 'sync') return t('usage.sync')
      return t('usage.unknown')
    },
    [t],
  )

  const exportToExcel = useCallback(async () => {
    if (exporting) return
    setExporting(true)
    setExportProgress({ show: true, progress: 0, current: 0, total: 0, estimatedTime: '' })

    const controller = new AbortController()
    exportAbortControllerRef.current = controller

    try {
      let page = 1
      let total = pagination.total
      let exportedCount = 0
      const XLSX = await import('xlsx')

      const headers = [
        t('usage.time'), t('admin.usage.user'), t('usage.apiKeyFilter'), t('admin.usage.account'),
        t('usage.model'), t('usage.upstreamModel'), t('usage.reasoningEffort'), t('admin.usage.group'),
        t('usage.inboundEndpoint'), t('usage.upstreamEndpoint'), t('usage.type'),
        t('admin.usage.inputTokens'), t('admin.usage.outputTokens'),
        t('admin.usage.cacheReadTokens'), t('admin.usage.cacheCreationTokens'),
        t('admin.usage.inputCost'), t('admin.usage.outputCost'),
        t('admin.usage.cacheReadCost'), t('admin.usage.cacheCreationCost'),
        t('usage.rate'), t('usage.accountMultiplier'), t('usage.original'), t('usage.userBilled'), t('usage.accountBilled'),
        t('usage.firstToken'), t('usage.duration'),
        t('admin.usage.requestId'), t('usage.userAgent'), t('admin.usage.ipAddress'),
      ]

      const ws = XLSX.utils.aoa_to_sheet([headers])

      while (true) {
        const res = await adminUsageAPI.list(buildUsageListParams(page, 100, true), { signal: controller.signal })
        if (controller.signal.aborted) break
        if (page === 1) {
          total = res.total
          setExportProgress((prev) => ({ ...prev, total }))
        }

        const rows = (res.items || []).map((log) => [
          log.created_at, log.user?.email || '', log.api_key?.name || '', log.account?.name || '', log.model,
          log.upstream_model || '', formatReasoningEffort(log.reasoning_effort), log.group?.name || '',
          log.inbound_endpoint || '', log.upstream_endpoint || '', getRequestTypeLabel(log),
          log.input_tokens, log.output_tokens, log.cache_read_tokens, log.cache_creation_tokens,
          log.input_cost?.toFixed(6) || '0.000000', log.output_cost?.toFixed(6) || '0.000000',
          log.cache_read_cost?.toFixed(6) || '0.000000', log.cache_creation_cost?.toFixed(6) || '0.000000',
          log.rate_multiplier?.toPrecision(4) || '1.00', (log.account_rate_multiplier ?? 1).toPrecision(4),
          log.total_cost?.toFixed(6) || '0.000000', log.actual_cost?.toFixed(6) || '0.000000',
          ((log.account_stats_cost ?? log.total_cost) * (log.account_rate_multiplier ?? 1)).toFixed(6),
          log.first_token_ms ?? '', log.duration_ms,
          log.request_id || '', log.user_agent || '', log.ip_address || '',
        ])

        if (rows.length) XLSX.utils.sheet_add_aoa(ws, rows, { origin: -1 })

        exportedCount += rows.length
        setExportProgress((prev) => ({
          ...prev,
          current: exportedCount,
          progress: total > 0 ? Math.min(100, Math.round((exportedCount / total) * 100)) : 0,
        }))

        if (exportedCount >= total || res.items.length < 100) break
        page += 1
      }

      if (!controller.signal.aborted) {
        const wb = XLSX.utils.book_new()
        XLSX.utils.book_append_sheet(wb, ws, 'Usage')
        saveAs(
          new Blob([XLSX.write(wb, { bookType: 'xlsx', type: 'array' })], {
            type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          }),
          `usage_${filters.start_date}_to_${filters.end_date}.xlsx`,
        )
        appStore.showSuccess(t('usage.exportSuccess'))
      }
    } catch (error) {
      console.error('Failed to export:', error)
      appStore.showError('Export Failed')
    } finally {
      if (exportAbortControllerRef.current === controller) {
        exportAbortControllerRef.current = null
        setExporting(false)
        setExportProgress((prev) => ({ ...prev, show: false }))
      }
    }
  }, [appStore, buildUsageListParams, exporting, filters.end_date, filters.start_date, getRequestTypeLabel, pagination.total, t])

  const handleUserClick = useCallback(
    async (userId: number) => {
      try {
        const user = await adminUsersAPI.getById(userId, true)
        setBalanceHistoryUser(user)
        setShowBalanceHistoryModal(true)
      } catch {
        appStore.showError(t('admin.usage.failedToLoadUser'))
      }
    },
    [appStore, t],
  )

  const toggleColumn = (key: string) => {
    setHiddenColumns((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      try {
        localStorage.setItem(HIDDEN_COLUMNS_KEY, JSON.stringify([...next]))
      } catch (e) {
        console.error('Failed to save columns:', e)
      }
      return next
    })
  }

  useEffect(() => {
    try {
      const saved = localStorage.getItem(HIDDEN_COLUMNS_KEY)
      if (saved) {
        setHiddenColumns(new Set(JSON.parse(saved) as string[]))
      }
    } catch {
      setHiddenColumns(new Set(DEFAULT_HIDDEN_COLUMNS))
    }
  }, [])

  useEffect(() => {
    const queryStartDate = getSingleQueryValue(searchParams.get('start_date'))
    const queryEndDate = getSingleQueryValue(searchParams.get('end_date'))
    const queryUserId = getNumericQueryValue(searchParams.get('user_id'))

    if (queryStartDate) setStartDate(queryStartDate)
    if (queryEndDate) setEndDate(queryEndDate)

    const nextStart = queryStartDate || startDate
    const nextEnd = queryEndDate || endDate

    setFilters((prev) => ({
      ...prev,
      user_id: queryUserId,
      start_date: nextStart,
      end_date: nextEnd,
    }))
    setGranularity(getGranularityForRange(nextStart, nextEnd))
    setInitialized(true)

    void loadLogs()
    void loadStats()
    void loadModelStats(modelDistributionSource, true)
    const timer = window.setTimeout(() => void loadChartData(), 120)
    return () => window.clearTimeout(timer)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    void loadModelStats(modelDistributionSource)
  }, [modelDistributionSource, loadModelStats])

  useEffect(() => {
    const handler = (event: MouseEvent) => {
      if (columnDropdownRef.current && !columnDropdownRef.current.contains(event.target as HTMLElement)) {
        setShowColumnDropdown(false)
      }
    }
    document.addEventListener('click', handler)
    return () => document.removeEventListener('click', handler)
  }, [])

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort()
      exportAbortControllerRef.current?.abort()
    }
  }, [])

  const onDateRangeChange = (range: { startDate: string; endDate: string }) => {
    setStartDate(range.startDate)
    setEndDate(range.endDate)
    setFilters((prev) => ({ ...prev, start_date: range.startDate, end_date: range.endDate }))
    setGranularity(getGranularityForRange(range.startDate, range.endDate))
    applyFilters()
  }

  return (
    <AppLayout>
      <div className="space-y-6">
        <UsageStatsCards stats={usageStats} />

        <div className="space-y-4">
          <div className="card p-4">
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{t('admin.dashboard.timeRange')}:</span>
                <DateRangePicker
                  startDate={startDate}
                  endDate={endDate}
                  onUpdateStartDate={setStartDate}
                  onUpdateEndDate={setEndDate}
                  onChange={onDateRangeChange}
                />
              </div>
              <div className="ml-auto flex items-center gap-2">
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{t('admin.dashboard.granularity')}:</span>
                <div className="w-28">
                  <Select
                    modelValue={granularity}
                    options={granularityOptions}
                    onChange={() => void loadChartData()}
                    onUpdateModelValue={(v) => setGranularity(v as 'day' | 'hour')}
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <ModelDistributionChart
              modelStats={requestedModelStats}
              upstreamModelStats={upstreamModelStats}
              mappingModelStats={mappingModelStats}
              source={modelDistributionSource}
              metric={modelDistributionMetric}
              loading={modelStatsLoading}
              showSourceToggle
              showMetricToggle
              startDate={startDate}
              endDate={endDate}
              filters={breakdownFilters}
              onUpdateSource={setModelDistributionSource}
              onUpdateMetric={setModelDistributionMetric}
            />
            <GroupDistributionChart
              groupStats={groupStats}
              loading={chartsLoading}
              metric={groupDistributionMetric}
              showMetricToggle
              startDate={startDate}
              endDate={endDate}
              filters={breakdownFilters}
              onUpdateMetric={setGroupDistributionMetric}
            />
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <EndpointDistributionChart
              endpointStats={inboundEndpointStats}
              upstreamEndpointStats={upstreamEndpointStats}
              endpointPathStats={endpointPathStats}
              source={endpointDistributionSource}
              metric={endpointDistributionMetric}
              loading={endpointStatsLoading}
              showSourceToggle
              showMetricToggle
              title={t('usage.endpointDistribution')}
              startDate={startDate}
              endDate={endDate}
              filters={breakdownFilters}
              onUpdateSource={setEndpointDistributionSource}
              onUpdateMetric={setEndpointDistributionMetric}
            />
            <TokenUsageTrend trendData={trendData} loading={chartsLoading} />
          </div>
        </div>

        <UsageFilters
          filters={filters}
          exporting={exporting}
          startDate={startDate}
          endDate={endDate}
          modelOptions={modelNameOptions}
          onFiltersChange={setFilters}
          onChange={applyFilters}
          onRefresh={refreshData}
          onReset={resetFiltersAndApply}
          onCleanup={() => setCleanupDialogVisible(true)}
          onExport={() => void exportToExcel()}
          afterReset={
            <div className="relative" ref={columnDropdownRef}>
              <button
                type="button"
                onClick={() => setShowColumnDropdown((v) => !v)}
                className="btn btn-secondary px-2 md:px-3"
                title={t('admin.users.columnSettings')}
              >
                <svg className="h-4 w-4 md:mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="1.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 4.5v15m6-15v15m-10.875 0h15.75c.621 0 1.125-.504 1.125-1.125V5.625c0-.621-.504-1.125-1.125-1.125H4.125C3.504 4.5 3 5.004 3 5.625v12.75c0 .621.504 1.125 1.125 1.125z" />
                </svg>
                <span className="hidden md:inline">{t('admin.users.columnSettings')}</span>
              </button>
              {showColumnDropdown ? (
                <div className="absolute right-0 top-full z-50 mt-1 max-h-80 w-48 overflow-y-auto rounded-lg border border-gray-200 bg-white py-1 shadow-lg dark:border-dark-600 dark:bg-dark-800">
                  {toggleableColumns.map((col) => (
                    <button
                      key={col.key}
                      type="button"
                      onClick={() => toggleColumn(col.key)}
                      className="flex w-full items-center justify-between px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-dark-700"
                    >
                      <span>{col.label}</span>
                      {!hiddenColumns.has(col.key) ? (
                        <Icon name="check" size="sm" className="text-primary-500" strokeWidth={2} />
                      ) : null}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          }
        />

        <div className="mb-4 flex gap-2 border-b border-gray-200 dark:border-dark-700">
          <button type="button" className={`tab${activeTab === 'usage' ? ' tab-active' : ''}`} onClick={() => setActiveTab('usage')}>
            {t('usage.tabs.usage')}
          </button>
          <button
            type="button"
            className={`tab${activeTab === 'errors' ? ' tab-active' : ''}`}
            onClick={() => {
              setActiveTab('errors')
              if (errRows.length === 0) void loadAdminErrors()
            }}
          >
            {t('usage.tabs.errors')}
          </button>
        </div>

        {activeTab === 'usage' ? (
          <>
            <UsageTable
              data={usageLogs}
              loading={loading}
              columns={visibleColumns}
              serverSideSort
              defaultSortKey="created_at"
              defaultSortOrder="desc"
              onSort={(key, order) => {
                setSortState({ sort_by: key, sort_order: order })
                setPagination((prev) => ({ ...prev, page: 1 }))
              }}
              onUserClick={handleUserClick}
            />
            {pagination.total > 0 ? (
              <Pagination
                page={pagination.page}
                total={pagination.total}
                pageSize={pagination.page_size}
                onUpdatePage={(p) => setPagination((prev) => ({ ...prev, page: p }))}
                onUpdatePageSize={(s) => setPagination({ page: 1, page_size: s, total: pagination.total })}
              />
            ) : null}
          </>
        ) : (
          <>
            <OpsErrorLogTable
              rows={errRows}
              total={errTotal}
              loading={errLoading}
              page={errPage}
              pageSize={errPageSize}
              onOpenErrorDetail={(id) => {
                setSelectedErrorId(id)
                setShowErrorModal(true)
              }}
              onUpdatePage={(p) => {
                setErrPage(p)
                void loadAdminErrors()
              }}
              onUpdatePageSize={(s) => {
                setErrPageSize(s)
                setErrPage(1)
                void loadAdminErrors()
              }}
            />
            <OpsErrorDetailModal
              show={showErrorModal}
              errorId={selectedErrorId}
              errorType="request"
              onUpdateShow={setShowErrorModal}
            />
          </>
        )}
      </div>

      <UsageExportProgress
        show={exportProgress.show}
        progress={exportProgress.progress}
        current={exportProgress.current}
        total={exportProgress.total}
        estimatedTime={exportProgress.estimatedTime}
        onCancel={() => exportAbortControllerRef.current?.abort()}
      />

      <UsageCleanupDialog
        show={cleanupDialogVisible}
        filters={filters}
        startDate={startDate}
        endDate={endDate}
        onClose={() => setCleanupDialogVisible(false)}
      />

      <UserBalanceHistoryModal
        show={showBalanceHistoryModal}
        user={balanceHistoryUser}
        hideActions
        onClose={() => {
          setShowBalanceHistoryModal(false)
          setBalanceHistoryUser(null)
        }}
      />
    </AppLayout>
  )
}
