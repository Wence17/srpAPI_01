'use client'

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useState,
  type FormEvent,
} from 'react'
import { useI18n } from '@/lib/i18n'
import { useApp } from '@/context/AppContext'
import BaseDialog from '@/components/common/BaseDialog'
import HelpTooltip from '@/components/common/HelpTooltip'
import Select, { type SelectOption } from '@/components/common/Select'
import ToggleSwitch from '@/components/payment/ToggleSwitch'
import type { ProviderInstance } from '@/lib/payment/types'
import type { TypeOption } from '@/lib/payment/providerConfig'
import {
  PAYMENT_MODE_POPUP,
  PAYMENT_MODE_QRCODE,
  PAYMENT_MODE_REDIRECT,
  PROVIDER_CALLBACK_PATHS,
  PROVIDER_CONFIG_FIELDS,
  PROVIDER_SUPPORTED_TYPES,
  STRIPE_SDK_API_VERSION,
  WEBHOOK_PATHS,
  extractBaseUrl,
  getAvailableTypes,
} from '@/lib/payment/providerConfig'

function defaultPaymentMode(providerKey: string): string {
  if (providerKey === 'easypay') return PAYMENT_MODE_QRCODE
  return ''
}

function providerSupportsPaymentMode(providerKey: string): boolean {
  return providerKey === 'easypay' || providerKey === 'alipay'
}

function isValidPaymentMode(providerKey: string, mode: string): boolean {
  if (providerKey === 'easypay') {
    return mode === PAYMENT_MODE_QRCODE || mode === PAYMENT_MODE_POPUP
  }
  if (providerKey === 'alipay') {
    return mode === '' || mode === PAYMENT_MODE_REDIRECT
  }
  return mode === ''
}

interface PaymentGuideItem {
  title: string
  open: string
  call: string
  fallback: string
}

interface PaymentGuide {
  summary: string
  items: PaymentGuideItem[]
  note?: string
}

export interface ProviderSavePayload {
  provider_key: string
  name: string
  supported_types: string[]
  enabled: boolean
  payment_mode: string
  refund_enabled: boolean
  allow_user_refund: boolean
  config: Record<string, string>
  limits: string
}

export interface PaymentProviderDialogHandle {
  reset: (defaultKey: string) => void
  loadProvider: (provider: ProviderInstance) => void
}

interface PaymentProviderDialogProps {
  show: boolean
  saving: boolean
  editing: ProviderInstance | null
  allKeyOptions: TypeOption[]
  enabledKeyOptions: TypeOption[]
  allPaymentTypes: TypeOption[]
  redirectLabel: string
  onClose: () => void
  onSave: (payload: ProviderSavePayload) => void
}

interface FormState {
  name: string
  provider_key: string
  supported_types: string[]
  enabled: boolean
  payment_mode: string
  refund_enabled: boolean
  allow_user_refund: boolean
}

