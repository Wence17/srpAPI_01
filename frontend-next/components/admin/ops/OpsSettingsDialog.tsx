'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useI18n } from '@/lib/i18n'
import { useApp } from '@/context/AppContext'
import { adminOpsAPI } from '@/lib/adminOps'
import BaseDialog from '@/components/common/BaseDialog'
import Select from '@/components/common/Select'
import Toggle from '@/components/common/Toggle'
import type {
  AlertSeverity,
  EmailNotificationConfig,
  OpsAdvancedSettings,
  OpsAlertRuntimeSettings,
  OpsMetricThresholds,
} from '@/lib/opsTypes'

interface OpsSettingsDialogProps {
  show: boolean
  onClose: () => void
  onSaved: () => void
}

export default function OpsSettingsDialog({ show, onClose, onSaved }: OpsSettingsDialogProps) {
  const { t } = useI18n()
  const appStore = useApp()

  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [runtimeSettings, setRuntimeSettings] = useState<OpsAlertRuntimeSettings | null>(null)
  const [emailConfig, setEmailConfig] = useState<EmailNotificationConfig | null>(null)
  const [advancedSettings, setAdvancedSettings] = useState<OpsAdvancedSettings | null>(null)
  const [metricThresholds, setMetricThresholds] = useState<OpsMetricThresholds>({
    sla_percent_min: 99.5,
    ttft_p99_ms_max: 500,
    request_error_rate_percent_max: 5,
    upstream_error_rate_percent_max: 5,
  })
  const [alertRecipientInput, setAlertRecipientInput] = useState('')
  const [reportRecipientInput, setReportRecipientInput] = useState('')

  const severityOptions = useMemo<Array<{ value: AlertSeverity | ''; label: string }>>(
    () => [
      { value: '', label: t('admin.ops.email.minSeverityAll') },
      { value: 'critical', label: t('common.critical') },
      { value: 'warning', label: t('common.warning') },
      { value: 'info', label: t('common.info') },
    ],
    [t],
  )

  const loadAllSettings = useCallback(async () => {
    setLoading(true)
    try {
      const [runtime, email, advanced, thresholds] = await Promise.all([
        adminOpsAPI.getAlertRuntimeSettings(),
        adminOpsAPI.getEmailNotificationConfig(),
        adminOpsAPI.getAdvancedSettings(),
        adminOpsAPI.getMetricThresholds(),
      ])
      setRuntimeSettings(runtime)
      setEmailConfig(email)
      const adv = { ...advanced }
      if (!adv.openai_account_quota_auto_pause) {
        adv.openai_account_quota_auto_pause = { default_threshold_5h: 0, default_threshold_7d: 0 }
      }
      setAdvancedSettings(adv)
      if (thresholds && Object.keys(thresholds).length > 0) {
        setMetricThresholds({
          sla_percent_min: thresholds.sla_percent_min ?? 99.5,
          ttft_p99_ms_max: thresholds.ttft_p99_ms_max ?? 500,
          request_error_rate_percent_max: thresholds.request_error_rate_percent_max ?? 5,
          upstream_error_rate_percent_max: thresholds.upstream_error_rate_percent_max ?? 5,
        })
      }
    } catch (err: unknown) {
      console.error('[OpsSettingsDialog] Failed to load settings', err)
      const detail =
        err &&
        typeof err === 'object' &&
        'response' in err &&
        (err as { response?: { data?: { detail?: string } } }).response?.data?.detail
      appStore.showError(typeof detail === 'string' ? detail : t('admin.ops.settings.loadFailed'))
    } finally {
      setLoading(false)
    }
  }, [appStore, t])

  useEffect(() => {
    if (show) void loadAllSettings()
  }, [show, loadAllSettings])

  const isValidEmailAddress = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)

  const addRecipient = (target: 'alert' | 'report') => {
    if (!emailConfig) return
    const raw = (target === 'alert' ? alertRecipientInput : reportRecipientInput).trim()
    if (!raw) return
    if (!isValidEmailAddress(raw)) {
      appStore.showError(t('common.invalidEmail'))
      return
    }
    const normalized = raw.toLowerCase()
    const list = target === 'alert' ? emailConfig.alert.recipients : emailConfig.report.recipients
    if (!list.includes(normalized)) list.push(normalized)
    if (target === 'alert') setAlertRecipientInput('')
    else setReportRecipientInput('')
  }

  const removeRecipient = (target: 'alert' | 'report', email: string) => {
    if (!emailConfig) return
    const list = target === 'alert' ? emailConfig.alert.recipients : emailConfig.report.recipients
    const idx = list.indexOf(email)
    if (idx >= 0) list.splice(idx, 1)
    setEmailConfig({ ...emailConfig })
  }

  const quotaAutoPause5hPercent = useMemo(() => {
    const v = advancedSettings?.openai_account_quota_auto_pause?.default_threshold_5h
    return v && v > 0 ? Math.round(v * 1000) / 10 : null
  }, [advancedSettings])

  const quotaAutoPause7dPercent = useMemo(() => {
    const v = advancedSettings?.openai_account_quota_auto_pause?.default_threshold_7d
    return v && v > 0 ? Math.round(v * 1000) / 10 : null
  }, [advancedSettings])

  const setQuotaAutoPause5hPercent = (val: number | null) => {
    if (!advancedSettings?.openai_account_quota_auto_pause) return
    setAdvancedSettings({
      ...advancedSettings,
      openai_account_quota_auto_pause: {
        ...advancedSettings.openai_account_quota_auto_pause,
        default_threshold_5h: val != null && val > 0 ? val / 100 : 0,
      },
    })
  }

  const setQuotaAutoPause7dPercent = (val: number | null) => {
    if (!advancedSettings?.openai_account_quota_auto_pause) return
    setAdvancedSettings({
      ...advancedSettings,
      openai_account_quota_auto_pause: {
        ...advancedSettings.openai_account_quota_auto_pause,
        default_threshold_7d: val != null && val > 0 ? val / 100 : 0,
      },
    })
  }

  const validation = useMemo(() => {
    const errors: string[] = []
    if (runtimeSettings) {
      const evalSeconds = runtimeSettings.evaluation_interval_seconds
      if (!Number.isFinite(evalSeconds) || evalSeconds < 1 || evalSeconds > 86400) {
        errors.push(t('admin.ops.runtime.validation.evalIntervalRange'))
      }
    }
    if (advancedSettings) {
      const { error_log_retention_days, minute_metrics_retention_days, hourly_metrics_retention_days } =
        advancedSettings.data_retention
      for (const days of [error_log_retention_days, minute_metrics_retention_days, hourly_metrics_retention_days]) {
        if (days < 0 || days > 365) errors.push(t('admin.ops.settings.validation.retentionDaysRange'))
      }
      const { default_threshold_5h, default_threshold_7d } = advancedSettings.openai_account_quota_auto_pause
      if (default_threshold_5h < 0 || default_threshold_5h > 1 || default_threshold_7d < 0 || default_threshold_7d > 1) {
        errors.push(t('admin.ops.settings.validation.openaiQuotaAutoPauseRange'))
      }
    }
    if (metricThresholds.sla_percent_min != null && (metricThresholds.sla_percent_min < 0 || metricThresholds.sla_percent_min > 100)) {
      errors.push(t('admin.ops.settings.validation.slaMinPercentRange'))
    }
    if (metricThresholds.ttft_p99_ms_max != null && metricThresholds.ttft_p99_ms_max < 0) {
      errors.push(t('admin.ops.settings.validation.ttftP99MaxRange'))
    }
    if (
      metricThresholds.request_error_rate_percent_max != null &&
      (metricThresholds.request_error_rate_percent_max < 0 || metricThresholds.request_error_rate_percent_max > 100)
    ) {
      errors.push(t('admin.ops.settings.validation.requestErrorRateMaxRange'))
    }
    if (
      metricThresholds.upstream_error_rate_percent_max != null &&
      (metricThresholds.upstream_error_rate_percent_max < 0 || metricThresholds.upstream_error_rate_percent_max > 100)
    ) {
      errors.push(t('admin.ops.settings.validation.upstreamErrorRateMaxRange'))
    }
    return { valid: errors.length === 0, errors }
  }, [runtimeSettings, advancedSettings, metricThresholds, t])

  const saveAllSettings = async () => {
    if (!validation.valid) {
      appStore.showError(validation.errors[0])
      return
    }
    setSaving(true)
    try {
      const email = emailConfig ? { ...emailConfig } : null
      if (email) {
        if (email.alert.enabled && email.alert.recipients.length === 0) email.alert.enabled = false
        if (email.report.enabled && email.report.recipients.length === 0) email.report.enabled = false
      }
      await Promise.all([
        runtimeSettings ? adminOpsAPI.updateAlertRuntimeSettings(runtimeSettings) : Promise.resolve(),
        email ? adminOpsAPI.updateEmailNotificationConfig(email) : Promise.resolve(),
        advancedSettings ? adminOpsAPI.updateAdvancedSettings(advancedSettings) : Promise.resolve(),
        adminOpsAPI.updateMetricThresholds(metricThresholds),
      ])
      appStore.showSuccess(t('admin.ops.settings.saveSuccess'))
      onSaved()
      onClose()
    } catch (err: unknown) {
      console.error('[OpsSettingsDialog] Failed to save settings', err)
      const resp =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response?: { data?: { message?: string; detail?: string } } }).response?.data
          : undefined
      appStore.showError(resp?.message || resp?.detail || t('admin.ops.settings.saveFailed'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <BaseDialog show={show} title={t('admin.ops.settings.title')} width="extra-wide" onClose={onClose}
      footer={
        <div className="flex justify-end gap-2">
          <button type="button" className="btn btn-secondary" onClick={onClose}>{t('common.cancel')}</button>
          <button type="button" className="btn btn-primary" disabled={saving || !validation.valid} onClick={() => void saveAllSettings()}>
            {saving ? t('common.saving') : t('common.save')}
          </button>
        </div>
      }
    >
      {loading ? (
        <div className="py-10 text-center text-sm text-gray-500">{t('common.loading')}</div>
      ) : runtimeSettings && emailConfig && advancedSettings ? (
        <div className="space-y-6">
          {!validation.valid && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-900/50 dark:bg-amber-900/20 dark:text-amber-200">
              <div className="font-bold">{t('admin.ops.settings.validation.title')}</div>
              <ul className="mt-1 list-disc space-y-1 pl-4">
                {validation.errors.map((msg) => (
                  <li key={msg}>{msg}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="rounded-2xl bg-gray-50 p-4 dark:bg-dark-700/50">
            <h4 className="mb-3 text-sm font-semibold text-gray-900 dark:text-white">{t('admin.ops.settings.dataCollection')}</h4>
            <div>
              <label className="input-label">{t('admin.ops.settings.evaluationInterval')}</label>
              <input
                type="number"
                min={1}
                max={86400}
                className="input"
                value={runtimeSettings.evaluation_interval_seconds}
                onChange={(e) =>
                  setRuntimeSettings({ ...runtimeSettings, evaluation_interval_seconds: Number(e.target.value) })
                }
              />
              <p className="mt-1 text-xs text-gray-500">{t('admin.ops.settings.evaluationIntervalHint')}</p>
            </div>
          </div>

          <div className="rounded-2xl bg-gray-50 p-4 dark:bg-dark-700/50">
            <h4 className="mb-3 text-sm font-semibold text-gray-900 dark:text-white">{t('admin.ops.settings.alertConfig')}</h4>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <label className="font-medium text-gray-900 dark:text-white">{t('admin.ops.settings.enableAlert')}</label>
                <Toggle
                  modelValue={emailConfig.alert.enabled}
                  onUpdateModelValue={(v) => setEmailConfig({ ...emailConfig, alert: { ...emailConfig.alert, enabled: v } })}
                />
              </div>
              {emailConfig.alert.enabled && (
                <>
                  <div>
                    <label className="input-label">{t('admin.ops.settings.alertRecipients')}</label>
                    <div className="flex gap-2">
                      <input
                        type="email"
                        className="input"
                        value={alertRecipientInput}
                        placeholder={t('admin.ops.settings.emailPlaceholder')}
                        onChange={(e) => setAlertRecipientInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault()
                            addRecipient('alert')
                          }
                        }}
                      />
                      <button type="button" className="btn btn-secondary whitespace-nowrap" onClick={() => addRecipient('alert')}>
                        {t('common.add')}
                      </button>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {emailConfig.alert.recipients.map((email) => (
                        <span
                          key={email}
                          className="inline-flex items-center gap-2 rounded-full bg-blue-100 px-3 py-1 text-xs font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                        >
                          {email}
                          <button type="button" className="text-blue-700/80 hover:text-blue-900" onClick={() => removeRecipient('alert', email)}>
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                    <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">{t('admin.ops.settings.recipientsHint')}</p>
                  </div>
                  <div>
                    <label className="input-label">{t('admin.ops.settings.minSeverity')}</label>
                    <Select
                      modelValue={emailConfig.alert.min_severity}
                      options={severityOptions}
                      onUpdateModelValue={(v) =>
                        setEmailConfig({
                          ...emailConfig,
                          alert: { ...emailConfig.alert, min_severity: String(v) as AlertSeverity | '' },
                        })
                      }
                    />
                  </div>
                </>
              )}
            </div>
          </div>

          <div className="rounded-2xl bg-gray-50 p-4 dark:bg-dark-700/50">
            <h4 className="mb-3 text-sm font-semibold text-gray-900 dark:text-white">{t('admin.ops.settings.reportConfig')}</h4>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <label className="font-medium text-gray-900 dark:text-white">{t('admin.ops.settings.enableReport')}</label>
                <Toggle
                  modelValue={emailConfig.report.enabled}
                  onUpdateModelValue={(v) => setEmailConfig({ ...emailConfig, report: { ...emailConfig.report, enabled: v } })}
                />
              </div>
              {emailConfig.report.enabled && (
                <>
                  <div>
                    <label className="input-label">{t('admin.ops.settings.reportRecipients')}</label>
                    <div className="flex gap-2">
                      <input
                        type="email"
                        className="input"
                        value={reportRecipientInput}
                        placeholder={t('admin.ops.settings.emailPlaceholder')}
                        onChange={(e) => setReportRecipientInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault()
                            addRecipient('report')
                          }
                        }}
                      />
                      <button type="button" className="btn btn-secondary whitespace-nowrap" onClick={() => addRecipient('report')}>
                        {t('common.add')}
                      </button>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {emailConfig.report.recipients.map((email) => (
                        <span
                          key={email}
                          className="inline-flex items-center gap-2 rounded-full bg-blue-100 px-3 py-1 text-xs font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                        >
                          {email}
                          <button type="button" className="text-blue-700/80 hover:text-blue-900" onClick={() => removeRecipient('report', email)}>
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                    <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">{t('admin.ops.settings.recipientsHint')}</p>
                  </div>
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div className="flex items-center justify-between">
                      <label className="text-sm font-medium text-gray-700 dark:text-gray-300">{t('admin.ops.settings.dailySummary')}</label>
                      <Toggle
                        modelValue={emailConfig.report.daily_summary_enabled}
                        onUpdateModelValue={(v) =>
                          setEmailConfig({ ...emailConfig, report: { ...emailConfig.report, daily_summary_enabled: v } })
                        }
                      />
                    </div>
                    {emailConfig.report.daily_summary_enabled && (
                      <input
                        type="text"
                        className="input"
                        placeholder="0 9 * * *"
                        value={emailConfig.report.daily_summary_schedule}
                        onChange={(e) =>
                          setEmailConfig({ ...emailConfig, report: { ...emailConfig.report, daily_summary_schedule: e.target.value } })
                        }
                      />
                    )}
                    <div className="flex items-center justify-between">
                      <label className="text-sm font-medium text-gray-700 dark:text-gray-300">{t('admin.ops.settings.weeklySummary')}</label>
                      <Toggle
                        modelValue={emailConfig.report.weekly_summary_enabled}
                        onUpdateModelValue={(v) =>
                          setEmailConfig({ ...emailConfig, report: { ...emailConfig.report, weekly_summary_enabled: v } })
                        }
                      />
                    </div>
                    {emailConfig.report.weekly_summary_enabled && (
                      <input
                        type="text"
                        className="input"
                        placeholder="0 9 * * 1"
                        value={emailConfig.report.weekly_summary_schedule}
                        onChange={(e) =>
                          setEmailConfig({ ...emailConfig, report: { ...emailConfig.report, weekly_summary_schedule: e.target.value } })
                        }
                      />
                    )}
                  </div>
                </>
              )}
            </div>
          </div>

          <div className="rounded-2xl bg-gray-50 p-4 dark:bg-dark-700/50">
            <h4 className="mb-3 text-sm font-semibold text-gray-900 dark:text-white">{t('admin.ops.settings.metricThresholds')}</h4>
            <p className="mb-4 text-xs text-gray-500 dark:text-gray-400">{t('admin.ops.settings.metricThresholdsHint')}</p>
            <div className="space-y-4">
              {(
                [
                  ['sla_percent_min', 'admin.ops.settings.slaMinPercent', 'admin.ops.settings.slaMinPercentHint', { min: 0, max: 100, step: 0.1 }],
                  ['ttft_p99_ms_max', 'admin.ops.settings.ttftP99MaxMs', 'admin.ops.settings.ttftP99MaxMsHint', { min: 0, step: 50 }],
                  ['request_error_rate_percent_max', 'admin.ops.settings.requestErrorRateMaxPercent', 'admin.ops.settings.requestErrorRateMaxPercentHint', { min: 0, max: 100, step: 0.1 }],
                  ['upstream_error_rate_percent_max', 'admin.ops.settings.upstreamErrorRateMaxPercent', 'admin.ops.settings.upstreamErrorRateMaxPercentHint', { min: 0, max: 100, step: 0.1 }],
                ] as const
              ).map(([key, labelKey, hintKey, attrs]) => (
                <div key={key}>
                  <label className="input-label">{t(labelKey)}</label>
                  <input
                    type="number"
                    className="input"
                    value={metricThresholds[key] ?? ''}
                    {...attrs}
                    onChange={(e) => setMetricThresholds({ ...metricThresholds, [key]: Number(e.target.value) })}
                  />
                  <p className="mt-1 text-xs text-gray-500">{t(hintKey)}</p>
                </div>
              ))}
            </div>
          </div>

          <details className="rounded-2xl bg-gray-50 dark:bg-dark-700/50">
            <summary className="cursor-pointer p-4 text-sm font-semibold text-gray-900 dark:text-white">
              {t('admin.ops.settings.advancedSettings')}
            </summary>
            <div className="space-y-4 px-4 pb-4">
              <div className="space-y-3">
                <h5 className="text-xs font-semibold text-gray-700 dark:text-gray-300">{t('admin.ops.settings.dataRetention')}</h5>
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">{t('admin.ops.settings.enableCleanup')}</label>
                  <Toggle
                    modelValue={advancedSettings.data_retention.cleanup_enabled}
                    onUpdateModelValue={(v) =>
                      setAdvancedSettings({
                        ...advancedSettings,
                        data_retention: { ...advancedSettings.data_retention, cleanup_enabled: v },
                      })
                    }
                  />
                </div>
                {advancedSettings.data_retention.cleanup_enabled && (
                  <div>
                    <label className="input-label">{t('admin.ops.settings.cleanupSchedule')}</label>
                    <input
                      type="text"
                      className="input"
                      placeholder="0 2 * * *"
                      value={advancedSettings.data_retention.cleanup_schedule}
                      onChange={(e) =>
                        setAdvancedSettings({
                          ...advancedSettings,
                          data_retention: { ...advancedSettings.data_retention, cleanup_schedule: e.target.value },
                        })
                      }
                    />
                    <p className="mt-1 text-xs text-gray-500">{t('admin.ops.settings.cleanupScheduleHint')}</p>
                  </div>
                )}
                <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                  {(
                    [
                      ['error_log_retention_days', 'errorLogRetentionDays'],
                      ['minute_metrics_retention_days', 'minuteMetricsRetentionDays'],
                      ['hourly_metrics_retention_days', 'hourlyMetricsRetentionDays'],
                    ] as const
                  ).map(([key, labelKey]) => (
                    <div key={key}>
                      <label className="input-label">{t(`admin.ops.settings.${labelKey}`)}</label>
                      <input
                        type="number"
                        min={0}
                        max={365}
                        className="input"
                        value={advancedSettings.data_retention[key]}
                        onChange={(e) =>
                          setAdvancedSettings({
                            ...advancedSettings,
                            data_retention: { ...advancedSettings.data_retention, [key]: Number(e.target.value) },
                          })
                        }
                      />
                    </div>
                  ))}
                </div>
                <p className="text-xs text-gray-500">{t('admin.ops.settings.retentionDaysHint')}</p>
              </div>

              <div className="space-y-3">
                <h5 className="text-xs font-semibold text-gray-700 dark:text-gray-300">{t('admin.ops.settings.aggregation')}</h5>
                <div className="flex items-center justify-between">
                  <div>
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300">{t('admin.ops.settings.enableAggregation')}</label>
                    <p className="mt-1 text-xs text-gray-500">{t('admin.ops.settings.aggregationHint')}</p>
                  </div>
                  <Toggle
                    modelValue={advancedSettings.aggregation.aggregation_enabled}
                    onUpdateModelValue={(v) =>
                      setAdvancedSettings({
                        ...advancedSettings,
                        aggregation: { ...advancedSettings.aggregation, aggregation_enabled: v },
                      })
                    }
                  />
                </div>
              </div>

              <div className="space-y-3">
                <h5 className="text-xs font-semibold text-gray-700 dark:text-gray-300">{t('admin.ops.settings.openaiQuotaAutoPause')}</h5>
                <p className="text-xs text-gray-500">{t('admin.ops.settings.openaiQuotaAutoPauseHint')}</p>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div>
                    <label className="input-label">{t('admin.ops.settings.openaiQuotaAutoPauseDefault5h')}</label>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      step={0.1}
                      className="input"
                      data-testid="ops-quota-auto-pause-5h"
                      value={quotaAutoPause5hPercent ?? ''}
                      onChange={(e) => setQuotaAutoPause5hPercent(e.target.value ? Number(e.target.value) : null)}
                    />
                  </div>
                  <div>
                    <label className="input-label">{t('admin.ops.settings.openaiQuotaAutoPauseDefault7d')}</label>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      step={0.1}
                      className="input"
                      data-testid="ops-quota-auto-pause-7d"
                      value={quotaAutoPause7dPercent ?? ''}
                      onChange={(e) => setQuotaAutoPause7dPercent(e.target.value ? Number(e.target.value) : null)}
                    />
                  </div>
                </div>
                <p className="text-xs text-gray-500">{t('admin.ops.settings.openaiQuotaAutoPauseThresholdHint')}</p>
              </div>

              <div className="space-y-3">
                <h5 className="text-xs font-semibold text-gray-700 dark:text-gray-300">{t('admin.ops.settings.errorFiltering')}</h5>
                {(
                  [
                    ['ignore_count_tokens_errors', 'ignoreCountTokensErrors'],
                    ['ignore_context_canceled', 'ignoreContextCanceled'],
                    ['ignore_no_available_accounts', 'ignoreNoAvailableAccounts'],
                    ['ignore_invalid_api_key_errors', 'ignoreInvalidApiKeyErrors'],
                    ['ignore_insufficient_balance_errors', 'ignoreInsufficientBalanceErrors'],
                  ] as const
                ).map(([key, label]) => (
                  <div key={key} className="flex items-center justify-between">
                    <div>
                      <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                        {t(`admin.ops.settings.${label}`)}
                      </label>
                      <p className="mt-1 text-xs text-gray-500">{t(`admin.ops.settings.${label}Hint`)}</p>
                    </div>
                    <Toggle
                      modelValue={advancedSettings[key]}
                      onUpdateModelValue={(v) => setAdvancedSettings({ ...advancedSettings, [key]: v })}
                    />
                  </div>
                ))}
              </div>

              <div className="space-y-3">
                <h5 className="text-xs font-semibold text-gray-700 dark:text-gray-300">{t('admin.ops.settings.autoRefresh')}</h5>
                <div className="flex items-center justify-between">
                  <div>
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300">{t('admin.ops.settings.enableAutoRefresh')}</label>
                    <p className="mt-1 text-xs text-gray-500">{t('admin.ops.settings.enableAutoRefreshHint')}</p>
                  </div>
                  <Toggle
                    modelValue={advancedSettings.auto_refresh_enabled}
                    onUpdateModelValue={(v) => setAdvancedSettings({ ...advancedSettings, auto_refresh_enabled: v })}
                  />
                </div>
                {advancedSettings.auto_refresh_enabled && (
                  <div>
                    <label className="input-label">{t('admin.ops.settings.refreshInterval')}</label>
                    <Select
                      modelValue={advancedSettings.auto_refresh_interval_seconds}
                      options={[
                        { value: 15, label: t('admin.ops.settings.refreshInterval15s') },
                        { value: 30, label: t('admin.ops.settings.refreshInterval30s') },
                        { value: 60, label: t('admin.ops.settings.refreshInterval60s') },
                      ]}
                      onUpdateModelValue={(v) =>
                        setAdvancedSettings({ ...advancedSettings, auto_refresh_interval_seconds: Number(v) })
                      }
                    />
                  </div>
                )}
              </div>

              <div className="space-y-3">
                <h5 className="text-xs font-semibold text-gray-700 dark:text-gray-300">{t('admin.ops.settings.dashboardCards')}</h5>
                {(
                  [
                    ['display_alert_events', 'displayAlertEvents'],
                    ['display_openai_token_stats', 'displayOpenAITokenStats'],
                  ] as const
                ).map(([key, label]) => (
                  <div key={key} className="flex items-center justify-between">
                    <div>
                      <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                        {t(`admin.ops.settings.${label}`)}
                      </label>
                      <p className="mt-1 text-xs text-gray-500">{t(`admin.ops.settings.${label}Hint`)}</p>
                    </div>
                    <Toggle
                      modelValue={advancedSettings[key]}
                      onUpdateModelValue={(v) => setAdvancedSettings({ ...advancedSettings, [key]: v })}
                    />
                  </div>
                ))}
              </div>
            </div>
          </details>
        </div>
      ) : null}
    </BaseDialog>
  )
}
