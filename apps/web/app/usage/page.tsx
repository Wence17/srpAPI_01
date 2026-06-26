'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useI18n } from '@/lib/i18n'
import { useApp } from '@/context/AppContext'
import { usageAPI } from '@/lib/usage'
import { keysAPI } from '@/lib/keys'
import AppLayout from '@/components/layout/AppLayout'
import TablePageLayout from '@/components/layout/TablePageLayout'
import DataTable from '@/components/common/DataTable'
import Pagination from '@/components/common/Pagination'
import EmptyState from '@/components/common/EmptyState'
import Select from '@/components/common/Select'
import DateRangePicker from '@/components/common/DateRangePicker'
import Icon from '@/components/icons/Icon'
import UserErrorRequestsTable from '@/components/user/UserErrorRequestsTable'
import type { Column } from '@/components/common/types'
import type { ApiKey, UsageLog, UsageQueryParams, UsageStatsResponse, UserErrorRequest } from '@/lib/types'
import { formatDateTime, formatReasoningEffort } from '@/lib/format'
import { getPersistedPageSize } from '@/lib/usePersistedPageSize'
import { formatCacheTokens, formatMultiplier } from '@/lib/formatters'
import { formatTokenPricePerMillion } from '@/lib/usagePricing'
import { getUsageServiceTierLabel } from '@/lib/usageServiceTier'
import { resolveUsageRequestType } from '@/lib/usageRequestType'
import {
  BILLING_MODE_IMAGE,
  BILLING_MODE_TOKEN,
  getBillingModeBadgeClass,
  getBillingModeLabel,
} from '@/lib/billingMode'
import {
  formatImageBillingSize,
  formatImageInputSize,
  formatImageOutputSize,
  formatImageSizeBreakdown,
  formatImageSizeSource,
} from '@/lib/imageUsage'

function formatLocalDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function formatDuration(ms: number | null | undefined): string {
  if (ms == null) return '-'
  if (ms < 1000) return `${ms.toFixed(0)}ms`
  return `${(ms / 1000).toFixed(2)}s`
}

function formatTokens(value: number): string {
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(2)}B`
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`
  if (value >= 1_000) return `${(value / 1_000).toFixed(2)}K`
  return value.toLocaleString()
}

