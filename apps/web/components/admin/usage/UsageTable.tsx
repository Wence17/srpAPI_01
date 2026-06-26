'use client'

import { useCallback, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useI18n } from '@/lib/i18n'
import DataTable from '@/components/common/DataTable'
import EmptyState from '@/components/common/EmptyState'
import Icon from '@/components/icons/Icon'
import type { Column } from '@/components/common/types'
import type { AdminUsageLog } from '@/lib/types'
import { formatDateTime, formatReasoningEffort } from '@/lib/format'
import { formatCacheTokens, formatMultiplier } from '@/lib/formatters'
import { formatTokenPricePerMillion } from '@/lib/usagePricing'
import { getUsageServiceTierLabel } from '@/lib/usageServiceTier'
import { resolveUsageRequestType } from '@/lib/usageRequestType'
import {
  BILLING_MODE_IMAGE,
  BILLING_MODE_TOKEN,
  getBillingModeBadgeClass,
  getBillingModeLabel,
} from '@/lib/billingMode'
import {
  formatImageBillingSize,
  formatImageInputSize,
  formatImageOutputSize,
  formatImageSizeBreakdown,
  formatImageSizeSource,
} from '@/lib/imageUsage'

interface UsageTableProps {
  data: AdminUsageLog[]
  loading?: boolean
  columns: Column[]
  serverSideSort?: boolean
  defaultSortKey?: string
  defaultSortOrder?: 'asc' | 'desc'
  onSort: (key: string, order: 'asc' | 'desc') => void
  onUserClick: (userId: number) => void
}

function accountBilled(row: {
  total_cost?: number | null
  account_stats_cost?: number | null
  account_rate_multiplier?: number | null
}): number {
  const base = row.account_stats_cost != null ? row.account_stats_cost : (row.total_cost ?? 0)
  const result = base * (row.account_rate_multiplier ?? 1)
  return Number.isNaN(result) ? 0 : result
}

