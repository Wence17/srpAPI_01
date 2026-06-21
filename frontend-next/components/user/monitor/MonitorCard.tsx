'use client'

import { useMemo } from 'react'
import { useI18n } from '@/lib/i18n'
import type { UserMonitorView } from '@/lib/channelMonitorUser'
import { providerGradient, useChannelMonitorFormat } from '@/lib/useChannelMonitorFormat'
import ProviderIcon from '@/components/user/monitor/ProviderIcon'
import MonitorMetricPair from '@/components/user/monitor/MonitorMetricPair'
import MonitorAvailabilityRow from '@/components/user/monitor/MonitorAvailabilityRow'
import MonitorTimeline from '@/components/user/monitor/MonitorTimeline'

const PROVIDER_TINT: Record<string, string> = {
  openai: 'text-emerald-600 dark:text-emerald-300',
  anthropic: 'text-orange-600 dark:text-orange-300',
  gemini: 'text-sky-600 dark:text-sky-300',
}

interface MonitorCardProps {
  item: UserMonitorView
  window: '7d' | '15d' | '30d'
  availabilityValue: number | null
  countdownSeconds: number
  onClick: () => void
}

export default function MonitorCard({
  item,
  window,
  availabilityValue,
  countdownSeconds,
  onClick,
}: MonitorCardProps) {
  const { t } = useI18n()
  const { statusLabel, statusBadgeClass, providerLabel, providerBadgeClass, formatLatency } =
    useChannelMonitorFormat()

  const providerTintClass = PROVIDER_TINT[item.provider] ?? 'text-gray-500 dark:text-gray-300'

  const availabilityLabel = useMemo(() => {
    const win = t(`channelStatus.windowTab.${window}`)
    return `${t('monitorCommon.availabilityPrefix')} · ${win}`
  }, [t, window])

  const extraModelsCountLabel = useMemo(() => {
    const count = item.extra_models?.length ?? 0
    if (count === 0) return undefined
    return t('monitorCommon.extraModelsCount', { n: count })
  }, [item.extra_models, t])

  return (
    <button
      type="button"
      className="group flex min-h-[280px] w-full flex-col rounded-2xl border border-gray-200/80 bg-white/70 p-5 text-left shadow-card backdrop-blur-xl transition-all duration-300 ease-out hover:-translate-y-1 hover:border-gray-300 hover:shadow-card-hover dark:border-dark-700/70 dark:bg-dark-800/60 dark:hover:border-primary-500/30"
      onClick={onClick}
    >
      <div className="flex items-start gap-3">
        <span
          className={`grid h-9 w-9 flex-shrink-0 place-items-center rounded-xl ring-1 ring-black/5 dark:ring-white/10 ${providerGradient(item.provider)} ${providerTintClass}`}
        >
          <ProviderIcon provider={item.provider} size={20} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-base font-semibold text-gray-900 dark:text-gray-100">{item.name}</div>
          <div className="mt-0.5 flex min-w-0 items-center gap-1.5">
            <span
              className={`inline-flex flex-shrink-0 items-center rounded-md px-1.5 py-0.5 text-[10px] font-medium ${providerBadgeClass(item.provider)}`}
            >
              {providerLabel(item.provider)}
            </span>
            <span className="truncate font-mono text-xs text-gray-500 dark:text-gray-400">
              {item.primary_model}
            </span>
            {item.group_name ? (
              <span className="inline-flex flex-shrink-0 items-center rounded-md bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-600 dark:bg-dark-700 dark:text-gray-300">
                {item.group_name}
              </span>
            ) : null}
          </div>
        </div>
        <span
          className={`flex-shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${statusBadgeClass(item.primary_status)}`}
        >
          {statusLabel(item.primary_status)}
        </span>
      </div>

      <MonitorMetricPair
        primaryIcon="bolt"
        primaryLabel={t('monitorCommon.dialogLatency')}
        primaryValue={formatLatency(item.primary_latency_ms)}
        primaryUnit="ms"
        secondaryIcon="globe"
        secondaryLabel={t('monitorCommon.endpointPing')}
        secondaryValue={formatLatency(item.primary_ping_latency_ms)}
        secondaryUnit="ms"
      />

      <div className="mt-4 border-t border-gray-100 dark:border-dark-700/60" />

      <MonitorAvailabilityRow
        windowLabel={availabilityLabel}
        value={availabilityValue}
        samplesLabel={extraModelsCountLabel}
      />

      <MonitorTimeline buckets={item.timeline} countdownSeconds={countdownSeconds} />
    </button>
  )
}
