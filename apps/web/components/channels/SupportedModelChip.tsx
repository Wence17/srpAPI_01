'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useI18n } from '@/lib/i18n'
import { formatScaled } from '@/lib/pricing'
import {
  BILLING_MODE_TOKEN,
  BILLING_MODE_PER_REQUEST,
  BILLING_MODE_IMAGE,
  type BillingMode,
} from '@/lib/billingMode'
import type { UserPricingInterval, UserSupportedModel } from '@/lib/channels'
import PlatformIcon from '@/components/common/PlatformIcon'
import type { GroupPlatform } from '@/lib/types'
import { platformBadgeClass, platformBorderClass, platformBadgeLightClass } from '@/lib/platformColors'
import PricingRow from './PricingRow'

interface SupportedModelChipProps {
  model: UserSupportedModel
  /** i18n 前缀：管理端传 `admin.availableChannels.pricing`，用户端传 `availableChannels.pricing`。 */
  pricingKeyPrefix?: string
  noPricingLabel?: string
  showPlatform?: boolean
  /**
   * 当 model.platform 缺失（如 admin 聚合场景）时，用父行的平台作为兜底着色。
   * 仅用于视觉，不影响业务逻辑。
   */
  platformHint?: string
}

const PER_MILLION_SCALE = 1_000_000

