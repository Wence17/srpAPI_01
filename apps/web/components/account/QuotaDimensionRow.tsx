'use client'

import { useI18n } from '@/lib/i18n'
import QuotaNotifyToggle from '@/components/account/QuotaNotifyToggle'
import type { QuotaResetMode, QuotaThresholdType } from '@/lib/constants/account'

interface QuotaDimensionRowProps {
  dim: 'daily' | 'weekly' | 'total'
  label: string
  limit: number | null
  quotaNotifyGlobalEnabled: boolean
  notifyEnabled: boolean | null
  notifyThreshold: number | null
  notifyThresholdType: QuotaThresholdType | null
  resetMode: QuotaResetMode | null
  resetHour: number | null
  resetDay: number | null
  resetTimezone: string | null
  hintRolling: string
  hintFixed: string
  hourOptions: number[]
  dayOptions: { value: number; key: string }[]
  timezoneOptions?: string[]
  onUpdateLimit?: (value: number | null) => void
  onUpdateNotifyEnabled?: (value: boolean | null) => void
  onUpdateNotifyThreshold?: (value: number | null) => void
  onUpdateNotifyThresholdType?: (value: QuotaThresholdType | null) => void
  onUpdateResetMode?: (value: QuotaResetMode | null) => void
  onUpdateResetHour?: (value: number | null) => void
  onUpdateResetDay?: (value: number | null) => void
  onUpdateResetTimezone?: (value: string | null) => void
}

function getTimezoneOffsetLabel(tz: string): string {
  try {
    const dtf = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'shortOffset' })
    const parts = dtf.formatToParts(new Date())
    const tzPart = parts.find((p) => p.type === 'timeZoneName')
    return tzPart ? (tzPart.value === 'GMT' ? 'GMT+0' : tzPart.value) : ''
  } catch {
    return ''
  }
}

export default function QuotaDimensionRow({
  dim,
  label,
  limit,
  quotaNotifyGlobalEnabled,
  notifyEnabled,
  notifyThreshold,
  notifyThresholdType,
  resetMode,
  resetHour,
  resetDay,
  resetTimezone,
  hintRolling,
  hintFixed,
  hourOptions,
  dayOptions,
  timezoneOptions,
  onUpdateLimit,
  onUpdateNotifyEnabled,
  onUpdateNotifyThreshold,
  onUpdateNotifyThresholdType,
  onUpdateResetMode,
  onUpdateResetHour,
  onUpdateResetDay,
  onUpdateResetTimezone,
}: QuotaDimensionRowProps) {
  const { t } = useI18n()
  const hasResetMode = dim !== 'total'

  const onLimitInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.valueAsNumber
    onUpdateLimit?.(Number.isNaN(raw) ? null : raw)
  }

  const onModeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value as QuotaResetMode
    onUpdateResetMode?.(val)
    if (val === 'fixed') {
      if (resetHour == null) onUpdateResetHour?.(0)
      if (dim === 'weekly' && resetDay == null) onUpdateResetDay?.(1)
      if (!resetTimezone) onUpdateResetTimezone?.('UTC')
    }
  }

  return (
    <div>
      {quotaNotifyGlobalEnabled ? (
        <div className="mb-1 flex items-center gap-2">
          <span className="min-w-0 flex-1 text-xs font-medium text-gray-700 dark:text-gray-300">
            {label}
          </span>
          {limit && limit > 0 ? (
            <span className="min-w-0 flex-1 text-xs font-medium text-gray-700 dark:text-gray-300">
              {t('admin.accounts.quotaNotify.alert')}
            </span>
          ) : null}
        </div>
      ) : (
        <label className="input-label mb-1 block text-xs font-medium text-gray-700 dark:text-gray-300">
          {label}
        </label>
      )}

      <div className="flex items-center gap-2">
        <div className={`relative ${quotaNotifyGlobalEnabled ? 'min-w-0 flex-1' : 'flex-1'}`}>
          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-gray-500 dark:text-gray-400">
            $
          </span>
          <input
            value={limit ?? ''}
            onChange={onLimitInput}
            type="number"
            min={0}
            step={0.01}
            className="input py-1.5 pl-6 text-sm"
            placeholder={t('admin.accounts.quotaLimitPlaceholder')}
          />
        </div>
        {quotaNotifyGlobalEnabled && limit && limit > 0 ? (
          <div className="min-w-0 flex-1">
            <QuotaNotifyToggle
              enabled={notifyEnabled}
              threshold={notifyThreshold}
              thresholdType={notifyThresholdType}
              onUpdateEnabled={onUpdateNotifyEnabled}
              onUpdateThreshold={onUpdateNotifyThreshold}
              onUpdateThresholdType={onUpdateNotifyThresholdType}
            />
          </div>
        ) : null}
      </div>

      {hasResetMode ? (
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <label className="whitespace-nowrap text-xs text-gray-500 dark:text-gray-400">
            {t('admin.accounts.quotaResetMode')}
          </label>
          <select
            value={resetMode || 'rolling'}
            onChange={onModeChange}
            className="input w-auto py-1 text-xs"
          >
            <option value="rolling">{t('admin.accounts.quotaResetModeRolling')}</option>
            <option value="fixed">{t('admin.accounts.quotaResetModeFixed')}</option>
          </select>
          {resetMode === 'fixed' ? (
            <>
              {dim === 'weekly' ? (
                <>
                  <label className="whitespace-nowrap text-xs text-gray-500 dark:text-gray-400">
                    {t('admin.accounts.quotaWeeklyResetDay')}
                  </label>
                  <select
                    value={resetDay ?? 1}
                    onChange={(e) => onUpdateResetDay?.(Number(e.target.value))}
                    className="input w-28 py-1 text-xs"
                  >
                    {dayOptions.map((d) => (
                      <option key={d.value} value={d.value}>
                        {t(`admin.accounts.dayOfWeek.${d.key}`)}
                      </option>
                    ))}
                  </select>
                </>
              ) : null}
              <label className="whitespace-nowrap text-xs text-gray-500 dark:text-gray-400">
                {t('admin.accounts.quotaResetHour')}
              </label>
              <select
                value={resetHour ?? 0}
                onChange={(e) => onUpdateResetHour?.(Number(e.target.value))}
                className="input w-24 py-1 text-xs"
              >
                {hourOptions.map((h) => (
                  <option key={h} value={h}>
                    {String(h).padStart(2, '0')}:00
                  </option>
                ))}
              </select>
              {timezoneOptions && timezoneOptions.length > 0 ? (
                <select
                  value={resetTimezone || 'UTC'}
                  onChange={(e) => onUpdateResetTimezone?.(e.target.value)}
                  className="input w-auto py-1 text-xs"
                >
                  {timezoneOptions.map((tz) => (
                    <option key={tz} value={tz}>
                      {tz} ({getTimezoneOffsetLabel(tz)})
                    </option>
                  ))}
                </select>
              ) : null}
            </>
          ) : null}
          <span className="text-[11px] text-gray-500 dark:text-gray-400">
            {resetMode === 'fixed' ? hintFixed : hintRolling}
          </span>
        </div>
      ) : null}

      {!hasResetMode ? (
        <p className="input-hint mb-0 text-[11px]">{hintRolling}</p>
      ) : null}
    </div>
  )
}
