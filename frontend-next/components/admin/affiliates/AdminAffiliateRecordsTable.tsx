'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useI18n } from '@/lib/i18n'
import { useApp } from '@/context/AppContext'
import { extractI18nErrorMessage } from '@/lib/apiError'
import { formatDateTime } from '@/lib/format'
import { getPersistedPageSize, setPersistedPageSize } from '@/lib/usePersistedPageSize'
import {
  adminAffiliatesAPI,
  type AffiliateInviteRecord,
  type AffiliateRebateRecord,
  type AffiliateTransferRecord,
  type AffiliateUserOverview,
  type ListAffiliateRecordsParams,
} from '@/lib/adminAffiliates'
import AppLayout from '@/components/layout/AppLayout'
import TablePageLayout from '@/components/layout/TablePageLayout'
import DataTable from '@/components/common/DataTable'
import Pagination from '@/components/common/Pagination'
import BaseDialog from '@/components/common/BaseDialog'
import Icon from '@/components/icons/Icon'
import OrderStatusBadge from '@/components/payment/OrderStatusBadge'
import type { OrderStatus } from '@/lib/payment/types'
import type { Column } from '@/components/common/types'

type RecordType = 'invites' | 'rebates' | 'transfers'
type AffiliateRecord = AffiliateInviteRecord | AffiliateRebateRecord | AffiliateTransferRecord

interface AdminAffiliateRecordsTableProps {
  type: RecordType
}

function formatAmount(value: number | null | undefined): string {
  return Number(value || 0).toFixed(2)
}

function formatPercent(value: number | null | undefined): string {
  const rounded = Math.round(Number(value || 0) * 100) / 100
  return `${Number.isInteger(rounded) ? rounded.toString() : rounded.toString()}%`
}

function userTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone
  } catch {
    return 'UTC'
  }
}

function AffiliateUserCell({
  id,
  email,
  username,
  clickable,
  onOpen,
}: {
  id: number
  email: string
  username: string
  clickable: boolean
  onOpen: (userId: number) => void
}) {
  const emailNode = clickable ? (
    <button
      type="button"
      onClick={() => onOpen(id)}
      className="max-w-56 truncate text-left text-sm font-medium text-primary-600 hover:text-primary-700 hover:underline dark:text-primary-400 dark:hover:text-primary-300"
    >
      {email || '-'}
    </button>
  ) : (
    <div className="max-w-56 truncate text-sm text-gray-700 dark:text-gray-300">{email || '-'}</div>
  )

  return (
    <div className="space-y-0.5">
      <div className="font-mono text-sm text-gray-900 dark:text-white">#{id}</div>
      {emailNode}
      <div className="max-w-56 truncate text-sm text-gray-500 dark:text-dark-400">{username || '-'}</div>
    </div>
  )
}

function AmountText({ value, strong = false }: { value: number; strong?: boolean }) {
  return (
    <span
      className={
        strong
          ? 'text-sm font-semibold text-emerald-600 dark:text-emerald-400'
          : 'text-sm text-gray-900 dark:text-white'
      }
    >
      ${formatAmount(value)}
    </span>
  )
}

function NullableAmountText({ value }: { value: number | null | undefined }) {
  if (value === null || value === undefined) {
    return <span className="text-sm text-gray-400 dark:text-dark-500">-</span>
  }
  return <AmountText value={value} />
}

function OverviewStat({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-lg border border-gray-100 bg-white p-3 dark:border-dark-700 dark:bg-dark-900">
      <div className="text-sm text-gray-500 dark:text-dark-400">{label}</div>
      <div
        className={
          mono
            ? 'mt-1 font-mono text-base font-semibold text-gray-900 dark:text-white'
            : 'mt-1 text-base font-semibold text-gray-900 dark:text-white'
        }
      >
        {value}
      </div>
    </div>
  )
}

