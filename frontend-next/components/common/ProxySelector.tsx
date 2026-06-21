'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useI18n } from '@/lib/i18n'
import { adminProxiesAPI } from '@/lib/adminProxies'
import Icon from '@/components/icons/Icon'
import type { Proxy } from '@/lib/types'

interface ProxyTestResult {
  success: boolean
  message: string
  latency_ms?: number
  ip_address?: string
  city?: string
  region?: string
  country?: string
}

interface ProxySelectorProps {
  modelValue: number | null
  proxies: Proxy[]
  disabled?: boolean
  onUpdateModelValue?: (value: number | null) => void
}

const selectTrigger =
  'flex w-full items-center justify-between gap-2 rounded-xl px-4 py-2.5 text-sm bg-white dark:bg-dark-800 border border-gray-200 dark:border-dark-600 text-gray-900 dark:text-gray-100 transition-all duration-200 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/30 hover:border-gray-300 dark:hover:border-dark-500 cursor-pointer'
const selectTriggerOpen = 'border-primary-500 ring-2 ring-primary-500/30'
const selectTriggerDisabled =
  'cursor-not-allowed bg-gray-100 opacity-60 dark:bg-dark-900'
const selectValue = 'flex-1 truncate text-left'
const selectIcon = 'flex-shrink-0 text-gray-400 dark:text-dark-400'
const selectDropdown =
  'absolute z-[100] mt-2 w-full bg-white dark:bg-dark-800 rounded-xl border border-gray-200 dark:border-dark-700 shadow-lg shadow-black/10 dark:shadow-black/30 overflow-hidden transition-all duration-200 ease-in-out'
const selectHeader =
  'flex items-center gap-2 px-3 py-2 border-b border-gray-100 dark:border-dark-700'
const selectSearch = 'flex flex-1 items-center gap-2'
const selectSearchInput =
  'flex-1 bg-transparent text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-dark-400 focus:outline-none'
const batchTestBtn =
  'flex-shrink-0 rounded-lg p-1.5 text-gray-500 hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-colors disabled:cursor-not-allowed disabled:opacity-50'
const selectOptions = 'max-h-60 overflow-y-auto py-1'
const selectOption =
  'flex items-center justify-between gap-2 px-4 py-2.5 text-sm text-gray-700 dark:text-gray-300 cursor-pointer transition-colors duration-150 hover:bg-gray-50 dark:hover:bg-dark-700'
const selectOptionSelected = 'bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300'
const selectOptionLabel = 'truncate'
const selectEmpty = 'px-4 py-8 text-center text-sm text-gray-500 dark:text-dark-400'
const testBtn =
  'flex-shrink-0 rounded p-1 text-gray-400 hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-colors disabled:cursor-not-allowed disabled:opacity-50'

