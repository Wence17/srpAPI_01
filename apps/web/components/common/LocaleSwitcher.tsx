'use client'

import { useEffect, useRef, useState } from 'react'
import { useI18n } from '@/lib/i18n/I18nProvider'
import { type LocaleCode } from '@/lib/i18n'
import Icon from '@/components/icons/Icon'

export default function LocaleSwitcher() {
  const { locale, setLocale, availableLocales } = useI18n()

  const [isOpen, setIsOpen] = useState(false)
  const [switching, setSwitching] = useState(false)
  const dropdownRef = useRef<HTMLDivElement | null>(null)

  const currentLocaleCode = locale
  const currentLocale = availableLocales.find((l) => l.code === locale)

  function toggleDropdown() {
    setIsOpen((prev) => !prev)
  }

  async function selectLocale(code: LocaleCode) {
    if (switching || code === currentLocaleCode) {
      setIsOpen(false)
      return
    }
    setSwitching(true)
    try {
      await setLocale(code)
      setIsOpen(false)
    } finally {
      setSwitching(false)
    }
  }

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('click', handleClickOutside)
    return () => document.removeEventListener('click', handleClickOutside)
  }, [])

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={toggleDropdown}
        disabled={switching}
        className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-dark-700"
        title={currentLocale?.name}
      >
        <span className="text-base">{currentLocale?.flag}</span>
        <span className="hidden sm:inline">{currentLocale?.code.toUpperCase()}</span>
        <Icon
          name="chevronDown"
          size="xs"
          className={`text-gray-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {isOpen ? (
        <div className="absolute right-0 z-50 mt-1 w-32 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg dark:border-dark-700 dark:bg-dark-800">
          {availableLocales.map((localeItem) => (
            <button
              key={localeItem.code}
              type="button"
              disabled={switching}
              onClick={() => selectLocale(localeItem.code)}
              className={`flex w-full items-center gap-2 px-3 py-2 text-sm text-gray-700 transition-colors hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-dark-700 ${
                localeItem.code === currentLocaleCode
                  ? 'bg-primary-50 text-primary-600 dark:bg-primary-900/20 dark:text-primary-400'
                  : ''
              }`}
            >
              <span className="text-base">{localeItem.flag}</span>
              <span>{localeItem.name}</span>
              {localeItem.code === currentLocaleCode ? (
                <Icon name="check" size="sm" className="ml-auto text-primary-500" />
              ) : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}
