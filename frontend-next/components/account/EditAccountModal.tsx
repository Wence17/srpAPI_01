'use client'

import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { useI18n } from '@/lib/i18n'
import { useApp } from '@/context/AppContext'
import { useAuth } from '@/context/AuthContext'
import { adminAccountsAPI } from '@/lib/adminAccounts'
import { adminSettingsAPI } from '@/lib/adminSettings'
import { adminTlsFingerprintProfilesAPI } from '@/lib/adminTlsFingerprintProfiles'
import { extractApiErrorMessage } from '@/lib/apiError'
import { formatDateTime, formatDateTimeLocalInput, parseDateTimeLocalInput } from '@/lib/format'
import { createStableObjectKeyResolver } from '@/lib/stableObjectKey'
import { VERTEX_LOCATION_OPTIONS } from '@/lib/constants/account'
import {
  OPENAI_WS_MODE_CTX_POOL,
  OPENAI_WS_MODE_OFF,
  OPENAI_WS_MODE_PASSTHROUGH,
  isOpenAIWSModeEnabled,
  resolveOpenAIWSModeConcurrencyHintKey,
  resolveOpenAIWSModeFromExtra,
  type OpenAIWSMode,
} from '@/lib/openaiWsMode'
import {
  buildModelMappingObject,
  commonErrorCodes,
  getPresetMappingsByPlatform,
} from '@/lib/useModelWhitelist'
import { useQuotaNotifyState } from '@/hooks/useQuotaNotifyState'
import { applyInterceptWarmup } from '@/components/account/credentialsBuilder'
import BaseDialog from '@/components/common/BaseDialog'
import ConfirmDialog from '@/components/common/ConfirmDialog'
import Select from '@/components/common/Select'
import Icon from '@/components/icons/Icon'
import ProxySelector from '@/components/common/ProxySelector'
import ProxyAdBanner from '@/components/common/ProxyAdBanner'
import GroupSelector from '@/components/common/GroupSelector'
import QuotaLimitCard from '@/components/account/QuotaLimitCard'
import {
  HelpTooltip,
  SectionLabel,
  SpinnerIcon,
  ToggleSwitch,
} from '@/components/account/createAccountModalHelpers'
import {
  AntigravityModelMappingSection,
  CustomErrorCodesSection,
  ModelMappingList,
  ModelRestrictionSection,
  PoolModeSection,
  QuotaLimitCardSection,
  TempUnschedSection,
  ToggleRow,
} from '@/components/account/editAccountModalSections'
import {
  DEFAULT_POOL_MODE_RETRY_COUNT,
  applyOpenAIEndpointCapabilities,
  buildModelRestrictionMapping,
  buildTempUnschedRules,
  defaultBaseUrlForPlatform,
  formatPoolModeRetryStatusCodes,
  initialQuotaControlState,
  loadModelRestrictionFromMapping,
  loadQuotaControlSettings,
  loadTempUnschedRulesFromCredentials,
  normalizeOpenAIResponsesMode,
  normalizePoolModeRetryCount,
  parsePoolModeRetryStatusCodes,
  readOpenAIEndpointCapabilities,
  type ModelMapping,
  type QuotaControlState,
  type TempUnschedRuleForm,
} from '@/components/account/editAccountModalUtils'
import type { AdminGroup } from '@/lib/adminGroups'
import type {
  Account,
  CheckMixedChannelResponse,
  OpenAICompactMode,
  OpenAIEndpointCapability,
  OpenAIResponsesMode,
  Proxy,
} from '@/lib/types'

type CodexImageGenerationBridgeMode = 'inherit' | 'enabled' | 'disabled'

interface EditAccountModalProps {
  show: boolean
  account: Account | null
  proxies: Proxy[]
  groups: AdminGroup[]
  onClose: () => void
  onUpdated: (account: Account) => void
}

const getModelMappingKey = createStableObjectKeyResolver<ModelMapping>('edit-model-mapping')
const getOpenAICompactModelMappingKey = createStableObjectKeyResolver<ModelMapping>('edit-openai-compact-model-mapping')
const getAntigravityModelMappingKey = createStableObjectKeyResolver<ModelMapping>('edit-antigravity-model-mapping')
const getTempUnschedRuleKey = createStableObjectKeyResolver<TempUnschedRuleForm>('edit-temp-unsched-rule')

