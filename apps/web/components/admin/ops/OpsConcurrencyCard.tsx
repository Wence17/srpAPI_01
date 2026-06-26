'use client'

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react'
import { useI18n } from '@/lib/i18n'
import {
  adminOpsAPI,
  type OpsAccountAvailabilityStatsResponse,
  type OpsConcurrencyStatsResponse,
  type OpsUserConcurrencyStatsResponse,
} from '@/lib/adminOps'

interface OpsConcurrencyCardProps {
  platformFilter?: string
  groupIdFilter?: number | null
  refreshToken: number
}

interface SummaryRow {
  key: string
  name: string
  platform?: string
  total_accounts: number
  available_accounts: number
  rate_limited_accounts: number
  error_accounts: number
  total_concurrency: number
  used_concurrency: number
  waiting_in_queue: number
  availability_percentage: number
  concurrency_percentage: number
}

interface AccountRow {
  key: string
  name: string
  platform: string
  group_name: string
  current_in_use: number
  max_capacity: number
  waiting_in_queue: number
  load_percentage: number
  is_available: boolean
  is_rate_limited: boolean
  rate_limit_remaining_sec?: number
  is_overloaded: boolean
  overload_remaining_sec?: number
  has_error: boolean
  error_message?: string
}

interface UserRow {
  key: string
  user_id: number
  user_email: string
  username: string
  current_in_use: number
  max_capacity: number
  waiting_in_queue: number
  load_percentage: number
}

function safeNumber(n: unknown): number {
  return typeof n === 'number' && Number.isFinite(n) ? n : 0
}

function getLoadBarClass(loadPct: number): string {
  if (loadPct >= 90) return 'bg-red-500 dark:bg-red-600'
  if (loadPct >= 70) return 'bg-orange-500 dark:bg-orange-600'
  if (loadPct >= 50) return 'bg-yellow-500 dark:bg-yellow-600'
  return 'bg-green-500 dark:bg-green-600'
}

function getLoadBarStyle(loadPct: number): CSSProperties {
  return { width: `${Math.min(100, Math.max(0, loadPct))}%` }
}

function getLoadTextClass(loadPct: number): string {
  if (loadPct >= 90) return 'text-red-600 dark:text-red-400'
  if (loadPct >= 70) return 'text-orange-600 dark:text-orange-400'
  if (loadPct >= 50) return 'text-yellow-600 dark:text-yellow-400'
  return 'text-green-600 dark:text-green-400'
}

function formatDuration(seconds: number): string {
  if (seconds <= 0) return '0s'
  if (seconds < 60) return `${Math.round(seconds)}s`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  return `${hours}h`
}

