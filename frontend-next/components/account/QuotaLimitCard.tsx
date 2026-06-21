'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useI18n } from '@/lib/i18n'
import QuotaDimensionRow from '@/components/account/QuotaDimensionRow'
import type { QuotaResetMode, QuotaThresholdType } from '@/lib/constants/account'

interface QuotaLimitCardProps {
  totalLimit: number | null
  dailyLimit: number | null
  weeklyLimit: number | null
  dailyResetMode: QuotaResetMode | null
  dailyResetHour: number | null
  weeklyResetMode: QuotaResetMode | null
  weeklyResetDay: number | null
  weeklyResetHour: number | null
  resetTimezone: string | null
  quotaNotifyGlobalEnabled?: boolean
  quotaNotifyDailyEnabled?: boolean | null
  quotaNotifyDailyThreshold?: number | null
  quotaNotifyDailyThresholdType?: QuotaThresholdType | null
  quotaNotifyWeeklyEnabled?: boolean | null
  quotaNotifyWeeklyThreshold?: number | null
  quotaNotifyWeeklyThresholdType?: QuotaThresholdType | null
  quotaNotifyTotalEnabled?: boolean | null
  quotaNotifyTotalThreshold?: number | null
  quotaNotifyTotalThresholdType?: QuotaThresholdType | null
  onUpdateTotalLimit?: (value: number | null) => void
  onUpdateDailyLimit?: (value: number | null) => void
  onUpdateWeeklyLimit?: (value: number | null) => void
  onUpdateDailyResetMode?: (value: QuotaResetMode | null) => void
  onUpdateDailyResetHour?: (value: number | null) => void
  onUpdateWeeklyResetMode?: (value: QuotaResetMode | null) => void
  onUpdateWeeklyResetDay?: (value: number | null) => void
  onUpdateWeeklyResetHour?: (value: number | null) => void
  onUpdateResetTimezone?: (value: string | null) => void
  onUpdateQuotaNotifyDailyEnabled?: (value: boolean | null) => void
  onUpdateQuotaNotifyDailyThreshold?: (value: number | null) => void
  onUpdateQuotaNotifyDailyThresholdType?: (value: QuotaThresholdType | null) => void
  onUpdateQuotaNotifyWeeklyEnabled?: (value: boolean | null) => void
  onUpdateQuotaNotifyWeeklyThreshold?: (value: number | null) => void
  onUpdateQuotaNotifyWeeklyThresholdType?: (value: QuotaThresholdType | null) => void
  onUpdateQuotaNotifyTotalEnabled?: (value: boolean | null) => void
  onUpdateQuotaNotifyTotalThreshold?: (value: number | null) => void
  onUpdateQuotaNotifyTotalThresholdType?: (value: QuotaThresholdType | null) => void
}

const TIMEZONE_OPTIONS = [
  'UTC',
  'Asia/Shanghai',
  'Asia/Tokyo',
  'Asia/Seoul',
  'Asia/Singapore',
  'Asia/Kolkata',
  'Asia/Dubai',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Europe/Moscow',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Sao_Paulo',
  'Australia/Sydney',
  'Pacific/Auckland',
]

const HOUR_OPTIONS = Array.from({ length: 24 }, (_, i) => i)

const DAY_OPTIONS = [
  { value: 1, key: 'monday' },
  { value: 2, key: 'tuesday' },
  { value: 3, key: 'wednesday' },
  { value: 4, key: 'thursday' },
  { value: 5, key: 'friday' },
  { value: 6, key: 'saturday' },
  { value: 0, key: 'sunday' },
]