export default function EditAccountModal({
  show,
  account,
  proxies,
  groups,
  onClose,
  onUpdated,
}: EditAccountModalProps) {
  const { t } = useI18n()
  const appStore = useApp()
  const { isSimpleMode } = useAuth()

  const [submitting, setSubmitting] = useState(false)
  const [form, setForm] = useState({
    name: '',
    notes: '',
    proxy_id: null as number | null,
    concurrency: 1,
    load_factor: null as number | null,
    priority: 1,
    rate_multiplier: 1,
    status: 'active' as 'active' | 'inactive' | 'error',
    group_ids: [] as number[],
    expires_at: null as number | null,
  })

  const [editBaseUrl, setEditBaseUrl] = useState('https://api.anthropic.com')
  const [editApiKey, setEditApiKey] = useState('')
  const [editBedrockAccessKeyId, setEditBedrockAccessKeyId] = useState('')
  const [editBedrockSecretAccessKey, setEditBedrockSecretAccessKey] = useState('')
  const [editBedrockSessionToken, setEditBedrockSessionToken] = useState('')
  const [editBedrockRegion, setEditBedrockRegion] = useState('')
  const [editBedrockForceGlobal, setEditBedrockForceGlobal] = useState(false)
  const [editBedrockApiKeyValue, setEditBedrockApiKeyValue] = useState('')
  const [editVertexProjectId, setEditVertexProjectId] = useState('')
  const [editVertexClientEmail, setEditVertexClientEmail] = useState('')
  const [editVertexLocation, setEditVertexLocation] = useState('us-central1')

  const [modelMappings, setModelMappings] = useState<ModelMapping[]>([])
  const [openAICompactModelMappings, setOpenAICompactModelMappings] = useState<ModelMapping[]>([])
  const [modelRestrictionMode, setModelRestrictionMode] = useState<'whitelist' | 'mapping'>('whitelist')
  const [allowedModels, setAllowedModels] = useState<string[]>([])

  const [poolModeEnabled, setPoolModeEnabled] = useState(false)
  const [poolModeRetryCount, setPoolModeRetryCount] = useState(DEFAULT_POOL_MODE_RETRY_COUNT)
  const [poolModeRetryStatusCodesInput, setPoolModeRetryStatusCodesInput] = useState('')

  const [customErrorCodesEnabled, setCustomErrorCodesEnabled] = useState(false)
  const [selectedErrorCodes, setSelectedErrorCodes] = useState<number[]>([])
  const [customErrorCodeInput, setCustomErrorCodeInput] = useState<number | null>(null)

  const [interceptWarmupRequests, setInterceptWarmupRequests] = useState(false)
  const [autoPauseOnExpired, setAutoPauseOnExpired] = useState(false)
  const [autoPause5hThreshold, setAutoPause5hThreshold] = useState<number | null>(null)
  const [autoPause7dThreshold, setAutoPause7dThreshold] = useState<number | null>(null)
  const [autoPause5hDisabled, setAutoPause5hDisabled] = useState(false)
  const [autoPause7dDisabled, setAutoPause7dDisabled] = useState(false)
  const [mixedScheduling, setMixedScheduling] = useState(false)
  const [allowOverages, setAllowOverages] = useState(false)

  const [antigravityModelMappings, setAntigravityModelMappings] = useState<ModelMapping[]>([])
  const [isSyncingAntigravityUpstream, setIsSyncingAntigravityUpstream] = useState(false)

  const [tempUnschedEnabled, setTempUnschedEnabled] = useState(false)
  const [tempUnschedRules, setTempUnschedRules] = useState<TempUnschedRuleForm[]>([])

  const [showMixedChannelWarning, setShowMixedChannelWarning] = useState(false)
  const [mixedChannelWarningDetails, setMixedChannelWarningDetails] = useState<{
    groupName: string
    currentPlatform: string
    otherPlatform: string
  } | null>(null)
  const [mixedChannelWarningRawMessage, setMixedChannelWarningRawMessage] = useState('')
  const [mixedChannelWarningAction, setMixedChannelWarningAction] = useState<(() => Promise<void>) | null>(null)
  const [antigravityMixedChannelConfirmed, setAntigravityMixedChannelConfirmed] = useState(false)

  const [quotaControl, setQuotaControl] = useState<QuotaControlState>(initialQuotaControlState())
  const [tlsFingerprintProfiles, setTlsFingerprintProfiles] = useState<{ id: number; name: string }[]>([])

  const [openaiPassthroughEnabled, setOpenaiPassthroughEnabled] = useState(false)
  const [openAICompactMode, setOpenAICompactMode] = useState<OpenAICompactMode>('auto')
  const [openAIResponsesMode, setOpenAIResponsesMode] = useState<OpenAIResponsesMode>('auto')
  const [openAIEndpointCapabilities, setOpenAIEndpointCapabilities] = useState<OpenAIEndpointCapability[]>([
    'chat_completions',
    'embeddings',
  ])
  const [openaiOAuthResponsesWebSocketV2Mode, setOpenaiOAuthResponsesWebSocketV2Mode] =
    useState<OpenAIWSMode>(OPENAI_WS_MODE_OFF)
  const [openaiAPIKeyResponsesWebSocketV2Mode, setOpenaiAPIKeyResponsesWebSocketV2Mode] =
    useState<OpenAIWSMode>(OPENAI_WS_MODE_OFF)
  const [codexCLIOnlyEnabled, setCodexCLIOnlyEnabled] = useState(false)
  const [codexCLIOnlyAllowClaudeCodeEnabled, setCodexCLIOnlyAllowClaudeCodeEnabled] = useState(false)
  const [codexImageGenerationBridgeMode, setCodexImageGenerationBridgeMode] =
    useState<CodexImageGenerationBridgeMode>('inherit')
  const [anthropicPassthroughEnabled, setAnthropicPassthroughEnabled] = useState(false)
  const [webSearchEmulationMode, setWebSearchEmulationMode] = useState('default')
  const [webSearchGlobalEnabled, setWebSearchGlobalEnabled] = useState(false)

  const {
    globalEnabled: quotaNotifyGlobalEnabled,
    state: quotaNotifyState,
    setState: setQuotaNotifyState,
    loadFromExtra: loadQuotaNotifyFromExtra,
    writeToExtra: writeQuotaNotifyToExtra,
    reset: resetQuotaNotify,
  } = useQuotaNotifyState()

  const [editQuotaLimit, setEditQuotaLimit] = useState<number | null>(null)
  const [editQuotaDailyLimit, setEditQuotaDailyLimit] = useState<number | null>(null)
  const [editQuotaWeeklyLimit, setEditQuotaWeeklyLimit] = useState<number | null>(null)
  const [editDailyResetMode, setEditDailyResetMode] = useState<'rolling' | 'fixed' | null>(null)
  const [editDailyResetHour, setEditDailyResetHour] = useState<number | null>(null)
  const [editWeeklyResetMode, setEditWeeklyResetMode] = useState<'rolling' | 'fixed' | null>(null)
  const [editWeeklyResetDay, setEditWeeklyResetDay] = useState<number | null>(null)
  const [editWeeklyResetHour, setEditWeeklyResetHour] = useState<number | null>(null)
  const [editResetTimezone, setEditResetTimezone] = useState<string | null>(null)

  useEffect(() => {
    adminSettingsAPI
      .getWebSearchEmulationConfig()
      .then((cfg) => {
        setWebSearchGlobalEnabled(cfg?.enabled === true && (cfg?.providers?.length ?? 0) > 0)
      })
      .catch(() => setWebSearchGlobalEnabled(false))
  }, [])

  const isBedrockAPIKeyMode =
    account?.type === 'bedrock' &&
    (account?.credentials as Record<string, unknown> | undefined)?.auth_mode === 'apikey'

  const baseUrlHint = useMemo(() => {
    if (!account) return t('admin.accounts.baseUrlHint')
    if (account.platform === 'openai') return t('admin.accounts.openai.baseUrlHint')
    if (account.platform === 'gemini') return t('admin.accounts.gemini.baseUrlHint')
    return t('admin.accounts.baseUrlHint')
  }, [account, t])

  const presetMappings = useMemo(
    () => getPresetMappingsByPlatform(account?.platform || 'anthropic'),
    [account?.platform],
  )
  const antigravityPresetMappings = useMemo(() => getPresetMappingsByPlatform('antigravity'), [])
  const bedrockPresets = useMemo(() => getPresetMappingsByPlatform('bedrock'), [])

  const defaultBaseUrl = useMemo(() => defaultBaseUrlForPlatform(account?.platform), [account?.platform])

  const openaiResponsesWebSocketV2Mode =
    account?.type === 'apikey' ? openaiAPIKeyResponsesWebSocketV2Mode : openaiOAuthResponsesWebSocketV2Mode
  const setOpenaiResponsesWebSocketV2Mode = (mode: OpenAIWSMode) => {
    if (account?.type === 'apikey') setOpenaiAPIKeyResponsesWebSocketV2Mode(mode)
    else setOpenaiOAuthResponsesWebSocketV2Mode(mode)
  }

  const openAIWSModeConcurrencyHintKey = resolveOpenAIWSModeConcurrencyHintKey(openaiResponsesWebSocketV2Mode)
  const isOpenAIModelRestrictionDisabled = account?.platform === 'openai' && openaiPassthroughEnabled
  const openAITextGenerationCapabilityEnabled = openAIEndpointCapabilities.includes('chat_completions')

  const openAIWSModeOptions = useMemo(
    () => [
      { value: OPENAI_WS_MODE_OFF, label: t('admin.accounts.openai.wsModeOff') },
      { value: OPENAI_WS_MODE_CTX_POOL, label: t('admin.accounts.openai.wsModeCtxPool') },
      { value: OPENAI_WS_MODE_PASSTHROUGH, label: t('admin.accounts.openai.wsModePassthrough') },
    ],
    [t],
  )

  const codexImageGenerationBridgeOptions = useMemo(
    () => [
      {
        value: 'inherit' as const,
        label: t('admin.accounts.openai.codexImageGenerationBridgeInherit'),
        description: t('admin.accounts.openai.codexImageGenerationBridgeInheritDesc'),
      },
      {
        value: 'enabled' as const,
        label: t('admin.accounts.openai.codexImageGenerationBridgeEnabled'),
        description: t('admin.accounts.openai.codexImageGenerationBridgeEnabledDesc'),
      },
      {
        value: 'disabled' as const,
        label: t('admin.accounts.openai.codexImageGenerationBridgeDisabled'),
        description: t('admin.accounts.openai.codexImageGenerationBridgeDisabledDesc'),
      },
    ],
    [t],
  )

  const codexImageGenerationBridgeBadgeLabel = useMemo(() => {
    switch (codexImageGenerationBridgeMode) {
      case 'enabled':
        return t('admin.accounts.openai.codexImageGenerationBridgeBadgeEnabled')
      case 'disabled':
        return t('admin.accounts.openai.codexImageGenerationBridgeBadgeDisabled')
      default:
        return t('admin.accounts.openai.codexImageGenerationBridgeBadgeInherit')
    }
  }, [codexImageGenerationBridgeMode, t])

  const codexImageGenerationBridgeBadgeClass = useMemo(() => {
    switch (codexImageGenerationBridgeMode) {
      case 'enabled':
        return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
      case 'disabled':
        return 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300'
      default:
        return 'bg-slate-100 text-slate-600 dark:bg-dark-600 dark:text-slate-300'
    }
  }, [codexImageGenerationBridgeMode])

  const openAICompactModeOptions = useMemo(
    () => [
      { value: 'auto', label: t('admin.accounts.openai.compactModeAuto') },
      { value: 'force_on', label: t('admin.accounts.openai.compactModeForceOn') },
      { value: 'force_off', label: t('admin.accounts.openai.compactModeForceOff') },
    ],
    [t],
  )

  const openAIResponsesModeOptions = useMemo(
    () => [
      { value: 'auto', label: t('admin.accounts.openai.responsesModeAuto') },
      { value: 'force_responses', label: t('admin.accounts.openai.responsesModeForceResponses') },
      { value: 'force_chat_completions', label: t('admin.accounts.openai.responsesModeForceChatCompletions') },
    ],
    [t],
  )

  const openAITextEndpointCapabilityLabel = useMemo(() => {
    if (openAIResponsesMode === 'force_responses') return t('admin.accounts.openai.capabilityResponses')
    if (openAIResponsesMode === 'force_chat_completions') return t('admin.accounts.openai.capabilityChatCompletions')
    const extra = account?.extra as Record<string, unknown> | undefined
    if (extra?.openai_responses_supported === true) return t('admin.accounts.openai.capabilityResponsesAuto')
    if (extra?.openai_responses_supported === false) return t('admin.accounts.openai.capabilityChatCompletionsAuto')
    return t('admin.accounts.openai.capabilityTextAuto')
  }, [account?.extra, openAIResponsesMode, t])

  const openAIEndpointCapabilityOptions = useMemo(
    () =>
      [
        { value: 'chat_completions' as const, label: openAITextEndpointCapabilityLabel },
        { value: 'embeddings' as const, label: t('admin.accounts.openai.capabilityEmbeddings') },
      ] satisfies Array<{ value: OpenAIEndpointCapability; label: string }>,
    [openAITextEndpointCapabilityLabel, t],
  )

  const openAIResponsesStatusKey = useMemo(() => {
    if (openAIResponsesMode === 'force_responses') return 'admin.accounts.openai.responsesStatusForcedResponses'
    if (openAIResponsesMode === 'force_chat_completions') return 'admin.accounts.openai.responsesStatusForcedChatCompletions'
    const extra = account?.extra as Record<string, unknown> | undefined
    if (extra?.openai_responses_supported === true) return 'admin.accounts.openai.responsesStatusAutoSupported'
    if (extra?.openai_responses_supported === false) return 'admin.accounts.openai.responsesStatusAutoUnsupported'
    return 'admin.accounts.openai.responsesStatusAutoUnknown'
  }, [account?.extra, openAIResponsesMode])

  const openAICompactStatusKey = useMemo(() => {
    const extra = account?.extra as Record<string, unknown> | undefined
    if (!account || account.platform !== 'openai') return ''
    const mode = typeof extra?.openai_compact_mode === 'string' ? extra.openai_compact_mode : 'auto'
    if (mode === 'force_on') return 'admin.accounts.openai.compactSupported'
    if (mode === 'force_off') return 'admin.accounts.openai.compactUnsupported'
    if (typeof extra?.openai_compact_supported === 'boolean') {
      return extra.openai_compact_supported
        ? 'admin.accounts.openai.compactSupported'
        : 'admin.accounts.openai.compactUnsupported'
    }
    return 'admin.accounts.openai.compactAuto'
  }, [account])

  const tempUnschedPresets = useMemo(
    () => [
      {
        label: t('admin.accounts.tempUnschedulable.presets.overloadLabel'),
        rule: {
          error_code: 529,
          keywords: 'overloaded, too many',
          duration_minutes: 60,
          description: t('admin.accounts.tempUnschedulable.presets.overloadDesc'),
        },
      },
      {
        label: t('admin.accounts.tempUnschedulable.presets.rateLimitLabel'),
        rule: {
          error_code: 429,
          keywords: 'rate limit, too many requests',
          duration_minutes: 10,
          description: t('admin.accounts.tempUnschedulable.presets.rateLimitDesc'),
        },
      },
      {
        label: t('admin.accounts.tempUnschedulable.presets.unavailableLabel'),
        rule: {
          error_code: 503,
          keywords: 'unavailable, maintenance',
          duration_minutes: 30,
          description: t('admin.accounts.tempUnschedulable.presets.unavailableDesc'),
        },
      },
    ],
    [t],
  )

  const statusOptions = useMemo(() => {
    const options = [
      { value: 'active', label: t('common.active') },
      { value: 'inactive', label: t('common.inactive') },
    ]
    if (form.status === 'error') {
      options.push({ value: 'error', label: t('admin.accounts.status.error') })
    }
    return options
  }, [form.status, t])

  const umqModeOptions = useMemo(
    () => [
      { value: '', label: t('admin.accounts.quotaControl.rpmLimit.umqModeOff') },
      { value: 'throttle', label: t('admin.accounts.quotaControl.rpmLimit.umqModeThrottle') },
      { value: 'serialize', label: t('admin.accounts.quotaControl.rpmLimit.umqModeSerialize') },
    ],
    [t],
  )

  const mixedChannelWarningMessageText = mixedChannelWarningDetails
    ? t('admin.accounts.mixedChannelWarning', mixedChannelWarningDetails)
    : mixedChannelWarningRawMessage

  const expiresAtInput = formatDateTimeLocalInput(form.expires_at)

  const updateQuotaControl = (patch: Partial<QuotaControlState>) => {
    setQuotaControl((prev) => ({ ...prev, ...patch }))
  }

  const syncFormFromAccount = useCallback(
    (newAccount: Account) => {
      setAntigravityMixedChannelConfirmed(false)
      setShowMixedChannelWarning(false)
      setMixedChannelWarningDetails(null)
      setMixedChannelWarningRawMessage('')
      setMixedChannelWarningAction(null)

      setForm({
        name: newAccount.name,
        notes: newAccount.notes || '',
        proxy_id: newAccount.proxy_id,
        concurrency: newAccount.concurrency,
        load_factor: newAccount.load_factor ?? null,
        priority: newAccount.priority,
        rate_multiplier: newAccount.rate_multiplier ?? 1,
        status:
          newAccount.status === 'active' || newAccount.status === 'inactive' || newAccount.status === 'error'
            ? newAccount.status
            : 'active',
        group_ids: newAccount.group_ids || [],
        expires_at: newAccount.expires_at ?? null,
      })

      const credentials = newAccount.credentials as Record<string, unknown> | undefined
      const extra = newAccount.extra as Record<string, unknown> | undefined

      setInterceptWarmupRequests(credentials?.intercept_warmup_requests === true)
      setAutoPauseOnExpired(newAccount.auto_pause_on_expired === true)
      setEditVertexProjectId('')
      setEditVertexClientEmail('')
      setEditVertexLocation('us-central1')
      setMixedScheduling(extra?.mixed_scheduling === true)
      setAllowOverages(extra?.allow_overages === true)
      setAutoPause5hThreshold(
        typeof extra?.auto_pause_5h_threshold === 'number' ? extra.auto_pause_5h_threshold * 100 : null,
      )
      setAutoPause7dThreshold(
        typeof extra?.auto_pause_7d_threshold === 'number' ? extra.auto_pause_7d_threshold * 100 : null,
      )
      setAutoPause5hDisabled(extra?.auto_pause_5h_disabled === true)
      setAutoPause7dDisabled(extra?.auto_pause_7d_disabled === true)

      setOpenaiPassthroughEnabled(false)
      setOpenAICompactMode('auto')
      setOpenAIResponsesMode('auto')
      setOpenAIEndpointCapabilities(['chat_completions', 'embeddings'])
      setOpenAICompactModelMappings([])
      setOpenaiOAuthResponsesWebSocketV2Mode(OPENAI_WS_MODE_OFF)
      setOpenaiAPIKeyResponsesWebSocketV2Mode(OPENAI_WS_MODE_OFF)
      setCodexCLIOnlyEnabled(false)
      setCodexCLIOnlyAllowClaudeCodeEnabled(false)
      setCodexImageGenerationBridgeMode('inherit')
      setAnthropicPassthroughEnabled(false)
      setWebSearchEmulationMode('default')

      if (newAccount.platform === 'openai' && (newAccount.type === 'oauth' || newAccount.type === 'apikey')) {
        setOpenaiPassthroughEnabled(
          extra?.openai_passthrough === true || extra?.openai_oauth_passthrough === true,
        )
        setOpenAICompactMode((extra?.openai_compact_mode as OpenAICompactMode) || 'auto')
        if (newAccount.type === 'apikey') {
          setOpenAIResponsesMode(normalizeOpenAIResponsesMode(extra?.openai_responses_mode))
          const caps = readOpenAIEndpointCapabilities(credentials)
          setOpenAIEndpointCapabilities(caps)
          if (!caps.includes('chat_completions')) setOpenAIResponsesMode('auto')
        }
        const bridgeValue =
          typeof extra?.codex_image_generation_bridge === 'boolean'
            ? extra.codex_image_generation_bridge
            : extra?.codex_image_generation_bridge_enabled
        if (bridgeValue === true) setCodexImageGenerationBridgeMode('enabled')
        else if (bridgeValue === false) setCodexImageGenerationBridgeMode('disabled')
        setOpenaiOAuthResponsesWebSocketV2Mode(
          resolveOpenAIWSModeFromExtra(extra, {
            modeKey: 'openai_oauth_responses_websockets_v2_mode',
            enabledKey: 'openai_oauth_responses_websockets_v2_enabled',
            fallbackEnabledKeys: ['responses_websockets_v2_enabled', 'openai_ws_enabled'],
            defaultMode: OPENAI_WS_MODE_OFF,
          }),
        )
        setOpenaiAPIKeyResponsesWebSocketV2Mode(
          resolveOpenAIWSModeFromExtra(extra, {
            modeKey: 'openai_apikey_responses_websockets_v2_mode',
            enabledKey: 'openai_apikey_responses_websockets_v2_enabled',
            fallbackEnabledKeys: ['responses_websockets_v2_enabled', 'openai_ws_enabled'],
            defaultMode: OPENAI_WS_MODE_OFF,
          }),
        )
        if (newAccount.type === 'oauth') {
          setCodexCLIOnlyEnabled(extra?.codex_cli_only === true)
          setCodexCLIOnlyAllowClaudeCodeEnabled(
            Array.isArray(extra?.codex_cli_only_allowed_clients) &&
              (extra.codex_cli_only_allowed_clients as unknown[]).includes('claude_code'),
          )
        }
        const compactMappings = credentials?.compact_model_mapping as Record<string, string> | undefined
        if (compactMappings && typeof compactMappings === 'object') {
          setOpenAICompactModelMappings(Object.entries(compactMappings).map(([from, to]) => ({ from, to })))
        }
      }

      if (newAccount.platform === 'anthropic' && newAccount.type === 'apikey') {
        setAnthropicPassthroughEnabled(extra?.anthropic_passthrough === true)
        const wsVal = extra?.web_search_emulation
        if (wsVal === 'enabled' || wsVal === 'disabled') setWebSearchEmulationMode(wsVal)
        else if (wsVal === true) setWebSearchEmulationMode('enabled')
        else setWebSearchEmulationMode('default')
      }

      if (newAccount.type === 'apikey' || newAccount.type === 'bedrock') {
        const quotaVal = extra?.quota_limit as number | undefined
        setEditQuotaLimit(quotaVal && quotaVal > 0 ? quotaVal : null)
        const dailyVal = extra?.quota_daily_limit as number | undefined
        setEditQuotaDailyLimit(dailyVal && dailyVal > 0 ? dailyVal : null)
        const weeklyVal = extra?.quota_weekly_limit as number | undefined
        setEditQuotaWeeklyLimit(weeklyVal && weeklyVal > 0 ? weeklyVal : null)
        setEditDailyResetMode((extra?.quota_daily_reset_mode as 'rolling' | 'fixed') || null)
        setEditDailyResetHour((extra?.quota_daily_reset_hour as number) ?? null)
        setEditWeeklyResetMode((extra?.quota_weekly_reset_mode as 'rolling' | 'fixed') || null)
        setEditWeeklyResetDay((extra?.quota_weekly_reset_day as number) ?? null)
        setEditWeeklyResetHour((extra?.quota_weekly_reset_hour as number) ?? null)
        setEditResetTimezone((extra?.quota_reset_timezone as string) || null)
        loadQuotaNotifyFromExtra(extra)
      } else {
        setEditQuotaLimit(null)
        setEditQuotaDailyLimit(null)
        setEditQuotaWeeklyLimit(null)
        setEditDailyResetMode(null)
        setEditDailyResetHour(null)
        setEditWeeklyResetMode(null)
        setEditWeeklyResetDay(null)
        setEditWeeklyResetHour(null)
        setEditResetTimezone(null)
        resetQuotaNotify()
      }

      if (newAccount.platform === 'antigravity') {
        const rawAgMapping = credentials?.model_mapping as Record<string, string> | undefined
        if (rawAgMapping && typeof rawAgMapping === 'object') {
          setAntigravityModelMappings(Object.entries(rawAgMapping).map(([from, to]) => ({ from, to })))
        } else {
          const rawWhitelist = credentials?.model_whitelist
          if (Array.isArray(rawWhitelist) && rawWhitelist.length > 0) {
            setAntigravityModelMappings(
              rawWhitelist
                .map((v) => String(v).trim())
                .filter((v) => v.length > 0)
                .map((m) => ({ from: m, to: m })),
            )
          } else {
            setAntigravityModelMappings([])
          }
        }
      } else {
        setAntigravityModelMappings([])
      }

      setQuotaControl(loadQuotaControlSettings(newAccount))

      const tempUnsched = loadTempUnschedRulesFromCredentials(credentials)
      setTempUnschedEnabled(tempUnsched.enabled)
      setTempUnschedRules(tempUnsched.rules)

      if (newAccount.type === 'apikey' && credentials) {
        setEditBaseUrl((credentials.base_url as string) || defaultBaseUrlForPlatform(newAccount.platform))
        const restriction = loadModelRestrictionFromMapping(credentials.model_mapping as Record<string, unknown>)
        setAllowedModels(restriction.allowedModels)
        setModelMappings(restriction.modelMappings)
        setModelRestrictionMode(restriction.modelRestrictionMode)
        setPoolModeEnabled(credentials.pool_mode === true)
        setPoolModeRetryCount(
          normalizePoolModeRetryCount(Number(credentials.pool_mode_retry_count ?? DEFAULT_POOL_MODE_RETRY_COUNT)),
        )
        setPoolModeRetryStatusCodesInput(formatPoolModeRetryStatusCodes(credentials.pool_mode_retry_status_codes))
        setCustomErrorCodesEnabled(credentials.custom_error_codes_enabled === true)
        const existingErrorCodes = credentials.custom_error_codes as number[] | undefined
        setSelectedErrorCodes(existingErrorCodes && Array.isArray(existingErrorCodes) ? [...existingErrorCodes] : [])
      } else if (newAccount.type === 'bedrock' && credentials) {
        const authMode = (credentials.auth_mode as string) || 'sigv4'
        setEditBedrockRegion((credentials.aws_region as string) || '')
        setEditBedrockForceGlobal((credentials.aws_force_global as string) === 'true')
        if (authMode === 'apikey') setEditBedrockApiKeyValue('')
        else {
          setEditBedrockAccessKeyId((credentials.aws_access_key_id as string) || '')
          setEditBedrockSecretAccessKey('')
          setEditBedrockSessionToken('')
        }
        setPoolModeEnabled(credentials.pool_mode === true)
        const retryCount = credentials.pool_mode_retry_count
        setPoolModeRetryCount(typeof retryCount === 'number' && retryCount >= 0 ? retryCount : DEFAULT_POOL_MODE_RETRY_COUNT)
        setPoolModeRetryStatusCodesInput(formatPoolModeRetryStatusCodes(credentials.pool_mode_retry_status_codes))
        const bedrockExtra = (newAccount.extra as Record<string, unknown>) || {}
        setEditQuotaLimit(typeof bedrockExtra.quota_limit === 'number' ? bedrockExtra.quota_limit : null)
        setEditQuotaDailyLimit(typeof bedrockExtra.quota_daily_limit === 'number' ? bedrockExtra.quota_daily_limit : null)
        setEditQuotaWeeklyLimit(typeof bedrockExtra.quota_weekly_limit === 'number' ? bedrockExtra.quota_weekly_limit : null)
        loadQuotaNotifyFromExtra(bedrockExtra)
        const restriction = loadModelRestrictionFromMapping(credentials.model_mapping as Record<string, unknown>)
        setAllowedModels(restriction.allowedModels)
        setModelMappings(restriction.modelMappings)
        setModelRestrictionMode(restriction.modelRestrictionMode)
      } else if (newAccount.type === 'upstream' && credentials) {
        setEditBaseUrl((credentials.base_url as string) || '')
      } else if (
        (newAccount.platform === 'gemini' || newAccount.platform === 'anthropic') &&
        newAccount.type === 'service_account' &&
        credentials
      ) {
        setEditVertexProjectId((credentials.project_id as string) || '')
        setEditVertexClientEmail((credentials.client_email as string) || '')
        setEditVertexLocation((credentials.location as string) || (credentials.vertex_location as string) || 'us-central1')
        const restriction = loadModelRestrictionFromMapping(credentials.model_mapping as Record<string, unknown>)
        setAllowedModels(restriction.allowedModels)
        setModelMappings(restriction.modelMappings)
        setModelRestrictionMode(restriction.modelRestrictionMode)
      } else {
        setEditBaseUrl(defaultBaseUrlForPlatform(newAccount.platform))
        if (newAccount.platform === 'openai' && credentials) {
          const restriction = loadModelRestrictionFromMapping(credentials.model_mapping as Record<string, unknown>)
          setAllowedModels(restriction.allowedModels)
          setModelMappings(restriction.modelMappings)
          setModelRestrictionMode(restriction.modelRestrictionMode)
        } else {
          setModelRestrictionMode('whitelist')
          setModelMappings([])
          setAllowedModels([])
        }
        setPoolModeEnabled(false)
        setPoolModeRetryCount(DEFAULT_POOL_MODE_RETRY_COUNT)
        setPoolModeRetryStatusCodesInput('')
        setCustomErrorCodesEnabled(false)
        setSelectedErrorCodes([])
      }

      setEditApiKey('')
    },
    [loadQuotaNotifyFromExtra, resetQuotaNotify],
  )

  const loadTLSProfiles = useCallback(async () => {
    try {
      const profiles = await adminTlsFingerprintProfilesAPI.list()
      setTlsFingerprintProfiles(profiles.map((p) => ({ id: p.id, name: p.name })))
    } catch {
      setTlsFingerprintProfiles([])
    }
  }, [])

  useEffect(() => {
    if (show && account) {
      syncFormFromAccount(account)
      void loadTLSProfiles()
    }
  }, [show, account, syncFormFromAccount, loadTLSProfiles])

  const addModelMapping = () => setModelMappings((prev) => [...prev, { from: '', to: '' }])
  const removeModelMapping = (index: number) => setModelMappings((prev) => prev.filter((_, i) => i !== index))
  const addPresetMapping = (from: string, to: string) => {
    if (modelMappings.some((m) => m.from === from)) {
      appStore.showInfo(t('admin.accounts.mappingExists', { model: from }))
      return
    }
    setModelMappings((prev) => [...prev, { from, to }])
  }

  const addAntigravityModelMapping = () => setAntigravityModelMappings((prev) => [...prev, { from: '', to: '' }])
  const removeAntigravityModelMapping = (index: number) =>
    setAntigravityModelMappings((prev) => prev.filter((_, i) => i !== index))
  const addAntigravityPresetMapping = (from: string, to: string) => {
    if (antigravityModelMappings.some((m) => m.from === from)) {
      appStore.showInfo(t('admin.accounts.mappingExists', { model: from }))
      return
    }
    setAntigravityModelMappings((prev) => [...prev, { from, to }])
  }

  const addOpenAICompactModelMapping = () => setOpenAICompactModelMappings((prev) => [...prev, { from: '', to: '' }])
  const removeOpenAICompactModelMapping = (index: number) =>
    setOpenAICompactModelMappings((prev) => prev.filter((_, i) => i !== index))

  const syncAntigravityUpstreamModels = async () => {
    if (!account?.id || isSyncingAntigravityUpstream) return
    setIsSyncingAntigravityUpstream(true)
    try {
      const result = await adminAccountsAPI.syncUpstreamModels(account.id)
      const upstreamModels = result.models.map((model) => model.trim()).filter(Boolean)
      if (upstreamModels.length === 0) {
        appStore.showInfo(t('admin.accounts.syncUpstreamModelsEmpty'))
        return
      }
      let addedCount = 0
      setAntigravityModelMappings((prev) => {
        const next = [...prev]
        for (const model of upstreamModels) {
          if (!next.some((mapping) => mapping.from === model)) {
            next.push({ from: model, to: model })
            addedCount += 1
          }
        }
        return next
      })
      if (addedCount > 0) {
        appStore.showSuccess(t('admin.accounts.syncUpstreamModelsSuccess', { count: addedCount, total: upstreamModels.length }))
      } else {
        appStore.showInfo(t('admin.accounts.syncUpstreamModelsNoChanges', { count: upstreamModels.length }))
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : t('admin.accounts.syncUpstreamModelsFailed')
      appStore.showError(t('admin.accounts.syncUpstreamModelsError', { message }))
    } finally {
      setIsSyncingAntigravityUpstream(false)
    }
  }

  const toggleErrorCode = (code: number) => {
    if (!selectedErrorCodes.includes(code)) {
      if (code === 429 && !confirm(t('admin.accounts.customErrorCodes429Warning'))) return
      if (code === 529 && !confirm(t('admin.accounts.customErrorCodes529Warning'))) return
      setSelectedErrorCodes((prev) => [...prev, code])
    } else {
      setSelectedErrorCodes((prev) => prev.filter((c) => c !== code))
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
    if (code === 429 && !confirm(t('admin.accounts.customErrorCodes429Warning'))) return
    if (code === 529 && !confirm(t('admin.accounts.customErrorCodes529Warning'))) return
    setSelectedErrorCodes((prev) => [...prev, code])
    setCustomErrorCodeInput(null)
  }

  const addTempUnschedRule = (preset?: TempUnschedRuleForm) => {
    if (preset) setTempUnschedRules((prev) => [...prev, { ...preset }])
    else setTempUnschedRules((prev) => [...prev, { error_code: null, keywords: '', duration_minutes: 30, description: '' }])
  }

  const moveTempUnschedRule = (index: number, direction: number) => {
    const target = index + direction
    if (target < 0 || target >= tempUnschedRules.length) return
    setTempUnschedRules((prev) => {
      const next = [...prev]
      ;[next[index], next[target]] = [next[target], next[index]]
      return next
    })
  }

  const applyTempUnschedConfig = (credentials: Record<string, unknown>) => {
    if (!tempUnschedEnabled) {
      delete credentials.temp_unschedulable_enabled
      delete credentials.temp_unschedulable_rules
      return true
    }
    const rules = buildTempUnschedRules(tempUnschedRules)
    if (rules.length === 0) {
      appStore.showError(t('admin.accounts.tempUnschedulable.rulesInvalid'))
      return false
    }
    credentials.temp_unschedulable_enabled = true
    credentials.temp_unschedulable_rules = rules
    return true
  }

  const toggleOpenAIEndpointCapability = (capability: OpenAIEndpointCapability, checked: boolean) => {
    if (!checked) {
      if (openAIEndpointCapabilities.length <= 1) return
      const next = openAIEndpointCapabilities.filter((value) => value !== capability)
      setOpenAIEndpointCapabilities(next)
      if (!next.includes('chat_completions')) setOpenAIResponsesMode('auto')
      return
    }
    setOpenAIEndpointCapabilities((prev) => {
      const next = [...prev.filter((value) => value !== capability), capability]
      return next.includes('chat_completions') || next.includes('embeddings') ? next : prev
    })
  }

  const needsMixedChannelCheck = () => account?.platform === 'antigravity' || account?.platform === 'anthropic'

  const buildMixedChannelDetails = (resp?: CheckMixedChannelResponse) => {
    const details = resp?.details
    if (!details) return null
    return {
      groupName: details.group_name || 'Unknown',
      currentPlatform: details.current_platform || 'Unknown',
      otherPlatform: details.other_platform || 'Unknown',
    }
  }

  const clearMixedChannelDialog = () => {
    setShowMixedChannelWarning(false)
    setMixedChannelWarningDetails(null)
    setMixedChannelWarningRawMessage('')
    setMixedChannelWarningAction(null)
  }

  const openMixedChannelDialog = (opts: {
    response?: CheckMixedChannelResponse
    message?: string
    onConfirm: () => Promise<void>
  }) => {
    setMixedChannelWarningDetails(buildMixedChannelDetails(opts.response))
    setMixedChannelWarningRawMessage(opts.message || opts.response?.message || t('admin.accounts.failedToUpdate'))
    setMixedChannelWarningAction(() => opts.onConfirm)
    setShowMixedChannelWarning(true)
  }

  const withAntigravityConfirmFlag = (payload: Record<string, unknown>) => {
    if (needsMixedChannelCheck() && antigravityMixedChannelConfirmed) {
      return { ...payload, confirm_mixed_channel_risk: true }
    }
    const cloned = { ...payload }
    delete cloned.confirm_mixed_channel_risk
    return cloned
  }

  const handleClose = () => {
    setAntigravityMixedChannelConfirmed(false)
    clearMixedChannelDialog()
    onClose()
  }

  const submitUpdateAccount = async (accountID: number, updatePayload: Record<string, unknown>) => {
    setSubmitting(true)
    try {
      const updatedAccount = await adminAccountsAPI.update(accountID, withAntigravityConfirmFlag(updatePayload))
      appStore.showSuccess(t('admin.accounts.accountUpdated'))
      onUpdated(updatedAccount)
      handleClose()
    } catch (error: unknown) {
      const err = error as { status?: number; error?: string; message?: string }
      if (err.status === 409 && err.error === 'mixed_channel_warning' && needsMixedChannelCheck()) {
        openMixedChannelDialog({
          message: err.message,
          onConfirm: async () => {
            setAntigravityMixedChannelConfirmed(true)
            await submitUpdateAccount(accountID, updatePayload)
          },
        })
        return
      }
      appStore.showError(err.message || extractApiErrorMessage(error) || t('admin.accounts.failedToUpdate'))
    } finally {
      setSubmitting(false)
    }
  }

  const ensureAntigravityMixedChannelConfirmed = async (onConfirm: () => Promise<void>): Promise<boolean> => {
    if (!needsMixedChannelCheck() || antigravityMixedChannelConfirmed || !account) return !!account
    try {
      const result = await adminAccountsAPI.checkMixedChannelRisk({
        platform: account.platform,
        group_ids: form.group_ids,
        account_id: account.id,
      })
      if (!result.has_risk) return true
      openMixedChannelDialog({
        response: result,
        onConfirm: async () => {
          setAntigravityMixedChannelConfirmed(true)
          await onConfirm()
        },
      })
      return false
    } catch (error: unknown) {
      appStore.showError(extractApiErrorMessage(error) || t('admin.accounts.failedToUpdate'))
      return false
    }
  }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (!account) return
    const accountID = account.id

    if (form.status !== 'active' && form.status !== 'inactive' && form.status !== 'error') {
      appStore.showError(t('admin.accounts.pleaseSelectStatus'))
      return
    }

    const updatePayload: Record<string, unknown> = { ...form }
    try {
      if (updatePayload.proxy_id === null) updatePayload.proxy_id = 0
      if (form.expires_at === null) updatePayload.expires_at = 0
      const lf = form.load_factor
      updatePayload.load_factor = lf == null || Number.isNaN(lf) || lf <= 0 ? 0 : lf
      updatePayload.auto_pause_on_expired = autoPauseOnExpired

      if (account.type === 'apikey') {
        const currentCredentials = (account.credentials as Record<string, unknown>) || {}
        const newBaseUrl = editBaseUrl.trim() || defaultBaseUrl
        const shouldApplyModelMapping = !(account.platform === 'openai' && openaiPassthroughEnabled)
        const newCredentials: Record<string, unknown> = { ...currentCredentials, base_url: newBaseUrl }
        const hasExistingApiKey =
          account.credentials_status?.has_api_key ?? Boolean(currentCredentials.api_key)
        if (editApiKey.trim()) newCredentials.api_key = editApiKey.trim()
        else if (!hasExistingApiKey) {
          appStore.showError(t('admin.accounts.apiKeyIsRequired'))
          return
        }
        if (shouldApplyModelMapping) {
          const modelMapping = buildModelRestrictionMapping(allowedModels, modelMappings)
          if (modelMapping) newCredentials.model_mapping = modelMapping
          else delete newCredentials.model_mapping
        } else if (currentCredentials.model_mapping) {
          newCredentials.model_mapping = currentCredentials.model_mapping
        }
        if (account.platform === 'openai') {
          applyOpenAIEndpointCapabilities(newCredentials, openAIEndpointCapabilities)
          const compactModelMapping = buildModelMappingObject('mapping', [], openAICompactModelMappings)
          if (compactModelMapping) newCredentials.compact_model_mapping = compactModelMapping
          else delete newCredentials.compact_model_mapping
        }
        if (poolModeEnabled) {
          newCredentials.pool_mode = true
          newCredentials.pool_mode_retry_count = normalizePoolModeRetryCount(poolModeRetryCount)
          const parsedRetryStatusCodes = parsePoolModeRetryStatusCodes(poolModeRetryStatusCodesInput)
          if (parsedRetryStatusCodes.length > 0) newCredentials.pool_mode_retry_status_codes = parsedRetryStatusCodes
          else delete newCredentials.pool_mode_retry_status_codes
        } else {
          delete newCredentials.pool_mode
          delete newCredentials.pool_mode_retry_count
          delete newCredentials.pool_mode_retry_status_codes
        }
        if (customErrorCodesEnabled) {
          newCredentials.custom_error_codes_enabled = true
          newCredentials.custom_error_codes = [...selectedErrorCodes]
        } else {
          delete newCredentials.custom_error_codes_enabled
          delete newCredentials.custom_error_codes
        }
        applyInterceptWarmup(newCredentials, interceptWarmupRequests, 'edit')
        if (!applyTempUnschedConfig(newCredentials)) return
        updatePayload.credentials = newCredentials
      } else if (account.type === 'upstream') {
        const currentCredentials = (account.credentials as Record<string, unknown>) || {}
        const newCredentials: Record<string, unknown> = { ...currentCredentials, base_url: editBaseUrl.trim() }
        if (editApiKey.trim()) newCredentials.api_key = editApiKey.trim()
        applyInterceptWarmup(newCredentials, interceptWarmupRequests, 'edit')
        if (!applyTempUnschedConfig(newCredentials)) return
        updatePayload.credentials = newCredentials
      } else if (
        (account.platform === 'gemini' || account.platform === 'anthropic') &&
        account.type === 'service_account'
      ) {
        const currentCredentials = (account.credentials as Record<string, unknown>) || {}
        if (!editVertexProjectId.trim()) {
          appStore.showError(t('admin.accounts.vertexSaJsonMissingProjectId'))
          return
        }
        if (!editVertexClientEmail.trim()) {
          appStore.showError(t('admin.accounts.vertexSaJsonMissingClientEmail'))
          return
        }
        if (!editVertexLocation.trim()) {
          appStore.showError(t('admin.accounts.vertexLocationRequired'))
          return
        }
        const credentialsStatus = account.credentials_status
        const hasExistingServiceAccountJson = credentialsStatus
          ? Boolean(credentialsStatus.has_service_account_json || credentialsStatus.has_service_account)
          : Boolean(currentCredentials.service_account_json || currentCredentials.service_account)
        if (!hasExistingServiceAccountJson) {
          appStore.showError(t('admin.accounts.vertexSaJsonRequired'))
          return
        }
        const newCredentials: Record<string, unknown> = {
          ...currentCredentials,
          project_id: editVertexProjectId.trim(),
          client_email: editVertexClientEmail.trim(),
          location: editVertexLocation.trim(),
          tier_id: 'vertex',
        }
        const modelMapping = buildModelRestrictionMapping(allowedModels, modelMappings)
        if (modelMapping) newCredentials.model_mapping = modelMapping
        else delete newCredentials.model_mapping
        applyInterceptWarmup(newCredentials, interceptWarmupRequests, 'edit')
        if (!applyTempUnschedConfig(newCredentials)) return
        updatePayload.credentials = newCredentials
      } else if (account.type === 'bedrock') {
        const currentCredentials = (account.credentials as Record<string, unknown>) || {}
        const newCredentials: Record<string, unknown> = { ...currentCredentials, aws_region: editBedrockRegion.trim() }
        if (editBedrockForceGlobal) newCredentials.aws_force_global = 'true'
        else delete newCredentials.aws_force_global
        if (isBedrockAPIKeyMode) {
          if (editBedrockApiKeyValue.trim()) newCredentials.api_key = editBedrockApiKeyValue.trim()
        } else {
          newCredentials.aws_access_key_id = editBedrockAccessKeyId.trim()
          if (editBedrockSecretAccessKey.trim()) newCredentials.aws_secret_access_key = editBedrockSecretAccessKey.trim()
          if (editBedrockSessionToken.trim()) newCredentials.aws_session_token = editBedrockSessionToken.trim()
        }
        if (poolModeEnabled) {
          newCredentials.pool_mode = true
          newCredentials.pool_mode_retry_count = normalizePoolModeRetryCount(poolModeRetryCount)
          const parsedRetryStatusCodes = parsePoolModeRetryStatusCodes(poolModeRetryStatusCodesInput)
          if (parsedRetryStatusCodes.length > 0) newCredentials.pool_mode_retry_status_codes = parsedRetryStatusCodes
          else delete newCredentials.pool_mode_retry_status_codes
        } else {
          delete newCredentials.pool_mode
          delete newCredentials.pool_mode_retry_count
          delete newCredentials.pool_mode_retry_status_codes
        }
        const modelMapping = buildModelRestrictionMapping(allowedModels, modelMappings)
        if (modelMapping) newCredentials.model_mapping = modelMapping
        else delete newCredentials.model_mapping
        applyInterceptWarmup(newCredentials, interceptWarmupRequests, 'edit')
        if (!applyTempUnschedConfig(newCredentials)) return
        updatePayload.credentials = newCredentials
      } else {
        const currentCredentials = (account.credentials as Record<string, unknown>) || {}
        const newCredentials: Record<string, unknown> = { ...currentCredentials }
        applyInterceptWarmup(newCredentials, interceptWarmupRequests, 'edit')
        if (!applyTempUnschedConfig(newCredentials)) return
        updatePayload.credentials = newCredentials
      }

      if (account.platform === 'openai' && account.type === 'oauth') {
        const currentCredentials =
          (updatePayload.credentials as Record<string, unknown>) ||
          ((account.credentials as Record<string, unknown>) || {})
        const newCredentials: Record<string, unknown> = { ...currentCredentials }
        if (!openaiPassthroughEnabled) {
          const modelMapping = buildModelRestrictionMapping(allowedModels, modelMappings)
          if (modelMapping) newCredentials.model_mapping = modelMapping
          else delete newCredentials.model_mapping
        } else if (currentCredentials.model_mapping) {
          newCredentials.model_mapping = currentCredentials.model_mapping
        }
        const compactModelMapping = buildModelMappingObject('mapping', [], openAICompactModelMappings)
        if (compactModelMapping) newCredentials.compact_model_mapping = compactModelMapping
        else delete newCredentials.compact_model_mapping
        updatePayload.credentials = newCredentials
      }

      if (account.platform === 'antigravity') {
        const currentCredentials =
          (updatePayload.credentials as Record<string, unknown>) ||
          ((account.credentials as Record<string, unknown>) || {})
        const newCredentials: Record<string, unknown> = { ...currentCredentials }
        delete newCredentials.model_whitelist
        delete newCredentials.model_mapping
        const antigravityModelMapping = buildModelMappingObject('mapping', [], antigravityModelMappings)
        if (antigravityModelMapping) newCredentials.model_mapping = antigravityModelMapping
        updatePayload.credentials = newCredentials
      }

      if (account.platform === 'antigravity') {
        const currentExtra = (account.extra as Record<string, unknown>) || {}
        const newExtra: Record<string, unknown> = { ...currentExtra }
        if (mixedScheduling) newExtra.mixed_scheduling = true
        else delete newExtra.mixed_scheduling
        if (allowOverages) newExtra.allow_overages = true
        else delete newExtra.allow_overages
        updatePayload.extra = newExtra
      }

      if (account.platform === 'anthropic' && (account.type === 'oauth' || account.type === 'setup-token')) {
        const currentExtra = (updatePayload.extra as Record<string, unknown>) || (account.extra as Record<string, unknown>) || {}
        const newExtra: Record<string, unknown> = { ...currentExtra }
        if (quotaControl.windowCostEnabled && quotaControl.windowCostLimit != null && quotaControl.windowCostLimit > 0) {
          newExtra.window_cost_limit = quotaControl.windowCostLimit
          newExtra.window_cost_sticky_reserve = quotaControl.windowCostStickyReserve ?? 10
        } else {
          delete newExtra.window_cost_limit
          delete newExtra.window_cost_sticky_reserve
        }
        if (quotaControl.sessionLimitEnabled && quotaControl.maxSessions != null && quotaControl.maxSessions > 0) {
          newExtra.max_sessions = quotaControl.maxSessions
          newExtra.session_idle_timeout_minutes = quotaControl.sessionIdleTimeout ?? 5
        } else {
          delete newExtra.max_sessions
          delete newExtra.session_idle_timeout_minutes
        }
        if (quotaControl.rpmLimitEnabled) {
          newExtra.base_rpm = quotaControl.baseRpm != null && quotaControl.baseRpm > 0 ? quotaControl.baseRpm : 15
          newExtra.rpm_strategy = quotaControl.rpmStrategy
          if (quotaControl.rpmStickyBuffer != null && quotaControl.rpmStickyBuffer > 0) {
            newExtra.rpm_sticky_buffer = quotaControl.rpmStickyBuffer
          } else delete newExtra.rpm_sticky_buffer
        } else {
          delete newExtra.base_rpm
          delete newExtra.rpm_strategy
          delete newExtra.rpm_sticky_buffer
        }
        if (quotaControl.userMsgQueueMode) newExtra.user_msg_queue_mode = quotaControl.userMsgQueueMode
        else delete newExtra.user_msg_queue_mode
        delete newExtra.user_msg_queue_enabled
        if (quotaControl.tlsFingerprintEnabled) {
          newExtra.enable_tls_fingerprint = true
          if (quotaControl.tlsFingerprintProfileId) newExtra.tls_fingerprint_profile_id = quotaControl.tlsFingerprintProfileId
          else delete newExtra.tls_fingerprint_profile_id
        } else {
          delete newExtra.enable_tls_fingerprint
          delete newExtra.tls_fingerprint_profile_id
        }
        if (quotaControl.sessionIdMaskingEnabled) newExtra.session_id_masking_enabled = true
        else delete newExtra.session_id_masking_enabled
        if (quotaControl.cacheTTLOverrideEnabled) {
          newExtra.cache_ttl_override_enabled = true
          newExtra.cache_ttl_override_target = quotaControl.cacheTTLOverrideTarget
        } else {
          delete newExtra.cache_ttl_override_enabled
          delete newExtra.cache_ttl_override_target
        }
        if (quotaControl.customBaseUrlEnabled && quotaControl.customBaseUrl.trim()) {
          newExtra.custom_base_url_enabled = true
          newExtra.custom_base_url = quotaControl.customBaseUrl.trim()
        } else {
          delete newExtra.custom_base_url_enabled
          delete newExtra.custom_base_url
        }
        updatePayload.extra = newExtra
      }

      if (account.platform === 'anthropic' && account.type === 'apikey') {
        const currentExtra = (updatePayload.extra as Record<string, unknown>) || (account.extra as Record<string, unknown>) || {}
        const newExtra: Record<string, unknown> = { ...currentExtra }
        if (anthropicPassthroughEnabled) newExtra.anthropic_passthrough = true
        else delete newExtra.anthropic_passthrough
        if (webSearchEmulationMode === 'default') delete newExtra.web_search_emulation
        else newExtra.web_search_emulation = webSearchEmulationMode
        updatePayload.extra = newExtra
      }

      if (account.platform === 'openai' && (account.type === 'oauth' || account.type === 'apikey')) {
        const currentExtra = (account.extra as Record<string, unknown>) || {}
        const newExtra: Record<string, unknown> = { ...currentExtra }
        const hadCodexCLIOnlyEnabled = currentExtra.codex_cli_only === true
        if (account.type === 'oauth') {
          newExtra.openai_oauth_responses_websockets_v2_mode = openaiOAuthResponsesWebSocketV2Mode
          newExtra.openai_oauth_responses_websockets_v2_enabled = isOpenAIWSModeEnabled(openaiOAuthResponsesWebSocketV2Mode)
        } else {
          newExtra.openai_apikey_responses_websockets_v2_mode = openaiAPIKeyResponsesWebSocketV2Mode
          newExtra.openai_apikey_responses_websockets_v2_enabled = isOpenAIWSModeEnabled(openaiAPIKeyResponsesWebSocketV2Mode)
        }
        delete newExtra.responses_websockets_v2_enabled
        delete newExtra.openai_ws_enabled
        if (openaiPassthroughEnabled) newExtra.openai_passthrough = true
        else {
          delete newExtra.openai_passthrough
          delete newExtra.openai_oauth_passthrough
        }
        if (openAICompactMode === 'auto') delete newExtra.openai_compact_mode
        else newExtra.openai_compact_mode = openAICompactMode
        if (account.type === 'apikey') {
          if (!openAITextGenerationCapabilityEnabled || openAIResponsesMode === 'auto') delete newExtra.openai_responses_mode
          else newExtra.openai_responses_mode = openAIResponsesMode
        }
        if (autoPause5hThreshold != null && autoPause5hThreshold > 0) newExtra.auto_pause_5h_threshold = autoPause5hThreshold / 100
        else delete newExtra.auto_pause_5h_threshold
        if (autoPause7dThreshold != null && autoPause7dThreshold > 0) newExtra.auto_pause_7d_threshold = autoPause7dThreshold / 100
        else delete newExtra.auto_pause_7d_threshold
        if (autoPause5hDisabled) newExtra.auto_pause_5h_disabled = true
        else delete newExtra.auto_pause_5h_disabled
        if (autoPause7dDisabled) newExtra.auto_pause_7d_disabled = true
        else delete newExtra.auto_pause_7d_disabled
        delete newExtra.codex_image_generation_bridge_enabled
        if (codexImageGenerationBridgeMode === 'inherit') delete newExtra.codex_image_generation_bridge
        else newExtra.codex_image_generation_bridge = codexImageGenerationBridgeMode === 'enabled'
        if (account.type === 'oauth') {
          if (codexCLIOnlyEnabled) newExtra.codex_cli_only = true
          else if (hadCodexCLIOnlyEnabled) newExtra.codex_cli_only = false
          else delete newExtra.codex_cli_only
          if (codexCLIOnlyEnabled && codexCLIOnlyAllowClaudeCodeEnabled) {
            newExtra.codex_cli_only_allowed_clients = ['claude_code']
          } else delete newExtra.codex_cli_only_allowed_clients
        }
        updatePayload.extra = newExtra
      }

      if (account.type === 'apikey' || account.type === 'bedrock') {
        const currentExtra =
          (updatePayload.extra as Record<string, unknown>) || (account.extra as Record<string, unknown>) || {}
        const newExtra: Record<string, unknown> = { ...currentExtra }
        if (editQuotaLimit != null && editQuotaLimit > 0) newExtra.quota_limit = editQuotaLimit
        else delete newExtra.quota_limit
        if (editQuotaDailyLimit != null && editQuotaDailyLimit > 0) newExtra.quota_daily_limit = editQuotaDailyLimit
        else {
          delete newExtra.quota_daily_limit
          delete newExtra.quota_daily_used
          delete newExtra.quota_daily_start
        }
        if (editQuotaWeeklyLimit != null && editQuotaWeeklyLimit > 0) newExtra.quota_weekly_limit = editQuotaWeeklyLimit
        else {
          delete newExtra.quota_weekly_limit
          delete newExtra.quota_weekly_used
          delete newExtra.quota_weekly_start
        }
        if (editDailyResetMode === 'fixed') {
          newExtra.quota_daily_reset_mode = 'fixed'
          newExtra.quota_daily_reset_hour = editDailyResetHour ?? 0
        } else {
          delete newExtra.quota_daily_reset_mode
          delete newExtra.quota_daily_reset_hour
        }
        if (editWeeklyResetMode === 'fixed') {
          newExtra.quota_weekly_reset_mode = 'fixed'
          newExtra.quota_weekly_reset_day = editWeeklyResetDay ?? 1
          newExtra.quota_weekly_reset_hour = editWeeklyResetHour ?? 0
        } else {
          delete newExtra.quota_weekly_reset_mode
          delete newExtra.quota_weekly_reset_day
          delete newExtra.quota_weekly_reset_hour
        }
        if (editDailyResetMode === 'fixed' || editWeeklyResetMode === 'fixed') {
          newExtra.quota_reset_timezone = editResetTimezone || 'UTC'
        } else delete newExtra.quota_reset_timezone
        writeQuotaNotifyToExtra(newExtra, 'update')
        updatePayload.extra = newExtra
      }

      const canContinue = await ensureAntigravityMixedChannelConfirmed(async () => {
        await submitUpdateAccount(accountID, updatePayload)
      })
      if (!canContinue) return
      await submitUpdateAccount(accountID, updatePayload)
    } catch (error: unknown) {
      appStore.showError(extractApiErrorMessage(error) || t('admin.accounts.failedToUpdate'))
    }
  }

  const handleMixedChannelConfirm = async () => {
    const action = mixedChannelWarningAction
    if (!action) {
      clearMixedChannelDialog()
      return
    }
    clearMixedChannelDialog()
    setSubmitting(true)
    try {
      await action()
    } finally {
      setSubmitting(false)
    }
  }

  const quotaLimitCard = (
    <QuotaLimitCard
      totalLimit={editQuotaLimit}
      dailyLimit={editQuotaDailyLimit}
      weeklyLimit={editQuotaWeeklyLimit}
      dailyResetMode={editDailyResetMode}
      dailyResetHour={editDailyResetHour}
      weeklyResetMode={editWeeklyResetMode}
      weeklyResetDay={editWeeklyResetDay}
      weeklyResetHour={editWeeklyResetHour}
      resetTimezone={editResetTimezone}
      quotaNotifyGlobalEnabled={quotaNotifyGlobalEnabled}
      quotaNotifyDailyEnabled={quotaNotifyState.daily.enabled}
      quotaNotifyDailyThreshold={quotaNotifyState.daily.threshold}
      quotaNotifyDailyThresholdType={quotaNotifyState.daily.thresholdType}
      quotaNotifyWeeklyEnabled={quotaNotifyState.weekly.enabled}
      quotaNotifyWeeklyThreshold={quotaNotifyState.weekly.threshold}
      quotaNotifyWeeklyThresholdType={quotaNotifyState.weekly.thresholdType}
      quotaNotifyTotalEnabled={quotaNotifyState.total.enabled}
      quotaNotifyTotalThreshold={quotaNotifyState.total.threshold}
      quotaNotifyTotalThresholdType={quotaNotifyState.total.thresholdType}
      onUpdateTotalLimit={setEditQuotaLimit}
      onUpdateDailyLimit={setEditQuotaDailyLimit}
      onUpdateWeeklyLimit={setEditQuotaWeeklyLimit}
      onUpdateDailyResetMode={setEditDailyResetMode}
      onUpdateDailyResetHour={setEditDailyResetHour}
      onUpdateWeeklyResetMode={setEditWeeklyResetMode}
      onUpdateWeeklyResetDay={setEditWeeklyResetDay}
      onUpdateWeeklyResetHour={setEditWeeklyResetHour}
      onUpdateResetTimezone={setEditResetTimezone}
      onUpdateQuotaNotifyDailyEnabled={(value) =>
        setQuotaNotifyState((prev) => ({ ...prev, daily: { ...prev.daily, enabled: value } }))
      }
      onUpdateQuotaNotifyDailyThreshold={(value) =>
        setQuotaNotifyState((prev) => ({ ...prev, daily: { ...prev.daily, threshold: value } }))
      }
      onUpdateQuotaNotifyDailyThresholdType={(value) =>
        setQuotaNotifyState((prev) => ({ ...prev, daily: { ...prev.daily, thresholdType: value } }))
      }
      onUpdateQuotaNotifyWeeklyEnabled={(value) =>
        setQuotaNotifyState((prev) => ({ ...prev, weekly: { ...prev.weekly, enabled: value } }))
      }
      onUpdateQuotaNotifyWeeklyThreshold={(value) =>
        setQuotaNotifyState((prev) => ({ ...prev, weekly: { ...prev.weekly, threshold: value } }))
      }
      onUpdateQuotaNotifyWeeklyThresholdType={(value) =>
        setQuotaNotifyState((prev) => ({ ...prev, weekly: { ...prev.weekly, thresholdType: value } }))
      }
      onUpdateQuotaNotifyTotalEnabled={(value) =>
        setQuotaNotifyState((prev) => ({ ...prev, total: { ...prev.total, enabled: value } }))
      }
      onUpdateQuotaNotifyTotalThreshold={(value) =>
        setQuotaNotifyState((prev) => ({ ...prev, total: { ...prev.total, threshold: value } }))
      }
      onUpdateQuotaNotifyTotalThresholdType={(value) =>
        setQuotaNotifyState((prev) => ({ ...prev, total: { ...prev.total, thresholdType: value } }))
      }
    />
  )

  const apiKeyBaseUrlPlaceholder =
    account?.platform === 'openai'
      ? 'https://api.openai.com'
      : account?.platform === 'gemini'
        ? 'https://generativelanguage.googleapis.com'
        : account?.platform === 'antigravity'
          ? 'https://cloudcode-pa.googleapis.com'
          : 'https://api.anthropic.com'

  const apiKeyPlaceholder =
    account?.platform === 'openai'
      ? 'sk-proj-...'
      : account?.platform === 'gemini'
        ? 'AIza...'
        : account?.platform === 'antigravity'
          ? 'sk-...'
          : 'sk-ant-...'

  return (
    <>
      <BaseDialog
        show={show}
        title={t('admin.accounts.editAccount')}
        width="wide"
        onClose={handleClose}
        footer={
          account ? (
            <div className="flex justify-end gap-3">
              <button onClick={handleClose} type="button" className="btn btn-secondary">
                {t('common.cancel')}
              </button>
              <button
                type="submit"
                form="edit-account-form"
                disabled={submitting}
                className="btn btn-primary"
                data-tour="account-form-submit"
              >
                {submitting ? <SpinnerIcon /> : null}
                {submitting ? t('admin.accounts.updating') : t('common.update')}
              </button>
            </div>
          ) : undefined
        }
      >
        {account ? (
          <form id="edit-account-form" onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="input-label">{t('common.name')}</label>
              <input
                value={form.name}
                onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                type="text"
                required
                className="input"
                data-tour="edit-account-form-name"
              />
            </div>
            <div>
              <label className="input-label">{t('admin.accounts.notes')}</label>
              <textarea
                value={form.notes}
                onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
                rows={3}
                className="input"
                placeholder={t('admin.accounts.notesPlaceholder')}
              />
              <p className="input-hint">{t('admin.accounts.notesHint')}</p>
            </div>

            {account.type === 'apikey' ? (
              <div className="space-y-4">
                <div>
                  <label className="input-label">{t('admin.accounts.baseUrl')}</label>
                  <input
                    value={editBaseUrl}
                    onChange={(e) => setEditBaseUrl(e.target.value)}
                    type="text"
                    className="input"
                    placeholder={apiKeyBaseUrlPlaceholder}
                  />
                  <p className="input-hint">{baseUrlHint}</p>
                </div>
                <div>
                  <label className="input-label">{t('admin.accounts.apiKey')}</label>
                  <input
                    value={editApiKey}
                    onChange={(e) => setEditApiKey(e.target.value)}
                    type="password"
                    className="input font-mono"
                    autoComplete="new-password"
                    data-1p-ignore
                    data-lpignore="true"
                    data-bwignore="true"
                    placeholder={apiKeyPlaceholder}
                  />
                  <p className="input-hint">{t('admin.accounts.leaveEmptyToKeep')}</p>
                </div>
                {account.platform !== 'antigravity' ? (
                  <div className="border-t border-gray-200 pt-4 dark:border-dark-600">
                    <label className="input-label">{t('admin.accounts.modelRestriction')}</label>
                    <ModelRestrictionSection
                      t={t}
                      platform={account.platform || 'anthropic'}
                      accountId={account.id}
                      disabled={isOpenAIModelRestrictionDisabled}
                      modelRestrictionMode={modelRestrictionMode}
                      onModelRestrictionModeChange={setModelRestrictionMode}
                      allowedModels={allowedModels}
                      onAllowedModelsChange={setAllowedModels}
                      modelMappings={modelMappings}
                      onModelMappingsChange={setModelMappings}
                      onAddMapping={addModelMapping}
                      onRemoveMapping={removeModelMapping}
                      presetMappings={presetMappings}
                      onAddPresetMapping={addPresetMapping}
                      getModelMappingKey={getModelMappingKey}
                    />
                  </div>
                ) : null}
                <PoolModeSection
                  t={t}
                  enabled={poolModeEnabled}
                  onEnabledChange={setPoolModeEnabled}
                  retryCount={poolModeRetryCount}
                  onRetryCountChange={setPoolModeRetryCount}
                  statusCodesInput={poolModeRetryStatusCodesInput}
                  onStatusCodesInputChange={setPoolModeRetryStatusCodesInput}
                />
                <CustomErrorCodesSection
                  t={t}
                  enabled={customErrorCodesEnabled}
                  onEnabledChange={setCustomErrorCodesEnabled}
                  selectedErrorCodes={selectedErrorCodes}
                  onToggleErrorCode={toggleErrorCode}
                  onRemoveErrorCode={(code) => setSelectedErrorCodes((prev) => prev.filter((c) => c !== code))}
                  customErrorCodeInput={customErrorCodeInput}
                  onCustomErrorCodeInputChange={setCustomErrorCodeInput}
                  onAddCustomErrorCode={addCustomErrorCode}
                  commonErrorCodes={commonErrorCodes}
                />
              </div>
            ) : null}

            {account.platform === 'openai' && account.type === 'oauth' ? (
              <div className="border-t border-gray-200 pt-4 dark:border-dark-600">
                <label className="input-label">{t('admin.accounts.modelRestriction')}</label>
                <ModelRestrictionSection
                  t={t}
                  platform={account.platform}
                  accountId={account.id}
                  disabled={isOpenAIModelRestrictionDisabled}
                  modelRestrictionMode={modelRestrictionMode}
                  onModelRestrictionModeChange={setModelRestrictionMode}
                  allowedModels={allowedModels}
                  onAllowedModelsChange={setAllowedModels}
                  modelMappings={modelMappings}
                  onModelMappingsChange={setModelMappings}
                  onAddMapping={addModelMapping}
                  onRemoveMapping={removeModelMapping}
                  presetMappings={presetMappings}
                  onAddPresetMapping={addPresetMapping}
                  getModelMappingKey={getModelMappingKey}
                />
              </div>
            ) : null}

            {account.type === 'upstream' ? (
              <div className="space-y-4">
                <div>
                  <label className="input-label">{t('admin.accounts.upstream.baseUrl')}</label>
                  <input
                    value={editBaseUrl}
                    onChange={(e) => setEditBaseUrl(e.target.value)}
                    type="text"
                    className="input"
                    placeholder="https://cloudcode-pa.googleapis.com"
                  />
                  <p className="input-hint">{t('admin.accounts.upstream.baseUrlHint')}</p>
                </div>
                <div>
                  <label className="input-label">{t('admin.accounts.upstream.apiKey')}</label>
                  <input
                    value={editApiKey}
                    onChange={(e) => setEditApiKey(e.target.value)}
                    type="password"
                    className="input font-mono"
                    placeholder="sk-..."
                  />
                  <p className="input-hint">{t('admin.accounts.leaveEmptyToKeep')}</p>
                </div>
              </div>
            ) : null}

            {(account.platform === 'gemini' || account.platform === 'anthropic') && account.type === 'service_account' ? (
              <div className="space-y-4">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className="input-label">Project ID</label>
                    <input
                      value={editVertexProjectId}
                      onChange={(e) => setEditVertexProjectId(e.target.value)}
                      type="text"
                      className="input font-mono"
                      readOnly
                      placeholder={t('admin.accounts.vertexProjectIdPlaceholder')}
                    />
                    <p className="input-hint">{t('admin.accounts.vertexSaJsonEditHint')}</p>
                  </div>
                  <div>
                    <label className="input-label">Location</label>
                    <select
                      value={editVertexLocation}
                      onChange={(e) => setEditVertexLocation(e.target.value)}
                      required
                      className="input font-mono"
                    >
                      {VERTEX_LOCATION_OPTIONS.map((group) => (
                        <optgroup key={group.label} label={group.label}>
                          {group.options.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                    <p className="input-hint">{t('admin.accounts.vertexLocationHint')}</p>
                  </div>
                </div>
                <div className="border-t border-gray-200 pt-4 dark:border-dark-600">
                  <label className="input-label">{t('admin.accounts.modelRestriction')}</label>
                  <ModelRestrictionSection
                    t={t}
                    platform={account.platform || 'anthropic'}
                    accountId={account.id}
                    modelRestrictionMode={modelRestrictionMode}
                    onModelRestrictionModeChange={setModelRestrictionMode}
                    allowedModels={allowedModels}
                    onAllowedModelsChange={setAllowedModels}
                    modelMappings={modelMappings}
                    onModelMappingsChange={setModelMappings}
                    onAddMapping={addModelMapping}
                    onRemoveMapping={removeModelMapping}
                    presetMappings={presetMappings}
                    onAddPresetMapping={addPresetMapping}
                    getModelMappingKey={getModelMappingKey}
                  />
                </div>
              </div>
            ) : null}

            {account.type === 'bedrock' ? (
              <div className="space-y-4">
                {!isBedrockAPIKeyMode ? (
                  <>
                    <div>
                      <label className="input-label">{t('admin.accounts.bedrockAccessKeyId')}</label>
                      <input
                        value={editBedrockAccessKeyId}
                        onChange={(e) => setEditBedrockAccessKeyId(e.target.value)}
                        type="text"
                        className="input font-mono"
                        placeholder="AKIA..."
                      />
                    </div>
                    <div>
                      <label className="input-label">{t('admin.accounts.bedrockSecretAccessKey')}</label>
                      <input
                        value={editBedrockSecretAccessKey}
                        onChange={(e) => setEditBedrockSecretAccessKey(e.target.value)}
                        type="password"
                        className="input font-mono"
                        placeholder={t('admin.accounts.bedrockSecretKeyLeaveEmpty')}
                      />
                      <p className="input-hint">{t('admin.accounts.bedrockSecretKeyLeaveEmpty')}</p>
                    </div>
                    <div>
                      <label className="input-label">{t('admin.accounts.bedrockSessionToken')}</label>
                      <input
                        value={editBedrockSessionToken}
                        onChange={(e) => setEditBedrockSessionToken(e.target.value)}
                        type="password"
                        className="input font-mono"
                        placeholder={t('admin.accounts.bedrockSecretKeyLeaveEmpty')}
                      />
                      <p className="input-hint">{t('admin.accounts.bedrockSessionTokenHint')}</p>
                    </div>
                  </>
                ) : (
                  <div>
                    <label className="input-label">{t('admin.accounts.bedrockApiKeyInput')}</label>
                    <input
                      value={editBedrockApiKeyValue}
                      onChange={(e) => setEditBedrockApiKeyValue(e.target.value)}
                      type="password"
                      className="input font-mono"
                      placeholder={t('admin.accounts.bedrockApiKeyLeaveEmpty')}
                    />
                    <p className="input-hint">{t('admin.accounts.bedrockApiKeyLeaveEmpty')}</p>
                  </div>
                )}
                <div>
                  <label className="input-label">{t('admin.accounts.bedrockRegion')}</label>
                  <input
                    value={editBedrockRegion}
                    onChange={(e) => setEditBedrockRegion(e.target.value)}
                    type="text"
                    className="input"
                    placeholder="us-east-1"
                  />
                  <p className="input-hint">{t('admin.accounts.bedrockRegionHint')}</p>
                </div>
                <div>
                  <label className="flex cursor-pointer items-center gap-2">
                    <input
                      checked={editBedrockForceGlobal}
                      onChange={(e) => setEditBedrockForceGlobal(e.target.checked)}
                      type="checkbox"
                      className="rounded border-gray-300 text-primary-600 focus:ring-primary-500 dark:border-dark-500"
                    />
                    <span className="text-sm text-gray-700 dark:text-gray-300">{t('admin.accounts.bedrockForceGlobal')}</span>
                  </label>
                  <p className="input-hint mt-1">{t('admin.accounts.bedrockForceGlobalHint')}</p>
                </div>
                <div className="border-t border-gray-200 pt-4 dark:border-dark-600">
                  <label className="input-label">{t('admin.accounts.modelRestriction')}</label>
                  <ModelRestrictionSection
                    t={t}
                    platform="anthropic"
                    modelRestrictionMode={modelRestrictionMode}
                    onModelRestrictionModeChange={setModelRestrictionMode}
                    allowedModels={allowedModels}
                    onAllowedModelsChange={setAllowedModels}
                    modelMappings={modelMappings}
                    onModelMappingsChange={setModelMappings}
                    onAddMapping={addModelMapping}
                    onRemoveMapping={removeModelMapping}
                    presetMappings={bedrockPresets}
                    onAddPresetMapping={addPresetMapping}
                    getModelMappingKey={getModelMappingKey}
                    fromPlaceholder={t('admin.accounts.fromModel')}
                    toPlaceholder={t('admin.accounts.toModel')}
                  />
                </div>
                <PoolModeSection
                  t={t}
                  enabled={poolModeEnabled}
                  onEnabledChange={setPoolModeEnabled}
                  retryCount={poolModeRetryCount}
                  onRetryCountChange={setPoolModeRetryCount}
                  statusCodesInput={poolModeRetryStatusCodesInput}
                  onStatusCodesInputChange={setPoolModeRetryStatusCodesInput}
                />
              </div>
            ) : null}

            {account.platform === 'antigravity' ? (
              <AntigravityModelMappingSection
                t={t}
                mappings={antigravityModelMappings}
                onChange={setAntigravityModelMappings}
                onAdd={addAntigravityModelMapping}
                onRemove={removeAntigravityModelMapping}
                onAddPreset={addAntigravityPresetMapping}
                onSyncUpstream={() => void syncAntigravityUpstreamModels()}
                isSyncing={isSyncingAntigravityUpstream}
                accountId={account.id}
                presetMappings={antigravityPresetMappings}
                getKey={getAntigravityModelMappingKey}
              />
            ) : null}

            <TempUnschedSection
              t={t}
              enabled={tempUnschedEnabled}
              onEnabledChange={setTempUnschedEnabled}
              rules={tempUnschedRules}
              onRulesChange={setTempUnschedRules}
              presets={tempUnschedPresets}
              onAddRule={addTempUnschedRule}
              onRemoveRule={(index) => setTempUnschedRules((prev) => prev.filter((_, i) => i !== index))}
              onMoveRule={moveTempUnschedRule}
              getRuleKey={getTempUnschedRuleKey}
            />

            {account.platform === 'anthropic' || account.platform === 'antigravity' ? (
              <ToggleRow
                title={t('admin.accounts.interceptWarmupRequests')}
                description={t('admin.accounts.interceptWarmupRequestsDesc')}
                enabled={interceptWarmupRequests}
                onToggle={() => setInterceptWarmupRequests((prev) => !prev)}
              />
            ) : null}

            <div>
              <div className="mb-1 flex items-center gap-2">
                <label className="input-label mb-0">{t('admin.accounts.proxy')}</label>
                <ProxyAdBanner />
              </div>
              <ProxySelector
                modelValue={form.proxy_id}
                proxies={proxies}
                onUpdateModelValue={(value) => setForm((prev) => ({ ...prev, proxy_id: value }))}
              />
            </div>

            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <div>
                <label className="input-label">{t('admin.accounts.concurrency')}</label>
                <input
                  value={form.concurrency}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      concurrency: Math.max(1, Number(e.target.value) || 1),
                    }))
                  }
                  type="number"
                  min={1}
                  className="input"
                />
              </div>
              <div>
                <label className="input-label">{t('admin.accounts.loadFactor')}</label>
                <input
                  value={form.load_factor ?? ''}
                  onChange={(e) => {
                    const val = e.target.value === '' ? null : Number(e.target.value)
                    setForm((prev) => ({
                      ...prev,
                      load_factor: val != null && val >= 1 ? val : null,
                    }))
                  }}
                  type="number"
                  min={1}
                  className="input"
                  placeholder={String(form.concurrency || 1)}
                />
                <p className="input-hint">{t('admin.accounts.loadFactorHint')}</p>
              </div>
              <div>
                <label className="input-label">{t('admin.accounts.priority')}</label>
                <input
                  value={form.priority}
                  onChange={(e) => setForm((prev) => ({ ...prev, priority: Number(e.target.value) }))}
                  type="number"
                  min={1}
                  className="input"
                  data-tour="account-form-priority"
                />
                <p className="input-hint">{t('admin.accounts.priorityHint')}</p>
              </div>
              <div>
                <label className="input-label">{t('admin.accounts.billingRateMultiplier')}</label>
                <input
                  value={form.rate_multiplier}
                  onChange={(e) => setForm((prev) => ({ ...prev, rate_multiplier: Number(e.target.value) }))}
                  type="number"
                  min={0}
                  step={0.001}
                  className="input"
                />
                <p className="input-hint">{t('admin.accounts.billingRateMultiplierHint')}</p>
              </div>
            </div>

            <div className="border-t border-gray-200 pt-4 dark:border-dark-600">
              <label className="input-label">{t('admin.accounts.expiresAt')}</label>
              <input
                value={expiresAtInput}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, expires_at: parseDateTimeLocalInput(e.target.value) }))
                }
                type="datetime-local"
                className="input"
              />
              <p className="input-hint">{t('admin.accounts.expiresAtHint')}</p>
            </div>

            {account.platform === 'openai' && (account.type === 'oauth' || account.type === 'apikey') ? (
              <>
                <ToggleRow
                  title={t('admin.accounts.openai.oauthPassthrough')}
                  description={t('admin.accounts.openai.oauthPassthroughDesc')}
                  enabled={openaiPassthroughEnabled}
                  onToggle={() => setOpenaiPassthroughEnabled((prev) => !prev)}
                />
                <div className="border-t border-gray-200 pt-4 dark:border-dark-600">
                  <div className="overflow-hidden rounded-lg border border-sky-100 bg-sky-50/60 shadow-sm dark:border-sky-900/50 dark:bg-sky-950/20">
                    <div className="flex items-start gap-3 px-4 py-3">
                      <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-white text-sky-600 shadow-sm ring-1 ring-sky-100 dark:bg-dark-800 dark:text-sky-300 dark:ring-sky-900/60">
                        <Icon name="sparkles" size="sm" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <label className="input-label mb-0">{t('admin.accounts.openai.codexImageGenerationBridge')}</label>
                          <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${codexImageGenerationBridgeBadgeClass}`}>
                            {codexImageGenerationBridgeBadgeLabel}
                          </span>
                        </div>
                        <p className="mt-1 text-xs leading-5 text-slate-600 dark:text-slate-300">
                          {t('admin.accounts.openai.codexImageGenerationBridgeDesc')}
                        </p>
                      </div>
                    </div>
                    <div className="border-t border-sky-100 bg-white/70 p-2 dark:border-sky-900/50 dark:bg-dark-800/70">
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                        {codexImageGenerationBridgeOptions.map((option) => (
                          <button
                            key={option.value}
                            type="button"
                            data-testid={`codex-image-bridge-${option.value}`}
                            onClick={() => setCodexImageGenerationBridgeMode(option.value)}
                            className={`group flex min-h-[68px] items-start gap-2 rounded-md border px-3 py-2 text-left transition-all ${
                              codexImageGenerationBridgeMode === option.value
                                ? 'border-sky-300 bg-sky-50 text-sky-900 shadow-sm ring-1 ring-sky-200 dark:border-sky-700 dark:bg-sky-900/25 dark:text-sky-100 dark:ring-sky-800'
                                : 'border-transparent bg-transparent text-slate-600 hover:border-gray-200 hover:bg-gray-50 dark:text-slate-300 dark:hover:border-dark-500 dark:hover:bg-dark-700'
                            }`}
                          >
                            <span
                              className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors ${
                                codexImageGenerationBridgeMode === option.value
                                  ? 'border-sky-500 bg-sky-500 text-white'
                                  : 'border-gray-300 text-transparent group-hover:border-gray-400 dark:border-dark-500'
                              }`}
                            >
                              <Icon name="check" size="xs" strokeWidth={2} />
                            </span>
                            <span className="min-w-0">
                              <span className="block text-sm font-medium">{option.label}</span>
                              <span className="mt-0.5 block text-xs leading-4 text-slate-500 dark:text-slate-400">
                                {option.description}
                              </span>
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
                <div className="border-t border-gray-200 pt-4 dark:border-dark-600">
                  <div className="flex items-center justify-between">
                    <div>
                      <label className="input-label mb-0">{t('admin.accounts.openai.wsMode')}</label>
                      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{t('admin.accounts.openai.wsModeDesc')}</p>
                      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{t(openAIWSModeConcurrencyHintKey)}</p>
                    </div>
                    <div className="w-52">
                      <Select
                        modelValue={openaiResponsesWebSocketV2Mode}
                        options={openAIWSModeOptions}
                        onUpdateModelValue={(value) => setOpenaiResponsesWebSocketV2Mode(value as OpenAIWSMode)}
                      />
                    </div>
                  </div>
                </div>
              </>
            ) : null}

            {account.platform === 'openai' && account.type === 'apikey' ? (
              <div className="space-y-4 border-t border-gray-200 pt-4 dark:border-dark-600">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <label className="input-label mb-0">{t('admin.accounts.openai.responsesMode')}</label>
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{t('admin.accounts.openai.responsesModeDesc')}</p>
                  </div>
                  <div className="w-56">
                    <Select
                      modelValue={openAIResponsesMode}
                      options={openAIResponsesModeOptions}
                      disabled={!openAITextGenerationCapabilityEnabled}
                      onUpdateModelValue={(value) => setOpenAIResponsesMode(value as OpenAIResponsesMode)}
                      data-testid="openai-responses-mode-select"
                    />
                  </div>
                </div>
                {openAITextGenerationCapabilityEnabled ? (
                  <div className="rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-600 dark:bg-dark-700 dark:text-gray-300">
                    <span className="font-medium">{t(openAIResponsesStatusKey)}</span>
                  </div>
                ) : (
                  <div
                    className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:bg-amber-900/20 dark:text-amber-300"
                    data-testid="openai-responses-mode-not-applicable"
                  >
                    {t('admin.accounts.openai.responsesModeTextDisabledHint')}
                  </div>
                )}
                <div>
                  <label className="input-label mb-2 block">{t('admin.accounts.openai.endpointCapabilities')}</label>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {openAIEndpointCapabilityOptions.map((option) => (
                      <label
                        key={option.value}
                        className="flex cursor-pointer items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm dark:border-dark-600"
                      >
                        <input
                          type="checkbox"
                          className="rounded border-gray-300 text-primary-600 focus:ring-primary-500 dark:border-dark-500"
                          data-testid={`openai-endpoint-capability-${option.value}`}
                          checked={openAIEndpointCapabilities.includes(option.value)}
                          onChange={(e) => toggleOpenAIEndpointCapability(option.value, e.target.checked)}
                        />
                        <span className="text-gray-700 dark:text-gray-200">{option.label}</span>
                      </label>
                    ))}
                  </div>
                  <p className="input-hint">{t('admin.accounts.openai.endpointCapabilitiesDesc')}</p>
                </div>
              </div>
            ) : null}

            {account.platform === 'anthropic' && account.type === 'apikey' ? (
              <>
                <ToggleRow
                  title={t('admin.accounts.anthropic.apiKeyPassthrough')}
                  description={t('admin.accounts.anthropic.apiKeyPassthroughDesc')}
                  enabled={anthropicPassthroughEnabled}
                  onToggle={() => setAnthropicPassthroughEnabled((prev) => !prev)}
                />
                {webSearchGlobalEnabled ? (
                  <div className="border-t border-gray-200 pt-4 dark:border-dark-600">
                    <div className="flex items-center justify-between">
                      <div>
                        <label className="input-label mb-0">{t('admin.accounts.anthropic.webSearchEmulation')}</label>
                        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                          {t('admin.accounts.anthropic.webSearchEmulationDesc')}
                        </p>
                      </div>
                      <select
                        value={webSearchEmulationMode}
                        onChange={(e) => setWebSearchEmulationMode(e.target.value)}
                        className="input w-24 text-sm"
                      >
                        <option value="default">{t('admin.accounts.anthropic.webSearchDefault')}</option>
                        <option value="enabled">{t('admin.accounts.anthropic.webSearchEnabled')}</option>
                        <option value="disabled">{t('admin.accounts.anthropic.webSearchDisabled')}</option>
                      </select>
                    </div>
                  </div>
                ) : null}
              </>
            ) : null}

            {account.platform === 'anthropic' && (account.type === 'apikey' || account.type === 'bedrock') ? (
              <QuotaLimitCardSection t={t} hintKey="admin.accounts.quotaControl.hint" cardProps={quotaLimitCard} />
            ) : account.type === 'apikey' || account.type === 'bedrock' ? (
              <QuotaLimitCardSection t={t} hintKey="admin.accounts.quotaLimitHint" cardProps={quotaLimitCard} />
            ) : null}

            {account.platform === 'openai' && account.type === 'oauth' ? (
              <>
                <ToggleRow
                  title={t('admin.accounts.openai.codexCLIOnly')}
                  description={t('admin.accounts.openai.codexCLIOnlyDesc')}
                  enabled={codexCLIOnlyEnabled}
                  onToggle={() => setCodexCLIOnlyEnabled((prev) => !prev)}
                />
                {codexCLIOnlyEnabled ? (
                  <div className="mt-4 flex items-center justify-between border-l-2 border-gray-200 pl-4 dark:border-dark-600">
                    <div>
                      <label className="input-label mb-0">{t('admin.accounts.openai.codexCLIOnlyAllowClaudeCode')}</label>
                      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                        {t('admin.accounts.openai.codexCLIOnlyAllowClaudeCodeDesc')}
                      </p>
                    </div>
                    <ToggleSwitch
                      enabled={codexCLIOnlyAllowClaudeCodeEnabled}
                      onToggle={() => setCodexCLIOnlyAllowClaudeCodeEnabled((prev) => !prev)}
                    />
                  </div>
                ) : null}
              </>
            ) : null}

            {account.platform === 'openai' && (account.type === 'oauth' || account.type === 'apikey') ? (
              <div className="space-y-4 border-t border-gray-200 pt-4 dark:border-dark-600">
                <div className="flex items-center justify-between">
                  <div>
                    <label className="input-label mb-0">{t('admin.accounts.openai.compactMode')}</label>
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{t('admin.accounts.openai.compactModeDesc')}</p>
                  </div>
                  <div className="w-44">
                    <Select
                      modelValue={openAICompactMode}
                      options={openAICompactModeOptions}
                      onUpdateModelValue={(value) => setOpenAICompactMode(value as OpenAICompactMode)}
                    />
                  </div>
                </div>
                <div className="rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-600 dark:bg-dark-700 dark:text-gray-300">
                  <span className="font-medium">{t(openAICompactStatusKey)}</span>
                  {(account.extra as Record<string, unknown> | undefined)?.openai_compact_checked_at ? (
                    <span className="ml-2 text-gray-500 dark:text-gray-400">
                      {t('admin.accounts.openai.compactLastChecked')}:{' '}
                      {formatDateTime(
                        new Date(String((account.extra as Record<string, unknown>).openai_compact_checked_at)),
                      )}
                    </span>
                  ) : null}
                </div>
                <div>
                  <label className="input-label">{t('admin.accounts.openai.compactModelMapping')}</label>
                  <p className="input-hint">{t('admin.accounts.openai.compactModelMappingDesc')}</p>
                  <ModelMappingList
                    t={t}
                    modelMappings={openAICompactModelMappings}
                    onChange={setOpenAICompactModelMappings}
                    onAdd={addOpenAICompactModelMapping}
                    onRemove={removeOpenAICompactModelMapping}
                    getKey={getOpenAICompactModelMappingKey}
                    fromPlaceholder={t('admin.accounts.fromModel')}
                    toPlaceholder={t('admin.accounts.toModel')}
                    compact
                  />
                </div>
              </div>
            ) : null}

            <ToggleRow
              title={t('admin.accounts.autoPauseOnExpired')}
              description={t('admin.accounts.autoPauseOnExpiredDesc')}
              enabled={autoPauseOnExpired}
              onToggle={() => setAutoPauseOnExpired((prev) => !prev)}
            />

            {account.platform === 'openai' ? (
              <div className="space-y-4 border-t border-gray-200 pt-4 dark:border-dark-600">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="input-label mb-0">{t('admin.accounts.autoPause5hDisabled')}</label>
                    <ToggleSwitch
                      enabled={autoPause5hDisabled}
                      onToggle={() => setAutoPause5hDisabled((prev) => !prev)}
                    />
                  </div>
                  <p className="input-hint">{t('admin.accounts.autoPauseDisabledHint')}</p>
                </div>
                <div>
                  <label className="input-label">{t('admin.accounts.autoPause5hThreshold')}</label>
                  <input
                    value={autoPause5hThreshold ?? ''}
                    onChange={(e) =>
                      setAutoPause5hThreshold(e.target.value === '' ? null : Number(e.target.value))
                    }
                    type="number"
                    min={0}
                    max={100}
                    step={0.1}
                    className="input"
                    disabled={autoPause5hDisabled}
                    data-testid="auto-pause-5h-threshold"
                  />
                  <p className="input-hint">{t('admin.accounts.autoPauseThresholdHint')}</p>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="input-label mb-0">{t('admin.accounts.autoPause7dDisabled')}</label>
                    <ToggleSwitch
                      enabled={autoPause7dDisabled}
                      onToggle={() => setAutoPause7dDisabled((prev) => !prev)}
                    />
                  </div>
                  <p className="input-hint">{t('admin.accounts.autoPauseDisabledHint')}</p>
                </div>
                <div>
                  <label className="input-label">{t('admin.accounts.autoPause7dThreshold')}</label>
                  <input
                    value={autoPause7dThreshold ?? ''}
                    onChange={(e) =>
                      setAutoPause7dThreshold(e.target.value === '' ? null : Number(e.target.value))
                    }
                    type="number"
                    min={0}
                    max={100}
                    step={0.1}
                    className="input"
                    disabled={autoPause7dDisabled}
                    data-testid="auto-pause-7d-threshold"
                  />
                  <p className="input-hint">{t('admin.accounts.autoPauseThresholdHint')}</p>
                </div>
              </div>
            ) : null}

            {account.platform === 'anthropic' && (account.type === 'oauth' || account.type === 'setup-token') ? (
              <div className="space-y-4 border-t border-gray-200 pt-4 dark:border-dark-600">
                <div className="mb-3">
                  <h3 className="input-label mb-0 text-base font-semibold">{t('admin.accounts.quotaControl.title')}</h3>
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{t('admin.accounts.quotaControl.hint')}</p>
                </div>
                <div className="rounded-lg border border-gray-200 p-4 dark:border-dark-600">
                  <SectionLabel
                    title={t('admin.accounts.quotaControl.windowCost.label')}
                    hint={t('admin.accounts.quotaControl.windowCost.hint')}
                    action={
                      <ToggleSwitch
                        enabled={quotaControl.windowCostEnabled}
                        onToggle={() => updateQuotaControl({ windowCostEnabled: !quotaControl.windowCostEnabled })}
                      />
                    }
                  />
                  {quotaControl.windowCostEnabled ? (
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="input-label">{t('admin.accounts.quotaControl.windowCost.limit')}</label>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 dark:text-gray-400">$</span>
                          <input
                            value={quotaControl.windowCostLimit ?? ''}
                            onChange={(e) =>
                              updateQuotaControl({
                                windowCostLimit: e.target.value === '' ? null : Number(e.target.value),
                              })
                            }
                            type="number"
                            min={0}
                            step={1}
                            className="input pl-7"
                            placeholder={t('admin.accounts.quotaControl.windowCost.limitPlaceholder')}
                          />
                        </div>
                        <p className="input-hint">{t('admin.accounts.quotaControl.windowCost.limitHint')}</p>
                      </div>
                      <div>
                        <label className="input-label">{t('admin.accounts.quotaControl.windowCost.stickyReserve')}</label>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 dark:text-gray-400">$</span>
                          <input
                            value={quotaControl.windowCostStickyReserve ?? ''}
                            onChange={(e) =>
                              updateQuotaControl({
                                windowCostStickyReserve: e.target.value === '' ? null : Number(e.target.value),
                              })
                            }
                            type="number"
                            min={0}
                            step={1}
                            className="input pl-7"
                            placeholder={t('admin.accounts.quotaControl.windowCost.stickyReservePlaceholder')}
                          />
                        </div>
                        <p className="input-hint">{t('admin.accounts.quotaControl.windowCost.stickyReserveHint')}</p>
                      </div>
                    </div>
                  ) : null}
                </div>
                <div className="rounded-lg border border-gray-200 p-4 dark:border-dark-600">
                  <SectionLabel
                    title={t('admin.accounts.quotaControl.sessionLimit.label')}
                    hint={t('admin.accounts.quotaControl.sessionLimit.hint')}
                    action={
                      <ToggleSwitch
                        enabled={quotaControl.sessionLimitEnabled}
                        onToggle={() => updateQuotaControl({ sessionLimitEnabled: !quotaControl.sessionLimitEnabled })}
                      />
                    }
                  />
                  {quotaControl.sessionLimitEnabled ? (
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="input-label">{t('admin.accounts.quotaControl.sessionLimit.maxSessions')}</label>
                        <input
                          value={quotaControl.maxSessions ?? ''}
                          onChange={(e) =>
                            updateQuotaControl({
                              maxSessions: e.target.value === '' ? null : Number(e.target.value),
                            })
                          }
                          type="number"
                          min={1}
                          step={1}
                          className="input"
                          placeholder={t('admin.accounts.quotaControl.sessionLimit.maxSessionsPlaceholder')}
                        />
                        <p className="input-hint">{t('admin.accounts.quotaControl.sessionLimit.maxSessionsHint')}</p>
                      </div>
                      <div>
                        <label className="input-label">{t('admin.accounts.quotaControl.sessionLimit.idleTimeout')}</label>
                        <div className="relative">
                          <input
                            value={quotaControl.sessionIdleTimeout ?? ''}
                            onChange={(e) =>
                              updateQuotaControl({
                                sessionIdleTimeout: e.target.value === '' ? null : Number(e.target.value),
                              })
                            }
                            type="number"
                            min={1}
                            step={1}
                            className="input pr-12"
                            placeholder={t('admin.accounts.quotaControl.sessionLimit.idleTimeoutPlaceholder')}
                          />
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 dark:text-gray-400">
                            {t('common.minutes')}
                          </span>
                        </div>
                        <p className="input-hint">{t('admin.accounts.quotaControl.sessionLimit.idleTimeoutHint')}</p>
                      </div>
                    </div>
                  ) : null}
                </div>
                <div className="rounded-lg border border-gray-200 p-4 dark:border-dark-600">
                  <SectionLabel
                    title={t('admin.accounts.quotaControl.rpmLimit.label')}
                    hint={t('admin.accounts.quotaControl.rpmLimit.hint')}
                    action={
                      <ToggleSwitch
                        enabled={quotaControl.rpmLimitEnabled}
                        onToggle={() => updateQuotaControl({ rpmLimitEnabled: !quotaControl.rpmLimitEnabled })}
                      />
                    }
                  />
                  {quotaControl.rpmLimitEnabled ? (
                    <div className="space-y-4">
                      <div>
                        <label className="input-label">{t('admin.accounts.quotaControl.rpmLimit.baseRpm')}</label>
                        <input
                          value={quotaControl.baseRpm ?? ''}
                          onChange={(e) =>
                            updateQuotaControl({ baseRpm: e.target.value === '' ? null : Number(e.target.value) })
                          }
                          type="number"
                          min={1}
                          max={1000}
                          step={1}
                          className="input"
                          placeholder={t('admin.accounts.quotaControl.rpmLimit.baseRpmPlaceholder')}
                        />
                        <p className="input-hint">{t('admin.accounts.quotaControl.rpmLimit.baseRpmHint')}</p>
                      </div>
                      <div>
                        <label className="input-label">{t('admin.accounts.quotaControl.rpmLimit.strategy')}</label>
                        <div className="flex gap-2">
                          {(['tiered', 'sticky_exempt'] as const).map((strategy) => (
                            <button
                              key={strategy}
                              type="button"
                              onClick={() => updateQuotaControl({ rpmStrategy: strategy })}
                              className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-all ${
                                quotaControl.rpmStrategy === strategy
                                  ? 'bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400'
                                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-dark-600 dark:text-gray-400 dark:hover:bg-dark-500'
                              }`}
                            >
                              <div className="text-center">
                                <div>
                                  {strategy === 'tiered'
                                    ? t('admin.accounts.quotaControl.rpmLimit.strategyTiered')
                                    : t('admin.accounts.quotaControl.rpmLimit.strategyStickyExempt')}
                                </div>
                                <div className="mt-0.5 text-[10px] opacity-70">
                                  {strategy === 'tiered'
                                    ? t('admin.accounts.quotaControl.rpmLimit.strategyTieredHint')
                                    : t('admin.accounts.quotaControl.rpmLimit.strategyStickyExemptHint')}
                                </div>
                              </div>
                            </button>
                          ))}
                        </div>
                      </div>
                      {quotaControl.rpmStrategy === 'tiered' ? (
                        <div>
                          <label className="input-label">{t('admin.accounts.quotaControl.rpmLimit.stickyBuffer')}</label>
                          <input
                            value={quotaControl.rpmStickyBuffer ?? ''}
                            onChange={(e) =>
                              updateQuotaControl({
                                rpmStickyBuffer: e.target.value === '' ? null : Number(e.target.value),
                              })
                            }
                            type="number"
                            min={1}
                            step={1}
                            className="input"
                            placeholder={t('admin.accounts.quotaControl.rpmLimit.stickyBufferPlaceholder')}
                          />
                          <p className="input-hint">{t('admin.accounts.quotaControl.rpmLimit.stickyBufferHint')}</p>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
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
                          onClick={() => updateQuotaControl({ userMsgQueueMode: opt.value })}
                          className={`rounded-md border px-3 py-1.5 text-sm transition-colors ${
                            quotaControl.userMsgQueueMode === opt.value
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
                <div className="rounded-lg border border-gray-200 p-4 dark:border-dark-600">
                  <SectionLabel
                    title={t('admin.accounts.quotaControl.tlsFingerprint.label')}
                    hint={t('admin.accounts.quotaControl.tlsFingerprint.hint')}
                    action={
                      <ToggleSwitch
                        enabled={quotaControl.tlsFingerprintEnabled}
                        onToggle={() => updateQuotaControl({ tlsFingerprintEnabled: !quotaControl.tlsFingerprintEnabled })}
                      />
                    }
                  />
                  {quotaControl.tlsFingerprintEnabled ? (
                    <select
                      value={quotaControl.tlsFingerprintProfileId ?? ''}
                      onChange={(e) =>
                        updateQuotaControl({
                          tlsFingerprintProfileId: e.target.value === '' ? null : Number(e.target.value),
                        })
                      }
                      className="input mt-3"
                    >
                      <option value="">{t('admin.accounts.quotaControl.tlsFingerprint.defaultProfile')}</option>
                      {tlsFingerprintProfiles.length > 0 ? (
                        <option value={-1}>{t('admin.accounts.quotaControl.tlsFingerprint.randomProfile')}</option>
                      ) : null}
                      {tlsFingerprintProfiles.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  ) : null}
                </div>
                <div className="rounded-lg border border-gray-200 p-4 dark:border-dark-600">
                  <SectionLabel
                    title={t('admin.accounts.quotaControl.sessionIdMasking.label')}
                    hint={t('admin.accounts.quotaControl.sessionIdMasking.hint')}
                    action={
                      <ToggleSwitch
                        enabled={quotaControl.sessionIdMaskingEnabled}
                        onToggle={() =>
                          updateQuotaControl({ sessionIdMaskingEnabled: !quotaControl.sessionIdMaskingEnabled })
                        }
                      />
                    }
                  />
                </div>
                <div className="rounded-lg border border-gray-200 p-4 dark:border-dark-600">
                  <SectionLabel
                    title={t('admin.accounts.quotaControl.cacheTTLOverride.label')}
                    hint={t('admin.accounts.quotaControl.cacheTTLOverride.hint')}
                    action={
                      <ToggleSwitch
                        enabled={quotaControl.cacheTTLOverrideEnabled}
                        onToggle={() =>
                          updateQuotaControl({ cacheTTLOverrideEnabled: !quotaControl.cacheTTLOverrideEnabled })
                        }
                      />
                    }
                  />
                  {quotaControl.cacheTTLOverrideEnabled ? (
                    <>
                      <label className="input-label mt-3 text-xs">
                        {t('admin.accounts.quotaControl.cacheTTLOverride.target')}
                      </label>
                      <select
                        value={quotaControl.cacheTTLOverrideTarget}
                        onChange={(e) => updateQuotaControl({ cacheTTLOverrideTarget: e.target.value })}
                        className="input mt-1"
                      >
                        <option value="5m">5m</option>
                        <option value="1h">1h</option>
                      </select>
                      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                        {t('admin.accounts.quotaControl.cacheTTLOverride.targetHint')}
                      </p>
                    </>
                  ) : null}
                </div>
                <div className="rounded-lg border border-gray-200 p-4 dark:border-dark-600">
                  <SectionLabel
                    title={t('admin.accounts.quotaControl.customBaseUrl.label')}
                    hint={t('admin.accounts.quotaControl.customBaseUrl.hint')}
                    action={
                      <ToggleSwitch
                        enabled={quotaControl.customBaseUrlEnabled}
                        onToggle={() => updateQuotaControl({ customBaseUrlEnabled: !quotaControl.customBaseUrlEnabled })}
                      />
                    }
                  />
                  {quotaControl.customBaseUrlEnabled ? (
                    <input
                      value={quotaControl.customBaseUrl}
                      onChange={(e) => updateQuotaControl({ customBaseUrl: e.target.value })}
                      type="text"
                      className="input mt-3"
                      placeholder={t('admin.accounts.quotaControl.customBaseUrl.urlHint')}
                    />
                  ) : null}
                </div>
              </div>
            ) : null}

            <div className="border-t border-gray-200 pt-4 dark:border-dark-600">
              <div>
                <label className="input-label">{t('common.status')}</label>
                <Select
                  modelValue={form.status}
                  options={statusOptions}
                  onUpdateModelValue={(value) =>
                    setForm((prev) => ({
                      ...prev,
                      status: value as 'active' | 'inactive' | 'error',
                    }))
                  }
                />
              </div>
              {account.platform === 'antigravity' ? (
                <>
                  <div className="mt-3 flex items-center gap-2">
                    <label className="flex cursor-not-allowed items-center gap-2 opacity-60">
                      <input
                        type="checkbox"
                        checked={mixedScheduling}
                        disabled
                        onChange={(e) => setMixedScheduling(e.target.checked)}
                        className="h-4 w-4 cursor-not-allowed rounded border-gray-300 text-primary-500 focus:ring-primary-500 dark:border-dark-500"
                      />
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                        {t('admin.accounts.mixedScheduling')}
                      </span>
                    </label>
                    <HelpTooltip text={t('admin.accounts.mixedSchedulingTooltip')} />
                  </div>
                  <div className="mt-3 flex items-center gap-2">
                    <label className="flex cursor-pointer items-center gap-2">
                      <input
                        type="checkbox"
                        checked={allowOverages}
                        onChange={(e) => setAllowOverages(e.target.checked)}
                        className="h-4 w-4 rounded border-gray-300 text-primary-500 focus:ring-primary-500 dark:border-dark-500"
                      />
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                        {t('admin.accounts.allowOverages')}
                      </span>
                    </label>
                    <HelpTooltip text={t('admin.accounts.allowOveragesTooltip')} />
                  </div>
                </>
              ) : null}
            </div>

            {!isSimpleMode ? (
              <GroupSelector
                modelValue={form.group_ids}
                groups={groups}
                platform={account.platform}
                mixedScheduling={mixedScheduling}
                onUpdateModelValue={(value) => setForm((prev) => ({ ...prev, group_ids: value }))}
                data-tour="account-form-groups"
              />
            ) : null}
          </form>
        ) : null}
      </BaseDialog>

      <ConfirmDialog
        show={showMixedChannelWarning}
        title={t('admin.accounts.mixedChannelWarningTitle')}
        message={mixedChannelWarningMessageText}
        confirmText={t('common.confirm')}
        cancelText={t('common.cancel')}
        danger
        onConfirm={() => void handleMixedChannelConfirm()}
        onCancel={clearMixedChannelDialog}
      />
    </>
  )
}
