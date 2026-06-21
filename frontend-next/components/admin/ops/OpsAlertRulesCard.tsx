'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useI18n } from '@/lib/i18n'
import { useApp } from '@/context/AppContext'
import BaseDialog from '@/components/common/BaseDialog'
import ConfirmDialog from '@/components/common/ConfirmDialog'
import Select, { type SelectOption } from '@/components/common/Select'
import { adminGroupsAPI } from '@/lib/adminGroups'
import { adminOpsAPI, type OpsSeverity } from '@/lib/adminOps'
import type { AlertRule, MetricType, Operator } from '@/lib/opsTypes'
import { formatDateTime } from '@/lib/adminOpsFormatters'

const groupMetricTypes = new Set<MetricType>([
  'group_available_accounts',
  'group_available_ratio',
  'group_rate_limit_ratio',
])

function parsePositiveInt(value: unknown): number | null {
  if (value == null) return null
  if (typeof value === 'boolean') return null
  const n = typeof value === 'number' ? value : Number.parseInt(String(value), 10)
  return Number.isFinite(n) && n > 0 ? n : null
}

function newRuleDraft(): AlertRule {
  return {
    name: '',
    description: '',
    enabled: true,
    metric_type: 'error_rate',
    operator: '>',
    threshold: 1,
    window_minutes: 1,
    sustained_minutes: 2,
    severity: 'P1',
    cooldown_minutes: 10,
    notify_email: true,
  }
}

