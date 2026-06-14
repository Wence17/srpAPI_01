'use client'

import { useMemo } from 'react'
import { formatScaled } from '@/lib/pricing'

interface PricingRowProps {
  label: string
  value?: number | null
  unit: string
  scale: number
}

export default function PricingRow({ label, value = null, unit, scale }: PricingRowProps) {
  const display = useMemo(
    () => (value == null ? '-' : `${formatScaled(value, scale)} ${unit}`),
    [value, scale, unit],
  )

  return (
    <div className="flex justify-between gap-2">
      <span className="text-gray-500 dark:text-gray-400">{label}</span>
      <span className="font-mono">{display}</span>
    </div>
  )
}
