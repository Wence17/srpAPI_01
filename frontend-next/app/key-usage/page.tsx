'use client'

import Link from 'next/link'
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react'
import LocaleSwitcher from '@/components/common/LocaleSwitcher'
import Icon from '@/components/icons/Icon'
import styles from '@/components/key-usage/keyUsage.module.css'
import { useApp } from '@/context/AppContext'
import { useI18n } from '@/lib/i18n'
import {
  fetchKeyUsage,
  type KeyUsageDailyRow,
  type KeyUsageModelStat,
  type KeyUsageResponse,
} from '@/lib/keyUsage'
import { sanitizeSvg } from '@/lib/sanitize'
import { sanitizeUrl } from '@/lib/url'

const GITHUB_URL = 'https://github.com/Wei-Shaw/sub2api'
const CIRCUMFERENCE = 2 * Math.PI * 68
const RING_GRADIENTS = [
  { from: '#14b8a6', to: '#5eead4' },
  { from: '#6366F1', to: '#A5B4FC' },
  { from: '#10B981', to: '#6EE7B7' },
  { from: '#F59E0B', to: '#FCD34D' },
]

type DateRangeKey = 'today' | '7d' | '30d' | 'custom'

interface RingItem {
  title: string
  pct: number
  amount: string
  isBalance?: boolean
  iconType: 'clock' | 'calendar' | 'dollar'
  resetAt?: string | null
}

interface DetailRow {
  iconBg: string
  iconColor: string
  iconSvg: string
  label: string
  value: string
  valueClass: string
}

interface StatCell {
  label: string
  value: string
}

const ICON_SHIELD = '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>'
const ICON_CALENDAR =
  '<rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>'
const ICON_DOLLAR =
  '<line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>'
const ICON_CHECK = '<polyline points="20 6 9 17 4 12"/>'

function initTheme(): boolean {
  if (typeof window === 'undefined') return false
  const savedTheme = localStorage.getItem('theme')
  const dark =
    savedTheme === 'dark' ||
    (!savedTheme && window.matchMedia('(prefers-color-scheme: dark)').matches)
  document.documentElement.classList.toggle('dark', dark)
  return dark
}

function usd(value: number | null | undefined): string {
  if (value == null || value < 0) return '-'
  return '$' + Number(value).toFixed(2)
}

function fmtNum(val: number | null | undefined): string {
  if (val == null) return '-'
  return val.toLocaleString()
}

function getBrowserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  } catch {
    return 'UTC'
  }
}

function getUsageColor(pct: number): string {
  if (pct > 90) return 'text-rose-500'
  if (pct > 70) return 'text-amber-500'
  return 'text-emerald-500'
}

function formatDate(iso: string | null | undefined, locale: string): string {
  if (!iso) return '-'
  const d = new Date(iso)
  const loc = locale === 'zh' ? 'zh-CN' : 'en-US'
  return d.toLocaleDateString(loc, { year: 'numeric', month: 'long', day: 'numeric' })
}

function buildDateParams(
  currentRange: DateRangeKey,
  customStartDate: string,
  customEndDate: string,
  dailyUsageDays: 7 | 30 | 90,
): string {
  const now = new Date()
  const fmt = (d: Date) => d.toISOString().split('T')[0]
  const params = new URLSearchParams()

  if (currentRange === 'custom') {
    if (customStartDate && customEndDate) {
      params.set('start_date', customStartDate)
      params.set('end_date', customEndDate)
    }
  } else {
    const end = fmt(now)
    let start: string
    switch (currentRange) {
      case 'today':
        start = end
        break
      case '7d':
        start = fmt(new Date(now.getTime() - 7 * 86400000))
        break
      case '30d':
        start = fmt(new Date(now.getTime() - 30 * 86400000))
        break
      default:
        start = fmt(new Date(now.getTime() - 30 * 86400000))
    }
    params.set('start_date', start)
    params.set('end_date', end)
  }
  params.set('days', String(dailyUsageDays))
  params.set('timezone', getBrowserTimezone())
  return params.toString()
}

function getRingGridClass(len: number): string {
  if (len === 1) return 'grid grid-cols-1 max-w-md mx-auto gap-6'
  if (len === 2) return 'grid grid-cols-1 md:grid-cols-2 gap-6'
  return 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6'
}

function getRingOffset(ring: RingItem, ringAnimated: boolean): number {
  if (!ringAnimated) return CIRCUMFERENCE
  if (ring.isBalance) return 0
  return CIRCUMFERENCE - (Math.min(ring.pct, 100) / 100) * CIRCUMFERENCE
}

