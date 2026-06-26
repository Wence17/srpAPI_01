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
import { adminGroupsAPI } from '@/lib/adminGroups'
import { adminAccountsAPI } from '@/lib/adminAccounts'
import { extractApiErrorMessage } from '@/lib/apiError'
import { getPersistedPageSize } from '@/lib/usePersistedPageSize'
import { useKeyedDebouncedSearch } from '@/lib/useKeyedDebouncedSearch'
import { createStableObjectKeyResolver } from '@/lib/stableObjectKey'
import { useOnboardingStore } from '@/lib/stores/onboarding'
import {
  buildModelsListConfig,
  createModelsListState as createInitialModelsListState,
  invertModelsListSelection,
  moveModelsListItem,
  selectAllModelsListItems,
  setModelsListCandidates,
  toggleModelsListItem,
  type ModelsListState,
} from '@/lib/admin/groupsModelsList'
import { createModelsListCandidatesTracker } from '@/lib/admin/groupsModelsListCandidates'
import { normalizeSupportedModelScopesForPlatform } from '@/lib/admin/groupsSupportedModelScopes'
import {
  createDefaultMessagesDispatchFormState,
  messagesDispatchConfigToFormState,
  messagesDispatchFormStateToConfig,
  resetMessagesDispatchFormState,
  type MessagesDispatchFormState,
  type MessagesDispatchMappingRow,
} from '@/lib/admin/groupsMessagesDispatch'
import AppLayout from '@/components/layout/AppLayout'
import TablePageLayout from '@/components/layout/TablePageLayout'
import DataTable, { type DataTableCellContext } from '@/components/common/DataTable'
import Pagination from '@/components/common/Pagination'
import BaseDialog from '@/components/common/BaseDialog'
import ConfirmDialog from '@/components/common/ConfirmDialog'
import EmptyState from '@/components/common/EmptyState'
import Select, { type SelectOption } from '@/components/common/Select'
import PlatformIcon from '@/components/common/PlatformIcon'
import Icon from '@/components/icons/Icon'
import HelpTooltip from '@/components/common/HelpTooltip'
import GroupCapacityBadge from '@/components/common/GroupCapacityBadge'
import GroupRateMultipliersModal from '@/components/admin/group/GroupRateMultipliersModal'
import GroupRPMOverridesModal from '@/components/admin/group/GroupRPMOverridesModal'
import type { Column } from '@/components/common/types'
import type {
  AdminGroup,
  CreateGroupRequest,
  GroupPlatform,
  SubscriptionType,
  UpdateGroupRequest,
} from '@/lib/types'

// ---------------------------------------------------------------------------
// Types & constants
// ---------------------------------------------------------------------------

type SortOrder = 'asc' | 'desc'

interface GroupFilters {
  platform: string
  status: string
  is_exclusive: string
}

interface CapacityEntry {
  concurrencyUsed: number
  concurrencyMax: number
  sessionsUsed: number
  sessionsMax: number
  rpmUsed: number
  rpmMax: number
}

interface SimpleAccount {
  id: number
  name: string
}

interface ModelRoutingRule {
  pattern: string
  accounts: SimpleAccount[]
}

interface ImagePricingFormState {
  rate_multiplier: number
  image_rate_independent: boolean
  image_rate_multiplier: number
  image_price_1k: number | string | null
  image_price_2k: number | string | null
  image_price_4k: number | string | null
}

interface GroupFormState extends MessagesDispatchFormState {
  name: string
  description: string
  platform: GroupPlatform
  rate_multiplier: number
  is_exclusive: boolean
  status: 'active' | 'inactive'
  subscription_type: SubscriptionType
  daily_limit_usd: number | null
  weekly_limit_usd: number | null
  monthly_limit_usd: number | null
  allow_image_generation: boolean
  image_rate_independent: boolean
  image_rate_multiplier: number
  image_price_1k: number | null
  image_price_2k: number | null
  image_price_4k: number | null
  claude_code_only: boolean
  fallback_group_id: number | null
  fallback_group_id_on_invalid_request: number | null
  default_mapped_model: string
  require_oauth_only: boolean
  require_privacy_set: boolean
  model_routing_enabled: boolean
  supported_model_scopes: string[]
  mcp_xml_inject: boolean
  copy_accounts_from_group_ids: number[]
  rpm_limit: number
}

const IMAGE_PRICING_TIERS = [
  { key: 'image_price_1k' as const, label: '1K' },
  { key: 'image_price_2k' as const, label: '2K' },
  { key: 'image_price_4k' as const, label: '4K' },
]

const ACCOUNT_FILTER_PLATFORMS = new Set(['openai', 'antigravity', 'anthropic', 'gemini'])
const INVALID_FALLBACK_PLATFORMS = new Set(['anthropic', 'antigravity'])
const IMAGE_PRICING_PLATFORMS = new Set(['antigravity', 'gemini', 'openai'])

const resolveCreateRuleKey = createStableObjectKeyResolver<ModelRoutingRule>('create-rule')
const resolveEditRuleKey = createStableObjectKeyResolver<ModelRoutingRule>('edit-rule')
const resolveCreateMessagesDispatchRowKey =
  createStableObjectKeyResolver<MessagesDispatchMappingRow>('create-messages-dispatch-row')
const resolveEditMessagesDispatchRowKey =
  createStableObjectKeyResolver<MessagesDispatchMappingRow>('edit-messages-dispatch-row')

const modelsListCandidatesTracker = createModelsListCandidatesTracker()

function createDefaultGroupForm(): GroupFormState {
  const dispatchDefaults = createDefaultMessagesDispatchFormState()
  return {
    name: '',
    description: '',
    platform: 'anthropic',
    rate_multiplier: 1.0,
    is_exclusive: false,
    status: 'active',
    subscription_type: 'standard',
    daily_limit_usd: null,
    weekly_limit_usd: null,
    monthly_limit_usd: null,
    allow_image_generation: false,
    image_rate_independent: false,
    image_rate_multiplier: 1,
    image_price_1k: null,
    image_price_2k: null,
    image_price_4k: null,
    claude_code_only: false,
    fallback_group_id: null,
    fallback_group_id_on_invalid_request: null,
    require_oauth_only: false,
    require_privacy_set: false,
    model_routing_enabled: false,
    supported_model_scopes: ['claude', 'gemini_text', 'gemini_image'],
    mcp_xml_inject: true,
    copy_accounts_from_group_ids: [],
    rpm_limit: 0,
    default_mapped_model: '',
    ...dispatchDefaults,
  }
}

function cloneModelsListState(state: ModelsListState): ModelsListState {
  return {
    enabled: state.enabled,
    savedModels: [...state.savedModels],
    items: state.items.map((item) => ({ ...item })),
  }
}

function resetModelsListState(
  state: ModelsListState,
  config?: Parameters<typeof createInitialModelsListState>[0],
): ModelsListState {
  const fresh = createInitialModelsListState(config)
  return {
    enabled: fresh.enabled,
    savedModels: [...fresh.savedModels],
    items: [...fresh.items],
  }
}

function formatCost(cost: number): string {
  if (cost >= 1000) return cost.toFixed(0)
  if (cost >= 100) return cost.toFixed(1)
  return cost.toFixed(2)
}

function platformBadgeClass(platform: string): string {
  switch (platform) {
    case 'anthropic':
      return 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400'
    case 'openai':
      return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
    case 'antigravity':
      return 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400'
    default:
      return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
  }
}

function normalizePreviewNumber(value: number | string | null | undefined, fallback = 0): number {
  if (value === null || value === undefined || value === '') return fallback
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function normalizeOptionalLimit(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined) return null
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) return null
    const parsed = Number(trimmed)
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null
  }
  return Number.isFinite(value) && value > 0 ? value : null
}

function normalizeImageRateMultiplier(value: number | string | null | undefined): number {
  if (value === null || value === undefined || value === '') return 1
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 1
}

function emptyToNull<T>(value: T): T | null {
  return (value as unknown) === '' ? null : value
}

function convertRoutingRulesToApiFormat(
  rules: ModelRoutingRule[],
): Record<string, number[]> | null {
  const result: Record<string, number[]> = {}
  let hasValidRules = false
  for (const rule of rules) {
    const pattern = rule.pattern.trim()
    if (!pattern) continue
    const accountIds = rule.accounts.map((a) => a.id).filter((id) => id > 0)
    if (accountIds.length > 0) {
      result[pattern] = accountIds
      hasValidRules = true
    }
  }
  return hasValidRules ? result : null
}

async function convertApiFormatToRoutingRules(
  apiFormat: Record<string, number[]> | null,
): Promise<ModelRoutingRule[]> {
  if (!apiFormat) return []
  const rules: ModelRoutingRule[] = []
  for (const [pattern, accountIds] of Object.entries(apiFormat)) {
    const accounts: SimpleAccount[] = []
    for (const id of accountIds) {
      try {
        const account = await adminAccountsAPI.getById(id)
        accounts.push({ id: account.id, name: account.name })
      } catch {
        accounts.push({ id, name: `#${id}` })
      }
    }
    rules.push({ pattern, accounts })
  }
  return rules
}

// ---------------------------------------------------------------------------
// Small UI helpers
// ---------------------------------------------------------------------------

