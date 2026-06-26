'use client'

import { useCallback, useEffect, useState } from 'react'
import { useI18n } from '@/lib/i18n'
import { useApp } from '@/context/AppContext'
import { adminScheduledTestsAPI } from '@/lib/adminScheduledTests'
import { formatDateTime } from '@/lib/format'
import BaseDialog from '@/components/common/BaseDialog'
import ConfirmDialog from '@/components/common/ConfirmDialog'
import HelpTooltip from '@/components/common/HelpTooltip'
import Select, { type SelectOption } from '@/components/common/Select'
import Toggle from '@/components/common/Toggle'
import Icon from '@/components/icons/Icon'
import type { ScheduledTestPlan, ScheduledTestResult } from '@/lib/types'

interface ScheduledTestsPanelProps {
  show: boolean
  accountId: number | null
  modelOptions: SelectOption[]
  onClose: () => void
}

const defaultNewPlan = {
  model_id: '',
  cron_expression: '',
  max_results: '100',
  enabled: true,
  auto_recover: false,
}

function CronHelpTrigger() {
  const { t } = useI18n()
  return (
    <HelpTooltip
      triggerContent={
        <span className="inline-flex h-4 w-4 cursor-help items-center justify-center rounded-full border border-gray-400/70 text-[10px] font-semibold text-gray-400 transition-colors hover:border-primary-500 hover:text-primary-600 dark:border-gray-500 dark:text-gray-500 dark:hover:border-primary-400 dark:hover:text-primary-400">
          ?
        </span>
      }
    >
      <div className="space-y-1.5">
        <p className="font-medium">{t('admin.scheduledTests.cronTooltipTitle')}</p>
        <p>{t('admin.scheduledTests.cronTooltipMeaning')}</p>
        <p>{t('admin.scheduledTests.cronTooltipExampleEvery30Min')}</p>
        <p>{t('admin.scheduledTests.cronTooltipExampleHourly')}</p>
        <p>{t('admin.scheduledTests.cronTooltipExampleDaily')}</p>
        <p>{t('admin.scheduledTests.cronTooltipExampleWeekly')}</p>
        <p>{t('admin.scheduledTests.cronTooltipRange')}</p>
      </div>
    </HelpTooltip>
  )
}

function MaxResultsHelpTrigger() {
  const { t } = useI18n()
  return (
    <HelpTooltip
      triggerContent={
        <span className="inline-flex h-4 w-4 cursor-help items-center justify-center rounded-full border border-gray-400/70 text-[10px] font-semibold text-gray-400 transition-colors hover:border-primary-500 hover:text-primary-600 dark:border-gray-500 dark:text-gray-500 dark:hover:border-primary-400 dark:hover:text-primary-400">
          ?
        </span>
      }
    >
      <div className="space-y-1.5">
        <p className="font-medium">{t('admin.scheduledTests.maxResultsTooltipTitle')}</p>
        <p>{t('admin.scheduledTests.maxResultsTooltipMeaning')}</p>
        <p>{t('admin.scheduledTests.maxResultsTooltipBody')}</p>
        <p>{t('admin.scheduledTests.maxResultsTooltipExample')}</p>
        <p>{t('admin.scheduledTests.maxResultsTooltipRange')}</p>
      </div>
    </HelpTooltip>
  )
}

