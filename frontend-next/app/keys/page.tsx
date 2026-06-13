'use client'

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from 'react'
import { createPortal } from 'react-dom'
import { useI18n } from '@/lib/i18n'
import { useApp } from '@/context/AppContext'
import { useOnboardingStore } from '@/lib/stores/onboarding'
import { useClipboard } from '@/lib/useClipboard'
import { getPersistedPageSize } from '@/lib/usePersistedPageSize'
import { keysAPI } from '@/lib/keys'
import { usageAPI } from '@/lib/usage'
import { userGroupsAPI } from '@/lib/groups'
import { formatDateTime } from '@/lib/format'
import { maskApiKey } from '@/lib/maskApiKey'
import { buildCcSwitchImportDeeplink, type CcSwitchClientType } from '@/lib/ccswitchImport'
import { extractApiErrorMessage } from '@/lib/apiError'
import AppLayout from '@/components/layout/AppLayout'
import TablePageLayout from '@/components/layout/TablePageLayout'
import DataTable from '@/components/common/DataTable'
import Pagination from '@/components/common/Pagination'
import BaseDialog from '@/components/common/BaseDialog'
import ConfirmDialog from '@/components/common/ConfirmDialog'
import EmptyState from '@/components/common/EmptyState'
import Select from '@/components/common/Select'
import SearchInput from '@/components/common/SearchInput'
import Icon from '@/components/icons/Icon'
import UseKeyModal from '@/components/keys/UseKeyModal'
import EndpointPopover from '@/components/keys/EndpointPopover'
import GroupBadge from '@/components/keys/GroupBadge'
import GroupOptionItem from '@/components/keys/GroupOptionItem'
import type { Column } from '@/components/common/types'
import type {
  ApiKey,
  BatchApiKeyUsageStats,
  Group,
  GroupPlatform,
  PublicSettings,
  SubscriptionType,
} from '@/lib/types'

interface GroupOption {
  value: number
  label: string
  description: string | null
  rate: number
  userRate: number | null
  subscriptionType: SubscriptionType
  platform: GroupPlatform
}

interface KeyFormData {
  name: string
  group_id: number | null
  status: 'active' | 'inactive'
  use_custom_key: boolean
  custom_key: string
  enable_ip_restriction: boolean
  ip_whitelist: string
  ip_blacklist: string
  enable_quota: boolean
  quota: number | null
  enable_rate_limit: boolean
  rate_limit_5h: number | null
  rate_limit_1d: number | null
  rate_limit_7d: number | null
  enable_expiration: boolean
  expiration_preset: '7' | '30' | '90' | 'custom'
  expiration_date: string
}

const emptyFormData = (): KeyFormData => ({
  name: '',
  group_id: null,
  status: 'active',
  use_custom_key: false,
  custom_key: '',
  enable_ip_restriction: false,
  ip_whitelist: '',
  ip_blacklist: '',
  enable_quota: false,
  quota: null,
  enable_rate_limit: false,
  rate_limit_5h: null,
  rate_limit_1d: null,
  rate_limit_7d: null,
  enable_expiration: false,
  expiration_preset: '30',
  expiration_date: '',
})

function formatDateTimeLocal(isoDate: string): string {
  const date = new Date(isoDate)
  const pad = (n: number) => n.toString().padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function isAbortError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const { name, code } = error as { name?: string; code?: string }
  return name === 'AbortError' || code === 'ERR_CANCELED'
}

function quotaColorClass(used: number, limit: number): string {
  if (used >= limit) return 'text-red-500'
  if (used >= limit * 0.8) return 'text-yellow-500'
  return 'text-gray-900 dark:text-white'
}

function quotaBarClass(used: number, limit: number, defaultClass = 'bg-primary-500'): string {
  if (used >= limit) return 'bg-red-500'
  if (used >= limit * 0.8) return 'bg-yellow-500'
  return defaultClass
}

