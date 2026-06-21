'use client'

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useI18n } from '@/lib/i18n'
import { useApp } from '@/context/AppContext'
import { extractApiErrorMessage } from '@/lib/apiError'
import {
  adminChannelMonitorAPI,
  type ChannelMonitor,
  type CheckResult,
  type ListParams,
  type Provider,
} from '@/lib/adminChannelMonitor'
import { getPersistedPageSize, setPersistedPageSize } from '@/lib/usePersistedPageSize'
import { useChannelMonitorFormat } from '@/lib/useChannelMonitorFormat'
import AppLayout from '@/components/layout/AppLayout'
import TablePageLayout from '@/components/layout/TablePageLayout'
import DataTable, { type DataTableCellContext } from '@/components/common/DataTable'
import Pagination from '@/components/common/Pagination'
import ConfirmDialog from '@/components/common/ConfirmDialog'
import EmptyState from '@/components/common/EmptyState'
import HelpTooltip from '@/components/common/HelpTooltip'
import Icon from '@/components/icons/Icon'
import Toggle from '@/components/common/Toggle'
import MonitorFiltersBar from '@/components/admin/monitor/MonitorFiltersBar'
import MonitorFormDialog from '@/components/admin/monitor/MonitorFormDialog'
import MonitorTemplateManagerDialog from '@/components/admin/monitor/MonitorTemplateManagerDialog'
import MonitorRunResultDialog from '@/components/admin/monitor/MonitorRunResultDialog'
import MonitorPrimaryModelCell from '@/components/admin/monitor/MonitorPrimaryModelCell'
import MonitorActionsCell from '@/components/admin/monitor/MonitorActionsCell'
import type { Column } from '@/components/common/types'

function isAbortError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const { name, code } = error as { name?: string; code?: string }
  return name === 'AbortError' || name === 'CanceledError' || code === 'ERR_CANCELED'
}

