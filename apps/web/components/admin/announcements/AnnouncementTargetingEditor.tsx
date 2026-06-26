'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useI18n } from '@/lib/i18n'
import Select from '@/components/common/Select'
import GroupSelector from '@/components/common/GroupSelector'
import Icon from '@/components/icons/Icon'
import type { AdminGroup } from '@/lib/adminGroups'
import type {
  AnnouncementCondition,
  AnnouncementConditionGroup,
  AnnouncementConditionType,
  AnnouncementOperator,
  AnnouncementTargeting,
} from '@/lib/adminAnnouncements'

interface AnnouncementTargetingEditorProps {
  modelValue: AnnouncementTargeting
  groups: AdminGroup[]
  onUpdateModelValue?: (value: AnnouncementTargeting) => void
}

type Mode = 'all' | 'custom'

function defaultSubscriptionCondition(): AnnouncementCondition {
  return {
    type: 'subscription',
    operator: 'in',
    group_ids: [],
  }
}

function defaultBalanceCondition(): AnnouncementCondition {
  return {
    type: 'balance',
    operator: 'gte',
    value: 0,
  }
}

export default function AnnouncementTargetingEditor({
  modelValue,
  groups,
  onUpdateModelValue,
}: AnnouncementTargetingEditorProps) {
  const { t } = useI18n()

  const anyOf = modelValue?.any_of ?? []
  const mode: Mode = anyOf.length === 0 ? 'all' : 'custom'

  const [subscriptionSelections, setSubscriptionSelections] = useState<
    Record<number, Record<number, number[]>>
  >({})

  const syncingFromModelRef = useRef(false)
  const syncTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const conditionTypeOptions = useMemo(
    () => [
      { value: 'subscription', label: t('admin.announcements.form.conditionSubscription') },
      { value: 'balance', label: t('admin.announcements.form.conditionBalance') },
    ],
    [t],
  )

  const balanceOperatorOptions = useMemo(
    () => [
      { value: 'gt', label: t('admin.announcements.operators.gt') },
      { value: 'gte', label: t('admin.announcements.operators.gte') },
      { value: 'lt', label: t('admin.announcements.operators.lt') },
      { value: 'lte', label: t('admin.announcements.operators.lte') },
      { value: 'eq', label: t('admin.announcements.operators.eq') },
    ],
    [t],
  )

  const updateTargeting = useCallback(
    (mutator: (draft: { any_of: AnnouncementConditionGroup[] }) => void) => {
      const draft: { any_of: AnnouncementConditionGroup[] } = JSON.parse(
        JSON.stringify(modelValue ?? { any_of: [] }),
      )
      if (!draft.any_of) draft.any_of = []
      mutator(draft)
      onUpdateModelValue?.(draft)
    },
    [modelValue, onUpdateModelValue],
  )

  const setMode = useCallback(
    (next: Mode) => {
      if (next === 'all') {
        onUpdateModelValue?.({ any_of: [] })
        return
      }
      if (anyOf.length === 0) {
        onUpdateModelValue?.({ any_of: [{ all_of: [defaultSubscriptionCondition()] }] })
      }
    },
    [anyOf.length, onUpdateModelValue],
  )

  const addOrGroup = useCallback(() => {
    updateTargeting((draft) => {
      if (draft.any_of.length >= 50) return
      draft.any_of.push({ all_of: [defaultSubscriptionCondition()] })
    })
  }, [updateTargeting])

  const removeOrGroup = useCallback(
    (groupIndex: number) => {
      updateTargeting((draft) => {
        draft.any_of.splice(groupIndex, 1)
      })
    },
    [updateTargeting],
  )

  const addAndCondition = useCallback(
    (groupIndex: number) => {
      updateTargeting((draft) => {
        const group = draft.any_of[groupIndex]
        if (!group.all_of) group.all_of = []
        if (group.all_of.length >= 50) return
        group.all_of.push(defaultSubscriptionCondition())
      })
    },
    [updateTargeting],
  )

  const removeAndCondition = useCallback(
    (groupIndex: number, condIndex: number) => {
      updateTargeting((draft) => {
        const group = draft.any_of[groupIndex]
        if (!group?.all_of) return
        group.all_of.splice(condIndex, 1)
      })
    },
    [updateTargeting],
  )

  const setConditionType = useCallback(
    (groupIndex: number, condIndex: number, nextType: AnnouncementConditionType) => {
      updateTargeting((draft) => {
        const group = draft.any_of[groupIndex]
        if (!group?.all_of) return
        group.all_of[condIndex] =
          nextType === 'subscription' ? defaultSubscriptionCondition() : defaultBalanceCondition()
      })
    },
    [updateTargeting],
  )

  const setOperator = useCallback(
    (groupIndex: number, condIndex: number, op: AnnouncementOperator) => {
      updateTargeting((draft) => {
        const group = draft.any_of[groupIndex]
        if (!group?.all_of) return
        const cond = group.all_of[condIndex]
        if (!cond) return
        cond.operator = op
      })
    },
    [updateTargeting],
  )

  const setBalanceValue = useCallback(
    (groupIndex: number, condIndex: number, raw: string) => {
      const n = raw === '' ? 0 : Number(raw)
      updateTargeting((draft) => {
        const group = draft.any_of[groupIndex]
        if (!group?.all_of) return
        const cond = group.all_of[condIndex]
        if (!cond) return
        cond.value = Number.isFinite(n) ? n : 0
      })
    },
    [updateTargeting],
  )

  useEffect(() => {
    syncingFromModelRef.current = true
    const groupsList = modelValue?.any_of ?? []
    const nextSelections: Record<number, Record<number, number[]>> = {}

    for (let gi = 0; gi < groupsList.length; gi++) {
      const allOf = groupsList[gi]?.all_of ?? []
      for (let ci = 0; ci < allOf.length; ci++) {
        const c = allOf[ci]
        if (c?.type === 'subscription') {
          if (!nextSelections[gi]) nextSelections[gi] = {}
          nextSelections[gi][ci] = (c.group_ids ?? []).slice()
        }
      }
    }

    setSubscriptionSelections(nextSelections)
    syncingFromModelRef.current = false
  }, [modelValue])

  useEffect(() => {
    if (syncingFromModelRef.current) return

    if (syncTimeoutRef.current) clearTimeout(syncTimeoutRef.current)
    syncTimeoutRef.current = setTimeout(() => {
      const newTargeting: { any_of: AnnouncementConditionGroup[] } = JSON.parse(
        JSON.stringify(modelValue ?? { any_of: [] }),
      )
      if (!newTargeting.any_of) newTargeting.any_of = []

      for (let gi = 0; gi < newTargeting.any_of.length; gi++) {
        const allOf = newTargeting.any_of[gi]?.all_of ?? []
        for (let ci = 0; ci < allOf.length; ci++) {
          const c = allOf[ci]
          if (c?.type === 'subscription') {
            c.operator = 'in'
            c.group_ids = (subscriptionSelections[gi]?.[ci] ?? []).slice()
          }
        }
      }

      if (JSON.stringify(modelValue) !== JSON.stringify(newTargeting)) {
        onUpdateModelValue?.(newTargeting)
      }
    }, 0)

    return () => {
      if (syncTimeoutRef.current) clearTimeout(syncTimeoutRef.current)
    }
  }, [modelValue, onUpdateModelValue, subscriptionSelections])

  const validationError = useMemo(() => {
    if (mode !== 'custom') return ''

    const groupsList = anyOf
    if (groupsList.length === 0) return t('admin.announcements.form.addOrGroup')
    if (groupsList.length > 50) return 'any_of > 50'

    for (const g of groupsList) {
      const allOf = g?.all_of ?? []
      if (allOf.length === 0) return t('admin.announcements.form.addAndCondition')
      if (allOf.length > 50) return 'all_of > 50'

      for (const c of allOf) {
        if (c.type === 'subscription') {
          if (!c.group_ids || c.group_ids.length === 0) {
            return t('admin.announcements.form.selectPackages')
          }
        }
      }
    }

    return ''
  }, [anyOf, mode, t])

  const updateSubscriptionSelection = useCallback(
    (groupIndex: number, condIndex: number, ids: number[]) => {
      setSubscriptionSelections((prev) => ({
        ...prev,
        [groupIndex]: {
          ...(prev[groupIndex] ?? {}),
          [condIndex]: ids,
        },
      }))
    },
    [],
  )

  return (
    <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4 dark:border-dark-700 dark:bg-dark-800/50">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-sm font-medium text-gray-900 dark:text-white">
            {t('admin.announcements.form.targetingMode')}
          </div>
          <div className="mt-1 text-xs text-gray-500 dark:text-dark-400">
            {mode === 'all'
              ? t('admin.announcements.form.targetingAll')
              : t('admin.announcements.form.targetingCustom')}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
            <input
              type="radio"
              name="announcement-targeting-mode"
              value="all"
              checked={mode === 'all'}
              onChange={() => setMode('all')}
              className="h-4 w-4"
            />
            {t('admin.announcements.form.targetingAll')}
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
            <input
              type="radio"
              name="announcement-targeting-mode"
              value="custom"
              checked={mode === 'custom'}
              onChange={() => setMode('custom')}
              className="h-4 w-4"
            />
            {t('admin.announcements.form.targetingCustom')}
          </label>
        </div>
      </div>

      {mode === 'custom' ? (
        <div className="mt-4 space-y-4">
          <div className="flex items-center justify-between">
            <div className="text-sm font-medium text-gray-900 dark:text-white">
              OR
              <span className="ml-1 text-xs font-normal text-gray-500 dark:text-dark-400">
                ({anyOf.length}/50)
              </span>
            </div>
            <button
              type="button"
              className="btn btn-secondary"
              disabled={anyOf.length >= 50}
              onClick={addOrGroup}
            >
              <Icon name="plus" size="sm" className="mr-1" />
              {t('admin.announcements.form.addOrGroup')}
            </button>
          </div>

          {anyOf.length === 0 ? (
            <div className="rounded-xl border border-dashed border-gray-300 p-4 text-sm text-gray-500 dark:border-dark-600 dark:text-dark-400">
              {t('admin.announcements.form.targetingCustom')}:{' '}
              {t('admin.announcements.form.addOrGroup')}
            </div>
          ) : null}

          {anyOf.map((group, groupIndex) => (
            <div
              key={groupIndex}
              className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm dark:border-dark-700 dark:bg-dark-800"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-gray-900 dark:text-white">
                    {t('admin.announcements.form.targetingCustom')} #{groupIndex + 1}
                    <span className="ml-2 text-xs font-normal text-gray-500 dark:text-dark-400">
                      AND ({(group.all_of?.length || 0)}/50)
                    </span>
                  </div>
                  <div className="mt-1 text-xs text-gray-500 dark:text-dark-400">
                    {t('admin.announcements.form.addAndCondition')}
                  </div>
                </div>

                <button type="button" className="btn btn-secondary" onClick={() => removeOrGroup(groupIndex)}>
                  <Icon name="trash" size="sm" className="mr-1" />
                  {t('common.delete')}
                </button>
              </div>

              <div className="mt-4 space-y-3">
                {(group.all_of || []).map((cond, condIndex) => (
                  <div
                    key={condIndex}
                    className="rounded-xl border border-gray-200 bg-gray-50 p-3 dark:border-dark-700 dark:bg-dark-900/30"
                  >
                    <div className="flex flex-col gap-3 md:flex-row md:items-end">
                      <div className="w-full md:w-52">
                        <label className="input-label">
                          {t('admin.announcements.form.conditionType')}
                        </label>
                        <Select
                          modelValue={cond.type}
                          options={conditionTypeOptions}
                          onUpdateModelValue={(v) =>
                            setConditionType(groupIndex, condIndex, v as AnnouncementConditionType)
                          }
                        />
                      </div>

                      {cond.type === 'subscription' ? (
                        <div className="flex-1">
                          <label className="input-label">
                            {t('admin.announcements.form.selectPackages')}
                          </label>
                          <GroupSelector
                            modelValue={subscriptionSelections[groupIndex]?.[condIndex] ?? []}
                            groups={groups}
                            onUpdateModelValue={(ids) =>
                              updateSubscriptionSelection(groupIndex, condIndex, ids)
                            }
                          />
                        </div>
                      ) : (
                        <div className="flex flex-1 flex-col gap-3 sm:flex-row">
                          <div className="w-full sm:w-44">
                            <label className="input-label">
                              {t('admin.announcements.form.operator')}
                            </label>
                            <Select
                              modelValue={cond.operator}
                              options={balanceOperatorOptions}
                              onUpdateModelValue={(v) =>
                                setOperator(groupIndex, condIndex, v as AnnouncementOperator)
                              }
                            />
                          </div>
                          <div className="w-full sm:flex-1">
                            <label className="input-label">
                              {t('admin.announcements.form.balanceValue')}
                            </label>
                            <input
                              value={String(cond.value ?? '')}
                              type="number"
                              step="any"
                              className="input"
                              onChange={(e) =>
                                setBalanceValue(groupIndex, condIndex, e.target.value)
                              }
                            />
                          </div>
                        </div>
                      )}

                      <div className="flex justify-end">
                        <button
                          type="button"
                          className="btn btn-secondary"
                          onClick={() => removeAndCondition(groupIndex, condIndex)}
                        >
                          <Icon name="trash" size="sm" className="mr-1" />
                          {t('common.delete')}
                        </button>
                      </div>
                    </div>
                  </div>
                ))}

                <div className="flex justify-end">
                  <button
                    type="button"
                    className="btn btn-secondary"
                    disabled={(group.all_of?.length || 0) >= 50}
                    onClick={() => addAndCondition(groupIndex)}
                  >
                    <Icon name="plus" size="sm" className="mr-1" />
                    {t('admin.announcements.form.addAndCondition')}
                  </button>
                </div>
              </div>
            </div>
          ))}

          {validationError ? (
            <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/30 dark:bg-red-900/10 dark:text-red-300">
              {validationError}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
