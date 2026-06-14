'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useI18n } from '@/lib/i18n'
import { useApp } from '@/context/AppContext'
import {
  adminErrorPassthroughAPI,
  type ErrorPassthroughRule,
} from '@/lib/adminErrorPassthrough'
import { extractApiErrorMessage } from '@/lib/apiError'
import BaseDialog from '@/components/common/BaseDialog'
import ConfirmDialog from '@/components/common/ConfirmDialog'
import Icon from '@/components/icons/Icon'

interface ErrorPassthroughRulesModalProps {
  show: boolean
  onClose: () => void
}

const platformOptions = [
  { value: 'anthropic', label: 'Anthropic' },
  { value: 'openai', label: 'OpenAI' },
  { value: 'gemini', label: 'Gemini' },
  { value: 'antigravity', label: 'Antigravity' },
]

const defaultForm = {
  name: '',
  enabled: true,
  priority: 0,
  match_mode: 'any' as 'any' | 'all',
  platforms: [] as string[],
  passthrough_code: true,
  response_code: null as number | null,
  passthrough_body: true,
  custom_message: null as string | null,
  skip_monitoring: false,
  description: null as string | null,
}

export default function ErrorPassthroughRulesModal({ show, onClose }: ErrorPassthroughRulesModalProps) {
  const { t } = useI18n()
  const appStore = useApp()

  const [rules, setRules] = useState<ErrorPassthroughRule[]>([])
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [editingRule, setEditingRule] = useState<ErrorPassthroughRule | null>(null)
  const [deletingRule, setDeletingRule] = useState<ErrorPassthroughRule | null>(null)
  const [errorCodesInput, setErrorCodesInput] = useState('')
  const [keywordsInput, setKeywordsInput] = useState('')
  const [form, setForm] = useState(defaultForm)

  const matchModeOptions = useMemo(
    () => [
      {
        value: 'any' as const,
        label: t('admin.errorPassthrough.matchMode.any'),
        description: t('admin.errorPassthrough.matchMode.anyHint'),
      },
      {
        value: 'all' as const,
        label: t('admin.errorPassthrough.matchMode.all'),
        description: t('admin.errorPassthrough.matchMode.allHint'),
      },
    ],
    [t],
  )

  const loadRules = useCallback(async () => {
    setLoading(true)
    try {
      setRules(await adminErrorPassthroughAPI.list())
    } catch (error) {
      appStore.showError(t('admin.errorPassthrough.failedToLoad'))
      console.error('Error loading rules:', error)
    } finally {
      setLoading(false)
    }
  }, [appStore, t])

  useEffect(() => {
    if (show) void loadRules()
  }, [show, loadRules])

  const resetForm = () => {
    setForm(defaultForm)
    setErrorCodesInput('')
    setKeywordsInput('')
  }

  const closeFormModal = () => {
    setShowCreateModal(false)
    setShowEditModal(false)
    setEditingRule(null)
    resetForm()
  }

  const handleEdit = (rule: ErrorPassthroughRule) => {
    setEditingRule(rule)
    setForm({
      name: rule.name,
      enabled: rule.enabled,
      priority: rule.priority,
      match_mode: rule.match_mode,
      platforms: [...rule.platforms],
      passthrough_code: rule.passthrough_code,
      response_code: rule.response_code,
      passthrough_body: rule.passthrough_body,
      custom_message: rule.custom_message,
      skip_monitoring: rule.skip_monitoring,
      description: rule.description,
    })
    setErrorCodesInput(rule.error_codes.join(', '))
    setKeywordsInput(rule.keywords.join('\n'))
    setShowEditModal(true)
  }

  const parseErrorCodes = (): number[] => {
    if (!errorCodesInput.trim()) return []
    return errorCodesInput
      .split(/[,\s]+/)
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => !isNaN(n) && n > 0)
  }

  const parseKeywords = (): string[] => {
    if (!keywordsInput.trim()) return []
    return keywordsInput
      .split('\n')
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
  }

  const handleSubmit = async () => {
    if (!form.name.trim()) {
      appStore.showError(t('admin.errorPassthrough.nameRequired'))
      return
    }

    const errorCodes = parseErrorCodes()
    const keywords = parseKeywords()
    if (errorCodes.length === 0 && keywords.length === 0) {
      appStore.showError(t('admin.errorPassthrough.conditionsRequired'))
      return
    }

    setSubmitting(true)
    try {
      const data = {
        name: form.name.trim(),
        enabled: form.enabled,
        priority: form.priority,
        error_codes: errorCodes,
        keywords,
        match_mode: form.match_mode,
        platforms: form.platforms,
        passthrough_code: form.passthrough_code,
        response_code: form.passthrough_code ? null : form.response_code,
        passthrough_body: form.passthrough_body,
        custom_message: form.passthrough_body ? null : form.custom_message,
        skip_monitoring: form.skip_monitoring,
        description: form.description?.trim() || null,
      }

      if (showEditModal && editingRule) {
        await adminErrorPassthroughAPI.update(editingRule.id, data)
        appStore.showSuccess(t('admin.errorPassthrough.ruleUpdated'))
      } else {
        await adminErrorPassthroughAPI.create(data)
        appStore.showSuccess(t('admin.errorPassthrough.ruleCreated'))
      }

      closeFormModal()
      void loadRules()
    } catch (error: unknown) {
      appStore.showError(
        extractApiErrorMessage(error, t('admin.errorPassthrough.failedToSave')),
      )
      console.error('Error saving rule:', error)
    } finally {
      setSubmitting(false)
    }
  }

  const toggleEnabled = async (rule: ErrorPassthroughRule) => {
    try {
      await adminErrorPassthroughAPI.toggleEnabled(rule.id, !rule.enabled)
      setRules((prev) =>
        prev.map((r) => (r.id === rule.id ? { ...r, enabled: !r.enabled } : r)),
      )
    } catch (error: unknown) {
      appStore.showError(
        extractApiErrorMessage(error, t('admin.errorPassthrough.failedToToggle')),
      )
      console.error('Error toggling rule:', error)
    }
  }

  const confirmDelete = async () => {
    if (!deletingRule) return
    try {
      await adminErrorPassthroughAPI.delete(deletingRule.id)
      appStore.showSuccess(t('admin.errorPassthrough.ruleDeleted'))
      setShowDeleteDialog(false)
      setDeletingRule(null)
      void loadRules()
    } catch (error: unknown) {
      appStore.showError(
        extractApiErrorMessage(error, t('admin.errorPassthrough.failedToDelete')),
      )
      console.error('Error deleting rule:', error)
    }
  }

  return (
    <BaseDialog
      show={show}
      title={t('admin.errorPassthrough.title')}
      width="extra-wide"
      onClose={onClose}
      footer={
        <div className="flex justify-end">
          <button type="button" onClick={onClose} className="btn btn-secondary">
            {t('common.close')}
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {t('admin.errorPassthrough.description')}
          </p>
          <button type="button" onClick={() => setShowCreateModal(true)} className="btn btn-primary btn-sm">
            <Icon name="plus" size="sm" className="mr-1" />
            {t('admin.errorPassthrough.createRule')}
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Icon name="refresh" size="lg" className="animate-spin text-gray-400" />
          </div>
        ) : rules.length === 0 ? (
          <div className="py-8 text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 dark:bg-dark-700">
              <Icon name="shield" size="lg" className="text-gray-400" />
            </div>
            <h4 className="mb-1 text-sm font-medium text-gray-900 dark:text-white">
              {t('admin.errorPassthrough.noRules')}
            </h4>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {t('admin.errorPassthrough.createFirstRule')}
            </p>
          </div>
        ) : (
          <div className="max-h-96 overflow-auto rounded-lg border border-gray-200 dark:border-dark-600">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-dark-700">
              <thead className="sticky top-0 bg-gray-50 dark:bg-dark-700">
                <tr>
                  {[
                    t('admin.errorPassthrough.columns.priority'),
                    t('admin.errorPassthrough.columns.name'),
                    t('admin.errorPassthrough.columns.conditions'),
                    t('admin.errorPassthrough.columns.platforms'),
                    t('admin.errorPassthrough.columns.behavior'),
                    t('admin.errorPassthrough.columns.status'),
                    t('admin.errorPassthrough.columns.actions'),
                  ].map((label) => (
                    <th
                      key={label}
                      className="px-3 py-2 text-left text-xs font-medium uppercase text-gray-500 dark:text-gray-400"
                    >
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white dark:divide-dark-700 dark:bg-dark-800">
                {rules.map((rule) => (
                  <tr key={rule.id} className="hover:bg-gray-50 dark:hover:bg-dark-700">
                    <td className="whitespace-nowrap px-3 py-2">
                      <span className="inline-flex h-5 w-5 items-center justify-center rounded bg-gray-100 text-xs font-medium text-gray-700 dark:bg-dark-600 dark:text-gray-300">
                        {rule.priority}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <div className="text-sm font-medium text-gray-900 dark:text-white">{rule.name}</div>
                      {rule.description ? (
                        <div className="mt-0.5 max-w-xs truncate text-xs text-gray-500 dark:text-gray-400">
                          {rule.description}
                        </div>
                      ) : null}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex max-w-48 flex-wrap gap-1">
                        {rule.error_codes.slice(0, 3).map((code) => (
                          <span key={code} className="badge badge-danger text-xs">
                            {code}
                          </span>
                        ))}
                        {rule.error_codes.length > 3 ? (
                          <span className="text-xs text-gray-500">+{rule.error_codes.length - 3}</span>
                        ) : null}
                        {rule.keywords.slice(0, 1).map((keyword) => (
                          <span key={keyword} className="badge badge-gray text-xs">
                            &quot;{keyword.length > 10 ? `${keyword.substring(0, 10)}...` : keyword}&quot;
                          </span>
                        ))}
                        {rule.keywords.length > 1 ? (
                          <span className="text-xs text-gray-500">+{rule.keywords.length - 1}</span>
                        ) : null}
                      </div>
                      <div className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                        {t(`admin.errorPassthrough.matchMode.${rule.match_mode}`)}
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      {rule.platforms.length === 0 ? (
                        <div className="text-xs text-gray-500 dark:text-gray-400">
                          {t('admin.errorPassthrough.allPlatforms')}
                        </div>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {rule.platforms.slice(0, 2).map((platform) => (
                            <span key={platform} className="badge badge-primary text-xs">
                              {platform}
                            </span>
                          ))}
                          {rule.platforms.length > 2 ? (
                            <span className="text-xs text-gray-500">+{rule.platforms.length - 2}</span>
                          ) : null}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <div className="space-y-0.5 text-xs">
                        <div className="flex items-center gap-1">
                          <Icon
                            name={rule.passthrough_code ? 'checkCircle' : 'xCircle'}
                            size="xs"
                            className={rule.passthrough_code ? 'text-green-500' : 'text-gray-400'}
                          />
                          <span className="text-gray-600 dark:text-gray-400">
                            {t('admin.errorPassthrough.code')}:{' '}
                            {rule.passthrough_code
                              ? t('admin.errorPassthrough.passthrough')
                              : rule.response_code || '-'}
                          </span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Icon
                            name={rule.passthrough_body ? 'checkCircle' : 'xCircle'}
                            size="xs"
                            className={rule.passthrough_body ? 'text-green-500' : 'text-gray-400'}
                          />
                          <span className="text-gray-600 dark:text-gray-400">
                            {t('admin.errorPassthrough.body')}:{' '}
                            {rule.passthrough_body
                              ? t('admin.errorPassthrough.passthrough')
                              : t('admin.errorPassthrough.custom')}
                          </span>
                        </div>
                        {rule.skip_monitoring ? (
                          <div className="flex items-center gap-1">
                            <Icon name="checkCircle" size="xs" className="text-yellow-500" />
                            <span className="text-gray-600 dark:text-gray-400">
                              {t('admin.errorPassthrough.skipMonitoring')}
                            </span>
                          </div>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        onClick={() => void toggleEnabled(rule)}
                        className={`relative inline-flex h-4 w-7 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 ${
                          rule.enabled ? 'bg-primary-600' : 'bg-gray-200 dark:bg-dark-600'
                        }`}
                      >
                        <span
                          className={`pointer-events-none inline-block h-3 w-3 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                            rule.enabled ? 'translate-x-3' : 'translate-x-0'
                          }`}
                        />
                      </button>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleEdit(rule)}
                          className="p-1 text-gray-500 hover:text-primary-600 dark:hover:text-primary-400"
                          title={t('common.edit')}
                        >
                          <Icon name="edit" size="sm" />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setDeletingRule(rule)
                            setShowDeleteDialog(true)
                          }}
                          className="p-1 text-gray-500 hover:text-red-600 dark:hover:text-red-400"
                          title={t('common.delete')}
                        >
                          <Icon name="trash" size="sm" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <BaseDialog
        show={showCreateModal || showEditModal}
        title={
          showEditModal
            ? t('admin.errorPassthrough.editRule')
            : t('admin.errorPassthrough.createRule')
        }
        width="wide"
        onClose={closeFormModal}
        footer={
          <div className="flex justify-end gap-3">
            <button type="button" onClick={closeFormModal} className="btn btn-secondary">
              {t('common.cancel')}
            </button>
            <button
              type="button"
              onClick={() => void handleSubmit()}
              disabled={submitting}
              className="btn btn-primary"
            >
              {submitting ? (
                <Icon name="refresh" size="sm" className="mr-1 animate-spin" />
              ) : null}
              {showEditModal ? t('common.update') : t('common.create')}
            </button>
          </div>
        }
      >
        <form className="space-y-4" onSubmit={(e) => e.preventDefault()}>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="input-label">{t('admin.errorPassthrough.form.name')}</label>
              <input
                type="text"
                required
                className="input"
                value={form.name}
                placeholder={t('admin.errorPassthrough.form.namePlaceholder')}
                onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
              />
            </div>
            <div>
              <label className="input-label">{t('admin.errorPassthrough.form.priority')}</label>
              <input
                type="number"
                min={0}
                className="input"
                value={form.priority}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, priority: Number(e.target.value) || 0 }))
                }
              />
              <p className="input-hint">{t('admin.errorPassthrough.form.priorityHint')}</p>
            </div>
          </div>

          <div>
            <label className="input-label">{t('admin.errorPassthrough.form.description')}</label>
            <input
              type="text"
              className="input"
              value={form.description || ''}
              placeholder={t('admin.errorPassthrough.form.descriptionPlaceholder')}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, description: e.target.value || null }))
              }
            />
          </div>

          <div className="rounded-lg border border-gray-200 p-3 dark:border-dark-600">
            <h4 className="mb-2 text-sm font-medium text-gray-900 dark:text-white">
              {t('admin.errorPassthrough.form.matchConditions')}
            </h4>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="input-label text-xs">
                  {t('admin.errorPassthrough.form.errorCodes')}
                </label>
                <input
                  type="text"
                  className="input text-sm"
                  value={errorCodesInput}
                  placeholder={t('admin.errorPassthrough.form.errorCodesPlaceholder')}
                  onChange={(e) => setErrorCodesInput(e.target.value)}
                />
                <p className="input-hint text-xs">{t('admin.errorPassthrough.form.errorCodesHint')}</p>
              </div>
              <div>
                <label className="input-label text-xs">
                  {t('admin.errorPassthrough.form.keywords')}
                </label>
                <textarea
                  rows={2}
                  className="input font-mono text-xs"
                  value={keywordsInput}
                  placeholder={t('admin.errorPassthrough.form.keywordsPlaceholder')}
                  onChange={(e) => setKeywordsInput(e.target.value)}
                />
                <p className="input-hint text-xs">{t('admin.errorPassthrough.form.keywordsHint')}</p>
              </div>
            </div>

            <div className="mt-3">
              <label className="input-label text-xs">
                {t('admin.errorPassthrough.form.matchMode')}
              </label>
              <div className="mt-1 space-y-2">
                {matchModeOptions.map((option) => (
                  <label key={option.value} className="flex cursor-pointer items-start gap-2">
                    <input
                      type="radio"
                      value={option.value}
                      checked={form.match_mode === option.value}
                      className="mt-0.5 h-3.5 w-3.5 border-gray-300 text-primary-600 focus:ring-primary-500"
                      onChange={() => setForm((prev) => ({ ...prev, match_mode: option.value }))}
                    />
                    <div className="flex-1">
                      <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
                        {option.label}
                      </span>
                      <p className="text-xs text-gray-500 dark:text-gray-400">{option.description}</p>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            <div className="mt-3">
              <label className="input-label text-xs">
                {t('admin.errorPassthrough.form.platforms')}
              </label>
              <div className="flex flex-wrap gap-3">
                {platformOptions.map((platform) => (
                  <label key={platform.value} className="inline-flex items-center gap-1.5">
                    <input
                      type="checkbox"
                      value={platform.value}
                      checked={form.platforms.includes(platform.value)}
                      className="h-3.5 w-3.5 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                      onChange={(e) => {
                        setForm((prev) => ({
                          ...prev,
                          platforms: e.target.checked
                            ? [...prev.platforms, platform.value]
                            : prev.platforms.filter((p) => p !== platform.value),
                        }))
                      }}
                    />
                    <span className="text-xs text-gray-700 dark:text-gray-300">{platform.label}</span>
                  </label>
                ))}
              </div>
              <p className="input-hint mt-1 text-xs">{t('admin.errorPassthrough.form.platformsHint')}</p>
            </div>
          </div>

          <div className="rounded-lg border border-gray-200 p-3 dark:border-dark-600">
            <h4 className="mb-2 text-sm font-medium text-gray-900 dark:text-white">
              {t('admin.errorPassthrough.form.responseBehavior')}
            </h4>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={form.passthrough_code}
                    className="h-3.5 w-3.5 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, passthrough_code: e.target.checked }))
                    }
                  />
                  <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
                    {t('admin.errorPassthrough.form.passthroughCode')}
                  </span>
                </label>
                {!form.passthrough_code ? (
                  <div className="mt-2">
                    <label className="input-label text-xs">
                      {t('admin.errorPassthrough.form.responseCode')}
                    </label>
                    <input
                      type="number"
                      min={100}
                      max={599}
                      className="input text-sm"
                      placeholder="422"
                      value={form.response_code ?? ''}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          response_code: e.target.value ? Number(e.target.value) : null,
                        }))
                      }
                    />
                  </div>
                ) : null}
              </div>
              <div>
                <label className="flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={form.passthrough_body}
                    className="h-3.5 w-3.5 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, passthrough_body: e.target.checked }))
                    }
                  />
                  <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
                    {t('admin.errorPassthrough.form.passthroughBody')}
                  </span>
                </label>
                {!form.passthrough_body ? (
                  <div className="mt-2">
                    <label className="input-label text-xs">
                      {t('admin.errorPassthrough.form.customMessage')}
                    </label>
                    <input
                      type="text"
                      className="input text-sm"
                      value={form.custom_message || ''}
                      placeholder={t('admin.errorPassthrough.form.customMessagePlaceholder')}
                      onChange={(e) =>
                        setForm((prev) => ({ ...prev, custom_message: e.target.value || null }))
                      }
                    />
                  </div>
                ) : null}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <input
              type="checkbox"
              checked={form.skip_monitoring}
              className="h-3.5 w-3.5 rounded border-gray-300 text-yellow-600 focus:ring-yellow-500"
              onChange={(e) =>
                setForm((prev) => ({ ...prev, skip_monitoring: e.target.checked }))
              }
            />
            <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
              {t('admin.errorPassthrough.form.skipMonitoring')}
            </span>
          </div>
          <p className="-mt-3 input-hint text-xs">{t('admin.errorPassthrough.form.skipMonitoringHint')}</p>

          <div className="flex items-center gap-1.5">
            <input
              type="checkbox"
              checked={form.enabled}
              className="h-3.5 w-3.5 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
              onChange={(e) => setForm((prev) => ({ ...prev, enabled: e.target.checked }))}
            />
            <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
              {t('admin.errorPassthrough.form.enabled')}
            </span>
          </div>
        </form>
      </BaseDialog>

      <ConfirmDialog
        show={showDeleteDialog}
        title={t('admin.errorPassthrough.deleteRule')}
        message={t('admin.errorPassthrough.deleteConfirm', { name: deletingRule?.name ?? '' })}
        confirmText={t('common.delete')}
        cancelText={t('common.cancel')}
        danger
        onConfirm={() => void confirmDelete()}
        onCancel={() => setShowDeleteDialog(false)}
      />
    </BaseDialog>
  )
}
