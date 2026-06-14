'use client'

import { useI18n } from '@/lib/i18n'
import LoadingSpinner from '@/components/common/LoadingSpinner'

interface EndpointStatItem {
  endpoint?: string
  requests?: number
  cost?: number
}

interface EndpointDistributionChartProps {
  endpointStats: EndpointStatItem[]
  loading?: boolean
  title?: string
}

function formatNumber(value: number): string {
  return value.toLocaleString()
}

function formatCost(value: number): string {
  if (value >= 1000) return `${(value / 1000).toFixed(2)}K`
  if (value >= 1) return value.toFixed(2)
  if (value >= 0.01) return value.toFixed(3)
  return value.toFixed(4)
}

export default function EndpointDistributionChart({
  endpointStats,
  loading = false,
  title,
}: EndpointDistributionChartProps) {
  const { t } = useI18n()
  const displayTitle = title ?? t('usage.endpointDistribution')

  const sortedStats = [...endpointStats].sort(
    (a, b) => (b.requests ?? 0) - (a.requests ?? 0),
  )

  return (
    <div className="card p-4">
      <h3 className="mb-4 text-sm font-semibold text-gray-900 dark:text-white">{displayTitle}</h3>

      {loading ? (
        <div className="flex h-48 items-center justify-center">
          <LoadingSpinner />
        </div>
      ) : sortedStats.length > 0 ? (
        <div className="max-h-48 overflow-y-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-gray-500 dark:text-gray-400">
                <th className="pb-2 text-left">{t('usage.endpoint')}</th>
                <th className="pb-2 text-right">{t('admin.dashboard.requests')}</th>
                <th className="pb-2 text-right">{t('admin.dashboard.standard')}</th>
              </tr>
            </thead>
            <tbody>
              {sortedStats.map((item, index) => (
                <tr
                  key={`${item.endpoint ?? 'unknown'}-${index}`}
                  className="border-t border-gray-100 dark:border-gray-700"
                >
                  <td
                    className="max-w-[160px] truncate py-1.5 font-medium text-gray-900 dark:text-white"
                    title={item.endpoint || '-'}
                  >
                    {item.endpoint || '-'}
                  </td>
                  <td className="py-1.5 text-right text-gray-600 dark:text-gray-400">
                    {formatNumber(item.requests ?? 0)}
                  </td>
                  <td className="py-1.5 text-right text-green-600 dark:text-green-400">
                    ${formatCost(item.cost ?? 0)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="flex h-48 items-center justify-center text-sm text-gray-500 dark:text-gray-400">
          {t('admin.dashboard.noDataAvailable')}
        </div>
      )}
    </div>
  )
}
