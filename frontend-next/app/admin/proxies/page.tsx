'use client'

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type MouseEvent as ReactMouseEvent,
} from 'react'
import { useI18n } from '@/lib/i18n'
import { useApp } from '@/context/AppContext'
import { useClipboard } from '@/lib/useClipboard'
import { useTableLoader } from '@/lib/useTableLoader'
import { useTableSelection } from '@/lib/useTableSelection'
import { useSwipeSelect } from '@/lib/useSwipeSelect'
import { getPersistedPageSize } from '@/lib/usePersistedPageSize'
import { extractApiErrorMessage } from '@/lib/apiError'
import {
  adminProxiesAPI,
  type ProxyListFilters,
  type ProxyTestResult,
} from '@/lib/adminProxies'
import AppLayout from '@/components/layout/AppLayout'
import TablePageLayout from '@/components/layout/TablePageLayout'
import DataTable, { type DataTableCellContext } from '@/components/common/DataTable'
import Pagination from '@/components/common/Pagination'
import BaseDialog from '@/components/common/BaseDialog'
import ConfirmDialog from '@/components/common/ConfirmDialog'
import EmptyState from '@/components/common/EmptyState'
import Select from '@/components/common/Select'
import ProxyAdBanner from '@/components/common/ProxyAdBanner'
import Icon from '@/components/icons/Icon'
import PlatformTypeBadge from '@/components/common/PlatformTypeBadge'
import ImportDataModal from '@/components/admin/proxy/ImportDataModal'
import type { Column } from '@/components/common/types'
import type {
  Proxy,
  ProxyAccountSummary,
  ProxyProtocol,
  ProxyQualityCheckResult,
  UpdateProxyRequest,
} from '@/lib/types'

type ProxySortOrder = 'asc' | 'desc'
type CreateMode = 'standard' | 'batch'
type ProxyTableParams = ProxyListFilters & Record<string, unknown>

type BatchParsedProxy = {
  protocol: ProxyProtocol
  host: string
  port: number
  username: string
  password: string
}

function isAbortError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const { name, code } = error as { name?: string; code?: string }
  return name === 'AbortError' || name === 'CanceledError' || code === 'ERR_CANCELED'
}

function flagUrl(code: string): string {
  return `https://unpkg.com/flag-icons/flags/4x3/${code.toLowerCase()}.svg`
}

function formatLocation(proxy: Proxy): string {
  const parts = [proxy.country, proxy.city].filter(Boolean) as string[]
  return parts.join(' · ')
}

function formatExportTimestamp(): string {
  const now = new Date()
  const pad2 = (value: number) => String(value).padStart(2, '0')
  return `${now.getFullYear()}${pad2(now.getMonth() + 1)}${pad2(now.getDate())}${pad2(now.getHours())}${pad2(now.getMinutes())}${pad2(now.getSeconds())}`
}

function parseProxyUrl(line: string): BatchParsedProxy | null {
  const trimmed = line.trim()
  if (!trimmed) return null

  const regex = /^(https?|socks5h?):\/\/(?:([^:@]+):([^@]+)@)?([^:]+):(\d+)$/i
  const match = trimmed.match(regex)
  if (!match) return null

  const [, protocol, username, password, host, port] = match
  const portNum = parseInt(port, 10)
  if (portNum < 1 || portNum > 65535) return null

  return {
    protocol: protocol.toLowerCase() as ProxyProtocol,
    host: host.trim(),
    port: portNum,
    username: username?.trim() || '',
    password: password?.trim() || '',
  }
}

function buildAuthPart(row: Proxy): string {
  const user = row.username ? encodeURIComponent(row.username) : ''
  const pass = row.password ? encodeURIComponent(row.password) : ''
  if (user && pass) return `${user}:${pass}@`
  if (user) return `${user}@`
  if (pass) return `:${pass}@`
  return ''
}

function buildProxyUrl(row: Proxy): string {
  return `${row.protocol}://${buildAuthPart(row)}${row.host}:${row.port}`
}

