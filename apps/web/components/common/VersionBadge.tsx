'use client'

import { useEffect, useRef, useState } from 'react'
import { useI18n } from '@/lib/i18n/I18nProvider'
import { useApp } from '@/context/AppContext'
import { useAuth } from '@/context/AuthContext'
import { performUpdate, restartService } from '@/lib/adminSystem'
import Icon from '@/components/icons/Icon'

interface VersionBadgeProps {
  version?: string
}

export default function VersionBadge({ version }: VersionBadgeProps) {
  const { t } = useI18n()
  const { isAdmin } = useAuth()
  const {
    versionLoading: loading,
    currentVersion: storeCurrentVersion,
    latestVersion,
    hasUpdate,
    releaseInfo,
    buildType,
    fetchVersion,
    clearVersionCache,
  } = useApp()

  const currentVersion = storeCurrentVersion || version || ''
  const isReleaseBuild = buildType === 'release'

  const [dropdownOpen, setDropdownOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement | null>(null)

  // Update process states (local to this component)
  const [updating, setUpdating] = useState(false)
  const [restarting, setRestarting] = useState(false)
  const [needRestart, setNeedRestart] = useState(false)
  const [updateError, setUpdateError] = useState('')
  const [updateSuccess, setUpdateSuccess] = useState(false)
  const [restartCountdown, setRestartCountdown] = useState(0)

  function toggleDropdown() {
    setDropdownOpen((prev) => !prev)
  }

  function closeDropdown() {
    setDropdownOpen(false)
  }

  async function refreshVersion(force = true) {
    if (!isAdmin) return
    setUpdateError('')
    setUpdateSuccess(false)
    setNeedRestart(false)
    await fetchVersion(force)
  }

  async function handleUpdate() {
    if (updating) return
    setUpdating(true)
    setUpdateError('')
    setUpdateSuccess(false)
    try {
      const result = await performUpdate()
      setUpdateSuccess(true)
      setNeedRestart(result.need_restart)
      clearVersionCache()
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } }; message?: string }
      setUpdateError(err.response?.data?.message || err.message || t('version.updateFailed'))
    } finally {
      setUpdating(false)
    }
  }

  async function checkServiceAndReload() {
    const maxRetries = 5
    const retryDelay = 1000

    for (let i = 0; i < maxRetries; i++) {
      try {
        const response = await window.fetch('/health', { method: 'GET', cache: 'no-cache' })
        if (response.ok) {
          window.location.reload()
          return
        }
      } catch {
        // Service not ready yet
      }

      if (i < maxRetries - 1) {
        await new Promise((resolve) => setTimeout(resolve, retryDelay))
      }
    }

    window.location.reload()
  }

  async function handleRestart() {
    if (restarting) return
    setRestarting(true)
    setRestartCountdown(8)

    try {
      await restartService()
    } catch {
      // Expected - connection will be lost during restart
      console.log('Service restarting...')
    }

    const countdownInterval = setInterval(() => {
      setRestartCountdown((prev) => {
        const next = prev - 1
        if (next <= 0) {
          clearInterval(countdownInterval)
          checkServiceAndReload()
        }
        return next
      })
    }, 1000)
  }

  useEffect(() => {
    if (isAdmin) {
      // Use cached version if available, otherwise fetch.
      fetchVersion(false)
    }
  }, [isAdmin, fetchVersion])

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node
      const button = (event.target as Element).closest?.('button')
      if (dropdownRef.current && !dropdownRef.current.contains(target) && !button?.contains(target)) {
        closeDropdown()
      }
    }
    document.addEventListener('click', handleClickOutside)
    return () => document.removeEventListener('click', handleClickOutside)
  }, [])

  if (!isAdmin) {
    // Non-admin: Simple static version text
    return version ? (
      <div className="relative">
        <span className="text-xs text-gray-500 dark:text-dark-400">v{version}</span>
      </div>
    ) : (
      <div className="relative" />
    )
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={toggleDropdown}
        className={`flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs transition-colors ${
          hasUpdate
            ? 'bg-amber-100 text-amber-700 hover:bg-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:hover:bg-amber-900/50'
            : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-dark-800 dark:text-dark-400 dark:hover:bg-dark-700'
        }`}
        title={hasUpdate ? t('version.updateAvailable') : t('version.upToDate')}
      >
        {currentVersion ? (
          <span className="font-medium">v{currentVersion}</span>
        ) : (
          <span className="h-3 w-12 animate-pulse rounded bg-gray-200 font-medium dark:bg-dark-600" />
        )}
        {hasUpdate ? (
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-amber-500" />
          </span>
        ) : null}
      </button>

      {dropdownOpen ? (
        <div
          ref={dropdownRef}
          className="absolute left-0 z-50 mt-2 w-64 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg dark:border-dark-700 dark:bg-dark-800"
        >
          {/* Header with refresh button */}
          <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3 dark:border-dark-700">
            <span className="text-sm font-medium text-gray-700 dark:text-dark-300">
              {t('version.currentVersion')}
            </span>
            <button
              type="button"
              onClick={() => refreshVersion(true)}
              className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-dark-700 dark:hover:text-dark-200"
              disabled={loading}
              title={t('version.refresh')}
            >
              <Icon name="refresh" size="sm" strokeWidth={2} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>

          <div className="p-4">
            {loading ? (
              <div className="flex items-center justify-center py-6">
                <svg className="h-6 w-6 animate-spin text-primary-500" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
              </div>
            ) : (
              <>
                {/* Version display - centered and prominent */}
                <div className="mb-4 text-center">
                  <div className="inline-flex items-center gap-2">
                    {currentVersion ? (
                      <span className="text-2xl font-bold text-gray-900 dark:text-white">v{currentVersion}</span>
                    ) : (
                      <span className="text-2xl font-bold text-gray-400 dark:text-dark-500">--</span>
                    )}
                    {!hasUpdate ? (
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
                        <svg className="h-3 w-3 text-green-600 dark:text-green-400" fill="currentColor" viewBox="0 0 20 20">
                          <path
                            fillRule="evenodd"
                            d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                            clipRule="evenodd"
                          />
                        </svg>
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1 text-xs text-gray-500 dark:text-dark-400">
                    {hasUpdate ? `${t('version.latestVersion')}: v${latestVersion}` : t('version.upToDate')}
                  </p>
                </div>

                {/* Priority 1: Update error */}
                {updateError ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-3 rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-800/50 dark:bg-red-900/20">
                      <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/50">
                        <Icon name="x" size="sm" strokeWidth={2} className="text-red-600 dark:text-red-400" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-red-700 dark:text-red-300">{t('version.updateFailed')}</p>
                        <p className="truncate text-xs text-red-600/70 dark:text-red-400/70">{updateError}</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={handleUpdate}
                      disabled={updating}
                      className="flex w-full items-center justify-center gap-2 rounded-lg bg-red-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {t('version.retry')}
                    </button>
                  </div>
                ) : updateSuccess && needRestart ? (
                  /* Priority 2: Update success - need restart */
                  <div className="space-y-2">
                    <div className="flex items-center gap-3 rounded-lg border border-green-200 bg-green-50 p-3 dark:border-green-800/50 dark:bg-green-900/20">
                      <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/50">
                        <svg className="h-4 w-4 text-green-600 dark:text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-green-700 dark:text-green-300">{t('version.updateComplete')}</p>
                        <p className="text-xs text-green-600/70 dark:text-green-400/70">{t('version.restartRequired')}</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={handleRestart}
                      disabled={restarting}
                      className="flex w-full items-center justify-center gap-2 rounded-lg bg-green-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-green-600 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {restarting ? (
                        <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path
                            className="opacity-75"
                            fill="currentColor"
                            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                          />
                        </svg>
                      ) : (
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                          />
                        </svg>
                      )}
                      {restarting ? (
                        <>
                          <span>{t('version.restarting')}</span>
                          {restartCountdown > 0 ? <span className="tabular-nums">({restartCountdown}s)</span> : null}
                        </>
                      ) : (
                        <span>{t('version.restartNow')}</span>
                      )}
                    </button>
                  </div>
                ) : hasUpdate && !isReleaseBuild ? (
                  /* Priority 3: Update available for source build - git pull hint */
                  <div className="space-y-2">
                    {releaseInfo?.html_url && releaseInfo.html_url !== '#' ? (
                      <a
                        href={releaseInfo.html_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="group flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 transition-colors hover:bg-amber-100 dark:border-amber-800/50 dark:bg-amber-900/20 dark:hover:bg-amber-900/30"
                      >
                        <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/50">
                          <Icon name="download" size="sm" strokeWidth={2} className="text-amber-600 dark:text-amber-400" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-amber-700 dark:text-amber-300">{t('version.updateAvailable')}</p>
                          <p className="text-xs text-amber-600/70 dark:text-amber-400/70">v{latestVersion}</p>
                        </div>
                        <svg className="h-4 w-4 text-amber-500 transition-transform group-hover:translate-x-0.5 dark:text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                        </svg>
                      </a>
                    ) : null}
                    <div className="flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 p-2 dark:border-blue-800/50 dark:bg-blue-900/20">
                      <svg className="h-3.5 w-3.5 flex-shrink-0 text-blue-500 dark:text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <p className="text-xs text-blue-600 dark:text-blue-400">{t('version.sourceModeHint')}</p>
                    </div>
                  </div>
                ) : hasUpdate && isReleaseBuild ? (
                  /* Priority 4: Update available for release build - update button */
                  <div className="space-y-2">
                    <div className="flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-800/50 dark:bg-amber-900/20">
                      <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/50">
                        <Icon name="download" size="sm" strokeWidth={2} className="text-amber-600 dark:text-amber-400" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-amber-700 dark:text-amber-300">{t('version.updateAvailable')}</p>
                        <p className="text-xs text-amber-600/70 dark:text-amber-400/70">v{latestVersion}</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={handleUpdate}
                      disabled={updating}
                      className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-600 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {updating ? (
                        <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path
                            className="opacity-75"
                            fill="currentColor"
                            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                          />
                        </svg>
                      ) : (
                        <Icon name="download" size="sm" strokeWidth={2} />
                      )}
                      {updating ? t('version.updating') : t('version.updateNow')}
                    </button>
                    {releaseInfo?.html_url && releaseInfo.html_url !== '#' ? (
                      <a
                        href={releaseInfo.html_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center justify-center gap-1 text-xs text-gray-500 transition-colors hover:text-gray-700 dark:text-dark-400 dark:hover:text-dark-200"
                      >
                        {t('version.viewChangelog')}
                        <Icon name="externalLink" size="xs" strokeWidth={2} />
                      </a>
                    ) : null}
                  </div>
                ) : releaseInfo?.html_url && releaseInfo.html_url !== '#' ? (
                  /* Priority 5: Up to date - GitHub link */
                  <a
                    href={releaseInfo.html_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-2 py-2 text-sm text-gray-500 transition-colors hover:text-gray-700 dark:text-dark-400 dark:hover:text-dark-200"
                  >
                    <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                      <path
                        fillRule="evenodd"
                        clipRule="evenodd"
                        d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.17 6.839 9.49.5.092.682-.217.682-.482 0-.237-.008-.866-.013-1.7-2.782.604-3.369-1.34-3.369-1.34-.454-1.156-1.11-1.464-1.11-1.464-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.831.092-.646.35-1.086.636-1.336-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.578 9.578 0 0112 6.836c.85.004 1.705.114 2.504.336 1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.578.688.48C19.138 20.167 22 16.418 22 12c0-5.523-4.477-10-10-10z"
                      />
                    </svg>
                    {t('version.viewRelease')}
                  </a>
                ) : null}
              </>
            )}
          </div>
        </div>
      ) : null}
    </div>
  )
}
