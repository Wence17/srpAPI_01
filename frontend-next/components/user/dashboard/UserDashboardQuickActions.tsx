'use client'

import { useRouter } from 'next/navigation'
import { useI18n } from '@/lib/i18n'
import Icon from '@/components/icons/Icon'

export default function UserDashboardQuickActions() {
  const router = useRouter()
  const { t } = useI18n()

  return (
    <div className="card">
      <div className="border-b border-gray-100 px-6 py-4 dark:border-dark-700">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{t('dashboard.quickActions')}</h2>
      </div>
      <div className="space-y-3 p-4">
        <button
          type="button"
          onClick={() => router.push('/keys')}
          className="group flex w-full items-center gap-4 rounded-xl bg-gray-50 p-4 text-left transition-all duration-200 hover:bg-gray-100 dark:bg-dark-800/50 dark:hover:bg-dark-800"
        >
          <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-primary-100 transition-transform group-hover:scale-105 dark:bg-primary-900/30">
            <Icon name="key" size="lg" className="text-primary-600 dark:text-primary-400" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-gray-900 dark:text-white">{t('dashboard.createApiKey')}</p>
            <p className="text-xs text-gray-500 dark:text-dark-400">{t('dashboard.generateNewKey')}</p>
          </div>
          <Icon
            name="chevronRight"
            size="md"
            className="text-gray-400 transition-colors group-hover:text-primary-500 dark:text-dark-500"
          />
        </button>

        <button
          type="button"
          onClick={() => router.push('/usage')}
          className="group flex w-full items-center gap-4 rounded-xl bg-gray-50 p-4 text-left transition-all duration-200 hover:bg-gray-100 dark:bg-dark-800/50 dark:hover:bg-dark-800"
        >
          <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-emerald-100 transition-transform group-hover:scale-105 dark:bg-emerald-900/30">
            <Icon name="chart" size="lg" className="text-emerald-600 dark:text-emerald-400" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-gray-900 dark:text-white">{t('dashboard.viewUsage')}</p>
            <p className="text-xs text-gray-500 dark:text-dark-400">{t('dashboard.checkDetailedLogs')}</p>
          </div>
          <Icon
            name="chevronRight"
            size="md"
            className="text-gray-400 transition-colors group-hover:text-emerald-500 dark:text-dark-500"
          />
        </button>

        <button
          type="button"
          onClick={() => router.push('/redeem')}
          className="group flex w-full items-center gap-4 rounded-xl bg-gray-50 p-4 text-left transition-all duration-200 hover:bg-gray-100 dark:bg-dark-800/50 dark:hover:bg-dark-800"
        >
          <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-amber-100 transition-transform group-hover:scale-105 dark:bg-amber-900/30">
            <Icon name="gift" size="lg" className="text-amber-600 dark:text-amber-400" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-gray-900 dark:text-white">{t('dashboard.redeemCode')}</p>
            <p className="text-xs text-gray-500 dark:text-dark-400">{t('dashboard.addBalanceWithCode')}</p>
          </div>
          <Icon
            name="chevronRight"
            size="md"
            className="text-gray-400 transition-colors group-hover:text-amber-500 dark:text-dark-500"
          />
        </button>
      </div>
    </div>
  )
}
