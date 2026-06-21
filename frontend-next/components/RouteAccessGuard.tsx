'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useAuth } from '@/context/AuthContext'
import { useApp } from '@/context/AppContext'
import { useAdminSettingsStore } from '@/lib/stores/adminSettings'
import { useI18n } from '@/lib/i18n'
import { getSetupStatus } from '@/lib/setup'
import { resolveRouteMeta } from '@/lib/resolveRouteMeta'
import { routeMeta, routeTitleKeys, type RouteMeta } from '@/lib/routeMeta'
import { evaluateRouteAccess, routeRequiresAuth } from '@/lib/routeAccess'
import { resolveCompletedSetupRedirectPath } from '@/lib/setupRedirect'

function buildRedirectUrl(path: string, search?: Record<string, string>): string {
  if (!search || Object.keys(search).length === 0) return path
  const params = new URLSearchParams(search)
  return `${path}?${params.toString()}`
}

function RouteGuardLoading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 dark:bg-dark-950">
      <div
        className="h-8 w-8 animate-spin rounded-full border-2 border-primary-500 border-t-transparent"
        role="status"
        aria-label="Loading"
      />
    </div>
  )
}

function needsPublicSettings(meta: RouteMeta, backendModeEnabled: boolean): boolean {
  return (
    !!meta.requiresPayment ||
    !!meta.requiresRiskControl ||
    backendModeEnabled ||
    !routeRequiresAuth(meta)
  )
}

export default function RouteAccessGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || '/'
  const router = useRouter()
  const searchParams = useSearchParams()
  const { t } = useI18n()
  const auth = useAuth()
  const app = useApp()
  const adminSettingsStore = useAdminSettingsStore()

  const [setupChecked, setSetupChecked] = useState(pathname !== '/setup')
  const redirectingRef = useRef(false)

  const meta = useMemo(() => resolveRouteMeta(pathname), [pathname])

  const paymentEnabled = app.cachedPublicSettings?.payment_enabled === true
  const riskControlEnabled = app.cachedPublicSettings?.risk_control_enabled === true

  const accessDecision = useMemo(() => {
    if (!meta || !setupChecked) return { allowed: true as const }
    if (needsPublicSettings(meta, app.backendModeEnabled) && !app.publicSettingsLoaded) {
      return { allowed: true as const }
    }
    return evaluateRouteAccess({
      path: pathname,
      meta,
      isAuthenticated: auth.isAuthenticated,
      isAdmin: auth.isAdmin,
      isSimpleMode: auth.isSimpleMode,
      backendModeEnabled: app.backendModeEnabled,
      hasPendingAuthSession: !!auth.pendingAuthSession,
      paymentEnabled,
      riskControlEnabled,
    })
  }, [
    meta,
    setupChecked,
    app.publicSettingsLoaded,
    app.backendModeEnabled,
    pathname,
    auth.isAuthenticated,
    auth.isAdmin,
    auth.isSimpleMode,
    auth.pendingAuthSession,
    paymentEnabled,
    riskControlEnabled,
  ])

  useEffect(() => {
    if (pathname !== '/setup') {
      setSetupChecked(true)
      return
    }

    let cancelled = false
    getSetupStatus()
      .then((status) => {
        if (cancelled) return
        if (!status.needs_setup) {
          router.replace(resolveCompletedSetupRedirectPath(auth.isAuthenticated, auth.isAdmin))
          return
        }
        setSetupChecked(true)
      })
      .catch(() => {
        if (!cancelled) setSetupChecked(true)
      })

    return () => {
      cancelled = true
    }
  }, [pathname, auth.isAuthenticated, auth.isAdmin, router])

  useEffect(() => {
    if (!meta) {
      document.title = '404 Not Found'
      return
    }

    if (pathname.startsWith('/custom/')) {
      const id = pathname.slice('/custom/'.length)
      const publicItems = app.cachedPublicSettings?.custom_menu_items ?? []
      const menuItem =
        publicItems.find((item) => item.id === id) ??
        (auth.isAdmin
          ? adminSettingsStore.customMenuItems.find((item) => item.id === id)
          : undefined)
      if (menuItem?.label) {
        document.title = `${menuItem.label} - ${app.siteName || 'Sub2API'}`
        return
      }
    }

    const keys = routeTitleKeys[pathname]
    const titleFromKey = keys?.titleKey ? t(keys.titleKey) : ''
    const staticTitle = routeMeta[pathname]?.title
    const pageTitle =
      titleFromKey && titleFromKey !== keys?.titleKey
        ? titleFromKey
        : staticTitle || meta.title || 'Sub2API'
    document.title = `${pageTitle} - ${app.siteName || 'Sub2API'}`
  }, [
    meta,
    pathname,
    t,
    app.siteName,
    app.cachedPublicSettings?.custom_menu_items,
    auth.isAdmin,
    adminSettingsStore.customMenuItems,
  ])

  useEffect(() => {
    if (!meta || !setupChecked || redirectingRef.current) return
    if (needsPublicSettings(meta, app.backendModeEnabled) && !app.publicSettingsLoaded) return
    if (accessDecision.allowed) return

    const target = buildRedirectUrl(accessDecision.redirectTo || '/login', accessDecision.redirectSearch)
    const current = `${pathname}${searchParams.toString() ? `?${searchParams.toString()}` : ''}`
    if (target === current || target === pathname) return

    redirectingRef.current = true
    router.replace(target)
  }, [
    meta,
    pathname,
    searchParams,
    setupChecked,
    app.publicSettingsLoaded,
    app.backendModeEnabled,
    accessDecision,
    router,
  ])

  useEffect(() => {
    redirectingRef.current = false
  }, [pathname])

  if (!meta) {
    return <>{children}</>
  }

  if (!setupChecked) {
    return <RouteGuardLoading />
  }

  if (needsPublicSettings(meta, app.backendModeEnabled) && !app.publicSettingsLoaded) {
    return <RouteGuardLoading />
  }

  if (!accessDecision.allowed) {
    return <RouteGuardLoading />
  }

  return <>{children}</>
}
