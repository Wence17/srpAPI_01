'use client'

import Link from 'next/link'
import { useI18n } from '@/lib/i18n'
import Icon from '@/components/icons/Icon'

interface EmptyStateProps {
  title?: string
  description?: string
  message?: string
  actionText?: string
  actionTo?: string
  actionIcon?: boolean
  onAction?: () => void
}

export default function EmptyState({
  title,
  description = '',
  message,
  actionText,
  actionTo,
  actionIcon = true,
  onAction,
}: EmptyStateProps) {
  const { t } = useI18n()
  const displayTitle = title || message || t('common.noData')

  return (
    <div className="empty-state">
      <div className="mb-5 flex h-20 w-20 items-center justify-center rounded-2xl bg-gray-100 dark:bg-dark-800">
        <svg
          className="empty-state-icon h-10 w-10"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          strokeWidth="1.5"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"
          />
        </svg>
      </div>

      <h3 className="empty-state-title">{displayTitle}</h3>

      {description ? <p className="empty-state-description">{description}</p> : null}

      {actionText ? (
        <div className="mt-6">
          {actionTo ? (
            <Link href={actionTo} className="btn btn-primary">
              {actionIcon ? <Icon name="plus" size="md" className="mr-2" /> : null}
              {actionText}
            </Link>
          ) : (
            <button type="button" onClick={onAction} className="btn btn-primary">
              {actionIcon ? <Icon name="plus" size="md" className="mr-2" /> : null}
              {actionText}
            </button>
          )}
        </div>
      ) : null}
    </div>
  )
}
