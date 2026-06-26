'use client'

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from 'react'
import { useI18n } from '@/lib/i18n'
import { useApp } from '@/context/AppContext'
import { extractApiErrorMessage } from '@/lib/apiError'
import {
  adminChannelMonitorAPI,
  type APIMode,
  type BodyOverrideMode,
  type ChannelMonitor,
  type CreateParams,
  type Provider,
  type UpdateParams,
} from '@/lib/adminChannelMonitor'
import { adminChannelMonitorTemplateAPI } from '@/lib/adminChannelMonitorTemplate'
import type { ChannelMonitorTemplate } from '@/lib/adminChannelMonitorTemplate'
import { keysAPI } from '@/lib/keys'
import { userGroupsAPI } from '@/lib/groups'
import type { ApiKey } from '@/lib/types'
import { useChannelMonitorFormat } from '@/lib/useChannelMonitorFormat'
import {
  API_MODE_CHAT_COMPLETIONS,
  API_MODE_RESPONSES,
  DEFAULT_INTERVAL_SECONDS,
  PROVIDER_ANTHROPIC,
  PROVIDER_GEMINI,
  PROVIDER_OPENAI,
} from '@/lib/channelMonitorConstants'
import BaseDialog from '@/components/common/BaseDialog'
import Toggle from '@/components/common/Toggle'
import Select from '@/components/common/Select'
import ModelTagInput from '@/components/admin/channel/ModelTagInput'
import { getPlatformTextClass } from '@/components/admin/channel/types'
import MonitorKeyPickerDialog from '@/components/admin/monitor/MonitorKeyPickerDialog'
import MonitorAdvancedRequestConfig from '@/components/admin/monitor/MonitorAdvancedRequestConfig'
import ProviderIcon from '@/components/user/monitor/ProviderIcon'

interface MonitorFormState {
  name: string
  provider: Provider
  api_mode: APIMode
  endpoint: string
  api_key: string
  primary_model: string
  extra_models: string[]
  group_name: string
  interval_seconds: number
  enabled: boolean
  template_id: number | null
  extra_headers: Record<string, string>
  body_override_mode: BodyOverrideMode
  body_override: Record<string, unknown> | null
}

interface MonitorFormDialogProps {
  show: boolean
  monitor: ChannelMonitor | null
  onClose: () => void
  onSaved: () => void
}

function normalizeAPIMode(mode: APIMode | undefined | null): APIMode {
  return mode === API_MODE_RESPONSES ? API_MODE_RESPONSES : API_MODE_CHAT_COMPLETIONS
}

function emptyForm(intervalSeconds: number): MonitorFormState {
  return {
    name: '',
    provider: PROVIDER_ANTHROPIC,
    api_mode: API_MODE_CHAT_COMPLETIONS,
    endpoint: '',
    api_key: '',
    primary_model: '',
    extra_models: [],
    group_name: '',
    interval_seconds: intervalSeconds,
    enabled: true,
    template_id: null,
    extra_headers: {},
    body_override_mode: 'off',
    body_override: null,
  }
}

