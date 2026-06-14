'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import LocaleSwitcher from '@/components/common/LocaleSwitcher'
import Icon from '@/components/icons/Icon'
import { useApp } from '@/context/AppContext'
import { useAuth } from '@/context/AuthContext'
import { useI18n } from '@/lib/i18n'
import { sanitizeHtml } from '@/lib/sanitize'
import { sanitizeUrl } from '@/lib/url'
import styles from './home.module.css'

const GITHUB_URL = 'https://github.com/Wei-Shaw/sub2api'

function initTheme(): boolean {
  if (typeof window === 'undefined') return false
  const savedTheme = localStorage.getItem('theme')
  const dark =
    savedTheme === 'dark' ||
    (!savedTheme && window.matchMedia('(prefers-color-scheme: dark)').matches)
  document.documentElement.classList.toggle('dark', dark)
  return dark
}

export default function HomePageContent() {
  const { t } = useI18n()
  const auth = useAuth()
  const app = useApp()

  const [isDark, setIsDark] = useState(false)
  const [mounted, setMounted] = useState(false)

  const siteName =
    app.cachedPublicSettings?.site_name || app.siteName || 'Sub2API'
  const siteLogo = app.cachedPublicSettings?.site_logo || app.siteLogo || ''
  const siteSubtitle =
    app.cachedPublicSettings?.site_subtitle || 'AI API Gateway Platform'
  const docUrl = app.cachedPublicSettings?.doc_url || app.docUrl || ''
  const homeContent = app.cachedPublicSettings?.home_content || ''

  const safeDocUrl = useMemo(() => sanitizeUrl(docUrl), [docUrl])

  const isHomeContentUrl = useMemo(() => {
    const content = homeContent.trim()
    return content.startsWith('http://') || content.startsWith('https://')
  }, [homeContent])

  const homeContentIframeSrc = useMemo(
    () => (isHomeContentUrl ? sanitizeUrl(homeContent.trim()) : ''),
    [homeContent, isHomeContentUrl],
  )

  const sanitizedHomeHtml = useMemo(
    () => (!isHomeContentUrl && homeContent ? sanitizeHtml(homeContent) : ''),
    [homeContent, isHomeContentUrl],
  )

  const dashboardPath = auth.isAdmin ? '/admin/dashboard' : '/dashboard'
  const userInitial = auth.user?.email?.charAt(0).toUpperCase() ?? ''
  const currentYear = new Date().getFullYear()

  function toggleTheme() {
    setIsDark((prev) => {
      const next = !prev
      document.documentElement.classList.toggle('dark', next)
      localStorage.setItem('theme', next ? 'dark' : 'light')
      return next
    })
  }

  useEffect(() => {
    setIsDark(initTheme())
    setMounted(true)
    auth.checkAuth()
    if (!app.publicSettingsLoaded) {
      void app.fetchPublicSettings()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only init
  }, [])

  if (!mounted) {
    return null
  }

  if (homeContent) {
    if (isHomeContentUrl && homeContentIframeSrc) {
      return (
        <div className="min-h-screen">
          <iframe
            src={homeContentIframeSrc}
            className="h-screen w-full border-0"
            allowFullScreen
            title={siteName}
          />
        </div>
      )
    }

    if (sanitizedHomeHtml) {
      return (
        <div className="min-h-screen">
          <div dangerouslySetInnerHTML={{ __html: sanitizedHomeHtml }} />
        </div>
      )
    }
  }

  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden bg-gradient-to-br from-gray-50 via-primary-50/30 to-gray-100 dark:from-dark-950 dark:via-dark-900 dark:to-dark-950">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -right-40 -top-40 h-96 w-96 rounded-full bg-primary-400/20 blur-3xl" />
        <div className="absolute -bottom-40 -left-40 h-96 w-96 rounded-full bg-primary-500/15 blur-3xl" />
        <div className="absolute left-1/3 top-1/4 h-72 w-72 rounded-full bg-primary-300/10 blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 h-64 w-64 rounded-full bg-primary-400/10 blur-3xl" />
        <div className="absolute inset-0 bg-[linear-gradient(rgba(20,184,166,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(20,184,166,0.03)_1px,transparent_1px)] bg-[size:64px_64px]" />
      </div>

      <header className="relative z-20 px-6 py-4">
        <nav className="mx-auto flex max-w-6xl items-center justify-between">
          <div className="flex items-center">
            <div className="h-10 w-10 overflow-hidden rounded-xl shadow-md">
              <img
                src={siteLogo || '/logo.png'}
                alt="Logo"
                className="h-full w-full object-contain"
              />
            </div>
          </div>

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

            {auth.isAuthenticated ? (
              <Link
                href={dashboardPath}
                className="inline-flex items-center gap-1.5 rounded-full bg-gray-900 py-1 pl-1 pr-2.5 transition-colors hover:bg-gray-800 dark:bg-gray-800 dark:hover:bg-gray-700"
              >
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-gradient-to-br from-primary-400 to-primary-600 text-[10px] font-semibold text-white">
                  {userInitial}
                </span>
                <span className="text-xs font-medium text-white">{t('home.dashboard')}</span>
                <svg
                  className="h-3 w-3 text-gray-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M4.5 19.5l15-15m0 0H8.25m11.25 0v11.25"
                  />
                </svg>
              </Link>
            ) : (
              <Link
                href="/login"
                className="inline-flex items-center rounded-full bg-gray-900 px-3 py-1 text-xs font-medium text-white transition-colors hover:bg-gray-800 dark:bg-gray-800 dark:hover:bg-gray-700"
              >
                {t('home.login')}
              </Link>
            )}
          </div>
        </nav>
      </header>

      <main className="relative z-10 flex-1 px-6 py-16">
        <div className="mx-auto max-w-6xl">
          <div className="mb-12 flex flex-col items-center justify-between gap-12 lg:flex-row lg:gap-16">
            <div className="flex-1 text-center lg:text-left">
              <h1 className="mb-4 text-4xl font-bold text-gray-900 dark:text-white md:text-5xl lg:text-6xl">
                {siteName}
              </h1>
              <p className="mb-8 text-lg text-gray-600 dark:text-dark-300 md:text-xl">
                {siteSubtitle}
              </p>
              <div>
                <Link
                  href={auth.isAuthenticated ? dashboardPath : '/login'}
                  className="btn btn-primary px-8 py-3 text-base shadow-lg shadow-primary-500/30"
                >
                  {auth.isAuthenticated ? t('home.goToDashboard') : t('home.getStarted')}
                  <Icon name="arrowRight" size="md" className="ml-2" strokeWidth={2} />
                </Link>
              </div>
            </div>

            <div className="flex flex-1 justify-center lg:justify-end">
              <div className={styles.terminalContainer}>
                <div className={styles.terminalWindow}>
                  <div className={styles.terminalHeader}>
                    <div className={styles.terminalButtons}>
                      <span className={styles.btnClose} />
                      <span className={styles.btnMinimize} />
                      <span className={styles.btnMaximize} />
                    </div>
                    <span className={styles.terminalTitle}>terminal</span>
                  </div>
                  <div className={styles.terminalBody}>
                    <div className={`${styles.codeLine} ${styles.line1}`}>
                      <span className={styles.codePrompt}>$</span>
                      <span className={styles.codeCmd}>curl</span>
                      <span className={styles.codeFlag}>-X POST</span>
                      <span className={styles.codeUrl}>/v1/messages</span>
                    </div>
                    <div className={`${styles.codeLine} ${styles.line2}`}>
                      <span className={styles.codeComment}># Routing to upstream...</span>
                    </div>
                    <div className={`${styles.codeLine} ${styles.line3}`}>
                      <span className={styles.codeSuccess}>200 OK</span>
                      <span className={styles.codeResponse}>{'{ "content": "Hello!" }'}</span>
                    </div>
                    <div className={`${styles.codeLine} ${styles.line4}`}>
                      <span className={styles.codePrompt}>$</span>
                      <span className={styles.cursor} />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="mb-12 flex flex-wrap items-center justify-center gap-4 md:gap-6">
            <div className="inline-flex items-center gap-2.5 rounded-full border border-gray-200/50 bg-white/80 px-5 py-2.5 shadow-sm backdrop-blur-sm dark:border-dark-700/50 dark:bg-dark-800/80">
              <Icon name="swap" size="sm" className="text-primary-500" />
              <span className="text-sm font-medium text-gray-700 dark:text-dark-200">
                {t('home.tags.subscriptionToApi')}
              </span>
            </div>
            <div className="inline-flex items-center gap-2.5 rounded-full border border-gray-200/50 bg-white/80 px-5 py-2.5 shadow-sm backdrop-blur-sm dark:border-dark-700/50 dark:bg-dark-800/80">
              <Icon name="shield" size="sm" className="text-primary-500" />
              <span className="text-sm font-medium text-gray-700 dark:text-dark-200">
                {t('home.tags.stickySession')}
              </span>
            </div>
            <div className="inline-flex items-center gap-2.5 rounded-full border border-gray-200/50 bg-white/80 px-5 py-2.5 shadow-sm backdrop-blur-sm dark:border-dark-700/50 dark:bg-dark-800/80">
              <Icon name="chart" size="sm" className="text-primary-500" />
              <span className="text-sm font-medium text-gray-700 dark:text-dark-200">
                {t('home.tags.realtimeBilling')}
              </span>
            </div>
          </div>

          <div className="mb-12 grid gap-6 md:grid-cols-3">
            <div className="group rounded-2xl border border-gray-200/50 bg-white/60 p-6 backdrop-blur-sm transition-all duration-300 hover:shadow-xl hover:shadow-primary-500/10 dark:border-dark-700/50 dark:bg-dark-800/60">
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 shadow-lg shadow-blue-500/30 transition-transform group-hover:scale-110">
                <Icon name="server" size="lg" className="text-white" />
              </div>
              <h3 className="mb-2 text-lg font-semibold text-gray-900 dark:text-white">
                {t('home.features.unifiedGateway')}
              </h3>
              <p className="text-sm leading-relaxed text-gray-600 dark:text-dark-400">
                {t('home.features.unifiedGatewayDesc')}
              </p>
            </div>

            <div className="group rounded-2xl border border-gray-200/50 bg-white/60 p-6 backdrop-blur-sm transition-all duration-300 hover:shadow-xl hover:shadow-primary-500/10 dark:border-dark-700/50 dark:bg-dark-800/60">
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-primary-500 to-primary-600 shadow-lg shadow-primary-500/30 transition-transform group-hover:scale-110">
                <svg
                  className="h-6 w-6 text-white"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth="1.5"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z"
                  />
                </svg>
              </div>
              <h3 className="mb-2 text-lg font-semibold text-gray-900 dark:text-white">
                {t('home.features.multiAccount')}
              </h3>
              <p className="text-sm leading-relaxed text-gray-600 dark:text-dark-400">
                {t('home.features.multiAccountDesc')}
              </p>
            </div>

            <div className="group rounded-2xl border border-gray-200/50 bg-white/60 p-6 backdrop-blur-sm transition-all duration-300 hover:shadow-xl hover:shadow-primary-500/10 dark:border-dark-700/50 dark:bg-dark-800/60">
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-purple-500 to-purple-600 shadow-lg shadow-purple-500/30 transition-transform group-hover:scale-110">
                <svg
                  className="h-6 w-6 text-white"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth="1.5"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z"
                  />
                </svg>
              </div>
              <h3 className="mb-2 text-lg font-semibold text-gray-900 dark:text-white">
                {t('home.features.balanceQuota')}
              </h3>
              <p className="text-sm leading-relaxed text-gray-600 dark:text-dark-400">
                {t('home.features.balanceQuotaDesc')}
              </p>
            </div>
          </div>

          <div className="mb-8 text-center">
            <h2 className="mb-3 text-2xl font-bold text-gray-900 dark:text-white">
              {t('home.providers.title')}
            </h2>
            <p className="text-sm text-gray-600 dark:text-dark-400">
              {t('home.providers.description')}
            </p>
          </div>

          <div className="mb-16 flex flex-wrap items-center justify-center gap-4">
            <div className="flex items-center gap-2 rounded-xl border border-primary-200 bg-white/60 px-5 py-3 ring-1 ring-primary-500/20 backdrop-blur-sm dark:border-primary-800 dark:bg-dark-800/60">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-orange-400 to-orange-500">
                <span className="text-xs font-bold text-white">C</span>
              </div>
              <span className="text-sm font-medium text-gray-700 dark:text-dark-200">
                {t('home.providers.claude')}
              </span>
              <span className="rounded bg-primary-100 px-1.5 py-0.5 text-[10px] font-medium text-primary-600 dark:bg-primary-900/30 dark:text-primary-400">
                {t('home.providers.supported')}
              </span>
            </div>
            <div className="flex items-center gap-2 rounded-xl border border-primary-200 bg-white/60 px-5 py-3 ring-1 ring-primary-500/20 backdrop-blur-sm dark:border-primary-800 dark:bg-dark-800/60">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-green-500 to-green-600">
                <span className="text-xs font-bold text-white">G</span>
              </div>
              <span className="text-sm font-medium text-gray-700 dark:text-dark-200">GPT</span>
              <span className="rounded bg-primary-100 px-1.5 py-0.5 text-[10px] font-medium text-primary-600 dark:bg-primary-900/30 dark:text-primary-400">
                {t('home.providers.supported')}
              </span>
            </div>
            <div className="flex items-center gap-2 rounded-xl border border-primary-200 bg-white/60 px-5 py-3 ring-1 ring-primary-500/20 backdrop-blur-sm dark:border-primary-800 dark:bg-dark-800/60">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-blue-600">
                <span className="text-xs font-bold text-white">G</span>
              </div>
              <span className="text-sm font-medium text-gray-700 dark:text-dark-200">
                {t('home.providers.gemini')}
              </span>
              <span className="rounded bg-primary-100 px-1.5 py-0.5 text-[10px] font-medium text-primary-600 dark:bg-primary-900/30 dark:text-primary-400">
                {t('home.providers.supported')}
              </span>
            </div>
            <div className="flex items-center gap-2 rounded-xl border border-primary-200 bg-white/60 px-5 py-3 ring-1 ring-primary-500/20 backdrop-blur-sm dark:border-primary-800 dark:bg-dark-800/60">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-rose-500 to-pink-600">
                <span className="text-xs font-bold text-white">A</span>
              </div>
              <span className="text-sm font-medium text-gray-700 dark:text-dark-200">
                {t('home.providers.antigravity')}
              </span>
              <span className="rounded bg-primary-100 px-1.5 py-0.5 text-[10px] font-medium text-primary-600 dark:bg-primary-900/30 dark:text-primary-400">
                {t('home.providers.supported')}
              </span>
            </div>
            <div className="flex items-center gap-2 rounded-xl border border-gray-200/50 bg-white/40 px-5 py-3 opacity-60 backdrop-blur-sm dark:border-dark-700/50 dark:bg-dark-800/40">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-gray-500 to-gray-600">
                <span className="text-xs font-bold text-white">+</span>
              </div>
              <span className="text-sm font-medium text-gray-700 dark:text-dark-200">
                {t('home.providers.more')}
              </span>
              <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-500 dark:bg-dark-700 dark:text-dark-400">
                {t('home.providers.soon')}
              </span>
            </div>
          </div>
        </div>
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
