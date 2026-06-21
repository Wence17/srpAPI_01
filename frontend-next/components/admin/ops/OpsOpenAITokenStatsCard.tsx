'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useI18n } from '@/lib/i18n'
import Select from '@/components/common/Select'
import EmptyState from '@/components/common/EmptyState'
import {
  adminOpsAPI,
  type OpsOpenAITokenStatsResponse,
  type OpsOpenAITokenStatsTimeRange,
} from '@/lib/adminOps'
import { formatNumber } from '@/lib/format'

interface OpsOpenAITokenStatsCardProps {
  platformFilter?: string
  groupIdFilter?: number | null
  refreshToken: number
}

type ViewMode = 'topn' | 'pagination'

function formatRate(v?: number | null): string {
  if (typeof v !== 'number' || !Number.isFinite(v)) return '-'
  return v.toFixed(2)
}

function formatInt(v?: number | null): string {
  if (typeof v !== 'number' || !Number.isFinite(v)) return '-'
  return formatNumber(Math.round(v))
}

export default function OpsOpenAITokenStatsCard({
  platformFilter = '',
  groupIdFilter = null,
  refreshToken,
}: OpsOpenAITokenStatsCardProps) {
  const { t } = useI18n()

  const [loading, setLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [response, setResponse] = useState<OpsOpenAITokenStatsResponse | null>(null)
  const [timeRange, setTimeRange] = useState<OpsOpenAITokenStatsTimeRange>('30d')
  const [viewMode, setViewMode] = useState<ViewMode>('topn')
  const [topN, setTopN] = useState<number>(20)
  const [page, setPage] = useState<number>(1)
  const [pageSize, setPageSize] = useState<number>(20)

  const prevFiltersRef = useRef<string>('')

  const items = response?.items ?? []
  const total = response?.total ?? 0
  const totalPages = useMemo(() => {
    if (viewMode !== 'pagination') return 1
    const size = pageSize > 0 ? pageSize : 20
    return Math.max(1, Math.ceil(total / size))
  }, [viewMode, pageSize, total])

  const timeRangeOptions = useMemo(
    () => [
      { value: '30m', label: t('admin.ops.timeRange.30m') },
      { value: '1h', label: t('admin.ops.timeRange.1h') },
      { value: '1d', label: t('admin.ops.timeRange.1d') },
      { value: '15d', label: t('admin.ops.timeRange.15d') },
      { value: '30d', label: t('admin.ops.timeRange.30d') },
    ],
    [t],
  )

  const viewModeOptions = useMemo(
    () => [
      { value: 'topn', label: t('admin.ops.openaiTokenStats.viewModeTopN') },
      { value: 'pagination', label: t('admin.ops.openaiTokenStats.viewModePagination') },
    ],
    [t],
  )

  const topNOptions = useMemo(
    () => [
      { value: 10, label: 'Top 10' },
      { value: 20, label: 'Top 20' },
      { value: 50, label: 'Top 50' },
      { value: 100, label: 'Top 100' },
    ],
    [],
  )

  const pageSizeOptions = useMemo(
    () => [
      { value: 10, label: '10' },
      { value: 20, label: '20' },
      { value: 50, label: '50' },
      { value: 100, label: '100' },
    ],
    [],
  )

  const buildParams = useCallback(() => {
    const params: Record<string, unknown> = {
      time_range: timeRange,
      platform: platformFilter || undefined,
      group_id:
        typeof groupIdFilter === 'number' && groupIdFilter > 0 ? groupIdFilter : undefined,
    }
    if (viewMode === 'topn') {
      params.top_n = topN
    } else {
      params.page = page
      params.page_size = pageSize
    }
    return params
  }, [timeRange, platformFilter, groupIdFilter, viewMode, topN, page, pageSize])

  const loadData = useCallback(async () => {
    setLoading(true)
    setErrorMessage('')
    try {
      let res = await adminOpsAPI.getOpenAITokenStats(buildParams())
      if (viewMode === 'pagination' && page > Math.max(1, Math.ceil((res.total || 0) / pageSize))) {
        const lastPage = Math.max(1, Math.ceil((res.total || 0) / pageSize))
        setPage(lastPage)
        res = await adminOpsAPI.getOpenAITokenStats({ ...buildParams(), page: lastPage })
      }
      setResponse(res)
    } catch (err: unknown) {
      console.error('[OpsOpenAITokenStatsCard] Failed to load data', err)
      setResponse(null)
      setErrorMessage(
        err instanceof Error ? err.message : t('admin.ops.openaiTokenStats.failedToLoad'),
      )
    } finally {
      setLoading(false)
    }
  }, [buildParams, viewMode, page, pageSize, t])

  useEffect(() => {
    const filterKey = JSON.stringify({
      timeRange,
      viewMode,
      pageSize,
      platform: platformFilter,
      groupId: groupIdFilter,
    })
    const filtersChanged = prevFiltersRef.current !== '' && prevFiltersRef.current !== filterKey

    if (viewMode === 'pagination' && filtersChanged && page !== 1) {
      prevFiltersRef.current = filterKey
      setPage(1)
      return
    }

    prevFiltersRef.current = filterKey
    void loadData()
  }, [timeRange, viewMode, topN, page, pageSize, platformFilter, groupIdFilter, refreshToken, loadData])

  return (
    <section className="card p-4 md:p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-sm font-bold text-gray-900 dark:text-white">
          {t('admin.ops.openaiTokenStats.title')}
        </h3>
        <div className="flex flex-wrap items-center gap-2">
          <div className="w-36">
            <Select modelValue={timeRange} options={timeRangeOptions} onUpdateModelValue={(v) => setTimeRange(String(v) as OpsOpenAITokenStatsTimeRange)} />
          </div>
          <div className="w-36">
            <Select modelValue={viewMode} options={viewModeOptions} onUpdateModelValue={(v) => setViewMode(String(v) as ViewMode)} />
          </div>
          {viewMode === 'topn' ? (
            <div className="w-28">
              <Select modelValue={topN} options={topNOptions} onUpdateModelValue={(v) => setTopN(Number(v))} />
            </div>
          ) : (
            <>
              <div className="w-24">
                <Select modelValue={pageSize} options={pageSizeOptions} onUpdateModelValue={(v) => setPageSize(Number(v))} />
              </div>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                disabled={loading || page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                {t('admin.ops.openaiTokenStats.prevPage')}
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                disabled={loading || page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                {t('admin.ops.openaiTokenStats.nextPage')}
              </button>
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {t('admin.ops.openaiTokenStats.pageInfo', { page, total: totalPages })}
              </span>
            </>
          )}
        </div>
      </div>

      {errorMessage && (
        <div className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600 dark:bg-red-900/20 dark:text-red-400">
          {errorMessage}
        </div>
      )}

      {loading ? (
        <div className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">
          {t('admin.ops.loadingText')}
        </div>
      ) : items.length === 0 ? (
        <EmptyState title={t('common.noData')} description={t('admin.ops.openaiTokenStats.empty')} />
      ) : (
        <div className="space-y-3">
          <div className="overflow-hidden rounded-xl border border-gray-200 dark:border-dark-700">
            <div className="max-h-[420px] overflow-auto">
              <table className="min-w-full text-left text-xs md:text-sm">
                <thead className="sticky top-0 z-10 bg-white dark:bg-dark-800">
                  <tr className="border-b border-gray-200 text-gray-500 dark:border-dark-700 dark:text-gray-400">
                    <th className="px-2 py-2 font-semibold">{t('admin.ops.openaiTokenStats.table.model')}</th>
                    <th className="px-2 py-2 font-semibold">{t('admin.ops.openaiTokenStats.table.requestCount')}</th>
                    <th className="px-2 py-2 font-semibold">{t('admin.ops.openaiTokenStats.table.avgTokensPerSec')}</th>
                    <th className="px-2 py-2 font-semibold">{t('admin.ops.openaiTokenStats.table.avgFirstTokenMs')}</th>
                    <th className="px-2 py-2 font-semibold">{t('admin.ops.openaiTokenStats.table.totalOutputTokens')}</th>
                    <th className="px-2 py-2 font-semibold">{t('admin.ops.openaiTokenStats.table.avgDurationMs')}</th>
                    <th className="px-2 py-2 font-semibold">{t('admin.ops.openaiTokenStats.table.requestsWithFirstToken')}</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((row) => (
                    <tr
                      key={row.model}
                      className="border-b border-gray-100 text-gray-700 last:border-b-0 dark:border-dark-800 dark:text-gray-200"
                    >
                      <td className="px-2 py-2 font-medium">{row.model}</td>
                      <td className="px-2 py-2">{formatInt(row.request_count)}</td>
                      <td className="px-2 py-2">{formatRate(row.avg_tokens_per_sec)}</td>
                      <td className="px-2 py-2">{formatRate(row.avg_first_token_ms)}</td>
                      <td className="px-2 py-2">{formatInt(row.total_output_tokens)}</td>
                      <td className="px-2 py-2">{formatInt(row.avg_duration_ms)}</td>
                      <td className="px-2 py-2">{formatInt(row.requests_with_first_token)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          {viewMode === 'topn' && (
            <div className="mt-3 text-xs text-gray-500 dark:text-gray-400">
              {t('admin.ops.openaiTokenStats.totalModels', { total })}
            </div>
          )}
        </div>
      )}
    </section>
  )
}
