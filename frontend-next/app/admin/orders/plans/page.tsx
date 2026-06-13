'use client'

import { useEffect, useMemo, useState } from 'react'
import PageShell from '@/components/PageShell'
import { adminPaymentAPI, type SubscriptionPlan } from '@/lib/adminPayment'
import { adminGroupsAPI, type AdminGroup } from '@/lib/adminGroups'

function formatMoney(value: number, currency = 'USD') {
  return `${currency} ${value.toFixed(2)}`
}

export default function SubscriptionPlansPage() {
  const [plans, setPlans] = useState<SubscriptionPlan[]>([])
  const [groups, setGroups] = useState<AdminGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [savingPlanId, setSavingPlanId] = useState<number | null>(null)

  useEffect(() => {
    async function loadData() {
      setLoading(true)
      setError(null)

      try {
        const [planResponse, groupResponse] = await Promise.all([
          adminPaymentAPI.getPlans(),
          adminGroupsAPI.list(1, 100),
        ])

        setPlans(
          planResponse.map((plan) => {
            const rawFeatures = plan.features as unknown as string | string[] | null | undefined
            return {
              ...plan,
              features: Array.isArray(rawFeatures)
                ? rawFeatures
                : typeof rawFeatures === 'string'
                ? rawFeatures.split('\n').map((feature) => feature.trim()).filter(Boolean)
                : [],
            }
          })
        )
        setGroups(groupResponse.items)
      } catch (err) {
        setError((err as Error)?.message || 'Unable to load subscription plans.')
      } finally {
        setLoading(false)
      }
    }

    loadData()
  }, [])

  const groupById = useMemo(() => {
    return groups.reduce<Record<number, AdminGroup>>((map, group) => {
      map[group.id] = group
      return map
    }, {})
  }, [groups])

  const toggleForSale = async (plan: SubscriptionPlan) => {
    setSavingPlanId(plan.id)
    try {
      const updated = await adminPaymentAPI.updatePlan(plan.id, { for_sale: !plan.for_sale })
      setPlans((current) => current.map((currentPlan) => (currentPlan.id === plan.id ? updated : currentPlan)))
    } catch (err) {
      setError((err as Error)?.message || 'Unable to update plan.')
    } finally {
      setSavingPlanId(null)
    }
  }

  return (
    <PageShell title="Subscription Plans" description="Manage payment plans" path="/admin/orders/plans">
      <div className="space-y-6">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-xl font-semibold text-slate-900">Subscription plans</h2>
              <p className="mt-2 text-sm text-slate-600">
                Review payment plans and toggle availability for sale.
              </p>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="rounded-3xl border border-slate-200 bg-slate-50 p-8 text-center text-slate-600">
            Loading plans...
          </div>
        ) : error ? (
          <div className="rounded-3xl border border-rose-200 bg-rose-50 p-6 text-rose-700">
            <p className="font-semibold">Unable to load plans</p>
            <p className="mt-2 text-sm">{error}</p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-3xl border border-slate-200 bg-slate-50 p-6">
              <p className="text-sm text-slate-500">Showing {plans.length} plans</p>
            </div>

            <div className="overflow-x-auto rounded-3xl border border-slate-200 bg-white shadow-sm">
              <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                <thead className="bg-slate-50 text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Name</th>
                    <th className="px-4 py-3">Group</th>
                    <th className="px-4 py-3">Price</th>
                    <th className="px-4 py-3">Validity</th>
                    <th className="px-4 py-3">For sale</th>
                    <th className="px-4 py-3">Sort</th>
                    <th className="px-4 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 bg-white text-slate-700">
                  {plans.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-6 text-center text-slate-500">
                        No subscription plans available.
                      </td>
                    </tr>
                  ) : (
                    plans.map((plan) => (
                      <tr key={plan.id} className="odd:bg-slate-50">
                        <td className="px-4 py-4 font-medium text-slate-900">{plan.name}</td>
                        <td className="px-4 py-4">
                          {groupById[plan.group_id]?.name ?? `#${plan.group_id}`}
                        </td>
                        <td className="px-4 py-4">{formatMoney(plan.price)}</td>
                        <td className="px-4 py-4">
                          {plan.validity_days} {plan.validity_unit}
                        </td>
                        <td className="px-4 py-4 capitalize">{plan.for_sale ? 'Yes' : 'No'}</td>
                        <td className="px-4 py-4">{plan.sort_order}</td>
                        <td className="px-4 py-4">
                          <button
                            type="button"
                            onClick={() => toggleForSale(plan)}
                            disabled={savingPlanId === plan.id}
                            className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-slate-700 ring-1 ring-slate-200 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {savingPlanId === plan.id ? 'Saving…' : plan.for_sale ? 'Disable' : 'Enable'}
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </PageShell>
  )
}
