'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useI18n } from '@/lib/i18n'
import { adminAccountsAPI } from '@/lib/adminAccounts'
import { buildOpenAIUsageRefreshKey } from '@/lib/accountUsageRefresh'
import { enqueueUsageRequest } from '@/lib/usageLoadQueue'
import { formatCompactNumber } from '@/lib/format'
import type {
  Account,
  AccountUsageInfo,
  AntigravityModelQuota,
  GeminiCredentials,
  WindowStats,
} from '@/lib/types'
import UsageProgressBar from './UsageProgressBar'
import AccountQuotaInfo from './AccountQuotaInfo'

// Module-level cache shared across all AccountUsageCell instances
const _usageCache = new Map<number, { data: AccountUsageInfo; ts: number }>()
const USAGE_CACHE_TTL = 5 * 60 * 1000 // 5 minutes
const DESKTOP_VIEWPORT_QUERY = '(min-width: 768px)'

interface AntigravityUsageResult {
  utilization: number
  resetTime: string | null
}

interface QuotaBarInfo {
  utilization: number
  resetsAt: string | null
}

interface AccountUsageCellProps {
  account: Account
  todayStats?: WindowStats | null
  todayStatsLoading?: boolean
  manualRefreshToken?: number
}

function getAntigravityUsageFromAPI(
  quota: Record<string, AntigravityModelQuota> | null | undefined,
  modelNames: string[],
): AntigravityUsageResult | null {
  if (!quota) return null

  let maxUtilization = 0
  let earliestReset: string | null = null

  for (const model of modelNames) {
    const modelQuota = quota[model]
    if (!modelQuota) continue

    if (modelQuota.utilization > maxUtilization) {
      maxUtilization = modelQuota.utilization
    }
    if (modelQuota.reset_time) {
      if (!earliestReset || modelQuota.reset_time < earliestReset) {
        earliestReset = modelQuota.reset_time
      }
    }
  }

  if (maxUtilization === 0 && earliestReset === null) {
    const hasAnyData = modelNames.some((m) => quota[m])
    if (!hasAnyData) return null
  }

  return {
    utilization: maxUtilization,
    resetTime: earliestReset,
  }
}

function makeQuotaBar(
  account: Account,
  used: number,
  limit: number,
  startKey?: string,
): QuotaBarInfo {
  const utilization = limit > 0 ? (used / limit) * 100 : 0
  let resetsAt: string | null = null
  if (startKey) {
    const extra = account.extra as Record<string, unknown> | undefined
    const isDaily = startKey.includes('daily')
    const mode = isDaily
      ? (extra?.quota_daily_reset_mode as string) || 'rolling'
      : (extra?.quota_weekly_reset_mode as string) || 'rolling'

    if (mode === 'fixed') {
      const resetAtKey = isDaily ? 'quota_daily_reset_at' : 'quota_weekly_reset_at'
      resetsAt = (extra?.[resetAtKey] as string) || null
    } else {
      const startStr = extra?.[startKey] as string | undefined
      if (startStr) {
        const startDate = new Date(startStr)
        const periodMs = isDaily ? 24 * 60 * 60 * 1000 : 7 * 24 * 60 * 60 * 1000
        resetsAt = new Date(startDate.getTime() + periodMs).toISOString()
      }
    }
  }
  return { utilization, resetsAt }
}

function LoadingSkeletonRow() {
  return (
    <div className="flex items-center gap-1">
      <div className="h-3 w-[32px] animate-pulse rounded bg-gray-200 dark:bg-gray-700" />
      <div className="h-1.5 w-8 animate-pulse rounded-full bg-gray-200 dark:bg-gray-700" />
      <div className="h-3 w-[32px] animate-pulse rounded bg-gray-200 dark:bg-gray-700" />
    </div>
  )
}

function ActiveQueryButton({
  loading,
  onClick,
  label,
}: {
  loading: boolean
  onClick: () => void
  label: string
}) {
  return (
    <button
      type="button"
      className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[9px] font-medium text-blue-600 transition-colors hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-900/30"
      disabled={loading}
      onClick={onClick}
    >
      <svg
        className={`h-2.5 w-2.5 ${loading ? 'animate-spin' : ''}`}
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
          d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
        />
      </svg>
      {label}
    </button>
  )
}

function TodayStatsRow({
  formatKeyRequests,
  formatKeyTokens,
  formatKeyCost,
  formatKeyUserCost,
  showUserCost,
  accountBilledTitle,
  userBilledTitle,
}: {
  formatKeyRequests: string
  formatKeyTokens: string
  formatKeyCost: string
  formatKeyUserCost: string
  showUserCost: boolean
  accountBilledTitle: string
  userBilledTitle: string
}) {
  return (
    <div className="mb-0.5 flex items-center">
      <div className="flex items-center gap-1.5 text-[9px] text-gray-500 dark:text-gray-400">
        <span className="rounded bg-gray-100 px-1.5 py-0.5 dark:bg-gray-800">
          {formatKeyRequests} req
        </span>
        <span className="rounded bg-gray-100 px-1.5 py-0.5 dark:bg-gray-800">
          {formatKeyTokens}
        </span>
        <span
          className="rounded bg-gray-100 px-1.5 py-0.5 dark:bg-gray-800"
          title={accountBilledTitle}
        >
          A ${formatKeyCost}
        </span>
        {showUserCost ? (
          <span
            className="rounded bg-gray-100 px-1.5 py-0.5 dark:bg-gray-800"
            title={userBilledTitle}
          >
            U ${formatKeyUserCost}
          </span>
        ) : null}
      </div>
    </div>
  )
}

