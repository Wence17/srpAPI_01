'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useI18n } from '@/lib/i18n'
import { useApp } from '@/context/AppContext'
import { adminOpsAPI } from '@/lib/adminOps'
import type { OpsAlertRuntimeSettings } from '@/lib/opsTypes'
import BaseDialog from '@/components/common/BaseDialog'

type ValidationResult = { valid: boolean; errors: string[] }

function normalizeSeverities(input: Array<string | null | undefined> | null | undefined): string[] {
  if (!input || input.length === 0) return []
  const allowed = new Set(['P0', 'P1', 'P2', 'P3'])
  const out: string[] = []
  const seen = new Set<string>()
  for (const raw of input) {
    const s = String(raw || '').trim().toUpperCase()
    if (!s || !allowed.has(s) || seen.has(s)) continue
    seen.add(s)
    out.push(s)
  }
  return out
}

export default function OpsRuntimeSettingsCard() {
  const { t } = useI18n()
  const appStore = useApp()

  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [alertSettings, setAlertSettings] = useState<OpsAlertRuntimeSettings | null>(null)
  const [showAlertEditor, setShowAlertEditor] = useState(false)
  const [draftAlert, setDraftAlert] = useState<OpsAlertRuntimeSettings | null>(null)

  const validateRuntimeSettings = useCallback(
    (settings: OpsAlertRuntimeSettings): ValidationResult => {
      const errors: string[] = []
      const evalSeconds = settings.evaluation_interval_seconds
      if (!Number.isFinite(evalSeconds) || evalSeconds < 1 || evalSeconds > 86400) {
        errors.push(t('admin.ops.runtime.validation.evalIntervalRange'))
      }
      const thresholds = settings.thresholds
      if (thresholds) {
        if (thresholds.sla_percent_min != null && (thresholds.sla_percent_min < 0 || thresholds.sla_percent_min > 100)) {
          errors.push(t('admin.ops.runtime.validation.slaMinPercentRange'))
        }
        if (thresholds.ttft_p99_ms_max != null && thresholds.ttft_p99_ms_max < 0) {
          errors.push(t('admin.ops.runtime.validation.ttftP99MaxRange'))
        }
        if (
          thresholds.request_error_rate_percent_max != null &&
          (thresholds.request_error_rate_percent_max < 0 || thresholds.request_error_rate_percent_max > 100)
        ) {
          errors.push(t('admin.ops.runtime.validation.requestErrorRateMaxRange'))
        }
        if (
          thresholds.upstream_error_rate_percent_max != null &&
          (thresholds.upstream_error_rate_percent_max < 0 || thresholds.upstream_error_rate_percent_max > 100)
        ) {
          errors.push(t('admin.ops.runtime.validation.upstreamErrorRateMaxRange'))
        }
      }
      const lock = settings.distributed_lock
      if (lock?.enabled) {
        if (!lock.key || lock.key.trim().length < 3) errors.push(t('admin.ops.runtime.validation.lockKeyRequired'))
        else if (!lock.key.startsWith('ops:')) errors.push(t('admin.ops.runtime.validation.lockKeyPrefix', { prefix: 'ops:' }))
        if (!Number.isFinite(lock.ttl_seconds) || lock.ttl_seconds < 1 || lock.ttl_seconds > 86400) {
          errors.push(t('admin.ops.runtime.validation.lockTtlRange'))
        }
      }
      const silencing = settings.silencing
      if (silencing?.enabled) {
        const until = (silencing.global_until_rfc3339 || '').trim()
        if (until && !Number.isFinite(Date.parse(until))) errors.push(t('admin.ops.runtime.silencing.validation.timeFormat'))
        const entries = Array.isArray(silencing.entries) ? silencing.entries : []
        for (const entry of entries) {
          const untilEntry = (entry?.until_rfc3339 || '').trim()
          if (!untilEntry) {
            errors.push(t('admin.ops.runtime.silencing.entries.validation.untilRequired'))
            break
          }
          if (!Number.isFinite(Date.parse(untilEntry))) {
            errors.push(t('admin.ops.runtime.silencing.entries.validation.untilFormat'))
            break
          }
          const ruleId = (entry as { rule_id?: number }).rule_id
          if (typeof ruleId === 'number' && (!Number.isFinite(ruleId) || ruleId <= 0)) {
            errors.push(t('admin.ops.runtime.silencing.entries.validation.ruleIdPositive'))
            break
          }
        }
      }
      return { valid: errors.length === 0, errors }
    },
    [t],
  )

  const alertValidation = useMemo(() => {
    if (!draftAlert) return { valid: true, errors: [] as string[] }
    return validateRuntimeSettings(draftAlert)
  }, [draftAlert, validateRuntimeSettings])

  const loadSettings = useCallback(async () => {
    setLoading(true)
    try {
      setAlertSettings(await adminOpsAPI.getAlertRuntimeSettings())
    } catch (err: unknown) {
      console.error('[OpsRuntimeSettingsCard] Failed to load runtime settings', err)
      const detail =
        err &&
        typeof err === 'object' &&
        'response' in err &&
        (err as { response?: { data?: { detail?: string } } }).response?.data?.detail
      appStore.showError(typeof detail === 'string' ? detail : t('admin.ops.runtime.loadFailed'))
    } finally {
      setLoading(false)
    }
  }, [appStore, t])

  useEffect(() => {
    void loadSettings()
  }, [loadSettings])

  const openAlertEditor = () => {
    if (!alertSettings) return
    const draft = JSON.parse(JSON.stringify(alertSettings)) as OpsAlertRuntimeSettings
    if (!draft.distributed_lock) draft.distributed_lock = { enabled: true, key: 'ops:alert:evaluator:leader', ttl_seconds: 30 }
    if (!draft.silencing) draft.silencing = { enabled: false, global_until_rfc3339: '', global_reason: '', entries: [] }
    if (!Array.isArray(draft.silencing.entries)) draft.silencing.entries = []
    if (!draft.thresholds) {
      draft.thresholds = {
        sla_percent_min: 99.5,
        ttft_p99_ms_max: 500,
        request_error_rate_percent_max: 5,
        upstream_error_rate_percent_max: 5,
      }
    }
    setDraftAlert(draft)
    setShowAlertEditor(true)
  }

  const addSilenceEntry = () => {
    if (!draftAlert) return
    const silencing = draftAlert.silencing || { enabled: true, global_until_rfc3339: '', global_reason: '', entries: [] }
    setDraftAlert({
      ...draftAlert,
      silencing: {
        ...silencing,
        entries: [...(silencing.entries || []), { rule_id: undefined, severities: [], until_rfc3339: '', reason: '' }],
      },
    })
  }

  const removeSilenceEntry = (index: number) => {
    if (!draftAlert?.silencing?.entries) return
    setDraftAlert({
      ...draftAlert,
      silencing: {
        ...draftAlert.silencing,
        entries: draftAlert.silencing.entries.filter((_, i) => i !== index),
      },
    })
  }

  const saveAlertSettings = async () => {
    if (!draftAlert || !alertValidation.valid) {
      appStore.showError(alertValidation.errors[0] || t('admin.ops.runtime.validation.invalid'))
      return
    }
    setSaving(true)
    try {
      setAlertSettings(await adminOpsAPI.updateAlertRuntimeSettings(draftAlert))
      setShowAlertEditor(false)
      appStore.showSuccess(t('admin.ops.runtime.saveSuccess'))
    } catch (err: unknown) {
      console.error('[OpsRuntimeSettingsCard] Failed to save alert runtime settings', err)
      const detail =
        err &&
        typeof err === 'object' &&
        'response' in err &&
        (err as { response?: { data?: { detail?: string } } }).response?.data?.detail
      appStore.showError(typeof detail === 'string' ? detail : t('admin.ops.runtime.saveFailed'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-gray-900/5 dark:bg-dark-800 dark:ring-dark-700">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h3 className="text-sm font-bold text-gray-900 dark:text-white">{t('admin.ops.runtime.title')}</h3>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{t('admin.ops.runtime.description')}</p>
          </div>
          <button
            type="button"
            className="flex items-center gap-1.5 rounded-lg bg-gray-100 px-3 py-1.5 text-xs font-bold text-gray-700 transition-colors hover:bg-gray-200 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-dark-700 dark:text-gray-300 dark:hover:bg-dark-600"
            disabled={loading}
            onClick={() => void loadSettings()}
          >
            <svg className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            {t('common.refresh')}
          </button>
        </div>

        {!alertSettings ? (
          <div className="text-sm text-gray-500 dark:text-gray-400">
            {loading ? t('admin.ops.runtime.loading') : t('admin.ops.runtime.noData')}
          </div>
        ) : (
          <div className="space-y-6">
            <div className="rounded-2xl bg-gray-50 p-4 dark:bg-dark-700/50">
              <div className="mb-3 flex items-center justify-between">
                <h4 className="text-sm font-semibold text-gray-900 dark:text-white">{t('admin.ops.runtime.alertTitle')}</h4>
                <button type="button" className="btn btn-sm btn-secondary" onClick={openAlertEditor}>{t('common.edit')}</button>
              </div>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div className="text-xs text-gray-600 dark:text-gray-300">
                  {t('admin.ops.runtime.evalIntervalSeconds')}:
                  <span className="ml-1 font-medium text-gray-900 dark:text-white">{alertSettings.evaluation_interval_seconds}s</span>
                </div>
                {alertSettings.silencing?.enabled && alertSettings.silencing.global_until_rfc3339 && (
                  <div className="text-xs text-gray-600 dark:text-gray-300 md:col-span-2">
                    {t('admin.ops.runtime.silencing.globalUntil')}:
                    <span className="ml-1 font-mono text-gray-900 dark:text-white">{alertSettings.silencing.global_until_rfc3339}</span>
                  </div>
                )}
                <details className="col-span-1 md:col-span-2">
                  <summary className="cursor-pointer text-xs font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400">
                    {t('admin.ops.runtime.showAdvancedDeveloperSettings')}
                  </summary>
                  <div className="mt-2 grid grid-cols-1 gap-3 rounded-lg bg-gray-100 p-3 dark:bg-dark-800 md:grid-cols-2">
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      {t('admin.ops.runtime.lockEnabled')}: <span className="ml-1 font-mono text-gray-700 dark:text-gray-300">{String(alertSettings.distributed_lock.enabled)}</span>
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      {t('admin.ops.runtime.lockKey')}: <span className="ml-1 font-mono text-gray-700 dark:text-gray-300">{alertSettings.distributed_lock.key}</span>
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      {t('admin.ops.runtime.lockTTLSeconds')}: <span className="ml-1 font-mono text-gray-700 dark:text-gray-300">{alertSettings.distributed_lock.ttl_seconds}s</span>
                    </div>
                  </div>
                </details>
              </div>
            </div>
          </div>
        )}
      </div>

      <BaseDialog
        show={showAlertEditor}
        title={t('admin.ops.runtime.alertTitle')}
        width="extra-wide"
        onClose={() => setShowAlertEditor(false)}
        footer={
          <div className="flex justify-end gap-2">
            <button type="button" className="btn btn-secondary" onClick={() => setShowAlertEditor(false)}>{t('common.cancel')}</button>
            <button type="button" className="btn btn-primary" disabled={saving || !alertValidation.valid} onClick={() => void saveAlertSettings()}>
              {saving ? t('common.saving') : t('common.save')}
            </button>
          </div>
        }
      >
        {draftAlert && (
          <div className="space-y-4">
            {!alertValidation.valid && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-900/50 dark:bg-amber-900/20 dark:text-amber-200">
                <div className="font-bold">{t('admin.ops.runtime.validation.title')}</div>
                <ul className="mt-1 list-disc space-y-1 pl-4">
                  {alertValidation.errors.map((msg) => (
                    <li key={msg}>{msg}</li>
                  ))}
                </ul>
              </div>
            )}
            <div>
              <div className="mb-1 text-xs font-medium text-gray-600 dark:text-gray-300">{t('admin.ops.runtime.evalIntervalSeconds')}</div>
              <input
                type="number"
                min={1}
                max={86400}
                className="input"
                value={draftAlert.evaluation_interval_seconds}
                onChange={(e) => setDraftAlert({ ...draftAlert, evaluation_interval_seconds: Number(e.target.value) })}
              />
              <p className="mt-1 text-xs text-gray-500">{t('admin.ops.runtime.evalIntervalHint')}</p>
            </div>
            <div className="rounded-2xl bg-gray-50 p-4 dark:bg-dark-700/50">
              <div className="mb-2 text-sm font-semibold text-gray-900 dark:text-white">{t('admin.ops.runtime.metricThresholds')}</div>
              <p className="mb-4 text-xs text-gray-500 dark:text-gray-400">{t('admin.ops.runtime.metricThresholdsHint')}</p>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {(
                  [
                    ['sla_percent_min', 'slaMinPercent', 'slaMinPercentHint', { min: 0, max: 100, step: 0.1 }],
                    ['ttft_p99_ms_max', 'ttftP99MaxMs', 'ttftP99MaxMsHint', { min: 0, step: 100 }],
                    ['request_error_rate_percent_max', 'requestErrorRateMaxPercent', 'requestErrorRateMaxPercentHint', { min: 0, max: 100, step: 0.1 }],
                    ['upstream_error_rate_percent_max', 'upstreamErrorRateMaxPercent', 'upstreamErrorRateMaxPercentHint', { min: 0, max: 100, step: 0.1 }],
                  ] as const
                ).map(([key, label, hint, attrs]) => (
                  <div key={key}>
                    <div className="mb-1 text-xs font-medium text-gray-600 dark:text-gray-300">{t(`admin.ops.runtime.${label}`)}</div>
                    <input
                      type="number"
                      className="input"
                      value={draftAlert.thresholds?.[key] ?? ''}
                      {...attrs}
                      onChange={(e) =>
                        setDraftAlert({
                          ...draftAlert,
                          thresholds: { ...draftAlert.thresholds!, [key]: Number(e.target.value) },
                        })
                      }
                    />
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{t(`admin.ops.runtime.${hint}`)}</p>
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-2xl bg-gray-50 p-4 dark:bg-dark-700/50">
              <div className="mb-2 text-sm font-semibold text-gray-900 dark:text-white">{t('admin.ops.runtime.silencing.title')}</div>
              <label className="inline-flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-gray-300"
                  checked={draftAlert.silencing?.enabled ?? false}
                  onChange={(e) =>
                    setDraftAlert({
                      ...draftAlert,
                      silencing: { ...draftAlert.silencing!, enabled: e.target.checked },
                    })
                  }
                />
                <span>{t('admin.ops.runtime.silencing.enabled')}</span>
              </label>
              {draftAlert.silencing?.enabled && (
                <div className="mt-4 space-y-4">
                  <div>
                    <div className="mb-1 text-xs font-medium text-gray-600 dark:text-gray-300">{t('admin.ops.runtime.silencing.globalUntil')}</div>
                    <input
                      type="text"
                      className="input font-mono text-sm"
                      placeholder="2026-01-05T00:00:00Z"
                      value={draftAlert.silencing.global_until_rfc3339}
                      onChange={(e) =>
                        setDraftAlert({
                          ...draftAlert,
                          silencing: { ...draftAlert.silencing!, global_until_rfc3339: e.target.value },
                        })
                      }
                    />
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{t('admin.ops.runtime.silencing.untilHint')}</p>
                  </div>
                  <div>
                    <div className="mb-1 text-xs font-medium text-gray-600 dark:text-gray-300">{t('admin.ops.runtime.silencing.reason')}</div>
                    <input
                      type="text"
                      className="input"
                      placeholder={t('admin.ops.runtime.silencing.reasonPlaceholder')}
                      value={draftAlert.silencing.global_reason}
                      onChange={(e) =>
                        setDraftAlert({
                          ...draftAlert,
                          silencing: { ...draftAlert.silencing!, global_reason: e.target.value },
                        })
                      }
                    />
                  </div>
                  <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-dark-700 dark:bg-dark-800">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="text-xs font-bold text-gray-900 dark:text-white">{t('admin.ops.runtime.silencing.entries.title')}</div>
                        <p className="text-[11px] text-gray-500 dark:text-gray-400">{t('admin.ops.runtime.silencing.entries.hint')}</p>
                      </div>
                      <button type="button" className="btn btn-sm btn-secondary" onClick={addSilenceEntry}>
                        {t('admin.ops.runtime.silencing.entries.add')}
                      </button>
                    </div>
                    {!draftAlert.silencing.entries?.length ? (
                      <div className="mt-3 rounded-lg bg-gray-50 p-3 text-xs text-gray-500 dark:bg-dark-900 dark:text-gray-400">
                        {t('admin.ops.runtime.silencing.entries.empty')}
                      </div>
                    ) : (
                      <div className="mt-4 space-y-4">
                        {draftAlert.silencing.entries.map((entry, idx) => (
                          <div key={idx} className="rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-dark-700 dark:bg-dark-900">
                            <div className="mb-3 flex items-center justify-between">
                              <div className="text-xs font-bold text-gray-900 dark:text-white">
                                {t('admin.ops.runtime.silencing.entries.entryTitle', { n: idx + 1 })}
                              </div>
                              <button type="button" className="btn btn-sm btn-danger" onClick={() => removeSilenceEntry(idx)}>
                                {t('common.delete')}
                              </button>
                            </div>
                            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                              <div>
                                <div className="mb-1 text-xs font-medium text-gray-600 dark:text-gray-300">{t('admin.ops.runtime.silencing.entries.ruleId')}</div>
                                <input
                                  type="text"
                                  className="input font-mono text-sm"
                                  placeholder={t('admin.ops.runtime.silencing.entries.ruleIdPlaceholder')}
                                  value={typeof entry.rule_id === 'number' ? String(entry.rule_id) : ''}
                                  onChange={(e) => {
                                    const entries = [...(draftAlert.silencing?.entries || [])]
                                    const trimmed = e.target.value.trim()
                                    entries[idx] = {
                                      ...entries[idx],
                                      rule_id: trimmed ? Number.parseInt(trimmed, 10) : undefined,
                                    }
                                    setDraftAlert({ ...draftAlert, silencing: { ...draftAlert.silencing!, entries } })
                                  }}
                                />
                              </div>
                              <div>
                                <div className="mb-1 text-xs font-medium text-gray-600 dark:text-gray-300">{t('admin.ops.runtime.silencing.entries.severities')}</div>
                                <input
                                  type="text"
                                  className="input font-mono text-sm"
                                  placeholder={t('admin.ops.runtime.silencing.entries.severitiesPlaceholder')}
                                  value={Array.isArray(entry.severities) ? entry.severities.join(', ') : ''}
                                  onChange={(e) => {
                                    const entries = [...(draftAlert.silencing?.entries || [])]
                                    entries[idx] = {
                                      ...entries[idx],
                                      severities: normalizeSeverities(e.target.value.split(',').map((s) => s.trim())),
                                    }
                                    setDraftAlert({ ...draftAlert, silencing: { ...draftAlert.silencing!, entries } })
                                  }}
                                />
                              </div>
                              <div>
                                <div className="mb-1 text-xs font-medium text-gray-600 dark:text-gray-300">{t('admin.ops.runtime.silencing.entries.until')}</div>
                                <input
                                  type="text"
                                  className="input font-mono text-sm"
                                  placeholder="2026-01-05T00:00:00Z"
                                  value={entry.until_rfc3339 || ''}
                                  onChange={(e) => {
                                    const entries = [...(draftAlert.silencing?.entries || [])]
                                    entries[idx] = { ...entries[idx], until_rfc3339: e.target.value }
                                    setDraftAlert({ ...draftAlert, silencing: { ...draftAlert.silencing!, entries } })
                                  }}
                                />
                              </div>
                              <div>
                                <div className="mb-1 text-xs font-medium text-gray-600 dark:text-gray-300">{t('admin.ops.runtime.silencing.entries.reason')}</div>
                                <input
                                  type="text"
                                  className="input"
                                  placeholder={t('admin.ops.runtime.silencing.reasonPlaceholder')}
                                  value={entry.reason || ''}
                                  onChange={(e) => {
                                    const entries = [...(draftAlert.silencing?.entries || [])]
                                    entries[idx] = { ...entries[idx], reason: e.target.value }
                                    setDraftAlert({ ...draftAlert, silencing: { ...draftAlert.silencing!, entries } })
                                  }}
                                />
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
            <details className="rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-dark-600 dark:bg-dark-800">
              <summary className="cursor-pointer text-xs font-medium text-gray-600 dark:text-gray-400">{t('admin.ops.runtime.advancedSettingsSummary')}</summary>
              <div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <label className="inline-flex items-center gap-2 text-xs text-gray-700 dark:text-gray-300">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-gray-300"
                      checked={draftAlert.distributed_lock.enabled}
                      onChange={(e) =>
                        setDraftAlert({
                          ...draftAlert,
                          distributed_lock: { ...draftAlert.distributed_lock, enabled: e.target.checked },
                        })
                      }
                    />
                    <span>{t('admin.ops.runtime.lockEnabled')}</span>
                  </label>
                </div>
                <div className="md:col-span-2">
                  <div className="mb-1 text-xs font-medium text-gray-500">{t('admin.ops.runtime.lockKey')}</div>
                  <input
                    type="text"
                    className="input text-xs font-mono"
                    value={draftAlert.distributed_lock.key}
                    onChange={(e) =>
                      setDraftAlert({
                        ...draftAlert,
                        distributed_lock: { ...draftAlert.distributed_lock, key: e.target.value },
                      })
                    }
                  />
                </div>
                <div>
                  <div className="mb-1 text-xs font-medium text-gray-500">{t('admin.ops.runtime.lockTTLSeconds')}</div>
                  <input
                    type="number"
                    min={1}
                    max={86400}
                    className="input text-xs font-mono"
                    value={draftAlert.distributed_lock.ttl_seconds}
                    onChange={(e) =>
                      setDraftAlert({
                        ...draftAlert,
                        distributed_lock: { ...draftAlert.distributed_lock, ttl_seconds: Number(e.target.value) },
                      })
                    }
                  />
                </div>
              </div>
            </details>
          </div>
        )}
      </BaseDialog>
    </>
  )
}
