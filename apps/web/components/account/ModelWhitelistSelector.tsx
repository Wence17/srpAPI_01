'use client'

import { useMemo, useState } from 'react'
import { useApp } from '@/context/AppContext'
import { useI18n } from '@/lib/i18n'
import { adminAccountsAPI, type SyncUpstreamPreviewParams } from '@/lib/adminAccounts'
import { extractApiErrorMessage } from '@/lib/apiError'
import ModelIcon from '@/components/common/ModelIcon'
import Icon from '@/components/icons/Icon'
import { allModels, getModelsByPlatform } from '@/lib/useModelWhitelist'

interface ModelWhitelistSelectorProps {
  value: string[]
  onChange: (value: string[]) => void
  platform?: string
  platforms?: string[]
  accountId?: number
  syncCredentials?: SyncUpstreamPreviewParams
}

export default function ModelWhitelistSelector({
  value,
  onChange,
  platform,
  platforms,
  accountId,
  syncCredentials,
}: ModelWhitelistSelectorProps) {
  const appStore = useApp()
  const { t } = useI18n()

  const [showDropdown, setShowDropdown] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [customModel, setCustomModel] = useState('')
  const [isComposing, setIsComposing] = useState(false)
  const [isSyncingUpstream, setIsSyncingUpstream] = useState(false)

  const normalizedPlatforms = useMemo(() => {
    const rawPlatforms =
      platforms && platforms.length > 0 ? platforms : platform ? [platform] : []
    return Array.from(
      new Set(
        rawPlatforms
          .map((p) => p?.trim())
          .filter((p): p is string => Boolean(p)),
      ),
    )
  }, [platform, platforms])

  const upstreamSyncPlatforms = new Set(['anthropic', 'openai', 'gemini', 'antigravity'])

  const canSyncUpstream = useMemo(() => {
    if (accountId) {
      if (normalizedPlatforms.length === 0) return true
      return normalizedPlatforms.some((p) => upstreamSyncPlatforms.has(p.toLowerCase()))
    }
    if (syncCredentials) {
      return upstreamSyncPlatforms.has(syncCredentials.platform.toLowerCase())
    }
    return false
  }, [accountId, normalizedPlatforms, syncCredentials])

  const availableOptions = useMemo(() => {
    if (normalizedPlatforms.length === 0) return allModels
    const allowedModels = new Set<string>()
    for (const p of normalizedPlatforms) {
      for (const model of getModelsByPlatform(p)) {
        allowedModels.add(model)
      }
    }
    return allModels.filter((model) => allowedModels.has(model.value))
  }, [normalizedPlatforms])

  const filteredModels = useMemo(() => {
    const query = searchQuery.toLowerCase().trim()
    if (!query) return availableOptions
    return availableOptions.filter(
      (m) => m.value.toLowerCase().includes(query) || m.label.toLowerCase().includes(query),
    )
  }, [availableOptions, searchQuery])

  const toggleDropdown = () => {
    setShowDropdown((prev) => {
      if (prev) setSearchQuery('')
      return !prev
    })
  }

  const removeModel = (model: string) => {
    onChange(value.filter((m) => m !== model))
  }

  const toggleModel = (model: string) => {
    if (value.includes(model)) {
      removeModel(model)
    } else {
      onChange([...value, model])
    }
  }

  const addCustom = () => {
    const model = customModel.trim()
    if (!model) return
    if (value.includes(model)) {
      appStore.showInfo(t('admin.accounts.modelExists'))
      return
    }
    onChange([...value, model])
    setCustomModel('')
  }

  const handleEnter = () => {
    if (!isComposing) addCustom()
  }

  const fillRelated = () => {
    const newModels = [...value]
    for (const p of normalizedPlatforms) {
      for (const model of getModelsByPlatform(p)) {
        if (!newModels.includes(model)) {
          newModels.push(model)
        }
      }
    }
    onChange(newModels)
  }

  const syncUpstreamModels = async () => {
    if (isSyncingUpstream) return
    if (!accountId && !syncCredentials) return

    setIsSyncingUpstream(true)
    try {
      const result = accountId
        ? await adminAccountsAPI.syncUpstreamModels(accountId)
        : await adminAccountsAPI.syncUpstreamModelsPreview(syncCredentials!)

      const upstreamModels = result.models.map((model) => model.trim()).filter(Boolean)
      if (upstreamModels.length === 0) {
        appStore.showInfo(t('admin.accounts.syncUpstreamModelsEmpty'))
        return
      }

      const newModels = [...value]
      let addedCount = 0
      for (const model of upstreamModels) {
        if (!newModels.includes(model)) {
          newModels.push(model)
          addedCount += 1
        }
      }

      onChange(newModels)
      if (addedCount > 0) {
        appStore.showSuccess(
          t('admin.accounts.syncUpstreamModelsSuccess', {
            count: addedCount,
            total: upstreamModels.length,
          }),
        )
      } else {
        appStore.showInfo(
          t('admin.accounts.syncUpstreamModelsNoChanges', { count: upstreamModels.length }),
        )
      }
    } catch (error: unknown) {
      const message = extractApiErrorMessage(error, t('admin.accounts.syncUpstreamModelsFailed'))
      appStore.showError(t('admin.accounts.syncUpstreamModelsError', { message }))
    } finally {
      setIsSyncingUpstream(false)
    }
  }

  return (
    <div>
      <div className="relative mb-3">
        <div
          role="button"
          tabIndex={0}
          onClick={toggleDropdown}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') toggleDropdown()
          }}
          className="cursor-pointer rounded-lg border border-gray-300 bg-white px-3 py-2 dark:border-dark-500 dark:bg-dark-700"
        >
          <div className="grid grid-cols-2 gap-1.5">
            {value.map((model) => (
              <span
                key={model}
                className="inline-flex items-center justify-between gap-1 rounded bg-gray-100 px-2 py-1 text-xs text-gray-700 dark:bg-dark-600 dark:text-gray-300"
              >
                <span className="flex items-center gap-1 truncate">
                  <ModelIcon model={model} size="14px" />
                  <span className="truncate">{model}</span>
                </span>
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation()
                    removeModel(model)
                  }}
                  className="shrink-0 rounded-full hover:bg-gray-200 dark:hover:bg-dark-500"
                >
                  <Icon name="x" size="xs" className="h-3.5 w-3.5" strokeWidth={2} />
                </button>
              </span>
            ))}
          </div>
          <div className="mt-2 flex items-center justify-between border-t border-gray-200 pt-2 dark:border-dark-600">
            <span className="text-xs text-gray-400">
              {t('admin.accounts.modelCount', { count: value.length })}
            </span>
            <svg className="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </div>

        {showDropdown ? (
          <div className="absolute left-0 right-0 top-full z-50 mt-1 rounded-lg border border-gray-200 bg-white shadow-lg dark:border-dark-600 dark:bg-dark-700">
            <div className="sticky top-0 border-b border-gray-200 bg-white p-2 dark:border-dark-600 dark:bg-dark-700">
              <input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                type="text"
                className="input w-full text-sm"
                placeholder={t('admin.accounts.searchModels')}
                onClick={(event) => event.stopPropagation()}
              />
            </div>
            <div className="max-h-52 overflow-auto">
              {filteredModels.map((model) => (
                <button
                  key={model.value}
                  type="button"
                  onClick={() => toggleModel(model.value)}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-dark-600"
                >
                  <span
                    className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                      value.includes(model.value)
                        ? 'border-primary-500 bg-primary-500 text-white'
                        : 'border-gray-300 dark:border-dark-500'
                    }`}
                  >
                    {value.includes(model.value) ? (
                      <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    ) : null}
                  </span>
                  <ModelIcon model={model.value} size="18px" />
                  <span className="truncate text-gray-900 dark:text-white">{model.value}</span>
                </button>
              ))}
              {filteredModels.length === 0 ? (
                <div className="px-3 py-4 text-center text-sm text-gray-500">
                  {t('admin.accounts.noMatchingModels')}
                </div>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={fillRelated}
          className="rounded-lg border border-blue-200 px-3 py-1.5 text-sm text-blue-600 hover:bg-blue-50 dark:border-blue-800 dark:text-blue-400 dark:hover:bg-blue-900/30"
        >
          {t('admin.accounts.fillRelatedModels')}
        </button>
        {canSyncUpstream ? (
          <button
            type="button"
            onClick={() => void syncUpstreamModels()}
            disabled={isSyncingUpstream}
            className="rounded-lg border border-emerald-200 px-3 py-1.5 text-sm text-emerald-600 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-emerald-800 dark:text-emerald-400 dark:hover:bg-emerald-900/30"
          >
            {isSyncingUpstream
              ? t('admin.accounts.syncUpstreamModelsLoading')
              : t('admin.accounts.syncUpstreamModels')}
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => onChange([])}
          className="rounded-lg border border-red-200 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-900/30"
        >
          {t('admin.accounts.clearAllModels')}
        </button>
      </div>

      <div className="mb-3">
        <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
          {t('admin.accounts.customModelName')}
        </label>
        <div className="flex gap-2">
          <input
            value={customModel}
            onChange={(event) => setCustomModel(event.target.value)}
            onCompositionStart={() => setIsComposing(true)}
            onCompositionEnd={() => setIsComposing(false)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                handleEnter()
              }
            }}
            type="text"
            className="input flex-1"
            placeholder={t('admin.accounts.enterCustomModelName')}
          />
          <button
            type="button"
            onClick={addCustom}
            className="rounded-lg bg-primary-50 px-4 py-2 text-sm font-medium text-primary-600 hover:bg-primary-100 dark:bg-primary-900/30 dark:text-primary-400 dark:hover:bg-primary-900/50"
          >
            {t('admin.accounts.addModel')}
          </button>
        </div>
      </div>
    </div>
  )
}
