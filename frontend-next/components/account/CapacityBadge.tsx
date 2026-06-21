'use client'

import { type ReactNode } from 'react'

interface CapacityBadgeProps {
  colorClass: string
  tooltip?: string
  current: string | number
  max: string | number
  suffix?: string
  children?: ReactNode
}

export default function CapacityBadge({
  colorClass,
  tooltip,
  current,
  max,
  suffix,
  children,
}: CapacityBadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md px-1.5 py-px text-[10px] font-medium leading-tight ${colorClass}`}
      title={tooltip}
    >
      {children}
      <span className="font-mono">{current}</span>
      <span className="text-gray-400 dark:text-gray-500">/</span>
      <span className="font-mono">{max}</span>
      {suffix ? <span className="text-[9px] opacity-60">{suffix}</span> : null}
    </span>
  )
}
