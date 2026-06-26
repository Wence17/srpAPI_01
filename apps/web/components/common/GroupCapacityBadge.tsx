'use client'

interface GroupCapacityBadgeProps {
  concurrencyUsed?: number
  concurrencyMax?: number
  sessionsUsed?: number
  sessionsMax?: number
  rpmUsed?: number
  rpmMax?: number
}

function capacityClass(used: number, max: number): string {
  if (max > 0 && used >= max) {
    return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
  }
  if (used > 0) {
    return 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'
  }
  return 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
}

export default function GroupCapacityBadge({
  concurrencyUsed = 0,
  concurrencyMax = 0,
  sessionsUsed = 0,
  sessionsMax = 0,
  rpmUsed = 0,
  rpmMax = 0,
}: GroupCapacityBadgeProps) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1">
        <span
          className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium ${capacityClass(concurrencyUsed, concurrencyMax)}`}
        >
          <svg className="h-2.5 w-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z"
            />
          </svg>
          <span className="font-mono">{concurrencyUsed}</span>
          <span className="text-gray-400 dark:text-gray-500">/</span>
          <span className="font-mono">{concurrencyMax}</span>
        </span>
      </div>

      {sessionsMax > 0 ? (
        <div className="flex items-center gap-1">
          <span
            className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium ${capacityClass(sessionsUsed, sessionsMax)}`}
          >
            <svg className="h-2.5 w-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z"
              />
            </svg>
            <span className="font-mono">{sessionsUsed}</span>
            <span className="text-gray-400 dark:text-gray-500">/</span>
            <span className="font-mono">{sessionsMax}</span>
          </span>
        </div>
      ) : null}

      {rpmMax > 0 ? (
        <div className="flex items-center gap-1">
          <span
            className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium ${capacityClass(rpmUsed, rpmMax)}`}
          >
            <svg className="h-2.5 w-2.5" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
              />
            </svg>
            <span className="font-mono">{rpmUsed}</span>
            <span className="text-gray-400 dark:text-gray-500">/</span>
            <span className="font-mono">{rpmMax}</span>
          </span>
        </div>
      ) : null}
    </div>
  )
}
