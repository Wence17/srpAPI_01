'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useI18n } from '@/lib/i18n'
import { useApp } from '@/context/AppContext'
import { extractApiErrorMessage } from '@/lib/apiError'
import type { APIMode, BodyOverrideMode, Provider } from '@/lib/adminChannelMonitor'
import {
  adminChannelMonitorTemplateAPI,
  type ChannelMonitorTemplate,
} from '@/lib/adminChannelMonitorTemplate'
import { useChannelMonitorFormat } from '@/lib/useChannelMonitorFormat'
import {
  API_MODE_CHAT_COMPLETIONS,
  API_MODE_RESPONSES,
  PROVIDER_ANTHROPIC,
  PROVIDER_GEMINI,
  PROVIDER_OPENAI,
} from '@/lib/channelMonitorConstants'
import BaseDialog from '@/components/common/BaseDialog'
import ConfirmDialog from '@/components/common/ConfirmDialog'
import Icon from '@/components/icons/Icon'
import MonitorAdvancedRequestConfig from '@/components/admin/monitor/MonitorAdvancedRequestConfig'
import MonitorTemplateApplyPickerDialog from '@/components/admin/monitor/MonitorTemplateApplyPickerDialog'

interface TemplateFormState {
  id: number | null
  name: string
  provider: Provider
  api_mode: APIMode
  description: string
  extra_headers: Record<string, string>
  body_override_mode: BodyOverrideMode
  body_override: Record<string, unknown> | null
}

interface MonitorTemplateManagerDialogProps {
  show: boolean
  onClose: () => void
  onUpdated: () => void
}

function emptyForm(provider: Provider): TemplateFormState {
  return {
    id: null,
    name: '',
    provider,
    api_mode: API_MODE_CHAT_COMPLETIONS,
    description: '',
    extra_headers: {},
    body_override_mode: 'off',
    body_override: null,
  }
}

function normalizeAPIMode(mode: APIMode | undefined | null): APIMode {
  return mode === API_MODE_RESPONSES ? API_MODE_RESPONSES : API_MODE_CHAT_COMPLETIONS
}

