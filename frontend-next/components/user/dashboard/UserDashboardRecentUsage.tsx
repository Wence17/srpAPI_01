'use client'

import Link from 'next/link'
import { useI18n } from '@/lib/i18n'
import LoadingSpinner from '@/components/common/LoadingSpinner'
import EmptyState from '@/components/common/EmptyState'
import Icon from '@/components/icons/Icon'
import { formatDateTime } from '@/lib/format'
import type { UsageLog } from '@/lib/types'

interface UserDashboardRecentUsageProps {
  data: UsageLog[]
  loading: boolean
}

function formatCost(c: number): string {
  return c.toFixed(4)
}

export default function UserDashboardRecentUsage({ data, loading }: UserDashboardRecentUsageProps) {
  const { t } = useI18n()

  return (
    <div className="card">
      <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4 dark:border-dark-700">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{t('dashboard.recentUsage')}</h2>
        <span className="badge badge-gray">{t('dashboard.last7Days')}</span>
      </div>
      <div className="p-6">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <LoadingSpinner size="lg" />
          </div>
        ) : data.length === 0 ? (
          <div className="py-8">
            <EmptyState title={t('dashboard.noUsageRecords')} description={t('dashboard.startUsingApi')} />
          </div>
        ) : (
          <div className="space-y-3">
            {data.map((log) => (
              <div
                key={log.id}
                className="flex items-center justify-between rounded-xl bg-gray-50 p-4 transition-colors hover:bg-gray-100 dark:bg-dark-800/50 dark:hover:bg-dark-800"
              >
                <div className="flex items-center gap-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-100 dark:bg-primary-900/30">
                    <Icon name="beaker" size="md" className="text-primary-600 dark:text-primary-400" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-900 dark:text-white">{log.model}</p>
                    <p className="text-xs text-gray-500 dark:text-dark-400">{formatDateTime(log.created_at)}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold">
                    <span className="text-green-600 dark:text-green-400" title={t('dashboard.actual')}>
                      ${formatCost(log.actual_cost)}
                    </span>
                    <span className="font-normal text-gray-400 dark:text-gray-500" title={t('dashboard.standard')}>
                      {' '}
                      / ${formatCost(log.total_cost)}
                    </span>
                  </p>
                  <p className="text-xs text-gray-500 dark:text-dark-400">
                    {(log.input_tokens + log.output_tokens).toLocaleString()} tokens
                  </p>
                </div>
              </div>
            ))}

            <Link
              href="/usage"
              className="flex items-center justify-center gap-2 py-3 text-sm font-medium text-primary-600 transition-colors hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300"
            >
              {t('dashboard.viewAllUsage')}
              <Icon name="arrowRight" size="sm" />
            </Link>
          </div>
        )}
      </div>
    </div>
  )
}