export default function ChannelMonitorPage() {
  const { t } = useI18n()
  const appStore = useApp()
  const { providerLabel, providerBadgeClass, formatLatency, formatAvailability } =
    useChannelMonitorFormat()

  const [monitors, setMonitors] = useState<ChannelMonitor[]>([])
  const [loading, setLoading] = useState(false)
  const [runningId, setRunningId] = useState<number | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [providerFilter, setProviderFilter] = useState<Provider | ''>('')
  const [enabledFilter, setEnabledFilter] = useState<'' | 'true' | 'false'>('')
  const [pagination, setPagination] = useState({
    page: 1,
    page_size: getPersistedPageSize(),
    total: 0,
  })

  const [showDialog, setShowDialog] = useState(false)
  const [showTemplateManager, setShowTemplateManager] = useState(false)
  const [editing, setEditing] = useState<ChannelMonitor | null>(null)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [deleting, setDeleting] = useState<ChannelMonitor | null>(null)
  const [showRunResult, setShowRunResult] = useState(false)
  const [runResults, setRunResults] = useState<CheckResult[]>([])

  const abortControllerRef = useRef<AbortController | null>(null)
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const searchQueryRef = useRef(searchQuery)
  searchQueryRef.current = searchQuery

  const columns = useMemo<Column[]>(
    () => [
      { key: 'name', label: t('admin.channelMonitor.columns.name'), sortable: false },
      { key: 'provider', label: t('admin.channelMonitor.columns.provider'), sortable: false },
      {
        key: 'primary_model',
        label: t('admin.channelMonitor.columns.primaryModel'),
        sortable: false,
      },
      {
        key: 'availability_7d',
        label: t('admin.channelMonitor.columns.availability7d'),
        sortable: false,
      },
      { key: 'latency', label: t('admin.channelMonitor.columns.latency'), sortable: false },
      { key: 'enabled', label: t('admin.channelMonitor.columns.enabled'), sortable: false },
      { key: 'actions', label: t('admin.channelMonitor.columns.actions'), sortable: false },
    ],
    [t],
  )

  const deleteConfirmMessage = deleting
    ? t('admin.channelMonitor.deleteConfirm', { name: deleting.name })
    : ''

  const reload = useCallback(async () => {
    if (abortControllerRef.current) abortControllerRef.current.abort()
    const ctrl = new AbortController()
    abortControllerRef.current = ctrl
    setLoading(true)
    try {
      const params: ListParams = {
        page: pagination.page,
        page_size: pagination.page_size,
      }
      if (providerFilter) params.provider = providerFilter
      if (enabledFilter === 'true') params.enabled = true
      if (enabledFilter === 'false') params.enabled = false
      if (debouncedSearch) params.search = debouncedSearch

      const res = await adminChannelMonitorAPI.list(params, { signal: ctrl.signal })
      if (ctrl.signal.aborted || abortControllerRef.current !== ctrl) return
      setMonitors(res.items || [])
      setPagination((prev) => ({ ...prev, total: res.total }))
    } catch (error) {
      if (isAbortError(error)) return
      appStore.showError(extractApiErrorMessage(error, t('admin.channelMonitor.loadError')))
    } finally {
      if (abortControllerRef.current === ctrl) {
        setLoading(false)
        abortControllerRef.current = null
      }
    }
  }, [
    pagination.page,
    pagination.page_size,
    providerFilter,
    enabledFilter,
    debouncedSearch,
    appStore,
    t,
  ])

  useEffect(() => {
    void reload()
  }, [reload])

  useEffect(() => {
    return () => {
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current)
      abortControllerRef.current?.abort()
    }
  }, [])

  const handleSearch = () => {
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current)
    searchTimeoutRef.current = setTimeout(() => {
      setDebouncedSearch(searchQueryRef.current.trim())
      setPagination((prev) => ({ ...prev, page: 1 }))
    }, 300)
  }

  const onPageChange = (page: number) => {
    setPagination((prev) => ({ ...prev, page }))
  }

  const onPageSizeChange = (pageSize: number) => {
    setPersistedPageSize(pageSize)
    setPagination((prev) => ({ ...prev, page_size: pageSize, page: 1 }))
  }

  const openCreateDialog = useCallback(() => {
    setEditing(null)
    setShowDialog(true)
  }, [])

  const openEditDialog = useCallback((row: ChannelMonitor) => {
    setEditing(row)
    setShowDialog(true)
  }, [])

  const closeDialog = useCallback(() => {
    setShowDialog(false)
    setEditing(null)
  }, [])

  const toggleEnabled = useCallback(async (row: ChannelMonitor) => {
    const next = !row.enabled
    try {
      await adminChannelMonitorAPI.update(row.id, { enabled: next })
      setMonitors((prev) =>
        prev.map((item) => (item.id === row.id ? { ...item, enabled: next } : item)),
      )
    } catch (error) {
      appStore.showError(extractApiErrorMessage(error, t('common.error')))
    }
  }, [appStore, t])

  const handleRunNow = useCallback(async (row: ChannelMonitor) => {
    if (runningId != null) return
    setRunningId(row.id)
    try {
      const res = await adminChannelMonitorAPI.runNow(row.id)
      setRunResults(res.results || [])
      setShowRunResult(true)
      appStore.showSuccess(t('admin.channelMonitor.runSuccess'))
      void reload()
    } catch (error) {
      appStore.showError(extractApiErrorMessage(error, t('admin.channelMonitor.runFailed')))
    } finally {
      setRunningId(null)
    }
  }, [runningId, appStore, t, reload])

  const handleDelete = useCallback((row: ChannelMonitor) => {
    setDeleting(row)
    setShowDeleteDialog(true)
  }, [])

  const confirmDelete = async () => {
    if (!deleting) return
    try {
      await adminChannelMonitorAPI.del(deleting.id)
      appStore.showSuccess(t('admin.channelMonitor.deleteSuccess'))
      setShowDeleteDialog(false)
      setDeleting(null)
      void reload()
    } catch (error) {
      appStore.showError(extractApiErrorMessage(error, t('common.error')))
    }
  }

  const tableCells = useMemo(
    () => ({
      name: ({ row, value }: DataTableCellContext) => (
        <div className="flex items-center gap-1.5">
          <span className="font-medium text-gray-900 dark:text-white">{value}</span>
          {row.api_key_decrypt_failed ? (
            <HelpTooltip
              content={t('admin.channelMonitor.apiKeyDecryptFailed')}
              triggerContent={<Icon name="exclamationTriangle" size="sm" className="text-red-500" />}
            />
          ) : null}
        </div>
      ),
      provider: ({ row }: DataTableCellContext) => (
        <span
          className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${providerBadgeClass(row.provider)}`}
        >
          {providerLabel(row.provider)}
        </span>
      ),
      primary_model: ({ row }: DataTableCellContext) => <MonitorPrimaryModelCell row={row} />,
      availability_7d: ({ row }: DataTableCellContext) => (
        <span className="text-sm text-gray-900 dark:text-gray-100">{formatAvailability(row)}</span>
      ),
      latency: ({ row }: DataTableCellContext) => (
        <span className="text-sm text-gray-900 dark:text-gray-100">
          {formatLatency(row.primary_latency_ms)}
        </span>
      ),
      enabled: ({ row }: DataTableCellContext) => (
        <Toggle modelValue={row.enabled} onUpdateModelValue={() => toggleEnabled(row)} />
      ),
      actions: ({ row }: DataTableCellContext) => (
        <MonitorActionsCell
          row={row}
          running={runningId === row.id}
          onRun={handleRunNow}
          onEdit={openEditDialog}
          onDelete={handleDelete}
        />
      ),
    }),
    [
      t,
      providerBadgeClass,
      providerLabel,
      formatAvailability,
      formatLatency,
      runningId,
      toggleEnabled,
      handleRunNow,
      openEditDialog,
      handleDelete,
    ],
  )

  return (
    <AppLayout>
      <TablePageLayout
        filters={
          <MonitorFiltersBar
            loading={loading}
            search={searchQuery}
            provider={providerFilter}
            enabled={enabledFilter}
            onSearchChange={setSearchQuery}
            onProviderChange={setProviderFilter}
            onEnabledChange={setEnabledFilter}
            onReload={reload}
            onCreate={openCreateDialog}
            onManageTemplates={() => setShowTemplateManager(true)}
            onSearchInput={handleSearch}
          />
        }
        table={
          <DataTable
            columns={columns}
            data={monitors}
            loading={loading}
            cells={tableCells}
            emptySlot={
              <EmptyState
                title={t('admin.channelMonitor.noMonitorsYet')}
                description={t('admin.channelMonitor.createFirstMonitor')}
                actionText={t('admin.channelMonitor.createButton')}
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
              onUpdatePage={onPageChange}
              onUpdatePageSize={onPageSizeChange}
            />
          ) : null
        }
      />

      <MonitorFormDialog
        show={showDialog}
        monitor={editing}
        onClose={closeDialog}
        onSaved={reload}
      />

      <MonitorTemplateManagerDialog
        show={showTemplateManager}
        onClose={() => setShowTemplateManager(false)}
        onUpdated={reload}
      />

      <MonitorRunResultDialog
        show={showRunResult}
        results={runResults}
        onClose={() => setShowRunResult(false)}
      />

      <ConfirmDialog
        show={showDeleteDialog}
        title={t('common.delete')}
        message={deleteConfirmMessage}
        confirmText={t('common.delete')}
        cancelText={t('common.cancel')}
        danger
        onConfirm={confirmDelete}
        onCancel={() => setShowDeleteDialog(false)}
      />
    </AppLayout>
  )
}
