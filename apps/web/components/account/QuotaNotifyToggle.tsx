'use client'

import {
  QUOTA_THRESHOLD_TYPE_FIXED,
  QUOTA_THRESHOLD_TYPE_PERCENTAGE,
  type QuotaThresholdType,
} from '@/lib/constants/account'

interface QuotaNotifyToggleProps {
  enabled: boolean | null
  threshold: number | null
  thresholdType: QuotaThresholdType | null
  onUpdateEnabled?: (value: boolean | null) => void
  onUpdateThreshold?: (value: number | null) => void
  onUpdateThresholdType?: (value: QuotaThresholdType | null) => void
}

export default function QuotaNotifyToggle({
  enabled,
  threshold,
  thresholdType,
  onUpdateEnabled,
  onUpdateThreshold,
  onUpdateThresholdType,
}: QuotaNotifyToggleProps) {
  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        onClick={() => onUpdateEnabled?.(!enabled)}
        className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
          enabled ? 'bg-primary-600' : 'bg-gray-200 dark:bg-dark-600'
        }`}
      >
        <span
          className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
            enabled ? 'translate-x-4' : 'translate-x-0'
          }`}
        />
      </button>
      {enabled ? (
        <>
          <input
            value={threshold ?? ''}
            onChange={(e) =>
              onUpdateThreshold?.(parseFloat(e.target.value) || null)
            }
            type="number"
            min={0}
            max={thresholdType === QUOTA_THRESHOLD_TYPE_PERCENTAGE ? 100 : undefined}
            step={thresholdType === QUOTA_THRESHOLD_TYPE_PERCENTAGE ? 1 : 0.01}
            className="input py-1 text-sm flex-1 min-w-0"
          />
          <select
            value={thresholdType || QUOTA_THRESHOLD_TYPE_FIXED}
            onChange={(e) =>
              onUpdateThresholdType?.(e.target.value as QuotaThresholdType)
            }
            className="input py-1 text-xs w-[4.5rem] flex-shrink-0 text-center"
          >
            <option value={QUOTA_THRESHOLD_TYPE_FIXED}>$</option>
            <option value={QUOTA_THRESHOLD_TYPE_PERCENTAGE}>%</option>
          </select>
        </>
      ) : null}
    </div>
  )
}
