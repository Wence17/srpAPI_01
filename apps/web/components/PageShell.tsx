import type { ReactNode } from 'react'
import Link from 'next/link'

interface PageShellProps {
  title: string
  description?: string
  path: string
  children?: ReactNode
}

export default function PageShell({ title, description, path, children }: PageShellProps) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-medium uppercase tracking-[0.24em] text-brand-700">Sub2API</p>
          <h1 className="text-3xl font-semibold text-slate-900">{title}</h1>
          {description ? <p className="mt-2 text-slate-600">{description}</p> : null}
        </div>
        <div className="rounded-2xl bg-slate-100 px-4 py-2 text-sm text-slate-700">
          path: <span className="font-mono text-slate-900">{path}</span>
        </div>
      </div>
      <div className="flex flex-wrap gap-2 text-sm text-slate-500">
        <Link href="/home" className="rounded-full bg-slate-100 px-3 py-2 transition hover:bg-slate-200">
          Home
        </Link>
        <Link href="/dashboard" className="rounded-full bg-slate-100 px-3 py-2 transition hover:bg-slate-200">
          Dashboard
        </Link>
        <Link href="/admin/dashboard" className="rounded-full bg-slate-100 px-3 py-2 transition hover:bg-slate-200">
          Admin
        </Link>
      </div>
      <div className="mt-8">{children}</div>
    </div>
  )
}
