'use client'

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type ClipboardEvent,
  type DragEvent,
} from 'react'
import AppLayout from '@/components/layout/AppLayout'
import BaseDialog from '@/components/common/BaseDialog'
import Icon from '@/components/icons/Icon'
import Select, { type SelectOption } from '@/components/common/Select'
import Toggle from '@/components/common/Toggle'
import Pagination from '@/components/common/Pagination'
import ModelWhitelistSelector from '@/components/account/ModelWhitelistSelector'
import { useI18n } from '@/lib/i18n'
import { useApp } from '@/context/AppContext'
import { extractApiErrorMessage } from '@/lib/apiError'
import { formatDateTime, formatNumber } from '@/lib/format'
import { adminGroupsAPI } from '@/lib/adminGroups'
import {
  adminRiskControlAPI,
  type ContentModerationAPIKeyLoad,
  type ContentModerationAPIKeyStatus,
  type ContentModerationConfig,
  type ContentModerationLog,
  type ContentModerationModelFilter,
  type ContentModerationModelFilterType,
  type ContentModerationRuntimeStatus,
  type ContentModerationTestAuditResult,
  type KeywordBlockingMode,
  type ModerationMode,
  type UpdateContentModerationConfig,
} from '@/lib/adminRiskControl'
import type { AdminGroup } from '@/lib/types'

type SettingsTab = 'basic' | 'scope' | 'runtime' | 'response' | 'riskThresholds' | 'retention' | 'keywords'
type WorkerSlotState = 'active' | 'idle' | 'disabled'
type APIKeysWriteMode = 'append' | 'replace'
type OverviewIcon = 'shield' | 'key' | 'users' | 'document'

interface OverviewItem {
  key: string
  label: string
  value: string
  meta: string
  icon: OverviewIcon
  iconClass: string
  badge?: string
  badgeClass?: string
}

interface ModerationScoreRow {
  category: string
  score: number
  threshold: number
  hit: boolean
}

interface RiskThresholdRow {
  category: string
  value: number
  defaultValue: number
}

interface ConfigFormState {
  enabled: boolean
  mode: ModerationMode
  base_url: string
  model: string
  api_keys_text: string
  api_key_configured: boolean
  api_key_masked: string
  api_key_count: number
  api_key_masks: string[]
  api_key_statuses: ContentModerationAPIKeyStatus[]
  api_keys_mode: APIKeysWriteMode
  clear_api_key: boolean
  timeout_ms: number
  retry_count: number
  sample_rate: number
  all_groups: boolean
  group_ids: number[]
  record_non_hits: boolean
  worker_count: number
  queue_size: number
  block_status: number
  block_message: string
  email_on_hit: boolean
  auto_ban_enabled: boolean
  ban_threshold: number
  violation_window_hours: number
  hit_retention_days: number
  non_hit_retention_days: number
  pre_hash_check_enabled: boolean
  thresholds: Record<string, number>
  blocked_keywords_text: string
  keyword_blocking_mode: KeywordBlockingMode
  model_filter_type: ContentModerationModelFilterType
  model_filter_models: string[]
}

const maxModerationTestImages = 1
const maxModerationTestImageSize = 8 * 1024 * 1024
const maxVisibleApiKeyRows = 3
const blockedKeywordMax = 10000

const riskThresholdDefaults: Record<string, number> = {
  harassment: 98,
  'harassment/threatening': 90,
  hate: 65,
  'hate/threatening': 65,
  illicit: 95,
  'illicit/violent': 95,
  'self-harm': 65,
  'self-harm/intent': 85,
  'self-harm/instructions': 65,
  sexual: 65,
  'sexual/minors': 65,
  violence: 95,
  'violence/graphic': 95,
}

const riskThresholdCategories = Object.keys(riskThresholdDefaults)

const initialConfigForm = (): ConfigFormState => ({
  enabled: false,
  mode: 'pre_block',
  base_url: 'https://api.openai.com',
  model: 'omni-moderation-latest',
  api_keys_text: '',
  api_key_configured: false,
  api_key_masked: '',
  api_key_count: 0,
  api_key_masks: [],
  api_key_statuses: [],
  api_keys_mode: 'append',
  clear_api_key: false,
  timeout_ms: 3000,
  retry_count: 2,
  sample_rate: 100,
  all_groups: true,
  group_ids: [],
  record_non_hits: false,
  worker_count: 4,
  queue_size: 32768,
  block_status: 403,
  block_message: '内容审计命中风险规则，请调整输入后重试',
  email_on_hit: true,
  auto_ban_enabled: true,
  ban_threshold: 10,
  violation_window_hours: 720,
  hit_retention_days: 180,
  non_hit_retention_days: 3,
  pre_hash_check_enabled: false,
  thresholds: { ...riskThresholdDefaults },
  blocked_keywords_text: '',
  keyword_blocking_mode: 'keyword_and_api',
  model_filter_type: 'all',
  model_filter_models: [],
})

function clampPercent(value: unknown): number {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return 0
  return Math.min(100, Math.max(0, numeric))
}

function formatThresholdPercent(value: number): string {
  return `${clampPercent(value).toFixed(1)}%`
}

function parseApiKeys(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter((item, index, arr) => item && arr.indexOf(item) === index)
}

function parseBlockedKeywords(value: string): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const line of value.split(/\r?\n/)) {
    const kw = line.trim()
    if (!kw) continue
    const key = kw.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(kw)
  }
  return out
}

function normalizeKeywordBlockingMode(value: unknown): KeywordBlockingMode {
  if (value === 'keyword_only' || value === 'api_only' || value === 'keyword_and_api') return value
  return 'keyword_and_api'
}

function normalizeModelFilterType(value: unknown): ContentModerationModelFilterType {
  if (value === 'include' || value === 'exclude' || value === 'all') return value
  return 'all'
}

function normalizeModelNames(models: unknown): string[] {
  if (!Array.isArray(models)) return []
  const seen = new Set<string>()
  const out: string[] = []
  for (const item of models) {
    const model = String(item ?? '').trim()
    if (!model) continue
    const key = model.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(model)
  }
  return out
}

function normalizeModelFilter(value: unknown): ContentModerationModelFilter {
  if (!value || typeof value !== 'object') return { type: 'all', models: [] }
  const raw = value as Partial<ContentModerationModelFilter>
  const type = normalizeModelFilterType(raw.type)
  const models = type === 'all' ? [] : normalizeModelNames(raw.models)
  return { type, models }
}

function riskThresholdsFromConfig(thresholds: Record<string, number> | null | undefined): Record<string, number> {
  const out: Record<string, number> = { ...riskThresholdDefaults }
  for (const category of riskThresholdCategories) {
    const value = thresholds?.[category]
    if (Number.isFinite(value)) {
      out[category] = clampPercent(Number(value) * 100)
    }
  }
  return out
}

function buildRiskThresholdPayload(thresholds: Record<string, number>): Record<string, number> {
  const payload: Record<string, number> = {}
  for (const category of riskThresholdCategories) {
    payload[category] = Number((clampPercent(thresholds[category]) / 100).toFixed(4))
  }
  return payload
}

function buildModelFilterPayload(form: ConfigFormState): ContentModerationModelFilter {
  const type = normalizeModelFilterType(form.model_filter_type)
  if (type === 'all') return { type: 'all', models: [] }
  return { type, models: normalizeModelNames(form.model_filter_models) }
}

function normalizeDateTimeLocal(value: string): string | undefined {
  if (!value) return undefined
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return undefined
  return date.toISOString()
}

function percent(value: number): string {
  if (!Number.isFinite(value)) return '-'
  return `${(value * 100).toFixed(1)}%`
}

function percentWidth(value: number): string {
  if (!Number.isFinite(value)) return '0%'
  return `${Math.min(100, Math.max(0, value * 100)).toFixed(1)}%`
}

function latencyText(value: number | null): string {
  if (value === null || value === undefined) return '-'
  return `${value} ms`
}

function fileToDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

function applyConfigToForm(config: ContentModerationConfig): ConfigFormState {
  const modelFilter = normalizeModelFilter(config.model_filter)
  return {
    ...initialConfigForm(),
    enabled: config.enabled,
    mode: config.mode,
    base_url: config.base_url || 'https://api.openai.com',
    model: config.model || 'omni-moderation-latest',
    api_key_configured: config.api_key_configured,
    api_key_masked: config.api_key_masked || '',
    api_key_count: config.api_key_count || 0,
    api_key_masks: Array.isArray(config.api_key_masks) ? [...config.api_key_masks] : [],
    api_key_statuses: Array.isArray(config.api_key_statuses) ? [...config.api_key_statuses] : [],
    timeout_ms: config.timeout_ms || 3000,
    retry_count: config.retry_count ?? 2,
    sample_rate: config.sample_rate ?? 100,
    all_groups: config.all_groups,
    group_ids: Array.isArray(config.group_ids) ? [...config.group_ids] : [],
    record_non_hits: config.record_non_hits,
    worker_count: config.worker_count || 4,
    queue_size: config.queue_size || 32768,
    block_status: config.block_status || 403,
    block_message: config.block_message || '内容审计命中风险规则，请调整输入后重试',
    email_on_hit: config.email_on_hit ?? true,
    auto_ban_enabled: config.auto_ban_enabled ?? true,
    ban_threshold: config.ban_threshold || 10,
    violation_window_hours: config.violation_window_hours || 720,
    hit_retention_days: config.hit_retention_days || 180,
    non_hit_retention_days: Math.min(Math.max(config.non_hit_retention_days || 3, 1), 3),
    pre_hash_check_enabled: config.pre_hash_check_enabled ?? false,
    thresholds: riskThresholdsFromConfig(config.thresholds),
    blocked_keywords_text: Array.isArray(config.blocked_keywords) ? config.blocked_keywords.join('\n') : '',
    keyword_blocking_mode: normalizeKeywordBlockingMode(config.keyword_blocking_mode),
    model_filter_type: modelFilter.type,
    model_filter_models: modelFilter.models,
  }
}

