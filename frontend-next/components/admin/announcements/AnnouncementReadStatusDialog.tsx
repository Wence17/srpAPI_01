'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useI18n } from '@/lib/i18n'
import { useApp } from '@/context/AppContext'
import { getPersistedPageSize } from '@/lib/usePersistedPageSize'
import { extractApiErrorMessage } from '@/lib/apiError'
import { formatDateTime } from '@/lib/format'
import {
  adminAnnouncementsAPI,
  type AnnouncementUserReadStatus,
} from '@/lib/adminAnnouncements'
import BaseDialog from '@/components/common/BaseDialog'
import DataTable, { type DataTableCellContext } from '@/components/common/DataTable'
import Pagination from '@/components/common/Pagination'
import Icon from '@/components/icons/Icon'
import type { Column } from '@/components/common/types'

interface AnnouncementReadStatusDialogProps {
  show: boolean
  announcementId: number | null
  onClose: () => void
}

function isAbortError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const { name, code } = error as { name?: string; code?: string }
  return name === 'AbortError' || name === 'CanceledError' || code === 'ERR_CANCELED'
}

export default function AnnouncementReadStatusDialog({
  show,
  announcementId,
  onClose,
}: AnnouncementReadStatusDialogProps) {
  const { t } = useI18n()
  const appStore = useApp()

  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [items, setItems] = useState<AnnouncementUserReadStatus[]>([])
  const [pagination, setPagination] = useState({
    page: 1,
    page_size: getPersistedPageSize(),
    total: 0,
    pages: 0,
  })
  const [sortState, setSortState] = useState({
    sort_by: 'email',
    sort_order: 'asc' as 'asc' | 'desc',
  })

  const currentControllerRef = useRef<AbortController | null>(null)
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const columns = useMemo<Column[]>(
    () => [
      { key: 'email', label: t('common.email'), sortable: true },
      { key: 'username', label: t('admin.users.columns.username'), sortable: true },
      { key: 'balance', label: t('common.balance'), sortable: true },
      { key: 'eligible', label: t('admin.announcements.eligible') },
      { key: 'read_at', label: t('admin.announcements.readAt') },
    ],
    [t],
  )

  const resetDialogState = useCallback(() => {
    setLoading(false)
    setSearch('')
    setItems([])
    setPagination((prev) => ({ ...prev, page: 1, total: 0, pages: 0 }))
    setSortState({ sort_by: 'email', sort_order: 'asc' })
  }, [])

  const cancelPendingLoad = useCallback(
    (resetState = false) => {
      if (searchDebounceRef.current) {
        clearTimeout(searchDebounceRef.current)
        searchDebounceRef.current = null
      }
      currentControllerRef.current?.abort()
      currentControllerRef.current = null
      if (resetState) resetDialogState()
    },
    [resetDialogState],
  )

  const load = useCallback(async () => {
    if (!show || !announcementId) return

    currentControllerRef.current?.abort()
    const requestController = new AbortController()
    currentControllerRef.current = requestController
    const { signal } = requestController

    setLoading(true)
    try {
      const res = await adminAnnouncementsAPI.getReadStatus(
        announcementId,
        pagination.page,
        pagination.page_size,
        {
          search: search || undefined,
          sort_by: sortState.sort_by,
          sort_order: sortState.sort_order,
        },
        { signal },
      )

      if (signal.aborted || currentControllerRef.current !== requestController) return

      setItems(res.items)
      setPagination((prev) => ({
        ...prev,
        total: res.total,
        pages: res.pages,
        page: res.page,
        page_size: res.page_size,
      }))
    } catch (error) {
      if (isAbortError(error) || currentControllerRef.current !== requestController) return
      console.error('Failed to load read status:', error)
      appStore.showError(
        extractApiErrorMessage(error, t('admin.announcements.failedToLoadReadStatus')),
      )
    } finally {
      if (currentControllerRef.current === requestController) {
        setLoading(false)
        currentControllerRef.current = null
      }
    }
  }, [
    announcementId,
    appStore,
    pagination.page,
    pagination.page_size,
    search,
    show,
    sortState.sort_by,
    sortState.sort_order,
    t,
  ])

  useEffect(() => {
    if (!show) {
      cancelPendingLoad(true)
      return
    }
    load()
  }, [show, announcementId, pagination.page, pagination.page_size, sortState, load, cancelPendingLoad])

  const handleSearch = useCallback(() => {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current)
    searchDebounceRef.current = setTimeout(() => {
      setPagination((prev) => ({ ...prev, page: 1 }))
    }, 300)
  }, [])

  const handleClose = useCallback(() => {
    cancelPendingLoad(true)
    onClose()
  }, [cancelPendingLoad, onClose])

  const tableCells = useMemo(
    () => ({
      email: ({ value }: DataTableCellContext) => (
        <span className="font-medium text-gray-900 dark:text-white">{value}</span>
      ),
      balance: ({ value }: DataTableCellContext) => (
        <span className="font-medium text-gray-900 dark:text-white">
          ${Number(value ?? 0).toFixed(2)}
        </span>
      ),
      eligible: ({ value }: DataTableCellContext) => (
        <span className={`badge ${value ? 'badge-success' : 'badge-gray'}`}>
          {value ? t('admin.announcements.eligible') : t('common.no')}
        </span>
      ),
      read_at: ({ value }: DataTableCellContext) => (
        <span className="text-sm text-gray-500 dark:text-dark-400">
          {value ? formatDateTime(value) : t('admin.announcements.unread')}
        </span>
      ),
    }),
    [t],
  )

  return (
    <BaseDialog
      show={show}
      title={t('admin.announcements.readStatus')}
      width="extra-wide"
      onClose={handleClose}
      footer={
        <div className="flex justify-end">
          <button type="button" className="btn btn-secondary" onClick={handleClose}>
            {t('common.close')}
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex-1">
            <input
              value={search}
              onChange={(event) => {
                setSearch(event.target.value)
                handleSearch()
              }}
              type="text"
              className="input"
              placeholder={t('admin.announcements.searchUsers')}
            />
          </div>
          <button
            type="button"
            onClick={() => load()}
            disabled={loading}
            className="btn btn-secondary"
            title={t('common.refresh')}
          >
            <Icon name="refresh" size="md" className={loading ? 'animate-spin' : ''} />
          </button>
        </div>

        <DataTable
          columns={columns}
          data={items}
          loading={loading}
          serverSideSort
          defaultSortKey="email"
          defaultSortOrder="asc"
          onSort={(key, order) => {
            setSortState({ sort_by: key, sort_order: order })
            setPagination((prev) => ({ ...prev, page: 1 }))
          }}
          cells={tableCells}
        />

        {pagination.total > 0 ? (
          <Pagination
            page={pagination.page}
            total={pagination.total}
            pageSize={pagination.page_size}
            onUpdatePage={(page) => setPagination((prev) => ({ ...prev, page }))}
            onUpdatePageSize={(pageSize) =>
              setPagination((prev) => ({ ...prev, page_size: pageSize, page: 1 }))
            }
          />
        ) : null}
      </div>
    </BaseDialog>
  )
}
