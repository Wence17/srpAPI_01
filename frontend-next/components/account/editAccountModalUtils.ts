import type { Account } from '@/lib/types'
import {
  buildModelMappingObject,
  splitModelMappingObject,
} from '@/lib/useModelWhitelist'
import type { OpenAIEndpointCapability, OpenAIResponsesMode } from '@/lib/types'

export interface ModelMapping {
  from: string
  to: string
}

export interface TempUnschedRuleForm {
  error_code: number | null
  keywords: string
  duration_minutes: number | null
  description: string
}

export const DEFAULT_POOL_MODE_RETRY_COUNT = 3
export const MAX_POOL_MODE_RETRY_COUNT = 10
export const DEFAULT_POOL_MODE_RETRY_STATUS_CODES = [401, 403, 429]

export function parsePoolModeRetryStatusCodes(input: string): number[] {
  if (!input || !input.trim()) return []
  const seen = new Set<number>()
  const out: number[] = []
  for (const token of input.split(/[,\s]+/)) {
    const trimmed = token.trim()
    if (!trimmed) continue
    const n = Number(trimmed)
    if (!Number.isFinite(n) || !Number.isInteger(n)) continue
    if (n < 100 || n > 599) continue
    if (seen.has(n)) continue
    seen.add(n)
    out.push(n)
  }
  return out.sort((a, b) => a - b)
}

export function formatPoolModeRetryStatusCodes(value: unknown): string {
  if (!Array.isArray(value)) return ''
  const out: number[] = []
  const seen = new Set<number>()
  for (const v of value) {
    const n = typeof v === 'string' ? Number(v.trim()) : Number(v)
    if (!Number.isFinite(n) || !Number.isInteger(n)) continue
    if (n < 100 || n > 599) continue
    if (seen.has(n)) continue
    seen.add(n)
    out.push(n)
  }
  return out.sort((a, b) => a - b).join(', ')
}

export function normalizePoolModeRetryCount(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_POOL_MODE_RETRY_COUNT
  const normalized = Math.trunc(value)
  if (normalized < 0) return 0
  if (normalized > MAX_POOL_MODE_RETRY_COUNT) return MAX_POOL_MODE_RETRY_COUNT
  return normalized
}

export function toPositiveNumber(value: unknown): number | null {
  const num = Number(value)
  if (!Number.isFinite(num) || num <= 0) return null
  return Math.trunc(num)
}

export function formatTempUnschedKeywords(value: unknown): string {
  if (Array.isArray(value)) {
    return value
      .filter((item): item is string => typeof item === 'string')
      .map((item) => item.trim())
      .filter((item) => item.length > 0)
      .join(', ')
  }
  if (typeof value === 'string') return value
  return ''
}

export function splitTempUnschedKeywords(value: string): string[] {
  return value
    .split(/[,;]/)
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
}

export function buildTempUnschedRules(rules: TempUnschedRuleForm[]) {
  const out: Array<{
    error_code: number
    keywords: string[]
    duration_minutes: number
    description: string
  }> = []

  for (const rule of rules) {
    const errorCode = Number(rule.error_code)
    const duration = Number(rule.duration_minutes)
    const keywords = splitTempUnschedKeywords(rule.keywords)
    if (!Number.isFinite(errorCode) || errorCode < 100 || errorCode > 599) continue
    if (!Number.isFinite(duration) || duration <= 0) continue
    if (keywords.length === 0) continue
    out.push({
      error_code: Math.trunc(errorCode),
      keywords,
      duration_minutes: Math.trunc(duration),
      description: rule.description.trim(),
    })
  }

  return out
}

export function loadTempUnschedRulesFromCredentials(credentials?: Record<string, unknown>): {
  enabled: boolean
  rules: TempUnschedRuleForm[]
} {
  const enabled = credentials?.temp_unschedulable_enabled === true
  const rawRules = credentials?.temp_unschedulable_rules
  if (!Array.isArray(rawRules)) {
    return { enabled, rules: [] }
  }

  const rules = rawRules.map((rule) => {
    const entry = rule as Record<string, unknown>
    return {
      error_code: toPositiveNumber(entry.error_code),
      keywords: formatTempUnschedKeywords(entry.keywords),
      duration_minutes: toPositiveNumber(entry.duration_minutes),
      description: typeof entry.description === 'string' ? entry.description : '',
    }
  })

  return { enabled, rules }
}

export function loadModelRestrictionFromMapping(rawMapping?: Record<string, unknown>) {
  const parsed = splitModelMappingObject(rawMapping)
  const modelRestrictionMode: 'whitelist' | 'mapping' =
    parsed.modelMappings.length > 0 && parsed.allowedModels.length === 0 ? 'mapping' : 'whitelist'
  return {
    allowedModels: parsed.allowedModels,
    modelMappings: parsed.modelMappings,
    modelRestrictionMode,
  }
}

export function buildModelRestrictionMapping(allowedModels: string[], modelMappings: ModelMapping[]) {
  return buildModelMappingObject('combined', allowedModels, modelMappings)
}

export function normalizeOpenAIResponsesMode(mode: unknown): OpenAIResponsesMode {
  if (mode === 'force_responses' || mode === 'force_chat_completions') return mode
  return 'auto'
}

