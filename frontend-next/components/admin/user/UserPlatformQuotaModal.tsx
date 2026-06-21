'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useI18n } from '@/lib/i18n'
import { useApp } from '@/context/AppContext'
import { adminUsersAPI } from '@/lib/adminUsers'
import { extractApiErrorMessage } from '@/lib/apiError'
import BaseDialog from '@/components/common/BaseDialog'
import type {
  AdminUser,
  PlatformQuotaItem,
  PlatformQuotaPlatform,
  PlatformQuotaWindow,
} from '@/lib/types'

const PLATFORMS: PlatformQuotaPlatform[] = ['anthropic', 'openai', 'gemini', 'antigravity']

interface QuotaRow {
  platform: PlatformQuotaPlatform
  daily_limit_usd: number | null
  weekly_limit_usd: number | null
  monthly_limit_usd: number | null
  daily_usage_usd: number
  weekly_usage_usd: number
  monthly_usage_usd: number
}

interface UserPlatformQuotaModalProps {
  show: boolean
  user: AdminUser | null
  onClose: () => void
  onSuccess: () => void
}

function emptyRow(p: PlatformQuotaPlatform): QuotaRow {
  return {
    platform: p,
    daily_limit_usd: null,
    weekly_limit_usd: null,
    monthly_limit_usd: null,
    daily_usage_usd: 0,
    weekly_usage_usd: 0,
    monthly_usage_usd: 0,
  }
}

function normalize(items: PlatformQuotaItem[]): QuotaRow[] {
  const byPlatform = new Map<PlatformQuotaPlatform, PlatformQuotaItem>()
  for (const it of items) byPlatform.set(it.platform as PlatformQuotaPlatform, it)
  return PLATFORMS.map((p) => {
    const it = byPlatform.get(p)
    if (!it) return emptyRow(p)
    return {
      platform: p,
      daily_limit_usd: it.daily_limit_usd ?? null,
      weekly_limit_usd: it.weekly_limit_usd ?? null,
      monthly_limit_usd: it.monthly_limit_usd ?? null,
      daily_usage_usd: it.daily_usage_usd ?? 0,
      weekly_usage_usd: it.weekly_usage_usd ?? 0,
      monthly_usage_usd: it.monthly_usage_usd ?? 0,
    }
  })
}

function formatUsage(n: number): string {
  if (n == null || Number.isNaN(n)) return '-'
  return n.toFixed(2)
}

function normalizeLimit(v: number | null | undefined): number | null {
  if (v === null || v === undefined) return null
  if (typeof v === 'number' && Number.isFinite(v) && v >= 0) return v
  return null
}

