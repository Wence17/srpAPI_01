'use client'

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type FormEvent,
} from 'react'
import { useI18n } from '@/lib/i18n'
import { useApp } from '@/context/AppContext'
import { useAuth } from '@/context/AuthContext'
import { adminAccountsAPI, type SyncUpstreamPreviewParams } from '@/lib/adminAccounts'
import { adminSettingsAPI } from '@/lib/adminSettings'
import { adminTlsFingerprintProfilesAPI } from '@/lib/adminTlsFingerprintProfiles'
import { extractApiErrorMessage } from '@/lib/apiError'
import { formatDateTimeLocalInput, parseDateTimeLocalInput } from '@/lib/format'
import { createStableObjectKeyResolver } from '@/lib/stableObjectKey'
import { VERTEX_LOCATION_OPTIONS } from '@/lib/constants/account'
import {
  OPENAI_WS_MODE_CTX_POOL,
  OPENAI_WS_MODE_OFF,
  OPENAI_WS_MODE_PASSTHROUGH,
  isOpenAIWSModeEnabled,
  resolveOpenAIWSModeConcurrencyHintKey,
  type OpenAIWSMode,
} from '@/lib/openaiWsMode'
import {
  buildModelMappingObject,
  claudeModels,
  commonErrorCodes,
  fetchAntigravityDefaultMappings,
  getModelsByPlatform,
  getPresetMappingsByPlatform,
} from '@/lib/useModelWhitelist'
import { useAccountOAuth, type AddMethod } from '@/hooks/useAccountOAuth'
import { useOpenAIOAuth } from '@/hooks/useOpenAIOAuth'
import { useGeminiOAuth } from '@/hooks/useGeminiOAuth'
import { useAntigravityOAuth } from '@/hooks/useAntigravityOAuth'
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
import OAuthAuthorizationFlow, {
  type OAuthAuthorizationFlowHandle,
} from '@/components/account/OAuthAuthorizationFlow'
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
  MAX_POOL_MODE_RETRY_COUNT,
  applyOpenAIEndpointCapabilities,
  buildTempUnschedRules,
  initialQuotaControlState,
  normalizeOpenAIEndpointCapabilities,
  normalizePoolModeRetryCount,
  parsePoolModeRetryStatusCodes,
  type ModelMapping,
  type QuotaControlState,
  type TempUnschedRuleForm,
} from '@/components/account/editAccountModalUtils'
import type { AdminGroup } from '@/lib/adminGroups'
import type {
  AccountPlatform,
  AccountType,
  CheckMixedChannelResponse,
  CodexSessionImportMessage,
  CreateAccountRequest,
  OpenAICompactMode,
  OpenAIEndpointCapability,
  OpenAIResponsesMode,
  Proxy,
} from '@/lib/types'

type AccountCategory = 'oauth-based' | 'apikey' | 'bedrock' | 'service_account'
type GeminiOAuthType = 'code_assist' | 'google_one' | 'ai_studio'
type AntigravityAccountType = 'oauth' | 'upstream'

interface CreateAccountModalProps {
  show: boolean
  proxies: Proxy[]
  groups: AdminGroup[]
  onClose: () => void
  onCreated: () => void
}

const OPENAI_MOBILE_RT_CLIENT_ID = 'app_LlGpXReQgckcGGUo2JrYvtJK'

const getModelMappingKey = createStableObjectKeyResolver<ModelMapping>('create-model-mapping')
const getOpenAICompactModelMappingKey = createStableObjectKeyResolver<ModelMapping>(
  'create-openai-compact-model-mapping',
)
const getAntigravityModelMappingKey = createStableObjectKeyResolver<ModelMapping>(
  'create-antigravity-model-mapping',
)
const getTempUnschedRuleKey = createStableObjectKeyResolver<TempUnschedRuleForm>('create-temp-unsched-rule')

const geminiQuotaDocs = {
  codeAssist: 'https://developers.google.com/gemini-code-assist/resources/quotas',
  aiStudio: 'https://ai.google.dev/pricing',
  vertex: 'https://cloud.google.com/vertex-ai/generative-ai/docs/quotas',
}

const geminiHelpLinks = {
  apiKey: 'https://aistudio.google.com/app/apikey',
  aiStudioPricing: 'https://ai.google.dev/pricing',
  gcpProject: 'https://console.cloud.google.com/welcome/new',
  geminiWebActivation: 'https://gemini.google.com/gems/create?hl=en-US&pli=1',
  countryCheck: 'https://policies.google.com/terms',
  countryChange: 'https://policies.google.com/country-association-form',
}

const BEDROCK_REGION_OPTIONS = [
  {
    label: 'US',
    options: [
      { value: 'us-east-1', label: 'us-east-1 (N. Virginia)' },
      { value: 'us-east-2', label: 'us-east-2 (Ohio)' },
      { value: 'us-west-1', label: 'us-west-1 (N. California)' },
      { value: 'us-west-2', label: 'us-west-2 (Oregon)' },
      { value: 'us-gov-east-1', label: 'us-gov-east-1 (GovCloud US-East)' },
      { value: 'us-gov-west-1', label: 'us-gov-west-1 (GovCloud US-West)' },
    ],
  },
  {
    label: 'Europe',
    options: [
      { value: 'eu-west-1', label: 'eu-west-1 (Ireland)' },
      { value: 'eu-west-2', label: 'eu-west-2 (London)' },
      { value: 'eu-west-3', label: 'eu-west-3 (Paris)' },
      { value: 'eu-central-1', label: 'eu-central-1 (Frankfurt)' },
      { value: 'eu-central-2', label: 'eu-central-2 (Zurich)' },
      { value: 'eu-south-1', label: 'eu-south-1 (Milan)' },
      { value: 'eu-south-2', label: 'eu-south-2 (Spain)' },
      { value: 'eu-north-1', label: 'eu-north-1 (Stockholm)' },
    ],
  },
  {
    label: 'Asia Pacific',
    options: [
      { value: 'ap-northeast-1', label: 'ap-northeast-1 (Tokyo)' },
      { value: 'ap-northeast-2', label: 'ap-northeast-2 (Seoul)' },
      { value: 'ap-northeast-3', label: 'ap-northeast-3 (Osaka)' },
      { value: 'ap-south-1', label: 'ap-south-1 (Mumbai)' },
      { value: 'ap-south-2', label: 'ap-south-2 (Hyderabad)' },
      { value: 'ap-southeast-1', label: 'ap-southeast-1 (Singapore)' },
      { value: 'ap-southeast-2', label: 'ap-southeast-2 (Sydney)' },
    ],
  },
  {
    label: 'Canada',
    options: [{ value: 'ca-central-1', label: 'ca-central-1 (Canada)' }],
  },
  {
    label: 'South America',
    options: [{ value: 'sa-east-1', label: 'sa-east-1 (São Paulo)' }],
  },
] as const

