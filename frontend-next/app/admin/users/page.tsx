'use client'

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from 'react'
import { createPortal } from 'react-dom'
import { useI18n } from '@/lib/i18n'
import { useApp } from '@/context/AppContext'
import { getPersistedPageSize } from '@/lib/usePersistedPageSize'
import { formatDateTime } from '@/lib/format'
import { extractApiErrorMessage } from '@/lib/apiError'
import { adminUsersAPI } from '@/lib/adminUsers'
import { adminUserAttributesAPI } from '@/lib/adminUserAttributes'
import { adminGroupsAPI } from '@/lib/adminGroups'
import { adminDashboardAPI, type BatchUserUsageStats } from '@/lib/adminDashboard'
import AppLayout from '@/components/layout/AppLayout'
import TablePageLayout from '@/components/layout/TablePageLayout'
import DataTable, {
  type DataTableCellContext,
  type DataTableHeaderContext,
} from '@/components/common/DataTable'
import Pagination from '@/components/common/Pagination'
import ConfirmDialog from '@/components/common/ConfirmDialog'
import EmptyState from '@/components/common/EmptyState'
import Select from '@/components/common/Select'
import Icon from '@/components/icons/Icon'
import GroupBadge from '@/components/keys/GroupBadge'
import UserAttributesConfigModal from '@/components/user/UserAttributesConfigModal'
import UserConcurrencyCell from '@/components/user/UserConcurrencyCell'
import PlatformUsageBreakdown from '@/components/user/PlatformUsageBreakdown'
import PlatformCostCell from '@/components/user/PlatformCostCell'
import UserPlatformQuotaCell from '@/components/user/UserPlatformQuotaCell'
import UserCreateModal from '@/components/admin/user/UserCreateModal'
import UserEditModal from '@/components/admin/user/UserEditModal'
import UserPlatformQuotaModal from '@/components/admin/user/UserPlatformQuotaModal'
import UserApiKeysModal from '@/components/admin/user/UserApiKeysModal'
import UserAllowedGroupsModal from '@/components/admin/user/UserAllowedGroupsModal'
import UserBalanceModal from '@/components/admin/user/UserBalanceModal'
import UserBalanceHistoryModal from '@/components/admin/user/UserBalanceHistoryModal'
import GroupReplaceModal from '@/components/admin/user/GroupReplaceModal'
import type { Column } from '@/components/common/types'
import type {
  AdminUser,
  PlatformQuotaItem,
  UserAttributeDefinition,
} from '@/lib/types'
import type { AdminGroup } from '@/lib/adminGroups'

function numericUserId(id: string | number): number {
  return typeof id === 'number' ? id : Number(id)
}

const DEFAULT_HIDDEN_COLUMNS = [
  'notes',
  'groups',
  'subscriptions',
  'usage',
  'concurrency',
  'usage_anthropic',
  'usage_openai',
  'usage_gemini',
  'usage_antigravity',
  'balance_platform_quota',
]
const REMOVED_COLUMNS = new Set(['last_login_at'])
const FORCED_VISIBLE_COLUMNS = new Set<string>()

const HIDDEN_COLUMNS_KEY = 'user-hidden-columns'
const COLUMN_SETTINGS_VERSION_KEY = 'user-column-settings-version'
const COLUMN_SETTINGS_VERSION = 3
const VERSION_NEW_HIDDEN_COLUMNS: Record<number, string[]> = {
  2: ['usage_anthropic', 'usage_openai', 'usage_gemini', 'usage_antigravity'],
  3: ['balance_platform_quota'],
}

const USER_SORT_STORAGE_KEY = 'admin-users-table-sort'
const USAGE_SORT_STORAGE_KEY = 'admin-users-usage-sort'
const FILTER_VALUES_KEY = 'user-filter-values'
const VISIBLE_FILTERS_KEY = 'user-visible-filters'

const USAGE_COLUMN_KEYS: readonly string[] = [
  'usage',
  'usage_anthropic',
  'usage_openai',
  'usage_gemini',
  'usage_antigravity',
]
const USAGE_COLUMN_PLATFORMS: Record<string, string | null> = {
  usage: null,
  usage_anthropic: 'anthropic',
  usage_openai: 'openai',
  usage_gemini: 'gemini',
  usage_antigravity: 'antigravity',
}
const PLATFORM_USAGE_COLUMNS = USAGE_COLUMN_KEYS.filter((k) => k !== 'usage')

type UsageMetric = 'today' | 'total'
type UsageSortState = { key: string; metric: UsageMetric; order: 'asc' | 'desc' } | null

function loadInitialSortState(): { sort_by: string; sort_order: 'asc' | 'desc' } {
  const fallback = { sort_by: 'created_at', sort_order: 'desc' as const }
  const sortable = new Set([
    'email',
    'id',
    'username',
    'role',
    'balance',
    'concurrency',
    'status',
    'last_used_at',
    'last_active_at',
    'created_at',
  ])
  try {
    const raw = localStorage.getItem(USER_SORT_STORAGE_KEY)
    if (!raw) return fallback
    const parsed = JSON.parse(raw) as { key?: string; order?: string }
    const key = typeof parsed.key === 'string' ? parsed.key : ''
    if (!sortable.has(key)) return fallback
    return {
      sort_by: key,
      sort_order: parsed.order === 'asc' ? 'asc' : 'desc',
    }
  } catch {
    return fallback
  }
}

function loadInitialUsageSort(): UsageSortState {
  try {
    const raw = localStorage.getItem(USAGE_SORT_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<{ key: string; metric: string; order: string }>
    if (!parsed.key || !USAGE_COLUMN_KEYS.includes(parsed.key)) return null
    const metric: UsageMetric = parsed.metric === 'total' ? 'total' : 'today'
    const order: 'asc' | 'desc' = parsed.order === 'asc' ? 'asc' : 'desc'
    return { key: parsed.key, metric, order }
  } catch {
    return null
  }
}

function loadSavedColumns(): Set<string> {
  const hiddenColumns = new Set<string>()
  try {
    const saved = localStorage.getItem(HIDDEN_COLUMNS_KEY)
    if (saved) {
      const parsed = JSON.parse(saved) as string[]
      parsed
        .filter((key) => !REMOVED_COLUMNS.has(key) && !FORCED_VISIBLE_COLUMNS.has(key))
        .forEach((key) => hiddenColumns.add(key))

      const storedVersion = Number(localStorage.getItem(COLUMN_SETTINGS_VERSION_KEY) ?? '1')
      if (storedVersion < COLUMN_SETTINGS_VERSION) {
        let mutated = false
        for (let v = storedVersion + 1; v <= COLUMN_SETTINGS_VERSION; v++) {
          for (const key of VERSION_NEW_HIDDEN_COLUMNS[v] ?? []) {
            if (REMOVED_COLUMNS.has(key) || FORCED_VISIBLE_COLUMNS.has(key)) continue
            if (!hiddenColumns.has(key)) {
              hiddenColumns.add(key)
              mutated = true
            }
          }
        }
        if (mutated) {
          localStorage.setItem(HIDDEN_COLUMNS_KEY, JSON.stringify([...hiddenColumns]))
          localStorage.setItem(COLUMN_SETTINGS_VERSION_KEY, String(COLUMN_SETTINGS_VERSION))
        } else {
          localStorage.setItem(COLUMN_SETTINGS_VERSION_KEY, String(COLUMN_SETTINGS_VERSION))
        }
      }
    } else {
      DEFAULT_HIDDEN_COLUMNS.forEach((key) => hiddenColumns.add(key))
      localStorage.setItem(COLUMN_SETTINGS_VERSION_KEY, String(COLUMN_SETTINGS_VERSION))
    }
  } catch (e) {
    console.error('Failed to load saved columns:', e)
    DEFAULT_HIDDEN_COLUMNS.forEach((key) => hiddenColumns.add(key))
  }
  return hiddenColumns
}

function loadSavedFilters(): {
  visibleFilters: Set<string>
  filters: { role: string; status: string; group: string }
  activeAttributeFilters: Record<number, string>
} {
  const visibleFilters = new Set<string>()
  const filters = { role: '', status: '', group: '' }
  const activeAttributeFilters: Record<number, string> = {}
  try {
    const savedVisible = localStorage.getItem(VISIBLE_FILTERS_KEY)
    if (savedVisible) {
      const parsed = JSON.parse(savedVisible) as string[]
      parsed.forEach((key) => visibleFilters.add(key))
    }
    const savedValues = localStorage.getItem(FILTER_VALUES_KEY)
    if (savedValues) {
      const parsed = JSON.parse(savedValues) as {
        role?: string
        status?: string
        group?: string
        attributes?: Record<number, string>
      }
      if (parsed.role) filters.role = parsed.role
      if (parsed.status) filters.status = parsed.status
      if (parsed.group) filters.group = parsed.group
      if (parsed.attributes) {
        Object.assign(activeAttributeFilters, parsed.attributes)
      }
    }
  } catch (e) {
    console.error('Failed to load saved filters:', e)
  }
  return { visibleFilters, filters, activeAttributeFilters }
}

function isAbortError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const { name, code } = error as { name?: string; code?: string }
  return name === 'AbortError' || name === 'CanceledError' || code === 'ERR_CANCELED'
}

