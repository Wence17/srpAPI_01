'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useI18n } from '@/lib/i18n'
import { useApp } from '@/context/AppContext'
import { extractApiErrorMessage } from '@/lib/apiError'
import {
  adminSettingsAPI,
  type EmailTemplateEventOption,
  type EmailTemplateOption,
} from '@/lib/adminSettings'

const fallbackPlaceholders = [
  '{{site_name}}',
  '{{recipient_name}}',
  '{{recipient_email}}',
  '{{verification_code}}',
  '{{expires_in_minutes}}',
  '{{reset_url}}',
  '{{subscription_group}}',
  '{{subscription_days}}',
  '{{expiry_time}}',
  '{{days_remaining}}',
  '{{current_balance}}',
  '{{threshold}}',
  '{{recharge_url}}',
  '{{recharge_amount}}',
  '{{order_id}}',
  '{{unsubscribe_url}}',
  '{{account_id}}',
  '{{account_name}}',
  '{{platform}}',
  '{{quota_dimension}}',
  '{{quota_used}}',
  '{{quota_limit}}',
  '{{quota_remaining}}',
  '{{quota_threshold}}',
  '{{triggered_at}}',
  '{{group_name}}',
  '{{moderation_category}}',
  '{{moderation_score}}',
  '{{violation_count}}',
  '{{ban_threshold}}',
  '{{rule_name}}',
  '{{severity}}',
  '{{alert_status}}',
  '{{metric_type}}',
  '{{operator}}',
  '{{metric_value}}',
  '{{threshold_value}}',
  '{{alert_description}}',
  '{{report_name}}',
  '{{report_type}}',
  '{{report_start_time}}',
  '{{report_end_time}}',
  '{{report_html}}',
]

interface EventDisplayMeta {
  label: string
  timing: string
  categoryLabel: string
}

const eventDisplayMeta: Record<string, EventDisplayMeta> = {
  'auth.verify_code': {
    label: '邮箱验证码',
    timing: '注册、绑定邮箱、OAuth 补全邮箱或 TOTP 邮箱校验时发送。',
    categoryLabel: '认证安全',
  },
  'auth.password_reset': {
    label: '密码重置',
    timing: '用户请求密码重置链接时发送。',
    categoryLabel: '认证安全',
  },
  'notification_email.verify_code': {
    label: '通知邮箱验证码',
    timing: '用户添加并验证额外通知邮箱时发送。',
    categoryLabel: '认证安全',
  },
  'subscription.purchase_success': {
    label: '订阅开通成功',
    timing: '订阅订单完成支付并成功开通或续期后发送。',
    categoryLabel: '订阅',
  },
  'subscription.expiry_reminder': {
    label: '订阅到期提醒',
    timing:
      '后台任务在订阅仍有效且距离到期剩余 7 天、3 天、1 天时各发送一次，可通过邮件设置中的开关关闭。',
    categoryLabel: '订阅',
  },
  'balance.low': {
    label: '余额不足提醒',
    timing: '用户余额低于全局或个人配置的提醒阈值时发送。',
    categoryLabel: '计费',
  },
  'balance.recharge_success': {
    label: '余额充值成功',
    timing: '余额充值订单支付完成并入账后发送。',
    categoryLabel: '计费',
  },
  'account.quota_alert': {
    label: '账号限额告警',
    timing: '上游账号的用量达到配置的额度告警阈值时发送给管理员通知邮箱。',
    categoryLabel: '管理告警',
  },
  'content_moderation.violation_notice': {
    label: '内容审计违规提醒',
    timing: '用户请求命中内容审计或风控规则、但尚未被禁用时发送。',
    categoryLabel: '风控',
  },
  'content_moderation.account_disabled': {
    label: '内容审计禁用账号',
    timing: '内容审计违规次数达到封禁阈值并自动禁用用户账号时发送。',
    categoryLabel: '风控',
  },
  'ops.alert': {
    label: '运维告警',
    timing: '运维监控规则触发告警并满足邮件通知配置时发送给运维收件人。',
    categoryLabel: '运维',
  },
  'ops.scheduled_report': {
    label: '运维定时报表',
    timing: '运维日报、周报、错误摘要或账号健康报表到达配置的发送时间时发送。',
    categoryLabel: '运维',
  },
}