function getCopyFormats(row: Proxy): Array<{ label: string; value: string }> {
  const hasAuth = row.username || row.password
  const fullUrl = buildProxyUrl(row)
  const formats = [{ label: fullUrl, value: fullUrl }]
  if (hasAuth) {
    const withoutProtocol = fullUrl.replace(/^[^:]+:\/\//, '')
    formats.push({ label: withoutProtocol, value: withoutProtocol })
  }
  formats.push({ label: `${row.host}:${row.port}`, value: `${row.host}:${row.port}` })
  return formats
}

function summarizeQualityStatus(result: ProxyQualityCheckResult): Proxy['quality_status'] {
  if (result.challenge_count > 0) return 'challenge'
  if (result.failed_count > 0) return 'failed'
  if (result.warn_count > 0) return 'warn'
  return 'healthy'
}

function Spinner({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg className={`${className} animate-spin`} fill="none" viewBox="0 0 24 24">
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  )
}

export default function AdminProxiesPage() {
  const { t } = useI18n()
  const appStore = useApp()
  const { copyToClipboard } = useClipboard()

  const proxyTableRef = useRef<HTMLDivElement | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [filters, setFilters] = useState({ protocol: '', status: '' })
  const [sortState, setSortState] = useState<{ sort_by: string; sort_order: ProxySortOrder }>({
    sort_by: 'id',
    sort_order: 'desc',
  })

  const {
    items: proxies,
    setItems: setProxies,
    loading,
    setParams,
    pagination,
    setPagination,
    load,
    debouncedReload,
    handlePageChange,
    handlePageSizeChange,
  } = useTableLoader<Proxy, ProxyTableParams>({
    fetchFn: (page, pageSize, filters, options) =>
      adminProxiesAPI.list(page, pageSize, filters, options),
    initialParams: {
      protocol: undefined,
      status: undefined,
      search: undefined,
      sort_by: 'id',
      sort_order: 'desc',
    },
    pageSize: getPersistedPageSize(),
  })

  const {
    selectedSet: selectedProxyIds,
    selectedIds,
    selectedCount,
    allVisibleSelected,
    isSelected,
    select,
    deselect,
    clear: clearSelectedProxies,
    removeMany: removeSelectedProxies,
    toggleVisible,
    batchUpdate,
  } = useTableSelection<Proxy>({
    rows: proxies,
    getId: (proxy) => proxy.id,
  })

  useSwipeSelect(proxyTableRef, { isSelected, select, deselect, batchUpdate })

  const [visiblePasswordIds, setVisiblePasswordIds] = useState<Set<number>>(() => new Set())
  const [copyMenuProxyId, setCopyMenuProxyId] = useState<number | null>(null)

  const [showCreateModal, setShowCreateModal] = useState(false)
  const [createMode, setCreateMode] = useState<CreateMode>('standard')
  const [createPasswordVisible, setCreatePasswordVisible] = useState(false)
  const [createForm, setCreateForm] = useState({
    name: '',
    protocol: 'http' as ProxyProtocol,
    host: '',
    port: 8080,
    username: '',
    password: '',
  })

  const [batchInput, setBatchInput] = useState('')
  const [batchParseResult, setBatchParseResult] = useState<{
    total: number
    valid: number
    invalid: number
    duplicate: number
    proxies: BatchParsedProxy[]
  }>({
    total: 0,
    valid: 0,
    invalid: 0,
    duplicate: 0,
    proxies: [],
  })

  const [showEditModal, setShowEditModal] = useState(false)
  const [editPasswordVisible, setEditPasswordVisible] = useState(false)
  const [editPasswordDirty, setEditPasswordDirty] = useState(false)
  const [editingProxy, setEditingProxy] = useState<Proxy | null>(null)
  const [editForm, setEditForm] = useState({
    name: '',
    protocol: 'http' as ProxyProtocol,
    host: '',
    port: 8080,
    username: '',
    password: '',
    status: 'active' as 'active' | 'inactive',
  })

  const [showImportData, setShowImportData] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [showBatchDeleteDialog, setShowBatchDeleteDialog] = useState(false)
  const [showExportDataDialog, setShowExportDataDialog] = useState(false)
  const [showAccountsModal, setShowAccountsModal] = useState(false)
  const [showQualityReportDialog, setShowQualityReportDialog] = useState(false)

  const [submitting, setSubmitting] = useState(false)
  const [exportingData, setExportingData] = useState(false)
  const [testingProxyIds, setTestingProxyIds] = useState<Set<number>>(() => new Set())
  const [qualityCheckingProxyIds, setQualityCheckingProxyIds] = useState<Set<number>>(() => new Set())
  const [batchTesting, setBatchTesting] = useState(false)
  const [batchQualityChecking, setBatchQualityChecking] = useState(false)

  const [deletingProxy, setDeletingProxy] = useState<Proxy | null>(null)
  const [accountsProxy, setAccountsProxy] = useState<Proxy | null>(null)
  const [proxyAccounts, setProxyAccounts] = useState<ProxyAccountSummary[]>([])
  const [accountsLoading, setAccountsLoading] = useState(false)
  const [qualityReportProxy, setQualityReportProxy] = useState<Proxy | null>(null)
  const [qualityReport, setQualityReport] = useState<ProxyQualityCheckResult | null>(null)

  const columns = useMemo<Column[]>(
    () => [
      { key: 'select', label: '', sortable: false },
      { key: 'name', label: t('admin.proxies.columns.name'), sortable: true },
      { key: 'protocol', label: t('admin.proxies.columns.protocol'), sortable: true },
      { key: 'address', label: t('admin.proxies.columns.address'), sortable: false },
      { key: 'auth', label: t('admin.proxies.columns.auth'), sortable: false },
      { key: 'location', label: t('admin.proxies.columns.location'), sortable: false },
      { key: 'account_count', label: t('admin.proxies.columns.accounts'), sortable: true },
      { key: 'latency', label: t('admin.proxies.columns.latency'), sortable: false },
      { key: 'status', label: t('admin.proxies.columns.status'), sortable: true },
      { key: 'actions', label: t('admin.proxies.columns.actions'), sortable: false },
    ],
    [t],
  )

  const protocolOptions = useMemo(
    () => [
      { value: '', label: t('admin.proxies.allProtocols') },
      { value: 'http', label: 'HTTP' },
      { value: 'https', label: 'HTTPS' },
      { value: 'socks5', label: 'SOCKS5' },
      { value: 'socks5h', label: 'SOCKS5H' },
    ],
    [t],
  )

  const statusOptions = useMemo(
    () => [
      { value: '', label: t('admin.proxies.allStatus') },
      { value: 'active', label: t('admin.accounts.status.active') },
      { value: 'inactive', label: t('admin.accounts.status.inactive') },
    ],
    [t],
  )

  const protocolSelectOptions = useMemo(
    () => [
      { value: 'http', label: t('admin.proxies.protocols.http') },
      { value: 'https', label: t('admin.proxies.protocols.https') },
      { value: 'socks5', label: t('admin.proxies.protocols.socks5') },
      { value: 'socks5h', label: t('admin.proxies.protocols.socks5h') },
    ],
    [t],
  )

  const editStatusOptions = useMemo(
    () => [
      { value: 'active', label: t('admin.accounts.status.active') },
      { value: 'inactive', label: t('admin.accounts.status.inactive') },
    ],
    [t],
  )

  const buildProxyQueryFilters = useCallback(
    (): ProxyListFilters => ({
      protocol: filters.protocol || undefined,
      status: (filters.status || undefined) as ProxyListFilters['status'],
      search: searchQuery || undefined,
      sort_by: sortState.sort_by,
      sort_order: sortState.sort_order,
    }),
    [filters.protocol, filters.status, searchQuery, sortState.sort_by, sortState.sort_order],
  )

  const loadProxies = useCallback(async () => {
    try {
      await load()
    } catch (error) {
      if (!isAbortError(error)) {
        appStore.showError(t('admin.proxies.failedToLoad'))
        console.error('Error loading proxies:', error)
      }
    }
  }, [appStore, load, t])

  const handleSearch = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const value = event.target.value
      setSearchQuery(value)
      setParams((prev) => ({ ...prev, search: value || undefined }))
      debouncedReload()
    },
    [debouncedReload, setParams],
  )

  const handleProtocolFilterChange = useCallback(
    (value: string | number | boolean | null) => {
      const protocol = String(value ?? '')
      setFilters((prev) => ({ ...prev, protocol }))
      setParams((prev) => ({ ...prev, protocol: protocol || undefined }))
      setPagination((prev) => ({ ...prev, page: 1 }))
      void loadProxies()
    },
    [loadProxies, setPagination, setParams],
  )

  const handleStatusFilterChange = useCallback(
    (value: string | number | boolean | null) => {
      const status = String(value ?? '')
      setFilters((prev) => ({ ...prev, status }))
      setParams((prev) => ({
        ...prev,
        status: (status || undefined) as ProxyListFilters['status'],
      }))
      setPagination((prev) => ({ ...prev, page: 1 }))
      void loadProxies()
    },
    [loadProxies, setPagination, setParams],
  )

  const handleSort = useCallback(
    (key: string, order: ProxySortOrder) => {
      setSortState({ sort_by: key, sort_order: order })
      setParams((prev) => ({ ...prev, sort_by: key, sort_order: order }))
      setPagination((prev) => ({ ...prev, page: 1 }))
      void loadProxies()
    },
    [loadProxies, setPagination, setParams],
  )

  const toggleSelectRow = useCallback(
    (id: number, event: ChangeEvent<HTMLInputElement>) => {
      if (event.target.checked) select(id)
      else deselect(id)
    },
    [deselect, select],
  )

  const toggleSelectAllVisible = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      toggleVisible(event.target.checked)
    },
    [toggleVisible],
  )

  const togglePasswordVisibility = useCallback((id: number) => {
    setVisiblePasswordIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const closeCopyMenu = useCallback(() => {
    setCopyMenuProxyId(null)
  }, [])

  const copyProxyUrl = useCallback(
    (row: Proxy) => {
      void copyToClipboard(buildProxyUrl(row), t('admin.proxies.urlCopied'))
      setCopyMenuProxyId(null)
    },
    [copyToClipboard, t],
  )

  const toggleCopyMenu = useCallback((id: number) => {
    setCopyMenuProxyId((prev) => (prev === id ? null : id))
  }, [])

  const copyFormat = useCallback(
    (value: string) => {
      void copyToClipboard(value, t('admin.proxies.urlCopied'))
      setCopyMenuProxyId(null)
    },
    [copyToClipboard, t],
  )

  const qualityStatusClass = useCallback((status: string) => {
    if (status === 'pass') return 'badge-success'
    if (status === 'warn') return 'badge-warning'
    if (status === 'challenge') return 'badge-danger'
    return 'badge-danger'
  }, [])

  const qualityStatusLabel = useCallback(
    (status: string) => {
      if (status === 'pass') return t('admin.proxies.qualityStatusPass')
      if (status === 'warn') return t('admin.proxies.qualityStatusWarn')
      if (status === 'challenge') return t('admin.proxies.qualityStatusChallenge')
      return t('admin.proxies.qualityStatusFail')
    },
    [t],
  )

  const qualityOverallClass = useCallback((status?: string) => {
    if (status === 'healthy') return 'badge-success'
    if (status === 'warn') return 'badge-warning'
    if (status === 'challenge') return 'badge-danger'
    return 'badge-danger'
  }, [])

  const qualityOverallLabel = useCallback(
    (status?: string) => {
      if (status === 'healthy') return t('admin.proxies.qualityStatusHealthy')
      if (status === 'warn') return t('admin.proxies.qualityStatusWarn')
      if (status === 'challenge') return t('admin.proxies.qualityStatusChallenge')
      return t('admin.proxies.qualityStatusFail')
    },
    [t],
  )

  const qualityTargetLabel = useCallback(
    (target: string) => {
      switch (target) {
        case 'base_connectivity':
          return t('admin.proxies.qualityTargetBase')
        case 'openai':
          return 'OpenAI'
        case 'anthropic':
          return 'Anthropic'
        case 'gemini':
          return 'Gemini'
        default:
          return target
      }
    },
    [t],
  )

  const applyLatencyResult = useCallback(
    (proxyId: number, result: ProxyTestResult) => {
      setProxies((prev) =>
        prev.map((proxy) => {
          if (proxy.id !== proxyId) return proxy
          if (result.success) {
            return {
              ...proxy,
              latency_status: 'success' as const,
              latency_ms: result.latency_ms,
              ip_address: result.ip_address,
              country: result.country,
              country_code: result.country_code,
              region: result.region,
              city: result.city,
              latency_message: result.message,
            }
          }
          return {
            ...proxy,
            latency_status: 'failed' as const,
            latency_ms: undefined,
            ip_address: undefined,
            country: undefined,
            country_code: undefined,
            region: undefined,
            city: undefined,
            latency_message: result.message,
          }
        }),
      )
    },
    [setProxies],
  )

  const applyQualityResult = useCallback(
    (proxyId: number, result: ProxyQualityCheckResult) => {
      setProxies((prev) =>
        prev.map((proxy) => {
          if (proxy.id !== proxyId) return proxy
          return {
            ...proxy,
            quality_status: summarizeQualityStatus(result),
            quality_score: result.score,
            quality_grade: result.grade,
            quality_summary: result.summary,
            quality_checked: result.checked_at,
          }
        }),
      )
    },
    [setProxies],
  )

  const startTestingProxy = useCallback((proxyId: number) => {
    setTestingProxyIds((prev) => new Set([...prev, proxyId]))
  }, [])

  const stopTestingProxy = useCallback((proxyId: number) => {
    setTestingProxyIds((prev) => {
      const next = new Set(prev)
      next.delete(proxyId)
      return next
    })
  }, [])

  const startQualityCheckingProxy = useCallback((proxyId: number) => {
    setQualityCheckingProxyIds((prev) => new Set([...prev, proxyId]))
  }, [])

  const stopQualityCheckingProxy = useCallback((proxyId: number) => {
    setQualityCheckingProxyIds((prev) => {
      const next = new Set(prev)
      next.delete(proxyId)
      return next
    })
  }, [])

  const runProxyTest = useCallback(
    async (proxyId: number, notify: boolean) => {
      startTestingProxy(proxyId)
      try {
        const result = await adminProxiesAPI.testProxy(proxyId)
        applyLatencyResult(proxyId, result)
        if (notify) {
          if (result.success) {
            const message = result.latency_ms
              ? t('admin.proxies.proxyWorkingWithLatency', { latency: result.latency_ms })
              : t('admin.proxies.proxyWorking')
            appStore.showSuccess(message)
          } else {
            appStore.showError(result.message || t('admin.proxies.proxyTestFailed'))
          }
        }
        return result
      } catch (error) {
        const message = extractApiErrorMessage(error, t('admin.proxies.failedToTest'))
        applyLatencyResult(proxyId, { success: false, message })
        if (notify) appStore.showError(message)
        console.error('Error testing proxy:', error)
        return null
      } finally {
        stopTestingProxy(proxyId)
      }
    },
    [appStore, applyLatencyResult, startTestingProxy, stopTestingProxy, t],
  )

  const handleTestConnection = useCallback(
    async (proxy: Proxy) => {
      await runProxyTest(proxy.id, true)
    },
    [runProxyTest],
  )

  const handleQualityCheck = useCallback(
    async (proxy: Proxy) => {
      startQualityCheckingProxy(proxy.id)
      try {
        const result = await adminProxiesAPI.checkProxyQuality(proxy.id)
        setQualityReportProxy(proxy)
        setQualityReport(result)
        setShowQualityReportDialog(true)

        const baseStep = result.items.find((item) => item.target === 'base_connectivity')
        if (baseStep && baseStep.status === 'pass') {
          applyLatencyResult(proxy.id, {
            success: true,
            latency_ms: result.base_latency_ms,
            message: result.summary,
            ip_address: result.exit_ip,
            country: result.country,
            country_code: result.country_code,
          })
        }
        applyQualityResult(proxy.id, result)

        appStore.showSuccess(
          t('admin.proxies.qualityCheckDone', { score: result.score, grade: result.grade }),
        )
      } catch (error) {
        const message = extractApiErrorMessage(error, t('admin.proxies.qualityCheckFailed'))
        appStore.showError(message)
        console.error('Error checking proxy quality:', error)
      } finally {
        stopQualityCheckingProxy(proxy.id)
      }
    },
    [
      appStore,
      applyLatencyResult,
      applyQualityResult,
      startQualityCheckingProxy,
      stopQualityCheckingProxy,
      t,
    ],
  )

  const fetchAllProxiesForBatch = useCallback(async (): Promise<Proxy[]> => {
    const pageSize = 200
    const result: Proxy[] = []
    let page = 1
    let totalPages = 1

    while (page <= totalPages) {
      const response = await adminProxiesAPI.list(page, pageSize, buildProxyQueryFilters())
      result.push(...response.items)
      totalPages = response.pages || 1
      page++
    }

    return result
  }, [buildProxyQueryFilters])

  const runBatchProxyTests = useCallback(
    async (ids: number[]) => {
      if (ids.length === 0) return
      const concurrency = 5
      let index = 0

      const worker = async () => {
        while (index < ids.length) {
          const current = ids[index]
          index++
          await runProxyTest(current, false)
        }
      }

      const workers = Array.from({ length: Math.min(concurrency, ids.length) }, () => worker())
      await Promise.all(workers)
    },
    [runProxyTest],
  )

  const runBatchProxyQualityChecks = useCallback(
    async (ids: number[]) => {
      if (ids.length === 0) {
        return { total: 0, healthy: 0, warn: 0, challenge: 0, failed: 0 }
      }

      const concurrency = 3
      let index = 0
      let healthy = 0
      let warn = 0
      let challenge = 0
      let failed = 0

      const worker = async () => {
        while (index < ids.length) {
          const current = ids[index]
          index++
          startQualityCheckingProxy(current)
          try {
            const result = await adminProxiesAPI.checkProxyQuality(current)
            const baseStep = result.items.find((item) => item.target === 'base_connectivity')
            if (baseStep && baseStep.status === 'pass') {
              applyLatencyResult(current, {
                success: true,
                latency_ms: result.base_latency_ms,
                message: result.summary,
                ip_address: result.exit_ip,
                country: result.country,
                country_code: result.country_code,
              })
            }
            applyQualityResult(current, result)
            if (result.challenge_count > 0) challenge++
            else if (result.failed_count > 0) failed++
            else if (result.warn_count > 0) warn++
            else healthy++
          } catch {
            failed++
          } finally {
            stopQualityCheckingProxy(current)
          }
        }
      }

      const workers = Array.from({ length: Math.min(concurrency, ids.length) }, () => worker())
      await Promise.all(workers)
      return { total: ids.length, healthy, warn, challenge, failed }
    },
    [
      applyLatencyResult,
      applyQualityResult,
      startQualityCheckingProxy,
      stopQualityCheckingProxy,
    ],
  )

  const handleBatchTest = useCallback(async () => {
    if (batchTesting) return
    setBatchTesting(true)
    try {
      let ids: number[] = []
      if (selectedCount > 0) {
        ids = selectedIds
      } else {
        const allProxies = await fetchAllProxiesForBatch()
        ids = allProxies.map((proxy) => proxy.id)
      }

      if (ids.length === 0) {
        appStore.showInfo(t('admin.proxies.batchTestEmpty'))
        return
      }

      await runBatchProxyTests(ids)
      appStore.showSuccess(t('admin.proxies.batchTestDone', { count: ids.length }))
      void loadProxies()
    } catch (error) {
      appStore.showError(extractApiErrorMessage(error, t('admin.proxies.batchTestFailed')))
      console.error('Error batch testing proxies:', error)
    } finally {
      setBatchTesting(false)
    }
  }, [
    appStore,
    batchTesting,
    fetchAllProxiesForBatch,
    loadProxies,
    runBatchProxyTests,
    selectedCount,
    selectedIds,
    t,
  ])

  const handleBatchQualityCheck = useCallback(async () => {
    if (batchQualityChecking) return
    setBatchQualityChecking(true)
    try {
      let ids: number[] = []
      if (selectedCount > 0) {
        ids = selectedIds
      } else {
        const allProxies = await fetchAllProxiesForBatch()
        ids = allProxies.map((proxy) => proxy.id)
      }

      if (ids.length === 0) {
        appStore.showInfo(t('admin.proxies.batchQualityEmpty'))
        return
      }

      const summary = await runBatchProxyQualityChecks(ids)
      appStore.showSuccess(
        t('admin.proxies.batchQualityDone', {
          count: summary.total,
          healthy: summary.healthy,
          warn: summary.warn,
          challenge: summary.challenge,
          failed: summary.failed,
        }),
      )
      void loadProxies()
    } catch (error) {
      appStore.showError(extractApiErrorMessage(error, t('admin.proxies.batchQualityFailed')))
      console.error('Error batch checking quality:', error)
    } finally {
      setBatchQualityChecking(false)
    }
  }, [
    appStore,
    batchQualityChecking,
    fetchAllProxiesForBatch,
    loadProxies,
    runBatchProxyQualityChecks,
    selectedCount,
    selectedIds,
    t,
  ])

  const closeCreateModal = useCallback(() => {
    setShowCreateModal(false)
    setCreateMode('standard')
    setCreateForm({
      name: '',
      protocol: 'http',
      host: '',
      port: 8080,
      username: '',
      password: '',
    })
    setCreatePasswordVisible(false)
    setBatchInput('')
    setBatchParseResult({
      total: 0,
      valid: 0,
      invalid: 0,
      duplicate: 0,
      proxies: [],
    })
  }, [])

  const parseBatchInput = useCallback((value: string) => {
    const lines = value.split('\n').filter((line) => line.trim())
    const seen = new Set<string>()
    const parsed: BatchParsedProxy[] = []
    let invalid = 0
    let duplicate = 0

    for (const line of lines) {
      const item = parseProxyUrl(line)
      if (!item) {
        invalid++
        continue
      }
      const key = `${item.host}:${item.port}:${item.username}:${item.password}`
      if (seen.has(key)) {
        duplicate++
        continue
      }
      seen.add(key)
      parsed.push(item)
    }

    setBatchParseResult({
      total: lines.length,
      valid: parsed.length,
      invalid,
      duplicate,
      proxies: parsed,
    })
  }, [])

  const handleBatchInputChange = useCallback(
    (event: ChangeEvent<HTMLTextAreaElement>) => {
      const value = event.target.value
      setBatchInput(value)
      parseBatchInput(value)
    },
    [parseBatchInput],
  )

  const handleCreateProxy = useCallback(
    async (event: FormEvent) => {
      event.preventDefault()
      if (!createForm.name.trim()) {
        appStore.showError(t('admin.proxies.nameRequired'))
        return
      }
      if (!createForm.host.trim()) {
        appStore.showError(t('admin.proxies.hostRequired'))
        return
      }
      if (createForm.port < 1 || createForm.port > 65535) {
        appStore.showError(t('admin.proxies.portInvalid'))
        return
      }

      setSubmitting(true)
      try {
        await adminProxiesAPI.create({
          name: createForm.name.trim(),
          protocol: createForm.protocol,
          host: createForm.host.trim(),
          port: createForm.port,
          username: createForm.username.trim() || null,
          password: createForm.password.trim() || null,
        })
        appStore.showSuccess(t('admin.proxies.proxyCreated'))
        closeCreateModal()
        void loadProxies()
      } catch (error) {
        appStore.showError(extractApiErrorMessage(error, t('admin.proxies.failedToCreate')))
        console.error('Error creating proxy:', error)
      } finally {
        setSubmitting(false)
      }
    },
    [appStore, closeCreateModal, createForm, loadProxies, t],
  )

  const handleBatchCreate = useCallback(async () => {
    if (batchParseResult.valid === 0) return

    setSubmitting(true)
    try {
      const result = await adminProxiesAPI.batchCreate(batchParseResult.proxies)
      const created = result.created || 0
      const skipped = result.skipped || 0

      if (created > 0) {
        appStore.showSuccess(t('admin.proxies.batchImportSuccess', { created, skipped }))
      } else {
        appStore.showInfo(t('admin.proxies.batchImportAllSkipped', { skipped }))
      }

      closeCreateModal()
      void loadProxies()
    } catch (error) {
      appStore.showError(extractApiErrorMessage(error, t('admin.proxies.failedToImport')))
      console.error('Error batch creating proxies:', error)
    } finally {
      setSubmitting(false)
    }
  }, [appStore, batchParseResult.proxies, batchParseResult.valid, closeCreateModal, loadProxies, t])

  const handleEdit = useCallback((proxy: Proxy) => {
    setEditingProxy(proxy)
    setEditForm({
      name: proxy.name,
      protocol: proxy.protocol,
      host: proxy.host,
      port: proxy.port,
      username: proxy.username || '',
      password: proxy.password || '',
      status: proxy.status,
    })
    setEditPasswordVisible(false)
    setEditPasswordDirty(false)
    setShowEditModal(true)
  }, [])

  const closeEditModal = useCallback(() => {
    setShowEditModal(false)
    setEditingProxy(null)
    setEditPasswordVisible(false)
    setEditPasswordDirty(false)
  }, [])

  const handleUpdateProxy = useCallback(
    async (event: FormEvent) => {
      event.preventDefault()
      if (!editingProxy) return
      if (!editForm.name.trim()) {
        appStore.showError(t('admin.proxies.nameRequired'))
        return
      }
      if (!editForm.host.trim()) {
        appStore.showError(t('admin.proxies.hostRequired'))
        return
      }
      if (editForm.port < 1 || editForm.port > 65535) {
        appStore.showError(t('admin.proxies.portInvalid'))
        return
      }

      setSubmitting(true)
      try {
        const updateData: UpdateProxyRequest = {
          name: editForm.name.trim(),
          protocol: editForm.protocol,
          host: editForm.host.trim(),
          port: editForm.port,
          username: editForm.username.trim() || null,
          status: editForm.status,
        }
        if (editPasswordDirty) {
          updateData.password = editForm.password.trim() || null
        }

        await adminProxiesAPI.update(editingProxy.id, updateData)
        appStore.showSuccess(t('admin.proxies.proxyUpdated'))
        closeEditModal()
        void loadProxies()
      } catch (error) {
        appStore.showError(extractApiErrorMessage(error, t('admin.proxies.failedToUpdate')))
        console.error('Error updating proxy:', error)
      } finally {
        setSubmitting(false)
      }
    },
    [appStore, closeEditModal, editForm, editPasswordDirty, editingProxy, loadProxies, t],
  )

  const handleDelete = useCallback(
    (proxy: Proxy) => {
      if ((proxy.account_count || 0) > 0) {
        appStore.showError(t('admin.proxies.deleteBlockedInUse'))
        return
      }
      setDeletingProxy(proxy)
      setShowDeleteDialog(true)
    },
    [appStore, t],
  )

  const confirmDelete = useCallback(async () => {
    if (!deletingProxy) return
    try {
      await adminProxiesAPI.delete(deletingProxy.id)
      appStore.showSuccess(t('admin.proxies.proxyDeleted'))
      setShowDeleteDialog(false)
      removeSelectedProxies([deletingProxy.id])
      setDeletingProxy(null)
      void loadProxies()
    } catch (error) {
      appStore.showError(extractApiErrorMessage(error, t('admin.proxies.failedToDelete')))
      console.error('Error deleting proxy:', error)
    }
  }, [appStore, deletingProxy, loadProxies, removeSelectedProxies, t])

  const openBatchDelete = useCallback(() => {
    if (selectedCount === 0) return
    setShowBatchDeleteDialog(true)
  }, [selectedCount])

  const confirmBatchDelete = useCallback(async () => {
    const ids = selectedIds
    if (ids.length === 0) {
      setShowBatchDeleteDialog(false)
      return
    }

    try {
      const result = await adminProxiesAPI.batchDelete(ids)
      const deleted = result.deleted_ids?.length || 0
      const skipped = result.skipped?.length || 0

      if (deleted > 0) {
        appStore.showSuccess(t('admin.proxies.batchDeleteDone', { deleted, skipped }))
      } else if (skipped > 0) {
        appStore.showInfo(t('admin.proxies.batchDeleteSkipped', { skipped }))
      }

      clearSelectedProxies()
      setShowBatchDeleteDialog(false)
      void loadProxies()
    } catch (error) {
      appStore.showError(extractApiErrorMessage(error, t('admin.proxies.batchDeleteFailed')))
      console.error('Error batch deleting proxies:', error)
    }
  }, [appStore, clearSelectedProxies, loadProxies, selectedIds, t])

  const handleExportData = useCallback(async () => {
    if (exportingData) return
    setExportingData(true)
    try {
      const dataPayload = await adminProxiesAPI.exportData(
        selectedCount > 0 ? { ids: selectedIds } : { filters: buildProxyQueryFilters() },
      )
      const timestamp = formatExportTimestamp()
      const filename = `sub2api-proxy-${timestamp}.json`
      const blob = new Blob([JSON.stringify(dataPayload, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = filename
      link.click()
      URL.revokeObjectURL(url)
      appStore.showSuccess(t('admin.proxies.dataExported'))
    } catch (error) {
      appStore.showError(extractApiErrorMessage(error, t('admin.proxies.dataExportFailed')))
    } finally {
      setExportingData(false)
      setShowExportDataDialog(false)
    }
  }, [appStore, buildProxyQueryFilters, exportingData, selectedCount, selectedIds, t])

  const handleDataImported = useCallback(() => {
    setShowImportData(false)
    void loadProxies()
  }, [loadProxies])

  const openAccountsModal = useCallback(
    async (proxy: Proxy) => {
      setAccountsProxy(proxy)
      setProxyAccounts([])
      setAccountsLoading(true)
      setShowAccountsModal(true)

      try {
        const accounts = await adminProxiesAPI.getProxyAccounts(proxy.id)
        setProxyAccounts(accounts)
      } catch (error) {
        appStore.showError(extractApiErrorMessage(error, t('admin.proxies.accountsFailed')))
        console.error('Error loading proxy accounts:', error)
      } finally {
        setAccountsLoading(false)
      }
    },
    [appStore, t],
  )

  const closeAccountsModal = useCallback(() => {
    setShowAccountsModal(false)
    setAccountsProxy(null)
    setProxyAccounts([])
  }, [])

  const closeQualityReportDialog = useCallback(() => {
    setShowQualityReportDialog(false)
    setQualityReportProxy(null)
    setQualityReport(null)
  }, [])

  const headerCells = useMemo(
    () => ({
      select: () => (
        <input
          type="checkbox"
          className="h-4 w-4 cursor-pointer rounded border-gray-300 text-primary-600 focus:ring-primary-500"
          checked={allVisibleSelected}
          onClick={(event: ReactMouseEvent) => event.stopPropagation()}
          onChange={toggleSelectAllVisible}
        />
      ),
    }),
    [allVisibleSelected, toggleSelectAllVisible],
  )

  const tableCells = useMemo(() => {
    const cells: Record<string, (ctx: DataTableCellContext) => React.ReactNode> = {
      select: ({ row }) => (
        <input
          type="checkbox"
          className="h-4 w-4 cursor-pointer rounded border-gray-300 text-primary-600 focus:ring-primary-500"
          checked={selectedProxyIds.has((row as Proxy).id)}
          onClick={(event: ReactMouseEvent) => event.stopPropagation()}
          onChange={(event) => toggleSelectRow((row as Proxy).id, event)}
        />
      ),
      name: ({ value }) => (
        <span className="font-medium text-gray-900 dark:text-white">{String(value ?? '')}</span>
      ),
      protocol: ({ value }) =>
        value ? (
          <span
            className={`badge ${String(value).startsWith('socks5') ? 'badge-primary' : 'badge-gray'}`}
          >
            {String(value).toUpperCase()}
          </span>
        ) : (
          <span className="text-sm text-gray-400">-</span>
        ),
      address: ({ row }) => {
        const proxy = row as Proxy
        return (
          <div className="flex items-center gap-1.5">
            <code className="code text-xs">
              {proxy.host}:{proxy.port}
            </code>
            <div className="relative">
              <button
                type="button"
                className="rounded p-0.5 text-gray-400 hover:text-primary-600 dark:hover:text-primary-400"
                title={t('admin.proxies.copyProxyUrl')}
                onClick={(event) => {
                  event.stopPropagation()
                  copyProxyUrl(proxy)
                }}
                onContextMenu={(event) => {
                  event.preventDefault()
                  toggleCopyMenu(proxy.id)
                }}
              >
                <Icon name="copy" size="sm" />
              </button>
              {copyMenuProxyId === proxy.id ? (
                <div className="absolute left-0 top-full z-50 mt-1 w-auto min-w-[180px] rounded-lg border border-gray-200 bg-white py-1 shadow-lg dark:border-dark-500 dark:bg-dark-700">
                  {getCopyFormats(proxy).map((fmt) => (
                    <button
                      key={fmt.label}
                      type="button"
                      className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-gray-100 dark:hover:bg-dark-600"
                      onClick={(event) => {
                        event.stopPropagation()
                        copyFormat(fmt.value)
                      }}
                    >
                      <span className="truncate font-mono text-gray-600 dark:text-gray-300">
                        {fmt.label}
                      </span>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        )
      },
      auth: ({ row }) => {
        const proxy = row as Proxy
        if (!proxy.username && !proxy.password) {
          return <span className="text-sm text-gray-400">-</span>
        }
        return (
          <div className="flex items-center gap-1.5">
            <div className="flex flex-col text-xs">
              {proxy.username ? (
                <span className="text-gray-700 dark:text-gray-200">{proxy.username}</span>
              ) : null}
              {proxy.password ? (
                <span className="font-mono text-gray-500 dark:text-gray-400">
                  {visiblePasswordIds.has(proxy.id) ? proxy.password : '••••••'}
                </span>
              ) : null}
            </div>
            {proxy.password ? (
              <button
                type="button"
                className="ml-1 rounded p-0.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                onClick={(event) => {
                  event.stopPropagation()
                  togglePasswordVisibility(proxy.id)
                }}
              >
                <Icon
                  name={visiblePasswordIds.has(proxy.id) ? 'eyeOff' : 'eye'}
                  size="sm"
                />
              </button>
            ) : null}
          </div>
        )
      },
      location: ({ row }) => {
        const proxy = row as Proxy
        const location = formatLocation(proxy)
        return (
          <div className="flex items-center gap-2">
            {proxy.country_code ? (
              <img
                src={flagUrl(proxy.country_code)}
                alt={proxy.country || proxy.country_code}
                className="h-4 w-6 rounded-sm"
              />
            ) : null}
            {location ? (
              <span className="text-sm text-gray-700 dark:text-gray-200">{location}</span>
            ) : (
              <span className="text-sm text-gray-400">-</span>
            )}
          </div>
        )
      },
      account_count: ({ row, value }) => {
        const count = Number(value || 0)
        if (count > 0) {
          return (
            <button
              type="button"
              className="inline-flex items-center rounded bg-gray-100 px-2 py-0.5 text-xs font-medium text-primary-700 hover:bg-gray-200 dark:bg-dark-600 dark:text-primary-300 dark:hover:bg-dark-500"
              onClick={() => openAccountsModal(row as Proxy)}
            >
              {t('admin.groups.accountsCount', { count })}
            </button>
          )
        }
        return (
          <span className="inline-flex items-center rounded bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-800 dark:bg-dark-600 dark:text-gray-300">
            {t('admin.groups.accountsCount', { count: 0 })}
          </span>
        )
      },
      latency: ({ row }) => {
        const proxy = row as Proxy
        return (
          <div className="flex flex-col gap-1">
            {proxy.latency_status === 'failed' ? (
              <span className="badge badge-danger" title={proxy.latency_message || undefined}>
                {t('admin.proxies.latencyFailed')}
              </span>
            ) : typeof proxy.latency_ms === 'number' ? (
              <span
                className={`badge ${proxy.latency_ms < 200 ? 'badge-success' : 'badge-warning'}`}
              >
                {proxy.latency_ms}ms
              </span>
            ) : (
              <span className="text-sm text-gray-400">-</span>
            )}
            {typeof proxy.quality_checked === 'number' ? (
              <div
                className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400"
                title={proxy.quality_summary || undefined}
              >
                <span>
                  {t('admin.proxies.qualityInline', {
                    grade: proxy.quality_grade || '-',
                    score: proxy.quality_score ?? '-',
                  })}
                </span>
                <span className={`badge ${qualityOverallClass(proxy.quality_status)}`}>
                  {qualityOverallLabel(proxy.quality_status)}
                </span>
              </div>
            ) : null}
          </div>
        )
      },
      status: ({ value }) => (
        <span className={`badge ${value === 'active' ? 'badge-success' : 'badge-danger'}`}>
          {t(`admin.accounts.status.${String(value ?? '')}`)}
        </span>
      ),
      actions: ({ row }) => {
        const proxy = row as Proxy
        return (
          <div className="flex items-center gap-1">
            <button
              type="button"
              disabled={testingProxyIds.has(proxy.id)}
              className="flex flex-col items-center gap-0.5 rounded-lg p-1.5 text-gray-500 transition-colors hover:bg-emerald-50 hover:text-emerald-600 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-emerald-900/20 dark:hover:text-emerald-400"
              onClick={() => void handleTestConnection(proxy)}
            >
              {testingProxyIds.has(proxy.id) ? (
                <Spinner className="h-4 w-4" />
              ) : (
                <Icon name="checkCircle" size="sm" />
              )}
              <span className="text-xs">{t('admin.proxies.testConnection')}</span>
            </button>
            <button
              type="button"
              disabled={qualityCheckingProxyIds.has(proxy.id)}
              className="flex flex-col items-center gap-0.5 rounded-lg p-1.5 text-gray-500 transition-colors hover:bg-blue-50 hover:text-blue-600 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-blue-900/20 dark:hover:text-blue-400"
              onClick={() => void handleQualityCheck(proxy)}
            >
              {qualityCheckingProxyIds.has(proxy.id) ? (
                <Spinner className="h-4 w-4" />
              ) : (
                <Icon name="shield" size="sm" />
              )}
              <span className="text-xs">{t('admin.proxies.qualityCheck')}</span>
            </button>
            <button
              type="button"
              className="flex flex-col items-center gap-0.5 rounded-lg p-1.5 text-gray-500 transition-colors hover:bg-gray-100 hover:text-primary-600 dark:hover:bg-dark-700 dark:hover:text-primary-400"
              onClick={() => handleEdit(proxy)}
            >
              <Icon name="edit" size="sm" />
              <span className="text-xs">{t('common.edit')}</span>
            </button>
            <button
              type="button"
              className="flex flex-col items-center gap-0.5 rounded-lg p-1.5 text-gray-500 transition-colors hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20 dark:hover:text-red-400"
              onClick={() => handleDelete(proxy)}
            >
              <Icon name="trash" size="sm" />
              <span className="text-xs">{t('common.delete')}</span>
            </button>
          </div>
        )
      },
    }
    return cells
  }, [
    copyFormat,
    copyMenuProxyId,
    copyProxyUrl,
    handleDelete,
    handleEdit,
    handleQualityCheck,
    handleTestConnection,
    openAccountsModal,
    qualityCheckingProxyIds,
    qualityOverallClass,
    qualityOverallLabel,
    selectedProxyIds,
    t,
    testingProxyIds,
    toggleCopyMenu,
    togglePasswordVisibility,
    toggleSelectRow,
    visiblePasswordIds,
  ])

  useEffect(() => {
    void loadProxies()
  }, [loadProxies])

  useEffect(() => {
    document.addEventListener('click', closeCopyMenu)
    return () => document.removeEventListener('click', closeCopyMenu)
  }, [closeCopyMenu])

  return (
    <AppLayout>
      <TablePageLayout
        filters={
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative w-full sm:w-64">
              <Icon
                name="search"
                size="md"
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500"
              />
              <input
                value={searchQuery}
                type="text"
                placeholder={t('admin.proxies.searchProxies')}
                className="input pl-10"
                onInput={handleSearch}
              />
            </div>

            <div className="w-full sm:w-40">
              <Select
                modelValue={filters.protocol}
                options={protocolOptions}
                placeholder={t('admin.proxies.allProtocols')}
                onUpdateModelValue={handleProtocolFilterChange}
              />
            </div>
            <div className="w-full sm:w-36">
              <Select
                modelValue={filters.status}
                options={statusOptions}
                placeholder={t('admin.proxies.allStatus')}
                onUpdateModelValue={handleStatusFilterChange}
              />
            </div>

            <div className="flex flex-1 flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                disabled={loading}
                className="btn btn-secondary"
                title={t('common.refresh')}
                onClick={() => void loadProxies()}
              >
                <Icon name="refresh" size="md" className={loading ? 'animate-spin' : ''} />
              </button>
              <button
                type="button"
                disabled={batchTesting || loading}
                className="btn btn-secondary"
                title={t('admin.proxies.testConnection')}
                onClick={() => void handleBatchTest()}
              >
                <Icon name="play" size="md" className="mr-2" />
                {t('admin.proxies.testConnection')}
              </button>
              <button
                type="button"
                disabled={batchQualityChecking || loading}
                className="btn btn-secondary"
                title={t('admin.proxies.batchQualityCheck')}
                onClick={() => void handleBatchQualityCheck()}
              >
                <Icon
                  name="shield"
                  size="md"
                  className={`mr-2 ${batchQualityChecking ? 'animate-pulse' : ''}`}
                />
                {t('admin.proxies.batchQualityCheck')}
              </button>
              <button
                type="button"
                disabled={selectedCount === 0}
                className="btn btn-danger"
                title={t('admin.proxies.batchDeleteAction')}
                onClick={openBatchDelete}
              >
                <Icon name="trash" size="md" className="mr-2" />
                {t('admin.proxies.batchDeleteAction')}
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setShowImportData(true)}
              >
                {t('admin.proxies.dataImport')}
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setShowExportDataDialog(true)}
              >
                {selectedCount > 0
                  ? t('admin.proxies.dataExportSelected')
                  : t('admin.proxies.dataExport')}
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => setShowCreateModal(true)}
              >
                <Icon name="plus" size="md" className="mr-2" />
                {t('admin.proxies.createProxy')}
              </button>
            </div>
          </div>
        }
        table={
          <div ref={proxyTableRef} className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <DataTable
              columns={columns}
              data={proxies}
              loading={loading}
              rowKey="id"
              serverSideSort
              defaultSortKey="id"
              defaultSortOrder="desc"
              onSort={handleSort}
              cells={tableCells}
              headerCells={headerCells}
              emptySlot={
                <EmptyState
                  title={t('admin.proxies.noProxiesYet')}
                  description={t('admin.proxies.createFirstProxy')}
                  actionText={t('admin.proxies.createProxy')}
                  onAction={() => setShowCreateModal(true)}
                />
              }
            />
          </div>
        }
        pagination={
          pagination.total > 0 ? (
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

      <BaseDialog
        show={showCreateModal}
        title={t('admin.proxies.createProxy')}
        width="normal"
        onClose={closeCreateModal}
        footer={
          <div className="flex justify-end gap-3">
            <button type="button" className="btn btn-secondary" onClick={closeCreateModal}>
              {t('common.cancel')}
            </button>
            {createMode === 'standard' ? (
              <button
                type="submit"
                form="create-proxy-form"
                disabled={submitting}
                className="btn btn-primary"
              >
                {submitting ? <Spinner className="-ml-1 mr-2 h-4 w-4" /> : null}
                {submitting ? t('admin.proxies.creating') : t('common.create')}
              </button>
            ) : (
              <button
                type="button"
                disabled={submitting || batchParseResult.valid === 0}
                className="btn btn-primary"
                onClick={() => void handleBatchCreate()}
              >
                {submitting ? <Spinner className="-ml-1 mr-2 h-4 w-4" /> : null}
                {submitting
                  ? t('admin.proxies.importing')
                  : t('admin.proxies.importProxies', { count: batchParseResult.valid })}
              </button>
            )}
          </div>
        }
      >
        <div className="mb-6 flex items-center justify-between gap-3 border-b border-gray-200 dark:border-dark-600">
          <div className="flex min-w-0 shrink-0">
            <button
              type="button"
              className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
                createMode === 'standard'
                  ? 'border-primary-500 text-primary-600 dark:text-primary-400'
                  : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
              }`}
              onClick={() => setCreateMode('standard')}
            >
              <Icon name="plus" size="sm" className="mr-1.5 inline" />
              {t('admin.proxies.standardAdd')}
            </button>
            <button
              type="button"
              className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
                createMode === 'batch'
                  ? 'border-primary-500 text-primary-600 dark:text-primary-400'
                  : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
              }`}
              onClick={() => setCreateMode('batch')}
            >
              <svg
                className="mr-1.5 inline h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth="1.5"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 010 3.75H5.625a1.875 1.875 0 010-3.75z"
                />
              </svg>
              {t('admin.proxies.batchAdd')}
            </button>
          </div>
          <ProxyAdBanner />
        </div>

        {createMode === 'standard' ? (
          <form id="create-proxy-form" className="space-y-5" onSubmit={handleCreateProxy}>
            <div>
              <label className="input-label">{t('admin.proxies.name')}</label>
              <input
                value={createForm.name}
                type="text"
                required
                className="input"
                placeholder={t('admin.proxies.enterProxyName')}
                onChange={(event) =>
                  setCreateForm((prev) => ({ ...prev, name: event.target.value }))
                }
              />
            </div>
            <div>
              <label className="input-label">{t('admin.proxies.protocol')}</label>
              <Select
                modelValue={createForm.protocol}
                options={protocolSelectOptions}
                onUpdateModelValue={(value) =>
                  setCreateForm((prev) => ({
                    ...prev,
                    protocol: String(value ?? 'http') as ProxyProtocol,
                  }))
                }
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="input-label">{t('admin.proxies.host')}</label>
                <input
                  value={createForm.host}
                  type="text"
                  required
                  placeholder={t('admin.proxies.form.hostPlaceholder')}
                  className="input"
                  onChange={(event) =>
                    setCreateForm((prev) => ({ ...prev, host: event.target.value }))
                  }
                />
              </div>
              <div>
                <label className="input-label">{t('admin.proxies.port')}</label>
                <input
                  value={createForm.port}
                  type="number"
                  required
                  min={1}
                  max={65535}
                  placeholder={t('admin.proxies.form.portPlaceholder')}
                  className="input"
                  onChange={(event) =>
                    setCreateForm((prev) => ({
                      ...prev,
                      port: Number(event.target.value) || 0,
                    }))
                  }
                />
              </div>
            </div>
            <div>
              <label className="input-label">{t('admin.proxies.username')}</label>
              <input
                value={createForm.username}
                type="text"
                className="input"
                placeholder={t('admin.proxies.optionalAuth')}
                onChange={(event) =>
                  setCreateForm((prev) => ({ ...prev, username: event.target.value }))
                }
              />
            </div>
            <div>
              <label className="input-label">{t('admin.proxies.password')}</label>
              <div className="relative">
                <input
                  value={createForm.password}
                  type={createPasswordVisible ? 'text' : 'password'}
                  className="input pr-10"
                  placeholder={t('admin.proxies.optionalAuth')}
                  onChange={(event) =>
                    setCreateForm((prev) => ({ ...prev, password: event.target.value }))
                  }
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                  onClick={() => setCreatePasswordVisible((prev) => !prev)}
                >
                  <Icon name={createPasswordVisible ? 'eyeOff' : 'eye'} size="md" />
                </button>
              </div>
            </div>
          </form>
        ) : (
          <div className="space-y-5">
            <div>
              <label className="input-label">{t('admin.proxies.batchInput')}</label>
              <textarea
                value={batchInput}
                rows={10}
                className="input font-mono text-sm"
                placeholder={t('admin.proxies.batchInputPlaceholder')}
                onChange={handleBatchInputChange}
              />
              <p className="input-hint mt-2">{t('admin.proxies.batchInputHint')}</p>
            </div>

            {batchParseResult.total > 0 ? (
              <div className="rounded-lg bg-gray-50 p-4 dark:bg-dark-700">
                <div className="flex items-center gap-4 text-sm">
                  <div className="flex items-center gap-1.5">
                    <Icon name="checkCircle" size="sm" strokeWidth={2} className="text-primary-500" />
                    <span className="text-gray-700 dark:text-gray-300">
                      {t('admin.proxies.parsedCount', { count: batchParseResult.valid })}
                    </span>
                  </div>
                  {batchParseResult.invalid > 0 ? (
                    <div className="flex items-center gap-1.5">
                      <Icon
                        name="exclamationCircle"
                        size="sm"
                        strokeWidth={2}
                        className="text-amber-500"
                      />
                      <span className="text-amber-600 dark:text-amber-400">
                        {t('admin.proxies.invalidCount', { count: batchParseResult.invalid })}
                      </span>
                    </div>
                  ) : null}
                  {batchParseResult.duplicate > 0 ? (
                    <div className="flex items-center gap-1.5">
                      <svg
                        className="h-4 w-4 text-gray-400"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 01-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 011.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 00-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 01-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 00-3.375-3.375h-1.5a1.125 1.125 0 01-1.125-1.125v-1.5a3.375 3.375 0 00-3.375-3.375H9.75"
                        />
                      </svg>
                      <span className="text-gray-500 dark:text-gray-400">
                        {t('admin.proxies.duplicateCount', { count: batchParseResult.duplicate })}
                      </span>
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>
        )}
      </BaseDialog>

      <BaseDialog
        show={showEditModal}
        title={t('admin.proxies.editProxy')}
        width="normal"
        onClose={closeEditModal}
        footer={
          <div className="flex justify-end gap-3">
            <button type="button" className="btn btn-secondary" onClick={closeEditModal}>
              {t('common.cancel')}
            </button>
            {editingProxy ? (
              <button
                type="submit"
                form="edit-proxy-form"
                disabled={submitting}
                className="btn btn-primary"
              >
                {submitting ? <Spinner className="-ml-1 mr-2 h-4 w-4" /> : null}
                {submitting ? t('admin.proxies.updating') : t('common.update')}
              </button>
            ) : null}
          </div>
        }
      >
        {editingProxy ? (
          <form id="edit-proxy-form" className="space-y-5" onSubmit={handleUpdateProxy}>
            <div>
              <label className="input-label">{t('admin.proxies.name')}</label>
              <input
                value={editForm.name}
                type="text"
                required
                className="input"
                onChange={(event) =>
                  setEditForm((prev) => ({ ...prev, name: event.target.value }))
                }
              />
            </div>
            <div>
              <label className="input-label">{t('admin.proxies.protocol')}</label>
              <Select
                modelValue={editForm.protocol}
                options={protocolSelectOptions}
                onUpdateModelValue={(value) =>
                  setEditForm((prev) => ({
                    ...prev,
                    protocol: String(value ?? 'http') as ProxyProtocol,
                  }))
                }
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="input-label">{t('admin.proxies.host')}</label>
                <input
                  value={editForm.host}
                  type="text"
                  required
                  className="input"
                  onChange={(event) =>
                    setEditForm((prev) => ({ ...prev, host: event.target.value }))
                  }
                />
              </div>
              <div>
                <label className="input-label">{t('admin.proxies.port')}</label>
                <input
                  value={editForm.port}
                  type="number"
                  required
                  min={1}
                  max={65535}
                  className="input"
                  onChange={(event) =>
                    setEditForm((prev) => ({
                      ...prev,
                      port: Number(event.target.value) || 0,
                    }))
                  }
                />
              </div>
            </div>
            <div>
              <label className="input-label">{t('admin.proxies.username')}</label>
              <input
                value={editForm.username}
                type="text"
                className="input"
                onChange={(event) =>
                  setEditForm((prev) => ({ ...prev, username: event.target.value }))
                }
              />
            </div>
            <div>
              <label className="input-label">{t('admin.proxies.password')}</label>
              <div className="relative">
                <input
                  value={editForm.password}
                  type={editPasswordVisible ? 'text' : 'password'}
                  placeholder={t('admin.proxies.leaveEmptyToKeep')}
                  className="input pr-10"
                  onChange={(event) => {
                    setEditForm((prev) => ({ ...prev, password: event.target.value }))
                    setEditPasswordDirty(true)
                  }}
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                  onClick={() => setEditPasswordVisible((prev) => !prev)}
                >
                  <Icon name={editPasswordVisible ? 'eyeOff' : 'eye'} size="md" />
                </button>
              </div>
            </div>
            <div>
              <label className="input-label">{t('admin.proxies.status')}</label>
              <Select
                modelValue={editForm.status}
                options={editStatusOptions}
                onUpdateModelValue={(value) =>
                  setEditForm((prev) => ({
                    ...prev,
                    status: String(value ?? 'active') as 'active' | 'inactive',
                  }))
                }
              />
            </div>
          </form>
        ) : null}
      </BaseDialog>

      <ConfirmDialog
        show={showDeleteDialog}
        title={t('admin.proxies.deleteProxy')}
        message={t('admin.proxies.deleteConfirm', { name: deletingProxy?.name })}
        confirmText={t('common.delete')}
        cancelText={t('common.cancel')}
        danger
        onConfirm={() => void confirmDelete()}
        onCancel={() => setShowDeleteDialog(false)}
      />

      <ConfirmDialog
        show={showBatchDeleteDialog}
        title={t('admin.proxies.batchDelete')}
        message={t('admin.proxies.batchDeleteConfirm', { count: selectedCount })}
        confirmText={t('common.delete')}
        cancelText={t('common.cancel')}
        danger
        onConfirm={() => void confirmBatchDelete()}
        onCancel={() => setShowBatchDeleteDialog(false)}
      />

      <ConfirmDialog
        show={showExportDataDialog}
        title={t('admin.proxies.dataExport')}
        message={t('admin.proxies.dataExportConfirmMessage')}
        confirmText={t('admin.proxies.dataExportConfirm')}
        cancelText={t('common.cancel')}
        onConfirm={() => void handleExportData()}
        onCancel={() => setShowExportDataDialog(false)}
      />

      <ImportDataModal
        show={showImportData}
        onClose={() => setShowImportData(false)}
        onImported={handleDataImported}
      />

      <BaseDialog
        show={showQualityReportDialog}
        title={t('admin.proxies.qualityReportTitle')}
        width="normal"
        onClose={closeQualityReportDialog}
        footer={
          <div className="flex justify-end">
            <button type="button" className="btn btn-secondary" onClick={closeQualityReportDialog}>
              {t('common.close')}
            </button>
          </div>
        }
      >
        {qualityReport ? (
          <div className="space-y-4">
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-dark-600 dark:bg-dark-700">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="text-sm text-gray-500 dark:text-gray-400">
                    {qualityReportProxy?.name || '-'}
                  </div>
                  <div className="mt-1 text-sm text-gray-700 dark:text-gray-200">
                    {qualityReport.summary}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-semibold text-gray-900 dark:text-white">
                    {qualityReport.score}
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">
                    {t('admin.proxies.qualityGrade', { grade: qualityReport.grade })}
                  </div>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-gray-600 dark:text-gray-300">
                <div>
                  {t('admin.proxies.qualityExitIP')}: {qualityReport.exit_ip || '-'}
                </div>
                <div>
                  {t('admin.proxies.qualityCountry')}: {qualityReport.country || '-'}
                </div>
                <div>
                  {t('admin.proxies.qualityBaseLatency')}:{' '}
                  {typeof qualityReport.base_latency_ms === 'number'
                    ? `${qualityReport.base_latency_ms}ms`
                    : '-'}
                </div>
                <div>
                  {t('admin.proxies.qualityCheckedAt')}:{' '}
                  {new Date(qualityReport.checked_at * 1000).toLocaleString()}
                </div>
              </div>
            </div>

            <div className="max-h-80 overflow-auto rounded-lg border border-gray-200 dark:border-dark-600">
              <table className="min-w-full divide-y divide-gray-200 text-sm dark:divide-dark-700">
                <thead className="bg-gray-50 text-xs uppercase text-gray-500 dark:bg-dark-800 dark:text-dark-400">
                  <tr>
                    <th className="px-3 py-2 text-left">{t('admin.proxies.qualityTableTarget')}</th>
                    <th className="px-3 py-2 text-left">{t('admin.proxies.qualityTableStatus')}</th>
                    <th className="px-3 py-2 text-left">HTTP</th>
                    <th className="px-3 py-2 text-left">{t('admin.proxies.qualityTableLatency')}</th>
                    <th className="px-3 py-2 text-left">{t('admin.proxies.qualityTableMessage')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 bg-white dark:divide-dark-700 dark:bg-dark-900">
                  {qualityReport.items.map((item) => (
                    <tr key={item.target}>
                      <td className="px-3 py-2 text-gray-900 dark:text-white">
                        {qualityTargetLabel(item.target)}
                      </td>
                      <td className="px-3 py-2">
                        <span className={`badge ${qualityStatusClass(item.status)}`}>
                          {qualityStatusLabel(item.status)}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-gray-600 dark:text-gray-300">
                        {item.http_status ?? '-'}
                      </td>
                      <td className="px-3 py-2 text-gray-600 dark:text-gray-300">
                        {typeof item.latency_ms === 'number' ? `${item.latency_ms}ms` : '-'}
                      </td>
                      <td className="px-3 py-2 text-gray-600 dark:text-gray-300">
                        <span>{item.message || '-'}</span>
                        {item.cf_ray ? (
                          <span className="ml-1 text-xs text-gray-400">(cf-ray: {item.cf_ray})</span>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </BaseDialog>

      <BaseDialog
        show={showAccountsModal}
        title={t('admin.proxies.accountsTitle', { name: accountsProxy?.name || '' })}
        width="normal"
        onClose={closeAccountsModal}
        footer={
          <div className="flex justify-end">
            <button type="button" className="btn btn-secondary" onClick={closeAccountsModal}>
              {t('common.close')}
            </button>
          </div>
        }
      >
        {accountsLoading ? (
          <div className="flex items-center justify-center py-8 text-sm text-gray-500">
            <Icon name="refresh" size="md" className="mr-2 animate-spin" />
            {t('common.loading')}
          </div>
        ) : proxyAccounts.length === 0 ? (
          <div className="py-6 text-center text-sm text-gray-500">
            {t('admin.proxies.accountsEmpty')}
          </div>
        ) : (
          <div className="max-h-80 overflow-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm dark:divide-dark-700">
              <thead className="bg-gray-50 text-xs uppercase text-gray-500 dark:bg-dark-800 dark:text-dark-400">
                <tr>
                  <th className="px-4 py-2 text-left">{t('admin.proxies.accountName')}</th>
                  <th className="px-4 py-2 text-left">{t('admin.accounts.columns.platformType')}</th>
                  <th className="px-4 py-2 text-left">{t('admin.proxies.accountNotes')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white dark:divide-dark-700 dark:bg-dark-900">
                {proxyAccounts.map((account) => (
                  <tr key={account.id}>
                    <td className="px-4 py-2 font-medium text-gray-900 dark:text-white">
                      {account.name}
                    </td>
                    <td className="px-4 py-2">
                      <PlatformTypeBadge platform={account.platform} type={account.type} />
                    </td>
                    <td className="px-4 py-2 text-gray-600 dark:text-gray-300">
                      {account.notes || '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </BaseDialog>
    </AppLayout>
  )
}
