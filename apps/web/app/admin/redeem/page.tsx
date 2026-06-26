'use client'

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ChangeEvent,
  type FormEvent,
  type MouseEvent as ReactMouseEvent,
} from 'react'
import { createPortal } from 'react-dom'
import { useI18n } from '@/lib/i18n'
import { useApp } from '@/context/AppContext'
import { useClipboard } from '@/lib/useClipboard'
import { useTableLoader } from '@/lib/useTableLoader'
import { useTableSelection } from '@/lib/useTableSelection'
import { getPersistedPageSize } from '@/lib/usePersistedPageSize'
import { extractApiErrorMessage } from '@/lib/apiError'
import { formatDateTime } from '@/lib/format'
import {
  adminRedeemAPI,
  type BatchUpdateRedeemCodeFields,
  type RedeemCode,
  type RedeemCodeFilters,
  type RedeemCodeType,
} from '@/lib/adminRedeem'
import { adminGroupsAPI } from '@/lib/adminGroups'
import AppLayout from '@/components/layout/AppLayout'
import TablePageLayout from '@/components/layout/TablePageLayout'
import DataTable, { type DataTableCellContext } from '@/components/common/DataTable'
import Pagination from '@/components/common/Pagination'
import ConfirmDialog from '@/components/common/ConfirmDialog'
import Select from '@/components/common/Select'
import Icon from '@/components/icons/Icon'
import GroupBadge from '@/components/keys/GroupBadge'
import GroupOptionItem from '@/components/keys/GroupOptionItem'
import type { Column } from '@/components/common/types'
import type { AdminGroup, GroupPlatform, SubscriptionType } from '@/lib/types'

type RedeemSortOrder = 'asc' | 'desc'
type RedeemTableParams = RedeemCodeFilters & Record<string, unknown>
type RedeemCodeExpiryOption = 'never' | '1' | '3' | '7' | 'custom'

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

