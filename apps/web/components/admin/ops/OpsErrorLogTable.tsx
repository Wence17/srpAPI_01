'use client'

import { useCallback, useMemo } from 'react'
import { useI18n } from '@/lib/i18n'
import Pagination from '@/components/common/Pagination'
import type { OpsErrorLog } from '@/lib/adminOps'
import { formatDateTime, getSeverityClass } from '@/lib/adminOpsFormatters'

interface OpsErrorLogTableProps {
  rows: OpsErrorLog[]
  total: number
  loading: boolean
  page: number
  pageSize: number
  onOpenErrorDetail: (id: number) => void
  onUpdatePage: (page: number) => void
  onUpdatePageSize: (size: number) => void
}

function isUpstreamRow(log: OpsErrorLog): boolean {
  const phase = String(log.phase || '').toLowerCase()
  const owner = String(log.error_owner || '').toLowerCase()
  return phase === 'upstream' && owner === 'provider'
}

function formatEndpointTooltip(log: OpsErrorLog): string {
  const parts: string[] = []
  if (log.inbound_endpoint) parts.push(`Inbound: ${log.inbound_endpoint}`)
  if (log.upstream_endpoint) parts.push(`Upstream: ${log.upstream_endpoint}`)
  return parts.join('\n') || ''
}

function hasModelMapping(log: OpsErrorLog): boolean {
  const requested = String(log.requested_model || '').trim()
  const upstream = String(log.upstream_model || '').trim()
  return !!requested && !!upstream && requested !== upstream
}

function displayModel(log: OpsErrorLog): string {
  const upstream = String(log.upstream_model || '').trim()
  if (upstream) return upstream
  const requested = String(log.requested_model || '').trim()
  if (requested) return requested
  return String(log.model || '').trim()
}

function getStatusClass(code: number): string {
  if (code >= 500) return 'bg-red-50 text-red-700 ring-red-600/20 dark:bg-red-900/30 dark:text-red-400 dark:ring-red-500/30'
  if (code === 429) return 'bg-purple-50 text-purple-700 ring-purple-600/20 dark:bg-purple-900/30 dark:text-purple-400 dark:ring-purple-500/30'
  if (code >= 400) return 'bg-amber-50 text-amber-700 ring-amber-600/20 dark:bg-amber-900/30 dark:text-amber-400 dark:ring-amber-500/30'
  return 'bg-gray-50 text-gray-700 ring-gray-600/20 dark:bg-gray-900/30 dark:text-gray-400 dark:ring-gray-500/30'
}

