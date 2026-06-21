'use client'

import { useMemo } from 'react'
import { useI18n } from '@/lib/i18n'
import type { Provider } from '@/lib/adminChannelMonitor'
import Select from '@/components/common/Select'
import Icon from '@/components/icons/Icon'
import {
  PROVIDER_ANTHROPIC,
  PROVIDER_GEMINI,
  PROVIDER_OPENAI,
} from '@/lib/channelMonitorConstants'

interface MonitorFiltersBarProps {
  loading: boolean
  search: string
  provider: Provider | ''
  enabled: '' | 'true' | 'false'
  onSearchChange: (value: string) => void
  onProviderChange: (value: Provider | '') => void
  onEnabledChange: (value: '' | 'true' | 'false') => void
  onReload: () => void
  onCreate: () => void
  onManageTemplates: () => void
  onSearchInput: (value: string) => void
}

export default function MonitorFiltersBar({
  loading,
  search,
  provider,
  enabled,
  onSearchChange,
  onProviderChange,
  onEnabledChange,
  onReload,
  onCreate,
  onManageTemplates,
  onSearchInput,
}: MonitorFiltersBarProps) {
  const { t } = useI18n()

  const providerFilterOptions = useMemo(
    () => [
      { value: '', label: t('admin.channelMonitor.allProviders') },
      { value: PROVIDER_OPENAI, label: t('monitorCommon.providers.openai') },
      { value: PROVIDER_ANTHROPIC, label: t('monitorCommon.providers.anthropic') },
      { value: PROVIDER_GEMINI, label: t('monitorCommon.providers.gemini') },
    ],
    [t],
  )

  const enabledFilterOptions = useMemo(
    () => [
      { value: '', label: t('admin.channelMonitor.allStatus') },
      { value: 'true', label: t('admin.channelMonitor.onlyEnabled') },
      { value: 'false', label: t('admin.channelMonitor.onlyDisabled') },
    ],
    [t],
  )

  return (
    <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
      <div className="flex flex-1 flex-wrap items-center gap-3">
        <div className="relative w-full sm:w-64">
          <Icon
            name="search"
            size="md"
            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500"
          />
          <input
            value={search}
            type="text"
            placeholder={t('admin.channelMonitor.searchPlaceholder')}
            className="input pl-10"
            onChange={(event) => {
              onSearchChange(event.target.value)
              onSearchInput(event.target.value)
            }}
          />
        </div>

        <Select
          modelValue={provider}
          options={providerFilterOptions}
          placeholder={t('admin.channelMonitor.allProviders')}
          className="w-44"
          onUpdateModelValue={(value) => {
            onProviderChange((value as Provider | '') ?? '')
            onReload()
          }}
        />

        <Select
          modelValue={enabled}
          options={enabledFilterOptions}
          placeholder={t('admin.channelMonitor.enabledFilter')}
          className="w-40"
          onUpdateModelValue={(value) => {
            onEnabledChange((value as '' | 'true' | 'false') ?? '')
            onReload()
          }}
        />
      </div>

      <div className="flex w-full flex-shrink-0 flex-wrap items-center justify-end gap-3 lg:w-auto">
        <button
          type="button"
          onClick={onReload}
          disabled={loading}
          className="btn btn-secondary"
          title={t('common.refresh')}
        >
          <Icon name="refresh" size="md" className={loading ? 'animate-spin' : ''} />
        </button>
        <button
          type="button"
          onClick={onManageTemplates}
          className="btn btn-secondary"
          title={t('admin.channelMonitor.template.manageButton')}
        >
          <Icon name="cog" size="md" className="mr-2" />
          {t('admin.channelMonitor.template.manageButton')}
        </button>
        <button type="button" onClick={onCreate} className="btn btn-primary">
          <Icon name="plus" size="md" className="mr-2" />
          {t('admin.channelMonitor.createButton')}
        </button>
      </div>
    </div>
  )
}