function formatDuration(ms: number | null | undefined): string {
  if (ms == null) return '-'
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(2)}s`
}

export default function UsageTable({
  data,
  loading = false,
  columns,
  serverSideSort = false,
  defaultSortKey = 'created_at',
  defaultSortOrder = 'desc',
  onSort,
  onUserClick,
}: UsageTableProps) {
  const { t } = useI18n()

  const [tooltipVisible, setTooltipVisible] = useState(false)
  const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0 })
  const [tooltipData, setTooltipData] = useState<AdminUsageLog | null>(null)

  const [tokenTooltipVisible, setTokenTooltipVisible] = useState(false)
  const [tokenTooltipPosition, setTokenTooltipPosition] = useState({ x: 0, y: 0 })
  const [tokenTooltipData, setTokenTooltipData] = useState<AdminUsageLog | null>(null)

  const isImageUsage = useCallback((row: Pick<AdminUsageLog, 'image_count'> | null | undefined) => {
    return (row?.image_count ?? 0) > 0
  }, [])

  const getDisplayBillingMode = useCallback(
    (row: Pick<AdminUsageLog, 'billing_mode' | 'image_count'> | null | undefined) => {
      if (isImageUsage(row)) return BILLING_MODE_IMAGE
      return row?.billing_mode
    },
    [isImageUsage],
  )

  const imageUnitPrice = useCallback((row: AdminUsageLog | null): number => {
    if (!row || row.image_count <= 0) return 0
    const total = row.total_cost ?? 0
    const price = total / row.image_count
    return Number.isFinite(price) ? price : 0
  }, [])

  const getRequestTypeLabel = useCallback(
    (row: AdminUsageLog): string => {
      const requestType = resolveUsageRequestType(row)
      if (requestType === 'ws_v2') return t('usage.ws')
      if (requestType === 'stream') return t('usage.stream')
      if (requestType === 'sync') return t('usage.sync')
      return t('usage.unknown')
    },
    [t],
  )

  const getRequestTypeBadgeClass = useCallback((row: AdminUsageLog): string => {
    const requestType = resolveUsageRequestType(row)
    if (requestType === 'ws_v2') return 'bg-violet-100 text-violet-800 dark:bg-violet-900 dark:text-violet-200'
    if (requestType === 'stream') return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
    if (requestType === 'sync') return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200'
    return 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200'
  }, [])

  const showTooltip = (event: React.MouseEvent, row: AdminUsageLog) => {
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
    setTooltipData(row)
    setTooltipPosition({ x: rect.right + 8, y: rect.top + rect.height / 2 })
    setTooltipVisible(true)
  }

  const showTokenTooltip = (event: React.MouseEvent, row: AdminUsageLog) => {
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
    setTokenTooltipData(row)
    setTokenTooltipPosition({ x: rect.right + 8, y: rect.top + rect.height / 2 })
    setTokenTooltipVisible(true)
  }

  const tableCells = useMemo(
    () => ({
      user: ({ row }: { row: AdminUsageLog }) => (
        <div className="text-sm">
          {row.user?.email ? (
            <button
              type="button"
              className="font-medium text-primary-600 underline decoration-dashed underline-offset-2 transition-colors hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300"
              onClick={() => onUserClick(row.user_id)}
              title={t('admin.usage.clickToViewBalance')}
            >
              {row.user.email}
            </button>
          ) : (
            <span className="font-medium text-gray-900 dark:text-white">-</span>
          )}
          {row.user?.deleted_at ? (
            <span className="ml-1 inline-flex items-center rounded px-1 py-px text-[10px] font-medium leading-tight bg-rose-100 text-rose-600 ring-1 ring-inset ring-rose-200 dark:bg-rose-500/20 dark:text-rose-400 dark:ring-rose-500/30">
              {t('admin.usage.userDeletedBadge')}
            </span>
          ) : null}
          <span className="ml-1 text-gray-500 dark:text-gray-400">#{row.user_id}</span>
        </div>
      ),
      api_key: ({ row }: { row: AdminUsageLog }) => (
        <span className="text-sm text-gray-900 dark:text-white">{row.api_key?.name || '-'}</span>
      ),
      account: ({ row }: { row: AdminUsageLog }) => (
        <span className="text-sm text-gray-900 dark:text-white">{row.account?.name || '-'}</span>
      ),
      model: ({ row }: { row: AdminUsageLog }) => {
        if (row.model_mapping_chain && row.model_mapping_chain.includes('→')) {
          return (
            <div className="space-y-0.5 text-xs">
              {row.model_mapping_chain.split('→').map((step, i) => (
                <div
                  key={i}
                  className={`break-all ${i === 0 ? 'font-medium text-gray-900 dark:text-white' : 'text-gray-500 dark:text-gray-400'}`}
                  style={i > 0 ? { paddingLeft: `${i * 0.75}rem` } : undefined}
                >
                  {i > 0 ? <span className="mr-0.5">↳</span> : null}
                  {step}
                </div>
              ))}
            </div>
          )
        }
        if (row.upstream_model && row.upstream_model !== row.model) {
          return (
            <div className="space-y-0.5 text-xs">
              <div className="break-all font-medium text-gray-900 dark:text-white">{row.model}</div>
              <div className="break-all text-gray-500 dark:text-gray-400">
                <span className="mr-0.5">↳</span>
                {row.upstream_model}
              </div>
            </div>
          )
        }
        return <span className="font-medium text-gray-900 dark:text-white">{row.model}</span>
      },
      reasoning_effort: ({ row }: { row: AdminUsageLog }) => (
        <span className="text-sm text-gray-900 dark:text-white">{formatReasoningEffort(row.reasoning_effort)}</span>
      ),
      endpoint: ({ row }: { row: AdminUsageLog }) => (
        <div className="max-w-[320px] space-y-1 text-xs">
          <div className="break-all text-gray-700 dark:text-gray-300">
            <span className="font-medium text-gray-500 dark:text-gray-400">{t('usage.inbound')}:</span>
            <span className="ml-1">{row.inbound_endpoint?.trim() || '-'}</span>
          </div>
          <div className="break-all text-gray-700 dark:text-gray-300">
            <span className="font-medium text-gray-500 dark:text-gray-400">{t('usage.upstream')}:</span>
            <span className="ml-1">{row.upstream_endpoint?.trim() || '-'}</span>
          </div>
        </div>
      ),
      group: ({ row }: { row: AdminUsageLog }) =>
        row.group ? (
          <span className="inline-flex items-center rounded px-2 py-0.5 text-xs font-medium bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200">
            {row.group.name}
          </span>
        ) : (
          <span className="text-sm text-gray-400 dark:text-gray-500">-</span>
        ),
      stream: ({ row }: { row: AdminUsageLog }) => (
        <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ${getRequestTypeBadgeClass(row)}`}>
          {getRequestTypeLabel(row)}
        </span>
      ),
      billing_mode: ({ row }: { row: AdminUsageLog }) => (
        <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ${getBillingModeBadgeClass(getDisplayBillingMode(row))}`}>
          {getBillingModeLabel(getDisplayBillingMode(row), t)}
        </span>
      ),
      tokens: ({ row }: { row: AdminUsageLog }) =>
        isImageUsage(row) ? (
          <div className="flex items-center gap-1.5">
            <svg className="h-4 w-4 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <span className="font-medium text-gray-900 dark:text-white">
              {row.image_count}
              {t('usage.imageUnit')}
            </span>
            <span className="text-gray-400">({formatImageBillingSize(row, t)})</span>
          </div>
        ) : (
          <div className="flex items-center gap-1.5">
            <div className="space-y-1 text-sm">
              <div className="flex items-center gap-2">
                <div className="inline-flex items-center gap-1">
                  <Icon name="arrowDown" size="sm" className="h-3.5 w-3.5 text-emerald-500" />
                  <span className="font-medium text-gray-900 dark:text-white">{(row.input_tokens ?? 0).toLocaleString()}</span>
                </div>
                <div className="inline-flex items-center gap-1">
                  <Icon name="arrowUp" size="sm" className="h-3.5 w-3.5 text-violet-500" />
                  <span className="font-medium text-gray-900 dark:text-white">{(row.output_tokens ?? 0).toLocaleString()}</span>
                </div>
              </div>
              {row.cache_read_tokens > 0 || row.cache_creation_tokens > 0 ? (
                <div className="flex items-center gap-2">
                  {row.cache_read_tokens > 0 ? (
                    <div className="inline-flex items-center gap-1">
                      <svg className="h-3.5 w-3.5 text-sky-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
                      </svg>
                      <span className="font-medium text-sky-600 dark:text-sky-400">{formatCacheTokens(row.cache_read_tokens)}</span>
                    </div>
                  ) : null}
                  {row.cache_creation_tokens > 0 ? (
                    <div className="inline-flex items-center gap-1">
                      <svg className="h-3.5 w-3.5 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                      <span className="font-medium text-amber-600 dark:text-amber-400">{formatCacheTokens(row.cache_creation_tokens)}</span>
                      {row.cache_creation_1h_tokens > 0 ? (
                        <span className="inline-flex items-center rounded px-1 py-px text-[10px] font-medium leading-tight bg-orange-100 text-orange-600 ring-1 ring-inset ring-orange-200 dark:bg-orange-500/20 dark:text-orange-400 dark:ring-orange-500/30">1h</span>
                      ) : null}
                      {row.cache_ttl_overridden ? (
                        <span title={t('usage.cacheTtlOverriddenHint')} className="inline-flex cursor-help items-center rounded px-1 py-px text-[10px] font-medium leading-tight bg-rose-100 text-rose-600 ring-1 ring-inset ring-rose-200 dark:bg-rose-500/20 dark:text-rose-400 dark:ring-rose-500/30">R</span>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
            <div className="group relative" onMouseEnter={(e) => showTokenTooltip(e, row)} onMouseLeave={() => setTokenTooltipVisible(false)}>
              <div className="flex h-4 w-4 cursor-help items-center justify-center rounded-full bg-gray-100 transition-colors group-hover:bg-blue-100 dark:bg-gray-700 dark:group-hover:bg-blue-900/50">
                <Icon name="infoCircle" size="xs" className="text-gray-400 group-hover:text-blue-500 dark:text-gray-500 dark:group-hover:text-blue-400" />
              </div>
            </div>
          </div>
        ),
      cost: ({ row }: { row: AdminUsageLog }) => (
        <div className="text-sm">
          <div className="flex items-center gap-1.5">
            <span className="font-medium text-green-600 dark:text-green-400">${(row.actual_cost ?? 0).toFixed(6)}</span>
            <div className="group relative" onMouseEnter={(e) => showTooltip(e, row)} onMouseLeave={() => setTooltipVisible(false)}>
              <div className="flex h-4 w-4 cursor-help items-center justify-center rounded-full bg-gray-100 transition-colors group-hover:bg-blue-100 dark:bg-gray-700 dark:group-hover:bg-blue-900/50">
                <Icon name="infoCircle" size="xs" className="text-gray-400 group-hover:text-blue-500 dark:text-gray-500 dark:group-hover:text-blue-400" />
              </div>
            </div>
          </div>
          {row.account_rate_multiplier != null ? (
            <div className="mt-0.5 text-[11px] text-orange-500 dark:text-orange-400">
              A ${accountBilled(row).toFixed(6)}
            </div>
          ) : null}
        </div>
      ),
      first_token: ({ row }: { row: AdminUsageLog }) =>
        row.first_token_ms != null ? (
          <span className="text-sm text-gray-600 dark:text-gray-400">{formatDuration(row.first_token_ms)}</span>
        ) : (
          <span className="text-sm text-gray-400 dark:text-gray-500">-</span>
        ),
      duration: ({ row }: { row: AdminUsageLog }) => (
        <span className="text-sm text-gray-600 dark:text-gray-400">{formatDuration(row.duration_ms)}</span>
      ),
      created_at: ({ value }: { value: string }) => (
        <span className="text-sm text-gray-600 dark:text-gray-400">{formatDateTime(value)}</span>
      ),
      user_agent: ({ row }: { row: AdminUsageLog }) =>
        row.user_agent ? (
          <span className="block max-w-[320px] truncate text-sm text-gray-600 dark:text-gray-400" title={row.user_agent}>
            {row.user_agent}
          </span>
        ) : (
          <span className="text-sm text-gray-400 dark:text-gray-500">-</span>
        ),
      ip_address: ({ row }: { row: AdminUsageLog }) =>
        row.ip_address ? (
          <span className="font-mono text-sm text-gray-600 dark:text-gray-400">{row.ip_address}</span>
        ) : (
          <span className="text-sm text-gray-400 dark:text-gray-500">-</span>
        ),
    }),
    [getDisplayBillingMode, getRequestTypeBadgeClass, getRequestTypeLabel, isImageUsage, onUserClick, t],
  )

  return (
    <>
      <div className="card overflow-hidden">
        <div className="overflow-auto">
          <DataTable
            columns={columns}
            data={data}
            loading={loading}
            serverSideSort={serverSideSort}
            defaultSortKey={defaultSortKey}
            defaultSortOrder={defaultSortOrder}
            onSort={onSort}
            cells={tableCells}
            emptySlot={<EmptyState message={t('usage.noRecords')} />}
          />
        </div>
      </div>

      {typeof document !== 'undefined' && tokenTooltipVisible && tokenTooltipData
        ? createPortal(
            <div className="pointer-events-none fixed z-[9999] -translate-y-1/2" style={{ left: tokenTooltipPosition.x, top: tokenTooltipPosition.y }}>
              <div className="whitespace-nowrap rounded-lg border border-gray-700 bg-gray-900 px-3 py-2.5 text-xs text-white shadow-xl dark:border-gray-600 dark:bg-gray-800">
                <div className="space-y-1.5">
                  <div className="mb-1 text-xs font-semibold text-gray-300">{t('usage.tokenDetails')}</div>
                  {tokenTooltipData.input_tokens > 0 ? (
                    <div className="flex items-center justify-between gap-4">
                      <span className="text-gray-400">{t('admin.usage.inputTokens')}</span>
                      <span className="font-medium text-white">{tokenTooltipData.input_tokens.toLocaleString()}</span>
                    </div>
                  ) : null}
                  {tokenTooltipData.output_tokens > 0 ? (
                    <div className="flex items-center justify-between gap-4">
                      <span className="text-gray-400">{t('admin.usage.outputTokens')}</span>
                      <span className="font-medium text-white">{tokenTooltipData.output_tokens.toLocaleString()}</span>
                    </div>
                  ) : null}
                  <div className="flex items-center justify-between gap-6 border-t border-gray-700 pt-1.5">
                    <span className="text-gray-400">{t('usage.totalTokens')}</span>
                    <span className="font-semibold text-blue-400">
                      {(
                        tokenTooltipData.input_tokens +
                        tokenTooltipData.output_tokens +
                        tokenTooltipData.cache_creation_tokens +
                        tokenTooltipData.cache_read_tokens
                      ).toLocaleString()}
                    </span>
                  </div>
                </div>
                <div className="absolute right-full top-1/2 h-0 w-0 -translate-y-1/2 border-b-[6px] border-r-[6px] border-t-[6px] border-b-transparent border-r-gray-900 border-t-transparent dark:border-r-gray-800" />
              </div>
            </div>,
            document.body,
          )
        : null}

      {typeof document !== 'undefined' && tooltipVisible && tooltipData
        ? createPortal(
            <div className="pointer-events-none fixed z-[9999] -translate-y-1/2" style={{ left: tooltipPosition.x, top: tooltipPosition.y }}>
              <div className="whitespace-nowrap rounded-lg border border-gray-700 bg-gray-900 px-3 py-2.5 text-xs text-white shadow-xl dark:border-gray-600 dark:bg-gray-800">
                <div className="space-y-1.5">
                  <div className="mb-2 border-b border-gray-700 pb-1.5">
                    <div className="mb-1 text-xs font-semibold text-gray-300">{t('usage.costDetails')}</div>
                    {tooltipData.input_cost > 0 ? (
                      <div className="flex items-center justify-between gap-4">
                        <span className="text-gray-400">{t('admin.usage.inputCost')}</span>
                        <span className="font-medium text-white">${tooltipData.input_cost.toFixed(6)}</span>
                      </div>
                    ) : null}
                    {tooltipData.output_cost > 0 ? (
                      <div className="flex items-center justify-between gap-4">
                        <span className="text-gray-400">{t('admin.usage.outputCost')}</span>
                        <span className="font-medium text-white">${tooltipData.output_cost.toFixed(6)}</span>
                      </div>
                    ) : null}
                  </div>
                  <div className="flex items-center justify-between gap-6">
                    <span className="text-gray-400">{t('usage.rate')}</span>
                    <span className="font-semibold text-blue-400">{formatMultiplier(tooltipData.rate_multiplier || 1)}x</span>
                  </div>
                  <div className="flex items-center justify-between gap-6">
                    <span className="text-gray-400">{t('usage.userBilled')}</span>
                    <span className="font-semibold text-green-400">${(tooltipData.actual_cost ?? 0).toFixed(6)}</span>
                  </div>
                  <div className="flex items-center justify-between gap-6 border-t border-gray-700 pt-1.5">
                    <span className="text-gray-400">{t('usage.accountBilled')}</span>
                    <span className="font-semibold text-green-400">${accountBilled(tooltipData).toFixed(6)}</span>
                  </div>
                </div>
                <div className="absolute right-full top-1/2 h-0 w-0 -translate-y-1/2 border-b-[6px] border-r-[6px] border-t-[6px] border-b-transparent border-r-gray-900 border-t-transparent dark:border-r-gray-800" />
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  )
}