function toDatetimeLocalInputValue(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`
}

export default function AdminRedeemPage() {
  const { t } = useI18n()
  const appStore = useApp()
  const { copyToClipboard: clipboardCopy } = useClipboard()

  const [mounted, setMounted] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [filters, setFilters] = useState({ type: '', status: '' })
  const [sortState, setSortState] = useState<{ sort_by: string; sort_order: RedeemSortOrder }>({
    sort_by: 'id',
    sort_order: 'desc',
  })

  const {
    items: codes,
    loading,
    setParams,
    pagination,
    setPagination,
    load,
    debouncedReload,
    handlePageChange,
    handlePageSizeChange,
  } = useTableLoader<RedeemCode, RedeemTableParams>({
    fetchFn: (page, pageSize, tableParams, options) =>
      adminRedeemAPI.list(page, pageSize, tableParams, options),
    initialParams: {
      type: undefined,
      status: undefined,
      search: undefined,
      sort_by: 'id',
      sort_order: 'desc',
    },
    pageSize: getPersistedPageSize(),
  })

  const {
    selectedSet: selectedCodeIds,
    selectedIds,
    selectedCount,
    allVisibleSelected,
    select,
    deselect,
    clear: clearSelectedCodes,
    toggleVisible,
  } = useTableSelection<RedeemCode>({
    rows: codes,
    getId: (code) => code.id,
  })

  const [subscriptionGroups, setSubscriptionGroups] = useState<AdminGroup[]>([])

  const [showGenerateDialog, setShowGenerateDialog] = useState(false)
  const [showResultDialog, setShowResultDialog] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [showDeleteUnusedDialog, setShowDeleteUnusedDialog] = useState(false)
  const [showBatchUpdateDialog, setShowBatchUpdateDialog] = useState(false)

  const [generating, setGenerating] = useState(false)
  const [batchUpdating, setBatchUpdating] = useState(false)
  const [deletingCode, setDeletingCode] = useState<RedeemCode | null>(null)
  const [copiedCode, setCopiedCode] = useState<string | null>(null)
  const [copiedAll, setCopiedAll] = useState(false)
  const [generatedCodes, setGeneratedCodes] = useState<RedeemCode[]>([])

  const [generateForm, setGenerateForm] = useState({
    type: 'balance' as RedeemCodeType,
    value: 10,
    count: 1,
    group_id: null as number | null,
    validity_days: 30,
    expiry_option: 'never' as RedeemCodeExpiryOption,
    custom_expiry_days: 7,
  })

  const [batchUpdateForm, setBatchUpdateForm] = useState({
    update_status: false,
    status: 'disabled' as 'unused' | 'disabled',
    update_expires_at: false,
    expires_mode: 'clear' as 'clear' | 'custom',
    expires_at_local: toDatetimeLocalInputValue(new Date(Date.now() + 24 * 60 * 60 * 1000)),
    update_notes: false,
    notes: '',
    update_group_id: false,
    group_id: null as number | null,
  })

  const subscriptionGroupOptions = useMemo<GroupOption[]>(
    () =>
      subscriptionGroups
        .filter((group) => group.subscription_type === 'subscription')
        .map((group) => ({
          value: group.id,
          label: group.name,
          description: group.description,
          platform: group.platform,
          subscriptionType: group.subscription_type,
          rate: group.rate_multiplier,
        })),
    [subscriptionGroups],
  )

  const batchGroupOptions = useMemo(
    () => [{ value: null, label: t('admin.redeem.clearGroup') }, ...subscriptionGroupOptions],
    [subscriptionGroupOptions, t],
  )

  const generatedCodesText = useMemo(
    () => generatedCodes.map((code) => code.code).join('\n'),
    [generatedCodes],
  )

  const textareaHeight = useMemo(() => {
    const lineCount = generatedCodes.length
    const lineHeight = 24
    const padding = 24
    const minHeight = 60
    const maxHeight = 240
    const calculatedHeight = Math.min(
      Math.max(lineCount * lineHeight + padding, minHeight),
      maxHeight,
    )
    return `${calculatedHeight}px`
  }, [generatedCodes.length])

  const columns = useMemo<Column[]>(
    () => [
      { key: 'select', label: '' },
      { key: 'code', label: t('admin.redeem.columns.code') },
      { key: 'type', label: t('admin.redeem.columns.type'), sortable: true },
      { key: 'value', label: t('admin.redeem.columns.value'), sortable: true },
      { key: 'status', label: t('admin.redeem.columns.status'), sortable: true },
      { key: 'used_by', label: t('admin.redeem.columns.usedBy') },
      { key: 'used_at', label: t('admin.redeem.columns.usedAt'), sortable: true },
      { key: 'expires_at', label: t('admin.redeem.columns.expiresAt'), sortable: true },
      { key: 'actions', label: t('admin.redeem.columns.actions') },
    ],
    [t],
  )

  const typeOptions = useMemo(
    () => [
      { value: 'balance', label: t('admin.redeem.balance') },
      { value: 'concurrency', label: t('admin.redeem.concurrency') },
      { value: 'subscription', label: t('admin.redeem.subscription') },
      { value: 'invitation', label: t('admin.redeem.invitation') },
    ],
    [t],
  )

  const filterTypeOptions = useMemo(
    () => [
      { value: '', label: t('admin.redeem.allTypes') },
      { value: 'balance', label: t('admin.redeem.balance') },
      { value: 'concurrency', label: t('admin.redeem.concurrency') },
      { value: 'subscription', label: t('admin.redeem.subscription') },
      { value: 'invitation', label: t('admin.redeem.invitation') },
    ],
    [t],
  )

  const filterStatusOptions = useMemo(
    () => [
      { value: '', label: t('admin.redeem.allStatus') },
      { value: 'unused', label: t('admin.redeem.unused') },
      { value: 'used', label: t('admin.redeem.used') },
      { value: 'expired', label: t('admin.redeem.status.expired') },
      { value: 'disabled', label: t('admin.redeem.status.disabled') },
    ],
    [t],
  )

  const batchStatusOptions = useMemo(
    () => [
      { value: 'unused', label: t('admin.redeem.status.unused') },
      { value: 'disabled', label: t('admin.redeem.status.disabled') },
    ],
    [t],
  )

  const batchExpiryModeOptions = useMemo(
    () => [
      { value: 'clear', label: t('admin.redeem.neverExpires') },
      { value: 'custom', label: t('admin.redeem.customExpiry') },
    ],
    [t],
  )

  const redeemCodeExpiryOptions = useMemo<{ value: RedeemCodeExpiryOption; label: string }[]>(
    () => [
      { value: 'never', label: t('admin.redeem.neverExpires') },
      { value: '1', label: t('admin.redeem.expiryPresetDays', { days: 1 }) },
      { value: '3', label: t('admin.redeem.expiryPresetDays', { days: 3 }) },
      { value: '7', label: t('admin.redeem.expiryPresetDays', { days: 7 }) },
      { value: 'custom', label: t('admin.redeem.customExpiry') },
    ],
    [t],
  )

  const buildRedeemQueryFilters = useCallback(
    (): RedeemCodeFilters => ({
      type: (filters.type || undefined) as RedeemCodeType | undefined,
      status: (filters.status || undefined) as RedeemCodeFilters['status'],
      search: searchQuery || undefined,
      sort_by: sortState.sort_by,
      sort_order: sortState.sort_order,
    }),
    [filters.status, filters.type, searchQuery, sortState.sort_by, sortState.sort_order],
  )

  const loadCodes = useCallback(async () => {
    try {
      await load()
    } catch (error) {
      if (!isAbortError(error)) {
        appStore.showError(t('admin.redeem.failedToLoad'))
        console.error('Error loading redeem codes:', error)
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

  const handleTypeFilterChange = useCallback(
    (value: string | number | boolean | null) => {
      const type = String(value ?? '')
      setFilters((prev) => ({ ...prev, type }))
      setParams((prev) => ({
        ...prev,
        type: (type || undefined) as RedeemCodeType | undefined,
      }))
      setPagination((prev) => ({ ...prev, page: 1 }))
      void loadCodes()
    },
    [loadCodes, setPagination, setParams],
  )

  const handleStatusFilterChange = useCallback(
    (value: string | number | boolean | null) => {
      const status = String(value ?? '')
      setFilters((prev) => ({ ...prev, status }))
      setParams((prev) => ({
        ...prev,
        status: (status || undefined) as RedeemCodeFilters['status'],
      }))
      setPagination((prev) => ({ ...prev, page: 1 }))
      void loadCodes()
    },
    [loadCodes, setPagination, setParams],
  )

  const handleSort = useCallback(
    (key: string, order: RedeemSortOrder) => {
      setSortState({ sort_by: key, sort_order: order })
      setParams((prev) => ({ ...prev, sort_by: key, sort_order: order }))
      setPagination((prev) => ({ ...prev, page: 1 }))
      void loadCodes()
    },
    [loadCodes, setPagination, setParams],
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

  const getRedeemCodeExpiresInDays = useCallback((): number | null | undefined => {
    if (generateForm.expiry_option === 'never') {
      return undefined
    }
    if (generateForm.expiry_option === 'custom') {
      if (!Number.isFinite(generateForm.custom_expiry_days) || generateForm.custom_expiry_days < 1) {
        return null
      }
      return Math.floor(generateForm.custom_expiry_days)
    }
    return Number(generateForm.expiry_option)
  }, [generateForm.custom_expiry_days, generateForm.expiry_option])

  const resetBatchUpdateForm = useCallback(() => {
    setBatchUpdateForm({
      update_status: false,
      status: 'disabled',
      update_expires_at: false,
      expires_mode: 'clear',
      expires_at_local: toDatetimeLocalInputValue(new Date(Date.now() + 24 * 60 * 60 * 1000)),
      update_notes: false,
      notes: '',
      update_group_id: false,
      group_id: null,
    })
  }, [])

  const openBatchUpdateDialog = useCallback(() => {
    if (selectedCount === 0) {
      appStore.showInfo(t('admin.redeem.selectCodesFirst'))
      return
    }
    resetBatchUpdateForm()
    setShowBatchUpdateDialog(true)
  }, [appStore, resetBatchUpdateForm, selectedCount, t])

  const closeBatchUpdateDialog = useCallback(() => {
    setShowBatchUpdateDialog(false)
  }, [])

  const buildBatchUpdateFields = useCallback((): BatchUpdateRedeemCodeFields | null => {
    const fields: BatchUpdateRedeemCodeFields = {}

    if (batchUpdateForm.update_status) {
      fields.status = batchUpdateForm.status
    }
    if (batchUpdateForm.update_expires_at) {
      if (batchUpdateForm.expires_mode === 'clear') {
        fields.expires_at = null
      } else {
        const expiresAt = new Date(batchUpdateForm.expires_at_local)
        if (!batchUpdateForm.expires_at_local || Number.isNaN(expiresAt.getTime())) {
          appStore.showError(t('admin.redeem.expiryDaysRequired'))
          return null
        }
        fields.expires_at = expiresAt.toISOString()
      }
    }
    if (batchUpdateForm.update_notes) {
      fields.notes = batchUpdateForm.notes
    }
    if (batchUpdateForm.update_group_id) {
      fields.group_id =
        batchUpdateForm.group_id == null ? null : Number(batchUpdateForm.group_id)
    }

    return Object.keys(fields).length > 0 ? fields : null
  }, [appStore, batchUpdateForm, t])

  const handleGenerateCodes = useCallback(
    async (event: FormEvent) => {
      event.preventDefault()

      if (generateForm.type === 'subscription' && !generateForm.group_id) {
        appStore.showError(t('admin.redeem.groupRequired'))
        return
      }

      const expiresInDays = getRedeemCodeExpiresInDays()
      if (expiresInDays === null) {
        appStore.showError(t('admin.redeem.expiryDaysRequired'))
        return
      }

      setGenerating(true)
      try {
        const result = await adminRedeemAPI.generate(
          generateForm.count,
          generateForm.type,
          generateForm.value,
          generateForm.type === 'subscription' ? generateForm.group_id : undefined,
          generateForm.type === 'subscription' ? generateForm.validity_days : undefined,
          expiresInDays,
        )
        setShowGenerateDialog(false)
        setGeneratedCodes(result)
        setShowResultDialog(true)
        setGenerateForm((prev) => ({
          ...prev,
          group_id: null,
          validity_days: 30,
          expiry_option: 'never',
          custom_expiry_days: 7,
        }))
        void loadCodes()
      } catch (error) {
        appStore.showError(
          extractApiErrorMessage(error, t('admin.redeem.failedToGenerate')),
        )
        console.error('Error generating codes:', error)
      } finally {
        setGenerating(false)
      }
    },
    [appStore, generateForm, getRedeemCodeExpiresInDays, loadCodes, t],
  )

  const copyCodeToClipboard = useCallback(
    async (text: string) => {
      const success = await clipboardCopy(text, t('admin.redeem.copied'))
      if (success) {
        setCopiedCode(text)
        setTimeout(() => setCopiedCode(null), 2000)
      }
    },
    [clipboardCopy, t],
  )

  const closeResultDialog = useCallback(() => {
    setShowResultDialog(false)
    setGeneratedCodes([])
    setCopiedAll(false)
  }, [])

  const copyGeneratedCodes = useCallback(async () => {
    const success = await clipboardCopy(generatedCodesText, t('admin.redeem.copied'))
    if (success) {
      setCopiedAll(true)
      setTimeout(() => setCopiedAll(false), 2000)
    }
  }, [clipboardCopy, generatedCodesText, t])

  const downloadGeneratedCodes = useCallback(() => {
    const blob = new Blob([generatedCodesText], { type: 'text/plain' })
    const url = window.URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `redeem-codes-${new Date().toISOString().split('T')[0]}.txt`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    window.URL.revokeObjectURL(url)
  }, [generatedCodesText])

  const handleExportCodes = useCallback(async () => {
    try {
      const queryFilters = buildRedeemQueryFilters()
      const exportFilters = {
        type: queryFilters.type,
        status:
          queryFilters.status === 'active'
            ? undefined
            : (queryFilters.status as 'used' | 'expired' | 'unused' | 'disabled' | undefined),
        search: queryFilters.search,
        sort_by: queryFilters.sort_by,
        sort_order: queryFilters.sort_order,
      }
      const blob = await adminRedeemAPI.exportCodes(exportFilters)
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `redeem-codes-${new Date().toISOString().split('T')[0]}.csv`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      window.URL.revokeObjectURL(url)
      appStore.showSuccess(t('admin.redeem.codesExported'))
    } catch (error) {
      appStore.showError(extractApiErrorMessage(error, t('admin.redeem.failedToExport')))
      console.error('Error exporting codes:', error)
    }
  }, [appStore, buildRedeemQueryFilters, t])

  const handleDelete = useCallback((code: RedeemCode) => {
    setDeletingCode(code)
    setShowDeleteDialog(true)
  }, [])

  const confirmDelete = useCallback(async () => {
    if (!deletingCode) return

    try {
      await adminRedeemAPI.delete(deletingCode.id)
      appStore.showSuccess(t('admin.redeem.codeDeleted'))
      setShowDeleteDialog(false)
      setDeletingCode(null)
      void loadCodes()
    } catch (error) {
      appStore.showError(extractApiErrorMessage(error, t('admin.redeem.failedToDelete')))
      console.error('Error deleting code:', error)
    }
  }, [appStore, deletingCode, loadCodes, t])

  const confirmDeleteUnused = useCallback(async () => {
    try {
      const unusedCodesResponse = await adminRedeemAPI.list(1, 1000, { status: 'unused' })
      const unusedCodeIds = unusedCodesResponse.items.map((code) => code.id)

      if (unusedCodeIds.length === 0) {
        appStore.showInfo(t('admin.redeem.noUnusedCodes'))
        setShowDeleteUnusedDialog(false)
        return
      }

      const result = await adminRedeemAPI.batchDelete(unusedCodeIds)
      appStore.showSuccess(t('admin.redeem.codesDeleted', { count: result.deleted }))
      setShowDeleteUnusedDialog(false)
      void loadCodes()
    } catch (error) {
      appStore.showError(extractApiErrorMessage(error, t('admin.redeem.failedToDeleteUnused')))
      console.error('Error deleting unused codes:', error)
    }
  }, [appStore, loadCodes, t])

  const handleBatchUpdate = useCallback(
    async (event: FormEvent) => {
      event.preventDefault()

      if (selectedIds.length === 0) {
        appStore.showInfo(t('admin.redeem.selectCodesFirst'))
        return
      }

      const hasSelectedFields =
        batchUpdateForm.update_status ||
        batchUpdateForm.update_expires_at ||
        batchUpdateForm.update_notes ||
        batchUpdateForm.update_group_id
      if (!hasSelectedFields) {
        appStore.showError(t('admin.redeem.noBatchFieldsSelected'))
        return
      }

      const fields = buildBatchUpdateFields()
      if (!fields) {
        return
      }

      setBatchUpdating(true)
      try {
        const result = await adminRedeemAPI.batchUpdate(selectedIds, fields)
        appStore.showSuccess(t('admin.redeem.batchUpdateSuccess', { count: result.updated }))
        setShowBatchUpdateDialog(false)
        clearSelectedCodes()
        void loadCodes()
      } catch (error) {
        appStore.showError(extractApiErrorMessage(error, t('admin.redeem.failedToBatchUpdate')))
        console.error('Error batch updating codes:', error)
      } finally {
        setBatchUpdating(false)
      }
    },
    [
      appStore,
      batchUpdateForm,
      buildBatchUpdateFields,
      clearSelectedCodes,
      loadCodes,
      selectedIds,
      t,
    ],
  )

  const loadSubscriptionGroups = useCallback(async () => {
    try {
      const groups = await adminGroupsAPI.getAll()
      setSubscriptionGroups(groups)
    } catch (error) {
      console.error('Error loading subscription groups:', error)
    }
  }, [])

  const headerCells = useMemo(
    () => ({
      select: () => (
        <input
          data-test="select-all-codes"
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
          data-test="select-code"
          type="checkbox"
          className="h-4 w-4 cursor-pointer rounded border-gray-300 text-primary-600 focus:ring-primary-500"
          checked={selectedCodeIds.has((row as RedeemCode).id)}
          onClick={(event: ReactMouseEvent) => event.stopPropagation()}
          onChange={(event) => toggleSelectRow((row as RedeemCode).id, event)}
        />
      ),
      code: ({ value }) => (
        <div className="flex items-center space-x-2">
          <code className="font-mono text-sm text-gray-900 dark:text-gray-100">{String(value)}</code>
          <button
            type="button"
            onClick={() => void copyCodeToClipboard(String(value))}
            className={`flex items-center transition-colors ${
              copiedCode === value
                ? 'text-green-500'
                : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'
            }`}
            title={
              copiedCode === value ? t('admin.redeem.copied') : t('keys.copyToClipboard')
            }
          >
            {copiedCode !== value ? (
              <Icon name="copy" size="sm" strokeWidth={2} />
            ) : (
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M5 13l4 4L19 7"
                />
              </svg>
            )}
          </button>
        </div>
      ),
      type: ({ value }) => (
        <span
          className={`badge ${
            value === 'balance'
              ? 'badge-success'
              : value === 'subscription'
                ? 'badge-warning'
                : 'badge-primary'
          }`}
        >
          {t(`admin.redeem.types.${String(value)}`)}
        </span>
      ),
      value: ({ value, row }) => {
        const code = row as RedeemCode
        return (
          <span className="text-sm font-medium text-gray-900 dark:text-white">
            {code.type === 'balance' ? (
              <>${Number(value).toFixed(2)}</>
            ) : code.type === 'subscription' ? (
              <>
                {code.validity_days || 30} {t('admin.redeem.days')}
                {code.group ? (
                  <span className="ml-1 text-xs text-gray-500 dark:text-gray-400">
                    ({code.group.name})
                  </span>
                ) : null}
              </>
            ) : (
              value
            )}
          </span>
        )
      },
      status: ({ value }) => (
        <span
          className={`badge ${
            value === 'unused'
              ? 'badge-success'
              : value === 'used'
                ? 'badge-gray'
                : 'badge-danger'
          }`}
        >
          {t(`admin.redeem.status.${String(value)}`)}
        </span>
      ),
      used_by: ({ value, row }) => {
        const code = row as RedeemCode
        return (
          <span className="text-sm text-gray-500 dark:text-dark-400">
            {code.user?.email ||
              (value ? t('admin.redeem.userPrefix', { id: value }) : '-')}
          </span>
        )
      },
      used_at: ({ value }) => (
        <span className="text-sm text-gray-500 dark:text-dark-400">
          {value ? formatDateTime(String(value)) : '-'}
        </span>
      ),
      expires_at: ({ value, row }) => {
        const code = row as RedeemCode
        return (
          <span
            className={`text-sm ${
              code.status === 'expired'
                ? 'text-red-600 dark:text-red-400'
                : 'text-gray-500 dark:text-dark-400'
            }`}
          >
            {value ? formatDateTime(String(value)) : t('admin.redeem.neverExpires')}
          </span>
        )
      },
      actions: ({ row }) => {
        const code = row as RedeemCode
        return (
          <div className="flex items-center space-x-2">
            {code.status === 'unused' ? (
              <button
                type="button"
                onClick={() => handleDelete(code)}
                className="flex flex-col items-center gap-0.5 rounded-lg p-1.5 text-gray-500 transition-colors hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20 dark:hover:text-red-400"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                  />
                </svg>
                <span className="text-xs">{t('common.delete')}</span>
              </button>
            ) : (
              <span className="text-gray-400 dark:text-dark-500">-</span>
            )}
          </div>
        )
      },
    }
    return cells
  }, [copiedCode, copyCodeToClipboard, handleDelete, selectedCodeIds, t, toggleSelectRow])

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    void loadCodes()
  }, [loadCodes])

  useEffect(() => {
    void loadSubscriptionGroups()
  }, [loadSubscriptionGroups])

  useEffect(() => {
    if (generateForm.type === 'invitation') {
      setGenerateForm((prev) => (prev.value === 0 ? prev : { ...prev, value: 0 }))
    } else if (generateForm.value === 0) {
      setGenerateForm((prev) => ({ ...prev, value: 10 }))
    }
  }, [generateForm.type, generateForm.value])

  return (
    <AppLayout>
      <TablePageLayout
        filters={
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex-1 sm:max-w-64">
              <input
                value={searchQuery}
                onChange={handleSearch}
                type="text"
                placeholder={t('admin.redeem.searchCodes')}
                className="input"
              />
            </div>
            <Select
              modelValue={filters.type}
              options={filterTypeOptions}
              className="w-36"
              onUpdateModelValue={handleTypeFilterChange}
            />
            <Select
              modelValue={filters.status}
              options={filterStatusOptions}
              className="w-36"
              onUpdateModelValue={handleStatusFilterChange}
            />

            <div className="flex flex-1 flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => void loadCodes()}
                disabled={loading}
                className="btn btn-secondary"
                title={t('common.refresh')}
              >
                <Icon name="refresh" size="md" className={loading ? 'animate-spin' : ''} />
              </button>
              <button type="button" onClick={() => void handleExportCodes()} className="btn btn-secondary">
                {t('admin.redeem.exportCsv')}
              </button>
              <button
                type="button"
                data-test="batch-update-open"
                onClick={openBatchUpdateDialog}
                disabled={selectedCount === 0 || batchUpdating}
                className="btn btn-secondary"
              >
                <Icon name="edit" size="md" className="mr-2" />
                {t('admin.redeem.batchUpdate')}
              </button>
              <button
                type="button"
                onClick={() => setShowGenerateDialog(true)}
                className="btn btn-primary"
              >
                {t('admin.redeem.generateCodes')}
              </button>
            </div>
          </div>
        }
        table={
          <DataTable
            columns={columns}
            data={codes}
            loading={loading}
            rowKey="id"
            serverSideSort
            defaultSortKey="id"
            defaultSortOrder="desc"
            onSort={handleSort}
            cells={tableCells}
            headerCells={headerCells}
          />
        }
        pagination={
          <>
            {selectedCount > 0 ? (
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-primary-50 p-3 dark:bg-primary-900/20">
                <span className="text-sm font-medium text-primary-900 dark:text-primary-100">
                  {t('admin.redeem.selectedCount', { count: selectedCount })}
                </span>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    className="text-xs font-medium text-primary-700 hover:text-primary-800 dark:text-primary-300 dark:hover:text-primary-200"
                    onClick={clearSelectedCodes}
                  >
                    {t('admin.redeem.clearSelection')}
                  </button>
                  <button type="button" className="btn btn-primary btn-sm" onClick={openBatchUpdateDialog}>
                    {t('admin.redeem.batchUpdate')}
                  </button>
                </div>
              </div>
            ) : null}

            {pagination.total > 0 ? (
              <Pagination
                page={pagination.page}
                total={pagination.total}
                pageSize={pagination.page_size}
                onUpdatePage={handlePageChange}
                onUpdatePageSize={handlePageSizeChange}
              />
            ) : null}

            {filters.status === 'unused' ? (
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => setShowDeleteUnusedDialog(true)}
                  className="btn btn-danger"
                >
                  {t('admin.redeem.deleteAllUnused')}
                </button>
              </div>
            ) : null}
          </>
        }
      />

      <ConfirmDialog
        show={showDeleteDialog}
        title={t('admin.redeem.deleteCode')}
        message={t('admin.redeem.deleteCodeConfirm')}
        confirmText={t('common.delete')}
        cancelText={t('common.cancel')}
        danger
        onConfirm={() => void confirmDelete()}
        onCancel={() => setShowDeleteDialog(false)}
      />

      <ConfirmDialog
        show={showDeleteUnusedDialog}
        title={t('admin.redeem.deleteAllUnused')}
        message={t('admin.redeem.deleteAllUnusedConfirm')}
        confirmText={t('admin.redeem.deleteAll')}
        cancelText={t('common.cancel')}
        danger
        onConfirm={() => void confirmDeleteUnused()}
        onCancel={() => setShowDeleteUnusedDialog(false)}
      />

      {mounted && showGenerateDialog
        ? createPortal(
            <div className="fixed inset-0 z-50 flex items-center justify-center">
              <div
                className="fixed inset-0 bg-black/50"
                onClick={() => setShowGenerateDialog(false)}
              />
              <div className="relative z-10 w-full max-w-md rounded-xl bg-white p-6 shadow-xl dark:bg-dark-800">
                <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">
                  {t('admin.redeem.generateCodesTitle')}
                </h2>
                <form onSubmit={(event) => void handleGenerateCodes(event)} className="space-y-4">
                  <div>
                    <label className="input-label">{t('admin.redeem.codeType')}</label>
                    <Select
                      modelValue={generateForm.type}
                      options={typeOptions}
                      onUpdateModelValue={(value) =>
                        setGenerateForm((prev) => ({
                          ...prev,
                          type: value as RedeemCodeType,
                        }))
                      }
                    />
                  </div>

                  {generateForm.type !== 'subscription' && generateForm.type !== 'invitation' ? (
                    <div>
                      <label className="input-label">
                        {generateForm.type === 'balance'
                          ? t('admin.redeem.amount')
                          : t('admin.redeem.columns.value')}
                      </label>
                      <input
                        value={generateForm.value}
                        onChange={(event) =>
                          setGenerateForm((prev) => ({
                            ...prev,
                            value: Number(event.target.value),
                          }))
                        }
                        type="number"
                        step={generateForm.type === 'balance' ? '0.01' : '1'}
                        min={generateForm.type === 'balance' ? '0.01' : '1'}
                        required
                        className="input"
                      />
                    </div>
                  ) : null}

                  {generateForm.type === 'invitation' ? (
                    <div className="rounded-lg bg-blue-50 p-3 dark:bg-blue-900/20">
                      <p className="text-sm text-blue-700 dark:text-blue-300">
                        {t('admin.redeem.invitationHint')}
                      </p>
                    </div>
                  ) : null}

                  {generateForm.type === 'subscription' ? (
                    <>
                      <div>
                        <label className="input-label">{t('admin.redeem.selectGroup')}</label>
                        <Select
                          modelValue={generateForm.group_id}
                          options={subscriptionGroupOptions}
                          placeholder={t('admin.redeem.selectGroupPlaceholder')}
                          onUpdateModelValue={(value) =>
                            setGenerateForm((prev) => ({
                              ...prev,
                              group_id: value as number | null,
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
                              <span className="text-gray-400">
                                {t('admin.redeem.selectGroupPlaceholder')}
                              </span>
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
                      </div>
                      <div>
                        <label className="input-label">{t('admin.redeem.validityDays')}</label>
                        <input
                          value={generateForm.validity_days}
                          onChange={(event) =>
                            setGenerateForm((prev) => ({
                              ...prev,
                              validity_days: Number(event.target.value),
                            }))
                          }
                          type="number"
                          min="1"
                          max="365"
                          required
                          className="input"
                        />
                      </div>
                    </>
                  ) : null}

                  <div>
                    <label className="input-label">{t('admin.redeem.codeExpiry')}</label>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                      {redeemCodeExpiryOptions.map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() =>
                            setGenerateForm((prev) => ({
                              ...prev,
                              expiry_option: option.value,
                            }))
                          }
                          className={`rounded-lg border px-3 py-2 text-sm transition-colors ${
                            generateForm.expiry_option === option.value
                              ? 'border-primary-500 bg-primary-50 text-primary-700 dark:border-primary-400 dark:bg-primary-900/20 dark:text-primary-300'
                              : 'border-gray-200 text-gray-700 hover:bg-gray-50 dark:border-dark-600 dark:text-gray-300 dark:hover:bg-dark-700'
                          }`}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                    {generateForm.expiry_option === 'custom' ? (
                      <input
                        value={generateForm.custom_expiry_days}
                        onChange={(event) =>
                          setGenerateForm((prev) => ({
                            ...prev,
                            custom_expiry_days: Number(event.target.value),
                          }))
                        }
                        type="number"
                        min="1"
                        max="3650"
                        required
                        className="input mt-2"
                        placeholder={t('admin.redeem.customExpiryDays')}
                      />
                    ) : null}
                  </div>

                  <div>
                    <label className="input-label">{t('admin.redeem.count')}</label>
                    <input
                      value={generateForm.count}
                      onChange={(event) =>
                        setGenerateForm((prev) => ({
                          ...prev,
                          count: Number(event.target.value),
                        }))
                      }
                      type="number"
                      min="1"
                      max="100"
                      required
                      className="input"
                    />
                  </div>

                  <div className="flex justify-end gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => setShowGenerateDialog(false)}
                      className="btn btn-secondary"
                    >
                      {t('common.cancel')}
                    </button>
                    <button type="submit" disabled={generating} className="btn btn-primary">
                      {generating ? t('admin.redeem.generating') : t('admin.redeem.generate')}
                    </button>
                  </div>
                </form>
              </div>
            </div>,
            document.body,
          )
        : null}

      {mounted && showBatchUpdateDialog
        ? createPortal(
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
              <div className="fixed inset-0 bg-black/50" onClick={closeBatchUpdateDialog} />
              <div className="relative z-10 w-full max-w-lg rounded-xl bg-white p-6 shadow-xl dark:bg-dark-800">
                <h2 className="mb-1 text-lg font-semibold text-gray-900 dark:text-white">
                  {t('admin.redeem.batchUpdateTitle')}
                </h2>
                <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">
                  {t('admin.redeem.selectedCount', { count: selectedCount })}
                </p>

                <form
                  data-test="batch-update-form"
                  className="space-y-4"
                  onSubmit={(event) => void handleBatchUpdate(event)}
                >
                  <div className="space-y-2">
                    <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                      <input
                        data-test="batch-field-status"
                        checked={batchUpdateForm.update_status}
                        onChange={(event) =>
                          setBatchUpdateForm((prev) => ({
                            ...prev,
                            update_status: event.target.checked,
                          }))
                        }
                        type="checkbox"
                        className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                      />
                      {t('admin.redeem.batchFields.status')}
                    </label>
                    {batchUpdateForm.update_status ? (
                      <Select
                        modelValue={batchUpdateForm.status}
                        options={batchStatusOptions}
                        onUpdateModelValue={(value) =>
                          setBatchUpdateForm((prev) => ({
                            ...prev,
                            status: value as 'unused' | 'disabled',
                          }))
                        }
                      />
                    ) : null}
                  </div>

                  <div className="space-y-2">
                    <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                      <input
                        checked={batchUpdateForm.update_expires_at}
                        onChange={(event) =>
                          setBatchUpdateForm((prev) => ({
                            ...prev,
                            update_expires_at: event.target.checked,
                          }))
                        }
                        type="checkbox"
                        className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                      />
                      {t('admin.redeem.batchFields.expiresAt')}
                    </label>
                    {batchUpdateForm.update_expires_at ? (
                      <>
                        <Select
                          modelValue={batchUpdateForm.expires_mode}
                          options={batchExpiryModeOptions}
                          onUpdateModelValue={(value) =>
                            setBatchUpdateForm((prev) => ({
                              ...prev,
                              expires_mode: value as 'clear' | 'custom',
                            }))
                          }
                        />
                        {batchUpdateForm.expires_mode === 'custom' ? (
                          <input
                            value={batchUpdateForm.expires_at_local}
                            onChange={(event) =>
                              setBatchUpdateForm((prev) => ({
                                ...prev,
                                expires_at_local: event.target.value,
                              }))
                            }
                            type="datetime-local"
                            className="input"
                          />
                        ) : null}
                      </>
                    ) : null}
                  </div>

                  <div className="space-y-2">
                    <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                      <input
                        data-test="batch-field-notes"
                        checked={batchUpdateForm.update_notes}
                        onChange={(event) =>
                          setBatchUpdateForm((prev) => ({
                            ...prev,
                            update_notes: event.target.checked,
                          }))
                        }
                        type="checkbox"
                        className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                      />
                      {t('admin.redeem.batchFields.notes')}
                    </label>
                    {batchUpdateForm.update_notes ? (
                      <textarea
                        data-test="batch-notes-input"
                        value={batchUpdateForm.notes}
                        onChange={(event) =>
                          setBatchUpdateForm((prev) => ({
                            ...prev,
                            notes: event.target.value,
                          }))
                        }
                        rows={3}
                        className="input"
                        placeholder={t('admin.redeem.batchNotesPlaceholder')}
                      />
                    ) : null}
                  </div>

                  <div className="space-y-2">
                    <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                      <input
                        checked={batchUpdateForm.update_group_id}
                        onChange={(event) =>
                          setBatchUpdateForm((prev) => ({
                            ...prev,
                            update_group_id: event.target.checked,
                          }))
                        }
                        type="checkbox"
                        className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                      />
                      {t('admin.redeem.batchFields.group')}
                    </label>
                    {batchUpdateForm.update_group_id ? (
                      <Select
                        modelValue={batchUpdateForm.group_id}
                        options={batchGroupOptions}
                        placeholder={t('admin.redeem.selectGroupPlaceholder')}
                        onUpdateModelValue={(value) =>
                          setBatchUpdateForm((prev) => ({
                            ...prev,
                            group_id: value as number | null,
                          }))
                        }
                      />
                    ) : null}
                  </div>

                  <div className="flex justify-end gap-3 pt-2">
                    <button type="button" onClick={closeBatchUpdateDialog} className="btn btn-secondary">
                      {t('common.cancel')}
                    </button>
                    <button
                      data-test="batch-update-submit"
                      type="submit"
                      disabled={batchUpdating}
                      className="btn btn-primary"
                    >
                      {batchUpdating ? t('common.submitting') : t('admin.redeem.batchUpdate')}
                    </button>
                  </div>
                </form>
              </div>
            </div>,
            document.body,
          )
        : null}

      {mounted && showResultDialog
        ? createPortal(
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
              <div className="fixed inset-0 bg-black/50" onClick={closeResultDialog} />
              <div className="relative z-10 w-full max-w-lg rounded-xl bg-white shadow-xl dark:bg-dark-800">
                <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4 dark:border-dark-600">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
                      <svg
                        className="h-5 w-5 text-green-600 dark:text-green-400"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth="2"
                          d="M5 13l4 4L19 7"
                        />
                      </svg>
                    </div>
                    <div>
                      <h2 className="text-base font-semibold text-gray-900 dark:text-white">
                        {t('admin.redeem.generatedSuccessfully')}
                      </h2>
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        {t('admin.redeem.codesCreated', { count: generatedCodes.length })}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={closeResultDialog}
                    className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-dark-700 dark:hover:text-gray-300"
                  >
                    <Icon name="x" size="md" strokeWidth={2} />
                  </button>
                </div>

                <div className="p-5">
                  <div className="relative">
                    <textarea
                      readOnly
                      value={generatedCodesText}
                      style={{ height: textareaHeight }}
                      className="w-full resize-none rounded-lg border border-gray-200 bg-gray-50 p-3 font-mono text-sm text-gray-800 focus:outline-none dark:border-dark-600 dark:bg-dark-700 dark:text-gray-200"
                    />
                  </div>
                </div>

                <div className="flex justify-end gap-2 rounded-b-xl border-t border-gray-200 bg-gray-50 px-5 py-4 dark:border-dark-600 dark:bg-dark-700/50">
                  <button
                    type="button"
                    onClick={() => void copyGeneratedCodes()}
                    className={`btn flex items-center gap-2 transition-all ${
                      copiedAll ? 'btn-success' : 'btn-secondary'
                    }`}
                  >
                    {!copiedAll ? (
                      <Icon name="copy" size="sm" strokeWidth={2} />
                    ) : (
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth="2"
                          d="M5 13l4 4L19 7"
                        />
                      </svg>
                    )}
                    {copiedAll ? t('admin.redeem.copied') : t('admin.redeem.copyAll')}
                  </button>
                  <button
                    type="button"
                    onClick={downloadGeneratedCodes}
                    className="btn btn-primary flex items-center gap-2"
                  >
                    <Icon name="download" size="sm" strokeWidth={2} />
                    {t('admin.redeem.download')}
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </AppLayout>
  )
}
