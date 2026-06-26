'use client'

import { useCallback, useEffect, useState } from 'react'
import { useI18n } from '@/lib/i18n'
import { useApp } from '@/context/AppContext'
import { extractI18nErrorMessage } from '@/lib/apiError'
import { adminPaymentAPI, type DashboardStats } from '@/lib/adminPayment'
import AppLayout from '@/components/layout/AppLayout'
import LoadingSpinner from '@/components/common/LoadingSpinner'
import Icon from '@/components/icons/Icon'
import OrderStatsCards from '@/components/admin/payment/OrderStatsCards'
import DailyRevenueChart from '@/components/admin/payment/DailyRevenueChart'

const DAYS_OPTIONS = [7, 30, 90] as const

function methodColor(type: string): string {
  const colors: Record<string, string> = {
    alipay: 'bg-blue-500',
    wxpay: 'bg-green-500',
    alipay_direct: 'bg-blue-400',
    wxpay_direct: 'bg-green-400',
    stripe: 'bg-purple-500',
  }
  return colors[type] || 'bg-gray-400'
}

function rankClass(idx: number): string {
  if (idx === 0) return 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'
  if (idx === 1) return 'bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-300'
  if (idx === 2) return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
  return 'bg-gray-100 text-gray-500 dark:bg-dark-700 dark:text-gray-400'
}

export default function AdminPaymentDashboardPage() {
  const { t } = useI18n()
  const appStore = useApp()
  const [days, setDays] = useState<number>(30)
  const [loading, setLoading] = useState(false)
  const [stats, setStats] = useState<DashboardStats | null>(null)

  const loadDashboard = useCallback(async () => {
    setLoading(true)
    try {
      const data = await adminPaymentAPI.getDashboard(days)
      setStats(data)
    } catch (err: unknown) {
      appStore.showError(extractI18nErrorMessage(err, t, 'payment.errors', t('common.error')))
    } finally {
      setLoading(false)
    }
  }, [appStore, days, t])

  useEffect(() => {
    loadDashboard()
  }, [loadDashboard])

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-end">
          <div className="flex items-center gap-2">
            <div className="flex rounded-lg border border-gray-200 dark:border-dark-600">
              {DAYS_OPTIONS.map((option) => (
                <button
                  key={option}
                  type="button"
                  className={`px-3 py-1.5 text-xs font-medium transition-colors first:rounded-l-lg last:rounded-r-lg ${
                    days === option
                      ? 'bg-primary-600 text-white'
                      : 'text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-dark-700'
                  }`}
                  onClick={() => setDays(option)}
                >
                  {option}
                  {t('payment.admin.daySuffix')}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => loadDashboard()}
              disabled={loading}
              className="btn btn-secondary"
              title={t('common.refresh')}
            >
              <Icon name="refresh" size="md" className={loading ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <LoadingSpinner />
          </div>
        ) : stats ? (
          <>
            <OrderStatsCards stats={stats} />
            <DailyRevenueChart data={stats.daily_series || []} loading={loading} />
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <div className="card p-4">
                <h3 className="mb-4 text-sm font-semibold text-gray-900 dark:text-white">
                  {t('payment.admin.paymentDistribution')}
                </h3>
                {!stats.payment_methods?.length ? (
                  <div className="flex h-32 items-center justify-center text-sm text-gray-500 dark:text-gray-400">
                    {t('payment.admin.noData')}
                  </div>
                ) : (
                  <div className="space-y-3">
                    {stats.payment_methods.map((method) => (
                      <div key={method.type} className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span
                            className={`inline-block h-3 w-3 rounded-full ${methodColor(method.type)}`}
                          />
                          <span className="text-sm text-gray-700 dark:text-gray-300">
                            {t('payment.methods.' + method.type, method.type)}
                          </span>
                        </div>
                        <div className="text-right">
                          <span className="text-sm font-medium text-gray-900 dark:text-white">
                            ¥{method.amount.toFixed(2)}
                          </span>
                          <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">
                            ({method.count})
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="card p-4">
                <h3 className="mb-4 text-sm font-semibold text-gray-900 dark:text-white">
                  {t('payment.admin.topUsers')}
                </h3>
                {!stats.top_users?.length ? (
                  <div className="flex h-32 items-center justify-center text-sm text-gray-500 dark:text-gray-400">
                    {t('payment.admin.noData')}
                  </div>
                ) : (
                  <div className="space-y-2">
                    {stats.top_users.map((user, idx) => (
                      <div
                        key={user.user_id}
                        className="flex items-center justify-between rounded-lg px-3 py-2 hover:bg-gray-50 dark:hover:bg-dark-700"
                      >
                        <div className="flex items-center gap-3">
                          <span
                            className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${rankClass(idx)}`}
                          >
                            {idx + 1}
                          </span>
                          <span className="text-sm text-gray-700 dark:text-gray-300">{user.email}</span>
                        </div>
                        <span className="text-sm font-medium text-gray-900 dark:text-white">
                          ¥{user.amount.toFixed(2)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </>
        ) : null}
      </div>
    </AppLayout>
  )
}
