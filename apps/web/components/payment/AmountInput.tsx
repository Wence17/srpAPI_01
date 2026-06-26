'use client'

import { useEffect, useMemo, useState } from 'react'
import { useI18n } from '@/lib/i18n/I18nProvider'

const DEFAULT_AMOUNTS = [10, 20, 50, 100, 200, 500, 1000, 2000, 5000]
const AMOUNT_PATTERN = /^\d*(\.\d{0,2})?$/

interface AmountInputProps {
  amounts?: number[]
  modelValue: number | null
  min?: number
  max?: number
  onChange: (value: number | null) => void
}

export default function AmountInput({
  amounts = DEFAULT_AMOUNTS,
  modelValue,
  min = 0,
  max = 0,
  onChange,
}: AmountInputProps) {
  const { t } = useI18n()
  const [customText, setCustomText] = useState('')

  // 0 = no limit
  const filteredAmounts = useMemo(
    () => amounts.filter((a) => (min <= 0 || a >= min) && (max <= 0 || a <= max)),
    [amounts, min, max],
  )

  const placeholderText = useMemo(() => {
    if (min > 0 && max > 0) return `${min} - ${max}`
    if (min > 0) return `≥ ${min}`
    if (max > 0) return `≤ ${max}`
    return t('payment.enterAmount')
  }, [min, max, t])

  // Keep the custom text in sync with the external model value.
  useEffect(() => {
    if (modelValue !== null && String(modelValue) !== customText) {
      setCustomText(String(modelValue))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modelValue])

  function selectAmount(amt: number) {
    setCustomText(String(amt))
    onChange(amt)
  }

  function handleInput(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value
    if (!AMOUNT_PATTERN.test(val)) return
    setCustomText(val)
    if (val === '') {
      onChange(null)
      return
    }
    const num = parseFloat(val)
    if (!isNaN(num) && num > 0) {
      onChange(num)
    } else {
      onChange(null)
    }
  }

  return (
    <div className="space-y-4">
      {/* Quick Amount Buttons */}
      <div>
        <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
          {t('payment.quickAmounts')}
        </label>
        <div className="grid grid-cols-3 gap-2">
          {filteredAmounts.map((amt) => (
            <button
              key={amt}
              type="button"
              className={[
                'rounded-lg border-2 px-4 py-3 text-center font-medium transition-colors',
                modelValue === amt
                  ? 'border-primary-500 bg-primary-50 text-primary-700 dark:border-primary-400 dark:bg-primary-900/40 dark:text-primary-300'
                  : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300 dark:border-dark-600 dark:bg-dark-800 dark:text-gray-200 dark:hover:border-dark-500',
              ].join(' ')}
              onClick={() => selectAmount(amt)}
            >
              {amt}
            </button>
          ))}
        </div>
      </div>

      {/* Custom Amount Input */}
      <div>
        <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
          {t('payment.customAmount')}
        </label>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-dark-500">
            $
          </span>
          <input
            type="text"
            inputMode="decimal"
            value={customText}
            placeholder={placeholderText}
            className="input w-full py-3 pl-8 pr-4"
            onChange={handleInput}
          />
        </div>
      </div>
    </div>
  )
}