export default function CreateAccountModal({
  show,
  proxies,
  groups,
  onClose,
  onCreated,
}: CreateAccountModalProps) {
  const { t } = useI18n()
  const appStore = useApp()
  const { isSimpleMode } = useAuth()

  const claudeOAuth = useAccountOAuth()
  const openaiOAuth = useOpenAIOAuth()
  const geminiOAuth = useGeminiOAuth()
  const antigravityOAuth = useAntigravityOAuth()
  const oauthFlowRef = useRef<OAuthAuthorizationFlowHandle | null>(null)

  const [step, setStep] = useState(1)
  const [submitting, setSubmitting] = useState(false)
  const [accountCategory, setAccountCategory] = useState<AccountCategory>('oauth-based')
  const [addMethod, setAddMethod] = useState<AddMethod>('oauth')
  const [apiKeyBaseUrl, setApiKeyBaseUrl] = useState('https://api.anthropic.com')
  const [apiKeyValue, setApiKeyValue] = useState('')

  const [form, setForm] = useState({
    name: '',
    notes: '',
    platform: 'anthropic' as AccountPlatform,
    type: 'oauth' as AccountType,
    proxy_id: null as number | null,
    concurrency: 10,
    load_factor: null as number | null,
    priority: 1,
    rate_multiplier: 1,
    group_ids: [] as number[],
    expires_at: null as number | null,
  })

  const [editQuotaLimit, setEditQuotaLimit] = useState<number | null>(null)
  const [editQuotaDailyLimit, setEditQuotaDailyLimit] = useState<number | null>(null)
  const [editQuotaWeeklyLimit, setEditQuotaWeeklyLimit] = useState<number | null>(null)
  const [editDailyResetMode, setEditDailyResetMode] = useState<'rolling' | 'fixed' | null>(null)
  const [editDailyResetHour, setEditDailyResetHour] = useState<number | null>(null)
  const [editWeeklyResetMode, setEditWeeklyResetMode] = useState<'rolling' | 'fixed' | null>(null)
  const [editWeeklyResetDay, setEditWeeklyResetDay] = useState<number | null>(null)
  const [editWeeklyResetHour, setEditWeeklyResetHour] = useState<number | null>(null)
  const [editResetTimezone, setEditResetTimezone] = useState<string | null>(null)

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
  const [autoPauseOnExpired, setAutoPauseOnExpired] = useState(true)
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
  const [anthropicPassthroughEnabled, setAnthropicPassthroughEnabled] = useState(false)
  const [webSearchEmulationMode, setWebSearchEmulationMode] = useState('default')
  const [webSearchGlobalEnabled, setWebSearchGlobalEnabled] = useState(false)

  const [mixedScheduling, setMixedScheduling] = useState(false)
  const [allowOverages, setAllowOverages] = useState(false)
  const [antigravityAccountType, setAntigravityAccountType] = useState<AntigravityAccountType>('oauth')
  const [upstreamBaseUrl, setUpstreamBaseUrl] = useState('')
  const [upstreamApiKey, setUpstreamApiKey] = useState('')
  const [antigravityModelMappings, setAntigravityModelMappings] = useState<ModelMapping[]>([])

  const [bedrockAuthMode, setBedrockAuthMode] = useState<'sigv4' | 'apikey'>('sigv4')
  const [bedrockAccessKeyId, setBedrockAccessKeyId] = useState('')
  const [bedrockSecretAccessKey, setBedrockSecretAccessKey] = useState('')
  const [bedrockSessionToken, setBedrockSessionToken] = useState('')
  const [bedrockRegion, setBedrockRegion] = useState('us-east-1')
  const [bedrockForceGlobal, setBedrockForceGlobal] = useState(false)
  const [bedrockApiKeyValue, setBedrockApiKeyValue] = useState('')

  const vertexServiceAccountFileInputRef = useRef<HTMLInputElement | null>(null)
  const [vertexServiceAccountJson, setVertexServiceAccountJson] = useState('')
  const [vertexProjectId, setVertexProjectId] = useState('')
  const [vertexClientEmail, setVertexClientEmail] = useState('')
  const [vertexLocation, setVertexLocation] = useState('global')
  const [vertexServiceAccountDragActive, setVertexServiceAccountDragActive] = useState(false)

  const [tempUnschedEnabled, setTempUnschedEnabled] = useState(false)
  const [tempUnschedRules, setTempUnschedRules] = useState<TempUnschedRuleForm[]>([])

  const [geminiOAuthType, setGeminiOAuthType] = useState<GeminiOAuthType>('google_one')
  const [geminiAIStudioOAuthEnabled, setGeminiAIStudioOAuthEnabled] = useState(false)
  const [showAdvancedOAuth, setShowAdvancedOAuth] = useState(false)
  const [showGeminiHelpDialog, setShowGeminiHelpDialog] = useState(false)

  const [geminiTierGoogleOne, setGeminiTierGoogleOne] = useState<
    'google_one_free' | 'google_ai_pro' | 'google_ai_ultra'
  >('google_one_free')
  const [geminiTierGcp, setGeminiTierGcp] = useState<'gcp_standard' | 'gcp_enterprise'>('gcp_standard')
  const [geminiTierAIStudio, setGeminiTierAIStudio] = useState<'aistudio_free' | 'aistudio_paid'>('aistudio_free')

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

  const {
    globalEnabled: quotaNotifyGlobalEnabled,
    state: quotaNotifyState,
    setState: setQuotaNotifyState,
    loadGlobalState: loadQuotaNotifyGlobal,
    writeToExtra: writeQuotaNotifyToExtra,
    reset: resetQuotaNotify,
  } = useQuotaNotifyState()

  const oauthStepTitle = useMemo(() => {
    if (form.platform === 'openai') return t('admin.accounts.oauth.openai.title')
    if (form.platform === 'gemini') return t('admin.accounts.oauth.gemini.title')
    if (form.platform === 'antigravity') return t('admin.accounts.oauth.antigravity.title')
    return t('admin.accounts.oauth.title')
  }, [form.platform, t])

  const baseUrlHint = useMemo(() => {
    if (form.platform === 'openai') return t('admin.accounts.openai.baseUrlHint')
    if (form.platform === 'gemini') return t('admin.accounts.gemini.baseUrlHint')
    return t('admin.accounts.baseUrlHint')
  }, [form.platform, t])

  const apiKeyHint = useMemo(() => {
    if (form.platform === 'openai') return t('admin.accounts.openai.apiKeyHint')
    if (form.platform === 'gemini') return t('admin.accounts.gemini.apiKeyHint')
    return t('admin.accounts.apiKeyHint')
  }, [form.platform, t])

  const presetMappings = useMemo(() => getPresetMappingsByPlatform(form.platform), [form.platform])
  const antigravityPresetMappings = useMemo(() => getPresetMappingsByPlatform('antigravity'), [])
  const bedrockPresets = useMemo(() => getPresetMappingsByPlatform('bedrock'), [])

  const geminiSelectedTier = useMemo(() => {
    if (form.platform !== 'gemini') return ''
    if (accountCategory === 'apikey') return geminiTierAIStudio
    switch (geminiOAuthType) {
      case 'google_one':
        return geminiTierGoogleOne
      case 'code_assist':
        return geminiTierGcp
      default:
        return geminiTierAIStudio
    }
  }, [accountCategory, form.platform, geminiOAuthType, geminiTierAIStudio, geminiTierGcp, geminiTierGoogleOne])

  const openaiResponsesWebSocketV2Mode =
    form.platform === 'openai' && accountCategory === 'apikey'
      ? openaiAPIKeyResponsesWebSocketV2Mode
      : openaiOAuthResponsesWebSocketV2Mode
  const setOpenaiResponsesWebSocketV2Mode = (mode: OpenAIWSMode) => {
    if (form.platform === 'openai' && accountCategory === 'apikey') {
      setOpenaiAPIKeyResponsesWebSocketV2Mode(mode)
    } else {
      setOpenaiOAuthResponsesWebSocketV2Mode(mode)
    }
  }

  const openAIWSModeConcurrencyHintKey = resolveOpenAIWSModeConcurrencyHintKey(openaiResponsesWebSocketV2Mode)
  const isOpenAIModelRestrictionDisabled = form.platform === 'openai' && openaiPassthroughEnabled
  const openAITextGenerationCapabilityEnabled = openAIEndpointCapabilities.includes('chat_completions')

  const isOAuthFlow =
    !(form.platform === 'antigravity' && antigravityAccountType === 'upstream') &&
    !(form.platform === 'anthropic' && accountCategory === 'bedrock') &&
    accountCategory === 'oauth-based'

  const currentAuthUrl =
    form.platform === 'openai'
      ? openaiOAuth.authUrl
      : form.platform === 'gemini'
        ? geminiOAuth.authUrl
        : form.platform === 'antigravity'
          ? antigravityOAuth.authUrl
          : claudeOAuth.authUrl

  const currentSessionId =
    form.platform === 'openai'
      ? openaiOAuth.sessionId
      : form.platform === 'gemini'
        ? geminiOAuth.sessionId
        : form.platform === 'antigravity'
          ? antigravityOAuth.sessionId
          : claudeOAuth.sessionId

  const currentOAuthLoading =
    form.platform === 'openai'
      ? openaiOAuth.loading
      : form.platform === 'gemini'
        ? geminiOAuth.loading
        : form.platform === 'antigravity'
          ? antigravityOAuth.loading
          : claudeOAuth.loading

  const currentOAuthError =
    form.platform === 'openai'
      ? openaiOAuth.error
      : form.platform === 'gemini'
        ? geminiOAuth.error
        : form.platform === 'antigravity'
          ? antigravityOAuth.error
          : claudeOAuth.error

  const isManualInputMethod = oauthFlowRef.current?.inputMethod === 'manual'

  const canExchangeCode = (() => {
    const authCode = oauthFlowRef.current?.authCode || ''
    if (form.platform === 'openai') {
      return Boolean(authCode.trim() && openaiOAuth.sessionId && !openaiOAuth.loading)
    }
    if (form.platform === 'gemini') {
      return Boolean(authCode.trim() && geminiOAuth.sessionId && !geminiOAuth.loading)
    }
    if (form.platform === 'antigravity') {
      return Boolean(authCode.trim() && antigravityOAuth.sessionId && !antigravityOAuth.loading)
    }
    return Boolean(authCode.trim() && claudeOAuth.sessionId && !claudeOAuth.loading)
  })()

  const mixedChannelWarningMessageText = mixedChannelWarningDetails
    ? t('admin.accounts.mixedChannelWarning', mixedChannelWarningDetails)
    : mixedChannelWarningRawMessage

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
    return t('admin.accounts.openai.capabilityTextAuto')
  }, [openAIResponsesMode, t])

  const openAIEndpointCapabilityOptions = useMemo(
    () =>
      [
        { value: 'chat_completions' as const, label: openAITextEndpointCapabilityLabel },
        { value: 'embeddings' as const, label: t('admin.accounts.openai.capabilityEmbeddings') },
      ] satisfies Array<{ value: OpenAIEndpointCapability; label: string }>,
    [openAITextEndpointCapabilityLabel, t],
  )

  const openAIWSModeOptions = useMemo(
    () => [
      { value: OPENAI_WS_MODE_OFF, label: t('admin.accounts.openai.wsModeOff') },
      { value: OPENAI_WS_MODE_CTX_POOL, label: t('admin.accounts.openai.wsModeCtxPool') },
      { value: OPENAI_WS_MODE_PASSTHROUGH, label: t('admin.accounts.openai.wsModePassthrough') },
    ],
    [t],
  )

  const umqModeOptions = useMemo(
    () => [
      { value: '', label: t('admin.accounts.quotaControl.rpmLimit.umqModeOff') },
      { value: 'throttle', label: t('admin.accounts.quotaControl.rpmLimit.umqModeThrottle') },
      { value: 'serialize', label: t('admin.accounts.quotaControl.rpmLimit.umqModeSerialize') },
    ],
    [t],
  )

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

  const expiresAtInput = formatDateTimeLocalInput(form.expires_at)

  const syncPreviewCredentials = useMemo((): SyncUpstreamPreviewParams | undefined => {
    if (!apiKeyValue) return undefined
    return {
      platform: form.platform,
      type: form.type,
      base_url: apiKeyBaseUrl || undefined,
      api_key: apiKeyValue,
    }
  }, [apiKeyBaseUrl, apiKeyValue, form.platform, form.type])

  const updateQuotaControl = (patch: Partial<QuotaControlState>) => {
    setQuotaControl((prev) => ({ ...prev, ...patch }))
  }

  const toggleOpenAIEndpointCapability = (capability: OpenAIEndpointCapability, checked: boolean) => {
    if (checked) {
      setOpenAIEndpointCapabilities((prev) => normalizeOpenAIEndpointCapabilities([...prev, capability]))
      return
    }
    setOpenAIEndpointCapabilities((prev) => {
      if (prev.length <= 1) return prev
      const next = prev.filter((value) => value !== capability)
      if (!next.includes('chat_completions')) setOpenAIResponsesMode('auto')
      return next
    })
  }

  const buildOpenAICompactModelMapping = () =>
    buildModelMappingObject('mapping', [], openAICompactModelMappings)

  const buildAntigravityExtra = (): Record<string, unknown> | undefined => {
    const extra: Record<string, unknown> = {}
    if (mixedScheduling) extra.mixed_scheduling = true
    if (allowOverages) extra.allow_overages = true
    return Object.keys(extra).length > 0 ? extra : undefined
  }

  const buildOpenAIExtra = (base?: Record<string, unknown>): Record<string, unknown> | undefined => {
    if (form.platform !== 'openai') return base

    const extra: Record<string, unknown> = { ...(base || {}) }
    if (accountCategory === 'oauth-based') {
      extra.openai_oauth_responses_websockets_v2_mode = openaiOAuthResponsesWebSocketV2Mode
      extra.openai_oauth_responses_websockets_v2_enabled = isOpenAIWSModeEnabled(openaiOAuthResponsesWebSocketV2Mode)
    } else if (accountCategory === 'apikey') {
      extra.openai_apikey_responses_websockets_v2_mode = openaiAPIKeyResponsesWebSocketV2Mode
      extra.openai_apikey_responses_websockets_v2_enabled = isOpenAIWSModeEnabled(openaiAPIKeyResponsesWebSocketV2Mode)
    }
    delete extra.responses_websockets_v2_enabled
    delete extra.openai_ws_enabled
    if (openaiPassthroughEnabled) extra.openai_passthrough = true
    else {
      delete extra.openai_passthrough
      delete extra.openai_oauth_passthrough
    }
    if (accountCategory === 'oauth-based' && codexCLIOnlyEnabled) extra.codex_cli_only = true
    else delete extra.codex_cli_only
    if (accountCategory === 'oauth-based' && codexCLIOnlyEnabled && codexCLIOnlyAllowClaudeCodeEnabled) {
      extra.codex_cli_only_allowed_clients = ['claude_code']
    } else delete extra.codex_cli_only_allowed_clients
    if (openAICompactMode !== 'auto') extra.openai_compact_mode = openAICompactMode
    else delete extra.openai_compact_mode
    if (
      accountCategory === 'apikey' &&
      openAITextGenerationCapabilityEnabled &&
      openAIResponsesMode !== 'auto'
    ) {
      extra.openai_responses_mode = openAIResponsesMode
    } else delete extra.openai_responses_mode
    return Object.keys(extra).length > 0 ? extra : undefined
  }

  const buildAnthropicExtra = (base?: Record<string, unknown>): Record<string, unknown> | undefined => {
    if (form.platform !== 'anthropic' || accountCategory !== 'apikey') return base
    const extra: Record<string, unknown> = { ...(base || {}) }
    if (anthropicPassthroughEnabled) extra.anthropic_passthrough = true
    else delete extra.anthropic_passthrough
    if (webSearchEmulationMode === 'default') delete extra.web_search_emulation
    else extra.web_search_emulation = webSearchEmulationMode
    return Object.keys(extra).length > 0 ? extra : undefined
  }

  const buildAnthropicQuotaExtra = (baseExtra: Record<string, unknown> = {}): Record<string, unknown> => {
    const extra: Record<string, unknown> = { ...baseExtra }
    if (quotaControl.windowCostEnabled && quotaControl.windowCostLimit != null && quotaControl.windowCostLimit > 0) {
      extra.window_cost_limit = quotaControl.windowCostLimit
      extra.window_cost_sticky_reserve = quotaControl.windowCostStickyReserve ?? 10
    }
    if (quotaControl.sessionLimitEnabled && quotaControl.maxSessions != null && quotaControl.maxSessions > 0) {
      extra.max_sessions = quotaControl.maxSessions
      extra.session_idle_timeout_minutes = quotaControl.sessionIdleTimeout ?? 5
    }
    if (quotaControl.rpmLimitEnabled) {
      extra.base_rpm = quotaControl.baseRpm != null && quotaControl.baseRpm > 0 ? quotaControl.baseRpm : 15
      extra.rpm_strategy = quotaControl.rpmStrategy
      if (quotaControl.rpmStickyBuffer != null && quotaControl.rpmStickyBuffer > 0) {
        extra.rpm_sticky_buffer = quotaControl.rpmStickyBuffer
      }
    }
    if (quotaControl.userMsgQueueMode) extra.user_msg_queue_mode = quotaControl.userMsgQueueMode
    if (quotaControl.tlsFingerprintEnabled) {
      extra.enable_tls_fingerprint = true
      if (quotaControl.tlsFingerprintProfileId) {
        extra.tls_fingerprint_profile_id = quotaControl.tlsFingerprintProfileId
      }
    }
    if (quotaControl.sessionIdMaskingEnabled) extra.session_id_masking_enabled = true
    if (quotaControl.cacheTTLOverrideEnabled) {
      extra.cache_ttl_override_enabled = true
      extra.cache_ttl_override_target = quotaControl.cacheTTLOverrideTarget
    }
    if (quotaControl.customBaseUrlEnabled && quotaControl.customBaseUrl.trim()) {
      extra.custom_base_url_enabled = true
      extra.custom_base_url = quotaControl.customBaseUrl.trim()
    }
    return extra
  }

  const applyTempUnschedConfig = (credentials: Record<string, unknown>): boolean => {
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

  const needsMixedChannelCheck = (platform: AccountPlatform) =>
    platform === 'antigravity' || platform === 'anthropic'

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
    setMixedChannelWarningRawMessage(opts.message || opts.response?.message || t('admin.accounts.failedToCreate'))
    setMixedChannelWarningAction(() => opts.onConfirm)
    setShowMixedChannelWarning(true)
  }

  const withAntigravityConfirmFlag = (payload: CreateAccountRequest): CreateAccountRequest => {
    if (needsMixedChannelCheck(payload.platform) && antigravityMixedChannelConfirmed) {
      return { ...payload, confirm_mixed_channel_risk: true }
    }
    const cloned = { ...payload }
    delete cloned.confirm_mixed_channel_risk
    return cloned
  }

  const addModelMapping = () => setModelMappings((prev) => [...prev, { from: '', to: '' }])
  const removeModelMapping = (index: number) => setModelMappings((prev) => prev.filter((_, i) => i !== index))
  const addOpenAICompactModelMapping = () =>
    setOpenAICompactModelMappings((prev) => [...prev, { from: '', to: '' }])
  const removeOpenAICompactModelMapping = (index: number) =>
    setOpenAICompactModelMappings((prev) => prev.filter((_, i) => i !== index))
  const addAntigravityModelMapping = () =>
    setAntigravityModelMappings((prev) => [...prev, { from: '', to: '' }])
  const removeAntigravityModelMapping = (index: number) =>
    setAntigravityModelMappings((prev) => prev.filter((_, i) => i !== index))

  const addPresetMapping = (from: string, to: string) => {
    if (modelMappings.some((m) => m.from === from)) {
      appStore.showInfo(t('admin.accounts.mappingExists', { model: from }))
      return
    }
    setModelMappings((prev) => [...prev, { from, to }])
  }

  const addAntigravityPresetMapping = (from: string, to: string) => {
    if (antigravityModelMappings.some((m) => m.from === from)) {
      appStore.showInfo(t('admin.accounts.mappingExists', { model: from }))
      return
    }
    setAntigravityModelMappings((prev) => [...prev, { from, to }])
  }

  const toggleErrorCode = (code: number) => {
    setSelectedErrorCodes((prev) => {
      const index = prev.indexOf(code)
      if (index === -1) {
        if (code === 429 && !window.confirm(t('admin.accounts.customErrorCodes429Warning'))) return prev
        if (code === 529 && !window.confirm(t('admin.accounts.customErrorCodes529Warning'))) return prev
        return [...prev, code]
      }
      return prev.filter((c) => c !== code)
    })
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
    if (code === 429 && !window.confirm(t('admin.accounts.customErrorCodes429Warning'))) return
    if (code === 529 && !window.confirm(t('admin.accounts.customErrorCodes529Warning'))) return
    setSelectedErrorCodes((prev) => [...prev, code])
    setCustomErrorCodeInput(null)
  }

  const removeErrorCode = (code: number) => {
    setSelectedErrorCodes((prev) => prev.filter((c) => c !== code))
  }

  const handleValidateSessionToken = (_sessionToken: string) => {
    // Session token validation removed
  }

  const addTempUnschedRule = (preset?: TempUnschedRuleForm) => {
    if (preset) {
      setTempUnschedRules((prev) => [...prev, { ...preset }])
      return
    }
    setTempUnschedRules((prev) => [
      ...prev,
      { error_code: null, keywords: '', duration_minutes: 30, description: '' },
    ])
  }

  const moveTempUnschedRule = (index: number, direction: number) => {
    setTempUnschedRules((prev) => {
      const target = index + direction
      if (target < 0 || target >= prev.length) return prev
      const next = [...prev]
      ;[next[index], next[target]] = [next[target], next[index]]
      return next
    })
  }

  const handleSelectGeminiOAuthType = (oauthType: GeminiOAuthType) => {
    if (oauthType === 'ai_studio' && !geminiAIStudioOAuthEnabled) {
      appStore.showError(t('admin.accounts.oauth.gemini.aiStudioNotConfigured'))
      return
    }
    setGeminiOAuthType(oauthType)
  }

  const applyVertexServiceAccountJson = (value: string): boolean => {
    const raw = value.trim()
    if (!raw) {
      setVertexProjectId('')
      setVertexClientEmail('')
      return false
    }
    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>
      const projectId = typeof parsed.project_id === 'string' ? parsed.project_id.trim() : ''
      const clientEmail = typeof parsed.client_email === 'string' ? parsed.client_email.trim() : ''
      const privateKey = typeof parsed.private_key === 'string' ? parsed.private_key.trim() : ''
      if (!projectId || !clientEmail || !privateKey) {
        appStore.showError(t('admin.accounts.vertexSaJsonMissingFields'))
        return false
      }
      setVertexProjectId(projectId)
      setVertexClientEmail(clientEmail)
      setVertexServiceAccountJson(JSON.stringify(parsed))
      return true
    } catch {
      appStore.showError(t('admin.accounts.vertexSaJsonInvalid'))
      return false
    }
  }

  const parseVertexServiceAccountJson = () => applyVertexServiceAccountJson(vertexServiceAccountJson)

  const handleVertexServiceAccountFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    try {
      applyVertexServiceAccountJson(await file.text())
    } finally {
      event.target.value = ''
    }
  }

  const handleVertexServiceAccountDrop = async (event: React.DragEvent) => {
    event.preventDefault()
    setVertexServiceAccountDragActive(false)
    const file = event.dataTransfer?.files?.[0]
    if (!file) return
    applyVertexServiceAccountJson(await file.text())
  }

  const resetForm = useCallback(() => {
    setStep(1)
    setForm({
      name: '',
      notes: '',
      platform: 'anthropic',
      type: 'oauth',
      proxy_id: null,
      concurrency: 10,
      load_factor: null,
      priority: 1,
      rate_multiplier: 1,
      group_ids: [],
      expires_at: null,
    })
    setAccountCategory('oauth-based')
    setAddMethod('oauth')
    setApiKeyBaseUrl('https://api.anthropic.com')
    setApiKeyValue('')
    setEditQuotaLimit(null)
    setEditQuotaDailyLimit(null)
    setEditQuotaWeeklyLimit(null)
    setEditDailyResetMode(null)
    setEditDailyResetHour(null)
    setEditWeeklyResetMode(null)
    setEditWeeklyResetDay(null)
    setEditWeeklyResetHour(null)
    setEditResetTimezone(null)
    setModelMappings([])
    setOpenAICompactModelMappings([])
    setModelRestrictionMode('whitelist')
    setAllowedModels([...claudeModels])
    setAntigravityModelMappings([])
    void fetchAntigravityDefaultMappings().then((mappings) => setAntigravityModelMappings([...mappings]))
    setPoolModeEnabled(false)
    setPoolModeRetryCount(DEFAULT_POOL_MODE_RETRY_COUNT)
    setPoolModeRetryStatusCodesInput('')
    setCustomErrorCodesEnabled(false)
    setSelectedErrorCodes([])
    setCustomErrorCodeInput(null)
    setInterceptWarmupRequests(false)
    setAutoPauseOnExpired(true)
    setOpenaiPassthroughEnabled(false)
    setOpenAICompactMode('auto')
    setOpenAIResponsesMode('auto')
    setOpenAIEndpointCapabilities(['chat_completions', 'embeddings'])
    setOpenaiOAuthResponsesWebSocketV2Mode(OPENAI_WS_MODE_OFF)
    setOpenaiAPIKeyResponsesWebSocketV2Mode(OPENAI_WS_MODE_OFF)
    setCodexCLIOnlyEnabled(false)
    setCodexCLIOnlyAllowClaudeCodeEnabled(false)
    setAnthropicPassthroughEnabled(false)
    setWebSearchEmulationMode('default')
    setQuotaControl(initialQuotaControlState())
    setMixedScheduling(false)
    setAllowOverages(false)
    setAntigravityAccountType('oauth')
    setUpstreamBaseUrl('')
    setUpstreamApiKey('')
    setVertexServiceAccountJson('')
    setVertexProjectId('')
    setVertexClientEmail('')
    setVertexLocation('global')
    setTempUnschedEnabled(false)
    setTempUnschedRules([])
    setGeminiOAuthType('google_one')
    setGeminiTierGoogleOne('google_one_free')
    setGeminiTierGcp('gcp_standard')
    setGeminiTierAIStudio('aistudio_free')
    setBedrockAccessKeyId('')
    setBedrockSecretAccessKey('')
    setBedrockSessionToken('')
    setBedrockRegion('us-east-1')
    setBedrockForceGlobal(false)
    setBedrockAuthMode('sigv4')
    setBedrockApiKeyValue('')
    claudeOAuth.resetState()
    openaiOAuth.resetState()
    geminiOAuth.resetState()
    antigravityOAuth.resetState()
    oauthFlowRef.current?.reset()
    setAntigravityMixedChannelConfirmed(false)
    clearMixedChannelDialog()
    resetQuotaNotify()
  }, [claudeOAuth, geminiOAuth, antigravityOAuth, openaiOAuth, resetQuotaNotify])

  const handleClose = () => {
    setAntigravityMixedChannelConfirmed(false)
    clearMixedChannelDialog()
    onClose()
  }

  const submitCreateAccount = async (payload: CreateAccountRequest) => {
    setSubmitting(true)
    try {
      await adminAccountsAPI.create(withAntigravityConfirmFlag(payload))
      appStore.showSuccess(t('admin.accounts.accountCreated'))
      onCreated()
      handleClose()
    } catch (error: unknown) {
      const err = error as { response?: { status?: number; data?: { error?: string; message?: string; detail?: string } } }
      if (
        err.response?.status === 409 &&
        err.response?.data?.error === 'mixed_channel_warning' &&
        needsMixedChannelCheck(form.platform)
      ) {
        openMixedChannelDialog({
          message: err.response?.data?.message,
          onConfirm: async () => {
            setAntigravityMixedChannelConfirmed(true)
            await submitCreateAccount(payload)
          },
        })
        return
      }
      appStore.showError(
        extractApiErrorMessage(error, t('admin.accounts.failedToCreate')),
      )
    } finally {
      setSubmitting(false)
    }
  }

  const ensureAntigravityMixedChannelConfirmed = async (onConfirm: () => Promise<void>): Promise<boolean> => {
    if (!needsMixedChannelCheck(form.platform)) return true
    if (antigravityMixedChannelConfirmed) return true
    try {
      const result = await adminAccountsAPI.checkMixedChannelRisk({
        platform: form.platform,
        group_ids: form.group_ids,
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
      appStore.showError(extractApiErrorMessage(error, t('admin.accounts.failedToCreate')))
      return false
    }
  }

  const doCreateAccount = async (payload: CreateAccountRequest) => {
    const canContinue = await ensureAntigravityMixedChannelConfirmed(async () => {
      await submitCreateAccount(payload)
    })
    if (!canContinue) return
    await submitCreateAccount(payload)
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

  const createAccountAndFinish = async (
    platform: AccountPlatform,
    type: AccountType,
    credentials: Record<string, unknown>,
    extra?: Record<string, unknown>,
  ) => {
    if (!applyTempUnschedConfig(credentials)) return
    let finalExtra = extra
    if (type === 'apikey' || type === 'bedrock') {
      const quotaExtra: Record<string, unknown> = { ...(extra || {}) }
      if (editQuotaLimit != null && editQuotaLimit > 0) quotaExtra.quota_limit = editQuotaLimit
      if (editQuotaDailyLimit != null && editQuotaDailyLimit > 0) quotaExtra.quota_daily_limit = editQuotaDailyLimit
      if (editQuotaWeeklyLimit != null && editQuotaWeeklyLimit > 0) quotaExtra.quota_weekly_limit = editQuotaWeeklyLimit
      if (editDailyResetMode === 'fixed') {
        quotaExtra.quota_daily_reset_mode = 'fixed'
        quotaExtra.quota_daily_reset_hour = editDailyResetHour ?? 0
      }
      if (editWeeklyResetMode === 'fixed') {
        quotaExtra.quota_weekly_reset_mode = 'fixed'
        quotaExtra.quota_weekly_reset_day = editWeeklyResetDay ?? 1
        quotaExtra.quota_weekly_reset_hour = editWeeklyResetHour ?? 0
      }
      if (editDailyResetMode === 'fixed' || editWeeklyResetMode === 'fixed') {
        quotaExtra.quota_reset_timezone = editResetTimezone || 'UTC'
      }
      writeQuotaNotifyToExtra(quotaExtra, 'create')
      if (Object.keys(quotaExtra).length > 0) finalExtra = quotaExtra
    }
    if (platform === 'openai') {
      if (type === 'apikey') applyOpenAIEndpointCapabilities(credentials, openAIEndpointCapabilities)
      const compactModelMapping = buildOpenAICompactModelMapping()
      if (compactModelMapping) credentials.compact_model_mapping = compactModelMapping
      else delete credentials.compact_model_mapping
    }
    await doCreateAccount({
      name: form.name,
      notes: form.notes,
      platform,
      type,
      credentials,
      extra: finalExtra,
      proxy_id: form.proxy_id,
      concurrency: form.concurrency,
      load_factor: form.load_factor ?? undefined,
      priority: form.priority,
      rate_multiplier: form.rate_multiplier,
      group_ids: form.group_ids,
      expires_at: form.expires_at,
      auto_pause_on_expired: autoPauseOnExpired,
    })
  }

  const goBackToBasicInfo = () => {
    setStep(1)
    claudeOAuth.resetState()
    openaiOAuth.resetState()
    geminiOAuth.resetState()
    antigravityOAuth.resetState()
    oauthFlowRef.current?.reset()
  }

  const handleGenerateUrl = async () => {
    if (form.platform === 'openai') {
      await openaiOAuth.generateAuthUrl(form.proxy_id)
    } else if (form.platform === 'gemini') {
      await geminiOAuth.generateAuthUrl(
        form.proxy_id,
        oauthFlowRef.current?.projectId,
        geminiOAuthType,
        geminiSelectedTier,
      )
    } else if (form.platform === 'antigravity') {
      await antigravityOAuth.generateAuthUrl(form.proxy_id)
    } else {
      await claudeOAuth.generateAuthUrl(addMethod, form.proxy_id)
    }
  }

  const formatCodexImportMessages = (messages?: CodexSessionImportMessage[]) =>
    (messages || [])
      .map((item) => {
        const name = item.name ? ` ${item.name}` : ''
        return `#${item.index}${name}: ${item.message}`
      })
      .join('\n')

  const buildOpenAICodexImportCredentialExtras = (): Record<string, unknown> | null => {
    const credentials: Record<string, unknown> = {}
    if (!isOpenAIModelRestrictionDisabled) {
      const modelMapping = buildModelMappingObject(modelRestrictionMode, allowedModels, modelMappings)
      if (modelMapping) credentials.model_mapping = modelMapping
    }
    const compactModelMapping = buildOpenAICompactModelMapping()
    if (compactModelMapping) credentials.compact_model_mapping = compactModelMapping
    if (!applyTempUnschedConfig(credentials)) return null
    return credentials
  }

  const handleOpenAIImportCodexSession = async (content: string) => {
    const trimmed = content.trim()
    if (!trimmed) {
      appStore.showError(t('admin.accounts.oauth.openai.codexSessionEmpty'))
      return
    }
    const credentialExtras = buildOpenAICodexImportCredentialExtras()
    if (credentialExtras === null) return
    try {
      const extra = buildOpenAIExtra()
      const result = await adminAccountsAPI.importCodexSession({
        content: trimmed,
        name: form.name,
        notes: form.notes || null,
        proxy_id: form.proxy_id,
        concurrency: form.concurrency,
        load_factor: form.load_factor ?? undefined,
        priority: form.priority,
        rate_multiplier: form.rate_multiplier,
        group_ids: form.group_ids,
        expires_at: form.expires_at,
        auto_pause_on_expired: autoPauseOnExpired,
        credential_extras: Object.keys(credentialExtras).length > 0 ? credentialExtras : undefined,
        extra,
        update_existing: true,
      })
      const successCount = result.created + result.updated
      const params = {
        created: result.created,
        updated: result.updated,
        skipped: result.skipped,
        failed: result.failed,
      }
      if (successCount > 0 && result.failed === 0) {
        appStore.showSuccess(t('admin.accounts.oauth.openai.codexSessionImportSuccess', params))
        onCreated()
        handleClose()
        return
      }
      const errorText = formatCodexImportMessages(result.errors)
      const warningText = formatCodexImportMessages(result.warnings)
      if (result.failed === 0) {
        appStore.showWarning(t('admin.accounts.oauth.openai.codexSessionImportSuccess', params))
        return
      }
      if (successCount > 0) {
        appStore.showWarning(t('admin.accounts.oauth.openai.codexSessionImportPartial', params))
        onCreated()
        return
      }
      appStore.showError(t('admin.accounts.oauth.openai.codexSessionImportFailed'))
    } catch (error: unknown) {
      appStore.showError(extractApiErrorMessage(error, t('admin.accounts.oauth.openai.codexSessionImportFailed')))
    }
  }

  const handleOpenAIBatchRT = async (refreshTokenInput: string, clientId?: string) => {
    if (!refreshTokenInput.trim()) return
    const refreshTokens = refreshTokenInput
      .split('\n')
      .map((rt) => rt.trim())
      .filter(Boolean)
    if (refreshTokens.length === 0) {
      appStore.showError(t('admin.accounts.oauth.openai.pleaseEnterRefreshToken'))
      return
    }
    let successCount = 0
    let failedCount = 0
    const errors: string[] = []
    try {
      for (let i = 0; i < refreshTokens.length; i++) {
        try {
          const tokenInfo = await openaiOAuth.validateRefreshToken(refreshTokens[i], form.proxy_id, clientId)
          if (!tokenInfo) {
            failedCount++
            errors.push(`#${i + 1}: ${openaiOAuth.error || 'Validation failed'}`)
            continue
          }
          const credentials = openaiOAuth.buildCredentials(tokenInfo)
          if (clientId) credentials.client_id = clientId
          const extra = buildOpenAIExtra(openaiOAuth.buildExtraInfo(tokenInfo) as Record<string, unknown>)
          if (!isOpenAIModelRestrictionDisabled) {
            const modelMapping = buildModelMappingObject(modelRestrictionMode, allowedModels, modelMappings)
            if (modelMapping) credentials.model_mapping = modelMapping
          }
          const compactModelMapping = buildOpenAICompactModelMapping()
          if (compactModelMapping) credentials.compact_model_mapping = compactModelMapping
          const baseName = form.name || tokenInfo.email || 'OpenAI OAuth Account'
          const accountName = refreshTokens.length > 1 ? `${baseName} #${i + 1}` : baseName
          await adminAccountsAPI.create({
            name: accountName,
            notes: form.notes,
            platform: 'openai',
            type: 'oauth',
            credentials,
            extra,
            proxy_id: form.proxy_id,
            concurrency: form.concurrency,
            load_factor: form.load_factor ?? undefined,
            priority: form.priority,
            rate_multiplier: form.rate_multiplier,
            group_ids: form.group_ids,
            expires_at: form.expires_at,
            auto_pause_on_expired: autoPauseOnExpired,
          })
          successCount++
        } catch (error: unknown) {
          failedCount++
          errors.push(`#${i + 1}: ${extractApiErrorMessage(error, 'Unknown error')}`)
        }
      }
      if (successCount > 0 && failedCount === 0) {
        appStore.showSuccess(
          refreshTokens.length > 1
            ? t('admin.accounts.oauth.batchSuccess', { count: successCount })
            : t('admin.accounts.accountCreated'),
        )
        onCreated()
        handleClose()
      } else if (successCount > 0) {
        appStore.showWarning(t('admin.accounts.oauth.batchPartialSuccess', { success: successCount, failed: failedCount }))
        onCreated()
      } else {
        appStore.showError(t('admin.accounts.oauth.batchFailed'))
      }
    } catch {
      appStore.showError(t('admin.accounts.oauth.batchFailed'))
    }
  }

  const handleOpenAIValidateRT = (rt: string) => void handleOpenAIBatchRT(rt)
  const handleOpenAIValidateMobileRT = (rt: string) => void handleOpenAIBatchRT(rt, OPENAI_MOBILE_RT_CLIENT_ID)

  const handleAntigravityValidateRT = async (refreshTokenInput: string) => {
    if (!refreshTokenInput.trim()) return
    const refreshTokens = refreshTokenInput.split('\n').map((rt) => rt.trim()).filter(Boolean)
    if (refreshTokens.length === 0) {
      appStore.showError(t('admin.accounts.oauth.antigravity.pleaseEnterRefreshToken'))
      return
    }
    let successCount = 0
    let failedCount = 0
    const errors: string[] = []
    try {
      for (let i = 0; i < refreshTokens.length; i++) {
        try {
          const tokenInfo = await antigravityOAuth.validateRefreshToken(refreshTokens[i], form.proxy_id)
          if (!tokenInfo) {
            failedCount++
            errors.push(`#${i + 1}: ${antigravityOAuth.error || 'Validation failed'}`)
            continue
          }
          const credentials = antigravityOAuth.buildCredentials(tokenInfo)
          const accountName = refreshTokens.length > 1 ? `${form.name} #${i + 1}` : form.name
          await adminAccountsAPI.create(
            withAntigravityConfirmFlag({
              name: accountName,
              notes: form.notes,
              platform: 'antigravity',
              type: 'oauth',
              credentials,
              extra: {},
              proxy_id: form.proxy_id,
              concurrency: form.concurrency,
              load_factor: form.load_factor ?? undefined,
              priority: form.priority,
              rate_multiplier: form.rate_multiplier,
              group_ids: form.group_ids,
              expires_at: form.expires_at,
              auto_pause_on_expired: autoPauseOnExpired,
            }),
          )
          successCount++
        } catch (error: unknown) {
          failedCount++
          errors.push(`#${i + 1}: ${extractApiErrorMessage(error, 'Unknown error')}`)
        }
      }
      if (successCount > 0 && failedCount === 0) {
        appStore.showSuccess(
          refreshTokens.length > 1
            ? t('admin.accounts.oauth.batchSuccess', { count: successCount })
            : t('admin.accounts.accountCreated'),
        )
        onCreated()
        handleClose()
      } else if (successCount > 0) {
        appStore.showWarning(t('admin.accounts.oauth.batchPartialSuccess', { success: successCount, failed: failedCount }))
        onCreated()
      } else {
        appStore.showError(t('admin.accounts.oauth.batchFailed'))
      }
    } catch {
      appStore.showError(t('admin.accounts.oauth.batchFailed'))
    }
  }

  const handleValidateRefreshToken = (rt: string) => {
    if (form.platform === 'openai') void handleOpenAIValidateRT(rt)
    else if (form.platform === 'antigravity') void handleAntigravityValidateRT(rt)
  }

  const handleOpenAIExchange = async (authCode: string) => {
    if (!authCode.trim() || !openaiOAuth.sessionId) return
    const stateToUse = (oauthFlowRef.current?.oauthState || openaiOAuth.oauthState || '').trim()
    if (!stateToUse) {
      appStore.showError(t('admin.accounts.oauth.authFailed'))
      return
    }
    const tokenInfo = await openaiOAuth.exchangeAuthCode(
      authCode.trim(),
      openaiOAuth.sessionId,
      stateToUse,
      form.proxy_id,
    )
    if (!tokenInfo) return
    try {
      const credentials = openaiOAuth.buildCredentials(tokenInfo)
      const extra = buildOpenAIExtra(openaiOAuth.buildExtraInfo(tokenInfo) as Record<string, unknown>)
      if (!isOpenAIModelRestrictionDisabled) {
        const modelMapping = buildModelMappingObject(modelRestrictionMode, allowedModels, modelMappings)
        if (modelMapping) credentials.model_mapping = modelMapping
      }
      const compactModelMapping = buildOpenAICompactModelMapping()
      if (compactModelMapping) credentials.compact_model_mapping = compactModelMapping
      if (!applyTempUnschedConfig(credentials)) return
      await adminAccountsAPI.create({
        name: form.name,
        notes: form.notes,
        platform: 'openai',
        type: 'oauth',
        credentials,
        extra,
        proxy_id: form.proxy_id,
        concurrency: form.concurrency,
        load_factor: form.load_factor ?? undefined,
        priority: form.priority,
        rate_multiplier: form.rate_multiplier,
        group_ids: form.group_ids,
        expires_at: form.expires_at,
        auto_pause_on_expired: autoPauseOnExpired,
      })
      appStore.showSuccess(t('admin.accounts.accountCreated'))
      onCreated()
      handleClose()
    } catch (error: unknown) {
      appStore.showError(extractApiErrorMessage(error, t('admin.accounts.oauth.authFailed')))
    }
  }

  const handleGeminiExchange = async (authCode: string) => {
    if (!authCode.trim() || !geminiOAuth.sessionId) return
    const stateToUse = oauthFlowRef.current?.oauthState || geminiOAuth.state
    if (!stateToUse) {
      appStore.showError(t('admin.accounts.oauth.authFailed'))
      return
    }
    const tokenInfo = await geminiOAuth.exchangeAuthCode({
      code: authCode.trim(),
      sessionId: geminiOAuth.sessionId,
      state: stateToUse,
      proxyId: form.proxy_id,
      oauthType: geminiOAuthType,
      tierId: geminiSelectedTier,
    })
    if (!tokenInfo) return
    await createAccountAndFinish('gemini', 'oauth', geminiOAuth.buildCredentials(tokenInfo), geminiOAuth.buildExtraInfo(tokenInfo))
  }

  const handleAntigravityExchange = async (authCode: string) => {
    if (!authCode.trim() || !antigravityOAuth.sessionId) return
    const stateToUse = oauthFlowRef.current?.oauthState || antigravityOAuth.state
    if (!stateToUse) {
      appStore.showError(t('admin.accounts.oauth.authFailed'))
      return
    }
    const tokenInfo = await antigravityOAuth.exchangeAuthCode({
      code: authCode.trim(),
      sessionId: antigravityOAuth.sessionId,
      state: stateToUse,
      proxyId: form.proxy_id,
    })
    if (!tokenInfo) return
    const credentials = antigravityOAuth.buildCredentials(tokenInfo)
    applyInterceptWarmup(credentials, interceptWarmupRequests, 'create')
    const antigravityModelMapping = buildModelMappingObject('mapping', [], antigravityModelMappings)
    if (antigravityModelMapping) credentials.model_mapping = antigravityModelMapping
    await createAccountAndFinish('antigravity', 'oauth', credentials, buildAntigravityExtra())
  }

  const handleAnthropicExchange = async (authCode: string) => {
    if (!authCode.trim() || !claudeOAuth.sessionId) return
    try {
      const proxyConfig = form.proxy_id ? { proxy_id: form.proxy_id } : {}
      const endpoint =
        addMethod === 'oauth' ? '/admin/accounts/exchange-code' : '/admin/accounts/exchange-setup-token-code'
      const tokenInfo = await adminAccountsAPI.exchangeCode(endpoint, {
        session_id: claudeOAuth.sessionId,
        code: authCode.trim(),
        ...proxyConfig,
      })
      const baseExtra = claudeOAuth.buildExtraInfo(tokenInfo) || {}
      const extra = buildAnthropicQuotaExtra(baseExtra)
      const credentials: Record<string, unknown> = { ...tokenInfo }
      applyInterceptWarmup(credentials, interceptWarmupRequests, 'create')
      await createAccountAndFinish(form.platform, addMethod as AccountType, credentials, extra)
    } catch (error: unknown) {
      appStore.showError(extractApiErrorMessage(error, t('admin.accounts.oauth.authFailed')))
    }
  }

  const handleExchangeCode = async () => {
    const authCode = oauthFlowRef.current?.authCode || ''
    switch (form.platform) {
      case 'openai':
        return handleOpenAIExchange(authCode)
      case 'gemini':
        return handleGeminiExchange(authCode)
      case 'antigravity':
        return handleAntigravityExchange(authCode)
      default:
        return handleAnthropicExchange(authCode)
    }
  }

  const handleCookieAuth = async (sessionKey: string) => {
    try {
      const proxyConfig = form.proxy_id ? { proxy_id: form.proxy_id } : {}
      const keys = claudeOAuth.parseSessionKeys(sessionKey)
      if (keys.length === 0) {
        appStore.showError(t('admin.accounts.oauth.pleaseEnterSessionKey'))
        return
      }
      const tempUnschedPayload = tempUnschedEnabled ? buildTempUnschedRules(tempUnschedRules) : []
      if (tempUnschedEnabled && tempUnschedPayload.length === 0) {
        appStore.showError(t('admin.accounts.tempUnschedulable.rulesInvalid'))
        return
      }
      const endpoint =
        addMethod === 'oauth' ? '/admin/accounts/cookie-auth' : '/admin/accounts/setup-token-cookie-auth'
      let successCount = 0
      let failedCount = 0
      const errors: string[] = []
      for (let i = 0; i < keys.length; i++) {
        try {
          const tokenInfo = await adminAccountsAPI.exchangeCode(endpoint, {
            session_id: '',
            code: keys[i],
            ...proxyConfig,
          })
          const baseExtra = claudeOAuth.buildExtraInfo(tokenInfo) || {}
          const extra = buildAnthropicQuotaExtra(baseExtra)
          const accountName = keys.length > 1 ? `${form.name} #${i + 1}` : form.name
          const credentials: Record<string, unknown> = { ...tokenInfo }
          applyInterceptWarmup(credentials, interceptWarmupRequests, 'create')
          if (tempUnschedEnabled) {
            credentials.temp_unschedulable_enabled = true
            credentials.temp_unschedulable_rules = tempUnschedPayload
          }
          await adminAccountsAPI.create({
            name: accountName,
            notes: form.notes,
            platform: form.platform,
            type: addMethod,
            credentials,
            extra,
            proxy_id: form.proxy_id,
            concurrency: form.concurrency,
            load_factor: form.load_factor ?? undefined,
            priority: form.priority,
            rate_multiplier: form.rate_multiplier,
            group_ids: form.group_ids,
            expires_at: form.expires_at,
            auto_pause_on_expired: autoPauseOnExpired,
          })
          successCount++
        } catch (error: unknown) {
          failedCount++
          errors.push(
            t('admin.accounts.oauth.keyAuthFailed', {
              index: i + 1,
              error: extractApiErrorMessage(error, t('admin.accounts.oauth.authFailed')),
            }),
          )
        }
      }
      if (successCount > 0) {
        appStore.showSuccess(t('admin.accounts.oauth.successCreated', { count: successCount }))
        onCreated()
        if (failedCount === 0) handleClose()
      }
      if (failedCount > 0) {
        appStore.showError(errors.join('\n'))
      }
    } catch (error: unknown) {
      appStore.showError(extractApiErrorMessage(error, t('admin.accounts.oauth.cookieAuthFailed')))
    }
  }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (isOAuthFlow) {
      if (!form.name.trim()) {
        appStore.showError(t('admin.accounts.pleaseEnterAccountName'))
        return
      }
      const canContinue = await ensureAntigravityMixedChannelConfirmed(async () => setStep(2))
      if (!canContinue) return
      setStep(2)
      return
    }

    if (form.platform === 'anthropic' && accountCategory === 'bedrock') {
      if (!form.name.trim()) {
        appStore.showError(t('admin.accounts.pleaseEnterAccountName'))
        return
      }
      const credentials: Record<string, unknown> = {
        auth_mode: bedrockAuthMode,
        aws_region: bedrockRegion.trim() || 'us-east-1',
      }
      if (bedrockAuthMode === 'sigv4') {
        if (!bedrockAccessKeyId.trim()) {
          appStore.showError(t('admin.accounts.bedrockAccessKeyIdRequired'))
          return
        }
        if (!bedrockSecretAccessKey.trim()) {
          appStore.showError(t('admin.accounts.bedrockSecretAccessKeyRequired'))
          return
        }
        credentials.aws_access_key_id = bedrockAccessKeyId.trim()
        credentials.aws_secret_access_key = bedrockSecretAccessKey.trim()
        if (bedrockSessionToken.trim()) credentials.aws_session_token = bedrockSessionToken.trim()
      } else {
        if (!bedrockApiKeyValue.trim()) {
          appStore.showError(t('admin.accounts.bedrockApiKeyRequired'))
          return
        }
        credentials.api_key = bedrockApiKeyValue.trim()
      }
      if (bedrockForceGlobal) credentials.aws_force_global = 'true'
      const modelMapping = buildModelMappingObject(modelRestrictionMode, allowedModels, modelMappings)
      if (modelMapping) credentials.model_mapping = modelMapping
      if (poolModeEnabled) {
        credentials.pool_mode = true
        credentials.pool_mode_retry_count = normalizePoolModeRetryCount(poolModeRetryCount)
        const parsed = parsePoolModeRetryStatusCodes(poolModeRetryStatusCodesInput)
        if (parsed.length > 0) credentials.pool_mode_retry_status_codes = parsed
      }
      applyInterceptWarmup(credentials, interceptWarmupRequests, 'create')
      await createAccountAndFinish('anthropic', 'bedrock', credentials)
      return
    }

    if (form.platform === 'antigravity' && antigravityAccountType === 'upstream') {
      if (!form.name.trim()) {
        appStore.showError(t('admin.accounts.pleaseEnterAccountName'))
        return
      }
      if (!upstreamBaseUrl.trim()) {
        appStore.showError(t('admin.accounts.upstream.pleaseEnterBaseUrl'))
        return
      }
      if (!upstreamApiKey.trim()) {
        appStore.showError(t('admin.accounts.upstream.pleaseEnterApiKey'))
        return
      }
      const credentials: Record<string, unknown> = {
        base_url: upstreamBaseUrl.trim(),
        api_key: upstreamApiKey.trim(),
      }
      const antigravityModelMapping = buildModelMappingObject('mapping', [], antigravityModelMappings)
      if (antigravityModelMapping) credentials.model_mapping = antigravityModelMapping
      applyInterceptWarmup(credentials, interceptWarmupRequests, 'create')
      await createAccountAndFinish(form.platform, 'apikey', credentials, buildAntigravityExtra())
      return
    }

    if (
      (form.platform === 'gemini' || form.platform === 'anthropic') &&
      accountCategory === 'service_account'
    ) {
      if (!form.name.trim()) {
        appStore.showError(t('admin.accounts.pleaseEnterAccountName'))
        return
      }
      if (!parseVertexServiceAccountJson()) return
      if (!vertexLocation.trim()) {
        appStore.showError(t('admin.accounts.vertexLocationRequired'))
        return
      }
      const credentials: Record<string, unknown> = {
        service_account_json: vertexServiceAccountJson.trim(),
        project_id: vertexProjectId.trim(),
        client_email: vertexClientEmail.trim(),
        location: vertexLocation.trim(),
        tier_id: 'vertex',
      }
      await createAccountAndFinish(form.platform, 'service_account', credentials)
      return
    }

    if (!apiKeyValue.trim()) {
      appStore.showError(t('admin.accounts.pleaseEnterApiKey'))
      return
    }

    const defaultBaseUrl =
      form.platform === 'openai'
        ? 'https://api.openai.com'
        : form.platform === 'gemini'
          ? 'https://generativelanguage.googleapis.com'
          : 'https://api.anthropic.com'

    const credentials: Record<string, unknown> = {
      base_url: apiKeyBaseUrl.trim() || defaultBaseUrl,
      api_key: apiKeyValue.trim(),
    }
    if (form.platform === 'gemini') credentials.tier_id = geminiTierAIStudio
    if (!isOpenAIModelRestrictionDisabled) {
      const modelMapping = buildModelMappingObject(modelRestrictionMode, allowedModels, modelMappings)
      if (modelMapping) credentials.model_mapping = modelMapping
    }
    if (form.platform === 'openai') {
      applyOpenAIEndpointCapabilities(credentials, openAIEndpointCapabilities)
      const compactModelMapping = buildOpenAICompactModelMapping()
      if (compactModelMapping) credentials.compact_model_mapping = compactModelMapping
    }
    if (poolModeEnabled) {
      credentials.pool_mode = true
      credentials.pool_mode_retry_count = normalizePoolModeRetryCount(poolModeRetryCount)
      const parsed = parsePoolModeRetryStatusCodes(poolModeRetryStatusCodesInput)
      if (parsed.length > 0) credentials.pool_mode_retry_status_codes = parsed
    }
    if (customErrorCodesEnabled) {
      credentials.custom_error_codes_enabled = true
      credentials.custom_error_codes = [...selectedErrorCodes]
    }
    applyInterceptWarmup(credentials, interceptWarmupRequests, 'create')
    if (!applyTempUnschedConfig(credentials)) return
    await doCreateAccount({
      ...form,
      type: 'apikey',
      credentials,
      extra: buildAnthropicExtra(buildOpenAIExtra()),
      load_factor: form.load_factor ?? undefined,
      auto_pause_on_expired: autoPauseOnExpired,
    })
  }

  useEffect(() => {
    adminSettingsAPI
      .getWebSearchEmulationConfig()
      .then((cfg) => setWebSearchGlobalEnabled(cfg?.enabled === true && (cfg?.providers?.length ?? 0) > 0))
      .catch(() => setWebSearchGlobalEnabled(false))
    loadQuotaNotifyGlobal()
  }, [loadQuotaNotifyGlobal])

  useEffect(() => {
    if (show) {
      adminTlsFingerprintProfilesAPI
        .list()
        .then((profiles) => setTlsFingerprintProfiles(profiles.map((p) => ({ id: p.id, name: p.name }))))
        .catch(() => setTlsFingerprintProfiles([]))
      setAllowedModels([...getModelsByPlatform(form.platform)])
      if (form.platform === 'antigravity') {
        void fetchAntigravityDefaultMappings().then((mappings) => setAntigravityModelMappings([...mappings]))
      }
    } else {
      resetForm()
    }
  }, [show, form.platform, resetForm])

  useEffect(() => {
    let nextType: AccountType = 'apikey'
    if (form.platform === 'antigravity' && antigravityAccountType === 'upstream') nextType = 'apikey'
    else if (form.platform === 'anthropic' && accountCategory === 'bedrock') nextType = 'bedrock'
    else if (
      (form.platform === 'gemini' || form.platform === 'anthropic') &&
      accountCategory === 'service_account'
    )
      nextType = 'service_account'
    else if (accountCategory === 'oauth-based') nextType = addMethod
    setForm((prev) => (prev.type === nextType ? prev : { ...prev, type: nextType }))
  }, [accountCategory, addMethod, antigravityAccountType, form.platform])

  useEffect(() => {
    const newPlatform = form.platform
    setApiKeyBaseUrl(
      newPlatform === 'openai'
        ? 'https://api.openai.com'
        : newPlatform === 'gemini'
          ? 'https://generativelanguage.googleapis.com'
          : 'https://api.anthropic.com',
    )
    setAllowedModels([])
    setModelMappings([])
    if (newPlatform === 'antigravity') {
      setAccountCategory('oauth-based')
      setAntigravityAccountType('oauth')
      void fetchAntigravityDefaultMappings().then((mappings) => setAntigravityModelMappings([...mappings]))
    } else {
      setAllowOverages(false)
      setAntigravityModelMappings([])
    }
    if (newPlatform !== 'gemini' && newPlatform !== 'anthropic' && accountCategory === 'service_account') {
      setAccountCategory('oauth-based')
    }
    if (newPlatform !== 'anthropic' && accountCategory === 'bedrock') setAccountCategory('oauth-based')
    setBedrockAccessKeyId('')
    setBedrockSecretAccessKey('')
    setBedrockSessionToken('')
    setBedrockRegion('us-east-1')
    setBedrockForceGlobal(false)
    setBedrockAuthMode('sigv4')
    setBedrockApiKeyValue('')
    setVertexServiceAccountJson('')
    setVertexProjectId('')
    setVertexClientEmail('')
    setVertexLocation('global')
    if (newPlatform !== 'anthropic' && newPlatform !== 'antigravity') setInterceptWarmupRequests(false)
    if (newPlatform !== 'openai') {
      setOpenaiPassthroughEnabled(false)
      setOpenAIEndpointCapabilities(['chat_completions', 'embeddings'])
      setOpenaiOAuthResponsesWebSocketV2Mode(OPENAI_WS_MODE_OFF)
      setOpenaiAPIKeyResponsesWebSocketV2Mode(OPENAI_WS_MODE_OFF)
      setCodexCLIOnlyEnabled(false)
      setCodexCLIOnlyAllowClaudeCodeEnabled(false)
    }
    if (newPlatform !== 'anthropic') {
      setAnthropicPassthroughEnabled(false)
      setWebSearchEmulationMode('default')
    }
    claudeOAuth.resetState()
    openaiOAuth.resetState()
    geminiOAuth.resetState()
    antigravityOAuth.resetState()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.platform])

  useEffect(() => {
    if (form.platform === 'openai' && accountCategory !== 'oauth-based') {
      setCodexCLIOnlyEnabled(false)
      setCodexCLIOnlyAllowClaudeCodeEnabled(false)
    }
    if (form.platform !== 'anthropic' || accountCategory !== 'apikey') {
      setAnthropicPassthroughEnabled(false)
      setWebSearchEmulationMode('default')
    }
  }, [accountCategory, form.platform])

  useEffect(() => {
    if (!show || form.platform !== 'gemini' || accountCategory !== 'oauth-based') {
      setGeminiAIStudioOAuthEnabled(false)
      return
    }
    void geminiOAuth.getCapabilities().then((caps) => {
      setGeminiAIStudioOAuthEnabled(!!caps?.ai_studio_oauth_enabled)
      if (!caps?.ai_studio_oauth_enabled && geminiOAuthType === 'ai_studio') {
        setGeminiOAuthType('code_assist')
      }
    })
  }, [show, form.platform, accountCategory, geminiOAuth, geminiOAuthType])

  useEffect(() => {
    if (modelRestrictionMode === 'whitelist') {
      setAllowedModels([...getModelsByPlatform(form.platform)])
    }
  }, [modelRestrictionMode, form.platform])

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

  const platformBtnClass = (active: boolean, color: string) =>
    `flex flex-1 items-center justify-center gap-2 rounded-md px-4 py-2.5 text-sm font-medium transition-all ${
      active
        ? `bg-white shadow-sm dark:bg-dark-600 ${color}`
        : 'text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200'
    }`

  const categoryBtnClass = (active: boolean, border: string, bg: string) =>
    `flex items-center gap-3 rounded-lg border-2 p-3 text-left transition-all ${
      active ? `${border} ${bg}` : `border-gray-200 hover:${border.split('-')[0]}-300 dark:border-dark-600`
    }`

  return (
    <>
      <BaseDialog
        show={show}
        title={t('admin.accounts.createAccount')}
        width="wide"
        onClose={handleClose}
        footer={
          step === 1 ? (
            <div className="flex justify-end gap-3">
              <button type="button" className="btn btn-secondary" onClick={handleClose}>
                {t('common.cancel')}
              </button>
              <button
                type="submit"
                form="create-account-form"
                disabled={submitting}
                className="btn btn-primary"
                data-tour="account-form-submit"
              >
                {submitting ? <SpinnerIcon /> : null}
                {isOAuthFlow
                  ? t('common.next')
                  : submitting
                    ? t('admin.accounts.creating')
                    : t('common.create')}
              </button>
            </div>
          ) : (
            <div className="flex justify-between gap-3">
              <button type="button" className="btn btn-secondary" onClick={goBackToBasicInfo}>
                {t('common.back')}
              </button>
              {isManualInputMethod ? (
                <button
                  type="button"
                  disabled={!canExchangeCode}
                  className="btn btn-primary"
                  onClick={() => void handleExchangeCode()}
                >
                  {currentOAuthLoading ? <SpinnerIcon /> : null}
                  {currentOAuthLoading
                    ? t('admin.accounts.oauth.verifying')
                    : t('admin.accounts.oauth.completeAuth')}
                </button>
              ) : null}
            </div>
          )
        }
      >
        {isOAuthFlow ? (
          <div className="mb-6 flex items-center justify-center">
            <div className="flex items-center space-x-4">
              <div className="flex items-center">
                <div
                  className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold ${
                    step >= 1 ? 'bg-primary-500 text-white' : 'bg-gray-200 text-gray-500 dark:bg-dark-600'
                  }`}
                >
                  1
                </div>
                <span className="ml-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                  {t('admin.accounts.oauth.authMethod')}
                </span>
              </div>
              <div className="h-0.5 w-8 bg-gray-300 dark:bg-dark-600" />
              <div className="flex items-center">
                <div
                  className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold ${
                    step >= 2 ? 'bg-primary-500 text-white' : 'bg-gray-200 text-gray-500 dark:bg-dark-600'
                  }`}
                >
                  2
                </div>
                <span className="ml-2 text-sm font-medium text-gray-700 dark:text-gray-300">{oauthStepTitle}</span>
              </div>
            </div>
          </div>
        ) : null}

        {step === 1 ? (
          <form id="create-account-form" onSubmit={(e) => void handleSubmit(e)} className="space-y-5">
            <div>
              <label className="input-label">{t('admin.accounts.accountName')}</label>
              <input
                value={form.name}
                onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                type="text"
                required
                className="input"
                placeholder={t('admin.accounts.enterAccountName')}
                data-tour="account-form-name"
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

            <div>
              <label className="input-label">{t('admin.accounts.platform')}</label>
              <div className="mt-2 flex rounded-lg bg-gray-100 p-1 dark:bg-dark-700" data-tour="account-form-platform">
                {(['anthropic', 'openai', 'gemini', 'antigravity'] as const).map((platform) => (
                  <button
                    key={platform}
                    type="button"
                    onClick={() => setForm((prev) => ({ ...prev, platform }))}
                    className={platformBtnClass(
                      form.platform === platform,
                      platform === 'anthropic'
                        ? 'text-orange-600 dark:text-orange-400'
                        : platform === 'openai'
                          ? 'text-green-600 dark:text-green-400'
                          : platform === 'gemini'
                            ? 'text-blue-600 dark:text-blue-400'
                            : 'text-purple-600 dark:text-purple-400',
                    )}
                  >
                    {platform === 'anthropic' ? <Icon name="sparkles" size="sm" /> : null}
                    {platform === 'openai' ? (
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
                      </svg>
                    ) : null}
                    {platform === 'gemini' ? (
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 2l1.5 6.5L20 10l-6.5 1.5L12 18l-1.5-6.5L4 10l6.5-1.5L12 2z" />
                      </svg>
                    ) : null}
                    {platform === 'antigravity' ? <Icon name="cloud" size="sm" /> : null}
                    {platform.charAt(0).toUpperCase() + platform.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            {/* Anthropic account types */}
            {form.platform === 'anthropic' ? (
              <div>
                <label className="input-label">{t('admin.accounts.accountType')}</label>
                <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4" data-tour="account-form-type">
                  {(
                    [
                      { key: 'oauth-based', label: t('admin.accounts.claudeCode'), sub: t('admin.accounts.oauthSetupToken'), icon: 'sparkles', color: 'orange' },
                      { key: 'apikey', label: t('admin.accounts.claudeConsole'), sub: t('admin.accounts.apiKey'), icon: 'key', color: 'purple' },
                      { key: 'bedrock', label: t('admin.accounts.bedrockLabel'), sub: t('admin.accounts.bedrockDesc'), icon: 'cloud', color: 'amber' },
                      { key: 'service_account', label: 'Vertex', sub: 'Service Account', icon: 'cloud', color: 'sky' },
                    ] as const
                  ).map((item) => (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => setAccountCategory(item.key)}
                      className={categoryBtnClass(
                        accountCategory === item.key,
                        `border-${item.color}-500`,
                        `bg-${item.color}-50 dark:bg-${item.color}-900/20`,
                      )}
                    >
                      <div
                        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                          accountCategory === item.key
                            ? `bg-${item.color}-500 text-white`
                            : 'bg-gray-100 text-gray-500 dark:bg-dark-600 dark:text-gray-400'
                        }`}
                      >
                        <Icon name={item.icon as 'sparkles'} size="sm" />
                      </div>
                      <div>
                        <span className="block text-sm font-medium text-gray-900 dark:text-white">{item.label}</span>
                        <span className="text-xs text-gray-500 dark:text-gray-400">{item.sub}</span>
                      </div>
                    </button>
                  ))}
                </div>
                {accountCategory === 'service_account' ? (
                  <div className="mt-3 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-800 dark:border-sky-800/40 dark:bg-sky-900/20 dark:text-sky-200">
                    <p>{t('admin.accounts.vertexAnthropicHint')}</p>
                  </div>
                ) : null}
              </div>
            ) : null}

            {/* OpenAI account types */}
            {form.platform === 'openai' ? (
              <div>
                <label className="input-label">{t('admin.accounts.accountType')}</label>
                <div className="mt-2 grid grid-cols-2 gap-3" data-tour="account-form-type">
                  <button type="button" onClick={() => setAccountCategory('oauth-based')} className={categoryBtnClass(accountCategory === 'oauth-based', 'border-green-500', 'bg-green-50 dark:bg-green-900/20')}>
                    <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${accountCategory === 'oauth-based' ? 'bg-green-500 text-white' : 'bg-gray-100 text-gray-500 dark:bg-dark-600'}`}>
                      <Icon name="key" size="sm" />
                    </div>
                    <div>
                      <span className="block text-sm font-medium text-gray-900 dark:text-white">OAuth</span>
                      <span className="text-xs text-gray-500 dark:text-gray-400">{t('admin.accounts.types.chatgptOauth')}</span>
                    </div>
                  </button>
                  <button type="button" onClick={() => setAccountCategory('apikey')} className={categoryBtnClass(accountCategory === 'apikey', 'border-purple-500', 'bg-purple-50 dark:bg-purple-900/20')}>
                    <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${accountCategory === 'apikey' ? 'bg-purple-500 text-white' : 'bg-gray-100 text-gray-500 dark:bg-dark-600'}`}>
                      <Icon name="key" size="sm" />
                    </div>
                    <div>
                      <span className="block text-sm font-medium text-gray-900 dark:text-white">API Key</span>
                      <span className="text-xs text-gray-500 dark:text-gray-400">{t('admin.accounts.types.responsesApi')}</span>
                    </div>
                  </button>
                </div>
              </div>
            ) : null}

            {/* Gemini account types - simplified; help dialog included below */}
            {form.platform === 'gemini' ? (
              <div>
                <div className="flex items-center justify-between">
                  <label className="input-label">{t('admin.accounts.accountType')}</label>
                  <button type="button" onClick={() => setShowGeminiHelpDialog(true)} className="flex items-center gap-1 rounded px-2 py-1 text-xs text-blue-600 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-900/20">
                    {t('admin.accounts.gemini.helpButton')}
                  </button>
                </div>
                <div className="mt-2 grid grid-cols-3 gap-3" data-tour="account-form-type">
                  <button type="button" onClick={() => setAccountCategory('oauth-based')} className={categoryBtnClass(accountCategory === 'oauth-based', 'border-blue-500', 'bg-blue-50 dark:bg-blue-900/20')}>
                    <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${accountCategory === 'oauth-based' ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-500 dark:bg-dark-600'}`}>
                      <Icon name="key" size="sm" />
                    </div>
                    <div>
                      <span className="block text-sm font-medium text-gray-900 dark:text-white">{t('admin.accounts.gemini.accountType.oauthTitle')}</span>
                      <span className="text-xs text-gray-500 dark:text-gray-400">{t('admin.accounts.gemini.accountType.oauthDesc')}</span>
                    </div>
                  </button>
                  <button type="button" onClick={() => setAccountCategory('apikey')} className={categoryBtnClass(accountCategory === 'apikey', 'border-purple-500', 'bg-purple-50 dark:bg-purple-900/20')}>
                    <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${accountCategory === 'apikey' ? 'bg-purple-500 text-white' : 'bg-gray-100 text-gray-500 dark:bg-dark-600'}`}>
                      <Icon name="key" size="sm" />
                    </div>
                    <div>
                      <span className="block text-sm font-medium text-gray-900 dark:text-white">{t('admin.accounts.gemini.accountType.apiKeyTitle')}</span>
                      <span className="text-xs text-gray-500 dark:text-gray-400">{t('admin.accounts.gemini.accountType.apiKeyDesc')}</span>
                    </div>
                  </button>
                  <button type="button" onClick={() => setAccountCategory('service_account')} className={categoryBtnClass(accountCategory === 'service_account', 'border-sky-500', 'bg-sky-50 dark:bg-sky-900/20')}>
                    <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${accountCategory === 'service_account' ? 'bg-sky-500 text-white' : 'bg-gray-100 text-gray-500 dark:bg-dark-600'}`}>
                      <Icon name="cloud" size="sm" />
                    </div>
                    <div>
                      <span className="block text-sm font-medium text-gray-900 dark:text-white">Vertex</span>
                      <span className="text-xs text-gray-500 dark:text-gray-400">Service Account</span>
                    </div>
                  </button>
                </div>
                {accountCategory === 'apikey' ? (
                  <div className="mt-3 rounded-lg border border-purple-200 bg-purple-50 px-3 py-2 text-xs text-purple-800 dark:border-purple-800/40 dark:bg-purple-900/20 dark:text-purple-200">
                    <p>{t('admin.accounts.gemini.accountType.apiKeyNote')}</p>
                    <a href={geminiHelpLinks.apiKey} className="font-medium text-blue-600 hover:underline dark:text-blue-400" target="_blank" rel="noreferrer">
                      {t('admin.accounts.gemini.accountType.apiKeyLink')}
                    </a>
                  </div>
                ) : null}
                {accountCategory === 'service_account' ? (
                  <div className="mt-3 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-800 dark:border-sky-800/40 dark:bg-sky-900/20 dark:text-sky-200">
                    <p>{t('admin.accounts.vertexGeminiHint')}</p>
                  </div>
                ) : null}
                {accountCategory === 'oauth-based' ? (
                  <div className="mt-4 space-y-3">
                    <label className="input-label">{t('admin.accounts.oauth.gemini.oauthTypeLabel')}</label>
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        type="button"
                        onClick={() => handleSelectGeminiOAuthType('google_one')}
                        className={`flex items-center gap-3 rounded-lg border-2 p-3 text-left transition-all ${
                          geminiOAuthType === 'google_one'
                            ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/20'
                            : 'border-gray-200 hover:border-purple-300 dark:border-dark-600 dark:hover:border-purple-700'
                        }`}
                      >
                        <div
                          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                            geminiOAuthType === 'google_one'
                              ? 'bg-purple-500 text-white'
                              : 'bg-gray-100 text-gray-500 dark:bg-dark-600 dark:text-gray-400'
                          }`}
                        >
                          <Icon name="user" size="sm" />
                        </div>
                        <div className="min-w-0">
                          <span className="block text-sm font-medium text-gray-900 dark:text-white">Google One</span>
                          <span className="text-xs text-gray-500 dark:text-gray-400">个人账号，享受 Google One 订阅配额</span>
                          <div className="mt-2 flex flex-wrap gap-1">
                            <span className="rounded bg-purple-100 px-2 py-0.5 text-[10px] font-semibold text-purple-700 dark:bg-purple-900/40 dark:text-purple-300">
                              推荐个人用户
                            </span>
                            <span className="rounded bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                              无需 GCP
                            </span>
                          </div>
                        </div>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSelectGeminiOAuthType('code_assist')}
                        className={`flex items-center gap-3 rounded-lg border-2 p-3 text-left transition-all ${
                          geminiOAuthType === 'code_assist'
                            ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                            : 'border-gray-200 hover:border-blue-300 dark:border-dark-600 dark:hover:border-blue-700'
                        }`}
                      >
                        <div
                          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                            geminiOAuthType === 'code_assist'
                              ? 'bg-blue-500 text-white'
                              : 'bg-gray-100 text-gray-500 dark:bg-dark-600 dark:text-gray-400'
                          }`}
                        >
                          <Icon name="cloud" size="sm" />
                        </div>
                        <div className="min-w-0">
                          <span className="block text-sm font-medium text-gray-900 dark:text-white">GCP Code Assist</span>
                          <span className="text-xs text-gray-500 dark:text-gray-400">企业级，需要 GCP 项目</span>
                          <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                            需要激活 GCP 项目并绑定信用卡
                            <a
                              href={geminiHelpLinks.gcpProject}
                              className="ml-1 text-blue-600 hover:underline dark:text-blue-400"
                              target="_blank"
                              rel="noreferrer"
                            >
                              {t('admin.accounts.gemini.oauthType.gcpProjectLink')}
                            </a>
                          </div>
                          <div className="mt-2 flex flex-wrap gap-1">
                            <span className="rounded bg-blue-100 px-2 py-0.5 text-[10px] font-semibold text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
                              企业用户
                            </span>
                            <span className="rounded bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                              高并发
                            </span>
                          </div>
                        </div>
                      </button>
                    </div>
                    <div className="mt-3">
                      <button
                        type="button"
                        onClick={() => setShowAdvancedOAuth((v) => !v)}
                        className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200"
                      >
                        <svg
                          className={`h-4 w-4 transition-transform ${showAdvancedOAuth ? 'rotate-90' : ''}`}
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth={2}
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                        </svg>
                        <span>{showAdvancedOAuth ? '隐藏' : '显示'}高级选项（自建 OAuth Client）</span>
                      </button>
                    </div>
                    {showAdvancedOAuth ? (
                      <div className="group relative mt-3">
                        <button
                          type="button"
                          disabled={!geminiAIStudioOAuthEnabled}
                          onClick={() => handleSelectGeminiOAuthType('ai_studio')}
                          className={`flex w-full items-center gap-3 rounded-lg border-2 p-3 text-left transition-all ${
                            !geminiAIStudioOAuthEnabled ? 'cursor-not-allowed opacity-60' : ''
                          } ${
                            geminiOAuthType === 'ai_studio'
                              ? 'border-amber-500 bg-amber-50 dark:bg-amber-900/20'
                              : 'border-gray-200 hover:border-amber-300 dark:border-dark-600 dark:hover:border-amber-700'
                          }`}
                        >
                          <div
                            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                              geminiOAuthType === 'ai_studio'
                                ? 'bg-amber-500 text-white'
                                : 'bg-gray-100 text-gray-500 dark:bg-dark-600 dark:text-gray-400'
                            }`}
                          >
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                            </svg>
                          </div>
                          <div className="min-w-0">
                            <span className="block text-sm font-medium text-gray-900 dark:text-white">
                              {t('admin.accounts.gemini.oauthType.customTitle')}
                            </span>
                            <span className="text-xs text-gray-500 dark:text-gray-400">
                              {t('admin.accounts.gemini.oauthType.customDesc')}
                            </span>
                            <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                              {t('admin.accounts.gemini.oauthType.customRequirement')}
                            </div>
                            <div className="mt-2 flex flex-wrap gap-1">
                              <span className="rounded bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                                {t('admin.accounts.gemini.oauthType.badges.orgManaged')}
                              </span>
                              <span className="rounded bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                                {t('admin.accounts.gemini.oauthType.badges.adminRequired')}
                              </span>
                            </div>
                          </div>
                          {!geminiAIStudioOAuthEnabled ? (
                            <span className="ml-auto shrink-0 rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
                              {t('admin.accounts.oauth.gemini.aiStudioNotConfiguredShort')}
                            </span>
                          ) : null}
                        </button>
                        {!geminiAIStudioOAuthEnabled ? (
                          <div className="pointer-events-none absolute right-0 top-full z-50 mt-2 w-80 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 opacity-0 shadow-lg transition-opacity group-hover:opacity-100 dark:border-amber-700 dark:bg-amber-900/40 dark:text-amber-200">
                            {t('admin.accounts.oauth.gemini.aiStudioNotConfiguredTip')}
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                    <div>
                      <label className="input-label">{t('admin.accounts.gemini.tier.label')}</label>
                      {geminiOAuthType === 'google_one' ? (
                        <select value={geminiTierGoogleOne} onChange={(e) => setGeminiTierGoogleOne(e.target.value as typeof geminiTierGoogleOne)} className="input">
                          <option value="google_one_free">{t('admin.accounts.gemini.tier.googleOne.free')}</option>
                          <option value="google_ai_pro">{t('admin.accounts.gemini.tier.googleOne.pro')}</option>
                          <option value="google_ai_ultra">{t('admin.accounts.gemini.tier.googleOne.ultra')}</option>
                        </select>
                      ) : geminiOAuthType === 'code_assist' ? (
                        <select value={geminiTierGcp} onChange={(e) => setGeminiTierGcp(e.target.value as typeof geminiTierGcp)} className="input">
                          <option value="gcp_standard">{t('admin.accounts.gemini.tier.gcp.standard')}</option>
                          <option value="gcp_enterprise">{t('admin.accounts.gemini.tier.gcp.enterprise')}</option>
                        </select>
                      ) : (
                        <select value={geminiTierAIStudio} onChange={(e) => setGeminiTierAIStudio(e.target.value as typeof geminiTierAIStudio)} className="input">
                          <option value="aistudio_free">{t('admin.accounts.gemini.tier.aiStudio.free')}</option>
                          <option value="aistudio_paid">{t('admin.accounts.gemini.tier.aiStudio.paid')}</option>
                        </select>
                      )}
                      <p className="input-hint">{t('admin.accounts.gemini.tier.hint')}</p>
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}

            {/* Antigravity account types */}
            {form.platform === 'antigravity' ? (
              <div>
                <label className="input-label">{t('admin.accounts.accountType')}</label>
                <div className="mt-2 grid grid-cols-2 gap-3">
                  <button type="button" onClick={() => setAntigravityAccountType('oauth')} className={categoryBtnClass(antigravityAccountType === 'oauth', 'border-purple-500', 'bg-purple-50 dark:bg-purple-900/20')}>
                    <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${antigravityAccountType === 'oauth' ? 'bg-purple-500 text-white' : 'bg-gray-100 text-gray-500 dark:bg-dark-600'}`}>
                      <Icon name="key" size="sm" />
                    </div>
                    <div>
                      <span className="block text-sm font-medium text-gray-900 dark:text-white">OAuth</span>
                      <span className="text-xs text-gray-500 dark:text-gray-400">{t('admin.accounts.types.antigravityOauth')}</span>
                    </div>
                  </button>
                  <button type="button" onClick={() => setAntigravityAccountType('upstream')} className={categoryBtnClass(antigravityAccountType === 'upstream', 'border-purple-500', 'bg-purple-50 dark:bg-purple-900/20')}>
                    <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${antigravityAccountType === 'upstream' ? 'bg-purple-500 text-white' : 'bg-gray-100 text-gray-500 dark:bg-dark-600'}`}>
                      <Icon name="cloud" size="sm" />
                    </div>
                    <div>
                      <span className="block text-sm font-medium text-gray-900 dark:text-white">API Key</span>
                      <span className="text-xs text-gray-500 dark:text-gray-400">{t('admin.accounts.types.antigravityApikey')}</span>
                    </div>
                  </button>
                </div>
              </div>
            ) : null}

            {form.platform === 'antigravity' && antigravityAccountType === 'upstream' ? (
              <div className="space-y-4">
                <div>
                  <label className="input-label">{t('admin.accounts.upstream.baseUrl')}</label>
                  <input value={upstreamBaseUrl} onChange={(e) => setUpstreamBaseUrl(e.target.value)} type="text" required className="input" placeholder="https://cloudcode-pa.googleapis.com" />
                  <p className="input-hint">{t('admin.accounts.upstream.baseUrlHint')}</p>
                </div>
                <div>
                  <label className="input-label">{t('admin.accounts.upstream.apiKey')}</label>
                  <input value={upstreamApiKey} onChange={(e) => setUpstreamApiKey(e.target.value)} type="password" required className="input font-mono" placeholder="sk-..." />
                  <p className="input-hint">{t('admin.accounts.upstream.apiKeyHint')}</p>
                </div>
              </div>
            ) : null}

            {(form.platform === 'gemini' || form.platform === 'anthropic') && accountCategory === 'service_account' ? (
              <div className="space-y-4">
                <div>
                  <label className="input-label">Service Account JSON</label>
                  <input ref={vertexServiceAccountFileInputRef} type="file" accept="application/json,.json" className="hidden" onChange={(e) => void handleVertexServiceAccountFile(e)} />
                  <div
                    className={`rounded-lg border-2 border-dashed px-4 py-5 transition-colors ${vertexServiceAccountDragActive ? 'border-sky-500 bg-sky-50 dark:border-sky-500 dark:bg-sky-900/20' : 'border-gray-300 bg-gray-50 hover:border-sky-400 dark:border-dark-500 dark:bg-dark-700/40'}`}
                    onDragEnter={(e) => { e.preventDefault(); setVertexServiceAccountDragActive(true) }}
                    onDragOver={(e) => { e.preventDefault(); setVertexServiceAccountDragActive(true) }}
                    onDragLeave={(e) => { e.preventDefault(); setVertexServiceAccountDragActive(false) }}
                    onDrop={handleVertexServiceAccountDrop}
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 text-sm font-medium text-gray-900 dark:text-white">
                          <Icon name="upload" size="sm" />
                          <span>{vertexClientEmail ? t('admin.accounts.vertexSaJsonLoaded') : t('admin.accounts.vertexSaJsonDrop')}</span>
                        </div>
                        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                          {vertexClientEmail ? t('admin.accounts.vertexSaJsonKeyHidden') : t('admin.accounts.vertexSaJsonDropHint')}
                        </p>
                      </div>
                      <button type="button" className="btn btn-secondary shrink-0" onClick={() => vertexServiceAccountFileInputRef.current?.click()}>
                        <Icon name="upload" size="sm" />
                        {t('admin.accounts.vertexSaJsonSelectBtn')}
                      </button>
                    </div>
                    {vertexClientEmail ? (
                      <div className="mt-3 rounded-md border border-sky-200 bg-white px-3 py-2 text-xs text-sky-900 dark:border-sky-800/50 dark:bg-dark-800 dark:text-sky-200">
                        <div className="truncate">Project ID: <span className="font-mono">{vertexProjectId}</span></div>
                        <div className="truncate">Client Email: <span className="font-mono">{vertexClientEmail}</span></div>
                      </div>
                    ) : null}
                  </div>
                  <p className="input-hint">{t('admin.accounts.vertexSaJsonUploadHint')}</p>
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className="input-label">Project ID</label>
                    <input value={vertexProjectId} readOnly type="text" className="input font-mono" placeholder={t('admin.accounts.vertexProjectIdPlaceholder')} />
                  </div>
                  <div>
                    <label className="input-label">Location</label>
                    <select value={vertexLocation} onChange={(e) => setVertexLocation(e.target.value)} required className="input font-mono">
                      {VERTEX_LOCATION_OPTIONS.map((group) => (
                        <optgroup key={group.label} label={group.label}>
                          {group.options.map((option) => (
                            <option key={option.value} value={option.value}>{option.label}</option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                    <p className="input-hint">{t('admin.accounts.vertexLocationHint')}</p>
                  </div>
                </div>
              </div>
            ) : null}

            {form.platform === 'antigravity' ? (
              <AntigravityModelMappingSection
                t={t}
                mappings={antigravityModelMappings}
                onChange={setAntigravityModelMappings}
                onAdd={addAntigravityModelMapping}
                onRemove={removeAntigravityModelMapping}
                onAddPreset={addAntigravityPresetMapping}
                onSyncUpstream={() => {}}
                isSyncing={false}
                presetMappings={antigravityPresetMappings}
                getKey={getAntigravityModelMappingKey}
              />
            ) : null}

            {form.platform === 'anthropic' && isOAuthFlow ? (
              <div>
                <label className="input-label">{t('admin.accounts.addMethod')}</label>
                <div className="mt-2 flex gap-4">
                  <label className="flex cursor-pointer items-center">
                    <input type="radio" checked={addMethod === 'oauth'} onChange={() => setAddMethod('oauth')} className="mr-2 text-primary-600 focus:ring-primary-500" />
                    <span className="text-sm text-gray-700 dark:text-gray-300">{t('admin.accounts.types.oauth')}</span>
                  </label>
                  <label className="flex cursor-pointer items-center">
                    <input type="radio" checked={addMethod === 'setup-token'} onChange={() => setAddMethod('setup-token')} className="mr-2 text-primary-600 focus:ring-primary-500" />
                    <span className="text-sm text-gray-700 dark:text-gray-300">{t('admin.accounts.setupTokenLongLived')}</span>
                  </label>
                </div>
              </div>
            ) : null}

            {form.type === 'apikey' && form.platform !== 'antigravity' ? (
              <div className="space-y-4">
                <div>
                  <label className="input-label">{t('admin.accounts.baseUrl')}</label>
                  <input value={apiKeyBaseUrl} onChange={(e) => setApiKeyBaseUrl(e.target.value)} type="text" className="input" placeholder={form.platform === 'openai' ? 'https://api.openai.com' : form.platform === 'gemini' ? 'https://generativelanguage.googleapis.com' : 'https://api.anthropic.com'} />
                  <p className="input-hint">{baseUrlHint}</p>
                </div>
                <div>
                  <label className="input-label">{t('admin.accounts.apiKeyRequired')}</label>
                  <input value={apiKeyValue} onChange={(e) => setApiKeyValue(e.target.value)} type="password" required className="input font-mono" placeholder={form.platform === 'openai' ? 'sk-proj-...' : form.platform === 'gemini' ? 'AIza...' : 'sk-ant-...'} />
                  <p className="input-hint">{apiKeyHint}</p>
                </div>
                {form.platform === 'gemini' ? (
                  <div>
                    <label className="input-label">{t('admin.accounts.gemini.tier.label')}</label>
                    <select value={geminiTierAIStudio} onChange={(e) => setGeminiTierAIStudio(e.target.value as typeof geminiTierAIStudio)} className="input">
                      <option value="aistudio_free">{t('admin.accounts.gemini.tier.aiStudio.free')}</option>
                      <option value="aistudio_paid">{t('admin.accounts.gemini.tier.aiStudio.paid')}</option>
                    </select>
                    <p className="input-hint">{t('admin.accounts.gemini.tier.aiStudioHint')}</p>
                  </div>
                ) : null}
                <div className="border-t border-gray-200 pt-4 dark:border-dark-600">
                  <label className="input-label">{t('admin.accounts.modelRestriction')}</label>
                  <ModelRestrictionSection
                    t={t}
                    platform={form.platform}
                    disabled={isOpenAIModelRestrictionDisabled}
                    syncCredentials={syncPreviewCredentials}
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
                <PoolModeSection t={t} enabled={poolModeEnabled} onEnabledChange={setPoolModeEnabled} retryCount={poolModeRetryCount} onRetryCountChange={setPoolModeRetryCount} statusCodesInput={poolModeRetryStatusCodesInput} onStatusCodesInputChange={setPoolModeRetryStatusCodesInput} />
                <CustomErrorCodesSection t={t} enabled={customErrorCodesEnabled} onEnabledChange={setCustomErrorCodesEnabled} selectedErrorCodes={selectedErrorCodes} onToggleErrorCode={toggleErrorCode} onRemoveErrorCode={(code) => setSelectedErrorCodes((prev) => prev.filter((c) => c !== code))} customErrorCodeInput={customErrorCodeInput} onCustomErrorCodeInputChange={setCustomErrorCodeInput} onAddCustomErrorCode={addCustomErrorCode} commonErrorCodes={commonErrorCodes} />
              </div>
            ) : null}

            {form.platform === 'anthropic' && accountCategory === 'bedrock' ? (
              <div className="space-y-4">
                <div>
                  <label className="input-label">{t('admin.accounts.bedrockAuthMode')}</label>
                  <div className="mt-2 flex gap-4">
                    <label className="flex cursor-pointer items-center">
                      <input type="radio" checked={bedrockAuthMode === 'sigv4'} onChange={() => setBedrockAuthMode('sigv4')} className="mr-2" />
                      <span className="text-sm">{t('admin.accounts.bedrockAuthModeSigv4')}</span>
                    </label>
                    <label className="flex cursor-pointer items-center">
                      <input type="radio" checked={bedrockAuthMode === 'apikey'} onChange={() => setBedrockAuthMode('apikey')} className="mr-2" />
                      <span className="text-sm">{t('admin.accounts.bedrockAuthModeApikey')}</span>
                    </label>
                  </div>
                </div>
                {bedrockAuthMode === 'sigv4' ? (
                  <>
                    <div>
                      <label className="input-label">{t('admin.accounts.bedrockAccessKeyId')}</label>
                      <input value={bedrockAccessKeyId} onChange={(e) => setBedrockAccessKeyId(e.target.value)} type="text" required className="input font-mono" placeholder="AKIA..." />
                    </div>
                    <div>
                      <label className="input-label">{t('admin.accounts.bedrockSecretAccessKey')}</label>
                      <input value={bedrockSecretAccessKey} onChange={(e) => setBedrockSecretAccessKey(e.target.value)} type="password" required className="input font-mono" />
                    </div>
                    <div>
                      <label className="input-label">{t('admin.accounts.bedrockSessionToken')}</label>
                      <input value={bedrockSessionToken} onChange={(e) => setBedrockSessionToken(e.target.value)} type="password" className="input font-mono" />
                      <p className="input-hint">{t('admin.accounts.bedrockSessionTokenHint')}</p>
                    </div>
                  </>
                ) : (
                  <div>
                    <label className="input-label">{t('admin.accounts.bedrockApiKeyInput')}</label>
                    <input value={bedrockApiKeyValue} onChange={(e) => setBedrockApiKeyValue(e.target.value)} type="password" required className="input font-mono" />
                  </div>
                )}
                <div>
                  <label className="input-label">{t('admin.accounts.bedrockRegion')}</label>
                  <select value={bedrockRegion} onChange={(e) => setBedrockRegion(e.target.value)} className="input">
                    {BEDROCK_REGION_OPTIONS.map((group) => (
                      <optgroup key={group.label} label={group.label}>
                        {group.options.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                  <p className="input-hint">{t('admin.accounts.bedrockRegionHint')}</p>
                </div>
                <label className="flex cursor-pointer items-center gap-2">
                  <input type="checkbox" checked={bedrockForceGlobal} onChange={(e) => setBedrockForceGlobal(e.target.checked)} className="rounded border-gray-300 text-primary-600" />
                  <span className="text-sm">{t('admin.accounts.bedrockForceGlobal')}</span>
                </label>
                <div className="border-t border-gray-200 pt-4 dark:border-dark-600">
                  <label className="input-label">{t('admin.accounts.modelRestriction')}</label>
                  <ModelRestrictionSection t={t} platform="anthropic" syncCredentials={syncPreviewCredentials} modelRestrictionMode={modelRestrictionMode} onModelRestrictionModeChange={setModelRestrictionMode} allowedModels={allowedModels} onAllowedModelsChange={setAllowedModels} modelMappings={modelMappings} onModelMappingsChange={setModelMappings} onAddMapping={addModelMapping} onRemoveMapping={removeModelMapping} presetMappings={bedrockPresets} onAddPresetMapping={addPresetMapping} getModelMappingKey={getModelMappingKey} fromPlaceholder={t('admin.accounts.fromModel')} toPlaceholder={t('admin.accounts.toModel')} />
                </div>
                <PoolModeSection t={t} enabled={poolModeEnabled} onEnabledChange={setPoolModeEnabled} retryCount={poolModeRetryCount} onRetryCountChange={setPoolModeRetryCount} statusCodesInput={poolModeRetryStatusCodesInput} onStatusCodesInputChange={setPoolModeRetryStatusCodesInput} />
              </div>
            ) : null}

            {form.platform === 'anthropic' && (form.type === 'apikey' || form.type === 'bedrock') ? (
              <QuotaLimitCardSection t={t} hintKey="admin.accounts.quotaControl.hint" cardProps={quotaLimitCard} />
            ) : form.type === 'apikey' || form.type === 'bedrock' ? (
              <QuotaLimitCardSection t={t} hintKey="admin.accounts.quotaLimitHint" cardProps={quotaLimitCard} />
            ) : null}

            {form.platform === 'openai' && accountCategory === 'oauth-based' ? (
              <div className="border-t border-gray-200 pt-4 dark:border-dark-600">
                <label className="input-label">{t('admin.accounts.modelRestriction')}</label>
                <ModelRestrictionSection t={t} platform={form.platform} disabled={isOpenAIModelRestrictionDisabled} syncCredentials={syncPreviewCredentials} modelRestrictionMode={modelRestrictionMode} onModelRestrictionModeChange={setModelRestrictionMode} allowedModels={allowedModels} onAllowedModelsChange={setAllowedModels} modelMappings={modelMappings} onModelMappingsChange={setModelMappings} onAddMapping={addModelMapping} onRemoveMapping={removeModelMapping} presetMappings={presetMappings} onAddPresetMapping={addPresetMapping} getModelMappingKey={getModelMappingKey} />
              </div>
            ) : null}

            <TempUnschedSection t={t} enabled={tempUnschedEnabled} onEnabledChange={setTempUnschedEnabled} rules={tempUnschedRules} onRulesChange={setTempUnschedRules} presets={tempUnschedPresets} onAddRule={addTempUnschedRule} onRemoveRule={(index) => setTempUnschedRules((prev) => prev.filter((_, i) => i !== index))} onMoveRule={moveTempUnschedRule} getRuleKey={getTempUnschedRuleKey} />

            {form.platform === 'anthropic' || form.platform === 'antigravity' ? (
              <ToggleRow title={t('admin.accounts.interceptWarmupRequests')} description={t('admin.accounts.interceptWarmupRequestsDesc')} enabled={interceptWarmupRequests} onToggle={() => setInterceptWarmupRequests((v) => !v)} />
            ) : null}

            {/* Anthropic OAuth quota control - mirror EditAccountModal */}
            {form.platform === 'anthropic' && accountCategory === 'oauth-based' ? (
              <div className="space-y-4 border-t border-gray-200 pt-4 dark:border-dark-600">
                <div className="mb-3">
                  <h3 className="input-label mb-0 text-base font-semibold">{t('admin.accounts.quotaControl.title')}</h3>
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{t('admin.accounts.quotaControl.hint')}</p>
                </div>
                <div className="rounded-lg border border-gray-200 p-4 dark:border-dark-600">
                  <SectionLabel title={t('admin.accounts.quotaControl.windowCost.label')} hint={t('admin.accounts.quotaControl.windowCost.hint')} action={<ToggleSwitch enabled={quotaControl.windowCostEnabled} onToggle={() => updateQuotaControl({ windowCostEnabled: !quotaControl.windowCostEnabled })} />} />
                  {quotaControl.windowCostEnabled ? (
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="input-label">{t('admin.accounts.quotaControl.windowCost.limit')}</label>
                        <input value={quotaControl.windowCostLimit ?? ''} onChange={(e) => updateQuotaControl({ windowCostLimit: e.target.value === '' ? null : Number(e.target.value) })} type="number" min={0} className="input" />
                      </div>
                      <div>
                        <label className="input-label">{t('admin.accounts.quotaControl.windowCost.stickyReserve')}</label>
                        <input value={quotaControl.windowCostStickyReserve ?? ''} onChange={(e) => updateQuotaControl({ windowCostStickyReserve: e.target.value === '' ? null : Number(e.target.value) })} type="number" min={0} className="input" />
                      </div>
                    </div>
                  ) : null}
                </div>
                <div className="rounded-lg border border-gray-200 p-4 dark:border-dark-600">
                  <SectionLabel title={t('admin.accounts.quotaControl.sessionLimit.label')} hint={t('admin.accounts.quotaControl.sessionLimit.hint')} action={<ToggleSwitch enabled={quotaControl.sessionLimitEnabled} onToggle={() => updateQuotaControl({ sessionLimitEnabled: !quotaControl.sessionLimitEnabled })} />} />
                  {quotaControl.sessionLimitEnabled ? (
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="input-label">{t('admin.accounts.quotaControl.sessionLimit.maxSessions')}</label>
                        <input value={quotaControl.maxSessions ?? ''} onChange={(e) => updateQuotaControl({ maxSessions: e.target.value === '' ? null : Number(e.target.value) })} type="number" min={1} className="input" />
                      </div>
                      <div>
                        <label className="input-label">{t('admin.accounts.quotaControl.sessionLimit.idleTimeout')}</label>
                        <input value={quotaControl.sessionIdleTimeout ?? ''} onChange={(e) => updateQuotaControl({ sessionIdleTimeout: e.target.value === '' ? null : Number(e.target.value) })} type="number" min={1} className="input" />
                      </div>
                    </div>
                  ) : null}
                </div>
                <div className="rounded-lg border border-gray-200 p-4 dark:border-dark-600">
                  <SectionLabel title={t('admin.accounts.quotaControl.rpmLimit.label')} hint={t('admin.accounts.quotaControl.rpmLimit.hint')} action={<ToggleSwitch enabled={quotaControl.rpmLimitEnabled} onToggle={() => updateQuotaControl({ rpmLimitEnabled: !quotaControl.rpmLimitEnabled })} />} />
                  {quotaControl.rpmLimitEnabled ? (
                    <div className="space-y-4">
                      <input value={quotaControl.baseRpm ?? ''} onChange={(e) => updateQuotaControl({ baseRpm: e.target.value === '' ? null : Number(e.target.value) })} type="number" min={1} max={1000} className="input" placeholder={t('admin.accounts.quotaControl.rpmLimit.baseRpmPlaceholder')} />
                      <div className="flex gap-2">
                        {(['tiered', 'sticky_exempt'] as const).map((strategy) => (
                          <button key={strategy} type="button" onClick={() => updateQuotaControl({ rpmStrategy: strategy })} className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium ${quotaControl.rpmStrategy === strategy ? 'bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400' : 'bg-gray-100 text-gray-600 dark:bg-dark-600'}`}>
                            {strategy === 'tiered' ? t('admin.accounts.quotaControl.rpmLimit.strategyTiered') : t('admin.accounts.quotaControl.rpmLimit.strategyStickyExempt')}
                          </button>
                        ))}
                      </div>
                      {quotaControl.rpmStrategy === 'tiered' ? (
                        <input value={quotaControl.rpmStickyBuffer ?? ''} onChange={(e) => updateQuotaControl({ rpmStickyBuffer: e.target.value === '' ? null : Number(e.target.value) })} type="number" min={1} className="input" />
                      ) : null}
                    </div>
                  ) : null}
                  <div className="mt-4 flex space-x-2">
                    {umqModeOptions.map((opt) => (
                      <button key={opt.value} type="button" onClick={() => updateQuotaControl({ userMsgQueueMode: opt.value })} className={`rounded-md border px-3 py-1.5 text-sm ${quotaControl.userMsgQueueMode === opt.value ? 'border-primary-600 bg-primary-600 text-white' : 'border-gray-300 bg-white dark:border-dark-500 dark:bg-dark-700'}`}>
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="rounded-lg border border-gray-200 p-4 dark:border-dark-600">
                  <SectionLabel title={t('admin.accounts.quotaControl.tlsFingerprint.label')} hint={t('admin.accounts.quotaControl.tlsFingerprint.hint')} action={<ToggleSwitch enabled={quotaControl.tlsFingerprintEnabled} onToggle={() => updateQuotaControl({ tlsFingerprintEnabled: !quotaControl.tlsFingerprintEnabled })} />} />
                  {quotaControl.tlsFingerprintEnabled ? (
                    <select value={quotaControl.tlsFingerprintProfileId ?? ''} onChange={(e) => updateQuotaControl({ tlsFingerprintProfileId: e.target.value === '' ? null : Number(e.target.value) })} className="input mt-3">
                      <option value="">{t('admin.accounts.quotaControl.tlsFingerprint.defaultProfile')}</option>
                      {tlsFingerprintProfiles.length > 0 ? <option value={-1}>{t('admin.accounts.quotaControl.tlsFingerprint.randomProfile')}</option> : null}
                      {tlsFingerprintProfiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  ) : null}
                </div>
                <ToggleRow title={t('admin.accounts.quotaControl.sessionIdMasking.label')} description={t('admin.accounts.quotaControl.sessionIdMasking.hint')} enabled={quotaControl.sessionIdMaskingEnabled} onToggle={() => updateQuotaControl({ sessionIdMaskingEnabled: !quotaControl.sessionIdMaskingEnabled })} />
                <div className="rounded-lg border border-gray-200 p-4 dark:border-dark-600">
                  <SectionLabel title={t('admin.accounts.quotaControl.cacheTTLOverride.label')} hint={t('admin.accounts.quotaControl.cacheTTLOverride.hint')} action={<ToggleSwitch enabled={quotaControl.cacheTTLOverrideEnabled} onToggle={() => updateQuotaControl({ cacheTTLOverrideEnabled: !quotaControl.cacheTTLOverrideEnabled })} />} />
                  {quotaControl.cacheTTLOverrideEnabled ? (
                    <select value={quotaControl.cacheTTLOverrideTarget} onChange={(e) => updateQuotaControl({ cacheTTLOverrideTarget: e.target.value })} className="input mt-3">
                      <option value="5m">5m</option>
                      <option value="1h">1h</option>
                    </select>
                  ) : null}
                </div>
                <div className="rounded-lg border border-gray-200 p-4 dark:border-dark-600">
                  <SectionLabel title={t('admin.accounts.quotaControl.customBaseUrl.label')} hint={t('admin.accounts.quotaControl.customBaseUrl.hint')} action={<ToggleSwitch enabled={quotaControl.customBaseUrlEnabled} onToggle={() => updateQuotaControl({ customBaseUrlEnabled: !quotaControl.customBaseUrlEnabled })} />} />
                  {quotaControl.customBaseUrlEnabled ? (
                    <input value={quotaControl.customBaseUrl} onChange={(e) => updateQuotaControl({ customBaseUrl: e.target.value })} type="text" className="input mt-3" placeholder={t('admin.accounts.quotaControl.customBaseUrl.urlHint')} />
                  ) : null}
                </div>
              </div>
            ) : null}

            <div>
              <div className="mb-1 flex items-center gap-2">
                <label className="input-label mb-0">{t('admin.accounts.proxy')}</label>
                <ProxyAdBanner />
              </div>
              <ProxySelector modelValue={form.proxy_id} proxies={proxies} onUpdateModelValue={(value) => setForm((prev) => ({ ...prev, proxy_id: value }))} />
            </div>

            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <div>
                <label className="input-label">{t('admin.accounts.concurrency')}</label>
                <input value={form.concurrency} onChange={(e) => setForm((prev) => ({ ...prev, concurrency: Math.max(1, Number(e.target.value) || 1) }))} type="number" min={1} className="input" />
              </div>
              <div>
                <label className="input-label">{t('admin.accounts.loadFactor')}</label>
                <input value={form.load_factor ?? ''} onChange={(e) => { const val = e.target.value === '' ? null : Number(e.target.value); setForm((prev) => ({ ...prev, load_factor: val != null && val >= 1 ? val : null })) }} type="number" min={1} className="input" placeholder={String(form.concurrency || 1)} />
                <p className="input-hint">{t('admin.accounts.loadFactorHint')}</p>
              </div>
              <div>
                <label className="input-label">{t('admin.accounts.priority')}</label>
                <input value={form.priority} onChange={(e) => setForm((prev) => ({ ...prev, priority: Number(e.target.value) }))} type="number" min={1} className="input" data-tour="account-form-priority" />
                <p className="input-hint">{t('admin.accounts.priorityHint')}</p>
              </div>
              <div>
                <label className="input-label">{t('admin.accounts.billingRateMultiplier')}</label>
                <input value={form.rate_multiplier} onChange={(e) => setForm((prev) => ({ ...prev, rate_multiplier: Number(e.target.value) }))} type="number" min={0} step={0.001} className="input" />
                <p className="input-hint">{t('admin.accounts.billingRateMultiplierHint')}</p>
              </div>
            </div>

            <div className="border-t border-gray-200 pt-4 dark:border-dark-600">
              <label className="input-label">{t('admin.accounts.expiresAt')}</label>
              <input value={expiresAtInput} onChange={(e) => setForm((prev) => ({ ...prev, expires_at: parseDateTimeLocalInput(e.target.value) }))} type="datetime-local" className="input" />
              <p className="input-hint">{t('admin.accounts.expiresAtHint')}</p>
            </div>

            {form.platform === 'openai' ? (
              <ToggleRow title={t('admin.accounts.openai.oauthPassthrough')} description={t('admin.accounts.openai.oauthPassthroughDesc')} enabled={openaiPassthroughEnabled} onToggle={() => setOpenaiPassthroughEnabled((v) => !v)} />
            ) : null}

            {form.platform === 'openai' && (accountCategory === 'oauth-based' || accountCategory === 'apikey') ? (
              <div className="border-t border-gray-200 pt-4 dark:border-dark-600">
                <div className="flex items-center justify-between">
                  <div>
                    <label className="input-label mb-0">{t('admin.accounts.openai.wsMode')}</label>
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{t('admin.accounts.openai.wsModeDesc')}</p>
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{t(openAIWSModeConcurrencyHintKey)}</p>
                  </div>
                  <div className="w-52">
                    <Select modelValue={openaiResponsesWebSocketV2Mode} options={openAIWSModeOptions} onUpdateModelValue={(value) => setOpenaiResponsesWebSocketV2Mode(value as OpenAIWSMode)} />
                  </div>
                </div>
              </div>
            ) : null}

            {form.platform === 'anthropic' && accountCategory === 'apikey' ? (
              <>
                <ToggleRow title={t('admin.accounts.anthropic.apiKeyPassthrough')} description={t('admin.accounts.anthropic.apiKeyPassthroughDesc')} enabled={anthropicPassthroughEnabled} onToggle={() => setAnthropicPassthroughEnabled((v) => !v)} />
                {webSearchGlobalEnabled ? (
                  <div className="flex items-center justify-between border-t border-gray-200 pt-4 dark:border-dark-600">
                    <div>
                      <label className="input-label mb-0">{t('admin.accounts.anthropic.webSearchEmulation')}</label>
                      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{t('admin.accounts.anthropic.webSearchEmulationDesc')}</p>
                    </div>
                    <select value={webSearchEmulationMode} onChange={(e) => setWebSearchEmulationMode(e.target.value)} className="input w-24 text-sm">
                      <option value="default">{t('admin.accounts.anthropic.webSearchDefault')}</option>
                      <option value="enabled">{t('admin.accounts.anthropic.webSearchEnabled')}</option>
                      <option value="disabled">{t('admin.accounts.anthropic.webSearchDisabled')}</option>
                    </select>
                  </div>
                ) : null}
              </>
            ) : null}

            {form.platform === 'openai' && accountCategory === 'oauth-based' ? (
              <>
                <ToggleRow title={t('admin.accounts.openai.codexCLIOnly')} description={t('admin.accounts.openai.codexCLIOnlyDesc')} enabled={codexCLIOnlyEnabled} onToggle={() => setCodexCLIOnlyEnabled((v) => !v)} />
                {codexCLIOnlyEnabled ? (
                  <ToggleRow title={t('admin.accounts.openai.codexCLIOnlyAllowClaudeCode')} description={t('admin.accounts.openai.codexCLIOnlyAllowClaudeCodeDesc')} enabled={codexCLIOnlyAllowClaudeCodeEnabled} onToggle={() => setCodexCLIOnlyAllowClaudeCodeEnabled((v) => !v)} />
                ) : null}
              </>
            ) : null}

            {form.platform === 'openai' && (accountCategory === 'oauth-based' || accountCategory === 'apikey') ? (
              <div className="space-y-4 border-t border-gray-200 pt-4 dark:border-dark-600">
                <div className="flex items-center justify-between">
                  <div>
                    <label className="input-label mb-0">{t('admin.accounts.openai.compactMode')}</label>
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{t('admin.accounts.openai.compactModeDesc')}</p>
                  </div>
                  <div className="w-44">
                    <Select modelValue={openAICompactMode} options={openAICompactModeOptions} onUpdateModelValue={(value) => setOpenAICompactMode(value as OpenAICompactMode)} />
                  </div>
                </div>
                <div>
                  <label className="input-label">{t('admin.accounts.openai.compactModelMapping')}</label>
                  <ModelMappingList t={t} modelMappings={openAICompactModelMappings} onChange={setOpenAICompactModelMappings} onAdd={addOpenAICompactModelMapping} onRemove={removeOpenAICompactModelMapping} getKey={getOpenAICompactModelMappingKey} compact />
                </div>
              </div>
            ) : null}

            {form.platform === 'openai' && accountCategory === 'apikey' ? (
              <div className="space-y-4 border-t border-gray-200 pt-4 dark:border-dark-600">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <label className="input-label mb-0">{t('admin.accounts.openai.responsesMode')}</label>
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{t('admin.accounts.openai.responsesModeDesc')}</p>
                  </div>
                  <div className="w-56">
                    <Select modelValue={openAIResponsesMode} options={openAIResponsesModeOptions} disabled={!openAITextGenerationCapabilityEnabled} onUpdateModelValue={(value) => setOpenAIResponsesMode(value as OpenAIResponsesMode)} />
                  </div>
                </div>
                {!openAITextGenerationCapabilityEnabled ? (
                  <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:bg-amber-900/20 dark:text-amber-300">{t('admin.accounts.openai.responsesModeTextDisabledHint')}</p>
                ) : null}
                <div>
                  <label className="input-label mb-2 block">{t('admin.accounts.openai.endpointCapabilities')}</label>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {openAIEndpointCapabilityOptions.map((option) => (
                      <label key={option.value} className="flex cursor-pointer items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm dark:border-dark-600">
                        <input type="checkbox" checked={openAIEndpointCapabilities.includes(option.value)} onChange={(e) => toggleOpenAIEndpointCapability(option.value, e.target.checked)} className="rounded border-gray-300 text-primary-600" />
                        <span className="text-gray-700 dark:text-gray-200">{option.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            ) : null}

            <ToggleRow title={t('admin.accounts.autoPauseOnExpired')} description={t('admin.accounts.autoPauseOnExpiredDesc')} enabled={autoPauseOnExpired} onToggle={() => setAutoPauseOnExpired((v) => !v)} />

            <div className="border-t border-gray-200 pt-4 dark:border-dark-600">
              {form.platform === 'antigravity' ? (
                <>
                  <div className="flex items-center gap-2">
                    <label className="flex cursor-pointer items-center gap-2">
                      <input type="checkbox" checked={mixedScheduling} onChange={(e) => setMixedScheduling(e.target.checked)} className="h-4 w-4 rounded border-gray-300 text-primary-500" />
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{t('admin.accounts.mixedScheduling')}</span>
                    </label>
                    <HelpTooltip text={t('admin.accounts.mixedSchedulingTooltip')} />
                  </div>
                  <div className="mt-3 flex items-center gap-2">
                    <label className="flex cursor-pointer items-center gap-2">
                      <input type="checkbox" checked={allowOverages} onChange={(e) => setAllowOverages(e.target.checked)} className="h-4 w-4 rounded border-gray-300 text-primary-500" />
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{t('admin.accounts.allowOverages')}</span>
                    </label>
                    <HelpTooltip text={t('admin.accounts.allowOveragesTooltip')} />
                  </div>
                </>
              ) : null}
              {!isSimpleMode ? (
                <GroupSelector modelValue={form.group_ids} groups={groups} platform={form.platform} mixedScheduling={mixedScheduling} onUpdateModelValue={(value) => setForm((prev) => ({ ...prev, group_ids: value }))} data-tour="account-form-groups" />
              ) : null}
            </div>
          </form>
        ) : (
          <div className="space-y-5">
            <OAuthAuthorizationFlow
              ref={oauthFlowRef}
              addMethod={form.platform === 'anthropic' ? addMethod : 'oauth'}
              authUrl={currentAuthUrl}
              sessionId={currentSessionId}
              loading={currentOAuthLoading}
              error={currentOAuthError}
              showHelp={form.platform === 'anthropic'}
              showProxyWarning={form.platform !== 'openai' && !!form.proxy_id}
              allowMultiple={form.platform === 'anthropic'}
              showCookieOption={form.platform === 'anthropic'}
              showRefreshTokenOption={form.platform === 'openai' || form.platform === 'antigravity'}
              showMobileRefreshTokenOption={form.platform === 'openai'}
              showSessionTokenOption={false}
              showAccessTokenOption={false}
              showCodexSessionImportOption={form.platform === 'openai'}
              platform={form.platform}
              showProjectId={geminiOAuthType === 'code_assist'}
              onGenerateUrl={() => void handleGenerateUrl()}
              onCookieAuth={(key) => void handleCookieAuth(key)}
              onValidateRefreshToken={handleValidateRefreshToken}
              onValidateMobileRefreshToken={handleOpenAIValidateMobileRT}
              onValidateSessionToken={() => {}}
              onImportCodexSession={(content) => void handleOpenAIImportCodexSession(content)}
            />
          </div>
        )}
      </BaseDialog>

      <ConfirmDialog
        show={showMixedChannelWarning}
        title={t('admin.accounts.mixedChannelWarningTitle')}
        message={mixedChannelWarningMessageText}
        confirmText={t('common.confirm')}
        cancelText={t('common.cancel')}
        danger
        onConfirm={() => void handleMixedChannelConfirm()}
        onCancel={() => clearMixedChannelDialog()}
      />

      <BaseDialog
        show={showGeminiHelpDialog}
        title={t('admin.accounts.gemini.helpDialog.title')}
        width="extra-wide"
        onClose={() => setShowGeminiHelpDialog(false)}
        footer={
          <div className="flex justify-end">
            <button type="button" className="btn btn-primary" onClick={() => setShowGeminiHelpDialog(false)}>
              {t('common.close')}
            </button>
          </div>
        }
      >
        <div className="space-y-6">
          <div>
            <h3 className="mb-3 text-sm font-semibold text-gray-900 dark:text-white">
              {t('admin.accounts.gemini.setupGuide.title')}
            </h3>
            <div className="space-y-4">
              <div>
                <p className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                  {t('admin.accounts.gemini.setupGuide.checklistTitle')}
                </p>
                <ul className="list-inside list-disc space-y-1 text-sm text-gray-600 dark:text-gray-400">
                  <li>{t('admin.accounts.gemini.setupGuide.checklistItems.usIp')}</li>
                  <li>{t('admin.accounts.gemini.setupGuide.checklistItems.age')}</li>
                </ul>
              </div>
              <div>
                <p className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                  {t('admin.accounts.gemini.setupGuide.activationTitle')}
                </p>
                <ul className="list-inside list-disc space-y-1 text-sm text-gray-600 dark:text-gray-400">
                  <li>{t('admin.accounts.gemini.setupGuide.activationItems.geminiWeb')}</li>
                  <li>{t('admin.accounts.gemini.setupGuide.activationItems.gcpProject')}</li>
                </ul>
                <div className="mt-2 flex flex-wrap gap-2">
                  <a href={geminiHelpLinks.countryCheck} target="_blank" rel="noreferrer" className="text-sm text-blue-600 hover:underline dark:text-blue-400">
                    {t('admin.accounts.gemini.setupGuide.links.countryCheck')}
                  </a>
                  <span className="text-gray-400">·</span>
                  <a href={geminiHelpLinks.countryChange} target="_blank" rel="noreferrer" className="text-sm text-blue-600 hover:underline dark:text-blue-400">
                    修改归属地
                  </a>
                  <span className="text-gray-400">·</span>
                  <a href={geminiHelpLinks.geminiWebActivation} target="_blank" rel="noreferrer" className="text-sm text-blue-600 hover:underline dark:text-blue-400">
                    {t('admin.accounts.gemini.setupGuide.links.geminiWebActivation')}
                  </a>
                  <span className="text-gray-400">·</span>
                  <a href={geminiHelpLinks.gcpProject} target="_blank" rel="noreferrer" className="text-sm text-blue-600 hover:underline dark:text-blue-400">
                    {t('admin.accounts.gemini.setupGuide.links.gcpProject')}
                  </a>
                </div>
              </div>
            </div>
          </div>

          <div className="border-t border-gray-200 pt-6 dark:border-dark-600">
            <h3 className="mb-3 text-sm font-semibold text-gray-900 dark:text-white">
              {t('admin.accounts.gemini.quotaPolicy.title')}
            </h3>
            <p className="mb-4 text-xs text-amber-600 dark:text-amber-400">
              {t('admin.accounts.gemini.quotaPolicy.note')}
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 dark:bg-dark-600">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium text-gray-700 dark:text-gray-300">
                      {t('admin.accounts.gemini.quotaPolicy.columns.channel')}
                    </th>
                    <th className="px-3 py-2 text-left font-medium text-gray-700 dark:text-gray-300">
                      {t('admin.accounts.gemini.quotaPolicy.columns.account')}
                    </th>
                    <th className="px-3 py-2 text-left font-medium text-gray-700 dark:text-gray-300">
                      {t('admin.accounts.gemini.quotaPolicy.columns.limits')}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-dark-600">
                  <tr>
                    <td className="px-3 py-2 text-gray-900 dark:text-white">{t('admin.accounts.gemini.quotaPolicy.rows.googleOne.channel')}</td>
                    <td className="px-3 py-2 text-gray-600 dark:text-gray-400">Free</td>
                    <td className="px-3 py-2 text-gray-600 dark:text-gray-400">{t('admin.accounts.gemini.quotaPolicy.rows.googleOne.limitsFree')}</td>
                  </tr>
                  <tr>
                    <td className="px-3 py-2 text-gray-900 dark:text-white" />
                    <td className="px-3 py-2 text-gray-600 dark:text-gray-400">Pro</td>
                    <td className="px-3 py-2 text-gray-600 dark:text-gray-400">{t('admin.accounts.gemini.quotaPolicy.rows.googleOne.limitsPro')}</td>
                  </tr>
                  <tr>
                    <td className="px-3 py-2 text-gray-900 dark:text-white" />
                    <td className="px-3 py-2 text-gray-600 dark:text-gray-400">Ultra</td>
                    <td className="px-3 py-2 text-gray-600 dark:text-gray-400">{t('admin.accounts.gemini.quotaPolicy.rows.googleOne.limitsUltra')}</td>
                  </tr>
                  <tr>
                    <td className="px-3 py-2 text-gray-900 dark:text-white">{t('admin.accounts.gemini.quotaPolicy.rows.gcp.channel')}</td>
                    <td className="px-3 py-2 text-gray-600 dark:text-gray-400">Standard</td>
                    <td className="px-3 py-2 text-gray-600 dark:text-gray-400">{t('admin.accounts.gemini.quotaPolicy.rows.gcp.limitsStandard')}</td>
                  </tr>
                  <tr>
                    <td className="px-3 py-2 text-gray-900 dark:text-white" />
                    <td className="px-3 py-2 text-gray-600 dark:text-gray-400">Enterprise</td>
                    <td className="px-3 py-2 text-gray-600 dark:text-gray-400">{t('admin.accounts.gemini.quotaPolicy.rows.gcp.limitsEnterprise')}</td>
                  </tr>
                  <tr>
                    <td className="px-3 py-2 text-gray-900 dark:text-white">{t('admin.accounts.gemini.quotaPolicy.rows.aiStudio.channel')}</td>
                    <td className="px-3 py-2 text-gray-600 dark:text-gray-400">Free</td>
                    <td className="px-3 py-2 text-gray-600 dark:text-gray-400">{t('admin.accounts.gemini.quotaPolicy.rows.aiStudio.limitsFree')}</td>
                  </tr>
                  <tr>
                    <td className="px-3 py-2 text-gray-900 dark:text-white" />
                    <td className="px-3 py-2 text-gray-600 dark:text-gray-400">Paid</td>
                    <td className="px-3 py-2 text-gray-600 dark:text-gray-400">{t('admin.accounts.gemini.quotaPolicy.rows.aiStudio.limitsPaid')}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div className="mt-4 flex flex-wrap gap-3">
              <a href={geminiQuotaDocs.codeAssist} target="_blank" rel="noreferrer" className="text-sm text-blue-600 hover:underline dark:text-blue-400">
                {t('admin.accounts.gemini.quotaPolicy.docs.codeAssist')}
              </a>
              <a href={geminiQuotaDocs.aiStudio} target="_blank" rel="noreferrer" className="text-sm text-blue-600 hover:underline dark:text-blue-400">
                {t('admin.accounts.gemini.quotaPolicy.docs.aiStudio')}
              </a>
              <a href={geminiQuotaDocs.vertex} target="_blank" rel="noreferrer" className="text-sm text-blue-600 hover:underline dark:text-blue-400">
                {t('admin.accounts.gemini.quotaPolicy.docs.vertex')}
              </a>
            </div>
          </div>

          <div className="border-t border-gray-200 pt-6 dark:border-dark-600">
            <h3 className="mb-3 text-sm font-semibold text-gray-900 dark:text-white">
              {t('admin.accounts.gemini.helpDialog.apiKeySection')}
            </h3>
            <div className="flex flex-wrap gap-3">
              <a href={geminiHelpLinks.apiKey} target="_blank" rel="noreferrer" className="text-sm text-blue-600 hover:underline dark:text-blue-400">
                {t('admin.accounts.gemini.accountType.apiKeyLink')}
              </a>
              <a href={geminiHelpLinks.aiStudioPricing} target="_blank" rel="noreferrer" className="text-sm text-blue-600 hover:underline dark:text-blue-400">
                {t('admin.accounts.gemini.accountType.quotaLink')}
              </a>
            </div>
          </div>
        </div>
      </BaseDialog>
    </>
  )
}