export default function KeysPage() {
  const { t } = useI18n()
  const appStore = useApp()
  const onboardingStore = useOnboardingStore()
  const { copyToClipboard: clipboardCopy } = useClipboard()

  const abortControllerRef = useRef<AbortController | null>(null)
  const groupButtonRefs = useRef<Map<number, HTMLElement>>(new Map())
  const dropdownRef = useRef<HTMLDivElement | null>(null)
  const resetTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const [apiKeys, setApiKeys] = useState<ApiKey[]>([])
  const [groups, setGroups] = useState<Group[]>([])
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [now, setNow] = useState(() => new Date())
  const [usageStats, setUsageStats] = useState<Record<string, BatchApiKeyUsageStats>>({})
  const [userGroupRates, setUserGroupRates] = useState<Record<number, number>>({})

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

  const [filterSearch, setFilterSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterGroupId, setFilterGroupId] = useState<string | number>('')

  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [showResetQuotaDialog, setShowResetQuotaDialog] = useState(false)
  const [showResetRateLimitDialog, setShowResetRateLimitDialog] = useState(false)
  const [showUseKeyModal, setShowUseKeyModal] = useState(false)
  const [showCcsClientSelect, setShowCcsClientSelect] = useState(false)
  const [pendingCcsRow, setPendingCcsRow] = useState<ApiKey | null>(null)
  const [selectedKey, setSelectedKey] = useState<ApiKey | null>(null)
  const [copiedKeyId, setCopiedKeyId] = useState<number | null>(null)
  const [groupSelectorKeyId, setGroupSelectorKeyId] = useState<number | null>(null)
  const [publicSettings, setPublicSettings] = useState<PublicSettings | null>(null)
  const [dropdownPosition, setDropdownPosition] = useState<{
    top?: number
    bottom?: number
    left: number
  } | null>(null)
  const [groupSearchQuery, setGroupSearchQuery] = useState('')
  const [formData, setFormData] = useState<KeyFormData>(emptyFormData())
  const [mounted, setMounted] = useState(false)

  useEffect(() => setMounted(true), [])

  const selectedKeyForGroup = useMemo(() => {
    if (groupSelectorKeyId === null) return null
    return apiKeys.find((k) => k.id === groupSelectorKeyId) || null
  }, [apiKeys, groupSelectorKeyId])

  const columns = useMemo<Column[]>(
    () => [
      { key: 'name', label: t('common.name'), sortable: true },
      { key: 'key', label: t('keys.apiKey'), sortable: false },
      { key: 'group', label: t('keys.group'), sortable: false },
      { key: 'usage', label: t('keys.usage'), sortable: false },
      { key: 'rate_limit', label: t('keys.rateLimitColumn'), sortable: false },
      { key: 'expires_at', label: t('keys.expiresAt'), sortable: true },
      { key: 'status', label: t('common.status'), sortable: true },
      { key: 'last_used_at', label: t('keys.lastUsedAt'), sortable: true },
      { key: 'created_at', label: t('keys.created'), sortable: true },
      { key: 'actions', label: t('common.actions'), sortable: false },
    ],
    [t],
  )

  const customKeyError = useMemo(() => {
    if (!formData.use_custom_key || !formData.custom_key) return ''
    const key = formData.custom_key
    if (key.length < 16) return t('keys.customKeyTooShort')
    if (!/^[a-zA-Z0-9_-]+$/.test(key)) return t('keys.customKeyInvalidChars')
    return ''
  }, [formData.custom_key, formData.use_custom_key, t])

  const statusOptions = useMemo(
    () => [
      { value: 'active', label: t('common.active') },
      { value: 'inactive', label: t('common.inactive') },
    ],
    [t],
  )

  const groupFilterOptions = useMemo(
    () => [
      { value: '', label: t('keys.allGroups') },
      { value: 0, label: t('keys.noGroup') },
      ...groups.map((g) => ({ value: g.id, label: g.name })),
    ],
    [groups, t],
  )

  const statusFilterOptions = useMemo(
    () => [
      { value: '', label: t('keys.allStatus') },
      { value: 'active', label: t('keys.status.active') },
      { value: 'inactive', label: t('keys.status.inactive') },
      { value: 'quota_exhausted', label: t('keys.status.quota_exhausted') },
      { value: 'expired', label: t('keys.status.expired') },
    ],
    [t],
  )

  const groupOptions = useMemo(
    () =>
      groups.map((group) => ({
        value: group.id,
        label: group.name,
        description: group.description,
        rate: group.rate_multiplier,
        userRate: userGroupRates[group.id] ?? null,
        subscriptionType: group.subscription_type,
        platform: group.platform,
      })),
    [groups, userGroupRates],
  )

  const filteredGroupOptions = useMemo(() => {
    const query = groupSearchQuery.trim().toLowerCase()
    if (!query) return groupOptions
    return groupOptions.filter(
      (opt) =>
        opt.label.toLowerCase().includes(query) ||
        (opt.description && opt.description.toLowerCase().includes(query)),
    )
  }, [groupOptions, groupSearchQuery])

  const formatResetTime = useCallback(
    (resetAt: string | null): string => {
      if (!resetAt) return ''
      const diff = new Date(resetAt).getTime() - now.getTime()
      if (diff <= 0) return t('keys.resetNow')
      const days = Math.floor(diff / 86400000)
      const hours = Math.floor((diff % 86400000) / 3600000)
      const mins = Math.floor((diff % 3600000) / 60000)
      if (days > 0) return `${days}d ${hours}h`
      if (hours > 0) return `${hours}h ${mins}m`
      return `${mins}m`
    },
    [now, t],
  )

  const setGroupButtonRef = useCallback((keyId: number, el: HTMLElement | null) => {
    if (el) groupButtonRefs.current.set(keyId, el)
    else groupButtonRefs.current.delete(keyId)
  }, [])

  const copyKeyToClipboard = useCallback(
    async (text: string, keyId: number) => {
      const success = await clipboardCopy(text, t('keys.copied'))
      if (success) {
        setCopiedKeyId(keyId)
        setTimeout(() => setCopiedKeyId(null), 800)
      }
    },
    [clipboardCopy, t],
  )

  const loadApiKeys = useCallback(async () => {
    abortControllerRef.current?.abort()
    const controller = new AbortController()
    abortControllerRef.current = controller
    const { signal } = controller
    setLoading(true)
    try {
      const filters: {
        search?: string
        status?: string
        group_id?: number | string
        sort_by?: string
        sort_order?: 'asc' | 'desc'
      } = {}
      if (filterSearch) filters.search = filterSearch
      if (filterStatus) filters.status = filterStatus
      if (filterGroupId !== '') filters.group_id = filterGroupId
      filters.sort_by = sortState.sort_by
      filters.sort_order = sortState.sort_order

      const response = await keysAPI.list(pagination.page, pagination.page_size, filters, { signal })
      if (signal.aborted) return
      setApiKeys(response.items)
      setPagination((prev) => ({
        ...prev,
        total: response.total,
        pages: response.pages ?? Math.ceil(response.total / prev.page_size),
      }))

      if (response.items.length > 0) {
        const keyIds = response.items.map((k) => k.id)
        try {
          const usageResponse = await usageAPI.getDashboardApiKeysUsage(keyIds, { signal })
          if (signal.aborted) return
          setUsageStats(usageResponse.stats)
        } catch (e) {
          if (!isAbortError(e)) console.error('Failed to load usage stats:', e)
        }
      }
    } catch (error) {
      if (isAbortError(error)) return
      appStore.showError(t('keys.failedToLoad'))
    } finally {
      if (abortControllerRef.current === controller) setLoading(false)
    }
  }, [
    appStore,
    filterGroupId,
    filterSearch,
    filterStatus,
    pagination.page,
    pagination.page_size,
    sortState.sort_by,
    sortState.sort_order,
    t,
  ])

  const loadGroups = useCallback(async () => {
    try {
      setGroups(await userGroupsAPI.getAvailable())
    } catch (error) {
      console.error('Failed to load groups:', error)
    }
  }, [])

  const loadUserGroupRates = useCallback(async () => {
    try {
      setUserGroupRates(await userGroupsAPI.getUserGroupRates())
    } catch (error) {
      console.error('Failed to load user group rates:', error)
    }
  }, [])

  const loadPublicSettings = useCallback(async () => {
    try {
      if (appStore.cachedPublicSettings) {
        setPublicSettings(appStore.cachedPublicSettings)
      } else {
        await appStore.fetchPublicSettings()
        setPublicSettings(appStore.cachedPublicSettings)
      }
    } catch (error) {
      console.error('Failed to load public settings:', error)
    }
  }, [appStore])

  useEffect(() => {
    loadApiKeys()
  }, [loadApiKeys])

  useEffect(() => {
    loadGroups()
    loadUserGroupRates()
    loadPublicSettings()
    resetTimerRef.current = setInterval(() => setNow(new Date()), 60000)
    return () => {
      if (resetTimerRef.current) clearInterval(resetTimerRef.current)
    }
  }, [loadGroups, loadPublicSettings, loadUserGroupRates])

  const closeGroupSelector = useCallback((event: MouseEvent) => {
    const target = event.target as HTMLElement
    if (!target.closest('.group\\/dropdown') && !dropdownRef.current?.contains(target)) {
      setGroupSelectorKeyId(null)
      setDropdownPosition(null)
    }
  }, [])

  useEffect(() => {
    document.addEventListener('click', closeGroupSelector)
    return () => document.removeEventListener('click', closeGroupSelector)
  }, [closeGroupSelector])

  const onFilterChange = useCallback(() => {
    setPagination((prev) => ({ ...prev, page: 1 }))
  }, [])

  const handlePageChange = (page: number) => {
    setPagination((prev) => ({ ...prev, page }))
  }

  const handlePageSizeChange = (pageSize: number) => {
    setPagination((prev) => ({ ...prev, page_size: pageSize, page: 1 }))
  }

  const handleSort = (key: string, order: 'asc' | 'desc') => {
    setSortState({ sort_by: key, sort_order: order })
    setPagination((prev) => ({ ...prev, page: 1 }))
  }

  const openUseKeyModal = (key: ApiKey) => {
    setSelectedKey(key)
    setShowUseKeyModal(true)
  }

  const closeUseKeyModal = () => {
    setShowUseKeyModal(false)
    setSelectedKey(null)
  }

  const editKey = (key: ApiKey) => {
    setSelectedKey(key)
    const hasIPRestriction = (key.ip_whitelist?.length ?? 0) > 0 || (key.ip_blacklist?.length ?? 0) > 0
    const hasExpiration = !!key.expires_at
    setFormData({
      name: key.name,
      group_id: key.group_id,
      status: key.status === 'quota_exhausted' || key.status === 'expired' ? 'inactive' : key.status,
      use_custom_key: false,
      custom_key: '',
      enable_ip_restriction: hasIPRestriction,
      ip_whitelist: (key.ip_whitelist || []).join('\n'),
      ip_blacklist: (key.ip_blacklist || []).join('\n'),
      enable_quota: key.quota > 0,
      quota: key.quota > 0 ? key.quota : null,
      enable_rate_limit: key.rate_limit_5h > 0 || key.rate_limit_1d > 0 || key.rate_limit_7d > 0,
      rate_limit_5h: key.rate_limit_5h || null,
      rate_limit_1d: key.rate_limit_1d || null,
      rate_limit_7d: key.rate_limit_7d || null,
      enable_expiration: hasExpiration,
      expiration_preset: 'custom',
      expiration_date: key.expires_at ? formatDateTimeLocal(key.expires_at) : '',
    })
    setShowEditModal(true)
  }

  const toggleKeyStatus = async (key: ApiKey) => {
    const newStatus = key.status === 'active' ? 'inactive' : 'active'
    try {
      await keysAPI.toggleStatus(key.id, newStatus)
      appStore.showSuccess(newStatus === 'active' ? t('keys.keyEnabledSuccess') : t('keys.keyDisabledSuccess'))
      loadApiKeys()
    } catch {
      appStore.showError(t('keys.failedToUpdateStatus'))
    }
  }

  const openGroupSelector = (key: ApiKey) => {
    if (groupSelectorKeyId === key.id) {
      setGroupSelectorKeyId(null)
      setDropdownPosition(null)
    } else {
      const buttonEl = groupButtonRefs.current.get(key.id)
      if (buttonEl) {
        const rect = buttonEl.getBoundingClientRect()
        const dropdownEstHeight = 400
        const spaceBelow = window.innerHeight - rect.bottom
        const spaceAbove = rect.top
        if (spaceBelow < dropdownEstHeight && spaceAbove > spaceBelow) {
          setDropdownPosition({ bottom: window.innerHeight - rect.top + 4, left: rect.left })
        } else {
          setDropdownPosition({ top: rect.bottom + 4, left: rect.left })
        }
      }
      setGroupSelectorKeyId(key.id)
      setGroupSearchQuery('')
    }
  }

  const changeGroup = async (key: ApiKey, newGroupId: number | null) => {
    setGroupSelectorKeyId(null)
    setDropdownPosition(null)
    if (key.group_id === newGroupId) return
    try {
      await keysAPI.update(key.id, { group_id: newGroupId })
      appStore.showSuccess(t('keys.groupChangedSuccess'))
      loadApiKeys()
    } catch {
      appStore.showError(t('keys.failedToChangeGroup'))
    }
  }

  const confirmDelete = (key: ApiKey) => {
    setSelectedKey(key)
    setShowDeleteDialog(true)
  }

  const closeModals = () => {
    setShowCreateModal(false)
    setShowEditModal(false)
    setSelectedKey(null)
    setFormData(emptyFormData())
  }

  const setExpirationDays = (days: number) => {
    const expDate = new Date()
    expDate.setDate(expDate.getDate() + days)
    setFormData((prev) => ({
      ...prev,
      expiration_preset: String(days) as KeyFormData['expiration_preset'],
      expiration_date: formatDateTimeLocal(expDate.toISOString()),
    }))
  }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (formData.group_id === null) {
      appStore.showError(t('keys.groupRequired'))
      return
    }
    if (!showEditModal && formData.use_custom_key) {
      if (!formData.custom_key) {
        appStore.showError(t('keys.customKeyRequired'))
        return
      }
      if (customKeyError) {
        appStore.showError(customKeyError)
        return
      }
    }

    const parseIPList = (text: string): string[] =>
      text
        .split('\n')
        .map((ip) => ip.trim())
        .filter((ip) => ip.length > 0)
    const ipWhitelist = formData.enable_ip_restriction ? parseIPList(formData.ip_whitelist) : []
    const ipBlacklist = formData.enable_ip_restriction ? parseIPList(formData.ip_blacklist) : []
    const quota = formData.quota && formData.quota > 0 ? formData.quota : 0

    let expiresInDays: number | undefined
    let expiresAt: string | null | undefined
    if (formData.enable_expiration && formData.expiration_date) {
      if (!showEditModal) {
        const expDate = new Date(formData.expiration_date)
        const diffDays = Math.ceil((expDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
        expiresInDays = diffDays > 0 ? diffDays : 1
      } else {
        expiresAt = new Date(formData.expiration_date).toISOString()
      }
    } else if (showEditModal) {
      expiresAt = ''
    }

    const rateLimitData = formData.enable_rate_limit
      ? {
          rate_limit_5h: formData.rate_limit_5h && formData.rate_limit_5h > 0 ? formData.rate_limit_5h : 0,
          rate_limit_1d: formData.rate_limit_1d && formData.rate_limit_1d > 0 ? formData.rate_limit_1d : 0,
          rate_limit_7d: formData.rate_limit_7d && formData.rate_limit_7d > 0 ? formData.rate_limit_7d : 0,
        }
      : { rate_limit_5h: 0, rate_limit_1d: 0, rate_limit_7d: 0 }

    setSubmitting(true)
    try {
      if (showEditModal && selectedKey) {
        await keysAPI.update(selectedKey.id, {
          name: formData.name,
          group_id: formData.group_id,
          status: formData.status,
          ip_whitelist: ipWhitelist,
          ip_blacklist: ipBlacklist,
          quota,
          expires_at: expiresAt,
          ...rateLimitData,
        })
        appStore.showSuccess(t('keys.keyUpdatedSuccess'))
      } else {
        const customKey = formData.use_custom_key ? formData.custom_key : undefined
        await keysAPI.create(
          formData.name,
          formData.group_id,
          customKey,
          ipWhitelist,
          ipBlacklist,
          quota,
          expiresInDays,
          rateLimitData,
        )
        appStore.showSuccess(t('keys.keyCreatedSuccess'))
        if (onboardingStore.isCurrentStep('[data-tour="key-form-submit"]')) {
          onboardingStore.nextStep(500)
        }
      }
      closeModals()
      loadApiKeys()
    } catch (error) {
      appStore.showError(extractApiErrorMessage(error, t('keys.failedToSave')))
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async () => {
    if (!selectedKey) return
    try {
      await keysAPI.delete(selectedKey.id)
      appStore.showSuccess(t('keys.keyDeletedSuccess'))
      setShowDeleteDialog(false)
      loadApiKeys()
    } catch (error) {
      appStore.showError(extractApiErrorMessage(error, t('keys.failedToDelete')))
    }
  }

  const resetQuotaUsed = async () => {
    if (!selectedKey) return
    setShowResetQuotaDialog(false)
    try {
      await keysAPI.update(selectedKey.id, { reset_quota: true })
      appStore.showSuccess(t('keys.quotaResetSuccess'))
      setSelectedKey((prev) => (prev ? { ...prev, quota_used: 0 } : prev))
    } catch (error) {
      appStore.showError(extractApiErrorMessage(error, t('keys.failedToResetQuota')))
    }
  }

  const confirmResetRateLimitFromTable = (row: ApiKey) => {
    setSelectedKey(row)
    setShowResetRateLimitDialog(true)
  }

  const resetRateLimitUsage = async () => {
    if (!selectedKey) return
    setShowResetRateLimitDialog(false)
    try {
      await keysAPI.update(selectedKey.id, { reset_rate_limit_usage: true })
      appStore.showSuccess(t('keys.rateLimitResetSuccess'))
      await loadApiKeys()
      setSelectedKey((prev) => {
        if (!prev) return prev
        return apiKeys.find((k) => k.id === prev.id) ?? prev
      })
    } catch (error) {
      appStore.showError(extractApiErrorMessage(error, t('keys.failedToResetRateLimit')))
    }
  }

  const executeCcsImport = (row: ApiKey, clientType: CcSwitchClientType) => {
    const baseUrl = publicSettings?.api_base_url || window.location.origin
    const platform = row.group?.platform || 'anthropic'
    const usageScript = `({
    request: {
      url: "{{baseUrl}}/v1/usage",
      method: "GET",
      headers: { "Authorization": "Bearer {{apiKey}}" }
    },
    extractor: function(response) {
      const remaining = response?.remaining ?? response?.quota?.remaining ?? response?.balance;
      const unit = response?.unit ?? response?.quota?.unit ?? "USD";
      return {
        isValid: response?.is_active ?? response?.isValid ?? true,
        remaining,
        unit
      };
    }
  })`
    const providerName = (publicSettings?.site_name || 'sub2api').trim() || 'sub2api'
    const deeplink = buildCcSwitchImportDeeplink({
      baseUrl,
      platform,
      clientType,
      providerName,
      apiKey: row.key,
      usageScript,
    })
    try {
      window.open(deeplink, '_self')
      setTimeout(() => {
        if (document.hasFocus()) appStore.showError(t('keys.ccSwitchNotInstalled'))
      }, 100)
    } catch {
      appStore.showError(t('keys.ccSwitchNotInstalled'))
    }
  }

  const importToCcswitch = (row: ApiKey) => {
    const platform = row.group?.platform || 'anthropic'
    if (platform === 'antigravity') {
      setPendingCcsRow(row)
      setShowCcsClientSelect(true)
      return
    }
    executeCcsImport(row, platform === 'gemini' ? 'gemini' : 'claude')
  }

  const handleCcsClientSelect = (clientType: CcSwitchClientType) => {
    if (pendingCcsRow) executeCcsImport(pendingCcsRow, clientType)
    setShowCcsClientSelect(false)
    setPendingCcsRow(null)
  }

  const closeCcsClientSelect = () => {
    setShowCcsClientSelect(false)
    setPendingCcsRow(null)
  }

  const renderRateLimitWindow = (
    row: ApiKey,
    label: string,
    usage: number,
    limit: number,
    resetAt: string | null,
  ) => {
    if (limit <= 0) return null
    return (
      <div key={label}>
        <div className="flex items-center justify-between text-xs">
          <span className="text-gray-500 dark:text-gray-400">{label}</span>
          <span className={`font-medium tabular-nums ${quotaColorClass(usage, limit).replace('text-gray-900 dark:text-white', 'text-gray-700 dark:text-gray-300')}`}>
            ${usage?.toFixed(2) || '0.00'}/${limit?.toFixed(2)}
          </span>
        </div>
        <div className="h-1 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-dark-600">
          <div
            className={`h-full rounded-full transition-all ${quotaBarClass(usage, limit, 'bg-emerald-500')}`}
            style={{ width: `${Math.min((usage / limit) * 100, 100)}%` }}
          />
        </div>
        {resetAt && formatResetTime(resetAt) ? (
          <div className="text-[10px] tabular-nums text-gray-400 dark:text-gray-500">⟳ {formatResetTime(resetAt)}</div>
        ) : null}
      </div>
    )
  }

  const tableCells = useMemo(
    () => ({
      key: ({ value, row }: { value: string; row: ApiKey }) => (
        <div className="flex items-center gap-2">
          <code className="code text-xs">{maskApiKey(value)}</code>
          <button
            type="button"
            onClick={() => copyKeyToClipboard(value, row.id)}
            className={`rounded-lg p-1 transition-colors hover:bg-gray-100 dark:hover:bg-dark-700 ${
              copiedKeyId === row.id
                ? 'text-green-500'
                : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'
            }`}
            title={copiedKeyId === row.id ? t('keys.copied') : t('keys.copyToClipboard')}
          >
            {copiedKeyId === row.id ? (
              <Icon name="check" size="sm" strokeWidth={2} />
            ) : (
              <Icon name="clipboard" size="sm" />
            )}
          </button>
        </div>
      ),
      name: ({ value, row }: { value: string; row: ApiKey }) => (
        <div className="flex items-center gap-1.5">
          <span className="font-medium text-gray-900 dark:text-white">{value}</span>
          {(row.ip_whitelist?.length ?? 0) > 0 || (row.ip_blacklist?.length ?? 0) > 0 ? (
            <span title={t('keys.ipRestrictionEnabled')}>
              <Icon name="shield" size="sm" className="text-blue-500" />
            </span>
          ) : null}
        </div>
      ),
      group: ({ row }: { row: ApiKey }) => (
        <div className="group/dropdown relative">
          <button
            type="button"
            ref={(el) => setGroupButtonRef(row.id, el)}
            onClick={() => openGroupSelector(row)}
            className="-mx-2 -my-1 flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1 transition-all duration-200 hover:bg-gray-100 dark:hover:bg-dark-700"
            title={t('keys.clickToChangeGroup')}
          >
            {row.group ? (
              <GroupBadge
                name={row.group.name}
                platform={row.group.platform}
                subscriptionType={row.group.subscription_type}
                rateMultiplier={row.group.rate_multiplier}
                userRateMultiplier={row.group.id != null ? userGroupRates[row.group.id] : null}
              />
            ) : (
              <span className="text-sm text-gray-400 dark:text-dark-500">{t('keys.noGroup')}</span>
            )}
            <span className="text-xs text-gray-500 dark:text-gray-400">{t('keys.selectGroup')}</span>
            <svg className="h-3.5 w-3.5 text-gray-400 opacity-60 transition-opacity group-hover/dropdown:opacity-100" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 15L12 18.75 15.75 15m-7.5-6L12 5.25 15.75 9" />
            </svg>
          </button>
        </div>
      ),
      usage: ({ row }: { row: ApiKey }) => (
        <div className="text-sm">
          <div className="flex items-center gap-1.5">
            <span className="text-gray-500 dark:text-gray-400">{t('keys.today')}:</span>
            <span className="font-medium text-gray-900 dark:text-white">
              ${(usageStats[row.id]?.today_actual_cost ?? 0).toFixed(4)}
            </span>
          </div>
          <div className="mt-0.5 flex items-center gap-1.5">
            <span className="text-gray-500 dark:text-gray-400">{t('keys.total')}:</span>
            <span className="font-medium text-gray-900 dark:text-white">
              ${(usageStats[row.id]?.total_actual_cost ?? 0).toFixed(4)}
            </span>
          </div>
          {row.quota > 0 ? (
            <div className="mt-1.5">
              <div className="flex items-center gap-1.5">
                <span className="text-gray-500 dark:text-gray-400">{t('keys.quota')}:</span>
                <span className={`font-medium ${quotaColorClass(row.quota_used, row.quota)}`}>
                  ${row.quota_used?.toFixed(2) || '0.00'} / ${row.quota?.toFixed(2)}
                </span>
              </div>
              <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-dark-600">
                <div
                  className={`h-full rounded-full transition-all ${quotaBarClass(row.quota_used, row.quota)}`}
                  style={{ width: `${Math.min((row.quota_used / row.quota) * 100, 100)}%` }}
                />
              </div>
            </div>
          ) : null}
        </div>
      ),
      rate_limit: ({ row }: { row: ApiKey }) =>
        row.rate_limit_5h > 0 || row.rate_limit_1d > 0 || row.rate_limit_7d > 0 ? (
          <div className="min-w-[140px] space-y-1.5">
            {renderRateLimitWindow(row, '5h', row.usage_5h, row.rate_limit_5h, row.reset_5h_at)}
            {renderRateLimitWindow(row, '1d', row.usage_1d, row.rate_limit_1d, row.reset_1d_at)}
            {renderRateLimitWindow(row, '7d', row.usage_7d, row.rate_limit_7d, row.reset_7d_at)}
            {row.usage_5h > 0 || row.usage_1d > 0 || row.usage_7d > 0 ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  confirmResetRateLimitFromTable(row)
                }}
                className="mt-0.5 inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-gray-500 transition-colors hover:bg-gray-100 hover:text-primary-600 dark:hover:bg-dark-700 dark:hover:text-primary-400"
                title={t('keys.resetRateLimitUsage')}
              >
                <Icon name="refresh" size="xs" />
                {t('keys.resetUsage')}
              </button>
            ) : null}
          </div>
        ) : (
          <span className="text-sm text-gray-400 dark:text-dark-500">-</span>
        ),
      expires_at: ({ value }: { value: string | null }) =>
        value ? (
          <span className={`text-sm ${new Date(value) < new Date() ? 'text-red-500 dark:text-red-400' : 'text-gray-500 dark:text-dark-400'}`}>
            {formatDateTime(value)}
          </span>
        ) : (
          <span className="text-sm text-gray-400 dark:text-dark-500">{t('keys.noExpiration')}</span>
        ),
      status: ({ value }: { value: ApiKey['status'] }) => (
        <span
          className={`badge ${
            value === 'active'
              ? 'badge-success'
              : value === 'quota_exhausted'
                ? 'badge-warning'
                : value === 'expired'
                  ? 'badge-danger'
                  : 'badge-gray'
          }`}
        >
          {t(`keys.status.${value}`)}
        </span>
      ),
      last_used_at: ({ value }: { value: string | null }) =>
        value ? (
          <span className="text-sm text-gray-500 dark:text-dark-400">{formatDateTime(value)}</span>
        ) : (
          <span className="text-sm text-gray-400 dark:text-dark-500">-</span>
        ),
      created_at: ({ value }: { value: string }) => (
        <span className="text-sm text-gray-500 dark:text-dark-400">{formatDateTime(value)}</span>
      ),
      actions: ({ row }: { row: ApiKey }) => (
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => openUseKeyModal(row)}
            className="flex flex-col items-center gap-0.5 rounded-lg p-1.5 text-gray-500 transition-colors hover:bg-green-50 hover:text-green-600 dark:hover:bg-green-900/20 dark:hover:text-green-400"
          >
            <Icon name="terminal" size="sm" />
            <span className="text-xs">{t('keys.useKey')}</span>
          </button>
          {!publicSettings?.hide_ccs_import_button ? (
            <button
              type="button"
              onClick={() => importToCcswitch(row)}
              className="flex flex-col items-center gap-0.5 rounded-lg p-1.5 text-gray-500 transition-colors hover:bg-blue-50 hover:text-blue-600 dark:hover:bg-blue-900/20 dark:hover:text-blue-400"
            >
              <Icon name="upload" size="sm" />
              <span className="text-xs">{t('keys.importToCcSwitch')}</span>
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => toggleKeyStatus(row)}
            className={`flex flex-col items-center gap-0.5 rounded-lg p-1.5 transition-colors ${
              row.status === 'active'
                ? 'text-gray-500 hover:bg-yellow-50 hover:text-yellow-600 dark:hover:bg-yellow-900/20 dark:hover:text-yellow-400'
                : 'text-gray-500 hover:bg-green-50 hover:text-green-600 dark:hover:bg-green-900/20 dark:hover:text-green-400'
            }`}
          >
            {row.status === 'active' ? <Icon name="ban" size="sm" /> : <Icon name="checkCircle" size="sm" />}
            <span className="text-xs">{row.status === 'active' ? t('keys.disable') : t('keys.enable')}</span>
          </button>
          <button
            type="button"
            onClick={() => editKey(row)}
            className="flex flex-col items-center gap-0.5 rounded-lg p-1.5 text-gray-500 transition-colors hover:bg-gray-100 hover:text-primary-600 dark:hover:bg-dark-700 dark:hover:text-primary-400"
          >
            <Icon name="edit" size="sm" />
            <span className="text-xs">{t('common.edit')}</span>
          </button>
          <button
            type="button"
            onClick={() => confirmDelete(row)}
            className="flex flex-col items-center gap-0.5 rounded-lg p-1.5 text-gray-500 transition-colors hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20 dark:hover:text-red-400"
          >
            <Icon name="trash" size="sm" />
            <span className="text-xs">{t('common.delete')}</span>
          </button>
        </div>
      ),
    }),
    [
      copiedKeyId,
      copyKeyToClipboard,
      formatResetTime,
      publicSettings?.hide_ccs_import_button,
      setGroupButtonRef,
      t,
      usageStats,
      userGroupRates,
    ],
  )

  const settings = publicSettings ?? appStore.cachedPublicSettings

  return (
    <AppLayout>
      <TablePageLayout
        filters={
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <SearchInput
                modelValue={filterSearch}
                placeholder={t('keys.searchPlaceholder')}
                className="w-full sm:w-64"
                onUpdateModelValue={setFilterSearch}
                onSearch={() => {
                  onFilterChange()
                }}
              />
              <Select
                modelValue={filterGroupId}
                className="w-40"
                options={groupFilterOptions}
                onUpdateModelValue={(value) => {
                  setFilterGroupId(value as string | number)
                  onFilterChange()
                }}
              />
              <Select
                modelValue={filterStatus}
                className="w-40"
                options={statusFilterOptions}
                onUpdateModelValue={(value) => {
                  setFilterStatus(String(value ?? ''))
                  onFilterChange()
                }}
              />
            </div>
            {settings?.api_base_url || (settings?.custom_endpoints?.length ?? 0) > 0 ? (
              <EndpointPopover
                apiBaseUrl={settings?.api_base_url || ''}
                customEndpoints={settings?.custom_endpoints || []}
              />
            ) : null}
          </div>
        }
        actions={
          <div className="flex justify-end gap-3">
            <button type="button" onClick={loadApiKeys} disabled={loading} className="btn btn-secondary" title={t('common.refresh')}>
              <Icon name="refresh" size="md" className={loading ? 'animate-spin' : ''} />
            </button>
            <button type="button" onClick={() => setShowCreateModal(true)} className="btn btn-primary" data-tour="keys-create-btn">
              <Icon name="plus" size="md" className="mr-2" />
              {t('keys.createKey')}
            </button>
          </div>
        }
        table={
          <DataTable
            columns={columns}
            data={apiKeys}
            loading={loading}
            serverSideSort
            defaultSortKey="created_at"
            defaultSortOrder="desc"
            stickyActionsColumn
            expandableActions
            actionsCount={publicSettings?.hide_ccs_import_button ? 4 : 5}
            onSort={handleSort}
            cells={tableCells}
            emptySlot={
              <EmptyState
                title={t('keys.noKeysYet')}
                description={t('keys.createFirstKey')}
                actionText={t('keys.createKey')}
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

      <BaseDialog
        show={showCreateModal || showEditModal}
        title={showEditModal ? t('keys.editKey') : t('keys.createKey')}
        width="normal"
        onClose={closeModals}
        footer={
          <div className="flex justify-end gap-3">
            <button type="button" onClick={closeModals} className="btn btn-secondary">
              {t('common.cancel')}
            </button>
            <button form="key-form" type="submit" disabled={submitting} className="btn btn-primary" data-tour="key-form-submit">
              {submitting ? (
                <>
                  <svg className="-ml-1 mr-2 h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  {t('keys.saving')}
                </>
              ) : showEditModal ? (
                t('common.update')
              ) : (
                t('common.create')
              )}
            </button>
          </div>
        }
      >
        <form id="key-form" onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="input-label">{t('keys.nameLabel')}</label>
            <input
              value={formData.name}
              onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
              type="text"
              required
              className="input"
              placeholder={t('keys.namePlaceholder')}
              data-tour="key-form-name"
            />
          </div>

          <div>
            <label className="input-label">{t('keys.groupLabel')}</label>
            <Select
              modelValue={formData.group_id}
              options={groupOptions}
              placeholder={t('keys.selectGroup')}
              searchable
              searchPlaceholder={t('keys.searchGroup')}
              onUpdateModelValue={(value) => setFormData((prev) => ({ ...prev, group_id: value as number | null }))}
              renderSelected={(option: GroupOption | null) =>
                option ? (
                  <GroupBadge
                    name={option.label}
                    platform={option.platform}
                    subscriptionType={option.subscriptionType}
                    rateMultiplier={option.rate}
                    userRateMultiplier={option.userRate}
                  />
                ) : (
                  <span className="text-gray-400">{t('keys.selectGroup')}</span>
                )
              }
              renderOption={(option: GroupOption, selected: boolean) => (
                <GroupOptionItem
                  name={option.label}
                  platform={option.platform}
                  subscriptionType={option.subscriptionType}
                  rateMultiplier={option.rate}
                  userRateMultiplier={option.userRate}
                  description={option.description}
                  selected={selected}
                />
              )}
            />
          </div>

          {!showEditModal ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="input-label mb-0">{t('keys.customKeyLabel')}</label>
                <button
                  type="button"
                  onClick={() => setFormData((prev) => ({ ...prev, use_custom_key: !prev.use_custom_key }))}
                  className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                    formData.use_custom_key ? 'bg-primary-600' : 'bg-gray-200 dark:bg-dark-600'
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                      formData.use_custom_key ? 'translate-x-4' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
              {formData.use_custom_key ? (
                <div>
                  <input
                    value={formData.custom_key}
                    onChange={(e) => setFormData((prev) => ({ ...prev, custom_key: e.target.value }))}
                    type="text"
                    className={`input font-mono ${customKeyError ? 'border-red-500 dark:border-red-500' : ''}`}
                    placeholder={t('keys.customKeyPlaceholder')}
                  />
                  {customKeyError ? (
                    <p className="mt-1 text-sm text-red-500">{customKeyError}</p>
                  ) : (
                    <p className="input-hint">{t('keys.customKeyHint')}</p>
                  )}
                </div>
              ) : null}
            </div>
          ) : null}

          {showEditModal ? (
            <div>
              <label className="input-label">{t('keys.statusLabel')}</label>
              <Select
                modelValue={formData.status}
                options={statusOptions}
                placeholder={t('keys.selectStatus')}
                onUpdateModelValue={(value) =>
                  setFormData((prev) => ({ ...prev, status: value as 'active' | 'inactive' }))
                }
              />
            </div>
          ) : null}

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="input-label mb-0">{t('keys.ipRestriction')}</label>
              <button
                type="button"
                onClick={() => setFormData((prev) => ({ ...prev, enable_ip_restriction: !prev.enable_ip_restriction }))}
                className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  formData.enable_ip_restriction ? 'bg-primary-600' : 'bg-gray-200 dark:bg-dark-600'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                    formData.enable_ip_restriction ? 'translate-x-4' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
            {formData.enable_ip_restriction ? (
              <div className="space-y-4 pt-2">
                <div>
                  <label className="input-label">{t('keys.ipWhitelist')}</label>
                  <textarea
                    value={formData.ip_whitelist}
                    onChange={(e) => setFormData((prev) => ({ ...prev, ip_whitelist: e.target.value }))}
                    rows={3}
                    className="input font-mono text-sm"
                    placeholder={t('keys.ipWhitelistPlaceholder')}
                  />
                  <p className="input-hint">{t('keys.ipWhitelistHint')}</p>
                </div>
                <div>
                  <label className="input-label">{t('keys.ipBlacklist')}</label>
                  <textarea
                    value={formData.ip_blacklist}
                    onChange={(e) => setFormData((prev) => ({ ...prev, ip_blacklist: e.target.value }))}
                    rows={3}
                    className="input font-mono text-sm"
                    placeholder={t('keys.ipBlacklistPlaceholder')}
                  />
                  <p className="input-hint">{t('keys.ipBlacklistHint')}</p>
                </div>
              </div>
            ) : null}
          </div>

          <div className="space-y-3">
            <label className="input-label">{t('keys.quotaLimit')}</label>
            <div className="space-y-4">
              <div>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">$</span>
                  <input
                    value={formData.quota ?? ''}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        quota: e.target.value === '' ? null : Number(e.target.value),
                      }))
                    }
                    type="number"
                    step="0.01"
                    min="0"
                    className="input pl-7"
                    placeholder={t('keys.quotaAmountPlaceholder')}
                  />
                </div>
                <p className="input-hint">{t('keys.quotaAmountHint')}</p>
              </div>
              {showEditModal && selectedKey && selectedKey.quota > 0 ? (
                <div>
                  <label className="input-label">{t('keys.quotaUsed')}</label>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 rounded-lg bg-gray-100 px-3 py-2 dark:bg-dark-700">
                      <span className="font-medium text-gray-900 dark:text-white">
                        ${selectedKey.quota_used?.toFixed(4) || '0.0000'}
                      </span>
                      <span className="mx-2 text-gray-400">/</span>
                      <span className="text-gray-500 dark:text-gray-400">${selectedKey.quota?.toFixed(2) || '0.00'}</span>
                    </div>
                    <button type="button" onClick={() => setShowResetQuotaDialog(true)} className="btn btn-secondary text-sm" title={t('keys.resetQuotaUsed')}>
                      {t('keys.reset')}
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="input-label mb-0">{t('keys.rateLimitSection')}</label>
              <button
                type="button"
                onClick={() => setFormData((prev) => ({ ...prev, enable_rate_limit: !prev.enable_rate_limit }))}
                className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  formData.enable_rate_limit ? 'bg-primary-600' : 'bg-gray-200 dark:bg-dark-600'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                    formData.enable_rate_limit ? 'translate-x-4' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
            {formData.enable_rate_limit ? (
              <div className="space-y-4 pt-2">
                <p className="-mt-2 input-hint">{t('keys.rateLimitHint')}</p>
                {(['rate_limit_5h', 'rate_limit_1d', 'rate_limit_7d'] as const).map((field, idx) => {
                  const labels = [t('keys.rateLimit5h'), t('keys.rateLimit1d'), t('keys.rateLimit7d')]
                  const usageFields = ['usage_5h', 'usage_1d', 'usage_7d'] as const
                  const limitField = field
                  const usageField = usageFields[idx]
                  return (
                    <div key={field}>
                      <label className="input-label">{labels[idx]}</label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">$</span>
                        <input
                          value={formData[field] ?? ''}
                          onChange={(e) =>
                            setFormData((prev) => ({
                              ...prev,
                              [field]: e.target.value === '' ? null : Number(e.target.value),
                            }))
                          }
                          type="number"
                          step="0.01"
                          min="0"
                          className="input pl-7"
                          placeholder="0"
                        />
                      </div>
                      {showEditModal && selectedKey && selectedKey[limitField] > 0 ? (
                        <div className="mt-2">
                          <div className="flex items-center gap-2">
                            <div className="flex-1 rounded-lg bg-gray-100 px-3 py-2 text-sm dark:bg-dark-700">
                              <span className={`font-medium ${quotaColorClass(selectedKey[usageField], selectedKey[limitField])}`}>
                                ${selectedKey[usageField]?.toFixed(4) || '0.0000'}
                              </span>
                              <span className="mx-2 text-gray-400">/</span>
                              <span className="text-gray-500 dark:text-gray-400">${selectedKey[limitField]?.toFixed(2) || '0.00'}</span>
                            </div>
                          </div>
                          <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-dark-600">
                            <div
                              className={`h-full rounded-full transition-all ${quotaBarClass(selectedKey[usageField], selectedKey[limitField], 'bg-green-500')}`}
                              style={{
                                width: `${Math.min((selectedKey[usageField] / selectedKey[limitField]) * 100, 100)}%`,
                              }}
                            />
                          </div>
                        </div>
                      ) : null}
                    </div>
                  )
                })}
                {showEditModal &&
                selectedKey &&
                (selectedKey.rate_limit_5h > 0 || selectedKey.rate_limit_1d > 0 || selectedKey.rate_limit_7d > 0) ? (
                  <button type="button" onClick={() => setShowResetRateLimitDialog(true)} className="btn btn-secondary text-sm">
                    {t('keys.resetRateLimitUsage')}
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="input-label mb-0">{t('keys.expiration')}</label>
              <button
                type="button"
                onClick={() => setFormData((prev) => ({ ...prev, enable_expiration: !prev.enable_expiration }))}
                className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  formData.enable_expiration ? 'bg-primary-600' : 'bg-gray-200 dark:bg-dark-600'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                    formData.enable_expiration ? 'translate-x-4' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
            {formData.enable_expiration ? (
              <div className="space-y-4 pt-2">
                <div className="flex flex-wrap gap-2">
                  {(['7', '30', '90'] as const).map((days) => (
                    <button
                      key={days}
                      type="button"
                      onClick={() => setExpirationDays(parseInt(days, 10))}
                      className={`rounded-lg px-3 py-1.5 text-sm transition-colors ${
                        formData.expiration_preset === days
                          ? 'bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-dark-700 dark:text-gray-400 dark:hover:bg-dark-600'
                      }`}
                    >
                      {showEditModal ? t('keys.extendDays', { days }) : t('keys.expiresInDays', { days })}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setFormData((prev) => ({ ...prev, expiration_preset: 'custom' }))}
                    className={`rounded-lg px-3 py-1.5 text-sm transition-colors ${
                      formData.expiration_preset === 'custom'
                        ? 'bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-dark-700 dark:text-gray-400 dark:hover:bg-dark-600'
                    }`}
                  >
                    {t('keys.customDate')}
                  </button>
                </div>
                <div>
                  <label className="input-label">{t('keys.expirationDate')}</label>
                  <input
                    value={formData.expiration_date}
                    onChange={(e) => setFormData((prev) => ({ ...prev, expiration_date: e.target.value }))}
                    type="datetime-local"
                    className="input"
                  />
                  <p className="input-hint">{t('keys.expirationDateHint')}</p>
                </div>
                {showEditModal && selectedKey?.expires_at ? (
                  <div className="text-sm">
                    <span className="text-gray-500 dark:text-gray-400">{t('keys.currentExpiration')}: </span>
                    <span className="font-medium text-gray-900 dark:text-white">{formatDateTime(selectedKey.expires_at)}</span>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </form>
      </BaseDialog>

      <ConfirmDialog
        show={showDeleteDialog}
        title={t('keys.deleteKey')}
        message={t('keys.deleteConfirmMessage', { name: selectedKey?.name })}
        confirmText={t('common.delete')}
        cancelText={t('common.cancel')}
        danger
        onConfirm={handleDelete}
        onCancel={() => setShowDeleteDialog(false)}
      />

      <ConfirmDialog
        show={showResetQuotaDialog}
        title={t('keys.resetQuotaTitle')}
        message={t('keys.resetQuotaConfirmMessage', {
          name: selectedKey?.name,
          used: selectedKey?.quota_used?.toFixed(4),
        })}
        confirmText={t('keys.reset')}
        cancelText={t('common.cancel')}
        danger
        onConfirm={resetQuotaUsed}
        onCancel={() => setShowResetQuotaDialog(false)}
      />

      <ConfirmDialog
        show={showResetRateLimitDialog}
        title={t('keys.resetRateLimitTitle')}
        message={t('keys.resetRateLimitConfirmMessage', { name: selectedKey?.name })}
        confirmText={t('keys.reset')}
        cancelText={t('common.cancel')}
        danger
        onConfirm={resetRateLimitUsage}
        onCancel={() => setShowResetRateLimitDialog(false)}
      />

      <UseKeyModal
        show={showUseKeyModal}
        apiKey={selectedKey?.key || ''}
        baseUrl={settings?.api_base_url || ''}
        platform={selectedKey?.group?.platform || null}
        allowMessagesDispatch={selectedKey?.group?.allow_messages_dispatch || false}
        onClose={closeUseKeyModal}
      />

      <BaseDialog
        show={showCcsClientSelect}
        title={t('keys.ccsClientSelect.title')}
        width="narrow"
        onClose={closeCcsClientSelect}
        footer={
          <div className="flex justify-end">
            <button type="button" onClick={closeCcsClientSelect} className="btn btn-secondary">
              {t('common.cancel')}
            </button>
          </div>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-600 dark:text-gray-400">{t('keys.ccsClientSelect.description')}</p>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => handleCcsClientSelect('claude')}
              className="flex flex-col items-center gap-2 rounded-xl border-2 border-gray-200 p-4 transition-all hover:border-primary-500 hover:bg-primary-50 dark:border-dark-600 dark:hover:border-primary-500 dark:hover:bg-primary-900/20"
            >
              <Icon name="terminal" size="xl" className="text-gray-600 dark:text-gray-400" />
              <span className="font-medium text-gray-900 dark:text-white">{t('keys.ccsClientSelect.claudeCode')}</span>
              <span className="text-xs text-gray-500 dark:text-gray-400">{t('keys.ccsClientSelect.claudeCodeDesc')}</span>
            </button>
            <button
              type="button"
              onClick={() => handleCcsClientSelect('gemini')}
              className="flex flex-col items-center gap-2 rounded-xl border-2 border-gray-200 p-4 transition-all hover:border-primary-500 hover:bg-primary-50 dark:border-dark-600 dark:hover:border-primary-500 dark:hover:bg-primary-900/20"
            >
              <Icon name="sparkles" size="xl" className="text-gray-600 dark:text-gray-400" />
              <span className="font-medium text-gray-900 dark:text-white">{t('keys.ccsClientSelect.geminiCli')}</span>
              <span className="text-xs text-gray-500 dark:text-gray-400">{t('keys.ccsClientSelect.geminiCliDesc')}</span>
            </button>
          </div>
        </div>
      </BaseDialog>

      {mounted && groupSelectorKeyId !== null && dropdownPosition
        ? createPortal(
            <div
              ref={dropdownRef}
              className="animate-in fade-in slide-in-from-top-2 fixed z-[100000020] w-max min-w-[380px] overflow-hidden rounded-xl bg-white shadow-lg ring-1 ring-black/5 duration-200 dark:bg-dark-800 dark:ring-white/10"
              style={{
                pointerEvents: 'auto',
                top: dropdownPosition.top !== undefined ? dropdownPosition.top : undefined,
                bottom: dropdownPosition.bottom !== undefined ? dropdownPosition.bottom : undefined,
                left: dropdownPosition.left,
              }}
            >
              <div className="border-b border-gray-100 p-2 dark:border-dark-700">
                <div className="relative">
                  <svg className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  <input
                    value={groupSearchQuery}
                    onChange={(e) => setGroupSearchQuery(e.target.value)}
                    type="text"
                    className="w-full rounded-lg border border-gray-200 bg-gray-50 py-1.5 pl-8 pr-3 text-sm text-gray-900 placeholder-gray-400 outline-none focus:border-primary-300 focus:ring-1 focus:ring-primary-300 dark:border-dark-600 dark:bg-dark-700 dark:text-white dark:placeholder-gray-500 dark:focus:border-primary-600 dark:focus:ring-primary-600"
                    placeholder={t('keys.searchGroup')}
                    onClick={(e) => e.stopPropagation()}
                  />
                </div>
              </div>
              <div className="max-h-80 overflow-y-auto p-1.5">
                {filteredGroupOptions.map((option) => (
                  <button
                    key={String(option.value ?? 'null')}
                    type="button"
                    onClick={() => selectedKeyForGroup && changeGroup(selectedKeyForGroup, option.value)}
                    className={`flex w-full items-center justify-between rounded-lg border-b border-gray-100 px-3 py-2.5 text-sm transition-colors last:border-0 dark:border-dark-700 ${
                      selectedKeyForGroup?.group_id === option.value
                        ? 'bg-primary-50 dark:bg-primary-900/20'
                        : 'hover:bg-gray-100 dark:hover:bg-dark-700'
                    }`}
                    title={option.description || undefined}
                  >
                    <GroupOptionItem
                      name={option.label}
                      platform={option.platform}
                      subscriptionType={option.subscriptionType}
                      rateMultiplier={option.rate}
                      userRateMultiplier={option.userRate}
                      description={option.description}
                      selected={selectedKeyForGroup?.group_id === option.value}
                    />
                  </button>
                ))}
                {filteredGroupOptions.length === 0 ? (
                  <div className="py-4 text-center text-sm text-gray-400 dark:text-gray-500">{t('keys.noGroupFound')}</div>
                ) : null}
              </div>
            </div>,
            document.body,
          )
        : null}
    </AppLayout>
  )
}
