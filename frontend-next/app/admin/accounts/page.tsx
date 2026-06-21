'use client'

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type MouseEvent as ReactMouseEvent,
} from 'react'
import { useI18n } from '@/lib/i18n'
import { useApp } from '@/context/AppContext'
import { useAuth } from '@/context/AuthContext'
import { adminAccountsAPI, type AdminAccountFilters } from '@/lib/adminAccounts'
import { adminProxiesAPI } from '@/lib/adminProxies'
import { adminGroupsAPI, type AdminGroup } from '@/lib/adminGroups'
import { useTableLoader } from '@/lib/useTableLoader'
import { useTableSelection } from '@/lib/useTableSelection'
import { useSwipeSelect } from '@/lib/useSwipeSelect'
import { buildOpenAIUsageRefreshKey } from '@/lib/accountUsageRefresh'
import { formatDateTime, formatRelativeTime } from '@/lib/format'
import { extractApiErrorMessage } from '@/lib/apiError'
import AppLayout from '@/components/layout/AppLayout'
import TablePageLayout from '@/components/layout/TablePageLayout'
import DataTable, {
  type DataTableCellContext,
  type DataTableHeaderContext,
} from '@/components/common/DataTable'
import HelpTooltip from '@/components/common/HelpTooltip'
import Pagination from '@/components/common/Pagination'
import ConfirmDialog from '@/components/common/ConfirmDialog'
import PlatformTypeBadge from '@/components/common/PlatformTypeBadge'
import Icon from '@/components/icons/Icon'
import type { SelectOption } from '@/components/common/Select'
import type { Column } from '@/components/common/types'
import CreateAccountModal from '@/components/account/CreateAccountModal'
import EditAccountModal from '@/components/account/EditAccountModal'
import BulkEditAccountModal from '@/components/account/BulkEditAccountModal'
import SyncFromCrsModal from '@/components/account/SyncFromCrsModal'
import TempUnschedStatusModal from '@/components/account/TempUnschedStatusModal'
import AccountTableActions from '@/components/admin/account/AccountTableActions'
import AccountTableFilters from '@/components/admin/account/AccountTableFilters'
import AccountBulkActionsBar from '@/components/admin/account/AccountBulkActionsBar'
import AccountActionMenu from '@/components/admin/account/AccountActionMenu'
import ImportDataModal from '@/components/admin/account/ImportDataModal'
import ReAuthAccountModal from '@/components/admin/account/ReAuthAccountModal'
import AccountTestModal from '@/components/admin/account/AccountTestModal'
import AccountStatsModal from '@/components/admin/account/AccountStatsModal'
import ScheduledTestsPanel from '@/components/admin/account/ScheduledTestsPanel'
import AccountStatusIndicator from '@/components/account/AccountStatusIndicator'
import AccountUsageCell from '@/components/account/AccountUsageCell'
import AccountTodayStatsCell from '@/components/account/AccountTodayStatsCell'
import AccountGroupsCell from '@/components/account/AccountGroupsCell'
import AccountCapacityCell from '@/components/account/AccountCapacityCell'
import ErrorPassthroughRulesModal from '@/components/admin/ErrorPassthroughRulesModal'
import TLSFingerprintProfilesModal from '@/components/admin/TLSFingerprintProfilesModal'
import type {
  Account,
  AccountPlatform,
  AccountType,
  ClaudeModel,
  Proxy,
  WindowStats,
} from '@/lib/types'

type AccountSortOrder = 'asc' | 'desc'
type AccountSortState = { sort_by: string; sort_order: AccountSortOrder }

type AccountBulkEditTarget =
  | {
      mode: 'selected'
      accountIds: number[]
      selectedPlatforms: AccountPlatform[]
      selectedTypes: AccountType[]
    }
  | {
      mode: 'filtered'
      filters: {
        platform?: string
        type?: string
        status?: string
        group?: string
        search?: string
        privacy_mode?: string
        sort_by?: string
        sort_order?: AccountSortOrder
      }
      previewCount: number
      selectedPlatforms: AccountPlatform[]
      selectedTypes: AccountType[]
    }

const DEFAULT_HIDDEN_COLUMNS = ['today_stats', 'proxy', 'notes', 'priority', 'rate_multiplier']
const HIDDEN_COLUMNS_KEY = 'account-hidden-columns'
const ACCOUNT_SORT_STORAGE_KEY = 'account-table-sort'
const AUTO_REFRESH_STORAGE_KEY = 'account-auto-refresh'
const AUTO_REFRESH_SILENT_WINDOW_MS = 15000
const ACCOUNT_UNGROUPED_GROUP_QUERY_VALUE = 'ungrouped'
const ACCOUNT_PRIVACY_MODE_UNSET_QUERY_VALUE = '__unset__'

const ACCOUNT_SORTABLE_KEYS = new Set([
  'name',
  'status',
  'schedulable',
  'priority',
  'rate_multiplier',
  'last_used_at',
  'created_at',
  'expires_at',
])

const AUTO_REFRESH_INTERVALS = [5, 10, 15, 30] as const

function loadInitialAccountSortState(): AccountSortState {
  const fallback: AccountSortState = { sort_by: 'name', sort_order: 'asc' }
  if (typeof window === 'undefined') return fallback
  try {
    const raw = localStorage.getItem(ACCOUNT_SORT_STORAGE_KEY)
    if (!raw) return fallback
    const parsed = JSON.parse(raw) as { key?: string; order?: string }
    const key = typeof parsed.key === 'string' ? parsed.key : ''
    if (!ACCOUNT_SORTABLE_KEYS.has(key)) return fallback
    return {
      sort_by: key,
      sort_order: parsed.order === 'desc' ? 'desc' : 'asc',
    }
  } catch {
    return fallback
  }
}

function loadSavedColumns(): Set<string> {
  const hiddenColumns = new Set<string>()
  if (typeof window === 'undefined') return hiddenColumns
  try {
    const saved = localStorage.getItem(HIDDEN_COLUMNS_KEY)
    if (saved) {
      const parsed = JSON.parse(saved) as string[]
      parsed.forEach((key) => hiddenColumns.add(key))
    } else {
      DEFAULT_HIDDEN_COLUMNS.forEach((key) => hiddenColumns.add(key))
    }
  } catch {
    DEFAULT_HIDDEN_COLUMNS.forEach((key) => hiddenColumns.add(key))
  }
  return hiddenColumns
}

function loadSavedAutoRefresh(): { enabled: boolean; intervalSeconds: (typeof AUTO_REFRESH_INTERVALS)[number] } {
  const fallback = { enabled: false, intervalSeconds: 30 as (typeof AUTO_REFRESH_INTERVALS)[number] }
  if (typeof window === 'undefined') return fallback
  try {
    const saved = localStorage.getItem(AUTO_REFRESH_STORAGE_KEY)
    if (!saved) return fallback
    const parsed = JSON.parse(saved) as { enabled?: boolean; interval_seconds?: number }
    const interval = Number(parsed.interval_seconds)
    return {
      enabled: parsed.enabled === true,
      intervalSeconds: AUTO_REFRESH_INTERVALS.includes(interval as (typeof AUTO_REFRESH_INTERVALS)[number])
        ? (interval as (typeof AUTO_REFRESH_INTERVALS)[number])
        : 30,
    }
  } catch {
    return fallback
  }
}

function buildDefaultTodayStats(): WindowStats {
  return { requests: 0, tokens: 0, cost: 0, standard_cost: 0, user_cost: 0 }
}

type OpenAICompactBadgeState = 'active' | 'blocked' | 'auto'

function getAntigravityTierFromRow(row: Account): string | null {
  if (row.platform !== 'antigravity') return null
  const extra = row.extra as Record<string, unknown> | undefined
  if (!extra) return null
  const lca = extra.load_code_assist as Record<string, unknown> | undefined
  if (!lca) return null
  const paid = lca.paidTier as Record<string, unknown> | undefined
  if (paid && typeof paid.id === 'string') return paid.id
  const current = lca.currentTier as Record<string, unknown> | undefined
  if (current && typeof current.id === 'string') return current.id
  return null
}