export default function SupportedModelChip({
  model,
  pricingKeyPrefix = 'availableChannels.pricing',
  noPricingLabel = '',
  showPlatform = true,
  platformHint = '',
}: SupportedModelChipProps) {
  const { t } = useI18n()
  const [show, setShow] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [popoverStyle, setPopoverStyle] = useState<Record<string, string>>({ top: '0px', left: '0px' })
  const triggerRef = useRef<HTMLSpanElement | null>(null)
  const popoverRef = useRef<HTMLDivElement | null>(null)

  const effectivePlatform = model.platform || platformHint || ''

  const popoverBorderClass = effectivePlatform
    ? platformBorderClass(effectivePlatform)
    : 'border-gray-200 dark:border-dark-600'

  const popoverHeaderClass = effectivePlatform
    ? platformBadgeLightClass(effectivePlatform)
    : 'bg-gray-50 text-gray-700 dark:bg-dark-700/60 dark:text-gray-300'

  const prefixKey = useCallback((k: string) => `${pricingKeyPrefix}.${k}`, [pricingKeyPrefix])

  const billingModeLabel = useMemo(() => {
    const mode = model.pricing?.billing_mode
    switch (mode) {
      case BILLING_MODE_TOKEN:
        return t(prefixKey('billingModeToken'))
      case BILLING_MODE_PER_REQUEST:
        return t(prefixKey('billingModePerRequest'))
      case BILLING_MODE_IMAGE:
        return t(prefixKey('billingModeImage'))
      default:
        return '-'
    }
  }, [model.pricing?.billing_mode, prefixKey, t])

  const formatRange = (min: number, max: number | null): string => {
    const maxLabel = max == null ? '∞' : String(max)
    return `(${min}, ${maxLabel}]`
  }

  const formatInterval = (iv: UserPricingInterval, mode: BillingMode): string => {
    if (mode === BILLING_MODE_PER_REQUEST || mode === BILLING_MODE_IMAGE) {
      return formatScaled(iv.per_request_price, 1)
    }
    const input = formatScaled(iv.input_price, PER_MILLION_SCALE)
    const output = formatScaled(iv.output_price, PER_MILLION_SCALE)
    return `${input} / ${output}`
  }

  const updatePosition = useCallback(() => {
    const trigger = triggerRef.current
    if (!trigger) return
    const rect = trigger.getBoundingClientRect()
    const margin = 8
    const popover = popoverRef.current
    const popWidth = popover?.offsetWidth ?? 320
    const popHeight = popover?.offsetHeight ?? 240
    const vw = window.innerWidth
    const vh = window.innerHeight

    let top = rect.bottom + margin
    if (top + popHeight > vh - margin) {
      top = Math.max(margin, rect.top - popHeight - margin)
    }

    let left = rect.left + rect.width / 2 - popWidth / 2
    if (left < margin) left = margin
    if (left + popWidth > vw - margin) left = vw - margin - popWidth

    setPopoverStyle({
      top: `${Math.round(top)}px`,
      left: `${Math.round(left)}px`,
    })
  }, [])

  const onEnter = useCallback(() => {
    setShow(true)
    requestAnimationFrame(() => {
      updatePosition()
      window.addEventListener('scroll', updatePosition, true)
      window.addEventListener('resize', updatePosition)
    })
  }, [updatePosition])

  const onLeave = useCallback(() => {
    setShow(false)
    window.removeEventListener('scroll', updatePosition, true)
    window.removeEventListener('resize', updatePosition)
  }, [updatePosition])

  useEffect(() => {
    setMounted(true)
    return () => {
      window.removeEventListener('scroll', updatePosition, true)
      window.removeEventListener('resize', updatePosition)
    }
  }, [updatePosition])

  useEffect(() => {
    if (show) {
      updatePosition()
    }
  }, [show, updatePosition])

  return (
    <div className="relative inline-block">
      <span
        ref={triggerRef}
        className={`inline-flex cursor-help items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium transition-colors ${
          effectivePlatform
            ? platformBadgeClass(effectivePlatform)
            : 'border-gray-200 bg-gray-50 text-gray-700 dark:border-dark-600 dark:bg-dark-800 dark:text-gray-300'
        }`}
        onMouseEnter={onEnter}
        onMouseLeave={onLeave}
        onFocus={onEnter}
        onBlur={onLeave}
        tabIndex={0}
      >
        {effectivePlatform ? (
          <PlatformIcon platform={effectivePlatform as GroupPlatform} size="xs" />
        ) : null}
        {showPlatform && model.platform ? (
          <span className="rounded bg-gray-200/60 px-1 text-[10px] uppercase text-gray-600 dark:bg-dark-700 dark:text-gray-400">
            {model.platform}
          </span>
        ) : null}
        {model.name}
      </span>

      {mounted && show
        ? createPortal(
            <div
              ref={popoverRef}
              role="tooltip"
              className={`pointer-events-none fixed z-[99999] w-80 max-w-[min(22rem,calc(100vw-1rem))] rounded-lg border bg-white text-xs shadow-xl dark:bg-dark-800 ${popoverBorderClass}`}
              style={popoverStyle}
            >
              <div
                className={`flex items-center justify-between gap-2 rounded-t-lg border-b px-3 py-2 ${popoverHeaderClass} ${popoverBorderClass}`}
              >
                <span className="truncate font-semibold">{model.name}</span>
                {model.platform ? (
                  <span className="flex-shrink-0 rounded bg-white/70 px-1.5 py-0.5 text-[10px] uppercase tracking-wide dark:bg-dark-900/60">
                    {model.platform}
                  </span>
                ) : null}
              </div>

              <div className="p-3">
                {!model.pricing ? (
                  <div className="text-gray-500 dark:text-gray-400">{noPricingLabel}</div>
                ) : (
                  <div className="space-y-2 text-gray-700 dark:text-gray-300">
                    <div className="flex justify-between">
                      <span className="text-gray-500 dark:text-gray-400">{t(prefixKey('billingMode'))}</span>
                      <span>{billingModeLabel}</span>
                    </div>

                    {model.pricing.billing_mode === BILLING_MODE_TOKEN ? (
                      <>
                        <PricingRow
                          label={t(prefixKey('inputPrice'))}
                          value={model.pricing.input_price}
                          unit={t(prefixKey('unitPerMillion'))}
                          scale={PER_MILLION_SCALE}
                        />
                        <PricingRow
                          label={t(prefixKey('outputPrice'))}
                          value={model.pricing.output_price}
                          unit={t(prefixKey('unitPerMillion'))}
                          scale={PER_MILLION_SCALE}
                        />
                        <PricingRow
                          label={t(prefixKey('cacheWritePrice'))}
                          value={model.pricing.cache_write_price}
                          unit={t(prefixKey('unitPerMillion'))}
                          scale={PER_MILLION_SCALE}
                        />
                        <PricingRow
                          label={t(prefixKey('cacheReadPrice'))}
                          value={model.pricing.cache_read_price}
                          unit={t(prefixKey('unitPerMillion'))}
                          scale={PER_MILLION_SCALE}
                        />
                        {model.pricing.image_output_price != null && model.pricing.image_output_price > 0 ? (
                          <PricingRow
                            label={t(prefixKey('imageOutputPrice'))}
                            value={model.pricing.image_output_price}
                            unit={t(prefixKey('unitPerMillion'))}
                            scale={PER_MILLION_SCALE}
                          />
                        ) : null}
                      </>
                    ) : null}

                    {model.pricing.billing_mode === BILLING_MODE_PER_REQUEST &&
                    model.pricing.per_request_price != null ? (
                      <PricingRow
                        label={t(prefixKey('perRequestPrice'))}
                        value={model.pricing.per_request_price}
                        unit={t(prefixKey('unitPerRequest'))}
                        scale={1}
                      />
                    ) : null}

                    {model.pricing.billing_mode === BILLING_MODE_IMAGE &&
                    model.pricing.image_output_price != null ? (
                      <PricingRow
                        label={t(prefixKey('imageOutputPrice'))}
                        value={model.pricing.image_output_price}
                        unit={t(prefixKey('unitPerRequest'))}
                        scale={1}
                      />
                    ) : null}

                    {model.pricing.intervals && model.pricing.intervals.length > 0 ? (
                      <div className={`mt-2 border-t pt-2 ${popoverBorderClass}`}>
                        <div className="mb-1 font-medium text-gray-600 dark:text-gray-400">
                          {t(prefixKey('intervals'))}
                        </div>
                        <div className="space-y-1">
                          {model.pricing.intervals.map((iv, idx) => (
                            <div key={idx} className="flex justify-between text-[11px]">
                              <span className="text-gray-500 dark:text-gray-400">
                                {iv.tier_label ? iv.tier_label : formatRange(iv.min_tokens, iv.max_tokens)}
                              </span>
                              <span>{formatInterval(iv, model.pricing!.billing_mode)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>
                )}
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  )
}
