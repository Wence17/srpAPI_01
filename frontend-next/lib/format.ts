/**
 * Date/time formatting helpers ported from src/utils/format.ts.
 *
 * The original module reaches into `i18n.global.t` directly. In the React app
 * the active translator is provided by context, so the relative-time helpers
 * accept a `t` function to stay faithful to the original i18n output.
 */

import { getLocale } from './i18n'

type TranslateFn = (key: string, params?: Record<string, unknown> | number | string) => string

export function formatDate(
  date: string | Date | null | undefined,
  options: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  },
  localeOverride?: string,
): string {
  if (!date) return ''

  const d = new Date(date)
  if (isNaN(d.getTime())) return ''

  const locale = localeOverride ?? getLocale()
  return new Intl.DateTimeFormat(locale, options).format(d)
}

export function formatDateTime(
  date: string | Date | null | undefined,
  options?: Intl.DateTimeFormatOptions,
  localeOverride?: string,
): string {
  return formatDate(date, options, localeOverride)
}

export function formatRelativeTime(date: string | Date | null | undefined, t: TranslateFn): string {
  if (!date) return t('common.time.never')

  const now = new Date()
  const past = new Date(date)
  const diffMs = now.getTime() - past.getTime()

  if (diffMs < 0 || isNaN(diffMs)) return t('common.time.never')

  const diffSecs = Math.floor(diffMs / 1000)
  const diffMins = Math.floor(diffSecs / 60)
  const diffHours = Math.floor(diffMins / 60)
  const diffDays = Math.floor(diffHours / 24)

  if (diffDays > 0) return t('common.time.daysAgo', { n: diffDays })
  if (diffHours > 0) return t('common.time.hoursAgo', { n: diffHours })
  if (diffMins > 0) return t('common.time.minutesAgo', { n: diffMins })
  return t('common.time.justNow')
}

export function formatRelativeWithDateTime(
  date: string | Date | null | undefined,
  t: TranslateFn,
): string {
  if (!date) return ''

  const relativeTime = formatRelativeTime(date, t)
  const dateTime = formatDateTime(date)

  if (!dateTime || relativeTime === t('common.time.never')) {
    return relativeTime
  }

  return `${relativeTime} · ${dateTime}`
}

export function formatDateOnly(date: string | Date | null | undefined): string {
  return formatDate(date, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
}

export function formatReasoningEffort(effort: string | null | undefined): string {
  const raw = (effort ?? '').toString().trim()
  if (!raw) return '-'

  const normalized = raw.toLowerCase().replace(/[-_\s]/g, '')
  switch (normalized) {
    case 'low':
      return 'Low'
    case 'medium':
      return 'Medium'
    case 'high':
      return 'High'
    case 'xhigh':
    case 'extrahigh':
      return 'XHigh'
    case 'max':
      return 'Max'
    case 'none':
    case 'minimal':
      return '-'
    default:
      return raw.length > 1 ? raw[0].toUpperCase() + raw.slice(1) : raw.toUpperCase()
  }
}

export function formatCurrency(amount: number | null | undefined, currency: string = 'USD'): string {
  if (amount === null || amount === undefined) return '$0.00'

  const locale = getLocale()
  const fractionDigits = amount > 0 && amount < 0.01 ? 6 : 2

  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(amount)
}

export function formatNumber(num: number | null | undefined): string {
  if (num === null || num === undefined) return '0'

  const locale = getLocale()
  const absNum = Math.abs(num)

  const formatter = new Intl.NumberFormat(locale, {
    notation: absNum >= 10000 ? 'compact' : 'standard',
    maximumFractionDigits: 1,
  })

  return formatter.format(num)
}

export function formatDateTimeLocalInput(timestampSeconds: number | null): string {
  if (!timestampSeconds) return ''
  const date = new Date(timestampSeconds * 1000)
  if (isNaN(date.getTime())) return ''
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  return `${year}-${month}-${day}T${hours}:${minutes}`
}

export function parseDateTimeLocalInput(value: string): number | null {
  if (!value) return null
  const date = new Date(value)
  if (isNaN(date.getTime())) return null
  return Math.floor(date.getTime() / 1000)
}

export function formatTime(date: string | Date | null | undefined): string {
  return formatDate(date, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
}

export function formatCompactNumber(
  num: number | null | undefined,
  options?: { allowBillions?: boolean },
): string {
  if (num === null || num === undefined) return '0'

  const abs = Math.abs(num)
  const allowBillions = options?.allowBillions !== false

  if (allowBillions && abs >= 1_000_000_000) return `${(num / 1_000_000_000).toFixed(1)}B`
  if (abs >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`
  if (abs >= 1_000) return `${(num / 1_000).toFixed(1)}K`
  return num.toString()
}

export function formatCountdown(
  targetDate: string | Date | null | undefined,
  t: TranslateFn,
): string | null {
  if (!targetDate) return null

  const now = new Date()
  const target = new Date(targetDate)
  const diffMs = target.getTime() - now.getTime()

  if (diffMs <= 0 || isNaN(diffMs)) return null

  const diffMins = Math.floor(diffMs / (1000 * 60))
  const diffHours = Math.floor(diffMins / 60)
  const diffDays = Math.floor(diffHours / 24)

  const remainingHours = diffHours % 24
  const remainingMins = diffMins % 60

  if (diffDays > 0) {
    return t('common.time.countdown.daysHours', { d: diffDays, h: remainingHours })
  }
  if (diffHours > 0) {
    return t('common.time.countdown.hoursMinutes', { h: diffHours, m: remainingMins })
  }
  return t('common.time.countdown.minutes', { m: diffMins })
}

export function formatCountdownWithSuffix(
  targetDate: string | Date | null | undefined,
  t: TranslateFn,
): string | null {
  const countdown = formatCountdown(targetDate, t)
  if (!countdown) return null
  return t('common.time.countdown.withSuffix', { time: countdown })
}
