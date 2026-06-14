'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useI18n } from '@/lib/i18n'
import { adminUsersAPI } from '@/lib/adminUsers'
import { formatDateTime } from '@/lib/format'
import BaseDialog from '@/components/common/BaseDialog'
import Select from '@/components/common/Select'
import Icon from '@/components/icons/Icon'
import type { AdminUser, BalanceHistoryItem } from '@/lib/types'

interface UserBalanceHistoryModalProps {
  show: boolean
  user: AdminUser | null
  hideActions?: boolean
  onClose: () => void
  onDeposit?: () => void
  onWithdraw?: () => void
}

const pageSize = 15

export default function UserBalanceHistoryModal({
  show,
  user,
  hideActions = false,
  onClose,
  onDeposit,
  onWithdraw,
}: UserBalanceHistoryModalProps) {
  const { t } = useI18n()
  const [history, setHistory] = useState<BalanceHistoryItem[]>([])
  const [loading, setLoading] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [totalRecharged, setTotalRecharged] = useState(0)
  const [typeFilter, setTypeFilter] = useState('')

  const totalPages = useMemo(() => Math.ceil(total / pageSize) || 1, [total])

  const typeOptions = useMemo(
    () => [
      { value: '', label: t('admin.users.allTypes') },
      { value: 'balance', label: t('admin.users.typeBalance') },
      { value: 'affiliate_balance', label: t('admin.users.typeAffiliateBalance') },
      { value: 'admin_balance', label: t('admin.users.typeAdminBalance') },
      { value: 'concurrency', label: t('admin.users.typeConcurrency') },
      { value: 'admin_concurrency', label: t('admin.users.typeAdminConcurrency') },
      { value: 'subscription', label: t('admin.users.typeSubscription') },
    ],
    [t],
  )

  const loadHistory = useCallback(
    async (page: number, filterOverride?: string) => {
      if (!user) return
      setLoading(true)
      setCurrentPage(page)
      const filter = filterOverride ?? typeFilter
      try {
        const res = await adminUsersAPI.getUserBalanceHistory(
          typeof user.id === 'number' ? user.id : Number(user.id),
          page,
          pageSize,
          filter || undefined,
        )
        setHistory(res.items || [])
        setTotal(res.total || 0)
        setTotalRecharged(res.total_recharged || 0)
      } catch (error) {
        console.error('Failed to load balance history:', error)
      } finally {
        setLoading(false)
      }
    },
    [user, typeFilter],
  )

  useEffect(() => {
    if (show && user) {
      setTypeFilter('')
      void loadHistory(1, '')
    }
  }, [show, user, loadHistory])

  const isAdminType = (type: string) => type === 'admin_balance' || type === 'admin_concurrency'
  const isBalanceType = (type: string) =>
    type === 'balance' || type === 'admin_balance' || type === 'affiliate_balance'
  const isSubscriptionType = (type: string) => type === 'subscription'

  const getIconName = (item: BalanceHistoryItem) => {
    if (isBalanceType(item.type)) return 'dollar'
    if (isSubscriptionType(item.type)) return 'badge'
    return 'bolt'
  }

  const getIconBg = (item: BalanceHistoryItem) => {
    if (isBalanceType(item.type)) {
      return item.value >= 0
        ? 'bg-emerald-100 dark:bg-emerald-900/30'
        : 'bg-red-100 dark:bg-red-900/30'
    }
    if (isSubscriptionType(item.type)) return 'bg-purple-100 dark:bg-purple-900/30'
    return item.value >= 0
      ? 'bg-blue-100 dark:bg-blue-900/30'
      : 'bg-orange-100 dark:bg-orange-900/30'
  }

  const getIconColor = (item: BalanceHistoryItem) => {
    if (isBalanceType(item.type)) {
      return item.value >= 0
        ? 'text-emerald-600 dark:text-emerald-400'
        : 'text-red-600 dark:text-red-400'
    }
    if (isSubscriptionType(item.type)) return 'text-purple-600 dark:text-purple-400'
    return item.value >= 0
      ? 'text-blue-600 dark:text-blue-400'
      : 'text-orange-600 dark:text-orange-400'
  }

  const getValueColor = (item: BalanceHistoryItem) => {
    if (isBalanceType(item.type)) {
      return item.value >= 0
        ? 'text-emerald-600 dark:text-emerald-400'
        : 'text-red-600 dark:text-red-400'
    }
    if (isSubscriptionType(item.type)) return 'text-purple-600 dark:text-purple-400'
    return item.value >= 0
      ? 'text-blue-600 dark:text-blue-400'
      : 'text-orange-600 dark:text-orange-400'
  }

  const getItemTitle = (item: BalanceHistoryItem) => {
    switch (item.type) {
      case 'balance':
        return t('redeem.balanceAddedRedeem')
      case 'affiliate_balance':
        return t('redeem.balanceAddedAffiliate')
      case 'admin_balance':
        return item.value >= 0 ? t('redeem.balanceAddedAdmin') : t('redeem.balanceDeductedAdmin')
      case 'concurrency':
        return t('redeem.concurrencyAddedRedeem')
      case 'admin_concurrency':
        return item.value >= 0 ? t('redeem.concurrencyAddedAdmin') : t('redeem.concurrencyReducedAdmin')
      case 'subscription':
        return t('redeem.subscriptionAssigned')
      default:
        return t('common.unknown')
    }
  }

  const formatValue = (item: BalanceHistoryItem) => {
    if (isBalanceType(item.type)) {
      const sign = item.value >= 0 ? '+' : ''
      return `${sign}$${item.value.toFixed(2)}`
    }
    if (isSubscriptionType(item.type)) {
      const days = item.validity_days || Math.round(item.value)
      const groupName = item.group?.name || ''
      return groupName ? `${days}d - ${groupName}` : `${days}d`
    }
    const sign = item.value >= 0 ? '+' : ''
    return `${sign}${item.value}`
  }

  return (
    <BaseDialog
      show={show}
      title={t('admin.users.balanceHistoryTitle')}
      width="wide"
      closeOnClickOutside
      zIndex={40}
      onClose={onClose}
    >
      {user ? (
        <div className="space-y-4">
          <div className="rounded-xl bg-gray-50 p-4 dark:bg-dark-700">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-primary-100 dark:bg-primary-900/30">
                <span className="text-lg font-medium text-primary-700 dark:text-primary-300">
                  {user.email.charAt(0).toUpperCase()}
                </span>
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="truncate font-medium text-gray-900 dark:text-white">{user.email}</p>
                  {user.deleted_at ? (
                    <span className="inline-flex flex-shrink-0 items-center rounded bg-rose-100 px-1 py-px text-[10px] font-medium leading-tight text-rose-600 ring-1 ring-inset ring-rose-200 dark:bg-rose-500/20 dark:text-rose-400 dark:ring-rose-500/30">
                      {t('admin.usage.userDeletedBadge')}
                    </span>
                  ) : null}
                  {user.username ? (
                    <span className="flex-shrink-0 rounded bg-primary-50 px-1.5 py-0.5 text-xs text-primary-600 dark:bg-primary-900/20 dark:text-primary-400">
                      {user.username}
                    </span>
                  ) : null}
                </div>
                <p className="text-xs text-gray-400 dark:text-dark-500">
                  {t('admin.users.createdAt')}: {formatDateTime(user.created_at)}
                </p>
              </div>
              <div className="flex-shrink-0 text-right">
                <p className="text-xs text-gray-500 dark:text-dark-400">{t('admin.users.currentBalance')}</p>
                <p className="text-xl font-bold text-gray-900 dark:text-white">
                  ${user.balance?.toFixed(2) || '0.00'}
                </p>
              </div>
            </div>
            <div className="mt-2.5 flex items-center justify-between border-t border-gray-200/60 pt-2.5 dark:border-dark-600/60">
              <p className="min-w-0 flex-1 truncate text-xs text-gray-500 dark:text-dark-400" title={user.notes || ''}>
                {user.notes ? `${t('admin.users.notes')}: ${user.notes}` : '\u00a0'}
              </p>
              <p className="ml-4 flex-shrink-0 text-xs text-gray-500 dark:text-dark-400">
                {t('admin.users.totalRecharged')}:{' '}
                <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                  ${totalRecharged.toFixed(2)}
                </span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Select
              modelValue={typeFilter}
              options={typeOptions}
              className="w-56"
              onUpdateModelValue={(val) => {
                const next = String(val ?? '')
                setTypeFilter(next)
                void loadHistory(1, next)
              }}
            />
            {!hideActions ? (
              <>
                <button
                  type="button"
                  onClick={onDeposit}
                  className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 transition-colors hover:bg-gray-50 dark:border-dark-600 dark:bg-dark-800 dark:text-gray-300 dark:hover:bg-dark-700"
                >
                  <Icon name="plus" size="sm" className="text-emerald-500" strokeWidth={2} />
                  {t('admin.users.deposit')}
                </button>
                <button
                  type="button"
                  onClick={onWithdraw}
                  className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 transition-colors hover:bg-gray-50 dark:border-dark-600 dark:bg-dark-800 dark:text-gray-300 dark:hover:bg-dark-700"
                >
                  <svg className="h-4 w-4 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20 12H4" />
                  </svg>
                  {t('admin.users.withdraw')}
                </button>
              </>
            ) : null}
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
          ) : history.length === 0 ? (
            <div className="py-8 text-center">
              <p className="text-sm text-gray-500">{t('admin.users.noBalanceHistory')}</p>
            </div>
          ) : (
            <div className="max-h-[28rem] space-y-3 overflow-y-auto">
              {history.map((item) => (
                <div
                  key={item.id}
                  className="rounded-xl border border-gray-200 bg-white p-4 dark:border-dark-600 dark:bg-dark-800"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3">
                      <div
                        className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg ${getIconBg(item)}`}
                      >
                        <Icon name={getIconName(item)} size="sm" className={getIconColor(item)} />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-900 dark:text-white">
                          {getItemTitle(item)}
                        </p>
                        {item.notes ? (
                          <p
                            className="mt-0.5 text-xs text-gray-500 dark:text-dark-400"
                            title={item.notes}
                          >
                            {item.notes.length > 60
                              ? `${item.notes.substring(0, 55)}...`
                              : item.notes}
                          </p>
                        ) : null}
                        <p className="mt-0.5 text-xs text-gray-400 dark:text-dark-500">
                          {formatDateTime(item.used_at || item.created_at)}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className={`text-sm font-semibold ${getValueColor(item)}`}>{formatValue(item)}</p>
                      {isAdminType(item.type) ? (
                        <p className="text-xs text-gray-400 dark:text-dark-500">
                          {t('redeem.adminAdjustment')}
                        </p>
                      ) : (
                        <p className="font-mono text-xs text-gray-400 dark:text-dark-500">
                          {item.code.slice(0, 8)}...
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {totalPages > 1 ? (
            <div className="flex items-center justify-center gap-2 pt-2">
              <button
                type="button"
                disabled={currentPage <= 1}
                className="btn btn-secondary px-3 py-1 text-sm"
                onClick={() => void loadHistory(currentPage - 1)}
              >
                {t('pagination.previous')}
              </button>
              <span className="text-sm text-gray-500 dark:text-dark-400">
                {currentPage} / {totalPages}
              </span>
              <button
                type="button"
                disabled={currentPage >= totalPages}
                className="btn btn-secondary px-3 py-1 text-sm"
                onClick={() => void loadHistory(currentPage + 1)}
              >
                {t('pagination.next')}
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </BaseDialog>
  )
}
