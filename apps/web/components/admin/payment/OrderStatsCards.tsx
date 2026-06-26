'use client'

import { useI18n } from '@/lib/i18n'
import type { DashboardStats } from '@/lib/adminPayment'
import Icon from '@/components/icons/Icon'

interface OrderStatsCardsProps {
  stats: DashboardStats
}

function formatMoney(value: number): string {
  return value.toFixed(2)
}

export default function OrderStatsCards({ stats }: OrderStatsCardsProps) {
  const { t } = useI18n()

  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      <div className="card p-4">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-green-100 p-2 dark:bg-green-900/30">
            <Icon name="dollar" size="md" className="text-green-600 dark:text-green-400" strokeWidth={2} />
          </div>
          <div>
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400">
              {t('payment.admin.todayRevenue')}
            </p>
            <p className="text-xl font-bold text-gray-900 dark:text-white">
              ${formatMoney(stats.today_amount)}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {stats.today_count} {t('payment.admin.orders')}
            </p>
          </div>
        </div>
      </div>

      <div className="card p-4">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-blue-100 p-2 dark:bg-blue-900/30">
            <Icon
              name="creditCard"
              size="md"
              className="text-blue-600 dark:text-blue-400"
              strokeWidth={2}
            />
          </div>
          <div>
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400">
              {t('payment.admin.totalRevenue')}
            </p>
            <p className="text-xl font-bold text-gray-900 dark:text-white">
              ${formatMoney(stats.total_amount)}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {stats.total_count} {t('payment.admin.orders')}
            </p>
          </div>
        </div>
      </div>

      <div className="card p-4">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-purple-100 p-2 dark:bg-purple-900/30">
            <Icon name="chart" size="md" className="text-purple-600 dark:text-purple-400" strokeWidth={2} />
          </div>
          <div>
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400">
              {t('payment.admin.todayOrders')}
            </p>
            <p className="text-xl font-bold text-gray-900 dark:text-white">{stats.today_count}</p>
          </div>
        </div>
      </div>

      <div className="card p-4">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-amber-100 p-2 dark:bg-amber-900/30">
            <Icon name="chart" size="md" className="text-amber-600 dark:text-amber-400" strokeWidth={2} />
          </div>
          <div>
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400">
              {t('payment.admin.avgAmount')}
            </p>
            <p className="text-xl font-bold text-gray-900 dark:text-white">
              ${formatMoney(stats.avg_amount)}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