function getDaysRemaining(expiresAt: string): number {
  const now = new Date()
  const expires = new Date(expiresAt)
  const diffMs = expires.getTime() - now.getTime()
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24))
}

export default function AdminUsersPage() {
  const { t } = useI18n()
  const appStore = useApp()

  const savedFilters = useMemo(() => loadSavedFilters(), [])
  const [hiddenColumns, setHiddenColumns] = useState<Set<string>>(() => loadSavedColumns())
  const [visibleFilters, setVisibleFilters] = useState<Set<string>>(() => savedFilters.visibleFilters)
  const [filters, setFilters] = useState(savedFilters.filters)
  const [activeAttributeFilters, setActiveAttributeFilters] = useState<Record<number, string>>(
    () => savedFilters.activeAttributeFilters,
  )

  const [attributeDefinitions, setAttributeDefinitions] = useState<UserAttributeDefinition[]>([])
  const [users, setUsers] = useState<AdminUser[]>([])
  const [loading, setLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [sortState, setSortState] = useState(loadInitialSortState)
  const [usageSort, setUsageSort] = useState<UsageSortState>(loadInitialUsageSort)
  const [openUsageSortMenu, setOpenUsageSortMenu] = useState<string | null>(null)

  const [allGroups, setAllGroups] = useState<AdminGroup[]>([])
  const [usageStats, setUsageStats] = useState<Record<string, BatchUserUsageStats>>({})
  const [platformQuotaStats, setPlatformQuotaStats] = useState<Record<number, PlatformQuotaItem[]>>({})
  const [userAttributeValues, setUserAttributeValues] = useState<
    Record<number, Record<number, string>>
  >({})

  const [pagination, setPagination] = useState({
    page: 1,
    page_size: getPersistedPageSize(),
    total: 0,
    pages: 0,
  })

  const [showFilterDropdown, setShowFilterDropdown] = useState(false)
  const [showColumnDropdown, setShowColumnDropdown] = useState(false)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [showApiKeysModal, setShowApiKeysModal] = useState(false)
  const [showAttributesModal, setShowAttributesModal] = useState(false)
  const [showPlatformQuotaModal, setShowPlatformQuotaModal] = useState(false)
  const [showAllowedGroupsModal, setShowAllowedGroupsModal] = useState(false)
  const [showBalanceModal, setShowBalanceModal] = useState(false)
  const [showBalanceHistoryModal, setShowBalanceHistoryModal] = useState(false)
  const [showGroupReplaceModal, setShowGroupReplaceModal] = useState(false)

  const [editingUser, setEditingUser] = useState<AdminUser | null>(null)
  const [deletingUser, setDeletingUser] = useState<AdminUser | null>(null)
  const [viewingUser, setViewingUser] = useState<AdminUser | null>(null)
  const [platformQuotaUser, setPlatformQuotaUser] = useState<AdminUser | null>(null)
  const [allowedGroupsUser, setAllowedGroupsUser] = useState<AdminUser | null>(null)
  const [balanceUser, setBalanceUser] = useState<AdminUser | null>(null)
  const [balanceOperation, setBalanceOperation] = useState<'add' | 'subtract'>('add')
  const [balanceHistoryUser, setBalanceHistoryUser] = useState<AdminUser | null>(null)
  const [groupReplaceUser, setGroupReplaceUser] = useState<AdminUser | null>(null)
  const [groupReplaceOldGroup, setGroupReplaceOldGroup] = useState<{ id: number; name: string } | null>(
    null,
  )

  const [activeMenuId, setActiveMenuId] = useState<number | null>(null)
  const [menuPosition, setMenuPosition] = useState<{ top: number; left: number } | null>(null)
  const [expandedGroupUserId, setExpandedGroupUserId] = useState<number | null>(null)
  const [mounted, setMounted] = useState(false)

  const filterDropdownRef = useRef<HTMLDivElement | null>(null)
  const columnDropdownRef = useRef<HTMLDivElement | null>(null)
  const abortControllerRef = useRef<AbortController | null>(null)
  const secondaryDataSeqRef = useRef(0)
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => setMounted(true), [])

  const saveColumnsToStorage = useCallback((nextHidden: Set<string>) => {
    try {
      localStorage.setItem(HIDDEN_COLUMNS_KEY, JSON.stringify([...nextHidden]))
      localStorage.setItem(COLUMN_SETTINGS_VERSION_KEY, String(COLUMN_SETTINGS_VERSION))
    } catch (e) {
      console.error('Failed to save columns:', e)
    }
  }, [])

  const saveFiltersToStorage = useCallback(
    (
      nextVisible: Set<string>,
      nextFilters: typeof filters,
      nextAttrFilters: Record<number, string>,
    ) => {
      try {
        localStorage.setItem(VISIBLE_FILTERS_KEY, JSON.stringify([...nextVisible]))
        localStorage.setItem(
          FILTER_VALUES_KEY,
          JSON.stringify({
            role: nextFilters.role,
            status: nextFilters.status,
            group: nextFilters.group,
            attributes: nextAttrFilters,
          }),
        )
      } catch (e) {
        console.error('Failed to save filters:', e)
      }
    },
    [],
  )

  const persistUsageSort = useCallback((next: UsageSortState) => {
    try {
      if (next) {
        localStorage.setItem(USAGE_SORT_STORAGE_KEY, JSON.stringify(next))
      } else {
        localStorage.removeItem(USAGE_SORT_STORAGE_KEY)
      }
    } catch (e) {
      console.error('Failed to persist usage sort:', e)
    }
  }, [])

  const getAttributeDefinition = useCallback(
    (attrId: number): UserAttributeDefinition | undefined =>
      attributeDefinitions.find((d) => d.id === attrId),
    [attributeDefinitions],
  )

  const getAttributeDefinitionName = useCallback(
    (attrId: number): string => getAttributeDefinition(attrId)?.name || String(attrId),
    [getAttributeDefinition],
  )

  const getAttributeValue = useCallback(
    (userId: string | number, attrId: number): string => {
      const userAttrs = userAttributeValues[numericUserId(userId)]
      if (!userAttrs) return '-'
      const value = userAttrs[attrId]
      if (!value) return '-'

      const def = attributeDefinitions.find((d) => d.id === attrId)
      if (!def) return value

      if (def.type === 'multi_select' && value) {
        try {
          const arr = JSON.parse(value)
          if (Array.isArray(arr)) {
            return arr
              .map((v) => {
                const opt = def.options?.find((o) => o.value === v)
                return opt?.label || v
              })
              .join(', ')
          }
        } catch {
          return value
        }
      }

      if (def.type === 'select' && value && def.options) {
        const opt = def.options.find((o) => o.value === value)
        return opt?.label || value
      }

      return value
    },
    [attributeDefinitions, userAttributeValues],
  )

  const attributeColumns = useMemo<Column[]>(
    () =>
      attributeDefinitions
        .filter((def) => def.enabled)
        .map((def) => ({
          key: `attr_${def.id}`,
          label: def.name,
          sortable: false,
        })),
    [attributeDefinitions],
  )

  const allColumns = useMemo<Column[]>(
    () => [
      { key: 'email', label: t('admin.users.columns.user'), sortable: true },
      { key: 'id', label: t('admin.users.columns.id'), sortable: true },
      { key: 'username', label: t('admin.users.columns.username'), sortable: true },
      { key: 'notes', label: t('admin.users.columns.notes'), sortable: false },
      ...attributeColumns,
      { key: 'role', label: t('admin.users.columns.role'), sortable: true },
      { key: 'groups', label: t('admin.users.columns.groups'), sortable: false },
      { key: 'subscriptions', label: t('admin.users.columns.subscriptions'), sortable: false },
      { key: 'balance', label: t('admin.users.columns.balance'), sortable: true },
      {
        key: 'balance_platform_quota',
        label: t('admin.users.columns.balancePlatformQuota'),
        sortable: false,
      },
      { key: 'usage', label: t('admin.users.columns.usage'), sortable: false },
      { key: 'usage_anthropic', label: t('admin.users.columns.usageAnthropic'), sortable: false },
      { key: 'usage_openai', label: t('admin.users.columns.usageOpenAI'), sortable: false },
      { key: 'usage_gemini', label: t('admin.users.columns.usageGemini'), sortable: false },
      {
        key: 'usage_antigravity',
        label: t('admin.users.columns.usageAntigravity'),
        sortable: false,
      },
      { key: 'concurrency', label: t('admin.users.columns.concurrency'), sortable: true },
      { key: 'status', label: t('admin.users.columns.status'), sortable: true },
      { key: 'last_active_at', label: t('admin.users.columns.lastActive'), sortable: true },
      { key: 'last_used_at', label: t('admin.users.columns.lastUsed'), sortable: true },
      { key: 'created_at', label: t('admin.users.columns.created'), sortable: true },
      { key: 'actions', label: t('admin.users.columns.actions'), sortable: false },
    ],
    [attributeColumns, t],
  )

  const toggleableColumns = useMemo(
    () => allColumns.filter((col) => col.key !== 'email' && col.key !== 'actions'),
    [allColumns],
  )

  const columns = useMemo<Column[]>(
    () =>
      allColumns.filter(
        (col) => col.key === 'email' || col.key === 'actions' || !hiddenColumns.has(col.key),
      ),
    [allColumns, hiddenColumns],
  )

  const hasVisibleUsageColumn = useMemo(
    () => !hiddenColumns.has('usage') || PLATFORM_USAGE_COLUMNS.some((k) => !hiddenColumns.has(k)),
    [hiddenColumns],
  )

  const hasVisibleGroupsColumn = useMemo(() => !hiddenColumns.has('groups'), [hiddenColumns])

  const hasVisiblePlatformQuotaColumn = useMemo(
    () => !hiddenColumns.has('balance_platform_quota'),
    [hiddenColumns],
  )

  const hasVisibleAttributeColumns = useMemo(
    () =>
      attributeDefinitions.some((def) => def.enabled && !hiddenColumns.has(`attr_${def.id}`)),
    [attributeDefinitions, hiddenColumns],
  )

  const filterableAttributes = useMemo(
    () => attributeDefinitions.filter((def) => def.enabled),
    [attributeDefinitions],
  )

  const builtInFilters = useMemo(
    () => [
      { key: 'role', name: t('admin.users.columns.role'), type: 'select' as const },
      { key: 'status', name: t('admin.users.columns.status'), type: 'select' as const },
      { key: 'group', name: t('admin.users.columns.groups'), type: 'select' as const },
    ],
    [t],
  )

  const groupFilterOptions = useMemo(() => {
    const options: { value: string; label: string }[] = [
      { value: '', label: t('admin.users.allGroups') },
    ]
    for (const g of allGroups) {
      if (g.status !== 'active' || !g.is_exclusive || g.subscription_type !== 'standard') continue
      options.push({ value: g.name, label: g.name })
    }
    return options
  }, [allGroups, t])

  const getUserGroups = useCallback(
    (user: AdminUser) => {
      const exclusive: AdminGroup[] = []
      const publicGroups: AdminGroup[] = []
      for (const g of allGroups) {
        if (g.status !== 'active' || g.subscription_type !== 'standard') continue
        if (g.is_exclusive) {
          if (user.allowed_groups?.includes(g.id)) {
            exclusive.push(g)
          }
        } else {
          publicGroups.push(g)
        }
      }
      return { exclusive, publicGroups }
    },
    [allGroups],
  )

  const getPlatformUsage = useCallback(
    (userId: string | number, platform: string) =>
      usageStats[String(numericUserId(userId))]?.by_platform?.find((p) => p.platform === platform),
    [usageStats],
  )

  const getUsageValue = useCallback(
    (userId: string | number, key: string, metric: UsageMetric): number => {
      const stats = usageStats[String(numericUserId(userId))]
      if (!stats) return 0
      const platform = USAGE_COLUMN_PLATFORMS[key]
      if (platform === null) {
        return metric === 'today' ? stats.today_actual_cost ?? 0 : stats.total_actual_cost ?? 0
      }
      const p = stats.by_platform?.find((x) => x.platform === platform)
      if (!p) return 0
      return metric === 'today' ? p.today_actual_cost ?? 0 : p.total_actual_cost ?? 0
    },
    [usageStats],
  )

  const sortedUsers = useMemo(() => {
    const s = usageSort
    if (!s) return users
    return [...users]
      .map((row, index) => ({ row, index }))
      .sort((a, b) => {
        const av = getUsageValue(a.row.id, s.key, s.metric)
        const bv = getUsageValue(b.row.id, s.key, s.metric)
        if (av !== bv) return s.order === 'asc' ? av - bv : bv - av
        return a.index - b.index
      })
      .map((x) => x.row)
  }, [users, usageSort, getUsageValue])

  const activeMenuUser = useMemo(
    () =>
      activeMenuId !== null
        ? users.find((u) => numericUserId(u.id) === activeMenuId) ?? null
        : null,
    [activeMenuId, users],
  )

  const loadAllGroups = useCallback(async () => {
    if (allGroups.length > 0) return
    try {
      const groups = await adminGroupsAPI.getAll()
      setAllGroups(groups)
    } catch (e) {
      console.error('Failed to load groups:', e)
    }
  }, [allGroups.length])

  const loadAttributeDefinitions = useCallback(async () => {
    try {
      const defs = await adminUserAttributesAPI.listEnabledDefinitions()
      setAttributeDefinitions(defs)
    } catch (e) {
      console.error('Failed to load attribute definitions:', e)
    }
  }, [])

  const loadUsersSecondaryData = useCallback(
    async (userIds: number[], signal?: AbortSignal, expectedSeq?: number) => {
      if (userIds.length === 0) return

      const tasks: Promise<void>[] = []

      if (hasVisibleUsageColumn) {
        tasks.push(
          (async () => {
            try {
              const usageResponse = await adminDashboardAPI.getBatchUsersUsage(userIds)
              if (signal?.aborted) return
              if (typeof expectedSeq === 'number' && expectedSeq !== secondaryDataSeqRef.current) return
              setUsageStats(usageResponse.stats)
            } catch (e) {
              if (signal?.aborted) return
              console.error('Failed to load usage stats:', e)
            }
          })(),
        )
      }

      if (attributeDefinitions.length > 0 && hasVisibleAttributeColumns) {
        tasks.push(
          (async () => {
            try {
              const attrResponse = await adminUserAttributesAPI.getBatchUserAttributes(userIds)
              if (signal?.aborted) return
              if (typeof expectedSeq === 'number' && expectedSeq !== secondaryDataSeqRef.current) return
              setUserAttributeValues(attrResponse.attributes)
            } catch (e) {
              if (signal?.aborted) return
              console.error('Failed to load user attribute values:', e)
            }
          })(),
        )
      }

      if (hasVisiblePlatformQuotaColumn) {
        tasks.push(
          (async () => {
            try {
              const CHUNK = 6
              for (let i = 0; i < userIds.length; i += CHUNK) {
                if (signal?.aborted) return
                if (typeof expectedSeq === 'number' && expectedSeq !== secondaryDataSeqRef.current) return
                const chunk = userIds.slice(i, i + CHUNK)
                const results = await Promise.allSettled(
                  chunk.map((id) => adminUsersAPI.getPlatformQuotas(id)),
                )
                if (signal?.aborted) return
                if (typeof expectedSeq === 'number' && expectedSeq !== secondaryDataSeqRef.current) return
                setPlatformQuotaStats((prev) => {
                  const merged = { ...prev }
                  results.forEach((r, idx) => {
                    if (r.status === 'fulfilled') {
                      merged[chunk[idx]] = r.value.platform_quotas || []
                    }
                  })
                  return merged
                })
              }
            } catch (e) {
              if (signal?.aborted) return
              console.error('Failed to load platform quotas:', e)
            }
          })(),
        )
      }

      if (tasks.length > 0) {
        await Promise.allSettled(tasks)
      }
    },
    [
      attributeDefinitions.length,
      hasVisibleAttributeColumns,
      hasVisiblePlatformQuotaColumn,
      hasVisibleUsageColumn,
    ],
  )

  const refreshCurrentPageSecondaryData = useCallback(() => {
    const userIds = users.map((u) => numericUserId(u.id))
    if (userIds.length === 0) return
    const seq = ++secondaryDataSeqRef.current
    void loadUsersSecondaryData(userIds, undefined, seq)
  }, [loadUsersSecondaryData, users])

  const loadUsers = useCallback(async () => {
    abortControllerRef.current?.abort()
    const currentAbortController = new AbortController()
    abortControllerRef.current = currentAbortController
    const { signal } = currentAbortController
    setLoading(true)
    try {
      const attrFilters: Record<number, string> = {}
      for (const [attrId, value] of Object.entries(activeAttributeFilters)) {
        if (value) {
          attrFilters[Number(attrId)] = value
        }
      }

      const response = await adminUsersAPI.list(
        pagination.page,
        pagination.page_size,
        {
          role: (filters.role || undefined) as 'admin' | 'user' | undefined,
          status: (filters.status || undefined) as 'active' | 'disabled' | undefined,
          search: searchQuery || undefined,
          group_name: filters.group || undefined,
          attributes: Object.keys(attrFilters).length > 0 ? attrFilters : undefined,
          include_subscriptions: true,
          sort_by: sortState.sort_by,
          sort_order: sortState.sort_order,
        },
        { signal },
      )
      if (signal.aborted) return

      setUsers(response.items)
      setPagination((prev) => ({
        ...prev,
        total: response.total,
        pages: response.pages ?? 1,
      }))
      setUsageStats({})
      setUserAttributeValues({})
      setPlatformQuotaStats({})

      if (response.items.length > 0) {
        const userIds = response.items.map((u) => numericUserId(u.id))
        const seq = ++secondaryDataSeqRef.current
        window.setTimeout(() => {
          if (signal.aborted || seq !== secondaryDataSeqRef.current) return
          void loadUsersSecondaryData(userIds, signal, seq)
        }, 50)
      }
    } catch (error: unknown) {
      if (isAbortError(error)) return
      appStore.showError(extractApiErrorMessage(error) || t('admin.users.failedToLoad'))
      console.error('Error loading users:', error)
    } finally {
      if (abortControllerRef.current === currentAbortController) {
        setLoading(false)
      }
    }
  }, [
    activeAttributeFilters,
    appStore,
    filters.group,
    filters.role,
    filters.status,
    loadUsersSecondaryData,
    pagination.page,
    pagination.page_size,
    searchQuery,
    sortState.sort_by,
    sortState.sort_order,
    t,
  ])

  useEffect(() => {
    void loadAttributeDefinitions()
    if (hasVisibleGroupsColumn || visibleFilters.has('group')) {
      void loadAllGroups()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    void loadUsers()
  }, [loadUsers])

  const closeActionMenu = useCallback(() => {
    setActiveMenuId(null)
    setMenuPosition(null)
  }, [])

  const handleClickOutside = useCallback(
    (event: MouseEvent) => {
      const target = event.target as HTMLElement
      if (!target.closest('.action-menu-trigger') && !target.closest('.action-menu-content')) {
        closeActionMenu()
      }
      if (filterDropdownRef.current && !filterDropdownRef.current.contains(target)) {
        setShowFilterDropdown(false)
      }
      if (columnDropdownRef.current && !columnDropdownRef.current.contains(target)) {
        setShowColumnDropdown(false)
      }
      if (openUsageSortMenu !== null && !target.closest('.usage-sort-trigger')) {
        setOpenUsageSortMenu(null)
      }
      if (expandedGroupUserId !== null) {
        setExpandedGroupUserId(null)
      }
    },
    [closeActionMenu, expandedGroupUserId, openUsageSortMenu],
  )

  useEffect(() => {
    document.addEventListener('click', handleClickOutside)
    const handleScroll = () => closeActionMenu()
    window.addEventListener('scroll', handleScroll, true)
    return () => {
      document.removeEventListener('click', handleClickOutside)
      window.removeEventListener('scroll', handleScroll, true)
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current)
      abortControllerRef.current?.abort()
    }
  }, [closeActionMenu, handleClickOutside])

  const isForcedVisibleColumn = (key: string) => FORCED_VISIBLE_COLUMNS.has(key)
  const isColumnVisible = (key: string) => !hiddenColumns.has(key)

  const toggleColumn = (key: string) => {
    if (FORCED_VISIBLE_COLUMNS.has(key)) return
    setHiddenColumns((prev) => {
      const next = new Set(prev)
      const wasHidden = next.has(key)
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.add(key)
      }
      saveColumnsToStorage(next)
      if (
        wasHidden &&
        (key === 'usage' || key.startsWith('usage_') || key.startsWith('attr_') || key === 'balance_platform_quota')
      ) {
        refreshCurrentPageSecondaryData()
      }
      if (key === 'subscriptions') {
        void loadUsers()
      }
      if (wasHidden && key === 'groups') {
        void loadAllGroups()
      }
      return next
    })
  }

  const isUsageSortActive = (key: string, metric: UsageMetric) =>
    !!usageSort && usageSort.key === key && usageSort.metric === metric

  const getUsageSortOrder = (key: string, metric: UsageMetric): 'asc' | 'desc' | null =>
    isUsageSortActive(key, metric) ? usageSort!.order : null

  const toggleUsageSort = (key: string, metric: UsageMetric) => {
    setUsageSort((cur) => {
      let next: UsageSortState
      if (cur && cur.key === key && cur.metric === metric) {
        next = cur.order === 'desc' ? { key, metric, order: 'asc' } : null
      } else {
        next = { key, metric, order: 'desc' }
      }
      persistUsageSort(next)
      return next
    })
    setOpenUsageSortMenu(null)
  }

  const toggleUsageSortMenu = (key: string) => {
    setOpenUsageSortMenu((cur) => (cur === key ? null : key))
  }

  const handleSearch = (value: string) => {
    setSearchQuery(value)
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current)
    searchTimeoutRef.current = setTimeout(() => {
      setPagination((prev) => ({ ...prev, page: 1 }))
    }, 300)
  }

  const handlePageChange = (page: number) => {
    setPagination((prev) => {
      const validPage = Math.max(1, Math.min(page, prev.pages || 1))
      return { ...prev, page: validPage }
    })
  }

  const handlePageSizeChange = (pageSize: number) => {
    setPagination((prev) => ({ ...prev, page_size: pageSize, page: 1 }))
  }

  const handleSort = (key: string, order: 'asc' | 'desc') => {
    setSortState({ sort_by: key, sort_order: order })
    setPagination((prev) => ({ ...prev, page: 1 }))
  }

  const toggleBuiltInFilter = (key: string) => {
    setVisibleFilters((prev) => {
      const next = new Set(prev)
      const nextFilters = { ...filters }
      if (next.has(key)) {
        next.delete(key)
        if (key === 'role') nextFilters.role = ''
        if (key === 'status') nextFilters.status = ''
        if (key === 'group') nextFilters.group = ''
      } else {
        next.add(key)
        if (key === 'group') void loadAllGroups()
      }
      setFilters(nextFilters)
      saveFiltersToStorage(next, nextFilters, activeAttributeFilters)
      return next
    })
    setPagination((prev) => ({ ...prev, page: 1 }))
  }

  const toggleAttributeFilter = (attr: UserAttributeDefinition) => {
    const key = `attr_${attr.id}`
    setVisibleFilters((prev) => {
      const next = new Set(prev)
      const nextAttrFilters = { ...activeAttributeFilters }
      if (next.has(key)) {
        next.delete(key)
        delete nextAttrFilters[attr.id]
      } else {
        next.add(key)
        nextAttrFilters[attr.id] = ''
      }
      setActiveAttributeFilters(nextAttrFilters)
      saveFiltersToStorage(next, filters, nextAttrFilters)
      return next
    })
    setPagination((prev) => ({ ...prev, page: 1 }))
  }

  const updateAttributeFilter = (attrId: number, value: string) => {
    setActiveAttributeFilters((prev) => ({ ...prev, [attrId]: value }))
  }

  const applyFilter = () => {
    saveFiltersToStorage(visibleFilters, filters, activeAttributeFilters)
    void loadUsers()
  }

  const openActionMenu = (user: AdminUser, e: ReactMouseEvent<HTMLButtonElement>) => {
    if (activeMenuId === numericUserId(user.id)) {
      closeActionMenu()
      return
    }

    const target = e.currentTarget
    if (!target) {
      closeActionMenu()
      return
    }

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
        if (top < padding) {
          top = padding
        }
      }
    } else {
      left = Math.max(padding, Math.min(e.clientX - menuWidth, viewportWidth - menuWidth - padding))
      top = e.clientY
      if (top + menuHeight > viewportHeight - padding) {
        top = viewportHeight - menuHeight - padding
      }
    }

    setMenuPosition({ top, left })
    setActiveMenuId(numericUserId(user.id))
  }

  const handleEdit = (user: AdminUser) => {
    setEditingUser(user)
    setShowEditModal(true)
  }

  const closeEditModal = () => {
    setShowEditModal(false)
    setEditingUser(null)
  }

  const handleToggleStatus = async (user: AdminUser) => {
    const newStatus = user.status === 'active' ? 'disabled' : 'active'
    try {
      await adminUsersAPI.toggleStatus(numericUserId(user.id), newStatus)
      appStore.showSuccess(
        newStatus === 'active' ? t('admin.users.userEnabled') : t('admin.users.userDisabled'),
      )
      void loadUsers()
    } catch (error: unknown) {
      appStore.showError(extractApiErrorMessage(error) || t('admin.users.failedToToggle'))
      console.error('Error toggling user status:', error)
    }
  }

  const handleViewApiKeys = (user: AdminUser) => {
    setViewingUser(user)
    setShowApiKeysModal(true)
  }

  const closeApiKeysModal = () => {
    setShowApiKeysModal(false)
    setViewingUser(null)
  }

  const handleAllowedGroups = (user: AdminUser) => {
    setAllowedGroupsUser(user)
    setShowAllowedGroupsModal(true)
  }

  const closeAllowedGroupsModal = () => {
    setShowAllowedGroupsModal(false)
    setAllowedGroupsUser(null)
  }

  const toggleExpandedGroup = (userId: string | number) => {
    const id = numericUserId(userId)
    setExpandedGroupUserId((cur) => (cur === id ? null : id))
  }

  const openGroupReplace = (user: AdminUser, group: { id: number; name: string }) => {
    setExpandedGroupUserId(null)
    setGroupReplaceUser(user)
    setGroupReplaceOldGroup(group)
    setShowGroupReplaceModal(true)
  }

  const closeGroupReplaceModal = () => {
    setShowGroupReplaceModal(false)
    setGroupReplaceUser(null)
    setGroupReplaceOldGroup(null)
  }

  const handleDelete = (user: AdminUser) => {
    setDeletingUser(user)
    setShowDeleteDialog(true)
  }

  const confirmDelete = async () => {
    if (!deletingUser) return
    try {
      await adminUsersAPI.delete(numericUserId(deletingUser.id))
      appStore.showSuccess(t('common.success'))
      setShowDeleteDialog(false)
      setDeletingUser(null)
      void loadUsers()
    } catch (error: unknown) {
      appStore.showError(extractApiErrorMessage(error) || t('admin.users.failedToDelete'))
      console.error('Error deleting user:', error)
    }
  }

  const handlePlatformQuota = (user: AdminUser) => {
    setPlatformQuotaUser(user)
    setShowPlatformQuotaModal(true)
  }

  const closePlatformQuotaModal = () => {
    setShowPlatformQuotaModal(false)
    setPlatformQuotaUser(null)
  }

  const handleDeposit = (user: AdminUser) => {
    setBalanceUser(user)
    setBalanceOperation('add')
    setShowBalanceModal(true)
  }

  const handleWithdraw = (user: AdminUser) => {
    setBalanceUser(user)
    setBalanceOperation('subtract')
    setShowBalanceModal(true)
  }

  const closeBalanceModal = () => {
    setShowBalanceModal(false)
    setBalanceUser(null)
  }

  const handleBalanceHistory = (user: AdminUser) => {
    setBalanceHistoryUser(user)
    setShowBalanceHistoryModal(true)
  }

  const closeBalanceHistoryModal = () => {
    setShowBalanceHistoryModal(false)
    setBalanceHistoryUser(null)
  }

  const handleDepositFromHistory = () => {
    if (balanceHistoryUser) {
      handleDeposit(balanceHistoryUser)
    }
  }

  const handleWithdrawFromHistory = () => {
    if (balanceHistoryUser) {
      handleWithdraw(balanceHistoryUser)
    }
  }

  const handleAttributesModalClose = async () => {
    setShowAttributesModal(false)
    await loadAttributeDefinitions()
    void loadUsers()
  }

  const headerCells = useMemo(() => {
    const cells: Record<string, (ctx: DataTableHeaderContext) => React.ReactNode> = {}
    for (const usageKey of USAGE_COLUMN_KEYS) {
      cells[usageKey] = ({ column }) => (
        <div className="flex items-center gap-1.5">
          <span>{column.label}</span>
          <div className="usage-sort-trigger relative">
            <button
              type="button"
              className={`flex items-center gap-1 rounded px-1 py-0.5 transition-colors hover:bg-gray-200 dark:hover:bg-dark-700 ${
                usageSort && usageSort.key === usageKey
                  ? 'text-primary-600 dark:text-primary-400'
                  : 'text-gray-400 dark:text-dark-500'
              }`}
              title={t('admin.users.sortBy')}
              onClick={(e) => {
                e.stopPropagation()
                toggleUsageSortMenu(usageKey)
              }}
            >
              {usageSort && usageSort.key === usageKey ? (
                <span className="text-[10px] font-medium normal-case tracking-normal">
                  {usageSort.metric === 'today' ? t('admin.users.today') : t('admin.users.total')}
                </span>
              ) : null}
              {usageSort && usageSort.key === usageKey ? (
                <svg
                  className={`h-3.5 w-3.5 ${usageSort.order === 'desc' ? 'rotate-180' : ''}`}
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M14.707 12.707a1 1 0 01-1.414 0L10 9.414l-3.293 3.293a1 1 0 01-1.414-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 010 1.414z"
                    clipRule="evenodd"
                  />
                </svg>
              ) : (
                <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M10 3l-4 5h8l-4-5zM10 17l4-5H6l4 5z" />
                </svg>
              )}
            </button>
            {openUsageSortMenu === usageKey ? (
              <div className="absolute right-0 top-full z-50 mt-1 min-w-[120px] rounded-lg border border-gray-200 bg-white py-1 shadow-lg dark:border-dark-600 dark:bg-dark-800">
                {(['today', 'total'] as const).map((metric) => (
                  <button
                    key={metric}
                    type="button"
                    className={`flex w-full items-center justify-between gap-3 px-3 py-1.5 text-left text-xs normal-case tracking-normal hover:bg-gray-100 dark:hover:bg-dark-700 ${
                      isUsageSortActive(usageKey, metric)
                        ? 'font-medium text-primary-600 dark:text-primary-400'
                        : 'text-gray-700 dark:text-gray-300'
                    }`}
                    onClick={(e) => {
                      e.stopPropagation()
                      toggleUsageSort(usageKey, metric)
                    }}
                  >
                    <span>{metric === 'today' ? t('admin.users.today') : t('admin.users.total')}</span>
                    {getUsageSortOrder(usageKey, metric) ? (
                      <svg
                        className={`h-3 w-3 ${getUsageSortOrder(usageKey, metric) === 'desc' ? 'rotate-180' : ''}`}
                        fill="currentColor"
                        viewBox="0 0 20 20"
                      >
                        <path
                          fillRule="evenodd"
                          d="M14.707 12.707a1 1 0 01-1.414 0L10 9.414l-3.293 3.293a1 1 0 01-1.414-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 010 1.414z"
                          clipRule="evenodd"
                        />
                      </svg>
                    ) : null}
                  </button>
                ))}
                <div className="mt-1 border-t border-gray-100 px-3 py-1 text-[10px] normal-case tracking-normal text-gray-400 dark:border-dark-700 dark:text-dark-500">
                  {t('admin.users.sortCurrentPageOnly')}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )
    }
    return cells
  }, [getUsageSortOrder, openUsageSortMenu, t, usageSort])

  const tableCells = useMemo(() => {
    const cells: Record<string, (ctx: DataTableCellContext) => React.ReactNode> = {
      email: ({ value }) => (
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-100 dark:bg-primary-900/30">
            <span className="text-sm font-medium text-primary-700 dark:text-primary-300">
              {String(value).charAt(0).toUpperCase()}
            </span>
          </div>
          <span className="font-medium text-gray-900 dark:text-white">{value}</span>
        </div>
      ),
      username: ({ value }) => (
        <span className="text-sm text-gray-700 dark:text-gray-300">{value || '-'}</span>
      ),
      notes: ({ value }) => (
        <div className="max-w-xs">
          {value ? (
            <span
              title={String(value).length > 30 ? String(value) : undefined}
              className="block truncate text-sm text-gray-600 dark:text-gray-400"
            >
              {String(value).length > 30 ? `${String(value).substring(0, 25)}...` : value}
            </span>
          ) : (
            <span className="text-sm text-gray-400">-</span>
          )}
        </div>
      ),
      role: ({ value }) => (
        <span className={`badge ${value === 'admin' ? 'badge-purple' : 'badge-gray'}`}>
          {t(`admin.users.roles.${value}`)}
        </span>
      ),
      groups: ({ row }) => {
        const userGroups = getUserGroups(row as AdminUser)
        if (allGroups.length === 0) {
          return <span className="text-xs text-gray-400 dark:text-dark-500">-</span>
        }
        return (
          <div className="flex flex-col gap-1">
            {userGroups.exclusive.length > 0 ? (
              <span
                className="group/ex relative inline-flex cursor-pointer items-center gap-1 whitespace-nowrap text-xs"
                onClick={(e) => {
                  e.stopPropagation()
                  toggleExpandedGroup((row as AdminUser).id)
                }}
              >
                <Icon name="shield" size="xs" className="h-3.5 w-3.5 text-purple-500 dark:text-purple-400" />
                <span className="font-medium text-purple-600 dark:text-purple-400">
                  {userGroups.exclusive.length}
                </span>
                <span className="text-gray-500 dark:text-dark-400">{t('admin.users.exclusiveLabel')}</span>
                {expandedGroupUserId !== numericUserId((row as AdminUser).id) ? (
                  <div className="pointer-events-none absolute left-0 top-full z-50 mt-1.5 rounded bg-gray-900 px-2.5 py-1.5 text-xs text-white opacity-0 shadow-lg transition-opacity duration-75 group-hover/ex:opacity-100 dark:bg-dark-600">
                    <div className="absolute bottom-full left-4 border-4 border-transparent border-b-gray-900 dark:border-b-dark-600" />
                    <div className="flex flex-col gap-0.5 whitespace-nowrap">
                      {userGroups.exclusive.map((g) => (
                        <span key={g.id}>{g.name}</span>
                      ))}
                    </div>
                  </div>
                ) : null}
                {expandedGroupUserId === numericUserId((row as AdminUser).id) ? (
                  <div className="absolute left-0 top-full z-50 mt-1.5 min-w-[160px] overflow-hidden rounded-lg border border-gray-200 bg-white py-1 text-xs shadow-xl dark:border-dark-600 dark:bg-dark-700">
                    <div className="border-b border-gray-100 px-3 py-1.5 text-[10px] font-medium uppercase tracking-wider text-gray-400 dark:border-dark-600 dark:text-dark-400">
                      {t('admin.users.clickToReplace')}
                    </div>
                    {userGroups.exclusive.map((g) => (
                      <div
                        key={g.id}
                        className="flex cursor-pointer items-center gap-2 px-3 py-2 text-gray-700 transition-colors hover:bg-primary-50 hover:text-primary-600 dark:text-dark-200 dark:hover:bg-primary-900/30 dark:hover:text-primary-400"
                        onClick={(e) => {
                          e.stopPropagation()
                          openGroupReplace(row as AdminUser, g)
                        }}
                      >
                        <Icon name="swap" size="xs" className="h-3.5 w-3.5 flex-shrink-0 opacity-50" />
                        <span className="flex-1">{g.name}</span>
                      </div>
                    ))}
                  </div>
                ) : null}
              </span>
            ) : null}
            {userGroups.publicGroups.length > 0 ? (
              <span className="group/pub relative inline-flex cursor-default items-center gap-1 whitespace-nowrap text-xs">
                <Icon name="globe" size="xs" className="h-3.5 w-3.5 text-gray-400 dark:text-dark-500" />
                <span className="font-medium text-gray-600 dark:text-dark-300">
                  {userGroups.publicGroups.length}
                </span>
                <span className="text-gray-400 dark:text-dark-500">{t('admin.users.publicLabel')}</span>
                <div className="pointer-events-none absolute left-0 top-full z-50 mt-1.5 rounded bg-gray-900 px-2.5 py-1.5 text-xs text-white opacity-0 shadow-lg transition-opacity duration-75 group-hover/pub:opacity-100 dark:bg-dark-600">
                  <div className="absolute bottom-full left-4 border-4 border-transparent border-b-gray-900 dark:border-b-dark-600" />
                  <div className="flex flex-col gap-0.5 whitespace-nowrap">
                    {userGroups.publicGroups.map((g) => (
                      <span key={g.id}>{g.name}</span>
                    ))}
                  </div>
                </div>
              </span>
            ) : null}
            {userGroups.exclusive.length === 0 && userGroups.publicGroups.length === 0 ? (
              <span className="text-xs text-gray-400 dark:text-dark-500">-</span>
            ) : null}
          </div>
        )
      },
      subscriptions: ({ row }) => {
        const user = row as AdminUser
        if (user.subscriptions && user.subscriptions.length > 0) {
          return (
            <div className="flex flex-wrap gap-1.5">
              {user.subscriptions.map((sub) => (
                <span
                  key={sub.id}
                  title={sub.expires_at ? formatDateTime(sub.expires_at) : undefined}
                >
                  <GroupBadge
                    name={sub.group?.name || ''}
                    platform={sub.group?.platform}
                    subscriptionType={sub.group?.subscription_type}
                    rateMultiplier={sub.group?.rate_multiplier}
                    daysRemaining={sub.expires_at ? getDaysRemaining(sub.expires_at) : null}
                  />
                </span>
              ))}
            </div>
          )
        }
        return (
          <span className="inline-flex items-center gap-1.5 rounded-md bg-gray-50 px-2 py-1 text-xs text-gray-400 dark:bg-dark-700/50 dark:text-dark-500">
            <Icon name="ban" size="xs" className="h-3.5 w-3.5" />
            <span>{t('admin.users.noSubscription')}</span>
          </span>
        )
      },
      balance: ({ value, row }) => (
        <div className="flex items-center gap-2">
          <div className="group relative">
            <button
              type="button"
              className="font-medium text-gray-900 underline decoration-dashed decoration-gray-300 underline-offset-4 transition-colors hover:text-primary-600 dark:text-white dark:decoration-dark-500 dark:hover:text-primary-400"
              onClick={() => handleBalanceHistory(row as AdminUser)}
            >
              ${Number(value).toFixed(2)}
            </button>
            <div className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-1.5 -translate-x-1/2 whitespace-nowrap rounded bg-gray-900 px-2 py-1 text-xs text-white opacity-0 shadow-lg transition-opacity duration-75 group-hover:opacity-100 dark:bg-dark-600">
              {t('admin.users.balanceHistoryTip')}
              <div className="absolute left-1/2 top-full -translate-x-1/2 border-4 border-transparent border-t-gray-900 dark:border-t-dark-600" />
            </div>
          </div>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              handleDeposit(row as AdminUser)
            }}
            className="rounded px-2 py-0.5 text-xs font-medium text-emerald-600 transition-colors hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-900/20"
            title={t('admin.users.deposit')}
          >
            {t('admin.users.deposit')}
          </button>
        </div>
      ),
      balance_platform_quota: ({ row }) => (
        <button
          type="button"
          className="block text-left underline decoration-dashed decoration-gray-300 underline-offset-4 transition-colors hover:decoration-primary-400 dark:decoration-dark-500"
          title={t('admin.users.platformQuota.cellColumnTooltip')}
          onClick={() => handlePlatformQuota(row as AdminUser)}
        >
          <UserPlatformQuotaCell quotas={platformQuotaStats[numericUserId((row as AdminUser).id)]} />
        </button>
      ),
      usage: ({ row }) => (
        <PlatformUsageBreakdown
          today={usageStats[String(numericUserId((row as AdminUser).id))]?.today_actual_cost ?? 0}
          total={usageStats[String(numericUserId((row as AdminUser).id))]?.total_actual_cost ?? 0}
          byPlatform={usageStats[String(numericUserId((row as AdminUser).id))]?.by_platform}
        />
      ),
      usage_anthropic: ({ row }) => (
        <PlatformCostCell usage={getPlatformUsage((row as AdminUser).id, 'anthropic')} />
      ),
      usage_openai: ({ row }) => (
        <PlatformCostCell usage={getPlatformUsage((row as AdminUser).id, 'openai')} />
      ),
      usage_gemini: ({ row }) => (
        <PlatformCostCell usage={getPlatformUsage((row as AdminUser).id, 'gemini')} />
      ),
      usage_antigravity: ({ row }) => (
        <PlatformCostCell usage={getPlatformUsage((row as AdminUser).id, 'antigravity')} />
      ),
      concurrency: ({ row }) => (
        <UserConcurrencyCell
          current={(row as AdminUser).current_concurrency ?? 0}
          max={(row as AdminUser).concurrency ?? 0}
        />
      ),
      status: ({ value }) => (
        <div className="flex items-center gap-1.5">
          <span
            className={`inline-block h-2 w-2 rounded-full ${
              value === 'active' ? 'bg-green-500' : 'bg-red-500'
            }`}
          />
          <span className="text-sm text-gray-700 dark:text-gray-300">
            {value === 'active' ? t('common.active') : t('admin.users.disabled')}
          </span>
        </div>
      ),
      created_at: ({ value }) => (
        <span className="text-sm text-gray-500 dark:text-dark-400">{formatDateTime(value)}</span>
      ),
      last_used_at: ({ value }) => (
        <span className="text-sm text-gray-500 dark:text-dark-400">
          {value ? formatDateTime(value) : '-'}
        </span>
      ),
      last_active_at: ({ value }) => (
        <span className="text-sm text-gray-500 dark:text-dark-400">
          {value ? formatDateTime(value) : '-'}
        </span>
      ),
      actions: ({ row }) => {
        const user = row as AdminUser
        return (
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => handleEdit(user)}
              className="flex flex-col items-center gap-0.5 rounded-lg p-1.5 text-gray-500 transition-colors hover:bg-gray-100 hover:text-primary-600 dark:hover:bg-dark-700 dark:hover:text-primary-400"
            >
              <Icon name="edit" size="sm" />
              <span className="text-xs">{t('common.edit')}</span>
            </button>
            {user.role !== 'admin' ? (
              <button
                type="button"
                onClick={() => void handleToggleStatus(user)}
                className={`flex flex-col items-center gap-0.5 rounded-lg p-1.5 text-gray-500 transition-colors ${
                  user.status === 'active'
                    ? 'hover:bg-orange-50 hover:text-orange-600 dark:hover:bg-orange-900/20 dark:hover:text-orange-400'
                    : 'hover:bg-green-50 hover:text-green-600 dark:hover:bg-green-900/20 dark:hover:text-green-400'
                }`}
              >
                {user.status === 'active' ? (
                  <Icon name="ban" size="sm" />
                ) : (
                  <Icon name="checkCircle" size="sm" />
                )}
                <span className="text-xs">
                  {user.status === 'active' ? t('admin.users.disable') : t('admin.users.enable')}
                </span>
              </button>
            ) : null}
            <button
              type="button"
              onClick={(e) => openActionMenu(user, e)}
              className={`action-menu-trigger flex flex-col items-center gap-0.5 rounded-lg p-1.5 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 dark:hover:bg-dark-700 dark:hover:text-white ${
                activeMenuId === numericUserId(user.id)
                  ? 'bg-gray-100 text-gray-900 dark:bg-dark-700 dark:text-white'
                  : ''
              }`}
            >
              <Icon name="more" size="sm" />
              <span className="text-xs">{t('common.more')}</span>
            </button>
          </div>
        )
      },
    }

    for (const def of attributeDefinitions.filter((d) => d.enabled)) {
      cells[`attr_${def.id}`] = ({ row }) => (
        <div className="max-w-xs">
          <span
            className="block truncate text-sm text-gray-700 dark:text-gray-300"
            title={getAttributeValue((row as AdminUser).id, def.id)}
          >
            {getAttributeValue((row as AdminUser).id, def.id)}
          </span>
        </div>
      )
    }

    return cells
  }, [
    activeMenuId,
    allGroups.length,
    attributeDefinitions,
    expandedGroupUserId,
    getAttributeValue,
    getPlatformUsage,
    getUserGroups,
    platformQuotaStats,
    t,
    usageStats,
  ])

  return (
    <AppLayout>
      <TablePageLayout
        filters={
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex flex-1 flex-wrap items-center gap-3">
              <div className="relative w-full md:w-64">
                <Icon
                  name="search"
                  size="md"
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                />
                <input
                  value={searchQuery}
                  type="text"
                  placeholder={t('admin.users.searchUsers')}
                  className="input pl-10"
                  onChange={(e) => handleSearch(e.target.value)}
                />
              </div>

              {visibleFilters.has('role') ? (
                <div className="w-full sm:w-32">
                  <Select
                    modelValue={filters.role}
                    options={[
                      { value: '', label: t('admin.users.allRoles') },
                      { value: 'admin', label: t('admin.users.admin') },
                      { value: 'user', label: t('admin.users.user') },
                    ]}
                    onUpdateModelValue={(val) => {
                      setFilters((prev) => ({ ...prev, role: String(val ?? '') }))
                    }}
                    onChange={() => applyFilter()}
                  />
                </div>
              ) : null}

              {visibleFilters.has('status') ? (
                <div className="w-full sm:w-32">
                  <Select
                    modelValue={filters.status}
                    options={[
                      { value: '', label: t('admin.users.allStatus') },
                      { value: 'active', label: t('common.active') },
                      { value: 'disabled', label: t('admin.users.disabled') },
                    ]}
                    onUpdateModelValue={(val) => {
                      setFilters((prev) => ({ ...prev, status: String(val ?? '') }))
                    }}
                    onChange={() => applyFilter()}
                  />
                </div>
              ) : null}

              {visibleFilters.has('group') ? (
                <div className="w-full sm:w-44">
                  <Select
                    modelValue={filters.group}
                    options={groupFilterOptions}
                    searchable
                    creatable
                    creatablePrefix={t('admin.users.fuzzySearch')}
                    searchPlaceholder={t('admin.users.searchGroups')}
                    onUpdateModelValue={(val) => {
                      setFilters((prev) => ({ ...prev, group: String(val ?? '') }))
                    }}
                    onChange={() => applyFilter()}
                  />
                </div>
              ) : null}

              {Object.entries(activeAttributeFilters).map(([attrId, value]) =>
                visibleFilters.has(`attr_${attrId}`) ? (
                  <div key={attrId} className="relative w-full sm:w-36">
                    {['text', 'textarea', 'email', 'url', 'date'].includes(
                      getAttributeDefinition(Number(attrId))?.type || 'text',
                    ) ? (
                      <input
                        value={value}
                        onChange={(e) => updateAttributeFilter(Number(attrId), e.target.value)}
                        onKeyUp={(e) => {
                          if (e.key === 'Enter') applyFilter()
                        }}
                        placeholder={getAttributeDefinitionName(Number(attrId))}
                        className="input w-full"
                      />
                    ) : getAttributeDefinition(Number(attrId))?.type === 'number' ? (
                      <input
                        value={value}
                        type="number"
                        onChange={(e) => updateAttributeFilter(Number(attrId), e.target.value)}
                        onKeyUp={(e) => {
                          if (e.key === 'Enter') applyFilter()
                        }}
                        placeholder={getAttributeDefinitionName(Number(attrId))}
                        className="input w-full"
                      />
                    ) : ['select', 'multi_select'].includes(
                        getAttributeDefinition(Number(attrId))?.type || '',
                      ) ? (
                      <div className="w-full">
                        <Select
                          modelValue={value}
                          options={[
                            { value: '', label: getAttributeDefinitionName(Number(attrId)) },
                            ...(getAttributeDefinition(Number(attrId))?.options || []),
                          ]}
                          onUpdateModelValue={(val) => {
                            updateAttributeFilter(Number(attrId), String(val ?? ''))
                            applyFilter()
                          }}
                        />
                      </div>
                    ) : (
                      <input
                        value={value}
                        onChange={(e) => updateAttributeFilter(Number(attrId), e.target.value)}
                        onKeyUp={(e) => {
                          if (e.key === 'Enter') applyFilter()
                        }}
                        placeholder={getAttributeDefinitionName(Number(attrId))}
                        className="input w-full"
                      />
                    )}
                  </div>
                ) : null,
              )}
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2">
              <div className="flex items-center gap-2 md:contents">
                <button
                  type="button"
                  onClick={() => void loadUsers()}
                  disabled={loading}
                  className="btn btn-secondary px-2 md:px-3"
                  title={t('common.refresh')}
                >
                  <Icon name="refresh" size="md" className={loading ? 'animate-spin' : ''} />
                </button>

                <div className="relative" ref={filterDropdownRef}>
                  <button
                    type="button"
                    onClick={() => setShowFilterDropdown((v) => !v)}
                    className="btn btn-secondary px-2 md:px-3"
                    title={t('admin.users.filterSettings')}
                  >
                    <Icon name="filter" size="sm" className="md:mr-1.5" />
                    <span className="hidden md:inline">{t('admin.users.filterSettings')}</span>
                  </button>
                  {showFilterDropdown ? (
                    <div className="absolute right-0 top-full z-50 mt-1 w-48 rounded-lg border border-gray-200 bg-white py-1 shadow-lg dark:border-dark-600 dark:bg-dark-800">
                      {builtInFilters.map((filter) => (
                        <button
                          key={filter.key}
                          type="button"
                          onClick={() => toggleBuiltInFilter(filter.key)}
                          className="flex w-full items-center justify-between px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-dark-700"
                        >
                          <span>{filter.name}</span>
                          {visibleFilters.has(filter.key) ? (
                            <Icon name="check" size="sm" className="text-primary-500" strokeWidth={2} />
                          ) : null}
                        </button>
                      ))}
                      {filterableAttributes.length > 0 ? (
                        <div className="my-1 border-t border-gray-100 dark:border-dark-700" />
                      ) : null}
                      {filterableAttributes.map((attr) => (
                        <button
                          key={attr.id}
                          type="button"
                          onClick={() => toggleAttributeFilter(attr)}
                          className="flex w-full items-center justify-between px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-dark-700"
                        >
                          <span>{attr.name}</span>
                          {visibleFilters.has(`attr_${attr.id}`) ? (
                            <Icon name="check" size="sm" className="text-primary-500" strokeWidth={2} />
                          ) : null}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>

                <div className="relative" ref={columnDropdownRef}>
                  <button
                    type="button"
                    onClick={() => setShowColumnDropdown((v) => !v)}
                    className="btn btn-secondary px-2 md:px-3"
                    title={t('admin.users.columnSettings')}
                  >
                    <svg
                      className="h-4 w-4 md:mr-1.5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                      strokeWidth="1.5"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M9 4.5v15m6-15v15m-10.875 0h15.75c.621 0 1.125-.504 1.125-1.125V5.625c0-.621-.504-1.125-1.125-1.125H4.125C3.504 4.5 3 5.004 3 5.625v12.75c0 .621.504 1.125 1.125 1.125z"
                      />
                    </svg>
                    <span className="hidden md:inline">{t('admin.users.columnSettings')}</span>
                  </button>
                  {showColumnDropdown ? (
                    <div className="absolute right-0 top-full z-50 mt-1 max-h-80 w-48 overflow-y-auto rounded-lg border border-gray-200 bg-white py-1 shadow-lg dark:border-dark-600 dark:bg-dark-800">
                      {toggleableColumns.map((col) => (
                        <button
                          key={col.key}
                          type="button"
                          disabled={isForcedVisibleColumn(col.key)}
                          onClick={() => toggleColumn(col.key)}
                          className={`flex w-full items-center justify-between px-4 py-2 text-left text-sm ${
                            isForcedVisibleColumn(col.key)
                              ? 'cursor-not-allowed text-gray-400 dark:text-gray-500'
                              : 'text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-dark-700'
                          }`}
                          title={
                            isForcedVisibleColumn(col.key) ? t('admin.users.columnAlwaysVisible') : ''
                          }
                        >
                          <span>{col.label}</span>
                          {isColumnVisible(col.key) ? (
                            <Icon
                              name="check"
                              size="sm"
                              className={
                                isForcedVisibleColumn(col.key)
                                  ? 'text-gray-400 dark:text-gray-500'
                                  : 'text-primary-500'
                              }
                              strokeWidth={2}
                            />
                          ) : null}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>

                <button
                  type="button"
                  onClick={() => setShowAttributesModal(true)}
                  className="btn btn-secondary px-2 md:px-3"
                  title={t('admin.users.attributes.configButton')}
                >
                  <Icon name="cog" size="sm" className="md:mr-1.5" />
                  <span className="hidden md:inline">{t('admin.users.attributes.configButton')}</span>
                </button>
              </div>

              <button
                type="button"
                onClick={() => setShowCreateModal(true)}
                className="btn btn-primary flex-1 md:flex-initial"
              >
                <Icon name="plus" size="md" className="mr-2" />
                {t('admin.users.createUser')}
              </button>
            </div>
          </div>
        }
        table={
          <DataTable
            columns={columns}
            data={sortedUsers}
            loading={loading}
            actionsCount={7}
            serverSideSort
            defaultSortKey="created_at"
            defaultSortOrder="desc"
            sortStorageKey={USER_SORT_STORAGE_KEY}
            onSort={handleSort}
            cells={tableCells}
            headerCells={headerCells}
            emptySlot={
              <EmptyState
                title={t('admin.users.noUsersYet')}
                description={t('admin.users.createFirstUser')}
                actionText={t('admin.users.createUser')}
                onAction={() => setShowCreateModal(true)}
              />
            }
          />
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

      {mounted && activeMenuId !== null && menuPosition && activeMenuUser
        ? createPortal(
            <div
              className="action-menu-content fixed z-[9999] w-48 overflow-hidden rounded-xl bg-white shadow-lg ring-1 ring-black/5 dark:bg-dark-800 dark:ring-white/10"
              style={{ top: menuPosition.top, left: menuPosition.left }}
            >
              <div className="py-1">
                <button
                  type="button"
                  onClick={() => {
                    handleViewApiKeys(activeMenuUser)
                    closeActionMenu()
                  }}
                  className="flex w-full items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-dark-700"
                >
                  <Icon name="key" size="sm" className="text-gray-400" strokeWidth={2} />
                  {t('admin.users.apiKeys')}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    handleAllowedGroups(activeMenuUser)
                    closeActionMenu()
                  }}
                  className="flex w-full items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-dark-700"
                >
                  <Icon name="users" size="sm" className="text-gray-400" strokeWidth={2} />
                  {t('admin.users.groups')}
                </button>
                <div className="my-1 border-t border-gray-100 dark:border-dark-700" />
                <button
                  type="button"
                  onClick={() => {
                    handleDeposit(activeMenuUser)
                    closeActionMenu()
                  }}
                  className="flex w-full items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-dark-700"
                >
                  <Icon name="plus" size="sm" className="text-emerald-500" strokeWidth={2} />
                  {t('admin.users.deposit')}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    handleWithdraw(activeMenuUser)
                    closeActionMenu()
                  }}
                  className="flex w-full items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-dark-700"
                >
                  <svg className="h-4 w-4 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20 12H4" />
                  </svg>
                  {t('admin.users.withdraw')}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    handlePlatformQuota(activeMenuUser)
                    closeActionMenu()
                  }}
                  className="flex w-full items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-dark-700"
                >
                  <Icon name="chartBar" size="sm" className="text-gray-400" strokeWidth={2} />
                  {t('admin.users.platformQuota.menuItem')}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    handleBalanceHistory(activeMenuUser)
                    closeActionMenu()
                  }}
                  className="flex w-full items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-dark-700"
                >
                  <Icon name="dollar" size="sm" className="text-gray-400" strokeWidth={2} />
                  {t('admin.users.balanceHistory')}
                </button>
                <div className="my-1 border-t border-gray-100 dark:border-dark-700" />
                {activeMenuUser.role !== 'admin' ? (
                  <button
                    type="button"
                    onClick={() => {
                      handleDelete(activeMenuUser)
                      closeActionMenu()
                    }}
                    className="flex w-full items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20"
                  >
                    <Icon name="trash" size="sm" strokeWidth={2} />
                    {t('common.delete')}
                  </button>
                ) : null}
              </div>
            </div>,
            document.body,
          )
        : null}

      <ConfirmDialog
        show={showDeleteDialog}
        title={t('admin.users.deleteUser')}
        message={t('admin.users.deleteConfirm', { email: deletingUser?.email })}
        danger
        onConfirm={() => void confirmDelete()}
        onCancel={() => setShowDeleteDialog(false)}
      />
      <UserCreateModal
        show={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onSuccess={() => void loadUsers()}
      />
      <UserEditModal
        show={showEditModal}
        user={editingUser}
        onClose={closeEditModal}
        onSuccess={() => void loadUsers()}
      />
      <UserPlatformQuotaModal
        show={showPlatformQuotaModal}
        user={platformQuotaUser}
        onClose={closePlatformQuotaModal}
        onSuccess={() => void loadUsers()}
      />
      <UserApiKeysModal show={showApiKeysModal} user={viewingUser} onClose={closeApiKeysModal} />
      <UserAllowedGroupsModal
        show={showAllowedGroupsModal}
        user={allowedGroupsUser}
        onClose={closeAllowedGroupsModal}
        onSuccess={() => void loadUsers()}
      />
      <UserBalanceModal
        show={showBalanceModal}
        user={balanceUser}
        operation={balanceOperation}
        onClose={closeBalanceModal}
        onSuccess={() => void loadUsers()}
      />
      <UserBalanceHistoryModal
        show={showBalanceHistoryModal}
        user={balanceHistoryUser}
        onClose={closeBalanceHistoryModal}
        onDeposit={handleDepositFromHistory}
        onWithdraw={handleWithdrawFromHistory}
      />
      <GroupReplaceModal
        show={showGroupReplaceModal}
        user={groupReplaceUser}
        oldGroup={groupReplaceOldGroup}
        allGroups={allGroups}
        onClose={closeGroupReplaceModal}
        onSuccess={() => void loadUsers()}
      />
      <UserAttributesConfigModal show={showAttributesModal} onClose={() => void handleAttributesModalClose()} />
    </AppLayout>
  )
}
