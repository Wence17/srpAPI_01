'use client'

import type { ReactNode } from 'react'
import Icon from '@/components/icons/Icon'
import ModelWhitelistSelector from '@/components/account/ModelWhitelistSelector'
import { ToggleSwitch, SectionLabel } from '@/components/account/createAccountModalHelpers'
import {
  DEFAULT_POOL_MODE_RETRY_COUNT,
  DEFAULT_POOL_MODE_RETRY_STATUS_CODES,
  MAX_POOL_MODE_RETRY_COUNT,
  type ModelMapping,
  type TempUnschedRuleForm,
} from '@/components/account/editAccountModalUtils'
import { isValidWildcardPattern } from '@/lib/useModelWhitelist'
import type { SyncUpstreamPreviewParams } from '@/lib/adminAccounts'

const toggleTrackClass =
  'relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2'
const toggleThumbClass =
  'pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out'

export function ArrowRightIcon() {
  return (
    <svg className="h-4 w-4 flex-shrink-0 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
    </svg>
  )
}

export function ModelRestrictionSection({
  t,
  platform,
  accountId,
  disabled,
  modelRestrictionMode,
  onModelRestrictionModeChange,
  allowedModels,
  onAllowedModelsChange,
  modelMappings,
  onModelMappingsChange,
  onAddMapping,
  onRemoveMapping,
  presetMappings,
  onAddPresetMapping,
  getModelMappingKey,
  showWhitelistToggle = true,
  fromPlaceholder,
  toPlaceholder,
  syncCredentials,
}: {
  t: (key: string, params?: Record<string, unknown>) => string
  platform: string
  accountId?: number
  syncCredentials?: SyncUpstreamPreviewParams
  disabled?: boolean
  modelRestrictionMode: 'whitelist' | 'mapping'
  onModelRestrictionModeChange: (mode: 'whitelist' | 'mapping') => void
  allowedModels: string[]
  onAllowedModelsChange: (models: string[]) => void
  modelMappings: ModelMapping[]
  onModelMappingsChange: (next: ModelMapping[]) => void
  onAddMapping: () => void
  onRemoveMapping: (index: number) => void
  presetMappings: Array<{ label: string; from: string; to: string; color: string }>
  onAddPresetMapping: (from: string, to: string) => void
  getModelMappingKey: (mapping: ModelMapping) => string
  showWhitelistToggle?: boolean
  fromPlaceholder?: string
  toPlaceholder?: string
}) {
  if (disabled) {
    return (
      <div className="mb-3 rounded-lg bg-amber-50 p-3 dark:bg-amber-900/20">
        <p className="text-xs text-amber-700 dark:text-amber-400">
          {t('admin.accounts.openai.modelRestrictionDisabledByPassthrough')}
        </p>
      </div>
    )
  }

  return (
    <>
      {showWhitelistToggle ? (
        <div className="mb-4 flex gap-2">
          <button
            type="button"
            onClick={() => onModelRestrictionModeChange('whitelist')}
            className={`flex-1 rounded-lg px-4 py-2 text-sm font-medium transition-all ${
              modelRestrictionMode === 'whitelist'
                ? 'bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-dark-600 dark:text-gray-400 dark:hover:bg-dark-500'
            }`}
          >
            {t('admin.accounts.modelWhitelist')}
          </button>
          <button
            type="button"
            onClick={() => onModelRestrictionModeChange('mapping')}
            className={`flex-1 rounded-lg px-4 py-2 text-sm font-medium transition-all ${
              modelRestrictionMode === 'mapping'
                ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-dark-600 dark:text-gray-400 dark:hover:bg-dark-500'
            }`}
          >
            {t('admin.accounts.modelMapping')}
          </button>
        </div>
      ) : null}

      {modelRestrictionMode === 'whitelist' ? (
        <div>
          <ModelWhitelistSelector
            value={allowedModels}
            onChange={onAllowedModelsChange}
            platform={platform}
            accountId={accountId}
            syncCredentials={syncCredentials}
          />
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {t('admin.accounts.selectedModels', { count: allowedModels.length })}
            {allowedModels.length === 0 && modelMappings.length === 0 ? (
              <span>{t('admin.accounts.supportsAllModels')}</span>
            ) : null}
          </p>
        </div>
      ) : (
        <div>
          <div className="mb-3 rounded-lg bg-purple-50 p-3 dark:bg-purple-900/20">
            <p className="text-xs text-purple-700 dark:text-purple-400">{t('admin.accounts.mapRequestModels')}</p>
          </div>
          <ModelMappingList
            t={t}
            modelMappings={modelMappings}
            onChange={onModelMappingsChange}
            onAdd={onAddMapping}
            onRemove={onRemoveMapping}
            getKey={getModelMappingKey}
            presetMappings={presetMappings}
            onAddPreset={onAddPresetMapping}
            fromPlaceholder={fromPlaceholder}
            toPlaceholder={toPlaceholder}
          />
        </div>
      )}
    </>
  )
}

