'use client'

import { useMemo } from 'react'
import { useI18n } from '@/lib/i18n'
import type { MonitorTimelinePoint } from '@/lib/channelMonitorUser'
import { useChannelMonitorFormat } from '@/lib/useChannelMonitorFormat'

interface MonitorTimelineProps {
  buckets?: MonitorTimelinePoint[]
  countdownSeconds: number
  length?: number
  maintenance?: boolean
}

const STATUS_HEIGHT: Record<string, number> = {
  operational: 100,
  degraded: 65,
  failed: 35,
  error: 35,
  empty: 15,
}

const STATUS_COLOR: Record<string, string> = {
  operational: 'bg-emerald-500',
  degraded: 'bg-amber-500',
  failed: 'bg-red-500',
  error: 'bg-red-500',
  empty: 'bg-gray-300 dark:bg-dark-600',
}

export default function MonitorTimeline({
  buckets = [],
  countdownSeconds,
  length = 60,
  maintenance = false,
}: MonitorTimelineProps) {
  const { t } = useI18n()
  const { statusLabel, formatLatency, formatRelativeTime } = useChannelMonitorFormat()

  const displayBars = useMemo(() => {
    const real = [...buckets].slice(0, length).reverse()
    const padCount = Math.max(0, length - real.length)
    const bars: Array<{ colorClass: string; heightPct: number; title: string }> = []

    for (let i = 0; i < padCount; i += 1) {
      bars.push({
        colorClass: STATUS_COLOR.empty,
        heightPct: STATUS_HEIGHT.empty,
        title: '',
      })
    }

    for (const point of real) {
      const status = point.status as keyof typeof STATUS_HEIGHT
      const colorClass = STATUS_COLOR[status] ?? STATUS_COLOR.empty
      const heightPct = STATUS_HEIGHT[status] ?? STATUS_HEIGHT.empty
      const latency = formatLatency(point.latency_ms)
      const relative = formatRelativeTime(point.checked_at)
      const label = statusLabel(point.status)
      bars.push({
        colorClass,
        heightPct,
        title: `${relative} · ${label} · ${latency}ms`,
      })
    }

    return bars
  }, [buckets, formatLatency, formatRelativeTime, length, statusLabel])

  return (
    <div className="mt-4 border-t border-gray-100 pt-3 dark:border-dark-700/60">
      <div className="mb-2 flex justify-between text-[10px] font-semibold uppercase tracking-widest text-gray-400">
        <span>{t('monitorCommon.history60pts', { n: length })}</span>
        <span className="tabular-nums">{t('monitorCommon.nextUpdateIn', { n: countdownSeconds })}</span>
      </div>

      {maintenance ? (
        <div className="flex h-5 w-full items-center justify-center rounded border border-dashed border-gray-300 text-[10px] uppercase tracking-widest text-gray-400 dark:border-dark-600">
          {t('monitorCommon.maintenancePaused')}
        </div>
      ) : (
        <div className="flex h-5 w-full items-end gap-[2px]">
          {displayBars.map((bar, idx) => (
            <div
              key={idx}
              className={`min-w-[3px] flex-1 rounded-sm ${bar.colorClass}`}
              style={{ height: `${bar.heightPct}%` }}
              title={bar.title}
            />
          ))}
        </div>
      )}

      <div className="mt-1 flex justify-between text-[9px] uppercase tracking-widest text-gray-400">
        <span>{t('monitorCommon.past')}</span>
        <span>{t('monitorCommon.now')}</span>
      </div>
    </div>
  )
}
