'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useI18n } from '@/lib/i18n'
import { useApp } from '@/context/AppContext'
import { adminGroupsAPI, type AdminGroup, type GroupRateMultiplierEntry } from '@/lib/adminGroups'
import { adminUsersAPI } from '@/lib/adminUsers'
import BaseDialog from '@/components/common/BaseDialog'
import Pagination from '@/components/common/Pagination'
import PlatformIcon from '@/components/common/PlatformIcon'
import Icon from '@/components/icons/Icon'
import type { AdminUser } from '@/lib/types'

interface LocalEntry extends GroupRateMultiplierEntry {}

interface GroupRateMultipliersModalProps {
  show: boolean
  group: AdminGroup | null
  onClose: () => void
  onSuccess: () => void
}

function platformColorClass(platform?: string): string {
  switch (platform) {
    case 'anthropic':
      return 'text-orange-700 dark:text-orange-400'
    case 'openai':
      return 'text-emerald-700 dark:text-emerald-400'
    case 'antigravity':
      return 'text-purple-700 dark:text-purple-400'
    default:
      return 'text-blue-700 dark:text-blue-400'
  }
}

export default function GroupRateMultipliersModal({
  show,
  group,
  onClose,
  onSuccess,
}: GroupRateMultipliersModalProps) {
  const { t } = useI18n()
  const appStore = useApp()

  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [serverEntries, setServerEntries] = useState<GroupRateMultiplierEntry[]>([])
  const [localEntries, setLocalEntries] = useState<LocalEntry[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<AdminUser[]>([])
  const [showDropdown, setShowDropdown] = useState(false)
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null)
  const [newRate, setNewRate] = useState<number | null>(null)
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [batchFactor, setBatchFactor] = useState<number | null>(null)

  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const dropdownRef = useRef<HTMLDivElement | null>(null)

  const cloneEntries = (entries: GroupRateMultiplierEntry[]): LocalEntry[] =>
    entries.map((entry) => ({ ...entry }))

  const adjustPage = useCallback(
    (entries: LocalEntry[]) => {
      const totalPages = Math.max(1, Math.ceil(entries.length / pageSize))
      if (currentPage > totalPages) {
        setCurrentPage(totalPages)
      }
    },
    [currentPage, pageSize],
  )

  const loadEntries = useCallback(async () => {
    if (!group) return
    setLoading(true)
    try {
      const raw = await adminGroupsAPI.getGroupRateMultipliers(group.id)
      const filtered = raw.filter((entry) => entry.rate_multiplier != null)
      setServerEntries(filtered)
      setLocalEntries(cloneEntries(filtered))
      adjustPage(filtered)
    } catch (error) {
      appStore.showError(t('admin.groups.failedToLoad'))
      console.error('Error loading group rate multipliers:', error)
    } finally {
      setLoading(false)
    }
  }, [adjustPage, appStore, group, t])

  useEffect(() => {
    if (show && group) {
      setCurrentPage(1)
      setBatchFactor(null)
      setSearchQuery('')
      setSearchResults([])
      setSelectedUser(null)
      setNewRate(null)
      void loadEntries()
    }
  }, [show, group, loadEntries])

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (!dropdownRef.current?.contains(event.target as Node)) {
        setShowDropdown(false)
      }
    }
    document.addEventListener('click', handleClickOutside)
    return () => document.removeEventListener('click', handleClickOutside)
  }, [])

  const showFinalRate = batchFactor != null && batchFactor > 0 && batchFactor !== 1

  const computeFinalRate = (rate: number | null | undefined) => {
    const base = rate ?? group?.rate_multiplier ?? 1
    if (!batchFactor) return base
    return parseFloat((base * batchFactor).toFixed(6))
  }

  const isDirty = useMemo(() => {
    if (localEntries.length !== serverEntries.length) return true
    const serverMap = new Map(
      serverEntries.map((entry) => [entry.user_id, entry.rate_multiplier ?? null]),
    )
    return localEntries.some(
      (entry) => serverMap.get(entry.user_id) !== (entry.rate_multiplier ?? null),
    )
  }, [localEntries, serverEntries])

  const paginatedLocalEntries = useMemo(() => {
    const start = (currentPage - 1) * pageSize
    return localEntries.slice(start, start + pageSize)
  }, [currentPage, localEntries, pageSize])

  const handleSearchUsers = (value: string) => {
    setSearchQuery(value)
    setSelectedUser(null)
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current)
    }
    if (!value.trim()) {
      setSearchResults([])
      setShowDropdown(false)
      return
    }
    searchTimeoutRef.current = setTimeout(async () => {
      try {
        const res = await adminUsersAPI.list(1, 10, { search: value.trim() })
        setSearchResults(res.items)
        setShowDropdown(true)
      } catch {
        setSearchResults([])
      }
    }, 300)
  }

  const selectUser = (user: AdminUser) => {
    setSelectedUser(user)
    setSearchQuery(user.email)
    setShowDropdown(false)
    setSearchResults([])
  }

  const handleAddLocal = () => {
    if (!selectedUser || !newRate) return
    const entry: LocalEntry = {
      user_id: Number(selectedUser.id),
      user_name: selectedUser.username || '',
      user_email: selectedUser.email,
      user_notes: selectedUser.notes || '',
      user_status: selectedUser.status || 'active',
      rate_multiplier: newRate,
      rpm_override: null,
    }
    setLocalEntries((prev) => {
      const idx = prev.findIndex((item) => item.user_id === Number(selectedUser.id))
      const next = [...prev]
      if (idx >= 0) {
        next[idx] = entry
      } else {
        next.push(entry)
      }
      adjustPage(next)
      return next
    })
    setSearchQuery('')
    setSelectedUser(null)
    setNewRate(null)
  }

  const updateLocalRate = (userId: number, value: string) => {
    setLocalEntries((prev) =>
      prev.map((entry) => {
        if (entry.user_id !== userId) return entry
        if (value.trim() === '') {
          return { ...entry, rate_multiplier: null }
        }
        const num = parseFloat(value)
        if (isNaN(num)) return entry
        return { ...entry, rate_multiplier: num }
      }),
    )
  }

  const removeLocal = (userId: number) => {
    setLocalEntries((prev) => {
      const next = prev.filter((entry) => entry.user_id !== userId)
      adjustPage(next)
      return next
    })
  }

  const applyBatchFactor = () => {
    if (!batchFactor || batchFactor <= 0) return
    setLocalEntries((prev) =>
      prev.map((entry) => {
        if (entry.rate_multiplier == null) return entry
        return {
          ...entry,
          rate_multiplier: parseFloat((entry.rate_multiplier * batchFactor).toFixed(6)),
        }
      }),
    )
    setBatchFactor(null)
  }

  const clearAllLocal = () => {
    setLocalEntries([])
  }

  const handleCancel = () => {
    const restored = cloneEntries(serverEntries)
    setLocalEntries(restored)
    setBatchFactor(null)
    adjustPage(restored)
  }

  const handleSave = async () => {
    if (!group) return
    setSaving(true)
    try {
      const entries = localEntries
        .filter((entry) => entry.rate_multiplier != null)
        .map((entry) => ({
          user_id: entry.user_id,
          rate_multiplier: entry.rate_multiplier as number,
        }))
      await adminGroupsAPI.batchSetGroupRateMultipliers(group.id, entries)
      appStore.showSuccess(t('admin.groups.rateSaved'))
      onSuccess()
      onClose()
    } catch (error) {
      appStore.showError(t('admin.groups.failedToSave'))
      console.error('Error saving rate multipliers:', error)
    } finally {
      setSaving(false)
    }
  }

  const handleClose = () => {
    if (isDirty) {
      setLocalEntries(cloneEntries(serverEntries))
    }
    onClose()
  }

  const handlePageSizeChange = (newSize: number) => {
    setPageSize(newSize)
    setCurrentPage(1)
  }

  if (!group) return null

  return (
    <BaseDialog
      show={show}
      title={t('admin.groups.rateMultipliersTitle')}
      width="wide"
      onClose={handleClose}
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-3 rounded-lg bg-gray-50 px-4 py-2.5 text-sm dark:bg-dark-700">
          <span className={`inline-flex items-center gap-1.5 ${platformColorClass(group.platform)}`}>
            <PlatformIcon platform={group.platform} size="sm" />
            {t(`admin.groups.platforms.${group.platform}`)}
          </span>
          <span className="text-gray-400">|</span>
          <span className="font-medium text-gray-900 dark:text-white">{group.name}</span>
          <span className="text-gray-400">|</span>
          <span className="text-gray-600 dark:text-gray-400">
            {t('admin.groups.columns.rateMultiplier')}: {group.rate_multiplier}x
          </span>
        </div>

        <div className="rounded-lg border border-gray-200 p-3 dark:border-dark-600">
          <h4 className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">
            {t('admin.groups.addUserRate')}
          </h4>
          <div className="flex items-end gap-2">
            <div ref={dropdownRef} className="relative flex-1">
              <input
                value={searchQuery}
                type="text"
                autoComplete="off"
                className="input w-full"
                placeholder={t('admin.groups.searchUserPlaceholder')}
                onChange={(event) => handleSearchUsers(event.target.value)}
                onFocus={() => setShowDropdown(true)}
              />
              {showDropdown && searchResults.length > 0 ? (
                <div className="absolute left-0 right-0 top-full z-10 mt-1 max-h-48 overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg dark:border-dark-500 dark:bg-dark-700">
                  {searchResults.map((user) => (
                    <button
                      key={user.id}
                      type="button"
                      className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-gray-50 dark:hover:bg-dark-600"
                      onClick={() => selectUser(user)}
                    >
                      <span className="text-gray-400">#{user.id}</span>
                      <span className="text-gray-900 dark:text-white">
                        {user.username || user.email}
                      </span>
                      {user.username ? (
                        <span className="text-xs text-gray-400">{user.email}</span>
                      ) : null}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
            <div className="w-24">
              <input
                value={newRate ?? ''}
                type="number"
                step="0.001"
                min="0"
                autoComplete="off"
                className="hide-spinner input w-full"
                placeholder="1.0"
                onChange={(event) => {
                  const value = event.target.value
                  setNewRate(value === '' ? null : Number(value))
                }}
              />
            </div>
            <button
              type="button"
              className="btn btn-primary shrink-0"
              disabled={!selectedUser || !newRate}
              onClick={handleAddLocal}
            >
              {t('common.add')}
            </button>
          </div>

          {localEntries.length > 0 ? (
            <div className="mt-3 flex items-center gap-3 border-t border-gray-100 pt-3 dark:border-dark-600">
              <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
                {t('admin.groups.batchAdjust')}
              </span>
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-gray-400">×</span>
                <input
                  value={batchFactor ?? ''}
                  type="number"
                  step="0.1"
                  min="0"
                  autoComplete="off"
                  className="hide-spinner w-20 rounded border border-gray-200 bg-white px-2 py-1 text-center text-sm transition-colors focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500/20 dark:border-dark-500 dark:bg-dark-700 dark:focus:border-primary-500"
                  placeholder="0.5"
                  onChange={(event) => {
                    const value = event.target.value
                    setBatchFactor(value === '' ? null : Number(value))
                  }}
                />
                <button
                  type="button"
                  className="btn btn-primary btn-sm shrink-0 px-2.5 py-1 text-xs"
                  disabled={!batchFactor || batchFactor <= 0}
                  onClick={applyBatchFactor}
                >
                  {t('admin.groups.applyMultiplier')}
                </button>
              </div>
              <div className="ml-auto">
                <button
                  type="button"
                  className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-sm font-medium text-red-600 transition-colors hover:bg-red-100 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400 dark:hover:bg-red-900/40"
                  onClick={clearAllLocal}
                >
                  {t('admin.groups.clearAll')}
                </button>
              </div>
            </div>
          ) : null}
        </div>

        {loading ? (
          <div className="flex justify-center py-6">
            <svg className="h-6 w-6 animate-spin text-primary-500" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
          </div>
        ) : (
          <div>
            <h4 className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">
              {t('admin.groups.rateMultipliers')} ({localEntries.length})
            </h4>

            {localEntries.length === 0 ? (
              <div className="py-6 text-center text-sm text-gray-400 dark:text-gray-500">
                {t('admin.groups.noRateMultipliers')}
              </div>
            ) : (
              <div>
                <div className="overflow-hidden rounded-lg border border-gray-200 dark:border-dark-600">
                  <div className="max-h-[420px] overflow-y-auto">
                    <table className="w-full text-sm">
                      <thead className="sticky top-0 z-[1]">
                        <tr className="border-b border-gray-200 bg-gray-50 dark:border-dark-600 dark:bg-dark-700">
                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">
                            {t('admin.groups.columns.userEmail')}
                          </th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">
                            ID
                          </th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">
                            {t('admin.groups.columns.userName')}
                          </th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">
                            {t('admin.groups.columns.userNotes')}
                          </th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">
                            {t('admin.groups.columns.userStatus')}
                          </th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">
                            {t('admin.groups.columns.rateMultiplier')}
                          </th>
                          {showFinalRate ? (
                            <th className="px-3 py-2 text-left text-xs font-medium text-primary-600 dark:text-primary-400">
                              {t('admin.groups.finalRate')}
                            </th>
                          ) : null}
                          <th className="w-10 px-2 py-2" />
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 dark:divide-dark-600">
                        {paginatedLocalEntries.map((entry) => (
                          <tr
                            key={entry.user_id}
                            className="hover:bg-gray-50 dark:hover:bg-dark-700/50"
                          >
                            <td className="px-3 py-2 text-gray-600 dark:text-gray-400">
                              {entry.user_email}
                            </td>
                            <td className="whitespace-nowrap px-3 py-2 text-gray-400 dark:text-gray-500">
                              {entry.user_id}
                            </td>
                            <td className="whitespace-nowrap px-3 py-2 text-gray-900 dark:text-white">
                              {entry.user_name || '-'}
                            </td>
                            <td
                              className="max-w-[160px] truncate px-3 py-2 text-gray-500 dark:text-gray-400"
                              title={entry.user_notes}
                            >
                              {entry.user_notes || '-'}
                            </td>
                            <td className="whitespace-nowrap px-3 py-2">
                              <span
                                className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                                  entry.user_status === 'active'
                                    ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                                    : 'bg-gray-100 text-gray-600 dark:bg-dark-600 dark:text-gray-400'
                                }`}
                              >
                                {entry.user_status}
                              </span>
                            </td>
                            <td className="whitespace-nowrap px-3 py-2">
                              <input
                                type="number"
                                step="0.001"
                                min="0.001"
                                autoComplete="off"
                                defaultValue={entry.rate_multiplier ?? ''}
                                placeholder={String(group.rate_multiplier ?? 1)}
                                className="hide-spinner w-20 rounded border border-gray-200 bg-white px-2 py-1 text-center text-sm font-medium transition-colors focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500/20 dark:border-dark-500 dark:bg-dark-700 dark:focus:border-primary-500"
                                onChange={(event) =>
                                  updateLocalRate(entry.user_id, event.target.value)
                                }
                              />
                            </td>
                            {showFinalRate ? (
                              <td className="whitespace-nowrap px-3 py-2 font-medium text-primary-600 dark:text-primary-400">
                                {computeFinalRate(entry.rate_multiplier)}
                              </td>
                            ) : null}
                            <td className="px-2 py-2">
                              <button
                                type="button"
                                className="rounded p-1 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20 dark:hover:text-red-400"
                                onClick={() => removeLocal(entry.user_id)}
                              >
                                <Icon name="trash" size="sm" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <Pagination
                  total={localEntries.length}
                  page={currentPage}
                  pageSize={pageSize}
                  onUpdatePage={setCurrentPage}
                  onUpdatePageSize={handlePageSizeChange}
                />
              </div>
            )}
          </div>
        )}

        <div className="flex items-center gap-3 border-t border-gray-200 pt-4 dark:border-dark-600">
          {isDirty ? (
            <>
              <span className="text-xs text-amber-600 dark:text-amber-400">
                {t('admin.groups.unsavedChanges')}
              </span>
              <button
                type="button"
                className="text-xs font-medium text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300"
                onClick={handleCancel}
              >
                {t('admin.groups.revertChanges')}
              </button>
            </>
          ) : null}
          <div className="ml-auto flex items-center gap-3">
            <button type="button" className="btn btn-sm px-4 py-1.5" onClick={handleClose}>
              {t('common.close')}
            </button>
            {isDirty ? (
              <button
                type="button"
                className="btn btn-primary btn-sm px-4 py-1.5"
                disabled={saving}
                onClick={() => void handleSave()}
              >
                {saving ? <Icon name="refresh" size="sm" className="mr-1 animate-spin" /> : null}
                {t('common.save')}
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </BaseDialog>
  )
}
