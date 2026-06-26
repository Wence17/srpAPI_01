import en from './locales/en'

export type LocaleCode = 'en' | 'zh'
export type LocaleMessages = Record<string, unknown>

const LOCALE_KEY = 'sub2api_locale'
const DEFAULT_LOCALE: LocaleCode = 'en'

export const availableLocales = [
  { code: 'en', name: 'English', flag: '🇺🇸' },
  { code: 'zh', name: '中文', flag: '🇨🇳' },
] as const

const localeLoaders: Record<LocaleCode, () => Promise<LocaleMessages>> = {
  en: async () => en as LocaleMessages,
  zh: async () => (await import('./locales/zh')).default as LocaleMessages,
}

const loadedMessages: Partial<Record<LocaleCode, LocaleMessages>> = {
  en: en as LocaleMessages,
}

export function isLocaleCode(value: string): value is LocaleCode {
  return value === 'en' || value === 'zh'
}

let currentLocale: LocaleCode = DEFAULT_LOCALE
let initialized = false

export function detectLocale(): LocaleCode {
  if (typeof window === 'undefined') return DEFAULT_LOCALE
  try {
    const saved = window.localStorage.getItem(LOCALE_KEY)
    if (saved && isLocaleCode(saved)) return saved
  } catch {
    // ignore storage access errors
  }
  const browserLang = (typeof navigator !== 'undefined' ? navigator.language : '').toLowerCase()
  if (browserLang.startsWith('zh')) return 'zh'
  return DEFAULT_LOCALE
}

/**
 * Returns the active locale code. Used by the API client to set Accept-Language.
 * Mirrors the original vue-i18n `getLocale()` helper.
 */
export function getLocale(): LocaleCode {
  if (!initialized && typeof window !== 'undefined') {
    currentLocale = detectLocale()
    initialized = true
  }
  return currentLocale
}

export function setCurrentLocale(locale: LocaleCode): void {
  currentLocale = locale
  initialized = true
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(LOCALE_KEY, locale)
    } catch {
      // ignore storage access errors
    }
    document.documentElement.setAttribute('lang', locale)
  }
}

export async function loadLocaleMessages(locale: LocaleCode): Promise<LocaleMessages> {
  const cached = loadedMessages[locale]
  if (cached) return cached
  const msgs = await localeLoaders[locale]()
  loadedMessages[locale] = msgs
  return msgs
}

// ==================== Translation ====================

export type TranslateParams = Record<string, unknown> | unknown[]

function resolveKey(messages: LocaleMessages, key: string): unknown {
  return key.split('.').reduce<unknown>((acc, part) => {
    if (acc && typeof acc === 'object') {
      return (acc as Record<string, unknown>)[part]
    }
    return undefined
  }, messages)
}

function interpolate(template: string, params?: TranslateParams): string {
  if (!params) return template
  return template.replace(/\{(\w+)\}/g, (_match, name: string) => {
    if (Array.isArray(params)) {
      const idx = Number(name)
      return Number.isInteger(idx) && params[idx] != null ? String(params[idx]) : `{${name}}`
    }
    const value = (params as Record<string, unknown>)[name]
    return value != null ? String(value) : `{${name}}`
  })
}

function choosePlural(message: string, count: number): string {
  const parts = message.split('|').map((part) => part.trim())
  if (parts.length <= 1) return message
  if (parts.length === 2) return count === 1 ? parts[0] : parts[1]
  if (count === 0) return parts[0]
  return count === 1 ? parts[1] : parts[2]
}

/**
 * vue-i18n compatible translate.
 *
 * Supports the call shapes used across the app:
 *   t(key)
 *   t(key, { named: 'value' })   → named interpolation
 *   t(key, [a, b])               → list interpolation
 *   t(key, count)                → pluralization with {count}/{n}
 *   t(key, 'default message')    → default message when key is missing
 */
export function translate(
  messages: LocaleMessages,
  fallback: LocaleMessages,
  key: string,
  params?: TranslateParams | number | string,
): string {
  let raw = resolveKey(messages, key)
  if (raw == null) raw = resolveKey(fallback, key)

  if (typeof params === 'string') {
    return typeof raw === 'string' ? raw : params
  }

  if (typeof raw !== 'string') return key

  let text: string = raw

  if (typeof params === 'number') {
    return interpolate(choosePlural(text, params), { count: params, n: params })
  }

  if (text.includes('|') && params && !Array.isArray(params)) {
    const countRaw = (params as Record<string, unknown>).count ?? (params as Record<string, unknown>).n
    const count = Number(countRaw)
    if (!Number.isNaN(count)) text = choosePlural(text, count)
  }

  return interpolate(text, params)
}

export { useI18n, I18nProvider } from './I18nProvider'

export default {
  availableLocales,
  getLocale,
  setCurrentLocale,
  detectLocale,
  loadLocaleMessages,
  translate,
}
