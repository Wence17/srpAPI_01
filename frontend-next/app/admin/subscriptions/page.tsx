'use client'

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from 'react'
import Link from 'next/link'
import { useI18n } from '@/lib/i18n'
import { useApp } from '@/context/AppContext'
import { getPersistedPageSize } from '@/lib/usePersistedPageSize'
import { extractApiErrorMessage } from '@/lib/apiError'
import { formatDateOnly } from '@/lib/format'
import {
  getRemainingDurationParts,
  isOneTimeDailyQuota,
  type RemainingDurationParts,
} from '@/lib/subscriptionQuota'
import { adminSubscriptionsAPI } from '@/lib/adminSubscriptions'
import { adminGroupsAPI } from '@/lib/adminGroups'
import { adminUsageAPI, type SimpleUser } from '@/lib/adminUsage'
import AppLayout from '@/components/layout/AppLayout'
import TablePageLayout from '@/components/layout/TablePageLayout'
import DataTable, { type DataTableCellContext } from '@/components/common/DataTable'
import Pagination from '@/components/common/Pagination'
import BaseDialog from '@/components/common/BaseDialog'
import ConfirmDialog from '@/components/common/ConfirmDialog'
import EmptyState from '@/components/common/EmptyState'
import Select from '@/components/common/Select'
import GroupBadge from '@/components/keys/GroupBadge'
import GroupOptionItem from '@/components/keys/GroupOptionItem'
import Icon from '@/components/icons/Icon'
import type { Column } from '@/components/common/types'
import type { Group, GroupPlatform, SubscriptionType, UserSubscription } from '@/lib/types'

const USER_COLUMN_MODE_KEY = 'subscription-user-column-mode'
const HIDDEN_COLUMNS_KEY = 'subscription-hidden-columns'

interface GroupOption {
  value: number
  label: string
  description: string | null
  platform: GroupPlatform
  subscriptionType: SubscriptionType
  rate: number
  [key: string]: unknown
}

function isAbortError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const { name, code } = error as { name?: string; code?: string }
  return name === 'AbortError' || name === 'CanceledError' || code === 'ERR_CANCELED'
}

function getDaysRemaining(expiresAt: string): number | null {
  const now = new Date()
  const expires = new Date(expiresAt)
  const diff = expires.getTime() - now.getTime()
  if (diff < 0) return null
  return Math.ceil(diff / (1000 * 60 * 60 * 24))
}

function isExpiringSoon(expiresAt: string): boolean {
  const days = getDaysRemaining(expiresAt)
  return days !== null && days <= 7
}

function getProgressWidth(used: number | null | undefined, limit: number | null): string {
  if (!limit || limit === 0) return '0%'
  const usedValue = used ?? 0
  const percentage = Math.min((usedValue / limit) * 100, 100)
  return `${percentage}%`
}

function getProgressClass(used: number | null | undefined, limit: number | null): string {
  if (!limit || limit === 0) return 'bg-gray-400'
  const usedValue = used ?? 0
  const percentage = (usedValue / limit) * 100
  if (percentage >= 90) return 'bg-red-500'
  if (percentage >= 70) return 'bg-orange-500'
  return 'bg-green-500'
}

function Spinner({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg className={`${className} animate-spin`} fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  )
}

