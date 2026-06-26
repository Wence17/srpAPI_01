'use client'

import { useEffect, useState } from 'react'

export default function AnnouncementPopup() {
  const [show, setShow] = useState(false)

  useEffect(() => {
    const timer = window.setTimeout(() => setShow(true), 2000)
    return () => window.clearTimeout(timer)
  }, [])

  if (!show) {
    return null
  }

  return (
    <div className="fixed bottom-6 right-6 z-50 max-w-sm rounded-3xl border border-slate-200 bg-slate-50 p-4 shadow-lg shadow-slate-200/40">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-slate-900">Announcements</p>
          <p className="mt-2 text-sm text-slate-600">Announcements will appear here once the backend integration is wired in.</p>
        </div>
        <button
          type="button"
          onClick={() => setShow(false)}
          className="rounded-full px-2 py-1 text-xs font-semibold text-slate-500 transition hover:bg-slate-100"
        >
          Dismiss
        </button>
      </div>
    </div>
  )
}
