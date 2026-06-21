'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useI18n } from '@/lib/i18n'
import Select, { type SelectOption } from '@/components/common/Select'
import { adminUsageAPI, type SimpleApiKey, type SimpleUser } from '@/lib/adminUsage'
import { adminAccountsAPI } from '@/lib/adminAccounts'
import { adminGroupsAPI } from '@/lib/adminGroups'
import type { AdminUsageQueryParams } from '@/lib/adminUsage'

interface SimpleAccount {
  id: number
  name: string
}

interface UsageFiltersProps {
  filters: AdminUsageQueryParams
  exporting: boolean
  startDate: string
  endDate: string
  showActions?: boolean
  modelOptions?: string[]
  afterReset?: ReactNode
  onFiltersChange: (filters: AdminUsageQueryParams) => void
  onChange: () => void
  onRefresh: () => void
  onReset: () => void
  onExport: () => void
  onCleanup: () => void
}

export default function UsageFilters({
  filters,
  exporting,
  startDate,
  endDate,
  showActions = true,
  modelOptions = [],
  afterReset,
  onFiltersChange,
  onChange,
  onRefresh,
  onReset,
  onExport,
  onCleanup,
}: UsageFiltersProps) {
  const { t } = useI18n()

  const userSearchRef = useRef<HTMLDivElement | null>(null)
  const apiKeySearchRef = useRef<HTMLDivElement | null>(null)
  const accountSearchRef = useRef<HTMLDivElement | null>(null)

  const [userKeyword, setUserKeyword] = useState('')
  const [userResults, setUserResults] = useState<SimpleUser[]>([])
  const [showUserDropdown, setShowUserDropdown] = useState(false)

  const [apiKeyKeyword, setApiKeyKeyword] = useState('')
  const [apiKeyResults, setApiKeyResults] = useState<SimpleApiKey[]>([])
  const [showApiKeyDropdown, setShowApiKeyDropdown] = useState(false)

  const [accountKeyword, setAccountKeyword] = useState('')
  const [accountResults, setAccountResults] = useState<SimpleAccount[]>([])
  const [showAccountDropdown, setShowAccountDropdown] = useState(false)

  const [groupOptions, setGroupOptions] = useState<SelectOption[]>([
    { value: null, label: t('admin.usage.allGroups') },
  ])

  const modelSelectOptions = useMemo<SelectOption[]>(
    () => [
      { value: null, label: t('admin.usage.allModels') },
      ...modelOptions.map((m) => ({ value: m, label: m })),
    ],
    [modelOptions, t],
  )

  const requestTypeOptions = useMemo<SelectOption[]>(
    () => [
      { value: null, label: t('admin.usage.allTypes') },
      { value: 'ws_v2', label: t('usage.ws') },
      { value: 'stream', label: t('usage.stream') },
      { value: 'sync', label: t('usage.sync') },
    ],
    [t],
  )

  const billingTypeOptions = useMemo<SelectOption[]>(
    () => [
      { value: null, label: t('admin.usage.allBillingTypes') },
      { value: 0, label: t('admin.usage.billingTypeBalance') },
      { value: 1, label: t('admin.usage.billingTypeSubscription') },
    ],
    [t],
  )

  const billingModeOptions = useMemo<SelectOption[]>(
    () => [
      { value: null, label: t('admin.usage.allBillingModes') },
      { value: 'token', label: t('admin.usage.billingModeToken') },
      { value: 'per_request', label: t('admin.usage.billingModePerRequest') },
      { value: 'image', label: t('admin.usage.billingModeImage') },
    ],
    [t],
  )

  const updateFilters = useCallback(
    (patch: Partial<AdminUsageQueryParams>) => {
      onFiltersChange({ ...filters, ...patch, start_date: startDate, end_date: endDate })
    },
    [filters, onFiltersChange, startDate, endDate],
  )

  const clearApiKey = useCallback(() => {
    setApiKeyKeyword('')
    setApiKeyResults([])
    setShowApiKeyDropdown(false)
    updateFilters({ api_key_id: undefined })
  }, [updateFilters])

  const debouncedUserSearch = useCallback(
    (keyword: string) => {
      window.setTimeout(async () => {
        if (!keyword) {
          setUserResults([])
          return
        }
        try {
          const results = await adminUsageAPI.searchUsers(keyword)
          setUserResults(results.sort((a, b) => Number(a.deleted) - Number(b.deleted)))
        } catch {
          setUserResults([])
        }
      }, 300)
    },
    [],
  )

  const debouncedApiKeySearch = useCallback(
    (keyword: string, userId?: number) => {
      window.setTimeout(async () => {
        try {
          setApiKeyResults(await adminUsageAPI.searchApiKeys(userId, keyword || ''))
        } catch {
          setApiKeyResults([])
        }
      }, 300)
    },
    [],
  )

  const debouncedAccountSearch = useCallback((keyword: string) => {
    window.setTimeout(async () => {
      if (!keyword) {
        setAccountResults([])
        return
      }
      try {
        const res = await adminAccountsAPI.list(1, 20, { search: keyword })
        setAccountResults(res.items.map((a) => ({ id: a.id, name: a.name })))
      } catch {
        setAccountResults([])
      }
    }, 300)
  }, [])

  const selectUser = async (u: SimpleUser) => {
    setUserKeyword(u.email)
    setShowUserDropdown(false)
    updateFilters({ user_id: u.id, api_key_id: undefined })
    setApiKeyKeyword('')
    try {
      setApiKeyResults(await adminUsageAPI.searchApiKeys(u.id, ''))
    } catch {
      setApiKeyResults([])
    }
    onChange()
  }

  const clearUser = () => {
    setUserKeyword('')
    setUserResults([])
    setShowUserDropdown(false)
    updateFilters({ user_id: undefined })
    clearApiKey()
    onChange()
  }

  const selectApiKey = (k: SimpleApiKey) => {
    setApiKeyKeyword(k.name || String(k.id))
    setShowApiKeyDropdown(false)
    updateFilters({ api_key_id: k.id })
    onChange()
  }

  const selectAccount = (a: SimpleAccount) => {
    setAccountKeyword(a.name)
    setShowAccountDropdown(false)
    updateFilters({ account_id: a.id })
    onChange()
  }

  const clearAccount = () => {
    setAccountKeyword('')
    setAccountResults([])
    setShowAccountDropdown(false)
    updateFilters({ account_id: undefined })
    onChange()
  }

  useEffect(() => {
    void adminGroupsAPI.list(1, 1000).then((gs) => {
      setGroupOptions([
        { value: null, label: t('admin.usage.allGroups') },
        ...gs.items.map((g) => ({ value: g.id, label: g.name })),
      ])
    }).catch(() => {})
  }, [t])

  useEffect(() => {
    const onDocumentClick = (e: MouseEvent) => {
      const target = e.target as Node | null
      if (!target) return
      if (!userSearchRef.current?.contains(target)) setShowUserDropdown(false)
      if (!apiKeySearchRef.current?.contains(target)) setShowApiKeyDropdown(false)
      if (!accountSearchRef.current?.contains(target)) setShowAccountDropdown(false)
    }
    document.addEventListener('click', onDocumentClick)
    return () => document.removeEventListener('click', onDocumentClick)
  }, [])

  useEffect(() => {
    if (!filters.user_id) {
      setUserKeyword('')
      setUserResults([])
    }
  }, [filters.user_id])

  useEffect(() => {
    if (!filters.api_key_id) {
      setApiKeyKeyword('')
      setApiKeyResults([])
    }
  }, [filters.api_key_id])

  useEffect(() => {
    if (!filters.account_id) {
      setAccountKeyword('')
      setAccountResults([])
    }
  }, [filters.account_id])

  return (
    <div className="card p-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-1 flex-wrap items-end gap-4">
          <div ref={userSearchRef} className="usage-filter-dropdown relative w-full sm:w-auto sm:min-w-[240px]">
            <label className="input-label">{t('admin.usage.userFilter')}</label>
            <input
              value={userKeyword}
              type="text"
              className="input pr-8"
              placeholder={t('admin.usage.searchUserPlaceholder')}
              onInput={(e) => {
                const value = e.currentTarget.value
                setUserKeyword(value)
                debouncedUserSearch(value)
              }}
              onFocus={() => setShowUserDropdown(true)}
            />
            {filters.user_id ? (
              <button
                type="button"
                onClick={clearUser}
                className="absolute right-2 top-9 text-gray-400"
                aria-label="Clear user filter"
              >
                ✕
              </button>
            ) : null}
            {showUserDropdown && (userResults.length > 0 || userKeyword) ? (
              <div className="absolute z-50 mt-1 max-h-60 w-full overflow-auto rounded-lg border bg-white shadow-lg dark:bg-gray-800">
                {userResults.map((u) => (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => void selectUser(u)}
                    className="w-full px-4 py-2 text-left hover:bg-gray-100 dark:hover:bg-gray-700"
                  >
                    <span>
                      {u.email}
                      {u.deleted ? (
                        <span className="ml-1 text-xs text-gray-400">
                          （{t('admin.usage.userDeletedBadge')}）
                        </span>
                      ) : null}
                    </span>
                    <span className="ml-2 text-xs text-gray-400">#{u.id}</span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          <div ref={apiKeySearchRef} className="usage-filter-dropdown relative w-full sm:w-auto sm:min-w-[240px]">
            <label className="input-label">{t('usage.apiKeyFilter')}</label>
            <input
              value={apiKeyKeyword}
              type="text"
              className="input pr-8"
              placeholder={t('admin.usage.searchApiKeyPlaceholder')}
              onInput={(e) => {
                const value = e.currentTarget.value
                setApiKeyKeyword(value)
                debouncedApiKeySearch(value, filters.user_id)
              }}
              onFocus={() => {
                setShowApiKeyDropdown(true)
                if (apiKeyResults.length === 0) debouncedApiKeySearch(apiKeyKeyword, filters.user_id)
              }}
            />
            {filters.api_key_id ? (
              <button
                type="button"
                onClick={() => {
                  clearApiKey()
                  onChange()
                }}
                className="absolute right-2 top-9 text-gray-400"
                aria-label="Clear API key filter"
              >
                ✕
              </button>
            ) : null}
            {showApiKeyDropdown && apiKeyResults.length > 0 ? (
              <div className="absolute z-50 mt-1 max-h-60 w-full overflow-auto rounded-lg border bg-white shadow-lg dark:bg-gray-800">
                {apiKeyResults.map((k) => (
                  <button
                    key={k.id}
                    type="button"
                    onClick={() => selectApiKey(k)}
                    className="w-full px-4 py-2 text-left hover:bg-gray-100 dark:hover:bg-gray-700"
                  >
                    <span className="truncate">{k.name || `#${k.id}`}</span>
                    <span className="ml-2 text-xs text-gray-400">#{k.id}</span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          <div className="w-full sm:w-auto sm:min-w-[220px]">
            <label className="input-label">{t('usage.model')}</label>
            <Select
              modelValue={filters.model ?? null}
              options={modelSelectOptions}
              searchable
              onChange={() => onChange()}
              onUpdateModelValue={(v) => updateFilters({ model: v == null ? undefined : String(v) })}
            />
          </div>

          <div ref={accountSearchRef} className="usage-filter-dropdown relative w-full sm:w-auto sm:min-w-[220px]">
            <label className="input-label">{t('admin.usage.account')}</label>
            <input
              value={accountKeyword}
              type="text"
              className="input pr-8"
              placeholder={t('admin.usage.searchAccountPlaceholder')}
              onInput={(e) => {
                const value = e.currentTarget.value
                setAccountKeyword(value)
                debouncedAccountSearch(value)
              }}
              onFocus={() => setShowAccountDropdown(true)}
            />
            {filters.account_id ? (
              <button
                type="button"
                onClick={clearAccount}
                className="absolute right-2 top-9 text-gray-400"
                aria-label="Clear account filter"
              >
                ✕
              </button>
            ) : null}
            {showAccountDropdown && (accountResults.length > 0 || accountKeyword) ? (
              <div className="absolute z-50 mt-1 max-h-60 w-full overflow-auto rounded-lg border bg-white shadow-lg dark:bg-gray-800">
                {accountResults.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => selectAccount(a)}
                    className="w-full px-4 py-2 text-left hover:bg-gray-100 dark:hover:bg-gray-700"
                  >
                    <span className="truncate">{a.name}</span>
                    <span className="ml-2 text-xs text-gray-400">#{a.id}</span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          <div className="w-full sm:w-auto sm:min-w-[180px]">
            <label className="input-label">{t('usage.type')}</label>
            <Select
              modelValue={filters.request_type ?? null}
              options={requestTypeOptions}
              onChange={() => onChange()}
              onUpdateModelValue={(v) =>
                updateFilters({
                  request_type: v == null ? undefined : (String(v) as AdminUsageQueryParams['request_type']),
                })
              }
            />
          </div>

          <div className="w-full sm:w-auto sm:min-w-[200px]">
            <label className="input-label">{t('admin.usage.billingType')}</label>
            <Select
              modelValue={filters.billing_type ?? null}
              options={billingTypeOptions}
              onChange={() => onChange()}
              onUpdateModelValue={(v) =>
                updateFilters({ billing_type: v == null ? null : Number(v) })
              }
            />
          </div>

          <div className="w-full sm:w-auto sm:min-w-[200px]">
            <label className="input-label">{t('admin.usage.billingMode')}</label>
            <Select
              modelValue={filters.billing_mode ?? null}
              options={billingModeOptions}
              onChange={() => onChange()}
              onUpdateModelValue={(v) =>
                updateFilters({ billing_mode: v == null ? undefined : String(v) })
              }
            />
          </div>

          <div className="w-full sm:w-auto sm:min-w-[200px]">
            <label className="input-label">{t('admin.usage.group')}</label>
            <Select
              modelValue={filters.group_id ?? null}
              options={groupOptions}
              searchable
              onChange={() => onChange()}
              onUpdateModelValue={(v) =>
                updateFilters({ group_id: v == null ? undefined : Number(v) })
              }
            />
          </div>
        </div>

        {showActions ? (
          <div className="flex w-full flex-wrap items-center justify-end gap-3 sm:w-auto">
            <button type="button" onClick={onRefresh} className="btn btn-secondary">
              {t('common.refresh')}
            </button>
            <button type="button" onClick={onReset} className="btn btn-secondary">
              {t('common.reset')}
            </button>
            {afterReset}
            <button type="button" onClick={onCleanup} className="btn btn-danger">
              {t('admin.usage.cleanup.button')}
            </button>
            <button type="button" onClick={onExport} disabled={exporting} className="btn btn-primary">
              {t('usage.exportExcel')}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  )
}
