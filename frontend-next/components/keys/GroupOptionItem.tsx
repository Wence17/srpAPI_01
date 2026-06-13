'use client'

import { useMemo } from 'react'
import GroupBadge from '@/components/keys/GroupBadge'
import type { GroupPlatform, SubscriptionType } from '@/lib/types'

interface GroupOptionItemProps {
  name: string
  platform: GroupPlatform
  subscriptionType?: SubscriptionType
  rateMultiplier?: number
  userRateMultiplier?: number | null
  description?: string | null
  selected?: boolean
  showCheckmark?: boolean
}

export default function GroupOptionItem({
  name,
  platform,
  subscriptionType = 'standard',
  rateMultiplier,
  userRateMultiplier = null,
  description,
  selected = false,
  showCheckmark = true,
}: GroupOptionItemProps) {
  const hasCustomRate =
    userRateMultiplier !== null &&
    userRateMultiplier !== undefined &&
    rateMultiplier !== undefined &&
    userRateMultiplier !== rateMultiplier

  const ratePillClass = useMemo(() => {
    switch (platform) {
      case 'anthropic':
        return 'bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400'
      case 'openai':
        return 'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400'
      case 'gemini':
        return 'bg-sky-50 text-sky-700 dark:bg-sky-900/20 dark:text-sky-400'
      default:
        return 'bg-violet-50 text-violet-700 dark:bg-violet-900/20 dark:text-violet-400'
    }
  }, [platform])

  return (
    <div className="flex min-w-0 flex-1 items-start justify-between gap-3">
      <div className="flex min-w-0 flex-1 flex-col items-start" title={description || undefined}>
        <GroupBadge
          name={name}
          platform={platform}
          subscriptionType={subscriptionType}
          showRate={false}
          className="groupOptionItemBadge [&_span.truncate]:font-semibold"
        />
        {description ? (
          <span className="mt-1.5 w-full text-left text-xs leading-relaxed text-gray-500 dark:text-gray-400 line-clamp-2">
            {description}
          </span>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-2 pt-0.5">
        {rateMultiplier !== undefined ? (
          <span
            className={`inline-flex items-center whitespace-nowrap rounded-full px-3 py-1 text-xs font-semibold ${ratePillClass}`}
          >
            {hasCustomRate ? (
              <>
                <span className="mr-1 line-through opacity-50">{rateMultiplier}x</span>
                <span className="font-bold">{userRateMultiplier}x</span>
              </>
            ) : (
              `${rateMultiplier}x 倍率`
            )}
          </span>
        ) : null}
        {showCheckmark && selected ? (
          <svg
            className="h-4 w-4 shrink-0 text-primary-600 dark:text-primary-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            strokeWidth="2"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        ) : null}
      </div>
    </div>
  )
}
