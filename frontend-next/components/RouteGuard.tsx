'use client'

import Link from 'next/link'
import { useEffect, useMemo } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useAuth } from '@/context/AuthContext'
import { useApp } from '@/context/AppContext'
import PageShell from '@/components/PageShell'
import { dynamicRoutePatterns, routeMeta, type RouteMeta } from '@/lib/routeMeta'

function resolveRouteMeta(path: string): RouteMeta | null {
  const exact = routeMeta[path]
  if (exact) return exact

  const dynamic = dynamicRoutePatterns.find((entry) => path.startsWith(entry.prefix))
  return dynamic?.meta ?? null
}

export default function RouteGuard() {
  const pathname = usePathname() || '/'
  const router = useRouter()
  const auth = useAuth()
  const app = useApp()

  const meta = useMemo(() => resolveRouteMeta(pathname), [pathname])

  useEffect(() => {
    if (!meta) {
      document.title = '404 Not Found'
      return
    }
    const title = meta.title || 'Sub2API'
    document.title = `${title} - ${app.siteName || 'Sub2API'}`
  }, [meta, app.siteName])

  useEffect(() => {
    if (pathname === '/admin') {
      router.push('/admin/dashboard')
      return
    }
    if (pathname === '/admin/channels') {
      router.push('/admin/channels/pricing')
      return
    }
    if (pathname === '/admin/affiliates') {
      router.push('/admin/affiliates/invites')
      return
    }

    if ((pathname === '/login' || pathname === '/register') && auth.isAuthenticated) {
      router.push(auth.isAdmin ? '/admin/dashboard' : '/dashboard')
    }
  }, [pathname, router, auth.isAuthenticated, auth.isAdmin])

  if (!meta) {
    return (
      <PageShell title="404 Not Found" description="This route is not recognized by the Sub2API conversion scaffold." path={pathname}>
        <div className="rounded-3xl border border-rose-200 bg-rose-50 p-6 text-rose-900">
          <p className="text-lg font-semibold">Route not found</p>
          <p className="mt-2 text-sm text-slate-700">The current URL is not mapped into the migrated Next.js frontend yet.</p>
          <Link href="/home" className="mt-4 inline-flex rounded-full bg-white px-4 py-2 text-sm font-semibold text-rose-700 shadow-sm ring-1 ring-rose-200 hover:bg-rose-100">
            Go back to Home
          </Link>
        </div>
      </PageShell>
    )
  }

  if (meta.requiresAuth && !auth.isAuthenticated) {
    return (
      <PageShell title="Sign In Required" description="You need to sign in to view this page." path={pathname}>
        <div className="rounded-3xl border border-slate-200 bg-slate-50 p-6 text-slate-800">
          <p className="text-lg font-semibold">Authentication required</p>
          <p className="mt-2 text-sm text-slate-600">Please sign in to continue to this section.</p>
          <Link href="/login" className="mt-4 inline-flex rounded-full bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700">
            Go to Login
          </Link>
        </div>
      </PageShell>
    )
  }

  if (meta.requiresPayment && app.cachedPublicSettings?.payment_enabled === false) {
    return (
      <PageShell title="Payment Disabled" description="This section requires payment features that are currently disabled." path={pathname}>
        <div className="rounded-3xl border border-amber-200 bg-amber-50 p-6 text-amber-900">
          <p className="text-lg font-semibold">Payment feature unavailable</p>
          <p className="mt-2 text-sm text-amber-700">The current backend configuration does not expose payment features for this route.</p>
          <Link href={auth.isAdmin ? '/admin/dashboard' : '/dashboard'} className="mt-4 inline-flex rounded-full bg-white px-4 py-2 text-sm font-semibold text-amber-900 shadow-sm ring-1 ring-amber-200 hover:bg-amber-100">
            Go back to Dashboard
          </Link>
        </div>
      </PageShell>
    )
  }

  if (meta.requiresAdmin && !auth.isAdmin) {
    return (
      <PageShell title="Access Denied" description="You do not have permission to view this page." path={pathname}>
        <div className="rounded-3xl border border-rose-200 bg-rose-50 p-6 text-rose-900">
          <p className="text-lg font-semibold">Admin access required</p>
          <p className="mt-2 text-sm text-slate-700">Only administrators can access this page.</p>
          <Link href="/dashboard" className="mt-4 inline-flex rounded-full bg-white px-4 py-2 text-sm font-semibold text-rose-700 shadow-sm ring-1 ring-rose-200 hover:bg-rose-100">
            Return to Dashboard
          </Link>
        </div>
      </PageShell>
    )
  }

  return (
    <PageShell title={meta.title} description={meta.description} path={pathname}>
      <div className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50 p-5">
        <p className="text-sm text-slate-600">Original Vue component: {meta.originalComponent ?? 'Unknown'}</p>
        <p className="text-sm text-slate-600">This page is currently a migrated placeholder.</p>
        <div className="rounded-2xl bg-white p-5 shadow-sm">
          <p className="text-slate-700">The route exists in the Next.js app, and the authentication/authorization shell is active.</p>
          <p className="mt-2 text-slate-600">Next step: port the page UI and business logic from the original Vue component.</p>
        </div>
      </div>
    </PageShell>
  )
}