export default function AdminSubscriptionsPage() {
  const { t } = useI18n()
  const appStore = useApp()

  const [userColumnMode, setUserColumnModeState] = useState<'email' | 'username'>('email')
  const [hiddenColumns, setHiddenColumns] = useState<Set<string>>(new Set())
  const [showColumnDropdown, setShowColumnDropdown] = useState(false)
  const columnDropdownRef = useRef<HTMLDivElement | null>(null)

  const [subscriptions, setSubscriptions] = useState<UserSubscription[]>([])
  const [groups, setGroups] = useState<Group[]>([])
  const [loading, setLoading] = useState(false)
  const abortControllerRef = useRef<AbortController | null>(null)

  const [filterUserKeyword, setFilterUserKeyword] = useState('')
  const [filterUserResults, setFilterUserResults] = useState<SimpleUser[]>([])
  const [filterUserLoading, setFilterUserLoading] = useState(false)
  const [showFilterUserDropdown, setShowFilterUserDropdown] = useState(false)
  const [selectedFilterUser, setSelectedFilterUser] = useState<SimpleUser | null>(null)
  const filterUserSearchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [userSearchKeyword, setUserSearchKeyword] = useState('')
  const [userSearchResults, setUserSearchResults] = useState<SimpleUser[]>([])
  const [userSearchLoading, setUserSearchLoading] = useState(false)
  const [showUserDropdown, setShowUserDropdown] = useState(false)
  const [selectedUser, setSelectedUser] = useState<SimpleUser | null>(null)
  const userSearchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [filters, setFilters] = useState({
    status: 'active',
    group_id: '',
    platform: '',
    user_id: null as number | null,
  })

  const [sortState, setSortState] = useState({
    sort_by: 'created_at',
    sort_order: 'desc' as 'asc' | 'desc',
  })

  const [pagination, setPagination] = useState({
    page: 1,
    page_size: getPersistedPageSize(),
    total: 0,
    pages: 0,
  })

  const [showAssignModal, setShowAssignModal] = useState(false)
  const [showExtendModal, setShowExtendModal] = useState(false)
  const [showRevokeDialog, setShowRevokeDialog] = useState(false)
  const [showResetQuotaConfirm, setShowResetQuotaConfirm] = useState(false)
  const [showGuideModal, setShowGuideModal] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [resettingSubscription, setResettingSubscription] = useState<UserSubscription | null>(null)
  const [resettingQuota, setResettingQuota] = useState(false)
  const [extendingSubscription, setExtendingSubscription] = useState<UserSubscription | null>(null)
  const [revokingSubscription, setRevokingSubscription] = useState<UserSubscription | null>(null)

  const [assignForm, setAssignForm] = useState({
    user_id: null as number | null,
    group_id: null as number | null,
    validity_days: 30,
  })

  const [extendForm, setExtendForm] = useState({ days: 30 })

  const guideActionRows = useMemo(
    () => [
      { action: t('admin.subscriptions.guide.actions.adjust'), desc: t('admin.subscriptions.guide.actions.adjustDesc') },
      { action: t('admin.subscriptions.guide.actions.resetQuota'), desc: t('admin.subscriptions.guide.actions.resetQuotaDesc') },
      { action: t('admin.subscriptions.guide.actions.revoke'), desc: t('admin.subscriptions.guide.actions.revokeDesc') },
    ],
    [t],
  )

  const allColumns = useMemo<Column[]>(
    () => [
      {
        key: 'user',
        label:
          userColumnMode === 'email'
            ? t('admin.subscriptions.columns.user')
            : t('admin.users.columns.username'),
        sortable: false,
      },
      { key: 'group', label: t('admin.subscriptions.columns.group'), sortable: false },
      { key: 'usage', label: t('admin.subscriptions.columns.usage'), sortable: false },
      { key: 'expires_at', label: t('admin.subscriptions.columns.expires'), sortable: true },
      { key: 'status', label: t('admin.subscriptions.columns.status'), sortable: true },
      { key: 'actions', label: t('admin.subscriptions.columns.actions'), sortable: false },
    ],
    [t, userColumnMode],
  )

  const toggleableColumns = useMemo(
    () => allColumns.filter((col) => col.key !== 'user' && col.key !== 'actions'),
    [allColumns],
  )

  const columns = useMemo<Column[]>(
    () =>
      allColumns.filter(
        (col) => col.key === 'user' || col.key === 'actions' || !hiddenColumns.has(col.key),
      ),
    [allColumns, hiddenColumns],
  )

  const statusOptions = useMemo(
    () => [
      { value: '', label: t('admin.subscriptions.allStatus') },
      { value: 'active', label: t('admin.subscriptions.status.active') },
      { value: 'expired', label: t('admin.subscriptions.status.expired') },
      { value: 'revoked', label: t('admin.subscriptions.status.revoked') },
    ],
    [t],
  )

  const groupOptions = useMemo(
    () => [
      { value: '', label: t('admin.subscriptions.allGroups') },
      ...groups.map((g) => ({ value: g.id.toString(), label: g.name })),
    ],
    [groups, t],
  )

  const platformFilterOptions = useMemo(
    () => [
      { value: '', label: t('admin.subscriptions.allPlatforms') },
      { value: 'anthropic', label: 'Anthropic' },
      { value: 'openai', label: 'OpenAI' },
      { value: 'gemini', label: 'Gemini' },
      { value: 'antigravity', label: 'Antigravity' },
    ],
    [t],
  )

  const subscriptionGroupOptions = useMemo<GroupOption[]>(
    () =>
      groups
        .filter((g) => g.subscription_type === 'subscription' && g.status === 'active')
        .map((g) => ({
          value: g.id,
          label: g.name,
          description: g.description,
          platform: g.platform,
          subscriptionType: g.subscription_type,
          rate: g.rate_multiplier,
        })),
    [groups],
  )

  const formatResetDuration = useCallback(
    (parts: RemainingDurationParts): string => {
      if (parts.days > 0) {
        return t('admin.subscriptions.resetInDaysHours', { days: parts.days, hours: parts.hours })
      }
      if (parts.hours > 0) {
        return t('admin.subscriptions.resetInHoursMinutes', { hours: parts.hours, minutes: parts.minutes })
      }
      return t('admin.subscriptions.resetInMinutes', { minutes: parts.minutes })
    },
    [t],
  )

  const formatQuotaEndDuration = useCallback(
    (parts: RemainingDurationParts): string => {
      if (parts.days > 0) {
        return t('admin.subscriptions.quotaEndsInDaysHours', { days: parts.days, hours: parts.hours })
      }
      if (parts.hours > 0) {
        return t('admin.subscriptions.quotaEndsInHoursMinutes', { hours: parts.hours, minutes: parts.minutes })
      }
      return t('admin.subscriptions.quotaEndsInMinutes', { minutes: parts.minutes })
    },
    [t],
  )

  const formatResetTime = useCallback(
    (windowStart: string | null, period: 'daily' | 'weekly' | 'monthly'): string => {
      if (!windowStart) return t('admin.subscriptions.windowNotActive')

      const start = new Date(windowStart)
      const now = new Date()

      let resetTime: Date
      switch (period) {
        case 'daily':
          resetTime = new Date(start.getTime() + 24 * 60 * 60 * 1000)
          break
        case 'weekly':
          resetTime = new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000)
          break
        case 'monthly':
          resetTime = new Date(start.getTime() + 30 * 24 * 60 * 60 * 1000)
          break
      }

      const parts = getRemainingDurationParts(resetTime, now)
      return parts ? formatResetDuration(parts) : t('admin.subscriptions.windowNotActive')
    },
    [formatResetDuration, t],
  )

  const formatDailyUsageWindow = useCallback(
    (subscription: UserSubscription): string => {
      if (isOneTimeDailyQuota(subscription) && subscription.expires_at) {
        const parts = getRemainingDurationParts(subscription.expires_at)
        return parts ? formatQuotaEndDuration(parts) : t('admin.subscriptions.windowNotActive')
      }
      return formatResetTime(subscription.daily_window_start, 'daily')
    },
    [formatQuotaEndDuration, formatResetTime, t],
  )

  const loadSubscriptions = useCallback(async () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }
    const requestController = new AbortController()
    abortControllerRef.current = requestController
    const { signal } = requestController

    setLoading(true)
    try {
      const response = await adminSubscriptionsAPI.list(
        pagination.page,
        pagination.page_size,
        {
          status: (filters.status as 'active' | 'expired' | 'revoked') || undefined,
          group_id: filters.group_id ? parseInt(filters.group_id, 10) : undefined,
          platform: filters.platform || undefined,
          user_id: filters.user_id || undefined,
          sort_by: sortState.sort_by,
          sort_order: sortState.sort_order,
        },
        { signal },
      )
      if (signal.aborted || abortControllerRef.current !== requestController) return
      setSubscriptions(response.items)
      setPagination((prev) => ({
        ...prev,
        total: response.total,
        pages: response.pages,
      }))
    } catch (error) {
      if (isAbortError(error)) return
      appStore.showError(t('admin.subscriptions.failedToLoad'))
      console.error('Error loading subscriptions:', error)
    } finally {
      if (abortControllerRef.current === requestController) {
        setLoading(false)
        abortControllerRef.current = null
      }
    }
  }, [appStore, filters, pagination.page, pagination.page_size, sortState, t])

  const loadGroups = useCallback(async () => {
    try {
      const result = await adminGroupsAPI.getAll()
      setGroups(result)
    } catch (error) {
      console.error('Error loading groups:', error)
    }
  }, [])

  const applyFilters = useCallback(() => {
    setPagination((prev) => ({ ...prev, page: 1 }))
  }, [])

  useEffect(() => {
    loadSubscriptions()
  }, [loadSubscriptions])

  useEffect(() => {
    try {
      const saved = localStorage.getItem(USER_COLUMN_MODE_KEY)
      if (saved === 'email' || saved === 'username') {
        setUserColumnModeState(saved)
      }
    } catch (e) {
      console.error('Failed to load user column mode:', e)
    }

    try {
      const saved = localStorage.getItem(HIDDEN_COLUMNS_KEY)
      if (saved) {
        const parsed = JSON.parse(saved) as string[]
        setHiddenColumns(new Set(parsed))
      }
    } catch (e) {
      console.error('Failed to load saved columns:', e)
    }

    loadGroups()
  }, [loadGroups])

  const setUserColumnMode = useCallback((mode: 'email' | 'username') => {
    setUserColumnModeState(mode)
    try {
      localStorage.setItem(USER_COLUMN_MODE_KEY, mode)
    } catch (e) {
      console.error('Failed to save user column mode:', e)
    }
  }, [])

  const toggleColumn = useCallback((key: string) => {
    setHiddenColumns((prev) => {
      const next = new Set(prev)
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.add(key)
      }
      try {
        localStorage.setItem(HIDDEN_COLUMNS_KEY, JSON.stringify([...next]))
      } catch (e) {
        console.error('Failed to save columns:', e)
      }
      return next
    })
  }, [])

  const isColumnVisible = useCallback((key: string) => !hiddenColumns.has(key), [hiddenColumns])

  const searchFilterUsers = useCallback(async () => {
    const keyword = filterUserKeyword.trim()

    if (selectedFilterUser && keyword !== selectedFilterUser.email) {
      setSelectedFilterUser(null)
      setFilters((prev) => ({ ...prev, user_id: null }))
      applyFilters()
    }

    if (!keyword) {
      setFilterUserResults([])
      return
    }

    setFilterUserLoading(true)
    try {
      setFilterUserResults(await adminUsageAPI.searchUsers(keyword))
    } catch (error) {
      console.error('Failed to search users:', error)
      setFilterUserResults([])
    } finally {
      setFilterUserLoading(false)
    }
  }, [applyFilters, filterUserKeyword, selectedFilterUser])

  const debounceSearchFilterUsers = useCallback(() => {
    if (filterUserSearchTimeoutRef.current) {
      clearTimeout(filterUserSearchTimeoutRef.current)
    }
    filterUserSearchTimeoutRef.current = setTimeout(searchFilterUsers, 300)
  }, [searchFilterUsers])

  const selectFilterUser = useCallback(
    (user: SimpleUser) => {
      setSelectedFilterUser(user)
      setFilterUserKeyword(user.email)
      setShowFilterUserDropdown(false)
      setFilters((prev) => ({ ...prev, user_id: user.id }))
      applyFilters()
    },
    [applyFilters],
  )

  const clearFilterUser = useCallback(() => {
    setSelectedFilterUser(null)
    setFilterUserKeyword('')
    setFilterUserResults([])
    setShowFilterUserDropdown(false)
    setFilters((prev) => ({ ...prev, user_id: null }))
    applyFilters()
  }, [applyFilters])

  const searchUsers = useCallback(async () => {
    const keyword = userSearchKeyword.trim()

    if (selectedUser && keyword !== selectedUser.email) {
      setSelectedUser(null)
      setAssignForm((prev) => ({ ...prev, user_id: null }))
    }

    if (!keyword) {
      setUserSearchResults([])
      return
    }

    setUserSearchLoading(true)
    try {
      setUserSearchResults(await adminUsageAPI.searchUsers(keyword))
    } catch (error) {
      console.error('Failed to search users:', error)
      setUserSearchResults([])
    } finally {
      setUserSearchLoading(false)
    }
  }, [selectedUser, userSearchKeyword])

  const debounceSearchUsers = useCallback(() => {
    if (userSearchTimeoutRef.current) {
      clearTimeout(userSearchTimeoutRef.current)
    }
    userSearchTimeoutRef.current = setTimeout(searchUsers, 300)
  }, [searchUsers])

  const selectUser = useCallback((user: SimpleUser) => {
    setSelectedUser(user)
    setUserSearchKeyword(user.email)
    setShowUserDropdown(false)
    setAssignForm((prev) => ({ ...prev, user_id: user.id }))
  }, [])

  const clearUserSelection = useCallback(() => {
    setSelectedUser(null)
    setUserSearchKeyword('')
    setUserSearchResults([])
    setAssignForm((prev) => ({ ...prev, user_id: null }))
  }, [])

  const handlePageChange = useCallback((page: number) => {
    setPagination((prev) => ({ ...prev, page }))
  }, [])

  const handlePageSizeChange = useCallback((pageSize: number) => {
    setPagination((prev) => ({ ...prev, page_size: pageSize, page: 1 }))
  }, [])

  const handleSort = useCallback((key: string, order: 'asc' | 'desc') => {
    setSortState({ sort_by: key, sort_order: order })
    setPagination((prev) => ({ ...prev, page: 1 }))
  }, [])

  const closeAssignModal = useCallback(() => {
    setShowAssignModal(false)
    setAssignForm({ user_id: null, group_id: null, validity_days: 30 })
    setSelectedUser(null)
    setUserSearchKeyword('')
    setUserSearchResults([])
    setShowUserDropdown(false)
  }, [])

  const handleAssignSubscription = useCallback(
    async (event: FormEvent) => {
      event.preventDefault()

      if (!assignForm.user_id) {
        appStore.showError(t('admin.subscriptions.pleaseSelectUser'))
        return
      }
      if (!assignForm.group_id) {
        appStore.showError(t('admin.subscriptions.pleaseSelectGroup'))
        return
      }
      if (!assignForm.validity_days || assignForm.validity_days < 1) {
        appStore.showError(t('admin.subscriptions.validityDaysRequired'))
        return
      }

      setSubmitting(true)
      try {
        await adminSubscriptionsAPI.assign({
          user_id: assignForm.user_id,
          group_id: assignForm.group_id,
          validity_days: assignForm.validity_days,
        })
        appStore.showSuccess(t('admin.subscriptions.subscriptionAssigned'))
        closeAssignModal()
        loadSubscriptions()
      } catch (error) {
        appStore.showError(
          extractApiErrorMessage(error, t('admin.subscriptions.failedToAssign')),
        )
        console.error('Error assigning subscription:', error)
      } finally {
        setSubmitting(false)
      }
    },
    [appStore, assignForm, closeAssignModal, loadSubscriptions, t],
  )

  const handleExtend = useCallback((subscription: UserSubscription) => {
    setExtendingSubscription(subscription)
    setExtendForm({ days: 30 })
    setShowExtendModal(true)
  }, [])

  const closeExtendModal = useCallback(() => {
    setShowExtendModal(false)
    setExtendingSubscription(null)
  }, [])

  const handleExtendSubscription = useCallback(
    async (event: FormEvent) => {
      event.preventDefault()
      if (!extendingSubscription) return

      if (extendingSubscription.expires_at) {
        const expiresAt = new Date(extendingSubscription.expires_at)
        const newExpiresAt = new Date(expiresAt.getTime() + extendForm.days * 24 * 60 * 60 * 1000)
        if (newExpiresAt <= new Date()) {
          appStore.showError(t('admin.subscriptions.adjustWouldExpire'))
          return
        }
      }

      setSubmitting(true)
      try {
        await adminSubscriptionsAPI.extend(extendingSubscription.id, { days: extendForm.days })
        appStore.showSuccess(t('admin.subscriptions.subscriptionAdjusted'))
        closeExtendModal()
        loadSubscriptions()
      } catch (error) {
        appStore.showError(
          extractApiErrorMessage(error, t('admin.subscriptions.failedToAdjust')),
        )
        console.error('Error adjusting subscription:', error)
      } finally {
        setSubmitting(false)
      }
    },
    [appStore, closeExtendModal, extendForm.days, extendingSubscription, loadSubscriptions, t],
  )

  const handleRevoke = useCallback((subscription: UserSubscription) => {
    setRevokingSubscription(subscription)
    setShowRevokeDialog(true)
  }, [])

  const confirmRevoke = useCallback(async () => {
    if (!revokingSubscription) return

    try {
      await adminSubscriptionsAPI.revoke(revokingSubscription.id)
      appStore.showSuccess(t('admin.subscriptions.subscriptionRevoked'))
      setShowRevokeDialog(false)
      setRevokingSubscription(null)
      loadSubscriptions()
    } catch (error) {
      appStore.showError(
        extractApiErrorMessage(error, t('admin.subscriptions.failedToRevoke')),
      )
      console.error('Error revoking subscription:', error)
    }
  }, [appStore, loadSubscriptions, revokingSubscription, t])

  const handleResetQuota = useCallback((subscription: UserSubscription) => {
    setResettingSubscription(subscription)
    setShowResetQuotaConfirm(true)
  }, [])

  const confirmResetQuota = useCallback(async () => {
    if (!resettingSubscription || resettingQuota) return

    setResettingQuota(true)
    try {
      await adminSubscriptionsAPI.resetQuota(resettingSubscription.id, {
        daily: true,
        weekly: true,
        monthly: true,
      })
      appStore.showSuccess(t('admin.subscriptions.quotaResetSuccess'))
      setShowResetQuotaConfirm(false)
      setResettingSubscription(null)
      await loadSubscriptions()
    } catch (error) {
      appStore.showError(
        extractApiErrorMessage(error, t('admin.subscriptions.failedToResetQuota')),
      )
      console.error('Error resetting quota:', error)
    } finally {
      setResettingQuota(false)
    }
  }, [appStore, loadSubscriptions, resettingQuota, resettingSubscription, t])

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement
      if (!target.closest('[data-assign-user-search]')) setShowUserDropdown(false)
      if (!target.closest('[data-filter-user-search]')) setShowFilterUserDropdown(false)
      if (columnDropdownRef.current && !columnDropdownRef.current.contains(target)) {
        setShowColumnDropdown(false)
      }
    }

    document.addEventListener('click', handleClickOutside)
    return () => {
      document.removeEventListener('click', handleClickOutside)
      if (filterUserSearchTimeoutRef.current) clearTimeout(filterUserSearchTimeoutRef.current)
      if (userSearchTimeoutRef.current) clearTimeout(userSearchTimeoutRef.current)
    }
  }, [])

  const renderUsageCell = useCallback(
    (row: UserSubscription) => (
      <div className="min-w-[280px] space-y-2">
        {row.group?.daily_limit_usd ? (
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="w-10 flex-shrink-0 text-xs font-medium text-gray-500 dark:text-gray-400">
                {t('admin.subscriptions.daily')}
              </span>
              <div className="h-1.5 flex-1 rounded-full bg-gray-200 dark:bg-dark-600">
                <div
                  className={`h-1.5 rounded-full transition-all ${getProgressClass(row.daily_usage_usd, row.group.daily_limit_usd)}`}
                  style={{
                    width: getProgressWidth(row.daily_usage_usd, row.group.daily_limit_usd),
                  }}
                />
              </div>
              <span className="whitespace-nowrap text-xs tabular-nums text-gray-600 dark:text-gray-300">
                ${row.daily_usage_usd?.toFixed(2) || '0.00'}
                <span className="text-gray-400"> / </span>${row.group.daily_limit_usd.toFixed(2)}
              </span>
            </div>
            {row.daily_window_start ? (
              <div className="flex items-center gap-1 pl-12 text-[10px] text-blue-600 dark:text-blue-400">
                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>{formatDailyUsageWindow(row)}</span>
              </div>
            ) : null}
          </div>
        ) : null}

        {row.group?.weekly_limit_usd ? (
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="w-10 flex-shrink-0 text-xs font-medium text-gray-500 dark:text-gray-400">
                {t('admin.subscriptions.weekly')}
              </span>
              <div className="h-1.5 flex-1 rounded-full bg-gray-200 dark:bg-dark-600">
                <div
                  className={`h-1.5 rounded-full transition-all ${getProgressClass(row.weekly_usage_usd, row.group.weekly_limit_usd)}`}
                  style={{
                    width: getProgressWidth(row.weekly_usage_usd, row.group.weekly_limit_usd),
                  }}
                />
              </div>
              <span className="whitespace-nowrap text-xs tabular-nums text-gray-600 dark:text-gray-300">
                ${row.weekly_usage_usd?.toFixed(2) || '0.00'}
                <span className="text-gray-400"> / </span>${row.group.weekly_limit_usd.toFixed(2)}
              </span>
            </div>
            {row.weekly_window_start ? (
              <div className="flex items-center gap-1 pl-12 text-[10px] text-blue-600 dark:text-blue-400">
                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>{formatResetTime(row.weekly_window_start, 'weekly')}</span>
              </div>
            ) : null}
          </div>
        ) : null}

        {row.group?.monthly_limit_usd ? (
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="w-10 flex-shrink-0 text-xs font-medium text-gray-500 dark:text-gray-400">
                {t('admin.subscriptions.monthly')}
              </span>
              <div className="h-1.5 flex-1 rounded-full bg-gray-200 dark:bg-dark-600">
                <div
                  className={`h-1.5 rounded-full transition-all ${getProgressClass(row.monthly_usage_usd, row.group.monthly_limit_usd)}`}
                  style={{
                    width: getProgressWidth(row.monthly_usage_usd, row.group.monthly_limit_usd),
                  }}
                />
              </div>
              <span className="whitespace-nowrap text-xs tabular-nums text-gray-600 dark:text-gray-300">
                ${row.monthly_usage_usd?.toFixed(2) || '0.00'}
                <span className="text-gray-400"> / </span>${row.group.monthly_limit_usd.toFixed(2)}
              </span>
            </div>
            {row.monthly_window_start ? (
              <div className="flex items-center gap-1 pl-12 text-[10px] text-blue-600 dark:text-blue-400">
                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>{formatResetTime(row.monthly_window_start, 'monthly')}</span>
              </div>
            ) : null}
          </div>
        ) : null}

        {!row.group?.daily_limit_usd &&
        !row.group?.weekly_limit_usd &&
        !row.group?.monthly_limit_usd ? (
          <div className="flex items-center gap-2 rounded-lg bg-gradient-to-r from-emerald-50 to-teal-50 px-3 py-2 dark:from-emerald-900/20 dark:to-teal-900/20">
            <span className="text-lg text-emerald-600 dark:text-emerald-400">∞</span>
            <span className="text-xs font-medium text-emerald-700 dark:text-emerald-300">
              {t('admin.subscriptions.unlimited')}
            </span>
          </div>
        ) : null}
      </div>
    ),
    [formatDailyUsageWindow, formatResetTime, t],
  )

  const tableCells = useMemo(
    () => ({
      user: ({ row }: DataTableCellContext) => (
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-100 dark:bg-primary-900/30">
            <span className="text-sm font-medium text-primary-700 dark:text-primary-300">
              {userColumnMode === 'email'
                ? row.user?.email?.charAt(0).toUpperCase() || '?'
                : row.user?.username?.charAt(0).toUpperCase() || '?'}
            </span>
          </div>
          <span className="font-medium text-gray-900 dark:text-white">
            {userColumnMode === 'email'
              ? row.user?.email || t('admin.redeem.userPrefix', { id: row.user_id })
              : row.user?.username || '-'}
          </span>
        </div>
      ),
      group: ({ row }: DataTableCellContext) =>
        row.group ? (
          <GroupBadge
            name={row.group.name}
            platform={row.group.platform}
            subscriptionType={row.group.subscription_type}
            rateMultiplier={row.group.rate_multiplier}
            showRate={false}
          />
        ) : (
          <span className="text-sm text-gray-400 dark:text-dark-500">-</span>
        ),
      usage: ({ row }: DataTableCellContext) => renderUsageCell(row as UserSubscription),
      expires_at: ({ value }: DataTableCellContext) =>
        value ? (
          <div>
            <span
              className={`text-sm ${
                isExpiringSoon(value)
                  ? 'text-orange-600 dark:text-orange-400'
                  : 'text-gray-700 dark:text-gray-300'
              }`}
            >
              {formatDateOnly(value)}
            </span>
            {getDaysRemaining(value) !== null ? (
              <div className="text-xs text-gray-500">
                {getDaysRemaining(value)} {t('admin.subscriptions.daysRemaining')}
              </div>
            ) : null}
          </div>
        ) : (
          <span className="text-sm text-gray-500">{t('admin.subscriptions.noExpiration')}</span>
        ),
      status: ({ value }: DataTableCellContext) => (
        <span
          className={`badge ${
            value === 'active'
              ? 'badge-success'
              : value === 'expired'
                ? 'badge-warning'
                : 'badge-danger'
          }`}
        >
          {t(`admin.subscriptions.status.${value}`)}
        </span>
      ),
      actions: ({ row }: DataTableCellContext) => (
        <div className="flex items-center gap-1">
          {row.status === 'active' || row.status === 'expired' ? (
            <button
              type="button"
              onClick={() => handleExtend(row as UserSubscription)}
              className="flex flex-col items-center gap-0.5 rounded-lg p-1.5 text-gray-500 transition-colors hover:bg-blue-50 hover:text-blue-600 dark:hover:bg-blue-900/20 dark:hover:text-blue-400"
            >
              <Icon name="calendar" size="sm" />
              <span className="text-xs">{t('admin.subscriptions.adjust')}</span>
            </button>
          ) : null}
          {row.status === 'active' ? (
            <button
              type="button"
              onClick={() => handleResetQuota(row as UserSubscription)}
              disabled={resettingQuota && resettingSubscription?.id === row.id}
              className="flex flex-col items-center gap-0.5 rounded-lg p-1.5 text-gray-500 transition-colors hover:bg-orange-50 hover:text-orange-600 dark:hover:bg-orange-900/20 dark:hover:text-orange-400 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Icon name="refresh" size="sm" />
              <span className="text-xs">{t('admin.subscriptions.resetQuota')}</span>
            </button>
          ) : null}
          {row.status === 'active' ? (
            <button
              type="button"
              onClick={() => handleRevoke(row as UserSubscription)}
              className="flex flex-col items-center gap-0.5 rounded-lg p-1.5 text-gray-500 transition-colors hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20 dark:hover:text-red-400"
            >
              <Icon name="ban" size="sm" />
              <span className="text-xs">{t('admin.subscriptions.revoke')}</span>
            </button>
          ) : null}
        </div>
      ),
    }),
    [
      handleExtend,
      handleResetQuota,
      handleRevoke,
      renderUsageCell,
      resettingQuota,
      resettingSubscription?.id,
      t,
      userColumnMode,
    ],
  )

  return (
    <AppLayout>
      <TablePageLayout
        filters={
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex flex-1 flex-wrap items-center gap-3">
              <div className="relative w-full sm:w-64" data-filter-user-search>
                <Icon
                  name="search"
                  size="md"
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                />
                <input
                  value={filterUserKeyword}
                  onChange={(event) => {
                    setFilterUserKeyword(event.target.value)
                    debounceSearchFilterUsers()
                  }}
                  onFocus={() => setShowFilterUserDropdown(true)}
                  type="text"
                  placeholder={t('admin.users.searchUsers')}
                  className="input pl-10 pr-8"
                />
                {selectedFilterUser ? (
                  <button
                    type="button"
                    onClick={clearFilterUser}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                    title={t('common.clear')}
                  >
                    <Icon name="x" size="sm" strokeWidth={2} />
                  </button>
                ) : null}

                {showFilterUserDropdown && (filterUserResults.length > 0 || filterUserKeyword) ? (
                  <div className="absolute z-50 mt-1 max-h-60 w-full overflow-auto rounded-lg border border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-800">
                    {filterUserLoading ? (
                      <div className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                        {t('common.loading')}
                      </div>
                    ) : filterUserResults.length === 0 && filterUserKeyword ? (
                      <div className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                        {t('common.noOptionsFound')}
                      </div>
                    ) : (
                      filterUserResults.map((user) => (
                        <button
                          key={user.id}
                          type="button"
                          onClick={() => selectFilterUser(user)}
                          className="w-full px-4 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700"
                        >
                          <span className="font-medium text-gray-900 dark:text-white">{user.email}</span>
                          <span className="ml-2 text-gray-500 dark:text-gray-400">#{user.id}</span>
                        </button>
                      ))
                    )}
                  </div>
                ) : null}
              </div>

              <div className="w-full sm:w-40">
                <Select
                  modelValue={filters.status}
                  options={statusOptions}
                  placeholder={t('admin.subscriptions.allStatus')}
                  onUpdateModelValue={(value) => {
                    setFilters((prev) => ({ ...prev, status: String(value ?? '') }))
                    applyFilters()
                  }}
                />
              </div>
              <div className="w-full sm:w-48">
                <Select
                  modelValue={filters.group_id}
                  options={groupOptions}
                  placeholder={t('admin.subscriptions.allGroups')}
                  onUpdateModelValue={(value) => {
                    setFilters((prev) => ({ ...prev, group_id: String(value ?? '') }))
                    applyFilters()
                  }}
                />
              </div>
              <div className="w-full sm:w-40">
                <Select
                  modelValue={filters.platform}
                  options={platformFilterOptions}
                  placeholder={t('admin.subscriptions.allPlatforms')}
                  onUpdateModelValue={(value) => {
                    setFilters((prev) => ({ ...prev, platform: String(value ?? '') }))
                    applyFilters()
                  }}
                />
              </div>
            </div>

            <div className="ml-auto flex flex-wrap items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => loadSubscriptions()}
                disabled={loading}
                className="btn btn-secondary"
                title={t('common.refresh')}
              >
                <Icon name="refresh" size="md" className={loading ? 'animate-spin' : ''} />
              </button>

              <div className="relative" ref={columnDropdownRef}>
                <button
                  type="button"
                  onClick={() => setShowColumnDropdown((prev) => !prev)}
                  className="btn btn-secondary px-2 md:px-3"
                  title={t('admin.users.columnSettings')}
                >
                  <svg className="h-4 w-4 md:mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="1.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 4.5v15m6-15v15m-10.875 0h15.75c.621 0 1.125-.504 1.125-1.125V5.625c0-.621-.504-1.125-1.125-1.125H4.125C3.504 4.5 3 5.004 3 5.625v12.75c0 .621.504 1.125 1.125 1.125z" />
                  </svg>
                  <span className="hidden md:inline">{t('admin.users.columnSettings')}</span>
                </button>
                {showColumnDropdown ? (
                  <div className="absolute right-0 z-50 mt-2 w-48 origin-top-right rounded-lg border border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-800">
                    <div className="p-2">
                      <div className="mb-2 border-b border-gray-200 pb-2 dark:border-gray-700">
                        <div className="px-3 py-1 text-xs font-medium text-gray-500 dark:text-gray-400">
                          {t('admin.subscriptions.columns.user')}
                        </div>
                        <button
                          type="button"
                          onClick={() => setUserColumnMode('email')}
                          className="flex w-full items-center justify-between rounded-md px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-700"
                        >
                          <span>{t('admin.users.columns.email')}</span>
                          {userColumnMode === 'email' ? (
                            <Icon name="check" size="sm" className="text-primary-500" />
                          ) : null}
                        </button>
                        <button
                          type="button"
                          onClick={() => setUserColumnMode('username')}
                          className="flex w-full items-center justify-between rounded-md px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-700"
                        >
                          <span>{t('admin.users.columns.username')}</span>
                          {userColumnMode === 'username' ? (
                            <Icon name="check" size="sm" className="text-primary-500" />
                          ) : null}
                        </button>
                      </div>
                      {toggleableColumns.map((col) => (
                        <button
                          key={col.key}
                          type="button"
                          onClick={() => toggleColumn(col.key)}
                          className="flex w-full items-center justify-between rounded-md px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-700"
                        >
                          <span>{col.label}</span>
                          {isColumnVisible(col.key) ? (
                            <Icon name="check" size="sm" className="text-primary-500" />
                          ) : null}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>

              <button
                type="button"
                onClick={() => setShowGuideModal(true)}
                className="btn btn-secondary"
                title={t('admin.subscriptions.guide.showGuide')}
              >
                <Icon name="questionCircle" size="md" />
              </button>
              <button type="button" onClick={() => setShowAssignModal(true)} className="btn btn-primary">
                <Icon name="plus" size="md" className="mr-2" />
                {t('admin.subscriptions.assignSubscription')}
              </button>
            </div>
          </div>
        }
        table={
          <DataTable
            columns={columns}
            data={subscriptions}
            loading={loading}
            serverSideSort
            defaultSortKey="created_at"
            defaultSortOrder="desc"
            onSort={handleSort}
            cells={tableCells}
            emptySlot={
              <EmptyState
                title={t('admin.subscriptions.noSubscriptionsYet')}
                description={t('admin.subscriptions.assignFirstSubscription')}
                actionText={t('admin.subscriptions.assignSubscription')}
                onAction={() => setShowAssignModal(true)}
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

      <BaseDialog
        show={showAssignModal}
        title={t('admin.subscriptions.assignSubscription')}
        width="normal"
        onClose={closeAssignModal}
        footer={
          <div className="flex justify-end gap-3">
            <button type="button" onClick={closeAssignModal} className="btn btn-secondary">
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              form="assign-subscription-form"
              disabled={submitting}
              className="btn btn-primary"
            >
              {submitting ? <Spinner className="-ml-1 mr-2 h-4 w-4" /> : null}
              {submitting ? t('admin.subscriptions.assigning') : t('admin.subscriptions.assign')}
            </button>
          </div>
        }
      >
        <form id="assign-subscription-form" onSubmit={handleAssignSubscription} className="space-y-5">
          <div>
            <label className="input-label">{t('admin.subscriptions.form.user')}</label>
            <div className="relative" data-assign-user-search>
              <input
                value={userSearchKeyword}
                onChange={(event) => {
                  setUserSearchKeyword(event.target.value)
                  debounceSearchUsers()
                }}
                onFocus={() => setShowUserDropdown(true)}
                type="text"
                className="input pr-8"
                placeholder={t('admin.usage.searchUserPlaceholder')}
              />
              {selectedUser ? (
                <button
                  type="button"
                  onClick={clearUserSelection}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                >
                  <Icon name="x" size="sm" strokeWidth={2} />
                </button>
              ) : null}
              {showUserDropdown && (userSearchResults.length > 0 || userSearchKeyword) ? (
                <div className="absolute z-50 mt-1 max-h-60 w-full overflow-auto rounded-lg border border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-800">
                  {userSearchLoading ? (
                    <div className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                      {t('common.loading')}
                    </div>
                  ) : userSearchResults.length === 0 && userSearchKeyword ? (
                    <div className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                      {t('common.noOptionsFound')}
                    </div>
                  ) : (
                    userSearchResults.map((user) => (
                      <button
                        key={user.id}
                        type="button"
                        onClick={() => selectUser(user)}
                        className="w-full px-4 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700"
                      >
                        <span className="font-medium text-gray-900 dark:text-white">{user.email}</span>
                        <span className="ml-2 text-gray-500 dark:text-gray-400">#{user.id}</span>
                      </button>
                    ))
                  )}
                </div>
              ) : null}
            </div>
          </div>
          <div>
            <label className="input-label">{t('admin.subscriptions.form.group')}</label>
            <Select
              modelValue={assignForm.group_id}
              options={subscriptionGroupOptions}
              placeholder={t('admin.subscriptions.selectGroup')}
              onUpdateModelValue={(value) =>
                setAssignForm((prev) => ({
                  ...prev,
                  group_id: value === null || value === '' ? null : Number(value),
                }))
              }
              renderSelected={(option: GroupOption | null) =>
                option ? (
                  <GroupBadge
                    name={option.label}
                    platform={option.platform}
                    subscriptionType={option.subscriptionType}
                    rateMultiplier={option.rate}
                  />
                ) : (
                  <span className="text-gray-400">{t('admin.subscriptions.selectGroup')}</span>
                )
              }
              renderOption={(option: GroupOption, selected: boolean) => (
                <GroupOptionItem
                  name={option.label}
                  platform={option.platform}
                  subscriptionType={option.subscriptionType}
                  rateMultiplier={option.rate}
                  description={option.description}
                  selected={selected}
                />
              )}
            />
            <p className="input-hint">{t('admin.subscriptions.groupHint')}</p>
          </div>
          <div>
            <label className="input-label">{t('admin.subscriptions.form.validityDays')}</label>
            <input
              value={assignForm.validity_days}
              onChange={(event) =>
                setAssignForm((prev) => ({
                  ...prev,
                  validity_days: parseInt(event.target.value, 10) || 0,
                }))
              }
              type="number"
              min={1}
              className="input"
            />
            <p className="input-hint">{t('admin.subscriptions.validityHint')}</p>
          </div>
        </form>
      </BaseDialog>

      <BaseDialog
        show={showExtendModal}
        title={t('admin.subscriptions.adjustSubscription')}
        width="narrow"
        onClose={closeExtendModal}
        footer={
          extendingSubscription ? (
            <div className="flex justify-end gap-3">
              <button type="button" onClick={closeExtendModal} className="btn btn-secondary">
                {t('common.cancel')}
              </button>
              <button
                type="submit"
                form="extend-subscription-form"
                disabled={submitting}
                className="btn btn-primary"
              >
                {submitting ? t('admin.subscriptions.adjusting') : t('admin.subscriptions.adjust')}
              </button>
            </div>
          ) : null
        }
      >
        {extendingSubscription ? (
          <form id="extend-subscription-form" onSubmit={handleExtendSubscription} className="space-y-5">
            <div className="rounded-lg bg-gray-50 p-4 dark:bg-dark-700">
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {t('admin.subscriptions.adjustingFor')}{' '}
                <span className="font-medium text-gray-900 dark:text-white">
                  {extendingSubscription.user?.email}
                </span>
              </p>
              <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                {t('admin.subscriptions.currentExpiration')}:{' '}
                <span className="font-medium text-gray-900 dark:text-white">
                  {extendingSubscription.expires_at
                    ? formatDateOnly(extendingSubscription.expires_at)
                    : t('admin.subscriptions.noExpiration')}
                </span>
              </p>
              {extendingSubscription.expires_at ? (
                <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                  {t('admin.subscriptions.remainingDays')}:{' '}
                  <span className="font-medium text-gray-900 dark:text-white">
                    {getDaysRemaining(extendingSubscription.expires_at) ?? 0}
                  </span>
                </p>
              ) : null}
            </div>
            <div>
              <label className="input-label">{t('admin.subscriptions.form.adjustDays')}</label>
              <div className="flex items-center gap-2">
                <input
                  value={extendForm.days}
                  onChange={(event) =>
                    setExtendForm({ days: parseInt(event.target.value, 10) || 0 })
                  }
                  type="number"
                  required
                  className="input text-center"
                  placeholder={t('admin.subscriptions.adjustDaysPlaceholder')}
                />
              </div>
              <p className="input-hint">{t('admin.subscriptions.adjustHint')}</p>
            </div>
          </form>
        ) : null}
      </BaseDialog>

      <ConfirmDialog
        show={showRevokeDialog}
        title={t('admin.subscriptions.revokeSubscription')}
        message={t('admin.subscriptions.revokeConfirm', {
          user: revokingSubscription?.user?.email,
        })}
        confirmText={t('admin.subscriptions.revoke')}
        cancelText={t('common.cancel')}
        danger
        onConfirm={confirmRevoke}
        onCancel={() => setShowRevokeDialog(false)}
      />

      <ConfirmDialog
        show={showResetQuotaConfirm}
        title={t('admin.subscriptions.resetQuotaTitle')}
        message={t('admin.subscriptions.resetQuotaConfirm', {
          user: resettingSubscription?.user?.email,
        })}
        confirmText={t('admin.subscriptions.resetQuota')}
        cancelText={t('common.cancel')}
        onConfirm={confirmResetQuota}
        onCancel={() => setShowResetQuotaConfirm(false)}
      />

      <BaseDialog
        show={showGuideModal}
        title={t('admin.subscriptions.guide.title')}
        width="wide"
        onClose={() => setShowGuideModal(false)}
        footer={
          <div className="text-right">
            <button type="button" className="btn btn-primary btn-sm" onClick={() => setShowGuideModal(false)}>
              {t('common.close')}
            </button>
          </div>
        }
      >
        <p className="mb-5 text-sm text-gray-500 dark:text-gray-400">
          {t('admin.subscriptions.guide.subtitle')}
        </p>

        <div className="mb-5">
          <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-white">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary-100 text-xs font-bold text-primary-700 dark:bg-primary-900/40 dark:text-primary-300">
              1
            </span>
            {t('admin.subscriptions.guide.step1.title')}
          </h3>
          <ol className="ml-8 list-decimal space-y-1 text-sm text-gray-600 dark:text-gray-300">
            <li>{t('admin.subscriptions.guide.step1.line1')}</li>
            <li>{t('admin.subscriptions.guide.step1.line2')}</li>
            <li>{t('admin.subscriptions.guide.step1.line3')}</li>
          </ol>
          <div className="ml-8 mt-2">
            <Link
              href="/admin/groups"
              onClick={() => setShowGuideModal(false)}
              className="inline-flex items-center gap-1 text-sm font-medium text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300"
            >
              {t('admin.subscriptions.guide.step1.link')}
              <Icon name="arrowRight" size="xs" />
            </Link>
          </div>
        </div>

        <div className="mb-5">
          <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-white">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary-100 text-xs font-bold text-primary-700 dark:bg-primary-900/40 dark:text-primary-300">
              2
            </span>
            {t('admin.subscriptions.guide.step2.title')}
          </h3>
          <ol className="ml-8 list-decimal space-y-1 text-sm text-gray-600 dark:text-gray-300">
            <li>{t('admin.subscriptions.guide.step2.line1')}</li>
            <li>{t('admin.subscriptions.guide.step2.line2')}</li>
            <li>{t('admin.subscriptions.guide.step2.line3')}</li>
          </ol>
        </div>

        <div className="mb-5">
          <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-white">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary-100 text-xs font-bold text-primary-700 dark:bg-primary-900/40 dark:text-primary-300">
              3
            </span>
            {t('admin.subscriptions.guide.step3.title')}
          </h3>
          <div className="ml-8 overflow-hidden rounded-lg border border-gray-200 dark:border-dark-600">
            <table className="w-full text-sm">
              <tbody>
                {guideActionRows.map((row, index) => (
                  <tr key={index} className="border-b border-gray-100 dark:border-dark-700 last:border-0">
                    <td className="whitespace-nowrap bg-gray-50 px-3 py-2 font-medium text-gray-700 dark:bg-dark-700 dark:text-gray-300">
                      {row.action}
                    </td>
                    <td className="px-3 py-2 text-gray-600 dark:text-gray-400">{row.desc}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-lg bg-blue-50 p-3 text-xs text-blue-700 dark:bg-blue-900/20 dark:text-blue-300">
          {t('admin.subscriptions.guide.tip')}
        </div>
      </BaseDialog>
    </AppLayout>
  )
}
