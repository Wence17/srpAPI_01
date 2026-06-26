'use client'

import { useI18n } from '@/lib/i18n'

interface AccountBulkActionsBarProps {
  selectedIds: Array<number | string>
  onDelete?: () => void
  onEditSelected?: () => void
  onEditFiltered?: () => void
  onClear?: () => void
  onSelectPage?: () => void
  onToggleSchedulable?: (enabled: boolean) => void
  onResetStatus?: () => void
  onRefreshToken?: () => void
}

export default function AccountBulkActionsBar({
  selectedIds,
  onDelete,
  onEditSelected,
  onEditFiltered,
  onClear,
  onSelectPage,
  onToggleSchedulable,
  onResetStatus,
  onRefreshToken,
}: AccountBulkActionsBarProps) {
  const { t } = useI18n()
  const hasSelection = selectedIds.length > 0

  return (
    <div className="mb-4 flex items-center justify-between rounded-lg bg-primary-50 p-3 dark:bg-primary-900/20">
      <div className="flex flex-wrap items-center gap-2">
        {hasSelection ? (
          <span className="text-sm font-medium text-primary-900 dark:text-primary-100">
            {t('admin.accounts.bulkActions.selected', { count: selectedIds.length })}
          </span>
        ) : (
          <span className="text-sm font-medium text-primary-900 dark:text-primary-100">
            {t('admin.accounts.bulkEdit.title')}
          </span>
        )}
        {hasSelection ? (
          <>
            <button
              type="button"
              onClick={onSelectPage}
              className="text-xs font-medium text-primary-700 hover:text-primary-800 dark:text-primary-300 dark:hover:text-primary-200"
            >
              {t('admin.accounts.bulkActions.selectCurrentPage')}
            </button>
            <span className="text-gray-300 dark:text-primary-800">•</span>
            <button
              type="button"
              onClick={onClear}
              className="text-xs font-medium text-primary-700 hover:text-primary-800 dark:text-primary-300 dark:hover:text-primary-200"
            >
              {t('admin.accounts.bulkActions.clear')}
            </button>
          </>
        ) : null}
      </div>
      <div className="flex gap-2">
        {hasSelection ? (
          <>
            <button type="button" onClick={onDelete} className="btn btn-danger btn-sm">
              {t('admin.accounts.bulkActions.delete')}
            </button>
            <button type="button" onClick={onResetStatus} className="btn btn-secondary btn-sm">
              {t('admin.accounts.bulkActions.resetStatus')}
            </button>
            <button type="button" onClick={onRefreshToken} className="btn btn-secondary btn-sm">
              {t('admin.accounts.bulkActions.refreshToken')}
            </button>
            <button
              type="button"
              onClick={() => onToggleSchedulable?.(true)}
              className="btn btn-success btn-sm"
            >
              {t('admin.accounts.bulkActions.enableScheduling')}
            </button>
            <button
              type="button"
              onClick={() => onToggleSchedulable?.(false)}
              className="btn btn-warning btn-sm"
            >
              {t('admin.accounts.bulkActions.disableScheduling')}
            </button>
            <button type="button" onClick={onEditSelected} className="btn btn-primary btn-sm">
              {t('admin.accounts.bulkActions.edit')}
            </button>
          </>
        ) : null}
        <button type="button" onClick={onEditFiltered} className="btn btn-primary btn-sm">
          {t('admin.accounts.bulkEdit.submit')}
        </button>
      </div>
    </div>
  )
}
