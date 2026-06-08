'use client'

import Link from 'next/link'
import { useAuth } from '@/context/AuthContext'
import { useApp } from '@/context/AppContext'
import PageShell from '@/components/PageShell'

export default function HomePage() {
  const auth = useAuth()
  const app = useApp()

  return (
    <PageShell title="Home" description="Welcome to the Sub2API Next.js migration scaffold." path="/home">
      <div className="space-y-8 rounded-3xl border border-slate-200 bg-slate-50 p-8 shadow-sm">
        <div className="grid gap-6 lg:grid-cols-[1.4fr_0.8fr]">
          <div className="space-y-5">
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-brand-700">{app.siteName || 'Sub2API'}</p>
            <h1 className="text-4xl font-semibold text-slate-900">Migrate your frontend to Next.js with confidence.</h1>
            <p className="max-w-2xl text-lg leading-8 text-slate-600">
              This scaffold preserves Sub2API routes and route metadata while the actual page UIs are ported one route at a time.
              Start by signing in, or explore the available placeholders for the migrated pages.
            </p>
            <div className="flex flex-wrap gap-3">
              {auth.isAuthenticated ? (
                <Link href={auth.isAdmin ? '/admin/dashboard' : '/dashboard'} className="rounded-2xl bg-brand-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-brand-700">
                  Go to Dashboard
                </Link>
              ) : (
                <>
                  <Link href="/login" className="rounded-2xl bg-brand-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-brand-700">
                    Sign in
                  </Link>
                  <Link href="/register" className="rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-900 transition hover:bg-slate-100">
                    Register
                  </Link>
                </>
              )}
            </div>
          </div>

          <div className="rounded-3xl bg-white p-6 shadow-sm">
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-500">Quick links</p>
            <div className="mt-5 space-y-3 text-sm text-slate-700">
              <p>
                <strong>Public route placeholder:</strong> /key-usage
              </p>
              <p>
                <strong>User pages:</strong> /dashboard, /profile, /keys, /usage
              </p>
              <p>
                <strong>Admin pages:</strong> /admin/dashboard, /admin/users, /admin/settings
              </p>
              <p>
                <strong>Payment pages:</strong> /payment/qrcode, /payment/stripe
              </p>
            </div>
          </div>
        </div>
      </div>
    </PageShell>
  )
}
