'use client'

import { useI18n } from '@/lib/i18n'
import LoadingSpinner from '@/components/common/LoadingSpinner'
import type { UserBreakdownItem } from '@/lib/adminDashboard'

interface UserBreakdownSubTableProps {
  items: UserBreakdownItem[]
  loading?: boolean
}

function formatTokens(value: number): string {
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(2)}B`
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`
  if (value >= 1_000) return `${(value / 1_000).toFixed(2)}K`
  return value.toLocaleString()
}

function formatCost(value: number): string {
  if (value >= 1000) return `${(value / 1000).toFixed(2)}K`
  if (value >= 1) return value.toFixed(2)
  if (value >= 0.01) return value.toFixed(3)
  return value.toFixed(4)
}

export default function UserBreakdownSubTable({ items, loading = false }: UserBreakdownSubTableProps) {
  const { t } = useI18n()

  return (
    <div className="bg-gray-50/50 dark:bg-dark-700/30">
      {loading ? (
        <div className="flex items-center justify-center py-3">
          <LoadingSpinner />
        </div>
      ) : items.length === 0 ? (
        <div className="py-2 text-center text-xs text-gray-400">{t('admin.dashboard.noDataAvailable')}</div>
      ) : (
        <table className="w-full text-xs">
          <tbody>
            {items.map((user) => (
              <tr key={user.user_id} className="border-t border-gray-100/50 dark:border-gray-700/50">
                <td
                  className="max-w-[120px] truncate py-1 pl-6 text-gray-600 dark:text-gray-300"
                  title={user.email}
                >
                  {user.email || `User #${user.user_id}`}
                </td>
                <td className="py-1 text-right text-gray-500 dark:text-gray-400">
                  {user.requests.toLocaleString()}
                </td>
                <td className="py-1 text-right text-gray-500 dark:text-gray-400">
                  {formatTokens(user.total_tokens)}
                </td>
                <td className="py-1 text-right text-green-600 dark:text-green-400">
                  ${formatCost(user.actual_cost)}
                </td>
                <td className="py-1 text-right text-orange-500 dark:text-orange-400">
                  ${formatCost(user.account_cost)}
                </td>
                <td className="py-1 pr-1 text-right text-gray-400 dark:text-gray-500">
                  ${formatCost(user.cost)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
