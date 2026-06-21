'use client'

import { useMemo, useState } from 'react'
import { useI18n } from '@/lib/i18n'
import GroupBadge from '@/components/keys/GroupBadge'
import Icon from '@/components/icons/Icon'
import type { AdminGroup } from '@/lib/adminGroups'
import type { GroupPlatform } from '@/lib/types'

interface GroupSelectorProps {
  modelValue: number[]
  groups: AdminGroup[]
  platform?: GroupPlatform
  mixedScheduling?: boolean
  searchable?: boolean | 'auto'
  onUpdateModelValue?: (value: number[]) => void
}

export default function GroupSelector({
  modelValue,
  groups,
  platform,
  mixedScheduling,
  searchable = 'auto',
  onUpdateModelValue,
}: GroupSelectorProps) {
  const { t } = useI18n()
  const [searchText, setSearchText] = useState('')

  const isSearchable = useMemo(() => {
    if (searchable === 'auto') return groups.length > 5
    return searchable
  }, [groups.length, searchable])

  const filteredGroups = useMemo(() => {
    let result: AdminGroup[] = groups
    if (platform) {
      if (platform === 'antigravity' && mixedScheduling) {
        result = result.filter(
          (g) =>
            g.platform === 'antigravity' ||
            g.platform === 'anthropic' ||
            g.platform === 'gemini',
        )
      } else {
        result = result.filter((g) => g.platform === platform)
      }
    }
    if (isSearchable && searchText) {
      const q = searchText.toLowerCase()
      result = result.filter(
        (g) =>
          g.name.toLowerCase().includes(q) ||
          g.description?.toLowerCase().includes(q),
      )
    }
    return result
  }, [groups, isSearchable, mixedScheduling, platform, searchText])

  const handleChange = (groupId: number, checked: boolean) => {
    const newValue = checked
      ? [...modelValue, groupId]
      : modelValue.filter((id) => id !== groupId)
    onUpdateModelValue?.(newValue)
  }

  return (
    <div>
      <label className="input-label">
        {t('admin.users.groups')}
        <span className="font-normal text-gray-400">
          {t('common.selectedCount', { count: modelValue.length })}
        </span>
      </label>
      {isSearchable ? (
        <div className="flex items-center gap-2 rounded-t-lg border border-b-0 border-gray-200 bg-gray-50 px-3 py-2 dark:border-dark-600 dark:bg-dark-800">
          <Icon name="search" size="sm" className="shrink-0 text-gray-400" />
          <input
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            type="text"
            placeholder={t('common.searchPlaceholder')}
            className="flex-1 bg-transparent text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none dark:text-gray-100 dark:placeholder:text-dark-400"
          />
        </div>
      ) : null}
      <div
        className={`grid max-h-32 grid-cols-2 gap-1 overflow-y-auto p-2 ${
          isSearchable
            ? 'rounded-b-lg border border-t-0 border-gray-200 bg-gray-50 dark:border-dark-600 dark:bg-dark-800'
            : 'rounded-lg border border-gray-200 bg-gray-50 dark:border-dark-600 dark:bg-dark-800'
        }`}
      >
        {filteredGroups.map((group) => (
          <label
            key={group.id}
            className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 transition-colors hover:bg-white dark:hover:bg-dark-700"
            title={t('admin.groups.rateAndAccounts', {
              rate: group.rate_multiplier,
              count: group.account_count || 0,
            })}
          >
            <input
              type="checkbox"
              value={group.id}
              checked={modelValue.includes(group.id)}
              onChange={(e) => handleChange(group.id, e.target.checked)}
              className="h-3.5 w-3.5 shrink-0 rounded border-gray-300 text-primary-500 focus:ring-primary-500 dark:border-dark-500"
            />
            <GroupBadge
              name={group.name}
              platform={group.platform}
              subscriptionType={group.subscription_type}
              rateMultiplier={group.rate_multiplier}
              className="min-w-0 flex-1"
            />
            <span className="shrink-0 text-xs text-gray-400">{group.account_count || 0}</span>
          </label>
        ))}
        {filteredGroups.length === 0 ? (
          <div className="col-span-2 py-2 text-center text-sm text-gray-500 dark:text-gray-400">
            {t('common.noGroupsAvailable')}
          </div>
        ) : null}
      </div>
    </div>
  )
}
