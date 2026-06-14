'use client'

import { useEffect, useMemo, useState, type FormEvent, type KeyboardEvent } from 'react'
import { useI18n } from '@/lib/i18n'
import { useApp } from '@/context/AppContext'
import { adminAccountsAPI } from '@/lib/adminAccounts'
import { extractApiErrorMessage } from '@/lib/apiError'
import {
  buildModelMappingObject as buildModelMappingPayload,
  getPresetMappingsByPlatform,
} from '@/lib/useModelWhitelist'
import {
  OPENAI_WS_MODE_CTX_POOL,
  OPENAI_WS_MODE_OFF,
  OPENAI_WS_MODE_PASSTHROUGH,
  isOpenAIWSModeEnabled,
  resolveOpenAIWSModeConcurrencyHintKey,
  type OpenAIWSMode,
} from '@/lib/openaiWsMode'
import BaseDialog from '@/components/common/BaseDialog'
import ConfirmDialog from '@/components/common/ConfirmDialog'
import Select from '@/components/common/Select'
import ProxySelector from '@/components/common/ProxySelector'
import GroupSelector from '@/components/common/GroupSelector'
import ModelWhitelistSelector from '@/components/account/ModelWhitelistSelector'
import Icon from '@/components/icons/Icon'
import type { AdminGroup } from '@/lib/adminGroups'
import type { AccountPlatform, AccountType, OpenAICompactMode, Proxy } from '@/lib/types'

interface ModelMapping {
  from: string
  to: string
}

export interface BulkEditTarget {
  mode: 'selected' | 'filtered'
  filters?: Record<string, unknown>
  previewCount?: number
  selectedPlatforms?: AccountPlatform[]
  selectedTypes?: AccountType[]
}

interface BulkEditAccountModalProps {
  show: boolean
  accountIds: number[]
  selectedPlatforms: AccountPlatform[]
  selectedTypes: AccountType[]
  target?: BulkEditTarget
  proxies: Proxy[]
  groups: AdminGroup[]
  onClose: () => void
  onUpdated: () => void
}

const commonErrorCodes = [
  { value: 401, label: 'Unauthorized' },
  { value: 403, label: 'Forbidden' },
  { value: 429, label: 'Rate Limit' },
  { value: 500, label: 'Server Error' },
  { value: 502, label: 'Bad Gateway' },
  { value: 503, label: 'Unavailable' },
  { value: 529, label: 'Overloaded' },
]

const toggleTrackClass =
  'relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2'
const toggleThumbClass =
  'pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out'

function disabledSectionClass(disabled: boolean) {
  return disabled ? 'pointer-events-none opacity-50' : undefined
}

