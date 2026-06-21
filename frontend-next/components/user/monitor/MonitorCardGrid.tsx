'use client'

import { useI18n } from '@/lib/i18n'
import type { UserMonitorDetail, UserMonitorView } from '@/lib/channelMonitorUser'
import EmptyState from '@/components/common/EmptyState'
import MonitorCard from '@/components/user/monitor/MonitorCard'

interface MonitorCardGridProps {
  items: UserMonitorView[]
  window: '7d' | '15d' | '30d'
  countdownSeconds: number
  loading: boolean
  detailCache: Record<number, UserMonitorDetail>
  onCardClick: (item: UserMonitorView) => void
}

function resolveAvailability(
  item: UserMonitorView,
  window: '7d' | '15d' | '30d',
  detailCache: Record<number, UserMonitorDetail>,
): number | null {
  if (window === '7d') return item.availability_7d ?? null
  const detail = detailCache[item.id]
  if (!detail) return null
  const primary = detail.models.find((model) => model.model === item.primary_model)
  if (!primary) return null
  return window === '15d' ? primary.availability_15d ?? null : primary.availability_30d ?? null
}

export default function MonitorCardGrid({
  items,
  window,
  countdownSeconds,
  loading,
  detailCache,
  onCardClick,
}: MonitorCardGridProps) {
  const { t } = useI18n()

  if (loading && items.length === 0) {
    return (
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {Array.from({ length: 6 }).map((_, index) => (
          <div
            key={index}
            className="min-h-[280px] animate-pulse rounded-2xl border border-gray-200/80 bg-white/70 p-5 dark:border-dark-700/70 dark:bg-dark-800/60"
          >
            <div className="flex items-start gap-3">
              <div className="h-9 w-9 rounded-xl bg-gray-200 dark:bg-dark-700" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-2/3 rounded bg-gray-200 dark:bg-dark-700" />
                <div className="h-3 w-1/2 rounded bg-gray-200 dark:bg-dark-700" />
              </div>
              <div className="h-6 w-16 rounded-full bg-gray-200 dark:bg-dark-700" />
            </div>
            <div className="mt-5 grid grid-cols-2 gap-2">
              <div className="h-16 rounded-xl bg-gray-100 dark:bg-dark-900/40" />
              <div className="h-16 rounded-xl bg-gray-100 dark:bg-dark-900/40" />
            </div>
            <div className="mt-6 h-5 w-full rounded bg-gray-100 dark:bg-dark-900/40" />
          </div>
        ))}
      </div>
    )
  }

  if (items.length === 0) {
    return (
      <EmptyState
        title={t('channelStatus.empty.title')}
        description={t('channelStatus.empty.description')}
      />
    )
  }

  return (
    <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
      {items.map((item) => (
        <MonitorCard
          key={item.id}
          item={item}
          window={window}
          availabilityValue={resolveAvailability(item, window, detailCache)}
          countdownSeconds={countdownSeconds}
          onClick={() => onCardClick(item)}
        />
      ))}
    </div>
  )
}