export default function ScheduledTestsPanel({
  show,
  accountId,
  modelOptions,
  onClose,
}: ScheduledTestsPanelProps) {
  const { t } = useI18n()
  const appStore = useApp()

  const [loading, setLoading] = useState(false)
  const [creating, setCreating] = useState(false)
  const [loadingResults, setLoadingResults] = useState(false)
  const [plans, setPlans] = useState<ScheduledTestPlan[]>([])
  const [results, setResults] = useState<ScheduledTestResult[]>([])
  const [expandedPlanId, setExpandedPlanId] = useState<number | null>(null)
  const [expandedResultIds, setExpandedResultIds] = useState<Set<number>>(new Set())
  const [showAddForm, setShowAddForm] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deletingPlan, setDeletingPlan] = useState<ScheduledTestPlan | null>(null)
  const [editingPlanId, setEditingPlanId] = useState<number | null>(null)
  const [updating, setUpdating] = useState(false)
  const [newPlan, setNewPlan] = useState(defaultNewPlan)
  const [editForm, setEditForm] = useState(defaultNewPlan)

  const resetNewPlan = useCallback(() => setNewPlan(defaultNewPlan), [])

  const loadPlans = useCallback(async () => {
    if (!accountId) return
    setLoading(true)
    try {
      setPlans(await adminScheduledTestsAPI.listByAccount(accountId))
    } catch (error: unknown) {
      appStore.showError(error instanceof Error ? error.message : 'Failed to load plans')
    } finally {
      setLoading(false)
    }
  }, [accountId, appStore])

  useEffect(() => {
    if (show && accountId) {
      void loadPlans()
    } else {
      setPlans([])
      setResults([])
      setExpandedPlanId(null)
      setExpandedResultIds(new Set())
      setShowAddForm(false)
      setShowDeleteConfirm(false)
    }
  }, [show, accountId, loadPlans])

  const handleCreate = async () => {
    if (!accountId || !newPlan.model_id || !newPlan.cron_expression) return
    setCreating(true)
    try {
      await adminScheduledTestsAPI.create({
        account_id: accountId,
        model_id: newPlan.model_id,
        cron_expression: newPlan.cron_expression,
        enabled: newPlan.enabled,
        max_results: Number(newPlan.max_results) || 100,
        auto_recover: newPlan.auto_recover,
      })
      appStore.showSuccess(t('admin.scheduledTests.createSuccess'))
      setShowAddForm(false)
      resetNewPlan()
      await loadPlans()
    } catch (error: unknown) {
      appStore.showError(error instanceof Error ? error.message : 'Failed to create plan')
    } finally {
      setCreating(false)
    }
  }

  const handleToggleEnabled = async (plan: ScheduledTestPlan, enabled: boolean) => {
    try {
      const updated = await adminScheduledTestsAPI.update(plan.id, { enabled })
      setPlans((prev) => prev.map((p) => (p.id === plan.id ? updated : p)))
      appStore.showSuccess(t('admin.scheduledTests.updateSuccess'))
    } catch (error: unknown) {
      appStore.showError(error instanceof Error ? error.message : 'Failed to update plan')
    }
  }

  const startEdit = (plan: ScheduledTestPlan) => {
    setEditingPlanId(plan.id)
    setEditForm({
      model_id: plan.model_id,
      cron_expression: plan.cron_expression,
      max_results: String(plan.max_results),
      enabled: plan.enabled,
      auto_recover: plan.auto_recover,
    })
  }

  const handleEdit = async () => {
    if (!editingPlanId || !editForm.model_id || !editForm.cron_expression) return
    setUpdating(true)
    try {
      const updated = await adminScheduledTestsAPI.update(editingPlanId, {
        model_id: editForm.model_id,
        cron_expression: editForm.cron_expression,
        max_results: Number(editForm.max_results) || 100,
        enabled: editForm.enabled,
        auto_recover: editForm.auto_recover,
      })
      setPlans((prev) => prev.map((p) => (p.id === editingPlanId ? updated : p)))
      appStore.showSuccess(t('admin.scheduledTests.updateSuccess'))
      setEditingPlanId(null)
    } catch (error: unknown) {
      appStore.showError(error instanceof Error ? error.message : 'Failed to update plan')
    } finally {
      setUpdating(false)
    }
  }

  const handleDelete = async () => {
    if (!deletingPlan) return
    try {
      await adminScheduledTestsAPI.delete(deletingPlan.id)
      appStore.showSuccess(t('admin.scheduledTests.deleteSuccess'))
      setPlans((prev) => prev.filter((p) => p.id !== deletingPlan.id))
      if (expandedPlanId === deletingPlan.id) {
        setExpandedPlanId(null)
        setResults([])
      }
    } catch (error: unknown) {
      appStore.showError(error instanceof Error ? error.message : 'Failed to delete plan')
    } finally {
      setShowDeleteConfirm(false)
      setDeletingPlan(null)
    }
  }

  const toggleExpand = async (planId: number) => {
    if (expandedPlanId === planId) {
      setExpandedPlanId(null)
      setResults([])
      setExpandedResultIds(new Set())
      return
    }
    setExpandedPlanId(planId)
    setExpandedResultIds(new Set())
    setLoadingResults(true)
    try {
      setResults(await adminScheduledTestsAPI.listResults(planId, 20))
    } catch (error: unknown) {
      appStore.showError(error instanceof Error ? error.message : 'Failed to load results')
      setResults([])
    } finally {
      setLoadingResults(false)
    }
  }

  const toggleResultDetail = (resultId: number) => {
    setExpandedResultIds((prev) => {
      const next = new Set(prev)
      if (next.has(resultId)) next.delete(resultId)
      else next.add(resultId)
      return next
    })
  }

  return (
    <BaseDialog show={show} title={t('admin.scheduledTests.title')} width="wide" onClose={onClose}>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-500 dark:text-gray-400">{t('admin.scheduledTests.title')}</p>
          <button
            type="button"
            onClick={() => setShowAddForm((v) => !v)}
            className="btn btn-primary flex items-center gap-1.5 text-sm"
          >
            <Icon name="plus" size="sm" strokeWidth={2} />
            {t('admin.scheduledTests.addPlan')}
          </button>
        </div>

        {showAddForm ? (
          <div className="rounded-xl border border-primary-200 bg-primary-50/50 p-4 dark:border-primary-800 dark:bg-primary-900/20">
            <div className="mb-3 text-sm font-medium text-gray-700 dark:text-gray-300">
              {t('admin.scheduledTests.addPlan')}
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">
                  {t('admin.scheduledTests.model')}
                </label>
                <Select
                  modelValue={newPlan.model_id}
                  options={modelOptions}
                  placeholder={t('admin.scheduledTests.model')}
                  searchable={modelOptions.length > 5}
                  onUpdateModelValue={(value) =>
                    setNewPlan((prev) => ({ ...prev, model_id: String(value ?? '') }))
                  }
                />
              </div>
              <div>
                <label className="mb-1 flex items-center gap-1 text-xs font-medium text-gray-600 dark:text-gray-400">
                  {t('admin.scheduledTests.cronExpression')}
                  <CronHelpTrigger />
                </label>
                <input
                  className="input"
                  value={newPlan.cron_expression}
                  placeholder="*/30 * * * *"
                  onChange={(e) =>
                    setNewPlan((prev) => ({ ...prev, cron_expression: e.target.value }))
                  }
                />
                <p className="input-hint">{t('admin.scheduledTests.cronHelp')}</p>
              </div>
              <div>
                <label className="mb-1 flex items-center gap-1 text-xs font-medium text-gray-600 dark:text-gray-400">
                  {t('admin.scheduledTests.maxResults')}
                  <MaxResultsHelpTrigger />
                </label>
                <input
                  type="number"
                  className="input"
                  value={newPlan.max_results}
                  placeholder="100"
                  onChange={(e) =>
                    setNewPlan((prev) => ({ ...prev, max_results: e.target.value }))
                  }
                />
              </div>
              <div className="flex items-end">
                <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                  <Toggle
                    modelValue={newPlan.enabled}
                    onUpdateModelValue={(value) =>
                      setNewPlan((prev) => ({ ...prev, enabled: value }))
                    }
                  />
                  {t('admin.scheduledTests.enabled')}
                </label>
              </div>
              <div className="flex items-end">
                <div>
                  <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                    <Toggle
                      modelValue={newPlan.auto_recover}
                      onUpdateModelValue={(value) =>
                        setNewPlan((prev) => ({ ...prev, auto_recover: value }))
                      }
                    />
                    {t('admin.scheduledTests.autoRecover')}
                  </label>
                  <p className="mt-0.5 text-xs text-gray-400 dark:text-gray-500">
                    {t('admin.scheduledTests.autoRecoverHelp')}
                  </p>
                </div>
              </div>
            </div>
            <div className="mt-3 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowAddForm(false)
                  resetNewPlan()
                }}
                className="rounded-lg bg-gray-100 px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-200 dark:bg-dark-600 dark:text-gray-300 dark:hover:bg-dark-500"
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                onClick={() => void handleCreate()}
                disabled={!newPlan.model_id || !newPlan.cron_expression || creating}
                className="flex items-center gap-1.5 rounded-lg bg-primary-500 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-primary-600 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {creating ? (
                  <Icon name="refresh" size="sm" className="animate-spin" strokeWidth={2} />
                ) : null}
                {t('common.save')}
              </button>
            </div>
          </div>
        ) : null}

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Icon name="refresh" size="md" className="animate-spin text-gray-400" strokeWidth={2} />
            <span className="ml-2 text-sm text-gray-500">{t('common.loading')}...</span>
          </div>
        ) : plans.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-300 py-10 text-center dark:border-dark-600">
            <Icon name="calendar" size="lg" className="mx-auto mb-2 text-gray-400" strokeWidth={1.5} />
            <p className="text-sm text-gray-500 dark:text-gray-400">{t('admin.scheduledTests.noPlans')}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {plans.map((plan) => (
              <div
                key={plan.id}
                className="rounded-xl border border-gray-200 bg-white transition-all dark:border-dark-600 dark:bg-dark-800"
              >
                <div
                  className="flex cursor-pointer items-center justify-between px-4 py-3"
                  onClick={() => void toggleExpand(plan.id)}
                >
                  <div className="flex flex-1 items-center gap-4">
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                        {plan.model_id}
                      </div>
                      <div className="mt-0.5 font-mono text-xs text-gray-500 dark:text-gray-400">
                        {plan.cron_expression}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                      <Toggle
                        modelValue={plan.enabled}
                        onUpdateModelValue={(value) => void handleToggleEnabled(plan, value)}
                      />
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        {plan.enabled ? t('admin.scheduledTests.enabled') : ''}
                      </span>
                    </div>
                    {plan.auto_recover ? (
                      <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400">
                        {t('admin.scheduledTests.autoRecover')}
                      </span>
                    ) : null}
                  </div>

                  <div className="flex items-center gap-3">
                    {plan.last_run_at ? (
                      <div className="hidden text-right text-xs text-gray-500 dark:text-gray-400 sm:block">
                        <div>{t('admin.scheduledTests.lastRun')}</div>
                        <div>{formatDateTime(plan.last_run_at)}</div>
                      </div>
                    ) : null}
                    {plan.next_run_at ? (
                      <div className="hidden text-right text-xs text-gray-500 dark:text-gray-400 sm:block">
                        <div>{t('admin.scheduledTests.nextRun')}</div>
                        <div>{formatDateTime(plan.next_run_at)}</div>
                      </div>
                    ) : null}
                    <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        onClick={() => startEdit(plan)}
                        className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-blue-50 hover:text-blue-500 dark:hover:bg-blue-900/20"
                        title={t('admin.scheduledTests.editPlan')}
                      >
                        <Icon name="edit" size="sm" strokeWidth={2} />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setDeletingPlan(plan)
                          setShowDeleteConfirm(true)
                        }}
                        className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/20"
                        title={t('admin.scheduledTests.deletePlan')}
                      >
                        <Icon name="trash" size="sm" strokeWidth={2} />
                      </button>
                    </div>
                    <Icon
                      name="chevronDown"
                      size="sm"
                      className={`text-gray-400 transition-transform duration-200 ${
                        expandedPlanId === plan.id ? 'rotate-180' : ''
                      }`}
                    />
                  </div>
                </div>

                {editingPlanId === plan.id ? (
                  <div
                    className="border-t border-blue-100 bg-blue-50/50 px-4 py-3 dark:border-blue-900 dark:bg-blue-900/10"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="mb-2 text-xs font-medium text-gray-600 dark:text-gray-400">
                      {t('admin.scheduledTests.editPlan')}
                    </div>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div>
                        <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">
                          {t('admin.scheduledTests.model')}
                        </label>
                        <Select
                          modelValue={editForm.model_id}
                          options={modelOptions}
                          placeholder={t('admin.scheduledTests.model')}
                          searchable={modelOptions.length > 5}
                          onUpdateModelValue={(value) =>
                            setEditForm((prev) => ({ ...prev, model_id: String(value ?? '') }))
                          }
                        />
                      </div>
                      <div>
                        <label className="mb-1 flex items-center gap-1 text-xs font-medium text-gray-600 dark:text-gray-400">
                          {t('admin.scheduledTests.cronExpression')}
                          <CronHelpTrigger />
                        </label>
                        <input
                          className="input"
                          value={editForm.cron_expression}
                          placeholder="*/30 * * * *"
                          onChange={(e) =>
                            setEditForm((prev) => ({ ...prev, cron_expression: e.target.value }))
                          }
                        />
                        <p className="input-hint">{t('admin.scheduledTests.cronHelp')}</p>
                      </div>
                      <div>
                        <label className="mb-1 flex items-center gap-1 text-xs font-medium text-gray-600 dark:text-gray-400">
                          {t('admin.scheduledTests.maxResults')}
                          <MaxResultsHelpTrigger />
                        </label>
                        <input
                          type="number"
                          className="input"
                          value={editForm.max_results}
                          placeholder="100"
                          onChange={(e) =>
                            setEditForm((prev) => ({ ...prev, max_results: e.target.value }))
                          }
                        />
                      </div>
                      <div className="flex items-end">
                        <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                          <Toggle
                            modelValue={editForm.enabled}
                            onUpdateModelValue={(value) =>
                              setEditForm((prev) => ({ ...prev, enabled: value }))
                            }
                          />
                          {t('admin.scheduledTests.enabled')}
                        </label>
                      </div>
                      <div className="flex items-end">
                        <div>
                          <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                            <Toggle
                              modelValue={editForm.auto_recover}
                              onUpdateModelValue={(value) =>
                                setEditForm((prev) => ({ ...prev, auto_recover: value }))
                              }
                            />
                            {t('admin.scheduledTests.autoRecover')}
                          </label>
                          <p className="mt-0.5 text-xs text-gray-400 dark:text-gray-500">
                            {t('admin.scheduledTests.autoRecoverHelp')}
                          </p>
                        </div>
                      </div>
                    </div>
                    <div className="mt-3 flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setEditingPlanId(null)}
                        className="rounded-lg bg-gray-100 px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-200 dark:bg-dark-600 dark:text-gray-300 dark:hover:bg-dark-500"
                      >
                        {t('common.cancel')}
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleEdit()}
                        disabled={!editForm.model_id || !editForm.cron_expression || updating}
                        className="flex items-center gap-1.5 rounded-lg bg-primary-500 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-primary-600 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {updating ? (
                          <Icon name="refresh" size="sm" className="animate-spin" strokeWidth={2} />
                        ) : null}
                        {t('common.save')}
                      </button>
                    </div>
                  </div>
                ) : null}

                {expandedPlanId === plan.id ? (
                  <div className="border-t border-gray-100 px-4 py-3 dark:border-dark-700">
                    <div className="mb-2 text-xs font-medium text-gray-600 dark:text-gray-400">
                      {t('admin.scheduledTests.results')}
                    </div>
                    {loadingResults ? (
                      <div className="flex items-center justify-center py-4">
                        <Icon name="refresh" size="sm" className="animate-spin text-gray-400" strokeWidth={2} />
                        <span className="ml-2 text-xs text-gray-500">{t('common.loading')}...</span>
                      </div>
                    ) : results.length === 0 ? (
                      <div className="py-4 text-center text-xs text-gray-500 dark:text-gray-400">
                        {t('admin.scheduledTests.noResults')}
                      </div>
                    ) : (
                      <div className="max-h-64 space-y-2 overflow-y-auto">
                        {results.map((result) => (
                          <div
                            key={result.id}
                            className="rounded-lg border border-gray-100 bg-gray-50 p-3 dark:border-dark-700 dark:bg-dark-900"
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <span
                                  className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                                    result.status === 'success'
                                      ? 'bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-400'
                                      : result.status === 'running'
                                        ? 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400'
                                        : 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400'
                                  }`}
                                >
                                  {result.status === 'success'
                                    ? t('admin.scheduledTests.success')
                                    : result.status === 'running'
                                      ? t('admin.scheduledTests.running')
                                      : t('admin.scheduledTests.failed')}
                                </span>
                                {result.latency_ms > 0 ? (
                                  <span className="text-xs text-gray-500 dark:text-gray-400">
                                    {result.latency_ms}ms
                                  </span>
                                ) : null}
                              </div>
                              <span className="text-xs text-gray-400">
                                {formatDateTime(result.started_at)}
                              </span>
                            </div>
                            {result.error_message ? (
                              <div className="mt-2">
                                <div
                                  className="cursor-pointer text-xs font-medium text-red-600 dark:text-red-400"
                                  onClick={() => toggleResultDetail(result.id)}
                                >
                                  {t('admin.scheduledTests.errorMessage')}
                                  <Icon
                                    name="chevronDown"
                                    size="sm"
                                    className={`inline transition-transform duration-200 ${
                                      expandedResultIds.has(result.id) ? 'rotate-180' : ''
                                    }`}
                                  />
                                </div>
                                {expandedResultIds.has(result.id) ? (
                                  <pre className="mt-1 max-h-32 overflow-auto whitespace-pre-wrap rounded bg-red-50 p-2 text-xs text-red-700 dark:bg-red-900/20 dark:text-red-300">
                                    {result.error_message}
                                  </pre>
                                ) : null}
                              </div>
                            ) : result.response_text ? (
                              <div className="mt-2">
                                <div
                                  className="cursor-pointer text-xs font-medium text-gray-600 dark:text-gray-400"
                                  onClick={() => toggleResultDetail(result.id)}
                                >
                                  {t('admin.scheduledTests.responseText')}
                                  <Icon
                                    name="chevronDown"
                                    size="sm"
                                    className={`inline transition-transform duration-200 ${
                                      expandedResultIds.has(result.id) ? 'rotate-180' : ''
                                    }`}
                                  />
                                </div>
                                {expandedResultIds.has(result.id) ? (
                                  <pre className="mt-1 max-h-32 overflow-auto whitespace-pre-wrap rounded bg-gray-100 p-2 text-xs text-gray-700 dark:bg-dark-800 dark:text-gray-300">
                                    {result.response_text}
                                  </pre>
                                ) : null}
                              </div>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </div>

      <ConfirmDialog
        show={showDeleteConfirm}
        title={t('admin.scheduledTests.deletePlan')}
        message={t('admin.scheduledTests.confirmDelete')}
        confirmText={t('common.delete')}
        cancelText={t('common.cancel')}
        danger
        onConfirm={() => void handleDelete()}
        onCancel={() => setShowDeleteConfirm(false)}
      />
    </BaseDialog>
  )
}
