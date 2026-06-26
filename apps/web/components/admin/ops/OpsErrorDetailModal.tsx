'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useI18n } from '@/lib/i18n'
import { useApp } from '@/context/AppContext'
import BaseDialog from '@/components/common/BaseDialog'
import Icon from '@/components/icons/Icon'
import {
  adminOpsAPI,
  type OpsErrorDetail,
} from '@/lib/adminOps'
import { formatDateTime } from '@/lib/adminOpsFormatters'
import { resolvePrimaryResponseBody, resolveUpstreamPayload } from '@/lib/errorDetailResponse'

interface OpsErrorDetailModalProps {
  show: boolean
  errorId: number | null
  errorType?: 'request' | 'upstream'
  onUpdateShow: (show: boolean) => void
}

function prettyJSON(raw?: string): string {
  if (!raw) return 'N/A'
  try {
    return JSON.stringify(JSON.parse(raw), null, 2)
  } catch {
    return raw
  }
}

function isUpstreamError(d: OpsErrorDetail | null): boolean {
  if (!d) return false
  const phase = String(d.phase || '').toLowerCase()
  const owner = String(d.error_owner || '').toLowerCase()
  return phase === 'upstream' && owner === 'provider'
}

export default function OpsErrorDetailModal({
  show,
  errorId,
  errorType = 'request',
  onUpdateShow,
}: OpsErrorDetailModalProps) {
  const { t } = useI18n()
  const appStore = useApp()

  const [loading, setLoading] = useState(false)
  const [detail, setDetail] = useState<OpsErrorDetail | null>(null)
  const [correlatedUpstream, setCorrelatedUpstream] = useState<OpsErrorDetail[]>([])
  const [correlatedUpstreamLoading, setCorrelatedUpstreamLoading] = useState(false)
  const [expandedUpstreamDetailIds, setExpandedUpstreamDetailIds] = useState<Set<number>>(new Set())

  const showUpstreamList = errorType === 'request'

  const title = useMemo(() => {
    if (!errorId) return t('admin.ops.errorDetail.title')
    return t('admin.ops.errorDetail.titleWithId', { id: String(errorId) })
  }, [errorId, t])

  const requestId = detail?.request_id || detail?.client_request_id || ''
  const primaryResponseBody = resolvePrimaryResponseBody(detail, errorType)

  const statusClass = useMemo(() => {
    const code = detail?.status_code ?? 0
    if (code >= 500) return 'bg-red-50 text-red-700 ring-red-600/20 dark:bg-red-900/30 dark:text-red-400 dark:ring-red-500/30'
    if (code === 429) return 'bg-purple-50 text-purple-700 ring-purple-600/20 dark:bg-purple-900/30 dark:text-purple-400 dark:ring-purple-500/30'
    if (code >= 400) return 'bg-amber-50 text-amber-700 ring-amber-600/20 dark:bg-amber-900/30 dark:text-amber-400 dark:ring-amber-500/30'
    return 'bg-gray-50 text-gray-700 ring-gray-600/20 dark:bg-gray-900/30 dark:text-gray-400 dark:ring-gray-500/30'
  }, [detail?.status_code])

  const formatRequestTypeLabel = (type: number | null | undefined): string => {
    switch (type) {
      case 1:
        return t('admin.ops.errorDetail.requestTypeSync')
      case 2:
        return t('admin.ops.errorDetail.requestTypeStream')
      case 3:
        return t('admin.ops.errorDetail.requestTypeWs')
      default:
        return t('admin.ops.errorDetail.requestTypeUnknown')
    }
  }

  const hasModelMapping = (d: OpsErrorDetail | null): boolean => {
    if (!d) return false
    const requested = String(d.requested_model || '').trim()
    const upstream = String(d.upstream_model || '').trim()
    return !!requested && !!upstream && requested !== upstream
  }

  const displayModel = (d: OpsErrorDetail | null): string => {
    if (!d) return ''
    const upstream = String(d.upstream_model || '').trim()
    if (upstream) return upstream
    const requested = String(d.requested_model || '').trim()
    if (requested) return requested
    return String(d.model || '').trim()
  }

  const getUpstreamResponsePreview = (ev: OpsErrorDetail): string => {
    const upstreamPayload = resolveUpstreamPayload(ev)
    if (upstreamPayload) return upstreamPayload
    return String(ev.error_body || '').trim()
  }

  const toggleUpstreamDetail = (id: number) => {
    setExpandedUpstreamDetailIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const fetchDetail = useCallback(
    async (id: number) => {
      setLoading(true)
      try {
        const d =
          errorType === 'upstream'
            ? await adminOpsAPI.getUpstreamErrorDetail(id)
            : await adminOpsAPI.getRequestErrorDetail(id)
        setDetail(d)
      } catch (err: unknown) {
        setDetail(null)
        appStore.showError((err as Error)?.message || t('admin.ops.failedToLoadErrorDetail'))
      } finally {
        setLoading(false)
      }
    },
    [appStore, errorType, t],
  )

  const fetchCorrelatedUpstreamErrors = useCallback(async (requestErrorId: number) => {
    setCorrelatedUpstreamLoading(true)
    try {
      const res = await adminOpsAPI.listRequestErrorUpstreamErrors(
        requestErrorId,
        { page: 1, page_size: 100, view: 'all' },
        { include_detail: true },
      )
      setCorrelatedUpstream(res.items || [])
    } catch (err) {
      console.error('[OpsErrorDetailModal] Failed to load correlated upstream errors', err)
      setCorrelatedUpstream([])
    } finally {
      setCorrelatedUpstreamLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!show) {
      setDetail(null)
      return
    }
    if (typeof errorId === 'number' && errorId > 0) {
      setExpandedUpstreamDetailIds(new Set())
      void fetchDetail(errorId)
      if (errorType === 'request') {
        void fetchCorrelatedUpstreamErrors(errorId)
      } else {
        setCorrelatedUpstream([])
      }
    }
  }, [show, errorId, errorType, fetchDetail, fetchCorrelatedUpstreamErrors])

  return (
    <BaseDialog show={show} title={title} width="full" closeOnClickOutside onClose={() => onUpdateShow(false)}>
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="flex flex-col items-center gap-3">
            <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary-600" />
            <div className="text-sm font-medium text-gray-500 dark:text-gray-400">{t('admin.ops.errorDetail.loading')}</div>
          </div>
        </div>
      ) : !detail ? (
        <div className="py-10 text-center text-sm text-gray-500 dark:text-gray-400">
          {t('admin.ops.errorDetail.noErrorSelected')}
        </div>
      ) : (
        <div className="space-y-6 p-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl bg-gray-50 p-4 dark:bg-dark-900">
              <div className="text-xs font-bold uppercase tracking-wider text-gray-400">{t('admin.ops.errorDetail.requestId')}</div>
              <div className="mt-1 break-all font-mono text-sm font-medium text-gray-900 dark:text-white">{requestId || '—'}</div>
            </div>
            <div className="rounded-xl bg-gray-50 p-4 dark:bg-dark-900">
              <div className="text-xs font-bold uppercase tracking-wider text-gray-400">{t('admin.ops.errorDetail.time')}</div>
              <div className="mt-1 text-sm font-medium text-gray-900 dark:text-white">{formatDateTime(detail.created_at)}</div>
            </div>
            <div className="rounded-xl bg-gray-50 p-4 dark:bg-dark-900">
              <div className="text-xs font-bold uppercase tracking-wider text-gray-400">
                {isUpstreamError(detail) ? t('admin.ops.errorDetail.account') : t('admin.ops.errorDetail.user')}
              </div>
              <div className="mt-1 text-sm font-medium text-gray-900 dark:text-white">
                {isUpstreamError(detail)
                  ? detail.account_name || (detail.account_id != null ? String(detail.account_id) : '—')
                  : detail.user_email || (detail.user_id != null ? String(detail.user_id) : '—')}
              </div>
            </div>
            <div className="rounded-xl bg-gray-50 p-4 dark:bg-dark-900">
              <div className="text-xs font-bold uppercase tracking-wider text-gray-400">{t('admin.ops.errorDetail.platform')}</div>
              <div className="mt-1 text-sm font-medium text-gray-900 dark:text-white">{detail.platform || '—'}</div>
            </div>
            <div className="rounded-xl bg-gray-50 p-4 dark:bg-dark-900">
              <div className="text-xs font-bold uppercase tracking-wider text-gray-400">{t('admin.ops.errorDetail.group')}</div>
              <div className="mt-1 text-sm font-medium text-gray-900 dark:text-white">
                {detail.group_name || (detail.group_id != null ? String(detail.group_id) : '—')}
              </div>
            </div>
            <div className="rounded-xl bg-gray-50 p-4 dark:bg-dark-900">
              <div className="text-xs font-bold uppercase tracking-wider text-gray-400">{t('admin.ops.errorDetail.model')}</div>
              <div className="mt-1 text-sm font-medium text-gray-900 dark:text-white">
                {hasModelMapping(detail) ? (
                  <>
                    <span className="font-mono">{detail.requested_model}</span>
                    <span className="mx-1 text-gray-400">→</span>
                    <span className="font-mono text-primary-600 dark:text-primary-400">{detail.upstream_model}</span>
                  </>
                ) : (
                  displayModel(detail) || '—'
                )}
              </div>
            </div>
            <div className="rounded-xl bg-gray-50 p-4 dark:bg-dark-900">
              <div className="text-xs font-bold uppercase tracking-wider text-gray-400">{t('admin.ops.errorDetail.status')}</div>
              <div className="mt-1">
                <span className={`inline-flex items-center rounded-lg px-2 py-1 text-xs font-black ring-1 ring-inset shadow-sm ${statusClass}`}>
                  {detail.status_code}
                </span>
              </div>
            </div>
            <div className="rounded-xl bg-gray-50 p-4 dark:bg-dark-900">
              <div className="text-xs font-bold uppercase tracking-wider text-gray-400">{t('admin.ops.errorDetail.requestType')}</div>
              <div className="mt-1 text-sm font-medium text-gray-900 dark:text-white">{formatRequestTypeLabel(detail.request_type)}</div>
            </div>
          </div>

          <div className="rounded-xl bg-gray-50 p-6 dark:bg-dark-900">
            <h3 className="text-sm font-black uppercase tracking-wider text-gray-900 dark:text-white">{t('admin.ops.errorDetail.responseBody')}</h3>
            <pre className="mt-4 max-h-[520px] overflow-auto rounded-xl border border-gray-200 bg-white p-4 text-xs text-gray-800 dark:border-dark-700 dark:bg-dark-800 dark:text-gray-100">
              <code>{prettyJSON(primaryResponseBody || '')}</code>
            </pre>
          </div>

          {showUpstreamList ? (
            <div className="rounded-xl bg-gray-50 p-6 dark:bg-dark-900">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-black uppercase tracking-wider text-gray-900 dark:text-white">
                  {t('admin.ops.errorDetails.upstreamErrors')}
                </h3>
                {correlatedUpstreamLoading ? <div className="text-xs text-gray-500 dark:text-gray-400">{t('common.loading')}</div> : null}
              </div>

              {!correlatedUpstreamLoading && correlatedUpstream.length === 0 ? (
                <div className="mt-3 text-sm text-gray-500 dark:text-gray-400">{t('common.noData')}</div>
              ) : (
                <div className="mt-4 space-y-3">
                  {correlatedUpstream.map((ev, idx) => (
                    <div key={ev.id} className="rounded-xl border border-gray-200 bg-white p-4 dark:border-dark-700 dark:bg-dark-800">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="text-xs font-black text-gray-900 dark:text-white">
                          #{idx + 1}
                          {ev.type ? (
                            <span className="ml-2 rounded-md bg-gray-100 px-2 py-0.5 font-mono text-[10px] font-bold text-gray-700 dark:bg-dark-700 dark:text-gray-200">
                              {ev.type}
                            </span>
                          ) : null}
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="font-mono text-xs text-gray-500 dark:text-gray-400">{ev.status_code ?? '—'}</div>
                          <button
                            type="button"
                            className="inline-flex items-center gap-1.5 rounded-md px-1.5 py-1 text-[10px] font-bold text-primary-700 hover:bg-primary-50 disabled:cursor-not-allowed disabled:opacity-60 dark:text-primary-200 dark:hover:bg-dark-700"
                            disabled={!getUpstreamResponsePreview(ev)}
                            onClick={() => toggleUpstreamDetail(ev.id)}
                          >
                            <Icon
                              name={expandedUpstreamDetailIds.has(ev.id) ? 'chevronDown' : 'chevronRight'}
                              size="xs"
                              strokeWidth={2}
                            />
                            <span>
                              {expandedUpstreamDetailIds.has(ev.id)
                                ? t('admin.ops.errorDetail.responsePreview.collapse')
                                : t('admin.ops.errorDetail.responsePreview.expand')}
                            </span>
                          </button>
                        </div>
                      </div>
                      {ev.message ? (
                        <div className="mt-3 break-words text-sm font-medium text-gray-900 dark:text-white">{ev.message}</div>
                      ) : null}
                      {expandedUpstreamDetailIds.has(ev.id) ? (
                        <pre className="mt-3 max-h-[240px] overflow-auto rounded-xl border border-gray-200 bg-gray-50 p-3 text-xs text-gray-800 dark:border-dark-700 dark:bg-dark-900 dark:text-gray-100">
                          <code>{prettyJSON(getUpstreamResponsePreview(ev))}</code>
                        </pre>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : null}
        </div>
      )}
    </BaseDialog>
  )
}