export default function AdminAffiliateRecordsTable({ type }: AdminAffiliateRecordsTableProps) {
  const { t } = useI18n()
  const appStore = useApp()

  const sortStorageKey = `admin-affiliate-${type}-table-sort`

  const [loading, setLoading] = useState(false)
  const [records, setRecords] = useState<AffiliateRecord[]>([])
  const [filters, setFilters] = useState({ search: '', start_at: '', end_at: '' })
  const [pagination, setPagination] = useState({
    page: 1,
    page_size: getPersistedPageSize(),
    total: 0,
  })
  const [sortState, setSortState] = useState<{ sort_by: string; sort_order: 'asc' | 'desc' }>({
    sort_by: 'created_at',
    sort_order: 'desc',
  })

  const [overviewDialog, setOverviewDialog] = useState(false)
  const [overviewLoading, setOverviewLoading] = useState(false)
  const [selectedOverview, setSelectedOverview] = useState<AffiliateUserOverview | null>(null)

  const filtersRef = useRef(filters)
  filtersRef.current = filters
  const paginationRef = useRef(pagination)
  paginationRef.current = pagination
  const sortStateRef = useRef(sortState)
  sortStateRef.current = sortState

  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const columns = useMemo<Column[]>(() => {
    if (type === 'invites') {
      return [
        { key: 'inviter', label: t('admin.affiliates.records.inviter'), sortable: true },
        { key: 'invitee', label: t('admin.affiliates.records.invitee'), sortable: true },
        { key: 'aff_code', label: t('admin.affiliates.records.affCode'), sortable: true },
        { key: 'total_rebate', label: t('admin.affiliates.records.totalRebate'), sortable: true },
        { key: 'created_at', label: t('admin.affiliates.records.invitedAt'), sortable: true },
      ]
    }
    if (type === 'rebates') {
      return [
        { key: 'order', label: t('admin.affiliates.records.order'), sortable: true },
        { key: 'inviter', label: t('admin.affiliates.records.inviter'), sortable: true },
        { key: 'invitee', label: t('admin.affiliates.records.invitee'), sortable: true },
        { key: 'order_amount', label: t('admin.affiliates.records.orderAmount'), sortable: true },
        { key: 'pay_amount', label: t('admin.affiliates.records.payAmount'), sortable: true },
        { key: 'rebate_amount', label: t('admin.affiliates.records.rebateAmount') },
        { key: 'payment_type', label: t('admin.affiliates.records.paymentType'), sortable: true },
        { key: 'order_status', label: t('admin.affiliates.records.orderStatus'), sortable: true },
        { key: 'created_at', label: t('admin.affiliates.records.rebatedAt'), sortable: true },
      ]
    }
    return [
      { key: 'user', label: t('admin.affiliates.records.user'), sortable: true },
      { key: 'amount', label: t('admin.affiliates.records.transferAmount'), sortable: true },
      { key: 'balance_after', label: t('admin.affiliates.records.balanceAfter'), sortable: true },
      { key: 'available_quota_after', label: t('admin.affiliates.records.availableQuotaAfter'), sortable: true },
      { key: 'frozen_quota_after', label: t('admin.affiliates.records.frozenQuotaAfter'), sortable: true },
      { key: 'history_quota_after', label: t('admin.affiliates.records.historyQuotaAfter'), sortable: true },
      { key: 'created_at', label: t('admin.affiliates.records.transferredAt'), sortable: true },
    ]
  }, [t, type])

  const buildParams = useCallback((): ListAffiliateRecordsParams => {
    const currentFilters = filtersRef.current
    const currentPagination = paginationRef.current
    const currentSort = sortStateRef.current
    return {
      page: currentPagination.page,
      page_size: currentPagination.page_size,
      search: currentFilters.search.trim() || undefined,
      start_at: currentFilters.start_at || undefined,
      end_at: currentFilters.end_at || undefined,
      sort_by: currentSort.sort_by,
      sort_order: currentSort.sort_order,
      timezone: userTimezone(),
    }
  }, [])

  const fetchRecords = useCallback(
    async (params: ListAffiliateRecordsParams) => {
      if (type === 'invites') return adminAffiliatesAPI.listInviteRecords(params)
      if (type === 'rebates') return adminAffiliatesAPI.listRebateRecords(params)
      return adminAffiliatesAPI.listTransferRecords(params)
    },
    [type],
  )

  const loadRecords = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetchRecords(buildParams())
      setRecords(res.items || [])
      setPagination((prev) => ({ ...prev, total: res.total || 0 }))
    } catch (err: unknown) {
      appStore.showError(extractI18nErrorMessage(err, t, 'admin.affiliates.errors', t('common.error')))
    } finally {
      setLoading(false)
    }
  }, [appStore, buildParams, fetchRecords, t])

  useEffect(() => {
    loadRecords()
    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current)
    }
  }, [loadRecords])

  function debounceLoad() {
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current)
    debounceTimerRef.current = setTimeout(() => {
      paginationRef.current = { ...paginationRef.current, page: 1 }
      setPagination((prev) => ({ ...prev, page: 1 }))
      loadRecords()
    }, 300)
  }

  function reloadFromFirstPage() {
    paginationRef.current = { ...paginationRef.current, page: 1 }
    setPagination((prev) => ({ ...prev, page: 1 }))
    loadRecords()
  }

  function handlePageChange(page: number) {
    paginationRef.current = { ...paginationRef.current, page }
    setPagination((prev) => ({ ...prev, page }))
    loadRecords()
  }

  function handlePageSizeChange(size: number) {
    setPersistedPageSize(size)
    paginationRef.current = { ...paginationRef.current, page_size: size, page: 1 }
    setPagination((prev) => ({ ...prev, page_size: size, page: 1 }))
    loadRecords()
  }

  function handleSort(key: string, order: 'asc' | 'desc') {
    sortStateRef.current = { sort_by: key, sort_order: order }
    setSortState({ sort_by: key, sort_order: order })
    paginationRef.current = { ...paginationRef.current, page: 1 }
    setPagination((prev) => ({ ...prev, page: 1 }))
    loadRecords()
  }

  async function openUserOverview(userId: number) {
    if (!userId) return
    setOverviewDialog(true)
    setOverviewLoading(true)
    setSelectedOverview(null)
    try {
      const overview = await adminAffiliatesAPI.getUserOverview(userId)
      setSelectedOverview(overview)
    } catch (err: unknown) {
      setOverviewDialog(false)
      appStore.showError(extractI18nErrorMessage(err, t, 'admin.affiliates.errors', t('common.error')))
    } finally {
      setOverviewLoading(false)
    }
  }

  const userClickable = type !== 'transfers'

  const cells = useMemo(() => {
    const open = openUserOverview
    return {
      inviter: ({ row }: { row: AffiliateRecord }) => {
        const item = row as AffiliateInviteRecord | AffiliateRebateRecord
        return (
          <AffiliateUserCell
            id={item.inviter_id}
            email={item.inviter_email}
            username={item.inviter_username}
            clickable={userClickable}
            onOpen={open}
          />
        )
      },
      invitee: ({ row }: { row: AffiliateRecord }) => {
        const item = row as AffiliateInviteRecord | AffiliateRebateRecord
        return (
          <AffiliateUserCell
            id={item.invitee_id}
            email={item.invitee_email}
            username={item.invitee_username}
            clickable={userClickable}
            onOpen={open}
          />
        )
      },
      user: ({ row }: { row: AffiliateRecord }) => {
        const item = row as AffiliateTransferRecord
        return (
          <AffiliateUserCell
            id={item.user_id}
            email={item.user_email}
            username={item.username}
            clickable
            onOpen={open}
          />
        )
      },
      aff_code: ({ value }: { value: unknown }) => (
        <span className="font-mono text-sm text-gray-700 dark:text-gray-300">{(value as string) || '-'}</span>
      ),
      order: ({ row }: { row: AffiliateRecord }) => {
        const item = row as AffiliateRebateRecord
        return (
          <div className="space-y-0.5">
            <div className="font-mono text-sm text-gray-900 dark:text-white">#{item.order_id}</div>
            <div className="max-w-56 truncate text-sm text-gray-500 dark:text-dark-400">{item.out_trade_no}</div>
          </div>
        )
      },
      payment_type: ({ row }: { row: AffiliateRecord }) => {
        const item = row as AffiliateRebateRecord
        return t('payment.methods.' + item.payment_type, item.payment_type || '-')
      },
      order_status: ({ row }: { row: AffiliateRecord }) => {
        const item = row as AffiliateRebateRecord
        return <OrderStatusBadge status={item.order_status as OrderStatus} />
      },
      total_rebate: ({ row }: { row: AffiliateRecord }) => (
        <AmountText value={(row as AffiliateInviteRecord).total_rebate} />
      ),
      order_amount: ({ row }: { row: AffiliateRecord }) => (
        <AmountText value={(row as AffiliateRebateRecord).order_amount} />
      ),
      pay_amount: ({ row }: { row: AffiliateRecord }) => (
        <span className="text-sm text-gray-900 dark:text-white">
          ¥{formatAmount((row as AffiliateRebateRecord).pay_amount)}
        </span>
      ),
      rebate_amount: ({ row }: { row: AffiliateRecord }) => (
        <AmountText value={(row as AffiliateRebateRecord).rebate_amount} strong />
      ),
      amount: ({ row }: { row: AffiliateRecord }) => (
        <AmountText value={(row as AffiliateTransferRecord).amount} strong />
      ),
      balance_after: ({ row }: { row: AffiliateRecord }) => (
        <NullableAmountText value={(row as AffiliateTransferRecord).balance_after} />
      ),
      available_quota_after: ({ row }: { row: AffiliateRecord }) => (
        <NullableAmountText value={(row as AffiliateTransferRecord).available_quota_after} />
      ),
      frozen_quota_after: ({ row }: { row: AffiliateRecord }) => (
        <NullableAmountText value={(row as AffiliateTransferRecord).frozen_quota_after} />
      ),
      history_quota_after: ({ row }: { row: AffiliateRecord }) => (
        <NullableAmountText value={(row as AffiliateTransferRecord).history_quota_after} />
      ),
      created_at: ({ value }: { value: unknown }) => (
        <span className="text-sm text-gray-700 dark:text-gray-300">
          {value ? formatDateTime(value as string) : '-'}
        </span>
      ),
    }
  }, [t, userClickable])

  return (
    <AppLayout>
      <TablePageLayout
        filters={
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative w-full md:w-80">
              <Icon
                name="search"
                size="md"
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
              />
              <input
                type="text"
                value={filters.search}
                onChange={(event) => {
                  const next = event.target.value
                  filtersRef.current = { ...filtersRef.current, search: next }
                  setFilters((prev) => ({ ...prev, search: next }))
                  debounceLoad()
                }}
                className="input pl-10"
                placeholder={t('admin.affiliates.records.searchPlaceholder')}
              />
            </div>
            <input
              type="date"
              value={filters.start_at}
              onChange={(event) => {
                const next = event.target.value
                filtersRef.current = { ...filtersRef.current, start_at: next }
                setFilters((prev) => ({ ...prev, start_at: next }))
                reloadFromFirstPage()
              }}
              className="input w-full sm:w-44"
              title={t('admin.affiliates.records.startAt')}
            />
            <input
              type="date"
              value={filters.end_at}
              onChange={(event) => {
                const next = event.target.value
                filtersRef.current = { ...filtersRef.current, end_at: next }
                setFilters((prev) => ({ ...prev, end_at: next }))
                reloadFromFirstPage()
              }}
              className="input w-full sm:w-44"
              title={t('admin.affiliates.records.endAt')}
            />
            <button
              type="button"
              className="btn btn-secondary px-2 md:px-3"
              disabled={loading}
              title={t('common.refresh')}
              onClick={() => loadRecords()}
            >
              <Icon name="refresh" size="md" className={loading ? 'animate-spin' : ''} />
            </button>
          </div>
        }
        table={
          <DataTable
            columns={columns}
            data={records}
            loading={loading}
            serverSideSort
            defaultSortKey="created_at"
            defaultSortOrder="desc"
            sortStorageKey={sortStorageKey}
            onSort={handleSort}
            cells={cells}
          />
        }
        pagination={
          pagination.total > 0 ? (
            <Pagination
              page={pagination.page}
              total={pagination.total}
              pageSize={pagination.page_size}
              onUpdatePage={handlePageChange}
              onUpdatePageSize={handlePageSizeChange}
            />
          ) : null
        }
      />

      <BaseDialog
        show={overviewDialog}
        title={t('admin.affiliates.overview.title')}
        onClose={() => setOverviewDialog(false)}
      >
        {overviewLoading ? (
          <div className="flex justify-center py-8">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary-500 border-t-transparent" />
          </div>
        ) : selectedOverview ? (
          <div className="space-y-4">
            <div className="rounded-lg border border-gray-100 bg-gray-50 p-4 dark:border-dark-700 dark:bg-dark-800">
              <div className="font-mono text-sm text-gray-900 dark:text-white">#{selectedOverview.user_id}</div>
              <div className="mt-1 text-sm font-medium text-gray-900 dark:text-white">
                {selectedOverview.email || '-'}
              </div>
              <div className="mt-0.5 text-sm text-gray-500 dark:text-dark-400">
                {selectedOverview.username || '-'}
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <OverviewStat
                label={t('admin.affiliates.overview.affCode')}
                value={selectedOverview.aff_code || '-'}
                mono
              />
              <OverviewStat
                label={t('admin.affiliates.overview.rebateRate')}
                value={formatPercent(selectedOverview.rebate_rate_percent)}
              />
              <OverviewStat
                label={t('admin.affiliates.overview.invitedCount')}
                value={String(selectedOverview.invited_count)}
              />
              <OverviewStat
                label={t('admin.affiliates.overview.rebatedInviteeCount')}
                value={String(selectedOverview.rebated_invitee_count)}
              />
              <OverviewStat
                label={t('admin.affiliates.overview.availableQuota')}
                value={'$' + formatAmount(selectedOverview.available_quota)}
              />
              <OverviewStat
                label={t('admin.affiliates.overview.historyQuota')}
                value={'$' + formatAmount(selectedOverview.history_quota)}
              />
            </div>
          </div>
        ) : null}
      </BaseDialog>
    </AppLayout>
  )
}
