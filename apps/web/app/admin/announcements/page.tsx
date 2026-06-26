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
import { getPersistedPageSize } from '@/lib/usePersistedPageSize'
import { extractApiErrorMessage } from '@/lib/apiError'
import {
  formatDateTime,
  formatDateTimeLocalInput,
  parseDateTimeLocalInput,
} from '@/lib/format'
import {
  adminAnnouncementsAPI,
  type Announcement,
  type AnnouncementNotifyMode,
  type AnnouncementStatus,
  type AnnouncementTargeting,
} from '@/lib/adminAnnouncements'
import { adminGroupsAPI, type AdminGroup } from '@/lib/adminGroups'
import AppLayout from '@/components/layout/AppLayout'
import TablePageLayout from '@/components/layout/TablePageLayout'
import DataTable, { type DataTableCellContext } from '@/components/common/DataTable'
import Pagination from '@/components/common/Pagination'
import BaseDialog from '@/components/common/BaseDialog'
import ConfirmDialog from '@/components/common/ConfirmDialog'
import EmptyState from '@/components/common/EmptyState'
import Select from '@/components/common/Select'
import Icon from '@/components/icons/Icon'
import AnnouncementTargetingEditor from '@/components/admin/announcements/AnnouncementTargetingEditor'
import AnnouncementReadStatusDialog from '@/components/admin/announcements/AnnouncementReadStatusDialog'
import type { Column } from '@/components/common/types'

function isAbortError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const { name, code } = error as { name?: string; code?: string }
  return name === 'AbortError' || name === 'CanceledError' || code === 'ERR_CANCELED'
}

