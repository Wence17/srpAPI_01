'use client'

import { useMemo } from 'react'
import PageShell from '@/components/PageShell'
import { useAuth } from '@/context/AuthContext'
import { useApp } from '@/context/AppContext'

export default function ProfilePage() {
  const auth = useAuth()
  const app = useApp()

  const role = useMemo(() => auth.user?.role || 'user', [auth.user])

  return (
    <PageShell title="Profile" description="View your current Sub2API account details." path="/profile">
      <div className="space-y-6 rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="grid gap-6 md:grid-cols-2">
          <div className="space-y-4">
            <div>
              <p className="text-sm uppercase tracking-[0.24em] text-slate-500">Account</p>
              <h2 className="mt-2 text-2xl font-semibold text-slate-900">Profile details</h2>
            </div>
            <div className="rounded-3xl border border-slate-100 bg-slate-50 p-5">
              <p className="text-sm text-slate-600">Email</p>
              <p className="mt-2 text-base font-medium text-slate-900">{auth.user?.email || 'Not available'}</p>
            </div>
            <div className="rounded-3xl border border-slate-100 bg-slate-50 p-5">
              <p className="text-sm text-slate-600">Username</p>
              <p className="mt-2 text-base font-medium text-slate-900">{auth.user?.username || 'Not available'}</p>
            </div>
          </div>

          <div className="space-y-4 rounded-3xl border border-slate-100 bg-slate-50 p-5">
            <div>
              <p className="text-sm uppercase tracking-[0.24em] text-slate-500">Usage & status</p>
              <p className="mt-2 text-sm text-slate-600">Your account role and current profile state.</p>
            </div>
            <div className="grid gap-3">
              <div className="rounded-2xl bg-white p-4 shadow-sm">
                <p className="text-xs uppercase tracking-[0.24em] text-slate-500">Role</p>
                <p className="mt-2 text-base font-semibold text-slate-900">{role}</p>
              </div>
              <div className="rounded-2xl bg-white p-4 shadow-sm">
                <p className="text-xs uppercase tracking-[0.24em] text-slate-500">Site</p>
                <p className="mt-2 text-base font-semibold text-slate-900">{app.siteName || 'Sub2API'}</p>
              </div>
              <div className="rounded-2xl bg-white p-4 shadow-sm">
                <p className="text-xs uppercase tracking-[0.24em] text-slate-500">Contact</p>
                <p className="mt-2 text-base font-semibold text-slate-900">{app.contactInfo || 'Not configured'}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-3xl border border-slate-100 bg-slate-50 p-6">
          <p className="text-sm font-semibold text-slate-900">Next steps</p>
          <p className="mt-3 text-sm text-slate-600">This page currently shows read-only profile details. The next migration step is to add profile editing, password management, and connected account bindings.</p>
        </div>
      </div>
    </PageShell>
  )
}
