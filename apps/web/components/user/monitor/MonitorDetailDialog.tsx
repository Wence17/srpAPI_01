'use client'

import { useEffect, useState } from 'react'
import { useI18n } from '@/lib/i18n'
import { useApp } from '@/context/AppContext'
import { extractApiErrorMessage } from '@/lib/apiError'
import { channelMonitorUserAPI, type UserMonitorDetail } from '@/lib/channelMonitorUser'
import { useChannelMonitorFormat } from '@/lib/useChannelMonitorFormat'
import BaseDialog from '@/components/common/BaseDialog'

interface MonitorDetailDialogProps {
  show: boolean
  monitorId: number | null
  title: string
  onClose: () => void
}

export default function MonitorDetailDialog({ show, monitorId, title, onClose }: MonitorDetailDialogProps) {
  const { t } = useI18n()
  const appStore = useApp()
  const { statusLabel, statusBadgeClass, formatLatency, formatPercent } = useChannelMonitorFormat()
  const [detail, setDetail] = useState<UserMonitorDetail | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!show) {
      setDetail(null)
      return
    }
    if (monitorId == null) return

    let cancelled = false
    setDetail(null)
    setLoading(true)

    channelMonitorUserAPI
      .status(monitorId)
      .then((data) => {
        if (!cancelled) setDetail(data)
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          appStore.showError(extractApiErrorMessage(err, t('channelStatus.detailLoadError')))
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [appStore, monitorId, show, t])

  return (
    <BaseDialog show={show} title={title} width="wide" onClose={onClose}>
      {loading ? (
        <div className="py-8 text-center text-sm text-gray-500">{t('common.loading')}</div>
      ) : !detail ? (
        <div className="py-8 text-center text-sm text-gray-500">{t('channelStatus.detailLoadError')}</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-gray-200 dark:border-dark-700">
              <tr className="text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400">
                <th className="py-2 pr-3">{t('channelStatus.detailColumns.model')}</th>
                <th className="py-2 pr-3">{t('channelStatus.detailColumns.latestStatus')}</th>
                <th className="py-2 pr-3">{t('channelStatus.detailColumns.latestLatency')}</th>
                <th className="py-2 pr-3">{t('channelStatus.detailColumns.availability7d')}</th>
                <th className="py-2 pr-3">{t('channelStatus.detailColumns.availability15d')}</th>
                <th className="py-2 pr-3">{t('channelStatus.detailColumns.availability30d')}</th>
                <th className="py-2 pr-3">{t('channelStatus.detailColumns.avgLatency7d')}</th>
              </tr>
            </thead>
            <tbody>
              {detail.models.map((model) => (
                <tr key={model.model} className="border-b border-gray-100 dark:border-dark-800">
                  <td className="py-2 pr-3 font-medium text-gray-900 dark:text-gray-100">{model.model}</td>
                  <td className="py-2 pr-3">
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] ${statusBadgeClass(model.latest_status)}`}
                    >
                      {statusLabel(model.latest_status)}
                    </span>
                  </td>
                  <td className="py-2 pr-3 text-gray-700 dark:text-gray-300">
                    {formatLatency(model.latest_latency_ms)}
                  </td>
                  <td className="py-2 pr-3 text-gray-700 dark:text-gray-300">
                    {formatPercent(model.availability_7d)}
                  </td>
                  <td className="py-2 pr-3 text-gray-700 dark:text-gray-300">
                    {formatPercent(model.availability_15d)}
                  </td>
                  <td className="py-2 pr-3 text-gray-700 dark:text-gray-300">
                    {formatPercent(model.availability_30d)}
                  </td>
                  <td className="py-2 pr-3 text-gray-700 dark:text-gray-300">
                    {formatLatency(model.avg_latency_7d_ms)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-6 flex justify-end">
        <button type="button" onClick={onClose} className="btn btn-secondary">
          {t('channelStatus.closeDetail')}
        </button>
      </div>
    </BaseDialog>
  )
}