function SubmitSpinner() {
  return (
    <svg className="-ml-1 mr-2 h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  )
}

function ToggleSwitch({
  enabled,
  onToggle,
  wide = false,
}: {
  enabled: boolean
  onToggle: () => void
  wide?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`relative inline-flex ${
        wide ? 'h-6 w-12' : 'h-6 w-11'
      } flex-shrink-0 items-center rounded-full transition-colors ${
        enabled ? 'bg-primary-500' : 'bg-gray-300 dark:bg-dark-600'
      }`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
          enabled ? (wide ? 'translate-x-6' : 'translate-x-6') : 'translate-x-1'
        }`}
      />
    </button>
  )
}

// ---------------------------------------------------------------------------
// Form section components
// ---------------------------------------------------------------------------

function ModelsListSection({
  state,
  loading,
  selectedCount,
  onToggleEnabled,
  onSelectAll,
  onInvert,
  onToggleItem,
  onMoveItem,
  t,
}: {
  state: ModelsListState
  loading: boolean
  selectedCount: number
  onToggleEnabled: () => void
  onSelectAll: () => void
  onInvert: () => void
  onToggleItem: (modelID: string) => void
  onMoveItem: (from: number, to: number) => void
  t: (key: string) => string
}) {
  return (
    <div className="border-t pt-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
            {t('admin.groups.modelsList.title')}
          </label>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{t('admin.groups.modelsList.hint')}</p>
        </div>
        <ToggleSwitch enabled={state.enabled} onToggle={onToggleEnabled} />
      </div>
      {state.enabled ? (
        <div className="overflow-hidden rounded-lg border border-gray-200 bg-gray-50/50 dark:border-dark-600 dark:bg-dark-800/40">
          {!loading && state.items.length > 0 ? (
            <div className="flex items-center justify-between gap-2 border-b border-gray-200 bg-gray-50 px-3 py-2 text-xs dark:border-dark-600 dark:bg-dark-800">
              <span className="text-gray-500 dark:text-gray-400">
                已选 {selectedCount} / {state.items.length}
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  className="rounded px-2 py-1 font-medium text-primary-600 transition-colors hover:bg-primary-50 dark:text-primary-400 dark:hover:bg-primary-900/20"
                  onClick={onSelectAll}
                >
                  全选
                </button>
                <button
                  type="button"
                  className="rounded px-2 py-1 font-medium text-gray-600 transition-colors hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-dark-700"
                  onClick={onInvert}
                >
                  反选
                </button>
              </div>
            </div>
          ) : null}
          <div className="max-h-64 space-y-2 overflow-y-auto p-2">
            {loading ? (
              <p className="text-xs text-gray-500 dark:text-gray-400">{t('admin.groups.modelsList.loading')}</p>
            ) : state.items.length === 0 ? (
              <p className="text-xs text-gray-500 dark:text-gray-400">{t('admin.groups.modelsList.empty')}</p>
            ) : (
              state.items.map((item, index) => (
                <div
                  key={item.id}
                  className="flex items-center gap-2 rounded border border-gray-200 bg-white px-3 py-2 dark:border-dark-600 dark:bg-dark-800"
                >
                  <input
                    type="checkbox"
                    checked={item.selected}
                    onChange={() => onToggleItem(item.id)}
                    className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                  />
                  <span className="min-w-0 flex-1 break-all text-sm text-gray-700 dark:text-gray-300">
                    {item.id}
                  </span>
                  <button
                    type="button"
                    disabled={index === 0}
                    className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-40 dark:hover:bg-dark-600 dark:hover:text-gray-200"
                    onClick={() => onMoveItem(index, index - 1)}
                  >
                    <Icon name="arrowUp" size="sm" />
                  </button>
                  <button
                    type="button"
                    disabled={index === state.items.length - 1}
                    className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-40 dark:hover:bg-dark-600 dark:hover:text-gray-200"
                    onClick={() => onMoveItem(index, index + 1)}
                  >
                    <Icon name="arrowDown" size="sm" />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      ) : null}
    </div>
  )
}

function ImagePricingSection({
  form,
  onChange,
  formatImagePricePreview,
  buildFinalPricePreview,
  t,
}: {
  form: GroupFormState
  onChange: (patch: Partial<GroupFormState>) => void
  formatImagePricePreview: (value: number | string | null | undefined) => string
  buildFinalPricePreview: (form: ImagePricingFormState) => Array<{ label: string; value: string }>
  t: (key: string, params?: Record<string, unknown>) => string
}) {
  const preview = buildFinalPricePreview(form)
  return (
    <div className="border-t pt-4">
      <label className="mb-2 block font-medium text-gray-700 dark:text-gray-300">
        {t('admin.groups.imagePricing.title')}
      </label>
      <p className="mb-3 text-xs text-gray-500 dark:text-gray-400">{t('admin.groups.imagePricing.description')}</p>
      <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-2">
        <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
          <input
            type="checkbox"
            checked={form.allow_image_generation}
            onChange={(e) => onChange({ allow_image_generation: e.target.checked })}
            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          {t('admin.groups.imagePricing.allowImageGeneration')}
        </label>
        <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
          <input
            type="checkbox"
            checked={form.image_rate_independent}
            onChange={(e) => onChange({ image_rate_independent: e.target.checked })}
            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          {t('admin.groups.imagePricing.independentMultiplier')}
        </label>
      </div>
      {form.image_rate_independent ? (
        <div className="mb-4">
          <label className="input-label">{t('admin.groups.imagePricing.imageMultiplier')}</label>
          <input
            type="number"
            step="0.0001"
            min="0"
            value={form.image_rate_multiplier}
            onChange={(e) => onChange({ image_rate_multiplier: Number(e.target.value) })}
            className="input"
            placeholder="1"
          />
        </div>
      ) : null}
      <div className="grid grid-cols-3 gap-3">
        {IMAGE_PRICING_TIERS.map((tier) => (
          <div key={tier.key}>
            <label className="input-label">{tier.label} ($)</label>
            <input
              type="number"
              step="0.001"
              min="0"
              value={form[tier.key] ?? ''}
              onChange={(e) =>
                onChange({
                  [tier.key]: e.target.value === '' ? null : Number(e.target.value),
                } as Partial<GroupFormState>)
              }
              className="input"
            />
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">{t('admin.groups.imagePricing.modeHint')}</p>
      <div className="mt-2 rounded-lg bg-gray-50 p-3 text-xs text-gray-700 dark:bg-gray-800 dark:text-gray-300">
        <div className="mb-1 font-medium">{t('admin.groups.imagePricing.finalPricePreview')}</div>
        <div className="grid grid-cols-3 gap-2">
          {preview.map((item) => (
            <div key={item.label}>
              {item.label}: {item.value}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function SupportedScopesSection({
  scopes,
  onToggle,
  t,
}: {
  scopes: string[]
  onToggle: (scope: string) => void
  t: (key: string) => string
}) {
  const scopeItems = [
    { key: 'claude', labelKey: 'admin.groups.supportedScopes.claude' },
    { key: 'gemini_text', labelKey: 'admin.groups.supportedScopes.geminiText' },
    { key: 'gemini_image', labelKey: 'admin.groups.supportedScopes.geminiImage' },
  ]
  return (
    <div className="border-t pt-4">
      <div className="mb-1.5 flex items-center gap-1">
        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
          {t('admin.groups.supportedScopes.title')}
        </label>
        <HelpTooltip content={t('admin.groups.supportedScopes.tooltip')} widthClass="w-72" />
      </div>
      <div className="space-y-2">
        {scopeItems.map((item) => (
          <label key={item.key} className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={scopes.includes(item.key)}
              onChange={() => onToggle(item.key)}
              className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500 dark:border-dark-600 dark:bg-dark-700"
            />
            <span className="text-sm text-gray-700 dark:text-gray-300">{t(item.labelKey)}</span>
          </label>
        ))}
      </div>
      <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">{t('admin.groups.supportedScopes.hint')}</p>
    </div>
  )
}

function McpXmlSection({
  enabled,
  onToggle,
  t,
}: {
  enabled: boolean
  onToggle: () => void
  t: (key: string) => string
}) {
  return (
    <div className="border-t pt-4">
      <div className="mb-1.5 flex items-center gap-1">
        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">{t('admin.groups.mcpXml.title')}</label>
        <HelpTooltip content={t('admin.groups.mcpXml.tooltip')} widthClass="w-72" />
      </div>
      <div className="flex items-center gap-3">
        <ToggleSwitch enabled={enabled} onToggle={onToggle} />
        <span className="text-sm text-gray-500 dark:text-gray-400">
          {enabled ? t('admin.groups.mcpXml.enabled') : t('admin.groups.mcpXml.disabled')}
        </span>
      </div>
    </div>
  )
}

function ClaudeCodeSection({
  form,
  onChange,
  fallbackOptions,
  t,
}: {
  form: GroupFormState
  onChange: (patch: Partial<GroupFormState>) => void
  fallbackOptions: SelectOption[]
  t: (key: string) => string
}) {
  return (
    <div className="border-t pt-4">
      <div className="mb-1.5 flex items-center gap-1">
        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">{t('admin.groups.claudeCode.title')}</label>
        <HelpTooltip content={t('admin.groups.claudeCode.tooltip')} widthClass="w-72" />
      </div>
      <div className="flex items-center gap-3">
        <ToggleSwitch
          enabled={form.claude_code_only}
          onToggle={() => onChange({ claude_code_only: !form.claude_code_only })}
        />
        <span className="text-sm text-gray-500 dark:text-gray-400">
          {form.claude_code_only ? t('admin.groups.claudeCode.enabled') : t('admin.groups.claudeCode.disabled')}
        </span>
      </div>
      {form.claude_code_only ? (
        <div className="mt-3">
          <label className="input-label">{t('admin.groups.claudeCode.fallbackGroup')}</label>
          <Select
            modelValue={form.fallback_group_id}
            options={fallbackOptions}
            placeholder={t('admin.groups.claudeCode.noFallback')}
            onUpdateModelValue={(val) => onChange({ fallback_group_id: val as number | null })}
          />
          <p className="input-hint">{t('admin.groups.claudeCode.fallbackHint')}</p>
        </div>
      ) : null}
    </div>
  )
}

function OpenAIMessagesDispatchSection({
  form,
  onChange,
  onAddMapping,
  onRemoveMapping,
  getRowKey,
  t,
}: {
  form: GroupFormState
  onChange: (patch: Partial<GroupFormState>) => void
  onAddMapping: () => void
  onRemoveMapping: (row: MessagesDispatchMappingRow) => void
  getRowKey: (row: MessagesDispatchMappingRow) => string
  t: (key: string) => string
}) {
  return (
    <div className="mt-4 border-t border-gray-200 pt-4 dark:border-dark-400">
      <h4 className="mb-3 text-sm font-medium text-gray-700 dark:text-gray-300">
        {t('admin.groups.openaiMessages.title')}
      </h4>
      <div className="flex items-center justify-between">
        <label className="text-sm text-gray-600 dark:text-gray-400">
          {t('admin.groups.openaiMessages.allowDispatch')}
        </label>
        <ToggleSwitch
          wide
          enabled={form.allow_messages_dispatch}
          onToggle={() => onChange({ allow_messages_dispatch: !form.allow_messages_dispatch })}
        />
      </div>
      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{t('admin.groups.openaiMessages.allowDispatchHint')}</p>

      {form.allow_messages_dispatch ? (
        <div className="mt-3">
          <div className="relative overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm dark:border-dark-600 dark:bg-dark-800">
            <div className="border-b border-gray-100 bg-gray-50/80 px-4 py-3 dark:border-dark-700 dark:bg-dark-700/50">
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-blue-500" />
                <label className="text-sm font-medium text-gray-900 dark:text-white">
                  {t('admin.groups.openaiMessages.familyMappingTitle')}
                </label>
              </div>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                {t('admin.groups.openaiMessages.familyMappingHint')}
              </p>
            </div>
            <div className="p-4">
              <div className="grid gap-4 md:grid-cols-3">
                <div>
                  <label className="input-label">{t('admin.groups.openaiMessages.opusModel')}</label>
                  <input
                    type="text"
                    value={form.opus_mapped_model}
                    onChange={(e) => onChange({ opus_mapped_model: e.target.value })}
                    placeholder={t('admin.groups.openaiMessages.opusModelPlaceholder')}
                    className="input"
                  />
                </div>
                <div>
                  <label className="input-label">{t('admin.groups.openaiMessages.sonnetModel')}</label>
                  <input
                    type="text"
                    value={form.sonnet_mapped_model}
                    onChange={(e) => onChange({ sonnet_mapped_model: e.target.value })}
                    placeholder={t('admin.groups.openaiMessages.sonnetModelPlaceholder')}
                    className="input"
                  />
                </div>
                <div>
                  <label className="input-label">{t('admin.groups.openaiMessages.haikuModel')}</label>
                  <input
                    type="text"
                    value={form.haiku_mapped_model}
                    onChange={(e) => onChange({ haiku_mapped_model: e.target.value })}
                    placeholder={t('admin.groups.openaiMessages.haikuModelPlaceholder')}
                    className="input"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="relative mt-5 overflow-hidden rounded-xl border border-primary-200 bg-white shadow-sm dark:border-primary-900/50 dark:bg-dark-800">
            <div className="border-b border-primary-100 bg-primary-50/80 px-4 py-3 dark:border-primary-900/40 dark:bg-primary-900/20">
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-primary-500" />
                <label className="text-sm font-medium text-primary-900 dark:text-primary-100">
                  {t('admin.groups.openaiMessages.exactMappingTitle')}
                </label>
              </div>
              <p className="mt-1 text-xs text-primary-600/90 dark:text-primary-400/90">
                {t('admin.groups.openaiMessages.exactMappingHint')}
              </p>
            </div>
            <div className="bg-gray-50/30 p-4 dark:bg-dark-800/30">
              {form.exact_model_mappings.length === 0 ? (
                <div className="flex items-center justify-between gap-3 rounded-xl border-2 border-dashed border-primary-200 bg-white px-5 py-4 text-sm text-primary-700 transition-colors hover:border-primary-300 dark:border-primary-900/40 dark:bg-dark-800 dark:text-primary-300 dark:hover:border-primary-800">
                  <span>{t('admin.groups.openaiMessages.noExactMappings')}</span>
                  <button
                    type="button"
                    onClick={onAddMapping}
                    className="flex items-center gap-1.5 text-sm font-medium text-primary-600 transition-colors hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300"
                  >
                    <Icon name="plus" size="sm" />
                    {t('admin.groups.openaiMessages.addExactMapping')}
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  {form.exact_model_mappings.map((row) => (
                    <div
                      key={getRowKey(row)}
                      className="group relative rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition-all hover:border-primary-300 hover:shadow-md dark:border-dark-600 dark:bg-dark-700 dark:hover:border-primary-700"
                    >
                      <div className="flex items-center gap-4">
                        <div className="grid flex-1 gap-4 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] md:items-start">
                          <div>
                            <label className="input-label">{t('admin.groups.openaiMessages.claudeModel')}</label>
                            <input
                              type="text"
                              value={row.claude_model}
                              onChange={(e) => {
                                row.claude_model = e.target.value
                                onChange({ exact_model_mappings: [...form.exact_model_mappings] })
                              }}
                              placeholder={t('admin.groups.openaiMessages.claudeModelPlaceholder')}
                              className="input bg-gray-50 focus:bg-white dark:bg-dark-800 dark:focus:bg-dark-900"
                            />
                          </div>
                          <div className="hidden text-primary-300 dark:text-primary-700 md:flex md:justify-center md:pt-7">
                            <Icon name="arrowRight" size="sm" className="transition-transform group-hover:translate-x-1" />
                          </div>
                          <div>
                            <label className="input-label">{t('admin.groups.openaiMessages.targetModel')}</label>
                            <input
                              type="text"
                              value={row.target_model}
                              onChange={(e) => {
                                row.target_model = e.target.value
                                onChange({ exact_model_mappings: [...form.exact_model_mappings] })
                              }}
                              placeholder={t('admin.groups.openaiMessages.targetModelPlaceholder')}
                              className="input bg-gray-50 focus:bg-white dark:bg-dark-800 dark:focus:bg-dark-900"
                            />
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => onRemoveMapping(row)}
                          className="mt-6 flex h-9 w-9 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/20 dark:hover:text-red-400"
                          title={t('admin.groups.openaiMessages.removeExactMapping')}
                        >
                          <Icon name="trash" size="sm" />
                        </button>
                      </div>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={onAddMapping}
                    className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-gray-300 bg-white py-3 text-sm font-medium text-gray-500 transition-all hover:border-primary-300 hover:bg-primary-50/50 hover:text-primary-600 dark:border-dark-600 dark:bg-dark-800 dark:text-gray-400 dark:hover:border-primary-800 dark:hover:bg-primary-900/20 dark:hover:text-primary-400"
                  >
                    <Icon name="plus" size="sm" />
                    {t('admin.groups.openaiMessages.addExactMapping')}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function AccountFiltersSection({
  form,
  onChange,
}: {
  form: GroupFormState
  onChange: (patch: Partial<GroupFormState>) => void
}) {
  return (
    <div className="mt-4 space-y-4 border-t border-gray-200 pt-4 dark:border-dark-400">
      <h4 className="mb-3 text-sm font-medium text-gray-700 dark:text-gray-300">账号过滤控制</h4>
      <div className="flex items-center justify-between">
        <div>
          <label className="text-sm text-gray-600 dark:text-gray-400">仅允许 OAuth 账号</label>
          <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
            {form.require_oauth_only ? '已启用 — 排除 API Key 类型账号' : '未启用'}
          </p>
        </div>
        <ToggleSwitch
          wide
          enabled={form.require_oauth_only}
          onToggle={() => onChange({ require_oauth_only: !form.require_oauth_only })}
        />
      </div>
      <div className="flex items-center justify-between">
        <div>
          <label className="text-sm text-gray-600 dark:text-gray-400">仅允许隐私保护已设置的账号</label>
          <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
            {form.require_privacy_set ? '已启用 — Privacy 未设置的账号将被排除' : '未启用'}
          </p>
        </div>
        <ToggleSwitch
          wide
          enabled={form.require_privacy_set}
          onToggle={() => onChange({ require_privacy_set: !form.require_privacy_set })}
        />
      </div>
    </div>
  )
}

function CopyAccountsSection({
  selectedIds,
  options,
  onAdd,
  onRemove,
  tooltipContent,
  hint,
  t,
}: {
  selectedIds: number[]
  options: SelectOption[]
  onAdd: (id: number) => void
  onRemove: (id: number) => void
  tooltipContent: string
  hint: string
  t: (key: string) => string
}) {
  if (options.length === 0) return null
  return (
    <div>
      <div className="mb-1.5 flex items-center gap-1">
        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
          {t('admin.groups.copyAccounts.title')}
        </label>
        <HelpTooltip content={tooltipContent} widthClass="w-72" />
      </div>
      {selectedIds.length > 0 ? (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {selectedIds.map((groupId) => (
            <span
              key={groupId}
              className="inline-flex items-center gap-1 rounded-full bg-primary-100 px-2.5 py-1 text-xs font-medium text-primary-700 dark:bg-primary-900/30 dark:text-primary-300"
            >
              {options.find((o) => o.value === groupId)?.label || `#${groupId}`}
              <button
                type="button"
                onClick={() => onRemove(groupId)}
                className="ml-0.5 text-primary-500 hover:text-primary-700 dark:hover:text-primary-200"
              >
                <Icon name="x" size="xs" />
              </button>
            </span>
          ))}
        </div>
      ) : null}
      <select
        className="input"
        defaultValue=""
        onChange={(e) => {
          const val = Number(e.target.value)
          if (val) onAdd(val)
          e.target.value = ''
        }}
      >
        <option value="">{t('admin.groups.copyAccounts.selectPlaceholder')}</option>
        {options.map((opt) => (
          <option key={String(opt.value)} value={String(opt.value)} disabled={selectedIds.includes(opt.value as number)}>
            {opt.label}
          </option>
        ))}
      </select>
      <p className="input-hint">{hint}</p>
    </div>
  )
}