function escapeCSVValue(value: unknown): string {
  if (value == null) return ''
  const str = String(value)
  const escaped = str.replace(/"/g, '""')
  if (/^[=+\-@\t\r]/.test(str)) return `"\'${escaped}"`
  if (/[,"\n\r]/.test(str)) return `"${escaped}"`
  return str
}

export default function UsagePage() {
  const { t } = useI18n()
  const appStore = useApp()
  const abortControllerRef = useRef<AbortController | null>(null)

  const [tooltipVisible, setTooltipVisible] = useState(false)
  const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0 })
  const [tooltipData, setTooltipData] = useState<UsageLog | null>(null)

  const [tokenTooltipVisible, setTokenTooltipVisible] = useState(false)
  const [tokenTooltipPosition, setTokenTooltipPosition] = useState({ x: 0, y: 0 })
  const [tokenTooltipData, setTokenTooltipData] = useState<UsageLog | null>(null)

  const [usageStats, setUsageStats] = useState<UsageStatsResponse | null>(null)
  const [usageLogs, setUsageLogs] = useState<UsageLog[]>([])
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([])
  const [loading, setLoading] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [refreshTrigger, setRefreshTrigger] = useState(0)

  const now = useMemo(() => new Date(), [])
  const weekAgo = useMemo(() => {
    const d = new Date(now)
    d.setDate(d.getDate() - 6)
    return d
  }, [now])

  const [startDate, setStartDate] = useState(() => formatLocalDate(weekAgo))
  const [endDate, setEndDate] = useState(() => formatLocalDate(now))
  const [filters, setFilters] = useState<UsageQueryParams>({
    api_key_id: undefined,
    start_date: formatLocalDate(weekAgo),
    end_date: formatLocalDate(now),
  })

  const [pagination, setPagination] = useState({
    page: 1,
    page_size: getPersistedPageSize(),
    total: 0,
    pages: 0,
  })
  const [sortState, setSortState] = useState({
    sort_by: 'created_at',
    sort_order: 'desc' as 'asc' | 'desc',
  })

  const [activeTab, setActiveTab] = useState<'usage' | 'errors'>('usage')
  const errorViewEnabled = appStore.cachedPublicSettings?.allow_user_view_error_requests ?? false

  const [errorRows, setErrorRows] = useState<UserErrorRequest[]>([])
  const [errorLoading, setErrorLoading] = useState(false)
  const [errorPage, setErrorPage] = useState(1)
  const [errorPageSize, setErrorPageSize] = useState(20)
  const [errorTotal, setErrorTotal] = useState(0)
  const [errorFilter, setErrorFilter] = useState<{
    model: string
    category: string
    api_key_id: number | null
  }>({ model: '', category: '', api_key_id: null })

  const columns = useMemo<Column[]>(
    () => [
      { key: 'api_key', label: t('usage.apiKeyFilter'), sortable: false },
      { key: 'model', label: t('usage.model'), sortable: true },
      { key: 'reasoning_effort', label: t('usage.reasoningEffort'), sortable: false },
      { key: 'endpoint', label: t('usage.endpoint'), sortable: false },
      { key: 'stream', label: t('usage.type'), sortable: false },
      { key: 'billing_mode', label: t('admin.usage.billingMode'), sortable: false },
      { key: 'tokens', label: t('usage.tokens'), sortable: false },
      { key: 'cost', label: t('usage.cost'), sortable: false },
      { key: 'first_token', label: t('usage.firstToken'), sortable: false },
      { key: 'duration', label: t('usage.duration'), sortable: false },
      { key: 'created_at', label: t('usage.time'), sortable: true },
      { key: 'user_agent', label: t('usage.userAgent'), sortable: false },
    ],
    [t],
  )

  const apiKeyOptions = useMemo(
    () => [
      { value: null, label: t('usage.allApiKeys') },
      ...apiKeys.map((key) => ({ value: key.id, label: key.name })),
    ],
    [apiKeys, t],
  )

  const isImageUsage = useCallback((row: Pick<UsageLog, 'image_count'> | null | undefined): boolean => {
    return (row?.image_count ?? 0) > 0
  }, [])

  const getDisplayBillingMode = useCallback(
    (row: Pick<UsageLog, 'billing_mode' | 'image_count'> | null | undefined): string | null | undefined => {
      if (isImageUsage(row)) return BILLING_MODE_IMAGE
      return row?.billing_mode
    },
    [isImageUsage],
  )

  const imageUnitPrice = useCallback((row: UsageLog | null): number => {
    if (!row || row.image_count <= 0) return 0
    const total = row.total_cost ?? 0
    const price = total / row.image_count
    return Number.isFinite(price) ? price : 0
  }, [])

  const getRequestTypeLabel = useCallback(
    (log: UsageLog): string => {
      const requestType = resolveUsageRequestType(log)
      if (requestType === 'ws_v2') return t('usage.ws')
      if (requestType === 'stream') return t('usage.stream')
      if (requestType === 'sync') return t('usage.sync')
      return t('usage.unknown')
    },
    [t],
  )

  const getRequestTypeBadgeClass = useCallback((log: UsageLog): string => {
    const requestType = resolveUsageRequestType(log)
    if (requestType === 'ws_v2') return 'bg-violet-100 text-violet-800 dark:bg-violet-900 dark:text-violet-200'
    if (requestType === 'stream') return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
    if (requestType === 'sync') return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200'
    return 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200'
  }, [])

  const getRequestTypeExportText = useCallback((log: UsageLog): string => {
    const requestType = resolveUsageRequestType(log)
    if (requestType === 'ws_v2') return 'WS'
    if (requestType === 'stream') return 'Stream'
    if (requestType === 'sync') return 'Sync'
    return 'Unknown'
  }, [])

  const formatUsageEndpoints = useCallback((log: UsageLog): string => {
    const inbound = log.inbound_endpoint?.trim()
    return inbound || '-'
  }, [])

  const buildUsageQueryParams = useCallback(
    (page: number, pageSize: number) => ({
      page,
      page_size: pageSize,
      ...filters,
      sort_by: sortState.sort_by,
      sort_order: sortState.sort_order,
    }),
    [filters, sortState],
  )

  const loadUsageLogs = useCallback(async () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }
    const currentAbortController = new AbortController()
    abortControllerRef.current = currentAbortController
    const { signal } = currentAbortController
    setLoading(true)
    try {
      const response = await usageAPI.query(
        buildUsageQueryParams(pagination.page, pagination.page_size),
        { signal },
      )
      if (signal.aborted) return
      setUsageLogs(response.items)
      setPagination((prev) => ({
        ...prev,
        total: response.total,
        pages: 'pages' in response ? (response as { pages?: number }).pages ?? 0 : 0,
      }))
    } catch (error) {
      if (signal.aborted) return
      const abortError = error as { name?: string; code?: string }
      if (abortError?.name === 'AbortError' || abortError?.code === 'ERR_CANCELED') return
      appStore.showError(t('usage.failedToLoad'))
    } finally {
      if (abortControllerRef.current === currentAbortController) {
        setLoading(false)
      }
    }
  }, [appStore, buildUsageQueryParams, pagination.page, pagination.page_size, refreshTrigger, t])

  const loadUsageStats = useCallback(async () => {
    try {
      const apiKeyId = filters.api_key_id ? Number(filters.api_key_id) : undefined
      const stats = await usageAPI.getStatsByDateRange(
        filters.start_date || startDate,
        filters.end_date || endDate,
        apiKeyId,
      )
      setUsageStats(stats)
    } catch (error) {
      console.error('Failed to load usage stats:', error)
    }
  }, [filters.api_key_id, filters.end_date, filters.start_date, endDate, startDate])

  const loadErrors = useCallback(async () => {
    setErrorLoading(true)
    try {
      const resp = await usageAPI.listMyErrorRequests({
        page: errorPage,
        page_size: errorPageSize,
        start_date: startDate,
        end_date: endDate,
        model: errorFilter.model || undefined,
        category: errorFilter.category || undefined,
        api_key_id: errorFilter.api_key_id ?? undefined,
      })
      setErrorRows(resp.items)
      setErrorTotal(resp.total)
    } catch (error) {
      console.error('[UsageView] loadErrors failed:', error)
      appStore.showError(t('usage.errors.failedToLoad'))
    } finally {
      setErrorLoading(false)
    }
  }, [appStore, endDate, errorFilter, errorPage, errorPageSize, startDate, t])

  useEffect(() => {
    keysAPI.list(1, 100).then((response) => setApiKeys(response.items)).catch(console.error)
  }, [])

  useEffect(() => {
    loadUsageLogs()
  }, [loadUsageLogs])

  useEffect(() => {
    loadUsageStats()
  }, [loadUsageStats])

  useEffect(() => {
    if (activeTab === 'errors' && errorViewEnabled) {
      loadErrors()
    }
  }, [activeTab, errorViewEnabled, loadErrors])

  function applyFilters() {
    setPagination((prev) => ({ ...prev, page: 1 }))
    setRefreshTrigger((v) => v + 1)
  }

  function resetFilters() {
    const resetNow = new Date()
    const resetWeekAgo = new Date(resetNow)
    resetWeekAgo.setDate(resetWeekAgo.getDate() - 6)
    const newStart = formatLocalDate(resetWeekAgo)
    const newEnd = formatLocalDate(resetNow)
    setStartDate(newStart)
    setEndDate(newEnd)
    setFilters({
      api_key_id: undefined,
      start_date: newStart,
      end_date: newEnd,
    })
    setPagination((prev) => ({ ...prev, page: 1 }))
  }

  function onDateRangeChange(range: { startDate: string; endDate: string; preset: string | null }) {
    setFilters((prev) => ({
      ...prev,
      start_date: range.startDate,
      end_date: range.endDate,
    }))
    setPagination((prev) => ({ ...prev, page: 1 }))
    setErrorPage(1)
    if (activeTab !== 'errors') {
      setErrorRows([])
    }
  }

  function handlePageChange(page: number) {
    setPagination((prev) => ({ ...prev, page }))
  }

  function handlePageSizeChange(pageSize: number) {
    setPagination((prev) => ({ ...prev, page_size: pageSize, page: 1 }))
  }

  function handleSort(key: string, order: 'asc' | 'desc') {
    setSortState({ sort_by: key, sort_order: order })
    setPagination((prev) => ({ ...prev, page: 1 }))
  }

  async function exportToCSV() {
    if (pagination.total === 0) {
      appStore.showWarning(t('usage.noDataToExport'))
      return
    }

    setExporting(true)
    appStore.showInfo(t('usage.preparingExport'))

    try {
      const allLogs: UsageLog[] = []
      const pageSize = 100
      const totalRequests = Math.ceil(pagination.total / pageSize)

      for (let page = 1; page <= totalRequests; page++) {
        const response = await usageAPI.query(buildUsageQueryParams(page, pageSize))
        allLogs.push(...response.items)
      }

      if (allLogs.length === 0) {
        appStore.showWarning(t('usage.noDataToExport'))
        return
      }

      const headers = [
        'Time',
        'API Key Name',
        'Model',
        'Reasoning Effort',
        'Inbound Endpoint',
        'Type',
        'Billing Mode',
        'Input Tokens',
        'Output Tokens',
        'Cache Read Tokens',
        'Cache Creation Tokens',
        'Rate Multiplier',
        'Billed Cost',
        'Original Cost',
        'First Token (ms)',
        'Duration (ms)',
      ]
      const rows = allLogs.map((log) =>
        [
          log.created_at,
          log.api_key?.name || '',
          log.model,
          formatReasoningEffort(log.reasoning_effort),
          log.inbound_endpoint || '',
          getRequestTypeExportText(log),
          getBillingModeLabel(getDisplayBillingMode(log), t),
          log.input_tokens,
          log.output_tokens,
          log.cache_read_tokens,
          log.cache_creation_tokens,
          log.rate_multiplier,
          (log.actual_cost ?? 0).toFixed(8),
          (log.total_cost ?? 0).toFixed(8),
          log.first_token_ms ?? '',
          log.duration_ms,
        ].map(escapeCSVValue),
      )

      const csvContent = [headers.map(escapeCSVValue).join(','), ...rows.map((row) => row.join(','))].join('\n')
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `usage_${filters.start_date}_to_${filters.end_date}.csv`
      link.click()
      window.URL.revokeObjectURL(url)
      appStore.showSuccess(t('usage.exportSuccess'))
    } catch (error) {
      appStore.showError(t('usage.exportFailed'))
      console.error('CSV Export failed:', error)
    } finally {
      setExporting(false)
    }
  }

  function showTooltip(event: React.MouseEvent, row: UsageLog) {
    const target = event.currentTarget as HTMLElement
    const rect = target.getBoundingClientRect()
    setTooltipData(row)
    setTooltipPosition({ x: rect.right + 8, y: rect.top + rect.height / 2 })
    setTooltipVisible(true)
  }

  function hideTooltip() {
    setTooltipVisible(false)
    setTooltipData(null)
  }

  function showTokenTooltip(event: React.MouseEvent, row: UsageLog) {
    const target = event.currentTarget as HTMLElement
    const rect = target.getBoundingClientRect()
    setTokenTooltipData(row)
    setTokenTooltipPosition({ x: rect.right + 8, y: rect.top + rect.height / 2 })
    setTokenTooltipVisible(true)
  }

  function hideTokenTooltip() {
    setTokenTooltipVisible(false)
    setTokenTooltipData(null)
  }

  function switchToErrors() {
    setActiveTab('errors')
    if (errorRows.length === 0) loadErrors()
  }

  const tableCells = useMemo(
    () => ({
      api_key: ({ row }: { row: UsageLog }) => (
        <span className="text-sm text-gray-900 dark:text-white">{row.api_key?.name || '-'}</span>
      ),
      model: ({ value }: { value: string }) => (
        <span className="font-medium text-gray-900 dark:text-white">{value}</span>
      ),
      reasoning_effort: ({ row }: { row: UsageLog }) => (
        <span className="text-sm text-gray-900 dark:text-white">
          {formatReasoningEffort(row.reasoning_effort)}
        </span>
      ),
      endpoint: ({ row }: { row: UsageLog }) => (
        <span className="block max-w-[320px] whitespace-normal break-all text-sm text-gray-600 dark:text-gray-300">
          {formatUsageEndpoints(row)}
        </span>
      ),
      stream: ({ row }: { row: UsageLog }) => (
        <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ${getRequestTypeBadgeClass(row)}`}>
          {getRequestTypeLabel(row)}
        </span>
      ),
      billing_mode: ({ row }: { row: UsageLog }) => (
        <span
          className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium ${getBillingModeBadgeClass(getDisplayBillingMode(row))}`}
        >
          {getBillingModeLabel(getDisplayBillingMode(row), t)}
        </span>
      ),
      tokens: ({ row }: { row: UsageLog }) =>
        isImageUsage(row) ? (
          <div className="flex items-center gap-1.5">
            <svg className="h-4 w-4 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
            </svg>
            <span className="font-medium text-gray-900 dark:text-white">
              {row.image_count}
              {t('usage.imageUnit')}
            </span>
            <span className="text-gray-400">({formatImageBillingSize(row, t)})</span>
          </div>
        ) : (
          <div className="flex items-center gap-1.5">
            <div className="space-y-1.5 text-sm">
              <div className="flex items-center gap-2">
                <div className="inline-flex items-center gap-1">
                  <Icon name="arrowDown" size="sm" className="text-emerald-500" />
                  <span className="font-medium text-gray-900 dark:text-white">
                    {(row.input_tokens ?? 0).toLocaleString()}
                  </span>
                </div>
                <div className="inline-flex items-center gap-1">
                  <Icon name="arrowUp" size="sm" className="text-violet-500" />
                  <span className="font-medium text-gray-900 dark:text-white">
                    {(row.output_tokens ?? 0).toLocaleString()}
                  </span>
                </div>
              </div>
              {row.cache_read_tokens > 0 || row.cache_creation_tokens > 0 ? (
                <div className="flex items-center gap-2">
                  {row.cache_read_tokens > 0 ? (
                    <div className="inline-flex items-center gap-1">
                      <Icon name="inbox" size="sm" className="text-sky-500" />
                      <span className="font-medium text-sky-600 dark:text-sky-400">
                        {formatCacheTokens(row.cache_read_tokens)}
                      </span>
                    </div>
                  ) : null}
                  {row.cache_creation_tokens > 0 ? (
                    <div className="inline-flex items-center gap-1">
                      <Icon name="edit" size="sm" className="text-amber-500" />
                      <span className="font-medium text-amber-600 dark:text-amber-400">
                        {formatCacheTokens(row.cache_creation_tokens)}
                      </span>
                      {row.cache_creation_1h_tokens > 0 ? (
                        <span className="inline-flex items-center rounded px-1 py-px text-[10px] font-medium leading-tight bg-orange-100 text-orange-600 ring-1 ring-inset ring-orange-200 dark:bg-orange-500/20 dark:text-orange-400 dark:ring-orange-500/30">
                          1h
                        </span>
                      ) : null}
                      {row.cache_ttl_overridden ? (
                        <span
                          title={t('usage.cacheTtlOverriddenHint')}
                          className="inline-flex cursor-help items-center rounded px-1 py-px text-[10px] font-medium leading-tight bg-rose-100 text-rose-600 ring-1 ring-inset ring-rose-200 dark:bg-rose-500/20 dark:text-rose-400 dark:ring-rose-500/30"
                        >
                          R
                        </span>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
            <div
              className="group relative"
              onMouseEnter={(e) => showTokenTooltip(e, row)}
              onMouseLeave={hideTokenTooltip}
            >
              <div className="flex h-4 w-4 cursor-help items-center justify-center rounded-full bg-gray-100 transition-colors group-hover:bg-blue-100 dark:bg-gray-700 dark:group-hover:bg-blue-900/50">
                <Icon
                  name="infoCircle"
                  size="xs"
                  className="text-gray-400 group-hover:text-blue-500 dark:text-gray-500 dark:group-hover:text-blue-400"
                />
              </div>
            </div>
          </div>
        ),
      cost: ({ row }: { row: UsageLog }) => (
        <div className="flex items-center gap-1.5 text-sm">
          <span className="font-medium text-green-600 dark:text-green-400">
            ${(row.actual_cost ?? 0).toFixed(6)}
          </span>
          <div
            className="group relative"
            onMouseEnter={(e) => showTooltip(e, row)}
            onMouseLeave={hideTooltip}
          >
            <div className="flex h-4 w-4 cursor-help items-center justify-center rounded-full bg-gray-100 transition-colors group-hover:bg-blue-100 dark:bg-gray-700 dark:group-hover:bg-blue-900/50">
              <Icon
                name="infoCircle"
                size="xs"
                className="text-gray-400 group-hover:text-blue-500 dark:text-gray-500 dark:group-hover:text-blue-400"
              />
            </div>
          </div>
        </div>
      ),
      first_token: ({ row }: { row: UsageLog }) =>
        row.first_token_ms != null ? (
          <span className="text-sm text-gray-600 dark:text-gray-400">{formatDuration(row.first_token_ms)}</span>
        ) : (
          <span className="text-sm text-gray-400 dark:text-gray-500">-</span>
        ),
      duration: ({ row }: { row: UsageLog }) => (
        <span className="text-sm text-gray-600 dark:text-gray-400">{formatDuration(row.duration_ms)}</span>
      ),
      created_at: ({ value }: { value: string }) => (
        <span className="text-sm text-gray-600 dark:text-gray-400">{formatDateTime(value)}</span>
      ),
      user_agent: ({ row }: { row: UsageLog }) =>
        row.user_agent ? (
          <span
            className="block max-w-[320px] whitespace-normal break-all text-sm text-gray-600 dark:text-gray-400"
            title={row.user_agent}
          >
            {row.user_agent}
          </span>
        ) : (
          <span className="text-sm text-gray-400 dark:text-gray-500">-</span>
        ),
    }),
    [
      formatUsageEndpoints,
      getDisplayBillingMode,
      getRequestTypeBadgeClass,
      getRequestTypeLabel,
      isImageUsage,
      t,
    ],
  )

  return (
    <AppLayout>
      <TablePageLayout
        actions={
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <div className="card p-4">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-blue-100 p-2 dark:bg-blue-900/30">
                  <Icon name="document" size="md" className="text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <p className="text-xs font-medium text-gray-500 dark:text-gray-400">{t('usage.totalRequests')}</p>
                  <p className="text-xl font-bold text-gray-900 dark:text-white">
                    {usageStats?.total_requests?.toLocaleString() || '0'}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{t('usage.inSelectedRange')}</p>
                </div>
              </div>
            </div>

            <div className="card p-4">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-amber-100 p-2 dark:bg-amber-900/30">
                  <Icon name="cube" size="md" className="text-amber-600 dark:text-amber-400" />
                </div>
                <div>
                  <p className="text-xs font-medium text-gray-500 dark:text-gray-400">{t('usage.totalTokens')}</p>
                  <p className="text-xl font-bold text-gray-900 dark:text-white">
                    {formatTokens(usageStats?.total_tokens || 0)}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {t('usage.in')}: {formatTokens(usageStats?.total_input_tokens || 0)} / {t('usage.out')}:{' '}
                    {formatTokens(usageStats?.total_output_tokens || 0)}
                  </p>
                </div>
              </div>
            </div>

            <div className="card p-4">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-green-100 p-2 dark:bg-green-900/30">
                  <Icon name="dollar" size="md" className="text-green-600 dark:text-green-400" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-gray-500 dark:text-gray-400">{t('usage.totalCost')}</p>
                  <p className="text-xl font-bold text-green-600 dark:text-green-400">
                    ${(usageStats?.total_actual_cost || 0).toFixed(4)}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {t('usage.actualCost')} /{' '}
                    <span className="line-through">${(usageStats?.total_cost || 0).toFixed(4)}</span>{' '}
                    {t('usage.standardCost')}
                  </p>
                </div>
              </div>
            </div>

            <div className="card p-4">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-purple-100 p-2 dark:bg-purple-900/30">
                  <Icon name="clock" size="md" className="text-purple-600 dark:text-purple-400" />
                </div>
                <div>
                  <p className="text-xs font-medium text-gray-500 dark:text-gray-400">{t('usage.avgDuration')}</p>
                  <p className="text-xl font-bold text-gray-900 dark:text-white">
                    {formatDuration(usageStats?.average_duration_ms || 0)}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{t('usage.perRequest')}</p>
                </div>
              </div>
            </div>
          </div>
        }
        filters={
          <div className="card">
            <div className="px-6 py-4">
              <div className="flex flex-wrap items-end gap-4">
                <div className="min-w-[180px]">
                  <label className="input-label">{t('usage.apiKeyFilter')}</label>
                  <Select
                    modelValue={filters.api_key_id ?? null}
                    options={apiKeyOptions}
                    placeholder={t('usage.allApiKeys')}
                    onChange={() => applyFilters()}
                    onUpdateModelValue={(v) =>
                      setFilters((prev) => ({
                        ...prev,
                        api_key_id: v == null ? undefined : Number(v),
                      }))
                    }
                  />
                </div>

                <div>
                  <label className="input-label">{t('usage.timeRange')}</label>
                  <DateRangePicker
                    startDate={startDate}
                    endDate={endDate}
                    onUpdateStartDate={setStartDate}
                    onUpdateEndDate={setEndDate}
                    onChange={onDateRangeChange}
                  />
                </div>

                <div className="ml-auto flex items-center gap-3">
                  <button type="button" onClick={applyFilters} disabled={loading} className="btn btn-secondary">
                    {t('common.refresh')}
                  </button>
                  <button type="button" onClick={resetFilters} className="btn btn-secondary">
                    {t('common.reset')}
                  </button>
                  <button type="button" onClick={exportToCSV} disabled={exporting} className="btn btn-primary">
                    {exporting ? (
                      <svg className="-ml-1 mr-2 h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                        />
                      </svg>
                    ) : null}
                    {exporting ? t('usage.exporting') : t('usage.exportCsv')}
                  </button>
                </div>
              </div>
            </div>
          </div>
        }
        table={
          <>
            {errorViewEnabled ? (
              <div className="mb-0 flex gap-2 border-b border-gray-200 px-4 pt-3 dark:border-dark-700">
                <button
                  type="button"
                  className={`tab${activeTab === 'usage' ? ' tab-active' : ''}`}
                  onClick={() => setActiveTab('usage')}
                >
                  {t('usage.tabs.usage')}
                </button>
                <button type="button" className={`tab${activeTab === 'errors' ? ' tab-active' : ''}`} onClick={switchToErrors}>
                  {t('usage.tabs.errors')}
                </button>
              </div>
            ) : null}

            <div className={`flex min-h-0 flex-1 flex-col${activeTab === 'usage' ? '' : ' hidden'}`}>
              <DataTable
                columns={columns}
                data={usageLogs}
                loading={loading}
                serverSideSort
                estimateRowHeight={88}
                overscan={12}
                defaultSortKey="created_at"
                defaultSortOrder="desc"
                onSort={handleSort}
                cells={tableCells}
                emptySlot={<EmptyState message={t('usage.noRecords')} />}
              />
            </div>

            {errorViewEnabled ? (
              <div className={`flex min-h-0 flex-1 flex-col${activeTab === 'errors' ? '' : ' hidden'}`}>
                <UserErrorRequestsTable
                  rows={errorRows}
                  total={errorTotal}
                  loading={errorLoading}
                  page={errorPage}
                  pageSize={errorPageSize}
                  apiKeys={apiKeys}
                  onFilter={(f) => {
                    setErrorFilter(f)
                    setErrorPage(1)
                  }}
                  onUpdatePage={setErrorPage}
                  onUpdatePageSize={(s) => {
                    setErrorPageSize(s)
                    setErrorPage(1)
                  }}
                />
              </div>
            ) : null}
          </>
        }
        pagination={
          pagination.total > 0 && activeTab === 'usage' ? (
            <Pagination
              page={pagination.page}
              total={pagination.total}
              pageSize={pagination.page_size}
              onUpdatePage={handlePageChange}
              onUpdatePageSize={handlePageSizeChange}
            />
          ) : null
        }
      />

      {typeof document !== 'undefined' && tokenTooltipVisible
        ? createPortal(
            <div
              className="pointer-events-none fixed z-[9999] -translate-y-1/2"
              style={{ left: tokenTooltipPosition.x, top: tokenTooltipPosition.y }}
            >
              <div className="whitespace-nowrap rounded-lg border border-gray-700 bg-gray-900 px-3 py-2.5 text-xs text-white shadow-xl dark:border-gray-600 dark:bg-gray-800">
                <div className="space-y-1.5">
                  <div>
                    <div className="mb-1 text-xs font-semibold text-gray-300">{t('usage.tokenDetails')}</div>
                    {tokenTooltipData && tokenTooltipData.input_tokens > 0 ? (
                      <div className="flex items-center justify-between gap-4">
                        <span className="text-gray-400">{t('admin.usage.inputTokens')}</span>
                        <span className="font-medium text-white">{tokenTooltipData.input_tokens.toLocaleString()}</span>
                      </div>
                    ) : null}
                    {tokenTooltipData && tokenTooltipData.output_tokens > 0 ? (
                      <div className="flex items-center justify-between gap-4">
                        <span className="text-gray-400">{t('admin.usage.outputTokens')}</span>
                        <span className="font-medium text-white">{tokenTooltipData.output_tokens.toLocaleString()}</span>
                      </div>
                    ) : null}
                    {tokenTooltipData && tokenTooltipData.cache_creation_tokens > 0 ? (
                      tokenTooltipData.cache_creation_5m_tokens > 0 || tokenTooltipData.cache_creation_1h_tokens > 0 ? (
                        <>
                          {tokenTooltipData.cache_creation_5m_tokens > 0 ? (
                            <div className="flex items-center justify-between gap-4">
                              <span className="flex items-center gap-1.5 text-gray-400">
                                {t('admin.usage.cacheCreation5mTokens')}
                                <span className="inline-flex items-center rounded px-1 py-px text-[10px] font-medium leading-tight bg-amber-500/20 text-amber-400 ring-1 ring-inset ring-amber-500/30">
                                  5m
                                </span>
                              </span>
                              <span className="font-medium text-white">
                                {tokenTooltipData.cache_creation_5m_tokens.toLocaleString()}
                              </span>
                            </div>
                          ) : null}
                          {tokenTooltipData.cache_creation_1h_tokens > 0 ? (
                            <div className="flex items-center justify-between gap-4">
                              <span className="flex items-center gap-1.5 text-gray-400">
                                {t('admin.usage.cacheCreation1hTokens')}
                                <span className="inline-flex items-center rounded px-1 py-px text-[10px] font-medium leading-tight bg-orange-500/20 text-orange-400 ring-1 ring-inset ring-orange-500/30">
                                  1h
                                </span>
                              </span>
                              <span className="font-medium text-white">
                                {tokenTooltipData.cache_creation_1h_tokens.toLocaleString()}
                              </span>
                            </div>
                          ) : null}
                        </>
                      ) : (
                        <div className="flex items-center justify-between gap-4">
                          <span className="text-gray-400">{t('admin.usage.cacheCreationTokens')}</span>
                          <span className="font-medium text-white">
                            {tokenTooltipData.cache_creation_tokens.toLocaleString()}
                          </span>
                        </div>
                      )
                    ) : null}
                    {tokenTooltipData && tokenTooltipData.cache_ttl_overridden ? (
                      <div className="flex items-center justify-between gap-4">
                        <span className="flex items-center gap-1.5 text-gray-400">
                          {t('usage.cacheTtlOverriddenLabel')}
                          <span className="inline-flex items-center rounded px-1 py-px text-[10px] font-medium leading-tight bg-rose-500/20 text-rose-400 ring-1 ring-inset ring-rose-500/30">
                            R-{tokenTooltipData.cache_creation_1h_tokens > 0 ? '5m' : '1H'}
                          </span>
                        </span>
                        <span className="font-medium text-rose-400">
                          {tokenTooltipData.cache_creation_1h_tokens > 0
                            ? t('usage.cacheTtlOverridden1h')
                            : t('usage.cacheTtlOverridden5m')}
                        </span>
                      </div>
                    ) : null}
                    {tokenTooltipData && tokenTooltipData.cache_read_tokens > 0 ? (
                      <div className="flex items-center justify-between gap-4">
                        <span className="text-gray-400">{t('admin.usage.cacheReadTokens')}</span>
                        <span className="font-medium text-white">
                          {tokenTooltipData.cache_read_tokens.toLocaleString()}
                        </span>
                      </div>
                    ) : null}
                  </div>
                  <div className="flex items-center justify-between gap-6 border-t border-gray-700 pt-1.5">
                    <span className="text-gray-400">{t('usage.totalTokens')}</span>
                    <span className="font-semibold text-blue-400">
                      {(
                        (tokenTooltipData?.input_tokens || 0) +
                        (tokenTooltipData?.output_tokens || 0) +
                        (tokenTooltipData?.cache_creation_tokens || 0) +
                        (tokenTooltipData?.cache_read_tokens || 0)
                      ).toLocaleString()}
                    </span>
                  </div>
                </div>
                <div className="absolute right-full top-1/2 h-0 w-0 -translate-y-1/2 border-b-[6px] border-r-[6px] border-t-[6px] border-b-transparent border-r-gray-900 border-t-transparent dark:border-r-gray-800" />
              </div>
            </div>,
            document.body,
          )
        : null}

      {typeof document !== 'undefined' && tooltipVisible
        ? createPortal(
            <div
              className="pointer-events-none fixed z-[9999] -translate-y-1/2"
              style={{ left: tooltipPosition.x, top: tooltipPosition.y }}
            >
              <div className="whitespace-nowrap rounded-lg border border-gray-700 bg-gray-900 px-3 py-2.5 text-xs text-white shadow-xl dark:border-gray-600 dark:bg-gray-800">
                <div className="space-y-1.5">
                  <div className="mb-2 border-b border-gray-700 pb-1.5">
                    <div className="mb-1 text-xs font-semibold text-gray-300">{t('usage.costDetails')}</div>
                    {tooltipData && tooltipData.input_cost > 0 ? (
                      <div className="flex items-center justify-between gap-4">
                        <span className="text-gray-400">{t('admin.usage.inputCost')}</span>
                        <span className="font-medium text-white">${tooltipData.input_cost.toFixed(6)}</span>
                      </div>
                    ) : null}
                    {tooltipData && tooltipData.output_cost > 0 ? (
                      <div className="flex items-center justify-between gap-4">
                        <span className="text-gray-400">{t('admin.usage.outputCost')}</span>
                        <span className="font-medium text-white">${tooltipData.output_cost.toFixed(6)}</span>
                      </div>
                    ) : null}
                    {tooltipData && isImageUsage(tooltipData) ? (
                      <>
                        <div className="flex items-center justify-between gap-4">
                          <span className="text-gray-400">{t('usage.imageCount')}</span>
                          <span className="font-medium text-white">
                            {tooltipData.image_count}
                            {t('usage.imageUnit')}
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-4">
                          <span className="text-gray-400">{t('usage.imageBillingSize')}</span>
                          <span className="font-medium text-white">{formatImageBillingSize(tooltipData, t)}</span>
                        </div>
                        <div className="flex items-center justify-between gap-4">
                          <span className="text-gray-400">{t('usage.imageSizeSource')}</span>
                          <span className="font-medium text-white">{formatImageSizeSource(tooltipData, t)}</span>
                        </div>
                        <div className="flex items-center justify-between gap-4">
                          <span className="text-gray-400">{t('usage.imageInputSize')}</span>
                          <span className="font-medium text-white">{formatImageInputSize(tooltipData, t)}</span>
                        </div>
                        <div className="flex items-center justify-between gap-4">
                          <span className="text-gray-400">{t('usage.imageOutputSize')}</span>
                          <span className="font-medium text-white">{formatImageOutputSize(tooltipData, t)}</span>
                        </div>
                        {formatImageSizeBreakdown(tooltipData) ? (
                          <div className="flex items-center justify-between gap-4">
                            <span className="text-gray-400">{t('usage.imageSizeBreakdown')}</span>
                            <span className="font-medium text-white">{formatImageSizeBreakdown(tooltipData)}</span>
                          </div>
                        ) : null}
                        <div className="flex items-center justify-between gap-4">
                          <span className="text-gray-400">{t('usage.imageUnitPrice')}</span>
                          <span className="font-medium text-sky-300">${imageUnitPrice(tooltipData).toFixed(6)}</span>
                        </div>
                        <div className="flex items-center justify-between gap-4">
                          <span className="text-gray-400">{t('usage.imageTotalPrice')}</span>
                          <span className="font-medium text-white">
                            ${tooltipData.total_cost?.toFixed(6) || '0.000000'}
                          </span>
                        </div>
                      </>
                    ) : !getDisplayBillingMode(tooltipData) || getDisplayBillingMode(tooltipData) === BILLING_MODE_TOKEN ? (
                      <>
                        {tooltipData && tooltipData.input_tokens > 0 ? (
                          <div className="flex items-center justify-between gap-4">
                            <span className="text-gray-400">{t('usage.inputTokenPrice')}</span>
                            <span className="font-medium text-sky-300">
                              {formatTokenPricePerMillion(tooltipData.input_cost, tooltipData.input_tokens)}{' '}
                              {t('usage.perMillionTokens')}
                            </span>
                          </div>
                        ) : null}
                        {tooltipData && tooltipData.output_tokens > 0 ? (
                          <div className="flex items-center justify-between gap-4">
                            <span className="text-gray-400">{t('usage.outputTokenPrice')}</span>
                            <span className="font-medium text-violet-300">
                              {formatTokenPricePerMillion(tooltipData.output_cost, tooltipData.output_tokens)}{' '}
                              {t('usage.perMillionTokens')}
                            </span>
                          </div>
                        ) : null}
                      </>
                    ) : (
                      <div className="flex items-center justify-between gap-4">
                        <span className="text-gray-400">{t('usage.unitPrice')}</span>
                        <span className="font-medium text-sky-300">
                          ${tooltipData?.total_cost?.toFixed(6) || '0.000000'}
                        </span>
                      </div>
                    )}
                    {tooltipData && tooltipData.cache_creation_cost > 0 ? (
                      <div className="flex items-center justify-between gap-4">
                        <span className="text-gray-400">{t('admin.usage.cacheCreationCost')}</span>
                        <span className="font-medium text-white">${tooltipData.cache_creation_cost.toFixed(6)}</span>
                      </div>
                    ) : null}
                    {tooltipData && tooltipData.cache_read_cost > 0 ? (
                      <div className="flex items-center justify-between gap-4">
                        <span className="text-gray-400">{t('admin.usage.cacheReadCost')}</span>
                        <span className="font-medium text-white">${tooltipData.cache_read_cost.toFixed(6)}</span>
                      </div>
                    ) : null}
                  </div>
                  <div className="flex items-center justify-between gap-6">
                    <span className="text-gray-400">{t('usage.serviceTier')}</span>
                    <span className="font-semibold text-cyan-300">
                      {getUsageServiceTierLabel(tooltipData?.service_tier, t)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-6">
                    <span className="text-gray-400">{t('usage.rate')}</span>
                    <span className="font-semibold text-blue-400">
                      {formatMultiplier(tooltipData?.rate_multiplier || 1)}x
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-6">
                    <span className="text-gray-400">{t('usage.original')}</span>
                    <span className="font-medium text-white">${tooltipData?.total_cost.toFixed(6)}</span>
                  </div>
                  <div className="flex items-center justify-between gap-6 border-t border-gray-700 pt-1.5">
                    <span className="text-gray-400">{t('usage.billed')}</span>
                    <span className="font-semibold text-green-400">${tooltipData?.actual_cost.toFixed(6)}</span>
                  </div>
                </div>
                <div className="absolute right-full top-1/2 h-0 w-0 -translate-y-1/2 border-b-[6px] border-r-[6px] border-t-[6px] border-b-transparent border-r-gray-900 border-t-transparent dark:border-r-gray-800" />
              </div>
            </div>,
            document.body,
          )
        : null}
    </AppLayout>
  )
}
