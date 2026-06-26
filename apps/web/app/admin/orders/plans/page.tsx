'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useI18n } from '@/lib/i18n'
import { useApp } from '@/context/AppContext'
import { extractI18nErrorMessage } from '@/lib/apiError'
import { adminPaymentAPI, type SubscriptionPlan } from '@/lib/adminPayment'
import { adminGroupsAPI } from '@/lib/adminGroups'
import { platformTextClass } from '@/lib/platformColors'
import type { AdminGroup } from '@/lib/types'
import type { Column } from '@/components/common/types'
import AppLayout from '@/components/layout/AppLayout'
import DataTable from '@/components/common/DataTable'
import ConfirmDialog from '@/components/common/ConfirmDialog'
import Icon from '@/components/icons/Icon'
import GroupBadge from '@/components/keys/GroupBadge'
import PlanEditDialog from '@/components/admin/payment/PlanEditDialog'

function parsePlanFeatures(
  plan: Omit<SubscriptionPlan, 'features'> & { features: string | string[] },
): SubscriptionPlan {
  return {
    ...plan,
    features:
      typeof plan.features === 'string'
        ? plan.features
            .split('\n')
            .map((feature) => feature.trim())
            .filter(Boolean)
        : plan.features || [],
  }
}

export default function AdminPaymentPlansPage() {
  const { t } = useI18n()
  const appStore = useApp()

  const [groups, setGroups] = useState<AdminGroup[]>([])
  const [plansLoading, setPlansLoading] = useState(false)
  const [plans, setPlans] = useState<SubscriptionPlan[]>([])
  const [showPlanDialog, setShowPlanDialog] = useState(false)
  const [showDeletePlanDialog, setShowDeletePlanDialog] = useState(false)
  const [editingPlan, setEditingPlan] = useState<SubscriptionPlan | null>(null)
  const [deletingPlanId, setDeletingPlanId] = useState<number | null>(null)

  const loadGroups = useCallback(async () => {
    try {
      const data = await adminGroupsAPI.getAll()
      setGroups(data)
    } catch {
      /* ignore */
    }
  }, [])

  const loadPlans = useCallback(async () => {
    setPlansLoading(true)
    try {
      const data = await adminPaymentAPI.getPlans()
      setPlans(
        (data || []).map((plan) =>
          parsePlanFeatures(plan as Omit<SubscriptionPlan, 'features'> & { features: string | string[] }),
        ),
      )
    } catch (err: unknown) {
      appStore.showError(extractI18nErrorMessage(err, t, 'payment.errors', t('common.error')))
    } finally {
      setPlansLoading(false)
    }
  }, [appStore, t])

  useEffect(() => {
    loadGroups()
    loadPlans()
  }, [loadGroups, loadPlans])

  function getGroup(id: number): AdminGroup | undefined {
    return groups.find((group) => group.id === id)
  }

  function isGroupMissing(id: number): boolean {
    return id > 0 && !groups.find((group) => group.id === id)
  }

  function getPlanNameClass(groupId: number): string {
    const group = getGroup(groupId)
    return group ? platformTextClass(group.platform) : 'text-gray-900 dark:text-white'
  }

  const planColumns = useMemo<Column[]>(
    () => [
      { key: 'id', label: 'ID' },
      { key: 'name', label: t('payment.admin.planName') },
      { key: 'group_id', label: t('payment.admin.group') },
      { key: 'price', label: t('payment.admin.price') },
      { key: 'validity_days', label: t('payment.admin.validityDays') },
      { key: 'for_sale', label: t('payment.admin.forSale') },
      { key: 'sort_order', label: t('payment.admin.sortOrder') },
      { key: 'actions', label: t('common.actions') },
    ],
    [t],
  )

  function openPlanEdit(plan: SubscriptionPlan | null) {
    setEditingPlan(plan)
    setShowPlanDialog(true)
  }

  async function toggleForSale(plan: SubscriptionPlan) {
    try {
      await adminPaymentAPI.updatePlan(plan.id, { for_sale: !plan.for_sale })
      setPlans((current) =>
        current.map((currentPlan) =>
          currentPlan.id === plan.id ? { ...currentPlan, for_sale: !plan.for_sale } : currentPlan,
        ),
      )
    } catch (err: unknown) {
      appStore.showError(extractI18nErrorMessage(err, t, 'payment.errors', t('common.error')))
    }
  }

  function confirmDeletePlan(plan: SubscriptionPlan) {
    setDeletingPlanId(plan.id)
    setShowDeletePlanDialog(true)
  }

  async function handleDeletePlan() {
    if (!deletingPlanId) return
    try {
      await adminPaymentAPI.deletePlan(deletingPlanId)
      appStore.showSuccess(t('common.deleted'))
      setShowDeletePlanDialog(false)
      setDeletingPlanId(null)
      loadPlans()
    } catch (err: unknown) {
      appStore.showError(extractI18nErrorMessage(err, t, 'payment.errors', t('common.error')))
    }
  }

  return (
    <AppLayout>
      <div className="space-y-4">
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => loadPlans()}
            disabled={plansLoading}
            className="btn btn-secondary"
            title={t('common.refresh')}
          >
            <Icon name="refresh" size="md" className={plansLoading ? 'animate-spin' : ''} />
          </button>
          <button type="button" onClick={() => openPlanEdit(null)} className="btn btn-primary">
            {t('payment.admin.createPlan')}
          </button>
        </div>

        <DataTable
          columns={planColumns}
          data={plans}
          loading={plansLoading}
          cells={{
            name: ({ value, row }) => (
              <span className={`text-sm font-medium ${getPlanNameClass(row.group_id as number)}`}>
                {value as string}
              </span>
            ),
            group_id: ({ value }) => {
              const groupId = value as number
              if (isGroupMissing(groupId)) {
                return (
                  <span className="text-sm">
                    <span className="text-gray-400">#{groupId}</span>
                    <span className="badge badge-danger ml-1">{t('payment.admin.groupMissing')}</span>
                  </span>
                )
              }
              const group = getGroup(groupId)
              if (group) {
                return (
                  <GroupBadge
                    name={group.name}
                    platform={group.platform}
                    rateMultiplier={group.rate_multiplier}
                  />
                )
              }
              return <span className="text-sm text-gray-400">-</span>
            },
            price: ({ value, row }) => (
              <div className="text-sm">
                <span className="font-medium text-gray-900 dark:text-white">
                  ${((value as number) ?? 0).toFixed(2)}
                </span>
                {row.original_price ? (
                  <span className="ml-1 text-xs text-gray-400 line-through">
                    ${(row.original_price as number).toFixed(2)}
                  </span>
                ) : null}
              </div>
            ),
            validity_days: ({ value, row }) => (
              <span className="text-sm">
                {value as number} {t('payment.admin.' + ((row.validity_unit as string) || 'days'))}
              </span>
            ),
            for_sale: ({ value, row }) => (
              <button
                type="button"
                className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 ${
                  value ? 'bg-primary-500' : 'bg-gray-300 dark:bg-dark-600'
                }`}
                onClick={() => toggleForSale(row as SubscriptionPlan)}
              >
                <span
                  className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                    value ? 'translate-x-4' : 'translate-x-0'
                  }`}
                />
              </button>
            ),
            actions: ({ row }) => (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => openPlanEdit(row as SubscriptionPlan)}
                  className="flex flex-col items-center gap-0.5 rounded-lg p-1.5 text-gray-500 transition-colors hover:bg-blue-50 hover:text-blue-600 dark:hover:bg-blue-900/20 dark:hover:text-blue-400"
                >
                  <Icon name="edit" size="sm" />
                  <span className="text-xs">{t('common.edit')}</span>
                </button>
                <button
                  type="button"
                  onClick={() => confirmDeletePlan(row as SubscriptionPlan)}
                  className="flex flex-col items-center gap-0.5 rounded-lg p-1.5 text-gray-500 transition-colors hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20 dark:hover:text-red-400"
                >
                  <Icon name="trash" size="sm" />
                  <span className="text-xs">{t('common.delete')}</span>
                </button>
              </div>
            ),
          }}
        />
      </div>

      <PlanEditDialog
        show={showPlanDialog}
        plan={editingPlan}
        groups={groups}
        onClose={() => setShowPlanDialog(false)}
        onSaved={loadPlans}
      />

      <ConfirmDialog
        show={showDeletePlanDialog}
        title={t('payment.admin.deletePlan')}
        message={t('payment.admin.deletePlanConfirm')}
        confirmText={t('common.delete')}
        danger
        onConfirm={handleDeletePlan}
        onCancel={() => setShowDeletePlanDialog(false)}
      />
    </AppLayout>
  )
}