export default function AdminAnnouncementsPage() {
  const { t } = useI18n()
  const appStore = useApp()

  const [announcements, setAnnouncements] = useState<Announcement[]>([])
  const [loading, setLoading] = useState(false)
  const [filters, setFilters] = useState({ status: '' })
  const [searchQuery, setSearchQuery] = useState('')
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

  const currentControllerRef = useRef<AbortController | null>(null)
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [showEditDialog, setShowEditDialog] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editingAnnouncement, setEditingAnnouncement] = useState<Announcement | null>(null)
  const [subscriptionGroups, setSubscriptionGroups] = useState<AdminGroup[]>([])

  const [form, setForm] = useState({
    title: '',
    content: '',
    status: 'draft' as AnnouncementStatus,
    notify_mode: 'silent' as AnnouncementNotifyMode,
    starts_at_str: '',
    ends_at_str: '',
    targeting: { any_of: [] } as AnnouncementTargeting,
  })

  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [deletingAnnouncement, setDeletingAnnouncement] = useState<Announcement | null>(null)

  const [showReadStatusDialog, setShowReadStatusDialog] = useState(false)
  const [readStatusAnnouncementId, setReadStatusAnnouncementId] = useState<number | null>(null)

  const isEditing = !!editingAnnouncement

  const statusFilterOptions = useMemo(
    () => [
      { value: '', label: t('admin.announcements.allStatus') },
      { value: 'draft', label: t('admin.announcements.statusLabels.draft') },
      { value: 'active', label: t('admin.announcements.statusLabels.active') },
      { value: 'archived', label: t('admin.announcements.statusLabels.archived') },
    ],
    [t],
  )

  const statusOptions = useMemo(
    () => [
      { value: 'draft', label: t('admin.announcements.statusLabels.draft') },
      { value: 'active', label: t('admin.announcements.statusLabels.active') },
      { value: 'archived', label: t('admin.announcements.statusLabels.archived') },
    ],
    [t],
  )

  const notifyModeOptions = useMemo(
    () => [
      { value: 'silent', label: t('admin.announcements.notifyModeLabels.silent') },
      { value: 'popup', label: t('admin.announcements.notifyModeLabels.popup') },
    ],
    [t],
  )

  const columns = useMemo<Column[]>(
    () => [
      { key: 'title', label: t('admin.announcements.columns.title'), sortable: true },
      { key: 'status', label: t('admin.announcements.columns.status'), sortable: true },
      { key: 'notify_mode', label: t('admin.announcements.columns.notifyMode'), sortable: true },
      { key: 'targeting', label: t('admin.announcements.columns.targeting') },
      { key: 'timeRange', label: t('admin.announcements.columns.timeRange') },
      { key: 'created_at', label: t('admin.announcements.columns.createdAt'), sortable: true },
      { key: 'actions', label: t('admin.announcements.columns.actions') },
    ],
    [t],
  )

  const statusLabel = useCallback(
    (status: string) => {
      if (status === 'draft') return t('admin.announcements.statusLabels.draft')
      if (status === 'active') return t('admin.announcements.statusLabels.active')
      if (status === 'archived') return t('admin.announcements.statusLabels.archived')
      return status
    },
    [t],
  )

  const targetingSummary = useCallback(
    (targeting: AnnouncementTargeting) => {
      const anyOf = targeting?.any_of ?? []
      if (!anyOf || anyOf.length === 0) return t('admin.announcements.targetingSummaryAll')
      return t('admin.announcements.targetingSummaryCustom', { groups: anyOf.length })
    },
    [t],
  )

  const loadAnnouncements = useCallback(async () => {
    currentControllerRef.current?.abort()
    const requestController = new AbortController()
    currentControllerRef.current = requestController
    const { signal } = requestController

    setLoading(true)
    try {
      const res = await adminAnnouncementsAPI.list(
        pagination.page,
        pagination.page_size,
        {
          status: filters.status || undefined,
          search: searchQuery || undefined,
          sort_by: sortState.sort_by,
          sort_order: sortState.sort_order,
        },
        { signal },
      )

      if (signal.aborted || currentControllerRef.current !== requestController) return

      setAnnouncements(res.items)
      setPagination((prev) => ({
        ...prev,
        total: res.total,
        pages: res.pages,
        page: res.page,
        page_size: res.page_size,
      }))
    } catch (error) {
      if (isAbortError(error) || currentControllerRef.current !== requestController) return
      console.error('Error loading announcements:', error)
      appStore.showError(extractApiErrorMessage(error, t('admin.announcements.failedToLoad')))
    } finally {
      if (currentControllerRef.current === requestController) {
        setLoading(false)
        currentControllerRef.current = null
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

  const loadSubscriptionGroups = useCallback(async () => {
    try {
      const all = await adminGroupsAPI.getAll()
      setSubscriptionGroups((all || []).filter((g) => g.subscription_type === 'subscription'))
    } catch (error) {
      console.error('Error loading groups:', error)
    }
  }, [])

  useEffect(() => {
    loadSubscriptionGroups()
  }, [loadSubscriptionGroups])

  useEffect(() => {
    loadAnnouncements()
  }, [loadAnnouncements])

  useEffect(() => {
    return () => {
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current)
      currentControllerRef.current?.abort()
    }
  }, [])

  const handleSearch = useCallback(() => {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current)
    searchDebounceRef.current = setTimeout(() => {
      setPagination((prev) => ({ ...prev, page: 1 }))
    }, 300)
  }, [])

  const resetForm = useCallback(() => {
    setForm({
      title: '',
      content: '',
      status: 'draft',
      notify_mode: 'silent',
      starts_at_str: '',
      ends_at_str: '',
      targeting: { any_of: [] },
    })
  }, [])

  const fillFormFromAnnouncement = useCallback((a: Announcement) => {
    setForm({
      title: a.title,
      content: a.content,
      status: a.status,
      notify_mode: a.notify_mode || 'silent',
      starts_at_str: a.starts_at
        ? formatDateTimeLocalInput(Math.floor(new Date(a.starts_at).getTime() / 1000))
        : '',
      ends_at_str: a.ends_at
        ? formatDateTimeLocalInput(Math.floor(new Date(a.ends_at).getTime() / 1000))
        : '',
      targeting: a.targeting ?? { any_of: [] },
    })
  }, [])

  const openCreateDialog = useCallback(() => {
    setEditingAnnouncement(null)
    resetForm()
    setShowEditDialog(true)
  }, [resetForm])

  const openEditDialog = useCallback(
    (row: Announcement) => {
      setEditingAnnouncement(row)
      fillFormFromAnnouncement(row)
      setShowEditDialog(true)
    },
    [fillFormFromAnnouncement],
  )

  const closeEdit = useCallback(() => {
    setShowEditDialog(false)
    setEditingAnnouncement(null)
  }, [])

  const buildCreatePayload = useCallback(() => {
    const startsAt = parseDateTimeLocalInput(form.starts_at_str)
    const endsAt = parseDateTimeLocalInput(form.ends_at_str)

    return {
      title: form.title,
      content: form.content,
      status: form.status,
      notify_mode: form.notify_mode,
      targeting: form.targeting,
      starts_at: startsAt ?? undefined,
      ends_at: endsAt ?? undefined,
    }
  }, [form])

  const buildUpdatePayload = useCallback(
    (original: Announcement) => {
      const payload: Record<string, unknown> = {}

      if (form.title !== original.title) payload.title = form.title
      if (form.content !== original.content) payload.content = form.content
      if (form.status !== original.status) payload.status = form.status
      if (form.notify_mode !== (original.notify_mode || 'silent')) {
        payload.notify_mode = form.notify_mode
      }

      const originalStarts = original.starts_at
        ? Math.floor(new Date(original.starts_at).getTime() / 1000)
        : null
      const originalEnds = original.ends_at
        ? Math.floor(new Date(original.ends_at).getTime() / 1000)
        : null

      const newStarts = parseDateTimeLocalInput(form.starts_at_str)
      const newEnds = parseDateTimeLocalInput(form.ends_at_str)

      if (newStarts !== originalStarts) {
        payload.starts_at = newStarts === null ? 0 : newStarts
      }
      if (newEnds !== originalEnds) {
        payload.ends_at = newEnds === null ? 0 : newEnds
      }

      if (JSON.stringify(form.targeting ?? {}) !== JSON.stringify(original.targeting ?? {})) {
        payload.targeting = form.targeting
      }

      return payload
    },
    [form],
  )

  const handleSave = useCallback(
    async (event: FormEvent) => {
      event.preventDefault()

      const anyOf = form.targeting?.any_of ?? []
      if (anyOf.length > 50) {
        appStore.showError(t('admin.announcements.failedToCreate'))
        return
      }
      for (const g of anyOf) {
        const allOf = g?.all_of ?? []
        if (allOf.length > 50) {
          appStore.showError(t('admin.announcements.failedToCreate'))
          return
        }
      }

      setSaving(true)
      try {
        if (!editingAnnouncement) {
          await adminAnnouncementsAPI.create(buildCreatePayload())
          appStore.showSuccess(t('common.success'))
          setShowEditDialog(false)
          await loadAnnouncements()
          return
        }

        const payload = buildUpdatePayload(editingAnnouncement)
        await adminAnnouncementsAPI.update(editingAnnouncement.id, payload)
        appStore.showSuccess(t('common.success'))
        setShowEditDialog(false)
        setEditingAnnouncement(null)
        await loadAnnouncements()
      } catch (error) {
        console.error('Failed to save announcement:', error)
        appStore.showError(
          extractApiErrorMessage(
            error,
            editingAnnouncement
              ? t('admin.announcements.failedToUpdate')
              : t('admin.announcements.failedToCreate'),
          ),
        )
      } finally {
        setSaving(false)
      }
    },
    [
      appStore,
      buildCreatePayload,
      buildUpdatePayload,
      editingAnnouncement,
      form.targeting,
      loadAnnouncements,
      t,
    ],
  )

  const handleDelete = useCallback((row: Announcement) => {
    setDeletingAnnouncement(row)
    setShowDeleteDialog(true)
  }, [])

  const confirmDelete = useCallback(async () => {
    if (!deletingAnnouncement) return

    try {
      await adminAnnouncementsAPI.delete(deletingAnnouncement.id)
      appStore.showSuccess(t('common.success'))
      setShowDeleteDialog(false)
      setDeletingAnnouncement(null)
      await loadAnnouncements()
    } catch (error) {
      console.error('Failed to delete announcement:', error)
      appStore.showError(extractApiErrorMessage(error, t('admin.announcements.failedToDelete')))
    }
  }, [appStore, deletingAnnouncement, loadAnnouncements, t])

  const openReadStatus = useCallback((row: Announcement) => {
    setReadStatusAnnouncementId(row.id)
    setShowReadStatusDialog(true)
  }, [])

  const tableCells = useMemo(
    () => ({
      title: ({ value, row }: DataTableCellContext) => (
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="truncate font-medium text-gray-900 dark:text-white">{value}</span>
          </div>
          <div className="mt-1 flex items-center gap-2 text-xs text-gray-500 dark:text-dark-400">
            <span>#{row.id}</span>
            <span className="text-gray-300 dark:text-dark-700">·</span>
            <span>{formatDateTime(row.created_at)}</span>
          </div>
        </div>
      ),
      status: ({ value }: DataTableCellContext) => (
        <span
          className={`badge ${
            value === 'active'
              ? 'badge-success'
              : value === 'draft'
                ? 'badge-gray'
                : 'badge-warning'
          }`}
        >
          {statusLabel(value)}
        </span>
      ),
      notify_mode: ({ row }: DataTableCellContext) => (
        <span
          className={`badge ${row.notify_mode === 'popup' ? 'badge-warning' : 'badge-gray'}`}
        >
          {row.notify_mode === 'popup'
            ? t('admin.announcements.notifyModeLabels.popup')
            : t('admin.announcements.notifyModeLabels.silent')}
        </span>
      ),
      targeting: ({ row }: DataTableCellContext) => (
        <span className="text-sm text-gray-600 dark:text-gray-300">
          {targetingSummary(row.targeting as AnnouncementTargeting)}
        </span>
      ),
      timeRange: ({ row }: DataTableCellContext) => (
        <div className="text-sm text-gray-600 dark:text-gray-300">
          <div>
            <span className="font-medium">{t('admin.announcements.form.startsAt')}:</span>
            <span className="ml-1">
              {row.starts_at
                ? formatDateTime(row.starts_at)
                : t('admin.announcements.timeImmediate')}
            </span>
          </div>
          <div className="mt-0.5">
            <span className="font-medium">{t('admin.announcements.form.endsAt')}:</span>
            <span className="ml-1">
              {row.ends_at ? formatDateTime(row.ends_at) : t('admin.announcements.timeNever')}
            </span>
          </div>
        </div>
      ),
      created_at: ({ value }: DataTableCellContext) => (
        <span className="text-sm text-gray-500 dark:text-dark-400">{formatDateTime(value)}</span>
      ),
      actions: ({ row }: DataTableCellContext) => (
        <div className="flex items-center space-x-1">
          <button
            type="button"
            onClick={() => openReadStatus(row as Announcement)}
            className="flex flex-col items-center gap-0.5 rounded-lg p-1.5 text-gray-500 transition-colors hover:bg-blue-50 hover:text-blue-600 dark:hover:bg-blue-900/20 dark:hover:text-blue-400"
            title={t('admin.announcements.readStatus')}
          >
            <Icon name="eye" size="sm" />
          </button>
          <button
            type="button"
            onClick={() => openEditDialog(row as Announcement)}
            className="flex flex-col items-center gap-0.5 rounded-lg p-1.5 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-dark-600 dark:hover:text-gray-300"
            title={t('common.edit')}
          >
            <Icon name="edit" size="sm" />
          </button>
          <button
            type="button"
            onClick={() => handleDelete(row as Announcement)}
            className="flex flex-col items-center gap-0.5 rounded-lg p-1.5 text-gray-500 transition-colors hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20 dark:hover:text-red-400"
            title={t('common.delete')}
          >
            <Icon name="trash" size="sm" />
          </button>
        </div>
      ),
    }),
    [handleDelete, openEditDialog, openReadStatus, statusLabel, t, targetingSummary],
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
                placeholder={t('admin.announcements.searchAnnouncements')}
                className="input"
              />
            </div>
            <Select
              modelValue={filters.status}
              options={statusFilterOptions}
              className="w-40"
              onUpdateModelValue={(value) => {
                setFilters({ status: String(value ?? '') })
                setPagination((prev) => ({ ...prev, page: 1 }))
              }}
            />

            <div className="flex flex-1 flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => loadAnnouncements()}
                disabled={loading}
                className="btn btn-secondary"
                title={t('common.refresh')}
              >
                <Icon name="refresh" size="md" className={loading ? 'animate-spin' : ''} />
              </button>
              <button type="button" onClick={openCreateDialog} className="btn btn-primary">
                <Icon name="plus" size="md" className="mr-1" />
                {t('admin.announcements.createAnnouncement')}
              </button>
            </div>
          </div>
        }
        table={
          <DataTable
            columns={columns}
            data={announcements}
            loading={loading}
            serverSideSort
            defaultSortKey="created_at"
            defaultSortOrder="desc"
            onSort={(key, order) => {
              setSortState({ sort_by: key, sort_order: order })
              setPagination((prev) => ({ ...prev, page: 1 }))
            }}
            cells={tableCells}
            emptySlot={
              <EmptyState
                title={t('empty.noData')}
                description={t('admin.announcements.failedToLoad')}
                actionText={t('admin.announcements.createAnnouncement')}
                onAction={openCreateDialog}
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
              onUpdatePage={(page) => setPagination((prev) => ({ ...prev, page }))}
              onUpdatePageSize={(pageSize) =>
                setPagination((prev) => ({ ...prev, page_size: pageSize, page: 1 }))
              }
            />
          ) : null
        }
      />

      <BaseDialog
        show={showEditDialog}
        title={
          isEditing
            ? t('admin.announcements.editAnnouncement')
            : t('admin.announcements.createAnnouncement')
        }
        width="wide"
        onClose={closeEdit}
        footer={
          <div className="flex justify-end gap-3">
            <button type="button" onClick={closeEdit} className="btn btn-secondary">
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              form="announcement-form"
              disabled={saving}
              className="btn btn-primary"
            >
              {saving ? t('common.saving') : t('common.save')}
            </button>
          </div>
        }
      >
        <form id="announcement-form" onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="input-label">{t('admin.announcements.form.title')}</label>
            <input
              value={form.title}
              onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
              type="text"
              className="input"
              required
            />
          </div>

          <div>
            <label className="input-label">{t('admin.announcements.form.content')}</label>
            <textarea
              value={form.content}
              onChange={(event) => setForm((prev) => ({ ...prev, content: event.target.value }))}
              rows={6}
              className="input"
              required
            />
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className="input-label">{t('admin.announcements.form.status')}</label>
              <Select
                modelValue={form.status}
                options={statusOptions}
                onUpdateModelValue={(value) =>
                  setForm((prev) => ({ ...prev, status: value as AnnouncementStatus }))
                }
              />
            </div>
            <div>
              <label className="input-label">{t('admin.announcements.form.notifyMode')}</label>
              <Select
                modelValue={form.notify_mode}
                options={notifyModeOptions}
                onUpdateModelValue={(value) =>
                  setForm((prev) => ({ ...prev, notify_mode: value as AnnouncementNotifyMode }))
                }
              />
              <p className="input-hint">{t('admin.announcements.form.notifyModeHint')}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className="input-label">{t('admin.announcements.form.startsAt')}</label>
              <input
                value={form.starts_at_str}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, starts_at_str: event.target.value }))
                }
                type="datetime-local"
                className="input"
              />
              <p className="input-hint">{t('admin.announcements.form.startsAtHint')}</p>
            </div>
            <div>
              <label className="input-label">{t('admin.announcements.form.endsAt')}</label>
              <input
                value={form.ends_at_str}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, ends_at_str: event.target.value }))
                }
                type="datetime-local"
                className="input"
              />
              <p className="input-hint">{t('admin.announcements.form.endsAtHint')}</p>
            </div>
          </div>

          <AnnouncementTargetingEditor
            modelValue={form.targeting}
            groups={subscriptionGroups}
            onUpdateModelValue={(targeting) => setForm((prev) => ({ ...prev, targeting }))}
          />
        </form>
      </BaseDialog>

      <ConfirmDialog
        show={showDeleteDialog}
        title={t('admin.announcements.deleteAnnouncement')}
        message={t('admin.announcements.deleteConfirm')}
        confirmText={t('common.delete')}
        cancelText={t('common.cancel')}
        danger
        onConfirm={confirmDelete}
        onCancel={() => setShowDeleteDialog(false)}
      />

      <AnnouncementReadStatusDialog
        show={showReadStatusDialog}
        announcementId={readStatusAnnouncementId}
        onClose={() => setShowReadStatusDialog(false)}
      />
    </AppLayout>
  )
}
