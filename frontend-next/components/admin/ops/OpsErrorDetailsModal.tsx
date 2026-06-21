'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useI18n } from '@/lib/i18n'
import BaseDialog from '@/components/common/BaseDialog'
import Select from '@/components/common/Select'
import OpsErrorLogTable from '@/components/admin/ops/OpsErrorLogTable'
import { adminOpsAPI, type OpsErrorLog } from '@/lib/adminOps'

interface OpsErrorDetailsModalProps {
  show: boolean
  timeRange: string
  platform?: string
  groupId?: number | null
  errorType: 'request' | 'upstream'
  onUpdateShow: (show: boolean) => void
  onOpenErrorDetail: (errorId: number) => void
}

export default function OpsErrorDetailsModal({
  show,
  timeRange,
  platform = '',
  groupId = null,
  errorType,
  onUpdateShow,
  onOpenErrorDetail,
}: OpsErrorDetailsModalProps) {
  const { t } = useI18n()

  const [loading, setLoading] = useState(false)
  const [rows, setRows] = useState<OpsErrorLog[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [q, setQ] = useState('')
  const [statusCode, setStatusCode] = useState<number | 'other' | null>(null)
  const [phase, setPhase] = useState('')
  const [errorOwner, setErrorOwner] = useState('')
  const [viewMode, setViewMode] = useState<'errors' | 'excluded' | 'all'>('errors')

  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)

  const modalTitle = useMemo(
    () =>
      errorType === 'upstream'
        ? t('admin.ops.errorDetails.upstreamErrors')
        : t('admin.ops.errorDetails.requestErrors'),
    [errorType, t],
  )

  const statusCodeSelectOptions = useMemo(
    () => {
      const codes = [400, 401, 403, 404, 409, 422, 429, 500, 502, 503, 504, 529]
      return [
        { value: null, label: t('common.all') },
        ...codes.map((c) => ({ value: c, label: String(c) })),
        { value: 'other' as const, label: t('admin.ops.errorDetails.statusCodeOther') || 'Other' },
      ]
    },
    [t],
  )

  const ownerSelectOptions = useMemo(
    () => [
      { value: '', label: t('common.all') },
      { value: 'provider', label: t('admin.ops.errorDetails.owner.provider') || 'provider' },
      { value: 'client', label: t('admin.ops.errorDetails.owner.client') || 'client' },
      { value: 'platform', label: t('admin.ops.errorDetails.owner.platform') || 'platform' },
    ],
    [t],
  )

  const viewModeSelectOptions = useMemo(
    () => [
      { value: 'errors', label: t('admin.ops.errorDetails.viewErrors') || 'errors' },
      { value: 'excluded', label: t('admin.ops.errorDetails.viewExcluded') || 'excluded' },
      { value: 'all', label: t('common.all') },
    ],
    [t],
  )

  const phaseSelectOptions = useMemo(
    () => [
      { value: '', label: t('common.all') },
      { value: 'request', label: t('admin.ops.errorDetails.phase.request') || 'request' },
      { value: 'auth', label: t('admin.ops.errorDetails.phase.auth') || 'auth' },
      { value: 'routing', label: t('admin.ops.errorDetails.phase.routing') || 'routing' },
      { value: 'upstream', label: t('admin.ops.errorDetails.phase.upstream') || 'upstream' },
      { value: 'network', label: t('admin.ops.errorDetails.phase.network') || 'network' },
      { value: 'internal', label: t('admin.ops.errorDetails.phase.internal') || 'internal' },
    ],
    [t],
  )

  const close = () => onUpdateShow(false)

  const fetchErrorLogs = useCallback(async () => {
    if (!show) return

    setLoading(true)
    try {
      const params: Record<string, unknown> = {
        page,
        page_size: pageSize,
        time_range: timeRange,
        view: viewMode,
      }

      const platformVal = String(platform || '').trim()
      if (platformVal) params.platform = platformVal
      if (typeof groupId === 'number' && groupId > 0) params.group_id = groupId

      if (q.trim()) params.q = q.trim()
      if (statusCode === 'other') params.status_codes_other = '1'
      else if (typeof statusCode === 'number') params.status_codes = String(statusCode)

      const phaseVal = String(phase || '').trim()
      if (phaseVal) params.phase = phaseVal

      const ownerVal = String(errorOwner || '').trim()
      if (ownerVal) params.error_owner = ownerVal

      const res =
        errorType === 'upstream'
          ? await adminOpsAPI.listUpstreamErrors(params)
          : await adminOpsAPI.listRequestErrors(params)
      setRows(res.items || [])
      setTotal(res.total || 0)
    } catch (err) {
      console.error('[OpsErrorDetailsModal] Failed to fetch error logs', err)
      setRows([])
      setTotal(0)
    } finally {
      setLoading(false)
    }
  }, [show, page, pageSize, timeRange, viewMode, platform, groupId, q, statusCode, phase, errorOwner, errorType])

  const resetFilters = useCallback(() => {
    setQ('')
    setStatusCode(null)
    setPhase(errorType === 'upstream' ? 'upstream' : '')
    setErrorOwner('')
    setViewMode('errors')
    setPage(1)
  }, [errorType])

  useEffect(() => {
    if (!show) return
    setPage(1)
    setPageSize(10)
    resetFilters()
  }, [show])

  useEffect(() => {
    if (!show) return
    fetchErrorLogs()
  }, [show, page, pageSize, timeRange, platform, groupId, statusCode, phase, errorOwner, viewMode])

  useEffect(() => {
    if (!show) return
    if (searchTimeout.current) clearTimeout(searchTimeout.current)
    searchTimeout.current = setTimeout(() => {
      setPage(1)
      fetchErrorLogs()
    }, 350)
    return () => {
      if (searchTimeout.current) clearTimeout(searchTimeout.current)
    }
  }, [q, show])

  return (
    <BaseDialog show={show} title={modalTitle} width="full" onClose={close}>
      <div className="flex h-full min-h-0 flex-col">
        <div className="mb-4 flex-shrink-0 border-b border-gray-200 pb-4 dark:border-dark-700">
          <div className="grid grid-cols-8 gap-2">
            <div className="col-span-2 compact-select">
              <div className="group relative">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                  <svg
                    className="h-3.5 w-3.5 text-gray-400 transition-colors group-focus-within:text-blue-500"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2.5}
                      d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                    />
                  </svg>
                </div>
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  type="text"
                  className="w-full rounded-lg border-gray-200 bg-gray-50/50 py-1.5 pl-9 pr-3 text-xs font-medium text-gray-700 transition-all focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-500/10 dark:border-dark-700 dark:bg-dark-900 dark:text-gray-300 dark:focus:bg-dark-800"
                  placeholder={t('admin.ops.errorDetails.searchPlaceholder')}
                />
              </div>
            </div>

            <div className="compact-select">
              <Select
                modelValue={statusCode}
                options={statusCodeSelectOptions}
                onUpdateModelValue={(v) => setStatusCode(v as number | 'other' | null)}
              />
            </div>
            <div className="compact-select">
              <Select modelValue={phase} options={phaseSelectOptions} onUpdateModelValue={(v) => setPhase(String(v ?? ''))} />
            </div>
            <div className="compact-select">
              <Select
                modelValue={errorOwner}
                options={ownerSelectOptions}
                onUpdateModelValue={(v) => setErrorOwner(String(v ?? ''))}
              />
            </div>
            <div className="compact-select">
              <Select
                modelValue={viewMode}
                options={viewModeSelectOptions}
                onUpdateModelValue={(v) => setViewMode(v as 'errors' | 'excluded' | 'all')}
              />
            </div>
            <div className="flex items-center justify-end">
              <button
                type="button"
                className="rounded-lg bg-gray-100 px-3 py-1.5 text-xs font-semibold text-gray-700 transition-colors hover:bg-gray-200 dark:bg-dark-700 dark:text-gray-300 dark:hover:bg-dark-600"
                onClick={() => {
                  resetFilters()
                  fetchErrorLogs()
                }}
              >
                {t('common.reset')}
              </button>
            </div>
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col">
          <div className="mb-2 flex-shrink-0 text-xs text-gray-500 dark:text-gray-400">
            {t('admin.ops.errorDetails.total')} {total}
          </div>
          <OpsErrorLogTable
            rows={rows}
            total={total}
            loading={loading}
            page={page}
            pageSize={pageSize}
            onOpenErrorDetail={onOpenErrorDetail}
            onUpdatePage={setPage}
            onUpdatePageSize={setPageSize}
          />
        </div>
      </div>
    </BaseDialog>
  )
}