const eventDisplayMetaEn: Record<string, EventDisplayMeta> = {
  'auth.verify_code': {
    label: 'Email Verification Code',
    timing:
      'Sent for registration, email binding, OAuth pending email completion, or TOTP email verification.',
    categoryLabel: 'Auth',
  },
  'auth.password_reset': {
    label: 'Password Reset',
    timing: 'Sent when a user requests a password reset link.',
    categoryLabel: 'Auth',
  },
  'notification_email.verify_code': {
    label: 'Notification Email Verification',
    timing: 'Sent when a user adds and verifies an extra notification email address.',
    categoryLabel: 'Auth',
  },
  'subscription.purchase_success': {
    label: 'Subscription Activated',
    timing:
      'Sent after a subscription order is paid and the subscription is activated or extended.',
    categoryLabel: 'Subscription',
  },
  'subscription.expiry_reminder': {
    label: 'Subscription Expiry Reminder',
    timing:
      'Sent by the background job when an active subscription has 7, 3, or 1 day remaining. It can be disabled in Email settings.',
    categoryLabel: 'Subscription',
  },
  'balance.low': {
    label: 'Low Balance Alert',
    timing: "Sent when a user's balance drops below the global or personal reminder threshold.",
    categoryLabel: 'Billing',
  },
  'balance.recharge_success': {
    label: 'Balance Recharge Success',
    timing: 'Sent after a balance recharge order is paid and credited.',
    categoryLabel: 'Billing',
  },
  'account.quota_alert': {
    label: 'Account Quota Alert',
    timing:
      'Sent to admin notification emails when an upstream account reaches the configured quota alert threshold.',
    categoryLabel: 'Admin',
  },
  'content_moderation.violation_notice': {
    label: 'Risk Control Violation Notice',
    timing:
      'Sent when a user request triggers content moderation or risk-control rules but the account is not disabled yet.',
    categoryLabel: 'Risk Control',
  },
  'content_moderation.account_disabled': {
    label: 'Risk Control Account Disabled',
    timing:
      'Sent when content moderation reaches the ban threshold and automatically disables the user account.',
    categoryLabel: 'Risk Control',
  },
  'ops.alert': {
    label: 'Ops Alert',
    timing:
      'Sent to ops recipients when an ops monitoring rule fires and email notification settings allow it.',
    categoryLabel: 'Ops',
  },
  'ops.scheduled_report': {
    label: 'Ops Scheduled Report',
    timing:
      'Sent when a configured daily, weekly, error digest, or account health report reaches its scheduled send time.',
    categoryLabel: 'Ops',
  },
}

function normalizeEventOption(option: EmailTemplateEventOption): EmailTemplateOption {
  if (typeof option === 'string') {
    return { value: option }
  }
  return option
}

