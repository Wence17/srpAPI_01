'use client'

import { useMemo } from 'react'
import { useI18n } from '@/lib/i18n'
import Icon from '@/components/icons/Icon'
import type { BillingMode } from '@/lib/billingMode'
import type { IntervalFormEntry } from './types'

interface IntervalRowProps {
  interval: IntervalFormEntry
  mode: BillingMode
  onUpdate: (interval: IntervalFormEntry) => void
  onRemove: () => void
}

function toInt(val: string): number {
  const n = parseInt(val, 10)
  return Number.isNaN(n) ? 0 : n
}

function toIntOrNull(val: string): number | null {
  if (val === '') return null
  const n = parseInt(val, 10)
  return Number.isNaN(n) ? null : n
}

export default function IntervalRow({ interval, mode, onUpdate, onRemove }: IntervalRowProps) {
  const { t } = useI18n()

  const isEmpty = useMemo(() => {
    const iv = interval
    return (
      (iv.input_price == null || iv.input_price === '') &&
      (iv.output_price == null || iv.output_price === '') &&
      (iv.cache_write_price == null || iv.cache_write_price === '') &&
      (iv.cache_read_price == null || iv.cache_read_price === '') &&
      (iv.per_request_price == null || iv.per_request_price === '')
    )
  }, [interval])

  const emitField = (field: keyof IntervalFormEntry, value: string | number | null) => {
    onUpdate({ ...interval, [field]: value === '' ? null : value })
  }

  return (
    <div
      className={`flex items-start gap-2 rounded border p-2 ${
        isEmpty
          ? 'border-red-400 bg-red-50 dark:border-red-500 dark:bg-red-950/20'
          : 'border-gray-200 bg-white dark:border-dark-500 dark:bg-dark-700'
      }`}
    >
      {mode === 'token' ? (
        <>
          <div className="w-20">
            <label className="text-xs text-gray-400">Min</label>
            <input
              value={interval.min_tokens}
              type="number"
              min={0}
              className="input mt-0.5 text-xs"
              onChange={(event) => emitField('min_tokens', toInt(event.target.value))}
            />
          </div>
          <div className="w-20">
            <label className="text-xs text-gray-400">
              Max <span className="text-gray-300">(含)</span>
            </label>
            <input
              value={interval.max_tokens ?? ''}
              type="number"
              min={0}
              className="input mt-0.5 text-xs"
              placeholder="∞"
              onChange={(event) => emitField('max_tokens', toIntOrNull(event.target.value))}
            />
          </div>
          <div className="flex-1">
            <label className="text-xs text-gray-400">
              {t('admin.channels.form.inputPrice', '输入')}{' '}
              {isEmpty ? <span className="text-red-500">*</span> : null}{' '}
              <span className="text-gray-300">$/M</span>
            </label>
            <input
              value={interval.input_price ?? ''}
              type="number"
              step="any"
              min={0}
              className="input mt-0.5 text-xs"
              onChange={(event) => emitField('input_price', event.target.value)}
            />
          </div>
          <div className="flex-1">
            <label className="text-xs text-gray-400">
              {t('admin.channels.form.outputPrice', '输出')}{' '}
              {isEmpty ? <span className="text-red-500">*</span> : null}{' '}
              <span className="text-gray-300">$/M</span>
            </label>
            <input
              value={interval.output_price ?? ''}
              type="number"
              step="any"
              min={0}
              className="input mt-0.5 text-xs"
              onChange={(event) => emitField('output_price', event.target.value)}
            />
          </div>
          <div className="flex-1">
            <label className="text-xs text-gray-400">
              {t('admin.channels.form.cacheWritePrice', '缓存W')}{' '}
              <span className="text-gray-300">$/M</span>
            </label>
            <input
              value={interval.cache_write_price ?? ''}
              type="number"
              step="any"
              min={0}
              className="input mt-0.5 text-xs"
              onChange={(event) => emitField('cache_write_price', event.target.value)}
            />
          </div>
          <div className="flex-1">
            <label className="text-xs text-gray-400">
              {t('admin.channels.form.cacheReadPrice', '缓存R')}{' '}
              <span className="text-gray-300">$/M</span>
            </label>
            <input
              value={interval.cache_read_price ?? ''}
              type="number"
              step="any"
              min={0}
              className="input mt-0.5 text-xs"
              onChange={(event) => emitField('cache_read_price', event.target.value)}
            />
          </div>
        </>
      ) : (
        <>
          <div className="w-24">
            <label className="text-xs text-gray-400">
              {mode === 'image'
                ? t('admin.channels.form.resolution', '分辨率')
                : t('admin.channels.form.tierLabel', '层级')}
            </label>
            <input
              value={interval.tier_label}
              type="text"
              className="input mt-0.5 text-xs"
              placeholder={mode === 'image' ? '1K / 2K / 4K' : ''}
              onChange={(event) => emitField('tier_label', event.target.value)}
            />
          </div>
          <div className="w-20">
            <label className="text-xs text-gray-400">Min</label>
            <input
              value={interval.min_tokens}
              type="number"
              min={0}
              className="input mt-0.5 text-xs"
              onChange={(event) => emitField('min_tokens', toInt(event.target.value))}
            />
          </div>
          <div className="w-20">
            <label className="text-xs text-gray-400">
              Max <span className="text-gray-300">(含)</span>
            </label>
            <input
              value={interval.max_tokens ?? ''}
              type="number"
              min={0}
              className="input mt-0.5 text-xs"
              placeholder="∞"
              onChange={(event) => emitField('max_tokens', toIntOrNull(event.target.value))}
            />
          </div>
          <div className="flex-1">
            <label className="text-xs text-gray-400">
              {t('admin.channels.form.perRequestPrice', '单次价格')}{' '}
              {isEmpty ? <span className="text-red-500">*</span> : null}{' '}
              <span className="text-gray-300">$</span>
            </label>
            <input
              value={interval.per_request_price ?? ''}
              type="number"
              step="any"
              min={0}
              className="input mt-0.5 text-xs"
              onChange={(event) => emitField('per_request_price', event.target.value)}
            />
          </div>
        </>
      )}

      <button
        type="button"
        onClick={onRemove}
        className="mt-4 rounded p-0.5 text-gray-400 hover:text-red-500"
      >
        <Icon name="x" size="sm" />
      </button>
    </div>
  )
}
