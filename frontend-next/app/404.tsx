import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="rounded-3xl border border-rose-200 bg-rose-50 p-6 text-rose-900">
      <h1 className="text-4xl font-semibold">404</h1>
      <p className="mt-4 text-lg">Page not found.</p>
      <p className="mt-2 text-slate-700">The requested URL does not exist in the converted route map.</p>
      <Link href="/home" className="mt-6 inline-flex rounded-full bg-white px-4 py-2 text-sm font-medium text-rose-700 shadow-sm ring-1 ring-rose-200 transition hover:bg-rose-100">
        Return to Home
      </Link>
    </div>
  )
}