export default function AdminAccountsPage() {
  const { t } = useI18n()
  const appStore = useApp()
  const { isSimpleMode } = useAuth()

  const [proxies, setProxies] = useState<Proxy[]>([])
  const [groups, setGroups] = useState<AdminGroup[]>([])
  const accountTableRef = useRef<HTMLDivElement | null>(null)

  const [sortState, setSortState] = useState<AccountSortState>(loadInitialAccountSortState)
  const [hiddenColumns, setHiddenColumns] = useState<Set<string>>(loadSavedColumns)

  const {
    items: accounts,
    setItems: setAccounts,
    loading,
    params,
    setParams,
    pagination,
    setPagination,
    load: baseLoad,
    reload: baseReload,
    debouncedReload: baseDebouncedReload,
    handlePageChange: baseHandlePageChange,
    handlePageSizeChange: baseHandlePageSizeChange,
  } = useTableLoader<Account, AdminAccountFilters>({
    fetchFn: adminAccountsAPI.list,
    initialParams: {
      platform: '',
      type: '',
      status: '',
      privacy_mode: '',
      group: '',
      search: '',
      sort_by: sortState.sort_by,
      sort_order: sortState.sort_order,
    },
  })

  const {
    selectedIds: selIds,
    allVisibleSelected,
    isSelected,
    setSelectedIds,
    select,
    deselect,
    toggle: toggleSel,
    clear: clearSelection,
    removeMany: removeSelectedAccounts,
    toggleVisible,
    selectVisible: selectPage,
    batchUpdate,
  } = useTableSelection<Account>({
    rows: accounts,
    getId: (account) => account.id,
  })

  useSwipeSelect(accountTableRef, { isSelected, select, deselect, batchUpdate })

  const [showCreate, setShowCreate] = useState(false)
  const [showEdit, setShowEdit] = useState(false)
  const [showSync, setShowSync] = useState(false)
  const [showImportData, setShowImportData] = useState(false)
  const [showExportDataDialog, setShowExportDataDialog] = useState(false)
  const [includeProxyOnExport, setIncludeProxyOnExport] = useState(true)
  const [showBulkEdit, setShowBulkEdit] = useState(false)
  const [bulkEditTarget, setBulkEditTarget] = useState<AccountBulkEditTarget | null>(null)
  const [showTempUnsched, setShowTempUnsched] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [showReAuth, setShowReAuth] = useState(false)
  const [showTest, setShowTest] = useState(false)
  const [showStats, setShowStats] = useState(false)
  const [showErrorPassthrough, setShowErrorPassthrough] = useState(false)
  const [showTLSFingerprintProfiles, setShowTLSFingerprintProfiles] = useState(false)
  const [edAcc, setEdAcc] = useState<Account | null>(null)
  const [tempUnschedAcc, setTempUnschedAcc] = useState<Account | null>(null)
  const [deletingAcc, setDeletingAcc] = useState<Account | null>(null)
  const [reAuthAcc, setReAuthAcc] = useState<Account | null>(null)
  const [testingAcc, setTestingAcc] = useState<Account | null>(null)
  const [statsAcc, setStatsAcc] = useState<Account | null>(null)
  const [showSchedulePanel, setShowSchedulePanel] = useState(false)
  const [scheduleAcc, setScheduleAcc] = useState<Account | null>(null)
  const [scheduleModelOptions, setScheduleModelOptions] = useState<SelectOption[]>([])
  const [togglingSchedulable, setTogglingSchedulable] = useState<number | null>(null)
  const [menu, setMenu] = useState<{
    show: boolean
    acc: Account | null
    pos: { top: number; left: number } | null
  }>({ show: false, acc: null, pos: null })
  const [exportingData, setExportingData] = useState(false)

  const [showAccountToolsDropdown, setShowAccountToolsDropdown] = useState(false)
  const [showAutoRefreshDropdown, setShowAutoRefreshDropdown] = useState(false)
  const accountToolsDropdownRef = useRef<HTMLDivElement | null>(null)
  const autoRefreshDropdownRef = useRef<HTMLDivElement | null>(null)

  const savedAutoRefresh = useMemo(() => loadSavedAutoRefresh(), [])
  const [autoRefreshEnabled, setAutoRefreshEnabledState] = useState(savedAutoRefresh.enabled)
  const [autoRefreshIntervalSeconds, setAutoRefreshIntervalSeconds] = useState(savedAutoRefresh.intervalSeconds)
  const [autoRefreshCountdown, setAutoRefreshCountdown] = useState(0)
  const autoRefreshETagRef = useRef<string | null>(null)
  const autoRefreshFetchingRef = useRef(false)
  const autoRefreshSilentUntilRef = useRef(0)
  const [hasPendingListSync, setHasPendingListSync] = useState(false)

  const [todayStatsByAccountId, setTodayStatsByAccountId] = useState<Record<string, WindowStats>>({})
  const [todayStatsLoading, setTodayStatsLoading] = useState(false)
  const [todayStatsError, setTodayStatsError] = useState<string | null>(null)
  const todayStatsReqSeqRef = useRef(0)
  const pendingTodayStatsRefreshRef = useRef(false)
  const [usageManualRefreshToken, setUsageManualRefreshToken] = useState(0)
  const isFirstLoadRef = useRef(true)

  const selPlatforms = useMemo<AccountPlatform[]>(() => {
    const platforms = new Set(accounts.filter((a) => isSelected(a.id)).map((a) => a.platform))
    return [...platforms]
  }, [accounts, isSelected])

  const selTypes = useMemo<AccountType[]>(() => {
    const types = new Set(accounts.filter((a) => isSelected(a.id)).map((a) => a.type))
    return [...types]
  }, [accounts, isSelected])

  const isAnyModalOpen =
    showCreate ||
    showEdit ||
    showSync ||
    showImportData ||
    showExportDataDialog ||
    showBulkEdit ||
    showTempUnsched ||
    showDeleteDialog ||
    showReAuth ||
    showTest ||
    showStats ||
    showSchedulePanel ||
    showErrorPassthrough ||
    showTLSFingerprintProfiles

  const saveColumnsToStorage = useCallback((cols: Set<string>) => {
    try {
      localStorage.setItem(HIDDEN_COLUMNS_KEY, JSON.stringify([...cols]))
    } catch (e) {
      console.error('Failed to save columns:', e)
    }
  }, [])

  const saveAutoRefreshToStorage = useCallback((enabled: boolean, intervalSeconds: number) => {
    try {
      localStorage.setItem(
        AUTO_REFRESH_STORAGE_KEY,
        JSON.stringify({ enabled, interval_seconds: intervalSeconds }),
      )
    } catch (e) {
      console.error('Failed to save auto refresh settings:', e)
    }
  }, [])

  const isColumnVisible = useCallback((key: string) => !hiddenColumns.has(key), [hiddenColumns])

  const toggleColumn = useCallback(
    (key: string) => {
      setHiddenColumns((prev) => {
        const wasHidden = prev.has(key)
        const next = new Set(prev)
        if (next.has(key)) next.delete(key)
        else next.add(key)
        saveColumnsToStorage(next)
        if ((key === 'today_stats' || key === 'usage') && wasHidden) {
          void refreshTodayStatsBatch()
        }
        return next
      })
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [saveColumnsToStorage],
  )

  const autoRefreshIntervalLabel = useCallback(
    (sec: number) => {
      if (sec === 5) return t('admin.accounts.refreshInterval5s')
      if (sec === 10) return t('admin.accounts.refreshInterval10s')
      if (sec === 15) return t('admin.accounts.refreshInterval15s')
      if (sec === 30) return t('admin.accounts.refreshInterval30s')
      return `${sec}s`
    },
    [t],
  )

  const setAutoRefreshEnabled = useCallback(
    (enabled: boolean) => {
      setAutoRefreshEnabledState(enabled)
      saveAutoRefreshToStorage(enabled, autoRefreshIntervalSeconds)
      if (enabled) setAutoRefreshCountdown(autoRefreshIntervalSeconds)
      else setAutoRefreshCountdown(0)
    },
    [autoRefreshIntervalSeconds, saveAutoRefreshToStorage],
  )

  const setAutoRefreshInterval = useCallback(
    (seconds: (typeof AUTO_REFRESH_INTERVALS)[number]) => {
      setAutoRefreshIntervalSeconds(seconds)
      saveAutoRefreshToStorage(autoRefreshEnabled, seconds)
      if (autoRefreshEnabled) setAutoRefreshCountdown(seconds)
    },
    [autoRefreshEnabled, saveAutoRefreshToStorage],
  )

  const resetAutoRefreshCache = useCallback(() => {
    autoRefreshETagRef.current = null
  }, [])

  const refreshTodayStatsBatch = useCallback(async () => {
    if (hiddenColumns.has('today_stats') && hiddenColumns.has('usage')) {
      setTodayStatsLoading(false)
      setTodayStatsError(null)
      return
    }

    const accountIDs = accounts.map((account) => account.id)
    const reqSeq = ++todayStatsReqSeqRef.current
    if (accountIDs.length === 0) {
      setTodayStatsByAccountId({})
      setTodayStatsError(null)
      setTodayStatsLoading(false)
      return
    }

    setTodayStatsLoading(true)
    setTodayStatsError(null)

    try {
      const result = await adminAccountsAPI.getBatchTodayStats(accountIDs)
      if (reqSeq !== todayStatsReqSeqRef.current) return
      const serverStats = result.stats ?? {}
      const nextStats: Record<string, WindowStats> = {}
      for (const accountID of accountIDs) {
        const key = String(accountID)
        nextStats[key] = serverStats[key] ?? buildDefaultTodayStats()
      }
      setTodayStatsByAccountId(nextStats)
    } catch (error) {
      if (reqSeq !== todayStatsReqSeqRef.current) return
      setTodayStatsError('Failed')
      console.error('Failed to load account today stats:', error)
    } finally {
      if (reqSeq === todayStatsReqSeqRef.current) {
        setTodayStatsLoading(false)
      }
    }
  }, [accounts, hiddenColumns])

  const load = useCallback(async () => {
    setHasPendingListSync(false)
    resetAutoRefreshCache()
    pendingTodayStatsRefreshRef.current = false
    if (isFirstLoadRef.current) {
      setParams((prev) => ({ ...prev, lite: '1' }))
    }
    await baseLoad()
    if (isFirstLoadRef.current) {
      isFirstLoadRef.current = false
      setParams((prev) => {
        const next = { ...prev }
        delete next.lite
        return next
      })
    }
    await refreshTodayStatsBatch()
  }, [baseLoad, refreshTodayStatsBatch, resetAutoRefreshCache, setParams])

  const reload = useCallback(async () => {
    setHasPendingListSync(false)
    resetAutoRefreshCache()
    pendingTodayStatsRefreshRef.current = false
    await baseReload()
    await refreshTodayStatsBatch()
  }, [baseReload, refreshTodayStatsBatch, resetAutoRefreshCache])

  const debouncedReload = useCallback(() => {
    setHasPendingListSync(false)
    resetAutoRefreshCache()
    pendingTodayStatsRefreshRef.current = true
    baseDebouncedReload()
  }, [baseDebouncedReload, resetAutoRefreshCache])

  const handlePageChange = useCallback(
    (page: number) => {
      setHasPendingListSync(false)
      resetAutoRefreshCache()
      pendingTodayStatsRefreshRef.current = true
      baseHandlePageChange(page)
    },
    [baseHandlePageChange, resetAutoRefreshCache],
  )

  const handlePageSizeChange = useCallback(
    (size: number) => {
      setHasPendingListSync(false)
      resetAutoRefreshCache()
      pendingTodayStatsRefreshRef.current = true
      baseHandlePageSizeChange(size)
    },
    [baseHandlePageSizeChange, resetAutoRefreshCache],
  )

  const handleSort = useCallback(
    (key: string, order: AccountSortOrder) => {
      setSortState({ sort_by: key, sort_order: order })
      setParams((prev) => ({ ...prev, sort_by: key, sort_order: order }))
      setPagination((prev) => ({ ...prev, page: 1 }))
      setHasPendingListSync(false)
      resetAutoRefreshCache()
      pendingTodayStatsRefreshRef.current = true
      void load()
    },
    [load, resetAutoRefreshCache, setPagination, setParams],
  )

  useEffect(() => {
    if (!loading && pendingTodayStatsRefreshRef.current) {
      pendingTodayStatsRefreshRef.current = false
      void refreshTodayStatsBatch().catch((error) => {
        console.error('Failed to refresh account today stats after table load:', error)
      })
    }
  }, [loading, refreshTodayStatsBatch])

  const enterAutoRefreshSilentWindow = useCallback(() => {
    autoRefreshSilentUntilRef.current = Date.now() + AUTO_REFRESH_SILENT_WINDOW_MS
    setAutoRefreshCountdown(autoRefreshIntervalSeconds)
  }, [autoRefreshIntervalSeconds])

  const shouldReplaceAutoRefreshRow = useCallback((current: Account, next: Account) => {
    return (
      current.updated_at !== next.updated_at ||
      current.current_concurrency !== next.current_concurrency ||
      current.current_window_cost !== next.current_window_cost ||
      current.active_sessions !== next.active_sessions ||
      current.schedulable !== next.schedulable ||
      current.status !== next.status ||
      current.rate_limit_reset_at !== next.rate_limit_reset_at ||
      current.overload_until !== next.overload_until ||
      current.temp_unschedulable_until !== next.temp_unschedulable_until ||
      buildOpenAIUsageRefreshKey(current) !== buildOpenAIUsageRefreshKey(next)
    )
  }, [])

  const syncAccountRefs = useCallback(
    (nextAccount: Account) => {
      if (edAcc?.id === nextAccount.id) setEdAcc(nextAccount)
      if (reAuthAcc?.id === nextAccount.id) setReAuthAcc(nextAccount)
      if (tempUnschedAcc?.id === nextAccount.id) setTempUnschedAcc(nextAccount)
      if (deletingAcc?.id === nextAccount.id) setDeletingAcc(nextAccount)
      setMenu((prev) => (prev.acc?.id === nextAccount.id ? { ...prev, acc: nextAccount } : prev))
    },
    [deletingAcc, edAcc, reAuthAcc, tempUnschedAcc],
  )

  const mergeAccountsIncrementally = useCallback(
    (nextRows: Account[]) => {
      const currentRows = accounts
      const currentByID = new Map(currentRows.map((row) => [row.id, row]))
      let changed = nextRows.length !== currentRows.length
      const mergedRows = nextRows.map((nextRow) => {
        const currentRow = currentByID.get(nextRow.id)
        if (!currentRow) {
          changed = true
          return nextRow
        }
        if (shouldReplaceAutoRefreshRow(currentRow, nextRow)) {
          changed = true
          syncAccountRefs(nextRow)
          return nextRow
        }
        return currentRow
      })
      if (!changed) {
        for (let i = 0; i < mergedRows.length; i += 1) {
          if (mergedRows[i].id !== currentRows[i]?.id) {
            changed = true
            break
          }
        }
      }
      if (changed) setAccounts(mergedRows)
    },
    [accounts, setAccounts, shouldReplaceAutoRefreshRow, syncAccountRefs],
  )

  const refreshAccountsIncrementally = useCallback(async () => {
    if (autoRefreshFetchingRef.current) return
    autoRefreshFetchingRef.current = true
    try {
      const result = await adminAccountsAPI.listWithEtag(
        pagination.page,
        pagination.page_size,
        {
          platform: params.platform || undefined,
          type: params.type || undefined,
          status: params.status || undefined,
          privacy_mode: params.privacy_mode || undefined,
          group: params.group || undefined,
          search: params.search || undefined,
          sort_by: sortState.sort_by,
          sort_order: sortState.sort_order,
        },
        { etag: autoRefreshETagRef.current },
      )

      if (result.etag) autoRefreshETagRef.current = result.etag
      if (!result.notModified && result.data) {
        setPagination((prev) => ({
          ...prev,
          total: result.data?.total || 0,
          pages: result.data?.pages || 0,
        }))
        mergeAccountsIncrementally(result.data.items || [])
        setHasPendingListSync(false)
      }
      await refreshTodayStatsBatch()
    } catch (error) {
      console.error('Auto refresh failed:', error)
    } finally {
      autoRefreshFetchingRef.current = false
    }
  }, [
    mergeAccountsIncrementally,
    pagination.page,
    pagination.page_size,
    params,
    refreshTodayStatsBatch,
    setPagination,
    sortState.sort_by,
    sortState.sort_order,
  ])

  const handleManualRefresh = useCallback(async () => {
    await load()
    setUsageManualRefreshToken((v) => v + 1)
  }, [load])

  useEffect(() => {
    if (!autoRefreshEnabled) return undefined
    const timer = window.setInterval(() => {
      if (!autoRefreshEnabled) return
      if (document.hidden) return
      if (loading || autoRefreshFetchingRef.current) return
      if (isAnyModalOpen) return
      if (menu.show || showAccountToolsDropdown || showAutoRefreshDropdown) return
      if (Date.now() < autoRefreshSilentUntilRef.current) {
        setAutoRefreshCountdown(
          Math.max(0, Math.ceil((autoRefreshSilentUntilRef.current - Date.now()) / 1000)),
        )
        return
      }
      setAutoRefreshCountdown((prev) => {
        if (prev <= 0) {
          void refreshAccountsIncrementally()
          return autoRefreshIntervalSeconds
        }
        return prev - 1
      })
    }, 1000)
    return () => window.clearInterval(timer)
  }, [
    autoRefreshEnabled,
    autoRefreshIntervalSeconds,
    isAnyModalOpen,
    loading,
    menu.show,
    refreshAccountsIncrementally,
    showAccountToolsDropdown,
    showAutoRefreshDropdown,
  ])

  const buildAccountQueryFilters = useCallback(
    () => ({
      platform: params.platform || '',
      type: params.type || '',
      status: params.status || '',
      group: params.group || '',
      privacy_mode: params.privacy_mode || '',
      search: params.search || '',
      sort_by: sortState.sort_by,
      sort_order: sortState.sort_order,
    }),
    [params, sortState.sort_by, sortState.sort_order],
  )

  const accountMatchesCurrentFilters = useCallback(
    (account: Account) => {
      const filters = buildAccountQueryFilters()
      if (filters.platform && account.platform !== filters.platform) return false
      if (filters.type && account.type !== filters.type) return false
      if (filters.status) {
        const now = Date.now()
        const rateLimitResetAt = account.rate_limit_reset_at
          ? new Date(account.rate_limit_reset_at).getTime()
          : Number.NaN
        const isRateLimited = Number.isFinite(rateLimitResetAt) && rateLimitResetAt > now
        const tempUnschedUntil = account.temp_unschedulable_until
          ? new Date(account.temp_unschedulable_until).getTime()
          : Number.NaN
        const isTempUnschedulable = Number.isFinite(tempUnschedUntil) && tempUnschedUntil > now

        if (filters.status === 'active') {
          if (account.status !== 'active' || isRateLimited || isTempUnschedulable || !account.schedulable)
            return false
        } else if (filters.status === 'rate_limited') {
          if (account.status !== 'active' || !isRateLimited || isTempUnschedulable) return false
        } else if (filters.status === 'temp_unschedulable') {
          if (account.status !== 'active' || !isTempUnschedulable) return false
        } else if (filters.status === 'unschedulable') {
          if (
            account.status !== 'active' ||
            account.schedulable ||
            isRateLimited ||
            isTempUnschedulable
          )
            return false
        } else if (account.status !== filters.status) {
          return false
        }
      }
      if (filters.group) {
        const groupIds = account.group_ids ?? account.groups?.map((group) => group.id) ?? []
        if (filters.group === ACCOUNT_UNGROUPED_GROUP_QUERY_VALUE) {
          if (groupIds.length > 0) return false
        } else if (!groupIds.includes(Number(filters.group))) {
          return false
        }
      }
      const privacyMode =
        typeof account.extra?.privacy_mode === 'string' ? account.extra.privacy_mode : ''
      if (filters.privacy_mode) {
        if (filters.privacy_mode === ACCOUNT_PRIVACY_MODE_UNSET_QUERY_VALUE) {
          if (privacyMode.trim() !== '') return false
        } else if (privacyMode !== filters.privacy_mode) {
          return false
        }
      }
      const search = String(filters.search || '').trim().toLowerCase()
      if (search && !account.name.toLowerCase().includes(search)) return false
      return true
    },
    [buildAccountQueryFilters],
  )

  const mergeRuntimeFields = useCallback((oldAccount: Account, updatedAccount: Account): Account => ({
    ...updatedAccount,
    current_concurrency: updatedAccount.current_concurrency ?? oldAccount.current_concurrency,
    current_window_cost: updatedAccount.current_window_cost ?? oldAccount.current_window_cost,
    active_sessions: updatedAccount.active_sessions ?? oldAccount.active_sessions,
  }), [])

  const syncPaginationAfterLocalRemoval = useCallback(() => {
    setPagination((prev) => {
      const nextTotal = Math.max(0, prev.total - 1)
      const pages = nextTotal > 0 ? Math.ceil(nextTotal / prev.page_size) : 0
      const maxPage = Math.max(1, pages || 1)
      return {
        ...prev,
        total: nextTotal,
        pages,
        page: prev.page > maxPage ? maxPage : prev.page,
      }
    })
    setHasPendingListSync(true)
  }, [setPagination])

  const patchAccountInList = useCallback(
    (updatedAccount: Account) => {
      const index = accounts.findIndex((account) => account.id === updatedAccount.id)
      if (index === -1) return
      const mergedAccount = mergeRuntimeFields(accounts[index], updatedAccount)
      if (!accountMatchesCurrentFilters(mergedAccount)) {
        setAccounts(accounts.filter((account) => account.id !== mergedAccount.id))
        syncPaginationAfterLocalRemoval()
        removeSelectedAccounts([mergedAccount.id])
        setMenu((prev) =>
          prev.acc?.id === mergedAccount.id ? { show: false, acc: null, pos: null } : prev,
        )
        return
      }
      const nextAccounts = [...accounts]
      nextAccounts[index] = mergedAccount
      setAccounts(nextAccounts)
      syncAccountRefs(mergedAccount)
    },
    [
      accountMatchesCurrentFilters,
      accounts,
      mergeRuntimeFields,
      removeSelectedAccounts,
      setAccounts,
      syncAccountRefs,
      syncPaginationAfterLocalRemoval,
    ],
  )

  const handleAccountUpdated = useCallback(
    (updatedAccount: Account) => {
      patchAccountInList(updatedAccount)
      enterAutoRefreshSilentWindow()
    },
    [enterAutoRefreshSilentWindow, patchAccountInList],
  )

  const updateSchedulableInList = useCallback(
    (accountIds: number[], schedulable: boolean) => {
      if (accountIds.length === 0) return
      const idSet = new Set(accountIds)
      setAccounts(accounts.map((account) => (idSet.has(account.id) ? { ...account, schedulable } : account)))
    },
    [accounts, setAccounts],
  )

  const getAntigravityTierLabel = useCallback(
    (row: Account) => {
      const tier = getAntigravityTierFromRow(row)
      switch (tier) {
        case 'free-tier':
          return t('admin.accounts.tier.free')
        case 'g1-pro-tier':
          return t('admin.accounts.tier.pro')
        case 'g1-ultra-tier':
          return t('admin.accounts.tier.ultra')
        default:
          return null
      }
    },
    [t],
  )

  const getAntigravityTierClass = useCallback((row: Account) => {
    const tier = getAntigravityTierFromRow(row)
    switch (tier) {
      case 'free-tier':
        return 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'
      case 'g1-pro-tier':
        return 'bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-300'
      case 'g1-ultra-tier':
        return 'bg-purple-100 text-purple-600 dark:bg-purple-900/40 dark:text-purple-300'
      default:
        return ''
    }
  }, [])

  const getOpenAICompactState = useCallback((row: Account): OpenAICompactBadgeState | null => {
    if (row.platform !== 'openai' || (row.type !== 'oauth' && row.type !== 'apikey')) return null
    const extra = row.extra as Record<string, unknown> | undefined
    const mode = typeof extra?.openai_compact_mode === 'string' ? extra.openai_compact_mode : 'auto'
    if (mode === 'force_on') return 'active'
    if (mode === 'force_off') return 'blocked'
    if (typeof extra?.openai_compact_supported === 'boolean') {
      return extra.openai_compact_supported ? 'active' : 'blocked'
    }
    return 'auto'
  }, [])

  const getOpenAICompactMeta = useCallback(
    (row: Account) => {
      const state = getOpenAICompactState(row)
      if (!state) return null
      switch (state) {
        case 'active':
          return {
            label: t('admin.accounts.openai.compactSupported'),
            className: 'text-emerald-600 dark:text-emerald-300',
            dotClass: 'bg-emerald-500 shadow-[0_0_0_2px_rgba(16,185,129,0.14)]',
          }
        case 'blocked':
          return {
            label: t('admin.accounts.openai.compactUnsupported'),
            className: 'text-rose-600 dark:text-rose-300',
            dotClass: 'bg-rose-500 shadow-[0_0_0_2px_rgba(244,63,94,0.14)]',
          }
        case 'auto':
          return {
            label: t('admin.accounts.openai.compactAuto'),
            className: 'text-slate-500 dark:text-slate-400',
            dotClass: 'bg-slate-300 dark:bg-slate-500',
          }
      }
    },
    [getOpenAICompactState, t],
  )

  const getOpenAICompactTitle = useCallback(
    (row: Account) => {
      const extra = row.extra as Record<string, unknown> | undefined
      const checkedAt =
        typeof extra?.openai_compact_checked_at === 'string' ? extra.openai_compact_checked_at : ''
      const label = getOpenAICompactMeta(row)?.label || ''
      if (!checkedAt) return label
      return `${label} | ${t('admin.accounts.openai.compactLastChecked')}: ${formatDateTime(new Date(checkedAt))}`
    },
    [getOpenAICompactMeta, t],
  )

  const formatExpiresAt = useCallback((value: number | null) => {
    if (!value) return '-'
    return formatDateTime(new Date(value * 1000), {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }, 'sv-SE')
  }, [])

  const isExpired = useCallback((value: number | null) => {
    if (!value) return false
    return value * 1000 <= Date.now()
  }, [])

  const allColumns = useMemo((): Column[] => {
    const c: Column[] = [
      { key: 'select', label: '', sortable: false },
      { key: 'name', label: t('admin.accounts.columns.name'), sortable: true },
      { key: 'platform_type', label: t('admin.accounts.columns.platformType'), sortable: false },
      { key: 'capacity', label: t('admin.accounts.columns.capacity'), sortable: false },
      { key: 'status', label: t('admin.accounts.columns.status'), sortable: true },
      { key: 'schedulable', label: t('admin.accounts.columns.schedulable'), sortable: true },
      { key: 'today_stats', label: t('admin.accounts.columns.todayStats'), sortable: false },
    ]
    if (!isSimpleMode) {
      c.push({ key: 'groups', label: t('admin.accounts.columns.groups'), sortable: false })
    }
    c.push(
      { key: 'usage', label: t('admin.accounts.columns.usageWindows'), sortable: false },
      { key: 'proxy', label: t('admin.accounts.columns.proxy'), sortable: false },
      { key: 'priority', label: t('admin.accounts.columns.priority'), sortable: true },
      { key: 'rate_multiplier', label: t('admin.accounts.columns.billingRateMultiplier'), sortable: true },
      { key: 'last_used_at', label: t('admin.accounts.columns.lastUsed'), sortable: true },
      { key: 'created_at', label: t('admin.accounts.columns.createdAt'), sortable: true },
      { key: 'expires_at', label: t('admin.accounts.columns.expiresAt'), sortable: true },
      { key: 'notes', label: t('admin.accounts.columns.notes'), sortable: false },
      { key: 'actions', label: t('admin.accounts.columns.actions'), sortable: false },
    )
    return c
  }, [isSimpleMode, t])

  const toggleableColumns = useMemo(
    () => allColumns.filter((col) => col.key !== 'select' && col.key !== 'name' && col.key !== 'actions'),
    [allColumns],
  )

  const columns = useMemo(
    () =>
      allColumns.filter(
        (col) =>
          col.key === 'select' || col.key === 'name' || col.key === 'actions' || !hiddenColumns.has(col.key),
      ),
    [allColumns, hiddenColumns],
  )

  const openMenu = useCallback((account: Account, e: ReactMouseEvent<HTMLButtonElement>) => {
    const target = e.currentTarget
    const rect = target.getBoundingClientRect()
    const menuWidth = 200
    const menuHeight = 240
    const padding = 8
    const viewportWidth = window.innerWidth
    const viewportHeight = window.innerHeight

    let left: number
    let top: number

    if (viewportWidth < 768) {
      left = Math.max(
        padding,
        Math.min(rect.left + rect.width / 2 - menuWidth / 2, viewportWidth - menuWidth - padding),
      )
      top = rect.bottom + 4
      if (top + menuHeight > viewportHeight - padding) {
        top = rect.top - menuHeight - 4
        if (top < padding) top = padding
      }
    } else {
      left = Math.max(padding, Math.min(e.clientX - menuWidth, viewportWidth - menuWidth - padding))
      top = e.clientY
      if (top + menuHeight > viewportHeight - padding) {
        top = viewportHeight - menuHeight - padding
      }
    }

    setMenu({ show: true, acc: account, pos: { top, left } })
  }, [])

  const toggleSelectAllVisible = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      toggleVisible(event.target.checked)
    },
    [toggleVisible],
  )

  const handleBulkDelete = useCallback(async () => {
    if (!window.confirm(t('common.confirm'))) return
    try {
      await Promise.all(selIds.map((id) => adminAccountsAPI.delete(id)))
      clearSelection()
      await reload()
    } catch (error) {
      console.error('Failed to bulk delete accounts:', error)
    }
  }, [clearSelection, reload, selIds, t])

  const handleBulkResetStatus = useCallback(async () => {
    if (!window.confirm(t('common.confirm'))) return
    try {
      const result = await adminAccountsAPI.batchClearError(selIds)
      if (result.failed > 0) {
        appStore.showError(
          t('admin.accounts.bulkActions.partialSuccess', { success: result.success, failed: result.failed }),
        )
      } else {
        appStore.showSuccess(t('admin.accounts.bulkActions.resetStatusSuccess', { count: result.success }))
        clearSelection()
      }
      await reload()
    } catch (error) {
      console.error('Failed to bulk reset status:', error)
      appStore.showError(String(error))
    }
  }, [appStore, clearSelection, reload, selIds, t])

  const handleBulkRefreshToken = useCallback(async () => {
    if (!window.confirm(t('common.confirm'))) return
    try {
      const result = await adminAccountsAPI.batchRefresh(selIds)
      if (result.failed > 0) {
        appStore.showError(
          t('admin.accounts.bulkActions.partialSuccess', { success: result.success, failed: result.failed }),
        )
      } else {
        appStore.showSuccess(t('admin.accounts.bulkActions.refreshTokenSuccess', { count: result.success }))
        clearSelection()
      }
      await reload()
    } catch (error) {
      console.error('Failed to bulk refresh token:', error)
      appStore.showError(String(error))
    }
  }, [appStore, clearSelection, reload, selIds, t])

  const normalizeBulkSchedulableResult = useCallback(
    (
      result: {
        success?: number
        failed?: number
        success_ids?: number[]
        failed_ids?: number[]
        results?: Array<{ account_id: number; success: boolean }>
      },
      accountIds: number[],
    ) => {
      const responseSuccessIds = Array.isArray(result.success_ids) ? result.success_ids : []
      const responseFailedIds = Array.isArray(result.failed_ids) ? result.failed_ids : []
      if (responseSuccessIds.length > 0 || responseFailedIds.length > 0) {
        return {
          successIds: responseSuccessIds,
          failedIds: responseFailedIds,
          successCount: typeof result.success === 'number' ? result.success : responseSuccessIds.length,
          failedCount: typeof result.failed === 'number' ? result.failed : responseFailedIds.length,
          hasIds: true,
          hasCounts: true,
        }
      }
      const results = Array.isArray(result.results) ? result.results : []
      if (results.length > 0) {
        const successIds = results.filter((item) => item.success).map((item) => item.account_id)
        const failedIds = results.filter((item) => !item.success).map((item) => item.account_id)
        return {
          successIds,
          failedIds,
          successCount: typeof result.success === 'number' ? result.success : successIds.length,
          failedCount: typeof result.failed === 'number' ? result.failed : failedIds.length,
          hasIds: true,
          hasCounts: true,
        }
      }
      const hasExplicitCounts = typeof result.success === 'number' || typeof result.failed === 'number'
      const successCount = typeof result.success === 'number' ? result.success : 0
      const failedCount = typeof result.failed === 'number' ? result.failed : 0
      if (hasExplicitCounts && failedCount === 0 && successCount === accountIds.length && accountIds.length > 0) {
        return {
          successIds: accountIds,
          failedIds: [] as number[],
          successCount,
          failedCount,
          hasIds: true,
          hasCounts: true,
        }
      }
      return {
        successIds: [] as number[],
        failedIds: [] as number[],
        successCount,
        failedCount,
        hasIds: false,
        hasCounts: hasExplicitCounts,
      }
    },
    [],
  )

  const handleBulkToggleSchedulable = useCallback(
    async (schedulable: boolean) => {
      const accountIds = [...selIds]
      try {
        const result = await adminAccountsAPI.bulkUpdate(accountIds, { schedulable })
        const { successIds, failedIds, successCount, failedCount, hasIds, hasCounts } =
          normalizeBulkSchedulableResult(result, accountIds)
        if (!hasIds && !hasCounts) {
          appStore.showError(t('admin.accounts.bulkSchedulableResultUnknown'))
          setSelectedIds(accountIds)
          void load()
          return
        }
        if (successIds.length > 0) updateSchedulableInList(successIds, schedulable)
        if (successCount > 0 && failedCount === 0) {
          appStore.showSuccess(
            schedulable
              ? t('admin.accounts.bulkSchedulableEnabled', { count: successCount })
              : t('admin.accounts.bulkSchedulableDisabled', { count: successCount }),
          )
        }
        if (failedCount > 0) {
          const message =
            hasCounts || hasIds
              ? t('admin.accounts.bulkSchedulablePartial', { success: successCount, failed: failedCount })
              : t('admin.accounts.bulkSchedulableResultUnknown')
          appStore.showError(message)
          setSelectedIds(failedIds.length > 0 ? failedIds : accountIds)
        } else if (hasIds) {
          clearSelection()
        } else {
          setSelectedIds(accountIds)
        }
      } catch (error) {
        console.error('Failed to bulk toggle schedulable:', error)
        appStore.showError(t('common.error'))
      }
    },
    [
      appStore,
      clearSelection,
      load,
      normalizeBulkSchedulableResult,
      selIds,
      setSelectedIds,
      t,
      updateSchedulableInList,
    ],
  )

  const buildBulkEditFilterSnapshot = useCallback(
    () => ({
      platform: params.platform || '',
      type: params.type || '',
      status: params.status || '',
      group: params.group || '',
      search: params.search || '',
      privacy_mode: params.privacy_mode || '',
      sort_by: sortState.sort_by,
      sort_order: sortState.sort_order,
    }),
    [params, sortState.sort_by, sortState.sort_order],
  )

  const collectSelectionMetadata = useCallback((rows: Account[]) => {
    const selectedPlatforms = Array.from(new Set(rows.map((account) => account.platform)))
    const selectedTypes = Array.from(new Set(rows.map((account) => account.type)))
    return { selectedPlatforms, selectedTypes }
  }, [])

  const openBulkEditSelected = useCallback(() => {
    setBulkEditTarget({
      mode: 'selected',
      accountIds: [...selIds],
      selectedPlatforms: [...selPlatforms],
      selectedTypes: [...selTypes],
    })
    setShowBulkEdit(true)
  }, [selIds, selPlatforms, selTypes])

  const openBulkEditFiltered = useCallback(async () => {
    const filters = buildBulkEditFilterSnapshot()
    const preview = await adminAccountsAPI.list(1, 100, filters)
    const { selectedPlatforms, selectedTypes } = collectSelectionMetadata(preview.items)
    setBulkEditTarget({
      mode: 'filtered',
      filters,
      previewCount: preview.total,
      selectedPlatforms,
      selectedTypes,
    })
    setShowBulkEdit(true)
  }, [buildBulkEditFilterSnapshot, collectSelectionMetadata])

  const handleBulkUpdated = useCallback(() => {
    setShowBulkEdit(false)
    setBulkEditTarget(null)
    clearSelection()
    void reload()
  }, [clearSelection, reload])

  const formatExportTimestamp = useCallback(() => {
    const now = new Date()
    const pad2 = (value: number) => String(value).padStart(2, '0')
    return `${now.getFullYear()}${pad2(now.getMonth() + 1)}${pad2(now.getDate())}${pad2(now.getHours())}${pad2(now.getMinutes())}${pad2(now.getSeconds())}`
  }, [])

  const openExportDataDialog = useCallback(() => {
    setIncludeProxyOnExport(true)
    setShowExportDataDialog(true)
  }, [])

  const handleExportData = useCallback(async () => {
    if (exportingData) return
    setExportingData(true)
    try {
      const dataPayload = await adminAccountsAPI.exportData(
        selIds.length > 0
          ? { ids: selIds, includeProxies: includeProxyOnExport }
          : { includeProxies: includeProxyOnExport, filters: buildAccountQueryFilters() },
      )
      const timestamp = formatExportTimestamp()
      const filename = `sub2api-account-${timestamp}.json`
      const blob = new Blob([JSON.stringify(dataPayload, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = filename
      link.click()
      URL.revokeObjectURL(url)
      appStore.showSuccess(t('admin.accounts.dataExported'))
    } catch (error) {
      appStore.showError(extractApiErrorMessage(error) || t('admin.accounts.dataExportFailed'))
    } finally {
      setExportingData(false)
      setShowExportDataDialog(false)
    }
  }, [
    appStore,
    buildAccountQueryFilters,
    exportingData,
    formatExportTimestamp,
    includeProxyOnExport,
    selIds,
    t,
  ])

  const handleToggleSchedulable = useCallback(
    async (account: Account) => {
      const nextSchedulable = !account.schedulable
      setTogglingSchedulable(account.id)
      try {
        const updated = await adminAccountsAPI.setSchedulable(account.id, nextSchedulable)
        updateSchedulableInList([account.id], updated?.schedulable ?? nextSchedulable)
        enterAutoRefreshSilentWindow()
      } catch (error) {
        console.error('Failed to toggle schedulable:', error)
        appStore.showError(t('admin.accounts.failedToToggleSchedulable'))
      } finally {
        setTogglingSchedulable(null)
      }
    },
    [appStore, enterAutoRefreshSilentWindow, t, updateSchedulableInList],
  )

  const handleDelete = useCallback((account: Account) => {
    setDeletingAcc(account)
    setShowDeleteDialog(true)
  }, [])

  const confirmDelete = useCallback(async () => {
    if (!deletingAcc) return
    try {
      await adminAccountsAPI.delete(deletingAcc.id)
      setShowDeleteDialog(false)
      setDeletingAcc(null)
      await reload()
    } catch (error) {
      console.error('Failed to delete account:', error)
    }
  }, [deletingAcc, reload])

  const handleRefresh = useCallback(
    async (account: Account) => {
      try {
        const updated = await adminAccountsAPI.refreshCredentials(account.id)
        patchAccountInList(updated)
        enterAutoRefreshSilentWindow()
      } catch (error) {
        console.error('Failed to refresh credentials:', error)
      }
    },
    [enterAutoRefreshSilentWindow, patchAccountInList],
  )

  const handleRecoverState = useCallback(
    async (account: Account) => {
      try {
        const updated = await adminAccountsAPI.recoverState(account.id)
        patchAccountInList(updated)
        enterAutoRefreshSilentWindow()
        appStore.showSuccess(t('admin.accounts.recoverStateSuccess'))
      } catch (error) {
        console.error('Failed to recover account state:', error)
        appStore.showError(extractApiErrorMessage(error) || t('admin.accounts.recoverStateFailed'))
      }
    },
    [appStore, enterAutoRefreshSilentWindow, patchAccountInList, t],
  )

  const handleResetQuota = useCallback(
    async (account: Account) => {
      try {
        const updated = await adminAccountsAPI.resetAccountQuota(account.id)
        patchAccountInList(updated)
        enterAutoRefreshSilentWindow()
        appStore.showSuccess(t('common.success'))
      } catch (error) {
        console.error('Failed to reset quota:', error)
      }
    },
    [appStore, enterAutoRefreshSilentWindow, patchAccountInList, t],
  )

  const handleSetPrivacy = useCallback(
    async (account: Account) => {
      try {
        const updated = await adminAccountsAPI.setPrivacy(account.id)
        patchAccountInList(updated)
        enterAutoRefreshSilentWindow()
        appStore.showSuccess(t('common.success'))
      } catch (error) {
        console.error('Failed to set privacy:', error)
        appStore.showError(extractApiErrorMessage(error) || t('admin.accounts.privacyFailed'))
      }
    },
    [appStore, enterAutoRefreshSilentWindow, patchAccountInList, t],
  )

  const handleSchedule = useCallback(async (account: Account) => {
    setScheduleAcc(account)
    setScheduleModelOptions([])
    setShowSchedulePanel(true)
    try {
      const models = await adminAccountsAPI.getAvailableModels(account.id)
      setScheduleModelOptions(
        models.map((m: ClaudeModel) => ({ value: m.id, label: m.display_name || m.id })),
      )
    } catch {
      setScheduleModelOptions([])
    }
  }, [])

  const headerCells = useMemo(
    () => ({
      select: () => (
        <input
          type="checkbox"
          className="h-4 w-4 cursor-pointer rounded border-gray-300 text-primary-600 focus:ring-primary-500"
          checked={allVisibleSelected}
          onClick={(e) => e.stopPropagation()}
          onChange={toggleSelectAllVisible}
        />
      ),
      usage: ({ column }: DataTableHeaderContext) => (
        <div className="flex items-center">
          <span>{column.label}</span>
          <HelpTooltip content={t('admin.accounts.usageWindowsHint')} widthClass="w-72" />
        </div>
      ),
    }),
    [allVisibleSelected, t, toggleSelectAllVisible],
  )

  const tableCells = useMemo(() => {
    const cells: Record<string, (ctx: DataTableCellContext) => React.ReactNode> = {
      select: ({ row }) => (
        <input
          type="checkbox"
          className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
          checked={isSelected((row as Account).id)}
          onChange={() => toggleSel((row as Account).id)}
        />
      ),
      name: ({ row, value }) => {
        const account = row as Account
        const email =
          account.extra?.email_address || account.extra?.email || account.credentials?.email
        return (
          <div className="flex flex-col">
            <span className="font-medium text-gray-900 dark:text-white">{value}</span>
            {email ? (
              <span
                className="max-w-[200px] truncate text-xs text-gray-500 dark:text-gray-400"
                title={String(email)}
              >
                {String(email)}
              </span>
            ) : null}
          </div>
        )
      },
      notes: ({ value }) =>
        value ? (
          <span className="block max-w-xs truncate text-sm text-gray-600 dark:text-gray-300" title={value}>
            {value}
          </span>
        ) : (
          <span className="text-sm text-gray-400 dark:text-dark-500">-</span>
        ),
      platform_type: ({ row }) => {
        const account = row as Account
        const compactMeta = getOpenAICompactMeta(account)
        return (
          <div className="flex min-w-0 flex-col gap-1">
            <div className="flex flex-wrap items-center gap-1">
              <PlatformTypeBadge
                platform={account.platform}
                type={account.type}
                planType={
                  typeof account.credentials?.plan_type === 'string'
                    ? account.credentials.plan_type
                    : undefined
                }
                privacyMode={
                  typeof account.extra?.privacy_mode === 'string' ? account.extra.privacy_mode : undefined
                }
                subscriptionExpiresAt={
                  typeof account.credentials?.subscription_expires_at === 'string'
                    ? account.credentials.subscription_expires_at
                    : undefined
                }
              />
              {getAntigravityTierLabel(account) ? (
                <span
                  className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-medium ${getAntigravityTierClass(account)}`}
                >
                  {getAntigravityTierLabel(account)}
                </span>
              ) : null}
            </div>
            {compactMeta ? (
              <div
                className={`inline-flex items-center gap-1.5 pl-0.5 text-[11px] font-medium leading-4 ${compactMeta.className}`}
                title={getOpenAICompactTitle(account)}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${compactMeta.dotClass}`} />
                <span>{compactMeta.label}</span>
              </div>
            ) : null}
          </div>
        )
      },
      capacity: ({ row }) => <AccountCapacityCell account={row as Account} />,
      status: ({ row }) => (
        <div className="flex items-center gap-1.5">
          <AccountStatusIndicator
            account={row as Account}
            onShowTempUnsched={(account) => {
              setTempUnschedAcc(account)
              setShowTempUnsched(true)
            }}
          />
        </div>
      ),
      schedulable: ({ row }) => {
        const account = row as Account
        return (
          <button
            type="button"
            onClick={() => void handleToggleSchedulable(account)}
            disabled={togglingSchedulable === account.id}
            className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:focus:ring-offset-dark-800 ${
              account.schedulable
                ? 'bg-primary-500 hover:bg-primary-600'
                : 'bg-gray-200 hover:bg-gray-300 dark:bg-dark-600 dark:hover:bg-dark-500'
            }`}
            title={
              account.schedulable
                ? t('admin.accounts.schedulableEnabled')
                : t('admin.accounts.schedulableDisabled')
            }
          >
            <span
              className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                account.schedulable ? 'translate-x-4' : 'translate-x-0'
              }`}
            />
          </button>
        )
      },
      today_stats: ({ row }) => (
        <AccountTodayStatsCell
          stats={todayStatsByAccountId[String((row as Account).id)] ?? null}
          loading={todayStatsLoading}
          error={todayStatsError}
        />
      ),
      groups: ({ row }) => (
        <AccountGroupsCell groups={(row as Account).groups} maxDisplay={4} />
      ),
      usage: ({ row }) => (
        <AccountUsageCell
          account={row as Account}
          todayStats={todayStatsByAccountId[String((row as Account).id)] ?? null}
          todayStatsLoading={todayStatsLoading}
          manualRefreshToken={usageManualRefreshToken}
        />
      ),
      proxy: ({ row }) => {
        const account = row as Account
        return account.proxy ? (
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-700 dark:text-gray-300">{account.proxy.name}</span>
            {account.proxy.country_code ? (
              <span className="text-xs text-gray-500 dark:text-gray-400">
                ({account.proxy.country_code})
              </span>
            ) : null}
          </div>
        ) : (
          <span className="text-sm text-gray-400 dark:text-dark-500">-</span>
        )
      },
      rate_multiplier: ({ row }) => (
        <span className="font-mono text-sm text-gray-700 dark:text-gray-300">
          {((row as Account).rate_multiplier ?? 1).toFixed(2)}x
        </span>
      ),
      priority: ({ value }) => <span className="text-sm text-gray-700 dark:text-gray-300">{value}</span>,
      last_used_at: ({ value }) => (
        <span className="text-sm text-gray-500 dark:text-dark-400">{formatRelativeTime(value, t)}</span>
      ),
      created_at: ({ value }) => (
        <span className="text-sm text-gray-500 dark:text-dark-400">{formatDateTime(value)}</span>
      ),
      expires_at: ({ row, value }) => {
        const account = row as Account
        return (
          <div className="flex flex-col items-start gap-1">
            <span className="text-sm text-gray-500 dark:text-dark-400">{formatExpiresAt(value)}</span>
            {isExpired(value) || (account.auto_pause_on_expired && value) ? (
              <div className="flex items-center gap-1">
                {isExpired(value) ? (
                  <span className="inline-flex items-center rounded-md bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
                    {t('admin.accounts.expired')}
                  </span>
                ) : null}
                {account.auto_pause_on_expired && value ? (
                  <span className="inline-flex items-center rounded-md bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
                    {t('admin.accounts.autoPauseOnExpired')}
                  </span>
                ) : null}
              </div>
            ) : null}
          </div>
        )
      },
      actions: ({ row }) => {
        const account = row as Account
        return (
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => {
                setEdAcc(account)
                setShowEdit(true)
              }}
              className="flex flex-col items-center gap-0.5 rounded-lg p-1.5 text-gray-500 transition-colors hover:bg-gray-100 hover:text-primary-600 dark:hover:bg-dark-700 dark:hover:text-primary-400"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10"
                />
              </svg>
              <span className="text-xs">{t('common.edit')}</span>
            </button>
            <button
              type="button"
              onClick={() => handleDelete(account)}
              className="flex flex-col items-center gap-0.5 rounded-lg p-1.5 text-gray-500 transition-colors hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20 dark:hover:text-red-400"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"
                />
              </svg>
              <span className="text-xs">{t('common.delete')}</span>
            </button>
            <button
              type="button"
              onClick={(e) => openMenu(account, e)}
              className="flex flex-col items-center gap-0.5 rounded-lg p-1.5 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 dark:hover:bg-dark-700 dark:hover:text-white"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M6.75 12a.75.75 0 11-1.5 0 .75.75 0 011.5 0zM12.75 12a.75.75 0 11-1.5 0 .75.75 0 011.5 0zM18.75 12a.75.75 0 11-1.5 0 .75.75 0 011.5 0z"
                />
              </svg>
              <span className="text-xs">{t('common.more')}</span>
            </button>
          </div>
        )
      },
    }
    return cells
  }, [
    getAntigravityTierClass,
    getAntigravityTierLabel,
    getOpenAICompactMeta,
    getOpenAICompactTitle,
    handleDelete,
    handleToggleSchedulable,
    isExpired,
    isSelected,
    formatExpiresAt,
    openMenu,
    t,
    todayStatsByAccountId,
    todayStatsError,
    todayStatsLoading,
    togglingSchedulable,
    toggleSel,
    usageManualRefreshToken,
  ])

  useEffect(() => {
    void load()
    void Promise.all([adminProxiesAPI.getAll(), adminGroupsAPI.getAll()])
      .then(([p, g]) => {
        setProxies(p)
        setGroups(g)
      })
      .catch((error) => {
        console.error('Failed to load proxies/groups:', error)
      })

    if (autoRefreshEnabled) {
      setAutoRefreshCountdown(autoRefreshIntervalSeconds)
    }

    const handleScroll = () => setMenu((prev) => ({ ...prev, show: false }))
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement
      if (accountToolsDropdownRef.current && !accountToolsDropdownRef.current.contains(target)) {
        setShowAccountToolsDropdown(false)
      }
      if (autoRefreshDropdownRef.current && !autoRefreshDropdownRef.current.contains(target)) {
        setShowAutoRefreshDropdown(false)
      }
    }

    window.addEventListener('scroll', handleScroll, true)
    document.addEventListener('click', handleClickOutside)
    return () => {
      window.removeEventListener('scroll', handleScroll, true)
      document.removeEventListener('click', handleClickOutside)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const closeAccountToolsDropdown = () => setShowAccountToolsDropdown(false)

  const syncPendingListChanges = useCallback(async () => {
    setHasPendingListSync(false)
    await load()
    setUsageManualRefreshToken((v) => v + 1)
  }, [load])

  return (
    <AppLayout>
      <TablePageLayout
        filters={
          <>
            <div className="flex flex-wrap-reverse items-start justify-between gap-3">
              <AccountTableFilters
                searchQuery={params.search || ''}
                filters={params}
                groups={groups}
                onSearchQueryChange={(value) => {
                  setParams((prev) => ({ ...prev, search: value }))
                  debouncedReload()
                }}
                onFiltersChange={(newFilters) =>
                  setParams((prev) => ({
                    ...prev,
                    platform: String(newFilters.platform ?? prev.platform ?? ''),
                    type: String(newFilters.type ?? prev.type ?? ''),
                    status: String(newFilters.status ?? prev.status ?? ''),
                    group: String(newFilters.group ?? prev.group ?? ''),
                    privacy_mode: String(newFilters.privacy_mode ?? prev.privacy_mode ?? ''),
                  }))
                }
                onChange={debouncedReload}
              />
              <AccountTableActions
                loading={loading}
                onRefresh={() => void handleManualRefresh()}
                onCreate={() => setShowCreate(true)}
                after={
                  <>
                    <div className="relative" ref={autoRefreshDropdownRef}>
                      <button
                        type="button"
                        onClick={() => {
                          setShowAutoRefreshDropdown((v) => !v)
                          setShowAccountToolsDropdown(false)
                        }}
                        className="btn btn-secondary px-2 md:px-3"
                        title={t('admin.accounts.autoRefresh')}
                      >
                        <Icon
                          name="refresh"
                          size="sm"
                          className={autoRefreshEnabled ? 'animate-spin' : ''}
                        />
                        <span className="hidden md:inline">
                          {autoRefreshEnabled
                            ? t('admin.accounts.autoRefreshCountdown', { seconds: autoRefreshCountdown })
                            : t('admin.accounts.autoRefresh')}
                        </span>
                      </button>
                      {showAutoRefreshDropdown ? (
                        <div className="absolute right-0 z-50 mt-2 w-56 origin-top-right rounded-lg border border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-800">
                          <div className="p-2">
                            <button
                              type="button"
                              onClick={() => setAutoRefreshEnabled(!autoRefreshEnabled)}
                              className="flex w-full items-center justify-between rounded-md px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-700"
                            >
                              <span>{t('admin.accounts.enableAutoRefresh')}</span>
                              {autoRefreshEnabled ? (
                                <Icon name="check" size="sm" className="text-primary-500" />
                              ) : null}
                            </button>
                            <div className="my-1 border-t border-gray-100 dark:border-gray-700" />
                            {AUTO_REFRESH_INTERVALS.map((sec) => (
                              <button
                                key={sec}
                                type="button"
                                onClick={() => setAutoRefreshInterval(sec)}
                                className="flex w-full items-center justify-between rounded-md px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-700"
                              >
                                <span>{autoRefreshIntervalLabel(sec)}</span>
                                {autoRefreshIntervalSeconds === sec ? (
                                  <Icon name="check" size="sm" className="text-primary-500" />
                                ) : null}
                              </button>
                            ))}
                          </div>
                        </div>
                      ) : null}
                    </div>

                    <div className="relative" ref={accountToolsDropdownRef}>
                      <button
                        type="button"
                        onClick={() => {
                          setShowAccountToolsDropdown((v) => !v)
                          setShowAutoRefreshDropdown(false)
                        }}
                        className="btn btn-secondary px-2 md:px-3"
                        title={t('admin.accounts.moreActions')}
                      >
                        <Icon name="more" size="sm" className="md:mr-1.5" />
                        <span className="hidden md:inline">{t('admin.accounts.moreActions')}</span>
                        <Icon name="chevronDown" size="xs" className="ml-1 hidden md:inline" />
                      </button>
                      {showAccountToolsDropdown ? (
                        <div className="absolute right-0 z-50 mt-2 w-[min(20rem,calc(100vw-2rem))] origin-top-right overflow-hidden rounded-lg border border-gray-200 bg-white shadow-xl dark:border-gray-700 dark:bg-gray-800">
                          <div className="max-h-[70vh] overflow-y-auto p-2">
                            <div className="px-2 py-2">
                              <div className="text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
                                {t('admin.accounts.dataActions')}
                              </div>
                            </div>
                    <button
                      type="button"
                      className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm text-gray-700 transition-colors hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-700"
                      onClick={() => {
                                closeAccountToolsDropdown()
                                setShowSync(true)
                              }}
                            >
                              <span className="inline-flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-300">
                                <Icon name="sync" size="sm" />
                              </span>
                              <span className="flex-1 text-left">{t('admin.accounts.syncFromCrs')}</span>
                            </button>
                    <button
                      type="button"
                      className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm text-gray-700 transition-colors hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-700"
                      onClick={() => {
                                closeAccountToolsDropdown()
                                setShowImportData(true)
                              }}
                            >
                              <span className="inline-flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-300">
                                <Icon name="upload" size="sm" />
                              </span>
                              <span className="flex-1 text-left">{t('admin.accounts.dataImport')}</span>
                            </button>
                    <button
                      type="button"
                      className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm text-gray-700 transition-colors hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-700"
                      onClick={() => {
                                closeAccountToolsDropdown()
                                openExportDataDialog()
                              }}
                            >
                              <span className="inline-flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md bg-violet-50 text-violet-600 dark:bg-violet-900/30 dark:text-violet-300">
                                <Icon name="download" size="sm" />
                              </span>
                              <span className="flex-1 text-left">
                                {selIds.length
                                  ? t('admin.accounts.dataExportSelected')
                                  : t('admin.accounts.dataExport')}
                              </span>
                              {selIds.length ? (
                                <span className="rounded-full bg-primary-100 px-2 py-0.5 text-xs font-medium text-primary-700 dark:bg-primary-900/40 dark:text-primary-300">
                                  {t('admin.accounts.selectedCount', { count: selIds.length })}
                                </span>
                              ) : null}
                            </button>

                            <div className="my-2 border-t border-gray-100 dark:border-gray-700" />
                            <div className="px-2 py-2">
                              <div className="text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
                                {t('admin.accounts.toolActions')}
                              </div>
                            </div>
                    <button
                      type="button"
                      className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm text-gray-700 transition-colors hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-700"
                      onClick={() => {
                                closeAccountToolsDropdown()
                                setShowErrorPassthrough(true)
                              }}
                            >
                              <span className="inline-flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md bg-amber-50 text-amber-600 dark:bg-amber-900/30 dark:text-amber-300">
                                <Icon name="shield" size="sm" />
                              </span>
                              <span className="flex-1 text-left">{t('admin.errorPassthrough.title')}</span>
                            </button>
                    <button
                      type="button"
                      className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm text-gray-700 transition-colors hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-700"
                      onClick={() => {
                                closeAccountToolsDropdown()
                                setShowTLSFingerprintProfiles(true)
                              }}
                            >
                              <span className="inline-flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-200">
                                <Icon name="lock" size="sm" />
                              </span>
                              <span className="flex-1 text-left">{t('admin.tlsFingerprintProfiles.title')}</span>
                            </button>

                            <div className="my-2 border-t border-gray-100 dark:border-gray-700" />
                            <div className="px-2 py-2">
                              <div className="flex items-center justify-between gap-3">
                                <span className="text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
                                  {t('admin.accounts.viewColumns')}
                                </span>
                                <Icon name="grid" size="sm" className="text-gray-400" />
                              </div>
                            </div>
                            <div className="grid grid-cols-1 gap-1">
                              {toggleableColumns.map((col) => (
                                <button
                                  key={col.key}
                                  type="button"
                                  onClick={() => toggleColumn(col.key)}
                                  className="flex w-full items-center justify-between rounded-md px-3 py-2 text-sm text-gray-700 transition-colors hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-700"
                                >
                                  <span className="truncate">{col.label}</span>
                                  {isColumnVisible(col.key) ? (
                                    <Icon name="check" size="sm" className="text-primary-500" />
                                  ) : null}
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </>
                }
              />
            </div>
            {hasPendingListSync ? (
              <div className="mt-2 flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-700/40 dark:bg-amber-900/20 dark:text-amber-200">
                <span>{t('admin.accounts.listPendingSyncHint')}</span>
                <button
                  type="button"
                  className="btn btn-secondary px-2 py-1 text-xs"
                  onClick={() => void syncPendingListChanges()}
                >
                  {t('admin.accounts.listPendingSyncAction')}
                </button>
              </div>
            ) : null}
          </>
        }
        table={
          <>
            <AccountBulkActionsBar
              selectedIds={selIds}
              onDelete={() => void handleBulkDelete()}
              onResetStatus={() => void handleBulkResetStatus()}
              onRefreshToken={() => void handleBulkRefreshToken()}
              onEditSelected={openBulkEditSelected}
              onEditFiltered={() => void openBulkEditFiltered()}
              onClear={clearSelection}
              onSelectPage={selectPage}
              onToggleSchedulable={(enabled) => void handleBulkToggleSchedulable(enabled)}
            />
            <div ref={accountTableRef} className="flex min-h-0 flex-1 flex-col overflow-hidden">
              <DataTable
                columns={columns}
                data={accounts}
                loading={loading}
                rowKey="id"
                serverSideSort
                defaultSortKey="name"
                defaultSortOrder="asc"
                sortStorageKey={ACCOUNT_SORT_STORAGE_KEY}
                estimateRowHeight={72}
                overscan={5}
                onSort={handleSort}
                cells={tableCells}
                headerCells={headerCells}
              />
            </div>
          </>
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

      <CreateAccountModal
        show={showCreate}
        proxies={proxies}
        groups={groups}
        onClose={() => setShowCreate(false)}
        onCreated={() => void reload()}
      />
      <EditAccountModal
        show={showEdit}
        account={edAcc}
        proxies={proxies}
        groups={groups}
        onClose={() => setShowEdit(false)}
        onUpdated={handleAccountUpdated}
      />
      <ReAuthAccountModal
        show={showReAuth}
        account={reAuthAcc}
        onClose={() => {
          setShowReAuth(false)
          setReAuthAcc(null)
        }}
        onReauthorized={handleAccountUpdated}
      />
      <AccountTestModal
        show={showTest}
        account={testingAcc}
        onClose={() => {
          setShowTest(false)
          setTestingAcc(null)
        }}
      />
      <AccountStatsModal
        show={showStats}
        account={statsAcc}
        onClose={() => {
          setShowStats(false)
          setStatsAcc(null)
        }}
      />
      <ScheduledTestsPanel
        show={showSchedulePanel}
        accountId={scheduleAcc?.id ?? null}
        modelOptions={scheduleModelOptions}
        onClose={() => {
          setShowSchedulePanel(false)
          setScheduleAcc(null)
          setScheduleModelOptions([])
        }}
      />
      <AccountActionMenu
        show={menu.show}
        account={menu.acc}
        position={menu.pos}
        onClose={() => setMenu({ show: false, acc: null, pos: null })}
        onTest={(account) => {
          setTestingAcc(account)
          setShowTest(true)
        }}
        onStats={(account) => {
          setStatsAcc(account)
          setShowStats(true)
        }}
        onSchedule={(account) => void handleSchedule(account)}
        onReauth={(account) => {
          setReAuthAcc(account)
          setShowReAuth(true)
        }}
        onRefreshToken={(account) => void handleRefresh(account)}
        onRecoverState={(account) => void handleRecoverState(account)}
        onResetQuota={(account) => void handleResetQuota(account)}
        onSetPrivacy={(account) => void handleSetPrivacy(account)}
      />
      <SyncFromCrsModal show={showSync} onClose={() => setShowSync(false)} onSynced={() => void reload()} />
      <ImportDataModal
        show={showImportData}
        onClose={() => setShowImportData(false)}
        onImported={() => {
          setShowImportData(false)
          void reload()
        }}
      />
      <BulkEditAccountModal
        show={showBulkEdit}
        accountIds={selIds}
        selectedPlatforms={selPlatforms}
        selectedTypes={selTypes}
        target={bulkEditTarget ?? undefined}
        proxies={proxies}
        groups={groups}
        onClose={() => setShowBulkEdit(false)}
        onUpdated={handleBulkUpdated}
      />
      <TempUnschedStatusModal
        show={showTempUnsched}
        account={tempUnschedAcc}
        onClose={() => setShowTempUnsched(false)}
        onReset={(updated) => {
          setShowTempUnsched(false)
          setTempUnschedAcc(null)
          handleAccountUpdated(updated)
        }}
      />
      <ConfirmDialog
        show={showDeleteDialog}
        title={t('admin.accounts.deleteAccount')}
        message={t('admin.accounts.deleteConfirm', { name: deletingAcc?.name })}
        confirmText={t('common.delete')}
        cancelText={t('common.cancel')}
        danger
        onConfirm={() => void confirmDelete()}
        onCancel={() => setShowDeleteDialog(false)}
      />
      <ConfirmDialog
        show={showExportDataDialog}
        title={t('admin.accounts.dataExport')}
        message={t('admin.accounts.dataExportConfirmMessage')}
        confirmText={t('admin.accounts.dataExportConfirm')}
        cancelText={t('common.cancel')}
        onConfirm={() => void handleExportData()}
        onCancel={() => setShowExportDataDialog(false)}
      >
        <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
            checked={includeProxyOnExport}
            onChange={(e) => setIncludeProxyOnExport(e.target.checked)}
          />
          <span>{t('admin.accounts.dataExportIncludeProxies')}</span>
        </label>
      </ConfirmDialog>
      <ErrorPassthroughRulesModal show={showErrorPassthrough} onClose={() => setShowErrorPassthrough(false)} />
      <TLSFingerprintProfilesModal
        show={showTLSFingerprintProfiles}
        onClose={() => setShowTLSFingerprintProfiles(false)}
      />
    </AppLayout>
  )
}
