'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useI18n } from '@/lib/i18n'
import { useApp } from '@/context/AppContext'
import { useClipboard } from '@/lib/useClipboard'
import BaseDialog from '@/components/common/BaseDialog'
import Pagination from '@/components/common/Pagination'
import { adminOpsAPI, type OpsRequestDetail, type OpsRequestDetailsParams } from '@/lib/adminOps'
import { formatDateTime, parseTimeRangeMinutes } from '@/lib/adminOpsFormatters'

export interface OpsRequestDetailsPreset {
  title: string
  kind?: OpsRequestDetailsParams['kind']
  sort?: OpsRequestDetailsParams['sort']
  min_duration_ms?: number
  max_duration_ms?: number
}

interface OpsRequestDetailsModalProps {
  show: boolean
  timeRange: string
  preset: OpsRequestDetailsPreset
  platform?: string
  groupId?: number | null
  onUpdateShow: (show: boolean) => void
  onOpenErrorDetail: (errorId: number) => void
}

function kindBadgeClass(kind: string): string {
  if (kind === 'error') return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'
  return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
}

export default function OpsRequestDetailsModal({
  show,
  timeRange,
  preset,
  platform = '',
  groupId = null,
  onUpdateShow,
  onOpenErrorDetail,
}: OpsRequestDetailsModalProps) {
  const { t } = useI18n()
  const appStore = useApp()
  const { copyToClipboard } = useClipboard()

  const [loading, setLoading] = useState(false)
  const [items, setItems] = useState<OpsRequestDetail[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)

  const close = () => onUpdateShow(false)

  const rangeLabel = useMemo(() => {
    const minutes = parseTimeRangeMinutes(timeRange)
    if (minutes >= 60) return t('admin.ops.requestDetails.rangeHours', { n: Math.round(minutes / 60) })
    return t('admin.ops.requestDetails.rangeMinutes', { n: minutes })
  }, [timeRange, t])

  const buildTimeParams = useCallback((): Pick<OpsRequestDetailsParams, 'start_time' | 'end_time'> => {
    const minutes = parseTimeRangeMinutes(timeRange)
    const endTime = new Date()
    const startTime = new Date(endTime.getTime() - minutes * 60 * 1000)
    return {
      start_time: startTime.toISOString(),
      end_time: endTime.toISOString(),
    }
  }, [timeRange])

  const fetchData = useCallback(async () => {
    if (!show) return
    setLoading(true)
    try {
      const params: OpsRequestDetailsParams = {
        ...buildTimeParams(),
        page,
        page_size: pageSize,
        kind: preset.kind ?? 'all',
        sort: preset.sort ?? 'created_at_desc',
      }

      const platformVal = (platform || '').trim()
      if (platformVal) params.platform = platformVal
      if (typeof groupId === 'number' && groupId > 0) params.group_id = groupId

      if (typeof preset.min_duration_ms === 'number') params.min_duration_ms = preset.min_duration_ms
      if (typeof preset.max_duration_ms === 'number') params.max_duration_ms = preset.max_duration_ms

      const res = await adminOpsAPI.listRequestDetails(params)
      setItems(res.items || [])
      setTotal(res.total || 0)
    } catch (e: unknown) {
      console.error('[OpsRequestDetailsModal] Failed to fetch request details', e)
      appStore.showError((e as Error)?.message || t('admin.ops.requestDetails.failedToLoad'))
      setItems([])
      setTotal(0)
    } finally {
      setLoading(false)
    }
  }, [show, buildTimeParams, page, pageSize, preset, platform, groupId, appStore, t])

  useEffect(() => {
    if (show) {
      setPage(1)
      setPageSize(10)
      void fetchData()
    }
  }, [show])

  useEffect(() => {
    if (!show) return
    setPage(1)
    void fetchData()
  }, [timeRange, platform, groupId, preset.kind, preset.sort, preset.min_duration_ms, preset.max_duration_ms])

  useEffect(() => {
    if (!show) return
    void fetchData()
  }, [page, pageSize])

  const handleCopyRequestId = async (requestId: string) => {
    const ok = await copyToClipboard(requestId, t('admin.ops.requestDetails.requestIdCopied'))
    if (!ok) appStore.showWarning(t('admin.ops.requestDetails.copyFailed'))
  }

  const openErrorDetail = (errorId: number | null | undefined) => {
    if (!errorId) return
    close()
    onOpenErrorDetail(errorId)
  }

  return (
    <BaseDialog
      show={show}
      title={preset.title || t('admin.ops.requestDetails.title')}
      width="full"
      onClose={close}
    >
      <div className="flex h-full min-h-0 flex-col">
        <div className="mb-4 flex flex-shrink-0 items-center justify-between">
          <div className="text-xs text-gray-500 dark:text-gray-400">
            {t('admin.ops.requestDetails.rangeLabel', { range: rangeLabel })}
          </div>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => void fetchData()}>
            {t('common.refresh')}
          </button>
        </div>

        {loading ? (
          <div className="flex flex-1 items-center justify-center py-16">
            <div className="flex flex-col items-center gap-3">
              <svg className="h-8 w-8 animate-spin text-blue-500" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth={4} />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
              <span className="text-sm font-medium text-gray-500 dark:text-gray-400">{t('common.loading')}</span>
            </div>
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col">
            {items.length === 0 ? (
              <div className="rounded-xl border border-dashed border-gray-200 p-10 text-center dark:border-dark-700">
                <div className="text-sm font-medium text-gray-600 dark:text-gray-300">
                  {t('admin.ops.requestDetails.empty')}
                </div>
                <div className="mt-1 text-xs text-gray-400">{t('admin.ops.requestDetails.emptyHint')}</div>
              </div>
            ) : (
              <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-gray-200 dark:border-dark-700">
                <div className="min-h-0 flex-1 overflow-auto">
                  <table className="min-w-full divide-y divide-gray-200 dark:divide-dark-700">
                    <thead className="sticky top-0 z-10 bg-gray-50 dark:bg-dark-900">
                      <tr>
                        <th className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                          {t('admin.ops.requestDetails.table.time')}
                        </th>
                        <th className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                          {t('admin.ops.requestDetails.table.kind')}
                        </th>
                        <th className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                          {t('admin.ops.requestDetails.table.platform')}
                        </th>
                        <th className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                          {t('admin.ops.requestDetails.table.model')}
                        </th>
                        <th className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                          {t('admin.ops.requestDetails.table.duration')}
                        </th>
                        <th className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                          {t('admin.ops.requestDetails.table.status')}
                        </th>
                        <th className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                          {t('admin.ops.requestDetails.table.requestId')}
                        </th>
                        <th className="px-4 py-3 text-right text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                          {t('admin.ops.requestDetails.table.actions')}
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 bg-white dark:divide-dark-700 dark:bg-dark-800">
                      {items.map((row, idx) => (
                        <tr key={idx} className="hover:bg-gray-50 dark:hover:bg-dark-700/50">
                          <td className="whitespace-nowrap px-4 py-3 text-xs text-gray-600 dark:text-gray-300">
                            {formatDateTime(row.created_at)}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3">
                            <span className={`rounded-full px-2 py-1 text-[10px] font-bold ${kindBadgeClass(row.kind)}`}>
                              {row.kind === 'error'
                                ? t('admin.ops.requestDetails.kind.error')
                                : t('admin.ops.requestDetails.kind.success')}
                            </span>
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-xs font-medium text-gray-700 dark:text-gray-200">
                            {(row.platform || 'unknown').toUpperCase()}
                          </td>
                          <td
                            className="max-w-[240px] truncate px-4 py-3 text-xs text-gray-600 dark:text-gray-300"
                            title={row.model || ''}
                          >
                            {row.model || '-'}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-xs text-gray-600 dark:text-gray-300">
                            {typeof row.duration_ms === 'number' ? `${row.duration_ms} ms` : '-'}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-xs text-gray-600 dark:text-gray-300">
                            {row.status_code ?? '-'}
                          </td>
                          <td className="px-4 py-3">
                            {row.request_id ? (
                              <div className="flex items-center gap-2">
                                <span
                                  className="max-w-[220px] truncate font-mono text-[11px] text-gray-700 dark:text-gray-200"
                                  title={row.request_id}
                                >
                                  {row.request_id}
                                </span>
                                <button
                                  type="button"
                                  className="rounded-md bg-gray-100 px-2 py-1 text-[10px] font-bold text-gray-600 hover:bg-gray-200 dark:bg-dark-700 dark:text-gray-300 dark:hover:bg-dark-600"
                                  onClick={() => void handleCopyRequestId(row.request_id!)}
                                >
                                  {t('admin.ops.requestDetails.copy')}
                                </button>
                              </div>
                            ) : (
                              <span className="text-xs text-gray-400">-</span>
                            )}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-right">
                            {row.kind === 'error' && row.error_id ? (
                              <button
                                type="button"
                                className="rounded-lg bg-red-50 px-3 py-1.5 text-xs font-bold text-red-600 hover:bg-red-100 dark:bg-red-900/20 dark:text-red-300 dark:hover:bg-red-900/30"
                                onClick={() => openErrorDetail(row.error_id)}
                              >
                                {t('admin.ops.requestDetails.viewError')}
                              </button>
                            ) : (
                              <span className="text-xs text-gray-400">-</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <Pagination
                  total={total}
                  page={page}
                  pageSize={pageSize}
                  onUpdatePage={setPage}
                  onUpdatePageSize={(next) => {
                    setPageSize(next)
                    setPage(1)
                  }}
                />
              </div>
            )}
          </div>
        )}
      </div>
    </BaseDialog>
  )
}