export function normalizeOpenAIEndpointCapabilities(values: OpenAIEndpointCapability[]) {
  const allowed: OpenAIEndpointCapability[] = ['chat_completions', 'embeddings']
  const selected = allowed.filter((value) => values.includes(value))
  return selected.length > 0 ? selected : allowed
}

export function readOpenAIEndpointCapabilities(credentials?: Record<string, unknown>): OpenAIEndpointCapability[] {
  const raw = credentials?.openai_capabilities
  if (Array.isArray(raw)) {
    return normalizeOpenAIEndpointCapabilities(
      raw.filter(
        (value): value is OpenAIEndpointCapability =>
          value === 'chat_completions' || value === 'embeddings',
      ),
    )
  }
  if (raw !== null && typeof raw === 'object') {
    const capabilityMap = raw as Record<string, unknown>
    return normalizeOpenAIEndpointCapabilities(
      (['chat_completions', 'embeddings'] as OpenAIEndpointCapability[]).filter(
        (value) => capabilityMap[value] === true,
      ),
    )
  }
  return ['chat_completions', 'embeddings']
}

export function applyOpenAIEndpointCapabilities(
  credentials: Record<string, unknown>,
  capabilities: OpenAIEndpointCapability[],
) {
  const normalized = normalizeOpenAIEndpointCapabilities(capabilities)
  if (normalized.length === 2) {
    delete credentials.openai_capabilities
    return
  }
  credentials.openai_capabilities = normalized
}

export interface QuotaControlState {
  windowCostEnabled: boolean
  windowCostLimit: number | null
  windowCostStickyReserve: number | null
  sessionLimitEnabled: boolean
  maxSessions: number | null
  sessionIdleTimeout: number | null
  rpmLimitEnabled: boolean
  baseRpm: number | null
  rpmStrategy: 'tiered' | 'sticky_exempt'
  rpmStickyBuffer: number | null
  userMsgQueueMode: string
  tlsFingerprintEnabled: boolean
  tlsFingerprintProfileId: number | null
  sessionIdMaskingEnabled: boolean
  cacheTTLOverrideEnabled: boolean
  cacheTTLOverrideTarget: string
  customBaseUrlEnabled: boolean
  customBaseUrl: string
}

export function initialQuotaControlState(): QuotaControlState {
  return {
    windowCostEnabled: false,
    windowCostLimit: null,
    windowCostStickyReserve: null,
    sessionLimitEnabled: false,
    maxSessions: null,
    sessionIdleTimeout: null,
    rpmLimitEnabled: false,
    baseRpm: null,
    rpmStrategy: 'tiered',
    rpmStickyBuffer: null,
    userMsgQueueMode: '',
    tlsFingerprintEnabled: false,
    tlsFingerprintProfileId: null,
    sessionIdMaskingEnabled: false,
    cacheTTLOverrideEnabled: false,
    cacheTTLOverrideTarget: '5m',
    customBaseUrlEnabled: false,
    customBaseUrl: '',
  }
}

export function loadQuotaControlSettings(account: Account): QuotaControlState {
  const state = initialQuotaControlState()
  if (account.platform !== 'anthropic') return state
  if (account.type !== 'oauth' && account.type !== 'setup-token') return state

  if (account.window_cost_limit != null && account.window_cost_limit > 0) {
    state.windowCostEnabled = true
    state.windowCostLimit = account.window_cost_limit
    state.windowCostStickyReserve = account.window_cost_sticky_reserve ?? 10
  }

  if (account.max_sessions != null && account.max_sessions > 0) {
    state.sessionLimitEnabled = true
    state.maxSessions = account.max_sessions
    state.sessionIdleTimeout = account.session_idle_timeout_minutes ?? 5
  }

  if (account.base_rpm != null && account.base_rpm > 0) {
    state.rpmLimitEnabled = true
    state.baseRpm = account.base_rpm
    state.rpmStrategy = (account.rpm_strategy as 'tiered' | 'sticky_exempt') || 'tiered'
    state.rpmStickyBuffer = account.rpm_sticky_buffer ?? null
  }

  state.userMsgQueueMode = account.user_msg_queue_mode ?? ''

  if (account.enable_tls_fingerprint === true) {
    state.tlsFingerprintEnabled = true
  }
  state.tlsFingerprintProfileId = account.tls_fingerprint_profile_id ?? null

  if (account.session_id_masking_enabled === true) {
    state.sessionIdMaskingEnabled = true
  }

  if (account.cache_ttl_override_enabled === true) {
    state.cacheTTLOverrideEnabled = true
    state.cacheTTLOverrideTarget = account.cache_ttl_override_target || '5m'
  }

  if (account.custom_base_url_enabled === true) {
    state.customBaseUrlEnabled = true
    state.customBaseUrl = account.custom_base_url || ''
  }

  return state
}

export function defaultBaseUrlForPlatform(platform: string | undefined): string {
  if (platform === 'openai') return 'https://api.openai.com'
  if (platform === 'gemini') return 'https://generativelanguage.googleapis.com'
  if (platform === 'antigravity') return 'https://cloudcode-pa.googleapis.com'
  return 'https://api.anthropic.com'
}
