'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useI18n } from '@/lib/i18n'
import { useApp } from '@/context/AppContext'
import { adminGroupsAPI, type AdminGroup } from '@/lib/adminGroups'
import { adminUsersAPI } from '@/lib/adminUsers'
import BaseDialog from '@/components/common/BaseDialog'
import PlatformIcon from '@/components/common/PlatformIcon'
import type { AdminUser, GroupPlatform } from '@/lib/types'

interface GroupRateConfig {
  groupId: number
  groupName: string
  platform: GroupPlatform
  isExclusive: boolean
  defaultRate: number
  customRate: number | null
  isSelected: boolean
}

interface UserAllowedGroupsModalProps {
  show: boolean
  user: AdminUser | null
  onClose: () => void
  onSuccess: () => void
}

export default function UserAllowedGroupsModal({
  show,
  user,
  onClose,
  onSuccess,
}: UserAllowedGroupsModalProps) {
  const { t } = useI18n()
  const appStore = useApp()
  const [groups, setGroups] = useState<AdminGroup[]>([])
  const [groupConfigs, setGroupConfigs] = useState<GroupRateConfig[]>([])
  const [originalGroupRates, setOriginalGroupRates] = useState<Record<number, number>>({})
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const exclusiveGroups = useMemo(() => groups.filter((g) => g.is_exclusive), [groups])
  const publicGroups = useMemo(() => groups.filter((g) => !g.is_exclusive), [groups])
  const exclusiveGroupConfigs = useMemo(
    () => groupConfigs.filter((c) => c.isExclusive),
    [groupConfigs],
  )
  const publicGroupConfigs = useMemo(
    () => groupConfigs.filter((c) => !c.isExclusive),
    [groupConfigs],
  )

  const load = useCallback(async () => {
    if (!user) return
    setLoading(true)
    try {
      const res = await adminGroupsAPI.list(1, 1000)
      const activeGroups = res.items.filter(
        (g) => g.subscription_type === 'standard' && g.status === 'active',
      )
      setGroups(activeGroups)

      const userAllowedGroups = user.allowed_groups || []
      const userGroupRates = user.group_rates || {}
      setOriginalGroupRates({ ...userGroupRates })

      setGroupConfigs(
        activeGroups.map((g) => ({
          groupId: g.id,
          groupName: g.name,
          platform: g.platform,
          isExclusive: g.is_exclusive,
          defaultRate: g.rate_multiplier,
          customRate: userGroupRates[g.id] ?? null,
          isSelected: g.is_exclusive ? userAllowedGroups.includes(g.id) : true,
        })),
      )
    } catch (error) {
      console.error('Failed to load groups:', error)
    } finally {
      setLoading(false)
    }
  }, [user])

  useEffect(() => {
    if (show && user) void load()
  }, [show, user, load])

  const toggleExclusiveGroup = (groupId: number) => {
    setGroupConfigs((prev) =>
      prev.map((config) =>
        config.groupId === groupId && config.isExclusive
          ? { ...config, isSelected: !config.isSelected }
          : config,
      ),
    )
  }

  const updateCustomRate = (groupId: number, value: string) => {
    setGroupConfigs((prev) =>
      prev.map((config) => {
        if (config.groupId !== groupId) return config
        if (value === '' || value === null || value === undefined) {
          return { ...config, customRate: null }
        }
        const numValue = parseFloat(value)
        return { ...config, customRate: Number.isNaN(numValue) ? null : numValue }
      }),
    )
  }

  const handleSave = async () => {
    if (!user) return
    setSubmitting(true)
    try {
      const allowedGroups = groupConfigs
        .filter((c) => c.isExclusive && c.isSelected)
        .map((c) => c.groupId)

      const groupRates: Record<number, number | null> = {}
      for (const c of groupConfigs) {
        const hadOriginalRate = originalGroupRates[c.groupId] !== undefined
        if (c.customRate !== null) {
          groupRates[c.groupId] = c.customRate
        } else if (hadOriginalRate) {
          groupRates[c.groupId] = null
        }
      }

      await adminUsersAPI.update(typeof user.id === 'number' ? user.id : Number(user.id), {
        allowed_groups: allowedGroups,
        group_rates: Object.keys(groupRates).length > 0 ? groupRates : undefined,
      })

      appStore.showSuccess(t('admin.users.groupConfigUpdated'))
      onSuccess()
      onClose()
    } catch (error) {
      console.error('Failed to update user group config:', error)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <BaseDialog
      show={show}
      title={t('admin.users.groupConfig')}
      width="wide"
      onClose={onClose}
      footer={
        <div className="flex justify-end gap-3">
          <button type="button" onClick={onClose} className="btn btn-secondary px-5">
            {t('common.cancel')}
          </button>
          <button type="button" onClick={handleSave} disabled={submitting} className="btn btn-primary px-6">
            {submitting ? t('common.saving') : t('common.save')}
          </button>
        </div>
      }
    >
      {user ? (
        <div className="space-y-6">
          <div className="flex items-center gap-4 rounded-2xl bg-gradient-to-r from-primary-50 to-primary-100 p-5 dark:from-primary-900/30 dark:to-primary-800/20">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-white shadow-sm dark:bg-dark-700">
              <span className="text-2xl font-semibold text-primary-600 dark:text-primary-400">
                {user.email.charAt(0).toUpperCase()}
              </span>
            </div>
            <div className="flex-1">
              <p className="text-lg font-semibold text-gray-900 dark:text-white">{user.email}</p>
              <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                {t('admin.users.groupConfigHint', { email: user.email })}
              </p>
            </div>
          </div>

          {loading ? (
            <div className="flex justify-center py-12">
              <svg className="h-10 w-10 animate-spin text-primary-500" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
            </div>
          ) : (
            <div className="space-y-6">
              {exclusiveGroups.length > 0 ? (
                <div>
                  <div className="mb-3 flex items-center gap-2">
                    <div className="h-1.5 w-1.5 rounded-full bg-purple-500" />
                    <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                      {t('admin.users.exclusiveGroups')}
                    </h4>
                    <span className="text-xs text-gray-400">
                      ({exclusiveGroupConfigs.filter((c) => c.isSelected).length}/
                      {exclusiveGroupConfigs.length})
                    </span>
                  </div>
                  <div className="grid gap-3">
                    {exclusiveGroupConfigs.map((config) => (
                      <div
                        key={config.groupId}
                        className={`group relative overflow-hidden rounded-xl border-2 p-4 transition-all duration-200 ${
                          config.isSelected
                            ? 'border-primary-400 bg-primary-50/50 shadow-sm dark:border-primary-500 dark:bg-primary-900/20'
                            : 'border-gray-200 bg-white hover:border-gray-300 dark:border-dark-600 dark:bg-dark-800 dark:hover:border-dark-500'
                        }`}
                      >
                        <div className="flex items-center gap-4">
                          <div className="flex-shrink-0">
                            <label className="relative flex h-6 w-6 cursor-pointer items-center justify-center">
                              <input
                                type="checkbox"
                                checked={config.isSelected}
                                onChange={() => toggleExclusiveGroup(config.groupId)}
                                className="peer sr-only"
                              />
                              <div className="h-5 w-5 rounded-md border-2 border-gray-300 transition-all peer-checked:border-primary-500 peer-checked:bg-primary-500 dark:border-dark-500 peer-checked:dark:border-primary-500">
                                {config.isSelected ? (
                                  <svg
                                    className="h-full w-full text-white"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    stroke="currentColor"
                                    strokeWidth="3"
                                  >
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                  </svg>
                                ) : null}
                              </div>
                            </label>
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="text-base font-semibold text-gray-900 dark:text-white">
                                {config.groupName}
                              </span>
                              <span className="inline-flex items-center rounded-full bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-700 dark:bg-purple-900/40 dark:text-purple-300">
                                {t('admin.groups.exclusive')}
                              </span>
                            </div>
                            <div className="mt-1.5 flex items-center gap-3 text-sm">
                              <span className="inline-flex items-center gap-1 text-gray-500 dark:text-gray-400">
                                <PlatformIcon platform={config.platform} size="xs" />
                                <span>{config.platform}</span>
                              </span>
                              <span className="text-gray-300 dark:text-dark-500">•</span>
                              <span className="text-gray-500 dark:text-gray-400">
                                {t('admin.users.defaultRate')}:{' '}
                                <span className="font-medium text-gray-700 dark:text-gray-300">
                                  {config.defaultRate}x
                                </span>
                              </span>
                            </div>
                          </div>
                          <div className="flex flex-shrink-0 items-center gap-3">
                            <label className="text-sm font-medium text-gray-600 dark:text-gray-400">
                              {t('admin.users.customRate')}
                            </label>
                            <input
                              type="number"
                              step="0.001"
                              min="0.001"
                              value={config.customRate ?? ''}
                              onChange={(e) => updateCustomRate(config.groupId, e.target.value)}
                              placeholder={String(config.defaultRate)}
                              className="hide-spinner w-24 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium transition-colors focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20 dark:border-dark-500 dark:bg-dark-700 dark:focus:border-primary-500"
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {publicGroups.length > 0 ? (
                <div>
                  <div className="mb-3 flex items-center gap-2">
                    <div className="h-1.5 w-1.5 rounded-full bg-green-500" />
                    <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                      {t('admin.users.publicGroups')}
                    </h4>
                    <span className="text-xs text-gray-400">({publicGroupConfigs.length})</span>
                  </div>
                  <div className="grid gap-3">
                    {publicGroupConfigs.map((config) => (
                      <div
                        key={config.groupId}
                        className="relative overflow-hidden rounded-xl border-2 border-green-200 bg-green-50/50 p-4 dark:border-green-800/50 dark:bg-green-900/10"
                      >
                        <div className="flex items-center gap-4">
                          <div className="flex-shrink-0">
                            <div className="flex h-5 w-5 items-center justify-center rounded-md border-2 border-green-400 bg-green-500 dark:border-green-600 dark:bg-green-600">
                              <svg
                                className="h-full w-full text-white"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                                strokeWidth="3"
                              >
                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                              </svg>
                            </div>
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="text-base font-semibold text-gray-900 dark:text-white">
                                {config.groupName}
                              </span>
                            </div>
                            <div className="mt-1.5 flex items-center gap-3 text-sm">
                              <span className="inline-flex items-center gap-1 text-gray-500 dark:text-gray-400">
                                <PlatformIcon platform={config.platform} size="xs" />
                                <span>{config.platform}</span>
                              </span>
                              <span className="text-gray-300 dark:text-dark-500">•</span>
                              <span className="text-gray-500 dark:text-gray-400">
                                {t('admin.users.defaultRate')}:{' '}
                                <span className="font-medium text-gray-700 dark:text-gray-300">
                                  {config.defaultRate}x
                                </span>
                              </span>
                            </div>
                          </div>
                          <div className="flex flex-shrink-0 items-center gap-3">
                            <label className="text-sm font-medium text-gray-600 dark:text-gray-400">
                              {t('admin.users.customRate')}
                            </label>
                            <input
                              type="number"
                              step="0.001"
                              min="0.001"
                              value={config.customRate ?? ''}
                              onChange={(e) => updateCustomRate(config.groupId, e.target.value)}
                              placeholder={String(config.defaultRate)}
                              className="hide-spinner w-24 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium transition-colors focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20 dark:border-dark-500 dark:bg-dark-700 dark:focus:border-primary-500"
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {groups.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gray-100 dark:bg-dark-700">
                    <svg className="h-8 w-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
                      />
                    </svg>
                  </div>
                  <p className="text-gray-500 dark:text-gray-400">{t('common.noGroupsAvailable')}</p>
                </div>
              ) : null}
            </div>
          )}
        </div>
      ) : null}
    </BaseDialog>
  )
}
