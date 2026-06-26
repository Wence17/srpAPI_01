'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useI18n } from '@/lib/i18n'
import { useApp } from '@/context/AppContext'
import { adminOpsAPI } from '@/lib/adminOps'
import type { AlertSeverity, EmailNotificationConfig } from '@/lib/opsTypes'
import BaseDialog from '@/components/common/BaseDialog'
import Select from '@/components/common/Select'

export default function OpsEmailNotificationCard() {
  const { t } = useI18n()
  const appStore = useApp()

  const [loading, setLoading] = useState(false)
  const [config, setConfig] = useState<EmailNotificationConfig | null>(null)
  const [showEditor, setShowEditor] = useState(false)
  const [saving, setSaving] = useState(false)
  const [draft, setDraft] = useState<EmailNotificationConfig | null>(null)
  const [alertRecipientInput, setAlertRecipientInput] = useState('')
  const [reportRecipientInput, setReportRecipientInput] = useState('')
  const [alertRecipientError, setAlertRecipientError] = useState('')
  const [reportRecipientError, setReportRecipientError] = useState('')

  const severityOptions = useMemo<Array<{ value: AlertSeverity | ''; label: string }>>(
    () => [
      { value: '', label: t('admin.ops.email.minSeverityAll') },
      { value: 'critical', label: t('common.critical') },
      { value: 'warning', label: t('common.warning') },
      { value: 'info', label: t('common.info') },
    ],
    [t],
  )

  const loadConfig = useCallback(async () => {
    setLoading(true)
    try {
      setConfig(await adminOpsAPI.getEmailNotificationConfig())
    } catch (err: unknown) {
      console.error('[OpsEmailNotificationCard] Failed to load config', err)
      const detail =
        err &&
        typeof err === 'object' &&
        'response' in err &&
        (err as { response?: { data?: { detail?: string } } }).response?.data?.detail
      appStore.showError(typeof detail === 'string' ? detail : t('admin.ops.email.loadFailed'))
    } finally {
      setLoading(false)
    }
  }, [appStore, t])

  useEffect(() => {
    void loadConfig()
  }, [loadConfig])

  const isValidEmailAddress = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)

  const isNonNegativeNumber = (value: unknown) =>
    typeof value === 'number' && Number.isFinite(value) && value >= 0

  const validateCronField = (enabled: boolean, cron: string) => {
    if (!enabled) return null
    if (!cron?.trim()) return t('admin.ops.email.validation.cronRequired')
    if (cron.trim().split(/\s+/).length < 5) return t('admin.ops.email.validation.cronFormat')
    return null
  }

  const editorValidation = useMemo(() => {
    const errors: string[] = []
    if (!draft) return { valid: true, errors }
    if (draft.alert.enabled && draft.alert.recipients.length === 0) {
      errors.push(t('admin.ops.email.validation.alertRecipientsRequired'))
    }
    if (draft.report.enabled && draft.report.recipients.length === 0) {
      errors.push(t('admin.ops.email.validation.reportRecipientsRequired'))
    }
    if (draft.alert.recipients.some((e) => !isValidEmailAddress(e))) {
      errors.push(t('admin.ops.email.validation.invalidRecipients'))
    }
    if (draft.report.recipients.some((e) => !isValidEmailAddress(e))) {
      errors.push(t('admin.ops.email.validation.invalidRecipients'))
    }
    if (!isNonNegativeNumber(draft.alert.rate_limit_per_hour)) {
      errors.push(t('admin.ops.email.validation.rateLimitRange'))
    }
    if (!isNonNegativeNumber(draft.alert.batching_window_seconds) || draft.alert.batching_window_seconds > 86400) {
      errors.push(t('admin.ops.email.validation.batchWindowRange'))
    }
    for (const err of [
      validateCronField(draft.report.daily_summary_enabled, draft.report.daily_summary_schedule),
      validateCronField(draft.report.weekly_summary_enabled, draft.report.weekly_summary_schedule),
      validateCronField(draft.report.error_digest_enabled, draft.report.error_digest_schedule),
      validateCronField(draft.report.account_health_enabled, draft.report.account_health_schedule),
    ]) {
      if (err) errors.push(err)
    }
    if (!isNonNegativeNumber(draft.report.error_digest_min_count)) {
      errors.push(t('admin.ops.email.validation.digestMinCountRange'))
    }
    const thr = draft.report.account_health_error_rate_threshold
    if (!(typeof thr === 'number' && Number.isFinite(thr) && thr >= 0 && thr <= 100)) {
      errors.push(t('admin.ops.email.validation.accountHealthThresholdRange'))
    }
    return { valid: errors.length === 0, errors }
  }, [draft, t])

  const addRecipient = (target: 'alert' | 'report') => {
    if (!draft) return
    const raw = (target === 'alert' ? alertRecipientInput : reportRecipientInput).trim()
    if (!raw) return
    if (!isValidEmailAddress(raw)) {
      const msg = t('common.invalidEmail')
      if (target === 'alert') setAlertRecipientError(msg)
      else setReportRecipientError(msg)
      return
    }
    const normalized = raw.toLowerCase()
    const list = target === 'alert' ? draft.alert.recipients : draft.report.recipients
    if (!list.includes(normalized)) list.push(normalized)
    setDraft({ ...draft, [target]: { ...draft[target], recipients: [...list] } })
    if (target === 'alert') {
      setAlertRecipientInput('')
      setAlertRecipientError('')
    } else {
      setReportRecipientInput('')
      setReportRecipientError('')
    }
  }

  const removeRecipient = (target: 'alert' | 'report', email: string) => {
    if (!draft) return
    const list = (target === 'alert' ? draft.alert.recipients : draft.report.recipients).filter((e) => e !== email)
    setDraft({ ...draft, [target]: { ...draft[target], recipients: list } })
  }

  const openEditor = () => {
    if (!config) return
    setDraft(JSON.parse(JSON.stringify(config)) as EmailNotificationConfig)
    setAlertRecipientInput('')
    setReportRecipientInput('')
    setAlertRecipientError('')
    setReportRecipientError('')
    setShowEditor(true)
  }

  const saveConfig = async () => {
    if (!draft || !editorValidation.valid) {
      appStore.showError(editorValidation.errors[0] || t('admin.ops.email.validation.invalid'))
      return
    }
    setSaving(true)
    try {
      setConfig(await adminOpsAPI.updateEmailNotificationConfig(draft))
      setShowEditor(false)
      appStore.showSuccess(t('admin.ops.email.saveSuccess'))
    } catch (err: unknown) {
      console.error('[OpsEmailNotificationCard] Failed to save config', err)
      const detail =
        err &&
        typeof err === 'object' &&
        'response' in err &&
        (err as { response?: { data?: { detail?: string } } }).response?.data?.detail
      appStore.showError(typeof detail === 'string' ? detail : t('admin.ops.email.saveFailed'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-gray-900/5 dark:bg-dark-800 dark:ring-dark-700">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h3 className="text-sm font-bold text-gray-900 dark:text-white">{t('admin.ops.email.title')}</h3>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{t('admin.ops.email.description')}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="flex items-center gap-1.5 rounded-lg bg-gray-100 px-3 py-1.5 text-xs font-bold text-gray-700 transition-colors hover:bg-gray-200 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-dark-700 dark:text-gray-300 dark:hover:bg-dark-600"
              disabled={loading}
              onClick={() => void loadConfig()}
            >
              <svg className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              {t('common.refresh')}
            </button>
            <button type="button" className="btn btn-sm btn-secondary" disabled={!config} onClick={openEditor}>
              {t('common.edit')}
            </button>
          </div>
        </div>

        {!config ? (
          <div className="text-sm text-gray-500 dark:text-gray-400">
            {loading ? t('admin.ops.email.loading') : t('admin.ops.email.noData')}
          </div>
        ) : (
          <div className="space-y-6">
            <div className="rounded-2xl bg-gray-50 p-4 dark:bg-dark-700/50">
              <h4 className="mb-2 text-sm font-semibold text-gray-900 dark:text-white">{t('admin.ops.email.alertTitle')}</h4>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div className="text-xs text-gray-600 dark:text-gray-300">
                  {t('common.enabled')}: <span className="ml-1 font-medium text-gray-900 dark:text-white">{config.alert.enabled ? t('common.enabled') : t('common.disabled')}</span>
                </div>
                <div className="text-xs text-gray-600 dark:text-gray-300">
                  {t('admin.ops.email.recipients')}: <span className="ml-1 font-medium text-gray-900 dark:text-white">{config.alert.recipients.length}</span>
                </div>
                <div className="text-xs text-gray-600 dark:text-gray-300">
                  {t('admin.ops.email.minSeverity')}: <span className="ml-1 font-medium text-gray-900 dark:text-white">{config.alert.min_severity || t('admin.ops.email.minSeverityAll')}</span>
                </div>
                <div className="text-xs text-gray-600 dark:text-gray-300">
                  {t('admin.ops.email.rateLimitPerHour')}: <span className="ml-1 font-medium text-gray-900 dark:text-white">{config.alert.rate_limit_per_hour}</span>
                </div>
              </div>
            </div>
            <div className="rounded-2xl bg-gray-50 p-4 dark:bg-dark-700/50">
              <h4 className="mb-2 text-sm font-semibold text-gray-900 dark:text-white">{t('admin.ops.email.reportTitle')}</h4>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div className="text-xs text-gray-600 dark:text-gray-300">
                  {t('common.enabled')}: <span className="ml-1 font-medium text-gray-900 dark:text-white">{config.report.enabled ? t('common.enabled') : t('common.disabled')}</span>
                </div>
                <div className="text-xs text-gray-600 dark:text-gray-300">
                  {t('admin.ops.email.recipients')}: <span className="ml-1 font-medium text-gray-900 dark:text-white">{config.report.recipients.length}</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      <BaseDialog
        show={showEditor}
        title={t('admin.ops.email.title')}
        width="extra-wide"
        onClose={() => setShowEditor(false)}
        footer={
          <div className="flex justify-end gap-2">
            <button type="button" className="btn btn-secondary" onClick={() => setShowEditor(false)}>{t('common.cancel')}</button>
            <button type="button" className="btn btn-primary" disabled={saving || !editorValidation.valid} onClick={() => void saveConfig()}>
              {saving ? t('common.saving') : t('common.save')}
            </button>
          </div>
        }
      >
        {draft && (
          <div className="space-y-6">
            {!editorValidation.valid && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-900/50 dark:bg-amber-900/20 dark:text-amber-200">
                <div className="font-bold">{t('admin.ops.email.validation.title')}</div>
                <ul className="mt-1 list-disc space-y-1 pl-4">
                  {editorValidation.errors.map((msg) => (
                    <li key={msg}>{msg}</li>
                  ))}
                </ul>
              </div>
            )}
            <div className="rounded-2xl bg-gray-50 p-4 dark:bg-dark-700/50">
              <h4 className="mb-3 text-sm font-semibold text-gray-900 dark:text-white">{t('admin.ops.email.alertTitle')}</h4>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <div className="mb-1 text-xs font-medium text-gray-600 dark:text-gray-300">{t('common.enabled')}</div>
                  <label className="inline-flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                    <input type="checkbox" className="h-4 w-4 rounded border-gray-300" checked={draft.alert.enabled} onChange={(e) => setDraft({ ...draft, alert: { ...draft.alert, enabled: e.target.checked } })} />
                    <span>{draft.alert.enabled ? t('common.enabled') : t('common.disabled')}</span>
                  </label>
                </div>
                <div>
                  <div className="mb-1 text-xs font-medium text-gray-600 dark:text-gray-300">{t('admin.ops.email.minSeverity')}</div>
                  <Select modelValue={draft.alert.min_severity} options={severityOptions} onUpdateModelValue={(v) => setDraft({ ...draft, alert: { ...draft.alert, min_severity: String(v) as AlertSeverity | '' } })} />
                </div>
                <div className="md:col-span-2">
                  <div className="mb-1 text-xs font-medium text-gray-600 dark:text-gray-300">{t('admin.ops.email.recipients')}</div>
                  <div className="flex gap-2">
                    <input type="email" className="input" value={alertRecipientInput} placeholder={t('admin.ops.email.recipients')} onChange={(e) => setAlertRecipientInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addRecipient('alert') } }} />
                    <button type="button" className="btn btn-secondary whitespace-nowrap" onClick={() => addRecipient('alert')}>{t('common.add')}</button>
                  </div>
                  {alertRecipientError && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{alertRecipientError}</p>}
                  <div className="mt-2 flex flex-wrap gap-2">
                    {draft.alert.recipients.map((email) => (
                      <span key={email} className="inline-flex items-center gap-2 rounded-full bg-blue-100 px-3 py-1 text-xs font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                        {email}
                        <button type="button" className="text-blue-700/80 hover:text-blue-900 dark:text-blue-300" onClick={() => removeRecipient('alert', email)}>×</button>
                      </span>
                    ))}
                  </div>
                  <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">{t('admin.ops.email.recipientsHint')}</div>
                </div>
                <div>
                  <div className="mb-1 text-xs font-medium text-gray-600 dark:text-gray-300">{t('admin.ops.email.rateLimitPerHour')}</div>
                  <input type="number" min={0} max={100000} className="input" value={draft.alert.rate_limit_per_hour} onChange={(e) => setDraft({ ...draft, alert: { ...draft.alert, rate_limit_per_hour: Number(e.target.value) } })} />
                </div>
                <div>
                  <div className="mb-1 text-xs font-medium text-gray-600 dark:text-gray-300">{t('admin.ops.email.batchWindowSeconds')}</div>
                  <input type="number" min={0} max={86400} className="input" value={draft.alert.batching_window_seconds} onChange={(e) => setDraft({ ...draft, alert: { ...draft.alert, batching_window_seconds: Number(e.target.value) } })} />
                </div>
                <div>
                  <div className="mb-1 text-xs font-medium text-gray-600 dark:text-gray-300">{t('admin.ops.email.includeResolved')}</div>
                  <label className="inline-flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                    <input type="checkbox" className="h-4 w-4 rounded border-gray-300" checked={draft.alert.include_resolved_alerts} onChange={(e) => setDraft({ ...draft, alert: { ...draft.alert, include_resolved_alerts: e.target.checked } })} />
                    <span>{draft.alert.include_resolved_alerts ? t('common.enabled') : t('common.disabled')}</span>
                  </label>
                </div>
              </div>
            </div>
            <div className="rounded-2xl bg-gray-50 p-4 dark:bg-dark-700/50">
              <h4 className="mb-3 text-sm font-semibold text-gray-900 dark:text-white">{t('admin.ops.email.reportTitle')}</h4>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <div className="mb-1 text-xs font-medium text-gray-600 dark:text-gray-300">{t('common.enabled')}</div>
                  <label className="inline-flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                    <input type="checkbox" className="h-4 w-4 rounded border-gray-300" checked={draft.report.enabled} onChange={(e) => setDraft({ ...draft, report: { ...draft.report, enabled: e.target.checked } })} />
                    <span>{draft.report.enabled ? t('common.enabled') : t('common.disabled')}</span>
                  </label>
                </div>
                <div className="md:col-span-2">
                  <div className="mb-1 text-xs font-medium text-gray-600 dark:text-gray-300">{t('admin.ops.email.recipients')}</div>
                  <div className="flex gap-2">
                    <input type="email" className="input" value={reportRecipientInput} placeholder={t('admin.ops.email.recipients')} onChange={(e) => setReportRecipientInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addRecipient('report') } }} />
                    <button type="button" className="btn btn-secondary whitespace-nowrap" onClick={() => addRecipient('report')}>{t('common.add')}</button>
                  </div>
                  {reportRecipientError && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{reportRecipientError}</p>}
                  <div className="mt-2 flex flex-wrap gap-2">
                    {draft.report.recipients.map((email) => (
                      <span key={email} className="inline-flex items-center gap-2 rounded-full bg-blue-100 px-3 py-1 text-xs font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                        {email}
                        <button type="button" className="text-blue-700/80 hover:text-blue-900 dark:text-blue-300" onClick={() => removeRecipient('report', email)}>×</button>
                      </span>
                    ))}
                  </div>
                </div>
                <div className="md:col-span-2">
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    {(
                      [
                        ['daily_summary_enabled', 'daily_summary_schedule', 'dailySummary'],
                        ['weekly_summary_enabled', 'weekly_summary_schedule', 'weeklySummary'],
                        ['error_digest_enabled', 'error_digest_schedule', 'errorDigest'],
                        ['account_health_enabled', 'account_health_schedule', 'accountHealth'],
                      ] as const
                    ).map(([enabledKey, scheduleKey, labelKey]) => (
                      <div key={enabledKey}>
                        <div className="mb-1 text-xs font-medium text-gray-600 dark:text-gray-300">{t(`admin.ops.email.${labelKey}`)}</div>
                        <div className="flex items-center gap-2">
                          <input type="checkbox" className="h-4 w-4 rounded border-gray-300" checked={draft.report[enabledKey]} onChange={(e) => setDraft({ ...draft, report: { ...draft.report, [enabledKey]: e.target.checked } })} />
                          <input type="text" className="input" placeholder={t('admin.ops.email.cronPlaceholder')} value={draft.report[scheduleKey]} onChange={(e) => setDraft({ ...draft, report: { ...draft.report, [scheduleKey]: e.target.value } })} />
                        </div>
                      </div>
                    ))}
                    <div>
                      <div className="mb-1 text-xs font-medium text-gray-600 dark:text-gray-300">{t('admin.ops.email.errorDigestMinCount')}</div>
                      <input type="number" min={0} max={1000000} className="input" value={draft.report.error_digest_min_count} onChange={(e) => setDraft({ ...draft, report: { ...draft.report, error_digest_min_count: Number(e.target.value) } })} />
                    </div>
                    <div>
                      <div className="mb-1 text-xs font-medium text-gray-600 dark:text-gray-300">{t('admin.ops.email.accountHealthThreshold')}</div>
                      <input type="number" min={0} max={100} step={0.1} className="input" value={draft.report.account_health_error_rate_threshold} onChange={(e) => setDraft({ ...draft, report: { ...draft.report, account_health_error_rate_threshold: Number(e.target.value) } })} />
                    </div>
                  </div>
                  <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">{t('admin.ops.email.reportHint')}</div>
                </div>
              </div>
            </div>
          </div>
        )}
      </BaseDialog>
    </>
  )
}
