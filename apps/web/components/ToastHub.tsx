'use client'

import { useApp } from '@/context/AppContext'

export default function ToastHub() {
  const { toasts, hideToast } = useApp()

  return (
    <div className="pointer-events-none fixed inset-x-0 top-5 z-50 flex flex-col items-center gap-3 px-4">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className="pointer-events-auto w-full max-w-xl rounded-3xl border border-slate-200 bg-white px-4 py-3 shadow-lg shadow-slate-200/40"
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-slate-900">{toast.type.toUpperCase()}</p>
              <p className="mt-1 text-sm text-slate-700">{toast.message}</p>
            </div>
            <button
              type="button"
              onClick={() => hideToast(toast.id)}
              className="rounded-full px-2 py-1 text-xs font-semibold text-slate-500 transition hover:bg-slate-100"
            >
              Close
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}
