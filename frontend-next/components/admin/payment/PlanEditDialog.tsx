'use client'

import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useI18n } from '@/lib/i18n'
import { useApp } from '@/context/AppContext'
import { extractApiErrorMessage } from '@/lib/apiError'
import { adminPaymentAPI, type SubscriptionPlan } from '@/lib/adminPayment'
import { platformTextClass } from '@/lib/platformColors'
import type { AdminGroup } from '@/lib/types'
import BaseDialog from '@/components/common/BaseDialog'
import Select from '@/components/common/Select'
import Icon from '@/components/icons/Icon'
import GroupBadge from '@/components/keys/GroupBadge'

interface PlanEditDialogProps {
  show: boolean
  plan: SubscriptionPlan | null
  groups: AdminGroup[]
  onClose: () => void
  onSaved: () => void
}

interface PlanFormState {
  name: string
  group_id: number | null
  description: string
  price: number
  original_price: number
  validity_days: number
  validity_unit: string
  sort_order: number
  for_sale: boolean
}

const defaultForm: PlanFormState = {
  name: '',
  group_id: null,
  description: '',
  price: 0,
  original_price: 0,
  validity_days: 30,
  validity_unit: 'days',
  sort_order: 0,
  for_sale: true,
}

export default function PlanEditDialog({ show, plan, groups, onClose, onSaved }: PlanEditDialogProps) {
  const { t } = useI18n()
  const appStore = useApp()
  const [saving, setSaving] = useState(false)
  const [planForm, setPlanForm] = useState<PlanFormState>(defaultForm)
  const [planFeaturesText, setPlanFeaturesText] = useState('')

  const validityUnitOptions = useMemo(
    () => [
      { value: 'days', label: t('payment.admin.days') },
      { value: 'weeks', label: t('payment.admin.weeks') },
      { value: 'months', label: t('payment.admin.months') },
    ],
    [t],
  )

  const groupOptions = useMemo(
    () =>
      groups
        .filter((group) => group.subscription_type === 'subscription')
        .map((group) => ({
          value: group.id,
          label: `${group.name} — ${group.platform} (${group.rate_multiplier}x)`,
          platform: group.platform,
        })),
    [groups],
  )

  const selectedGroupInfo = useMemo(() => {
    if (!planForm.group_id) return null
    return groups.find((group) => group.id === planForm.group_id) || null
  }, [groups, planForm.group_id])

  useEffect(() => {
    if (!show) return
    if (plan) {
      setPlanForm({
        name: plan.name,
        group_id: plan.group_id,
        description: plan.description,
        price: plan.price,
        original_price: plan.original_price || 0,
        validity_days: plan.validity_days,
        validity_unit: plan.validity_unit || 'days',
        sort_order: plan.sort_order || 0,
        for_sale: plan.for_sale,
      })
      setPlanFeaturesText((plan.features || []).join('\n'))
    } else {
      setPlanForm(defaultForm)
      setPlanFeaturesText('')
    }
  }, [show, plan])

  function buildPlanPayload() {
    const features = planFeaturesText
      .split('\n')
      .map((feature) => feature.trim())
      .filter(Boolean)
      .join('\n')
    return {
      name: planForm.name,
      group_id: planForm.group_id,
      description: planForm.description,
      price: planForm.price,
      original_price: planForm.original_price || 0,
      validity_days: planForm.validity_days,
      validity_unit: planForm.validity_unit,
      sort_order: planForm.sort_order,
      for_sale: planForm.for_sale,
      features,
    }
  }

  async function handleSavePlan(event: FormEvent) {
    event.preventDefault()
    if (!planForm.group_id) {
      appStore.showError(t('payment.admin.groupRequired'))
      return
    }
    if (!planForm.price || planForm.price <= 0) {
      appStore.showError(t('payment.admin.priceRequired'))
      return
    }
    if (!planForm.validity_days || planForm.validity_days < 1) {
      appStore.showError(t('payment.admin.validityDaysRequired'))
      return
    }

    setSaving(true)
    try {
      const data = buildPlanPayload()
      if (plan) {
        await adminPaymentAPI.updatePlan(plan.id, data)
      } else {
        await adminPaymentAPI.createPlan(data)
      }
      appStore.showSuccess(t('common.saved'))
      onClose()
      onSaved()
    } catch (err: unknown) {
      appStore.showError(extractApiErrorMessage(err, t('common.error')))
    } finally {
      setSaving(false)
    }
  }

  return (
    <BaseDialog
      show={show}
      title={plan ? t('payment.admin.editPlan') : t('payment.admin.createPlan')}
      width="wide"
      onClose={onClose}
    >
      <form id="plan-form" onSubmit={handleSavePlan} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="input-label">
              {t('payment.admin.planName')} <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={planForm.name}
              onChange={(event) => setPlanForm((prev) => ({ ...prev, name: event.target.value }))}
              className="input"
              required
            />
          </div>
          <div>
            <label className="input-label">
              {t('payment.admin.group')} <span className="text-red-500">*</span>
            </label>
            <Select
              modelValue={planForm.group_id}
              options={groupOptions}
              placeholder={t('payment.admin.selectGroup')}
              className="w-full"
              onUpdateModelValue={(value) =>
                setPlanForm((prev) => ({ ...prev, group_id: value as number | null }))
              }
              renderSelected={(option) =>
                option?.platform ? (
                  <span className={platformTextClass(String(option.platform))}>{option.label}</span>
                ) : (
                  <span>{option?.label || t('payment.admin.selectGroup')}</span>
                )
              }
              renderOption={(option, selected) => (
                <>
                  <span
                    className={`flex-1 truncate text-left ${
                      option.platform ? platformTextClass(String(option.platform)) : ''
                    }`}
                  >
                    {option.label}
                  </span>
                  {selected ? (
                    <Icon name="check" size="sm" className="text-primary-500" strokeWidth={2} />
                  ) : null}
                </>
              )}
            />
          </div>
        </div>

        {selectedGroupInfo ? (
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-dark-600 dark:bg-dark-800">
            <div className="mb-2 flex items-center gap-2">
              <GroupBadge
                name={selectedGroupInfo.name}
                platform={selectedGroupInfo.platform}
                rateMultiplier={selectedGroupInfo.rate_multiplier}
              />
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <span className="text-gray-500">{t('payment.admin.dailyLimit')}:</span>
                <span className="ml-1 font-medium text-gray-700 dark:text-gray-300">
                  {selectedGroupInfo.daily_limit_usd != null
                    ? '$' + selectedGroupInfo.daily_limit_usd
                    : t('payment.admin.unlimited')}
                </span>
              </div>
              <div>
                <span className="text-gray-500">{t('payment.admin.weeklyLimit')}:</span>
                <span className="ml-1 font-medium text-gray-700 dark:text-gray-300">
                  {selectedGroupInfo.weekly_limit_usd != null
                    ? '$' + selectedGroupInfo.weekly_limit_usd
                    : t('payment.admin.unlimited')}
                </span>
              </div>
              <div>
                <span className="text-gray-500">{t('payment.admin.monthlyLimit')}:</span>
                <span className="ml-1 font-medium text-gray-700 dark:text-gray-300">
                  {selectedGroupInfo.monthly_limit_usd != null
                    ? '$' + selectedGroupInfo.monthly_limit_usd
                    : t('payment.admin.unlimited')}
                </span>
              </div>
            </div>
          </div>
        ) : null}

        <div>
          <label className="input-label">
            {t('payment.admin.planDescription')} <span className="text-red-500">*</span>
          </label>
          <textarea
            rows={2}
            value={planForm.description}
            onChange={(event) => setPlanForm((prev) => ({ ...prev, description: event.target.value }))}
            className="input"
            required
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="input-label">
              {t('payment.admin.price')} <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              step="0.01"
              min="0.01"
              value={planForm.price}
              onChange={(event) =>
                setPlanForm((prev) => ({ ...prev, price: Number(event.target.value) }))
              }
              className="input"
              required
            />
          </div>
          <div>
            <label className="input-label">{t('payment.admin.originalPrice')}</label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={planForm.original_price}
              onChange={(event) =>
                setPlanForm((prev) => ({ ...prev, original_price: Number(event.target.value) }))
              }
              className="input"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="input-label">
              {t('payment.admin.validityDays')} <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              min="1"
              value={planForm.validity_days}
              onChange={(event) =>
                setPlanForm((prev) => ({ ...prev, validity_days: Number(event.target.value) }))
              }
              className="input"
              required
            />
          </div>
          <div>
            <label className="input-label">
              {t('payment.admin.validityUnit')} <span className="text-red-500">*</span>
            </label>
            <Select
              modelValue={planForm.validity_unit}
              options={validityUnitOptions}
              onUpdateModelValue={(value) =>
                setPlanForm((prev) => ({ ...prev, validity_unit: String(value ?? 'days') }))
              }
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="input-label">{t('payment.admin.sortOrder')}</label>
            <input
              type="number"
              min="0"
              value={planForm.sort_order}
              onChange={(event) =>
                setPlanForm((prev) => ({ ...prev, sort_order: Number(event.target.value) }))
              }
              className="input"
            />
          </div>
        </div>

        <div>
          <label className="input-label">{t('payment.admin.features')}</label>
          <textarea
            rows={3}
            value={planFeaturesText}
            onChange={(event) => setPlanFeaturesText(event.target.value)}
            className="input"
            placeholder={t('payment.admin.featuresPlaceholder')}
          />
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{t('payment.admin.featuresHint')}</p>
        </div>

        <div className="flex items-center gap-3">
          <label className="text-sm text-gray-700 dark:text-gray-300">{t('payment.admin.forSale')}</label>
          <button
            type="button"
            className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 ${
              planForm.for_sale ? 'bg-primary-500' : 'bg-gray-300 dark:bg-dark-600'
            }`}
            onClick={() => setPlanForm((prev) => ({ ...prev, for_sale: !prev.for_sale }))}
          >
            <span
              className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                planForm.for_sale ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>
      </form>

      <div className="mt-6 flex justify-end gap-3">
        <button type="button" onClick={onClose} className="btn btn-secondary">
          {t('common.cancel')}
        </button>
        <button type="submit" form="plan-form" disabled={saving} className="btn btn-primary">
          {saving ? t('common.saving') : t('common.save')}
        </button>
      </div>
    </BaseDialog>
  )
}
