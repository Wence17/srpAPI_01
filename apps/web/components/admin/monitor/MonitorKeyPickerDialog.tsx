'use client'

import { useEffect, useMemo, useState } from 'react'
import { useI18n } from '@/lib/i18n'
import type { Provider } from '@/lib/adminChannelMonitor'
import type { ApiKey } from '@/lib/types'
import { maskApiKey } from '@/lib/maskApiKey'
import BaseDialog from '@/components/common/BaseDialog'
import GroupBadge from '@/components/keys/GroupBadge'

interface MonitorKeyPickerDialogProps {
  show: boolean
  loading: boolean
  keys: ApiKey[]
  provider: Provider
  userGroupRates?: Record<number, number>
  onClose: () => void
  onPick: (key: ApiKey) => void
}

export default function MonitorKeyPickerDialog({
  show,
  loading,
  keys,
  provider,
  userGroupRates = {},
  onClose,
  onPick,
}: MonitorKeyPickerDialogProps) {
  const { t } = useI18n()
  const [search, setSearch] = useState('')

  useEffect(() => {
    if (!show) setSearch('')
  }, [show])

  const filteredKeys = useMemo(() => {
    const q = search.trim().toLowerCase()
    return keys.filter((key) => {
      if (key.group?.platform !== provider) return false
      if (!q) return true
      return (
        key.name.toLowerCase().includes(q) ||
        key.key.toLowerCase().includes(q) ||
        (key.group?.name || '').toLowerCase().includes(q)
      )
    })
  }, [keys, provider, search])

  return (
    <BaseDialog
      show={show}
      title={t('admin.channelMonitor.form.selectKeyTitle')}
      width="wide"
      onClose={onClose}
      footer={
        <div className="flex justify-end">
          <button type="button" onClick={onClose} className="btn btn-secondary">
            {t('common.cancel')}
          </button>
        </div>
      }
    >
      <div className="space-y-3">
        <p className="text-xs text-gray-500 dark:text-gray-400">
          {t('admin.channelMonitor.form.selectKeyHint')}
        </p>

        <div className="relative">
          <input
            value={search}
            type="text"
            className="input pl-9"
            placeholder={t('keys.searchPlaceholder')}
            onChange={(event) => setSearch(event.target.value)}
          />
          <svg
            className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.35-4.35" />
          </svg>
        </div>

        {loading ? (
          <div className="py-6 text-center text-sm text-gray-500">{t('common.loading')}</div>
        ) : filteredKeys.length === 0 ? (
          <div className="py-6 text-center text-sm text-gray-500">
            {t('admin.channelMonitor.form.noActiveKey')}
          </div>
        ) : (
          <div className="max-h-96 overflow-auto rounded-lg border border-gray-200 dark:border-dark-600">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10 bg-gray-50 dark:bg-dark-800">
                <tr className="text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  <th className="px-3 py-2">{t('common.name')}</th>
                  <th className="px-3 py-2">{t('keys.apiKey')}</th>
                  <th className="px-3 py-2">{t('keys.group')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-dark-700">
                {filteredKeys.map((key) => (
                  <tr
                    key={key.id}
                    className="cursor-pointer hover:bg-gray-50 dark:hover:bg-dark-700"
                    onClick={() => onPick(key)}
                  >
                    <td className="px-3 py-2 font-medium text-gray-900 dark:text-white">{key.name}</td>
                    <td className="px-3 py-2 font-mono text-xs text-gray-500 dark:text-gray-400">
                      {maskApiKey(key.key)}
                    </td>
                    <td className="px-3 py-2">
                      {key.group ? (
                        <GroupBadge
                          name={key.group.name}
                          platform={key.group.platform}
                          subscriptionType={key.group.subscription_type}
                          rateMultiplier={key.group.rate_multiplier}
                          userRateMultiplier={userGroupRates[key.group.id]}
                        />
                      ) : (
                        <span className="text-xs text-gray-400">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </BaseDialog>
  )
}
