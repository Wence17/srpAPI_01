'use client'

import { useI18n } from '@/lib/i18n'
import type { ChannelMonitor } from '@/lib/adminChannelMonitor'
import Icon from '@/components/icons/Icon'

interface MonitorActionsCellProps {
  row: ChannelMonitor
  running: boolean
  onRun: (row: ChannelMonitor) => void
  onEdit: (row: ChannelMonitor) => void
  onDelete: (row: ChannelMonitor) => void
}

export default function MonitorActionsCell({
  row,
  running,
  onRun,
  onEdit,
  onDelete,
}: MonitorActionsCellProps) {
  const { t } = useI18n()

  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={() => onRun(row)}
        disabled={running}
        className="flex flex-col items-center gap-0.5 rounded-lg p-1.5 text-gray-500 transition-colors hover:bg-gray-100 hover:text-primary-600 dark:hover:bg-dark-700 dark:hover:text-primary-400"
      >
        <Icon name="refresh" size="sm" className={running ? 'animate-spin' : ''} />
        <span className="text-xs">{t('admin.channelMonitor.runNow')}</span>
      </button>
      <button
        type="button"
        onClick={() => onEdit(row)}
        className="flex flex-col items-center gap-0.5 rounded-lg p-1.5 text-gray-500 transition-colors hover:bg-gray-100 hover:text-primary-600 dark:hover:bg-dark-700 dark:hover:text-primary-400"
      >
        <Icon name="edit" size="sm" />
        <span className="text-xs">{t('common.edit')}</span>
      </button>
      <button
        type="button"
        onClick={() => onDelete(row)}
        className="flex flex-col items-center gap-0.5 rounded-lg p-1.5 text-gray-500 transition-colors hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20 dark:hover:text-red-400"
      >
        <Icon name="trash" size="sm" />
        <span className="text-xs">{t('common.delete')}</span>
      </button>
    </div>
  )
}