export default function OpsErrorLogTable({
  rows,
  total,
  loading,
  page,
  pageSize,
  onOpenErrorDetail,
  onUpdatePage,
  onUpdatePageSize,
}: OpsErrorLogTableProps) {
  const { t } = useI18n()

  const formatRequestType = useCallback(
    (type: number | null | undefined): string => {
      switch (type) {
        case 1:
          return t('admin.ops.errorLog.requestTypeSync')
        case 2:
          return t('admin.ops.errorLog.requestTypeStream')
        case 3:
          return t('admin.ops.errorLog.requestTypeWs')
        default:
          return ''
      }
    },
    [t],
  )

  const getTypeBadge = useCallback(
    (log: OpsErrorLog): { label: string; className: string } => {
      const phase = String(log.phase || '').toLowerCase()
      const owner = String(log.error_owner || '').toLowerCase()

      if (isUpstreamRow(log)) {
        return {
          label: t('admin.ops.errorLog.typeUpstream'),
          className: 'bg-red-50 text-red-700 ring-red-600/20 dark:bg-red-900/30 dark:text-red-400 dark:ring-red-500/30',
        }
      }
      if (phase === 'request' && owner === 'client') {
        return {
          label: t('admin.ops.errorLog.typeRequest'),
          className: 'bg-amber-50 text-amber-700 ring-amber-600/20 dark:bg-amber-900/30 dark:text-amber-400 dark:ring-amber-500/30',
        }
      }
      if (phase === 'auth' && owner === 'client') {
        return {
          label: t('admin.ops.errorLog.typeAuth'),
          className: 'bg-blue-50 text-blue-700 ring-blue-600/20 dark:bg-blue-900/30 dark:text-blue-400 dark:ring-blue-500/30',
        }
      }
      if (phase === 'routing' && owner === 'platform') {
        return {
          label: t('admin.ops.errorLog.typeRouting'),
          className: 'bg-purple-50 text-purple-700 ring-purple-600/20 dark:bg-purple-900/30 dark:text-purple-400 dark:ring-purple-500/30',
        }
      }
      if (phase === 'internal' && owner === 'platform') {
        return {
          label: t('admin.ops.errorLog.typeInternal'),
          className: 'bg-gray-100 text-gray-800 ring-gray-600/20 dark:bg-dark-700 dark:text-gray-200 dark:ring-dark-500/40',
        }
      }

      const fallback = phase || owner || t('common.unknown')
      return {
        label: fallback,
        className: 'bg-gray-50 text-gray-700 ring-gray-600/10 dark:bg-dark-900 dark:text-gray-300 dark:ring-dark-700',
      }
    },
    [t],
  )

  const formatSmartMessage = useCallback(
    (msg: string): string => {
      if (!msg) return ''

      if (msg.startsWith('{') || msg.startsWith('[')) {
        try {
          const obj = JSON.parse(msg) as Record<string, unknown>
          const err = obj?.error as Record<string, unknown> | undefined
          if (err?.message) return String(err.message)
          if (obj?.message) return String(obj.message)
          if (obj?.detail) return String(obj.detail)
          if (typeof obj === 'object') return JSON.stringify(obj).substring(0, 150)
        } catch {
          // ignore
        }
      }

      if (msg.includes('context deadline exceeded')) return t('admin.ops.errorLog.commonErrors.contextDeadlineExceeded')
      if (msg.includes('connection refused')) return t('admin.ops.errorLog.commonErrors.connectionRefused')
      if (msg.toLowerCase().includes('rate limit')) return t('admin.ops.errorLog.commonErrors.rateLimit')

      return msg.length > 200 ? `${msg.substring(0, 200)}...` : msg
    },
    [t],
  )

  const timeOnly = useMemo(() => {
    return (value: string) => formatDateTime(value).split(' ')[1] || formatDateTime(value)
  }, [])

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center py-10">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary-600" />
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-white dark:bg-dark-900">
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="min-h-0 flex-1 overflow-auto border-b border-gray-200 dark:border-dark-700">
          <table className="w-full border-separate border-spacing-0">
            <thead className="sticky top-0 z-10 bg-gray-50 dark:bg-dark-800">
              <tr>
                {[
                  t('admin.ops.errorLog.time'),
                  t('admin.ops.errorLog.type'),
                  t('admin.ops.errorLog.endpoint'),
                  t('admin.ops.errorLog.platform'),
                  t('admin.ops.errorLog.model'),
                  t('admin.ops.errorLog.group'),
                  t('admin.ops.errorLog.user'),
                  t('admin.ops.errorLog.apiKey'),
                  t('admin.ops.errorLog.account'),
                  t('admin.ops.errorLog.status'),
                  t('admin.ops.errorLog.message'),
                  t('admin.ops.errorLog.action'),
                ].map((label, i) => (
                  <th
                    key={label}
                    className={`border-b border-gray-200 px-4 py-2.5 text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:border-dark-700 dark:text-dark-400 ${
                      i === 11 ? 'text-right' : 'text-left'
                    }`}
                  >
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-dark-700">
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={12} className="py-12 text-center text-sm text-gray-400 dark:text-dark-500">
                    {t('admin.ops.errorLog.noErrors')}
                  </td>
                </tr>
              ) : (
                rows.map((log) => {
                  const typeBadge = getTypeBadge(log)
                  return (
                    <tr
                      key={log.id}
                      className="group cursor-pointer transition-colors hover:bg-gray-50/80 dark:hover:bg-dark-800/50"
                      onClick={() => onOpenErrorDetail(log.id)}
                    >
                      <td className="whitespace-nowrap px-4 py-2" title={log.request_id || log.client_request_id}>
                        <span className="font-mono text-xs font-medium text-gray-900 dark:text-gray-200">
                          {timeOnly(log.created_at)}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-2">
                        <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-bold ring-1 ring-inset ${typeBadge.className}`}>
                          {typeBadge.label}
                        </span>
                      </td>
                      <td className="px-4 py-2">
                        <div className="max-w-[160px]">
                          {log.inbound_endpoint ? (
                            <span className="truncate font-mono text-[11px] text-gray-700 dark:text-gray-300" title={formatEndpointTooltip(log)}>
                              {log.inbound_endpoint}
                            </span>
                          ) : (
                            <span className="text-xs text-gray-400">-</span>
                          )}
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-4 py-2">
                        <span className="inline-flex items-center rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-gray-600 dark:bg-dark-700 dark:text-gray-300">
                          {log.platform || '-'}
                        </span>
                      </td>
                      <td className="px-4 py-2">
                        <div className="max-w-[160px]">
                          {hasModelMapping(log) ? (
                            <span className="flex items-center gap-1 truncate font-mono text-[11px] text-gray-700 dark:text-gray-300" title={`${log.requested_model} → ${log.upstream_model}`}>
                              <span className="truncate">{log.requested_model}</span>
                              <span className="flex-shrink-0 text-gray-400">→</span>
                              <span className="truncate text-primary-600 dark:text-primary-400">{log.upstream_model}</span>
                            </span>
                          ) : displayModel(log) ? (
                            <span className="truncate font-mono text-[11px] text-gray-700 dark:text-gray-300" title={displayModel(log)}>
                              {displayModel(log)}
                            </span>
                          ) : (
                            <span className="text-xs text-gray-400">-</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-2">
                        {log.group_id ? (
                          <span className="max-w-[100px] truncate text-xs font-medium text-gray-900 dark:text-gray-200" title={`${t('admin.ops.errorLog.id')} ${log.group_id}`}>
                            {log.group_name || '-'}
                          </span>
                        ) : (
                          <span className="text-xs text-gray-400">-</span>
                        )}
                      </td>
                      <td className="px-4 py-2">
                        {log.user_id ? (
                          <span className="block max-w-[140px] truncate text-xs font-medium text-gray-900 dark:text-gray-200" title={`${t('admin.ops.errorLog.userId')} ${log.user_id}`}>
                            {log.user_email || '-'}
                          </span>
                        ) : (
                          <span className="text-xs text-gray-400">-</span>
                        )}
                      </td>
                      <td className="px-4 py-2">
                        {log.api_key_id || log.api_key_name ? (
                          <div className="flex max-w-[140px] items-center gap-1">
                            <span className="truncate text-xs font-medium text-gray-900 dark:text-gray-200" title={log.api_key_name || `#${log.api_key_id}`}>
                              {log.api_key_name || `#${log.api_key_id}`}
                            </span>
                            {log.api_key_deleted ? (
                              <span className="flex-shrink-0 rounded px-1 py-0.5 text-[9px] font-bold ring-1 ring-inset bg-red-50 text-red-700 ring-red-600/20 dark:bg-red-900/30 dark:text-red-400 dark:ring-red-500/30">
                                {t('admin.ops.errorLog.keyDeletedBadge')}
                              </span>
                            ) : null}
                          </div>
                        ) : (
                          <span className="text-xs text-gray-400">-</span>
                        )}
                      </td>
                      <td className="px-4 py-2">
                        {log.account_id ? (
                          <span className="block max-w-[120px] truncate text-xs font-medium text-gray-900 dark:text-gray-200" title={`${t('admin.ops.errorLog.accountId')} ${log.account_id}`}>
                            {log.account_name || '-'}
                          </span>
                        ) : (
                          <span className="text-xs text-gray-400">-</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2">
                        <div className="flex items-center gap-1.5">
                          <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-bold ring-1 ring-inset ${getStatusClass(log.status_code)}`}>
                            {log.status_code}
                          </span>
                          {log.severity ? (
                            <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${getSeverityClass(log.severity)}`}>
                              {log.severity}
                            </span>
                          ) : null}
                          {log.request_type != null && log.request_type > 0 ? (
                            <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-bold text-gray-600 dark:bg-dark-700 dark:text-gray-300">
                              {formatRequestType(log.request_type)}
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-4 py-2">
                        <p className="max-w-[200px] truncate text-[11px] font-medium text-gray-600 dark:text-gray-400" title={log.message}>
                          {formatSmartMessage(log.message) || '-'}
                        </p>
                      </td>
                      <td className="whitespace-nowrap px-4 py-2 text-right" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          className="text-xs font-bold text-primary-600 hover:text-primary-700 dark:text-primary-400"
                          onClick={() => onOpenErrorDetail(log.id)}
                        >
                          {t('admin.ops.errorLog.details')}
                        </button>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        {total > 0 ? (
          <div className="bg-gray-50/50 dark:bg-dark-800/50">
            <Pagination total={total} page={page} pageSize={pageSize} onUpdatePage={onUpdatePage} onUpdatePageSize={onUpdatePageSize} />
          </div>
        ) : null}
      </div>
    </div>
  )
}
