'use client'

import { useEffect, useMemo, useState } from 'react'
import { useApp } from '@/context/AppContext'
import { useI18n } from '@/lib/i18n'
import { adminAccountsAPI, type PreviewFromCRSResult } from '@/lib/adminAccounts'
import { extractApiErrorMessage } from '@/lib/apiError'
import BaseDialog from '@/components/common/BaseDialog'

type Step = 'input' | 'preview' | 'result'

interface SyncFromCrsModalProps {
  show: boolean
  onClose: () => void
  onSynced: () => void
}

export default function SyncFromCrsModal({ show, onClose, onSynced }: SyncFromCrsModalProps) {
  const appStore = useApp()
  const { t } = useI18n()

  const [currentStep, setCurrentStep] = useState<Step>('input')
  const [previewing, setPreviewing] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [previewResult, setPreviewResult] = useState<PreviewFromCRSResult | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [result, setResult] = useState<Awaited<ReturnType<typeof adminAccountsAPI.syncFromCrs>> | null>(
    null,
  )
  const [form, setForm] = useState({
    base_url: '',
    username: '',
    password: '',
    sync_proxies: true,
  })

  const hasNewButNoneSelected = useMemo(() => {
    if (!previewResult) return false
    return previewResult.new_accounts.length > 0 && selectedIds.size === 0
  }, [previewResult, selectedIds])

  const errorItems = useMemo(() => {
    if (!result?.items) return []
    return result.items.filter(
      (item) => item.action === 'failed' || (item.action === 'skipped' && item.error !== 'not selected'),
    )
  }, [result])

  useEffect(() => {
    if (show) {
      setCurrentStep('input')
      setPreviewResult(null)
      setSelectedIds(new Set())
      setResult(null)
      setForm({ base_url: '', username: '', password: '', sync_proxies: true })
    }
  }, [show])

  const handleClose = () => {
    if (syncing || previewing) return
    onClose()
  }

  const handleBack = () => {
    setCurrentStep('input')
    setPreviewResult(null)
    setSelectedIds(new Set())
  }

  const selectAll = () => {
    if (!previewResult) return
    setSelectedIds(new Set(previewResult.new_accounts.map((acc) => acc.crs_account_id)))
  }

  const selectNone = () => {
    setSelectedIds(new Set())
  }

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handlePreview = async () => {
    if (!form.base_url.trim() || !form.username.trim() || !form.password.trim()) {
      appStore.showError(t('admin.accounts.syncMissingFields'))
      return
    }

    setPreviewing(true)
    try {
      const res = await adminAccountsAPI.previewFromCrs({
        base_url: form.base_url.trim(),
        username: form.username.trim(),
        password: form.password,
      })
      setPreviewResult(res)
      setSelectedIds(new Set(res.new_accounts.map((acc) => acc.crs_account_id)))
      setCurrentStep('preview')
    } catch (error: unknown) {
      appStore.showError(extractApiErrorMessage(error, t('admin.accounts.crsPreviewFailed')))
    } finally {
      setPreviewing(false)
    }
  }

  const handleSync = async () => {
    if (!form.base_url.trim() || !form.username.trim() || !form.password.trim()) {
      appStore.showError(t('admin.accounts.syncMissingFields'))
      return
    }

    setSyncing(true)
    try {
      const res = await adminAccountsAPI.syncFromCrs({
        base_url: form.base_url.trim(),
        username: form.username.trim(),
        password: form.password,
        sync_proxies: form.sync_proxies,
        selected_account_ids: [...selectedIds],
      })
      setResult(res)
      setCurrentStep('result')

      if (res.failed > 0) {
        appStore.showError(t('admin.accounts.syncCompletedWithErrors', res))
      } else {
        appStore.showSuccess(t('admin.accounts.syncCompleted', res))
      }
      onSynced()
    } catch (error: unknown) {
      appStore.showError(extractApiErrorMessage(error, t('admin.accounts.syncFailed')))
    } finally {
      setSyncing(false)
    }
  }

  return (
    <BaseDialog
      show={show}
      title={t('admin.accounts.syncFromCrsTitle')}
      width="normal"
      closeOnClickOutside
      onClose={handleClose}
      footer={
        <div className="flex justify-end gap-3">
          {currentStep === 'input' ? (
            <>
              <button className="btn btn-secondary" type="button" disabled={previewing} onClick={handleClose}>
                {t('common.cancel')}
              </button>
              <button
                className="btn btn-primary"
                type="button"
                disabled={previewing}
                onClick={() => void handlePreview()}
              >
                {previewing ? t('admin.accounts.crsPreviewing') : t('admin.accounts.crsPreview')}
              </button>
            </>
          ) : null}
          {currentStep === 'preview' ? (
            <>
              <button className="btn btn-secondary" type="button" disabled={syncing} onClick={handleBack}>
                {t('admin.accounts.crsBack')}
              </button>
              <button
                className="btn btn-primary"
                type="button"
                disabled={syncing || hasNewButNoneSelected}
                onClick={() => void handleSync()}
              >
                {syncing ? t('admin.accounts.syncing') : t('admin.accounts.syncNow')}
              </button>
            </>
          ) : null}
          {currentStep === 'result' ? (
            <button className="btn btn-secondary" type="button" onClick={handleClose}>
              {t('common.close')}
            </button>
          ) : null}
        </div>
      }
    >
      {currentStep === 'input' ? (
        <form
          id="sync-from-crs-form"
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault()
            void handlePreview()
          }}
        >
          <div className="text-sm text-gray-600 dark:text-dark-300">{t('admin.accounts.syncFromCrsDesc')}</div>
          <div className="rounded-lg bg-gray-50 p-3 text-xs text-gray-500 dark:bg-dark-700/60 dark:text-dark-400">
            {t('admin.accounts.crsUpdateBehaviorNote')}
          </div>
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-600 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-400">
            {t('admin.accounts.crsVersionRequirement')}
          </div>
          <div className="grid grid-cols-1 gap-4">
            <div>
              <label htmlFor="crs-base-url" className="input-label">
                {t('admin.accounts.crsBaseUrl')}
              </label>
              <input
                id="crs-base-url"
                value={form.base_url}
                onChange={(event) => setForm((prev) => ({ ...prev, base_url: event.target.value }))}
                type="text"
                className="input"
                required
                placeholder={t('admin.accounts.crsBaseUrlPlaceholder')}
              />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="crs-username" className="input-label">
                  {t('admin.accounts.crsUsername')}
                </label>
                <input
                  id="crs-username"
                  value={form.username}
                  onChange={(event) => setForm((prev) => ({ ...prev, username: event.target.value }))}
                  type="text"
                  className="input"
                  required
                  autoComplete="username"
                />
              </div>
              <div>
                <label htmlFor="crs-password" className="input-label">
                  {t('admin.accounts.crsPassword')}
                </label>
                <input
                  id="crs-password"
                  value={form.password}
                  onChange={(event) => setForm((prev) => ({ ...prev, password: event.target.value }))}
                  type="password"
                  className="input"
                  required
                  autoComplete="current-password"
                />
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-dark-300">
              <input
                checked={form.sync_proxies}
                onChange={(event) => setForm((prev) => ({ ...prev, sync_proxies: event.target.checked }))}
                type="checkbox"
                className="rounded border-gray-300 dark:border-dark-600"
              />
              {t('admin.accounts.syncProxies')}
            </label>
          </div>
        </form>
      ) : null}

      {currentStep === 'preview' && previewResult ? (
        <div className="space-y-4">
          {previewResult.existing_accounts.length > 0 ? (
            <div className="rounded-lg bg-gray-50 p-3 dark:bg-dark-700/60">
              <div className="mb-2 text-sm font-medium text-gray-700 dark:text-dark-300">
                {t('admin.accounts.crsExistingAccounts')}
                <span className="ml-1 text-xs text-gray-400">({previewResult.existing_accounts.length})</span>
              </div>
              <div className="max-h-32 overflow-auto text-xs text-gray-500 dark:text-dark-400">
                {previewResult.existing_accounts.map((acc) => (
                  <div key={acc.crs_account_id} className="flex items-center gap-2 py-0.5">
                    <span className="inline-block rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                      {acc.platform} / {acc.type}
                    </span>
                    <span className="truncate">{acc.name}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {previewResult.new_accounts.length > 0 ? (
            <div>
              <div className="mb-2 flex items-center justify-between">
                <div className="text-sm font-medium text-gray-900 dark:text-white">
                  {t('admin.accounts.crsNewAccounts')}
                  <span className="ml-1 text-xs text-gray-400">({previewResult.new_accounts.length})</span>
                </div>
                <div className="flex gap-2">
                  <button type="button" className="text-xs text-blue-600 hover:text-blue-700 dark:text-blue-400" onClick={selectAll}>
                    {t('admin.accounts.crsSelectAll')}
                  </button>
                  <button type="button" className="text-xs text-gray-500 hover:text-gray-600 dark:text-gray-400" onClick={selectNone}>
                    {t('admin.accounts.crsSelectNone')}
                  </button>
                </div>
              </div>
              <div className="max-h-48 overflow-auto rounded-lg border border-gray-200 p-2 dark:border-dark-600">
                {previewResult.new_accounts.map((acc) => (
                  <label
                    key={acc.crs_account_id}
                    className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 hover:bg-gray-50 dark:hover:bg-dark-700/40"
                  >
                    <input
                      type="checkbox"
                      checked={selectedIds.has(acc.crs_account_id)}
                      onChange={() => toggleSelect(acc.crs_account_id)}
                      className="rounded border-gray-300 dark:border-dark-600"
                    />
                    <span className="inline-block rounded bg-green-100 px-1.5 py-0.5 text-[10px] font-medium text-green-700 dark:bg-green-900/30 dark:text-green-400">
                      {acc.platform} / {acc.type}
                    </span>
                    <span className="truncate text-sm text-gray-700 dark:text-dark-300">{acc.name}</span>
                  </label>
                ))}
              </div>
              <div className="mt-1 text-xs text-gray-400">
                {t('admin.accounts.crsSelectedCount', { count: selectedIds.size })}
              </div>
            </div>
          ) : null}

          <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-dark-400">
            <span>{t('admin.accounts.syncProxies')}:</span>
            <span className={form.sync_proxies ? 'text-green-600 dark:text-green-400' : 'text-gray-400 dark:text-dark-500'}>
              {form.sync_proxies ? t('common.yes') : t('common.no')}
            </span>
          </div>

          {previewResult.new_accounts.length === 0 ? (
            <div className="rounded-lg bg-gray-50 p-4 text-center text-sm text-gray-500 dark:bg-dark-700/60 dark:text-dark-400">
              {t('admin.accounts.crsNoNewAccounts')}
              {previewResult.existing_accounts.length > 0
                ? ` ${t('admin.accounts.crsWillUpdate', { count: previewResult.existing_accounts.length })}`
                : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {currentStep === 'result' && result ? (
        <div className="space-y-4">
          <div className="space-y-2 rounded-xl border border-gray-200 p-4 dark:border-dark-700">
            <div className="text-sm font-medium text-gray-900 dark:text-white">{t('admin.accounts.syncResult')}</div>
            <div className="text-sm text-gray-700 dark:text-dark-300">{t('admin.accounts.syncResultSummary', result)}</div>
            {errorItems.length > 0 ? (
              <div className="mt-2">
                <div className="text-sm font-medium text-red-600 dark:text-red-400">{t('admin.accounts.syncErrors')}</div>
                <div className="mt-2 max-h-48 overflow-auto rounded-lg bg-gray-50 p-3 font-mono text-xs dark:bg-dark-800">
                  {errorItems.map((item, idx) => (
                    <div key={idx} className="whitespace-pre-wrap">
                      {item.kind} {item.crs_account_id} — {item.action}
                      {item.error ? `: ${item.error}` : ''}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </BaseDialog>
  )
}