export default function RiskControlPage() {
  const { t } = useI18n()
  const appStore = useApp()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [logsLoading, setLogsLoading] = useState(false)
  const [statusLoading, setStatusLoading] = useState(false)
  const [apiKeyTesting, setApiKeyTesting] = useState(false)
  const [hashActionLoading, setHashActionLoading] = useState(false)
  const [unbanningUserID, setUnbanningUserID] = useState<number | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [activeSettingsTab, setActiveSettingsTab] = useState<SettingsTab>('basic')
  const [groupSearch, setGroupSearch] = useState('')
  const [flaggedHashInput, setFlaggedHashInput] = useState('')
  const [groups, setGroups] = useState<AdminGroup[]>([])
  const [logs, setLogs] = useState<ContentModerationLog[]>([])
  const [status, setStatus] = useState<ContentModerationRuntimeStatus | null>(null)
  const [testedApiKeyStatuses, setTestedApiKeyStatuses] = useState<ContentModerationAPIKeyStatus[]>([])
  const [pendingDeleteApiKeyHashes, setPendingDeleteApiKeyHashes] = useState<string[]>([])
  const [apiKeyRowsExpanded, setApiKeyRowsExpanded] = useState(false)
  const [moderationTestPrompt, setModerationTestPrompt] = useState('')
  const [moderationTestImages, setModerationTestImages] = useState<string[]>([])
  const [moderationTestResult, setModerationTestResult] = useState<ContentModerationTestAuditResult | null>(null)
  const [inputDetailRow, setInputDetailRow] = useState<ContentModerationLog | null>(null)
  const [configForm, setConfigForm] = useState<ConfigFormState>(initialConfigForm)
  const [pagination, setPagination] = useState({ page: 1, page_size: 20, total: 0, pages: 1 })
  const [filters, setFilters] = useState({
    result: '',
    group_id: 0,
    endpoint: '',
    search: '',
    from: '',
    to: '',
  })

  const statusTimerRef = useRef<number | null>(null)
  const pendingDeleteRef = useRef(pendingDeleteApiKeyHashes)
  pendingDeleteRef.current = pendingDeleteApiKeyHashes

  const patchConfigForm = useCallback((patch: Partial<ConfigFormState>) => {
    setConfigForm((prev) => ({ ...prev, ...patch }))
  }, [])

  const modeOptions = useMemo<SelectOption[]>(
    () => [
      { value: 'pre_block', label: t('admin.riskControl.modePreBlock') },
      { value: 'observe', label: t('admin.riskControl.modeObserve') },
      { value: 'off', label: t('admin.riskControl.modeOff') },
    ],
    [t],
  )

  const modeLabel = useCallback(
    (mode: ModerationMode) => modeOptions.find((option) => option.value === mode)?.label ?? mode,
    [modeOptions],
  )

  const modeDescription = useCallback(
    (mode: ModerationMode) => {
      const descriptions: Record<ModerationMode, string> = {
        pre_block: t('admin.riskControl.modePreBlockDesc'),
        observe: t('admin.riskControl.modeObserveDesc'),
        off: t('admin.riskControl.modeOffDesc'),
      }
      return descriptions[mode] ?? ''
    },
    [t],
  )

  const settingsTabs = useMemo<Array<{ id: SettingsTab; label: string }>>(
    () => [
      { id: 'basic', label: t('admin.riskControl.tabs.basic') },
      { id: 'scope', label: t('admin.riskControl.tabs.scope') },
      { id: 'runtime', label: t('admin.riskControl.tabs.runtime') },
      { id: 'response', label: t('admin.riskControl.tabs.response') },
      { id: 'riskThresholds', label: t('admin.riskControl.tabs.riskThresholds') },
      { id: 'keywords', label: t('admin.riskControl.tabs.keywords') },
      { id: 'retention', label: t('admin.riskControl.tabs.retention') },
    ],
    [t],
  )

  const resultOptions = useMemo<SelectOption[]>(
    () => [
      { value: '', label: t('admin.riskControl.result.all') },
      { value: 'hit', label: t('admin.riskControl.result.hit') },
      { value: 'blocked', label: t('admin.riskControl.result.blocked') },
      { value: 'pass', label: t('admin.riskControl.result.pass') },
      { value: 'error', label: t('admin.riskControl.result.error') },
    ],
    [t],
  )

  const endpointOptions = useMemo<SelectOption[]>(
    () => [
      { value: '', label: t('admin.riskControl.filters.allEndpoints') },
      { value: '/v1/messages', label: '/v1/messages' },
      { value: '/v1/responses', label: '/v1/responses' },
      { value: '/v1/chat/completions', label: '/v1/chat/completions' },
      { value: '/v1beta/models', label: '/v1beta/models' },
      { value: '/v1/images/generations', label: '/v1/images/generations' },
      { value: '/v1/images/edits', label: '/v1/images/edits' },
    ],
    [t],
  )

  const groupFilterOptions = useMemo<SelectOption[]>(
    () => [
      { value: 0, label: t('admin.riskControl.filters.allGroups') },
      ...groups.map((group) => ({
        value: group.id,
        label: `${group.name} (${group.platform})`,
      })),
    ],
    [groups, t],
  )

  const keywordBlockingModeOptions = useMemo(
    () => [
      {
        value: 'keyword_and_api' as KeywordBlockingMode,
        label: t('admin.riskControl.keywordModeKeywordAndApi'),
        description: t('admin.riskControl.keywordModeKeywordAndApiDesc'),
      },
      {
        value: 'keyword_only' as KeywordBlockingMode,
        label: t('admin.riskControl.keywordModeKeywordOnly'),
        description: t('admin.riskControl.keywordModeKeywordOnlyDesc'),
      },
      {
        value: 'api_only' as KeywordBlockingMode,
        label: t('admin.riskControl.keywordModeApiOnly'),
        description: t('admin.riskControl.keywordModeApiOnlyDesc'),
      },
    ],
    [t],
  )

  const modelFilterOptions = useMemo(
    () => [
      {
        value: 'all' as ContentModerationModelFilterType,
        label: t('admin.riskControl.modelFilterAll'),
        description: t('admin.riskControl.modelFilterAllDesc'),
      },
      {
        value: 'include' as ContentModerationModelFilterType,
        label: t('admin.riskControl.modelFilterInclude'),
        description: t('admin.riskControl.modelFilterIncludeDesc'),
      },
      {
        value: 'exclude' as ContentModerationModelFilterType,
        label: t('admin.riskControl.modelFilterExclude'),
        description: t('admin.riskControl.modelFilterExcludeDesc'),
      },
    ],
    [t],
  )

  const inputApiKeyCount = useMemo(() => parseApiKeys(configForm.api_keys_text).length, [configForm.api_keys_text])
  const blockedKeywordList = useMemo(() => parseBlockedKeywords(configForm.blocked_keywords_text), [configForm.blocked_keywords_text])
  const blockedKeywordCount = blockedKeywordList.length
  const pendingDeletedApiKeyCount = pendingDeleteApiKeyHashes.length
  const effectiveStoredApiKeyCount = Math.max(0, configForm.api_key_count - pendingDeletedApiKeyCount)
  const hasModerationAuditInput = moderationTestPrompt.trim() !== '' || moderationTestImages.length > 0
  const isFlaggedHashInputValid = /^[a-fA-F0-9]{64}$/.test(flaggedHashInput.trim())

  const savedApiKeyRows = useMemo(() => {
    const rows = status?.api_key_statuses?.length ? status.api_key_statuses : configForm.api_key_statuses
    return Array.isArray(rows) ? rows : []
  }, [status?.api_key_statuses, configForm.api_key_statuses])

  const apiKeyRows = useMemo(
    () => [...savedApiKeyRows, ...testedApiKeyStatuses],
    [savedApiKeyRows, testedApiKeyStatuses],
  )

  const visibleApiKeyRows = useMemo(
    () => (apiKeyRowsExpanded ? apiKeyRows : apiKeyRows.slice(0, maxVisibleApiKeyRows)),
    [apiKeyRows, apiKeyRowsExpanded],
  )

  const hiddenApiKeyRowCount = Math.max(0, apiKeyRows.length - visibleApiKeyRows.length)
  const canToggleApiKeyRows = apiKeyRows.length > maxVisibleApiKeyRows

  const isStoredApiKeyPendingDelete = useCallback(
    (row: ContentModerationAPIKeyStatus) =>
      row.configured && row.key_hash !== '' && pendingDeleteApiKeyHashes.includes(row.key_hash),
    [pendingDeleteApiKeyHashes],
  )

  const activeSavedApiKeyRows = useMemo(
    () => savedApiKeyRows.filter((row) => !isStoredApiKeyPendingDelete(row)),
    [savedApiKeyRows, isStoredApiKeyPendingDelete],
  )

  const apiKeyHealthBadges = useMemo(() => {
    const counts: Record<ContentModerationAPIKeyStatus['status'], number> = {
      ok: 0,
      error: 0,
      frozen: 0,
      unknown: 0,
    }
    for (const row of activeSavedApiKeyRows) {
      counts[row.status] = (counts[row.status] ?? 0) + 1
    }
    if (activeSavedApiKeyRows.length === 0 && effectiveStoredApiKeyCount > 0) {
      counts.unknown = effectiveStoredApiKeyCount
    }
    return (['ok', 'frozen', 'error', 'unknown'] as ContentModerationAPIKeyStatus['status'][])
      .map((item) => ({ status: item, count: counts[item] }))
      .filter((item) => item.count > 0)
  }, [activeSavedApiKeyRows, effectiveStoredApiKeyCount])

  const apiKeyStatusLabel = useCallback(
    (statusValue: ContentModerationAPIKeyStatus['status']) => {
      const labels: Record<ContentModerationAPIKeyStatus['status'], string> = {
        ok: t('admin.riskControl.apiKeyStatusOk'),
        error: t('admin.riskControl.apiKeyStatusError'),
        frozen: t('admin.riskControl.apiKeyStatusFrozen'),
        unknown: t('admin.riskControl.apiKeyStatusUnknown'),
      }
      return labels[statusValue] ?? labels.unknown
    },
    [t],
  )

  const apiKeyHealthSummary = useMemo(() => {
    if (!configForm.api_key_configured) return ''
    if (apiKeyHealthBadges.length === 0) return t('admin.riskControl.apiKeyStatusUnknown')
    return apiKeyHealthBadges.map((badge) => `${apiKeyStatusLabel(badge.status)} ${badge.count}`).join(' · ')
  }, [apiKeyHealthBadges, apiKeyStatusLabel, configForm.api_key_configured, t])

  const modelFilterSummary = useMemo(() => {
    const count = configForm.model_filter_models.length
    if (configForm.model_filter_type === 'include') {
      return t('admin.riskControl.modelFilterIncludeSummary', { count: String(count) })
    }
    if (configForm.model_filter_type === 'exclude') {
      return t('admin.riskControl.modelFilterExcludeSummary', { count: String(count) })
    }
    return t('admin.riskControl.modelFilterAllSummary')
  }, [configForm.model_filter_models.length, configForm.model_filter_type, t])

  const modelFilterPreviewModels = useMemo(() => configForm.model_filter_models.slice(0, 6), [configForm.model_filter_models])
  const hiddenModelFilterModelCount = Math.max(0, configForm.model_filter_models.length - modelFilterPreviewModels.length)

  const filteredGroups = useMemo(() => {
    const keyword = groupSearch.trim().toLowerCase()
    if (!keyword) return groups
    return groups.filter(
      (group) =>
        group.name.toLowerCase().includes(keyword) || String(group.platform).toLowerCase().includes(keyword),
    )
  }, [groupSearch, groups])

  const runtimeBadgeText = useMemo(() => {
    if (!status?.risk_control_enabled) return t('admin.riskControl.riskSwitchOff')
    if (!configForm.enabled || configForm.mode === 'off') return t('admin.riskControl.overview.disabled')
    return t('admin.riskControl.overview.enabled')
  }, [configForm.enabled, configForm.mode, status?.risk_control_enabled, t])

  const runtimeBadgeClass = useMemo(() => {
    if (!status?.risk_control_enabled || !configForm.enabled || configForm.mode === 'off') {
      return 'bg-gray-100 text-gray-600 dark:bg-dark-700 dark:text-gray-300'
    }
    return 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300'
  }, [configForm.enabled, configForm.mode, status?.risk_control_enabled])

  const overviewItems = useMemo<OverviewItem[]>(
    () => [
      {
        key: 'status',
        label: t('admin.riskControl.overview.status'),
        value: configForm.enabled ? t('admin.riskControl.overview.enabled') : t('admin.riskControl.overview.disabled'),
        meta: modeLabel(configForm.mode),
        icon: 'shield',
        iconClass: configForm.enabled
          ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-300'
          : 'bg-gray-100 text-gray-500 dark:bg-dark-700 dark:text-gray-400',
        badge: runtimeBadgeText,
        badgeClass: runtimeBadgeClass,
      },
      {
        key: 'api-key',
        label: t('admin.riskControl.overview.apiKey'),
        value: configForm.api_key_configured
          ? t('admin.riskControl.apiKeyCount', { count: String(configForm.api_key_count) })
          : t('admin.riskControl.notConfigured'),
        meta: configForm.api_key_configured ? apiKeyHealthSummary || configForm.model || '-' : configForm.model || '-',
        icon: 'key',
        iconClass: 'bg-sky-50 text-sky-600 dark:bg-sky-900/20 dark:text-sky-300',
      },
      {
        key: 'scope',
        label: t('admin.riskControl.overview.groupScope'),
        value: configForm.all_groups ? t('admin.riskControl.allGroups') : String(configForm.group_ids.length),
        meta: modelFilterSummary,
        icon: 'users',
        iconClass: 'bg-violet-50 text-violet-600 dark:bg-violet-900/20 dark:text-violet-300',
      },
      {
        key: 'logs',
        label: t('admin.riskControl.overview.logs'),
        value: formatNumber(pagination.total),
        meta: t('admin.riskControl.overview.currentFilter'),
        icon: 'document',
        iconClass: 'bg-amber-50 text-amber-600 dark:bg-amber-900/20 dark:text-amber-300',
      },
    ],
    [
      apiKeyHealthSummary,
      configForm,
      modeLabel,
      modelFilterSummary,
      pagination.total,
      runtimeBadgeClass,
      runtimeBadgeText,
      t,
    ],
  )

  const moderationScoreRows = useMemo<ModerationScoreRow[]>(() => {
    const result = moderationTestResult
    if (!result) return []
    return Object.entries(result.category_scores || {})
      .map(([category, score]) => {
        const threshold = result.thresholds?.[category] ?? 1
        return { category, score, threshold, hit: score >= threshold }
      })
      .sort((a, b) => b.score - a.score)
  }, [moderationTestResult])

  const riskThresholdRows = useMemo<RiskThresholdRow[]>(
    () =>
      riskThresholdCategories.map((category) => ({
        category,
        value: configForm.thresholds[category] ?? riskThresholdDefaults[category],
        defaultValue: riskThresholdDefaults[category],
      })),
    [configForm.thresholds],
  )

  const queueUsagePercent = `${Math.min(100, Math.max(0, status?.queue_usage_percent ?? 0)).toFixed(1)}%`
  const runtimeMode: ModerationMode = status?.mode ?? configForm.mode
  const showPreBlockRuntimeCard = runtimeMode === 'pre_block'
  const showWorkerRuntimeCard = runtimeMode === 'observe'

  const preBlockMetricItems = useMemo(
    () => [
      {
        key: 'active',
        label: t('admin.riskControl.preBlockActive'),
        value: formatNumber(status?.pre_block_active ?? 0),
        meta: t('admin.riskControl.preBlockActiveHint'),
        class: 'bg-sky-50 dark:bg-sky-900/10',
        valueClass: 'text-sky-700 dark:text-sky-300',
      },
      {
        key: 'checked',
        label: t('admin.riskControl.preBlockChecked'),
        value: formatNumber(status?.pre_block_checked ?? 0),
        meta: t('admin.riskControl.preBlockCheckedHint'),
        class: 'bg-gray-50 dark:bg-dark-700/50',
        valueClass: 'text-gray-900 dark:text-white',
      },
      {
        key: 'allowed',
        label: t('admin.riskControl.preBlockAllowed'),
        value: formatNumber(status?.pre_block_allowed ?? 0),
        meta: t('admin.riskControl.preBlockAllowedHint'),
        class: 'bg-emerald-50 dark:bg-emerald-900/10',
        valueClass: 'text-emerald-700 dark:text-emerald-300',
      },
      {
        key: 'blocked',
        label: t('admin.riskControl.preBlockBlocked'),
        value: formatNumber(status?.pre_block_blocked ?? 0),
        meta: t('admin.riskControl.preBlockBlockedHint'),
        class: 'bg-rose-50 dark:bg-rose-900/10',
        valueClass: 'text-rose-700 dark:text-rose-300',
      },
      {
        key: 'errors',
        label: t('admin.riskControl.preBlockErrors'),
        value: formatNumber(status?.pre_block_errors ?? 0),
        meta: t('admin.riskControl.preBlockErrorsHint'),
        class: 'bg-amber-50 dark:bg-amber-900/10',
        valueClass: 'text-amber-700 dark:text-amber-300',
      },
      {
        key: 'latency',
        label: t('admin.riskControl.preBlockAvgLatency'),
        value: `${formatNumber(status?.pre_block_avg_latency_ms ?? 0)} ms`,
        meta: t('admin.riskControl.preBlockAvgLatencyHint'),
        class: 'bg-violet-50 dark:bg-violet-900/10',
        valueClass: 'text-violet-700 dark:text-violet-300',
      },
    ],
    [status, t],
  )

  const preBlockAPIKeyLoads = useMemo<ContentModerationAPIKeyLoad[]>(
    () => [...(status?.pre_block_api_key_loads ?? [])].sort((a, b) => a.index - b.index),
    [status?.pre_block_api_key_loads],
  )

  const preBlockAPIKeyMaxTotal = useMemo(
    () => Math.max(1, ...preBlockAPIKeyLoads.map((item) => item.total || 0)),
    [preBlockAPIKeyLoads],
  )

  const preBlockAPIKeyLoadSummaryText = t('admin.riskControl.preBlockAPIKeyLoadSummary', {
    active: formatNumber(status?.pre_block_api_key_active ?? 0),
    available: formatNumber(status?.pre_block_api_key_available_count ?? 0),
    total: formatNumber(status?.pre_block_api_key_total_calls ?? 0),
    workerActive: formatNumber(status?.active_workers ?? 0),
    workerTotal: formatNumber(status?.worker_count ?? configForm.worker_count),
  })

  const preBlockAPIKeyLoadWidth = useCallback(
    (total: number) => `${Math.min(100, Math.max(0, (total / preBlockAPIKeyMaxTotal) * 100)).toFixed(1)}%`,
    [preBlockAPIKeyMaxTotal],
  )

  const workerSlots = useMemo(() => {
    const total = Math.max(0, status?.worker_count ?? configForm.worker_count)
    const active = Math.max(0, status?.active_workers ?? 0)
    const enabled = Boolean(status?.risk_control_enabled && status?.enabled && status?.mode !== 'off')
    return Array.from({ length: total }, (_, index) => ({
      id: index + 1,
      state: (!enabled ? 'disabled' : index < active ? 'active' : 'idle') as WorkerSlotState,
      label: !enabled
        ? t('admin.riskControl.workerDisabled')
        : index < active
          ? t('admin.riskControl.workerActive')
          : t('admin.riskControl.workerIdle'),
    }))
  }, [configForm.worker_count, status, t])

  const keywordNotice = useMemo(() => {
    const tones = {
      info: {
        icon: 'infoCircle' as const,
        toneClass: 'border-primary-100 bg-primary-50/60 dark:border-primary-900/40 dark:bg-primary-900/10',
        iconClass: 'mt-0.5 flex-shrink-0 text-primary-500 dark:text-primary-300',
        titleClass: 'text-primary-700 dark:text-primary-200',
      },
      warning: {
        icon: 'exclamationTriangle' as const,
        toneClass: 'border-amber-200 bg-amber-50 dark:border-amber-900/40 dark:bg-amber-900/20',
        iconClass: 'mt-0.5 flex-shrink-0 text-amber-500 dark:text-amber-300',
        titleClass: 'text-amber-700 dark:text-amber-200',
      },
    }
    const strategy = configForm.keyword_blocking_mode
    if (strategy === 'api_only') {
      return {
        ...tones.info,
        title: t('admin.riskControl.keywordModeApiOnlyNotice'),
        description: t('admin.riskControl.keywordModeApiOnlyDesc'),
      }
    }
    if (configForm.mode !== 'pre_block') {
      return {
        ...tones.warning,
        title: t('admin.riskControl.blockedKeywordsModeWarning', { mode: modeLabel(configForm.mode) }),
        description: t('admin.riskControl.blockedKeywordsDescription'),
      }
    }
    if (strategy === 'keyword_only') {
      return {
        ...tones.info,
        title: t('admin.riskControl.keywordModeKeywordOnlyNotice'),
        description: t('admin.riskControl.keywordModeKeywordOnlyDesc'),
      }
    }
    return {
      ...tones.info,
      title: t('admin.riskControl.blockedKeywordsPreBlockHint'),
      description: t('admin.riskControl.blockedKeywordsDescription'),
    }
  }, [configForm.keyword_blocking_mode, configForm.mode, modeLabel, t])

  const storedApiKeyTestButtonText = apiKeyTesting
    ? t('admin.riskControl.testingApiKeys')
    : hasModerationAuditInput
      ? t('admin.riskControl.testContentWithStoredApiKey')
      : t('admin.riskControl.testStoredApiKeys')

  const apiKeysPlaceholder =
    configForm.api_keys_mode === 'replace'
      ? t('admin.riskControl.apiKeysPlaceholderReplace')
      : t('admin.riskControl.apiKeysPlaceholder')

  const apiKeysModeHint =
    configForm.api_keys_mode === 'replace'
      ? t('admin.riskControl.apiKeysModeReplaceHint')
      : t('admin.riskControl.apiKeysModeAppendHint')

  const inputDetailText = inputDetailRow?.input_excerpt || inputDetailRow?.error || '-'

  const prunePendingDeleteAPIKeyHashes = useCallback((rows: ContentModerationAPIKeyStatus[]) => {
    const currentHashes = new Set(rows.map((row) => row.key_hash).filter(Boolean))
    setPendingDeleteApiKeyHashes((prev) => prev.filter((hash) => currentHashes.has(hash)))
  }, [])

  const loadLogs = useCallback(async () => {
    setLogsLoading(true)
    try {
      const result = await adminRiskControlAPI.listLogs({
        page: pagination.page,
        page_size: pagination.page_size,
        result: filters.result || undefined,
        group_id: filters.group_id || undefined,
        endpoint: filters.endpoint || undefined,
        search: filters.search || undefined,
        from: normalizeDateTimeLocal(filters.from),
        to: normalizeDateTimeLocal(filters.to),
      })
      setLogs(result.items)
      setPagination({
        page: result.page,
        page_size: result.page_size,
        total: result.total,
        pages: result.pages,
      })
    } catch (err: unknown) {
      appStore.showError(extractApiErrorMessage(err, t('admin.riskControl.logsFailed')))
    } finally {
      setLogsLoading(false)
    }
  }, [appStore, filters, pagination.page, pagination.page_size, t])

  const loadStatus = useCallback(
    async (silent = true) => {
      setStatusLoading(true)
      try {
        const runtimeStatus = await adminRiskControlAPI.getStatus()
        setStatus(runtimeStatus)
        if (Array.isArray(runtimeStatus.api_key_statuses)) {
          setConfigForm((prev) => ({ ...prev, api_key_statuses: [...runtimeStatus.api_key_statuses] }))
          prunePendingDeleteAPIKeyHashes(runtimeStatus.api_key_statuses)
        }
      } catch (err: unknown) {
        if (!silent) {
          appStore.showError(extractApiErrorMessage(err, t('admin.riskControl.statusFailed')))
        }
      } finally {
        setStatusLoading(false)
      }
    },
    [appStore, prunePendingDeleteAPIKeyHashes, t],
  )

  const loadAll = useCallback(async () => {
    setLoading(true)
    try {
      const [config, groupItems, runtimeStatus] = await Promise.all([
        adminRiskControlAPI.getConfig(),
        adminGroupsAPI.getAll(),
        adminRiskControlAPI.getStatus(),
      ])
      const nextForm = applyConfigToForm(config)
      if (Array.isArray(runtimeStatus.api_key_statuses)) {
        nextForm.api_key_statuses = [...runtimeStatus.api_key_statuses]
        prunePendingDeleteAPIKeyHashes(runtimeStatus.api_key_statuses)
      }
      setConfigForm(nextForm)
      setGroups(groupItems)
      setStatus(runtimeStatus)
      setTestedApiKeyStatuses([])
      setPendingDeleteApiKeyHashes([])
      setApiKeyRowsExpanded(false)
    } catch (err: unknown) {
      appStore.showError(extractApiErrorMessage(err, t('admin.riskControl.loadFailed')))
    } finally {
      setLoading(false)
    }
  }, [appStore, prunePendingDeleteAPIKeyHashes, t])

  useEffect(() => {
    void loadAll()
  }, [loadAll])

  useEffect(() => {
    if (loading) return
    void loadLogs()
  }, [loadLogs, loading, filters, pagination.page, pagination.page_size])

  useEffect(() => {
    statusTimerRef.current = window.setInterval(() => {
      void loadStatus(true)
    }, 15000)
    return () => {
      if (statusTimerRef.current !== null) {
        window.clearInterval(statusTimerRef.current)
        statusTimerRef.current = null
      }
    }
  }, [loadStatus])

  const reloadLogsFromFirstPage = useCallback(() => {
    setPagination((prev) => ({ ...prev, page: 1 }))
  }, [])

  const onPageChange = useCallback((page: number) => {
    setPagination((prev) => ({ ...prev, page }))
  }, [])

  const onPageSizeChange = useCallback((pageSize: number) => {
    setPagination((prev) => ({ ...prev, page: 1, page_size: pageSize }))
  }, [])

  const saveConfig = async () => {
    setSaving(true)
    try {
      const modelFilterPayload = buildModelFilterPayload(configForm)
      if (modelFilterPayload.type !== 'all' && modelFilterPayload.models.length === 0) {
        appStore.showError(t('admin.riskControl.modelFilterModelsRequired'))
        return
      }
      const payload: UpdateContentModerationConfig = {
        enabled: configForm.enabled,
        mode: configForm.mode,
        base_url: configForm.base_url,
        model: configForm.model,
        timeout_ms: Number(configForm.timeout_ms) || 3000,
        retry_count: Number(configForm.retry_count) || 0,
        sample_rate: Number(configForm.sample_rate) || 0,
        all_groups: configForm.all_groups,
        group_ids: configForm.all_groups ? [] : [...configForm.group_ids],
        record_non_hits: configForm.record_non_hits,
        clear_api_key: configForm.clear_api_key,
        worker_count: Number(configForm.worker_count) || 4,
        queue_size: Number(configForm.queue_size) || 32768,
        block_status: Number(configForm.block_status) || 403,
        block_message: configForm.block_message || '内容审计命中风险规则，请调整输入后重试',
        email_on_hit: configForm.email_on_hit,
        auto_ban_enabled: configForm.auto_ban_enabled,
        ban_threshold: Number(configForm.ban_threshold) || 10,
        violation_window_hours: Number(configForm.violation_window_hours) || 720,
        hit_retention_days: Number(configForm.hit_retention_days) || 180,
        non_hit_retention_days: Math.min(Math.max(Number(configForm.non_hit_retention_days) || 3, 1), 3),
        pre_hash_check_enabled: configForm.pre_hash_check_enabled,
        thresholds: buildRiskThresholdPayload(configForm.thresholds),
        blocked_keywords: blockedKeywordList,
        keyword_blocking_mode: configForm.keyword_blocking_mode,
        model_filter: modelFilterPayload,
      }
      const keys = parseApiKeys(configForm.api_keys_text)
      if (!payload.clear_api_key && configForm.api_keys_mode === 'replace' && keys.length === 0) {
        appStore.showError(t('admin.riskControl.apiKeysReplaceNoInput'))
        return
      }
      if (keys.length > 0) {
        payload.api_keys = keys
        payload.api_keys_mode = configForm.api_keys_mode
        payload.clear_api_key = false
      }
      if (!payload.clear_api_key && configForm.api_keys_mode !== 'replace' && pendingDeleteRef.current.length > 0) {
        payload.delete_api_key_hashes = [...pendingDeleteRef.current]
      }

      const updated = await adminRiskControlAPI.updateConfig(payload)
      setConfigForm(applyConfigToForm(updated))
      setSettingsOpen(false)
      appStore.showSuccess(t('admin.riskControl.saved'))
      await Promise.all([loadStatus(true), loadLogs()])
    } catch (err: unknown) {
      appStore.showError(extractApiErrorMessage(err, t('admin.riskControl.saveFailed')))
    } finally {
      setSaving(false)
    }
  }

  const resultLabel = (row: ContentModerationLog) => {
    if (row.action === 'keyword_block') return t('admin.riskControl.action.keywordBlock')
    if (row.action === 'block') return t('admin.riskControl.action.block')
    if (row.action === 'error' || row.error) return t('admin.riskControl.action.error')
    if (row.flagged) return t('admin.riskControl.result.hit')
    return t('admin.riskControl.result.pass')
  }

  const resultBadgeClass = (row: ContentModerationLog) => {
    if (row.action === 'block' || row.action === 'keyword_block') {
      return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'
    }
    if (row.action === 'error' || row.error) {
      return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
    }
    if (row.flagged) return 'bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-300'
    return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
  }

  const workerSlotClass = (state: WorkerSlotState) => {
    if (state === 'active') {
      return 'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900/60 dark:bg-sky-900/20 dark:text-sky-300'
    }
    if (state === 'idle') {
      return 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-900/20 dark:text-emerald-300'
    }
    return 'border-gray-100 bg-white text-gray-400 dark:border-dark-700 dark:bg-dark-800 dark:text-gray-500'
  }

  const workerDotClass = (state: WorkerSlotState) => {
    if (state === 'active') return 'bg-sky-500'
    if (state === 'idle') return 'bg-emerald-500'
    return 'bg-gray-300 dark:bg-dark-500'
  }

  const apiKeyRowKey = (row: ContentModerationAPIKeyStatus, index: number) =>
    `${row.configured ? 'saved' : 'test'}-${row.key_hash || index}`

  const apiKeyStatusBadgeClass = (statusValue: ContentModerationAPIKeyStatus['status']) => {
    const classes: Record<ContentModerationAPIKeyStatus['status'], string> = {
      ok: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300',
      error: 'bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300',
      frozen: 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-300',
      unknown: 'bg-gray-100 text-gray-600 dark:bg-dark-700 dark:text-gray-300',
    }
    return classes[statusValue] ?? classes.unknown
  }

  const apiKeyStatusDotClass = (statusValue: ContentModerationAPIKeyStatus['status']) => {
    const classes: Record<ContentModerationAPIKeyStatus['status'], string> = {
      ok: 'bg-emerald-500',
      error: 'bg-amber-500',
      frozen: 'bg-red-500',
      unknown: 'bg-gray-400',
    }
    return classes[statusValue] ?? classes.unknown
  }

  const apiKeyStatusMeta = (row: ContentModerationAPIKeyStatus) => {
    const parts: string[] = []
    parts.push(t('admin.riskControl.apiKeyFailureCount', { count: String(row.failure_count || 0) }))
    if (row.last_latency_ms > 0) {
      parts.push(t('admin.riskControl.apiKeyLatency', { ms: String(row.last_latency_ms) }))
    }
    if (row.last_http_status > 0) {
      parts.push(t('admin.riskControl.apiKeyHTTPStatus', { status: String(row.last_http_status) }))
    }
    if (row.frozen_until) {
      parts.push(t('admin.riskControl.apiKeyFrozenUntil', { time: formatDateTime(row.frozen_until) }))
    } else if (row.last_checked_at) {
      parts.push(t('admin.riskControl.apiKeyLastChecked', { time: formatDateTime(row.last_checked_at) }))
    } else {
      parts.push(t('admin.riskControl.apiKeyNotTested'))
    }
    return parts.join(' / ')
  }

  const canUnbanRow = (row: ContentModerationLog) =>
    Boolean(row.auto_banned && row.user_id && row.user_status === 'disabled')

  const inputSummaryText = (row: ContentModerationLog) => row.input_excerpt || row.error || '-'

  const violationCountText = (row: ContentModerationLog) => {
    if (!row.flagged) return '-'
    return t('admin.riskControl.violationCount', { count: String(row.violation_count || 1) })
  }

  const unbanUserFromLog = async (row: ContentModerationLog) => {
    if (!row.user_id || unbanningUserID !== null) return
    setUnbanningUserID(row.user_id)
    try {
      const result = await adminRiskControlAPI.unbanUser(row.user_id)
      setLogs((prev) =>
        prev.map((item) => (item.user_id !== row.user_id ? item : { ...item, user_status: result.status })),
      )
      appStore.showSuccess(t('admin.riskControl.unbanSuccess'))
    } catch (err: unknown) {
      appStore.showError(extractApiErrorMessage(err, t('admin.riskControl.unbanFailed')))
    } finally {
      setUnbanningUserID(null)
    }
  }

  const deleteFlaggedHashAction = async () => {
    if (!isFlaggedHashInputValid || hashActionLoading) return
    setHashActionLoading(true)
    try {
      const result = await adminRiskControlAPI.deleteFlaggedHash(flaggedHashInput)
      setFlaggedHashInput('')
      await loadStatus(true)
      appStore.showSuccess(
        result.deleted ? t('admin.riskControl.flaggedHashDeleted') : t('admin.riskControl.flaggedHashNotFound'),
      )
    } catch (err: unknown) {
      appStore.showError(extractApiErrorMessage(err, t('admin.riskControl.flaggedHashDeleteFailed')))
    } finally {
      setHashActionLoading(false)
    }
  }

  const clearFlaggedHashesAction = async () => {
    if (hashActionLoading) return
    if (!window.confirm(t('admin.riskControl.clearFlaggedHashesConfirm'))) return
    setHashActionLoading(true)
    try {
      const result = await adminRiskControlAPI.clearFlaggedHashes()
      await loadStatus(true)
      appStore.showSuccess(t('admin.riskControl.flaggedHashesCleared', { count: String(result.deleted) }))
    } catch (err: unknown) {
      appStore.showError(extractApiErrorMessage(err, t('admin.riskControl.flaggedHashesClearFailed')))
    } finally {
      setHashActionLoading(false)
    }
  }

  const toggleClearApiKey = () => {
    const next = !configForm.clear_api_key
    patchConfigForm({
      clear_api_key: next,
      ...(next
        ? { api_keys_text: '', api_keys_mode: 'append' as APIKeysWriteMode }
        : {}),
    })
    if (next) {
      setTestedApiKeyStatuses([])
      setPendingDeleteApiKeyHashes([])
    }
  }

  const setAPIKeysMode = (mode: APIKeysWriteMode) => {
    patchConfigForm({ api_keys_mode: mode })
    if (mode === 'replace') setPendingDeleteApiKeyHashes([])
  }

  const setModelFilterType = (type: ContentModerationModelFilterType) => {
    patchConfigForm({
      model_filter_type: type,
      ...(type === 'all' ? { model_filter_models: [] } : {}),
    })
  }

  const mergeConfiguredAPIKeyStatuses = (items: ContentModerationAPIKeyStatus[]) => {
    if (!hasModerationAuditInput || configForm.api_key_statuses.length === 0) {
      patchConfigForm({ api_key_statuses: items })
      return
    }
    const updates = new Map(items.map((item) => [item.key_hash, item]))
    patchConfigForm({
      api_key_statuses: configForm.api_key_statuses.map((item) => updates.get(item.key_hash) ?? item),
    })
  }

  const testApiKeys = async (useInputKeys: boolean) => {
    const keys = useInputKeys ? parseApiKeys(configForm.api_keys_text) : []
    if (useInputKeys && keys.length === 0) {
      appStore.showError(t('admin.riskControl.apiKeyTestNoInput'))
      return
    }
    setApiKeyTesting(true)
    try {
      const result = await adminRiskControlAPI.testAPIKeys({
        api_keys: keys,
        base_url: configForm.base_url,
        model: configForm.model,
        timeout_ms: Number(configForm.timeout_ms) || 3000,
        prompt: moderationTestPrompt,
        images: moderationTestImages,
      })
      setModerationTestResult(result.audit_result ?? null)
      if (useInputKeys) {
        setTestedApiKeyStatuses(result.items.map((item) => ({ ...item, configured: false })))
      } else {
        mergeConfiguredAPIKeyStatuses(result.items)
        setTestedApiKeyStatuses([])
        await loadStatus(true)
      }
      appStore.showSuccess(t('admin.riskControl.apiKeyTestDone', { count: String(result.items.length) }))
    } catch (err: unknown) {
      appStore.showError(extractApiErrorMessage(err, t('admin.riskControl.apiKeyTestFailed')))
    } finally {
      setApiKeyTesting(false)
    }
  }

  const toggleDeleteStoredApiKey = (row: ContentModerationAPIKeyStatus) => {
    if (!row.configured || !row.key_hash) return
    setPendingDeleteApiKeyHashes((prev) =>
      prev.includes(row.key_hash) ? prev.filter((hash) => hash !== row.key_hash) : [...prev, row.key_hash],
    )
  }

  const clearModerationTestInput = () => {
    setModerationTestPrompt('')
    setModerationTestImages([])
    setModerationTestResult(null)
  }

  const addModerationTestFiles = async (files: FileList | File[] | null) => {
    if (!files) return
    const items = Array.from(files).filter((file) => file.type.startsWith('image/'))
    for (const file of items) {
      if (moderationTestImages.length >= maxModerationTestImages) {
        appStore.showError(t('admin.riskControl.auditTestImageLimit', { count: String(maxModerationTestImages) }))
        return
      }
      if (file.size > maxModerationTestImageSize) {
        appStore.showError(t('admin.riskControl.auditTestImageTooLarge'))
        continue
      }
      try {
        const dataUrl = await fileToDataURL(file)
        setModerationTestImages((prev) => [...prev, dataUrl])
      } catch {
        appStore.showError(t('admin.riskControl.auditTestImageReadFailed'))
      }
    }
  }

  const handleModerationImageUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    await addModerationTestFiles(event.target.files)
    event.target.value = ''
  }

  const handleModerationImageDrop = async (event: DragEvent<HTMLDivElement>) => {
    await addModerationTestFiles(event.dataTransfer?.files ?? null)
  }

  const handleModerationImagePaste = async (event: ClipboardEvent<HTMLDivElement>) => {
    const files = Array.from(event.clipboardData?.files ?? []).filter((file) => file.type.startsWith('image/'))
    if (files.length === 0) return
    event.preventDefault()
    await addModerationTestFiles(files)
  }

  const toggleGroup = (groupID: number) => {
    setConfigForm((prev) => {
      const index = prev.group_ids.indexOf(groupID)
      if (index >= 0) {
        return { ...prev, group_ids: prev.group_ids.filter((id) => id !== groupID) }
      }
      return { ...prev, group_ids: [...prev.group_ids, groupID] }
    })
  }

  const isGroupSelected = (groupID: number) => configForm.group_ids.includes(groupID)

  const resetRiskThresholds = () => {
    patchConfigForm({ thresholds: { ...riskThresholdDefaults } })
  }

  const openSettings = () => {
    setActiveSettingsTab('basic')
    setSettingsOpen(true)
  }

  return (
    <AppLayout>
      <div className="space-y-6">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary-600" />
          </div>
        ) : (
          <>
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">{t('admin.riskControl.title')}</h1>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{t('admin.riskControl.description')}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  className="btn btn-secondary inline-flex items-center gap-2"
                  disabled={statusLoading}
                  onClick={() => void loadStatus(false)}
                >
                  <Icon name="refresh" size="sm" className={statusLoading ? 'animate-spin' : ''} />
                  {t('admin.riskControl.refreshStatus')}
                </button>
                <button type="button" className="btn btn-primary inline-flex items-center gap-2" onClick={openSettings}>
                  <Icon name="cog" size="sm" />
                  {t('admin.riskControl.openSettings')}
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
              {overviewItems.map((item) => (
                <div
                  key={item.key}
                  className="rounded-lg border border-gray-100 bg-white px-4 py-3 shadow-sm dark:border-dark-700 dark:bg-dark-800"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <div className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg ${item.iconClass}`}>
                      <Icon name={item.icon} size="sm" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex min-w-0 items-center justify-between gap-2">
                        <p className="truncate text-xs font-medium text-gray-500 dark:text-gray-400">{item.label}</p>
                        {item.badge ? (
                          <span
                            className={`inline-flex flex-shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-medium ${item.badgeClass}`}
                          >
                            {item.badge}
                          </span>
                        ) : null}
                      </div>
                      <div className="mt-1 flex min-w-0 items-baseline gap-2">
                        <p className="truncate text-xl font-semibold leading-7 text-gray-900 dark:text-white">{item.value}</p>
                        {item.meta ? (
                          <p className="truncate text-xs text-gray-500 dark:text-gray-400">{item.meta}</p>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {showPreBlockRuntimeCard ? (
              <div
                data-test="pre-block-runtime-cards"
                className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,520px)_minmax(0,1fr)]"
              >
                <div data-test="pre-block-sync-card" className="card">
                  <div className="flex flex-col gap-4 border-b border-gray-100 px-6 py-4 dark:border-dark-700 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                        {t('admin.riskControl.preBlockSyncStatus')}
                      </h2>
                      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                        {t('admin.riskControl.preBlockSyncHint')}
                      </p>
                    </div>
                    <span className="inline-flex w-fit items-center rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-600 dark:bg-dark-700 dark:text-gray-300">
                      {modeLabel(status?.mode ?? configForm.mode)}
                    </span>
                  </div>
                  <div className="p-6">
                    <div data-test="pre-block-metric-grid" className="grid grid-cols-2 gap-3 md:grid-cols-3">
                      {preBlockMetricItems.map((item) => (
                        <div key={item.key} className={`rounded-lg p-4 ${item.class}`}>
                          <p className="text-xs text-gray-500 dark:text-gray-400">{item.label}</p>
                          <p className={`mt-2 truncate text-2xl font-semibold leading-8 ${item.valueClass}`}>{item.value}</p>
                          {item.meta ? (
                            <p className="mt-1 truncate text-xs text-gray-500 dark:text-gray-400">{item.meta}</p>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div data-test="pre-block-api-key-load-card" className="card">
                  <div className="flex flex-col gap-4 border-b border-gray-100 px-6 py-4 dark:border-dark-700 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                        {t('admin.riskControl.preBlockAPIKeyLoad')}
                      </h2>
                      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                        {t('admin.riskControl.preBlockAPIKeyLoadHint')}
                      </p>
                    </div>
                    <span className="inline-flex w-fit items-center rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-600 dark:bg-dark-700 dark:text-gray-300">
                      {preBlockAPIKeyLoadSummaryText}
                    </span>
                  </div>
                  <div className="p-6">
                    {preBlockAPIKeyLoads.length > 0 ? (
                      <div
                        data-test="pre-block-api-key-load-list"
                        className="max-h-[280px] space-y-3 overflow-y-auto pr-1"
                      >
                        {preBlockAPIKeyLoads.map((item) => (
                          <div
                            key={item.key_hash || item.index}
                            className="rounded-lg bg-gray-50 p-3 dark:bg-dark-700/50"
                          >
                            <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                              <div className="min-w-0">
                                <div className="flex min-w-0 items-center gap-2">
                                  <span className="font-mono text-sm font-semibold text-gray-900 dark:text-white">
                                    #{item.index + 1}
                                  </span>
                                  <span className="truncate font-mono text-sm text-gray-700 dark:text-gray-200">
                                    {item.masked || '-'}
                                  </span>
                                  <span
                                    className={`h-2 w-2 flex-shrink-0 rounded-full ${apiKeyStatusDotClass(item.status)}`}
                                  />
                                </div>
                                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                                  {t('admin.riskControl.preBlockAPIKeyTotals', {
                                    total: formatNumber(item.total),
                                    success: formatNumber(item.success),
                                    errors: formatNumber(item.errors),
                                  })}
                                </p>
                              </div>
                              <div className="grid grid-cols-4 gap-2 text-right text-xs text-gray-500 dark:text-gray-400 sm:min-w-[280px]">
                                <div>
                                  <p>{t('admin.riskControl.preBlockKeyActiveShort')}</p>
                                  <p className="mt-1 text-sm font-semibold text-sky-700 dark:text-sky-300">
                                    {formatNumber(item.active)}
                                  </p>
                                </div>
                                <div>
                                  <p>{t('admin.riskControl.preBlockKeyTotalShort')}</p>
                                  <p className="mt-1 text-sm font-semibold text-gray-900 dark:text-white">
                                    {formatNumber(item.total)}
                                  </p>
                                </div>
                                <div>
                                  <p>{t('admin.riskControl.preBlockKeyAvgShort')}</p>
                                  <p className="mt-1 text-sm font-semibold text-gray-900 dark:text-white">
                                    {formatNumber(item.avg_latency_ms)} ms
                                  </p>
                                </div>
                                <div>
                                  <p>{t('admin.riskControl.preBlockKeyLastShort')}</p>
                                  <p className="mt-1 text-sm font-semibold text-gray-900 dark:text-white">
                                    {formatNumber(item.last_latency_ms)} ms
                                  </p>
                                </div>
                              </div>
                            </div>
                            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white dark:bg-dark-900">
                              <div
                                className="h-full rounded-full bg-sky-500"
                                style={{ width: preBlockAPIKeyLoadWidth(item.total) }}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="rounded-lg bg-gray-50 p-4 text-sm text-gray-500 dark:bg-dark-700/50 dark:text-gray-400">
                        {t('admin.riskControl.preBlockAPIKeyLoadEmpty')}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ) : null}

            {showWorkerRuntimeCard ? (
              <div className="card">
                <div className="flex flex-col gap-4 border-b border-gray-100 px-6 py-4 dark:border-dark-700 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                      {t('admin.riskControl.workerStatus')}
                    </h2>
                    <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                      {t('admin.riskControl.workerStatusHint')}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                    <span>{t('admin.riskControl.autoRefresh')}</span>
                    {status?.last_cleanup_at ? (
                      <span>
                        {t('admin.riskControl.lastCleanup', { time: formatDateTime(status.last_cleanup_at) })}
                      </span>
                    ) : null}
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-6 p-6 xl:grid-cols-[minmax(0,360px)_1fr]">
                  <div className="space-y-4">
                    <div className="rounded-lg border border-gray-100 p-4 dark:border-dark-700">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-medium text-gray-900 dark:text-white">
                            {t('admin.riskControl.queueUsage')}
                          </p>
                          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                            {formatNumber(status?.queue_length ?? 0)} /{' '}
                            {formatNumber(status?.queue_size ?? configForm.queue_size)}
                          </p>
                        </div>
                        <span className="text-sm font-semibold text-gray-900 dark:text-white">{queueUsagePercent}</span>
                      </div>
                      <div className="mt-4 h-2 overflow-hidden rounded-full bg-gray-100 dark:bg-dark-700">
                        <div
                          className="h-full rounded-full bg-primary-500 transition-all duration-300"
                          style={{ width: queueUsagePercent }}
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="rounded-lg bg-gray-50 p-4 dark:bg-dark-700/50">
                        <p className="text-xs text-gray-500 dark:text-gray-400">{t('admin.riskControl.activeWorkers')}</p>
                        <p className="mt-2 text-2xl font-semibold text-gray-900 dark:text-white">
                          {status?.active_workers ?? 0}
                        </p>
                      </div>
                      <div className="rounded-lg bg-emerald-50 p-4 dark:bg-emerald-900/10">
                        <p className="text-xs text-gray-500 dark:text-gray-400">{t('admin.riskControl.idleWorkers')}</p>
                        <p className="mt-2 text-2xl font-semibold text-emerald-700 dark:text-emerald-300">
                          {status?.idle_workers ?? configForm.worker_count}
                        </p>
                      </div>
                      <div className="rounded-lg bg-gray-50 p-4 dark:bg-dark-700/50">
                        <p className="text-xs text-gray-500 dark:text-gray-400">{t('admin.riskControl.processed')}</p>
                        <p className="mt-2 text-2xl font-semibold text-gray-900 dark:text-white">
                          {formatNumber(status?.processed ?? 0)}
                        </p>
                      </div>
                      <div className="rounded-lg bg-gray-50 p-4 dark:bg-dark-700/50">
                        <p className="text-xs text-gray-500 dark:text-gray-400">{t('admin.riskControl.droppedErrors')}</p>
                        <p className="mt-2 text-2xl font-semibold text-gray-900 dark:text-white">
                          {formatNumber((status?.dropped ?? 0) + (status?.errors ?? 0))}
                        </p>
                      </div>
                    </div>
                  </div>
                  <div>
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-gray-900 dark:text-white">
                          {t('admin.riskControl.workerPool')}
                        </p>
                        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                          {t('admin.riskControl.workerPoolMeta', {
                            active: status?.active_workers ?? 0,
                            idle: status?.idle_workers ?? configForm.worker_count,
                            total: status?.worker_count ?? configForm.worker_count,
                          })}
                        </p>
                      </div>
                      <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-600 dark:bg-dark-700 dark:text-gray-300">
                        {modeLabel(status?.mode ?? configForm.mode)}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 md:grid-cols-6 xl:grid-cols-8 2xl:grid-cols-10">
                      {workerSlots.map((worker) => (
                        <div
                          key={worker.id}
                          className={`flex h-12 items-center justify-between rounded-lg border px-3 transition-colors ${workerSlotClass(worker.state)}`}
                          title={worker.label}
                        >
                          <span className="text-sm font-semibold">#{worker.id}</span>
                          <span className={`h-2.5 w-2.5 rounded-full ${workerDotClass(worker.state)}`} />
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            ) : null}

            <div className="card">
              <div className="flex flex-col gap-4 border-b border-gray-100 px-6 py-4 dark:border-dark-700">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                      {t('admin.riskControl.records')}
                    </h2>
                    <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{t('admin.riskControl.recordsHint')}</p>
                  </div>
                  <button
                    type="button"
                    className="btn btn-secondary inline-flex items-center gap-2"
                    disabled={logsLoading}
                    onClick={() => void loadLogs()}
                  >
                    <Icon name="refresh" size="sm" className={logsLoading ? 'animate-spin' : ''} />
                    {t('admin.riskControl.refresh')}
                  </button>
                </div>

                <div className="flex flex-col gap-2 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 dark:border-dark-700 dark:bg-dark-900/30 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex min-w-0 items-center gap-2 text-sm text-gray-700 dark:text-gray-200">
                    <Icon name="filter" size="sm" className="flex-shrink-0 text-gray-400" />
                    <span className="font-medium">{t('admin.riskControl.modelFilter')}</span>
                    <span className="truncate text-gray-500 dark:text-gray-400">{modelFilterSummary}</span>
                  </div>
                  {modelFilterPreviewModels.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {modelFilterPreviewModels.map((model) => (
                        <span
                          key={model}
                          className="inline-flex max-w-[180px] items-center truncate rounded-md bg-white px-2 py-1 font-mono text-xs text-gray-600 shadow-sm dark:bg-dark-800 dark:text-gray-300"
                        >
                          {model}
                        </span>
                      ))}
                      {hiddenModelFilterModelCount > 0 ? (
                        <span className="inline-flex rounded-md bg-white px-2 py-1 text-xs text-gray-500 shadow-sm dark:bg-dark-800 dark:text-gray-400">
                          +{hiddenModelFilterModelCount}
                        </span>
                      ) : null}
                    </div>
                  ) : null}
                </div>

                <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-6">
                  <Select
                    modelValue={filters.result}
                    options={resultOptions}
                    onUpdateModelValue={(value) => setFilters((prev) => ({ ...prev, result: String(value ?? '') }))}
                    onChange={() => reloadLogsFromFirstPage()}
                  />
                  <Select
                    modelValue={filters.group_id}
                    options={groupFilterOptions}
                    onUpdateModelValue={(value) => setFilters((prev) => ({ ...prev, group_id: Number(value) || 0 }))}
                    onChange={() => reloadLogsFromFirstPage()}
                  />
                  <Select
                    modelValue={filters.endpoint}
                    options={endpointOptions}
                    onUpdateModelValue={(value) => setFilters((prev) => ({ ...prev, endpoint: String(value ?? '') }))}
                    onChange={() => reloadLogsFromFirstPage()}
                  />
                  <input
                    type="search"
                    className="input"
                    placeholder={t('admin.riskControl.filters.search')}
                    value={filters.search}
                    onChange={(event) => setFilters((prev) => ({ ...prev, search: event.target.value.trim() }))}
                    onKeyUp={(event) => {
                      if (event.key === 'Enter') reloadLogsFromFirstPage()
                    }}
                  />
                  <input
                    type="datetime-local"
                    className="input"
                    title={t('admin.riskControl.filters.from')}
                    value={filters.from}
                    onChange={(event) => {
                      setFilters((prev) => ({ ...prev, from: event.target.value }))
                      reloadLogsFromFirstPage()
                    }}
                  />
                  <input
                    type="datetime-local"
                    className="input"
                    title={t('admin.riskControl.filters.to')}
                    value={filters.to}
                    onChange={(event) => {
                      setFilters((prev) => ({ ...prev, to: event.target.value }))
                      reloadLogsFromFirstPage()
                    }}
                  />
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 dark:divide-dark-700">
                  <thead className="bg-gray-50 dark:bg-dark-800">
                    <tr>
                      <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                        {t('admin.riskControl.table.time')}
                      </th>
                      <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                        {t('admin.riskControl.table.group')}
                      </th>
                      <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                        {t('admin.riskControl.table.user')}
                      </th>
                      <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                        {t('admin.riskControl.table.apiKey')}
                      </th>
                      <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                        {t('admin.riskControl.table.endpoint')}
                      </th>
                      <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                        {t('admin.riskControl.table.result')}
                      </th>
                      <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                        {t('admin.riskControl.table.highest')}
                      </th>
                      <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                        {t('admin.riskControl.table.actionMeta')}
                      </th>
                      <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                        {t('admin.riskControl.table.latency')}
                      </th>
                      <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                        {t('admin.riskControl.table.input')}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 bg-white dark:divide-dark-800 dark:bg-dark-800">
                    {logsLoading ? (
                      <tr>
                        <td colSpan={10} className="px-5 py-12 text-center text-sm text-gray-500 dark:text-gray-400">
                          {t('common.loading')}
                        </td>
                      </tr>
                    ) : logs.length === 0 ? (
                      <tr>
                        <td colSpan={10} className="px-5 py-12 text-center text-sm text-gray-500 dark:text-gray-400">
                          {t('admin.riskControl.emptyLogs')}
                        </td>
                      </tr>
                    ) : (
                      logs.map((row) => (
                        <tr key={row.id} className="hover:bg-gray-50 dark:hover:bg-dark-700/60">
                          <td className="whitespace-nowrap px-5 py-4 text-sm text-gray-700 dark:text-gray-300">
                            {formatDateTime(row.created_at)}
                          </td>
                          <td className="whitespace-nowrap px-5 py-4 text-sm text-gray-700 dark:text-gray-300">
                            {row.group_name || '-'}
                          </td>
                          <td className="whitespace-nowrap px-5 py-4 text-sm text-gray-700 dark:text-gray-300">
                            <div>{row.user_email || '-'}</div>
                            {row.user_id ? <div className="text-xs text-gray-400">UID {row.user_id}</div> : null}
                          </td>
                          <td className="whitespace-nowrap px-5 py-4 text-sm text-gray-700 dark:text-gray-300">
                            {row.api_key_name || '-'}
                          </td>
                          <td className="whitespace-nowrap px-5 py-4 text-sm text-gray-700 dark:text-gray-300">
                            <div>{row.endpoint || '-'}</div>
                            <div className="text-xs text-gray-400">
                              {row.provider || '-'} / {row.model || '-'}
                            </div>
                          </td>
                          <td className="whitespace-nowrap px-5 py-4">
                            <span className={`inline-flex rounded-md px-2 py-1 text-xs font-medium ${resultBadgeClass(row)}`}>
                              {resultLabel(row)}
                            </span>
                          </td>
                          <td className="whitespace-nowrap px-5 py-4 text-sm text-gray-700 dark:text-gray-300">
                            <div>{row.highest_category || '-'}</div>
                            <div className="text-xs text-gray-400">{percent(row.highest_score)}</div>
                          </td>
                          <td className="whitespace-nowrap px-5 py-4 text-sm text-gray-700 dark:text-gray-300">
                            <div>{violationCountText(row)}</div>
                            <div className="text-xs text-gray-400">
                              {row.email_sent ? t('admin.riskControl.emailSent') : t('admin.riskControl.emailNotSent')}
                              {row.auto_banned ? ` / ${t('admin.riskControl.autoBanned')}` : ''}
                            </div>
                            {canUnbanRow(row) ? (
                              <button
                                type="button"
                                className="mt-2 inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700 transition-colors hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-emerald-900/60 dark:bg-emerald-900/20 dark:text-emerald-300 dark:hover:bg-emerald-900/30"
                                disabled={unbanningUserID === row.user_id}
                                onClick={() => void unbanUserFromLog(row)}
                              >
                                <Icon
                                  name="checkCircle"
                                  size="xs"
                                  className={unbanningUserID === row.user_id ? 'animate-spin' : ''}
                                />
                                {unbanningUserID === row.user_id ? t('common.processing') : t('admin.riskControl.unbanUser')}
                              </button>
                            ) : null}
                          </td>
                          <td className="whitespace-nowrap px-5 py-4 text-sm text-gray-700 dark:text-gray-300">
                            <div>{latencyText(row.upstream_latency_ms)}</div>
                            {row.queue_delay_ms !== null && row.queue_delay_ms !== undefined ? (
                              <div className="text-xs text-gray-400">
                                {t('admin.riskControl.queueDelay', { ms: String(row.queue_delay_ms) })}
                              </div>
                            ) : null}
                          </td>
                          <td className="w-[320px] max-w-sm px-5 py-4 text-sm text-gray-700 dark:text-gray-300">
                            <button
                              type="button"
                              className="group flex w-full min-w-0 items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-gray-100 dark:hover:bg-dark-700"
                              title={inputSummaryText(row)}
                              onClick={() => setInputDetailRow(row)}
                            >
                              <span className="min-w-0 flex-1 truncate">{inputSummaryText(row)}</span>
                              <Icon
                                name="eye"
                                size="xs"
                                className="flex-shrink-0 text-gray-300 transition-colors group-hover:text-primary-500 dark:text-gray-500"
                              />
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {pagination.total > 0 ? (
                <Pagination
                  total={pagination.total}
                  page={pagination.page}
                  pageSize={pagination.page_size}
                  onUpdatePage={onPageChange}
                  onUpdatePageSize={onPageSizeChange}
                />
              ) : null}
            </div>

            <BaseDialog
              show={settingsOpen}
              title={t('admin.riskControl.settingsTitle')}
              width="extra-wide"
              onClose={() => setSettingsOpen(false)}
              footer={
                <div className="flex justify-end gap-2">
                  <button type="button" className="btn btn-secondary" onClick={() => setSettingsOpen(false)}>
                    {t('common.cancel')}
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary inline-flex items-center gap-2"
                    disabled={saving}
                    onClick={() => void saveConfig()}
                  >
                    {saving ? <Icon name="refresh" size="sm" className="animate-spin" /> : <Icon name="check" size="sm" />}
                    {saving ? t('common.saving') : t('admin.riskControl.saveConfig')}
                  </button>
                </div>
              }
            >
              <div className="space-y-6">
                <div className="flex gap-2 overflow-x-auto border-b border-gray-100 pb-3 dark:border-dark-700">
                  {settingsTabs.map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      className={`inline-flex whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                        activeSettingsTab === tab.id
                          ? 'bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300'
                          : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-dark-700 dark:hover:text-white'
                      }`}
                      onClick={() => setActiveSettingsTab(tab.id)}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                {activeSettingsTab === 'basic' ? (
                  <div className="space-y-5">
                    <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
                      <div className="flex items-center justify-between rounded-lg border border-gray-100 p-4 dark:border-dark-700">
                        <div>
                          <p className="text-sm font-medium text-gray-900 dark:text-white">{t('admin.riskControl.enabled')}</p>
                          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{t('admin.riskControl.enabledHint')}</p>
                        </div>
                        <Toggle
                          modelValue={configForm.enabled}
                          onUpdateModelValue={(value) => patchConfigForm({ enabled: value })}
                        />
                      </div>
                      <div>
                        <label className="input-label">{t('admin.riskControl.mode')}</label>
                        <Select
                          modelValue={configForm.mode}
                          options={modeOptions}
                          onUpdateModelValue={(value) => patchConfigForm({ mode: value as ModerationMode })}
                        />
                        <p className="mt-2 text-xs leading-5 text-gray-500 dark:text-gray-400">
                          {modeDescription(configForm.mode)}
                        </p>
                      </div>
                      <div>
                        <label className="input-label">{t('admin.riskControl.baseUrl')}</label>
                        <input
                          type="url"
                          className="input"
                          placeholder="https://api.openai.com"
                          value={configForm.base_url}
                          onChange={(event) => patchConfigForm({ base_url: event.target.value.trim() })}
                        />
                      </div>
                      <div>
                        <label className="input-label">{t('admin.riskControl.model')}</label>
                        <input
                          type="text"
                          className="input"
                          placeholder="omni-moderation-latest"
                          value={configForm.model}
                          onChange={(event) => patchConfigForm({ model: event.target.value.trim() })}
                        />
                      </div>
                      <div>
                        <label className="input-label">{t('admin.riskControl.timeoutMs')}</label>
                        <input
                          type="number"
                          min={500}
                          max={30000}
                          className="input"
                          value={configForm.timeout_ms}
                          onChange={(event) => patchConfigForm({ timeout_ms: Number(event.target.value) })}
                        />
                      </div>
                      <div>
                        <label className="input-label">{t('admin.riskControl.retryCount')}</label>
                        <input
                          type="number"
                          min={0}
                          max={5}
                          className="input"
                          value={configForm.retry_count}
                          onChange={(event) => patchConfigForm({ retry_count: Number(event.target.value) })}
                        />
                      </div>
                      <div>
                        <label className="input-label">{t('admin.riskControl.sampleRate')}</label>
                        <div className="relative">
                          <input
                            type="number"
                            min={0}
                            max={100}
                            step={1}
                            className="input pr-8"
                            value={configForm.sample_rate}
                            onChange={(event) => patchConfigForm({ sample_rate: Number(event.target.value) })}
                          />
                          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">%</span>
                        </div>
                      </div>
                    </div>

                    <div className="overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm dark:border-dark-700 dark:bg-dark-800">
                      <div className="flex flex-col gap-4 border-b border-gray-100 bg-gray-50 px-4 py-4 dark:border-dark-700 dark:bg-dark-800/60 lg:flex-row lg:items-center lg:justify-between">
                        <div className="flex items-start gap-3">
                          <span className="mt-0.5 flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-primary-50 text-primary-600 dark:bg-primary-900/30 dark:text-primary-300">
                            <Icon name="key" size="md" />
                          </span>
                          <div>
                            <label className="text-sm font-semibold text-gray-900 dark:text-white">
                              {t('admin.riskControl.apiKeys')}
                            </label>
                            <p className="mt-1 max-w-3xl text-xs leading-5 text-gray-500 dark:text-gray-400">
                              {t('admin.riskControl.apiKeysHint', { count: configForm.api_key_count })}
                            </p>
                          </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            className="btn btn-secondary inline-flex items-center gap-2"
                            disabled={apiKeyTesting || inputApiKeyCount === 0 || configForm.clear_api_key}
                            onClick={() => void testApiKeys(true)}
                          >
                            <Icon name="beaker" size="sm" className={apiKeyTesting ? 'animate-pulse' : ''} />
                            {apiKeyTesting ? t('admin.riskControl.testingApiKeys') : t('admin.riskControl.testInputApiKeys')}
                          </button>
                          <button
                            type="button"
                            className="btn btn-secondary inline-flex items-center gap-2"
                            disabled={
                              apiKeyTesting ||
                              effectiveStoredApiKeyCount === 0 ||
                              pendingDeletedApiKeyCount > 0 ||
                              configForm.clear_api_key ||
                              configForm.api_keys_mode === 'replace'
                            }
                            onClick={() => void testApiKeys(false)}
                          >
                            <Icon name="shield" size="sm" />
                            {storedApiKeyTestButtonText}
                          </button>
                          {configForm.api_key_configured ? (
                            <button
                              type="button"
                              className="btn btn-secondary inline-flex items-center gap-2"
                              onClick={toggleClearApiKey}
                            >
                              <Icon name={configForm.clear_api_key ? 'x' : 'trash'} size="sm" />
                              {configForm.clear_api_key
                                ? t('admin.riskControl.keepApiKey')
                                : t('admin.riskControl.clearApiKey')}
                            </button>
                          ) : null}
                        </div>
                      </div>

                      <div className="grid grid-cols-1 gap-4 p-4 xl:grid-cols-[minmax(0,1fr)_minmax(360px,440px)]">
                        <div className="space-y-3">
                          <div className="flex flex-col gap-2 rounded-lg border border-gray-100 bg-gray-50 p-2 dark:border-dark-700 dark:bg-dark-900/30 sm:flex-row sm:items-center sm:justify-between">
                            <div className="text-xs leading-5 text-gray-500 dark:text-gray-400">
                              <span className="font-medium text-gray-700 dark:text-gray-200">
                                {t('admin.riskControl.apiKeysWriteMode')}
                              </span>
                              <span className="ml-2">{apiKeysModeHint}</span>
                            </div>
                            <div className="inline-flex rounded-lg bg-white p-1 shadow-sm dark:bg-dark-800">
                              <button
                                type="button"
                                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                                  configForm.api_keys_mode === 'append'
                                    ? 'bg-primary-500 text-white shadow-sm'
                                    : 'text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-dark-700'
                                }`}
                                disabled={configForm.clear_api_key}
                                onClick={() => setAPIKeysMode('append')}
                              >
                                {t('admin.riskControl.apiKeysModeAppend')}
                              </button>
                              <button
                                type="button"
                                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                                  configForm.api_keys_mode === 'replace'
                                    ? 'bg-amber-500 text-white shadow-sm'
                                    : 'text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-dark-700'
                                }`}
                                disabled={configForm.clear_api_key}
                                onClick={() => setAPIKeysMode('replace')}
                              >
                                {t('admin.riskControl.apiKeysModeReplace')}
                              </button>
                            </div>
                          </div>
                          <textarea
                            className="input min-h-44 resize-y font-mono text-sm"
                            placeholder={apiKeysPlaceholder}
                            autoComplete="new-password"
                            disabled={configForm.clear_api_key}
                            value={configForm.api_keys_text}
                            onChange={(event) => patchConfigForm({ api_keys_text: event.target.value })}
                          />
                          <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                            <span className="inline-flex rounded-md bg-gray-100 px-2 py-1 dark:bg-dark-700">
                              {t('admin.riskControl.inputApiKeyCount', { count: inputApiKeyCount })}
                            </span>
                            {configForm.api_key_configured ? (
                              <span className="inline-flex rounded-md bg-gray-100 px-2 py-1 dark:bg-dark-700">
                                {t('admin.riskControl.storedApiKeyCount', { count: configForm.api_key_count })}
                              </span>
                            ) : null}
                            {configForm.clear_api_key ? (
                              <span className="inline-flex rounded-md bg-red-50 px-2 py-1 text-red-700 dark:bg-red-900/20 dark:text-red-300">
                                {t('admin.riskControl.apiKeyWillClear')}
                              </span>
                            ) : pendingDeletedApiKeyCount > 0 ? (
                              <span className="inline-flex rounded-md bg-amber-50 px-2 py-1 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300">
                                {t('admin.riskControl.apiKeyPendingDeleteCount', { count: pendingDeletedApiKeyCount })}
                              </span>
                            ) : null}
                            {configForm.api_keys_mode === 'replace' ? (
                              <span className="inline-flex rounded-md bg-amber-50 px-2 py-1 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300">
                                {t('admin.riskControl.apiKeysReplaceWarning')}
                              </span>
                            ) : null}
                          </div>

                          <div
                            className="rounded-lg border border-gray-100 bg-gray-50 p-3 dark:border-dark-700 dark:bg-dark-900/30"
                            onPaste={(event) => void handleModerationImagePaste(event)}
                          >
                            <div className="mb-3 flex items-center justify-between gap-3">
                              <div>
                                <p className="text-sm font-semibold text-gray-900 dark:text-white">
                                  {t('admin.riskControl.auditTestInput')}
                                </p>
                                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                                  {t('admin.riskControl.auditTestInputHint')}
                                </p>
                              </div>
                              {moderationTestPrompt || moderationTestImages.length > 0 || moderationTestResult ? (
                                <button
                                  type="button"
                                  className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-gray-500 hover:bg-white hover:text-gray-900 dark:text-gray-400 dark:hover:bg-dark-800 dark:hover:text-white"
                                  onClick={clearModerationTestInput}
                                >
                                  <Icon name="x" size="xs" />
                                  {t('admin.riskControl.clearAuditTest')}
                                </button>
                              ) : null}
                            </div>
                            <textarea
                              className="input min-h-24 resize-y text-sm"
                              placeholder={t('admin.riskControl.auditTestPromptPlaceholder')}
                              value={moderationTestPrompt}
                              onChange={(event) => setModerationTestPrompt(event.target.value)}
                            />
                            <div
                              className="mt-3 rounded-lg border border-dashed border-gray-200 bg-white p-3 dark:border-dark-700 dark:bg-dark-800"
                              onDragOver={(event) => event.preventDefault()}
                              onDrop={(event) => {
                                event.preventDefault()
                                void handleModerationImageDrop(event)
                              }}
                            >
                              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                <div className="flex items-start gap-2">
                                  <Icon name="upload" size="md" className="mt-0.5 text-gray-400" />
                                  <div>
                                    <p className="text-sm font-medium text-gray-800 dark:text-gray-100">
                                      {t('admin.riskControl.auditTestImages')}
                                    </p>
                                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                                      {t('admin.riskControl.auditTestImagesHint')}
                                    </p>
                                  </div>
                                </div>
                                <label className="btn btn-secondary inline-flex cursor-pointer items-center gap-2">
                                  <Icon name="plus" size="sm" />
                                  {t('admin.riskControl.addAuditTestImage')}
                                  <input
                                    type="file"
                                    accept="image/*"
                                    multiple
                                    className="sr-only"
                                    onChange={(event) => void handleModerationImageUpload(event)}
                                  />
                                </label>
                              </div>
                              {moderationTestImages.length > 0 ? (
                                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                                  {moderationTestImages.map((image, index) => (
                                    <div
                                      key={`${image.slice(0, 64)}-${index}`}
                                      className="group relative aspect-square overflow-hidden rounded-lg border border-gray-100 bg-gray-100 dark:border-dark-700 dark:bg-dark-700"
                                    >
                                      {/* eslint-disable-next-line @next/next/no-img-element */}
                                      <img src={image} alt="" className="h-full w-full object-cover" />
                                      <button
                                        type="button"
                                        className="absolute right-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white opacity-0 transition-opacity group-hover:opacity-100"
                                        onClick={() =>
                                          setModerationTestImages((prev) => prev.filter((_, itemIndex) => itemIndex !== index))
                                        }
                                      >
                                        <Icon name="x" size="xs" strokeWidth={2} />
                                      </button>
                                    </div>
                                  ))}
                                </div>
                              ) : null}
                            </div>
                          </div>
                        </div>

                        <div className="rounded-lg border border-gray-100 bg-gray-50 p-3 dark:border-dark-700 dark:bg-dark-900/30">
                          <div className="mb-3 flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-gray-900 dark:text-white">
                                {t('admin.riskControl.apiKeyHealth')}
                              </p>
                              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                                {t('admin.riskControl.apiKeyFreezeRule')}
                              </p>
                            </div>
                            <span className="inline-flex shrink-0 items-center whitespace-nowrap rounded-full bg-white px-2 py-0.5 text-[11px] font-medium leading-5 text-gray-600 shadow-sm dark:bg-dark-800 dark:text-gray-300">
                              {t('admin.riskControl.apiKeyRows', { count: apiKeyRows.length })}
                            </span>
                          </div>

                          {apiKeyRows.length === 0 ? (
                            <div className="flex min-h-32 flex-col items-center justify-center rounded-lg border border-dashed border-gray-200 bg-white px-4 py-6 text-center dark:border-dark-700 dark:bg-dark-800">
                              <Icon name="infoCircle" size="lg" className="text-gray-300 dark:text-dark-500" />
                              <p className="mt-2 text-sm font-medium text-gray-700 dark:text-gray-200">
                                {t('admin.riskControl.apiKeyHealthEmpty')}
                              </p>
                              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                                {t('admin.riskControl.apiKeyHealthEmptyHint')}
                              </p>
                            </div>
                          ) : (
                            <div className="space-y-2">
                              <div className={`space-y-2 ${apiKeyRowsExpanded ? 'max-h-72 overflow-y-auto pr-1' : ''}`}>
                                {visibleApiKeyRows.map((row, index) => (
                                  <div
                                    key={apiKeyRowKey(row, index)}
                                    className={`rounded-lg border bg-white p-2.5 shadow-sm dark:bg-dark-800 ${
                                      isStoredApiKeyPendingDelete(row)
                                        ? 'border-amber-200 opacity-70 dark:border-amber-800/60'
                                        : 'border-gray-100 dark:border-dark-700'
                                    }`}
                                  >
                                    <div className="flex items-start justify-between gap-2">
                                      <div className="min-w-0">
                                        <div className="flex min-w-0 flex-wrap items-center gap-2">
                                          <span className="truncate font-mono text-sm font-semibold text-gray-900 dark:text-white">
                                            {row.masked || '-'}
                                          </span>
                                          <span
                                            className={`inline-flex rounded-md px-1.5 py-0.5 text-[11px] font-medium ${
                                              row.configured
                                                ? 'bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300'
                                                : 'bg-purple-50 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300'
                                            }`}
                                          >
                                            {isStoredApiKeyPendingDelete(row)
                                              ? t('admin.riskControl.apiKeyPendingDelete')
                                              : row.configured
                                                ? t('admin.riskControl.apiKeyConfigured')
                                                : t('admin.riskControl.apiKeyTemporary')}
                                          </span>
                                        </div>
                                        <p className="mt-1 text-xs leading-5 text-gray-500 dark:text-gray-400">
                                          {apiKeyStatusMeta(row)}
                                        </p>
                                      </div>
                                      <div className="flex flex-shrink-0 items-center gap-1.5">
                                        <span
                                          className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${apiKeyStatusBadgeClass(row.status)}`}
                                        >
                                          <span className={`h-1.5 w-1.5 rounded-full ${apiKeyStatusDotClass(row.status)}`} />
                                          {apiKeyStatusLabel(row.status)}
                                        </span>
                                        {row.configured && !configForm.clear_api_key ? (
                                          <button
                                            type="button"
                                            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-dark-700 dark:hover:text-gray-200"
                                            title={
                                              isStoredApiKeyPendingDelete(row)
                                                ? t('admin.riskControl.undoDeleteApiKey')
                                                : t('admin.riskControl.deleteApiKey')
                                            }
                                            onClick={() => toggleDeleteStoredApiKey(row)}
                                          >
                                            <Icon
                                              name={isStoredApiKeyPendingDelete(row) ? 'refresh' : 'trash'}
                                              size="xs"
                                            />
                                          </button>
                                        ) : null}
                                      </div>
                                    </div>
                                    {row.last_error ? (
                                      <p className="mt-1.5 rounded-md bg-amber-50 px-2 py-1.5 text-xs leading-5 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300">
                                        {row.last_error}
                                      </p>
                                    ) : null}
                                  </div>
                                ))}
                              </div>

                              {canToggleApiKeyRows ? (
                                <div className="flex items-center justify-between gap-3 rounded-lg border border-dashed border-gray-200 bg-white px-3 py-2 text-xs text-gray-500 dark:border-dark-700 dark:bg-dark-800 dark:text-gray-400">
                                  <span className="min-w-0 truncate">
                                    {apiKeyRowsExpanded
                                      ? t('admin.riskControl.apiKeyRowsExpanded', { count: apiKeyRows.length })
                                      : t('admin.riskControl.apiKeyRowsCollapsed', { count: hiddenApiKeyRowCount })}
                                  </span>
                                  <button
                                    type="button"
                                    className="inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 font-medium text-primary-600 transition-colors hover:bg-primary-50 hover:text-primary-700 dark:text-primary-300 dark:hover:bg-primary-900/20"
                                    onClick={() => setApiKeyRowsExpanded((prev) => !prev)}
                                  >
                                    <Icon name={apiKeyRowsExpanded ? 'chevronUp' : 'chevronDown'} size="xs" />
                                    {apiKeyRowsExpanded
                                      ? t('admin.riskControl.collapseApiKeyRows')
                                      : t('admin.riskControl.expandApiKeyRows')}
                                  </button>
                                </div>
                              ) : null}
                            </div>
                          )}

                          {moderationTestResult ? (
                            <div className="mt-4 rounded-lg border border-gray-100 bg-white p-3 dark:border-dark-700 dark:bg-dark-800">
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <p className="text-sm font-semibold text-gray-900 dark:text-white">
                                    {t('admin.riskControl.auditTestResult')}
                                  </p>
                                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                                    {t('admin.riskControl.auditTestHighest', {
                                      category: moderationTestResult.highest_category || '-',
                                      score: percent(moderationTestResult.highest_score),
                                    })}
                                  </p>
                                </div>
                                <span
                                  className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${
                                    moderationTestResult.flagged
                                      ? 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-300'
                                      : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300'
                                  }`}
                                >
                                  {moderationTestResult.flagged
                                    ? t('admin.riskControl.auditTestFlagged')
                                    : t('admin.riskControl.auditTestPassed')}
                                </span>
                              </div>
                              <div className="mt-3">
                                <div className="mb-2 flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
                                  <span>{t('admin.riskControl.auditTestComposite')}</span>
                                  <span className="font-semibold text-gray-900 dark:text-white">
                                    {percent(moderationTestResult.composite_score)}
                                  </span>
                                </div>
                                <div className="h-2 overflow-hidden rounded-full bg-gray-100 dark:bg-dark-700">
                                  <div
                                    className={`h-full rounded-full ${moderationTestResult.flagged ? 'bg-red-500' : 'bg-emerald-500'}`}
                                    style={{ width: percentWidth(moderationTestResult.composite_score) }}
                                  />
                                </div>
                              </div>
                              <div className="mt-3 max-h-52 space-y-2 overflow-y-auto pr-1">
                                {moderationScoreRows.map((score) => (
                                  <div key={score.category}>
                                    <div className="mb-1 flex items-center justify-between gap-3 text-xs">
                                      <span className="truncate text-gray-600 dark:text-gray-300">{score.category}</span>
                                      <span className="font-mono text-gray-500 dark:text-gray-400">
                                        {percent(score.score)} / {percent(score.threshold)}
                                      </span>
                                    </div>
                                    <div className="h-1.5 overflow-hidden rounded-full bg-gray-100 dark:bg-dark-700">
                                      <div
                                        className={`h-full rounded-full ${score.hit ? 'bg-red-500' : 'bg-primary-500'}`}
                                        style={{ width: percentWidth(score.score) }}
                                      />
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  </div>
                ) : activeSettingsTab === 'scope' ? (
                  <div className="space-y-5">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                      <div>
                        <h3 className="text-base font-semibold text-gray-900 dark:text-white">
                          {t('admin.riskControl.groupScope')}
                        </h3>
                        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                          {t('admin.riskControl.groupScopeHint')}
                        </p>
                      </div>
                      <div className="inline-flex rounded-lg bg-gray-100 p-1 dark:bg-dark-700">
                        <button
                          type="button"
                          className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                            configForm.all_groups
                              ? 'bg-white text-gray-900 shadow-sm dark:bg-dark-800 dark:text-white'
                              : 'text-gray-500 dark:text-gray-400'
                          }`}
                          onClick={() => patchConfigForm({ all_groups: true })}
                        >
                          {t('admin.riskControl.allGroups')}
                        </button>
                        <button
                          type="button"
                          className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                            !configForm.all_groups
                              ? 'bg-white text-gray-900 shadow-sm dark:bg-dark-800 dark:text-white'
                              : 'text-gray-500 dark:text-gray-400'
                          }`}
                          onClick={() => patchConfigForm({ all_groups: false })}
                        >
                          {t('admin.riskControl.selectedGroups')}
                        </button>
                      </div>
                    </div>

                    {!configForm.all_groups ? (
                      <div className="space-y-4">
                        <div className="relative">
                          <Icon
                            name="search"
                            size="sm"
                            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                          />
                          <input
                            type="search"
                            className="input pl-9"
                            placeholder={t('admin.riskControl.searchGroups')}
                            value={groupSearch}
                            onChange={(event) => setGroupSearch(event.target.value.trim())}
                          />
                        </div>
                        <div className="grid max-h-[420px] grid-cols-1 gap-3 overflow-y-auto pr-1 md:grid-cols-2 xl:grid-cols-3">
                          {filteredGroups.map((group) => (
                            <button
                              key={group.id}
                              type="button"
                              className={`flex min-h-20 items-center justify-between rounded-lg border p-4 text-left transition-colors ${
                                isGroupSelected(group.id)
                                  ? 'border-primary-300 bg-primary-50 dark:border-primary-700 dark:bg-primary-900/20'
                                  : 'border-gray-100 hover:bg-gray-50 dark:border-dark-700 dark:hover:bg-dark-700/60'
                              }`}
                              onClick={() => toggleGroup(group.id)}
                            >
                              <span className="min-w-0">
                                <span className="block truncate text-sm font-semibold text-gray-900 dark:text-white">
                                  {group.name}
                                </span>
                                <span className="mt-1 inline-flex rounded-md bg-gray-100 px-2 py-0.5 text-xs text-gray-500 dark:bg-dark-700 dark:text-gray-400">
                                  {group.platform}
                                </span>
                              </span>
                              <span
                                className={`flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border ${
                                  isGroupSelected(group.id)
                                    ? 'border-primary-500 bg-primary-500 text-white'
                                    : 'border-gray-300 text-transparent dark:border-dark-500'
                                }`}
                              >
                                <Icon name="check" size="xs" strokeWidth={2} />
                              </span>
                            </button>
                          ))}
                          {filteredGroups.length === 0 ? (
                            <p className="text-sm text-gray-500 dark:text-gray-400">{t('admin.riskControl.noGroups')}</p>
                          ) : null}
                        </div>
                      </div>
                    ) : null}

                    <div className="space-y-4 rounded-lg border border-gray-100 p-4 dark:border-dark-700">
                      <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                        <div>
                          <h3 className="text-base font-semibold text-gray-900 dark:text-white">
                            {t('admin.riskControl.modelFilter')}
                          </h3>
                          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                            {t('admin.riskControl.modelFilterHint')}
                          </p>
                        </div>
                        <span className="inline-flex w-fit rounded-md bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-600 dark:bg-dark-700 dark:text-gray-300">
                          {modelFilterSummary}
                        </span>
                      </div>

                      <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
                        {modelFilterOptions.map((option) => (
                          <button
                            key={option.value}
                            type="button"
                            className={`rounded-lg border p-3 text-left transition-colors ${
                              configForm.model_filter_type === option.value
                                ? 'border-primary-300 bg-primary-50 text-primary-900 shadow-sm dark:border-primary-700 dark:bg-primary-900/20 dark:text-primary-100'
                                : 'border-gray-100 hover:bg-gray-50 dark:border-dark-700 dark:hover:bg-dark-700/60'
                            }`}
                            onClick={() => setModelFilterType(option.value)}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-sm font-semibold">{option.label}</span>
                              <span
                                className={`flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full border ${
                                  configForm.model_filter_type === option.value
                                    ? 'border-primary-500 bg-primary-500 text-white'
                                    : 'border-gray-300 text-transparent dark:border-dark-500'
                                }`}
                              >
                                <Icon name="check" size="xs" strokeWidth={2} />
                              </span>
                            </div>
                            <p className="mt-1 text-xs leading-5 text-gray-500 dark:text-gray-400">{option.description}</p>
                          </button>
                        ))}
                      </div>

                      {configForm.model_filter_type !== 'all' ? (
                        <div className="space-y-2">
                          <label className="input-label">{t('admin.riskControl.modelFilterModels')}</label>
                          <ModelWhitelistSelector
                            value={configForm.model_filter_models}
                            onChange={(models) => patchConfigForm({ model_filter_models: models })}
                          />
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            {t('admin.riskControl.modelFilterModelCount', {
                              count: configForm.model_filter_models.length,
                            })}
                          </p>
                        </div>
                      ) : null}
                    </div>
                  </div>
                ) : activeSettingsTab === 'runtime' ? (
                  <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
                    <div>
                      <label className="input-label">{t('admin.riskControl.workerCount')}</label>
                      <input
                        type="number"
                        min={1}
                        max={32}
                        className="input"
                        value={configForm.worker_count}
                        onChange={(event) => patchConfigForm({ worker_count: Number(event.target.value) })}
                      />
                    </div>
                    <div>
                      <label className="input-label">{t('admin.riskControl.queueSize')}</label>
                      <input
                        type="number"
                        min={100}
                        max={100000}
                        className="input"
                        value={configForm.queue_size}
                        onChange={(event) => patchConfigForm({ queue_size: Number(event.target.value) })}
                      />
                    </div>
                    <div className="flex items-center justify-between rounded-lg border border-gray-100 p-4 dark:border-dark-700 lg:col-span-2">
                      <div>
                        <p className="text-sm font-medium text-gray-900 dark:text-white">
                          {t('admin.riskControl.recordNonHits')}
                        </p>
                        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                          {t('admin.riskControl.recordNonHitsHint')}
                        </p>
                      </div>
                      <Toggle
                        modelValue={configForm.record_non_hits}
                        onUpdateModelValue={(value) => patchConfigForm({ record_non_hits: value })}
                      />
                    </div>
                    <div className="space-y-4 rounded-lg border border-gray-100 p-4 dark:border-dark-700 lg:col-span-2">
                      <div className="flex items-center justify-between gap-4">
                        <div>
                          <p className="text-sm font-medium text-gray-900 dark:text-white">
                            {t('admin.riskControl.preHashCheck')}
                          </p>
                          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                            {t('admin.riskControl.preHashCheckHint')}
                          </p>
                        </div>
                        <Toggle
                          modelValue={configForm.pre_hash_check_enabled}
                          onUpdateModelValue={(value) => patchConfigForm({ pre_hash_check_enabled: value })}
                        />
                      </div>
                      <div className="rounded-lg bg-gray-50 p-3 dark:bg-dark-900/30">
                        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                          <div>
                            <p className="text-sm font-medium text-gray-900 dark:text-white">
                              {t('admin.riskControl.flaggedHashCount', {
                                count: formatNumber(status?.flagged_hash_count ?? 0),
                              })}
                            </p>
                            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                              {t('admin.riskControl.flaggedHashHint')}
                            </p>
                          </div>
                          <button
                            type="button"
                            className="btn btn-secondary inline-flex items-center justify-center gap-2 text-red-600 hover:text-red-700 dark:text-red-300"
                            disabled={hashActionLoading || (status?.flagged_hash_count ?? 0) === 0}
                            onClick={() => void clearFlaggedHashesAction()}
                          >
                            <Icon name="trash" size="sm" className={hashActionLoading ? 'animate-pulse' : ''} />
                            {t('admin.riskControl.clearFlaggedHashes')}
                          </button>
                        </div>
                        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                          <input
                            type="text"
                            className="input font-mono text-sm"
                            placeholder={t('admin.riskControl.flaggedHashPlaceholder')}
                            value={flaggedHashInput}
                            onChange={(event) => setFlaggedHashInput(event.target.value.trim())}
                          />
                          <button
                            type="button"
                            className="btn btn-secondary inline-flex items-center justify-center gap-2"
                            disabled={hashActionLoading || !isFlaggedHashInputValid}
                            onClick={() => void deleteFlaggedHashAction()}
                          >
                            <Icon name="trash" size="sm" />
                            {t('admin.riskControl.deleteFlaggedHash')}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : activeSettingsTab === 'response' ? (
                  <div className="space-y-5">
                    <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
                      <div>
                        <label className="input-label">{t('admin.riskControl.blockStatus')}</label>
                        <input
                          type="number"
                          min={400}
                          max={599}
                          className="input"
                          value={configForm.block_status}
                          onChange={(event) => patchConfigForm({ block_status: Number(event.target.value) })}
                        />
                      </div>
                      <div>
                        <label className="input-label">{t('admin.riskControl.blockMessage')}</label>
                        <input
                          type="text"
                          className="input"
                          value={configForm.block_message}
                          onChange={(event) => patchConfigForm({ block_message: event.target.value.trim() })}
                        />
                      </div>
                      <div className="flex items-center justify-between rounded-lg border border-gray-100 p-4 dark:border-dark-700">
                        <div>
                          <p className="text-sm font-medium text-gray-900 dark:text-white">
                            {t('admin.riskControl.emailOnHit')}
                          </p>
                          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                            {t('admin.riskControl.emailOnHitHint')}
                          </p>
                        </div>
                        <Toggle
                          modelValue={configForm.email_on_hit}
                          onUpdateModelValue={(value) => patchConfigForm({ email_on_hit: value })}
                        />
                      </div>
                      <div className="flex items-center justify-between rounded-lg border border-gray-100 p-4 dark:border-dark-700">
                        <div>
                          <p className="text-sm font-medium text-gray-900 dark:text-white">
                            {t('admin.riskControl.autoBan')}
                          </p>
                          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                            {t('admin.riskControl.autoBanHint')}
                          </p>
                        </div>
                        <Toggle
                          modelValue={configForm.auto_ban_enabled}
                          onUpdateModelValue={(value) => patchConfigForm({ auto_ban_enabled: value })}
                        />
                      </div>
                      <div>
                        <label className="input-label">{t('admin.riskControl.banThreshold')}</label>
                        <input
                          type="number"
                          min={1}
                          max={1000}
                          className="input"
                          value={configForm.ban_threshold}
                          onChange={(event) => patchConfigForm({ ban_threshold: Number(event.target.value) })}
                        />
                      </div>
                      <div>
                        <label className="input-label">{t('admin.riskControl.violationWindowHours')}</label>
                        <input
                          type="number"
                          min={1}
                          max={8760}
                          className="input"
                          value={configForm.violation_window_hours}
                          onChange={(event) =>
                            patchConfigForm({ violation_window_hours: Number(event.target.value) })
                          }
                        />
                      </div>
                    </div>
                  </div>
                ) : activeSettingsTab === 'riskThresholds' ? (
                  <div className="space-y-5">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                      <div>
                        <h3 className="text-base font-semibold text-gray-900 dark:text-white">
                          {t('admin.riskControl.riskThresholds')}
                        </h3>
                        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                          {t('admin.riskControl.riskThresholdsHint')}
                        </p>
                      </div>
                      <button
                        type="button"
                        className="btn btn-secondary inline-flex items-center justify-center gap-2"
                        onClick={resetRiskThresholds}
                      >
                        <Icon name="refresh" size="sm" />
                        {t('admin.riskControl.riskThresholdReset')}
                      </button>
                    </div>

                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                      {riskThresholdRows.map((row) => (
                        <div
                          key={row.category}
                          className="rounded-lg border border-gray-100 bg-gray-50 p-4 dark:border-dark-700 dark:bg-dark-900/30"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <label
                                htmlFor={`risk-threshold-${row.category}`}
                                className="block truncate text-sm font-semibold text-gray-900 dark:text-white"
                              >
                                {row.category}
                              </label>
                              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                                {t('admin.riskControl.riskThresholdDefault', {
                                  value: formatThresholdPercent(row.defaultValue),
                                })}
                              </p>
                            </div>
                            <span className="inline-flex shrink-0 rounded-md bg-white px-2 py-1 font-mono text-xs font-medium text-gray-600 shadow-sm dark:bg-dark-800 dark:text-gray-300">
                              {formatThresholdPercent(row.value)}
                            </span>
                          </div>
                          <div className="mt-3">
                            <label htmlFor={`risk-threshold-${row.category}`} className="sr-only">
                              {t('admin.riskControl.riskThresholdPercent')}
                            </label>
                            <div className="relative">
                              <input
                                id={`risk-threshold-${row.category}`}
                                data-test={`risk-threshold-${row.category}`}
                                type="number"
                                min={0}
                                max={100}
                                step={0.1}
                                className="input pr-8 font-mono"
                                value={configForm.thresholds[row.category]}
                                onChange={(event) =>
                                  patchConfigForm({
                                    thresholds: {
                                      ...configForm.thresholds,
                                      [row.category]: Number(event.target.value),
                                    },
                                  })
                                }
                              />
                              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                                %
                              </span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : activeSettingsTab === 'keywords' ? (
                  <div className="space-y-5">
                    <div className={`flex items-start gap-3 rounded-lg border p-4 ${keywordNotice.toneClass}`}>
                      <Icon name={keywordNotice.icon} size="md" className={keywordNotice.iconClass} />
                      <div className="text-sm leading-6">
                        <p className={`font-medium ${keywordNotice.titleClass}`}>{keywordNotice.title}</p>
                        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{keywordNotice.description}</p>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="input-label">{t('admin.riskControl.keywordBlockingMode')}</label>
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                        {keywordBlockingModeOptions.map((option) => (
                          <button
                            key={option.value}
                            type="button"
                            className={`rounded-lg border p-3 text-left transition-colors ${
                              configForm.keyword_blocking_mode === option.value
                                ? 'border-primary-300 bg-primary-50 text-primary-900 shadow-sm dark:border-primary-700 dark:bg-primary-900/20 dark:text-primary-100'
                                : 'border-gray-100 hover:bg-gray-50 dark:border-dark-700 dark:hover:bg-dark-700/60'
                            }`}
                            onClick={() => patchConfigForm({ keyword_blocking_mode: option.value })}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-sm font-semibold">{option.label}</span>
                              <span
                                className={`flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full border ${
                                  configForm.keyword_blocking_mode === option.value
                                    ? 'border-primary-500 bg-primary-500 text-white'
                                    : 'border-gray-300 text-transparent dark:border-dark-500'
                                }`}
                              >
                                <Icon name="check" size="xs" strokeWidth={2} />
                              </span>
                            </div>
                            <p className="mt-1 text-xs leading-5 text-gray-500 dark:text-gray-400">{option.description}</p>
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <div className="mb-2 flex items-center justify-between">
                        <label className="input-label mb-0">{t('admin.riskControl.blockedKeywords')}</label>
                        <span className="inline-flex rounded-md bg-gray-100 px-2 py-1 text-xs text-gray-500 dark:bg-dark-700 dark:text-gray-300">
                          {t('admin.riskControl.blockedKeywordCount', { count: blockedKeywordCount })}
                        </span>
                      </div>
                      <textarea
                        className="input min-h-52 resize-y font-mono text-sm"
                        placeholder={t('admin.riskControl.blockedKeywordsPlaceholder')}
                        disabled={configForm.keyword_blocking_mode === 'api_only'}
                        value={configForm.blocked_keywords_text}
                        onChange={(event) => patchConfigForm({ blocked_keywords_text: event.target.value })}
                      />
                      <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                        {t('admin.riskControl.blockedKeywordsLimit', { max: blockedKeywordMax })}
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
                    <div>
                      <label className="input-label">{t('admin.riskControl.hitRetentionDays')}</label>
                      <input
                        type="number"
                        min={1}
                        max={3650}
                        className="input"
                        value={configForm.hit_retention_days}
                        onChange={(event) => patchConfigForm({ hit_retention_days: Number(event.target.value) })}
                      />
                    </div>
                    <div>
                      <label className="input-label">{t('admin.riskControl.nonHitRetentionDays')}</label>
                      <input
                        type="number"
                        min={1}
                        max={3}
                        className="input"
                        value={configForm.non_hit_retention_days}
                        onChange={(event) =>
                          patchConfigForm({ non_hit_retention_days: Number(event.target.value) })
                        }
                      />
                    </div>
                    <div className="rounded-lg border border-gray-100 p-4 text-sm text-gray-500 dark:border-dark-700 dark:text-gray-400 lg:col-span-2">
                      <div className="flex flex-wrap items-center gap-3">
                        <Icon name="database" size="md" className="text-gray-400" />
                        <span>
                          {t('admin.riskControl.cleanupStats', {
                            hit: status?.last_cleanup_deleted_hit ?? 0,
                            nonHit: status?.last_cleanup_deleted_non_hit ?? 0,
                          })}
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </BaseDialog>

            <BaseDialog
              show={inputDetailRow !== null}
              title={t('admin.riskControl.inputDetailTitle')}
              width="wide"
              onClose={() => setInputDetailRow(null)}
              footer={
                <div className="flex justify-end">
                  <button type="button" className="btn btn-secondary" onClick={() => setInputDetailRow(null)}>
                    {t('common.close')}
                  </button>
                </div>
              }
            >
              {inputDetailRow ? (
                <div className="space-y-5">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <div className="rounded-lg border border-gray-100 bg-gray-50 p-4 dark:border-dark-700 dark:bg-dark-800/70">
                      <p className="text-xs font-medium text-gray-500 dark:text-gray-400">
                        {t('admin.riskControl.table.time')}
                      </p>
                      <p className="mt-1 truncate text-sm font-semibold text-gray-900 dark:text-white">
                        {formatDateTime(inputDetailRow.created_at)}
                      </p>
                    </div>
                    <div className="rounded-lg border border-gray-100 bg-gray-50 p-4 dark:border-dark-700 dark:bg-dark-800/70">
                      <p className="text-xs font-medium text-gray-500 dark:text-gray-400">
                        {t('admin.riskControl.table.user')}
                      </p>
                      <p className="mt-1 truncate text-sm font-semibold text-gray-900 dark:text-white">
                        {inputDetailRow.user_email || '-'}
                      </p>
                    </div>
                    <div className="rounded-lg border border-gray-100 bg-gray-50 p-4 dark:border-dark-700 dark:bg-dark-800/70">
                      <p className="text-xs font-medium text-gray-500 dark:text-gray-400">
                        {t('admin.riskControl.table.result')}
                      </p>
                      <span
                        className={`mt-1 inline-flex rounded-md px-2 py-1 text-xs font-medium ${resultBadgeClass(inputDetailRow)}`}
                      >
                        {resultLabel(inputDetailRow)}
                      </span>
                    </div>
                    <div className="rounded-lg border border-gray-100 bg-gray-50 p-4 dark:border-dark-700 dark:bg-dark-800/70">
                      <p className="text-xs font-medium text-gray-500 dark:text-gray-400">
                        {t('admin.riskControl.table.highest')}
                      </p>
                      <p className="mt-1 truncate text-sm font-semibold text-gray-900 dark:text-white">
                        {inputDetailRow.highest_category || '-'} / {percent(inputDetailRow.highest_score)}
                      </p>
                    </div>
                  </div>

                  <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm dark:border-dark-700 dark:bg-dark-800">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-gray-900 dark:text-white">
                          {t('admin.riskControl.inputDetailContent')}
                        </p>
                        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                          {inputDetailRow.endpoint || '-'} · {inputDetailRow.provider || '-'} /{' '}
                          {inputDetailRow.model || '-'}
                        </p>
                      </div>
                      {inputDetailRow.group_name ? (
                        <span className="inline-flex rounded-md bg-sky-50 px-2.5 py-1 text-xs font-medium text-sky-700 dark:bg-sky-900/20 dark:text-sky-300">
                          {inputDetailRow.group_name}
                        </span>
                      ) : null}
                    </div>
                    <pre className="mt-4 max-h-[420px] overflow-auto whitespace-pre-wrap break-words rounded-lg bg-gray-950 p-4 text-sm leading-6 text-gray-100 shadow-inner dark:bg-black/50">
                      {inputDetailText}
                    </pre>
                  </div>
                </div>
              ) : null}
            </BaseDialog>
          </>
        )}
      </div>
    </AppLayout>
  )
}
