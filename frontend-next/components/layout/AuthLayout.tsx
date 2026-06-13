'use client'

import { useEffect } from 'react'
import { useApp } from '@/context/AppContext'
import { sanitizeUrl } from '@/lib/url'

interface AuthLayoutProps {
  children: React.ReactNode
  footer?: React.ReactNode
}

export default function AuthLayout({ children, footer }: AuthLayoutProps) {
  const { siteName, siteLogo, cachedPublicSettings, publicSettingsLoaded, fetchPublicSettings } = useApp()

  useEffect(() => {
    fetchPublicSettings()
  }, [fetchPublicSettings])

  const siteSubtitle =
    cachedPublicSettings?.site_subtitle || 'Subscription to API Conversion Platform'
  const logoSrc = sanitizeUrl(siteLogo || '', { allowRelative: true, allowDataUrl: true }) || '/logo.png'
  const currentYear = new Date().getFullYear()

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden p-4">
      <div className="absolute inset-0 bg-gradient-to-br from-gray-50 via-primary-50/30 to-gray-100 dark:from-dark-950 dark:via-dark-900 dark:to-dark-950" />

      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -right-40 -top-40 h-80 w-80 rounded-full bg-primary-400/20 blur-3xl" />
        <div className="absolute -bottom-40 -left-40 h-80 w-80 rounded-full bg-primary-500/15 blur-3xl" />
        <div className="absolute left-1/2 top-1/2 h-96 w-96 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary-300/10 blur-3xl" />
        <div className="absolute inset-0 bg-[linear-gradient(rgba(20,184,166,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(20,184,166,0.03)_1px,transparent_1px)] bg-[size:64px_64px]" />
      </div>

      <div className="relative z-10 w-full max-w-md">
        <div className="mb-8 text-center">
          {publicSettingsLoaded && (
            <>
              <div className="mb-4 inline-flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl shadow-lg shadow-primary-500/30">
                <img src={logoSrc} alt="Logo" className="h-full w-full object-contain" />
              </div>
              <h1 className="text-gradient mb-2 text-3xl font-bold">{siteName}</h1>
              <p className="text-sm text-gray-500 dark:text-dark-400">{siteSubtitle}</p>
            </>
          )}
        </div>

        <div className="card-glass rounded-2xl p-8 shadow-glass">{children}</div>

        {footer && <div className="mt-6 text-center text-sm">{footer}</div>}

        <div className="mt-8 text-center text-xs text-gray-400 dark:text-dark-500">
          &copy; {currentYear} {siteName}. All rights reserved.
        </div>
      </div>
    </div>
  )
}
