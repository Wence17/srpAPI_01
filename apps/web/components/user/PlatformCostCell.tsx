'use client'

import { useI18n } from '@/lib/i18n'
import type { PlatformUsage } from '@/lib/adminDashboard'

interface PlatformCostCellProps {
  usage?: PlatformUsage
}

export default function PlatformCostCell({ usage }: PlatformCostCellProps) {
  const { t } = useI18n()

  if (!usage) {
    return <span className="text-sm text-gray-400 dark:text-gray-500">—</span>
  }

  return (
    <div className="text-sm">
      <div className="flex items-center gap-1.5">
        <span className="text-gray-500 dark:text-gray-400">{t('admin.users.today')}:</span>
        <span className="font-medium text-gray-900 dark:text-white">
          ${usage.today_actual_cost.toFixed(4)}
        </span>
      </div>
      <div className="mt-0.5 flex items-center gap-1.5">
        <span className="text-gray-500 dark:text-gray-400">{t('admin.users.total')}:</span>
        <span className="font-medium text-gray-900 dark:text-white">
          ${usage.total_actual_cost.toFixed(4)}
        </span>
      </div>
    </div>
  )
}