function TodayStatsLoadingSkeleton() {
  return (
    <div className="mb-0.5 flex items-center gap-1">
      <div className="h-3 w-10 animate-pulse rounded bg-gray-200 dark:bg-gray-700" />
      <div className="h-3 w-8 animate-pulse rounded bg-gray-200 dark:bg-gray-700" />
      <div className="h-3 w-12 animate-pulse rounded bg-gray-200 dark:bg-gray-700" />
    </div>
  )
}

export default function AccountUsageCell({
  account,
  todayStats = null,
  todayStatsLoading = false,
  manualRefreshToken = 0,
}: AccountUsageCellProps) {
  const { t } = useI18n()

  const unmountedRef = useRef(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const visibilityObserverRef = useRef<IntersectionObserver | null>(null)
  const pendingAutoLoadRef = useRef(false)
  const pendingAutoLoadSourceRef = useRef<'passive' | 'active' | undefined>(undefined)
  const prevOpenAIRefreshKeyRef = useRef<string | undefined>(undefined)
  const prevManualRefreshTokenRef = useRef(manualRefreshToken)

  const [loading, setLoading] = useState(false)
  const [activeQueryLoading, setActiveQueryLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [usageInfo, setUsageInfo] = useState<AccountUsageInfo | null>(null)
  const [isDesktopViewport, setIsDesktopViewport] = useState(
    typeof window === 'undefined' ? true : window.matchMedia(DESKTOP_VIEWPORT_QUERY).matches,
  )
  const [hasEnteredViewport, setHasEnteredViewport] = useState(false)
  const [linkCopied, setLinkCopied] = useState(false)

  const showUsageWindows = useMemo(() => {
    if (account.platform === 'gemini') return true
    return account.type === 'oauth' || account.type === 'setup-token'
  }, [account.platform, account.type])

  const shouldFetchUsage = useMemo(() => {
    if (account.platform === 'anthropic') {
      return account.type === 'oauth' || account.type === 'setup-token'
    }
    if (account.platform === 'gemini') return true
    if (account.platform === 'antigravity') return account.type === 'oauth'
    if (account.platform === 'openai') return account.type === 'oauth'
    return false
  }, [account.platform, account.type])

  const showGeminiTodayStats = useMemo(() => {
    return account.platform === 'gemini' && account.type === 'service_account'
  }, [account.platform, account.type])

  const geminiUsageAvailable = useMemo(() => {
    return (
      !!usageInfo?.gemini_shared_daily ||
      !!usageInfo?.gemini_pro_daily ||
      !!usageInfo?.gemini_flash_daily ||
      !!usageInfo?.gemini_shared_minute ||
      !!usageInfo?.gemini_pro_minute ||
      !!usageInfo?.gemini_flash_minute
    )
  }, [usageInfo])

  const hasOpenAIUsageFallback = useMemo(() => {
    if (account.platform !== 'openai' || account.type !== 'oauth') return false
    return !!usageInfo?.five_hour || !!usageInfo?.seven_day
  }, [account.platform, account.type, usageInfo])

  const openAIUsageRefreshKey = useMemo(() => buildOpenAIUsageRefreshKey(account), [account])

  const shouldAutoLoadUsageOnMount = shouldFetchUsage

  const shouldLazyLoadOnMobile = shouldFetchUsage && !isDesktopViewport

  const hasAntigravityQuotaFromAPI = useMemo(() => {
    return (
      !!usageInfo?.antigravity_quota && Object.keys(usageInfo.antigravity_quota).length > 0
    )
  }, [usageInfo?.antigravity_quota])

  const antigravity3ProUsageFromAPI = useMemo(
    () =>
      getAntigravityUsageFromAPI(usageInfo?.antigravity_quota, [
        'gemini-3-pro-low',
        'gemini-3-pro-high',
        'gemini-3-pro-preview',
      ]),
    [usageInfo?.antigravity_quota],
  )

  const antigravity3FlashUsageFromAPI = useMemo(
    () => getAntigravityUsageFromAPI(usageInfo?.antigravity_quota, ['gemini-3-flash']),
    [usageInfo?.antigravity_quota],
  )

  const antigravity3ImageUsageFromAPI = useMemo(
    () =>
      getAntigravityUsageFromAPI(usageInfo?.antigravity_quota, [
        'gemini-2.5-flash-image',
        'gemini-3.1-flash-image',
        'gemini-3-pro-image',
      ]),
    [usageInfo?.antigravity_quota],
  )

  const antigravityClaudeUsageFromAPI = useMemo(
    () =>
      getAntigravityUsageFromAPI(usageInfo?.antigravity_quota, [
        'claude-sonnet-4-5',
        'claude-opus-4-5-thinking',
        'claude-sonnet-4-6',
        'claude-opus-4-6',
        'claude-opus-4-6-thinking',
        'claude-opus-4-7',
        'claude-opus-4-8',
      ]),
    [usageInfo?.antigravity_quota],
  )

  const aiCreditsDisplay = useMemo(() => {
    const credits = usageInfo?.ai_credits
    if (!credits || credits.length === 0) return null
    const total = credits.reduce((sum, credit) => sum + (credit.amount ?? 0), 0)
    if (total <= 0) return null
    return total.toFixed(0)
  }, [usageInfo?.ai_credits])

  const antigravityTier = useMemo(() => {
    const extra = account.extra as Record<string, unknown> | undefined
    if (!extra) return null

    const loadCodeAssist = extra.load_code_assist as Record<string, unknown> | undefined
    if (!loadCodeAssist) return null

    const paidTier = loadCodeAssist.paidTier as Record<string, unknown> | undefined
    if (paidTier && typeof paidTier.id === 'string') {
      return paidTier.id
    }

    const currentTier = loadCodeAssist.currentTier as Record<string, unknown> | undefined
    if (currentTier && typeof currentTier.id === 'string') {
      return currentTier.id
    }

    return null
  }, [account.extra])

  const geminiTier = useMemo(() => {
    if (account.platform !== 'gemini') return null
    const creds = account.credentials as GeminiCredentials | undefined
    return creds?.tier_id || null
  }, [account.platform, account.credentials])

  const geminiOAuthType = useMemo(() => {
    if (account.platform !== 'gemini') return null
    const creds = account.credentials as GeminiCredentials | undefined
    return (creds?.oauth_type || '').trim() || null
  }, [account.platform, account.credentials])

  const isGeminiCodeAssist = useMemo(() => {
    if (account.platform !== 'gemini') return false
    const creds = account.credentials as GeminiCredentials | undefined
    return creds?.oauth_type === 'code_assist' || (!creds?.oauth_type && !!creds?.project_id)
  }, [account.platform, account.credentials])

  const geminiChannelShort = useMemo((): 'ai studio' | 'gcp' | 'google one' | 'client' | null => {
    if (account.platform !== 'gemini') return null
    if (account.type === 'apikey') return 'ai studio'
    if (geminiOAuthType === 'google_one') return 'google one'
    if (isGeminiCodeAssist) return 'gcp'
    if (geminiOAuthType === 'ai_studio') return 'client'
    return 'ai studio'
  }, [account.platform, account.type, geminiOAuthType, isGeminiCodeAssist])

  const geminiUserLevel = useMemo((): string | null => {
    if (account.platform !== 'gemini') return null

    const tier = (geminiTier || '').toString().trim()
    const tierLower = tier.toLowerCase()
    const tierUpper = tier.toUpperCase()

    if (geminiOAuthType === 'google_one') {
      if (tierLower === 'google_one_free') return 'free'
      if (tierLower === 'google_ai_pro') return 'pro'
      if (tierLower === 'google_ai_ultra') return 'ultra'
      if (tierUpper === 'AI_PREMIUM' || tierUpper === 'GOOGLE_ONE_STANDARD') return 'pro'
      if (tierUpper === 'GOOGLE_ONE_UNLIMITED') return 'ultra'
      if (
        tierUpper === 'FREE' ||
        tierUpper === 'GOOGLE_ONE_BASIC' ||
        tierUpper === 'GOOGLE_ONE_UNKNOWN' ||
        tierUpper === ''
      ) {
        return 'free'
      }
      return null
    }

    if (isGeminiCodeAssist) {
      if (tierLower === 'gcp_enterprise') return 'enterprise'
      if (tierLower === 'gcp_standard') return 'standard'
      if (tierUpper.includes('ULTRA') || tierUpper.includes('ENTERPRISE')) return 'enterprise'
      return 'standard'
    }

    if (account.type === 'apikey' || geminiOAuthType === 'ai_studio') {
      if (tierLower === 'aistudio_paid') return 'paid'
      if (tierLower === 'aistudio_free') return 'free'
      if (tierUpper.includes('PAID') || tierUpper.includes('PAYG') || tierUpper.includes('PAY')) {
        return 'paid'
      }
      if (tierUpper.includes('FREE')) return 'free'
      if (account.type === 'apikey') return 'free'
      return null
    }

    return null
  }, [account.platform, account.type, geminiTier, geminiOAuthType, isGeminiCodeAssist])

  const geminiAuthTypeLabel = useMemo(() => {
    if (account.platform !== 'gemini') return null
    if (!geminiChannelShort) return null
    return geminiUserLevel ? `${geminiChannelShort} ${geminiUserLevel}` : geminiChannelShort
  }, [account.platform, geminiChannelShort, geminiUserLevel])

  const geminiTierClass = useMemo(() => {
    const channel = geminiChannelShort
    const level = geminiUserLevel

    if (channel === 'client' || channel === 'ai studio') {
      return 'bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-300'
    }

    if (channel === 'google one') {
      if (level === 'ultra') {
        return 'bg-purple-100 text-purple-600 dark:bg-purple-900/40 dark:text-purple-300'
      }
      if (level === 'pro') {
        return 'bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-300'
      }
      return 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'
    }

    if (channel === 'gcp') {
      if (level === 'enterprise') {
        return 'bg-purple-100 text-purple-600 dark:bg-purple-900/40 dark:text-purple-300'
      }
      return 'bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-300'
    }

    return ''
  }, [geminiChannelShort, geminiUserLevel])

  const geminiQuotaPolicyChannel = useMemo(() => {
    if (geminiOAuthType === 'google_one') {
      return t('admin.accounts.gemini.quotaPolicy.rows.googleOne.channel')
    }
    if (isGeminiCodeAssist) {
      return t('admin.accounts.gemini.quotaPolicy.rows.gcp.channel')
    }
    return t('admin.accounts.gemini.quotaPolicy.rows.aiStudio.channel')
  }, [geminiOAuthType, isGeminiCodeAssist, t])

  const geminiQuotaPolicyLimits = useMemo(() => {
    const tierLower = (geminiTier || '').toString().trim().toLowerCase()

    if (geminiOAuthType === 'google_one') {
      if (tierLower === 'google_ai_ultra' || geminiUserLevel === 'ultra') {
        return t('admin.accounts.gemini.quotaPolicy.rows.googleOne.limitsUltra')
      }
      if (tierLower === 'google_ai_pro' || geminiUserLevel === 'pro') {
        return t('admin.accounts.gemini.quotaPolicy.rows.googleOne.limitsPro')
      }
      return t('admin.accounts.gemini.quotaPolicy.rows.googleOne.limitsFree')
    }

    if (isGeminiCodeAssist) {
      if (tierLower === 'gcp_enterprise' || geminiUserLevel === 'enterprise') {
        return t('admin.accounts.gemini.quotaPolicy.rows.gcp.limitsEnterprise')
      }
      return t('admin.accounts.gemini.quotaPolicy.rows.gcp.limitsStandard')
    }

    if (tierLower === 'aistudio_paid' || geminiUserLevel === 'paid') {
      return t('admin.accounts.gemini.quotaPolicy.rows.aiStudio.limitsPaid')
    }
    return t('admin.accounts.gemini.quotaPolicy.rows.aiStudio.limitsFree')
  }, [geminiTier, geminiOAuthType, geminiUserLevel, isGeminiCodeAssist, t])

  const geminiQuotaPolicyDocsUrl = useMemo(() => {
    if (geminiOAuthType === 'google_one' || isGeminiCodeAssist) {
      return 'https://developers.google.com/gemini-code-assist/resources/quotas'
    }
    return 'https://ai.google.dev/pricing'
  }, [geminiOAuthType, isGeminiCodeAssist])

  const geminiUsesSharedDaily = useMemo(() => {
    if (account.platform !== 'gemini') return false
    return (
      !!usageInfo?.gemini_shared_daily ||
      !!usageInfo?.gemini_shared_minute ||
      geminiOAuthType === 'google_one' ||
      isGeminiCodeAssist
    )
  }, [account.platform, usageInfo, geminiOAuthType, isGeminiCodeAssist])

  const geminiUsageBars = useMemo(() => {
    if (account.platform !== 'gemini' || !usageInfo) return []

    const bars: Array<{
      key: string
      label: string
      utilization: number
      resetsAt: string | null
      windowStats?: WindowStats | null
      color: 'indigo' | 'emerald'
    }> = []

    if (geminiUsesSharedDaily) {
      const sharedDaily = usageInfo.gemini_shared_daily
      if (sharedDaily) {
        bars.push({
          key: 'shared_daily',
          label: '1d',
          utilization: sharedDaily.utilization,
          resetsAt: sharedDaily.resets_at,
          windowStats: sharedDaily.window_stats,
          color: 'indigo',
        })
      }
      return bars
    }

    const pro = usageInfo.gemini_pro_daily
    if (pro) {
      bars.push({
        key: 'pro_daily',
        label: 'pro',
        utilization: pro.utilization,
        resetsAt: pro.resets_at,
        windowStats: pro.window_stats,
        color: 'indigo',
      })
    }

    const flash = usageInfo.gemini_flash_daily
    if (flash) {
      bars.push({
        key: 'flash_daily',
        label: 'flash',
        utilization: flash.utilization,
        resetsAt: flash.resets_at,
        windowStats: flash.window_stats,
        color: 'emerald',
      })
    }

    return bars
  }, [account.platform, usageInfo, geminiUsesSharedDaily])

  const antigravityTierLabel = useMemo(() => {
    switch (antigravityTier) {
      case 'free-tier':
        return t('admin.accounts.tier.free')
      case 'g1-pro-tier':
        return t('admin.accounts.tier.pro')
      case 'g1-ultra-tier':
        return t('admin.accounts.tier.ultra')
      default:
        return null
    }
  }, [antigravityTier, t])

  const antigravityTierClass = useMemo(() => {
    switch (antigravityTier) {
      case 'free-tier':
        return 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'
      case 'g1-pro-tier':
        return 'bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-300'
      case 'g1-ultra-tier':
        return 'bg-purple-100 text-purple-600 dark:bg-purple-900/40 dark:text-purple-300'
      default:
        return ''
    }
  }, [antigravityTier])

  const hasIneligibleTiers = useMemo(() => {
    const extra = account.extra as Record<string, unknown> | undefined
    if (!extra) return false

    const loadCodeAssist = extra.load_code_assist as Record<string, unknown> | undefined
    if (!loadCodeAssist) return false

    const ineligibleTiers = loadCodeAssist.ineligibleTiers as unknown[] | undefined
    return Array.isArray(ineligibleTiers) && ineligibleTiers.length > 0
  }, [account.extra])

  const isForbidden = !!usageInfo?.is_forbidden
  const forbiddenType = usageInfo?.forbidden_type || 'forbidden'
  const validationURL = usageInfo?.validation_url || ''
  const needsReauth = !!usageInfo?.needs_reauth

  const usageErrorLabel = useMemo(() => {
    const code = usageInfo?.error_code
    if (code === 'rate_limited') return t('admin.accounts.rateLimited')
    return t('admin.accounts.usageError')
  }, [usageInfo?.error_code, t])

  const forbiddenLabel = useMemo(() => {
    switch (forbiddenType) {
      case 'validation':
        return t('admin.accounts.forbiddenValidation')
      case 'violation':
        return t('admin.accounts.forbiddenViolation')
      default:
        return t('admin.accounts.forbidden')
    }
  }, [forbiddenType, t])

  const forbiddenBadgeClass = useMemo(() => {
    if (forbiddenType === 'validation') {
      return 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300'
    }
    return 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
  }, [forbiddenType])

  const isAnthropicOAuthOrSetupToken =
    account.platform === 'anthropic' &&
    (account.type === 'oauth' || account.type === 'setup-token')

  const hasApiKeyQuota = useMemo(() => {
    if (account.type !== 'apikey' && account.type !== 'bedrock') return false
    return (
      (account.quota_daily_limit ?? 0) > 0 ||
      (account.quota_weekly_limit ?? 0) > 0 ||
      (account.quota_limit ?? 0) > 0
    )
  }, [account.type, account.quota_daily_limit, account.quota_weekly_limit, account.quota_limit])

  const quotaDailyBar = useMemo((): QuotaBarInfo | null => {
    const limit = account.quota_daily_limit ?? 0
    if (limit <= 0) return null
    return makeQuotaBar(account, account.quota_daily_used ?? 0, limit, 'quota_daily_start')
  }, [account])

  const quotaWeeklyBar = useMemo((): QuotaBarInfo | null => {
    const limit = account.quota_weekly_limit ?? 0
    if (limit <= 0) return null
    return makeQuotaBar(account, account.quota_weekly_used ?? 0, limit, 'quota_weekly_start')
  }, [account])

  const quotaTotalBar = useMemo((): QuotaBarInfo | null => {
    const limit = account.quota_limit ?? 0
    if (limit <= 0) return null
    return makeQuotaBar(account, account.quota_used ?? 0, limit)
  }, [account])

  const formatKeyRequests = useMemo(() => {
    if (!todayStats) return ''
    return formatCompactNumber(todayStats.requests, { allowBillions: false })
  }, [todayStats])

  const formatKeyTokens = useMemo(() => {
    if (!todayStats) return ''
    return formatCompactNumber(todayStats.tokens)
  }, [todayStats])

  const formatKeyCost = useMemo(() => {
    if (!todayStats) return '0.00'
    return todayStats.cost.toFixed(2)
  }, [todayStats])

  const formatKeyUserCost = useMemo(() => {
    if (!todayStats || todayStats.user_cost == null) return '0.00'
    return todayStats.user_cost.toFixed(2)
  }, [todayStats])

  const loadUsage = useCallback(
    async (options?: { source?: 'passive' | 'active'; bypassCache?: boolean }) => {
      if (!shouldFetchUsage) return

      if (!options?.bypassCache) {
        const cached = _usageCache.get(account.id)
        if (cached && Date.now() - cached.ts < USAGE_CACHE_TTL) {
          setUsageInfo(cached.data)
          setLoading(false)
          return
        }
      }

      setLoading(true)
      setError(null)

      try {
        const fetchFn = () => adminAccountsAPI.getUsage(account.id, options?.source)
        const result = await enqueueUsageRequest(account, fetchFn)
        if (!unmountedRef.current) {
          setUsageInfo(result)
          _usageCache.set(account.id, { data: result, ts: Date.now() })
        }
      } catch (e) {
        if (!unmountedRef.current) {
          setError(t('common.error'))
          console.error('Failed to load usage:', e)
        }
      } finally {
        if (!unmountedRef.current) setLoading(false)
      }
    },
    [account, shouldFetchUsage, t],
  )

  const flushPendingAutoLoad = useCallback(() => {
    if (!pendingAutoLoadRef.current) return
    const source = pendingAutoLoadSourceRef.current
    pendingAutoLoadRef.current = false
    pendingAutoLoadSourceRef.current = undefined
    loadUsage({ source }).catch((e) => {
      console.error('Failed to load deferred usage:', e)
    })
  }, [loadUsage])

  const requestAutoLoad = useCallback(
    (source?: 'passive' | 'active') => {
      if (!shouldFetchUsage) return
      if (shouldLazyLoadOnMobile && !hasEnteredViewport) {
        pendingAutoLoadRef.current = true
        pendingAutoLoadSourceRef.current = source
        return
      }
      loadUsage({ source }).catch((e) => {
        console.error('Failed to auto load usage:', e)
      })
    },
    [shouldFetchUsage, shouldLazyLoadOnMobile, hasEnteredViewport, loadUsage],
  )

  const detachVisibilityObserver = useCallback(() => {
    visibilityObserverRef.current?.disconnect()
    visibilityObserverRef.current = null
  }, [])

  const attachVisibilityObserver = useCallback(() => {
    detachVisibilityObserver()
    if (!shouldLazyLoadOnMobile || hasEnteredViewport) return
    if (typeof window === 'undefined' || typeof IntersectionObserver === 'undefined') {
      setHasEnteredViewport(true)
      flushPendingAutoLoad()
      return
    }
    const el = rootRef.current
    if (!el) return

    visibilityObserverRef.current = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return
        setHasEnteredViewport(true)
        detachVisibilityObserver()
        flushPendingAutoLoad()
      },
      {
        root: null,
        rootMargin: '200px 0px',
        threshold: 0.01,
      },
    )
    visibilityObserverRef.current.observe(el)
  }, [
    shouldLazyLoadOnMobile,
    hasEnteredViewport,
    detachVisibilityObserver,
    flushPendingAutoLoad,
  ])

  const loadActiveUsage = useCallback(async () => {
    setActiveQueryLoading(true)
    try {
      const result = await adminAccountsAPI.getUsage(account.id, 'active', true)
      setUsageInfo(result)
    } catch (e) {
      console.error('Failed to load active usage:', e)
    } finally {
      setActiveQueryLoading(false)
    }
  }, [account.id])

  const copyValidationURL = useCallback(async () => {
    if (!validationURL) return
    try {
      await navigator.clipboard.writeText(validationURL)
      setLinkCopied(true)
      setTimeout(() => setLinkCopied(false), 2000)
    } catch {
      // fallback: ignore
    }
  }, [validationURL])

  useEffect(() => {
    unmountedRef.current = false
    return () => {
      unmountedRef.current = true
      detachVisibilityObserver()
    }
  }, [detachVisibilityObserver])

  useEffect(() => {
    if (typeof window === 'undefined') return

    const mql = window.matchMedia(DESKTOP_VIEWPORT_QUERY)
    setIsDesktopViewport(mql.matches)

    const listener = (event: MediaQueryListEvent) => {
      setIsDesktopViewport(event.matches)
    }

    if (typeof mql.addEventListener === 'function') {
      mql.addEventListener('change', listener)
    } else {
      mql.addListener(listener)
    }

    if (shouldAutoLoadUsageOnMount) {
      const source = isAnthropicOAuthOrSetupToken ? 'passive' : undefined
      requestAutoLoad(source)
    }

    return () => {
      if (typeof mql.removeEventListener === 'function') {
        mql.removeEventListener('change', listener)
      } else {
        mql.removeListener(listener)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const prevKey = prevOpenAIRefreshKeyRef.current
    const nextKey = openAIUsageRefreshKey
    prevOpenAIRefreshKeyRef.current = nextKey

    if (!prevKey || nextKey === prevKey) return
    if (account.platform !== 'openai' || account.type !== 'oauth') return

    requestAutoLoad()
  }, [openAIUsageRefreshKey, account.platform, account.type, requestAutoLoad])

  useEffect(() => {
    const prevToken = prevManualRefreshTokenRef.current
    const nextToken = manualRefreshToken
    prevManualRefreshTokenRef.current = nextToken

    if (nextToken === prevToken) return
    if (!shouldFetchUsage) return

    const source = isAnthropicOAuthOrSetupToken ? 'passive' : undefined
    _usageCache.delete(account.id)
    loadUsage({ source, bypassCache: true }).catch((e) => {
      console.error('Failed to refresh usage after manual refresh:', e)
    })
  }, [
    manualRefreshToken,
    shouldFetchUsage,
    isAnthropicOAuthOrSetupToken,
    account.id,
    loadUsage,
  ])

  useEffect(() => {
    if (shouldLazyLoadOnMobile) {
      attachVisibilityObserver()
      return
    }
    detachVisibilityObserver()
  }, [shouldLazyLoadOnMobile, attachVisibilityObserver, detachVisibilityObserver])

  useEffect(() => {
    if (isDesktopViewport) {
      detachVisibilityObserver()
      setHasEnteredViewport(true)
      flushPendingAutoLoad()
      return
    }
    setHasEnteredViewport(false)
    attachVisibilityObserver()
  }, [
    isDesktopViewport,
    detachVisibilityObserver,
    flushPendingAutoLoad,
    attachVisibilityObserver,
  ])

  const activeQueryLabel = t('admin.accounts.usageWindow.activeQuery')
  const passiveSampledLabel = t('admin.accounts.usageWindow.passiveSampled')
  const accountBilledTitle = t('usage.accountBilled')
  const userBilledTitle = t('usage.userBilled')

  const renderAnthropicSection = () => (
    <>
      {loading ? (
        <div className="space-y-1.5">
          <LoadingSkeletonRow />
          {account.type === 'oauth' ? (
            <>
              <LoadingSkeletonRow />
              <LoadingSkeletonRow />
            </>
          ) : null}
        </div>
      ) : error ? (
        <div className="text-xs text-red-500">{error}</div>
      ) : usageInfo ? (
        <div className="space-y-1">
          {usageInfo.error ? (
            <div
              className="max-w-[200px] truncate text-xs text-amber-600 dark:text-amber-400"
              title={usageInfo.error}
            >
              {usageInfo.error}
            </div>
          ) : null}

          {usageInfo.five_hour ? (
            <UsageProgressBar
              label="5h"
              utilization={usageInfo.five_hour.utilization}
              resetsAt={usageInfo.five_hour.resets_at}
              windowStats={usageInfo.five_hour.window_stats}
              color="indigo"
            />
          ) : null}

          {usageInfo.seven_day ? (
            <UsageProgressBar
              label="7d"
              utilization={usageInfo.seven_day.utilization}
              resetsAt={usageInfo.seven_day.resets_at}
              color="emerald"
            />
          ) : null}

          {usageInfo.seven_day_sonnet ? (
            <UsageProgressBar
              label="7d S"
              utilization={usageInfo.seven_day_sonnet.utilization}
              resetsAt={usageInfo.seven_day_sonnet.resets_at}
              color="purple"
            />
          ) : null}

          <div className="mt-0.5 flex items-center gap-1.5">
            {usageInfo.source === 'passive' ? (
              <span className="text-[9px] italic text-gray-400 dark:text-gray-500">
                {passiveSampledLabel}
              </span>
            ) : null}
            <ActiveQueryButton
              loading={activeQueryLoading}
              onClick={loadActiveUsage}
              label={activeQueryLabel}
            />
          </div>
        </div>
      ) : (
        <div className="text-xs text-gray-400">-</div>
      )}
    </>
  )

  const renderOpenAISection = () => {
    if (hasOpenAIUsageFallback) {
      return (
        <div className="space-y-1">
          {usageInfo?.five_hour ? (
            <UsageProgressBar
              label="5h"
              utilization={usageInfo.five_hour.utilization}
              resetsAt={usageInfo.five_hour.resets_at}
              windowStats={usageInfo.five_hour.window_stats}
              showNowWhenIdle
              color="indigo"
            />
          ) : null}
          {usageInfo?.seven_day ? (
            <UsageProgressBar
              label="7d"
              utilization={usageInfo.seven_day.utilization}
              resetsAt={usageInfo.seven_day.resets_at}
              windowStats={usageInfo.seven_day.window_stats}
              showNowWhenIdle
              color="emerald"
            />
          ) : null}
          <div className="mt-0.5 flex items-center gap-1.5">
            <ActiveQueryButton
              loading={activeQueryLoading}
              onClick={loadActiveUsage}
              label={activeQueryLabel}
            />
          </div>
        </div>
      )
    }

    if (loading) {
      return (
        <div className="space-y-1.5">
          <LoadingSkeletonRow />
          <LoadingSkeletonRow />
        </div>
      )
    }

    return <div className="text-xs text-gray-400">-</div>
  }

  const renderAntigravitySection = () => (
    <>
      {antigravityTierLabel ? (
        <div className="mb-1 flex items-center gap-1">
          <span
            className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-medium ${antigravityTierClass}`}
          >
            {antigravityTierLabel}
          </span>
          {hasIneligibleTiers ? (
            <span className="group relative cursor-help">
              <svg className="h-3.5 w-3.5 text-red-500" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
                  clipRule="evenodd"
                />
              </svg>
              <span className="pointer-events-none absolute left-0 top-full z-50 mt-1 w-80 whitespace-normal break-words rounded bg-gray-900 px-3 py-2 text-xs leading-relaxed text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100 dark:bg-gray-700">
                {t('admin.accounts.ineligibleWarning')}
              </span>
            </span>
          ) : null}
        </div>
      ) : null}

      {isForbidden ? (
        <div className="space-y-1">
          <span
            className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-medium ${forbiddenBadgeClass}`}
          >
            {forbiddenLabel}
          </span>
          {validationURL ? (
            <div className="flex items-center gap-1">
              <a
                href={validationURL}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[10px] text-blue-600 hover:text-blue-800 hover:underline dark:text-blue-400 dark:hover:text-blue-300"
                title={t('admin.accounts.openVerification')}
              >
                {t('admin.accounts.openVerification')}
              </a>
              <button
                type="button"
                className="text-[10px] text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                title={t('admin.accounts.copyLink')}
                onClick={copyValidationURL}
              >
                {linkCopied ? t('admin.accounts.linkCopied') : t('admin.accounts.copyLink')}
              </button>
            </div>
          ) : null}
        </div>
      ) : needsReauth ? (
        <div className="space-y-1">
          <span className="inline-block rounded bg-orange-100 px-1.5 py-0.5 text-[10px] font-medium text-orange-700 dark:bg-orange-900/40 dark:text-orange-300">
            {t('admin.accounts.needsReauth')}
          </span>
        </div>
      ) : usageInfo?.error ? (
        <div className="space-y-1">
          <span className="inline-block rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
            {usageErrorLabel}
          </span>
        </div>
      ) : loading ? (
        <div className="space-y-1.5">
          <LoadingSkeletonRow />
        </div>
      ) : error ? (
        <div className="text-xs text-red-500">{error}</div>
      ) : hasAntigravityQuotaFromAPI ? (
        <div className="space-y-1">
          {antigravity3ProUsageFromAPI ? (
            <UsageProgressBar
              label={t('admin.accounts.usageWindow.gemini3Pro')}
              utilization={antigravity3ProUsageFromAPI.utilization}
              resetsAt={antigravity3ProUsageFromAPI.resetTime}
              color="indigo"
            />
          ) : null}
          {antigravity3FlashUsageFromAPI ? (
            <UsageProgressBar
              label={t('admin.accounts.usageWindow.gemini3Flash')}
              utilization={antigravity3FlashUsageFromAPI.utilization}
              resetsAt={antigravity3FlashUsageFromAPI.resetTime}
              color="emerald"
            />
          ) : null}
          {antigravity3ImageUsageFromAPI ? (
            <UsageProgressBar
              label={t('admin.accounts.usageWindow.gemini3Image')}
              utilization={antigravity3ImageUsageFromAPI.utilization}
              resetsAt={antigravity3ImageUsageFromAPI.resetTime}
              color="purple"
            />
          ) : null}
          {antigravityClaudeUsageFromAPI ? (
            <UsageProgressBar
              label={t('admin.accounts.usageWindow.claude')}
              utilization={antigravityClaudeUsageFromAPI.utilization}
              resetsAt={antigravityClaudeUsageFromAPI.resetTime}
              color="amber"
            />
          ) : null}
          {aiCreditsDisplay ? (
            <div className="mt-1 text-[10px] text-gray-500 dark:text-gray-400">
              💳 {t('admin.accounts.aiCreditsBalance')}: {aiCreditsDisplay}
            </div>
          ) : null}
        </div>
      ) : aiCreditsDisplay ? (
        <div className="text-[10px] text-gray-500 dark:text-gray-400">
          💳 {t('admin.accounts.aiCreditsBalance')}: {aiCreditsDisplay}
        </div>
      ) : (
        <div className="text-xs text-gray-400">-</div>
      )}
    </>
  )

  const renderGeminiSection = () => (
    <>
      {geminiAuthTypeLabel ? (
        <div className="mb-1 flex items-center gap-1">
          <span
            className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-medium ${geminiTierClass}`}
          >
            {geminiAuthTypeLabel}
          </span>
          <span className="group relative cursor-help">
            <svg
              className="h-3.5 w-3.5 text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300"
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path
                fillRule="evenodd"
                d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-3a1 1 0 00-.867.5 1 1 0 11-1.731-1A3 3 0 0113 8a3.001 3.001 0 01-2 2.83V11a1 1 0 11-2 0v-1a1 1 0 011-1 1 1 0 100-2zm0 8a1 1 0 100-2 1 1 0 000 2z"
                clipRule="evenodd"
              />
            </svg>
            <span className="pointer-events-none absolute left-0 top-full z-50 mt-1 w-80 whitespace-normal break-words rounded bg-gray-900 px-3 py-2 text-xs leading-relaxed text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100 dark:bg-gray-700">
              <div className="mb-1 font-semibold">{t('admin.accounts.gemini.quotaPolicy.title')}</div>
              <div className="mb-2 text-gray-300">{t('admin.accounts.gemini.quotaPolicy.note')}</div>
              <div className="space-y-1">
                <div>
                  <strong>{geminiQuotaPolicyChannel}:</strong>
                </div>
                <div className="pl-2">• {geminiQuotaPolicyLimits}</div>
                <div className="mt-2">
                  <a
                    href={geminiQuotaPolicyDocsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-400 underline hover:text-blue-300"
                  >
                    {t('admin.accounts.gemini.quotaPolicy.columns.docs')} →
                  </a>
                </div>
              </div>
            </span>
          </span>
        </div>
      ) : null}

      <div className="space-y-1">
        {showGeminiTodayStats && todayStats ? (
          <TodayStatsRow
            formatKeyRequests={formatKeyRequests}
            formatKeyTokens={formatKeyTokens}
            formatKeyCost={formatKeyCost}
            formatKeyUserCost={formatKeyUserCost}
            showUserCost={todayStats.user_cost != null}
            accountBilledTitle={accountBilledTitle}
            userBilledTitle={userBilledTitle}
          />
        ) : showGeminiTodayStats && todayStatsLoading ? (
          <TodayStatsLoadingSkeleton />
        ) : null}

        {loading ? (
          <div className="space-y-1">
            <LoadingSkeletonRow />
          </div>
        ) : error ? (
          <div className="text-xs text-red-500">{error}</div>
        ) : geminiUsageAvailable ? (
          <div className="space-y-1">
            {geminiUsageBars.map((bar) => (
              <UsageProgressBar
                key={bar.key}
                label={bar.label}
                utilization={bar.utilization}
                resetsAt={bar.resetsAt}
                windowStats={bar.windowStats}
                color={bar.color}
              />
            ))}
            <p className="mt-1 text-[9px] leading-tight italic text-gray-400 dark:text-gray-500">
              * {t('admin.accounts.gemini.quotaPolicy.simulatedNote') || 'Simulated quota'}
            </p>
          </div>
        ) : (
          <div className="text-xs text-gray-400">
            {t('admin.accounts.gemini.rateLimit.unlimited')}
          </div>
        )}
      </div>
    </>
  )

  const renderNonOAuthSection = () => {
    if (account.platform === 'gemini') {
      return <AccountQuotaInfo account={account} />
    }

    return (
      <div className="space-y-1">
        {todayStats ? (
          <TodayStatsRow
            formatKeyRequests={formatKeyRequests}
            formatKeyTokens={formatKeyTokens}
            formatKeyCost={formatKeyCost}
            formatKeyUserCost={formatKeyUserCost}
            showUserCost={todayStats.user_cost != null}
            accountBilledTitle={accountBilledTitle}
            userBilledTitle={userBilledTitle}
          />
        ) : todayStatsLoading ? (
          <TodayStatsLoadingSkeleton />
        ) : null}

        {quotaDailyBar ? (
          <UsageProgressBar
            label="1d"
            utilization={quotaDailyBar.utilization}
            resetsAt={quotaDailyBar.resetsAt}
            color="indigo"
          />
        ) : null}
        {quotaWeeklyBar ? (
          <UsageProgressBar
            label="7d"
            utilization={quotaWeeklyBar.utilization}
            resetsAt={quotaWeeklyBar.resetsAt}
            color="emerald"
          />
        ) : null}
        {quotaTotalBar ? (
          <UsageProgressBar
            label="total"
            utilization={quotaTotalBar.utilization}
            color="purple"
          />
        ) : null}

        {!todayStats && !todayStatsLoading && !hasApiKeyQuota ? (
          <div className="text-xs text-gray-400">-</div>
        ) : null}
      </div>
    )
  }

  const renderUsageWindowsContent = () => {
    if (
      account.platform === 'anthropic' &&
      (account.type === 'oauth' || account.type === 'setup-token')
    ) {
      return renderAnthropicSection()
    }

    if (account.platform === 'openai' && account.type === 'oauth') {
      return renderOpenAISection()
    }

    if (account.platform === 'antigravity' && account.type === 'oauth') {
      return renderAntigravitySection()
    }

    if (account.platform === 'gemini') {
      return renderGeminiSection()
    }

    return <div className="text-xs text-gray-400">-</div>
  }

  return (
    <div ref={rootRef}>
      {showUsageWindows ? renderUsageWindowsContent() : renderNonOAuthSection()}
    </div>
  )
}