export default function MonitorFormDialog({ show, monitor, onClose, onSaved }: MonitorFormDialogProps) {
  const { t } = useI18n()
  const appStore = useApp()
  const { providerPickerClass } = useChannelMonitorFormat()

  const systemDefaultInterval = useMemo(() => {
    const configured = appStore.cachedPublicSettings?.channel_monitor_default_interval_seconds
    return configured && configured > 0 ? configured : DEFAULT_INTERVAL_SECONDS
  }, [appStore.cachedPublicSettings?.channel_monitor_default_interval_seconds])

  const [form, setForm] = useState<MonitorFormState>(() => emptyForm(systemDefaultInterval))
  const [submitting, setSubmitting] = useState(false)
  const [showKeyPicker, setShowKeyPicker] = useState(false)
  const [myKeysLoading, setMyKeysLoading] = useState(false)
  const [myActiveKeys, setMyActiveKeys] = useState<ApiKey[]>([])
  const [userGroupRates, setUserGroupRates] = useState<Record<number, number>>({})
  const [templatesCache, setTemplatesCache] = useState<ChannelMonitorTemplate[]>([])
  const suppressFormWatchersRef = useRef(false)

  const editing = monitor

  const loadTemplates = useCallback(async () => {
    if (templatesCache.length > 0) return
    try {
      const { items } = await adminChannelMonitorTemplateAPI.list()
      setTemplatesCache(items)
    } catch (error) {
      console.warn('load monitor templates failed', error)
    }
  }, [templatesCache.length])

  const resetForm = useCallback(() => {
    suppressFormWatchersRef.current = true
    setForm(emptyForm(systemDefaultInterval))
    suppressFormWatchersRef.current = false
  }, [systemDefaultInterval])

  const loadFromMonitor = useCallback(
    (m: ChannelMonitor) => {
      suppressFormWatchersRef.current = true
      setForm({
        name: m.name,
        provider: m.provider,
        api_mode: normalizeAPIMode(m.api_mode),
        endpoint: m.endpoint,
        api_key: '',
        primary_model: m.primary_model,
        extra_models: [...(m.extra_models || [])],
        group_name: m.group_name || '',
        interval_seconds: m.interval_seconds || systemDefaultInterval,
        enabled: m.enabled,
        template_id: m.template_id ?? null,
        extra_headers: { ...(m.extra_headers || {}) },
        body_override_mode: m.body_override_mode || 'off',
        body_override: m.body_override ? { ...m.body_override } : null,
      })
      suppressFormWatchersRef.current = false
    },
    [systemDefaultInterval],
  )

  useEffect(() => {
    if (!show) return
    void loadTemplates()
    if (monitor) loadFromMonitor(monitor)
    else resetForm()
  }, [show, monitor, loadTemplates, loadFromMonitor, resetForm])

  const setProvider = (provider: Provider) => {
    setForm((prev) => ({
      ...prev,
      provider,
      api_key: '',
      api_mode: provider !== PROVIDER_OPENAI ? API_MODE_CHAT_COMPLETIONS : prev.api_mode,
      template_id: null,
      extra_headers: {},
      body_override_mode: 'off',
      body_override: null,
    }))
  }

  const setApiMode = (api_mode: APIMode) => {
    setForm((prev) => {
      if (prev.provider !== PROVIDER_OPENAI) {
        return { ...prev, api_mode }
      }
      return {
        ...prev,
        api_mode,
        template_id: null,
        extra_headers: {},
        body_override_mode: 'off',
        body_override: null,
      }
    })
  }

  const templateOptions = useMemo(() => {
    const items = templatesCache.filter((tpl) => {
      if (tpl.provider !== form.provider) return false
      if (form.provider !== PROVIDER_OPENAI) return true
      return normalizeAPIMode(tpl.api_mode) === form.api_mode
    })
    return [
      { value: '', label: t('admin.channelMonitor.templateField.none') },
      ...items.map((tpl) => ({
        value: String(tpl.id),
        label: templateOptionLabel(tpl, t),
      })),
    ]
  }, [templatesCache, form.provider, form.api_mode, t])

  const templateSelectValue = form.template_id == null ? '' : String(form.template_id)

  const handleTemplateSelect = (raw: string) => {
    if (raw === '') {
      setForm((prev) => ({ ...prev, template_id: null }))
      return
    }
    const id = Number(raw)
    if (!Number.isFinite(id)) return
    const tpl = templatesCache.find((item) => item.id === id)
    if (tpl) {
      suppressFormWatchersRef.current = true
      setForm((prev) => ({
        ...prev,
        api_mode: normalizeAPIMode(tpl.api_mode),
        template_id: id,
        extra_headers: { ...(tpl.extra_headers || {}) },
        body_override_mode: tpl.body_override_mode,
        body_override: tpl.body_override ? { ...tpl.body_override } : null,
      }))
      suppressFormWatchersRef.current = false
    } else {
      setForm((prev) => ({ ...prev, template_id: id }))
    }
  }

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

  const providerOptions = useMemo(
    () => [
      { value: PROVIDER_ANTHROPIC, label: t('monitorCommon.providers.anthropic') },
      { value: PROVIDER_OPENAI, label: t('monitorCommon.providers.openai') },
      { value: PROVIDER_GEMINI, label: t('monitorCommon.providers.gemini') },
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

  const useCurrentDomain = () => {
    setForm((prev) => ({ ...prev, endpoint: window.location.origin }))
  }

  const openMyKeyPicker = async () => {
    setShowKeyPicker(true)
    if (myActiveKeys.length > 0) return
    setMyKeysLoading(true)
    try {
      const [res, rates] = await Promise.all([
        keysAPI.list(1, 100, { status: 'active' }),
        userGroupsAPI.getUserGroupRates(),
      ])
      const items = res.items || []
      const now = Date.now()
      setMyActiveKeys(
        items.filter((key) => {
          if (key.status !== 'active') return false
          if (!key.expires_at) return true
          return new Date(key.expires_at).getTime() > now
        }),
      )
      setUserGroupRates(rates)
    } catch (error) {
      appStore.showError(extractApiErrorMessage(error, t('admin.channelMonitor.form.noActiveKey')))
    } finally {
      setMyKeysLoading(false)
    }
  }

  const pickMyKey = (key: ApiKey) => {
    setForm((prev) => ({ ...prev, api_key: key.key }))
    setShowKeyPicker(false)
  }

  const buildPayload = (): CreateParams => ({
    name: form.name.trim(),
    provider: form.provider,
    api_mode: form.provider === PROVIDER_OPENAI ? form.api_mode : API_MODE_CHAT_COMPLETIONS,
    endpoint: form.endpoint.trim(),
    api_key: form.api_key.trim(),
    primary_model: form.primary_model.trim(),
    extra_models: form.extra_models,
    group_name: form.group_name.trim(),
    enabled: form.enabled,
    interval_seconds: form.interval_seconds,
    template_id: form.template_id,
    extra_headers: form.extra_headers,
    body_override_mode: form.body_override_mode,
    body_override: form.body_override,
  })

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (submitting) return
    if (!form.name.trim()) {
      appStore.showError(t('admin.channelMonitor.nameRequired'))
      return
    }
    if (!form.primary_model.trim()) {
      appStore.showError(t('admin.channelMonitor.primaryModelRequired'))
      return
    }

    setSubmitting(true)
    try {
      if (editing) {
        const { api_key, ...rest } = buildPayload()
        const req: UpdateParams = { ...rest }
        if (api_key) req.api_key = api_key
        if (form.template_id == null) {
          req.clear_template = true
          delete req.template_id
        }
        await adminChannelMonitorAPI.update(editing.id, req)
        appStore.showSuccess(t('admin.channelMonitor.updateSuccess'))
      } else {
        await adminChannelMonitorAPI.create(buildPayload())
        appStore.showSuccess(t('admin.channelMonitor.createSuccess'))
      }
      onSaved()
      onClose()
    } catch (error) {
      appStore.showError(extractApiErrorMessage(error, t('common.error')))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <BaseDialog
        show={show}
        title={
          editing
            ? t('admin.channelMonitor.editTitle')
            : t('admin.channelMonitor.createTitle')
        }
        width="wide"
        onClose={onClose}
        footer={
          <div className="flex justify-end gap-3">
            <button type="button" onClick={onClose} className="btn btn-secondary">
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              form="channel-monitor-form"
              disabled={submitting}
              className="btn btn-primary"
            >
              {submitting
                ? t('common.submitting')
                : editing
                  ? t('common.update')
                  : t('common.create')}
            </button>
          </div>
        }
      >
        <form id="channel-monitor-form" onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="input-label">
              {t('admin.channelMonitor.form.name')} <span className="text-red-500">*</span>
            </label>
            <input
              value={form.name}
              type="text"
              required
              className="input"
              placeholder={t('admin.channelMonitor.form.namePlaceholder')}
              onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
            />
          </div>

          <div>
            <label className="input-label">
              {t('admin.channelMonitor.form.provider')} <span className="text-red-500">*</span>
            </label>
            <div className="grid grid-cols-3 gap-3">
              {providerOptions.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  aria-pressed={form.provider === opt.value}
                  className={`flex items-center justify-center gap-2 rounded-lg border-2 px-3 py-2.5 text-sm font-medium transition-colors ${providerPickerClass(opt.value, form.provider === opt.value)}`}
                  onClick={() => setProvider(opt.value)}
                >
                  <ProviderIcon provider={opt.value} size={18} />
                  <span>{opt.label}</span>
                </button>
              ))}
            </div>
          </div>

          {form.provider === PROVIDER_OPENAI ? (
            <div className="rounded-lg border border-blue-100 bg-blue-50/50 p-3 dark:border-blue-500/20 dark:bg-blue-500/10">
              <label className="input-label">{t('admin.channelMonitor.form.apiMode')}</label>
              <div className="grid gap-3 sm:grid-cols-2">
                {apiModeOptions.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    aria-pressed={form.api_mode === opt.value}
                    className={`rounded-lg border-2 px-3 py-2 text-left transition-colors ${apiModeButtonClass(opt.value)}`}
                    onClick={() => setApiMode(opt.value)}
                  >
                    <span className="block text-sm font-semibold">{opt.label}</span>
                    <span className="mt-0.5 block text-xs opacity-80">{opt.hint}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          <div>
            <label className="input-label">
              {t('admin.channelMonitor.form.endpoint')} <span className="text-red-500">*</span>
            </label>
            <div className="flex gap-2">
              <input
                value={form.endpoint}
                type="text"
                required
                className="input flex-1"
                placeholder={t('admin.channelMonitor.form.endpointPlaceholder')}
                onChange={(event) => setForm((prev) => ({ ...prev, endpoint: event.target.value }))}
              />
              <button type="button" onClick={useCurrentDomain} className="btn btn-secondary whitespace-nowrap">
                {t('admin.channelMonitor.form.useCurrentDomain')}
              </button>
            </div>
          </div>

          <div>
            <label className="input-label">
              {t('admin.channelMonitor.form.apiKey')}
              {!editing ? <span className="text-red-500"> *</span> : null}
            </label>
            <div className="flex gap-2">
              <input
                value={form.api_key}
                type="password"
                required={!editing}
                className="input flex-1"
                placeholder={
                  editing
                    ? t('admin.channelMonitor.form.apiKeyEditPlaceholder')
                    : t('admin.channelMonitor.form.apiKeyPlaceholder')
                }
                onChange={(event) => setForm((prev) => ({ ...prev, api_key: event.target.value }))}
              />
              <button type="button" onClick={openMyKeyPicker} className="btn btn-secondary whitespace-nowrap">
                {t('admin.channelMonitor.form.useMyKey')}
              </button>
            </div>
            {editing && editing.api_key_masked ? (
              <p className="mt-1 text-xs text-gray-400">{editing.api_key_masked}</p>
            ) : null}
          </div>

          <div>
            <label className="input-label">
              {t('admin.channelMonitor.form.primaryModel')} <span className="text-red-500">*</span>
            </label>
            <input
              value={form.primary_model}
              type="text"
              required
              className={`input font-medium ${getPlatformTextClass(form.provider)}`}
              placeholder={t('admin.channelMonitor.form.primaryModelPlaceholder')}
              onChange={(event) => setForm((prev) => ({ ...prev, primary_model: event.target.value }))}
            />
          </div>

          <div>
            <label className="input-label">{t('admin.channelMonitor.form.extraModels')}</label>
            <ModelTagInput
              models={form.extra_models}
              platform={form.provider}
              placeholder={t('admin.channelMonitor.form.extraModelsPlaceholder')}
              onUpdateModels={(models) => setForm((prev) => ({ ...prev, extra_models: models }))}
            />
          </div>

          <div>
            <label className="input-label">{t('admin.channelMonitor.form.groupName')}</label>
            <input
              value={form.group_name}
              type="text"
              className="input"
              placeholder={t('admin.channelMonitor.form.groupNamePlaceholder')}
              onChange={(event) => setForm((prev) => ({ ...prev, group_name: event.target.value }))}
            />
          </div>

          <div>
            <label className="input-label">
              {t('admin.channelMonitor.form.intervalSeconds')} <span className="text-red-500">*</span>
            </label>
            <input
              value={form.interval_seconds}
              type="number"
              min={15}
              max={3600}
              required
              className="input"
              onChange={(event) =>
                setForm((prev) => ({
                  ...prev,
                  interval_seconds: Number(event.target.value),
                }))
              }
            />
            <p className="mt-1 text-xs text-gray-400">
              {t('admin.channelMonitor.form.intervalSecondsHint')}
            </p>
          </div>

          <div className="flex items-center justify-between">
            <label className="input-label mb-0">{t('admin.channelMonitor.form.enabled')}</label>
            <Toggle
              modelValue={form.enabled}
              onUpdateModelValue={(enabled) => setForm((prev) => ({ ...prev, enabled }))}
            />
          </div>

          <details className="rounded-lg border border-gray-200 bg-gray-50/50 p-3 dark:border-dark-700 dark:bg-dark-900/30">
            <summary className="cursor-pointer text-sm font-medium text-gray-700 dark:text-gray-300">
              {t('admin.channelMonitor.advanced.section')}
            </summary>
            <p className="mt-1 text-xs text-gray-400">{t('admin.channelMonitor.advanced.sectionHint')}</p>

            <div className="mt-4 space-y-4">
              <div>
                <label className="input-label">{t('admin.channelMonitor.templateField.label')}</label>
                <Select
                  modelValue={templateSelectValue}
                  options={templateOptions}
                  placeholder={t('admin.channelMonitor.templateField.placeholder')}
                  onUpdateModelValue={(value) => handleTemplateSelect(String(value ?? ''))}
                />
                <p className="mt-1 text-xs text-gray-400">
                  {t('admin.channelMonitor.templateField.applyHint')}
                </p>
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
          </details>
        </form>
      </BaseDialog>

      <MonitorKeyPickerDialog
        show={showKeyPicker}
        loading={myKeysLoading}
        keys={myActiveKeys}
        provider={form.provider}
        userGroupRates={userGroupRates}
        onClose={() => setShowKeyPicker(false)}
        onPick={pickMyKey}
      />
    </>
  )
}

function templateOptionLabel(
  tpl: ChannelMonitorTemplate,
  t: (key: string) => string,
): string {
  if (tpl.provider !== PROVIDER_OPENAI) return tpl.name
  const labelKey =
    normalizeAPIMode(tpl.api_mode) === API_MODE_RESPONSES
      ? 'admin.channelMonitor.form.apiModeResponses'
      : 'admin.channelMonitor.form.apiModeChatCompletions'
  return `${tpl.name} · ${t(labelKey)}`
}
