'use client'

import { useMemo } from 'react'
import {
  Chart as ChartJS,
  CategoryScale,
  Filler,
  Legend,
  LineElement,
  LinearScale,
  PointElement,
  Tooltip,
} from 'chart.js'
import { Line } from 'react-chartjs-2'
import { useI18n } from '@/lib/i18n'
import LoadingSpinner from '@/components/common/LoadingSpinner'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend, Filler)

interface DailySeriesPoint {
  date: string
  amount: number
  count: number
}

interface DailyRevenueChartProps {
  data: DailySeriesPoint[]
  loading?: boolean
}

export default function DailyRevenueChart({ data, loading = false }: DailyRevenueChartProps) {
  const { t } = useI18n()

  const chartData = useMemo(() => {
    if (!data || data.length === 0) return null
    return {
      labels: data.map((point) => point.date),
      datasets: [
        {
          label: t('payment.admin.revenue'),
          data: data.map((point) => point.amount),
          borderColor: 'rgb(59, 130, 246)',
          backgroundColor: 'rgba(59, 130, 246, 0.1)',
          fill: true,
          tension: 0.3,
          pointRadius: 3,
          pointHoverRadius: 5,
        },
        {
          label: t('payment.admin.orderCount'),
          data: data.map((point) => point.count),
          borderColor: 'rgb(16, 185, 129)',
          backgroundColor: 'rgba(16, 185, 129, 0.1)',
          fill: false,
          tension: 0.3,
          pointRadius: 3,
          pointHoverRadius: 5,
          yAxisID: 'y1',
        },
      ],
    }
  }, [data, t])

  const chartOptions = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index' as const, intersect: false },
      scales: {
        y: {
          type: 'linear' as const,
          display: true,
          position: 'left' as const,
          title: { display: true, text: t('payment.admin.revenue') },
        },
        y1: {
          type: 'linear' as const,
          display: true,
          position: 'right' as const,
          title: { display: true, text: t('payment.admin.orderCount') },
          grid: { drawOnChartArea: false },
        },
      },
      plugins: {
        legend: { position: 'top' as const },
      },
    }),
    [t],
  )

  return (
    <div className="card p-4">
      <h3 className="mb-4 text-sm font-semibold text-gray-900 dark:text-white">
        {t('payment.admin.dailyRevenue')}
      </h3>
      <div className="h-64">
        {loading ? (
          <div className="flex h-full items-center justify-center">
            <LoadingSpinner size="md" />
          </div>
        ) : chartData ? (
          <Line data={chartData} options={chartOptions} />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-gray-500 dark:text-gray-400">
            {t('payment.admin.noData')}
          </div>
        )}
      </div>
    </div>
  )
}