export default function EmailTemplateEditor() {
  const { t, locale } = useI18n()
  const appStore = useApp()

  const [loadingList, setLoadingList] = useState(true)
  const [loadingTemplate, setLoadingTemplate] = useState(false)
  const [saving, setSaving] = useState(false)
  const [previewing, setPreviewing] = useState(false)
  const [restoring, setRestoring] = useState(false)
  const [eventOptions, setEventOptions] = useState<EmailTemplateOption[]>([])
  const [localeOptions, setLocaleOptions] = useState<string[]>([])
  const [selectedEvent, setSelectedEvent] = useState('')
  const [selectedLocale, setSelectedLocale] = useState('')
  const [subject, setSubject] = useState('')
  const [html, setHtml] = useState('')
  const [isCustomTemplate, setIsCustomTemplate] = useState(false)
  const [placeholders, setPlaceholders] = useState<string[]>([])
  const [previewSubject, setPreviewSubject] = useState('')
  const [previewHtml, setPreviewHtml] = useState('')

  const localText = useCallback(
    (zh: string, en: string) => (locale.toLowerCase().startsWith('zh') ? zh : en),
    [locale],
  )

  const formatCategory = useCallback(
    (category: string): string => {
      const normalized = category.trim().toLowerCase()
      if (!normalized) return localText('通知', 'Notification')
      const labels: Record<string, { zh: string; en: string }> = {
        auth: { zh: '认证安全', en: 'Auth' },
        subscription: { zh: '订阅', en: 'Subscription' },
        billing: { zh: '计费', en: 'Billing' },
        admin: { zh: '管理告警', en: 'Admin' },
        risk_control: { zh: '风控', en: 'Risk Control' },
        ops: { zh: '运维', en: 'Ops' },
      }
      const item = labels[normalized]
      return item ? localText(item.zh, item.en) : category
    },
    [localText],
  )

  const eventMetaFor = useCallback(
    (option?: EmailTemplateOption | null) => {
      if (!option) return null
      const displayMeta = (
        locale.toLowerCase().startsWith('zh') ? eventDisplayMeta : eventDisplayMetaEn
      )[option.value]
      const label = displayMeta?.label || option.label || option.value
      const timing = displayMeta?.timing || option.description || ''
      const categoryLabel =
        displayMeta?.categoryLabel || formatCategory(option.category || '')
      return {
        label,
        timing,
        categoryLabel,
        optional: option.optional === true,
      }
    },
    [formatCategory, locale],
  )

  const formatEventOptionLabel = useCallback(
    (option: EmailTemplateOption): string => {
      const meta = eventMetaFor(option)
      if (!meta) return option.label || option.value
      return meta.label
    },
    [eventMetaFor],
  )

  const selectedEventOption = useMemo(
    () => eventOptions.find((option) => option.value === selectedEvent) || null,
    [eventOptions, selectedEvent],
  )

  const selectedEventMeta = useMemo(
    () => eventMetaFor(selectedEventOption),
    [eventMetaFor, selectedEventOption],
  )

  const selectedEventDescription = selectedEventOption?.description || ''

  const formatPlaceholder = (placeholder: string): string => {
    const trimmed = placeholder.trim()
    if (!trimmed) return ''
    if (trimmed.startsWith('{{') && trimmed.endsWith('}}')) return trimmed
    return `{{${trimmed}}}`
  }

  const placeholderList = useMemo(() => {
    const combined = [...placeholders, ...fallbackPlaceholders]
    return Array.from(
      new Set(
        combined.map((item) => formatPlaceholder(item)).filter((item) => item.length > 0),
      ),
    )
  }, [placeholders])

  const canSave =
    Boolean(selectedEvent && selectedLocale) &&
    subject.trim().length > 0 &&
    html.trim().length > 0

  const canPreview =
    Boolean(selectedEvent && selectedLocale) && html.trim().length > 0

  const formatLocale = (localeValue: string): string => {
    const lower = localeValue.toLowerCase()
    if (lower === 'zh' || lower.startsWith('zh-')) {
      return t('admin.settings.emailTemplates.localeZh')
    }
    if (lower === 'en' || lower.startsWith('en-')) {
      return t('admin.settings.emailTemplates.localeEn')
    }
    return localeValue
  }

  const selectInitialLocale = (locales: string[]): string => {
    const currentLocale = locale.toLowerCase()
    const exactMatch = locales.find(
      (availableLocale) => availableLocale.toLowerCase() === currentLocale,
    )
    if (exactMatch) return exactMatch

    const currentLanguage = currentLocale.split('-')[0]
    const languageMatch = locales.find(
      (availableLocale) => availableLocale.toLowerCase().split('-')[0] === currentLanguage,
    )
    if (languageMatch) return languageMatch

    return locales[0] || ''
  }

  const applyTemplate = (template: {
    subject: string
    html: string
    is_custom?: boolean
    placeholders?: string[]
  }) => {
    setSubject(template.subject)
    setHtml(template.html)
    setIsCustomTemplate(template.is_custom === true)
    setPlaceholders(template.placeholders || [])
  }

  const refreshPreview = useCallback(async () => {
    if (!canPreview) {
      setPreviewSubject('')
      setPreviewHtml('')
      return
    }
    setPreviewing(true)
    try {
      const preview = await adminSettingsAPI.previewEmailTemplate({
        event: selectedEvent,
        locale: selectedLocale,
        subject,
        html,
      })
      setPreviewSubject(preview.subject)
      setPreviewHtml(preview.html)
    } catch (err: unknown) {
      appStore.showError(extractApiErrorMessage(err, t('common.error')))
    } finally {
      setPreviewing(false)
    }
  }, [appStore, canPreview, html, selectedEvent, selectedLocale, subject, t])

  const loadTemplate = useCallback(async () => {
    if (!selectedEvent || !selectedLocale) return
    setLoadingTemplate(true)
    try {
      const template = await adminSettingsAPI.getEmailTemplate(selectedEvent, selectedLocale)
      applyTemplate(template)
      await refreshPreview()
    } catch (err: unknown) {
      appStore.showError(extractApiErrorMessage(err, t('common.error')))
    } finally {
      setLoadingTemplate(false)
    }
  }, [appStore, refreshPreview, selectedEvent, selectedLocale, t])

  const loadTemplateList = useCallback(async () => {
    setLoadingList(true)
    try {
      const response = await adminSettingsAPI.getEmailTemplates()
      setEventOptions(response.events.map(normalizeEventOption))
      setLocaleOptions(response.locales)
      setPlaceholders(response.placeholders || [])
      const initialEvent = response.events.map(normalizeEventOption)[0]?.value || ''
      const initialLocale = selectInitialLocale(response.locales)
      setSelectedEvent(initialEvent)
      setSelectedLocale(initialLocale)
    } catch (err: unknown) {
      appStore.showError(extractApiErrorMessage(err, t('common.error')))
    } finally {
      setLoadingList(false)
    }
  }, [appStore, locale, t])

  useEffect(() => {
    void loadTemplateList()
  }, [loadTemplateList])

  useEffect(() => {
    if (!selectedEvent || !selectedLocale) return
    void loadTemplate()
  }, [loadTemplate, selectedEvent, selectedLocale])

  const saveTemplate = async () => {
    if (!canSave) {
      appStore.showError(t('admin.settings.emailTemplates.validationRequired'))
      return
    }
    setSaving(true)
    try {
      const template = await adminSettingsAPI.updateEmailTemplate(selectedEvent, selectedLocale, {
        subject,
        html,
      })
      applyTemplate(template)
      await refreshPreview()
      appStore.showSuccess(t('admin.settings.emailTemplates.saveSuccess'))
    } catch (err: unknown) {
      appStore.showError(extractApiErrorMessage(err, t('common.error')))
    } finally {
      setSaving(false)
    }
  }

  const restoreOfficial = async () => {
    if (!selectedEvent || !selectedLocale) return
    if (!window.confirm(t('admin.settings.emailTemplates.restoreConfirm'))) return

    setRestoring(true)
    try {
      const template = await adminSettingsAPI.restoreOfficialEmailTemplate(
        selectedEvent,
        selectedLocale,
      )
      applyTemplate(template)
      await refreshPreview()
      appStore.showSuccess(t('admin.settings.emailTemplates.restoreSuccess'))
    } catch (err: unknown) {
      appStore.showError(extractApiErrorMessage(err, t('common.error')))
    } finally {
      setRestoring(false)
    }
  }

  const copyPlaceholder = async (placeholder: string) => {
    try {
      await navigator.clipboard.writeText(placeholder)
      appStore.showSuccess(t('admin.settings.emailTemplates.placeholderCopied'))
    } catch {
      appStore.showError(t('common.error'))
    }
  }

  return (
    <div className="card">
      <div className="flex flex-col gap-3 border-b border-gray-100 px-6 py-4 dark:border-dark-700 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            {t('admin.settings.emailTemplates.title')}
          </h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {t('admin.settings.emailTemplates.description')}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            disabled={loadingTemplate || previewing || !canPreview}
            onClick={() => void refreshPreview()}
          >
            {previewing
              ? t('admin.settings.emailTemplates.previewing')
              : t('admin.settings.emailTemplates.preview')}
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            disabled={loadingTemplate || restoring || !selectedEvent || !selectedLocale}
            onClick={() => void restoreOfficial()}
          >
            {restoring
              ? t('admin.settings.emailTemplates.restoring')
              : t('admin.settings.emailTemplates.restoreOfficial')}
          </button>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={loadingTemplate || saving || !canSave}
            onClick={() => void saveTemplate()}
          >
            {saving
              ? t('admin.settings.emailTemplates.saving')
              : t('admin.settings.emailTemplates.save')}
          </button>
        </div>
      </div>

      <div className="space-y-6 p-6">
        {loadingList ? (
          <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
            <span className="h-4 w-4 animate-spin rounded-full border-b-2 border-primary-600" />
            {t('common.loading')}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <label className="input-label" htmlFor="email-template-event">
                  {t('admin.settings.emailTemplates.event')}
                </label>
                <select
                  id="email-template-event"
                  value={selectedEvent}
                  onChange={(e) => setSelectedEvent(e.target.value)}
                  className="input"
                  disabled={loadingTemplate || eventOptions.length === 0}
                >
                  {eventOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {formatEventOptionLabel(option)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="input-label" htmlFor="email-template-locale">
                  {t('admin.settings.emailTemplates.locale')}
                </label>
                <select
                  id="email-template-locale"
                  value={selectedLocale}
                  onChange={(e) => setSelectedLocale(e.target.value)}
                  className="input"
                  disabled={loadingTemplate || localeOptions.length === 0}
                >
                  {localeOptions.map((localeOption) => (
                    <option key={localeOption} value={localeOption}>
                      {formatLocale(localeOption)}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {selectedEventMeta ? (
              <div className="rounded-lg border border-primary-100 bg-primary-50/70 p-4 dark:border-primary-900/50 dark:bg-primary-950/20">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="text-sm font-semibold text-gray-900 dark:text-white">
                    {selectedEventMeta.label}
                  </div>
                  <span className="rounded-full bg-white px-2.5 py-1 text-xs font-medium text-gray-600 shadow-sm ring-1 ring-gray-200 dark:bg-dark-800 dark:text-gray-300 dark:ring-dark-600">
                    {selectedEventMeta.categoryLabel}
                  </span>
                  <span
                    className={[
                      'rounded-full px-2.5 py-1 text-xs font-medium',
                      selectedEventMeta.optional
                        ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300'
                        : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300',
                    ].join(' ')}
                  >
                    {selectedEventMeta.optional
                      ? localText('可退订通知', 'Optional')
                      : localText('事务邮件', 'Transactional')}
                  </span>
                </div>
                <p className="mt-2 text-sm leading-6 text-gray-600 dark:text-gray-300">
                  {selectedEventMeta.timing}
                </p>
                {selectedEventDescription ? (
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    {selectedEventDescription}
                  </p>
                ) : null}
              </div>
            ) : null}

            {!eventOptions.length || !localeOptions.length ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-700 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-300">
                {t('admin.settings.emailTemplates.empty')}
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
                <div className="space-y-4">
                  <div>
                    <label className="input-label" htmlFor="email-template-subject">
                      {t('admin.settings.emailTemplates.subject')}
                    </label>
                    <input
                      id="email-template-subject"
                      value={subject}
                      onChange={(e) => setSubject(e.target.value)}
                      type="text"
                      className="input"
                      disabled={loadingTemplate}
                      placeholder={t('admin.settings.emailTemplates.subjectPlaceholder')}
                    />
                  </div>

                  <div>
                    <label className="input-label" htmlFor="email-template-html">
                      {t('admin.settings.emailTemplates.html')}
                    </label>
                    <textarea
                      id="email-template-html"
                      value={html}
                      onChange={(e) => setHtml(e.target.value)}
                      rows={18}
                      className="input min-h-[28rem] resize-y font-mono text-sm leading-6"
                      disabled={loadingTemplate}
                      placeholder={t('admin.settings.emailTemplates.htmlPlaceholder')}
                    />
                  </div>

                  <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-dark-700 dark:bg-dark-800/60">
                    <div className="text-sm font-medium text-gray-900 dark:text-white">
                      {t('admin.settings.emailTemplates.placeholders')}
                    </div>
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                      {t('admin.settings.emailTemplates.placeholdersHelp')}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {placeholderList.map((placeholder) => (
                        <button
                          key={placeholder}
                          type="button"
                          className="rounded-full border border-gray-200 bg-white px-3 py-1 font-mono text-xs text-gray-700 transition-colors hover:border-primary-300 hover:text-primary-600 dark:border-dark-600 dark:bg-dark-700 dark:text-gray-200 dark:hover:border-primary-500 dark:hover:text-primary-300"
                          onClick={() => void copyPlaceholder(placeholder)}
                        >
                          {placeholder}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="rounded-lg border border-gray-200 bg-white dark:border-dark-700 dark:bg-dark-800">
                    <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3 dark:border-dark-700">
                      <div>
                        <div className="text-sm font-medium text-gray-900 dark:text-white">
                          {t('admin.settings.emailTemplates.livePreview')}
                        </div>
                        <div className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                          {previewSubject || t('admin.settings.emailTemplates.noPreview')}
                        </div>
                      </div>
                      {isCustomTemplate ? (
                        <span className="rounded-full bg-primary-50 px-2.5 py-1 text-xs font-medium text-primary-700 dark:bg-primary-900/30 dark:text-primary-300">
                          {t('admin.settings.emailTemplates.customized')}
                        </span>
                      ) : null}
                    </div>
                    <div className="bg-gray-100 p-3 dark:bg-dark-900">
                      <iframe
                        className="h-[36rem] w-full rounded-md border border-gray-200 bg-white dark:border-dark-700"
                        sandbox=""
                        srcDoc={previewHtml}
                        title={t('admin.settings.emailTemplates.livePreview')}
                      />
                    </div>
                  </div>

                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {t('admin.settings.emailTemplates.previewSecurityHint')}
                  </p>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
