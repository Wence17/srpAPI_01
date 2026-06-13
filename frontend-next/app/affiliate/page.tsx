'use client'

import { useEffect, useMemo, useState } from 'react'
import { useI18n } from '@/lib/i18n'
import { useApp } from '@/context/AppContext'
import { useAuth } from '@/context/AuthContext'
import AppLayout from '@/components/layout/AppLayout'
import Icon from '@/components/icons/Icon'
import { userAPI } from '@/lib/user'
import type { UserAffiliateDetail } from '@/lib/user'
import { useClipboard } from '@/lib/useClipboard'
import { formatCurrency, formatDateTime } from '@/lib/format'
import { extractApiErrorMessage } from '@/lib/apiError'

export default function AffiliatePage() {
  const { t } = useI18n()
  const appStore = useApp()
  const authStore = useAuth()
  const { copyToClipboard } = useClipboard()

  const [loading, setLoading] = useState(true)
  const [transferring, setTransferring] = useState(false)
  const [detail, setDetail] = useState<UserAffiliateDetail | null>(null)

  const inviteLink = useMemo(() => {
    if (!detail) return ''
    if (typeof window === 'undefined') {
      return `/register?aff=${encodeURIComponent(detail.aff_code)}`
    }
    return `${window.location.origin}/register?aff=${encodeURIComponent(detail.aff_code)}`
  }, [detail])

  const formattedRebateRate = useMemo(() => {
    const v = detail?.effective_rebate_rate_percent ?? 0
    const rounded = Math.round(v * 100) / 100
    return Number.isInteger(rounded) ? String(rounded) : rounded.toString()
  }, [detail?.effective_rebate_rate_percent])

  function formatCount(value: number): string {
    return value.toLocaleString()
  }

  async function loadAffiliateDetail(silent = false): Promise<void> {
    if (!silent) {
      setLoading(true)
    }
    try {
      const data = await userAPI.getAffiliateDetail()
      setDetail(data)
    } catch (error) {
      appStore.showError(extractApiErrorMessage(error, t('affiliate.loadFailed')))
    } finally {
      if (!silent) {
        setLoading(false)
      }
    }
  }

  async function copyCode(): Promise<void> {
    if (!detail?.aff_code) return
    await copyToClipboard(detail.aff_code, t('affiliate.codeCopied'))
  }

  async function copyInviteLink(): Promise<void> {
    if (!inviteLink) return
    await copyToClipboard(inviteLink, t('affiliate.linkCopied'))
  }

  async function transferQuota(): Promise<void> {
    if (!detail || detail.aff_quota <= 0 || transferring) return
    setTransferring(true)
    try {
      const resp = await userAPI.transferAffiliateQuota()
      appStore.showSuccess(
        t('affiliate.transfer.success', { amount: formatCurrency(resp.transferred_quota) }),
      )
      await Promise.all([
        loadAffiliateDetail(true),
        authStore.refreshUser().catch(() => undefined),
      ])
    } catch (error) {
      appStore.showError(extractApiErrorMessage(error, t('affiliate.transferFailed')))
    } finally {
      setTransferring(false)
    }
  }

  useEffect(() => {
    void loadAffiliateDetail()
  }, [])

  return (
    <AppLayout>
      <div className="space-y-6">
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary-500 border-t-transparent" />
          </div>
        ) : detail ? (
          <>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="card p-5">
                <p className="flex items-center gap-1.5 text-sm text-gray-500 dark:text-dark-400">
                  <Icon name="dollar" size="sm" className="text-primary-500" />
                  {t('affiliate.stats.rebateRate')}
                </p>
                <p className="mt-2 text-2xl font-semibold text-primary-600 dark:text-primary-400">
                  {formattedRebateRate}
                  <span className="ml-0.5 text-base font-medium">%</span>
                </p>
                <p className="mt-1 text-xs text-gray-400 dark:text-dark-500">
                  {t('affiliate.stats.rebateRateHint')}
                </p>
              </div>
              <div className="card p-5">
                <p className="text-sm text-gray-500 dark:text-dark-400">{t('affiliate.stats.invitedUsers')}</p>
                <p className="mt-2 text-2xl font-semibold text-gray-900 dark:text-white">
                  {formatCount(detail.aff_count)}
                </p>
              </div>
              <div className="card p-5">
                <p className="text-sm text-gray-500 dark:text-dark-400">{t('affiliate.stats.availableQuota')}</p>
                <p className="mt-2 text-2xl font-semibold text-emerald-600 dark:text-emerald-400">
                  {formatCurrency(detail.aff_quota)}
                </p>
              </div>
              <div className="card p-5">
                <p className="text-sm text-gray-500 dark:text-dark-400">{t('affiliate.stats.totalQuota')}</p>
                <p className="mt-2 text-2xl font-semibold text-gray-900 dark:text-white">
                  {formatCurrency(detail.aff_history_quota)}
                </p>
                {detail.aff_frozen_quota > 0 ? (
                  <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
                    {t('affiliate.stats.frozenQuota')}: {formatCurrency(detail.aff_frozen_quota)}
                  </p>
                ) : null}
              </div>
            </div>

            <div className="card p-6">
              <h3 className="text-base font-semibold text-gray-900 dark:text-white">{t('affiliate.title')}</h3>
              <p className="mt-1 text-sm text-gray-500 dark:text-dark-400">{t('affiliate.description')}</p>

              <div className="mt-5 grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-300">{t('affiliate.yourCode')}</p>
                  <div className="flex items-center gap-2 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 dark:border-dark-700 dark:bg-dark-900">
                    <code className="flex-1 truncate text-sm font-semibold text-gray-900 dark:text-white">
                      {detail.aff_code}
                    </code>
                    <button type="button" className="btn btn-secondary btn-sm" onClick={copyCode}>
                      <Icon name="copy" size="sm" />
                      <span>{t('affiliate.copyCode')}</span>
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-300">{t('affiliate.inviteLink')}</p>
                  <div className="flex items-center gap-2 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 dark:border-dark-700 dark:bg-dark-900">
                    <code className="flex-1 truncate text-sm text-gray-700 dark:text-gray-300">{inviteLink}</code>
                    <button type="button" className="btn btn-secondary btn-sm" onClick={copyInviteLink}>
                      <Icon name="copy" size="sm" />
                      <span>{t('affiliate.copyLink')}</span>
                    </button>
                  </div>
                </div>
              </div>

              <div className="mt-5 rounded-xl border border-primary-200 bg-primary-50 p-4 dark:border-primary-900/40 dark:bg-primary-900/20">
                <p className="text-sm font-medium text-primary-800 dark:text-primary-200">
                  {t('affiliate.tips.title')}
                </p>
                <ul className="mt-2 space-y-1 text-sm text-primary-700 dark:text-primary-300">
                  <li>1. {t('affiliate.tips.line1')}</li>
                  <li>2. {t('affiliate.tips.line2', { rate: `${formattedRebateRate}%` })}</li>
                  <li>3. {t('affiliate.tips.line3')}</li>
                  {detail.aff_frozen_quota > 0 ? <li>4. {t('affiliate.tips.line4')}</li> : null}
                </ul>
              </div>
            </div>

            <div className="card p-6">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 className="text-base font-semibold text-gray-900 dark:text-white">
                    {t('affiliate.transfer.title')}
                  </h3>
                  <p className="mt-1 text-sm text-gray-500 dark:text-dark-400">
                    {t('affiliate.transfer.description')}
                  </p>
                </div>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={transferring || detail.aff_quota <= 0}
                  onClick={transferQuota}
                >
                  {transferring ? (
                    <Icon name="refresh" size="sm" className="animate-spin" />
                  ) : (
                    <Icon name="dollar" size="sm" />
                  )}
                  <span>
                    {transferring ? t('affiliate.transfer.transferring') : t('affiliate.transfer.button')}
                  </span>
                </button>
              </div>
              {detail.aff_quota <= 0 ? (
                <p className="mt-3 text-sm text-amber-600 dark:text-amber-400">
                  {t('affiliate.transfer.empty')}
                </p>
              ) : null}
            </div>

            <div className="card p-6">
              <h3 className="text-base font-semibold text-gray-900 dark:text-white">
                {t('affiliate.invitees.title')}
              </h3>
              {detail.invitees.length === 0 ? (
                <div className="mt-4 rounded-xl border border-dashed border-gray-300 p-6 text-center text-sm text-gray-500 dark:border-dark-700 dark:text-dark-400">
                  {t('affiliate.invitees.empty')}
                </div>
              ) : (
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full min-w-[560px] text-left text-sm">
                    <thead>
                      <tr className="border-b border-gray-200 text-gray-500 dark:border-dark-700 dark:text-dark-400">
                        <th className="px-3 py-2 font-medium">{t('affiliate.invitees.columns.email')}</th>
                        <th className="px-3 py-2 font-medium">{t('affiliate.invitees.columns.username')}</th>
                        <th className="px-3 py-2 text-right font-medium">
                          {t('affiliate.invitees.columns.rebate')}
                        </th>
                        <th className="px-3 py-2 font-medium">{t('affiliate.invitees.columns.joinedAt')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.invitees.map((item) => (
                        <tr
                          key={item.user_id}
                          className="border-b border-gray-100 last:border-b-0 dark:border-dark-800"
                        >
                          <td className="px-3 py-3 text-gray-900 dark:text-white">{item.email || '-'}</td>
                          <td className="px-3 py-3 text-gray-700 dark:text-gray-300">{item.username || '-'}</td>
                          <td className="px-3 py-3 text-right font-medium text-emerald-600 dark:text-emerald-400">
                            {formatCurrency(item.total_rebate)}
                          </td>
                          <td className="px-3 py-3 text-gray-700 dark:text-gray-300">
                            {formatDateTime(item.created_at) || '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        ) : null}
      </div>
    </AppLayout>
  )
}
