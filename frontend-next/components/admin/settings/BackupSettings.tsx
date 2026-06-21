'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useI18n } from '@/lib/i18n'
import { useApp } from '@/context/AppContext'
import { extractApiErrorMessage } from '@/lib/apiError'
import {
  adminBackupAPI,
  type BackupRecord,
  type BackupS3Config,
  type BackupScheduleConfig,
} from '@/lib/adminBackup'

const MAX_POLL_COUNT = 900

export default function BackupSettings() {
  const { t } = useI18n()
  const appStore = useApp()

  const [s3Form, setS3Form] = useState<BackupS3Config>({
    endpoint: '',
    region: 'auto',
    bucket: '',
    access_key_id: '',
    secret_access_key: '',
    prefix: 'backups/',
    force_path_style: false,
  })
  const [s3SecretConfigured, setS3SecretConfigured] = useState(false)
  const [savingS3, setSavingS3] = useState(false)
  const [testingS3, setTestingS3] = useState(false)

  const [scheduleForm, setScheduleForm] = useState<BackupScheduleConfig>({
    enabled: false,
    cron_expr: '0 2 * * *',
    retain_days: 14,
    retain_count: 10,
  })
  const [savingSchedule, setSavingSchedule] = useState(false)

  const [backups, setBackups] = useState<BackupRecord[]>([])
  const [loadingBackups, setLoadingBackups] = useState(false)
  const [creatingBackup, setCreatingBackup] = useState(false)
  const [restoringId, setRestoringId] = useState('')
  const [manualExpireDays, setManualExpireDays] = useState(14)

  const pollingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const restoringPollingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const [showR2Guide, setShowR2Guide] = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => setMounted(true), [])

  const r2ConfigRows = useMemo(
    () => [
      { field: t('admin.backup.s3.endpoint'), value: 'https://<account_id>.r2.cloudflarestorage.com' },
      { field: t('admin.backup.s3.region'), value: 'auto' },
      { field: t('admin.backup.s3.bucket'), value: t('admin.backup.r2Guide.step4.bucketValue') },
      { field: t('admin.backup.s3.prefix'), value: 'backups/' },
      { field: 'Access Key ID', value: t('admin.backup.r2Guide.step4.fromStep2') },
      { field: 'Secret Access Key', value: t('admin.backup.r2Guide.step4.fromStep2') },
      { field: t('admin.backup.s3.forcePathStyle'), value: t('admin.backup.r2Guide.step4.unchecked') },
    ],
    [t],
  )

  const updateRecordInList = useCallback((updated: BackupRecord) => {
    setBackups((current) => {
      const idx = current.findIndex((r) => r.id === updated.id)
      if (idx < 0) return current
      const next = [...current]
      next[idx] = updated
      return next
    })
  }, [])

  const stopPolling = useCallback(() => {
    if (pollingTimerRef.current) {
      clearInterval(pollingTimerRef.current)
      pollingTimerRef.current = null
    }
  }, [])

  const stopRestorePolling = useCallback(() => {
    if (restoringPollingTimerRef.current) {
      clearInterval(restoringPollingTimerRef.current)
      restoringPollingTimerRef.current = null
    }
  }, [])

  const loadBackups = useCallback(async () => {
    setLoadingBackups(true)
    try {
      const result = await adminBackupAPI.listBackups()
      const items = result.items || []
      setBackups(items)
      return items
    } catch (error) {
      appStore.showError(extractApiErrorMessage(error, t('errors.networkError')))
      return []
    } finally {
      setLoadingBackups(false)
    }
  }, [appStore, t])

  const startPolling = useCallback(
    (backupId: string) => {
      stopPolling()
      let count = 0
      pollingTimerRef.current = setInterval(async () => {
        if (count++ >= MAX_POLL_COUNT) {
          stopPolling()
          setCreatingBackup(false)
          appStore.showWarning(t('admin.backup.operations.backupRunning'))
          return
        }
        try {
          const record = await adminBackupAPI.getBackup(backupId)
          updateRecordInList(record)
          if (record.status === 'completed' || record.status === 'failed') {
            stopPolling()
            setCreatingBackup(false)
            if (record.status === 'completed') {
              appStore.showSuccess(t('admin.backup.operations.backupCreated'))
            } else {
              appStore.showError(record.error_message || t('admin.backup.operations.backupFailed'))
            }
            await loadBackups()
          }
        } catch {
          // continue polling on transient errors
        }
      }, 2000)
    },
    [appStore, loadBackups, stopPolling, t, updateRecordInList],
  )

  const startRestorePolling = useCallback(
    (backupId: string) => {
      stopRestorePolling()
      let count = 0
      restoringPollingTimerRef.current = setInterval(async () => {
        if (count++ >= MAX_POLL_COUNT) {
          stopRestorePolling()
          setRestoringId('')
          appStore.showWarning(t('admin.backup.operations.restoreRunning'))
          return
        }
        try {
          const record = await adminBackupAPI.getBackup(backupId)
          updateRecordInList(record)
          if (record.restore_status === 'completed' || record.restore_status === 'failed') {
            stopRestorePolling()
            setRestoringId('')
            if (record.restore_status === 'completed') {
              appStore.showSuccess(t('admin.backup.actions.restoreSuccess'))
            } else {
              appStore.showError(record.restore_error || t('admin.backup.operations.restoreFailed'))
            }
            await loadBackups()
          }
        } catch {
          // continue polling on transient errors
        }
      }, 2000)
    },
    [appStore, loadBackups, stopRestorePolling, t, updateRecordInList],
  )

  const loadS3Config = useCallback(async () => {
    try {
      const cfg = await adminBackupAPI.getS3Config()
      setS3Form({
        endpoint: cfg.endpoint || '',
        region: cfg.region || 'auto',
        bucket: cfg.bucket || '',
        access_key_id: cfg.access_key_id || '',
        secret_access_key: '',
        prefix: cfg.prefix || 'backups/',
        force_path_style: cfg.force_path_style,
      })
      setS3SecretConfigured(Boolean(cfg.access_key_id))
    } catch (error) {
      appStore.showError(extractApiErrorMessage(error, t('errors.networkError')))
    }
  }, [appStore, t])

  const loadSchedule = useCallback(async () => {
    try {
      const cfg = await adminBackupAPI.getSchedule()
      setScheduleForm({
        enabled: cfg.enabled,
        cron_expr: cfg.cron_expr || '0 2 * * *',
        retain_days: cfg.retain_days || 14,
        retain_count: cfg.retain_count || 10,
      })
    } catch (error) {
      appStore.showError(extractApiErrorMessage(error, t('errors.networkError')))
    }
  }, [appStore, t])

  const handleVisibilityChange = useCallback(() => {
    if (document.hidden) {
      stopPolling()
      stopRestorePolling()
    } else {
      void loadBackups().then((items) => {
        const running = items.find((r) => r.status === 'running')
        if (running) {
          setCreatingBackup(true)
          startPolling(running.id)
        }
        const restoring = items.find((r) => r.restore_status === 'running')
        if (restoring) {
          setRestoringId(restoring.id)
          startRestorePolling(restoring.id)
        }
      })
    }
  }, [loadBackups, startPolling, startRestorePolling, stopPolling, stopRestorePolling])

  useEffect(() => {
    document.addEventListener('visibilitychange', handleVisibilityChange)

    void (async () => {
      await Promise.all([loadS3Config(), loadSchedule()])
      const items = await loadBackups()
      const runningBackup = items.find((r) => r.status === 'running')
      if (runningBackup) {
        setCreatingBackup(true)
        startPolling(runningBackup.id)
      }
      const restoringBackup = items.find((r) => r.restore_status === 'running')
      if (restoringBackup) {
        setRestoringId(restoringBackup.id)
        startRestorePolling(restoringBackup.id)
      }
    })()

    return () => {
      stopPolling()
      stopRestorePolling()
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [
    handleVisibilityChange,
    loadBackups,
    loadS3Config,
    loadSchedule,
    startPolling,
    startRestorePolling,
    stopPolling,
    stopRestorePolling,
  ])

  const saveS3Config = async () => {
    setSavingS3(true)
    try {
      await adminBackupAPI.updateS3Config(s3Form)
      appStore.showSuccess(t('admin.backup.s3.saved'))
      await loadS3Config()
    } catch (error) {
      appStore.showError(extractApiErrorMessage(error, t('errors.networkError')))
    } finally {
      setSavingS3(false)
    }
  }

  const testS3 = async () => {
    setTestingS3(true)
    try {
      const result = await adminBackupAPI.testS3Connection(s3Form)
      if (result.ok) {
        appStore.showSuccess(result.message || t('admin.backup.s3.testSuccess'))
      } else {
        appStore.showError(result.message || t('admin.backup.s3.testFailed'))
      }
    } catch (error) {
      appStore.showError(extractApiErrorMessage(error, t('errors.networkError')))
    } finally {
      setTestingS3(false)
    }
  }

  const saveSchedule = async () => {
    setSavingSchedule(true)
    try {
      await adminBackupAPI.updateSchedule(scheduleForm)
      appStore.showSuccess(t('admin.backup.schedule.saved'))
    } catch (error) {
      appStore.showError(extractApiErrorMessage(error, t('errors.networkError')))
    } finally {
      setSavingSchedule(false)
    }
  }

  const createBackup = async () => {
    setCreatingBackup(true)
    try {
      const record = await adminBackupAPI.createBackup({ expire_days: manualExpireDays })
      setBackups((current) => [record, ...current])
      startPolling(record.id)
    } catch (error: unknown) {
      const err = error as { status?: number; message?: string }
      if (err?.status === 409) {
        appStore.showWarning(t('admin.backup.operations.alreadyInProgress'))
      } else {
        appStore.showError(extractApiErrorMessage(error, t('errors.networkError')))
      }
      setCreatingBackup(false)
    }
  }

  const downloadBackup = async (id: string) => {
    try {
      const result = await adminBackupAPI.getDownloadURL(id)
      window.open(result.url, '_blank')
    } catch (error) {
      appStore.showError(extractApiErrorMessage(error, t('errors.networkError')))
    }
  }

  const restoreBackup = async (id: string) => {
    if (!window.confirm(t('admin.backup.actions.restoreConfirm'))) return
    const password = window.prompt(t('admin.backup.actions.restorePasswordPrompt'))
    if (!password) return
    setRestoringId(id)
    try {
      const record = await adminBackupAPI.restoreBackup(id, password)
      updateRecordInList(record)
      startRestorePolling(id)
    } catch (error: unknown) {
      const err = error as { status?: number; message?: string }
      if (err?.status === 409) {
        appStore.showWarning(t('admin.backup.operations.restoreRunning'))
      } else {
        appStore.showError(extractApiErrorMessage(error, t('errors.networkError')))
      }
      setRestoringId('')
    }
  }

  const removeBackup = async (id: string) => {
    if (!window.confirm(t('admin.backup.actions.deleteConfirm'))) return
    try {
      await adminBackupAPI.deleteBackup(id)
      appStore.showSuccess(t('admin.backup.actions.deleted'))
      await loadBackups()
    } catch (error) {
      appStore.showError(extractApiErrorMessage(error, t('errors.networkError')))
    }
  }

  const statusClass = (status: string): string => {
    switch (status) {
      case 'completed':
        return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
      case 'running':
        return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
      case 'failed':
        return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'
      default:
        return 'bg-gray-100 text-gray-700 dark:bg-dark-800 dark:text-gray-300'
    }
  }

  const formatSize = (bytes: number): string => {
    if (!bytes || bytes <= 0) return '-'
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  const formatDate = (value?: string): string => {
    if (!value) return '-'
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return value
    return date.toLocaleString()
  }

  return (
    <div className="space-y-6">
      <div className="card p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-gray-900 dark:text-white">
              {t('admin.backup.s3.title')}
            </h3>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              {t('admin.backup.s3.descriptionPrefix')}
              <button
                type="button"
                className="text-primary-600 underline hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300"
                onClick={() => setShowR2Guide(true)}
              >
                Cloudflare R2
              </button>
              {t('admin.backup.s3.descriptionSuffix')}
            </p>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">
              {t('admin.backup.s3.endpoint')}
            </label>
            <input
              value={s3Form.endpoint}
              onChange={(e) => setS3Form((current) => ({ ...current, endpoint: e.target.value }))}
              className="input w-full"
              placeholder="https://<account_id>.r2.cloudflarestorage.com"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">
              {t('admin.backup.s3.region')}
            </label>
            <input
              value={s3Form.region}
              onChange={(e) => setS3Form((current) => ({ ...current, region: e.target.value }))}
              className="input w-full"
              placeholder="auto"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">
              {t('admin.backup.s3.bucket')}
            </label>
            <input
              value={s3Form.bucket}
              onChange={(e) => setS3Form((current) => ({ ...current, bucket: e.target.value }))}
              className="input w-full"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">
              {t('admin.backup.s3.prefix')}
            </label>
            <input
              value={s3Form.prefix}
              onChange={(e) => setS3Form((current) => ({ ...current, prefix: e.target.value }))}
              className="input w-full"
              placeholder="backups/"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">
              {t('admin.backup.s3.accessKeyId')}
            </label>
            <input
              value={s3Form.access_key_id}
              onChange={(e) => setS3Form((current) => ({ ...current, access_key_id: e.target.value }))}
              className="input w-full"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">
              {t('admin.backup.s3.secretAccessKey')}
            </label>
            <input
              value={s3Form.secret_access_key || ''}
              onChange={(e) =>
                setS3Form((current) => ({ ...current, secret_access_key: e.target.value }))
              }
              type="password"
              className="input w-full"
              placeholder={s3SecretConfigured ? t('admin.backup.s3.secretConfigured') : ''}
            />
          </div>
          <label className="inline-flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 md:col-span-2">
            <input
              checked={s3Form.force_path_style}
              onChange={(e) =>
                setS3Form((current) => ({ ...current, force_path_style: e.target.checked }))
              }
              type="checkbox"
            />
            <span>{t('admin.backup.s3.forcePathStyle')}</span>
          </label>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            disabled={testingS3}
            onClick={() => void testS3()}
          >
            {testingS3 ? t('common.loading') : t('admin.backup.s3.testConnection')}
          </button>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={savingS3}
            onClick={() => void saveS3Config()}
          >
            {savingS3 ? t('common.loading') : t('common.save')}
          </button>
        </div>
      </div>

      <div className="card p-6">
        <div className="mb-4">
          <h3 className="text-base font-semibold text-gray-900 dark:text-white">
            {t('admin.backup.schedule.title')}
          </h3>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {t('admin.backup.schedule.description')}
          </p>
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <label className="inline-flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 md:col-span-2">
            <input
              checked={scheduleForm.enabled}
              onChange={(e) =>
                setScheduleForm((current) => ({ ...current, enabled: e.target.checked }))
              }
              type="checkbox"
            />
            <span>{t('admin.backup.schedule.enabled')}</span>
          </label>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">
              {t('admin.backup.schedule.cronExpr')}
            </label>
            <input
              value={scheduleForm.cron_expr}
              onChange={(e) =>
                setScheduleForm((current) => ({ ...current, cron_expr: e.target.value }))
              }
              className="input w-full"
              placeholder="0 2 * * *"
            />
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              {t('admin.backup.schedule.cronHint')}
            </p>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">
              {t('admin.backup.schedule.retainDays')}
            </label>
            <input
              value={scheduleForm.retain_days}
              onChange={(e) =>
                setScheduleForm((current) => ({
                  ...current,
                  retain_days: Number(e.target.value),
                }))
              }
              type="number"
              min={0}
              className="input w-full"
            />
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              {t('admin.backup.schedule.retainDaysHint')}
            </p>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">
              {t('admin.backup.schedule.retainCount')}
            </label>
            <input
              value={scheduleForm.retain_count}
              onChange={(e) =>
                setScheduleForm((current) => ({
                  ...current,
                  retain_count: Number(e.target.value),
                }))
              }
              type="number"
              min={0}
              className="input w-full"
            />
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              {t('admin.backup.schedule.retainCountHint')}
            </p>
          </div>
        </div>
        <div className="mt-4">
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={savingSchedule}
            onClick={() => void saveSchedule()}
          >
            {savingSchedule ? t('common.loading') : t('common.save')}
          </button>
        </div>
      </div>

      <div className="card p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-gray-900 dark:text-white">
              {t('admin.backup.operations.title')}
            </h3>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              {t('admin.backup.operations.description')}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1">
              <label className="text-xs text-gray-600 dark:text-gray-400">
                {t('admin.backup.operations.expireDays')}
              </label>
              <input
                value={manualExpireDays}
                onChange={(e) => setManualExpireDays(Number(e.target.value))}
                type="number"
                min={0}
                className="input w-20 text-xs"
              />
            </div>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={creatingBackup}
              onClick={() => void createBackup()}
            >
              {creatingBackup
                ? t('admin.backup.operations.backing')
                : t('admin.backup.operations.createBackup')}
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={loadingBackups}
              onClick={() => void loadBackups()}
            >
              {loadingBackups ? t('common.loading') : t('common.refresh')}
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[800px] text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-gray-500 dark:border-dark-700 dark:text-gray-400">
                <th className="py-2 pr-4">ID</th>
                <th className="py-2 pr-4">{t('admin.backup.columns.status')}</th>
                <th className="py-2 pr-4">{t('admin.backup.columns.fileName')}</th>
                <th className="py-2 pr-4">{t('admin.backup.columns.size')}</th>
                <th className="py-2 pr-4">{t('admin.backup.columns.expiresAt')}</th>
                <th className="py-2 pr-4">{t('admin.backup.columns.triggeredBy')}</th>
                <th className="py-2 pr-4">{t('admin.backup.columns.startedAt')}</th>
                <th className="py-2">{t('admin.backup.columns.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {backups.map((record) => (
                <tr
                  key={record.id}
                  className="border-b border-gray-100 align-top dark:border-dark-800"
                >
                  <td className="py-3 pr-4 font-mono text-xs">{record.id}</td>
                  <td className="py-3 pr-4">
                    <span className={`rounded px-2 py-0.5 text-xs ${statusClass(record.status)}`}>
                      {record.status === 'running' && record.progress
                        ? t(`admin.backup.progress.${record.progress}`)
                        : t(`admin.backup.status.${record.status}`)}
                    </span>
                  </td>
                  <td className="py-3 pr-4 text-xs">{record.file_name}</td>
                  <td className="py-3 pr-4 text-xs">{formatSize(record.size_bytes)}</td>
                  <td className="py-3 pr-4 text-xs">
                    {record.expires_at ? formatDate(record.expires_at) : t('admin.backup.neverExpire')}
                  </td>
                  <td className="py-3 pr-4 text-xs">
                    {record.triggered_by === 'scheduled'
                      ? t('admin.backup.trigger.scheduled')
                      : t('admin.backup.trigger.manual')}
                  </td>
                  <td className="py-3 pr-4 text-xs">{formatDate(record.started_at)}</td>
                  <td className="py-3 text-xs">
                    <div className="flex flex-wrap gap-1">
                      {record.status === 'completed' ? (
                        <button
                          type="button"
                          className="btn btn-secondary btn-xs"
                          onClick={() => void downloadBackup(record.id)}
                        >
                          {t('admin.backup.actions.download')}
                        </button>
                      ) : null}
                      {record.status === 'completed' ? (
                        <button
                          type="button"
                          className="btn btn-secondary btn-xs"
                          disabled={restoringId === record.id}
                          onClick={() => void restoreBackup(record.id)}
                        >
                          {restoringId === record.id
                            ? t('common.loading')
                            : t('admin.backup.actions.restore')}
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className="btn btn-danger btn-xs"
                        onClick={() => void removeBackup(record.id)}
                      >
                        {t('common.delete')}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {backups.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-6 text-center text-sm text-gray-500 dark:text-gray-400">
                    {t('admin.backup.empty')}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      {mounted && showR2Guide
        ? createPortal(
            <div
              className="fixed inset-0 z-50 flex items-center justify-center p-4"
              onMouseDown={(e) => {
                if (e.target === e.currentTarget) setShowR2Guide(false)
              }}
            >
              <div className="fixed inset-0 bg-black/50" onClick={() => setShowR2Guide(false)} />
              <div className="relative max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white p-6 shadow-2xl dark:bg-dark-800">
                <button
                  type="button"
                  className="absolute right-4 top-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                  onClick={() => setShowR2Guide(false)}
                >
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>

                <h2 className="mb-4 text-lg font-bold text-gray-900 dark:text-white">
                  {t('admin.backup.r2Guide.title')}
                </h2>
                <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">
                  {t('admin.backup.r2Guide.intro')}
                </p>

                <div className="mb-5">
                  <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-white">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary-100 text-xs font-bold text-primary-700 dark:bg-primary-900/40 dark:text-primary-300">
                      1
                    </span>
                    {t('admin.backup.r2Guide.step1.title')}
                  </h3>
                  <ol className="ml-8 list-decimal space-y-1 text-sm text-gray-600 dark:text-gray-300">
                    <li>{t('admin.backup.r2Guide.step1.line1')}</li>
                    <li>{t('admin.backup.r2Guide.step1.line2')}</li>
                    <li>{t('admin.backup.r2Guide.step1.line3')}</li>
                  </ol>
                </div>

                <div className="mb-5">
                  <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-white">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary-100 text-xs font-bold text-primary-700 dark:bg-primary-900/40 dark:text-primary-300">
                      2
                    </span>
                    {t('admin.backup.r2Guide.step2.title')}
                  </h3>
                  <ol className="ml-8 list-decimal space-y-1 text-sm text-gray-600 dark:text-gray-300">
                    <li>{t('admin.backup.r2Guide.step2.line1')}</li>
                    <li>{t('admin.backup.r2Guide.step2.line2')}</li>
                    <li>{t('admin.backup.r2Guide.step2.line3')}</li>
                    <li>{t('admin.backup.r2Guide.step2.line4')}</li>
                  </ol>
                  <div className="mt-2 rounded-lg bg-amber-50 p-3 text-xs text-amber-700 dark:bg-amber-900/20 dark:text-amber-300">
                    {t('admin.backup.r2Guide.step2.warning')}
                  </div>
                </div>

                <div className="mb-5">
                  <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-white">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary-100 text-xs font-bold text-primary-700 dark:bg-primary-900/40 dark:text-primary-300">
                      3
                    </span>
                    {t('admin.backup.r2Guide.step3.title')}
                  </h3>
                  <p className="ml-8 text-sm text-gray-600 dark:text-gray-300">
                    {t('admin.backup.r2Guide.step3.desc')}
                  </p>
                  <code className="ml-8 mt-1 block rounded bg-gray-100 px-3 py-2 text-xs text-gray-800 dark:bg-dark-700 dark:text-gray-200">
                    https://&lt;{t('admin.backup.r2Guide.step3.accountId')}&gt;.r2.cloudflarestorage.com
                  </code>
                </div>

                <div className="mb-5">
                  <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-white">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary-100 text-xs font-bold text-primary-700 dark:bg-primary-900/40 dark:text-primary-300">
                      4
                    </span>
                    {t('admin.backup.r2Guide.step4.title')}
                  </h3>
                  <div className="ml-8 overflow-hidden rounded-lg border border-gray-200 dark:border-dark-600">
                    <table className="w-full text-sm">
                      <tbody>
                        {r2ConfigRows.map((row, i) => (
                          <tr
                            key={i}
                            className="border-b border-gray-100 dark:border-dark-700 last:border-0"
                          >
                            <td className="whitespace-nowrap bg-gray-50 px-3 py-2 font-medium text-gray-700 dark:bg-dark-700 dark:text-gray-300">
                              {row.field}
                            </td>
                            <td className="px-3 py-2 text-gray-600 dark:text-gray-400">
                              <code className="text-xs">{row.value}</code>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="rounded-lg bg-green-50 p-3 text-xs text-green-700 dark:bg-green-900/20 dark:text-green-300">
                  {t('admin.backup.r2Guide.freeTier')}
                </div>

                <div className="mt-4 text-right">
                  <button type="button" className="btn btn-primary btn-sm" onClick={() => setShowR2Guide(false)}>
                    {t('common.close')}
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  )
}
