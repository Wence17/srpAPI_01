'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useI18n } from '@/lib/i18n'
import GroupBadge from '@/components/keys/GroupBadge'
import type { Group } from '@/lib/types'

interface AccountGroupsCellProps {
  groups: Group[] | null | undefined
  maxDisplay?: number
}

export default function AccountGroupsCell({
  groups,
  maxDisplay = 4,
}: AccountGroupsCellProps) {
  const { t } = useI18n()
  const moreButtonRef = useRef<HTMLButtonElement | null>(null)
  const [showPopover, setShowPopover] = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => setMounted(true), [])

  const displayGroups = useMemo(() => {
    if (!groups) return []
    if (groups.length <= maxDisplay) return groups
    return groups.slice(0, maxDisplay - 1)
  }, [groups, maxDisplay])

  const hiddenCount = useMemo(() => {
    if (!groups) return 0
    if (groups.length <= maxDisplay) return 0
    return groups.length - (maxDisplay - 1)
  }, [groups, maxDisplay])

  const popoverStyle = useMemo(() => {
    if (!moreButtonRef.current) return {}
    const rect = moreButtonRef.current.getBoundingClientRect()
    const viewportHeight = window.innerHeight
    const viewportWidth = window.innerWidth

    let top = rect.bottom + 8
    let left = rect.left

    if (top + 280 > viewportHeight) {
      top = Math.max(8, rect.top - 280)
    }

    if (left + 384 > viewportWidth) {
      left = Math.max(8, viewportWidth - 392)
    }

    return {
      top: `${top}px`,
      left: `${left}px`,
    }
  }, [showPopover])

  useEffect(() => {
    const handleKeydown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowPopover(false)
    }
    window.addEventListener('keydown', handleKeydown)
    return () => window.removeEventListener('keydown', handleKeydown)
  }, [])

  if (!groups || groups.length === 0) {
    return <span className="text-sm text-gray-400 dark:text-dark-500">-</span>
  }

  return (
    <div className="relative max-w-56">
      <div className="flex max-h-14 flex-wrap gap-1 overflow-hidden">
        {displayGroups.map((group) => (
          <GroupBadge
            key={group.id}
            name={group.name}
            platform={group.platform}
            subscriptionType={group.subscription_type}
            rateMultiplier={group.rate_multiplier}
            showRate={false}
            className="max-w-24"
          />
        ))}
        {hiddenCount > 0 ? (
          <button
            ref={moreButtonRef}
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              setShowPopover(!showPopover)
            }}
            className="inline-flex cursor-pointer items-center gap-0.5 whitespace-nowrap rounded-md bg-gray-100 px-1.5 py-0.5 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-200 dark:bg-dark-600 dark:text-gray-300 dark:hover:bg-dark-500"
          >
            <span>+{hiddenCount}</span>
          </button>
        ) : null}
      </div>

      {mounted && showPopover
        ? createPortal(
            <>
              <div
                className={`fixed z-50 min-w-48 max-w-96 rounded-lg border border-gray-200 bg-white p-3 shadow-lg transition duration-150 ease-out dark:border-dark-600 dark:bg-dark-800 ${
                  showPopover ? 'scale-100 opacity-100' : 'scale-95 opacity-0'
                }`}
                style={popoverStyle}
              >
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
                    {t('admin.accounts.groupCountTotal', { count: groups.length })}
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowPopover(false)}
                    className="rounded p-0.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-dark-700 dark:hover:text-gray-300"
                  >
                    <svg
                      className="h-3.5 w-3.5"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                <div className="flex max-h-64 flex-wrap gap-1.5 overflow-y-auto">
                  {groups.map((group) => (
                    <GroupBadge
                      key={group.id}
                      name={group.name}
                      platform={group.platform}
                      subscriptionType={group.subscription_type}
                      rateMultiplier={group.rate_multiplier}
                      showRate={false}
                    />
                  ))}
                </div>
              </div>
              <div
                className="fixed inset-0 z-40"
                onClick={() => setShowPopover(false)}
              />
            </>,
            document.body,
          )
        : null}
    </div>
  )
}