export default function KeyUsagePage() {
  const { t, locale } = useI18n()
  const app = useApp()

  const [isDark, setIsDark] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [apiKey, setApiKey] = useState('')
  const [keyVisible, setKeyVisible] = useState(false)
  const [isQuerying, setIsQuerying] = useState(false)
  const [showResults, setShowResults] = useState(false)
  const [showLoading, setShowLoading] = useState(false)
  const [showDatePicker, setShowDatePicker] = useState(false)
  const [resultData, setResultData] = useState<KeyUsageResponse | null>(null)
  const [now, setNow] = useState(() => new Date())
  const [currentRange, setCurrentRange] = useState<DateRangeKey>('today')
  const [customStartDate, setCustomStartDate] = useState('')
  const [customEndDate, setCustomEndDate] = useState('')
  const [dailyUsageDays, setDailyUsageDays] = useState<7 | 30 | 90>(30)
  const [ringAnimated, setRingAnimated] = useState(false)
  const [displayPcts, setDisplayPcts] = useState<number[]>([])
  const animationFrameRef = useRef<number | null>(null)

  const siteName = app.cachedPublicSettings?.site_name || app.siteName || 'Sub2API'
  const siteLogo = app.cachedPublicSettings?.site_logo || app.siteLogo || ''
  const docUrl = app.cachedPublicSettings?.doc_url || app.docUrl || ''
  const safeDocUrl = useMemo(() => sanitizeUrl(docUrl), [docUrl])
  const currentYear = new Date().getFullYear()
  const ringTrackColor = isDark ? '#222222' : '#F0F0EE'

  const dateRanges = useMemo(
    () => [
      { key: 'today' as const, label: t('keyUsage.dateRangeToday') },
      { key: '7d' as const, label: t('keyUsage.dateRange7d') },
      { key: '30d' as const, label: t('keyUsage.dateRange30d') },
      { key: 'custom' as const, label: t('keyUsage.dateRangeCustom') },
    ],
    [t],
  )

  const dailyUsageOptions = useMemo(
    () => [
      { value: 7 as const, label: t('keyUsage.dateRange7d') },
      { value: 30 as const, label: t('keyUsage.dateRange30d') },
      { value: 90 as const, label: t('keyUsage.dateRange90d') },
    ],
    [t],
  )

  const formatResetTime = useCallback(
    (resetAt: string | null | undefined): string => {
      if (!resetAt) return ''
      const diff = new Date(resetAt).getTime() - now.getTime()
      if (diff <= 0) return t('keyUsage.resetNow')
      const days = Math.floor(diff / 86400000)
      const hours = Math.floor((diff % 86400000) / 3600000)
      const mins = Math.floor((diff % 3600000) / 60000)
      if (days > 0) return `${days}d ${hours}h`
      if (hours > 0) return `${hours}h ${mins}m`
      return `${mins}m`
    },
    [now, t],
  )

  const statusInfo = useMemo(() => {
    const data = resultData
    if (!data) return null

    if (data.mode === 'quota_limited') {
      const isValid = data.isValid !== false
      const statusMap: Record<string, string> = {
        active: 'Active',
        quota_exhausted: 'Quota Exhausted',
        expired: 'Expired',
      }
      return {
        label: t('keyUsage.quotaMode'),
        statusText: statusMap[data.status ?? ''] || data.status || 'Unknown',
        isActive: isValid && data.status === 'active',
      }
    }

    return {
      label: data.planName || t('keyUsage.walletBalance'),
      statusText: 'Active',
      isActive: true,
    }
  }, [resultData, t])

  const ringItems = useMemo<RingItem[]>(() => {
    const data = resultData
    if (!data) return []

    const items: RingItem[] = []

    if (data.mode === 'quota_limited') {
      if (data.quota) {
        const pct =
          data.quota.limit > 0
            ? Math.min(Math.round((data.quota.used / data.quota.limit) * 100), 100)
            : 0
        items.push({
          title: t('keyUsage.totalQuota'),
          pct,
          amount: `${usd(data.quota.used)} / ${usd(data.quota.limit)}`,
          iconType: 'dollar',
        })
      }
      if (data.rate_limits) {
        const windowLabels: Record<string, string> = {
          '5h': t('keyUsage.limit5h'),
          '1d': t('keyUsage.limitDaily'),
          '7d': t('keyUsage.limit7d'),
        }
        const windowIcons: Record<string, 'clock' | 'calendar'> = {
          '5h': 'clock',
          '1d': 'calendar',
          '7d': 'calendar',
        }
        for (const rl of data.rate_limits) {
          const pct = rl.limit > 0 ? Math.min(Math.round((rl.used / rl.limit) * 100), 100) : 0
          items.push({
            title: windowLabels[rl.window] || rl.window,
            pct,
            amount: `${usd(rl.used)} / ${usd(rl.limit)}`,
            iconType: windowIcons[rl.window] || 'clock',
            resetAt: rl.reset_at,
          })
        }
      }
    } else {
      if (data.subscription) {
        const sub = data.subscription
        const limits = [
          {
            label: t('keyUsage.limitDaily'),
            usage: sub.daily_usage_usd,
            limit: sub.daily_limit_usd,
          },
          {
            label: t('keyUsage.limitWeekly'),
            usage: sub.weekly_usage_usd,
            limit: sub.weekly_limit_usd,
          },
          {
            label: t('keyUsage.limitMonthly'),
            usage: sub.monthly_usage_usd,
            limit: sub.monthly_limit_usd,
          },
        ]
        for (const l of limits) {
          if (l.limit != null && l.limit > 0) {
            const pct = Math.min(Math.round((l.usage / l.limit) * 100), 100)
            items.push({
              title: l.label,
              pct,
              amount: `${usd(l.usage)} / ${usd(l.limit)}`,
              iconType: 'calendar',
            })
          }
        }
      }
      if (!data.subscription && data.balance != null) {
        items.push({
          title: t('keyUsage.walletBalance'),
          pct: 0,
          amount: usd(data.balance),
          isBalance: true,
          iconType: 'dollar',
        })
      }
    }

    return items
  }, [resultData, t])

  const detailRows = useMemo<DetailRow[]>(() => {
    const data = resultData
    if (!data) return []

    const rows: DetailRow[] = []

    if (data.mode === 'quota_limited') {
      if (data.quota) {
        const remainColor =
          data.quota.remaining <= 0
            ? 'text-rose-500'
            : data.quota.remaining < data.quota.limit * 0.1
              ? 'text-amber-500'
              : 'text-emerald-500'
        rows.push({
          iconBg: 'bg-emerald-500/10',
          iconColor: 'text-emerald-500',
          iconSvg: ICON_SHIELD,
          label: t('keyUsage.remainingQuota'),
          value: usd(data.quota.remaining),
          valueClass: remainColor,
        })
      }
      if (data.expires_at) {
        const daysLeft = data.days_until_expiry
        let expiryStr = formatDate(data.expires_at, locale)
        if (daysLeft != null) {
          expiryStr +=
            daysLeft > 0
              ? ` ${t('keyUsage.daysLeft', { days: daysLeft })}`
              : daysLeft === 0
                ? ` ${t('keyUsage.todayExpires')}`
                : ''
        }
        rows.push({
          iconBg: 'bg-amber-500/10',
          iconColor: 'text-amber-500',
          iconSvg: ICON_CALENDAR,
          label: t('keyUsage.expiresAt'),
          value: expiryStr,
          valueClass: '',
        })
      }
      if (data.rate_limits) {
        const windowMap: Record<string, string> = {
          '5h': '5H',
          '1d': locale === 'zh' ? '日' : 'D',
          '7d': '7D',
        }
        for (const rl of data.rate_limits) {
          const pct = rl.limit > 0 ? (rl.used / rl.limit) * 100 : 0
          let valueStr = `${usd(rl.used)} / ${usd(rl.limit)}`
          const resetStr = formatResetTime(rl.reset_at)
          if (resetStr) {
            valueStr += ` (⟳ ${resetStr})`
          }
          rows.push({
            iconBg: 'bg-primary-500/10',
            iconColor: 'text-primary-500',
            iconSvg: ICON_DOLLAR,
            label: `${t('keyUsage.usedQuota')} (${windowMap[rl.window] || rl.window})`,
            value: valueStr,
            valueClass: getUsageColor(pct),
          })
        }
      }
    } else {
      rows.push({
        iconBg: 'bg-emerald-500/10',
        iconColor: 'text-emerald-500',
        iconSvg: ICON_CHECK,
        label: t('keyUsage.subscriptionType'),
        value: data.planName || t('keyUsage.walletBalance'),
        valueClass: '',
      })

      if (data.subscription) {
        const sub = data.subscription
        if (sub.daily_limit_usd > 0) {
          const pct = (sub.daily_usage_usd / sub.daily_limit_usd) * 100
          rows.push({
            iconBg: 'bg-primary-500/10',
            iconColor: 'text-primary-500',
            iconSvg: ICON_DOLLAR,
            label: `${t('keyUsage.usedQuota')} (${locale === 'zh' ? '日' : 'D'})`,
            value: `${usd(sub.daily_usage_usd)} / ${usd(sub.daily_limit_usd)}`,
            valueClass: getUsageColor(pct),
          })
        }
        if (sub.weekly_limit_usd > 0) {
          const pct = (sub.weekly_usage_usd / sub.weekly_limit_usd) * 100
          rows.push({
            iconBg: 'bg-indigo-500/10',
            iconColor: 'text-indigo-500',
            iconSvg: ICON_DOLLAR,
            label: `${t('keyUsage.usedQuota')} (${locale === 'zh' ? '周' : 'W'})`,
            value: `${usd(sub.weekly_usage_usd)} / ${usd(sub.weekly_limit_usd)}`,
            valueClass: getUsageColor(pct),
          })
        }
        if (sub.monthly_limit_usd > 0) {
          const pct = (sub.monthly_usage_usd / sub.monthly_limit_usd) * 100
          rows.push({
            iconBg: 'bg-emerald-500/10',
            iconColor: 'text-emerald-500',
            iconSvg: ICON_DOLLAR,
            label: `${t('keyUsage.usedQuota')} (${locale === 'zh' ? '月' : 'M'})`,
            value: `${usd(sub.monthly_usage_usd)} / ${usd(sub.monthly_limit_usd)}`,
            valueClass: getUsageColor(pct),
          })
        }
        if (sub.expires_at) {
          rows.push({
            iconBg: 'bg-amber-500/10',
            iconColor: 'text-amber-500',
            iconSvg: ICON_CALENDAR,
            label: t('keyUsage.subscriptionExpires'),
            value: formatDate(sub.expires_at, locale),
            valueClass: '',
          })
        }
      }

      const remainColor =
        data.remaining != null
          ? data.remaining <= 0
            ? 'text-rose-500'
            : data.remaining < 10
              ? 'text-amber-500'
              : 'text-emerald-500'
          : ''
      rows.push({
        iconBg: 'bg-emerald-500/10',
        iconColor: 'text-emerald-500',
        iconSvg: ICON_SHIELD,
        label: t('keyUsage.remainingQuota'),
        value: data.remaining != null ? usd(data.remaining) : '-',
        valueClass: remainColor,
      })
    }

    return rows
  }, [formatResetTime, locale, resultData, t])

  const usageStatCells = useMemo<StatCell[]>(() => {
    const usage = resultData?.usage
    if (!usage) return []

    const today = usage.today || {}
    const total = usage.total || {}

    return [
      { label: t('keyUsage.todayRequests'), value: fmtNum(today.requests) },
      { label: t('keyUsage.todayInputTokens'), value: fmtNum(today.input_tokens) },
      { label: t('keyUsage.todayOutputTokens'), value: fmtNum(today.output_tokens) },
      { label: t('keyUsage.todayTokens'), value: fmtNum(today.total_tokens) },
      { label: t('keyUsage.todayCacheCreation'), value: fmtNum(today.cache_creation_tokens) },
      { label: t('keyUsage.todayCacheRead'), value: fmtNum(today.cache_read_tokens) },
      { label: t('keyUsage.todayCost'), value: usd(today.actual_cost) },
      { label: t('keyUsage.rpmTpm'), value: `${usage.rpm || 0} / ${usage.tpm || 0}` },
      { label: t('keyUsage.totalRequests'), value: fmtNum(total.requests) },
      { label: t('keyUsage.totalInputTokens'), value: fmtNum(total.input_tokens) },
      { label: t('keyUsage.totalOutputTokens'), value: fmtNum(total.output_tokens) },
      { label: t('keyUsage.totalTokensLabel'), value: fmtNum(total.total_tokens) },
      { label: t('keyUsage.totalCacheCreation'), value: fmtNum(total.cache_creation_tokens) },
      { label: t('keyUsage.totalCacheRead'), value: fmtNum(total.cache_read_tokens) },
      { label: t('keyUsage.totalCost'), value: usd(total.actual_cost) },
      {
        label: t('keyUsage.avgDuration'),
        value: usage.average_duration_ms ? `${Math.round(usage.average_duration_ms)} ms` : '-',
      },
    ]
  }, [resultData, t])

  const modelStats = useMemo<KeyUsageModelStat[]>(
    () => resultData?.model_stats || [],
    [resultData],
  )

  const dailyUsageRows = useMemo<KeyUsageDailyRow[]>(() => {
    const rows = resultData?.daily_usage
    return Array.isArray(rows) ? rows : []
  }, [resultData])

  const showDailyUsage = Boolean(resultData && Array.isArray(resultData.daily_usage))

  const triggerRingAnimation = useCallback((items: RingItem[]) => {
    if (animationFrameRef.current != null) {
      cancelAnimationFrame(animationFrameRef.current)
    }
    setRingAnimated(false)
    setDisplayPcts(items.map(() => 0))

    requestAnimationFrame(() => {
      setTimeout(() => {
        setRingAnimated(true)

        const duration = 1000
        const startTime = performance.now()
        const targets = items.map((item) => (item.isBalance ? 0 : item.pct))

        function tick() {
          const elapsed = performance.now() - startTime
          const p = Math.min(elapsed / duration, 1)
          const ease = 1 - Math.pow(1 - p, 3)
          setDisplayPcts(targets.map((target) => Math.round(ease * target)))
          if (p < 1) {
            animationFrameRef.current = requestAnimationFrame(tick)
          }
        }
        animationFrameRef.current = requestAnimationFrame(tick)
      }, 50)
    })
  }, [])

  const queryKey = useCallback(
    async (overrides?: { range?: DateRangeKey; dailyDays?: 7 | 30 | 90 }) => {
      if (isQuerying) return
      const key = apiKey.trim()
      if (!key) {
        app.showInfo(t('keyUsage.enterApiKey'))
        return
      }

      const range = overrides?.range ?? currentRange
      const days = overrides?.dailyDays ?? dailyUsageDays

      setIsQuerying(true)
      setShowResults(true)
      setShowLoading(true)
      setResultData(null)

      try {
        const dateParams = buildDateParams(range, customStartDate, customEndDate, days)
        const data = await fetchKeyUsage(key, dateParams, t('keyUsage.queryFailed'))
        setResultData(data)
        setShowLoading(false)
        setShowDatePicker(true)
        app.showSuccess(t('keyUsage.querySuccess'))
      } catch (err) {
        setShowResults(false)
        setShowLoading(false)
        app.showError((err as Error).message || t('keyUsage.queryFailedRetry'))
      } finally {
        setIsQuerying(false)
      }
    },
    [
      apiKey,
      app,
      currentRange,
      customEndDate,
      customStartDate,
      dailyUsageDays,
      isQuerying,
      t,
    ],
  )

  const setDateRange = useCallback(
    (key: DateRangeKey) => {
      setCurrentRange(key)
      if (key !== 'custom') {
        void queryKey({ range: key })
      }
    },
    [queryKey],
  )

  const setDailyUsageDaysAndQuery = useCallback(
    (days: 7 | 30 | 90) => {
      if (dailyUsageDays === days) return
      setDailyUsageDays(days)
      if (resultData && apiKey.trim()) {
        void queryKey({ dailyDays: days })
      }
    },
    [apiKey, dailyUsageDays, queryKey, resultData],
  )

  function toggleTheme() {
    setIsDark((prev) => {
      const next = !prev
      document.documentElement.classList.toggle('dark', next)
      localStorage.setItem('theme', next ? 'dark' : 'light')
      return next
    })
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') {
      void queryKey()
    }
  }

  useEffect(() => {
    setIsDark(initTheme())
    setMounted(true)
    if (!app.publicSettingsLoaded) {
      void app.fetchPublicSettings()
    }
    const timer = setInterval(() => setNow(new Date()), 60000)
    return () => {
      clearInterval(timer)
      if (animationFrameRef.current != null) {
        cancelAnimationFrame(animationFrameRef.current)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only init
  }, [])

  useEffect(() => {
    if (resultData && !showLoading && ringItems.length > 0) {
      triggerRingAnimation(ringItems)
    }
  }, [resultData, showLoading, ringItems, triggerRingAnimation])

  const ringFadeDelayClasses = [
    styles.fadeUpDelay1,
    styles.fadeUpDelay2,
    styles.fadeUpDelay3,
    styles.fadeUpDelay4,
  ]

  if (!mounted) {
    return null
  }

  return (
    <div className="relative flex min-h-screen flex-col bg-gray-50 dark:bg-dark-950">
      <header className="relative z-20 px-6 py-4">
        <nav className="mx-auto flex max-w-6xl items-center justify-between">
          <Link href="/home" className="flex items-center gap-3">
            <div className="h-10 w-10 overflow-hidden rounded-xl shadow-md">
              <img
                src={siteLogo || '/logo.png'}
                alt="Logo"
                className="h-full w-full object-contain"
              />
            </div>
            <span className="text-lg font-semibold tracking-tight text-gray-900 dark:text-white">
              {siteName}
            </span>
          </Link>
          <div className="flex items-center gap-3">
            <LocaleSwitcher />
            {safeDocUrl ? (
              <a
                href={safeDocUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-lg p-2 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:text-dark-400 dark:hover:bg-dark-800 dark:hover:text-white"
                title={t('home.viewDocs')}
              >
                <Icon name="book" size="md" />
              </a>
            ) : null}
            <button
              type="button"
              onClick={toggleTheme}
              className="rounded-lg p-2 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:text-dark-400 dark:hover:bg-dark-800 dark:hover:text-white"
              title={isDark ? t('home.switchToLight') : t('home.switchToDark')}
            >
              {isDark ? <Icon name="sun" size="md" /> : <Icon name="moon" size="md" />}
            </button>
          </div>
        </nav>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-12">
        <div className="mb-12 text-center">
          <h1 className="mb-3 text-3xl font-bold tracking-tight text-gray-900 dark:text-white sm:text-4xl">
            {t('keyUsage.title')}
          </h1>
          <p className="mx-auto max-w-md text-base text-gray-500 dark:text-dark-400">
            {t('keyUsage.subtitle')}
          </p>
        </div>

        <div className="mx-auto mb-14 max-w-xl">
          <div className="flex gap-3">
            <div className="relative flex-1">
              <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 dark:text-dark-500">
                <svg
                  className="h-5 w-5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
              </div>
              <input
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                type={keyVisible ? 'text' : 'password'}
                placeholder={t('keyUsage.placeholder')}
                className={`${styles.inputRing} w-full h-12 pl-12 pr-12 rounded-xl border border-gray-200 bg-white text-sm text-gray-900 placeholder:text-gray-400 transition-all dark:border-dark-700 dark:bg-dark-900 dark:text-white dark:placeholder:text-dark-500`}
                onKeyDown={handleKeyDown}
              />
              <button
                type="button"
                onClick={() => setKeyVisible((prev) => !prev)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 transition-colors hover:text-gray-700 dark:text-dark-500 dark:hover:text-white"
              >
                {!keyVisible ? (
                  <svg
                    className="h-5 w-5"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                    <line x1="1" y1="1" x2="23" y2="23" />
                  </svg>
                ) : (
                  <svg
                    className="h-5 w-5"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                )}
              </button>
            </div>
            <button
              type="button"
              onClick={() => void queryKey()}
              disabled={isQuerying}
              className="flex h-12 items-center gap-2 whitespace-nowrap rounded-xl bg-primary-500 px-7 text-sm font-medium text-white transition-all hover:bg-primary-600 active:scale-[0.97] disabled:opacity-60"
            >
              {isQuerying ? (
                <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.25" />
                  <path
                    d="M12 2a10 10 0 0 1 10 10"
                    stroke="currentColor"
                    strokeWidth="3"
                    strokeLinecap="round"
                  />
                </svg>
              ) : (
                <svg
                  className="h-4 w-4"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
              )}
              {isQuerying ? t('keyUsage.querying') : t('keyUsage.query')}
            </button>
          </div>
          <p className="mt-3 text-center text-xs text-gray-400 dark:text-dark-500">
            {t('keyUsage.privacyNote')}
          </p>

          {showDatePicker ? (
            <div className="mt-4">
              <div className="flex flex-wrap items-center justify-center gap-2">
                <span className="text-xs text-gray-500 dark:text-dark-400">
                  {t('keyUsage.dateRange')}
                </span>
                {dateRanges.map((range) => (
                  <button
                    key={range.key}
                    type="button"
                    onClick={() => setDateRange(range.key)}
                    className={`rounded-lg border px-3 py-1.5 text-xs transition-all ${
                      currentRange === range.key
                        ? 'border-primary-500 bg-primary-500 text-white'
                        : 'border-gray-200 bg-white text-gray-700 hover:border-primary-300 dark:border-dark-700 dark:bg-dark-900 dark:text-dark-200 dark:hover:border-dark-600'
                    }`}
                  >
                    {range.label}
                  </button>
                ))}
                {currentRange === 'custom' ? (
                  <div className="ml-1 flex items-center gap-2">
                    <input
                      value={customStartDate}
                      onChange={(e) => setCustomStartDate(e.target.value)}
                      type="date"
                      className={`${styles.inputRing} rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-xs text-gray-900 dark:border-dark-700 dark:bg-dark-900 dark:text-white`}
                    />
                    <span className="text-xs text-gray-400">-</span>
                    <input
                      value={customEndDate}
                      onChange={(e) => setCustomEndDate(e.target.value)}
                      type="date"
                      className={`${styles.inputRing} rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-xs text-gray-900 dark:border-dark-700 dark:bg-dark-900 dark:text-white`}
                    />
                    <button
                      type="button"
                      onClick={() => void queryKey()}
                      className="rounded-lg bg-primary-500 px-3 py-1.5 text-xs text-white hover:bg-primary-600"
                    >
                      {t('keyUsage.apply')}
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>

        {showResults ? (
          <div>
            {showLoading ? (
              <div className="space-y-6">
                <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                  <div className="rounded-2xl border border-gray-200 bg-white p-8 dark:border-dark-700 dark:bg-dark-900">
                    <div className={`${styles.skeleton} mb-6 h-5 w-24`} />
                    <div className="flex justify-center">
                      <div className={`${styles.skeleton} h-44 w-44 rounded-full`} />
                    </div>
                  </div>
                  <div className="rounded-2xl border border-gray-200 bg-white p-8 dark:border-dark-700 dark:bg-dark-900">
                    <div className={`${styles.skeleton} mb-6 h-5 w-24`} />
                    <div className="flex justify-center">
                      <div className={`${styles.skeleton} h-44 w-44 rounded-full`} />
                    </div>
                  </div>
                </div>
                <div className="rounded-2xl border border-gray-200 bg-white p-8 dark:border-dark-700 dark:bg-dark-900">
                  <div className={`${styles.skeleton} mb-6 h-5 w-32`} />
                  <div className="space-y-4">
                    <div className={`${styles.skeleton} h-4 w-full`} />
                    <div className={`${styles.skeleton} h-4 w-3/4`} />
                    <div className={`${styles.skeleton} h-4 w-5/6`} />
                    <div className={`${styles.skeleton} h-4 w-2/3`} />
                  </div>
                </div>
              </div>
            ) : resultData ? (
              <div className="space-y-6">
                {statusInfo ? (
                  <div className={`${styles.fadeUp} mb-2 flex items-center justify-center`}>
                    <div className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white/90 px-5 py-2.5 shadow-sm backdrop-blur-sm dark:border-dark-700 dark:bg-dark-900/90">
                      <span
                        className={`${styles.pulseDot} h-2.5 w-2.5 rounded-full ${
                          statusInfo.isActive ? 'bg-emerald-500' : 'bg-rose-500'
                        }`}
                      />
                      <span className="text-sm font-medium text-gray-900 dark:text-white">
                        {statusInfo.label}
                      </span>
                      <span className="text-xs text-gray-400 dark:text-dark-500">|</span>
                      <span className="text-xs text-gray-500 dark:text-dark-400">
                        {statusInfo.statusText}
                      </span>
                    </div>
                  </div>
                ) : null}

                {ringItems.length > 0 ? (
                  <div className={getRingGridClass(ringItems.length)}>
                    {ringItems.map((ring, i) => (
                      <div
                        key={`${ring.title}-${i}`}
                        className={`${styles.fadeUp} rounded-2xl border border-gray-200 bg-white/90 p-8 backdrop-blur-sm transition-all duration-300 hover:shadow-lg dark:border-dark-700 dark:bg-dark-900/90 ${ringFadeDelayClasses[Math.min(i, 3)] ?? ''}`}
                      >
                        <div className="mb-6 flex items-center justify-between">
                          <h3 className="text-sm font-semibold uppercase tracking-wider text-gray-500 dark:text-dark-400">
                            {ring.title}
                          </h3>
                          {ring.iconType === 'clock' ? (
                            <svg
                              className="h-5 w-5 text-gray-400 dark:text-dark-500"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <circle cx="12" cy="12" r="10" />
                              <polyline points="12 6 12 12 16 14" />
                            </svg>
                          ) : ring.iconType === 'calendar' ? (
                            <svg
                              className="h-5 w-5 text-gray-400 dark:text-dark-500"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                              <line x1="16" y1="2" x2="16" y2="6" />
                              <line x1="8" y1="2" x2="8" y2="6" />
                              <line x1="3" y1="10" x2="21" y2="10" />
                            </svg>
                          ) : (
                            <svg
                              className="h-5 w-5 text-gray-400 dark:text-dark-500"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <line x1="12" y1="1" x2="12" y2="23" />
                              <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
                            </svg>
                          )}
                        </div>
                        <div className="flex justify-center">
                          <div className="relative">
                            <svg className="h-44 w-44" viewBox="0 0 160 160">
                              <circle
                                cx="80"
                                cy="80"
                                r="68"
                                fill="none"
                                stroke={ringTrackColor}
                                strokeWidth="10"
                              />
                              <circle
                                className={styles.progressRing}
                                cx="80"
                                cy="80"
                                r="68"
                                fill="none"
                                stroke={`url(#ring-grad-${i})`}
                                strokeWidth="10"
                                strokeLinecap="round"
                                strokeDasharray={CIRCUMFERENCE.toFixed(2)}
                                strokeDashoffset={getRingOffset(ring, ringAnimated)}
                              />
                              <defs>
                                <linearGradient id={`ring-grad-${i}`} x1="0%" y1="0%" x2="100%" y2="100%">
                                  <stop offset="0%" stopColor={RING_GRADIENTS[i % 4].from} />
                                  <stop offset="100%" stopColor={RING_GRADIENTS[i % 4].to} />
                                </linearGradient>
                              </defs>
                            </svg>
                            <div className="absolute inset-0 flex flex-col items-center justify-center">
                              {ring.isBalance ? (
                                <span
                                  className={`${styles.tabularNums} text-2xl font-bold`}
                                  style={{ color: RING_GRADIENTS[i % 4].from }}
                                >
                                  {ring.amount}
                                </span>
                              ) : (
                                <>
                                  <span
                                    className={`${styles.tabularNums} text-3xl font-bold text-gray-900 dark:text-white`}
                                  >
                                    {displayPcts[i] ?? 0}%
                                  </span>
                                  <span className="mt-0.5 text-xs text-gray-500 dark:text-dark-400">
                                    {t('keyUsage.used')}
                                  </span>
                                  <span
                                    className={`${styles.tabularNums} mt-1 text-sm font-semibold`}
                                    style={{ color: RING_GRADIENTS[i % 4].from }}
                                  >
                                    {ring.amount}
                                  </span>
                                  {ring.resetAt && formatResetTime(ring.resetAt) ? (
                                    <p className="mt-0.5 text-xs tabular-nums text-gray-400 dark:text-gray-500">
                                      ⟳ {formatResetTime(ring.resetAt)}
                                    </p>
                                  ) : null}
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}

                {detailRows.length > 0 ? (
                  <div
                    className={`${styles.fadeUp} ${styles.fadeUpDelay3} overflow-hidden rounded-2xl border border-gray-200 bg-white/90 backdrop-blur-sm dark:border-dark-700 dark:bg-dark-900/90`}
                  >
                    <div className="border-b border-gray-200 px-8 py-5 dark:border-dark-700">
                      <h3 className="text-sm font-semibold uppercase tracking-wider text-gray-500 dark:text-dark-400">
                        {t('keyUsage.detailInfo')}
                      </h3>
                    </div>
                    <div className="divide-y divide-gray-100 dark:divide-dark-800">
                      {detailRows.map((row, i) => (
                        <div key={`${row.label}-${i}`} className="flex items-center justify-between px-8 py-4">
                          <div className="flex items-center gap-3">
                            <div
                              className={`flex h-8 w-8 items-center justify-center rounded-lg ${row.iconBg}`}
                            >
                              <svg
                                className={`h-4 w-4 ${row.iconColor}`}
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                dangerouslySetInnerHTML={{ __html: sanitizeSvg(row.iconSvg) }}
                              />
                            </div>
                            <span className="text-sm text-gray-700 dark:text-dark-200">{row.label}</span>
                          </div>
                          <span
                            className={`${styles.tabularNums} text-sm font-semibold ${row.valueClass || 'text-gray-900 dark:text-white'}`}
                          >
                            {row.value}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                {usageStatCells.length > 0 ? (
                  <div
                    className={`${styles.fadeUp} ${styles.fadeUpDelay3} overflow-hidden rounded-2xl border border-gray-200 bg-white/90 backdrop-blur-sm dark:border-dark-700 dark:bg-dark-900/90`}
                  >
                    <div className="border-b border-gray-200 px-8 py-5 dark:border-dark-700">
                      <h3 className="text-sm font-semibold uppercase tracking-wider text-gray-500 dark:text-dark-400">
                        {t('keyUsage.tokenStats')}
                      </h3>
                    </div>
                    <div className="grid grid-cols-2 gap-px bg-gray-100 md:grid-cols-4 dark:bg-dark-800">
                      {usageStatCells.map((cell, i) => (
                        <div key={`${cell.label}-${i}`} className="bg-white px-6 py-4 dark:bg-dark-900">
                          <div className="mb-1 text-xs text-gray-500 dark:text-dark-400">{cell.label}</div>
                          <div
                            className={`${styles.tabularNums} text-sm font-semibold text-gray-900 dark:text-white`}
                          >
                            {cell.value}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                {showDailyUsage ? (
                  <div
                    className={`${styles.fadeUp} ${styles.fadeUpDelay4} overflow-hidden rounded-2xl border border-gray-200 bg-white/90 backdrop-blur-sm dark:border-dark-700 dark:bg-dark-900/90`}
                  >
                    <div className="flex flex-col gap-3 border-b border-gray-200 px-8 py-5 dark:border-dark-700 sm:flex-row sm:items-center sm:justify-between">
                      <h3 className="text-sm font-semibold uppercase tracking-wider text-gray-500 dark:text-dark-400">
                        {t('keyUsage.dailyDetail')}
                      </h3>
                      <div className="inline-flex rounded-lg border border-gray-200 bg-white p-0.5 dark:border-dark-700 dark:bg-dark-950">
                        {dailyUsageOptions.map((option) => (
                          <button
                            key={option.value}
                            type="button"
                            onClick={() => setDailyUsageDaysAndQuery(option.value)}
                            className={`min-w-12 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                              dailyUsageDays === option.value
                                ? 'bg-primary-500 text-white'
                                : 'text-gray-600 hover:bg-gray-100 dark:text-dark-300 dark:hover:bg-dark-800'
                            }`}
                          >
                            {option.label}
                          </button>
                        ))}
                      </div>
                    </div>
                    {dailyUsageRows.length > 0 ? (
                      <div className="overflow-x-auto">
                        <table className="w-full">
                          <thead>
                            <tr className="border-b border-gray-200 bg-gray-50 dark:border-dark-700 dark:bg-dark-950">
                              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-dark-400">
                                {t('keyUsage.date')}
                              </th>
                              <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-dark-400">
                                {t('keyUsage.requests')}
                              </th>
                              <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-dark-400">
                                {t('keyUsage.inputTokens')}
                              </th>
                              <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-dark-400">
                                {t('keyUsage.outputTokens')}
                              </th>
                              <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-dark-400">
                                {t('keyUsage.cacheReadTokens')}
                              </th>
                              <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-dark-400">
                                {t('keyUsage.cacheWriteTokens')}
                              </th>
                              <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-dark-400">
                                {t('keyUsage.cost')}
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {dailyUsageRows.map((row) => (
                              <tr
                                key={row.date}
                                className="border-b border-gray-100 last:border-b-0 dark:border-dark-800"
                              >
                                <td className="whitespace-nowrap px-4 py-3 text-sm font-medium text-gray-900 dark:text-white">
                                  {row.date}
                                </td>
                                <td className="px-4 py-3 text-right text-sm tabular-nums text-gray-700 dark:text-dark-200">
                                  {fmtNum(row.requests)}
                                </td>
                                <td className="px-4 py-3 text-right text-sm tabular-nums text-gray-700 dark:text-dark-200">
                                  {fmtNum(row.input_tokens)}
                                </td>
                                <td className="px-4 py-3 text-right text-sm tabular-nums text-gray-700 dark:text-dark-200">
                                  {fmtNum(row.output_tokens)}
                                </td>
                                <td className="px-4 py-3 text-right text-sm tabular-nums text-gray-700 dark:text-dark-200">
                                  {fmtNum(row.cache_read_tokens)}
                                </td>
                                <td className="px-4 py-3 text-right text-sm tabular-nums text-gray-700 dark:text-dark-200">
                                  {fmtNum(row.cache_write_tokens)}
                                </td>
                                <td className="px-4 py-3 text-right text-sm font-medium tabular-nums text-gray-900 dark:text-white">
                                  {usd(row.actual_cost != null ? row.actual_cost : row.cost)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <div className="px-8 py-8 text-center text-sm text-gray-500 dark:text-dark-400">
                        {t('keyUsage.noDailyUsage')}
                      </div>
                    )}
                  </div>
                ) : null}

                {modelStats.length > 0 ? (
                  <div
                    className={`${styles.fadeUp} ${styles.fadeUpDelay4} overflow-hidden rounded-2xl border border-gray-200 bg-white/90 backdrop-blur-sm dark:border-dark-700 dark:bg-dark-900/90`}
                  >
                    <div className="border-b border-gray-200 px-8 py-5 dark:border-dark-700">
                      <h3 className="text-sm font-semibold uppercase tracking-wider text-gray-500 dark:text-dark-400">
                        {t('keyUsage.modelStats')}
                      </h3>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className="border-b border-gray-200 bg-gray-50 dark:border-dark-700 dark:bg-dark-950">
                            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-dark-400">
                              {t('keyUsage.model')}
                            </th>
                            <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-dark-400">
                              {t('keyUsage.requests')}
                            </th>
                            <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-dark-400">
                              {t('keyUsage.inputTokens')}
                            </th>
                            <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-dark-400">
                              {t('keyUsage.outputTokens')}
                            </th>
                            <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-dark-400">
                              {t('keyUsage.cacheCreationTokens')}
                            </th>
                            <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-dark-400">
                              {t('keyUsage.cacheReadTokens')}
                            </th>
                            <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-dark-400">
                              {t('keyUsage.totalTokens')}
                            </th>
                            <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-dark-400">
                              {t('keyUsage.cost')}
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {modelStats.map((m, i) => (
                            <tr
                              key={`${m.model}-${i}`}
                              className="border-b border-gray-100 last:border-b-0 dark:border-dark-800"
                            >
                              <td className="whitespace-nowrap px-4 py-3 text-sm font-medium text-gray-900 dark:text-white">
                                {m.model || '-'}
                              </td>
                              <td className="px-4 py-3 text-right text-sm tabular-nums text-gray-700 dark:text-dark-200">
                                {fmtNum(m.requests)}
                              </td>
                              <td className="px-4 py-3 text-right text-sm tabular-nums text-gray-700 dark:text-dark-200">
                                {fmtNum(m.input_tokens)}
                              </td>
                              <td className="px-4 py-3 text-right text-sm tabular-nums text-gray-700 dark:text-dark-200">
                                {fmtNum(m.output_tokens)}
                              </td>
                              <td className="px-4 py-3 text-right text-sm tabular-nums text-gray-700 dark:text-dark-200">
                                {fmtNum(m.cache_creation_tokens)}
                              </td>
                              <td className="px-4 py-3 text-right text-sm tabular-nums text-gray-700 dark:text-dark-200">
                                {fmtNum(m.cache_read_tokens)}
                              </td>
                              <td className="px-4 py-3 text-right text-sm tabular-nums text-gray-700 dark:text-dark-200">
                                {fmtNum(m.total_tokens)}
                              </td>
                              <td className="px-4 py-3 text-right text-sm font-medium tabular-nums text-gray-900 dark:text-white">
                                {usd(m.actual_cost != null ? m.actual_cost : m.cost)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}
      </main>

      <footer className="relative z-10 border-t border-gray-200/50 px-6 py-8 dark:border-dark-800/50">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-center gap-4 text-center sm:flex-row sm:text-left">
          <p className="text-sm text-gray-500 dark:text-dark-400">
            &copy; {currentYear} {siteName}. {t('home.footer.allRightsReserved')}
          </p>
          <div className="flex items-center gap-4">
            {safeDocUrl ? (
              <a
                href={safeDocUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-gray-500 transition-colors hover:text-gray-700 dark:text-dark-400 dark:hover:text-white"
              >
                {t('home.docs')}
              </a>
            ) : null}
            <a
              href={GITHUB_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-gray-500 transition-colors hover:text-gray-700 dark:text-dark-400 dark:hover:text-white"
            >
              GitHub
            </a>
          </div>
        </div>
      </footer>
    </div>
  )
}
