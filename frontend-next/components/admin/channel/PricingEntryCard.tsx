'use client'

import { useMemo, useState } from 'react'
import { useI18n } from '@/lib/i18n'
import Select from '@/components/common/Select'
import Icon from '@/components/icons/Icon'
import IntervalRow from './IntervalRow'
import ModelTagInput from './ModelTagInput'
import {
  getPlatformTagClass,
  perTokenToMTok,
  type IntervalFormEntry,
  type PricingFormEntry,
} from './types'
import type { BillingMode } from '@/lib/billingMode'
import { adminChannelsAPI } from '@/lib/adminChannels'

interface PricingEntryCardProps {
  entry: PricingFormEntry
  platform?: string
  onUpdate: (entry: PricingFormEntry) => void
  onRemove: () => void
}

export default function PricingEntryCard({
  entry,
  platform,
  onUpdate,
  onRemove,
}: PricingEntryCardProps) {
  const { t } = useI18n()
  const [collapsed, setCollapsed] = useState(entry.models.length > 0)

  const billingModeOptions = useMemo(
    () => [
      { value: 'token', label: 'Token' },
      { value: 'per_request', label: t('admin.channels.billingMode.perRequest', '按次') },
      { value: 'image', label: t('admin.channels.billingMode.image', '图片（按次）') },
    ],
    [t],
  )

  const billingModeLabel = useMemo(() => {
    const opt = billingModeOptions.find((o) => o.value === entry.billing_mode)
    return opt ? opt.label : entry.billing_mode
  }, [billingModeOptions, entry.billing_mode])

  const emitField = (field: keyof PricingFormEntry, value: string) => {
    onUpdate({ ...entry, [field]: value === '' ? null : value })
  }

  const addInterval = () => {
    const intervals = [...(entry.intervals || [])]
    intervals.push({
      min_tokens: 0,
      max_tokens: null,
      tier_label: '',
      input_price: null,
      output_price: null,
      cache_write_price: null,
      cache_read_price: null,
      per_request_price: null,
      sort_order: intervals.length,
    })
    onUpdate({ ...entry, intervals })
  }

  const addImageTier = () => {
    const intervals = [...(entry.intervals || [])]
    const labels = ['1K', '2K', '4K', 'HD']
    intervals.push({
      min_tokens: 0,
      max_tokens: null,
      tier_label: labels[intervals.length] || '',
      input_price: null,
      output_price: null,
      cache_write_price: null,
      cache_read_price: null,
      per_request_price: null,
      sort_order: intervals.length,
    })
    onUpdate({ ...entry, intervals })
  }

  const updateInterval = (idx: number, updated: IntervalFormEntry) => {
    const intervals = [...(entry.intervals || [])]
    intervals[idx] = updated
    onUpdate({ ...entry, intervals })
  }

  const removeInterval = (idx: number) => {
    const intervals = [...(entry.intervals || [])]
    intervals.splice(idx, 1)
    onUpdate({ ...entry, intervals })
  }

  const onModelsUpdate = async (newModels: string[]) => {
    const oldModels = entry.models
    onUpdate({ ...entry, models: newModels })

    const addedModels = newModels.filter((m) => !oldModels.includes(m))
    if (addedModels.length === 0) return

    const hasPrice =
      entry.input_price != null ||
      entry.output_price != null ||
      entry.cache_write_price != null ||
      entry.cache_read_price != null
    if (hasPrice) return

    try {
      const result = await adminChannelsAPI.getModelDefaultPricing(addedModels[0])
      if (result.found) {
        onUpdate({
          ...entry,
          models: newModels,
          input_price: perTokenToMTok(result.input_price ?? null),
          output_price: perTokenToMTok(result.output_price ?? null),
          cache_write_price: perTokenToMTok(result.cache_write_price ?? null),
          cache_read_price: perTokenToMTok(result.cache_read_price ?? null),
          image_output_price: perTokenToMTok(result.image_output_price ?? null),
        })
      }
    } catch {
      // ignore lookup failures
    }
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-dark-600 dark:bg-dark-800">
      <div
        className="flex cursor-pointer select-none items-center gap-2"
        onClick={() => setCollapsed((value) => !value)}
      >
        <Icon
          name={collapsed ? 'chevronRight' : 'chevronDown'}
          size="sm"
          strokeWidth={2}
          className="flex-shrink-0 text-gray-400 transition-transform duration-200"
        />

        {collapsed ? (
          <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
              {entry.models.slice(0, 3).map((m, i) => (
                <span
                  key={`${m}-${i}`}
                  className={`inline-flex shrink-0 rounded px-1.5 py-0.5 text-xs ${getPlatformTagClass(platform || '')}`}
                >
                  {m}
                </span>
              ))}
              {entry.models.length > 3 ? (
                <span className="whitespace-nowrap text-xs text-gray-400">
                  +{entry.models.length - 3}
                </span>
              ) : null}
              {entry.models.length === 0 ? (
                <span className="text-xs italic text-gray-400">
                  {t('admin.channels.form.noModels', '未添加模型')}
                </span>
              ) : null}
            </div>
            <span className="flex-shrink-0 rounded-full bg-primary-100 px-2 py-0.5 text-xs font-medium text-primary-700 dark:bg-primary-900/30 dark:text-primary-300">
              {billingModeLabel}
            </span>
          </div>
        ) : (
          <div className="flex-1 text-xs font-medium text-gray-500 dark:text-gray-400">
            {t('admin.channels.form.pricingEntry', '定价配置')}
          </div>
        )}

        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation()
            onRemove()
          }}
          className="flex-shrink-0 rounded p-1 text-gray-400 hover:text-red-500"
        >
          <Icon name="trash" size="sm" />
        </button>
      </div>

      <div className={`collapsible-content${collapsed ? ' collapsible-content--collapsed' : ''}`}>
        <div className="collapsible-inner">
          <div className="mt-3 flex items-start gap-2">
            <div className="flex-1">
              <label className="text-xs font-medium text-gray-500 dark:text-gray-400">
                {t('admin.channels.form.models', '模型列表')}{' '}
                <span className="text-red-500">*</span>
              </label>
              <div className="mt-1">
                <ModelTagInput
                  models={entry.models}
                  platform={platform}
                  placeholder={t(
                    'admin.channels.form.modelsPlaceholder',
                    '输入模型名后按回车添加，支持通配符 *',
                  )}
                  onUpdateModels={onModelsUpdate}
                />
              </div>
            </div>
            <div className="w-40">
              <label className="text-xs font-medium text-gray-500 dark:text-gray-400">
                {t('admin.channels.form.billingMode', '计费模式')}
              </label>
              <Select
                modelValue={entry.billing_mode}
                options={billingModeOptions}
                className="mt-1"
                onUpdateModelValue={(value) =>
                  onUpdate({
                    ...entry,
                    billing_mode: value as BillingMode,
                    intervals: [],
                  })
                }
              />
            </div>
          </div>

          {entry.billing_mode === 'token' ? (
            <div>
              <label className="mt-3 block text-xs font-medium text-gray-500 dark:text-gray-400">
                {t('admin.channels.form.defaultPrices', '默认价格（未命中区间时使用）')}
                <span className="ml-1 font-normal text-gray-400">$/MTok</span>
              </label>
              <div className="mt-1 grid grid-cols-2 gap-2 sm:grid-cols-5">
                {(
                  [
                    ['input_price', 'inputPrice', '输入'],
                    ['output_price', 'outputPrice', '输出'],
                    ['cache_write_price', 'cacheWritePrice', '缓存写入'],
                    ['cache_read_price', 'cacheReadPrice', '缓存读取'],
                    ['image_output_price', 'imageTokenPrice', '图片输出'],
                  ] as const
                ).map(([field, i18nKey, fallback]) => (
                  <div key={field}>
                    <label className="text-xs text-gray-400">
                      {t(`admin.channels.form.${i18nKey}`, fallback)}
                    </label>
                    <input
                      value={entry[field] ?? ''}
                      type="number"
                      step="any"
                      min={0}
                      className="input mt-0.5 text-sm"
                      placeholder={t('admin.channels.form.pricePlaceholder', '默认')}
                      onChange={(event) => emitField(field, event.target.value)}
                    />
                  </div>
                ))}
              </div>

              <div className="mt-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium text-gray-500 dark:text-gray-400">
                    {t('admin.channels.form.intervals', '上下文区间定价（可选）')}
                    <span className="ml-1 font-normal text-gray-400">(min, max]</span>
                  </label>
                  <button
                    type="button"
                    onClick={addInterval}
                    className="text-xs text-primary-600 hover:text-primary-700"
                  >
                    + {t('admin.channels.form.addInterval', '添加区间')}
                  </button>
                </div>
                {entry.intervals && entry.intervals.length > 0 ? (
                  <div className="mt-2 space-y-2">
                    {entry.intervals.map((iv, idx) => (
                      <IntervalRow
                        key={idx}
                        interval={iv}
                        mode={entry.billing_mode}
                        onUpdate={(updated) => updateInterval(idx, updated)}
                        onRemove={() => removeInterval(idx)}
                      />
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          ) : entry.billing_mode === 'per_request' ? (
            <div>
              <label className="mt-3 block text-xs font-medium text-gray-500 dark:text-gray-400">
                {t('admin.channels.form.defaultPerRequestPrice', '默认单次价格（未命中层级时使用）')}
                <span className="ml-1 font-normal text-gray-400">$</span>
              </label>
              <div className="mt-1 w-48">
                <input
                  value={entry.per_request_price ?? ''}
                  type="number"
                  step="any"
                  min={0}
                  className="input text-sm"
                  placeholder={t('admin.channels.form.pricePlaceholder', '默认')}
                  onChange={(event) => emitField('per_request_price', event.target.value)}
                />
              </div>

              <div className="mt-3 flex items-center justify-between">
                <label className="text-xs font-medium text-gray-500 dark:text-gray-400">
                  {t('admin.channels.form.requestTiers', '按次计费层级')}
                </label>
                <button
                  type="button"
                  onClick={addInterval}
                  className="text-xs text-primary-600 hover:text-primary-700"
                >
                  + {t('admin.channels.form.addTier', '添加层级')}
                </button>
              </div>
              {entry.intervals && entry.intervals.length > 0 ? (
                <div className="mt-2 space-y-2">
                  {entry.intervals.map((iv, idx) => (
                    <IntervalRow
                      key={idx}
                      interval={iv}
                      mode={entry.billing_mode}
                      onUpdate={(updated) => updateInterval(idx, updated)}
                      onRemove={() => removeInterval(idx)}
                    />
                  ))}
                </div>
              ) : (
                <div className="mt-2 rounded border border-dashed border-gray-300 p-3 text-center text-xs text-gray-400 dark:border-dark-500">
                  {t('admin.channels.form.noTiersYet', '暂无层级，点击添加配置按次计费价格')}
                </div>
              )}
            </div>
          ) : (
            <div>
              <label className="mt-3 block text-xs font-medium text-gray-500 dark:text-gray-400">
                {t('admin.channels.form.defaultImagePrice', '默认图片价格（未命中层级时使用）')}
                <span className="ml-1 font-normal text-gray-400">$</span>
              </label>
              <div className="mt-1 w-48">
                <input
                  value={entry.per_request_price ?? ''}
                  type="number"
                  step="any"
                  min={0}
                  className="input text-sm"
                  placeholder={t('admin.channels.form.pricePlaceholder', '默认')}
                  onChange={(event) => emitField('per_request_price', event.target.value)}
                />
              </div>

              <div className="mt-3 flex items-center justify-between">
                <label className="text-xs font-medium text-gray-500 dark:text-gray-400">
                  {t('admin.channels.form.imageTiers', '图片计费层级（按次）')}
                </label>
                <button
                  type="button"
                  onClick={addImageTier}
                  className="text-xs text-primary-600 hover:text-primary-700"
                >
                  + {t('admin.channels.form.addTier', '添加层级')}
                </button>
              </div>
              {entry.intervals && entry.intervals.length > 0 ? (
                <div className="mt-2 space-y-2">
                  {entry.intervals.map((iv, idx) => (
                    <IntervalRow
                      key={idx}
                      interval={iv}
                      mode={entry.billing_mode}
                      onUpdate={(updated) => updateInterval(idx, updated)}
                      onRemove={() => removeInterval(idx)}
                    />
                  ))}
                </div>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
