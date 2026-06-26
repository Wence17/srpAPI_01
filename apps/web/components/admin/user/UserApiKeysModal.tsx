'use client'

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { createPortal } from 'react-dom'
import { useI18n } from '@/lib/i18n'
import { useApp } from '@/context/AppContext'
import { adminUsersAPI } from '@/lib/adminUsers'
import { adminGroupsAPI } from '@/lib/adminGroups'
import { adminApiKeysAPI } from '@/lib/adminApiKeys'
import { formatDateTime } from '@/lib/format'
import { extractApiErrorMessage } from '@/lib/apiError'
import BaseDialog from '@/components/common/BaseDialog'
import GroupBadge from '@/components/keys/GroupBadge'
import GroupOptionItem from '@/components/keys/GroupOptionItem'
import type { AdminUser, ApiKey } from '@/lib/types'
import type { AdminGroup } from '@/lib/adminGroups'

interface UserApiKeysModalProps {
  show: boolean
  user: AdminUser | null
  onClose: () => void
}

const DROPDOWN_HEIGHT = 272
const DROPDOWN_GAP = 4

export default function UserApiKeysModal({ show, user, onClose }: UserApiKeysModalProps) {
  const { t } = useI18n()
  const appStore = useApp()
  const [mounted, setMounted] = useState(false)
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([])
  const [allGroups, setAllGroups] = useState<AdminGroup[]>([])
  const [loading, setLoading] = useState(false)
  const [updatingKeyIds, setUpdatingKeyIds] = useState<Set<number>>(new Set())
  const [groupSelectorKeyId, setGroupSelectorKeyId] = useState<number | null>(null)
  const [dropdownPosition, setDropdownPosition] = useState<{ top: number; left: number } | null>(null)
  const dropdownRef = useRef<HTMLDivElement | null>(null)
  const groupButtonRefs = useRef<Map<number, HTMLElement>>(new Map())

  const selectedKeyForGroup = useMemo(
    () => (groupSelectorKeyId === null ? null : apiKeys.find((k) => k.id === groupSelectorKeyId) || null),
    [apiKeys, groupSelectorKeyId],
  )

  useEffect(() => setMounted(true), [])

  const closeGroupSelector = useCallback(() => {
    setGroupSelectorKeyId(null)
    setDropdownPosition(null)
  }, [])

  const load = useCallback(async () => {
    if (!user) return
    setLoading(true)
    groupButtonRefs.current.clear()
    try {
      const res = await adminUsersAPI.getUserApiKeys(
        typeof user.id === 'number' ? user.id : Number(user.id),
      )
      setApiKeys(res.items || [])
    } catch (error) {
      console.error('Failed to load API keys:', error)
    } finally {
      setLoading(false)
    }
  }, [user])

  const loadGroups = useCallback(async () => {
    try {
      const groups = await adminGroupsAPI.getAll()
      setAllGroups(groups)
    } catch (error) {
      console.error('Failed to load groups:', error)
    }
  }, [])

  useEffect(() => {
    if (show && user) {
      void load()
      void loadGroups()
    } else {
      closeGroupSelector()
    }
  }, [show, user, load, loadGroups, closeGroupSelector])

  const openGroupSelector = (key: ApiKey) => {
    if (groupSelectorKeyId === key.id) {
      closeGroupSelector()
    } else {
      const buttonEl = groupButtonRefs.current.get(key.id)
      if (buttonEl) {
        const rect = buttonEl.getBoundingClientRect()
        const spaceBelow = window.innerHeight - rect.bottom
        const openUpward = spaceBelow < DROPDOWN_HEIGHT && rect.top > spaceBelow
        setDropdownPosition({
          top: openUpward ? rect.top - DROPDOWN_HEIGHT - DROPDOWN_GAP : rect.bottom + DROPDOWN_GAP,
          left: rect.left,
        })
      }
      setGroupSelectorKeyId(key.id)
    }
  }

  const changeGroup = async (key: ApiKey, newGroupId: number | null) => {
    closeGroupSelector()
    if (key.group_id === newGroupId || (!key.group_id && newGroupId === null)) return

    setUpdatingKeyIds((prev) => new Set(prev).add(key.id))
    try {
      const result = await adminApiKeysAPI.updateApiKeyGroup(key.id, newGroupId)
      setApiKeys((prev) => {
        const idx = prev.findIndex((k) => k.id === key.id)
        if (idx === -1) return prev
        const next = [...prev]
        next[idx] = result.api_key
        return next
      })
      if (result.auto_granted_group_access && result.granted_group_name) {
        appStore.showSuccess(
          t('admin.users.groupChangedWithGrant', { group: result.granted_group_name }),
        )
      } else {
        appStore.showSuccess(t('admin.users.groupChangedSuccess'))
      }
    } catch (error) {
      appStore.showError(extractApiErrorMessage(error) || t('admin.users.groupChangeFailed'))
    } finally {
      setUpdatingKeyIds((prev) => {
        const next = new Set(prev)
        next.delete(key.id)
        return next
      })
    }
  }

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && groupSelectorKeyId !== null) {
        event.stopPropagation()
        closeGroupSelector()
      }
    }
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement
      if (dropdownRef.current && !dropdownRef.current.contains(target)) {
        for (const el of groupButtonRefs.current.values()) {
          if (el.contains(target)) return
        }
        closeGroupSelector()
      }
    }
    document.addEventListener('click', handleClickOutside)
    document.addEventListener('keydown', handleKeyDown, true)
    return () => {
      document.removeEventListener('click', handleClickOutside)
      document.removeEventListener('keydown', handleKeyDown, true)
    }
  }, [groupSelectorKeyId, closeGroupSelector])

  const handleClose = () => {
    closeGroupSelector()
    onClose()
  }

  return (
    <>
      <BaseDialog show={show} title={t('admin.users.userApiKeys')} width="wide" onClose={handleClose}>
        {user ? (
          <div className="space-y-4">
            <div className="flex items-center gap-3 rounded-xl bg-gray-50 p-4 dark:bg-dark-700">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary-100 dark:bg-primary-900/30">
                <span className="text-lg font-medium text-primary-700 dark:text-primary-300">
                  {user.email.charAt(0).toUpperCase()}
                </span>
              </div>
              <div>
                <p className="font-medium text-gray-900 dark:text-white">{user.email}</p>
                <p className="text-sm text-gray-500 dark:text-dark-400">{user.username}</p>
              </div>
            </div>
            {loading ? (
              <div className="flex justify-center py-8">
                <svg className="h-8 w-8 animate-spin text-primary-500" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
              </div>
            ) : apiKeys.length === 0 ? (
              <div className="py-8 text-center">
                <p className="text-sm text-gray-500">{t('admin.users.noApiKeys')}</p>
              </div>
            ) : (
              <div className="max-h-96 space-y-3 overflow-y-auto" onScroll={closeGroupSelector}>
                {apiKeys.map((key) => (
                  <div
                    key={key.id}
                    className="rounded-xl border border-gray-200 bg-white p-4 dark:border-dark-600 dark:bg-dark-800"
                  >
                    <div className="flex items-start justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="mb-1 flex items-center gap-2">
                          <span className="font-medium text-gray-900 dark:text-white">{key.name}</span>
                          <span
                            className={`badge text-xs ${key.status === 'active' ? 'badge-success' : 'badge-danger'}`}
                          >
                            {key.status}
                          </span>
                        </div>
                        <p className="truncate font-mono text-sm text-gray-500">
                          {key.key.substring(0, 20)}...{key.key.substring(key.key.length - 8)}
                        </p>
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-4 text-xs text-gray-500">
                      <div className="flex items-center gap-1">
                        <span>{t('admin.users.group')}:</span>
                        <button
                          ref={(el) => {
                            if (el) groupButtonRefs.current.set(key.id, el)
                            else groupButtonRefs.current.delete(key.id)
                          }}
                          type="button"
                          onClick={() => openGroupSelector(key)}
                          className="-mx-1 -my-0.5 flex cursor-pointer items-center gap-1 rounded-md px-1 py-0.5 transition-colors hover:bg-gray-100 dark:hover:bg-dark-700"
                          disabled={updatingKeyIds.has(key.id)}
                        >
                          {key.group_id && key.group ? (
                            <GroupBadge
                              name={key.group.name}
                              platform={key.group.platform}
                              subscriptionType={key.group.subscription_type}
                              rateMultiplier={key.group.rate_multiplier}
                            />
                          ) : (
                            <span className="italic text-gray-400">{t('admin.users.none')}</span>
                          )}
                          {updatingKeyIds.has(key.id) ? (
                            <svg className="h-3 w-3 animate-spin text-primary-500" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                              <path
                                className="opacity-75"
                                fill="currentColor"
                                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                              />
                            </svg>
                          ) : (
                            <svg className="h-3 w-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 15L12 18.75 15.75 15m-7.5-6L12 5.25 15.75 9" />
                            </svg>
                          )}
                        </button>
                      </div>
                      <div className="flex items-center gap-1">
                        <span>
                          {t('admin.users.columns.created')}: {formatDateTime(key.created_at)}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : null}
      </BaseDialog>

      {mounted && groupSelectorKeyId !== null && dropdownPosition
        ? createPortal(
            <div
              ref={dropdownRef}
              className="animate-in fade-in slide-in-from-top-2 fixed z-[100000020] w-64 overflow-hidden rounded-xl bg-white shadow-lg ring-1 ring-black/5 duration-200 dark:bg-dark-800 dark:ring-white/10"
              style={{ top: dropdownPosition.top, left: dropdownPosition.left }}
            >
              <div className="max-h-64 overflow-y-auto p-1.5">
                <button
                  type="button"
                  onClick={() => selectedKeyForGroup && changeGroup(selectedKeyForGroup, null)}
                  className={`flex w-full items-center rounded-lg px-3 py-2 text-sm transition-colors ${
                    !selectedKeyForGroup?.group_id
                      ? 'bg-primary-50 dark:bg-primary-900/20'
                      : 'hover:bg-gray-100 dark:hover:bg-dark-700'
                  }`}
                >
                  <span className="italic text-gray-500">{t('admin.users.none')}</span>
                  {!selectedKeyForGroup?.group_id ? (
                    <svg
                      className="ml-auto h-4 w-4 shrink-0 text-primary-600 dark:text-primary-400"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                      strokeWidth="2"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  ) : null}
                </button>
                {allGroups.map((group) => (
                  <button
                    key={group.id}
                    type="button"
                    onClick={() => selectedKeyForGroup && changeGroup(selectedKeyForGroup, group.id)}
                    className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm transition-colors ${
                      selectedKeyForGroup?.group_id === group.id
                        ? 'bg-primary-50 dark:bg-primary-900/20'
                        : 'hover:bg-gray-100 dark:hover:bg-dark-700'
                    }`}
                  >
                    <GroupOptionItem
                      name={group.name}
                      platform={group.platform}
                      subscriptionType={group.subscription_type}
                      rateMultiplier={group.rate_multiplier}
                      description={group.description}
                      selected={selectedKeyForGroup?.group_id === group.id}
                    />
                  </button>
                ))}
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  )
}