const PaymentProviderDialog = forwardRef<PaymentProviderDialogHandle, PaymentProviderDialogProps>(
  function PaymentProviderDialog(
    {
      show,
      saving,
      editing,
      allKeyOptions,
      enabledKeyOptions,
      allPaymentTypes,
      redirectLabel,
      onClose,
      onSave,
    },
    ref,
  ) {
    const { t } = useI18n()
    const appStore = useApp()

    const [form, setForm] = useState<FormState>({
      name: '',
      provider_key: 'easypay',
      supported_types: [...(PROVIDER_SUPPORTED_TYPES.easypay || [])],
      enabled: true,
      payment_mode: PAYMENT_MODE_QRCODE,
      refund_enabled: false,
      allow_user_refund: false,
    })
    const [config, setConfig] = useState<Record<string, string>>({})
    const [limits, setLimits] = useState<Record<string, Record<string, number>>>({})
    const [notifyBaseUrl, setNotifyBaseUrl] = useState('')
    const [returnBaseUrl, setReturnBaseUrl] = useState('')
    const [limitsExpanded, setLimitsExpanded] = useState(false)
    const [visibleFields, setVisibleFields] = useState<Record<string, boolean>>({})

    const defaultBaseUrl = typeof window !== 'undefined' ? window.location.origin : ''

    const providerWebhookHintMap: Record<string, string> = {
      stripe: 'admin.settings.payment.stripeWebhookHint',
      airwallex: 'admin.settings.payment.airwallexWebhookHint',
    }

    const providerWebhookUrl = useMemo(() => {
      const path = WEBHOOK_PATHS[form.provider_key]
      return providerWebhookHintMap[form.provider_key] && path ? defaultBaseUrl + path : ''
    }, [defaultBaseUrl, form.provider_key])

    const providerWebhookHint =
      providerWebhookHintMap[form.provider_key] || 'admin.settings.payment.stripeWebhookHint'

    const callbackPaths = PROVIDER_CALLBACK_PATHS[form.provider_key] || null
    const supportsPaymentMode = providerSupportsPaymentMode(form.provider_key)

    const paymentModeOptions = useMemo(() => {
      if (form.provider_key === 'alipay') {
        return [
          { value: '', label: t('admin.settings.payment.modeQRCode') },
          { value: PAYMENT_MODE_REDIRECT, label: t('admin.settings.payment.modeRedirect') },
        ]
      }
      return [
        { value: PAYMENT_MODE_QRCODE, label: t('admin.settings.payment.modeQRCode') },
        { value: PAYMENT_MODE_POPUP, label: t('admin.settings.payment.modePopup') },
      ]
    }, [form.provider_key, t])

    const availableTypes = useMemo(
      () =>
        getAvailableTypes(form.provider_key, allPaymentTypes, redirectLabel).map((opt) =>
          opt.label === opt.value
            ? { ...opt, label: t(`payment.methods.${opt.value}`, opt.value) }
            : opt,
        ),
      [allPaymentTypes, form.provider_key, redirectLabel, t],
    )

    const resolvedFields = useMemo(() => {
      const fields = PROVIDER_CONFIG_FIELDS[form.provider_key] || []
      return fields.map((f) => ({
        ...f,
        label: f.label || t(`admin.settings.payment.field_${f.key}`),
      }))
    }, [form.provider_key, t])

    const paymentGuide = useMemo<PaymentGuide | null>(() => {
      if (form.provider_key === 'alipay') {
        return {
          summary: t('admin.settings.payment.alipayGuideSummary'),
          items: [
            {
              title: t('admin.settings.payment.alipayGuideFaceToFaceTitle'),
              open: t('admin.settings.payment.alipayGuideFaceToFaceOpen'),
              call: t('admin.settings.payment.alipayGuideFaceToFaceCall'),
              fallback: t('admin.settings.payment.alipayGuideFaceToFaceFallback'),
            },
            {
              title: t('admin.settings.payment.alipayGuidePagePayTitle'),
              open: t('admin.settings.payment.alipayGuidePagePayOpen'),
              call: t('admin.settings.payment.alipayGuidePagePayCall'),
              fallback: t('admin.settings.payment.alipayGuidePagePayFallback'),
            },
            {
              title: t('admin.settings.payment.alipayGuideWapTitle'),
              open: t('admin.settings.payment.alipayGuideWapOpen'),
              call: t('admin.settings.payment.alipayGuideWapCall'),
              fallback: t('admin.settings.payment.alipayGuideWapFallback'),
            },
          ],
        }
      }

      if (form.provider_key === 'wxpay') {
        return {
          summary: t('admin.settings.payment.wxpayGuideSummary'),
          note: t('admin.settings.payment.wxpayGuideNote'),
          items: [
            {
              title: t('admin.settings.payment.wxpayGuideNativeTitle'),
              open: t('admin.settings.payment.wxpayGuideNativeOpen'),
              call: t('admin.settings.payment.wxpayGuideNativeCall'),
              fallback: t('admin.settings.payment.wxpayGuideNativeFallback'),
            },
            {
              title: t('admin.settings.payment.wxpayGuideJsapiTitle'),
              open: t('admin.settings.payment.wxpayGuideJsapiOpen'),
              call: t('admin.settings.payment.wxpayGuideJsapiCall'),
              fallback: t('admin.settings.payment.wxpayGuideJsapiFallback'),
            },
            {
              title: t('admin.settings.payment.wxpayGuideH5Title'),
              open: t('admin.settings.payment.wxpayGuideH5Open'),
              call: t('admin.settings.payment.wxpayGuideH5Call'),
              fallback: t('admin.settings.payment.wxpayGuideH5Fallback'),
            },
          ],
        }
      }

      if (form.provider_key === 'airwallex') {
        return {
          summary: t('admin.settings.payment.airwallexGuideSummary'),
          note: t('admin.settings.payment.airwallexGuideNote'),
          items: [],
        }
      }

      return null
    }, [form.provider_key, t])

    const limitableTypes = useMemo(() => {
      if (form.provider_key === 'stripe') {
        return [{ value: 'stripe', label: 'Stripe' }]
      }
      const selected = form.supported_types.filter((typeVal) => typeVal !== 'easypay')
      return selected.map((v) => {
        const found = allPaymentTypes.find((pt) => pt.value === v)
        return found || { value: v, label: v }
      })
    }, [allPaymentTypes, form.provider_key, form.supported_types])

    const clearConfig = useCallback(() => {
      setConfig({})
      setLimits({})
      setVisibleFields({})
      setNotifyBaseUrl('')
      setReturnBaseUrl('')
      setLimitsExpanded(false)
    }, [])

    const applyDefaults = useCallback(
      (providerKey: string, currentConfig: Record<string, string>) => {
        const next = { ...currentConfig }
        for (const f of PROVIDER_CONFIG_FIELDS[providerKey] || []) {
          if (f.defaultValue && !next[f.key]) next[f.key] = f.defaultValue
        }
        setConfig(next)
      },
      [],
    )

    const reset = useCallback(
      (defaultKey: string) => {
        setForm({
          name: '',
          provider_key: defaultKey,
          supported_types: [...(PROVIDER_SUPPORTED_TYPES[defaultKey] || [])],
          enabled: true,
          payment_mode: defaultPaymentMode(defaultKey),
          refund_enabled: false,
          allow_user_refund: false,
        })
        clearConfig()
        applyDefaults(defaultKey, {})
      },
      [applyDefaults, clearConfig],
    )

    const loadProvider = useCallback(
      (provider: ProviderInstance) => {
        const nextConfig: Record<string, string> = {}
        let nextNotifyBase = ''
        let nextReturnBase = ''
        const nextLimits: Record<string, Record<string, number>> = {}
        let nextLimitsExpanded = false

        if (provider.config) {
          for (const [k, v] of Object.entries(provider.config)) {
            if (k === 'notifyUrl' || k === 'returnUrl') continue
            nextConfig[k] = v
          }
          const paths = PROVIDER_CALLBACK_PATHS[provider.provider_key]
          if (paths?.notifyUrl && provider.config.notifyUrl) {
            nextNotifyBase = extractBaseUrl(provider.config.notifyUrl, paths.notifyUrl)
          }
          if (paths?.returnUrl && provider.config.returnUrl) {
            nextReturnBase = extractBaseUrl(provider.config.returnUrl, paths.returnUrl)
          }
        }

        if (provider.limits) {
          try {
            const parsed = JSON.parse(provider.limits) as Record<string, Record<string, number>>
            for (const [pt, fields] of Object.entries(parsed)) {
              nextLimits[pt] = { ...fields }
            }
            nextLimitsExpanded = Object.keys(nextLimits).length > 0
          } catch {
            // ignore
          }
        }

        setForm({
          name: provider.name,
          provider_key: provider.provider_key,
          supported_types: provider.supported_types,
          enabled: provider.enabled,
          payment_mode: isValidPaymentMode(provider.provider_key, provider.payment_mode || '')
            ? provider.payment_mode || ''
            : defaultPaymentMode(provider.provider_key),
          refund_enabled: provider.refund_enabled,
          allow_user_refund: provider.allow_user_refund,
        })
        setLimits(nextLimits)
        setVisibleFields({})
        setNotifyBaseUrl(nextNotifyBase)
        setReturnBaseUrl(nextReturnBase)
        setLimitsExpanded(nextLimitsExpanded)
        applyDefaults(provider.provider_key, nextConfig)
      },
      [applyDefaults],
    )

    useImperativeHandle(ref, () => ({ reset, loadProvider }), [loadProvider, reset])

    useEffect(() => {
      if (!show) return
      if (editing) {
        loadProvider(editing)
      }
    }, [editing, loadProvider, show])

    const isTypeSelected = (type: string) => form.supported_types.includes(type)

    const toggleType = (type: string) => {
      setForm((current) => ({
        ...current,
        supported_types: current.supported_types.includes(type)
          ? current.supported_types.filter((typeVal) => typeVal !== type)
          : [...current.supported_types, type],
      }))
    }

    const onKeyChange = (key: string) => {
      setForm((current) => ({
        ...current,
        provider_key: key,
        supported_types: [...(PROVIDER_SUPPORTED_TYPES[key] || [])],
        payment_mode: defaultPaymentMode(key),
      }))
      clearConfig()
      applyDefaults(key, {})
    }

    const getLimitVal = (paymentType: string, field: string): string => {
      const val = limits[paymentType]?.[field]
      return val && val > 0 ? String(val) : ''
    }

    const hasAnyLimit = (paymentType: string): boolean => {
      const l = limits[paymentType]
      if (!l) return false
      return (l.singleMin > 0) || (l.singleMax > 0) || (l.dailyLimit > 0)
    }

    const limitPlaceholder = (paymentType: string): string =>
      hasAnyLimit(paymentType)
        ? t('admin.settings.payment.limitsNoLimit')
        : t('admin.settings.payment.limitsUseGlobal')

    const setLimitVal = (paymentType: string, field: string, val: string) => {
      setLimits((current) => {
        const next = { ...current }
        if (!next[paymentType]) next[paymentType] = {}
        const num = Number(val)
        if (val === '' || Number.isNaN(num)) {
          const typeLimits = { ...next[paymentType] }
          delete typeLimits[field]
          if (Object.keys(typeLimits).length === 0) {
            delete next[paymentType]
          } else {
            next[paymentType] = typeLimits
          }
          return next
        }
        if (num <= 0) return current
        next[paymentType] = { ...next[paymentType], [field]: num }
        return next
      })
    }

    const serializeLimits = (): string => {
      const result: Record<string, Record<string, number>> = {}
      for (const [pt, fields] of Object.entries(limits)) {
        const clean: Record<string, number> = {}
        for (const [k, v] of Object.entries(fields)) {
          if (v > 0) clean[k] = v
        }
        if (Object.keys(clean).length > 0) result[pt] = clean
      }
      return Object.keys(result).length > 0 ? JSON.stringify(result) : ''
    }

    const emitValidationError = (msg: string) => {
      appStore.showError(msg)
    }

    const handleSave = (event: FormEvent) => {
      event.preventDefault()

      if (!form.name.trim()) {
        emitValidationError(t('admin.settings.payment.validationNameRequired'))
        return
      }

      for (const f of PROVIDER_CONFIG_FIELDS[form.provider_key] || []) {
        if (f.optional) continue
        if (editing && f.sensitive) continue
        const val = (config[f.key] || '').trim()
        if (!val) {
          const label = f.label || t(`admin.settings.payment.field_${f.key}`)
          emitValidationError(t('admin.settings.payment.validationFieldRequired', { field: label }))
          return
        }
      }

      const clearableConfigKeys = new Set(
        (PROVIDER_CONFIG_FIELDS[form.provider_key] || [])
          .filter((field) => field.clearable)
          .map((field) => field.key),
      )
      const filteredConfig: Record<string, string> = {}
      for (const [k, v] of Object.entries(config)) {
        if (!v || !v.trim()) {
          if (clearableConfigKeys.has(k)) filteredConfig[k] = ''
          continue
        }
        filteredConfig[k] = v
      }

      const paths = PROVIDER_CALLBACK_PATHS[form.provider_key]
      let finalNotifyBase = notifyBaseUrl
      let finalReturnBase = returnBaseUrl
      if (paths) {
        finalNotifyBase = notifyBaseUrl.trim() || defaultBaseUrl
        finalReturnBase = returnBaseUrl.trim() || defaultBaseUrl
        setNotifyBaseUrl(finalNotifyBase)
        setReturnBaseUrl(finalReturnBase)
        if (paths.notifyUrl) filteredConfig.notifyUrl = finalNotifyBase + paths.notifyUrl
        if (paths.returnUrl) filteredConfig.returnUrl = finalReturnBase + paths.returnUrl
      }

      onSave({
        provider_key: form.provider_key,
        name: form.name,
        supported_types: form.supported_types,
        enabled: form.enabled,
        payment_mode: supportsPaymentMode ? form.payment_mode : '',
        refund_enabled: form.refund_enabled,
        allow_user_refund: form.refund_enabled ? form.allow_user_refund : false,
        config: filteredConfig,
        limits: serializeLimits(),
      })
    }

    const keyOptions = (editing ? allKeyOptions : enabledKeyOptions) as SelectOption[]

    return (
      <BaseDialog
        show={show}
        title={
          editing
            ? t('admin.settings.payment.editProvider')
            : t('admin.settings.payment.createProvider')
        }
        width="wide"
        onClose={onClose}
        footer={
          <div className="flex justify-end gap-3">
            <button type="button" onClick={onClose} className="btn btn-secondary">
              {t('common.cancel')}
            </button>
            <button type="submit" form="provider-form" disabled={saving} className="btn btn-primary">
              {saving ? t('common.saving') : t('common.save')}
            </button>
          </div>
        }
      >
        <form id="provider-form" onSubmit={handleSave} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="input-label">
                {t('admin.settings.payment.providerName')}
                <span className="text-red-500">*</span>
              </label>
              <input
                value={form.name}
                onChange={(e) => setForm((current) => ({ ...current, name: e.target.value }))}
                type="text"
                className="input"
                required
              />
            </div>
            <div>
              <label className="input-label">
                {t('admin.settings.payment.providerKey')}
                <span className="text-red-500">*</span>
              </label>
              <Select
                modelValue={form.provider_key}
                options={keyOptions}
                disabled={!!editing}
                onUpdateModelValue={(value) => onKeyChange(String(value ?? ''))}
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <ToggleSwitch
              label={t('common.enabled')}
              checked={form.enabled}
              onToggle={() => setForm((current) => ({ ...current, enabled: !current.enabled }))}
            />
            <ToggleSwitch
              label={t('admin.settings.payment.refundEnabled')}
              checked={form.refund_enabled}
              onToggle={() =>
                setForm((current) => ({
                  ...current,
                  refund_enabled: !current.refund_enabled,
                  allow_user_refund: !current.refund_enabled ? current.allow_user_refund : false,
                }))
              }
            />
            {form.refund_enabled ? (
              <ToggleSwitch
                label={t('admin.settings.payment.allowUserRefund')}
                checked={form.allow_user_refund}
                onToggle={() =>
                  setForm((current) => ({
                    ...current,
                    allow_user_refund: !current.allow_user_refund,
                  }))
                }
              />
            ) : null}
            {supportsPaymentMode ? (
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
                  {t('admin.settings.payment.paymentMode')}
                </span>
                <div className="flex gap-1.5">
                  {paymentModeOptions.map((mode) => (
                    <button
                      key={mode.value}
                      type="button"
                      onClick={() => setForm((current) => ({ ...current, payment_mode: mode.value }))}
                      className={[
                        'rounded-lg border px-2.5 py-1 text-xs font-medium transition-all',
                        form.payment_mode === mode.value
                          ? 'border-primary-500 bg-primary-500 text-white shadow-sm'
                          : 'border-gray-300 bg-white text-gray-600 hover:border-gray-400 hover:bg-gray-50 dark:border-dark-600 dark:bg-dark-800 dark:text-gray-300 dark:hover:border-dark-500',
                      ].join(' ')}
                    >
                      {mode.label}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
            {availableTypes.length > 1 ? (
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
                  {t('admin.settings.payment.supportedTypes')}
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {availableTypes.map((pt) => (
                    <button
                      key={pt.value}
                      type="button"
                      onClick={() => toggleType(pt.value)}
                      className={[
                        'rounded-lg border px-2.5 py-1 text-xs font-medium transition-all',
                        isTypeSelected(pt.value)
                          ? 'border-primary-500 bg-primary-500 text-white shadow-sm'
                          : 'border-gray-300 bg-white text-gray-600 hover:border-gray-400 hover:bg-gray-50 dark:border-dark-600 dark:bg-dark-800 dark:text-gray-300 dark:hover:border-dark-500',
                      ].join(' ')}
                    >
                      {pt.label}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>

          <div className="border-t border-gray-200 pt-4 dark:border-dark-700">
            <div className="mb-3 flex items-center gap-2">
              <h4 className="text-sm font-semibold text-gray-900 dark:text-white">
                {t('admin.settings.payment.providerConfig')}
              </h4>
              {paymentGuide ? (
                <HelpTooltip
                  trigger="click"
                  widthClass="w-80"
                  triggerContent={
                    <button
                      type="button"
                      className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-gray-300 text-[11px] font-semibold text-gray-400 transition-colors hover:border-primary-500 hover:text-primary-600 dark:border-dark-500 dark:text-gray-500 dark:hover:border-primary-400 dark:hover:text-primary-400"
                      aria-label={t('admin.settings.payment.paymentGuideTrigger')}
                      title={t('admin.settings.payment.paymentGuideTrigger')}
                    >
                      ?
                    </button>
                  }
                >
                  <div className="space-y-3">
                    <p className="font-medium text-white">{paymentGuide.summary}</p>
                    {paymentGuide.items.map((item) => (
                      <div
                        key={item.title}
                        className="space-y-1.5 border-t border-white/10 pt-2 first:border-t-0 first:pt-0"
                      >
                        <p className="font-medium text-white">{item.title}</p>
                        <p>
                          <span className="text-gray-300">{t('admin.settings.payment.guideOpenLabel')}</span>
                          {item.open}
                        </p>
                        <p>
                          <span className="text-gray-300">{t('admin.settings.payment.guideCallLabel')}</span>
                          {item.call}
                        </p>
                        <p>
                          <span className="text-gray-300">{t('admin.settings.payment.guideFallbackLabel')}</span>
                          {item.fallback}
                        </p>
                      </div>
                    ))}
                    {paymentGuide.note ? (
                      <p className="border-t border-white/10 pt-2 text-[11px] text-gray-300">
                        {paymentGuide.note}
                      </p>
                    ) : null}
                  </div>
                </HelpTooltip>
              ) : null}
            </div>
            {paymentGuide ? (
              <p className="mb-3 text-xs text-gray-500 dark:text-gray-400">{paymentGuide.summary}</p>
            ) : null}
            <div className="space-y-3">
              {resolvedFields.map((field) => (
                <div key={field.key}>
                  <label className="input-label">
                    {field.label}
                    {field.optional ? (
                      <span className="text-xs text-gray-400">({t('common.optional')})</span>
                    ) : (
                      <span className="text-red-500"> *</span>
                    )}
                  </label>
                  {field.sensitive &&
                  field.key.toLowerCase().includes('key') &&
                  field.key !== 'pkey' ? (
                    <textarea
                      value={config[field.key] || ''}
                      onChange={(e) =>
                        setConfig((current) => ({ ...current, [field.key]: e.target.value }))
                      }
                      rows={3}
                      className="input font-mono text-xs"
                      autoComplete="new-password"
                      data-1p-ignore
                      data-lpignore="true"
                      data-bwignore="true"
                      spellCheck={false}
                      placeholder={editing ? t('admin.accounts.leaveEmptyToKeep') : ''}
                    />
                  ) : field.sensitive ? (
                    <div className="relative">
                      <input
                        type={visibleFields[field.key] ? 'text' : 'password'}
                        value={config[field.key] || ''}
                        onChange={(e) =>
                          setConfig((current) => ({ ...current, [field.key]: e.target.value }))
                        }
                        className="input pr-10"
                        autoComplete="new-password"
                        data-1p-ignore
                        data-lpignore="true"
                        data-bwignore="true"
                        spellCheck={false}
                        placeholder={
                          editing
                            ? t('admin.accounts.leaveEmptyToKeep')
                            : field.defaultValue || ''
                        }
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setVisibleFields((current) => ({
                            ...current,
                            [field.key]: !current[field.key],
                          }))
                        }
                        className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                      >
                        {visibleFields[field.key] ? (
                          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth="2"
                              d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L3 3m6.878 6.878L21 21"
                            />
                          </svg>
                        ) : (
                          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth="2"
                              d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                            />
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth="2"
                              d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                            />
                          </svg>
                        )}
                      </button>
                    </div>
                  ) : field.options?.length ? (
                    <Select
                      modelValue={config[field.key] ?? ''}
                      options={field.options}
                      searchable={field.options.length > 5}
                      onUpdateModelValue={(value) =>
                        setConfig((current) => ({
                          ...current,
                          [field.key]: String(value ?? ''),
                        }))
                      }
                    />
                  ) : (
                    <input
                      type="text"
                      value={config[field.key] || ''}
                      onChange={(e) =>
                        setConfig((current) => ({ ...current, [field.key]: e.target.value }))
                      }
                      className="input"
                      placeholder={field.defaultValue || ''}
                    />
                  )}
                  {field.hintKey ? (
                    <p className="mt-1 text-xs leading-relaxed text-gray-500 dark:text-gray-400">
                      {t(field.hintKey)}
                    </p>
                  ) : null}
                </div>
              ))}
            </div>

            {callbackPaths ? (
              <div className="mt-4 space-y-3">
                {callbackPaths.notifyUrl ? (
                  <div>
                    <label className="input-label">
                      {t('admin.settings.payment.field_notifyUrl')} <span className="text-red-500">*</span>
                    </label>
                    <div className="flex">
                      <input
                        value={notifyBaseUrl}
                        onChange={(e) => setNotifyBaseUrl(e.target.value)}
                        type="text"
                        className="input min-w-0 flex-1 !rounded-r-none !border-r-0"
                        placeholder={defaultBaseUrl}
                      />
                      <span className="inline-flex items-center whitespace-nowrap rounded-r-lg border border-gray-300 bg-gray-50 px-3 text-xs text-gray-500 dark:border-dark-600 dark:bg-dark-700 dark:text-gray-400">
                        {callbackPaths.notifyUrl}
                      </span>
                    </div>
                  </div>
                ) : null}
                {callbackPaths.returnUrl ? (
                  <div>
                    <label className="input-label">
                      {t('admin.settings.payment.field_returnUrl')} <span className="text-red-500">*</span>
                    </label>
                    <div className="flex">
                      <input
                        value={returnBaseUrl}
                        onChange={(e) => setReturnBaseUrl(e.target.value)}
                        type="text"
                        className="input min-w-0 flex-1 !rounded-r-none !border-r-0"
                        placeholder={defaultBaseUrl}
                      />
                      <span className="inline-flex items-center whitespace-nowrap rounded-r-lg border border-gray-300 bg-gray-50 px-3 text-xs text-gray-500 dark:border-dark-600 dark:bg-dark-700 dark:text-gray-400">
                        {callbackPaths.returnUrl}
                      </span>
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}

            {providerWebhookUrl ? (
              <div className="mt-3 rounded-lg border border-blue-200 bg-blue-50 p-3 dark:border-blue-800/50 dark:bg-blue-900/20">
                <p className="text-xs text-blue-700 dark:text-blue-300">{t(providerWebhookHint)}</p>
                <code className="mt-1 block break-all rounded bg-blue-100 px-2 py-1 text-xs text-blue-800 dark:bg-blue-900/40 dark:text-blue-200">
                  {providerWebhookUrl}
                </code>
                {form.provider_key === 'stripe' ? (
                  <p className="mt-2 text-xs leading-relaxed text-blue-700 dark:text-blue-300">
                    {t('admin.settings.payment.stripeWebhookApiVersionHint', {
                      version: STRIPE_SDK_API_VERSION,
                    })}
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>

          {limitableTypes.length ? (
            <div className="border-t border-gray-200 pt-4 dark:border-dark-700">
              <button
                type="button"
                onClick={() => setLimitsExpanded((current) => !current)}
                className="flex w-full items-center justify-between"
              >
                <h4 className="text-sm font-semibold text-gray-900 dark:text-white">
                  {t('admin.settings.payment.limitsTitle')}
                </h4>
                <svg
                  className={[
                    'h-4 w-4 text-gray-400 transition-transform',
                    limitsExpanded ? 'rotate-180' : '',
                  ].join(' ')}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {limitsExpanded ? (
                <div className="mt-3 space-y-3">
                  {limitableTypes.map((lt) => (
                    <div
                      key={lt.value}
                      className="rounded-lg border border-gray-100 p-3 dark:border-dark-700"
                    >
                      <p className="mb-2 text-xs font-medium text-gray-700 dark:text-gray-300">
                        {lt.label}
                      </p>
                      <div className="grid grid-cols-3 gap-3">
                        <div>
                          <label className="text-xs text-gray-500 dark:text-gray-400">
                            {t('admin.settings.payment.limitSingleMin')}
                          </label>
                          <input
                            type="number"
                            value={getLimitVal(lt.value, 'singleMin')}
                            onChange={(e) => setLimitVal(lt.value, 'singleMin', e.target.value)}
                            className="input mt-0.5"
                            min={1}
                            step="0.01"
                            placeholder={limitPlaceholder(lt.value)}
                          />
                        </div>
                        <div>
                          <label className="text-xs text-gray-500 dark:text-gray-400">
                            {t('admin.settings.payment.limitSingleMax')}
                          </label>
                          <input
                            type="number"
                            value={getLimitVal(lt.value, 'singleMax')}
                            onChange={(e) => setLimitVal(lt.value, 'singleMax', e.target.value)}
                            className="input mt-0.5"
                            min={1}
                            step="0.01"
                            placeholder={limitPlaceholder(lt.value)}
                          />
                        </div>
                        <div>
                          <label className="text-xs text-gray-500 dark:text-gray-400">
                            {t('admin.settings.payment.limitDaily')}
                          </label>
                          <input
                            type="number"
                            value={getLimitVal(lt.value, 'dailyLimit')}
                            onChange={(e) => setLimitVal(lt.value, 'dailyLimit', e.target.value)}
                            className="input mt-0.5"
                            min={1}
                            step="0.01"
                            placeholder={limitPlaceholder(lt.value)}
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                  <p className="text-xs text-gray-400 dark:text-gray-500">
                    {t('admin.settings.payment.limitsHint')}
                  </p>
                </div>
              ) : null}
            </div>
          ) : null}
        </form>
      </BaseDialog>
    )
  },
)

export default PaymentProviderDialog