export default function UserPlatformQuotaModal({
  show,
  user,
  onClose,
  onSuccess,
}: UserPlatformQuotaModalProps) {
  const { t } = useI18n()
  const appStore = useApp()
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [resetting, setResetting] = useState<Record<string, boolean>>({})
  const [quotas, setQuotas] = useState<QuotaRow[]>([])

  const hasActiveSubscription = useMemo(
    () => user?.subscriptions?.some((s) => s.status === 'active') ?? false,
    [user],
  )

  const load = useCallback(async () => {
    if (!user) return
    setLoading(true)
    try {
      const data = await adminUsersAPI.getPlatformQuotas(
        typeof user.id === 'number' ? user.id : Number(user.id),
      )
      setQuotas(normalize(data.platform_quotas || []))
    } catch {
      appStore.showError(t('admin.users.platformQuota.loadFailed'))
      setQuotas(PLATFORMS.map(emptyRow))
    } finally {
      setLoading(false)
    }
  }, [user, appStore, t])

  useEffect(() => {
    if (show && user) void load()
  }, [show, user, load])

  const updateQuotaField = (
    platform: PlatformQuotaPlatform,
    field: 'daily_limit_usd' | 'weekly_limit_usd' | 'monthly_limit_usd',
    value: string,
  ) => {
    setQuotas((prev) =>
      prev.map((row) => {
        if (row.platform !== platform) return row
        if (value === '') return { ...row, [field]: null }
        const num = Number(value)
        return { ...row, [field]: Number.isNaN(num) ? Number.NaN : num }
      }),
    )
  }

  const onClearAll = () => {
    const confirmed = window.confirm(t('admin.users.platformQuota.clearAllConfirm'))
    if (!confirmed) return
    setQuotas((prev) =>
      prev.map((row) => ({
        ...row,
        daily_limit_usd: null,
        weekly_limit_usd: null,
        monthly_limit_usd: null,
      })),
    )
  }

  const onSave = async () => {
    if (!user) return
    const invalid: string[] = []
    for (const row of quotas) {
      for (const win of ['daily', 'weekly', 'monthly'] as const) {
        const v = row[`${win}_limit_usd`]
        if (typeof v === 'number' && Number.isNaN(v)) {
          invalid.push(`${row.platform}.${win}`)
        }
      }
    }
    if (invalid.length > 0) {
      appStore.showError(t('admin.users.platformQuota.invalidNumber', { fields: invalid.join(', ') }))
      return
    }

    setSubmitting(true)
    try {
      const payload = quotas.map((r) => ({
        platform: r.platform,
        daily_limit_usd: normalizeLimit(r.daily_limit_usd),
        weekly_limit_usd: normalizeLimit(r.weekly_limit_usd),
        monthly_limit_usd: normalizeLimit(r.monthly_limit_usd),
      }))
      await adminUsersAPI.updatePlatformQuotas(
        typeof user.id === 'number' ? user.id : Number(user.id),
        payload,
      )
      appStore.showSuccess(t('admin.users.platformQuota.updateSuccess'))
      onSuccess()
      onClose()
    } catch (error) {
      appStore.showError(extractApiErrorMessage(error) || t('admin.users.platformQuota.updateFailed'))
    } finally {
      setSubmitting(false)
    }
  }

  const onReset = async (platform: PlatformQuotaPlatform, quotaWindow: PlatformQuotaWindow) => {
    if (!user) return
    const windowLabel = t(
      `admin.users.platformQuota.window${quotaWindow.charAt(0).toUpperCase() + quotaWindow.slice(1)}`,
    )
    const confirmed = window.confirm(
      t('admin.users.platformQuota.reset.confirm', { platform, window: windowLabel }),
    )
    if (!confirmed) return
    const key = `${platform}.${quotaWindow}`
    setResetting((prev) => ({ ...prev, [key]: true }))
    try {
      const data = await adminUsersAPI.resetPlatformQuotaWindow(
        typeof user.id === 'number' ? user.id : Number(user.id),
        platform,
        quotaWindow,
      )
      setQuotas(normalize(data.platform_quotas || []))
      appStore.showSuccess(
        t('admin.users.platformQuota.reset.success', { platform, window: windowLabel }),
      )
    } catch (error) {
      appStore.showError(extractApiErrorMessage(error) || t('admin.users.platformQuota.reset.failed'))
    } finally {
      setResetting((prev) => ({ ...prev, [key]: false }))
    }
  }

  return (
    <BaseDialog
      show={show}
      title={t('admin.users.platformQuota.title')}
      width="wide"
      onClose={onClose}
      footer={
        <div className="flex justify-end gap-3">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            {t('admin.users.platformQuota.cancel')}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={submitting || loading}
            onClick={onSave}
          >
            {submitting ? t('admin.users.platformQuota.saving') : t('admin.users.platformQuota.save')}
          </button>
        </div>
      }
    >
      {user ? (
        <div className="space-y-4">
          {hasActiveSubscription ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
              {t('admin.users.platformQuota.subscriptionWarning')}
            </div>
          ) : null}
          <p className="text-sm text-gray-600 dark:text-gray-400">
            {t('admin.users.platformQuota.subtitle', { email: user.email })}
          </p>
          {loading ? (
            <div className="py-10 text-center text-gray-500">{t('common.loading')}</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-gray-700 dark:border-dark-700 dark:text-gray-300">
                    <th className="px-3 py-2 text-left font-medium">
                      {t('admin.users.platformQuota.columns.platform')}
                    </th>
                    <th className="px-3 py-2 text-left font-medium">
                      {t('admin.users.platformQuota.columns.daily')}
                    </th>
                    <th className="px-3 py-2 text-left font-medium">
                      {t('admin.users.platformQuota.columns.weekly')}
                    </th>
                    <th className="px-3 py-2 text-left font-medium">
                      {t('admin.users.platformQuota.columns.monthly')}
                    </th>
                    <th className="px-3 py-2 text-left font-medium">
                      {t('admin.users.platformQuota.columns.usage')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {quotas.map((row) => (
                    <tr key={row.platform} className="border-b border-gray-100 dark:border-dark-800">
                      <td className="px-3 py-2 font-mono text-gray-900 dark:text-white">{row.platform}</td>
                      {(['daily', 'weekly', 'monthly'] as const).map((win) => (
                        <td key={win} className="px-3 py-2">
                          <div className="flex items-center gap-1">
                            <input
                              value={
                                row[`${win}_limit_usd`] === null ||
                                row[`${win}_limit_usd`] === undefined
                                  ? ''
                                  : String(row[`${win}_limit_usd`])
                              }
                              onChange={(e) =>
                                updateQuotaField(row.platform, `${win}_limit_usd`, e.target.value)
                              }
                              type="number"
                              min={0}
                              step="0.01"
                              className="input w-24"
                              placeholder={t('admin.users.platformQuota.placeholder')}
                            />
                            <button
                              type="button"
                              className="text-xs text-gray-400 hover:text-amber-500 disabled:opacity-50"
                              disabled={!!resetting[`${row.platform}.${win}`]}
                              title={t('admin.users.platformQuota.reset.button')}
                              onClick={() => onReset(row.platform, win)}
                            >
                              ↻
                            </button>
                          </div>
                        </td>
                      ))}
                      <td className="px-3 py-2 text-xs text-gray-500 dark:text-gray-400">
                        {formatUsage(row.daily_usage_usd)} / {formatUsage(row.weekly_usage_usd)} /{' '}
                        {formatUsage(row.monthly_usage_usd)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-3 text-xs text-gray-500">{t('admin.users.platformQuota.hint')}</p>
              <div className="mt-3">
                <button type="button" className="btn btn-secondary text-sm" onClick={onClearAll}>
                  {t('admin.users.platformQuota.clearAll')}
                </button>
              </div>
            </div>
          )}
        </div>
      ) : null}
    </BaseDialog>
  )
}
