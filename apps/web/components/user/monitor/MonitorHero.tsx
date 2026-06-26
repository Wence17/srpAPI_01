'use client'

import { useMemo } from 'react'
import { useI18n } from '@/lib/i18n'
import Icon from '@/components/icons/Icon'
import AutoRefreshButton from '@/components/common/AutoRefreshButton'
export type MonitorWindow = '7d' | '15d' | '30d'
export type OverallStatus = 'operational' | 'degraded'

interface MonitorHeroProps {
  overallStatus: OverallStatus
  intervalSeconds: number
  window: MonitorWindow
  loading: boolean
  autoRefresh?: {
    enabled: boolean
    intervalSeconds: number
    countdown: number
    intervals: readonly number[]
    setEnabled: (value: boolean) => void
    setInterval: (value: number) => void
  }
  onUpdateWindow: (value: MonitorWindow) => void
  onRefresh: () => void
}

export default function MonitorHero({
  overallStatus,
  window,
  loading,
  autoRefresh,
  onUpdateWindow,
  onRefresh,
}: MonitorHeroProps) {
  const { t } = useI18n()

  const windowOptions = useMemo<{ value: MonitorWindow; label: string }[]>(
    () => [
      { value: '7d', label: t('channelStatus.windowTab.7d') },
      { value: '15d', label: t('channelStatus.windowTab.15d') },
      { value: '30d', label: t('channelStatus.windowTab.30d') },
    ],
    [t],
  )

  const overallLabel = t(`channelStatus.overall.${overallStatus}`)

  const overallChipClass =
    overallStatus === 'operational'
      ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300'
      : 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300'

  const overallDotClass =
    overallStatus === 'operational' ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500 animate-pulse'

  return (
    <section className="py-3 md:py-4">
      <div className="flex flex-wrap items-center justify-end gap-3">
        <div
          role="tablist"
          className="inline-flex rounded-xl border border-gray-200/60 bg-gray-100 p-0.5 text-xs dark:border-dark-700/60 dark:bg-dark-800"
        >
          {windowOptions.map((opt) => (
            <button
              key={opt.value}
              type="button"
              role="tab"
              aria-selected={window === opt.value}
              className={`rounded-lg px-3 py-1 transition-colors ${
                window === opt.value
                  ? 'bg-white font-semibold text-gray-900 shadow-sm dark:bg-dark-700 dark:text-white'
                  : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
              }`}
              onClick={() => onUpdateWindow(opt.value)}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <span
          className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold uppercase tracking-wider ${overallChipClass}`}
        >
          <span className={`mr-1.5 h-1.5 w-1.5 rounded-full ${overallDotClass}`} />
          {overallLabel}
        </span>

        <button
          type="button"
          className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 disabled:opacity-50 dark:text-gray-400 dark:hover:bg-dark-700 dark:hover:text-gray-200"
          disabled={loading}
          title={t('common.refresh')}
          onClick={onRefresh}
        >
          <Icon name="refresh" size="md" className={loading ? 'animate-spin' : ''} />
        </button>

        {autoRefresh ? (
          <AutoRefreshButton
            enabled={autoRefresh.enabled}
            intervalSeconds={autoRefresh.intervalSeconds}
            countdown={autoRefresh.countdown}
            intervals={autoRefresh.intervals}
            onUpdateEnabled={autoRefresh.setEnabled}
            onUpdateInterval={autoRefresh.setInterval}
          />
        ) : null}
      </div>
    </section>
  )
}
