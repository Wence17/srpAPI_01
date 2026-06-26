'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import en from './locales/en'
import {
  type LocaleCode,
  type LocaleMessages,
  type TranslateParams,
  availableLocales,
  detectLocale,
  loadLocaleMessages,
  setCurrentLocale,
  translate,
} from './index'

type TranslateFn = (key: string, params?: TranslateParams | number | string) => string

interface I18nContextValue {
  locale: LocaleCode
  t: TranslateFn
  setLocale: (locale: LocaleCode) => Promise<void>
  availableLocales: typeof availableLocales
}

const I18nContext = createContext<I18nContextValue | undefined>(undefined)

const EN = en as LocaleMessages

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<LocaleCode>('en')
  const [messages, setMessages] = useState<LocaleMessages>(EN)

  useEffect(() => {
    const initial = detectLocale()
    setCurrentLocale(initial)
    if (initial === 'en') {
      setLocaleState('en')
      setMessages(EN)
      return
    }
    loadLocaleMessages(initial)
      .then((msgs) => {
        setMessages(msgs)
        setLocaleState(initial)
      })
      .catch(() => {
        // fall back to English silently
      })
  }, [])

  const setLocale = useCallback(async (next: LocaleCode) => {
    const msgs = await loadLocaleMessages(next)
    setCurrentLocale(next)
    setMessages(msgs)
    setLocaleState(next)
  }, [])

  const t = useCallback<TranslateFn>(
    (key, params) => translate(messages, EN, key, params),
    [messages],
  )

  const value = useMemo<I18nContextValue>(
    () => ({ locale, t, setLocale, availableLocales }),
    [locale, t, setLocale],
  )

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n(): I18nContextValue {
  const context = useContext(I18nContext)
  if (!context) {
    throw new Error('useI18n must be used within I18nProvider')
  }
  return context
}