export default function BulkEditAccountModal({
  show,
  accountIds,
  selectedPlatforms,
  selectedTypes,
  target,
  proxies,
  groups,
  onClose,
  onUpdated,
}: BulkEditAccountModalProps) {
  const { t } = useI18n()
  const appStore = useApp()

  const targetMode = target?.mode ?? 'selected'
  const targetPreviewCount = target?.previewCount ?? accountIds.length
  const targetSelectedPlatforms = target?.selectedPlatforms ?? selectedPlatforms
  const targetSelectedTypes = target?.selectedTypes ?? selectedTypes

  const isMixedPlatform = targetSelectedPlatforms.length > 1

  const allOpenAIPassthroughCapable = useMemo(
    () =>
      targetSelectedPlatforms.length === 1 &&
      targetSelectedPlatforms[0] === 'openai' &&
      targetSelectedTypes.length > 0 &&
      targetSelectedTypes.every((accountType) => accountType === 'oauth' || accountType === 'apikey'),
    [targetSelectedPlatforms, targetSelectedTypes],
  )

  const allOpenAIOAuth = useMemo(
    () =>
      targetSelectedPlatforms.length === 1 &&
      targetSelectedPlatforms[0] === 'openai' &&
      targetSelectedTypes.length > 0 &&
      targetSelectedTypes.every((accountType) => accountType === 'oauth'),
    [targetSelectedPlatforms, targetSelectedTypes],
  )

  const allOpenAIAPIKey = useMemo(
    () =>
      targetSelectedPlatforms.length === 1 &&
      targetSelectedPlatforms[0] === 'openai' &&
      targetSelectedTypes.length > 0 &&
      targetSelectedTypes.every((accountType) => accountType === 'apikey'),
    [targetSelectedPlatforms, targetSelectedTypes],
  )

  const allAnthropicOAuthOrSetupToken = useMemo(
    () =>
      targetSelectedPlatforms.length === 1 &&
      targetSelectedPlatforms[0] === 'anthropic' &&
      targetSelectedTypes.every((accountType) => accountType === 'oauth' || accountType === 'setup-token'),
    [targetSelectedPlatforms, targetSelectedTypes],
  )

  const filteredPresets = useMemo(() => {
    if (targetSelectedPlatforms.length === 0) return []

    const dedupedPresets = new Map<string, ReturnType<typeof getPresetMappingsByPlatform>[number]>()
    for (const platform of targetSelectedPlatforms) {
      for (const preset of getPresetMappingsByPlatform(platform)) {
        const key = `${preset.from}=>${preset.to}`
        if (!dedupedPresets.has(key)) {
          dedupedPresets.set(key, preset)
        }
      }
    }

    return Array.from(dedupedPresets.values())
  }, [targetSelectedPlatforms])

  const [enableBaseUrl, setEnableBaseUrl] = useState(false)
  const [enableModelRestriction, setEnableModelRestriction] = useState(false)
  const [enableCustomErrorCodes, setEnableCustomErrorCodes] = useState(false)
  const [enableInterceptWarmup, setEnableInterceptWarmup] = useState(false)
  const [enableProxy, setEnableProxy] = useState(false)
  const [enableConcurrency, setEnableConcurrency] = useState(false)
  const [enableLoadFactor, setEnableLoadFactor] = useState(false)
  const [enablePriority, setEnablePriority] = useState(false)
  const [enableRateMultiplier, setEnableRateMultiplier] = useState(false)
  const [enableStatus, setEnableStatus] = useState(false)
  const [enableGroups, setEnableGroups] = useState(false)
  const [enableOpenAIPassthrough, setEnableOpenAIPassthrough] = useState(false)
  const [enableOpenAIWSMode, setEnableOpenAIWSMode] = useState(false)
  const [enableOpenAIAPIKeyWSMode, setEnableOpenAIAPIKeyWSMode] = useState(false)
  const [enableCodexCLIOnly, setEnableCodexCLIOnly] = useState(false)
  const [enableCodexCLIOnlyAllowClaudeCode, setEnableCodexCLIOnlyAllowClaudeCode] = useState(false)
  const [enableOpenAICompactMode, setEnableOpenAICompactMode] = useState(false)
  const [enableOpenAICompactModelMapping, setEnableOpenAICompactModelMapping] = useState(false)
  const [enableRpmLimit, setEnableRpmLimit] = useState(false)

  const [submitting, setSubmitting] = useState(false)
  const [showMixedChannelWarning, setShowMixedChannelWarning] = useState(false)
  const [mixedChannelWarningMessage, setMixedChannelWarningMessage] = useState('')
  const [pendingUpdatesForConfirm, setPendingUpdatesForConfirm] = useState<Record<string, unknown> | null>(
    null,
  )
  const [mixedChannelConfirmed, setMixedChannelConfirmed] = useState(false)

  const [baseUrl, setBaseUrl] = useState('')
  const [modelRestrictionMode, setModelRestrictionMode] = useState<'whitelist' | 'mapping'>('whitelist')
  const [allowedModels, setAllowedModels] = useState<string[]>([])
  const [modelMappings, setModelMappings] = useState<ModelMapping[]>([])
  const [selectedErrorCodes, setSelectedErrorCodes] = useState<number[]>([])
  const [customErrorCodeInput, setCustomErrorCodeInput] = useState<number | null>(null)
  const [interceptWarmupRequests, setInterceptWarmupRequests] = useState(false)
  const [proxyId, setProxyId] = useState<number | null>(null)
  const [concurrency, setConcurrency] = useState(1)
  const [loadFactor, setLoadFactor] = useState<number | null>(null)
  const [priority, setPriority] = useState(1)
  const [rateMultiplier, setRateMultiplier] = useState(1)
  const [status, setStatus] = useState<'active' | 'inactive'>('active')
  const [groupIds, setGroupIds] = useState<number[]>([])
  const [openaiPassthroughEnabled, setOpenaiPassthroughEnabled] = useState(false)
  const [openaiOAuthResponsesWebSocketV2Mode, setOpenaiOAuthResponsesWebSocketV2Mode] =
    useState<OpenAIWSMode>(OPENAI_WS_MODE_OFF)
  const [openaiAPIKeyResponsesWebSocketV2Mode, setOpenaiAPIKeyResponsesWebSocketV2Mode] =
    useState<OpenAIWSMode>(OPENAI_WS_MODE_OFF)
  const [codexCLIOnlyEnabled, setCodexCLIOnlyEnabled] = useState(false)
  const [codexCLIOnlyAllowClaudeCodeEnabled, setCodexCLIOnlyAllowClaudeCodeEnabled] = useState(false)
  const [openAICompactMode, setOpenAICompactMode] = useState<OpenAICompactMode>('auto')
  const [openAICompactModelMappings, setOpenAICompactModelMappings] = useState<ModelMapping[]>([])
  const [rpmLimitEnabled, setRpmLimitEnabled] = useState(false)
  const [bulkBaseRpm, setBulkBaseRpm] = useState<number | null>(null)
  const [bulkRpmStrategy, setBulkRpmStrategy] = useState<'tiered' | 'sticky_exempt'>('tiered')
  const [bulkRpmStickyBuffer, setBulkRpmStickyBuffer] = useState<number | null>(null)
  const [userMsgQueueMode, setUserMsgQueueMode] = useState<string | null>(null)

  const umqModeOptions = useMemo(
    () => [
      { value: '', label: t('admin.accounts.quotaControl.rpmLimit.umqModeOff') },
      { value: 'throttle', label: t('admin.accounts.quotaControl.rpmLimit.umqModeThrottle') },
      { value: 'serialize', label: t('admin.accounts.quotaControl.rpmLimit.umqModeSerialize') },
    ],
    [t],
  )

  const statusOptions = useMemo(
    () => [
      { value: 'active', label: t('common.active') },
      { value: 'inactive', label: t('common.inactive') },
    ],
    [t],
  )

  const isOpenAIModelRestrictionDisabled =
    allOpenAIPassthroughCapable && enableOpenAIPassthrough && openaiPassthroughEnabled

  const openAIWSModeOptions = useMemo(
    () => [
      { value: OPENAI_WS_MODE_OFF, label: t('admin.accounts.openai.wsModeOff') },
      { value: OPENAI_WS_MODE_CTX_POOL, label: t('admin.accounts.openai.wsModeCtxPool') },
      { value: OPENAI_WS_MODE_PASSTHROUGH, label: t('admin.accounts.openai.wsModePassthrough') },
    ],
    [t],
  )

  const openAICompactModeOptions = useMemo(
    () => [
      { value: 'auto', label: t('admin.accounts.openai.compactModeAuto') },
      { value: 'force_on', label: t('admin.accounts.openai.compactModeForceOn') },
      { value: 'force_off', label: t('admin.accounts.openai.compactModeForceOff') },
    ],
    [t],
  )

  const openAIWSModeConcurrencyHintKey = resolveOpenAIWSModeConcurrencyHintKey(
    openaiOAuthResponsesWebSocketV2Mode,
  )
  const openAIAPIKeyWSModeConcurrencyHintKey = resolveOpenAIWSModeConcurrencyHintKey(
    openaiAPIKeyResponsesWebSocketV2Mode,
  )

  const sortedSelectedErrorCodes = useMemo(
    () => [...selectedErrorCodes].sort((a, b) => a - b),
    [selectedErrorCodes],
  )

  const addModelMapping = () => {
    setModelMappings((prev) => [...prev, { from: '', to: '' }])
  }

  const removeModelMapping = (index: number) => {
    setModelMappings((prev) => prev.filter((_, i) => i !== index))
  }

  const addOpenAICompactModelMapping = () => {
    setOpenAICompactModelMappings((prev) => [...prev, { from: '', to: '' }])
  }

  const removeOpenAICompactModelMapping = (index: number) => {
    setOpenAICompactModelMappings((prev) => prev.filter((_, i) => i !== index))
  }

  const addPresetMapping = (from: string, to: string) => {
    const exists = modelMappings.some((mapping) => mapping.from === from)
    if (exists) {
      appStore.showInfo(t('admin.accounts.mappingExists', { model: from }))
      return
    }
    setModelMappings((prev) => [...prev, { from, to }])
  }

  const toggleErrorCode = (code: number) => {
    const index = selectedErrorCodes.indexOf(code)
    if (index === -1) {
      if (code === 429) {
        if (!confirm(t('admin.accounts.customErrorCodes429Warning'))) {
          return
        }
      } else if (code === 529) {
        if (!confirm(t('admin.accounts.customErrorCodes529Warning'))) {
          return
        }
      }
      setSelectedErrorCodes((prev) => [...prev, code])
    } else {
      setSelectedErrorCodes((prev) => prev.filter((_, i) => i !== index))
    }
  }

  const addCustomErrorCode = () => {
    const code = customErrorCodeInput
    if (code === null || code < 100 || code > 599) {
      appStore.showError(t('admin.accounts.invalidErrorCode'))
      return
    }
    if (selectedErrorCodes.includes(code)) {
      appStore.showInfo(t('admin.accounts.errorCodeExists'))
      return
    }
    if (code === 429) {
      if (!confirm(t('admin.accounts.customErrorCodes429Warning'))) {
        return
      }
    } else if (code === 529) {
      if (!confirm(t('admin.accounts.customErrorCodes529Warning'))) {
        return
      }
    }
    setSelectedErrorCodes((prev) => [...prev, code])
    setCustomErrorCodeInput(null)
  }

  const removeErrorCode = (code: number) => {
    setSelectedErrorCodes((prev) => prev.filter((item) => item !== code))
  }

  const buildModelMappingObject = (): Record<string, string> | null => {
    return buildModelMappingPayload(modelRestrictionMode, allowedModels, modelMappings)
  }

  const buildOpenAICompactModelMapping = (): Record<string, string> | null => {
    return buildModelMappingPayload('mapping', [], openAICompactModelMappings)
  }

  const buildUpdatePayload = (): Record<string, unknown> | null => {
    const updates: Record<string, unknown> = {}
    const credentials: Record<string, unknown> = {}
    let credentialsChanged = false
    const ensureExtra = (): Record<string, unknown> => {
      if (!updates.extra) {
        updates.extra = {}
      }
      return updates.extra as Record<string, unknown>
    }

    if (enableProxy) {
      updates.proxy_id = proxyId === null ? 0 : proxyId
    }

    if (enableConcurrency) {
      updates.concurrency = concurrency
    }

    if (enableLoadFactor) {
      const lf = loadFactor
      updates.load_factor = lf != null && !Number.isNaN(lf) && lf > 0 ? lf : 0
    }

    if (enablePriority) {
      updates.priority = priority
    }

    if (enableRateMultiplier) {
      updates.rate_multiplier = rateMultiplier
    }

    if (enableStatus) {
      updates.status = status
    }

    if (enableGroups) {
      updates.group_ids = groupIds
    }

    if (enableBaseUrl) {
      const baseUrlValue = baseUrl.trim()
      if (baseUrlValue) {
        credentials.base_url = baseUrlValue
        credentialsChanged = true
      }
    }

    if (enableOpenAIPassthrough) {
      const extra = ensureExtra()
      extra.openai_passthrough = openaiPassthroughEnabled
      if (!openaiPassthroughEnabled) {
        extra.openai_oauth_passthrough = false
      }
    }

    if (enableModelRestriction && !isOpenAIModelRestrictionDisabled) {
      if (modelRestrictionMode === 'whitelist') {
        const mapping: Record<string, string> = {}
        for (const model of allowedModels) {
          mapping[model] = model
        }
        credentials.model_mapping = mapping
        credentialsChanged = true
      } else {
        const modelMapping = buildModelMappingObject()
        credentials.model_mapping = modelMapping ?? {}
        credentialsChanged = true
      }
    }

    if (enableCustomErrorCodes) {
      credentials.custom_error_codes_enabled = true
      credentials.custom_error_codes = [...selectedErrorCodes]
      credentialsChanged = true
    }

    if (enableInterceptWarmup) {
      credentials.intercept_warmup_requests = interceptWarmupRequests
      credentialsChanged = true
    }

    if (enableOpenAIWSMode) {
      const extra = ensureExtra()
      extra.openai_oauth_responses_websockets_v2_mode = openaiOAuthResponsesWebSocketV2Mode
      extra.openai_oauth_responses_websockets_v2_enabled = isOpenAIWSModeEnabled(
        openaiOAuthResponsesWebSocketV2Mode,
      )
    }

    if (enableOpenAIAPIKeyWSMode) {
      const extra = ensureExtra()
      extra.openai_apikey_responses_websockets_v2_mode = openaiAPIKeyResponsesWebSocketV2Mode
      extra.openai_apikey_responses_websockets_v2_enabled = isOpenAIWSModeEnabled(
        openaiAPIKeyResponsesWebSocketV2Mode,
      )
    }

    if (enableCodexCLIOnly) {
      const extra = ensureExtra()
      extra.codex_cli_only = codexCLIOnlyEnabled
    }

    if (enableCodexCLIOnlyAllowClaudeCode) {
      const extra = ensureExtra()
      extra.codex_cli_only_allowed_clients = codexCLIOnlyAllowClaudeCodeEnabled ? ['claude_code'] : []
    }

    if (enableOpenAICompactMode) {
      const extra = ensureExtra()
      extra.openai_compact_mode = openAICompactMode
    }

    if (enableOpenAICompactModelMapping) {
      credentials.compact_model_mapping = buildOpenAICompactModelMapping() ?? {}
      credentialsChanged = true
    }

    if (enableRpmLimit) {
      const extra = ensureExtra()
      if (rpmLimitEnabled && bulkBaseRpm != null && bulkBaseRpm > 0) {
        extra.base_rpm = bulkBaseRpm
        extra.rpm_strategy = bulkRpmStrategy
        if (bulkRpmStickyBuffer != null && bulkRpmStickyBuffer > 0) {
          extra.rpm_sticky_buffer = bulkRpmStickyBuffer
        }
      } else {
        extra.base_rpm = 0
        extra.rpm_strategy = ''
        extra.rpm_sticky_buffer = 0
      }
      updates.extra = extra
    }

    if (userMsgQueueMode !== null) {
      const umqExtra = ensureExtra()
      umqExtra.user_msg_queue_mode = userMsgQueueMode
      umqExtra.user_msg_queue_enabled = false
    }

    if (credentialsChanged) {
      updates.credentials = credentials
    }

    return Object.keys(updates).length > 0 ? updates : null
  }

  const canPreCheck = () =>
    enableGroups &&
    groupIds.length > 0 &&
    targetSelectedPlatforms.length === 1 &&
    (targetSelectedPlatforms[0] === 'antigravity' || targetSelectedPlatforms[0] === 'anthropic')

  const handleClose = () => {
    setShowMixedChannelWarning(false)
    setMixedChannelWarningMessage('')
    setPendingUpdatesForConfirm(null)
    setMixedChannelConfirmed(false)
    onClose()
  }

  const preCheckMixedChannelRisk = async (built: Record<string, unknown>): Promise<boolean> => {
    if (!canPreCheck()) return true
    if (mixedChannelConfirmed) return true

    try {
      const result = await adminAccountsAPI.checkMixedChannelRisk({
        platform: targetSelectedPlatforms[0],
        group_ids: groupIds,
      })
      if (!result.has_risk) return true

      setPendingUpdatesForConfirm(built)
      setMixedChannelWarningMessage(result.message || t('admin.accounts.bulkEdit.failed'))
      setShowMixedChannelWarning(true)
      return false
    } catch (error: unknown) {
      appStore.showError(extractApiErrorMessage(error, t('admin.accounts.bulkEdit.failed')))
      return false
    }
  }

  const submitBulkUpdate = async (baseUpdates: Record<string, unknown>) => {
    const updates = mixedChannelConfirmed
      ? { ...baseUpdates, confirm_mixed_channel_risk: true }
      : baseUpdates

    setSubmitting(true)

    try {
      const res =
        targetMode === 'filtered' && target?.filters
          ? await adminAccountsAPI.bulkUpdate({
              filters: target.filters,
              ...updates,
            })
          : await adminAccountsAPI.bulkUpdate(accountIds, updates)
      const success = res.success || 0
      const failed = res.failed || 0

      if (success > 0 && failed === 0) {
        appStore.showSuccess(t('admin.accounts.bulkEdit.success', { count: success }))
      } else if (success > 0) {
        appStore.showError(t('admin.accounts.bulkEdit.partialSuccess', { success, failed }))
      } else {
        appStore.showError(t('admin.accounts.bulkEdit.failed'))
      }

      if (success > 0) {
        setPendingUpdatesForConfirm(null)
        onUpdated()
        handleClose()
      }
    } catch (error: unknown) {
      const err = error as { status?: number; error?: string; message?: string }
      if (err.status === 409 && err.error === 'mixed_channel_warning') {
        setPendingUpdatesForConfirm(baseUpdates)
        setMixedChannelWarningMessage(err.message || '')
        setShowMixedChannelWarning(true)
      } else {
        appStore.showError(extractApiErrorMessage(error, t('admin.accounts.bulkEdit.failed')))
        console.error('Error bulk updating accounts:', error)
      }
    } finally {
      setSubmitting(false)
    }
  }

  const handleSubmit = async () => {
    if (targetMode === 'selected' && accountIds.length === 0) {
      appStore.showError(t('admin.accounts.bulkEdit.noSelection'))
      return
    }

    const hasAnyFieldEnabled =
      enableBaseUrl ||
      enableOpenAIPassthrough ||
      enableModelRestriction ||
      enableCustomErrorCodes ||
      enableInterceptWarmup ||
      enableProxy ||
      enableConcurrency ||
      enableLoadFactor ||
      enablePriority ||
      enableRateMultiplier ||
      enableStatus ||
      enableGroups ||
      enableOpenAIWSMode ||
      enableOpenAIAPIKeyWSMode ||
      enableCodexCLIOnly ||
      enableCodexCLIOnlyAllowClaudeCode ||
      enableOpenAICompactMode ||
      enableOpenAICompactModelMapping ||
      enableRpmLimit ||
      userMsgQueueMode !== null

    if (!hasAnyFieldEnabled) {
      appStore.showError(t('admin.accounts.bulkEdit.noFieldsSelected'))
      return
    }

    const built = buildUpdatePayload()
    if (!built) {
      appStore.showError(t('admin.accounts.bulkEdit.noFieldsSelected'))
      return
    }

    const canContinue = await preCheckMixedChannelRisk(built)
    if (!canContinue) return

    await submitBulkUpdate(built)
  }

  const handleFormSubmit = (event: FormEvent) => {
    event.preventDefault()
    void handleSubmit()
  }

  const handleMixedChannelConfirm = async () => {
    setShowMixedChannelWarning(false)
    setMixedChannelConfirmed(true)
    if (pendingUpdatesForConfirm) {
      await submitBulkUpdate(pendingUpdatesForConfirm)
    }
  }

  const handleMixedChannelCancel = () => {
    setShowMixedChannelWarning(false)
    setPendingUpdatesForConfirm(null)
  }

  useEffect(() => {
    if (!show) {
      setEnableBaseUrl(false)
      setEnableModelRestriction(false)
      setEnableCustomErrorCodes(false)
      setEnableInterceptWarmup(false)
      setEnableProxy(false)
      setEnableConcurrency(false)
      setEnableLoadFactor(false)
      setEnablePriority(false)
      setEnableRateMultiplier(false)
      setEnableStatus(false)
      setEnableGroups(false)
      setEnableOpenAIPassthrough(false)
      setEnableOpenAIWSMode(false)
      setEnableOpenAIAPIKeyWSMode(false)
      setEnableCodexCLIOnly(false)
      setEnableCodexCLIOnlyAllowClaudeCode(false)
      setEnableOpenAICompactMode(false)
      setEnableOpenAICompactModelMapping(false)
      setEnableRpmLimit(false)

      setBaseUrl('')
      setOpenaiPassthroughEnabled(false)
      setModelRestrictionMode('whitelist')
      setAllowedModels([])
      setModelMappings([])
      setSelectedErrorCodes([])
      setCustomErrorCodeInput(null)
      setInterceptWarmupRequests(false)
      setProxyId(null)
      setConcurrency(1)
      setLoadFactor(null)
      setPriority(1)
      setRateMultiplier(1)
      setStatus('active')
      setGroupIds([])
      setOpenaiOAuthResponsesWebSocketV2Mode(OPENAI_WS_MODE_OFF)
      setOpenaiAPIKeyResponsesWebSocketV2Mode(OPENAI_WS_MODE_OFF)
      setCodexCLIOnlyEnabled(false)
      setCodexCLIOnlyAllowClaudeCodeEnabled(false)
      setOpenAICompactMode('auto')
      setOpenAICompactModelMappings([])
      setRpmLimitEnabled(false)
      setBulkBaseRpm(null)
      setBulkRpmStrategy('tiered')
      setBulkRpmStickyBuffer(null)
      setUserMsgQueueMode(null)

      setShowMixedChannelWarning(false)
      setMixedChannelWarningMessage('')
      setPendingUpdatesForConfirm(null)
      setMixedChannelConfirmed(false)
    }
  }, [show])

  const updateModelMappingField = (index: number, field: keyof ModelMapping, value: string) => {
    setModelMappings((prev) =>
      prev.map((mapping, i) => (i === index ? { ...mapping, [field]: value } : mapping)),
    )
  }

  const updateOpenAICompactModelMappingField = (index: number, field: keyof ModelMapping, value: string) => {
    setOpenAICompactModelMappings((prev) =>
      prev.map((mapping, i) => (i === index ? { ...mapping, [field]: value } : mapping)),
    )
  }

  const handleCustomErrorCodeKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      addCustomErrorCode()
    }
  }

  return (
    <>
      <BaseDialog
        show={show}
        title={t('admin.accounts.bulkEdit.title')}
        width="wide"
        onClose={handleClose}
        footer={
          <div className="flex justify-end gap-3">
            <button type="button" className="btn btn-secondary" onClick={handleClose}>
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              form="bulk-edit-account-form"
              disabled={submitting}
              className="btn btn-primary"
            >
              {submitting && (
                <svg className="-ml-1 mr-2 h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
              )}
              {submitting ? t('admin.accounts.bulkEdit.updating') : t('admin.accounts.bulkEdit.submit')}
            </button>
          </div>
        }
      >
        <form id="bulk-edit-account-form" className="space-y-5" onSubmit={handleFormSubmit}>
          <div className="rounded-lg bg-blue-50 p-4 dark:bg-blue-900/20">
            <p className="text-sm text-blue-700 dark:text-blue-400">
              <svg className="mr-1.5 inline h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              {t('admin.accounts.bulkEdit.selectionInfo', {
                count: targetMode === 'filtered' ? targetPreviewCount : accountIds.length,
              })}
            </p>
          </div>

          {isMixedPlatform && (
            <div className="rounded-lg bg-amber-50 p-4 dark:bg-amber-900/20">
              <p className="text-sm text-amber-700 dark:text-amber-400">
                <svg className="mr-1.5 inline h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                  />
                </svg>
                {t('admin.accounts.bulkEdit.mixedPlatformWarning', {
                  platforms: targetSelectedPlatforms.join(', '),
                })}
              </p>
            </div>
          )}

          {allOpenAIPassthroughCapable && (
            <div className="border-t border-gray-200 pt-4 dark:border-dark-600">
              <div className="mb-3 flex items-center justify-between">
                <div className="flex-1 pr-4">
                  <label
                    id="bulk-edit-openai-passthrough-label"
                    className="input-label mb-0"
                    htmlFor="bulk-edit-openai-passthrough-enabled"
                  >
                    {t('admin.accounts.openai.oauthPassthrough')}
                  </label>
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    {t('admin.accounts.openai.oauthPassthroughDesc')}
                  </p>
                </div>
                <input
                  id="bulk-edit-openai-passthrough-enabled"
                  type="checkbox"
                  checked={enableOpenAIPassthrough}
                  onChange={(e) => setEnableOpenAIPassthrough(e.target.checked)}
                  aria-controls="bulk-edit-openai-passthrough-body"
                  className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                />
              </div>
              <div
                id="bulk-edit-openai-passthrough-body"
                className={disabledSectionClass(!enableOpenAIPassthrough)}
                role="group"
                aria-labelledby="bulk-edit-openai-passthrough-label"
              >
                <button
                  id="bulk-edit-openai-passthrough-toggle"
                  type="button"
                  className={`${toggleTrackClass} ${openaiPassthroughEnabled ? 'bg-primary-600' : 'bg-gray-200 dark:bg-dark-600'}`}
                  onClick={() => setOpenaiPassthroughEnabled((prev) => !prev)}
                >
                  <span
                    className={`${toggleThumbClass} ${openaiPassthroughEnabled ? 'translate-x-5' : 'translate-x-0'}`}
                  />
                </button>
              </div>
            </div>
          )}

          <div className="border-t border-gray-200 pt-4 dark:border-dark-600">
            <div className="mb-3 flex items-center justify-between">
              <label id="bulk-edit-base-url-label" className="input-label mb-0" htmlFor="bulk-edit-base-url-enabled">
                {t('admin.accounts.baseUrl')}
              </label>
              <input
                id="bulk-edit-base-url-enabled"
                type="checkbox"
                checked={enableBaseUrl}
                onChange={(e) => setEnableBaseUrl(e.target.checked)}
                aria-controls="bulk-edit-base-url"
                className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
              />
            </div>
            <input
              id="bulk-edit-base-url"
              type="text"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              disabled={!enableBaseUrl}
              className={`input ${!enableBaseUrl ? 'cursor-not-allowed opacity-50' : ''}`}
              placeholder={t('admin.accounts.bulkEdit.baseUrlPlaceholder')}
              aria-labelledby="bulk-edit-base-url-label"
            />
            <p className="input-hint">{t('admin.accounts.bulkEdit.baseUrlNotice')}</p>
          </div>

          <div className="border-t border-gray-200 pt-4 dark:border-dark-600">
            <div className="mb-3 flex items-center justify-between">
              <label
                id="bulk-edit-model-restriction-label"
                className="input-label mb-0"
                htmlFor="bulk-edit-model-restriction-enabled"
              >
                {t('admin.accounts.modelRestriction')}
              </label>
              <input
                id="bulk-edit-model-restriction-enabled"
                type="checkbox"
                checked={enableModelRestriction}
                onChange={(e) => setEnableModelRestriction(e.target.checked)}
                aria-controls="bulk-edit-model-restriction-body"
                className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
              />
            </div>

            <div
              id="bulk-edit-model-restriction-body"
              className={disabledSectionClass(!enableModelRestriction)}
              role="group"
              aria-labelledby="bulk-edit-model-restriction-label"
            >
              {isOpenAIModelRestrictionDisabled ? (
                <div className="rounded-lg bg-amber-50 p-3 dark:bg-amber-900/20">
                  <p className="text-xs text-amber-700 dark:text-amber-400">
                    {t('admin.accounts.openai.modelRestrictionDisabledByPassthrough')}
                  </p>
                </div>
              ) : (
                <>
                  <div className="mb-4 flex gap-2">
                    <button
                      type="button"
                      className={`flex-1 rounded-lg px-4 py-2 text-sm font-medium transition-all ${
                        modelRestrictionMode === 'whitelist'
                          ? 'bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-dark-600 dark:text-gray-400 dark:hover:bg-dark-500'
                      }`}
                      onClick={() => setModelRestrictionMode('whitelist')}
                    >
                      <svg className="mr-1.5 inline h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth="2"
                          d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                        />
                      </svg>
                      {t('admin.accounts.modelWhitelist')}
                    </button>
                    <button
                      type="button"
                      className={`flex-1 rounded-lg px-4 py-2 text-sm font-medium transition-all ${
                        modelRestrictionMode === 'mapping'
                          ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-dark-600 dark:text-gray-400 dark:hover:bg-dark-500'
                      }`}
                      onClick={() => setModelRestrictionMode('mapping')}
                    >
                      <svg className="mr-1.5 inline h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth="2"
                          d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"
                        />
                      </svg>
                      {t('admin.accounts.modelMapping')}
                    </button>
                  </div>

                  {modelRestrictionMode === 'whitelist' ? (
                    <div>
                      <div className="mb-3 rounded-lg bg-blue-50 p-3 dark:bg-blue-900/20">
                        <p className="text-xs text-blue-700 dark:text-blue-400">
                          <svg className="mr-1 inline h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth="2"
                              d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                            />
                          </svg>
                          {t('admin.accounts.selectAllowedModels')}
                        </p>
                      </div>

                      <ModelWhitelistSelector
                        value={allowedModels}
                        onChange={setAllowedModels}
                        platforms={targetSelectedPlatforms}
                      />

                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {t('admin.accounts.selectedModels', { count: allowedModels.length })}
                        {allowedModels.length === 0 && t('admin.accounts.supportsAllModels')}
                      </p>
                    </div>
                  ) : (
                    <div>
                      <div className="mb-3 rounded-lg bg-purple-50 p-3 dark:bg-purple-900/20">
                        <p className="text-xs text-purple-700 dark:text-purple-400">
                          <svg className="mr-1 inline h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth="2"
                              d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                            />
                          </svg>
                          {t('admin.accounts.mapRequestModels')}
                        </p>
                      </div>

                      {modelMappings.length > 0 && (
                        <div className="mb-3 space-y-2">
                          {modelMappings.map((mapping, index) => (
                            <div key={index} className="flex items-center gap-2">
                              <input
                                type="text"
                                value={mapping.from}
                                onChange={(e) => updateModelMappingField(index, 'from', e.target.value)}
                                className="input flex-1"
                                placeholder={t('admin.accounts.requestModel')}
                              />
                              <svg
                                className="h-4 w-4 flex-shrink-0 text-gray-400"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth="2"
                                  d="M14 5l7 7m0 0l-7 7m7-7H3"
                                />
                              </svg>
                              <input
                                type="text"
                                value={mapping.to}
                                onChange={(e) => updateModelMappingField(index, 'to', e.target.value)}
                                className="input flex-1"
                                placeholder={t('admin.accounts.actualModel')}
                              />
                              <button
                                type="button"
                                className="rounded-lg p-2 text-red-500 transition-colors hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20"
                                onClick={() => removeModelMapping(index)}
                              >
                                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth="2"
                                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                                  />
                                </svg>
                              </button>
                            </div>
                          ))}
                        </div>
                      )}

                      <button
                        type="button"
                        className="mb-3 w-full rounded-lg border-2 border-dashed border-gray-300 px-4 py-2 text-gray-600 transition-colors hover:border-gray-400 hover:text-gray-700 dark:border-dark-500 dark:text-gray-400 dark:hover:border-dark-400 dark:hover:text-gray-300"
                        onClick={addModelMapping}
                      >
                        <svg className="mr-1 inline h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                        </svg>
                        {t('admin.accounts.addMapping')}
                      </button>

                      <div className="flex flex-wrap gap-2">
                        {filteredPresets.map((preset) => (
                          <button
                            key={preset.label}
                            type="button"
                            className={`rounded-lg px-3 py-1 text-xs transition-colors ${preset.color}`}
                            onClick={() => addPresetMapping(preset.from, preset.to)}
                          >
                            + {preset.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          <div className="border-t border-gray-200 pt-4 dark:border-dark-600">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <label
                  id="bulk-edit-custom-error-codes-label"
                  className="input-label mb-0"
                  htmlFor="bulk-edit-custom-error-codes-enabled"
                >
                  {t('admin.accounts.customErrorCodes')}
                </label>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  {t('admin.accounts.customErrorCodesHint')}
                </p>
              </div>
              <input
                id="bulk-edit-custom-error-codes-enabled"
                type="checkbox"
                checked={enableCustomErrorCodes}
                onChange={(e) => setEnableCustomErrorCodes(e.target.checked)}
                aria-controls="bulk-edit-custom-error-codes-body"
                className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
              />
            </div>

            {enableCustomErrorCodes && (
              <div id="bulk-edit-custom-error-codes-body" className="space-y-3">
                <div className="rounded-lg bg-amber-50 p-3 dark:bg-amber-900/20">
                  <p className="text-xs text-amber-700 dark:text-amber-400">
                    <Icon name="exclamationTriangle" size="sm" className="mr-1 inline" strokeWidth={2} />
                    {t('admin.accounts.customErrorCodesWarning')}
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  {commonErrorCodes.map((code) => (
                    <button
                      key={code.value}
                      type="button"
                      className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                        selectedErrorCodes.includes(code.value)
                          ? 'bg-red-100 text-red-700 ring-1 ring-red-500 dark:bg-red-900/30 dark:text-red-400'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-dark-600 dark:text-gray-400 dark:hover:bg-dark-500'
                      }`}
                      onClick={() => toggleErrorCode(code.value)}
                    >
                      {code.value} {code.label}
                    </button>
                  ))}
                </div>

                <div className="flex items-center gap-2">
                  <input
                    id="bulk-edit-custom-error-code-input"
                    type="number"
                    min={100}
                    max={599}
                    value={customErrorCodeInput ?? ''}
                    onChange={(e) =>
                      setCustomErrorCodeInput(e.target.value === '' ? null : Number(e.target.value))
                    }
                    className="input flex-1"
                    placeholder={t('admin.accounts.enterErrorCode')}
                    aria-labelledby="bulk-edit-custom-error-codes-label"
                    onKeyDown={handleCustomErrorCodeKeyDown}
                  />
                  <button type="button" className="btn btn-secondary px-3" onClick={addCustomErrorCode}>
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                    </svg>
                  </button>
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {sortedSelectedErrorCodes.map((code) => (
                    <span
                      key={code}
                      className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-0.5 text-sm font-medium text-red-700 dark:bg-red-900/30 dark:text-red-400"
                    >
                      {code}
                      <button
                        type="button"
                        className="hover:text-red-900 dark:hover:text-red-300"
                        onClick={() => removeErrorCode(code)}
                      >
                        <Icon name="x" size="xs" className="h-3.5 w-3.5" strokeWidth={2} />
                      </button>
                    </span>
                  ))}
                  {selectedErrorCodes.length === 0 && (
                    <span className="text-xs text-gray-400">{t('admin.accounts.noneSelectedUsesDefault')}</span>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="border-t border-gray-200 pt-4 dark:border-dark-600">
            <div className="flex items-center justify-between">
              <div className="flex-1 pr-4">
                <label
                  id="bulk-edit-intercept-warmup-label"
                  className="input-label mb-0"
                  htmlFor="bulk-edit-intercept-warmup-enabled"
                >
                  {t('admin.accounts.interceptWarmupRequests')}
                </label>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  {t('admin.accounts.interceptWarmupRequestsDesc')}
                </p>
              </div>
              <input
                id="bulk-edit-intercept-warmup-enabled"
                type="checkbox"
                checked={enableInterceptWarmup}
                onChange={(e) => setEnableInterceptWarmup(e.target.checked)}
                aria-controls="bulk-edit-intercept-warmup-body"
                className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
              />
            </div>
            {enableInterceptWarmup && (
              <div id="bulk-edit-intercept-warmup-body" className="mt-3">
                <button
                  type="button"
                  className={`${toggleTrackClass} ${interceptWarmupRequests ? 'bg-primary-600' : 'bg-gray-200 dark:bg-dark-600'}`}
                  onClick={() => setInterceptWarmupRequests((prev) => !prev)}
                >
                  <span
                    className={`${toggleThumbClass} ${interceptWarmupRequests ? 'translate-x-5' : 'translate-x-0'}`}
                  />
                </button>
              </div>
            )}
          </div>

          <div className="border-t border-gray-200 pt-4 dark:border-dark-600">
            <div className="mb-3 flex items-center justify-between">
              <label id="bulk-edit-proxy-label" className="input-label mb-0" htmlFor="bulk-edit-proxy-enabled">
                {t('admin.accounts.proxy')}
              </label>
              <input
                id="bulk-edit-proxy-enabled"
                type="checkbox"
                checked={enableProxy}
                onChange={(e) => setEnableProxy(e.target.checked)}
                aria-controls="bulk-edit-proxy-body"
                className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
              />
            </div>
            <div id="bulk-edit-proxy-body" className={disabledSectionClass(!enableProxy)}>
              <ProxySelector
                modelValue={proxyId}
                proxies={proxies}
                onUpdateModelValue={setProxyId}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 border-t border-gray-200 pt-4 dark:border-dark-600 lg:grid-cols-4">
            <div>
              <div className="mb-3 flex items-center justify-between">
                <label
                  id="bulk-edit-concurrency-label"
                  className="input-label mb-0"
                  htmlFor="bulk-edit-concurrency-enabled"
                >
                  {t('admin.accounts.concurrency')}
                </label>
                <input
                  id="bulk-edit-concurrency-enabled"
                  type="checkbox"
                  checked={enableConcurrency}
                  onChange={(e) => setEnableConcurrency(e.target.checked)}
                  aria-controls="bulk-edit-concurrency"
                  className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                />
              </div>
              <input
                id="bulk-edit-concurrency"
                type="number"
                min={1}
                value={concurrency}
                onChange={(e) => setConcurrency(Math.max(1, Number(e.target.value) || 1))}
                disabled={!enableConcurrency}
                className={`input ${!enableConcurrency ? 'cursor-not-allowed opacity-50' : ''}`}
                aria-labelledby="bulk-edit-concurrency-label"
              />
            </div>
            <div>
              <div className="mb-3 flex items-center justify-between">
                <label
                  id="bulk-edit-load-factor-label"
                  className="input-label mb-0"
                  htmlFor="bulk-edit-load-factor-enabled"
                >
                  {t('admin.accounts.loadFactor')}
                </label>
                <input
                  id="bulk-edit-load-factor-enabled"
                  type="checkbox"
                  checked={enableLoadFactor}
                  onChange={(e) => setEnableLoadFactor(e.target.checked)}
                  aria-controls="bulk-edit-load-factor"
                  className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                />
              </div>
              <input
                id="bulk-edit-load-factor"
                type="number"
                min={1}
                value={loadFactor ?? ''}
                onChange={(e) => {
                  const value = e.target.value === '' ? null : Number(e.target.value)
                  setLoadFactor(value != null && value >= 1 ? value : null)
                }}
                disabled={!enableLoadFactor}
                className={`input ${!enableLoadFactor ? 'cursor-not-allowed opacity-50' : ''}`}
                aria-labelledby="bulk-edit-load-factor-label"
              />
              <p className="input-hint">{t('admin.accounts.loadFactorHint')}</p>
            </div>
            <div>
              <div className="mb-3 flex items-center justify-between">
                <label
                  id="bulk-edit-priority-label"
                  className="input-label mb-0"
                  htmlFor="bulk-edit-priority-enabled"
                >
                  {t('admin.accounts.priority')}
                </label>
                <input
                  id="bulk-edit-priority-enabled"
                  type="checkbox"
                  checked={enablePriority}
                  onChange={(e) => setEnablePriority(e.target.checked)}
                  aria-controls="bulk-edit-priority"
                  className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                />
              </div>
              <input
                id="bulk-edit-priority"
                type="number"
                min={1}
                value={priority}
                onChange={(e) => setPriority(Number(e.target.value))}
                disabled={!enablePriority}
                className={`input ${!enablePriority ? 'cursor-not-allowed opacity-50' : ''}`}
                aria-labelledby="bulk-edit-priority-label"
              />
            </div>
            <div>
              <div className="mb-3 flex items-center justify-between">
                <label
                  id="bulk-edit-rate-multiplier-label"
                  className="input-label mb-0"
                  htmlFor="bulk-edit-rate-multiplier-enabled"
                >
                  {t('admin.accounts.billingRateMultiplier')}
                </label>
                <input
                  id="bulk-edit-rate-multiplier-enabled"
                  type="checkbox"
                  checked={enableRateMultiplier}
                  onChange={(e) => setEnableRateMultiplier(e.target.checked)}
                  aria-controls="bulk-edit-rate-multiplier"
                  className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                />
              </div>
              <input
                id="bulk-edit-rate-multiplier"
                type="number"
                min={0}
                step={0.01}
                value={rateMultiplier}
                onChange={(e) => setRateMultiplier(Number(e.target.value))}
                disabled={!enableRateMultiplier}
                className={`input ${!enableRateMultiplier ? 'cursor-not-allowed opacity-50' : ''}`}
                aria-labelledby="bulk-edit-rate-multiplier-label"
              />
              <p className="input-hint">{t('admin.accounts.billingRateMultiplierHint')}</p>
            </div>
          </div>

          <div className="border-t border-gray-200 pt-4 dark:border-dark-600">
            <div className="mb-3 flex items-center justify-between">
              <label id="bulk-edit-status-label" className="input-label mb-0" htmlFor="bulk-edit-status-enabled">
                {t('common.status')}
              </label>
              <input
                id="bulk-edit-status-enabled"
                type="checkbox"
                checked={enableStatus}
                onChange={(e) => setEnableStatus(e.target.checked)}
                aria-controls="bulk-edit-status"
                className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
              />
            </div>
            <div id="bulk-edit-status" className={disabledSectionClass(!enableStatus)}>
              <Select
                modelValue={status}
                options={statusOptions}
                onUpdateModelValue={(value) => setStatus(value as 'active' | 'inactive')}
              />
            </div>
          </div>

          {allOpenAIOAuth && (
            <div className="border-t border-gray-200 pt-4 dark:border-dark-600">
              <div className="mb-3 flex items-center justify-between">
                <label
                  id="bulk-edit-openai-ws-mode-label"
                  className="input-label mb-0"
                  htmlFor="bulk-edit-openai-ws-mode-enabled"
                >
                  {t('admin.accounts.openai.wsMode')}
                </label>
                <input
                  id="bulk-edit-openai-ws-mode-enabled"
                  type="checkbox"
                  checked={enableOpenAIWSMode}
                  onChange={(e) => setEnableOpenAIWSMode(e.target.checked)}
                  aria-controls="bulk-edit-openai-ws-mode"
                  className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                />
              </div>
              <div id="bulk-edit-openai-ws-mode" className={disabledSectionClass(!enableOpenAIWSMode)}>
                <p className="mb-3 text-xs text-gray-500 dark:text-gray-400">
                  {t('admin.accounts.openai.wsModeDesc')}
                </p>
                <p className="mb-3 text-xs text-gray-500 dark:text-gray-400">
                  {t(openAIWSModeConcurrencyHintKey)}
                </p>
                <Select
                  modelValue={openaiOAuthResponsesWebSocketV2Mode}
                  options={openAIWSModeOptions}
                  onUpdateModelValue={(value) => setOpenaiOAuthResponsesWebSocketV2Mode(value as OpenAIWSMode)}
                />
              </div>
            </div>
          )}

          {allOpenAIOAuth && (
            <div className="border-t border-gray-200 pt-4 dark:border-dark-600">
              <div className="mb-3 flex items-center justify-between">
                <label
                  id="bulk-edit-openai-codex-cli-only-label"
                  className="input-label mb-0"
                  htmlFor="bulk-edit-openai-codex-cli-only-enabled"
                >
                  {t('admin.accounts.openai.codexCLIOnly')}
                </label>
                <input
                  id="bulk-edit-openai-codex-cli-only-enabled"
                  type="checkbox"
                  checked={enableCodexCLIOnly}
                  onChange={(e) => setEnableCodexCLIOnly(e.target.checked)}
                  aria-controls="bulk-edit-openai-codex-cli-only"
                  className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                />
              </div>
              <div id="bulk-edit-openai-codex-cli-only" className={disabledSectionClass(!enableCodexCLIOnly)}>
                <p className="mb-3 text-xs text-gray-500 dark:text-gray-400">
                  {t('admin.accounts.openai.codexCLIOnlyDesc')}
                </p>
                <button
                  id="bulk-edit-openai-codex-cli-only-toggle"
                  type="button"
                  className={`${toggleTrackClass} ${codexCLIOnlyEnabled ? 'bg-primary-600' : 'bg-gray-200 dark:bg-dark-600'}`}
                  onClick={() => setCodexCLIOnlyEnabled((prev) => !prev)}
                >
                  <span
                    className={`${toggleThumbClass} ${codexCLIOnlyEnabled ? 'translate-x-5' : 'translate-x-0'}`}
                  />
                </button>
              </div>
            </div>
          )}

          {allOpenAIOAuth && (
            <div className="border-t border-gray-200 pt-4 dark:border-dark-600">
              <div className="mb-3 flex items-center justify-between">
                <label
                  id="bulk-edit-openai-codex-allow-claude-code-label"
                  className="input-label mb-0"
                  htmlFor="bulk-edit-openai-codex-allow-claude-code-enabled"
                >
                  {t('admin.accounts.openai.codexCLIOnlyAllowClaudeCode')}
                </label>
                <input
                  id="bulk-edit-openai-codex-allow-claude-code-enabled"
                  type="checkbox"
                  checked={enableCodexCLIOnlyAllowClaudeCode}
                  onChange={(e) => setEnableCodexCLIOnlyAllowClaudeCode(e.target.checked)}
                  aria-controls="bulk-edit-openai-codex-allow-claude-code"
                  className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                />
              </div>
              <div
                id="bulk-edit-openai-codex-allow-claude-code"
                className={disabledSectionClass(!enableCodexCLIOnlyAllowClaudeCode)}
              >
                <p className="mb-3 text-xs text-gray-500 dark:text-gray-400">
                  {t('admin.accounts.openai.codexCLIOnlyAllowClaudeCodeDesc')}
                </p>
                <button
                  id="bulk-edit-openai-codex-allow-claude-code-toggle"
                  type="button"
                  className={`${toggleTrackClass} ${codexCLIOnlyAllowClaudeCodeEnabled ? 'bg-primary-600' : 'bg-gray-200 dark:bg-dark-600'}`}
                  onClick={() => setCodexCLIOnlyAllowClaudeCodeEnabled((prev) => !prev)}
                >
                  <span
                    className={`${toggleThumbClass} ${codexCLIOnlyAllowClaudeCodeEnabled ? 'translate-x-5' : 'translate-x-0'}`}
                  />
                </button>
              </div>
            </div>
          )}

          {allOpenAIAPIKey && (
            <div className="border-t border-gray-200 pt-4 dark:border-dark-600">
              <div className="mb-3 flex items-center justify-between">
                <label
                  id="bulk-edit-openai-apikey-ws-mode-label"
                  className="input-label mb-0"
                  htmlFor="bulk-edit-openai-apikey-ws-mode-enabled"
                >
                  {t('admin.accounts.openai.wsMode')}
                </label>
                <input
                  id="bulk-edit-openai-apikey-ws-mode-enabled"
                  type="checkbox"
                  checked={enableOpenAIAPIKeyWSMode}
                  onChange={(e) => setEnableOpenAIAPIKeyWSMode(e.target.checked)}
                  aria-controls="bulk-edit-openai-apikey-ws-mode"
                  className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                />
              </div>
              <div id="bulk-edit-openai-apikey-ws-mode" className={disabledSectionClass(!enableOpenAIAPIKeyWSMode)}>
                <p className="mb-3 text-xs text-gray-500 dark:text-gray-400">
                  {t('admin.accounts.openai.wsModeDesc')}
                </p>
                <p className="mb-3 text-xs text-gray-500 dark:text-gray-400">
                  {t(openAIAPIKeyWSModeConcurrencyHintKey)}
                </p>
                <Select
                  modelValue={openaiAPIKeyResponsesWebSocketV2Mode}
                  options={openAIWSModeOptions}
                  onUpdateModelValue={(value) =>
                    setOpenaiAPIKeyResponsesWebSocketV2Mode(value as OpenAIWSMode)
                  }
                />
              </div>
            </div>
          )}

          {allOpenAIPassthroughCapable && (
            <div className="border-t border-gray-200 pt-4 dark:border-dark-600">
              <div className="mb-3 flex items-center justify-between">
                <div className="flex-1 pr-4">
                  <label
                    id="bulk-edit-openai-compact-mode-label"
                    className="input-label mb-0"
                    htmlFor="bulk-edit-openai-compact-mode-enabled"
                  >
                    {t('admin.accounts.openai.compactMode')}
                  </label>
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    {t('admin.accounts.openai.compactModeDesc')}
                  </p>
                </div>
                <input
                  id="bulk-edit-openai-compact-mode-enabled"
                  type="checkbox"
                  checked={enableOpenAICompactMode}
                  onChange={(e) => setEnableOpenAICompactMode(e.target.checked)}
                  aria-controls="bulk-edit-openai-compact-mode"
                  className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                />
              </div>
              <div id="bulk-edit-openai-compact-mode" className={disabledSectionClass(!enableOpenAICompactMode)}>
                <Select
                  modelValue={openAICompactMode}
                  options={openAICompactModeOptions}
                  onUpdateModelValue={(value) => setOpenAICompactMode(value as OpenAICompactMode)}
                />
              </div>
            </div>
          )}

          {allOpenAIPassthroughCapable && (
            <div className="border-t border-gray-200 pt-4 dark:border-dark-600">
              <div className="mb-3 flex items-center justify-between">
                <div className="flex-1 pr-4">
                  <label
                    id="bulk-edit-openai-compact-model-mapping-label"
                    className="input-label mb-0"
                    htmlFor="bulk-edit-openai-compact-model-mapping-enabled"
                  >
                    {t('admin.accounts.openai.compactModelMapping')}
                  </label>
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    {t('admin.accounts.openai.compactModelMappingDesc')}
                  </p>
                </div>
                <input
                  id="bulk-edit-openai-compact-model-mapping-enabled"
                  type="checkbox"
                  checked={enableOpenAICompactModelMapping}
                  onChange={(e) => setEnableOpenAICompactModelMapping(e.target.checked)}
                  aria-controls="bulk-edit-openai-compact-model-mapping"
                  className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                />
              </div>
              <div
                id="bulk-edit-openai-compact-model-mapping"
                className={disabledSectionClass(!enableOpenAICompactModelMapping)}
              >
                {openAICompactModelMappings.length > 0 && (
                  <div className="mb-3 space-y-2">
                    {openAICompactModelMappings.map((mapping, index) => (
                      <div key={index} className="flex items-center gap-2">
                        <input
                          type="text"
                          value={mapping.from}
                          onChange={(e) => updateOpenAICompactModelMappingField(index, 'from', e.target.value)}
                          className="input flex-1"
                          placeholder={t('admin.accounts.fromModel')}
                          data-testid="bulk-edit-openai-compact-model-mapping-input"
                        />
                        <span className="text-gray-400">→</span>
                        <input
                          type="text"
                          value={mapping.to}
                          onChange={(e) => updateOpenAICompactModelMappingField(index, 'to', e.target.value)}
                          className="input flex-1"
                          placeholder={t('admin.accounts.toModel')}
                          data-testid="bulk-edit-openai-compact-model-mapping-input"
                        />
                        <button
                          type="button"
                          className="rounded-lg p-2 text-red-500 transition-colors hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20"
                          onClick={() => removeOpenAICompactModelMapping(index)}
                        >
                          <Icon name="trash" size="sm" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <button
                  type="button"
                  className="mb-3 w-full rounded-lg border-2 border-dashed border-gray-300 px-4 py-2 text-gray-600 transition-colors hover:border-gray-400 hover:text-gray-700 dark:border-dark-500 dark:text-gray-400 dark:hover:border-dark-400 dark:hover:text-gray-300"
                  data-testid="bulk-edit-openai-compact-model-mapping-add"
                  onClick={addOpenAICompactModelMapping}
                >
                  + {t('admin.accounts.addMapping')}
                </button>
              </div>
            </div>
          )}

          {allAnthropicOAuthOrSetupToken && (
            <div className="border-t border-gray-200 pt-4 dark:border-dark-600">
              <div className="mb-3 flex items-center justify-between">
                <label
                  id="bulk-edit-rpm-limit-label"
                  className="input-label mb-0"
                  htmlFor="bulk-edit-rpm-limit-enabled"
                >
                  {t('admin.accounts.quotaControl.rpmLimit.label')}
                </label>
                <input
                  id="bulk-edit-rpm-limit-enabled"
                  type="checkbox"
                  checked={enableRpmLimit}
                  onChange={(e) => setEnableRpmLimit(e.target.checked)}
                  aria-controls="bulk-edit-rpm-limit-body"
                  className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                />
              </div>

              <div
                id="bulk-edit-rpm-limit-body"
                className={disabledSectionClass(!enableRpmLimit)}
                role="group"
                aria-labelledby="bulk-edit-rpm-limit-label"
              >
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-sm text-gray-700 dark:text-gray-300">
                    {t('admin.accounts.quotaControl.rpmLimit.hint')}
                  </span>
                  <button
                    type="button"
                    className={`${toggleTrackClass} ${rpmLimitEnabled ? 'bg-primary-600' : 'bg-gray-200 dark:bg-dark-600'}`}
                    onClick={() => setRpmLimitEnabled((prev) => !prev)}
                  >
                    <span
                      className={`${toggleThumbClass} ${rpmLimitEnabled ? 'translate-x-5' : 'translate-x-0'}`}
                    />
                  </button>
                </div>

                {rpmLimitEnabled && (
                  <div className="space-y-3">
                    <div>
                      <label className="input-label text-xs">
                        {t('admin.accounts.quotaControl.rpmLimit.baseRpm')}
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={1000}
                        step={1}
                        value={bulkBaseRpm ?? ''}
                        onChange={(e) =>
                          setBulkBaseRpm(e.target.value === '' ? null : Number(e.target.value))
                        }
                        className="input"
                        placeholder={t('admin.accounts.quotaControl.rpmLimit.baseRpmPlaceholder')}
                      />
                      <p className="input-hint">{t('admin.accounts.quotaControl.rpmLimit.baseRpmHint')}</p>
                    </div>

                    <div>
                      <label className="input-label text-xs">
                        {t('admin.accounts.quotaControl.rpmLimit.strategy')}
                      </label>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-all ${
                            bulkRpmStrategy === 'tiered'
                              ? 'bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400'
                              : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-dark-600 dark:text-gray-400 dark:hover:bg-dark-500'
                          }`}
                          onClick={() => setBulkRpmStrategy('tiered')}
                        >
                          {t('admin.accounts.quotaControl.rpmLimit.strategyTiered')}
                        </button>
                        <button
                          type="button"
                          className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-all ${
                            bulkRpmStrategy === 'sticky_exempt'
                              ? 'bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400'
                              : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-dark-600 dark:text-gray-400 dark:hover:bg-dark-500'
                          }`}
                          onClick={() => setBulkRpmStrategy('sticky_exempt')}
                        >
                          {t('admin.accounts.quotaControl.rpmLimit.strategyStickyExempt')}
                        </button>
                      </div>
                    </div>

                    {bulkRpmStrategy === 'tiered' && (
                      <div>
                        <label className="input-label text-xs">
                          {t('admin.accounts.quotaControl.rpmLimit.stickyBuffer')}
                        </label>
                        <input
                          type="number"
                          min={1}
                          step={1}
                          value={bulkRpmStickyBuffer ?? ''}
                          onChange={(e) =>
                            setBulkRpmStickyBuffer(e.target.value === '' ? null : Number(e.target.value))
                          }
                          className="input"
                          placeholder={t('admin.accounts.quotaControl.rpmLimit.stickyBufferPlaceholder')}
                        />
                        <p className="input-hint">{t('admin.accounts.quotaControl.rpmLimit.stickyBufferHint')}</p>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="mt-4">
                <label className="input-label">{t('admin.accounts.quotaControl.rpmLimit.userMsgQueue')}</label>
                <p className="mb-2 mt-1 text-xs text-gray-500 dark:text-gray-400">
                  {t('admin.accounts.quotaControl.rpmLimit.userMsgQueueHint')}
                </p>
                <div className="flex space-x-2">
                  {umqModeOptions.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setUserMsgQueueMode(userMsgQueueMode === opt.value ? null : opt.value)}
                      className={`rounded-md border px-3 py-1.5 text-sm transition-colors ${
                        userMsgQueueMode === opt.value
                          ? 'border-primary-600 bg-primary-600 text-white'
                          : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50 dark:border-dark-500 dark:bg-dark-700 dark:text-gray-300 dark:hover:bg-dark-600'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          <div className="border-t border-gray-200 pt-4 dark:border-dark-600">
            <div className="mb-3 flex items-center justify-between">
              <label id="bulk-edit-groups-label" className="input-label mb-0" htmlFor="bulk-edit-groups-enabled">
                {t('nav.groups')}
              </label>
              <input
                id="bulk-edit-groups-enabled"
                type="checkbox"
                checked={enableGroups}
                onChange={(e) => setEnableGroups(e.target.checked)}
                aria-controls="bulk-edit-groups"
                className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
              />
            </div>
            <div id="bulk-edit-groups" className={disabledSectionClass(!enableGroups)}>
              <GroupSelector modelValue={groupIds} groups={groups} onUpdateModelValue={setGroupIds} />
            </div>
          </div>
        </form>
      </BaseDialog>

      <ConfirmDialog
        show={showMixedChannelWarning}
        title={t('admin.accounts.mixedChannelWarningTitle')}
        message={mixedChannelWarningMessage}
        confirmText={t('common.confirm')}
        cancelText={t('common.cancel')}
        danger
        onConfirm={() => void handleMixedChannelConfirm()}
        onCancel={handleMixedChannelCancel}
      />
    </>
  )
}
