'use client'

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from 'react'
import { useI18n } from '@/lib/i18n'
import { useApp } from '@/context/AppContext'
import { useClipboard } from '@/lib/useClipboard'
import { getPersistedPageSize } from '@/lib/usePersistedPageSize'
import { extractApiErrorMessage } from '@/lib/apiError'
import { formatDateTime } from '@/lib/format'
import {
  adminPromoAPI,
  type PromoCode,
  type PromoCodeStatus,
  type PromoCodeUsage,
} from '@/lib/adminPromo'
import AppLayout from '@/components/layout/AppLayout'
import TablePageLayout from '@/components/layout/TablePageLayout'
import DataTable, { type DataTableCellContext } from '@/components/common/DataTable'
import Pagination from '@/components/common/Pagination'
import BaseDialog from '@/components/common/BaseDialog'
import ConfirmDialog from '@/components/common/ConfirmDialog'
import Select from '@/components/common/Select'
import Icon from '@/components/icons/Icon'
import type { Column } from '@/components/common/types'

function isAbortError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const { name, code } = error as { name?: string; code?: string }
  return name === 'AbortError' || name === 'CanceledError' || code === 'ERR_CANCELED'
}

function getStatusClass(status: string, row: PromoCode): string {
  if (row.expires_at && new Date(row.expires_at) < new Date()) {
    return 'badge-danger'
  }
  if (row.max_uses > 0 && row.used_count >= row.max_uses) {
    return 'badge-gray'
  }
  return status === 'active' ? 'badge-success' : 'badge-gray'
}