export function ModelMappingList({
  t,
  modelMappings,
  onChange,
  onAdd,
  onRemove,
  getKey,
  presetMappings,
  onAddPreset,
  fromPlaceholder,
  toPlaceholder,
  compact = false,
}: {
  t: (key: string, params?: Record<string, unknown>) => string
  modelMappings: ModelMapping[]
  onChange: (next: ModelMapping[]) => void
  onAdd: () => void
  onRemove: (index: number) => void
  getKey: (mapping: ModelMapping) => string
  presetMappings?: Array<{ label: string; from: string; to: string; color: string }>
  onAddPreset?: (from: string, to: string) => void
  fromPlaceholder?: string
  toPlaceholder?: string
  compact?: boolean
}) {
  const updateMapping = (index: number, field: 'from' | 'to', value: string) => {
    onChange(modelMappings.map((m, i) => (i === index ? { ...m, [field]: value } : m)))
  }

  return (
    <div className={compact ? 'space-y-3' : undefined}>
      {modelMappings.length > 0 ? (
        <div className="mb-3 space-y-2">
          {modelMappings.map((mapping, index) => (
            <div key={getKey(mapping)} className="flex items-center gap-2">
              <input
                value={mapping.from}
                onChange={(e) => updateMapping(index, 'from', e.target.value)}
                type="text"
                className="input flex-1"
                placeholder={fromPlaceholder || t('admin.accounts.requestModel')}
              />
              {compact ? <span className="text-gray-400">→</span> : <ArrowRightIcon />}
              <input
                value={mapping.to}
                onChange={(e) => updateMapping(index, 'to', e.target.value)}
                type="text"
                className="input flex-1"
                placeholder={toPlaceholder || t('admin.accounts.actualModel')}
              />
              <button
                type="button"
                onClick={() => onRemove(index)}
                className="rounded-lg p-2 text-red-500 transition-colors hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20"
              >
                <Icon name="trash" size="sm" />
              </button>
            </div>
          ))}
        </div>
      ) : null}
      <button
        type="button"
        onClick={onAdd}
        className={
          compact
            ? 'btn btn-secondary text-sm'
            : 'mb-3 w-full rounded-lg border-2 border-dashed border-gray-300 px-4 py-2 text-gray-600 transition-colors hover:border-gray-400 hover:text-gray-700 dark:border-dark-500 dark:text-gray-400 dark:hover:border-dark-400 dark:hover:text-gray-300'
        }
      >
        + {t('admin.accounts.addMapping')}
      </button>
      {presetMappings && onAddPreset ? (
        <div className="flex flex-wrap gap-2">
          {presetMappings.map((preset) => (
            <button
              key={preset.label}
              type="button"
              onClick={() => onAddPreset(preset.from, preset.to)}
              className={`rounded-lg px-3 py-1 text-xs transition-colors ${preset.color}`}
            >
              + {preset.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}

export function PoolModeSection({
  t,
  enabled,
  onEnabledChange,
  retryCount,
  onRetryCountChange,
  statusCodesInput,
  onStatusCodesInputChange,
}: {
  t: (key: string, params?: Record<string, unknown>) => string
  enabled: boolean
  onEnabledChange: (value: boolean) => void
  retryCount: number
  onRetryCountChange: (value: number) => void
  statusCodesInput: string
  onStatusCodesInputChange: (value: string) => void
}) {
  return (
    <div className="border-t border-gray-200 pt-4 dark:border-dark-600">
      <SectionLabel
        title={t('admin.accounts.poolMode')}
        hint={t('admin.accounts.poolModeHint')}
        action={<ToggleSwitch enabled={enabled} onToggle={() => onEnabledChange(!enabled)} />}
      />
      {enabled ? (
        <>
          <div className="rounded-lg bg-blue-50 p-3 dark:bg-blue-900/20">
            <p className="text-xs text-blue-700 dark:text-blue-400">
              <Icon name="exclamationCircle" size="sm" className="mr-1 inline" strokeWidth={2} />
              {t('admin.accounts.poolModeInfo')}
            </p>
          </div>
          <div className="mt-3">
            <label className="input-label">{t('admin.accounts.poolModeRetryCount')}</label>
            <input
              value={retryCount}
              onChange={(e) => onRetryCountChange(Number(e.target.value))}
              type="number"
              min={0}
              max={MAX_POOL_MODE_RETRY_COUNT}
              step={1}
              className="input"
            />
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              {t('admin.accounts.poolModeRetryCountHint', {
                default: DEFAULT_POOL_MODE_RETRY_COUNT,
                max: MAX_POOL_MODE_RETRY_COUNT,
              })}
            </p>
          </div>
          <div className="mt-3">
            <label className="input-label">{t('admin.accounts.poolModeRetryStatusCodes')}</label>
            <input
              value={statusCodesInput}
              onChange={(e) => onStatusCodesInputChange(e.target.value)}
              type="text"
              className="input"
              placeholder={DEFAULT_POOL_MODE_RETRY_STATUS_CODES.join(', ')}
            />
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              {t('admin.accounts.poolModeRetryStatusCodesHint', {
                default: DEFAULT_POOL_MODE_RETRY_STATUS_CODES.join(', '),
              })}
            </p>
          </div>
        </>
      ) : null}
    </div>
  )
}

export function CustomErrorCodesSection({
  t,
  enabled,
  onEnabledChange,
  selectedErrorCodes,
  onToggleErrorCode,
  onRemoveErrorCode,
  customErrorCodeInput,
  onCustomErrorCodeInputChange,
  onAddCustomErrorCode,
  commonErrorCodes,
}: {
  t: (key: string, params?: Record<string, unknown>) => string
  enabled: boolean
  onEnabledChange: (value: boolean) => void
  selectedErrorCodes: number[]
  onToggleErrorCode: (code: number) => void
  onRemoveErrorCode: (code: number) => void
  customErrorCodeInput: number | null
  onCustomErrorCodeInputChange: (value: number | null) => void
  onAddCustomErrorCode: () => void
  commonErrorCodes: Array<{ value: number; label: string }>
}) {
  const sortedCodes = [...selectedErrorCodes].sort((a, b) => a - b)

  return (
    <div className="border-t border-gray-200 pt-4 dark:border-dark-600">
      <SectionLabel
        title={t('admin.accounts.customErrorCodes')}
        hint={t('admin.accounts.customErrorCodesHint')}
        action={<ToggleSwitch enabled={enabled} onToggle={() => onEnabledChange(!enabled)} />}
      />
      {enabled ? (
        <div className="space-y-3">
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
                onClick={() => onToggleErrorCode(code.value)}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                  selectedErrorCodes.includes(code.value)
                    ? 'bg-red-100 text-red-700 ring-1 ring-red-500 dark:bg-red-900/30 dark:text-red-400'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-dark-600 dark:text-gray-400 dark:hover:bg-dark-500'
                }`}
              >
                {code.value} {code.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <input
              value={customErrorCodeInput ?? ''}
              onChange={(e) =>
                onCustomErrorCodeInputChange(e.target.value === '' ? null : Number(e.target.value))
              }
              type="number"
              min={100}
              max={599}
              className="input flex-1"
              placeholder={t('admin.accounts.enterErrorCode')}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  onAddCustomErrorCode()
                }
              }}
            />
            <button type="button" onClick={onAddCustomErrorCode} className="btn btn-secondary px-3">
              <Icon name="plus" size="sm" />
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {sortedCodes.map((code) => (
              <span
                key={code}
                className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-0.5 text-sm font-medium text-red-700 dark:bg-red-900/30 dark:text-red-400"
              >
                {code}
                <button type="button" onClick={() => onRemoveErrorCode(code)} className="hover:text-red-900 dark:hover:text-red-300">
                  <Icon name="x" size="sm" strokeWidth={2} />
                </button>
              </span>
            ))}
            {selectedErrorCodes.length === 0 ? (
              <span className="text-xs text-gray-400">{t('admin.accounts.noneSelectedUsesDefault')}</span>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  )
}

export function TempUnschedSection({
  t,
  enabled,
  onEnabledChange,
  rules,
  onRulesChange,
  presets,
  onAddRule,
  onRemoveRule,
  onMoveRule,
  getRuleKey,
}: {
  t: (key: string, params?: Record<string, unknown>) => string
  enabled: boolean
  onEnabledChange: (value: boolean) => void
  rules: TempUnschedRuleForm[]
  onRulesChange: (rules: TempUnschedRuleForm[]) => void
  presets: Array<{ label: string; rule: TempUnschedRuleForm }>
  onAddRule: (preset?: TempUnschedRuleForm) => void
  onRemoveRule: (index: number) => void
  onMoveRule: (index: number, direction: number) => void
  getRuleKey: (rule: TempUnschedRuleForm) => string
}) {
  const updateRule = (index: number, patch: Partial<TempUnschedRuleForm>) => {
    onRulesChange(rules.map((rule, i) => (i === index ? { ...rule, ...patch } : rule)))
  }

  return (
    <div className="space-y-4 border-t border-gray-200 pt-4 dark:border-dark-600">
      <SectionLabel
        title={t('admin.accounts.tempUnschedulable.title')}
        hint={t('admin.accounts.tempUnschedulable.hint')}
        action={<ToggleSwitch enabled={enabled} onToggle={() => onEnabledChange(!enabled)} />}
      />
      {enabled ? (
        <div className="space-y-3">
          <div className="rounded-lg bg-blue-50 p-3 dark:bg-blue-900/20">
            <p className="text-xs text-blue-700 dark:text-blue-400">
              <Icon name="exclamationTriangle" size="sm" className="mr-1 inline" strokeWidth={2} />
              {t('admin.accounts.tempUnschedulable.notice')}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {presets.map((preset) => (
              <button
                key={preset.label}
                type="button"
                onClick={() => onAddRule(preset.rule)}
                className="rounded-lg bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-200 dark:bg-dark-600 dark:text-gray-300 dark:hover:bg-dark-500"
              >
                + {preset.label}
              </button>
            ))}
          </div>
          {rules.length > 0 ? (
            <div className="space-y-3">
              {rules.map((rule, index) => (
                <div key={getRuleKey(rule)} className="rounded-lg border border-gray-200 p-3 dark:border-dark-600">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
                      {t('admin.accounts.tempUnschedulable.ruleIndex', { index: index + 1 })}
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={index === 0}
                        onClick={() => onMoveRule(index, -1)}
                        className="rounded p-1 text-gray-400 transition-colors hover:text-gray-600 disabled:cursor-not-allowed disabled:opacity-40 dark:hover:text-gray-200"
                      >
                        <Icon name="chevronUp" size="sm" strokeWidth={2} />
                      </button>
                      <button
                        type="button"
                        disabled={index === rules.length - 1}
                        onClick={() => onMoveRule(index, 1)}
                        className="rounded p-1 text-gray-400 transition-colors hover:text-gray-600 disabled:cursor-not-allowed disabled:opacity-40 dark:hover:text-gray-200"
                      >
                        <Icon name="chevronDown" size="sm" strokeWidth={2} />
                      </button>
                      <button
                        type="button"
                        onClick={() => onRemoveRule(index)}
                        className="rounded p-1 text-red-500 transition-colors hover:text-red-600"
                      >
                        <Icon name="x" size="sm" strokeWidth={2} />
                      </button>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label className="input-label">{t('admin.accounts.tempUnschedulable.errorCode')}</label>
                      <input
                        value={rule.error_code ?? ''}
                        onChange={(e) =>
                          updateRule(index, {
                            error_code: e.target.value === '' ? null : Number(e.target.value),
                          })
                        }
                        type="number"
                        min={100}
                        max={599}
                        className="input"
                        placeholder={t('admin.accounts.tempUnschedulable.errorCodePlaceholder')}
                      />
                    </div>
                    <div>
                      <label className="input-label">{t('admin.accounts.tempUnschedulable.durationMinutes')}</label>
                      <input
                        value={rule.duration_minutes ?? ''}
                        onChange={(e) =>
                          updateRule(index, {
                            duration_minutes: e.target.value === '' ? null : Number(e.target.value),
                          })
                        }
                        type="number"
                        min={1}
                        className="input"
                        placeholder={t('admin.accounts.tempUnschedulable.durationPlaceholder')}
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="input-label">{t('admin.accounts.tempUnschedulable.keywords')}</label>
                      <input
                        value={rule.keywords}
                        onChange={(e) => updateRule(index, { keywords: e.target.value })}
                        type="text"
                        className="input"
                        placeholder={t('admin.accounts.tempUnschedulable.keywordsPlaceholder')}
                      />
                      <p className="input-hint">{t('admin.accounts.tempUnschedulable.keywordsHint')}</p>
                    </div>
                    <div className="sm:col-span-2">
                      <label className="input-label">{t('admin.accounts.tempUnschedulable.description')}</label>
                      <input
                        value={rule.description}
                        onChange={(e) => updateRule(index, { description: e.target.value })}
                        type="text"
                        className="input"
                        placeholder={t('admin.accounts.tempUnschedulable.descriptionPlaceholder')}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : null}
          <button
            type="button"
            onClick={() => onAddRule()}
            className="w-full rounded-lg border-2 border-dashed border-gray-300 px-4 py-2 text-sm text-gray-600 transition-colors hover:border-gray-400 hover:text-gray-700 dark:border-dark-500 dark:text-gray-400 dark:hover:border-dark-400 dark:hover:text-gray-300"
          >
            + {t('admin.accounts.tempUnschedulable.addRule')}
          </button>
        </div>
      ) : null}
    </div>
  )
}

export function AntigravityModelMappingSection({
  t,
  mappings,
  onChange,
  onAdd,
  onRemove,
  onAddPreset,
  onSyncUpstream,
  isSyncing,
  accountId,
  presetMappings,
  getKey,
}: {
  t: (key: string, params?: Record<string, unknown>) => string
  mappings: ModelMapping[]
  onChange: (next: ModelMapping[]) => void
  onAdd: () => void
  onRemove: (index: number) => void
  onAddPreset: (from: string, to: string) => void
  onSyncUpstream: () => void
  isSyncing: boolean
  accountId?: number
  presetMappings: Array<{ label: string; from: string; to: string; color: string }>
  getKey: (mapping: ModelMapping) => string
}) {
  const updateMapping = (index: number, field: 'from' | 'to', value: string) => {
    onChange(mappings.map((m, i) => (i === index ? { ...m, [field]: value } : m)))
  }

  return (
    <div className="border-t border-gray-200 pt-4 dark:border-dark-600">
      <label className="input-label">{t('admin.accounts.modelRestriction')}</label>
      <div>
        <div className="mb-3 rounded-lg bg-purple-50 p-3 dark:bg-purple-900/20">
          <p className="text-xs text-purple-700 dark:text-purple-400">{t('admin.accounts.mapRequestModels')}</p>
        </div>
        <div className="mb-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onSyncUpstream}
            disabled={isSyncing || !accountId}
            className="rounded-lg border border-emerald-200 px-3 py-1.5 text-sm text-emerald-600 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-emerald-800 dark:text-emerald-400 dark:hover:bg-emerald-900/30"
          >
            {isSyncing ? t('admin.accounts.syncUpstreamModelsLoading') : t('admin.accounts.syncUpstreamModels')}
          </button>
        </div>
        {mappings.length > 0 ? (
          <div className="mb-3 space-y-2">
            {mappings.map((mapping, index) => (
              <div key={getKey(mapping)} className="space-y-1">
                <div className="flex items-center gap-2">
                  <input
                    value={mapping.from}
                    onChange={(e) => updateMapping(index, 'from', e.target.value)}
                    type="text"
                    className={`input flex-1 ${!isValidWildcardPattern(mapping.from) ? 'border-red-500 dark:border-red-500' : ''}`}
                    placeholder={t('admin.accounts.requestModel')}
                  />
                  <ArrowRightIcon />
                  <input
                    value={mapping.to}
                    onChange={(e) => updateMapping(index, 'to', e.target.value)}
                    type="text"
                    className={`input flex-1 ${mapping.to.includes('*') ? 'border-red-500 dark:border-red-500' : ''}`}
                    placeholder={t('admin.accounts.actualModel')}
                  />
                  <button
                    type="button"
                    onClick={() => onRemove(index)}
                    className="rounded-lg p-2 text-red-500 transition-colors hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20"
                  >
                    <Icon name="trash" size="sm" />
                  </button>
                </div>
                {!isValidWildcardPattern(mapping.from) ? (
                  <p className="text-xs text-red-500">{t('admin.accounts.wildcardOnlyAtEnd')}</p>
                ) : null}
                {mapping.to.includes('*') ? (
                  <p className="text-xs text-red-500">{t('admin.accounts.targetNoWildcard')}</p>
                ) : null}
              </div>
            ))}
          </div>
        ) : null}
        <button
          type="button"
          onClick={onAdd}
          className="mb-3 w-full rounded-lg border-2 border-dashed border-gray-300 px-4 py-2 text-gray-600 transition-colors hover:border-gray-400 hover:text-gray-700 dark:border-dark-500 dark:text-gray-400 dark:hover:border-dark-400 dark:hover:text-gray-300"
        >
          + {t('admin.accounts.addMapping')}
        </button>
        <div className="flex flex-wrap gap-2">
          {presetMappings.map((preset) => (
            <button
              key={preset.label}
              type="button"
              onClick={() => onAddPreset(preset.from, preset.to)}
              className={`rounded-lg px-3 py-1 text-xs transition-colors ${preset.color}`}
            >
              + {preset.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

export function QuotaLimitCardSection({
  t,
  hintKey,
  cardProps,
}: {
  t: (key: string) => string
  hintKey: string
  cardProps: ReactNode
}) {
  return (
    <div className="space-y-4 border-t border-gray-200 pt-4 dark:border-dark-600">
      <div className="mb-3">
        <h3 className="input-label mb-0 text-base font-semibold">{t('admin.accounts.quotaControl.title')}</h3>
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{t(hintKey)}</p>
      </div>
      {cardProps}
    </div>
  )
}

export function ToggleRow({
  title,
  description,
  enabled,
  onToggle,
  children,
  testId,
}: {
  title: string
  description?: string
  enabled: boolean
  onToggle: () => void
  children?: ReactNode
  testId?: string
}) {
  return (
    <div className="border-t border-gray-200 pt-4 dark:border-dark-600">
      <div className="flex items-center justify-between">
        <div>
          <label className="input-label mb-0">{title}</label>
          {description ? <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{description}</p> : null}
        </div>
        <button
          type="button"
          data-testid={testId}
          onClick={onToggle}
          className={`${toggleTrackClass} ${enabled ? 'bg-primary-600' : 'bg-gray-200 dark:bg-dark-600'}`}
        >
          <span className={`${toggleThumbClass} ${enabled ? 'translate-x-5' : 'translate-x-0'}`} />
        </button>
      </div>
      {children}
    </div>
  )
}

export function AnthropicOAuthQuotaSection({
  t,
  quotaControl,
  updateQuotaControl,
  umqModeOptions,
  tlsFingerprintProfiles,
}: {
  t: (key: string, params?: Record<string, unknown>) => string
  quotaControl: import('@/components/account/editAccountModalUtils').QuotaControlState
  updateQuotaControl: (patch: Partial<import('@/components/account/editAccountModalUtils').QuotaControlState>) => void
  umqModeOptions: Array<{ value: string; label: string }>
  tlsFingerprintProfiles: Array<{ id: number; name: string }>
}) {
  return (
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
                    updateQuotaControl({ windowCostLimit: e.target.value === '' ? null : Number(e.target.value) })
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
                  updateQuotaControl({ maxSessions: e.target.value === '' ? null : Number(e.target.value) })
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
                    updateQuotaControl({ rpmStickyBuffer: e.target.value === '' ? null : Number(e.target.value) })
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
              onToggle={() => updateQuotaControl({ sessionIdMaskingEnabled: !quotaControl.sessionIdMaskingEnabled })}
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
              onToggle={() => updateQuotaControl({ cacheTTLOverrideEnabled: !quotaControl.cacheTTLOverrideEnabled })}
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
  )
}
