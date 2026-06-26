'use client'

import { useMemo } from 'react'
import { useI18n } from '@/lib/i18n'
import SearchInput from '@/components/common/SearchInput'
import Select from '@/components/common/Select'
import type { AdminGroup } from '@/lib/adminGroups'

interface AccountTableFiltersProps {
  searchQuery: string
  filters: Record<string, unknown>
  groups?: AdminGroup[]
  onSearchQueryChange?: (value: string) => void
  onFiltersChange?: (filters: Record<string, unknown>) => void
  onChange?: () => void
}

export default function AccountTableFilters({
  searchQuery,
  filters,
  groups,
  onSearchQueryChange,
  onFiltersChange,
  onChange,
}: AccountTableFiltersProps) {
  const { t } = useI18n()

  const updatePlatform = (value: string | number | boolean | null) => {
    onFiltersChange?.({ ...filters, platform: value })
  }

  const updateType = (value: string | number | boolean | null) => {
    onFiltersChange?.({ ...filters, type: value })
  }

  const updateStatus = (value: string | number | boolean | null) => {
    onFiltersChange?.({ ...filters, status: value })
  }

  const updatePrivacyMode = (value: string | number | boolean | null) => {
    onFiltersChange?.({ ...filters, privacy_mode: value })
  }

  const updateGroup = (value: string | number | boolean | null) => {
    onFiltersChange?.({ ...filters, group: value })
  }

  const pOpts = useMemo(
    () => [
      { value: '', label: t('admin.accounts.allPlatforms') },
      { value: 'anthropic', label: 'Anthropic' },
      { value: 'openai', label: 'OpenAI' },
      { value: 'gemini', label: 'Gemini' },
      { value: 'antigravity', label: 'Antigravity' },
    ],
    [t],
  )

  const tOpts = useMemo(
    () => [
      { value: '', label: t('admin.accounts.allTypes') },
      { value: 'oauth', label: t('admin.accounts.oauthType') },
      { value: 'setup-token', label: t('admin.accounts.setupToken') },
      { value: 'apikey', label: t('admin.accounts.apiKey') },
      { value: 'bedrock', label: 'AWS Bedrock' },
    ],
    [t],
  )

  const sOpts = useMemo(
    () => [
      { value: '', label: t('admin.accounts.allStatus') },
      { value: 'active', label: t('admin.accounts.status.active') },
      { value: 'inactive', label: t('admin.accounts.status.inactive') },
      { value: 'error', label: t('admin.accounts.status.error') },
      { value: 'rate_limited', label: t('admin.accounts.status.rateLimited') },
      { value: 'temp_unschedulable', label: t('admin.accounts.status.tempUnschedulable') },
      { value: 'unschedulable', label: t('admin.accounts.status.unschedulable') },
    ],
    [t],
  )

  const privacyOpts = useMemo(
    () => [
      { value: '', label: t('admin.accounts.allPrivacyModes') },
      { value: '__unset__', label: t('admin.accounts.privacyUnset') },
      { value: 'training_off', label: 'Privacy' },
      { value: 'training_set_cf_blocked', label: 'CF' },
      { value: 'training_set_failed', label: 'Fail' },
    ],
    [t],
  )

  const gOpts = useMemo(
    () => [
      { value: '', label: t('admin.accounts.allGroups') },
      { value: 'ungrouped', label: t('admin.accounts.ungroupedGroup') },
      ...(groups || []).map((g) => ({ value: String(g.id), label: g.name })),
    ],
    [groups, t],
  )

  const filterValue = (value: unknown): string => {
    if (value === null || value === undefined) return ''
    if (typeof value === 'string') return value
    if (typeof value === 'number' || typeof value === 'boolean') return String(value)
    return ''
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <SearchInput
        modelValue={searchQuery}
        placeholder={t('admin.accounts.searchAccounts')}
        className="w-full sm:w-64"
        onUpdateModelValue={onSearchQueryChange}
        onSearch={() => onChange?.()}
      />
      <Select
        modelValue={filterValue(filters.platform)}
        className="w-40"
        options={pOpts}
        onUpdateModelValue={updatePlatform}
        onChange={() => onChange?.()}
      />
      <Select
        modelValue={filterValue(filters.type)}
        className="w-40"
        options={tOpts}
        onUpdateModelValue={updateType}
        onChange={() => onChange?.()}
      />
      <Select
        modelValue={filterValue(filters.status)}
        className="w-40"
        options={sOpts}
        onUpdateModelValue={updateStatus}
        onChange={() => onChange?.()}
      />
      <Select
        modelValue={filterValue(filters.privacy_mode)}
        className="w-40"
        options={privacyOpts}
        onUpdateModelValue={updatePrivacyMode}
        onChange={() => onChange?.()}
      />
      <Select
        modelValue={filterValue(filters.group)}
        className="w-40"
        options={gOpts}
        onUpdateModelValue={updateGroup}
        onChange={() => onChange?.()}
      />
    </div>
  )
}
