'use client'

import { useI18n } from '@/lib/i18n'
import type { ChannelMonitor } from '@/lib/adminChannelMonitor'
import { useChannelMonitorFormat } from '@/lib/useChannelMonitorFormat'
import HelpTooltip from '@/components/common/HelpTooltip'

interface MonitorPrimaryModelCellProps {
  row: ChannelMonitor
}

export default function MonitorPrimaryModelCell({ row }: MonitorPrimaryModelCellProps) {
  const { t } = useI18n()
  const { statusLabel, statusBadgeClass, formatLatency } = useChannelMonitorFormat()

  return (
    <div className="flex items-center gap-2">
      <span className="text-sm text-gray-900 dark:text-gray-100">{row.primary_model}</span>
      <HelpTooltip
        widthClass="w-72"
        triggerContent={
          <span
            className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${statusBadgeClass(row.primary_status)}`}
          >
            {statusLabel(row.primary_status)}
          </span>
        }
      >
        <div className="space-y-2">
          <div className="text-xs font-semibold text-gray-100">
            {row.primary_model}
            <span
              className={`ml-1 inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium ${statusBadgeClass(row.primary_status)}`}
            >
              {statusLabel(row.primary_status)}
            </span>
          </div>
          {(row.extra_models?.length ?? 0) === 0 ? (
            <div className="text-[11px] text-gray-300">{t('monitorCommon.extraModelsEmpty')}</div>
          ) : (
            <div className="space-y-1">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                {t('monitorCommon.extraModelsHeader')}
              </div>
              <table className="w-full text-left text-[11px]">
                <thead>
                  <tr className="text-gray-400">
                    <th className="py-0.5 pr-2 font-medium">
                      {t('admin.channelMonitor.columns.primaryModel')}
                    </th>
                    <th className="py-0.5 pr-2 font-medium">
                      {t('admin.channelMonitor.columns.actions')}
                    </th>
                    <th className="py-0.5 font-medium">
                      {t('admin.channelMonitor.columns.latency')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {(row.extra_models_status || []).map((m) => (
                    <tr key={m.model}>
                      <td className="py-0.5 pr-2 text-gray-100">{m.model}</td>
                      <td className="py-0.5 pr-2">
                        <span
                          className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] ${statusBadgeClass(m.status)}`}
                        >
                          {statusLabel(m.status)}
                        </span>
                      </td>
                      <td className="py-0.5 text-gray-100">{formatLatency(m.latency_ms)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </HelpTooltip>
    </div>
  )
}
