'use client'

import Icon from '@/components/icons/Icon'

interface MonitorMetricPairProps {
  primaryLabel: string
  primaryValue: string
  primaryUnit: string
  primaryIcon: 'bolt' | 'globe' | 'clock' | 'link'
  secondaryLabel: string
  secondaryValue: string
  secondaryUnit: string
  secondaryIcon: 'bolt' | 'globe' | 'clock' | 'link'
}

export default function MonitorMetricPair({
  primaryLabel,
  primaryValue,
  primaryUnit,
  primaryIcon,
  secondaryLabel,
  secondaryValue,
  secondaryUnit,
  secondaryIcon,
}: MonitorMetricPairProps) {
  return (
    <div className="mt-5 grid grid-cols-2 gap-2">
      <div className="rounded-xl border border-gray-100 bg-gray-50/80 p-3 dark:border-dark-700/50 dark:bg-dark-900/40">
        <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
          <Icon name={primaryIcon} size="xs" />
          <span>{primaryLabel}</span>
        </div>
        <div className="mt-1.5 font-mono text-lg font-bold tabular-nums text-gray-900 dark:text-gray-100">
          {primaryValue}
          <span className="ml-0.5 text-xs font-normal text-gray-400">{primaryUnit}</span>
        </div>
      </div>
      <div className="rounded-xl border border-gray-100 bg-gray-50/80 p-3 dark:border-dark-700/50 dark:bg-dark-900/40">
        <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
          <Icon name={secondaryIcon} size="xs" />
          <span>{secondaryLabel}</span>
        </div>
        <div className="mt-1.5 font-mono text-lg font-bold tabular-nums text-gray-900 dark:text-gray-100">
          {secondaryValue}
          <span className="ml-0.5 text-xs font-normal text-gray-400">{secondaryUnit}</span>
        </div>
      </div>
    </div>
  )
}