export default function AdminPromoCodesPage() {
  const { t } = useI18n()
  const appStore = useApp()
  const { copyToClipboard: clipboardCopy } = useClipboard()

  const [codes, setCodes] = useState<PromoCode[]>([])
  const [loading, setLoading] = useState(false)
  const [creating, setCreating] = useState(false)
  const [updating, setUpdating] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [copiedCode, setCopiedCode] = useState<string | null>(null)
  const [filters, setFilters] = useState({ status: '' })
  const [pagination, setPagination] = useState({
    page: 1,
    page_size: getPersistedPageSize(),
    total: 0,
  })
  const [sortState, setSortState] = useState({
    sort_by: 'created_at',
    sort_order: 'desc' as 'asc' | 'desc',
  })

  const abortControllerRef = useRef<AbortController | null>(null)
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [showEditDialog, setShowEditDialog] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [showUsagesDialog, setShowUsagesDialog] = useState(false)

  const [editingCode, setEditingCode] = useState<PromoCode | null>(null)
  const [deletingCode, setDeletingCode] = useState<PromoCode | null>(null)

  const [usages, setUsages] = useState<PromoCodeUsage[]>([])
  const [usagesLoading, setUsagesLoading] = useState(false)
  const [currentViewingCode, setCurrentViewingCode] = useState<PromoCode | null>(null)
  const [usagesPage, setUsagesPage] = useState(1)
  const [usagesPageSize, setUsagesPageSize] = useState(20)
  const [usagesTotal, setUsagesTotal] = useState(0)

  const [createForm, setCreateForm] = useState({
    code: '',
    bonus_amount: 1,
    max_uses: 0,
    expires_at_str: '',
    notes: '',
  })

  const [editForm, setEditForm] = useState({
    code: '',
    bonus_amount: 0,
    max_uses: 0,
    status: 'active' as PromoCodeStatus,
    expires_at_str: '',
    notes: '',
  })

  const filterStatusOptions = useMemo(
    () => [
      { value: '', label: t('admin.promo.allStatus') },
      { value: 'active', label: t('admin.promo.statusActive') },
      { value: 'disabled', label: t('admin.promo.statusDisabled') },
    ],
    [t],
  )

  const statusOptions = useMemo(
    () => [
      { value: 'active', label: t('admin.promo.statusActive') },
      { value: 'disabled', label: t('admin.promo.statusDisabled') },
    ],
    [t],
  )

  const columns = useMemo<Column[]>(
    () => [
      { key: 'code', label: t('admin.promo.columns.code') },
      { key: 'bonus_amount', label: t('admin.promo.columns.bonusAmount'), sortable: true },
      { key: 'usage', label: t('admin.promo.columns.usage') },
      { key: 'status', label: t('admin.promo.columns.status'), sortable: true },
      { key: 'expires_at', label: t('admin.promo.columns.expiresAt'), sortable: true },
      { key: 'created_at', label: t('admin.promo.columns.createdAt'), sortable: true },
      { key: 'actions', label: t('admin.promo.columns.actions') },
    ],
    [t],
  )

  const getStatusLabel = useCallback(
    (status: string, row: PromoCode) => {
      if (row.expires_at && new Date(row.expires_at) < new Date()) {
        return t('admin.promo.statusExpired')
      }
      if (row.max_uses > 0 && row.used_count >= row.max_uses) {
        return t('admin.promo.statusMaxUsed')
      }
      return status === 'active' ? t('admin.promo.statusActive') : t('admin.promo.statusDisabled')
    },
    [t],
  )

  const loadCodes = useCallback(async () => {
    abortControllerRef.current?.abort()
    const currentController = new AbortController()
    abortControllerRef.current = currentController

    setLoading(true)
    try {
      const response = await adminPromoAPI.list(
        pagination.page,
        pagination.page_size,
        {
          status: filters.status || undefined,
          search: searchQuery || undefined,
          sort_by: sortState.sort_by,
          sort_order: sortState.sort_order,
        },
        { signal: currentController.signal },
      )

      if (currentController.signal.aborted || abortControllerRef.current !== currentController) return

      setCodes(response.items)
      setPagination((prev) => ({ ...prev, total: response.total }))
    } catch (error) {
      if (isAbortError(error) || abortControllerRef.current !== currentController) return
      appStore.showError(t('admin.promo.failedToLoad'))
      console.error('Error loading promo codes:', error)
    } finally {
      if (abortControllerRef.current === currentController) {
        setLoading(false)
        abortControllerRef.current = null
      }
    }
  }, [
    appStore,
    filters.status,
    pagination.page,
    pagination.page_size,
    searchQuery,
    sortState.sort_by,
    sortState.sort_order,
    t,
  ])

  useEffect(() => {
    loadCodes()
  }, [loadCodes])

  useEffect(() => {
    return () => {
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current)
      abortControllerRef.current?.abort()
    }
  }, [])

  const handleSearch = useCallback(() => {
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current)
    searchTimeoutRef.current = setTimeout(() => {
      setPagination((prev) => ({ ...prev, page: 1 }))
    }, 300)
  }, [])

  const copyToClipboard = useCallback(
    async (text: string) => {
      const success = await clipboardCopy(text, t('admin.promo.copied'))
      if (success) {
        setCopiedCode(text)
        setTimeout(() => setCopiedCode(null), 2000)
      }
    },
    [clipboardCopy, t],
  )

  const resetCreateForm = useCallback(() => {
    setCreateForm({
      code: '',
      bonus_amount: 1,
      max_uses: 0,
      expires_at_str: '',
      notes: '',
    })
  }, [])

  const handleCreate = useCallback(
    async (event: FormEvent) => {
      event.preventDefault()
      setCreating(true)
      try {
        await adminPromoAPI.create({
          code: createForm.code || undefined,
          bonus_amount: createForm.bonus_amount,
          max_uses: createForm.max_uses,
          expires_at: createForm.expires_at_str
            ? Math.floor(new Date(createForm.expires_at_str).getTime() / 1000)
            : undefined,
          notes: createForm.notes || undefined,
        })
        appStore.showSuccess(t('admin.promo.codeCreated'))
        setShowCreateDialog(false)
        resetCreateForm()
        loadCodes()
      } catch (error) {
        appStore.showError(extractApiErrorMessage(error, t('admin.promo.failedToCreate')))
      } finally {
        setCreating(false)
      }
    },
    [appStore, createForm, loadCodes, resetCreateForm, t],
  )

  const handleEdit = useCallback((code: PromoCode) => {
    setEditingCode(code)
    setEditForm({
      code: code.code,
      bonus_amount: code.bonus_amount,
      max_uses: code.max_uses,
      status: code.status,
      expires_at_str: code.expires_at ? new Date(code.expires_at).toISOString().slice(0, 16) : '',
      notes: code.notes || '',
    })
    setShowEditDialog(true)
  }, [])

  const closeEditDialog = useCallback(() => {
    setShowEditDialog(false)
    setEditingCode(null)
  }, [])

  const handleUpdate = useCallback(
    async (event: FormEvent) => {
      event.preventDefault()
      if (!editingCode) return

      setUpdating(true)
      try {
        await adminPromoAPI.update(editingCode.id, {
          code: editForm.code,
          bonus_amount: editForm.bonus_amount,
          max_uses: editForm.max_uses,
          status: editForm.status,
          expires_at: editForm.expires_at_str
            ? Math.floor(new Date(editForm.expires_at_str).getTime() / 1000)
            : 0,
          notes: editForm.notes,
        })
        appStore.showSuccess(t('admin.promo.codeUpdated'))
        closeEditDialog()
        loadCodes()
      } catch (error) {
        appStore.showError(extractApiErrorMessage(error, t('admin.promo.failedToUpdate')))
      } finally {
        setUpdating(false)
      }
    },
    [appStore, closeEditDialog, editForm, editingCode, loadCodes, t],
  )

  const copyRegisterLink = useCallback(
    async (code: PromoCode) => {
      const baseUrl = window.location.origin
      const registerLink = `${baseUrl}/register?promo=${encodeURIComponent(code.code)}`

      try {
        await navigator.clipboard.writeText(registerLink)
        appStore.showSuccess(t('admin.promo.registerLinkCopied'))
      } catch {
        const textArea = document.createElement('textarea')
        textArea.value = registerLink
        document.body.appendChild(textArea)
        textArea.select()
        document.execCommand('copy')
        document.body.removeChild(textArea)
        appStore.showSuccess(t('admin.promo.registerLinkCopied'))
      }
    },
    [appStore, t],
  )

  const handleDelete = useCallback((code: PromoCode) => {
    setDeletingCode(code)
    setShowDeleteDialog(true)
  }, [])

  const confirmDelete = useCallback(async () => {
    if (!deletingCode) return

    try {
      await adminPromoAPI.delete(deletingCode.id)
      appStore.showSuccess(t('admin.promo.codeDeleted'))
      setShowDeleteDialog(false)
      setDeletingCode(null)
      loadCodes()
    } catch (error) {
      appStore.showError(extractApiErrorMessage(error, t('admin.promo.failedToDelete')))
    }
  }, [appStore, deletingCode, loadCodes, t])

  const loadUsages = useCallback(async () => {
    if (!currentViewingCode) return

    setUsagesLoading(true)
    setUsages([])

    try {
      const response = await adminPromoAPI.getUsages(
        currentViewingCode.id,
        usagesPage,
        usagesPageSize,
      )
      setUsages(response.items)
      setUsagesTotal(response.total)
    } catch (error) {
      appStore.showError(extractApiErrorMessage(error, t('admin.promo.failedToLoadUsages')))
    } finally {
      setUsagesLoading(false)
    }
  }, [appStore, currentViewingCode, t, usagesPage, usagesPageSize])

  const handleViewUsages = useCallback(async (code: PromoCode) => {
    setCurrentViewingCode(code)
    setShowUsagesDialog(true)
    setUsagesPage(1)
  }, [])

  useEffect(() => {
    if (showUsagesDialog && currentViewingCode) {
      loadUsages()
    }
  }, [showUsagesDialog, currentViewingCode, usagesPage, usagesPageSize, loadUsages])

  const tableCells = useMemo(
    () => ({
      code: ({ value }: DataTableCellContext) => (
        <div className="flex items-center space-x-2">
          <code className="font-mono text-sm text-gray-900 dark:text-gray-100">{value}</code>
          <button
            type="button"
            onClick={() => copyToClipboard(value)}
            className={`flex items-center transition-colors ${
              copiedCode === value
                ? 'text-green-500'
                : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'
            }`}
            title={copiedCode === value ? t('admin.promo.copied') : t('keys.copyToClipboard')}
          >
            {copiedCode !== value ? (
              <Icon name="copy" size="sm" strokeWidth={2} />
            ) : (
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
              </svg>
            )}
          </button>
        </div>
      ),
      bonus_amount: ({ value }: DataTableCellContext) => (
        <span className="text-sm font-medium text-gray-900 dark:text-white">
          ${Number(value).toFixed(2)}
        </span>
      ),
      usage: ({ row }: DataTableCellContext) => (
        <span className="text-sm text-gray-600 dark:text-gray-300">
          {row.used_count} / {row.max_uses === 0 ? '∞' : row.max_uses}
        </span>
      ),
      status: ({ value, row }: DataTableCellContext) => (
        <span className={`badge ${getStatusClass(value, row as PromoCode)}`}>
          {getStatusLabel(value, row as PromoCode)}
        </span>
      ),
      expires_at: ({ value }: DataTableCellContext) => (
        <span className="text-sm text-gray-500 dark:text-dark-400">
          {value ? formatDateTime(value) : t('admin.promo.neverExpires')}
        </span>
      ),
      created_at: ({ value }: DataTableCellContext) => (
        <span className="text-sm text-gray-500 dark:text-dark-400">{formatDateTime(value)}</span>
      ),
      actions: ({ row }: DataTableCellContext) => (
        <div className="flex items-center space-x-1">
          <button
            type="button"
            onClick={() => copyRegisterLink(row as PromoCode)}
            className="flex flex-col items-center gap-0.5 rounded-lg p-1.5 text-gray-500 transition-colors hover:bg-green-50 hover:text-green-600 dark:hover:bg-green-900/20 dark:hover:text-green-400"
            title={t('admin.promo.copyRegisterLink')}
          >
            <Icon name="link" size="sm" />
          </button>
          <button
            type="button"
            onClick={() => handleViewUsages(row as PromoCode)}
            className="flex flex-col items-center gap-0.5 rounded-lg p-1.5 text-gray-500 transition-colors hover:bg-blue-50 hover:text-blue-600 dark:hover:bg-blue-900/20 dark:hover:text-blue-400"
            title={t('admin.promo.viewUsages')}
          >
            <Icon name="eye" size="sm" />
          </button>
          <button
            type="button"
            onClick={() => handleEdit(row as PromoCode)}
            className="flex flex-col items-center gap-0.5 rounded-lg p-1.5 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-dark-600 dark:hover:text-gray-300"
            title={t('common.edit')}
          >
            <Icon name="edit" size="sm" />
          </button>
          <button
            type="button"
            onClick={() => handleDelete(row as PromoCode)}
            className="flex flex-col items-center gap-0.5 rounded-lg p-1.5 text-gray-500 transition-colors hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20 dark:hover:text-red-400"
            title={t('common.delete')}
          >
            <Icon name="trash" size="sm" />
          </button>
        </div>
      ),
    }),
    [
      copiedCode,
      copyRegisterLink,
      copyToClipboard,
      getStatusLabel,
      handleDelete,
      handleEdit,
      handleViewUsages,
      t,
    ],
  )

  return (
    <AppLayout>
      <TablePageLayout
        filters={
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex-1 sm:max-w-64">
              <input
                value={searchQuery}
                onChange={(event) => {
                  setSearchQuery(event.target.value)
                  handleSearch()
                }}
                type="text"
                placeholder={t('admin.promo.searchCodes')}
                className="input"
              />
            </div>
            <Select
              modelValue={filters.status}
              options={filterStatusOptions}
              className="w-36"
              onUpdateModelValue={(value) => {
                setFilters({ status: String(value ?? '') })
                setPagination((prev) => ({ ...prev, page: 1 }))
              }}
            />

            <div className="flex flex-1 flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => loadCodes()}
                disabled={loading}
                className="btn btn-secondary"
                title={t('common.refresh')}
              >
                <Icon name="refresh" size="md" className={loading ? 'animate-spin' : ''} />
              </button>
              <button
                type="button"
                onClick={() => {
                  resetCreateForm()
                  setShowCreateDialog(true)
                }}
                className="btn btn-primary"
              >
                <Icon name="plus" size="md" className="mr-1" />
                {t('admin.promo.createCode')}
              </button>
            </div>
          </div>
        }
        table={
          <DataTable
            columns={columns}
            data={codes}
            loading={loading}
            serverSideSort
            defaultSortKey="created_at"
            defaultSortOrder="desc"
            onSort={(key, order) => {
              setSortState({ sort_by: key, sort_order: order })
              setPagination((prev) => ({ ...prev, page: 1 }))
            }}
            cells={tableCells}
          />
        }
        pagination={
          pagination.total > 0 ? (
            <Pagination
              page={pagination.page}
              total={pagination.total}
              pageSize={pagination.page_size}
              onUpdatePage={(page) => setPagination((prev) => ({ ...prev, page }))}
              onUpdatePageSize={(pageSize) =>
                setPagination((prev) => ({ ...prev, page_size: pageSize, page: 1 }))
              }
            />
          ) : null
        }
      />

      <BaseDialog
        show={showCreateDialog}
        title={t('admin.promo.createCode')}
        width="normal"
        onClose={() => setShowCreateDialog(false)}
        footer={
          <div className="flex justify-end gap-3">
            <button type="button" onClick={() => setShowCreateDialog(false)} className="btn btn-secondary">
              {t('common.cancel')}
            </button>
            <button type="submit" form="create-promo-form" disabled={creating} className="btn btn-primary">
              {creating ? t('common.creating') : t('common.create')}
            </button>
          </div>
        }
      >
        <form id="create-promo-form" onSubmit={handleCreate} className="space-y-4">
          <div>
            <label className="input-label">
              {t('admin.promo.code')}
              <span className="ml-1 text-xs font-normal text-gray-400">
                ({t('admin.promo.autoGenerate')})
              </span>
            </label>
            <input
              value={createForm.code}
              onChange={(event) =>
                setCreateForm((prev) => ({ ...prev, code: event.target.value.toUpperCase() }))
              }
              type="text"
              className="input font-mono uppercase"
              placeholder={t('admin.promo.codePlaceholder')}
            />
          </div>
          <div>
            <label className="input-label">{t('admin.promo.bonusAmount')}</label>
            <input
              value={createForm.bonus_amount}
              onChange={(event) =>
                setCreateForm((prev) => ({
                  ...prev,
                  bonus_amount: parseFloat(event.target.value) || 0,
                }))
              }
              type="number"
              step="0.01"
              min={0}
              required
              className="input"
            />
          </div>
          <div>
            <label className="input-label">
              {t('admin.promo.maxUses')}
              <span className="ml-1 text-xs font-normal text-gray-400">
                ({t('admin.promo.zeroUnlimited')})
              </span>
            </label>
            <input
              value={createForm.max_uses}
              onChange={(event) =>
                setCreateForm((prev) => ({
                  ...prev,
                  max_uses: parseInt(event.target.value, 10) || 0,
                }))
              }
              type="number"
              min={0}
              className="input"
            />
          </div>
          <div>
            <label className="input-label">
              {t('admin.promo.expiresAt')}
              <span className="ml-1 text-xs font-normal text-gray-400">({t('common.optional')})</span>
            </label>
            <input
              value={createForm.expires_at_str}
              onChange={(event) =>
                setCreateForm((prev) => ({ ...prev, expires_at_str: event.target.value }))
              }
              type="datetime-local"
              className="input"
            />
          </div>
          <div>
            <label className="input-label">
              {t('admin.promo.notes')}
              <span className="ml-1 text-xs font-normal text-gray-400">({t('common.optional')})</span>
            </label>
            <textarea
              value={createForm.notes}
              onChange={(event) => setCreateForm((prev) => ({ ...prev, notes: event.target.value }))}
              rows={2}
              className="input"
              placeholder={t('admin.promo.notesPlaceholder')}
            />
          </div>
        </form>
      </BaseDialog>

      <BaseDialog
        show={showEditDialog}
        title={t('admin.promo.editCode')}
        width="normal"
        onClose={closeEditDialog}
        footer={
          <div className="flex justify-end gap-3">
            <button type="button" onClick={closeEditDialog} className="btn btn-secondary">
              {t('common.cancel')}
            </button>
            <button type="submit" form="edit-promo-form" disabled={updating} className="btn btn-primary">
              {updating ? t('common.saving') : t('common.save')}
            </button>
          </div>
        }
      >
        <form id="edit-promo-form" onSubmit={handleUpdate} className="space-y-4">
          <div>
            <label className="input-label">{t('admin.promo.code')}</label>
            <input
              value={editForm.code}
              onChange={(event) =>
                setEditForm((prev) => ({ ...prev, code: event.target.value.toUpperCase() }))
              }
              type="text"
              className="input font-mono uppercase"
            />
          </div>
          <div>
            <label className="input-label">{t('admin.promo.bonusAmount')}</label>
            <input
              value={editForm.bonus_amount}
              onChange={(event) =>
                setEditForm((prev) => ({
                  ...prev,
                  bonus_amount: parseFloat(event.target.value) || 0,
                }))
              }
              type="number"
              step="0.01"
              min={0}
              required
              className="input"
            />
          </div>
          <div>
            <label className="input-label">
              {t('admin.promo.maxUses')}
              <span className="ml-1 text-xs font-normal text-gray-400">
                ({t('admin.promo.zeroUnlimited')})
              </span>
            </label>
            <input
              value={editForm.max_uses}
              onChange={(event) =>
                setEditForm((prev) => ({
                  ...prev,
                  max_uses: parseInt(event.target.value, 10) || 0,
                }))
              }
              type="number"
              min={0}
              className="input"
            />
          </div>
          <div>
            <label className="input-label">{t('admin.promo.status')}</label>
            <Select
              modelValue={editForm.status}
              options={statusOptions}
              onUpdateModelValue={(value) =>
                setEditForm((prev) => ({ ...prev, status: value as PromoCodeStatus }))
              }
            />
          </div>
          <div>
            <label className="input-label">
              {t('admin.promo.expiresAt')}
              <span className="ml-1 text-xs font-normal text-gray-400">({t('common.optional')})</span>
            </label>
            <input
              value={editForm.expires_at_str}
              onChange={(event) =>
                setEditForm((prev) => ({ ...prev, expires_at_str: event.target.value }))
              }
              type="datetime-local"
              className="input"
            />
          </div>
          <div>
            <label className="input-label">
              {t('admin.promo.notes')}
              <span className="ml-1 text-xs font-normal text-gray-400">({t('common.optional')})</span>
            </label>
            <textarea
              value={editForm.notes}
              onChange={(event) => setEditForm((prev) => ({ ...prev, notes: event.target.value }))}
              rows={2}
              className="input"
            />
          </div>
        </form>
      </BaseDialog>

      <BaseDialog
        show={showUsagesDialog}
        title={t('admin.promo.usageRecords')}
        width="wide"
        onClose={() => setShowUsagesDialog(false)}
        footer={
          <div className="flex justify-end">
            <button type="button" onClick={() => setShowUsagesDialog(false)} className="btn btn-secondary">
              {t('common.close')}
            </button>
          </div>
        }
      >
        {usagesLoading ? (
          <div className="flex items-center justify-center py-8">
            <Icon name="refresh" size="lg" className="animate-spin text-gray-400" />
          </div>
        ) : usages.length === 0 ? (
          <div className="py-8 text-center text-gray-500 dark:text-gray-400">
            {t('admin.promo.noUsages')}
          </div>
        ) : (
          <div className="space-y-3">
            {usages.map((usage) => (
              <div
                key={usage.id}
                className="flex items-center justify-between rounded-lg border border-gray-200 p-3 dark:border-dark-600"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
                    <Icon name="user" size="sm" className="text-green-600 dark:text-green-400" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-900 dark:text-white">
                      {usage.user?.email || t('admin.promo.userPrefix', { id: usage.user_id })}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {formatDateTime(usage.used_at)}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-sm font-medium text-green-600 dark:text-green-400">
                    +${usage.bonus_amount.toFixed(2)}
                  </span>
                </div>
              </div>
            ))}
            {usagesTotal > usagesPageSize ? (
              <div className="mt-4">
                <Pagination
                  page={usagesPage}
                  total={usagesTotal}
                  pageSize={usagesPageSize}
                  onUpdatePage={setUsagesPage}
                  onUpdatePageSize={(size) => {
                    setUsagesPageSize(size)
                    setUsagesPage(1)
                  }}
                />
              </div>
            ) : null}
          </div>
        )}
      </BaseDialog>

      <ConfirmDialog
        show={showDeleteDialog}
        title={t('admin.promo.deleteCode')}
        message={t('admin.promo.deleteCodeConfirm')}
        confirmText={t('common.delete')}
        cancelText={t('common.cancel')}
        danger
        onConfirm={confirmDelete}
        onCancel={() => setShowDeleteDialog(false)}
      />
    </AppLayout>
  )
}