export default function ProxySelector({
  modelValue,
  proxies,
  disabled = false,
  onUpdateModelValue,
}: ProxySelectorProps) {
  const { t } = useI18n()
  const [isOpen, setIsOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const containerRef = useRef<HTMLDivElement | null>(null)
  const searchInputRef = useRef<HTMLInputElement | null>(null)
  const [testResults, setTestResults] = useState<Record<number, ProxyTestResult>>({})
  const [testingProxyIds, setTestingProxyIds] = useState<Set<number>>(new Set())
  const [batchTesting, setBatchTesting] = useState(false)

  const selectedProxy = useMemo(() => {
    if (modelValue === null) return null
    return proxies.find((p) => p.id === modelValue) || null
  }, [modelValue, proxies])

  const selectedLabel = useMemo(() => {
    if (!selectedProxy) return t('admin.accounts.noProxy')
    return `${selectedProxy.name} (${selectedProxy.protocol}://${selectedProxy.host}:${selectedProxy.port})`
  }, [selectedProxy, t])

  const filteredProxies = useMemo(() => {
    if (!searchQuery) return proxies
    const query = searchQuery.toLowerCase()
    return proxies.filter((proxy) => {
      const name = proxy.name.toLowerCase()
      const host = proxy.host.toLowerCase()
      return name.includes(query) || host.includes(query)
    })
  }, [proxies, searchQuery])

  const toggle = () => {
    if (disabled) return
    setIsOpen(!isOpen)
    if (!isOpen) {
      requestAnimationFrame(() => searchInputRef.current?.focus())
    }
  }

  const selectOption = (value: number | null) => {
    onUpdateModelValue?.(value)
    setIsOpen(false)
    setSearchQuery('')
  }

  const updateTestingIds = (id: number, add: boolean) => {
    setTestingProxyIds((prev) => {
      const next = new Set(prev)
      if (add) next.add(id)
      else next.delete(id)
      return next
    })
  }

  const handleTestProxy = async (proxy: Proxy) => {
    if (testingProxyIds.has(proxy.id)) return

    updateTestingIds(proxy.id, true)
    try {
      const result = await adminProxiesAPI.testProxy(proxy.id)
      setTestResults((prev) => ({ ...prev, [proxy.id]: result }))
    } catch (error: unknown) {
      const err = error as { response?: { data?: { detail?: string } } }
      setTestResults((prev) => ({
        ...prev,
        [proxy.id]: {
          success: false,
          message: err.response?.data?.detail || 'Test failed',
        },
      }))
    } finally {
      updateTestingIds(proxy.id, false)
    }
  }

  const handleBatchTest = async () => {
    if (batchTesting || proxies.length === 0) return

    setBatchTesting(true)

    await Promise.all(
      proxies.map(async (proxy) => {
        updateTestingIds(proxy.id, true)
        try {
          const result = await adminProxiesAPI.testProxy(proxy.id)
          setTestResults((prev) => ({ ...prev, [proxy.id]: result }))
        } catch (error: unknown) {
          const err = error as { response?: { data?: { detail?: string } } }
          setTestResults((prev) => ({
            ...prev,
            [proxy.id]: {
              success: false,
              message: err.response?.data?.detail || 'Test failed',
            },
          }))
        } finally {
          updateTestingIds(proxy.id, false)
        }
      }),
    )

    setBatchTesting(false)
  }

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false)
        setSearchQuery('')
      }
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && isOpen) {
        setIsOpen(false)
        setSearchQuery('')
      }
    }

    document.addEventListener('click', handleClickOutside)
    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('click', handleClickOutside)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [isOpen])

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={toggle}
        disabled={disabled}
        className={`${selectTrigger} ${isOpen ? selectTriggerOpen : ''} ${disabled ? selectTriggerDisabled : ''}`}
      >
        <span className={selectValue}>{selectedLabel}</span>
        <span className={selectIcon}>
          <Icon
            name="chevronDown"
            size="md"
            className={`transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
          />
        </span>
      </button>

      {isOpen ? (
        <div
          className={`${selectDropdown} opacity-100 translate-y-0`}
          style={{ transform: 'translateY(0)' }}
        >
          <div className={selectHeader}>
            <div className={selectSearch}>
              <Icon name="search" size="sm" className="text-gray-400" />
              <input
                ref={searchInputRef}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                type="text"
                placeholder={t('admin.proxies.searchProxies')}
                className={selectSearchInput}
                onClick={(e) => e.stopPropagation()}
              />
            </div>
            {proxies.length > 0 ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  void handleBatchTest()
                }}
                disabled={batchTesting}
                className={batchTestBtn}
                title={t('admin.proxies.batchTest')}
              >
                {batchTesting ? (
                  <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth={4}
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                ) : (
                  <Icon name="play" size="sm" />
                )}
              </button>
            ) : null}
          </div>

          <div className={selectOptions}>
            <div
              onClick={() => selectOption(null)}
              className={`${selectOption} ${modelValue === null ? selectOptionSelected : ''}`}
            >
              <span className={selectOptionLabel}>{t('admin.accounts.noProxy')}</span>
              {modelValue === null ? (
                <Icon name="check" size="sm" className="text-primary-500" />
              ) : null}
            </div>

            {filteredProxies.map((proxy) => (
              <div
                key={proxy.id}
                onClick={() => selectOption(proxy.id)}
                className={`${selectOption} ${modelValue === proxy.id ? selectOptionSelected : ''}`}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-medium">{proxy.name}</span>
                    {proxy.account_count !== undefined ? (
                      <span className="inline-flex flex-shrink-0 items-center rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-600 dark:bg-dark-600 dark:text-gray-400">
                        {proxy.account_count}
                      </span>
                    ) : null}
                    {testResults[proxy.id] ? (
                      testResults[proxy.id].success ? (
                        <span className="inline-flex flex-shrink-0 items-center gap-1 rounded bg-emerald-100 px-1.5 py-0.5 text-xs text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                          {testResults[proxy.id].country ? (
                            <span>{testResults[proxy.id].country}</span>
                          ) : null}
                          {testResults[proxy.id].latency_ms ? (
                            <span>{testResults[proxy.id].latency_ms}ms</span>
                          ) : null}
                        </span>
                      ) : (
                        <span className="inline-flex flex-shrink-0 items-center rounded bg-red-100 px-1.5 py-0.5 text-xs text-red-700 dark:bg-red-900/30 dark:text-red-400">
                          {t('admin.proxies.testFailed')}
                        </span>
                      )
                    ) : null}
                  </div>
                  <div className="truncate text-xs text-gray-500 dark:text-gray-400">
                    {proxy.protocol}://{proxy.host}:{proxy.port}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    void handleTestProxy(proxy)
                  }}
                  disabled={testingProxyIds.has(proxy.id)}
                  className={testBtn}
                  title={t('admin.proxies.testConnection')}
                >
                  {testingProxyIds.has(proxy.id) ? (
                    <svg className="h-3.5 w-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth={4}
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      />
                    </svg>
                  ) : (
                    <Icon name="play" size="xs" />
                  )}
                </button>

                {modelValue === proxy.id ? (
                  <Icon name="check" size="sm" className="flex-shrink-0 text-primary-500" />
                ) : null}
              </div>
            ))}

            {filteredProxies.length === 0 && searchQuery ? (
              <div className={selectEmpty}>{t('common.noOptionsFound')}</div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  )
}
