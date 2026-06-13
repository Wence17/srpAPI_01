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