export default function OpsConcurrencyCard({
  platformFilter = '',
  groupIdFilter = null,
  refreshToken,
}: OpsConcurrencyCardProps) {
  const { t } = useI18n()

  const [loading, setLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [concurrency, setConcurrency] = useState<OpsConcurrencyStatsResponse | null>(null)
  const [availability, setAvailability] = useState<OpsAccountAvailabilityStatsResponse | null>(null)
  const [userConcurrency, setUserConcurrency] = useState<OpsUserConcurrencyStatsResponse | null>(null)
  const [showByUser, setShowByUser] = useState(false)

  const realtimeEnabled =
    (concurrency?.enabled ?? true) && (availability?.enabled ?? true)

  const displayDimension = useMemo<'platform' | 'group' | 'account' | 'user'>(() => {
    if (showByUser) return 'user'
    if (typeof groupIdFilter === 'number' && groupIdFilter > 0) return 'account'
    if (platformFilter) return 'group'
    return 'platform'
  }, [showByUser, groupIdFilter, platformFilter])

  const platformRows = useMemo((): SummaryRow[] => {
    const concStats = concurrency?.platform || {}
    const availStats = availability?.platform || {}
    const platforms = new Set([...Object.keys(concStats), ...Object.keys(availStats)])

    return Array.from(platforms)
      .map((platform) => {
        const conc = concStats[platform] || {}
        const avail = availStats[platform] || {}
        const totalAccounts = safeNumber(avail.total_accounts)
        const availableAccounts = safeNumber(avail.available_count)
        const totalConcurrency = safeNumber(conc.max_capacity)
        const usedConcurrency = safeNumber(conc.current_in_use)

        return {
          key: platform,
          name: platform.toUpperCase(),
          total_accounts: totalAccounts,
          available_accounts: availableAccounts,
          rate_limited_accounts: safeNumber(avail.rate_limit_count),
          error_accounts: safeNumber(avail.error_count),
          total_concurrency: totalConcurrency,
          used_concurrency: usedConcurrency,
          waiting_in_queue: safeNumber(conc.waiting_in_queue),
          availability_percentage:
            totalAccounts > 0 ? Math.round((availableAccounts / totalAccounts) * 100) : 0,
          concurrency_percentage:
            totalConcurrency > 0 ? Math.round((usedConcurrency / totalConcurrency) * 100) : 0,
        }
      })
      .sort((a, b) => b.concurrency_percentage - a.concurrency_percentage)
  }, [concurrency, availability])

  const groupRows = useMemo((): SummaryRow[] => {
    const concStats = concurrency?.group || {}
    const availStats = availability?.group || {}
    const groupIds = new Set([...Object.keys(concStats), ...Object.keys(availStats)])

    const rows = Array.from(groupIds)
      .map((gid) => {
        const conc = concStats[gid] || {}
        const avail = availStats[gid] || {}

        if (
          platformFilter &&
          conc.platform !== platformFilter &&
          avail.platform !== platformFilter
        ) {
          return null
        }

        const totalAccounts = safeNumber(avail.total_accounts)
        const availableAccounts = safeNumber(avail.available_count)
        const totalConcurrency = safeNumber(conc.max_capacity)
        const usedConcurrency = safeNumber(conc.current_in_use)

        return {
          key: gid,
          name: String(conc.group_name || avail.group_name || `Group ${gid}`),
          platform: String(conc.platform || avail.platform || ''),
          total_accounts: totalAccounts,
          available_accounts: availableAccounts,
          rate_limited_accounts: safeNumber(avail.rate_limit_count),
          error_accounts: safeNumber(avail.error_count),
          total_concurrency: totalConcurrency,
          used_concurrency: usedConcurrency,
          waiting_in_queue: safeNumber(conc.waiting_in_queue),
          availability_percentage:
            totalAccounts > 0 ? Math.round((availableAccounts / totalAccounts) * 100) : 0,
          concurrency_percentage:
            totalConcurrency > 0 ? Math.round((usedConcurrency / totalConcurrency) * 100) : 0,
        }
      })
      .filter((row): row is NonNullable<typeof row> => row !== null)

    return rows.sort((a, b) => b.concurrency_percentage - a.concurrency_percentage)
  }, [concurrency, availability, platformFilter])

  const accountRows = useMemo((): AccountRow[] => {
    const concStats = concurrency?.account || {}
    const availStats = availability?.account || {}
    const accountIds = new Set([...Object.keys(concStats), ...Object.keys(availStats)])

    const rows = Array.from(accountIds)
      .map((aid) => {
        const conc = concStats[aid] || {}
        const avail = availStats[aid] || {}

        if (typeof groupIdFilter === 'number' && groupIdFilter > 0) {
          if (conc.group_id !== groupIdFilter && avail.group_id !== groupIdFilter) {
            return null
          }
        }

        return {
          key: aid,
          name: String(conc.account_name || avail.account_name || `Account ${aid}`),
          platform: String(conc.platform || avail.platform || ''),
          group_name: String(conc.group_name || avail.group_name || ''),
          current_in_use: safeNumber(conc.current_in_use),
          max_capacity: safeNumber(conc.max_capacity),
          waiting_in_queue: safeNumber(conc.waiting_in_queue),
          load_percentage: safeNumber(conc.load_percentage),
          is_available: avail.is_available || false,
          is_rate_limited: avail.is_rate_limited || false,
          rate_limit_remaining_sec: avail.rate_limit_remaining_sec,
          is_overloaded: avail.is_overloaded || false,
          overload_remaining_sec: avail.overload_remaining_sec,
          has_error: avail.has_error || false,
          error_message: avail.error_message || '',
        }
      })
      .filter((row): row is NonNullable<typeof row> => row !== null)

    return rows.sort((a, b) => {
      if (a.has_error !== b.has_error) return a.has_error ? -1 : 1
      if (a.is_rate_limited !== b.is_rate_limited) return a.is_rate_limited ? -1 : 1
      return b.load_percentage - a.load_percentage
    })
  }, [concurrency, availability, groupIdFilter])

  const userRows = useMemo((): UserRow[] => {
    const userStats = userConcurrency?.user || {}
    return Object.keys(userStats)
      .map((uid) => {
        const u = userStats[uid] || {}
        return {
          key: uid,
          user_id: safeNumber(u.user_id),
          user_email: u.user_email || `User ${uid}`,
          username: u.username || '',
          current_in_use: safeNumber(u.current_in_use),
          max_capacity: safeNumber(u.max_capacity),
          waiting_in_queue: safeNumber(u.waiting_in_queue),
          load_percentage: safeNumber(u.load_percentage),
        }
      })
      .sort((a, b) => b.current_in_use - a.current_in_use || b.load_percentage - a.load_percentage)
  }, [userConcurrency])

  const displayRows = useMemo(() => {
    if (displayDimension === 'user') return userRows
    if (displayDimension === 'account') return accountRows
    if (displayDimension === 'group') return groupRows
    return platformRows
  }, [displayDimension, userRows, accountRows, groupRows, platformRows])

  const displayTitle = useMemo(() => {
    if (displayDimension === 'user') return t('admin.ops.concurrency.byUser')
    if (displayDimension === 'account') return t('admin.ops.concurrency.byAccount')
    if (displayDimension === 'group') return t('admin.ops.concurrency.byGroup')
    return t('admin.ops.concurrency.byPlatform')
  }, [displayDimension, t])

  const loadData = useCallback(async () => {
    setLoading(true)
    setErrorMessage('')
    try {
      if (showByUser) {
        const userData = await adminOpsAPI.getUserConcurrencyStats()
        setUserConcurrency(userData)
      } else {
        const [concData, availData] = await Promise.all([
          adminOpsAPI.getConcurrencyStats(platformFilter, groupIdFilter),
          adminOpsAPI.getAccountAvailabilityStats(platformFilter, groupIdFilter),
        ])
        setConcurrency(concData)
        setAvailability(availData)
      }
    } catch (err: unknown) {
      console.error('[OpsConcurrencyCard] Failed to load data', err)
      const detail =
        err &&
        typeof err === 'object' &&
        'response' in err &&
        (err as { response?: { data?: { detail?: string } } }).response?.data?.detail
      setErrorMessage(
        typeof detail === 'string' ? detail : t('admin.ops.concurrency.loadFailed'),
      )
    } finally {
      setLoading(false)
    }
  }, [showByUser, platformFilter, groupIdFilter, t])

  useEffect(() => {
    if (realtimeEnabled) void loadData()
  }, [realtimeEnabled, loadData])

  useEffect(() => {
    if (!realtimeEnabled) return
    void loadData()
  }, [refreshToken, realtimeEnabled, loadData])

  useEffect(() => {
    void loadData()
  }, [showByUser, loadData])

  return (
    <div className="flex h-full flex-col rounded-3xl bg-white p-6 shadow-sm ring-1 ring-gray-900/5 dark:bg-dark-800 dark:ring-dark-700">
      <div className="mb-4 flex shrink-0 items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 text-sm font-bold text-gray-900 dark:text-white">
          <svg className="h-4 w-4 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
          {t('admin.ops.concurrency.title')}
        </h3>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className={`flex items-center justify-center rounded-lg px-2 py-1 transition-colors ${
              showByUser
                ? 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400'
                : 'bg-gray-100 text-gray-500 hover:bg-gray-200 hover:text-gray-700 dark:bg-dark-700 dark:text-gray-400 dark:hover:bg-dark-600 dark:hover:text-gray-300'
            }`}
            title={
              showByUser
                ? t('admin.ops.concurrency.switchToPlatform')
                : t('admin.ops.concurrency.switchToUser')
            }
            onClick={() => setShowByUser((v) => !v)}
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
              />
            </svg>
          </button>
          <button
            type="button"
            className="flex items-center gap-1 rounded-lg bg-gray-100 px-2 py-1 text-[11px] font-semibold text-gray-700 transition-colors hover:bg-gray-200 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-dark-700 dark:text-gray-300 dark:hover:bg-dark-600"
            disabled={loading}
            title={t('common.refresh')}
            onClick={() => void loadData()}
          >
            <svg
              className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
          </button>
        </div>
      </div>

      {errorMessage && (
        <div className="mb-3 shrink-0 rounded-xl bg-red-50 p-2.5 text-xs text-red-600 dark:bg-red-900/20 dark:text-red-400">
          {errorMessage}
        </div>
      )}

      {!realtimeEnabled ? (
        <div className="flex flex-1 items-center justify-center rounded-xl border border-dashed border-gray-200 text-sm text-gray-500 dark:border-dark-700 dark:text-gray-400">
          {t('admin.ops.concurrency.disabledHint')}
        </div>
      ) : (
        <div className="custom-scrollbar flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-gray-200 dark:border-dark-700">
          <div className="flex shrink-0 items-center justify-between border-b border-gray-200 bg-gray-50 px-3 py-2 dark:border-dark-700 dark:bg-dark-900">
            <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
              {displayTitle}
            </span>
            <span className="text-[10px] text-gray-500 dark:text-gray-400">
              {t('admin.ops.concurrency.totalRows', { count: displayRows.length })}
            </span>
          </div>

          {displayRows.length === 0 ? (
            <div className="flex flex-1 items-center justify-center text-sm text-gray-500 dark:text-gray-400">
              {t('admin.ops.concurrency.empty')}
            </div>
          ) : displayDimension === 'user' ? (
            <div className="custom-scrollbar max-h-[360px] flex-1 space-y-2 overflow-y-auto p-3">
              {(displayRows as UserRow[]).map((row) => (
                <div key={row.key} className="rounded-lg bg-gray-50 p-2.5 dark:bg-dark-900">
                  <div className="mb-1.5 flex items-center justify-between gap-2">
                    <div className="flex min-w-0 flex-1 items-center gap-1.5">
                      <span
                        className="truncate text-[11px] font-bold text-gray-900 dark:text-white"
                        title={row.username || row.user_email}
                      >
                        {row.username || row.user_email}
                      </span>
                      {row.username && (
                        <span
                          className="shrink-0 truncate text-[10px] text-gray-400 dark:text-gray-500"
                          title={row.user_email}
                        >
                          {row.user_email}
                        </span>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-2 text-[10px]">
                      <span className="font-mono font-bold text-gray-900 dark:text-white">
                        {row.current_in_use}/{row.max_capacity}
                      </span>
                      <span className={`font-bold ${getLoadTextClass(row.load_percentage)}`}>
                        {Math.round(row.load_percentage)}%
                      </span>
                    </div>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-dark-700">
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${getLoadBarClass(row.load_percentage)}`}
                      style={getLoadBarStyle(row.load_percentage)}
                    />
                  </div>
                  {row.waiting_in_queue > 0 && (
                    <div className="mt-1.5 flex justify-end">
                      <span className="rounded-full bg-purple-100 px-1.5 py-0.5 text-[10px] font-semibold text-purple-700 dark:bg-purple-900/30 dark:text-purple-400">
                        {t('admin.ops.concurrency.queued', { count: row.waiting_in_queue })}
                      </span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : displayDimension === 'platform' || displayDimension === 'group' ? (
            <div className="custom-scrollbar max-h-[360px] flex-1 space-y-2 overflow-y-auto p-3">
              {(displayRows as SummaryRow[]).map((row) => (
                <div key={row.key} className="rounded-lg bg-gray-50 p-3 dark:bg-dark-900">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <div
                        className="truncate text-[11px] font-bold text-gray-900 dark:text-white"
                        title={row.name}
                      >
                        {row.name}
                      </div>
                      {displayDimension === 'group' && row.platform && (
                        <span className="text-[10px] text-gray-400 dark:text-gray-500">
                          {row.platform.toUpperCase()}
                        </span>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-2 text-[10px]">
                      <span className="font-mono font-bold text-gray-900 dark:text-white">
                        {row.used_concurrency}/{row.total_concurrency}
                      </span>
                      <span className={`font-bold ${getLoadTextClass(row.concurrency_percentage)}`}>
                        {row.concurrency_percentage}%
                      </span>
                    </div>
                  </div>
                  <div className="mb-2 h-1.5 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-dark-700">
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${getLoadBarClass(row.concurrency_percentage)}`}
                      style={getLoadBarStyle(row.concurrency_percentage)}
                    />
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px]">
                    <div className="flex items-center gap-1">
                      <svg className="h-3 w-3 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth="2"
                          d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
                        />
                      </svg>
                      <span className="text-gray-600 dark:text-gray-300">
                        <span className="font-bold text-green-600 dark:text-green-400">
                          {row.available_accounts}
                        </span>
                        /{row.total_accounts}
                      </span>
                      <span className="text-gray-400 dark:text-gray-500">{row.availability_percentage}%</span>
                    </div>
                    {row.rate_limited_accounts > 0 && (
                      <span className="rounded-full bg-amber-100 px-1.5 py-0.5 font-semibold text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                        {t('admin.ops.concurrency.rateLimited', { count: row.rate_limited_accounts })}
                      </span>
                    )}
                    {row.error_accounts > 0 && (
                      <span className="rounded-full bg-red-100 px-1.5 py-0.5 font-semibold text-red-700 dark:bg-red-900/30 dark:text-red-400">
                        {t('admin.ops.concurrency.errorAccounts', { count: row.error_accounts })}
                      </span>
                    )}
                    {row.waiting_in_queue > 0 && (
                      <span className="rounded-full bg-purple-100 px-1.5 py-0.5 font-semibold text-purple-700 dark:bg-purple-900/30 dark:text-purple-400">
                        {t('admin.ops.concurrency.queued', { count: row.waiting_in_queue })}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="custom-scrollbar max-h-[360px] flex-1 space-y-2 overflow-y-auto p-3">
              {(displayRows as AccountRow[]).map((row) => (
                <div key={row.key} className="rounded-lg bg-gray-50 p-2.5 dark:bg-dark-900">
                  <div className="mb-1.5 flex items-center justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div
                        className="truncate text-[11px] font-bold text-gray-900 dark:text-white"
                        title={row.name}
                      >
                        {row.name}
                      </div>
                      <div className="mt-0.5 text-[9px] text-gray-400 dark:text-gray-500">{row.group_name}</div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="font-mono text-[11px] font-bold text-gray-900 dark:text-white">
                        {row.current_in_use}/{row.max_capacity}
                      </span>
                      {row.is_available ? (
                        <span className="inline-flex items-center gap-1 rounded bg-green-100 px-1.5 py-0.5 text-[10px] font-medium text-green-700 dark:bg-green-900/30 dark:text-green-400">
                          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                          </svg>
                          {t('admin.ops.accountAvailability.available')}
                        </span>
                      ) : row.is_rate_limited ? (
                        <span className="inline-flex items-center gap-1 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth="2"
                              d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                            />
                          </svg>
                          {formatDuration(row.rate_limit_remaining_sec || 0)}
                        </span>
                      ) : row.is_overloaded ? (
                        <span className="inline-flex items-center gap-1 rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-medium text-red-700 dark:bg-red-900/30 dark:text-red-400">
                          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth="2"
                              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                            />
                          </svg>
                          {formatDuration(row.overload_remaining_sec || 0)}
                        </span>
                      ) : row.has_error ? (
                        <span className="inline-flex items-center gap-1 rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-medium text-red-700 dark:bg-red-900/30 dark:text-red-400">
                          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                          </svg>
                          {t('admin.ops.accountAvailability.accountError')}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-700 dark:bg-gray-800 dark:text-gray-400">
                          {t('admin.ops.accountAvailability.unavailable')}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-dark-700">
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${getLoadBarClass(row.load_percentage)}`}
                      style={getLoadBarStyle(row.load_percentage)}
                    />
                  </div>
                  {row.waiting_in_queue > 0 && (
                    <div className="mt-1.5 flex justify-end">
                      <span className="rounded-full bg-purple-100 px-1.5 py-0.5 text-[10px] font-semibold text-purple-700 dark:bg-purple-900/30 dark:text-purple-400">
                        {t('admin.ops.concurrency.queued', { count: row.waiting_in_queue })}
                      </span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
