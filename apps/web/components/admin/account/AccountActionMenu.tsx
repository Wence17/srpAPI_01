'use client'

import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useI18n } from '@/lib/i18n'
import Icon from '@/components/icons/Icon'
import type { Account } from '@/lib/types'

interface AccountActionMenuProps {
  show: boolean
  account: Account | null
  position: { top: number; left: number } | null
  onClose?: () => void
  onTest?: (account: Account) => void
  onStats?: (account: Account) => void
  onSchedule?: (account: Account) => void
  onReauth?: (account: Account) => void
  onRefreshToken?: (account: Account) => void
  onRecoverState?: (account: Account) => void
  onResetQuota?: (account: Account) => void
  onSetPrivacy?: (account: Account) => void
}

export default function AccountActionMenu({
  show,
  account,
  position,
  onClose,
  onTest,
  onStats,
  onSchedule,
  onReauth,
  onRefreshToken,
  onRecoverState,
  onResetQuota,
  onSetPrivacy,
}: AccountActionMenuProps) {
  const { t } = useI18n()
  const [mounted, setMounted] = useState(false)

  useEffect(() => setMounted(true), [])

  const isRateLimited = useMemo(() => {
    if (account?.rate_limit_reset_at && new Date(account.rate_limit_reset_at) > new Date()) {
      return true
    }
    const modelLimits = (account?.extra as Record<string, unknown> | undefined)?.model_rate_limits as
      | Record<string, { rate_limit_reset_at: string }>
      | undefined
    if (modelLimits) {
      const now = new Date()
      return Object.values(modelLimits).some((info) => new Date(info.rate_limit_reset_at) > now)
    }
    return false
  }, [account])

  const isOverloaded = useMemo(
    () => Boolean(account?.overload_until && new Date(account.overload_until) > new Date()),
    [account],
  )

  const isTempUnschedulable = useMemo(
    () =>
      Boolean(account?.temp_unschedulable_until && new Date(account.temp_unschedulable_until) > new Date()),
    [account],
  )

  const hasRecoverableState = useMemo(
    () =>
      account?.status === 'error' ||
      isRateLimited ||
      isOverloaded ||
      isTempUnschedulable,
    [account?.status, isRateLimited, isOverloaded, isTempUnschedulable],
  )

  const supportsPrivacy = useMemo(
    () =>
      (account?.platform === 'antigravity' && account?.type === 'oauth') ||
      (account?.platform === 'openai' && account?.type === 'oauth'),
    [account?.platform, account?.type],
  )

  const hasQuotaLimit = useMemo(
    () =>
      (account?.type === 'apikey' || account?.type === 'bedrock') &&
      ((account?.quota_limit ?? 0) > 0 ||
        (account?.quota_daily_limit ?? 0) > 0 ||
        (account?.quota_weekly_limit ?? 0) > 0),
    [account],
  )

  useEffect(() => {
    const handleKeydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose?.()
    }

    if (show) {
      window.addEventListener('keydown', handleKeydown)
      return () => window.removeEventListener('keydown', handleKeydown)
    }
    return undefined
  }, [show, onClose])

  const handleAction = (action?: (account: Account) => void) => {
    if (!account) return
    action?.(account)
    onClose?.()
  }

  if (!mounted || !show || !position) return null

  return createPortal(
    <>
      <div className="fixed inset-0 z-[9998]" onClick={onClose} aria-hidden="true" />
      <div
        className="action-menu-content fixed z-[9999] w-52 overflow-hidden rounded-xl bg-white shadow-lg ring-1 ring-black/5 dark:bg-dark-800"
        style={{ top: `${position.top}px`, left: `${position.left}px` }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="py-1">
          {account ? (
            <>
              <button
                type="button"
                onClick={() => handleAction(onTest)}
                className="flex w-full items-center gap-2 px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-dark-700"
              >
                <Icon name="play" size="sm" className="text-green-500" strokeWidth={2} />
                {t('admin.accounts.testConnection')}
              </button>
              <button
                type="button"
                onClick={() => handleAction(onStats)}
                className="flex w-full items-center gap-2 px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-dark-700"
              >
                <Icon name="chart" size="sm" className="text-indigo-500" />
                {t('admin.accounts.viewStats')}
              </button>
              <button
                type="button"
                onClick={() => handleAction(onSchedule)}
                className="flex w-full items-center gap-2 px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-dark-700"
              >
                <Icon name="clock" size="sm" className="text-orange-500" />
                {t('admin.scheduledTests.schedule')}
              </button>
              {account.type === 'oauth' || account.type === 'setup-token' ? (
                <>
                  <button
                    type="button"
                    onClick={() => handleAction(onReauth)}
                    className="flex w-full items-center gap-2 px-4 py-2 text-sm text-blue-600 hover:bg-gray-100 dark:hover:bg-dark-700"
                  >
                    <Icon name="link" size="sm" />
                    {t('admin.accounts.reAuthorize')}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleAction(onRefreshToken)}
                    className="flex w-full items-center gap-2 px-4 py-2 text-sm text-purple-600 hover:bg-gray-100 dark:hover:bg-dark-700"
                  >
                    <Icon name="refresh" size="sm" />
                    {t('admin.accounts.refreshToken')}
                  </button>
                </>
              ) : null}
              {supportsPrivacy ? (
                <button
                  type="button"
                  onClick={() => handleAction(onSetPrivacy)}
                  className="flex w-full items-center gap-2 px-4 py-2 text-sm text-emerald-600 hover:bg-gray-100 dark:hover:bg-dark-700"
                >
                  <Icon name="shield" size="sm" />
                  {t('admin.accounts.setPrivacy')}
                </button>
              ) : null}
              {hasRecoverableState ? (
                <div className="my-1 border-t border-gray-100 dark:border-dark-700" />
              ) : null}
              {hasRecoverableState ? (
                <button
                  type="button"
                  onClick={() => handleAction(onRecoverState)}
                  className="flex w-full items-center gap-2 px-4 py-2 text-sm text-emerald-600 hover:bg-gray-100 dark:hover:bg-dark-700"
                >
                  <Icon name="sync" size="sm" />
                  {t('admin.accounts.recoverState')}
                </button>
              ) : null}
              {hasQuotaLimit ? (
                <button
                  type="button"
                  onClick={() => handleAction(onResetQuota)}
                  className="flex w-full items-center gap-2 px-4 py-2 text-sm text-teal-600 hover:bg-gray-100 dark:hover:bg-dark-700"
                >
                  <Icon name="refresh" size="sm" />
                  {t('admin.accounts.resetQuota')}
                </button>
              ) : null}
            </>
          ) : null}
        </div>
      </div>
    </>,
    document.body,
  )
}
