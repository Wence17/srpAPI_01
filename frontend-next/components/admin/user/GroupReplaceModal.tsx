'use client'

import { useEffect, useMemo, useState } from 'react'
import { useI18n } from '@/lib/i18n'
import { useApp } from '@/context/AppContext'
import { adminUsersAPI } from '@/lib/adminUsers'
import BaseDialog from '@/components/common/BaseDialog'
import Icon from '@/components/icons/Icon'
import type { AdminUser } from '@/lib/types'
import type { AdminGroup } from '@/lib/adminGroups'

interface GroupReplaceModalProps {
  show: boolean
  user: AdminUser | null
  oldGroup: { id: number; name: string } | null
  allGroups: AdminGroup[]
  onClose: () => void
  onSuccess: () => void
}

export default function GroupReplaceModal({
  show,
  user,
  oldGroup,
  allGroups,
  onClose,
  onSuccess,
}: GroupReplaceModalProps) {
  const { t } = useI18n()
  const appStore = useApp()
  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const availableGroups = useMemo(() => {
    if (!oldGroup) return []
    return allGroups.filter(
      (g) =>
        g.status === 'active' &&
        g.is_exclusive &&
        g.subscription_type === 'standard' &&
        g.id !== oldGroup.id,
    )
  }, [allGroups, oldGroup])

  useEffect(() => {
    if (show) setSelectedGroupId(null)
  }, [show])

  const handleReplace = async () => {
    if (!user || !oldGroup || !selectedGroupId) return
    setSubmitting(true)
    try {
      const result = await adminUsersAPI.replaceGroup(
        typeof user.id === 'number' ? user.id : Number(user.id),
        oldGroup.id,
        selectedGroupId,
      )
      appStore.showSuccess(t('admin.users.replaceGroupSuccess', { count: result.migrated_keys }))
      onSuccess()
      onClose()
    } catch (error) {
      console.error('Failed to replace group:', error)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <BaseDialog
      show={show}
      title={t('admin.users.replaceGroupTitle')}
      width="narrow"
      onClose={onClose}
      footer={
        <div className="flex justify-end gap-3">
          <button type="button" onClick={onClose} className="btn btn-secondary px-5">
            {t('common.cancel')}
          </button>
          <button
            type="button"
            onClick={handleReplace}
            disabled={!selectedGroupId || submitting}
            className="btn btn-primary px-6"
          >
            {submitting ? t('common.saving') : t('admin.users.replaceGroupConfirm')}
          </button>
        </div>
      }
    >
      {oldGroup ? (
        <div className="space-y-4">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            {t('admin.users.replaceGroupHint', { old: oldGroup.name })}
          </p>
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-dark-600 dark:bg-dark-800">
            <div className="flex items-center gap-2">
              <Icon name="shield" size="sm" className="text-purple-500" />
              <span className="font-medium text-gray-900 dark:text-white">{oldGroup.name}</span>
              <Icon name="arrowRight" size="sm" className="ml-auto text-gray-400" />
              {selectedGroupId ? (
                <span className="font-medium text-primary-600 dark:text-primary-400">
                  {availableGroups.find((g) => g.id === selectedGroupId)?.name}
                </span>
              ) : (
                <span className="text-sm text-gray-400">?</span>
              )}
            </div>
          </div>
          {availableGroups.length > 0 ? (
            <div className="max-h-64 space-y-2 overflow-y-auto">
              {availableGroups.map((group) => (
                <label
                  key={group.id}
                  className={`flex cursor-pointer items-center gap-3 rounded-lg border-2 p-3 transition-all ${
                    selectedGroupId === group.id
                      ? 'border-primary-400 bg-primary-50/50 dark:border-primary-500 dark:bg-primary-900/20'
                      : 'border-gray-200 hover:border-gray-300 dark:border-dark-600 dark:hover:border-dark-500'
                  }`}
                >
                  <input
                    type="radio"
                    value={group.id}
                    checked={selectedGroupId === group.id}
                    onChange={() => setSelectedGroupId(group.id)}
                    className="sr-only"
                  />
                  <div
                    className={`flex h-5 w-5 items-center justify-center rounded-full border-2 transition-all ${
                      selectedGroupId === group.id
                        ? 'border-primary-500 bg-primary-500'
                        : 'border-gray-300 dark:border-dark-500'
                    }`}
                  >
                    {selectedGroupId === group.id ? (
                      <div className="h-2 w-2 rounded-full bg-white" />
                    ) : null}
                  </div>
                  <div className="flex-1">
                    <span className="font-medium text-gray-900 dark:text-white">{group.name}</span>
                    <span className="ml-2 text-xs text-gray-400">{group.platform}</span>
                  </div>
                </label>
              ))}
            </div>
          ) : (
            <div className="py-6 text-center text-sm text-gray-400">{t('admin.users.noOtherGroups')}</div>
          )}
        </div>
      ) : null}
    </BaseDialog>
  )
}
