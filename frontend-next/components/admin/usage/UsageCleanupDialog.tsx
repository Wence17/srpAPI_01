'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useI18n } from '@/lib/i18n'
import { useApp } from '@/context/AppContext'
import BaseDialog from '@/components/common/BaseDialog'
import ConfirmDialog from '@/components/common/ConfirmDialog'
import Pagination from '@/components/common/Pagination'
import UsageFilters from '@/components/admin/usage/UsageFilters'
import {
  adminUsageAPI,
  type AdminUsageQueryParams,
  type CreateUsageCleanupTaskRequest,
} from '@/lib/adminUsage'
import type { UsageCleanupTask } from '@/lib/types'
import { requestTypeToLegacyStream } from '@/lib/usageRequestType'

interface UsageCleanupDialogProps {
  show: boolean
  filters: AdminUsageQueryParams
  startDate: string
  endDate: string
  onClose: () => void
}

function formatDateTimeValue(value?: string | null): string {
  if (!value) return '--'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString()
}

function formatRange(task: UsageCleanupTask): string {
  return `${formatDateTimeValue(task.filters.start_time)} ~ ${formatDateTimeValue(task.filters.end_time)}`
}

function getUserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone
  } catch {
    return 'UTC'
  }
}

export default function UsageCleanupDialog({
  show,
  filters,
  startDate,
  endDate,
  onClose,
}: UsageCleanupDialogProps) {
  const { t } = useI18n()
  const appStore = useApp()

  const [localFilters, setLocalFilters] = useState<AdminUsageQueryParams>({})
  const [localStartDate, setLocalStartDate] = useState('')
  const [localEndDate, setLocalEndDate] = useState('')
  const [tasks, setTasks] = useState<UsageCleanupTask[]>([])
  const [tasksLoading, setTasksLoading] = useState(false)
  const [tasksPage, setTasksPage] = useState(1)
  const [tasksPageSize, setTasksPageSize] = useState(5)
  const [tasksTotal, setTasksTotal] = useState(0)
  const [submitting, setSubmitting] = useState(false)
  const [confirmVisible, setConfirmVisible] = useState(false)
  const [cancelConfirmVisible, setCancelConfirmVisible] = useState(false)
  const [cancelTarget, setCancelTarget] = useState<UsageCleanupTask | null>(null)
  const pollTimerRef = useRef<number | null>(null)

  const resetFilters = useCallback(() => {
    setLocalFilters({ ...filters, start_date: startDate, end_date: endDate })
    setLocalStartDate(startDate)
    setLocalEndDate(endDate)
    setTasksPage(1)
    setTasksTotal(0)
  }, [filters, startDate, endDate])

  const stopPolling = useCallback(() => {
    if (pollTimerRef.current !== null) {
      window.clearInterval(pollTimerRef.current)
      pollTimerRef.current = null
    }
  }, [])

  const loadTasks = useCallback(async () => {
    if (!show) return
    setTasksLoading(true)
    try {
      const res = await adminUsageAPI.listCleanupTasks({
        page: tasksPage,
        page_size: tasksPageSize,
      })
      setTasks(res.items || [])
      setTasksTotal(res.total || 0)
      if (res.page) setTasksPage(res.page)
      if (res.page_size) setTasksPageSize(res.page_size)
    } catch (error) {
      console.error('Failed to load cleanup tasks:', error)
      appStore.showError(t('admin.usage.cleanup.loadFailed'))
    } finally {
      setTasksLoading(false)
    }
  }, [show, tasksPage, tasksPageSize, appStore, t])

  const startPolling = useCallback(() => {
    stopPolling()
    pollTimerRef.current = window.setInterval(() => {
      void loadTasks()
    }, 10000)
  }, [loadTasks, stopPolling])

  useEffect(() => {
    if (show) {
      resetFilters()
      void loadTasks()
      startPolling()
    } else {
      stopPolling()
    }
    return stopPolling
  }, [show, resetFilters, loadTasks, startPolling, stopPolling])

  const statusLabel = (status: string) => {
    const map: Record<string, string> = {
      pending: t('admin.usage.cleanup.status.pending'),
      running: t('admin.usage.cleanup.status.running'),
      succeeded: t('admin.usage.cleanup.status.succeeded'),
      failed: t('admin.usage.cleanup.status.failed'),
      canceled: t('admin.usage.cleanup.status.canceled'),
    }
    return map[status] || status
  }

  const statusClass = (status: string) => {
    const map: Record<string, string> = {
      pending: 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-200',
      running: 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-200',
      succeeded: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-200',
      failed: 'bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-200',
      canceled: 'bg-gray-200 text-gray-600 dark:bg-dark-600 dark:text-gray-300',
    }
    return map[status] || 'bg-gray-100 text-gray-600'
  }

  const canCancel = (task: UsageCleanupTask) => task.status === 'pending' || task.status === 'running'

  const buildPayload = (): CreateUsageCleanupTaskRequest | null => {
    if (!localStartDate || !localEndDate) {
      appStore.showError(t('admin.usage.cleanup.missingRange'))
      return null
    }

    const payload: CreateUsageCleanupTaskRequest = {
      start_date: localStartDate,
      end_date: localEndDate,
      timezone: getUserTimezone(),
    }

    if (localFilters.user_id && localFilters.user_id > 0) payload.user_id = localFilters.user_id
    if (localFilters.api_key_id && localFilters.api_key_id > 0) payload.api_key_id = localFilters.api_key_id
    if (localFilters.account_id && localFilters.account_id > 0) payload.account_id = localFilters.account_id
    if (localFilters.group_id && localFilters.group_id > 0) payload.group_id = localFilters.group_id
    if (localFilters.model) payload.model = localFilters.model

    if (localFilters.request_type) {
      payload.request_type = localFilters.request_type
      const legacyStream = requestTypeToLegacyStream(localFilters.request_type)
      if (legacyStream !== null && legacyStream !== undefined) payload.stream = legacyStream
    } else if (localFilters.stream !== null && localFilters.stream !== undefined) {
      payload.stream = localFilters.stream
    }

    if (localFilters.billing_type !== null && localFilters.billing_type !== undefined) {
      payload.billing_type = localFilters.billing_type
    }

    return payload
  }

  const submitCleanup = async () => {
    const payload = buildPayload()
    if (!payload) {
      setConfirmVisible(false)
      return
    }
    setSubmitting(true)
    setConfirmVisible(false)
    try {
      await adminUsageAPI.createCleanupTask(payload)
      appStore.showSuccess(t('admin.usage.cleanup.submitSuccess'))
      void loadTasks()
    } catch (error) {
      console.error('Failed to create cleanup task:', error)
      appStore.showError(t('admin.usage.cleanup.submitFailed'))
    } finally {
      setSubmitting(false)
    }
  }

  const cancelTask = async () => {
    const task = cancelTarget
    if (!task) {
      setCancelConfirmVisible(false)
      return
    }
    setCancelConfirmVisible(false)
    try {
      await adminUsageAPI.cancelCleanupTask(task.id)
      appStore.showSuccess(t('admin.usage.cleanup.cancelSuccess'))
      void loadTasks()
    } catch (error) {
      console.error('Failed to cancel cleanup task:', error)
      appStore.showError(t('admin.usage.cleanup.cancelFailed'))
    } finally {
      setCancelTarget(null)
    }
  }

  const handleClose = () => {
    stopPolling()
    setConfirmVisible(false)
    setCancelConfirmVisible(false)
    setCancelTarget(null)
    setSubmitting(false)
    onClose()
  }

  return (
    <>
      <BaseDialog show={show} title={t('admin.usage.cleanup.title')} width="wide" onClose={handleClose}>
        <div className="space-y-4">
          <UsageFilters
            filters={localFilters}
            exporting={false}
            startDate={localStartDate}
            endDate={localEndDate}
            showActions={false}
            onFiltersChange={setLocalFilters}
            onChange={() => {}}
            onRefresh={() => {}}
            onReset={() => {}}
            onExport={() => {}}
            onCleanup={() => {}}
          />

          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
            {t('admin.usage.cleanup.warning')}
          </div>

          <div className="rounded-xl border border-gray-200 p-4 dark:border-dark-700">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                {t('admin.usage.cleanup.recentTasks')}
              </h4>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => void loadTasks()}>
                {t('common.refresh')}
              </button>
            </div>

            <div className="mt-3 space-y-2">
              {tasksLoading ? (
                <div className="text-sm text-gray-500 dark:text-gray-400">{t('admin.usage.cleanup.loadingTasks')}</div>
              ) : tasks.length === 0 ? (
                <div className="text-sm text-gray-500 dark:text-gray-400">{t('admin.usage.cleanup.noTasks')}</div>
              ) : (
                tasks.map((task) => (
                  <div
                    key={task.id}
                    className="flex flex-col gap-2 rounded-lg border border-gray-100 px-3 py-2 text-sm text-gray-600 dark:border-dark-700 dark:text-gray-300"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${statusClass(task.status)}`}>
                          {statusLabel(task.status)}
                        </span>
                        <span className="text-xs text-gray-400">#{task.id}</span>
                        {canCancel(task) ? (
                          <button
                            type="button"
                            className="btn btn-ghost btn-xs text-rose-600 hover:text-rose-700 dark:text-rose-300"
                            onClick={() => {
                              setCancelTarget(task)
                              setCancelConfirmVisible(true)
                            }}
                          >
                            {t('admin.usage.cleanup.cancel')}
                          </button>
                        ) : null}
                      </div>
                      <div className="text-xs text-gray-400">{formatDateTimeValue(task.created_at)}</div>
                    </div>
                    <div className="flex flex-wrap items-center gap-4 text-xs text-gray-500 dark:text-gray-400">
                      <span>
                        {t('admin.usage.cleanup.range')}: {formatRange(task)}
                      </span>
                      <span>
                        {t('admin.usage.cleanup.deletedRows')}: {task.deleted_rows.toLocaleString()}
                      </span>
                    </div>
                    {task.error_message ? (
                      <div className="text-xs text-rose-500">{task.error_message}</div>
                    ) : null}
                  </div>
                ))
              )}
            </div>

            {tasksTotal > tasksPageSize ? (
              <div className="mt-4">
                <Pagination
                total={tasksTotal}
                page={tasksPage}
                pageSize={tasksPageSize}
                pageSizeOptions={[5]}
                showPageSizeSelector={false}
                showJump
                onUpdatePage={(p) => {
                  setTasksPage(p)
                  void loadTasks()
                }}
                onUpdatePageSize={(s) => {
                  if (!Number.isFinite(s) || s <= 0) return
                  setTasksPageSize(s)
                  setTasksPage(1)
                  void loadTasks()
                }}
              />
              </div>
            ) : null}
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button type="button" className="btn btn-secondary" onClick={handleClose}>
            {t('common.cancel')}
          </button>
          <button
            type="button"
            className="btn btn-danger"
            disabled={submitting}
            onClick={() => setConfirmVisible(true)}
          >
            {submitting ? t('admin.usage.cleanup.submitting') : t('admin.usage.cleanup.submit')}
          </button>
        </div>
      </BaseDialog>

      <ConfirmDialog
        show={confirmVisible}
        title={t('admin.usage.cleanup.confirmTitle')}
        message={t('admin.usage.cleanup.confirmMessage')}
        confirmText={t('admin.usage.cleanup.confirmSubmit')}
        danger
        onConfirm={() => void submitCleanup()}
        onCancel={() => setConfirmVisible(false)}
      />

      <ConfirmDialog
        show={cancelConfirmVisible}
        title={t('admin.usage.cleanup.cancelConfirmTitle')}
        message={t('admin.usage.cleanup.cancelConfirmMessage')}
        confirmText={t('admin.usage.cleanup.cancelConfirm')}
        danger
        onConfirm={() => void cancelTask()}
        onCancel={() => setCancelConfirmVisible(false)}
      />
    </>
  )
}
