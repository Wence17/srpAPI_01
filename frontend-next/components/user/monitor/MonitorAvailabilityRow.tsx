'use client'

import { useMemo } from 'react'
import { useI18n } from '@/lib/i18n'
import { hslForPct } from '@/lib/useChannelMonitorFormat'

interface MonitorAvailabilityRowProps {
  windowLabel: string
  value: number | null
  samplesLabel?: string
}

export default function MonitorAvailabilityRow({
  windowLabel,
  value,
  samplesLabel,
}: MonitorAvailabilityRowProps) {
  const { t } = useI18n()

  const displayValue = useMemo(() => {
    if (value === null || Number.isNaN(value)) return t('monitorCommon.latencyEmpty')
    return value.toFixed(2)
  }, [t, value])

  const colorStyle = useMemo(() => {
    const colour = hslForPct(value)
    return colour ? { color: colour } : { color: 'rgb(156 163 175)' }
  }, [value])

  return (
    <>
      <div className="mt-3 flex items-end justify-between">
        <div className="text-[11px] uppercase tracking-widest text-gray-400">{windowLabel}</div>
        <div className="flex items-baseline gap-0.5">
          <span className="text-3xl font-bold tabular-nums leading-none" style={colorStyle}>
            {displayValue}
          </span>
          <span className="text-base font-semibold leading-none" style={colorStyle}>
            %
          </span>
        </div>
      </div>
      {samplesLabel ? (
        <div className="mt-1 text-right text-[11px] text-gray-400">{samplesLabel}</div>
      ) : null}
    </>
  )
}
