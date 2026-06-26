'use client'

import { useEffect, useRef, useState, type DragEvent } from 'react'
import { useI18n } from '@/lib/i18n'
import Icon from '@/components/icons/Icon'
import ProviderCard from '@/components/payment/ProviderCard'
import type { ProviderInstance } from '@/lib/payment/types'
import type { TypeOption } from '@/lib/payment/providerConfig'
import { getAvailableTypes } from '@/lib/payment/providerConfig'

interface PaymentProviderListProps {
  providers: ProviderInstance[]
  loading: boolean
  canCreate: boolean
  enabledPaymentTypes: string[]
  allPaymentTypes: TypeOption[]
  redirectLabel: string
  onRefresh: () => void
  onCreate: () => void
  onEdit: (provider: ProviderInstance) => void
  onDelete: (provider: ProviderInstance) => void
  onToggleField: (
    provider: ProviderInstance,
    field: 'enabled' | 'refund_enabled' | 'allow_user_refund',
  ) => void
  onToggleType: (provider: ProviderInstance, type: string) => void
  onReorder: (providers: { id: number; sort_order: number }[]) => void
}

export default function PaymentProviderList({
  providers,
  loading,
  canCreate,
  enabledPaymentTypes,
  allPaymentTypes,
  redirectLabel,
  onRefresh,
  onCreate,
  onEdit,
  onDelete,
  onToggleField,
  onToggleType,
  onReorder,
}: PaymentProviderListProps) {
  const { t } = useI18n()
  const [localProviders, setLocalProviders] = useState<ProviderInstance[]>([])
  const dragIndexRef = useRef<number | null>(null)

  useEffect(() => {
    setLocalProviders([...providers])
  }, [providers])

  const isEnabled = (providerKey: string) => enabledPaymentTypes.includes(providerKey)

  const getTypes = (providerKey: string): TypeOption[] =>
    getAvailableTypes(providerKey, allPaymentTypes, redirectLabel).map((opt) =>
      opt.label === opt.value
        ? { ...opt, label: t(`payment.methods.${opt.value}`, opt.value) }
        : opt,
    )

  const handleDragStart = (index: number) => {
    dragIndexRef.current = index
  }

  const handleDragOver = (event: DragEvent<HTMLDivElement>, index: number) => {
    event.preventDefault()
    const from = dragIndexRef.current
    if (from === null || from === index) return
    const next = [...localProviders]
    const [item] = next.splice(from, 1)
    next.splice(index, 0, item)
    dragIndexRef.current = index
    setLocalProviders(next)
  }

  const handleDragEnd = () => {
    if (dragIndexRef.current !== null) {
      onReorder(
        localProviders.map((p, idx) => ({
          id: p.id,
          sort_order: idx,
        })),
      )
    }
    dragIndexRef.current = null
  }

  return (
    <div className="card">
      <div className="border-b border-gray-100 px-4 py-3 dark:border-dark-700">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-gray-900 dark:text-white">
              {t('admin.settings.payment.providerManagement')}
            </h2>
            <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
              {t('admin.settings.payment.providerManagementDesc')}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onRefresh}
              disabled={loading}
              className="btn btn-secondary btn-sm"
              title={t('common.refresh')}
            >
              <Icon name="refresh" size="sm" className={loading ? 'animate-spin' : ''} />
            </button>
            <button
              type="button"
              onClick={onCreate}
              disabled={!canCreate}
              className={
                canCreate
                  ? 'btn btn-primary btn-sm'
                  : 'btn btn-secondary btn-sm cursor-not-allowed opacity-50'
              }
            >
              {t('admin.settings.payment.createProvider')}
            </button>
          </div>
        </div>
      </div>

      <div className="p-4">
        {loading && !providers.length ? (
          <div className="flex items-center justify-center py-6">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary-500 border-t-transparent" />
          </div>
        ) : null}

        {localProviders.length ? (
          <div className="space-y-3">
            {localProviders.map((p, index) => (
              <div
                key={p.id}
                className="flex items-start gap-2"
                onDragOver={(e) => handleDragOver(e, index)}
              >
                <div
                  draggable
                  onDragStart={() => handleDragStart(index)}
                  onDragEnd={handleDragEnd}
                  className="drag-handle mt-3 flex cursor-grab items-center text-gray-300 hover:text-gray-500 active:cursor-grabbing dark:text-dark-600 dark:hover:text-dark-400"
                >
                  <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                    <path d="M7 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM13 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM7 8a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM13 8a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM7 14a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM13 14a2 2 0 1 0 0 4 2 2 0 0 0 0-4z" />
                  </svg>
                </div>
                <div className="min-w-0 flex-1">
                  <ProviderCard
                    provider={p}
                    enabled={isEnabled(p.provider_key)}
                    availableTypes={getTypes(p.provider_key)}
                    onToggleField={(field) => onToggleField(p, field)}
                    onToggleType={(type) => onToggleType(p, type)}
                    onEdit={() => onEdit(p)}
                    onDelete={() => onDelete(p)}
                  />
                </div>
              </div>
            ))}
          </div>
        ) : !loading ? (
          <div className="py-6 text-center">
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {canCreate
                ? t('admin.settings.payment.noProviders')
                : t('admin.settings.payment.enableTypesFirst')}
            </p>
            {canCreate ? (
              <button type="button" onClick={onCreate} className="btn btn-primary btn-sm mt-2">
                {t('admin.settings.payment.createProvider')}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  )
}
