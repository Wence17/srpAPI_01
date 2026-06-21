'use client'

import { useMemo } from 'react'

interface UserConcurrencyCellProps {
  current: number
  max: number
}

export default function UserConcurrencyCell({ current, max }: UserConcurrencyCellProps) {
  const statusClass = useMemo(() => {
    if (current >= max && max > 0) {
      return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
    }
    if (current > 0) {
      return 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'
    }
    return 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
  }, [current, max])

  return (
    <div className="flex items-center">
      <span
        className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium ${statusClass}`}
      >
        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z"
          />
        </svg>
        <span className="font-mono">{current}</span>
        <span className="text-gray-400 dark:text-gray-500">/</span>
        <span className="font-mono">{max}</span>
      </span>
    </div>
  )
}