export default function QuotaLimitCard({
  totalLimit,
  dailyLimit,
  weeklyLimit,
  dailyResetMode,
  dailyResetHour,
  weeklyResetMode,
  weeklyResetDay,
  weeklyResetHour,
  resetTimezone,
  quotaNotifyGlobalEnabled = false,
  quotaNotifyDailyEnabled = null,
  quotaNotifyDailyThreshold = null,
  quotaNotifyDailyThresholdType = null,
  quotaNotifyWeeklyEnabled = null,
  quotaNotifyWeeklyThreshold = null,
  quotaNotifyWeeklyThresholdType = null,
  quotaNotifyTotalEnabled = null,
  quotaNotifyTotalThreshold = null,
  quotaNotifyTotalThresholdType = null,
  onUpdateTotalLimit,
  onUpdateDailyLimit,
  onUpdateWeeklyLimit,
  onUpdateDailyResetMode,
  onUpdateDailyResetHour,
  onUpdateWeeklyResetMode,
  onUpdateWeeklyResetDay,
  onUpdateWeeklyResetHour,
  onUpdateResetTimezone,
  onUpdateQuotaNotifyDailyEnabled,
  onUpdateQuotaNotifyDailyThreshold,
  onUpdateQuotaNotifyDailyThresholdType,
  onUpdateQuotaNotifyWeeklyEnabled,
  onUpdateQuotaNotifyWeeklyThreshold,
  onUpdateQuotaNotifyWeeklyThresholdType,
  onUpdateQuotaNotifyTotalEnabled,
  onUpdateQuotaNotifyTotalThreshold,
  onUpdateQuotaNotifyTotalThresholdType,
}: QuotaLimitCardProps) {
  const { t } = useI18n()

  const enabled = useMemo(
    () =>
      (totalLimit != null && totalLimit > 0) ||
      (dailyLimit != null && dailyLimit > 0) ||
      (weeklyLimit != null && weeklyLimit > 0),
    [totalLimit, dailyLimit, weeklyLimit],
  )

  const [localEnabled, setLocalEnabled] = useState(enabled)
  const [collapsed, setCollapsed] = useState(false)
  const prevLocalEnabledRef = useRef(localEnabled)

  useEffect(() => {
    setLocalEnabled(enabled)
  }, [enabled])

  useEffect(() => {
    if (prevLocalEnabledRef.current && !localEnabled) {
      setCollapsed(false)
      onUpdateTotalLimit?.(null)
      onUpdateDailyLimit?.(null)
      onUpdateWeeklyLimit?.(null)
      onUpdateDailyResetMode?.(null)
      onUpdateDailyResetHour?.(null)
      onUpdateWeeklyResetMode?.(null)
      onUpdateWeeklyResetDay?.(null)
      onUpdateWeeklyResetHour?.(null)
      onUpdateResetTimezone?.(null)
    }
    prevLocalEnabledRef.current = localEnabled
  }, [
    localEnabled,
    onUpdateDailyLimit,
    onUpdateDailyResetHour,
    onUpdateDailyResetMode,
    onUpdateResetTimezone,
    onUpdateTotalLimit,
    onUpdateWeeklyLimit,
    onUpdateWeeklyResetDay,
    onUpdateWeeklyResetHour,
    onUpdateWeeklyResetMode,
  ])

  const weeklyFixedHint = useMemo(() => {
    const dayKey = DAY_OPTIONS.find((d) => d.value === (weeklyResetDay ?? 1))?.key || 'monday'
    return t('admin.accounts.quotaWeeklyLimitHintFixed', {
      day: t(`admin.accounts.dayOfWeek.${dayKey}`),
      hour: String(weeklyResetHour ?? 0).padStart(2, '0'),
      timezone: resetTimezone || 'UTC',
    })
  }, [resetTimezone, t, weeklyResetDay, weeklyResetHour])

  const dailyFixedHint = useMemo(
    () =>
      t('admin.accounts.quotaDailyLimitHintFixed', {
        hour: String(dailyResetHour ?? 0).padStart(2, '0'),
        timezone: resetTimezone || 'UTC',
      }),
    [dailyResetHour, resetTimezone, t],
  )

  return (
    <div className="rounded-lg border border-gray-200 dark:border-dark-600">
      <div
        className={`flex items-center justify-between p-4 ${localEnabled && !collapsed ? 'pb-0' : ''}`}
      >
        <div
          className="flex flex-1 cursor-pointer items-center gap-2"
          onClick={() => localEnabled && setCollapsed(!collapsed)}
        >
          {localEnabled ? (
            <svg
              className={`h-4 w-4 text-gray-400 transition-transform ${collapsed ? '-rotate-90' : ''}`}
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path
                fillRule="evenodd"
                d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
                clipRule="evenodd"
              />
            </svg>
          ) : null}
          <div>
            <label className="input-label mb-0 cursor-pointer">
              {t('admin.accounts.quotaLimitToggle')}
            </label>
            <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
              {t('admin.accounts.quotaLimitToggleHint')}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setLocalEnabled(!localEnabled)}
          className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 ${
            localEnabled ? 'bg-primary-600' : 'bg-gray-200 dark:bg-dark-600'
          }`}
        >
          <span
            className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
              localEnabled ? 'translate-x-5' : 'translate-x-0'
            }`}
          />
        </button>
      </div>

      {localEnabled && !collapsed ? (
        <div className="space-y-2 p-4 pt-3">
          <QuotaDimensionRow
            dim="daily"
            label={t('admin.accounts.quotaDailyLimit')}
            limit={dailyLimit}
            quotaNotifyGlobalEnabled={quotaNotifyGlobalEnabled}
            notifyEnabled={quotaNotifyDailyEnabled ?? null}
            notifyThreshold={quotaNotifyDailyThreshold ?? null}
            notifyThresholdType={quotaNotifyDailyThresholdType ?? null}
            resetMode={dailyResetMode}
            resetHour={dailyResetHour}
            resetDay={null}
            resetTimezone={resetTimezone}
            hintRolling={t('admin.accounts.quotaDailyLimitHint')}
            hintFixed={dailyFixedHint}
            hourOptions={HOUR_OPTIONS}
            dayOptions={DAY_OPTIONS}
            timezoneOptions={TIMEZONE_OPTIONS}
            onUpdateLimit={onUpdateDailyLimit}
            onUpdateNotifyEnabled={onUpdateQuotaNotifyDailyEnabled}
            onUpdateNotifyThreshold={onUpdateQuotaNotifyDailyThreshold}
            onUpdateNotifyThresholdType={onUpdateQuotaNotifyDailyThresholdType}
            onUpdateResetMode={onUpdateDailyResetMode}
            onUpdateResetHour={onUpdateDailyResetHour}
            onUpdateResetTimezone={onUpdateResetTimezone}
          />

          <QuotaDimensionRow
            dim="weekly"
            label={t('admin.accounts.quotaWeeklyLimit')}
            limit={weeklyLimit}
            quotaNotifyGlobalEnabled={quotaNotifyGlobalEnabled}
            notifyEnabled={quotaNotifyWeeklyEnabled ?? null}
            notifyThreshold={quotaNotifyWeeklyThreshold ?? null}
            notifyThresholdType={quotaNotifyWeeklyThresholdType ?? null}
            resetMode={weeklyResetMode}
            resetHour={weeklyResetHour}
            resetDay={weeklyResetDay}
            resetTimezone={resetTimezone}
            hintRolling={t('admin.accounts.quotaWeeklyLimitHint')}
            hintFixed={weeklyFixedHint}
            hourOptions={HOUR_OPTIONS}
            dayOptions={DAY_OPTIONS}
            timezoneOptions={TIMEZONE_OPTIONS}
            onUpdateLimit={onUpdateWeeklyLimit}
            onUpdateNotifyEnabled={onUpdateQuotaNotifyWeeklyEnabled}
            onUpdateNotifyThreshold={onUpdateQuotaNotifyWeeklyThreshold}
            onUpdateNotifyThresholdType={onUpdateQuotaNotifyWeeklyThresholdType}
            onUpdateResetMode={onUpdateWeeklyResetMode}
            onUpdateResetHour={onUpdateWeeklyResetHour}
            onUpdateResetDay={onUpdateWeeklyResetDay}
            onUpdateResetTimezone={onUpdateResetTimezone}
          />

          <QuotaDimensionRow
            dim="total"
            label={t('admin.accounts.quotaTotalLimit')}
            limit={totalLimit}
            quotaNotifyGlobalEnabled={quotaNotifyGlobalEnabled}
            notifyEnabled={quotaNotifyTotalEnabled ?? null}
            notifyThreshold={quotaNotifyTotalThreshold ?? null}
            notifyThresholdType={quotaNotifyTotalThresholdType ?? null}
            resetMode={null}
            resetHour={null}
            resetDay={null}
            resetTimezone={null}
            hintRolling={t('admin.accounts.quotaTotalLimitHint')}
            hintFixed=""
            hourOptions={HOUR_OPTIONS}
            dayOptions={DAY_OPTIONS}
            onUpdateLimit={onUpdateTotalLimit}
            onUpdateNotifyEnabled={onUpdateQuotaNotifyTotalEnabled}
            onUpdateNotifyThreshold={onUpdateQuotaNotifyTotalThreshold}
            onUpdateNotifyThresholdType={onUpdateQuotaNotifyTotalThresholdType}
          />
        </div>
      ) : null}
    </div>
  )
}