export default function MonitorTemplateManagerDialog({
  show,
  onClose,
  onUpdated,
}: MonitorTemplateManagerDialogProps) {
  const { t } = useI18n()
  const appStore = useApp()
  const { providerPickerClass } = useChannelMonitorFormat()

  const [activeProvider, setActiveProvider] = useState<Provider>(PROVIDER_ANTHROPIC)
  const [templates, setTemplates] = useState<ChannelMonitorTemplate[]>([])
  const [loading, setLoading] = useState(false)
  const [editing, setEditing] = useState<null | 'new' | number>(null)
  const [submitting, setSubmitting] = useState(false)
  const [form, setForm] = useState<TemplateFormState>(() => emptyForm(PROVIDER_ANTHROPIC))
  const [applyPicker, setApplyPicker] = useState<{ show: boolean; tpl: ChannelMonitorTemplate | null }>({
    show: false,
    tpl: null,
  })
  const [confirmDelete, setConfirmDelete] = useState<{ show: boolean; tpl: ChannelMonitorTemplate | null }>({
    show: false,
    tpl: null,
  })

  const providerTabs = useMemo(
    () => [
      { value: PROVIDER_ANTHROPIC, label: t('monitorCommon.providers.anthropic') },
      { value: PROVIDER_OPENAI, label: t('monitorCommon.providers.openai') },
      { value: PROVIDER_GEMINI, label: t('monitorCommon.providers.gemini') },
    ],
    [t],
  )

  const templatesForActiveProvider = useMemo(
    () => templates.filter((tpl) => tpl.provider === activeProvider),
    [templates, activeProvider],
  )

  const countByProvider = useMemo(() => {
    const out: Record<Provider, number> = {
      anthropic: 0,
      openai: 0,
      gemini: 0,
    }
    for (const tpl of templates) out[tpl.provider]++
    return out
  }, [templates])

  const fetchTemplates = useCallback(async () => {
    setLoading(true)
    try {
      const { items } = await adminChannelMonitorTemplateAPI.list()
      setTemplates(items)
    } catch (error) {
      appStore.showError(extractApiErrorMessage(error, t('common.error')))
    } finally {
      setLoading(false)
    }
  }, [appStore, t])

  useEffect(() => {
    if (show) {
      setEditing(null)
      void fetchTemplates()
    }
  }, [show, fetchTemplates])

  const loadForm = (tpl: ChannelMonitorTemplate) => {
    setForm({
      id: tpl.id,
      name: tpl.name,
      provider: tpl.provider,
      api_mode: normalizeAPIMode(tpl.api_mode),
      description: tpl.description,
      extra_headers: { ...(tpl.extra_headers || {}) },
      body_override_mode: tpl.body_override_mode,
      body_override: tpl.body_override ? { ...tpl.body_override } : null,
    })
  }

  const openCreateForm = () => {
    setForm(emptyForm(activeProvider))
    setEditing('new')
  }

  const openEditForm = (tpl: ChannelMonitorTemplate) => {
    loadForm(tpl)
    setEditing(tpl.id)
  }

  const backToList = () => {
    setEditing(null)
  }

  const handleSubmit = async () => {
    if (submitting) return
    if (!form.name.trim()) {
      appStore.showError(t('admin.channelMonitor.template.missingName'))
      return
    }
    setSubmitting(true)
    try {
      if (editing === 'new') {
        await adminChannelMonitorTemplateAPI.create({
          name: form.name.trim(),
          provider: form.provider,
          api_mode: form.provider === PROVIDER_OPENAI ? form.api_mode : API_MODE_CHAT_COMPLETIONS,
          description: form.description.trim(),
          extra_headers: form.extra_headers,
          body_override_mode: form.body_override_mode,
          body_override: form.body_override,
        })
        appStore.showSuccess(t('admin.channelMonitor.template.createSuccess'))
      } else if (typeof editing === 'number') {
        await adminChannelMonitorTemplateAPI.update(editing, {
          name: form.name.trim(),
          api_mode: form.provider === PROVIDER_OPENAI ? form.api_mode : API_MODE_CHAT_COMPLETIONS,
          description: form.description.trim(),
          extra_headers: form.extra_headers,
          body_override_mode: form.body_override_mode,
          body_override: form.body_override,
        })
        appStore.showSuccess(t('admin.channelMonitor.template.updateSuccess'))
      }
      await fetchTemplates()
      onUpdated()
      setEditing(null)
    } catch (error) {
      appStore.showError(extractApiErrorMessage(error, t('common.error')))
    } finally {
      setSubmitting(false)
    }
  }

  const confirmApply = (tpl: ChannelMonitorTemplate) => {
    setApplyPicker({ show: true, tpl })
  }

  const onApplied = async () => {
    await fetchTemplates()
    onUpdated()
  }

  const handleDelete = (tpl: ChannelMonitorTemplate) => {
    setConfirmDelete({ show: true, tpl })
  }

  const confirmDeleteMessage = confirmDelete.tpl
    ? t('admin.channelMonitor.template.deleteConfirm', {
        name: confirmDelete.tpl.name,
        n: confirmDelete.tpl.associated_monitors,
      })
    : ''

  const doDelete = async () => {
    const tpl = confirmDelete.tpl
    setConfirmDelete({ show: false, tpl: null })
    if (!tpl) return
    try {
      await adminChannelMonitorTemplateAPI.del(tpl.id)
      appStore.showSuccess(t('admin.channelMonitor.template.deleteSuccess'))
      await fetchTemplates()
      onUpdated()
    } catch (error) {
      appStore.showError(extractApiErrorMessage(error, t('common.error')))
    }
  }

  const tabClass = (value: Provider): string =>
    activeProvider === value
      ? 'border-b-2 border-primary-500 text-primary-600 dark:text-primary-400'
      : 'border-b-2 border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'

  const modeBadgeClass = (mode: BodyOverrideMode): string => {
    switch (mode) {
      case 'merge':
        return 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300'
      case 'replace':
        return 'bg-purple-100 text-purple-700 dark:bg-purple-500/15 dark:text-purple-300'
      default:
        return 'bg-gray-100 text-gray-600 dark:bg-dark-700 dark:text-gray-300'
    }
  }

  const modeLabel = (mode: BodyOverrideMode): string =>
    t(`admin.channelMonitor.advanced.bodyMode${mode.charAt(0).toUpperCase()}${mode.slice(1)}`)

  const apiModeOptions = useMemo(
    () => [
      {
        value: API_MODE_CHAT_COMPLETIONS,
        label: t('admin.channelMonitor.form.apiModeChatCompletions'),
        hint: t('admin.channelMonitor.form.apiModeChatCompletionsHint'),
      },
      {
        value: API_MODE_RESPONSES,
        label: t('admin.channelMonitor.form.apiModeResponses'),
        hint: t('admin.channelMonitor.form.apiModeResponsesHint'),
      },
    ],
    [t],
  )

  const apiModeButtonClass = (mode: APIMode): string => {
    const active = form.api_mode === mode
    if (active) {
      return 'border-primary-500 bg-white text-primary-700 shadow-sm dark:border-primary-400 dark:bg-primary-500/15 dark:text-primary-300'
    }
    return 'border-blue-100 bg-white/70 text-gray-600 hover:border-primary-300 dark:border-dark-700 dark:bg-dark-800 dark:text-gray-400'
  }

  const apiModeLabel = (mode: APIMode): string =>
    normalizeAPIMode(mode) === API_MODE_RESPONSES
      ? t('admin.channelMonitor.form.apiModeResponses')
      : t('admin.channelMonitor.form.apiModeChatCompletions')

  const apiModeBadgeClass = (mode: APIMode): string => {
    if (normalizeAPIMode(mode) === API_MODE_RESPONSES) {
      return 'bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300'
    }
    return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300'
  }

  const setFormProvider = (provider: Provider) => {
    setForm((prev) => ({
      ...prev,
      provider,
      api_mode: provider !== PROVIDER_OPENAI ? API_MODE_CHAT_COMPLETIONS : prev.api_mode,
    }))
  }

  return (
    <>
      <BaseDialog
        show={show}
        title={t('admin.channelMonitor.template.managerTitle')}
        width="wide"
        onClose={onClose}
        footer={
          <div className="flex w-full items-center justify-between">
            <div>
              {editing ? (
                <button type="button" className="btn btn-secondary" onClick={backToList}>
                  {t('common.back')}
                </button>
              ) : null}
            </div>
            <div className="flex gap-2">
              <button type="button" className="btn btn-secondary" onClick={onClose}>
                {t('common.close')}
              </button>
              {editing ? (
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={submitting}
                  onClick={handleSubmit}
                >
                  {submitting
                    ? t('common.submitting')
                    : editing === 'new'
                      ? t('common.create')
                      : t('common.update')}
                </button>
              ) : null}
            </div>
          </div>
        }
      >
        <div className="mb-4 border-b border-gray-200 dark:border-dark-700">
          <div role="tablist" className="flex gap-1">
            {providerTabs.map((tab) => (
              <button
                key={tab.value}
                type="button"
                role="tab"
                aria-selected={activeProvider === tab.value}
                className={`px-4 py-2 text-sm font-medium transition-colors ${tabClass(tab.value)}`}
                onClick={() => setActiveProvider(tab.value)}
              >
                {tab.label}
                {countByProvider[tab.value] > 0 ? (
                  <span className="ml-1.5 rounded-full bg-gray-100 px-2 py-0.5 text-xs dark:bg-dark-700">
                    {countByProvider[tab.value]}
                  </span>
                ) : null}
              </button>
            ))}
          </div>
        </div>

        {!editing ? (
          <div className="space-y-2">
            <div className="flex justify-end">
              <button type="button" className="btn btn-primary btn-sm" onClick={openCreateForm}>
                <Icon name="plus" size="sm" className="mr-1" />
                {t('admin.channelMonitor.template.createButton')}
              </button>
            </div>

            {loading ? (
              <div className="py-8 text-center text-sm text-gray-400">{t('common.loading')}</div>
            ) : templatesForActiveProvider.length === 0 ? (
              <div className="py-8 text-center text-sm text-gray-400">
                {t('admin.channelMonitor.template.emptyState')}
              </div>
            ) : (
              templatesForActiveProvider.map((tpl) => (
                <div
                  key={tpl.id}
                  className="rounded-lg border border-gray-200 bg-white p-4 dark:border-dark-700 dark:bg-dark-800"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-gray-900 dark:text-white">{tpl.name}</span>
                        <span
                          className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-xs ${modeBadgeClass(tpl.body_override_mode)}`}
                        >
                          {modeLabel(tpl.body_override_mode)}
                        </span>
                        {tpl.provider === PROVIDER_OPENAI ? (
                          <span
                            className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-xs ${apiModeBadgeClass(tpl.api_mode)}`}
                          >
                            {apiModeLabel(tpl.api_mode)}
                          </span>
                        ) : null}
                        {tpl.associated_monitors > 0 ? (
                          <span className="text-xs text-gray-500 dark:text-gray-400">
                            {t('admin.channelMonitor.template.associatedCount', {
                              n: tpl.associated_monitors,
                            })}
                          </span>
                        ) : null}
                      </div>
                      {tpl.description ? (
                        <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                          {tpl.description}
                        </p>
                      ) : null}
                      <p className="mt-1 text-xs text-gray-400">
                        {t('admin.channelMonitor.template.headersSummary', {
                          n: Object.keys(tpl.extra_headers || {}).length,
                        })}
                      </p>
                    </div>
                    <div className="flex flex-shrink-0 gap-2">
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        disabled={tpl.associated_monitors === 0}
                        title={t('admin.channelMonitor.template.applyTooltip')}
                        onClick={() => confirmApply(tpl)}
                      >
                        <Icon name="refresh" size="sm" className="mr-1" />
                        {t('admin.channelMonitor.template.applyButton')}
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => openEditForm(tpl)}
                      >
                        {t('common.edit')}
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm text-red-600"
                        onClick={() => handleDelete(tpl)}
                      >
                        {t('common.delete')}
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <label className="input-label">
                {t('admin.channelMonitor.template.form.name')}
                <span className="text-red-500"> *</span>
              </label>
              <input
                value={form.name}
                type="text"
                required
                className="input"
                placeholder={t('admin.channelMonitor.template.form.namePlaceholder')}
                onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
              />
            </div>

            {editing === 'new' ? (
              <div>
                <label className="input-label">
                  {t('admin.channelMonitor.form.provider')}
                  <span className="text-red-500"> *</span>
                </label>
                <div className="grid grid-cols-3 gap-3">
                  {providerTabs.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      className={`rounded-lg border-2 px-3 py-2 text-sm font-medium transition-colors ${providerPickerClass(opt.value, form.provider === opt.value)}`}
                      onClick={() => setFormProvider(opt.value)}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {form.provider === PROVIDER_OPENAI ? (
              <div className="rounded-lg border border-blue-100 bg-blue-50/50 p-3 dark:border-blue-500/20 dark:bg-blue-500/10">
                <label className="input-label">{t('admin.channelMonitor.form.apiMode')}</label>
                <div className="grid gap-3 sm:grid-cols-2">
                  {apiModeOptions.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      className={`rounded-lg border-2 px-3 py-2 text-left transition-colors ${apiModeButtonClass(opt.value)}`}
                      onClick={() => setForm((prev) => ({ ...prev, api_mode: opt.value }))}
                    >
                      <span className="block text-sm font-semibold">{opt.label}</span>
                      <span className="mt-0.5 block text-xs opacity-80">{opt.hint}</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            <div>
              <label className="input-label">{t('admin.channelMonitor.template.form.description')}</label>
              <input
                value={form.description}
                type="text"
                className="input"
                placeholder={t('admin.channelMonitor.template.form.descriptionPlaceholder')}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, description: event.target.value }))
                }
              />
            </div>

            <MonitorAdvancedRequestConfig
              provider={form.provider}
              apiMode={form.api_mode}
              extraHeaders={form.extra_headers}
              bodyOverrideMode={form.body_override_mode}
              bodyOverride={form.body_override}
              onUpdateExtraHeaders={(extra_headers) =>
                setForm((prev) => ({ ...prev, extra_headers }))
              }
              onUpdateBodyOverrideMode={(body_override_mode) =>
                setForm((prev) => ({ ...prev, body_override_mode }))
              }
              onUpdateBodyOverride={(body_override) =>
                setForm((prev) => ({ ...prev, body_override }))
              }
            />
          </div>
        )}
      </BaseDialog>

      <MonitorTemplateApplyPickerDialog
        show={applyPicker.show}
        templateId={applyPicker.tpl ? applyPicker.tpl.id : null}
        templateName={applyPicker.tpl ? applyPicker.tpl.name : ''}
        onClose={() => setApplyPicker({ show: false, tpl: null })}
        onApplied={onApplied}
      />

      <ConfirmDialog
        show={confirmDelete.show}
        title={t('common.delete')}
        message={confirmDeleteMessage}
        confirmText={t('common.delete')}
        cancelText={t('common.cancel')}
        danger
        onConfirm={doDelete}
        onCancel={() => setConfirmDelete({ show: false, tpl: null })}
      />
    </>
  )
}