export default function OpsAlertRulesCard() {
  const { t } = useI18n()
  const appStore = useApp()

  const [loading, setLoading] = useState(false)
  const [rules, setRules] = useState<AlertRule[]>([])
  const [groupOptionsBase, setGroupOptionsBase] = useState<SelectOption[]>([])
  const [showEditor, setShowEditor] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [draft, setDraft] = useState<AlertRule | null>(null)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<AlertRule | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setRules(await adminOpsAPI.listAlertRules())
    } catch (err: unknown) {
      console.error('[OpsAlertRulesCard] Failed to load rules', err)
      const detail =
        err &&
        typeof err === 'object' &&
        'response' in err &&
        (err as { response?: { data?: { detail?: string } } }).response?.data?.detail
      appStore.showError(typeof detail === 'string' ? detail : t('admin.ops.alertRules.loadFailed'))
      setRules([])
    } finally {
      setLoading(false)
    }
  }, [appStore, t])

  const loadGroups = useCallback(async () => {
    try {
      const list = await adminGroupsAPI.getAll()
      setGroupOptionsBase(list.map((g) => ({ value: g.id, label: g.name })))
    } catch (err) {
      console.error('[OpsAlertRulesCard] Failed to load groups', err)
      setGroupOptionsBase([])
    }
  }, [])

  useEffect(() => {
    void load()
    void loadGroups()
  }, [load, loadGroups])

  const sortedRules = useMemo(() => [...rules].sort((a, b) => (b.id || 0) - (a.id || 0)), [rules])

  const metricDefinitions = useMemo(
    () =>
      [
        { type: 'success_rate', group: 'system', label: t('admin.ops.alertRules.metrics.successRate'), description: t('admin.ops.alertRules.metricDescriptions.successRate'), recommendedOperator: '<' as Operator, recommendedThreshold: 99, unit: '%' },
        { type: 'error_rate', group: 'system', label: t('admin.ops.alertRules.metrics.errorRate'), description: t('admin.ops.alertRules.metricDescriptions.errorRate'), recommendedOperator: '>' as Operator, recommendedThreshold: 1, unit: '%' },
        { type: 'upstream_error_rate', group: 'system', label: t('admin.ops.alertRules.metrics.upstreamErrorRate'), description: t('admin.ops.alertRules.metricDescriptions.upstreamErrorRate'), recommendedOperator: '>' as Operator, recommendedThreshold: 1, unit: '%' },
        { type: 'cpu_usage_percent', group: 'system', label: t('admin.ops.alertRules.metrics.cpu'), description: t('admin.ops.alertRules.metricDescriptions.cpu'), recommendedOperator: '>' as Operator, recommendedThreshold: 80, unit: '%' },
        { type: 'memory_usage_percent', group: 'system', label: t('admin.ops.alertRules.metrics.memory'), description: t('admin.ops.alertRules.metricDescriptions.memory'), recommendedOperator: '>' as Operator, recommendedThreshold: 80, unit: '%' },
        { type: 'concurrency_queue_depth', group: 'system', label: t('admin.ops.alertRules.metrics.queueDepth'), description: t('admin.ops.alertRules.metricDescriptions.queueDepth'), recommendedOperator: '>' as Operator, recommendedThreshold: 10 },
        { type: 'group_available_accounts', group: 'group', label: t('admin.ops.alertRules.metrics.groupAvailableAccounts'), description: t('admin.ops.alertRules.metricDescriptions.groupAvailableAccounts'), recommendedOperator: '<' as Operator, recommendedThreshold: 1 },
        { type: 'group_available_ratio', group: 'group', label: t('admin.ops.alertRules.metrics.groupAvailableRatio'), description: t('admin.ops.alertRules.metricDescriptions.groupAvailableRatio'), recommendedOperator: '<' as Operator, recommendedThreshold: 50, unit: '%' },
        { type: 'group_rate_limit_ratio', group: 'group', label: t('admin.ops.alertRules.metrics.groupRateLimitRatio'), description: t('admin.ops.alertRules.metricDescriptions.groupRateLimitRatio'), recommendedOperator: '>' as Operator, recommendedThreshold: 10, unit: '%' },
        { type: 'account_rate_limited_count', group: 'account', label: t('admin.ops.alertRules.metrics.accountRateLimitedCount'), description: t('admin.ops.alertRules.metricDescriptions.accountRateLimitedCount'), recommendedOperator: '>' as Operator, recommendedThreshold: 0 },
        { type: 'account_error_count', group: 'account', label: t('admin.ops.alertRules.metrics.accountErrorCount'), description: t('admin.ops.alertRules.metricDescriptions.accountErrorCount'), recommendedOperator: '>' as Operator, recommendedThreshold: 0 },
        { type: 'account_error_ratio', group: 'account', label: t('admin.ops.alertRules.metrics.accountErrorRatio'), description: t('admin.ops.alertRules.metricDescriptions.accountErrorRatio'), recommendedOperator: '>' as Operator, recommendedThreshold: 5, unit: '%' },
        { type: 'overload_account_count', group: 'account', label: t('admin.ops.alertRules.metrics.overloadAccountCount'), description: t('admin.ops.alertRules.metricDescriptions.overloadAccountCount'), recommendedOperator: '>' as Operator, recommendedThreshold: 0 },
      ] as const,
    [t],
  )

  const isGroupMetricSelected = draft?.metric_type ? groupMetricTypes.has(draft.metric_type) : false

  const draftGroupId = parsePositiveInt(draft?.filters?.group_id)

  const groupOptions = useMemo<SelectOption[]>(() => {
    if (isGroupMetricSelected) return groupOptionsBase
    return [{ value: null, label: t('admin.ops.alertRules.form.allGroups') }, ...groupOptionsBase]
  }, [isGroupMetricSelected, groupOptionsBase, t])

  const selectedMetricDefinition = useMemo(
    () => metricDefinitions.find((m) => m.type === draft?.metric_type) ?? null,
    [metricDefinitions, draft?.metric_type],
  )

  const metricOptions = useMemo(() => {
    const buildGroup = (group: 'system' | 'group' | 'account'): SelectOption[] => {
      const items = metricDefinitions.filter((m) => m.group === group)
      if (items.length === 0) return []
      return [
        { value: `__group__${group}`, label: t(`admin.ops.alertRules.metricGroups.${group}`), disabled: true, kind: 'group' },
        ...items.map((m) => ({ value: m.type, label: m.label })),
      ]
    }
    return [...buildGroup('system'), ...buildGroup('group'), ...buildGroup('account')]
  }, [metricDefinitions, t])

  const operatorOptions = useMemo(
    () => (['>', '>=', '<', '<=', '==', '!='] as Operator[]).map((o) => ({ value: o, label: o })),
    [],
  )

  const severityOptions = useMemo(
    () => (['P0', 'P1', 'P2', 'P3'] as OpsSeverity[]).map((s) => ({ value: s, label: s })),
    [],
  )

  const windowOptions = useMemo(() => [1, 5, 60].map((m) => ({ value: m, label: `${m}m` })), [])

  const editorValidation = useMemo(() => {
    const errors: string[] = []
    const r = draft
    if (!r) return { valid: true, errors }
    if (!r.name?.trim()) errors.push(t('admin.ops.alertRules.validation.nameRequired'))
    if (!r.metric_type) errors.push(t('admin.ops.alertRules.validation.metricRequired'))
    if (groupMetricTypes.has(r.metric_type) && !parsePositiveInt(r.filters?.group_id)) {
      errors.push(t('admin.ops.alertRules.validation.groupIdRequired'))
    }
    if (!r.operator) errors.push(t('admin.ops.alertRules.validation.operatorRequired'))
    if (!(typeof r.threshold === 'number' && Number.isFinite(r.threshold))) {
      errors.push(t('admin.ops.alertRules.validation.thresholdRequired'))
    }
    if (!(typeof r.window_minutes === 'number' && Number.isFinite(r.window_minutes) && [1, 5, 60].includes(r.window_minutes))) {
      errors.push(t('admin.ops.alertRules.validation.windowRange'))
    }
    if (!(typeof r.sustained_minutes === 'number' && Number.isFinite(r.sustained_minutes) && r.sustained_minutes >= 1 && r.sustained_minutes <= 1440)) {
      errors.push(t('admin.ops.alertRules.validation.sustainedRange'))
    }
    if (!(typeof r.cooldown_minutes === 'number' && Number.isFinite(r.cooldown_minutes) && r.cooldown_minutes >= 0 && r.cooldown_minutes <= 1440)) {
      errors.push(t('admin.ops.alertRules.validation.cooldownRange'))
    }
    return { valid: errors.length === 0, errors }
  }, [draft, t])

  const setDraftGroupId = (value: number | null) => {
    if (!draft) return
    const nextFilters = { ...(draft.filters || {}) }
    if (value == null) {
      delete nextFilters.group_id
    } else {
      nextFilters.group_id = value
    }
    const next: AlertRule = {
      ...draft,
      filters: Object.keys(nextFilters).length > 0 ? nextFilters : undefined,
    }
    setDraft(next)
  }

  const openCreate = () => {
    setEditingId(null)
    setDraft(newRuleDraft())
    setShowEditor(true)
  }

  const openEdit = (rule: AlertRule) => {
    setEditingId(rule.id ?? null)
    setDraft(JSON.parse(JSON.stringify(rule)) as AlertRule)
    setShowEditor(true)
  }

  const save = async () => {
    if (!draft || !editorValidation.valid) {
      appStore.showError(editorValidation.errors[0] || t('admin.ops.alertRules.validation.invalid'))
      return
    }
    setSaving(true)
    try {
      if (editingId) await adminOpsAPI.updateAlertRule(editingId, draft)
      else await adminOpsAPI.createAlertRule(draft)
      setShowEditor(false)
      setDraft(null)
      setEditingId(null)
      await load()
      appStore.showSuccess(t('admin.ops.alertRules.saveSuccess'))
    } catch (err: unknown) {
      console.error('[OpsAlertRulesCard] Failed to save rule', err)
      const detail =
        err &&
        typeof err === 'object' &&
        'response' in err &&
        (err as { response?: { data?: { detail?: string } } }).response?.data?.detail
      appStore.showError(typeof detail === 'string' ? detail : t('admin.ops.alertRules.saveFailed'))
    } finally {
      setSaving(false)
    }
  }

  const confirmDelete = async () => {
    if (!pendingDelete?.id) return
    try {
      await adminOpsAPI.deleteAlertRule(pendingDelete.id)
      setShowDeleteConfirm(false)
      setPendingDelete(null)
      await load()
      appStore.showSuccess(t('admin.ops.alertRules.deleteSuccess'))
    } catch (err: unknown) {
      console.error('[OpsAlertRulesCard] Failed to delete rule', err)
      const detail =
        err &&
        typeof err === 'object' &&
        'response' in err &&
        (err as { response?: { data?: { detail?: string } } }).response?.data?.detail
      appStore.showError(typeof detail === 'string' ? detail : t('admin.ops.alertRules.deleteFailed'))
    }
  }

  return (
    <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-gray-900/5 dark:bg-dark-800 dark:ring-dark-700">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h3 className="text-sm font-bold text-gray-900 dark:text-white">{t('admin.ops.alertRules.title')}</h3>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{t('admin.ops.alertRules.description')}</p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" className="btn btn-sm btn-primary" disabled={loading} onClick={openCreate}>
            {t('admin.ops.alertRules.create')}
          </button>
          <button
            type="button"
            className="flex items-center gap-1.5 rounded-lg bg-gray-100 px-3 py-1.5 text-xs font-bold text-gray-700 transition-colors hover:bg-gray-200 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-dark-700 dark:text-gray-300 dark:hover:bg-dark-600"
            disabled={loading}
            onClick={() => void load()}
          >
            <svg className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            {t('common.refresh')}
          </button>
        </div>
      </div>

      {loading ? (
        <div className="py-10 text-center text-sm text-gray-500 dark:text-gray-400">{t('admin.ops.alertRules.loading')}</div>
      ) : sortedRules.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-200 p-8 text-center text-sm text-gray-500 dark:border-dark-700 dark:text-gray-400">
          {t('admin.ops.alertRules.empty')}
        </div>
      ) : (
        <div className="max-h-[520px] overflow-hidden rounded-xl border border-gray-200 dark:border-dark-700">
          <div className="max-h-[520px] overflow-y-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-dark-700">
              <thead className="sticky top-0 z-10 bg-gray-50 dark:bg-dark-900">
                <tr>
                  <th className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">{t('admin.ops.alertRules.table.name')}</th>
                  <th className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">{t('admin.ops.alertRules.table.metric')}</th>
                  <th className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">{t('admin.ops.alertRules.table.severity')}</th>
                  <th className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">{t('admin.ops.alertRules.table.enabled')}</th>
                  <th className="px-4 py-3 text-right text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">{t('admin.ops.alertRules.table.actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white dark:divide-dark-700 dark:bg-dark-800">
                {sortedRules.map((row) => (
                  <tr key={row.id} className="hover:bg-gray-50 dark:hover:bg-dark-700/50">
                    <td className="px-4 py-3">
                      <div className="text-xs font-bold text-gray-900 dark:text-white">{row.name}</div>
                      {row.description && <div className="mt-0.5 line-clamp-2 text-[11px] text-gray-500 dark:text-gray-400">{row.description}</div>}
                      {row.updated_at && <div className="mt-1 text-[10px] text-gray-400">{formatDateTime(row.updated_at)}</div>}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-gray-700 dark:text-gray-200">
                      <span className="font-mono">{row.metric_type}</span>
                      <span className="mx-1 text-gray-400">{row.operator}</span>
                      <span className="font-mono">{row.threshold}</span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-xs font-bold text-gray-700 dark:text-gray-200">{row.severity}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-gray-700 dark:text-gray-200">
                      {row.enabled ? t('common.enabled') : t('common.disabled')}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right text-xs">
                      <button type="button" className="btn btn-sm btn-secondary" onClick={() => openEdit(row)}>{t('common.edit')}</button>
                      <button type="button" className="ml-2 btn btn-sm btn-danger" onClick={() => { setPendingDelete(row); setShowDeleteConfirm(true) }}>{t('common.delete')}</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <BaseDialog
        show={showEditor}
        title={editingId ? t('admin.ops.alertRules.editTitle') : t('admin.ops.alertRules.createTitle')}
        width="wide"
        onClose={() => setShowEditor(false)}
        footer={
          <div className="flex items-center justify-end gap-2">
            <button type="button" className="btn btn-secondary" disabled={saving} onClick={() => setShowEditor(false)}>{t('common.cancel')}</button>
            <button type="button" className="btn btn-primary" disabled={saving} onClick={() => void save()}>{saving ? t('common.saving') : t('common.save')}</button>
          </div>
        }
      >
        {draft && (
          <div className="space-y-4">
            {!editorValidation.valid && (
              <div className="rounded-xl bg-red-50 p-4 text-xs text-red-700 dark:bg-red-900/30 dark:text-red-300">
                <div className="font-bold">{t('admin.ops.alertRules.validation.title')}</div>
                <ul className="mt-1 list-disc pl-5">
                  {editorValidation.errors.map((e) => (
                    <li key={e}>{e}</li>
                  ))}
                </ul>
              </div>
            )}
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="md:col-span-2">
                <label className="input-label">{t('admin.ops.alertRules.form.name')}</label>
                <input className="input" type="text" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
              </div>
              <div className="md:col-span-2">
                <label className="input-label">{t('admin.ops.alertRules.form.description')}</label>
                <input className="input" type="text" value={draft.description || ''} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
              </div>
              <div>
                <label className="input-label">{t('admin.ops.alertRules.form.metric')}</label>
                <Select modelValue={draft.metric_type} options={metricOptions} onUpdateModelValue={(v) => setDraft({ ...draft, metric_type: String(v) as MetricType })} />
                {selectedMetricDefinition && (
                  <div className="mt-1 space-y-0.5 text-xs text-gray-500 dark:text-gray-400">
                    <p>{selectedMetricDefinition.description}</p>
                    <p>
                      {t('admin.ops.alertRules.hints.recommended', {
                        operator: selectedMetricDefinition.recommendedOperator,
                        threshold: selectedMetricDefinition.recommendedThreshold,
                        unit: 'unit' in selectedMetricDefinition ? selectedMetricDefinition.unit || '' : '',
                      })}
                    </p>
                  </div>
                )}
              </div>
              <div>
                <label className="input-label">{t('admin.ops.alertRules.form.operator')}</label>
                <Select modelValue={draft.operator} options={operatorOptions} onUpdateModelValue={(v) => setDraft({ ...draft, operator: String(v) as Operator })} />
              </div>
              <div className="md:col-span-2">
                <label className="input-label">
                  {t('admin.ops.alertRules.form.groupId')}
                  {isGroupMetricSelected && <span className="ml-1 text-red-500">*</span>}
                </label>
                <Select
                  modelValue={draftGroupId}
                  options={groupOptions}
                  searchable
                  placeholder={t('admin.ops.alertRules.form.groupPlaceholder')}
                  error={isGroupMetricSelected && !draftGroupId}
                  onUpdateModelValue={(v) => setDraftGroupId(v == null || v === '' ? null : Number(v))}
                />
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  {isGroupMetricSelected ? t('admin.ops.alertRules.hints.groupRequired') : t('admin.ops.alertRules.hints.groupOptional')}
                </p>
              </div>
              <div>
                <label className="input-label">{t('admin.ops.alertRules.form.threshold')}</label>
                <input className="input" type="number" value={draft.threshold} onChange={(e) => setDraft({ ...draft, threshold: Number(e.target.value) })} />
              </div>
              <div>
                <label className="input-label">{t('admin.ops.alertRules.form.severity')}</label>
                <Select modelValue={draft.severity} options={severityOptions} onUpdateModelValue={(v) => setDraft({ ...draft, severity: String(v) as OpsSeverity })} />
              </div>
              <div>
                <label className="input-label">{t('admin.ops.alertRules.form.window')}</label>
                <Select modelValue={draft.window_minutes} options={windowOptions} onUpdateModelValue={(v) => setDraft({ ...draft, window_minutes: Number(v) })} />
              </div>
              <div>
                <label className="input-label">{t('admin.ops.alertRules.form.sustained')}</label>
                <input className="input" type="number" min={1} max={1440} value={draft.sustained_minutes} onChange={(e) => setDraft({ ...draft, sustained_minutes: Number(e.target.value) })} />
              </div>
              <div>
                <label className="input-label">{t('admin.ops.alertRules.form.cooldown')}</label>
                <input className="input" type="number" min={0} max={1440} value={draft.cooldown_minutes} onChange={(e) => setDraft({ ...draft, cooldown_minutes: Number(e.target.value) })} />
              </div>
              <div className="flex items-center justify-between rounded-xl bg-gray-50 px-4 py-3 dark:bg-dark-800/50 md:col-span-2">
                <span className="text-xs font-bold text-gray-700 dark:text-gray-200">{t('admin.ops.alertRules.form.enabled')}</span>
                <input type="checkbox" className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500" checked={draft.enabled} onChange={(e) => setDraft({ ...draft, enabled: e.target.checked })} />
              </div>
              <div className="flex items-center justify-between rounded-xl bg-gray-50 px-4 py-3 dark:bg-dark-800/50 md:col-span-2">
                <span className="text-xs font-bold text-gray-700 dark:text-gray-200">{t('admin.ops.alertRules.form.notifyEmail')}</span>
                <input type="checkbox" className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500" checked={draft.notify_email} onChange={(e) => setDraft({ ...draft, notify_email: e.target.checked })} />
              </div>
            </div>
          </div>
        )}
      </BaseDialog>

      <ConfirmDialog
        show={showDeleteConfirm}
        title={t('admin.ops.alertRules.deleteConfirmTitle')}
        message={t('admin.ops.alertRules.deleteConfirmMessage')}
        confirmText={t('common.delete')}
        cancelText={t('common.cancel')}
        onConfirm={() => void confirmDelete()}
        onCancel={() => { setShowDeleteConfirm(false); setPendingDelete(null) }}
      />
    </div>
  )
}
