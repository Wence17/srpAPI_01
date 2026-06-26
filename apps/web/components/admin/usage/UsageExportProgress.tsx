'use client'

import BaseDialog from '@/components/common/BaseDialog'
import { useI18n } from '@/lib/i18n'

interface UsageExportProgressProps {
  show: boolean
  progress: number
  current: number
  total: number
  estimatedTime: string
  onCancel: () => void
}

export default function UsageExportProgress({
  show,
  progress,
  current,
  total,
  estimatedTime,
  onCancel,
}: UsageExportProgressProps) {
  const { t } = useI18n()
  const normalizedProgress = Math.min(100, Math.max(0, Math.round(Number.isFinite(progress) ? progress : 0)))

  return (
    <BaseDialog show={show} title={t('usage.exporting')} width="narrow" onClose={onCancel}>
      <div className="space-y-4">
        <div className="text-sm text-gray-600 dark:text-gray-400">{t('usage.exportingProgress')}</div>
        <div className="flex items-center justify-between text-sm text-gray-700 dark:text-gray-300">
          <span>{t('usage.exportedCount', { current, total })}</span>
          <span className="font-medium text-gray-900 dark:text-white">{normalizedProgress}%</span>
        </div>
        <div className="h-2 w-full rounded-full bg-gray-200 dark:bg-dark-700">
          <div
            role="progressbar"
            aria-valuenow={normalizedProgress}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`${t('usage.exportingProgress')}: ${normalizedProgress}%`}
            className="h-2 rounded-full bg-primary-600 transition-all"
            style={{ width: `${normalizedProgress}%` }}
          />
        </div>
        {estimatedTime ? (
          <div className="text-xs text-gray-500 dark:text-gray-400" aria-live="polite" aria-atomic="true">
            {t('usage.estimatedTime', { time: estimatedTime })}
          </div>
        ) : null}
      </div>

      <div className="mt-6 flex justify-end">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 dark:border-dark-600 dark:bg-dark-700 dark:text-gray-200 dark:hover:bg-dark-600 dark:focus:ring-offset-dark-800"
        >
          {t('usage.cancelExport')}
        </button>
      </div>
    </BaseDialog>
  )
}