function ModelRoutingSection({
  form,
  onChange,
  rules,
  isEdit,
  getRuleKey,
  getRuleSearchKey,
  accountSearchKeyword,
  accountSearchResults,
  showAccountDropdown,
  onKeywordChange,
  onSearchFocus,
  onSelectAccount,
  onRemoveAccount,
  onRemoveRule,
  onAddRule,
  onRulesChange,
  t,
}: {
  form: GroupFormState
  onChange: (patch: Partial<GroupFormState>) => void
  rules: ModelRoutingRule[]
  isEdit: boolean
  getRuleKey: (rule: ModelRoutingRule) => string
  getRuleSearchKey: (rule: ModelRoutingRule) => string
  accountSearchKeyword: Record<string, string>
  accountSearchResults: Record<string, SimpleAccount[]>
  showAccountDropdown: Record<string, boolean>
  onKeywordChange: (rule: ModelRoutingRule, keyword: string) => void
  onSearchFocus: (rule: ModelRoutingRule) => void
  onSelectAccount: (rule: ModelRoutingRule, account: SimpleAccount) => void
  onRemoveAccount: (rule: ModelRoutingRule, accountId: number) => void
  onRemoveRule: (rule: ModelRoutingRule) => void
  onAddRule: () => void
  onRulesChange: () => void
  t: (key: string) => string
}) {
  return (
    <div className="border-t pt-4">
      <div className="mb-1.5 flex items-center gap-1">
        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">{t('admin.groups.modelRouting.title')}</label>
        <HelpTooltip content={t('admin.groups.modelRouting.tooltip')} widthClass="w-80" />
      </div>
      <div className="mb-3 flex items-center gap-3">
        <ToggleSwitch
          enabled={form.model_routing_enabled}
          onToggle={() => onChange({ model_routing_enabled: !form.model_routing_enabled })}
        />
        <span className="text-sm text-gray-500 dark:text-gray-400">
          {form.model_routing_enabled
            ? t('admin.groups.modelRouting.enabled')
            : t('admin.groups.modelRouting.disabled')}
        </span>
      </div>
      <p className="mb-3 text-xs text-gray-500 dark:text-gray-400">
        {form.model_routing_enabled
          ? t('admin.groups.modelRouting.noRulesHint')
          : t('admin.groups.modelRouting.disabledHint')}
      </p>
      {form.model_routing_enabled ? (
        <div className="space-y-3">
          {rules.map((rule) => {
            const searchKey = getRuleSearchKey(rule)
            const results = accountSearchResults[searchKey] || []
            return (
              <div key={getRuleKey(rule)} className="rounded-lg border border-gray-200 p-3 dark:border-dark-600">
                <div className="flex items-start gap-3">
                  <div className="flex-1 space-y-2">
                    <div>
                      <label className="input-label text-xs">{t('admin.groups.modelRouting.modelPattern')}</label>
                      <input
                        type="text"
                        value={rule.pattern}
                        onChange={(e) => {
                          rule.pattern = e.target.value
                          onRulesChange()
                        }}
                        className="input text-sm"
                        placeholder={t('admin.groups.modelRouting.modelPatternPlaceholder')}
                      />
                    </div>
                    <div>
                      <label className="input-label text-xs">{t('admin.groups.modelRouting.accounts')}</label>
                      {rule.accounts.length > 0 ? (
                        <div className="mb-2 flex flex-wrap gap-1.5">
                          {rule.accounts.map((account) => (
                            <span
                              key={account.id}
                              className="inline-flex items-center gap-1 rounded-full bg-primary-100 px-2.5 py-1 text-xs font-medium text-primary-700 dark:bg-primary-900/30 dark:text-primary-300"
                            >
                              {account.name}
                              <button
                                type="button"
                                onClick={() => onRemoveAccount(rule, account.id)}
                                className="ml-0.5 text-primary-500 hover:text-primary-700 dark:hover:text-primary-200"
                              >
                                <Icon name="x" size="xs" />
                              </button>
                            </span>
                          ))}
                        </div>
                      ) : null}
                      <div className="account-search-container relative">
                        <input
                          type="text"
                          value={accountSearchKeyword[searchKey] || ''}
                          onChange={(e) => onKeywordChange(rule, e.target.value)}
                          onFocus={() => onSearchFocus(rule)}
                          className="input text-sm"
                          placeholder={t('admin.groups.modelRouting.searchAccountPlaceholder')}
                        />
                        {showAccountDropdown[searchKey] && results.length > 0 ? (
                          <div className="absolute z-50 mt-1 max-h-48 w-full overflow-auto rounded-lg border bg-white shadow-lg dark:border-dark-600 dark:bg-dark-800">
                            {results.map((account) => {
                              const selected = rule.accounts.some((a) => a.id === account.id)
                              return (
                                <button
                                  key={account.id}
                                  type="button"
                                  disabled={selected}
                                  onClick={() => onSelectAccount(rule, account)}
                                  className={`w-full px-3 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-dark-700 ${
                                    selected ? 'opacity-50' : ''
                                  }`}
                                >
                                  <span>{account.name}</span>
                                  <span className="ml-2 text-xs text-gray-400">#{account.id}</span>
                                </button>
                              )
                            })}
                          </div>
                        ) : null}
                      </div>
                      <p className="mt-1 text-xs text-gray-400">{t('admin.groups.modelRouting.accountsHint')}</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => onRemoveRule(rule)}
                    className="mt-5 p-1.5 text-gray-400 transition-colors hover:text-red-500"
                    title={t('admin.groups.modelRouting.removeRule')}
                  >
                    <Icon name="trash" size="sm" />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      ) : null}
      {form.model_routing_enabled ? (
        <button
          type="button"
          onClick={onAddRule}
          className="mt-3 flex items-center gap-1.5 text-sm text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300"
        >
          <Icon name="plus" size="sm" />
          {t('admin.groups.modelRouting.addRule')}
        </button>
      ) : null}
    </div>
  )
}

function SubscriptionConfigSection({
  form,
  onChange,
  subscriptionTypeDisabled,
  t,
}: {
  form: GroupFormState
  onChange: (patch: Partial<GroupFormState>) => void
  subscriptionTypeDisabled?: boolean
  t: (key: string) => string
}) {
  return (
    <div className="mt-4 border-t pt-4">
      <div>
        <label className="input-label">{t('admin.groups.subscription.type')}</label>
        <Select
          modelValue={form.subscription_type}
          options={[
            { value: 'standard', label: t('admin.groups.subscription.standard') },
            { value: 'subscription', label: t('admin.groups.subscription.subscription') },
          ]}
          disabled={subscriptionTypeDisabled}
          onUpdateModelValue={(val) => onChange({ subscription_type: val as SubscriptionType })}
        />
        <p className="input-hint">
          {subscriptionTypeDisabled
            ? t('admin.groups.subscription.typeNotEditable')
            : t('admin.groups.subscription.typeHint')}
        </p>
      </div>
      {form.subscription_type === 'subscription' ? (
        <div className="space-y-4 border-l-2 border-primary-200 pl-4 dark:border-primary-800">
          <div>
            <label className="input-label">{t('admin.groups.subscription.dailyLimit')}</label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={form.daily_limit_usd ?? ''}
              onChange={(e) =>
                onChange({ daily_limit_usd: e.target.value === '' ? null : Number(e.target.value) })
              }
              className="input"
              placeholder={t('admin.groups.subscription.noLimit')}
            />
          </div>
          <div>
            <label className="input-label">{t('admin.groups.subscription.weeklyLimit')}</label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={form.weekly_limit_usd ?? ''}
              onChange={(e) =>
                onChange({ weekly_limit_usd: e.target.value === '' ? null : Number(e.target.value) })
              }
              className="input"
              placeholder={t('admin.groups.subscription.noLimit')}
            />
          </div>
          <div>
            <label className="input-label">{t('admin.groups.subscription.monthlyLimit')}</label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={form.monthly_limit_usd ?? ''}
              onChange={(e) =>
                onChange({ monthly_limit_usd: e.target.value === '' ? null : Number(e.target.value) })
              }
              className="input"
              placeholder={t('admin.groups.subscription.noLimit')}
            />
          </div>
        </div>
      ) : null}
    </div>
  )
}

function ExclusiveToggleSection({
  form,
  onChange,
  tourAttr,
  t,
}: {
  form: GroupFormState
  onChange: (patch: Partial<GroupFormState>) => void
  tourAttr?: string
  t: (key: string) => string
}) {
  return (
    <div data-tour={tourAttr}>
      <div className="mb-1.5 flex items-center gap-1">
        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">{t('admin.groups.form.exclusive')}</label>
        <HelpTooltip
          widthClass="w-72"
          triggerContent={<Icon name="questionCircle" size="sm" strokeWidth={2} className="cursor-help text-gray-400 dark:text-gray-500" />}
        >
          <p className="mb-2 text-xs font-medium">{t('admin.groups.exclusiveTooltip.title')}</p>
          <p className="mb-2 text-xs leading-relaxed text-gray-300">{t('admin.groups.exclusiveTooltip.description')}</p>
          <div className="rounded bg-gray-800 p-2 dark:bg-gray-700">
            <p className="text-xs leading-relaxed text-gray-300">
              <span className="inline-flex items-center gap-1 text-primary-400">
                <Icon name="lightbulb" size="xs" />
                {t('admin.groups.exclusiveTooltip.example')}
              </span>{' '}
              {t('admin.groups.exclusiveTooltip.exampleContent')}
            </p>
          </div>
        </HelpTooltip>
      </div>
      <div className="flex items-center gap-3">
        <ToggleSwitch enabled={form.is_exclusive} onToggle={() => onChange({ is_exclusive: !form.is_exclusive })} />
        <span className="text-sm text-gray-500 dark:text-gray-400">
          {form.is_exclusive ? t('admin.groups.exclusive') : t('admin.groups.public')}
        </span>
      </div>
    </div>
  )
}

function GroupFormSections({
  mode,
  form,
  onChange,
  modelsListState,
  modelsListLoading,
  modelsListSelectedCount,
  onModelsListEnabledToggle,
  onModelsListSelectAll,
  onModelsListInvert,
  onModelsListToggleItem,
  onModelsListMoveItem,
  modelRoutingRules,
  routingContext,
  allGroups,
  editingGroupId,
  formatImagePricePreview,
  buildFinalPricePreview,
  onAddMessagesMapping,
  onRemoveMessagesMapping,
  getMessagesRowKey,
  t,
}: {
  mode: 'create' | 'edit'
  form: GroupFormState
  onChange: (patch: Partial<GroupFormState>) => void
  modelsListState: ModelsListState
  modelsListLoading: boolean
  modelsListSelectedCount: number
  onModelsListEnabledToggle: () => void
  onModelsListSelectAll: () => void
  onModelsListInvert: () => void
  onModelsListToggleItem: (modelID: string) => void
  onModelsListMoveItem: (from: number, to: number) => void
  modelRoutingRules: ModelRoutingRule[]
  routingContext: {
    getRuleKey: (rule: ModelRoutingRule) => string
    getRuleSearchKey: (rule: ModelRoutingRule) => string
    accountSearchKeyword: Record<string, string>
    accountSearchResults: Record<string, SimpleAccount[]>
    showAccountDropdown: Record<string, boolean>
    onKeywordChange: (rule: ModelRoutingRule, keyword: string) => void
    onSearchFocus: (rule: ModelRoutingRule) => void
    onSelectAccount: (rule: ModelRoutingRule, account: SimpleAccount) => void
    onRemoveAccount: (rule: ModelRoutingRule, accountId: number) => void
    onRemoveRule: (rule: ModelRoutingRule) => void
    onAddRule: () => void
    onRulesChange: () => void
  }
  allGroups: AdminGroup[]
  editingGroupId?: number
  formatImagePricePreview: (value: number | string | null | undefined) => string
  buildFinalPricePreview: (form: ImagePricingFormState) => Array<{ label: string; value: string }>
  onAddMessagesMapping: () => void
  onRemoveMessagesMapping: (row: MessagesDispatchMappingRow) => void
  getMessagesRowKey: (row: MessagesDispatchMappingRow) => string
  t: (key: string, params?: Record<string, unknown>) => string
}) {
  const fallbackGroupOptions = useMemo(() => {
    const options: SelectOption[] = [{ value: null, label: t('admin.groups.claudeCode.noFallback') }]
    allGroups
      .filter(
        (g) =>
          g.platform === 'anthropic' &&
          !g.claude_code_only &&
          g.status === 'active' &&
          (mode === 'create' || g.id !== editingGroupId),
      )
      .forEach((g) => options.push({ value: g.id, label: g.name }))
    return options
  }, [allGroups, editingGroupId, mode, t])

  const invalidRequestFallbackOptions = useMemo(() => {
    const options: SelectOption[] = [
      { value: null, label: t('admin.groups.invalidRequestFallback.noFallback') },
    ]
    allGroups
      .filter(
        (g) =>
          g.platform === 'anthropic' &&
          g.status === 'active' &&
          g.subscription_type !== 'subscription' &&
          g.fallback_group_id_on_invalid_request === null &&
          (mode === 'create' || g.id !== editingGroupId),
      )
      .forEach((g) => options.push({ value: g.id, label: g.name }))
    return options
  }, [allGroups, editingGroupId, mode, t])

  const copyAccountsOptions = useMemo(() => {
    return allGroups
      .filter(
        (g) =>
          g.platform === form.platform &&
          (g.account_count || 0) > 0 &&
          (mode === 'create' || g.id !== editingGroupId),
      )
      .map((g) => ({
        value: g.id,
        label: `${g.name} (${g.account_count || 0} 个账号)`,
      }))
  }, [allGroups, editingGroupId, form.platform, mode])

  return (
    <>
      <ModelsListSection
        state={modelsListState}
        loading={modelsListLoading}
        selectedCount={modelsListSelectedCount}
        onToggleEnabled={onModelsListEnabledToggle}
        onSelectAll={onModelsListSelectAll}
        onInvert={onModelsListInvert}
        onToggleItem={onModelsListToggleItem}
        onMoveItem={onModelsListMoveItem}
        t={t}
      />

      {IMAGE_PRICING_PLATFORMS.has(form.platform) ? (
        <ImagePricingSection
          form={form}
          onChange={onChange}
          formatImagePricePreview={formatImagePricePreview}
          buildFinalPricePreview={buildFinalPricePreview}
          t={t}
        />
      ) : null}

      {form.platform === 'antigravity' ? (
        <>
          <SupportedScopesSection
            scopes={form.supported_model_scopes}
            onToggle={(scope) => {
              const next = [...form.supported_model_scopes]
              const idx = next.indexOf(scope)
              if (idx === -1) next.push(scope)
              else next.splice(idx, 1)
              onChange({ supported_model_scopes: next })
            }}
            t={t}
          />
          <McpXmlSection
            enabled={form.mcp_xml_inject}
            onToggle={() => onChange({ mcp_xml_inject: !form.mcp_xml_inject })}
            t={t}
          />
        </>
      ) : null}

      {form.platform === 'anthropic' ? (
        <ClaudeCodeSection form={form} onChange={onChange} fallbackOptions={fallbackGroupOptions} t={t} />
      ) : null}

      {form.platform === 'openai' ? (
        <OpenAIMessagesDispatchSection
          form={form}
          onChange={onChange}
          onAddMapping={onAddMessagesMapping}
          onRemoveMapping={onRemoveMessagesMapping}
          getRowKey={getMessagesRowKey}
          t={t}
        />
      ) : null}

      {ACCOUNT_FILTER_PLATFORMS.has(form.platform) ? (
        <AccountFiltersSection form={form} onChange={onChange} />
      ) : null}

      {INVALID_FALLBACK_PLATFORMS.has(form.platform) && form.subscription_type !== 'subscription' ? (
        <div className="border-t pt-4">
          <label className="input-label">{t('admin.groups.invalidRequestFallback.title')}</label>
          <Select
            modelValue={form.fallback_group_id_on_invalid_request}
            options={invalidRequestFallbackOptions}
            placeholder={t('admin.groups.invalidRequestFallback.noFallback')}
            onUpdateModelValue={(val) =>
              onChange({ fallback_group_id_on_invalid_request: val as number | null })
            }
          />
          <p className="input-hint">{t('admin.groups.invalidRequestFallback.hint')}</p>
        </div>
      ) : null}

      {form.platform === 'anthropic' ? (
        <ModelRoutingSection
          form={form}
          onChange={onChange}
          rules={modelRoutingRules}
          isEdit={mode === 'edit'}
          getRuleKey={routingContext.getRuleKey}
          getRuleSearchKey={routingContext.getRuleSearchKey}
          accountSearchKeyword={routingContext.accountSearchKeyword}
          accountSearchResults={routingContext.accountSearchResults}
          showAccountDropdown={routingContext.showAccountDropdown}
          onKeywordChange={routingContext.onKeywordChange}
          onSearchFocus={routingContext.onSearchFocus}
          onSelectAccount={routingContext.onSelectAccount}
          onRemoveAccount={routingContext.onRemoveAccount}
          onRemoveRule={routingContext.onRemoveRule}
          onAddRule={routingContext.onAddRule}
          onRulesChange={routingContext.onRulesChange}
          t={t}
        />
      ) : null}
    </>
  )
}

function SortableGroupsList({
  groups,
  onReorder,
  t,
}: {
  groups: AdminGroup[]
  onReorder: (groups: AdminGroup[]) => void
  t: (key: string) => string
}) {
  const dragIndexRef = useRef<number | null>(null)

  const handleDragStart = (index: number) => {
    dragIndexRef.current = index
  }

  const handleDragOver = (event: DragEvent<HTMLDivElement>, index: number) => {
    event.preventDefault()
    const from = dragIndexRef.current
    if (from === null || from === index) return
    const next = [...groups]
    const [item] = next.splice(from, 1)
    next.splice(index, 0, item)
    dragIndexRef.current = index
    onReorder(next)
  }

  const handleDragEnd = () => {
    dragIndexRef.current = null
  }

  return (
    <div className="space-y-2">
      {groups.map((group, index) => (
        <div
          key={group.id}
          draggable
          onDragStart={() => handleDragStart(index)}
          onDragOver={(e) => handleDragOver(e, index)}
          onDragEnd={handleDragEnd}
          className="flex cursor-grab items-center gap-3 rounded-lg border border-gray-200 bg-white p-3 transition-shadow hover:shadow-md active:cursor-grabbing dark:border-dark-600 dark:bg-dark-700"
        >
          <div className="text-gray-400">
            <Icon name="menu" size="md" />
          </div>
          <div className="flex-1">
            <div className="font-medium text-gray-900 dark:text-white">{group.name}</div>
            <div className="text-xs text-gray-500 dark:text-gray-400">
              <span
                className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${platformBadgeClass(
                  group.platform,
                )}`}
              >
                {t(`admin.groups.platforms.${group.platform}`)}
              </span>
            </div>
          </div>
          <div className="text-sm text-gray-400">#{group.id}</div>
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function AdminGroupsPage() {
  const { t } = useI18n()
  const appStore = useApp()
  const onboardingStore = useOnboardingStore()

  const [groups, setGroups] = useState<AdminGroup[]>([])
  const [allGroupsCache, setAllGroupsCache] = useState<AdminGroup[]>([])
  const [loading, setLoading] = useState(false)
  const [usageMap, setUsageMap] = useState<Map<number, { today_cost: number; total_cost: number }>>(
    new Map(),
  )
  const [usageLoading, setUsageLoading] = useState(false)
  const [capacityMap, setCapacityMap] = useState<Map<number, CapacityEntry>>(new Map())
  const [searchQuery, setSearchQuery] = useState('')
  const [filters, setFilters] = useState<GroupFilters>({ platform: '', status: '', is_exclusive: '' })
  const [pagination, setPagination] = useState({
    page: 1,
    page_size: getPersistedPageSize(),
    total: 0,
    pages: 0,
  })
  const [sortState, setSortState] = useState({ sort_by: 'sort_order', sort_order: 'asc' as SortOrder })

  const abortControllerRef = useRef<AbortController | null>(null)
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [showSortModal, setShowSortModal] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [sortSubmitting, setSortSubmitting] = useState(false)
  const [editingGroup, setEditingGroup] = useState<AdminGroup | null>(null)
  const [deletingGroup, setDeletingGroup] = useState<AdminGroup | null>(null)
  const [showRateMultipliersModal, setShowRateMultipliersModal] = useState(false)
  const [rateMultipliersGroup, setRateMultipliersGroup] = useState<AdminGroup | null>(null)
  const [showRPMOverridesModal, setShowRPMOverridesModal] = useState(false)
  const [rpmOverridesGroup, setRpmOverridesGroup] = useState<AdminGroup | null>(null)
  const [sortableGroups, setSortableGroups] = useState<AdminGroup[]>([])

  const [createForm, setCreateForm] = useState<GroupFormState>(createDefaultGroupForm)
  const [editForm, setEditForm] = useState<GroupFormState>(createDefaultGroupForm)
  const prevCreatePlatformRef = useRef<GroupPlatform>('anthropic')
  const prevEditPlatformRef = useRef<GroupPlatform | null>(null)
  const [createModelsListState, setCreateModelsListState] = useState<ModelsListState>(() =>
    createInitialModelsListState(),
  )
  const [editModelsListState, setEditModelsListState] = useState<ModelsListState>(() =>
    createInitialModelsListState(),
  )
  const [createModelsListLoading, setCreateModelsListLoading] = useState(false)
  const [editModelsListLoading, setEditModelsListLoading] = useState(false)
  const [createModelRoutingRules, setCreateModelRoutingRules] = useState<ModelRoutingRule[]>([])
  const [editModelRoutingRules, setEditModelRoutingRules] = useState<ModelRoutingRule[]>([])

  const [accountSearchKeyword, setAccountSearchKeyword] = useState<Record<string, string>>({})
  const [accountSearchResults, setAccountSearchResults] = useState<Record<string, SimpleAccount[]>>({})
  const [showAccountDropdown, setShowAccountDropdown] = useState<Record<string, boolean>>({})

  const createModelsListSelectedCount = useMemo(
    () => createModelsListState.items.filter((item) => item.selected).length,
    [createModelsListState.items],
  )
  const editModelsListSelectedCount = useMemo(
    () => editModelsListState.items.filter((item) => item.selected).length,
    [editModelsListState.items],
  )

  const columns = useMemo<Column[]>(
    () => [
      { key: 'name', label: t('admin.groups.columns.name'), sortable: true },
      { key: 'platform', label: t('admin.groups.columns.platform'), sortable: true },
      { key: 'billing_type', label: t('admin.groups.columns.billingType'), sortable: true },
      { key: 'rate_multiplier', label: t('admin.groups.columns.rateMultiplier'), sortable: true },
      { key: 'is_exclusive', label: t('admin.groups.columns.type'), sortable: true },
      { key: 'account_count', label: t('admin.groups.columns.accounts'), sortable: true },
      { key: 'capacity', label: t('admin.groups.columns.capacity'), sortable: false },
      { key: 'usage', label: t('admin.groups.columns.usage'), sortable: false },
      { key: 'status', label: t('admin.groups.columns.status'), sortable: true },
      { key: 'actions', label: t('admin.groups.columns.actions'), sortable: false },
    ],
    [t],
  )

  const statusOptions = useMemo(
    () => [
      { value: '', label: t('admin.groups.allStatus') },
      { value: 'active', label: t('admin.accounts.status.active') },
      { value: 'inactive', label: t('admin.accounts.status.inactive') },
    ],
    [t],
  )

  const exclusiveOptions = useMemo(
    () => [
      { value: '', label: t('admin.groups.allGroups') },
      { value: 'true', label: t('admin.groups.exclusive') },
      { value: 'false', label: t('admin.groups.nonExclusive') },
    ],
    [t],
  )

  const platformFilterOptions = useMemo(
    () => [
      { value: '', label: t('admin.groups.allPlatforms') },
      { value: 'anthropic', label: 'Anthropic' },
      { value: 'openai', label: 'OpenAI' },
      { value: 'gemini', label: 'Gemini' },
      { value: 'antigravity', label: 'Antigravity' },
    ],
    [t],
  )

  const platformOptions = useMemo(
    () => [
      { value: 'anthropic', label: 'Anthropic' },
      { value: 'openai', label: 'OpenAI' },
      { value: 'gemini', label: 'Gemini' },
      { value: 'antigravity', label: 'Antigravity' },
    ],
    [],
  )

  const editStatusOptions = useMemo(
    () => [
      { value: 'active', label: t('admin.accounts.status.active') },
      { value: 'inactive', label: t('admin.accounts.status.inactive') },
    ],
    [t],
  )

  const formatImagePricePreview = useCallback(
    (value: number | string | null | undefined) => {
      if (value === null || value === undefined || value === '') {
        return t('admin.groups.imagePricing.notConfigured')
      }
      const price = Number(value)
      if (!Number.isFinite(price) || price < 0) {
        return t('admin.groups.imagePricing.notConfigured')
      }
      return `$${price.toFixed(6).replace(/0+$/, '').replace(/\.$/, '')}`
    },
    [t],
  )

  const buildImageFinalPricePreview = useCallback(
    (form: ImagePricingFormState) => {
      const multiplier = form.image_rate_independent
        ? normalizePreviewNumber(form.image_rate_multiplier, 1)
        : normalizePreviewNumber(form.rate_multiplier, 1)
      return IMAGE_PRICING_TIERS.map((tier) => {
        const basePrice = normalizePreviewNumber(form[tier.key])
        return {
          label: tier.label,
          value:
            basePrice > 0
              ? formatImagePricePreview(basePrice * multiplier)
              : t('admin.groups.imagePricing.notConfigured'),
        }
      })
    },
    [formatImagePricePreview, t],
  )

  const deleteConfirmMessage = useMemo(() => {
    if (!deletingGroup) return ''
    if (deletingGroup.subscription_type === 'subscription') {
      return t('admin.groups.deleteConfirmSubscription', { name: deletingGroup.name })
    }
    return t('admin.groups.deleteConfirm', { name: deletingGroup.name })
  }, [deletingGroup, t])

  const clearAccountSearchStateByKey = useCallback((key: string) => {
    setAccountSearchKeyword((prev) => {
      const next = { ...prev }
      delete next[key]
      return next
    })
    setAccountSearchResults((prev) => {
      const next = { ...prev }
      delete next[key]
      return next
    })
    setShowAccountDropdown((prev) => {
      const next = { ...prev }
      delete next[key]
      return next
    })
  }, [])

  const clearAllAccountSearchState = useCallback(() => {
    setAccountSearchKeyword({})
    setAccountSearchResults({})
    setShowAccountDropdown({})
  }, [])

  const accountSearchRunner = useKeyedDebouncedSearch<SimpleAccount[]>({
    delay: 300,
    search: async (keyword, { signal }) => {
      const res = await adminAccountsAPI.list(
        1,
        20,
        { search: keyword, platform: 'anthropic' },
        { signal },
      )
      return res.items.map((account) => ({ id: account.id, name: account.name }))
    },
    onSuccess: (key, result) => {
      setAccountSearchResults((prev) => ({ ...prev, [key]: result }))
    },
    onError: (key) => {
      setAccountSearchResults((prev) => ({ ...prev, [key]: [] }))
    },
  })

  const getCreateRuleSearchKey = useCallback(
    (rule: ModelRoutingRule) => `create-${resolveCreateRuleKey(rule)}`,
    [],
  )
  const getEditRuleSearchKey = useCallback(
    (rule: ModelRoutingRule) => `edit-${resolveEditRuleKey(rule)}`,
    [],
  )

  const loadUsageSummary = useCallback(async () => {
    setUsageLoading(true)
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
      const data = await adminGroupsAPI.getUsageSummary(tz)
      const map = new Map<number, { today_cost: number; total_cost: number }>()
      for (const item of data) {
        map.set(item.group_id, { today_cost: item.today_cost, total_cost: item.total_cost })
      }
      setUsageMap(map)
    } catch (error) {
      console.error('Error loading group usage summary:', error)
    } finally {
      setUsageLoading(false)
    }
  }, [])

  const loadCapacitySummary = useCallback(async () => {
    try {
      const data = await adminGroupsAPI.getCapacitySummary()
      const map = new Map<number, CapacityEntry>()
      for (const item of data) {
        map.set(item.group_id, {
          concurrencyUsed: item.concurrency_used,
          concurrencyMax: item.concurrency_max,
          sessionsUsed: item.sessions_used,
          sessionsMax: item.sessions_max,
          rpmUsed: item.rpm_used,
          rpmMax: item.rpm_max,
        })
      }
      setCapacityMap(map)
    } catch (error) {
      console.error('Error loading group capacity summary:', error)
    }
  }, [])

  const loadGroups = useCallback(async () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }
    const currentController = new AbortController()
    abortControllerRef.current = currentController
    const { signal } = currentController
    setLoading(true)
    try {
      const response = await adminGroupsAPI.list(
        pagination.page,
        pagination.page_size,
        {
          platform: (filters.platform as GroupPlatform) || undefined,
          status: filters.status ? (filters.status as 'active' | 'inactive') : undefined,
          is_exclusive: filters.is_exclusive ? filters.is_exclusive === 'true' : undefined,
          search: searchQuery.trim() || undefined,
          sort_by: sortState.sort_by,
          sort_order: sortState.sort_order,
        },
        { signal },
      )
      if (signal.aborted) return
      setGroups(response.items)
      setPagination((prev) => ({
        ...prev,
        total: response.total,
        pages: response.pages,
      }))
      void loadUsageSummary()
      void loadCapacitySummary()
    } catch (error: unknown) {
      if (
        signal.aborted ||
        (error instanceof DOMException && error.name === 'AbortError') ||
        (error as { code?: string })?.code === 'ERR_CANCELED'
      ) {
        return
      }
      appStore.showError(t('admin.groups.failedToLoad'))
      console.error('Error loading groups:', error)
    } finally {
      if (abortControllerRef.current === currentController && !signal.aborted) {
        setLoading(false)
      }
    }
  }, [
    appStore,
    filters.is_exclusive,
    filters.platform,
    filters.status,
    loadCapacitySummary,
    loadUsageSummary,
    pagination.page,
    pagination.page_size,
    searchQuery,
    sortState.sort_by,
    sortState.sort_order,
    t,
  ])

  const loadModelsListCandidates = useCallback(
    async (mode: 'create' | 'edit', groupID: number, platform: GroupPlatform) => {
      const request = { mode, groupID, platform }
      const requestID = modelsListCandidatesTracker.next(request)
      const setLoadingFn = mode === 'create' ? setCreateModelsListLoading : setEditModelsListLoading
      const setStateFn = mode === 'create' ? setCreateModelsListState : setEditModelsListState
      setLoadingFn(true)
      try {
        const models = await adminGroupsAPI.getModelsListCandidates(groupID, platform)
        if (!modelsListCandidatesTracker.isCurrent(requestID, request)) return
        setStateFn((prev) => {
          const next = cloneModelsListState(prev)
          setModelsListCandidates(next, models)
          return next
        })
      } catch (error) {
        if (!modelsListCandidatesTracker.isCurrent(requestID, request)) return
        console.error('Error loading group models list candidates:', error)
      } finally {
        if (modelsListCandidatesTracker.isCurrent(requestID, request)) {
          setLoadingFn(false)
        }
      }
    },
    [],
  )

  const handleSearch = useCallback(() => {
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current)
    searchTimeoutRef.current = setTimeout(() => {
      setPagination((prev) => ({ ...prev, page: 1 }))
      void loadGroups()
    }, 300)
  }, [loadGroups])

  const handlePageChange = useCallback(
    (page: number) => {
      setPagination((prev) => ({ ...prev, page }))
    },
    [],
  )

  const handlePageSizeChange = useCallback((pageSize: number) => {
    setPagination((prev) => ({ ...prev, page_size: pageSize, page: 1 }))
  }, [])

  const handleSort = useCallback((key: string, order: SortOrder) => {
    setSortState({ sort_by: key, sort_order: order })
    setPagination((prev) => ({ ...prev, page: 1 }))
  }, [])

  const refreshAllGroupsCache = useCallback(async () => {
    try {
      const data = await adminGroupsAPI.getAll()
      setAllGroupsCache(data)
    } catch {
      // keep existing cache
    }
  }, [])

  const openCreateModal = useCallback(() => {
    setShowCreateModal(true)
    void loadModelsListCandidates('create', 0, createForm.platform)
    void refreshAllGroupsCache()
  }, [createForm.platform, loadModelsListCandidates, refreshAllGroupsCache])

  const closeCreateModal = useCallback(() => {
    setShowCreateModal(false)
    createModelRoutingRules.forEach((rule) => {
      accountSearchRunner.clearKey(getCreateRuleSearchKey(rule))
    })
    clearAllAccountSearchState()
    setCreateForm(createDefaultGroupForm())
    setCreateModelsListState(createInitialModelsListState())
    setCreateModelRoutingRules([])
  }, [
    accountSearchRunner,
    clearAllAccountSearchState,
    createModelRoutingRules,
    getCreateRuleSearchKey,
  ])

  const closeEditModal = useCallback(() => {
    editModelRoutingRules.forEach((rule) => {
      accountSearchRunner.clearKey(getEditRuleSearchKey(rule))
    })
    clearAllAccountSearchState()
    setShowEditModal(false)
    setEditingGroup(null)
    setEditModelRoutingRules([])
    setEditForm(createDefaultGroupForm())
    setEditModelsListState(createInitialModelsListState())
  }, [
    accountSearchRunner,
    clearAllAccountSearchState,
    editModelRoutingRules,
    getEditRuleSearchKey,
  ])

  const buildGroupRequestPayload = useCallback(
    (
      form: GroupFormState,
      modelsList: ModelsListState,
      routingRules: ModelRoutingRule[],
      isEdit: boolean,
    ): CreateGroupRequest | UpdateGroupRequest => {
      const payload: CreateGroupRequest = {
        ...form,
        daily_limit_usd: normalizeOptionalLimit(form.daily_limit_usd),
        weekly_limit_usd: normalizeOptionalLimit(form.weekly_limit_usd),
        monthly_limit_usd: normalizeOptionalLimit(form.monthly_limit_usd),
        model_routing: convertRoutingRulesToApiFormat(routingRules),
        models_list_config: buildModelsListConfig(modelsList),
        supported_model_scopes: normalizeSupportedModelScopesForPlatform(
          form.platform,
          form.supported_model_scopes,
        ),
        messages_dispatch_model_config:
          form.platform === 'openai'
            ? messagesDispatchFormStateToConfig({
                allow_messages_dispatch: form.allow_messages_dispatch,
                opus_mapped_model: form.opus_mapped_model,
                sonnet_mapped_model: form.sonnet_mapped_model,
                haiku_mapped_model: form.haiku_mapped_model,
                exact_model_mappings: form.exact_model_mappings,
              })
            : undefined,
      }
      payload.daily_limit_usd = emptyToNull(payload.daily_limit_usd)
      payload.weekly_limit_usd = emptyToNull(payload.weekly_limit_usd)
      payload.monthly_limit_usd = emptyToNull(payload.monthly_limit_usd)
      payload.image_rate_multiplier = normalizeImageRateMultiplier(payload.image_rate_multiplier)

      if (isEdit) {
        const editPayload = payload as UpdateGroupRequest
        editPayload.fallback_group_id =
          form.fallback_group_id === null ? 0 : form.fallback_group_id
        editPayload.fallback_group_id_on_invalid_request =
          form.fallback_group_id_on_invalid_request === null
            ? 0
            : form.fallback_group_id_on_invalid_request
        return editPayload
      }
      return payload
    },
    [],
  )

  const handleCreateGroup = useCallback(
    async (event: FormEvent) => {
      event.preventDefault()
      if (!createForm.name.trim()) {
        appStore.showError(t('admin.groups.nameRequired'))
        return
      }
      setSubmitting(true)
      try {
        const requestData = buildGroupRequestPayload(
          createForm,
          createModelsListState,
          createModelRoutingRules,
          false,
        )
        await adminGroupsAPI.create(requestData as CreateGroupRequest)
        appStore.showSuccess(t('admin.groups.groupCreated'))
        closeCreateModal()
        void loadGroups()
        if (onboardingStore.isCurrentStep('[data-tour="group-form-submit"]')) {
          onboardingStore.nextStep(500)
        }
      } catch (error) {
        appStore.showError(extractApiErrorMessage(error) || t('admin.groups.failedToCreate'))
        console.error('Error creating group:', error)
      } finally {
        setSubmitting(false)
      }
    },
    [
      appStore,
      buildGroupRequestPayload,
      closeCreateModal,
      createForm,
      createModelRoutingRules,
      createModelsListState,
      loadGroups,
      onboardingStore,
      t,
    ],
  )

  const handleEdit = useCallback(
    async (group: AdminGroup) => {
      setEditingGroup(group)
      const messagesDispatchFormState = messagesDispatchConfigToFormState(
        group.messages_dispatch_model_config,
      )
      setEditForm({
        name: group.name,
        description: group.description || '',
        platform: group.platform,
        rate_multiplier: group.rate_multiplier,
        is_exclusive: group.is_exclusive,
        status: group.status,
        subscription_type: group.subscription_type || 'standard',
        daily_limit_usd: group.daily_limit_usd,
        weekly_limit_usd: group.weekly_limit_usd,
        monthly_limit_usd: group.monthly_limit_usd,
        allow_image_generation: group.allow_image_generation ?? false,
        image_rate_independent: group.image_rate_independent ?? false,
        image_rate_multiplier: group.image_rate_multiplier ?? 1,
        image_price_1k: group.image_price_1k,
        image_price_2k: group.image_price_2k,
        image_price_4k: group.image_price_4k,
        claude_code_only: group.claude_code_only || false,
        fallback_group_id: group.fallback_group_id,
        fallback_group_id_on_invalid_request: group.fallback_group_id_on_invalid_request,
        allow_messages_dispatch:
          group.allow_messages_dispatch || messagesDispatchFormState.allow_messages_dispatch,
        default_mapped_model: group.default_mapped_model || '',
        opus_mapped_model: messagesDispatchFormState.opus_mapped_model,
        sonnet_mapped_model: messagesDispatchFormState.sonnet_mapped_model,
        haiku_mapped_model: messagesDispatchFormState.haiku_mapped_model,
        exact_model_mappings: messagesDispatchFormState.exact_model_mappings,
        require_oauth_only: group.require_oauth_only ?? false,
        require_privacy_set: group.require_privacy_set ?? false,
        model_routing_enabled: group.model_routing_enabled || false,
        supported_model_scopes: group.supported_model_scopes || [
          'claude',
          'gemini_text',
          'gemini_image',
        ],
        mcp_xml_inject: group.mcp_xml_inject ?? true,
        copy_accounts_from_group_ids: [],
        rpm_limit: group.rpm_limit ?? 0,
      })
      setEditModelsListState(resetModelsListState(editModelsListState, group.models_list_config))
      setEditModelRoutingRules(await convertApiFormatToRoutingRules(group.model_routing))
      void loadModelsListCandidates('edit', group.id, group.platform)
      void refreshAllGroupsCache()
      setShowEditModal(true)
    },
    [editModelsListState, loadModelsListCandidates, refreshAllGroupsCache],
  )

  const handleUpdateGroup = useCallback(
    async (event: FormEvent) => {
      event.preventDefault()
      if (!editingGroup) return
      if (!editForm.name.trim()) {
        appStore.showError(t('admin.groups.nameRequired'))
        return
      }
      setSubmitting(true)
      try {
        const payload = buildGroupRequestPayload(
          editForm,
          editModelsListState,
          editModelRoutingRules,
          true,
        )
        await adminGroupsAPI.update(editingGroup.id, payload as UpdateGroupRequest)
        appStore.showSuccess(t('admin.groups.groupUpdated'))
        closeEditModal()
        void loadGroups()
      } catch (error) {
        appStore.showError(extractApiErrorMessage(error) || t('admin.groups.failedToUpdate'))
        console.error('Error updating group:', error)
      } finally {
        setSubmitting(false)
      }
    },
    [
      appStore,
      buildGroupRequestPayload,
      closeEditModal,
      editForm,
      editModelRoutingRules,
      editModelsListState,
      editingGroup,
      loadGroups,
      t,
    ],
  )

  const confirmDelete = useCallback(async () => {
    if (!deletingGroup) return
    try {
      await adminGroupsAPI.delete(deletingGroup.id)
      appStore.showSuccess(t('admin.groups.groupDeleted'))
      setShowDeleteDialog(false)
      setDeletingGroup(null)
      void loadGroups()
    } catch (error) {
      appStore.showError(extractApiErrorMessage(error) || t('admin.groups.failedToDelete'))
      console.error('Error deleting group:', error)
    }
  }, [appStore, deletingGroup, loadGroups, t])

  const openSortModal = useCallback(async () => {
    try {
      const allGroups = await adminGroupsAPI.getAll()
      setSortableGroups([...allGroups].sort((a, b) => a.sort_order - b.sort_order))
      setShowSortModal(true)
    } catch (error) {
      appStore.showError(t('admin.groups.failedToLoad'))
      console.error('Error loading groups for sorting:', error)
    }
  }, [appStore, t])

  const closeSortModal = useCallback(() => {
    setShowSortModal(false)
    setSortableGroups([])
  }, [])

  const saveSortOrder = useCallback(async () => {
    setSortSubmitting(true)
    try {
      const updates = sortableGroups.map((g, index) => ({ id: g.id, sort_order: index * 10 }))
      await adminGroupsAPI.updateSortOrder(updates)
      appStore.showSuccess(t('admin.groups.sortOrderUpdated'))
      closeSortModal()
      void loadGroups()
    } catch (error) {
      appStore.showError(extractApiErrorMessage(error) || t('admin.groups.failedToUpdateSortOrder'))
      console.error('Error updating sort order:', error)
    } finally {
      setSortSubmitting(false)
    }
  }, [appStore, closeSortModal, loadGroups, sortableGroups, t])

  const makeRoutingContext = useCallback(
    (mode: 'create' | 'edit') => {
      const getRuleKey = mode === 'create' ? resolveCreateRuleKey : resolveEditRuleKey
      const getRuleSearchKey = mode === 'create' ? getCreateRuleSearchKey : getEditRuleSearchKey
      const setRules =
        mode === 'create' ? setCreateModelRoutingRules : setEditModelRoutingRules

      return {
        getRuleKey,
        getRuleSearchKey,
        accountSearchKeyword,
        accountSearchResults,
        showAccountDropdown,
        onKeywordChange: (rule: ModelRoutingRule, keyword: string) => {
          const key = getRuleSearchKey(rule)
          setAccountSearchKeyword((prev) => ({ ...prev, [key]: keyword }))
          accountSearchRunner.trigger(key, keyword)
        },
        onSearchFocus: (rule: ModelRoutingRule) => {
          const key = getRuleSearchKey(rule)
          setShowAccountDropdown((prev) => ({ ...prev, [key]: true }))
          if (!accountSearchResults[key]?.length) {
            accountSearchRunner.trigger(key, accountSearchKeyword[key] || '')
          }
        },
        onSelectAccount: (rule: ModelRoutingRule, account: SimpleAccount) => {
          if (!rule.accounts.some((a) => a.id === account.id)) {
            rule.accounts.push(account)
            setRules((prev) => [...prev])
          }
          const key = getRuleSearchKey(rule)
          setAccountSearchKeyword((prev) => ({ ...prev, [key]: '' }))
          setShowAccountDropdown((prev) => ({ ...prev, [key]: false }))
        },
        onRemoveAccount: (rule: ModelRoutingRule, accountId: number) => {
          rule.accounts = rule.accounts.filter((a) => a.id !== accountId)
          setRules((prev) => [...prev])
        },
        onRemoveRule: (rule: ModelRoutingRule) => {
          const key = getRuleSearchKey(rule)
          accountSearchRunner.clearKey(key)
          clearAccountSearchStateByKey(key)
          setRules((prev) => prev.filter((r) => r !== rule))
        },
        onAddRule: () => {
          setRules((prev) => [...prev, { pattern: '', accounts: [] }])
        },
        onRulesChange: () => {
          setRules((prev) => [...prev])
        },
      }
    },
    [
      accountSearchKeyword,
      accountSearchResults,
      accountSearchRunner,
      clearAccountSearchStateByKey,
      getCreateRuleSearchKey,
      getEditRuleSearchKey,
      showAccountDropdown,
    ],
  )

  const createRoutingContext = useMemo(() => makeRoutingContext('create'), [makeRoutingContext])
  const editRoutingContext = useMemo(() => makeRoutingContext('edit'), [makeRoutingContext])

  const copyAccountsOptionsCreate = useMemo(
    () =>
      allGroupsCache
        .filter((g) => g.platform === createForm.platform && (g.account_count || 0) > 0)
        .map((g) => ({
          value: g.id,
          label: `${g.name} (${g.account_count || 0} 个账号)`,
        })),
    [allGroupsCache, createForm.platform],
  )

  const copyAccountsOptionsEdit = useMemo(
    () =>
      allGroupsCache
        .filter(
          (g) =>
            g.platform === editForm.platform &&
            (g.account_count || 0) > 0 &&
            g.id !== editingGroup?.id,
        )
        .map((g) => ({
          value: g.id,
          label: `${g.name} (${g.account_count || 0} 个账号)`,
        })),
    [allGroupsCache, editForm.platform, editingGroup?.id],
  )

  const tableCells = useMemo(
    () => ({
      name: ({ value }: DataTableCellContext) => (
        <span className="font-medium text-gray-900 dark:text-white">{String(value ?? '')}</span>
      ),
      platform: ({ value }: DataTableCellContext) => (
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${platformBadgeClass(
            String(value ?? ''),
          )}`}
        >
          <PlatformIcon platform={String(value ?? '')} size="xs" />
          {t(`admin.groups.platforms.${String(value ?? '')}`)}
        </span>
      ),
      billing_type: ({ row }: DataTableCellContext) => (
        <div className="space-y-1">
          <span
            className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
              row.subscription_type === 'subscription'
                ? 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400'
                : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'
            }`}
          >
            {row.subscription_type === 'subscription'
              ? t('admin.groups.subscription.subscription')
              : t('admin.groups.subscription.standard')}
          </span>
          {row.subscription_type === 'subscription' ? (
            <div className="text-xs text-gray-500 dark:text-gray-400">
              {row.daily_limit_usd || row.weekly_limit_usd || row.monthly_limit_usd ? (
                <>
                  {row.daily_limit_usd ? (
                    <span>
                      ${row.daily_limit_usd}/{t('admin.groups.limitDay')}
                    </span>
                  ) : null}
                  {row.daily_limit_usd && (row.weekly_limit_usd || row.monthly_limit_usd) ? (
                    <span className="mx-1 text-gray-300 dark:text-gray-600">·</span>
                  ) : null}
                  {row.weekly_limit_usd ? (
                    <span>
                      ${row.weekly_limit_usd}/{t('admin.groups.limitWeek')}
                    </span>
                  ) : null}
                  {row.weekly_limit_usd && row.monthly_limit_usd ? (
                    <span className="mx-1 text-gray-300 dark:text-gray-600">·</span>
                  ) : null}
                  {row.monthly_limit_usd ? (
                    <span>
                      ${row.monthly_limit_usd}/{t('admin.groups.limitMonth')}
                    </span>
                  ) : null}
                </>
              ) : (
                <span className="text-gray-400 dark:text-gray-500">
                  {t('admin.groups.subscription.noLimit')}
                </span>
              )}
            </div>
          ) : null}
        </div>
      ),
      rate_multiplier: ({ value }: DataTableCellContext) => (
        <span className="text-sm text-gray-700 dark:text-gray-300">{value}x</span>
      ),
      is_exclusive: ({ value }: DataTableCellContext) => (
        <span className={`badge ${value ? 'badge-primary' : 'badge-gray'}`}>
          {value ? t('admin.groups.exclusive') : t('admin.groups.public')}
        </span>
      ),
      account_count: ({ row }: DataTableCellContext) => (
        <div className="space-y-0.5 text-xs">
          <div>
            <span className="text-gray-500 dark:text-gray-400">{t('admin.groups.accountsAvailable')}</span>
            <span className="ml-1 font-medium text-emerald-600 dark:text-emerald-400">
              {row.active_account_count || 0}
            </span>
            <span className="ml-1 inline-flex items-center rounded bg-gray-100 px-1.5 py-0.5 font-medium text-gray-800 dark:bg-dark-600 dark:text-gray-300">
              {t('admin.groups.accountsUnit')}
            </span>
          </div>
          {row.rate_limited_account_count ? (
            <div>
              <span className="text-gray-500 dark:text-gray-400">{t('admin.groups.accountsRateLimited')}</span>
              <span className="ml-1 font-medium text-amber-600 dark:text-amber-400">
                {row.rate_limited_account_count}
              </span>
              <span className="ml-1 inline-flex items-center rounded bg-gray-100 px-1.5 py-0.5 font-medium text-gray-800 dark:bg-dark-600 dark:text-gray-300">
                {t('admin.groups.accountsUnit')}
              </span>
            </div>
          ) : null}
          <div>
            <span className="text-gray-500 dark:text-gray-400">{t('admin.groups.accountsTotal')}</span>
            <span className="ml-1 font-medium text-gray-700 dark:text-gray-300">{row.account_count || 0}</span>
            <span className="ml-1 inline-flex items-center rounded bg-gray-100 px-1.5 py-0.5 font-medium text-gray-800 dark:bg-dark-600 dark:text-gray-300">
              {t('admin.groups.accountsUnit')}
            </span>
          </div>
        </div>
      ),
      capacity: ({ row }: DataTableCellContext) => {
        const capacity = capacityMap.get(row.id)
        return capacity ? (
          <GroupCapacityBadge
            concurrencyUsed={capacity.concurrencyUsed}
            concurrencyMax={capacity.concurrencyMax}
            sessionsUsed={capacity.sessionsUsed}
            sessionsMax={capacity.sessionsMax}
            rpmUsed={capacity.rpmUsed}
            rpmMax={capacity.rpmMax}
          />
        ) : (
          <span className="text-xs text-gray-400">—</span>
        )
      },
      usage: ({ row }: DataTableCellContext) =>
        usageLoading ? (
          <div className="text-xs text-gray-400">—</div>
        ) : (
          <div className="space-y-0.5 text-xs">
            <div className="text-gray-500 dark:text-gray-400">
              <span className="text-gray-400 dark:text-gray-500">{t('admin.groups.usageToday')}</span>
              <span className="ml-1 font-medium text-gray-700 dark:text-gray-300">
                ${formatCost(usageMap.get(row.id)?.today_cost ?? 0)}
              </span>
            </div>
            <div className="text-gray-500 dark:text-gray-400">
              <span className="text-gray-400 dark:text-gray-500">{t('admin.groups.usageTotal')}</span>
              <span className="ml-1 font-medium text-gray-700 dark:text-gray-300">
                ${formatCost(usageMap.get(row.id)?.total_cost ?? 0)}
              </span>
            </div>
          </div>
        ),
      status: ({ value }: DataTableCellContext) => (
        <span className={`badge ${value === 'active' ? 'badge-success' : 'badge-danger'}`}>
          {t(`admin.accounts.status.${String(value ?? '')}`)}
        </span>
      ),
      actions: ({ row }: DataTableCellContext) => (
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => void handleEdit(row)}
            className="flex flex-col items-center gap-0.5 rounded-lg p-1.5 text-gray-500 transition-colors hover:bg-gray-100 hover:text-primary-600 dark:hover:bg-dark-700 dark:hover:text-primary-400"
          >
            <Icon name="edit" size="sm" />
            <span className="text-xs">{t('common.edit')}</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setRateMultipliersGroup(row)
              setShowRateMultipliersModal(true)
            }}
            className="flex flex-col items-center gap-0.5 rounded-lg p-1.5 text-gray-500 transition-colors hover:bg-gray-100 hover:text-purple-600 dark:hover:bg-dark-700 dark:hover:text-purple-400"
          >
            <Icon name="dollar" size="sm" />
            <span className="text-xs">{t('admin.groups.rateMultipliers')}</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setRpmOverridesGroup(row)
              setShowRPMOverridesModal(true)
            }}
            className="flex flex-col items-center gap-0.5 rounded-lg p-1.5 text-gray-500 transition-colors hover:bg-gray-100 hover:text-orange-600 dark:hover:bg-dark-700 dark:hover:text-orange-400"
          >
            <Icon name="bolt" size="sm" />
            <span className="text-xs">{t('admin.groups.rpmOverrides')}</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setDeletingGroup(row)
              setShowDeleteDialog(true)
            }}
            className="flex flex-col items-center gap-0.5 rounded-lg p-1.5 text-gray-500 transition-colors hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20 dark:hover:text-red-400"
          >
            <Icon name="trash" size="sm" />
            <span className="text-xs">{t('common.delete')}</span>
          </button>
        </div>
      ),
    }),
    [capacityMap, handleEdit, t, usageLoading, usageMap],
  )

  useEffect(() => {
    void loadGroups()
  }, [loadGroups])

  useEffect(() => {
    void loadModelsListCandidates('create', 0, createForm.platform)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (createForm.subscription_type === 'subscription') {
      setCreateForm((prev) => ({
        ...prev,
        is_exclusive: true,
        fallback_group_id_on_invalid_request: null,
      }))
    }
  }, [createForm.subscription_type])

  useEffect(() => {
    if (!showCreateModal) {
      prevCreatePlatformRef.current = createForm.platform
      return
    }
    if (prevCreatePlatformRef.current === createForm.platform) return
    prevCreatePlatformRef.current = createForm.platform

    if (!INVALID_FALLBACK_PLATFORMS.has(createForm.platform)) {
      setCreateForm((prev) => ({ ...prev, fallback_group_id_on_invalid_request: null }))
    }
    if (createForm.platform !== 'openai') {
      setCreateForm((prev) => {
        const next = { ...prev }
        resetMessagesDispatchFormState(next)
        return next
      })
    }
    if (!ACCOUNT_FILTER_PLATFORMS.has(createForm.platform)) {
      setCreateForm((prev) => ({
        ...prev,
        require_oauth_only: false,
        require_privacy_set: false,
      }))
    }
    setCreateModelsListState((prev) => resetModelsListState(prev))
    void loadModelsListCandidates('create', 0, createForm.platform)
  }, [createForm.platform, loadModelsListCandidates, showCreateModal])

  useEffect(() => {
    if (!showEditModal || !editingGroup) {
      prevEditPlatformRef.current = editForm.platform
      return
    }
    if (prevEditPlatformRef.current === editForm.platform) return
    prevEditPlatformRef.current = editForm.platform

    if (!INVALID_FALLBACK_PLATFORMS.has(editForm.platform)) {
      setEditForm((prev) => ({ ...prev, fallback_group_id_on_invalid_request: null }))
    }
    if (editForm.platform !== 'openai') {
      setEditForm((prev) => {
        const next = { ...prev }
        resetMessagesDispatchFormState(next)
        return { ...next, allow_messages_dispatch: false, default_mapped_model: '' }
      })
    }
    if (!ACCOUNT_FILTER_PLATFORMS.has(editForm.platform)) {
      setEditForm((prev) => ({
        ...prev,
        require_oauth_only: false,
        require_privacy_set: false,
      }))
    }
    setEditModelsListState((prev) =>
      resetModelsListState(
        prev,
        editForm.platform === editingGroup.platform ? editingGroup.models_list_config : undefined,
      ),
    )
    void loadModelsListCandidates('edit', editingGroup.id, editForm.platform)
  }, [editForm.platform, editingGroup, loadModelsListCandidates, showEditModal])

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement
      if (!target.closest('.account-search-container')) {
        setShowAccountDropdown({})
      }
    }
    document.addEventListener('click', handleClickOutside)
    return () => {
      document.removeEventListener('click', handleClickOutside)
      accountSearchRunner.clearAll()
      clearAllAccountSearchState()
    }
  }, [accountSearchRunner, clearAllAccountSearchState])

  useEffect(() => {
    return () => {
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current)
      abortControllerRef.current?.abort()
    }
  }, [])

  return (
    <AppLayout>
      <TablePageLayout
        filters={
          <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
            <div className="flex flex-1 flex-wrap items-center gap-3">
              <div className="relative w-full sm:w-64">
                <Icon
                  name="search"
                  size="md"
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500"
                />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => {
                    setSearchQuery(e.target.value)
                    handleSearch()
                  }}
                  placeholder={t('admin.groups.searchGroups')}
                  className="input pl-10"
                />
              </div>
              <Select
                modelValue={filters.platform}
                options={platformFilterOptions}
                placeholder={t('admin.groups.allPlatforms')}
                className="w-44"
                onUpdateModelValue={(val) => {
                  setFilters((prev) => ({ ...prev, platform: String(val ?? '') }))
                  setPagination((prev) => ({ ...prev, page: 1 }))
                  void loadGroups()
                }}
              />
              <Select
                modelValue={filters.status}
                options={statusOptions}
                placeholder={t('admin.groups.allStatus')}
                className="w-40"
                onUpdateModelValue={(val) => {
                  setFilters((prev) => ({ ...prev, status: String(val ?? '') }))
                  setPagination((prev) => ({ ...prev, page: 1 }))
                  void loadGroups()
                }}
              />
              <Select
                modelValue={filters.is_exclusive}
                options={exclusiveOptions}
                placeholder={t('admin.groups.allGroups')}
                className="w-44"
                onUpdateModelValue={(val) => {
                  setFilters((prev) => ({ ...prev, is_exclusive: String(val ?? '') }))
                  setPagination((prev) => ({ ...prev, page: 1 }))
                  void loadGroups()
                }}
              />
            </div>
            <div className="flex w-full flex-shrink-0 flex-wrap items-center justify-end gap-3 lg:w-auto">
              <button
                type="button"
                onClick={() => void loadGroups()}
                disabled={loading}
                className="btn btn-secondary"
                title={t('common.refresh')}
              >
                <Icon name="refresh" size="md" className={loading ? 'animate-spin' : ''} />
              </button>
              <button type="button" onClick={() => void openSortModal()} className="btn btn-secondary" title={t('admin.groups.sortOrder')}>
                <Icon name="arrowsUpDown" size="md" className="mr-2" />
                {t('admin.groups.sortOrder')}
              </button>
              <button type="button" onClick={openCreateModal} className="btn btn-primary" data-tour="groups-create-btn">
                <Icon name="plus" size="md" className="mr-2" />
                {t('admin.groups.createGroup')}
              </button>
            </div>
          </div>
        }
        table={
          <DataTable
            columns={columns}
            data={groups}
            loading={loading}
            serverSideSort
            defaultSortKey="sort_order"
            defaultSortOrder="asc"
            onSort={handleSort}
            cells={tableCells}
            emptySlot={
              <EmptyState
                title={t('admin.groups.noGroupsYet')}
                description={t('admin.groups.createFirstGroup')}
                actionText={t('admin.groups.createGroup')}
                onAction={openCreateModal}
              />
            }
          />
        }
        pagination={
          pagination.total > 0 ? (
            <Pagination
              page={pagination.page}
              total={pagination.total}
              pageSize={pagination.page_size}
              onUpdatePage={handlePageChange}
              onUpdatePageSize={handlePageSizeChange}
            />
          ) : null
        }
      />

      <BaseDialog show={showCreateModal} title={t('admin.groups.createGroup')} width="normal" onClose={closeCreateModal}
        footer={
          <div className="flex justify-end gap-3 pt-4">
            <button type="button" onClick={closeCreateModal} className="btn btn-secondary">
              {t('common.cancel')}
            </button>
            <button type="submit" form="create-group-form" disabled={submitting} className="btn btn-primary" data-tour="group-form-submit">
              {submitting ? <SubmitSpinner /> : null}
              {submitting ? t('admin.groups.creating') : t('common.create')}
            </button>
          </div>
        }
      >
        <form id="create-group-form" onSubmit={handleCreateGroup} className="space-y-5">
          <div>
            <label className="input-label">{t('admin.groups.form.name')}</label>
            <input
              type="text"
              required
              value={createForm.name}
              onChange={(e) => setCreateForm((prev) => ({ ...prev, name: e.target.value }))}
              className="input"
              placeholder={t('admin.groups.enterGroupName')}
              data-tour="group-form-name"
            />
          </div>
          <div>
            <label className="input-label">{t('admin.groups.form.description')}</label>
            <textarea
              rows={3}
              value={createForm.description}
              onChange={(e) => setCreateForm((prev) => ({ ...prev, description: e.target.value }))}
              className="input"
              placeholder={t('admin.groups.optionalDescription')}
            />
          </div>
          <div>
            <label className="input-label">{t('admin.groups.form.platform')}</label>
            <Select
              modelValue={createForm.platform}
              options={platformOptions}
              data-tour="group-form-platform"
              onUpdateModelValue={(val) =>
                setCreateForm((prev) => ({
                  ...prev,
                  platform: val as GroupPlatform,
                  copy_accounts_from_group_ids: [],
                }))
              }
            />
            <p className="input-hint">{t('admin.groups.platformHint')}</p>
          </div>

          <CopyAccountsSection
            selectedIds={createForm.copy_accounts_from_group_ids}
            options={copyAccountsOptionsCreate}
            onAdd={(id) =>
              setCreateForm((prev) =>
                prev.copy_accounts_from_group_ids.includes(id)
                  ? prev
                  : { ...prev, copy_accounts_from_group_ids: [...prev.copy_accounts_from_group_ids, id] },
              )
            }
            onRemove={(id) =>
              setCreateForm((prev) => ({
                ...prev,
                copy_accounts_from_group_ids: prev.copy_accounts_from_group_ids.filter((x) => x !== id),
              }))
            }
            tooltipContent={t('admin.groups.copyAccounts.tooltip')}
            hint={t('admin.groups.copyAccounts.hint')}
            t={t}
          />

          <div>
            <label className="input-label">{t('admin.groups.form.rateMultiplier')}</label>
            <input
              type="number"
              step="0.001"
              min="0.001"
              required
              value={createForm.rate_multiplier}
              onChange={(e) => setCreateForm((prev) => ({ ...prev, rate_multiplier: Number(e.target.value) }))}
              className="input"
              data-tour="group-form-multiplier"
            />
            <p className="input-hint">{t('admin.groups.rateMultiplierHint')}</p>
          </div>
          <div>
            <label className="input-label">{t('admin.groups.form.rpmLimit')}</label>
            <input
              type="number"
              min="0"
              step="1"
              value={createForm.rpm_limit}
              onChange={(e) => setCreateForm((prev) => ({ ...prev, rpm_limit: Number(e.target.value) }))}
              className="input"
              placeholder={t('admin.groups.form.rpmLimitPlaceholder')}
            />
            <p className="input-hint">{t('admin.groups.form.rpmLimitHint')}</p>
          </div>

          {createForm.subscription_type !== 'subscription' ? (
            <ExclusiveToggleSection
              form={createForm}
              onChange={(patch) => setCreateForm((prev) => ({ ...prev, ...patch }))}
              tourAttr="group-form-exclusive"
              t={t}
            />
          ) : null}

          <SubscriptionConfigSection
            form={createForm}
            onChange={(patch) => setCreateForm((prev) => ({ ...prev, ...patch }))}
            t={t}
          />

          <GroupFormSections
            mode="create"
            form={createForm}
            onChange={(patch) => setCreateForm((prev) => ({ ...prev, ...patch }))}
            modelsListState={createModelsListState}
            modelsListLoading={createModelsListLoading}
            modelsListSelectedCount={createModelsListSelectedCount}
            onModelsListEnabledToggle={() =>
              setCreateModelsListState((prev) => ({ ...prev, enabled: !prev.enabled }))
            }
            onModelsListSelectAll={() =>
              setCreateModelsListState((prev) => {
                const next = cloneModelsListState(prev)
                selectAllModelsListItems(next)
                return next
              })
            }
            onModelsListInvert={() =>
              setCreateModelsListState((prev) => {
                const next = cloneModelsListState(prev)
                invertModelsListSelection(next)
                return next
              })
            }
            onModelsListToggleItem={(modelID) =>
              setCreateModelsListState((prev) => {
                const next = cloneModelsListState(prev)
                toggleModelsListItem(next, modelID)
                return next
              })
            }
            onModelsListMoveItem={(from, to) =>
              setCreateModelsListState((prev) => {
                const next = cloneModelsListState(prev)
                moveModelsListItem(next, from, to)
                return next
              })
            }
            modelRoutingRules={createModelRoutingRules}
            routingContext={createRoutingContext}
            allGroups={allGroupsCache}
            formatImagePricePreview={formatImagePricePreview}
            buildFinalPricePreview={buildImageFinalPricePreview}
            onAddMessagesMapping={() =>
              setCreateForm((prev) => ({
                ...prev,
                exact_model_mappings: [...prev.exact_model_mappings, { claude_model: '', target_model: '' }],
              }))
            }
            onRemoveMessagesMapping={(row) =>
              setCreateForm((prev) => ({
                ...prev,
                exact_model_mappings: prev.exact_model_mappings.filter((r) => r !== row),
              }))
            }
            getMessagesRowKey={resolveCreateMessagesDispatchRowKey}
            t={t}
          />
        </form>
      </BaseDialog>

      <BaseDialog show={showEditModal} title={t('admin.groups.editGroup')} width="normal" onClose={closeEditModal}
        footer={
          <div className="flex justify-end gap-3 pt-4">
            <button type="button" onClick={closeEditModal} className="btn btn-secondary">
              {t('common.cancel')}
            </button>
            <button type="submit" form="edit-group-form" disabled={submitting} className="btn btn-primary" data-tour="group-form-submit">
              {submitting ? <SubmitSpinner /> : null}
              {submitting ? t('admin.groups.updating') : t('common.update')}
            </button>
          </div>
        }
      >
        {editingGroup ? (
          <form id="edit-group-form" onSubmit={handleUpdateGroup} className="space-y-5">
            <div>
              <label className="input-label">{t('admin.groups.form.name')}</label>
              <input
                type="text"
                required
                value={editForm.name}
                onChange={(e) => setEditForm((prev) => ({ ...prev, name: e.target.value }))}
                className="input"
                data-tour="edit-group-form-name"
              />
            </div>
            <div>
              <label className="input-label">{t('admin.groups.form.description')}</label>
              <textarea
                rows={3}
                value={editForm.description}
                onChange={(e) => setEditForm((prev) => ({ ...prev, description: e.target.value }))}
                className="input"
              />
            </div>
            <div>
              <label className="input-label">{t('admin.groups.form.platform')}</label>
              <Select modelValue={editForm.platform} options={platformOptions} disabled data-tour="group-form-platform" />
              <p className="input-hint">{t('admin.groups.platformNotEditable')}</p>
            </div>

            <CopyAccountsSection
              selectedIds={editForm.copy_accounts_from_group_ids}
              options={copyAccountsOptionsEdit}
              onAdd={(id) =>
                setEditForm((prev) =>
                  prev.copy_accounts_from_group_ids.includes(id)
                    ? prev
                    : { ...prev, copy_accounts_from_group_ids: [...prev.copy_accounts_from_group_ids, id] },
                )
              }
              onRemove={(id) =>
                setEditForm((prev) => ({
                  ...prev,
                  copy_accounts_from_group_ids: prev.copy_accounts_from_group_ids.filter((x) => x !== id),
                }))
              }
              tooltipContent={t('admin.groups.copyAccounts.tooltipEdit')}
              hint={t('admin.groups.copyAccounts.hintEdit')}
              t={t}
            />

            <div>
              <label className="input-label">{t('admin.groups.form.rateMultiplier')}</label>
              <input
                type="number"
                step="0.001"
                min="0.001"
                required
                value={editForm.rate_multiplier}
                onChange={(e) => setEditForm((prev) => ({ ...prev, rate_multiplier: Number(e.target.value) }))}
                className="input"
                data-tour="group-form-multiplier"
              />
            </div>
            <div>
              <label className="input-label">{t('admin.groups.form.rpmLimit')}</label>
              <input
                type="number"
                min="0"
                step="1"
                value={editForm.rpm_limit}
                onChange={(e) => setEditForm((prev) => ({ ...prev, rpm_limit: Number(e.target.value) }))}
                className="input"
                placeholder={t('admin.groups.form.rpmLimitPlaceholder')}
              />
              <p className="input-hint">{t('admin.groups.form.rpmLimitHint')}</p>
            </div>

            {editForm.subscription_type !== 'subscription' ? (
              <ExclusiveToggleSection
                form={editForm}
                onChange={(patch) => setEditForm((prev) => ({ ...prev, ...patch }))}
                t={t}
              />
            ) : null}

            <div>
              <label className="input-label">{t('admin.groups.form.status')}</label>
              <Select
                modelValue={editForm.status}
                options={editStatusOptions}
                onUpdateModelValue={(val) =>
                  setEditForm((prev) => ({ ...prev, status: val as 'active' | 'inactive' }))
                }
              />
            </div>

            <SubscriptionConfigSection
              form={editForm}
              onChange={(patch) => setEditForm((prev) => ({ ...prev, ...patch }))}
              subscriptionTypeDisabled
              t={t}
            />

            <GroupFormSections
              mode="edit"
              form={editForm}
              onChange={(patch) => setEditForm((prev) => ({ ...prev, ...patch }))}
              modelsListState={editModelsListState}
              modelsListLoading={editModelsListLoading}
              modelsListSelectedCount={editModelsListSelectedCount}
              onModelsListEnabledToggle={() =>
                setEditModelsListState((prev) => ({ ...prev, enabled: !prev.enabled }))
              }
              onModelsListSelectAll={() =>
                setEditModelsListState((prev) => {
                  const next = cloneModelsListState(prev)
                  selectAllModelsListItems(next)
                  return next
                })
              }
              onModelsListInvert={() =>
                setEditModelsListState((prev) => {
                  const next = cloneModelsListState(prev)
                  invertModelsListSelection(next)
                  return next
                })
              }
              onModelsListToggleItem={(modelID) =>
                setEditModelsListState((prev) => {
                  const next = cloneModelsListState(prev)
                  toggleModelsListItem(next, modelID)
                  return next
                })
              }
              onModelsListMoveItem={(from, to) =>
                setEditModelsListState((prev) => {
                  const next = cloneModelsListState(prev)
                  moveModelsListItem(next, from, to)
                  return next
                })
              }
              modelRoutingRules={editModelRoutingRules}
              routingContext={editRoutingContext}
              allGroups={allGroupsCache}
              editingGroupId={editingGroup.id}
              formatImagePricePreview={formatImagePricePreview}
              buildFinalPricePreview={buildImageFinalPricePreview}
              onAddMessagesMapping={() =>
                setEditForm((prev) => ({
                  ...prev,
                  exact_model_mappings: [...prev.exact_model_mappings, { claude_model: '', target_model: '' }],
                }))
              }
              onRemoveMessagesMapping={(row) =>
                setEditForm((prev) => ({
                  ...prev,
                  exact_model_mappings: prev.exact_model_mappings.filter((r) => r !== row),
                }))
              }
              getMessagesRowKey={resolveEditMessagesDispatchRowKey}
              t={t}
            />
          </form>
        ) : null}
      </BaseDialog>

      <ConfirmDialog
        show={showDeleteDialog}
        title={t('admin.groups.deleteGroup')}
        message={deleteConfirmMessage}
        confirmText={t('common.delete')}
        cancelText={t('common.cancel')}
        danger
        onConfirm={() => void confirmDelete()}
        onCancel={() => setShowDeleteDialog(false)}
      />

      <BaseDialog
        show={showSortModal}
        title={t('admin.groups.sortOrder')}
        width="normal"
        onClose={closeSortModal}
        footer={
          <div className="flex justify-end gap-3 pt-4">
            <button type="button" onClick={closeSortModal} className="btn btn-secondary">
              {t('common.cancel')}
            </button>
            <button type="button" onClick={() => void saveSortOrder()} disabled={sortSubmitting} className="btn btn-primary">
              {sortSubmitting ? <SubmitSpinner /> : null}
              {sortSubmitting ? t('common.saving') : t('common.save')}
            </button>
          </div>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-500 dark:text-gray-400">{t('admin.groups.sortOrderHint')}</p>
          <SortableGroupsList groups={sortableGroups} onReorder={setSortableGroups} t={t} />
        </div>
      </BaseDialog>

      <GroupRateMultipliersModal
        show={showRateMultipliersModal}
        group={rateMultipliersGroup}
        onClose={() => setShowRateMultipliersModal(false)}
        onSuccess={() => void loadGroups()}
      />

      <GroupRPMOverridesModal
        show={showRPMOverridesModal}
        group={rpmOverridesGroup}
        onClose={() => setShowRPMOverridesModal(false)}
        onSuccess={() => void loadGroups()}
      />
    </AppLayout>
  )
}
