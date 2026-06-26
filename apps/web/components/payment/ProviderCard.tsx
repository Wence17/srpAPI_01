'use client'

import { useMemo } from 'react'
import { useI18n } from '@/lib/i18n'
import Icon from '@/components/icons/Icon'
import ToggleSwitch from '@/components/payment/ToggleSwitch'
import type { ProviderInstance } from '@/lib/payment/types'
import type { TypeOption } from '@/lib/payment/providerConfig'
import {
  PAYMENT_MODE_POPUP,
  PAYMENT_MODE_QRCODE,
  PAYMENT_MODE_REDIRECT,
} from '@/lib/payment/providerConfig'

const PROVIDER_KEY_LABELS: Record<string, string> = {
  easypay: 'admin.settings.payment.providerEasypay',
  alipay: 'admin.settings.payment.providerAlipay',
  wxpay: 'admin.settings.payment.providerWxpay',
  stripe: 'admin.settings.payment.providerStripe',
  airwallex: 'admin.settings.payment.providerAirwallex',
}

interface ProviderCardProps {
  provider: ProviderInstance
  enabled: boolean
  availableTypes: TypeOption[]
  onToggleField: (field: 'enabled' | 'refund_enabled' | 'allow_user_refund') => void
  onToggleType: (type: string) => void
  onEdit: () => void
  onDelete: () => void
}

export default function ProviderCard({
  provider,
  enabled,
  availableTypes,
  onToggleField,
  onToggleType,
  onEdit,
  onDelete,
}: ProviderCardProps) {
  const { t } = useI18n()

  const keyLabel = t(
    PROVIDER_KEY_LABELS[provider.provider_key] || provider.provider_key,
  )

  const modeLabel = useMemo(() => {
    if (provider.payment_mode === PAYMENT_MODE_QRCODE) return t('admin.settings.payment.modeQRCode')
    if (provider.payment_mode === PAYMENT_MODE_POPUP) return t('admin.settings.payment.modePopup')
    if (provider.payment_mode === PAYMENT_MODE_REDIRECT) return t('admin.settings.payment.modeRedirect')
    return ''
  }, [provider.payment_mode, t])

  const isSelected = (type: string) => provider.supported_types.includes(type)

  return (
    <div
      className={[
        'group relative rounded-lg border transition-all',
        enabled
          ? 'border-gray-200 dark:border-dark-600'
          : 'border-gray-200 bg-gray-50 opacity-50 dark:border-dark-700 dark:bg-dark-800/50',
      ].join(' ')}
      title={
        !enabled
          ? `${t('admin.settings.payment.typeDisabled')} — ${t('admin.settings.payment.enableTypesFirst')}`
          : undefined
      }
    >
      <div
        className={[
          'flex items-center justify-between px-4 py-2.5',
          !enabled ? 'pointer-events-none' : '',
        ].join(' ')}
      >
        <div className="flex items-center gap-3">
          <div
            className={[
              'rounded-md p-1.5',
              provider.enabled && enabled
                ? 'bg-green-100 dark:bg-green-900/30'
                : 'bg-gray-100 dark:bg-dark-700',
            ].join(' ')}
          >
            <Icon
              name="server"
              size="sm"
              className={
                provider.enabled && enabled
                  ? 'text-green-600 dark:text-green-400'
                  : 'text-gray-400'
              }
            />
          </div>
          <span className="text-sm font-medium text-gray-900 dark:text-white">{provider.name}</span>
          <span className="text-xs text-gray-400 dark:text-gray-500">{keyLabel}</span>
          {provider.payment_mode ? (
            <span className="text-xs text-gray-400 dark:text-gray-500">· {modeLabel}</span>
          ) : null}
          {enabled && availableTypes.length ? (
            <span className="text-xs text-gray-300 dark:text-gray-600">|</span>
          ) : null}
          {enabled ? (
            <div className="flex items-center gap-1">
              {availableTypes.map((pt) => (
                <button
                  key={pt.value}
                  type="button"
                  onClick={() => onToggleType(pt.value)}
                  className={[
                    'rounded px-2 py-0.5 text-xs font-medium transition-all',
                    isSelected(pt.value)
                      ? 'bg-primary-500 text-white'
                      : 'bg-gray-100 text-gray-400 dark:bg-dark-700 dark:text-gray-500',
                  ].join(' ')}
                >
                  {pt.label}
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <div className="flex items-center gap-4">
          <ToggleSwitch
            label={t('common.enabled')}
            checked={provider.enabled}
            onToggle={() => onToggleField('enabled')}
          />
          <ToggleSwitch
            label={t('admin.settings.payment.refundEnabled')}
            checked={provider.refund_enabled}
            onToggle={() => onToggleField('refund_enabled')}
          />
          {provider.refund_enabled ? (
            <ToggleSwitch
              label={t('admin.settings.payment.allowUserRefund')}
              checked={provider.allow_user_refund}
              onToggle={() => onToggleField('allow_user_refund')}
            />
          ) : null}
          <div className="flex items-center gap-2 border-l border-gray-200 pl-3 dark:border-dark-600">
            <button
              type="button"
              onClick={onEdit}
              className="flex flex-col items-center gap-0.5 rounded-lg p-1.5 text-gray-500 transition-colors hover:bg-blue-50 hover:text-blue-600 dark:hover:bg-blue-900/20 dark:hover:text-blue-400"
            >
              <Icon name="edit" size="sm" />
              <span className="text-xs">{t('common.edit')}</span>
            </button>
            <button
              type="button"
              onClick={onDelete}
              className="flex flex-col items-center gap-0.5 rounded-lg p-1.5 text-gray-500 transition-colors hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20 dark:hover:text-red-400"
            >
              <Icon name="trash" size="sm" />
              <span className="text-xs">{t('common.delete')}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
