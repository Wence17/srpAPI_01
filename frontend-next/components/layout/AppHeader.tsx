'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useI18n } from '@/lib/i18n/I18nProvider'
import { useApp } from '@/context/AppContext'
import { useAuth } from '@/context/AuthContext'
import { useAdminSettingsStore } from '@/lib/stores/adminSettings'
import { useOnboardingStore } from '@/lib/stores/onboarding'
import { routeMeta, routeTitleKeys } from '@/lib/routeMeta'
import LocaleSwitcher from '@/components/common/LocaleSwitcher'
import SubscriptionProgressMini from '@/components/common/SubscriptionProgressMini'
import AnnouncementBell from '@/components/common/AnnouncementBell'
import Icon from '@/components/icons/Icon'

export default function AppHeader() {
  const { t } = useI18n()
  const pathname = usePathname() || ''
  const router = useRouter()

  const { contactInfo, docUrl, cachedPublicSettings, toggleMobileSidebar } = useApp()
  const { user, isAdmin, isSimpleMode, logout } = useAuth()
  const adminSettingsStore = useAdminSettingsStore()
  const onboardingStore = useOnboardingStore()

  const [dropdownOpen, setDropdownOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement | null>(null)

  const avatarUrl = user?.avatar_url?.trim() || ''

  // Only show onboarding button for standard-mode admins.
  const showOnboardingButton = !isSimpleMode && user?.role === 'admin'

  const userInitials = useMemo(() => {
    if (!user) return ''
    if (user.username) {
      return user.username.substring(0, 2).toUpperCase()
    }
    if (user.email) {
      const localPart = user.email.split('@')[0]
      return localPart.substring(0, 2).toUpperCase()
    }
    return ''
  }, [user])

  const displayName = useMemo(() => {
    if (!user) return ''
    return user.username || user.email?.split('@')[0] || ''
  }, [user])

  const pageTitle = useMemo(() => {
    if (pathname.startsWith('/custom/')) {
      const id = pathname.slice('/custom/'.length)
      const publicItems = cachedPublicSettings?.custom_menu_items ?? []
      const menuItem =
        publicItems.find((item) => item.id === id) ??
        (isAdmin ? adminSettingsStore.customMenuItems.find((item) => item.id === id) : undefined)
      if (menuItem?.label) return menuItem.label
    }
    const keys = routeTitleKeys[pathname]
    if (keys?.titleKey) return t(keys.titleKey)
    return routeMeta[pathname]?.title ?? ''
  }, [pathname, cachedPublicSettings, isAdmin, adminSettingsStore.customMenuItems, t])

  const pageDescription = useMemo(() => {
    const keys = routeTitleKeys[pathname]
    if (keys?.descriptionKey) return t(keys.descriptionKey)
    return ''
  }, [pathname, t])

  function toggleMobileSidebarHandler() {
    toggleMobileSidebar()
  }

  function toggleDropdown() {
    setDropdownOpen((prev) => !prev)
  }

  function closeDropdown() {
    setDropdownOpen(false)
  }

  async function handleLogout() {
    closeDropdown()
    try {
      await logout()
    } catch (error) {
      console.error('Logout error:', error)
    }
    router.push('/login')
  }

  function handleReplayGuide() {
    closeDropdown()
    onboardingStore.replay()
  }

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        closeDropdown()
      }
    }
    document.addEventListener('click', handleClickOutside)
    return () => document.removeEventListener('click', handleClickOutside)
  }, [])

  return (
    <header className="glass sticky top-0 z-30 border-b border-gray-200/50 dark:border-dark-700/50">
      <div className="flex h-16 items-center justify-between px-4 md:px-6">
        {/* Left: Mobile Menu Toggle + Page Title */}
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={toggleMobileSidebarHandler}
            className="btn-ghost btn-icon lg:hidden"
            aria-label="Toggle Menu"
          >
            <Icon name="menu" size="md" />
          </button>

          <div className="hidden lg:block">
            <h1 className="text-lg font-semibold text-gray-900 dark:text-white">{pageTitle}</h1>
            {pageDescription ? (
              <p className="text-xs text-gray-500 dark:text-dark-400">{pageDescription}</p>
            ) : null}
          </div>
        </div>

        {/* Right */}
        <div className="flex items-center gap-3">
          {user ? <AnnouncementBell /> : null}

          {docUrl ? (
            <a
              href={docUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900 dark:text-dark-400 dark:hover:bg-dark-800 dark:hover:text-white"
            >
              <Icon name="book" size="sm" />
              <span className="hidden sm:inline">{t('nav.docs')}</span>
            </a>
          ) : null}

          <LocaleSwitcher />

          {user ? <SubscriptionProgressMini /> : null}

          {/* Balance Display */}
          {user ? (
            <div className="hidden items-center gap-2 rounded-xl bg-primary-50 px-3 py-1.5 dark:bg-primary-900/20 sm:flex">
              <svg className="h-4 w-4 text-primary-600 dark:text-primary-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z"
                />
              </svg>
              <span className="text-sm font-semibold text-primary-700 dark:text-primary-300">
                ${user.balance?.toFixed(2) || '0.00'}
              </span>
            </div>
          ) : null}

          {/* User Dropdown */}
          {user ? (
            <div className="relative" ref={dropdownRef}>
              <button
                type="button"
                onClick={toggleDropdown}
                className="flex items-center gap-2 rounded-xl p-1.5 transition-colors hover:bg-gray-100 dark:hover:bg-dark-800"
                aria-label="User Menu"
              >
                <div className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-xl bg-gradient-to-br from-primary-500 to-primary-600 text-sm font-medium text-white shadow-sm">
                  {avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={avatarUrl} alt={displayName} className="h-full w-full object-cover" />
                  ) : (
                    <span>{userInitials}</span>
                  )}
                </div>
                <div className="hidden text-left md:block">
                  <div className="text-sm font-medium text-gray-900 dark:text-white">{displayName}</div>
                  <div className="text-xs capitalize text-gray-500 dark:text-dark-400">{user.role}</div>
                </div>
                <Icon name="chevronDown" size="sm" className="hidden text-gray-400 md:block" />
              </button>

              {/* Dropdown Menu */}
              {dropdownOpen ? (
                <div className="dropdown right-0 mt-2 w-56">
                  {/* User Info */}
                  <div className="border-b border-gray-100 px-4 py-3 dark:border-dark-700">
                    <div className="text-sm font-medium text-gray-900 dark:text-white">{displayName}</div>
                    <div className="text-xs text-gray-500 dark:text-dark-400">{user.email}</div>
                  </div>

                  {/* Balance (mobile only) */}
                  <div className="border-b border-gray-100 px-4 py-2 dark:border-dark-700 sm:hidden">
                    <div className="text-xs text-gray-500 dark:text-dark-400">{t('common.balance')}</div>
                    <div className="text-sm font-semibold text-primary-600 dark:text-primary-400">
                      ${user.balance?.toFixed(2) || '0.00'}
                    </div>
                  </div>

                  <div className="py-1">
                    <Link href="/profile" onClick={closeDropdown} className="dropdown-item">
                      <Icon name="user" size="sm" />
                      {t('nav.profile')}
                    </Link>

                    <Link href="/keys" onClick={closeDropdown} className="dropdown-item">
                      <Icon name="key" size="sm" />
                      {t('nav.apiKeys')}
                    </Link>

                    {isAdmin ? (
                      <a
                        href="https://github.com/Wei-Shaw/sub2api"
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={closeDropdown}
                        className="dropdown-item"
                      >
                        <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                          <path
                            fillRule="evenodd"
                            clipRule="evenodd"
                            d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.17 6.839 9.49.5.092.682-.217.682-.482 0-.237-.008-.866-.013-1.7-2.782.604-3.369-1.34-3.369-1.34-.454-1.156-1.11-1.464-1.11-1.464-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.831.092-.646.35-1.086.636-1.336-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.578 9.578 0 0112 6.836c.85.004 1.705.114 2.504.336 1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.578.688.48C19.138 20.167 22 16.418 22 12c0-5.523-4.477-10-10-10z"
                          />
                        </svg>
                        {t('nav.github')}
                      </a>
                    ) : null}
                  </div>

                  {/* Contact Support (only show if configured) */}
                  {contactInfo ? (
                    <div className="border-t border-gray-100 px-4 py-2.5 dark:border-dark-700">
                      <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                        <svg className="h-3.5 w-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M20.25 8.511c.884.284 1.5 1.128 1.5 2.097v4.286c0 1.136-.847 2.1-1.98 2.193-.34.027-.68.052-1.02.072v3.091l-3-3c-1.354 0-2.694-.055-4.02-.163a2.115 2.115 0 01-.825-.242m9.345-8.334a2.126 2.126 0 00-.476-.095 48.64 48.64 0 00-8.048 0c-1.131.094-1.976 1.057-1.976 2.192v4.286c0 .837.46 1.58 1.155 1.951m9.345-8.334V6.637c0-1.621-1.152-3.026-2.76-3.235A48.455 48.455 0 0011.25 3c-2.115 0-4.198.137-6.24.402-1.608.209-2.76 1.614-2.76 3.235v6.226c0 1.621 1.152 3.026 2.76 3.235.577.075 1.157.14 1.74.194V21l4.155-4.155"
                          />
                        </svg>
                        <span>{t('common.contactSupport')}:</span>
                        <span className="font-medium text-gray-700 dark:text-gray-300">{contactInfo}</span>
                      </div>
                    </div>
                  ) : null}

                  {showOnboardingButton ? (
                    <div className="border-t border-gray-100 py-1 dark:border-dark-700">
                      <button type="button" onClick={handleReplayGuide} className="dropdown-item w-full">
                        <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M12 2a10 10 0 100 20 10 10 0 000-20zm0 14a1 1 0 110 2 1 1 0 010-2zm1.07-7.75c0-.6-.49-1.25-1.32-1.25-.7 0-1.22.4-1.43 1.02a1 1 0 11-1.9-.62A3.41 3.41 0 0111.8 5c2.02 0 3.25 1.4 3.25 2.9 0 2-1.83 2.55-2.43 3.12-.43.4-.47.75-.47 1.23a1 1 0 01-2 0c0-1 .16-1.82 1.1-2.7.69-.64 1.82-1.05 1.82-2.06z" />
                        </svg>
                        {t('onboarding.restartTour')}
                      </button>
                    </div>
                  ) : null}

                  <div className="border-t border-gray-100 py-1 dark:border-dark-700">
                    <button
                      type="button"
                      onClick={handleLogout}
                      className="dropdown-item w-full text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20"
                    >
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75"
                        />
                      </svg>
                      {t('nav.logout')}
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </header>
  )
}
