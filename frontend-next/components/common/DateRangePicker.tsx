'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useI18n } from '@/lib/i18n'
import Icon from '@/components/icons/Icon'

interface DatePreset {
  labelKey: string
  value: string
  getRange: () => { start: string; end: string }
}

interface DateRangePickerProps {
  startDate: string
  endDate: string
  onUpdateStartDate: (value: string) => void
  onUpdateEndDate: (value: string) => void
  onChange: (range: { startDate: string; endDate: string; preset: string | null }) => void
}

function formatDateToString(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export default function DateRangePicker({
  startDate,
  endDate,
  onUpdateStartDate,
  onUpdateEndDate,
  onChange,
}: DateRangePickerProps) {
  const { t, locale } = useI18n()
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [isOpen, setIsOpen] = useState(false)
  const [localStartDate, setLocalStartDate] = useState(startDate)
  const [localEndDate, setLocalEndDate] = useState(endDate)
  const [activePreset, setActivePreset] = useState<string | null>('last24Hours')

  const today = useMemo(() => formatDateToString(new Date()), [])

  const tomorrow = useMemo(() => {
    const d = new Date()
    d.setDate(d.getDate() + 1)
    return formatDateToString(d)
  }, [])

  const presets: DatePreset[] = useMemo(
    () => [
      {
        labelKey: 'dates.today',
        value: 'today',
        getRange: () => ({ start: today, end: today }),
      },
      {
        labelKey: 'dates.yesterday',
        value: 'yesterday',
        getRange: () => {
          const d = new Date()
          d.setDate(d.getDate() - 1)
          const yesterday = formatDateToString(d)
          return { start: yesterday, end: yesterday }
        },
      },
      {
        labelKey: 'dates.last24Hours',
        value: 'last24Hours',
        getRange: () => {
          const end = new Date()
          const start = new Date(end.getTime() - 24 * 60 * 60 * 1000)
          return { start: formatDateToString(start), end: formatDateToString(end) }
        },
      },
      {
        labelKey: 'dates.last7Days',
        value: '7days',
        getRange: () => {
          const d = new Date()
          d.setDate(d.getDate() - 6)
          return { start: formatDateToString(d), end: today }
        },
      },
      {
        labelKey: 'dates.last14Days',
        value: '14days',
        getRange: () => {
          const d = new Date()
          d.setDate(d.getDate() - 13)
          return { start: formatDateToString(d), end: today }
        },
      },
      {
        labelKey: 'dates.last30Days',
        value: '30days',
        getRange: () => {
          const d = new Date()
          d.setDate(d.getDate() - 29)
          return { start: formatDateToString(d), end: today }
        },
      },
      {
        labelKey: 'dates.thisMonth',
        value: 'thisMonth',
        getRange: () => {
          const now = new Date()
          const start = formatDateToString(new Date(now.getFullYear(), now.getMonth(), 1))
          return { start, end: today }
        },
      },
      {
        labelKey: 'dates.lastMonth',
        value: 'lastMonth',
        getRange: () => {
          const now = new Date()
          const start = formatDateToString(new Date(now.getFullYear(), now.getMonth() - 1, 1))
          const end = formatDateToString(new Date(now.getFullYear(), now.getMonth(), 0))
          return { start, end }
        },
      },
    ],
    [today],
  )

  const formatDisplayDate = useCallback(
    (dateStr: string): string => {
      const date = new Date(`${dateStr}T00:00:00`)
      const dateLocale = locale === 'zh' ? 'zh-CN' : 'en-US'
      return date.toLocaleDateString(dateLocale, { month: 'short', day: 'numeric' })
    },
    [locale],
  )

  const detectPreset = useCallback(
    (start: string, end: string) => {
      for (const preset of presets) {
        const range = preset.getRange()
        if (range.start === start && range.end === end) {
          return preset.value
        }
      }
      return null
    },
    [presets],
  )

  const onDateChange = useCallback(
    (start: string, end: string) => {
      setActivePreset(detectPreset(start, end))
    },
    [detectPreset],
  )

  useEffect(() => {
    setLocalStartDate(startDate)
    onDateChange(startDate, endDate)
  }, [startDate, endDate, onDateChange])

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && isOpen) {
        setIsOpen(false)
      }
    }
    document.addEventListener('click', handleClickOutside)
    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('click', handleClickOutside)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [isOpen])

  const displayValue = useMemo(() => {
    if (activePreset) {
      const preset = presets.find((p) => p.value === activePreset)
      if (preset) return t(preset.labelKey)
    }
    if (localStartDate && localEndDate) {
      if (localStartDate === localEndDate) {
        return formatDisplayDate(localStartDate)
      }
      return `${formatDisplayDate(localStartDate)} - ${formatDisplayDate(localEndDate)}`
    }
    return t('dates.selectDateRange')
  }, [activePreset, presets, localStartDate, localEndDate, t, formatDisplayDate])

  function selectPreset(preset: DatePreset) {
    const range = preset.getRange()
    setLocalStartDate(range.start)
    setLocalEndDate(range.end)
    setActivePreset(preset.value)
  }

  function apply() {
    onUpdateStartDate(localStartDate)
    onUpdateEndDate(localEndDate)
    onChange({
      startDate: localStartDate,
      endDate: localEndDate,
      preset: activePreset,
    })
    setIsOpen(false)
  }

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        className={`date-picker-trigger${isOpen ? ' date-picker-trigger-open' : ''}`}
      >
        <span className="date-picker-icon">
          <Icon name="calendar" size="sm" />
        </span>
        <span className="date-picker-value">{displayValue}</span>
        <span className="date-picker-chevron">
          <Icon name="chevronDown" size="sm" className={`transition-transform duration-200${isOpen ? ' rotate-180' : ''}`} />
        </span>
      </button>

      {isOpen ? (
        <div className="date-picker-dropdown">
          <div className="date-picker-presets">
            {presets.map((preset) => (
              <button
                key={preset.value}
                type="button"
                onClick={() => selectPreset(preset)}
                className={`date-picker-preset${activePreset === preset.value ? ' date-picker-preset-active' : ''}`}
              >
                {t(preset.labelKey)}
              </button>
            ))}
          </div>

          <div className="date-picker-divider" />

          <div className="date-picker-custom">
            <div className="date-picker-field">
              <label className="date-picker-label">{t('dates.startDate')}</label>
              <input
                type="date"
                value={localStartDate}
                max={localEndDate || tomorrow}
                className="date-picker-input"
                onChange={(e) => {
                  setLocalStartDate(e.target.value)
                  onDateChange(e.target.value, localEndDate)
                }}
              />
            </div>
            <div className="date-picker-separator">
              <Icon name="arrowRight" size="sm" className="text-gray-400" />
            </div>
            <div className="date-picker-field">
              <label className="date-picker-label">{t('dates.endDate')}</label>
              <input
                type="date"
                value={localEndDate}
                min={localStartDate}
                max={tomorrow}
                className="date-picker-input"
                onChange={(e) => {
                  setLocalEndDate(e.target.value)
                  onDateChange(localStartDate, e.target.value)
                }}
              />
            </div>
          </div>

          <div className="date-picker-actions">
            <button type="button" onClick={apply} className="date-picker-apply">
              {t('dates.apply')}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
