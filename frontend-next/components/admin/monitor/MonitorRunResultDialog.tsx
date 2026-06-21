'use client'

import { useI18n } from '@/lib/i18n'
import type { CheckResult } from '@/lib/adminChannelMonitor'
import { useChannelMonitorFormat } from '@/lib/useChannelMonitorFormat'
import BaseDialog from '@/components/common/BaseDialog'

interface MonitorRunResultDialogProps {
  show: boolean
  results: CheckResult[]
  onClose: () => void
}

export default function MonitorRunResultDialog({
  show,
  results,
  onClose,
}: MonitorRunResultDialogProps) {
  const { t } = useI18n()
  const { statusLabel, statusBadgeClass, formatLatency } = useChannelMonitorFormat()

  return (
    <BaseDialog
      show={show}
      title={t('admin.channelMonitor.runResultTitle')}
      width="normal"
      onClose={onClose}
      footer={
        <div className="flex justify-end">
          <button type="button" onClick={onClose} className="btn btn-primary">
            {t('common.close')}
          </button>
        </div>
      }
    >
      <div className="space-y-2">
        {results.map((result) => (
          <div
            key={result.model}
            className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2 text-sm dark:border-dark-600"
          >
            <div className="flex flex-col">
              <span className="font-medium text-gray-900 dark:text-white">{result.model}</span>
              {result.message ? (
                <span className="text-xs text-gray-500 dark:text-gray-400">{result.message}</span>
              ) : null}
            </div>
            <div className="flex items-center gap-2">
              <span
                className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] ${statusBadgeClass(result.status)}`}
              >
                {statusLabel(result.status)}
              </span>
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {formatLatency(result.latency_ms)} ms
              </span>
            </div>
          </div>
        ))}
      </div>
    </BaseDialog>
  )
}
