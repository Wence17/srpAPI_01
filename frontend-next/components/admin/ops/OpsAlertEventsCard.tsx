'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useI18n } from '@/lib/i18n'
import { useApp } from '@/context/AppContext'
import Select from '@/components/common/Select'
import BaseDialog from '@/components/common/BaseDialog'
import Icon from '@/components/icons/Icon'
import { adminOpsAPI, type AlertEventsQuery } from '@/lib/adminOps'
import type { AlertEvent } from '@/lib/opsTypes'
import { formatDateTime } from '@/lib/adminOpsFormatters'

const PAGE_SIZE = 10

function getDimensionString(event: AlertEvent | null | undefined, key: string): string {
  const v = event?.dimensions?.[key]
  if (v == null) return ''
  if (typeof v === 'string') return v
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  return ''
}

function formatDurationMs(ms: number): string {
  const safe = Math.max(0, Math.floor(ms))
  const sec = Math.floor(safe / 1000)
  if (sec < 60) return `${sec}s`
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min}m`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h`
  const day = Math.floor(hr / 24)
  return `${day}d`
}

function severityBadgeClass(severity: string | undefined): string {
  const s = String(severity || '').trim().toLowerCase()
  if (s === 'p0' || s === 'critical') return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'
  if (s === 'p1' || s === 'warning') return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
  if (s === 'p2' || s === 'info') return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
  if (s === 'p3') return 'bg-gray-100 text-gray-700 dark:bg-dark-700 dark:text-gray-300'
  return 'bg-gray-100 text-gray-700 dark:bg-dark-700 dark:text-gray-300'
}

function statusBadgeClass(status: string | undefined): string {
  const s = String(status || '').trim().toLowerCase()
  if (s === 'firing') return 'bg-red-50 text-red-700 ring-red-600/20 dark:bg-red-900/30 dark:text-red-300 dark:ring-red-500/30'
  if (s === 'resolved') return 'bg-green-50 text-green-700 ring-green-600/20 dark:bg-green-900/30 dark:text-green-300 dark:ring-green-500/30'
  if (s === 'manual_resolved') return 'bg-slate-50 text-slate-700 ring-slate-600/20 dark:bg-slate-900/30 dark:text-slate-300 dark:ring-slate-500/30'
  return 'bg-gray-50 text-gray-700 ring-gray-600/20 dark:bg-gray-900/30 dark:text-gray-300 dark:ring-gray-500/30'
}

function durationToUntilRFC3339(duration: string): string {
  const now = Date.now()
  if (duration === '1h') return new Date(now + 60 * 60 * 1000).toISOString()
  if (duration === '24h') return new Date(now + 24 * 60 * 60 * 1000).toISOString()
  if (duration === '7d') return new Date(now + 7 * 24 * 60 * 60 * 1000).toISOString()
  return new Date(now + 60 * 60 * 1000).toISOString()
}

export default function OpsAlertEventsCard() {
  const { t } = useI18n()
  const appStore = useApp()

  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [events, setEvents] = useState<AlertEvent[]>([])
  const [hasMore, setHasMore] = useState(true)

  const [showDetail, setShowDetail] = useState(false)
  const [selected, setSelected] = useState<AlertEvent | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailActionLoading, setDetailActionLoading] = useState(false)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [history, setHistory] = useState<AlertEvent[]>([])
  const [historyRange, setHistoryRange] = useState('7d')

  const [timeRange, setTimeRange] = useState('24h')
  const [severity, setSeverity] = useState('')
  const [status, setStatus] = useState('')
  const [emailSent, setEmailSent] = useState('')
  const [silenceDuration, setSilenceDuration] = useState('1h')

  const historyRangeOptions = useMemo(
    () => [
      { value: '7d', label: t('admin.ops.timeRange.7d') },
      { value: '30d', label: t('admin.ops.timeRange.30d') },
    ],
    [t],
  )

  const silenceDurationOptions = useMemo(
    () => [
      { value: '1h', label: t('admin.ops.timeRange.1h') },
      { value: '24h', label: t('admin.ops.timeRange.24h') },
      { value: '7d', label: t('admin.ops.timeRange.7d') },
    ],
    [t],
  )

  const timeRangeOptions = useMemo(
    () => [
      { value: '5m', label: t('admin.ops.timeRange.5m') },
      { value: '30m', label: t('admin.ops.timeRange.30m') },
      { value: '1h', label: t('admin.ops.timeRange.1h') },
      { value: '6h', label: t('admin.ops.timeRange.6h') },
      { value: '24h', label: t('admin.ops.timeRange.24h') },
      { value: '7d', label: t('admin.ops.timeRange.7d') },
      { value: '30d', label: t('admin.ops.timeRange.30d') },
    ],
    [t],
  )

  const severityOptions = useMemo(
    () => [
      { value: '', label: t('common.all') },
      { value: 'P0', label: 'P0' },
      { value: 'P1', label: 'P1' },
      { value: 'P2', label: 'P2' },
      { value: 'P3', label: 'P3' },
    ],
    [t],
  )

  const statusOptions = useMemo(
    () => [
      { value: '', label: t('common.all') },
      { value: 'firing', label: t('admin.ops.alertEvents.status.firing') },
      { value: 'resolved', label: t('admin.ops.alertEvents.status.resolved') },
      { value: 'manual_resolved', label: t('admin.ops.alertEvents.status.manualResolved') },
    ],
    [t],
  )

  const emailSentOptions = useMemo(
    () => [
      { value: '', label: t('common.all') },
      { value: 'true', label: t('admin.ops.alertEvents.table.emailSent') },
      { value: 'false', label: t('admin.ops.alertEvents.table.emailIgnored') },
    ],
    [t],
  )

  const buildQuery = useCallback(
    (overrides: Partial<AlertEventsQuery> = {}): AlertEventsQuery => {
      const q: AlertEventsQuery = { limit: PAGE_SIZE, time_range: timeRange }
      if (severity) q.severity = severity
      if (status) q.status = status
      if (emailSent === 'true') q.email_sent = true
      if (emailSent === 'false') q.email_sent = false
      return { ...q, ...overrides }
    },
    [timeRange, severity, status, emailSent],
  )

  const loadFirstPage = useCallback(async () => {
    setLoading(true)
    try {
      const data = await adminOpsAPI.listAlertEvents(buildQuery())
      setEvents(data)
      setHasMore(data.length === PAGE_SIZE)
    } catch (err: unknown) {
      console.error('[OpsAlertEventsCard] Failed to load alert events', err)
      const detail =
        err &&
        typeof err === 'object' &&
        'response' in err &&
        (err as { response?: { data?: { detail?: string } } }).response?.data?.detail
      appStore.showError(typeof detail === 'string' ? detail : t('admin.ops.alertEvents.loadFailed'))
      setEvents([])
      setHasMore(false)
    } finally {
      setLoading(false)
    }
  }, [buildQuery, appStore, t])

  const loadMore = useCallback(async () => {
    if (loadingMore || loading || !hasMore) return
    const last = events[events.length - 1]
    if (!last) return

    setLoadingMore(true)
    try {
      const data = await adminOpsAPI.listAlertEvents(
        buildQuery({ before_fired_at: last.fired_at || last.created_at, before_id: last.id }),
      )
      if (!data.length) {
        setHasMore(false)
        return
      }
      setEvents((prev) => [...prev, ...data])
      if (data.length < PAGE_SIZE) setHasMore(false)
    } catch (err) {
      console.error('[OpsAlertEventsCard] Failed to load more alert events', err)
      setHasMore(false)
    } finally {
      setLoadingMore(false)
    }
  }, [loadingMore, loading, hasMore, events, buildQuery])

  const loadHistory = useCallback(
    async (ev: AlertEvent | null) => {
      if (!ev) {
        setHistory([])
        setHistoryLoading(false)
        return
      }

      setHistoryLoading(true)
      try {
        const platform = getDimensionString(ev, 'platform')
        const groupIdRaw = ev.dimensions?.group_id
        const groupId = typeof groupIdRaw === 'number' ? groupIdRaw : undefined

        const items = await adminOpsAPI.listAlertEvents({
          limit: 20,
          time_range: historyRange,
          platform: platform || undefined,
          group_id: groupId,
          status: '',
        })

        setHistory(
          items.filter((it) => {
            if (it.rule_id !== ev.rule_id) return false
            const p1 = getDimensionString(it, 'platform')
            const p2 = getDimensionString(ev, 'platform')
            if ((p1 || '') !== (p2 || '')) return false
            const g1 = it.dimensions?.group_id
            const g2 = ev.dimensions?.group_id
            return (g1 ?? null) === (g2 ?? null)
          }),
        )
      } catch (err) {
        console.error('[OpsAlertEventsCard] Failed to load alert history', err)
        setHistory([])
      } finally {
        setHistoryLoading(false)
      }
    },
    [historyRange],
  )

  const formatStatusLabel = useCallback(
    (s: string | undefined) => {
      const val = String(s || '').trim().toLowerCase()
      if (!val) return '-'
      if (val === 'firing') return t('admin.ops.alertEvents.status.firing')
      if (val === 'resolved') return t('admin.ops.alertEvents.status.resolved')
      if (val === 'manual_resolved') return t('admin.ops.alertEvents.status.manualResolved')
      return val.toUpperCase()
    },
    [t],
  )

  const formatDurationLabel = useCallback(
    (event: AlertEvent) => {
      const firedAt = new Date(event.fired_at || event.created_at)
      if (Number.isNaN(firedAt.getTime())) return '-'
      const resolvedAtStr = event.resolved_at || null
      const st = String(event.status || '').trim().toLowerCase()

      if (resolvedAtStr) {
        const resolvedAt = new Date(resolvedAtStr)
        if (!Number.isNaN(resolvedAt.getTime())) {
          const ms = resolvedAt.getTime() - firedAt.getTime()
          const prefix =
            st === 'manual_resolved'
              ? t('admin.ops.alertEvents.status.manualResolved')
              : t('admin.ops.alertEvents.status.resolved')
          return `${prefix} ${formatDurationMs(ms)}`
        }
      }

      const ms = Date.now() - firedAt.getTime()
      return `${t('admin.ops.alertEvents.status.firing')} ${formatDurationMs(ms)}`
    },
    [t],
  )

  const formatDimensionsSummary = useCallback((event: AlertEvent) => {
    const parts: string[] = []
    const platform = getDimensionString(event, 'platform')
    if (platform) parts.push(`platform=${platform}`)
    const groupId = event.dimensions?.group_id
    if (groupId != null && groupId !== '') parts.push(`group_id=${String(groupId)}`)
    const region = getDimensionString(event, 'region')
    if (region) parts.push(`region=${region}`)
    return parts.length ? parts.join(' ') : '-'
  }, [])

  const closeDetail = () => {
    setShowDetail(false)
    setSelected(null)
    setHistory([])
  }

  const openDetail = async (row: AlertEvent) => {
    setShowDetail(true)
    setSelected(row)
    setDetailLoading(true)
    setHistoryLoading(true)

    try {
      const detail = await adminOpsAPI.getAlertEvent(row.id)
      setSelected(detail)
      await loadHistory(detail)
    } catch (err: unknown) {
      console.error('[OpsAlertEventsCard] Failed to load alert detail', err)
      const detail =
        err &&
        typeof err === 'object' &&
        'response' in err &&
        (err as { response?: { data?: { detail?: string } } }).response?.data?.detail
      appStore.showError(typeof detail === 'string' ? detail : t('admin.ops.alertEvents.detail.loadFailed'))
    } finally {
      setDetailLoading(false)
    }
  }

  const silenceAlert = async () => {
    const ev = selected
    if (!ev || detailActionLoading) return
    setDetailActionLoading(true)
    try {
      const platform = getDimensionString(ev, 'platform')
      const groupIdRaw = ev.dimensions?.group_id
      const groupId = typeof groupIdRaw === 'number' ? groupIdRaw : null
      const region = getDimensionString(ev, 'region') || null

      await adminOpsAPI.createAlertSilence({
        rule_id: ev.rule_id,
        platform: platform || '',
        group_id: groupId ?? undefined,
        region: region ?? undefined,
        until: durationToUntilRFC3339(silenceDuration),
        reason: `silence from UI (${silenceDuration})`,
      })

      appStore.showSuccess(t('admin.ops.alertEvents.detail.silenceSuccess'))
    } catch (err: unknown) {
      console.error('[OpsAlertEventsCard] Failed to silence alert', err)
      const detail =
        err &&
        typeof err === 'object' &&
        'response' in err &&
        (err as { response?: { data?: { detail?: string } } }).response?.data?.detail
      appStore.showError(typeof detail === 'string' ? detail : t('admin.ops.alertEvents.detail.silenceFailed'))
    } finally {
      setDetailActionLoading(false)
    }
  }

  const manualResolve = async () => {
    if (!selected || detailActionLoading) return
    setDetailActionLoading(true)
    try {
      await adminOpsAPI.updateAlertEventStatus(selected.id, 'manual_resolved')
      appStore.showSuccess(t('admin.ops.alertEvents.detail.manualResolvedSuccess'))
      const detail = await adminOpsAPI.getAlertEvent(selected.id)
      setSelected(detail)
      await loadFirstPage()
      await loadHistory(detail)
    } catch (err: unknown) {
      console.error('[OpsAlertEventsCard] Failed to resolve alert', err)
      const detail =
        err &&
        typeof err === 'object' &&
        'response' in err &&
        (err as { response?: { data?: { detail?: string } } }).response?.data?.detail
      appStore.showError(typeof detail === 'string' ? detail : t('admin.ops.alertEvents.detail.manualResolvedFailed'))
    } finally {
      setDetailActionLoading(false)
    }
  }

  const onScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget
    const nearBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 120
    if (nearBottom) void loadMore()
  }

  useEffect(() => {
    setEvents([])
    setHasMore(true)
    void loadFirstPage()
  }, [timeRange, severity, status, emailSent, loadFirstPage])

  useEffect(() => {
    if (showDetail && selected) void loadHistory(selected)
  }, [historyRange, showDetail, selected, loadHistory])

  const empty = events.length === 0 && !loading

  return (
    <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-gray-900/5 dark:bg-dark-800 dark:ring-dark-700">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h3 className="text-sm font-bold text-gray-900 dark:text-white">{t('admin.ops.alertEvents.title')}</h3>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{t('admin.ops.alertEvents.description')}</p>
        </div>
        <div className="flex items-center gap-2">
          <Select modelValue={timeRange} options={timeRangeOptions} className="w-[120px]" onUpdateModelValue={(v) => setTimeRange(String(v || '24h'))} />
          <Select modelValue={severity} options={severityOptions} className="w-[88px]" onUpdateModelValue={(v) => setSeverity(String(v || ''))} />
          <Select modelValue={status} options={statusOptions} className="w-[110px]" onUpdateModelValue={(v) => setStatus(String(v || ''))} />
          <Select modelValue={emailSent} options={emailSentOptions} className="w-[110px]" onUpdateModelValue={(v) => setEmailSent(String(v || ''))} />
          <button
            type="button"
            className="flex items-center gap-1.5 rounded-lg bg-gray-100 px-3 py-1.5 text-xs font-bold text-gray-700 transition-colors hover:bg-gray-200 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-dark-700 dark:text-gray-300 dark:hover:bg-dark-600"
            disabled={loading}
            onClick={() => void loadFirstPage()}
          >
            <svg className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            {t('common.refresh')}
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
          <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          {t('admin.ops.alertEvents.loading')}
        </div>
      ) : empty ? (
        <div className="rounded-xl border border-dashed border-gray-200 p-8 text-center text-sm text-gray-500 dark:border-dark-700 dark:text-gray-400">
          {t('admin.ops.alertEvents.empty')}
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-gray-200 dark:border-dark-700">
          <div className="max-h-[600px] overflow-y-auto" onScroll={onScroll}>
            <table className="min-w-full divide-y divide-gray-200 dark:divide-dark-700">
              <thead className="sticky top-0 z-10 bg-gray-50 dark:bg-dark-900">
                <tr>
                  <th className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">{t('admin.ops.alertEvents.table.time')}</th>
                  <th className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">{t('admin.ops.alertEvents.table.severity')}</th>
                  <th className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">{t('admin.ops.alertEvents.table.platform')}</th>
                  <th className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">{t('admin.ops.alertEvents.table.ruleId')}</th>
                  <th className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">{t('admin.ops.alertEvents.table.title')}</th>
                  <th className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">{t('admin.ops.alertEvents.table.duration')}</th>
                  <th className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">{t('admin.ops.alertEvents.table.dimensions')}</th>
                  <th className="px-4 py-3 text-right text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">{t('admin.ops.alertEvents.table.email')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white dark:divide-dark-700 dark:bg-dark-800">
                {events.map((row) => (
                  <tr
                    key={row.id}
                    className="cursor-pointer hover:bg-gray-50 dark:hover:bg-dark-700/50"
                    title={row.title || ''}
                    onClick={() => void openDetail(row)}
                  >
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-gray-600 dark:text-gray-300">
                      {formatDateTime(row.fired_at || row.created_at)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className={`rounded-full px-2 py-1 text-[10px] font-bold ${severityBadgeClass(String(row.severity || ''))}`}>
                          {row.severity || '-'}
                        </span>
                        <span className={`inline-flex items-center rounded-full px-2 py-1 text-[10px] font-bold ring-1 ring-inset ${statusBadgeClass(row.status)}`}>
                          {formatStatusLabel(row.status)}
                        </span>
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-gray-600 dark:text-gray-300">
                      {getDimensionString(row, 'platform') || '-'}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-gray-600 dark:text-gray-300">
                      <span className="font-mono">#{row.rule_id}</span>
                    </td>
                    <td className="min-w-[260px] px-4 py-3 text-xs text-gray-700 dark:text-gray-200">
                      <div className="max-w-[360px] truncate font-semibold">{row.title || '-'}</div>
                      {row.description && (
                        <div className="mt-0.5 line-clamp-2 text-[11px] text-gray-500 dark:text-gray-400">{row.description}</div>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-gray-600 dark:text-gray-300">
                      {formatDurationLabel(row)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-[11px] text-gray-500 dark:text-gray-400">
                      {formatDimensionsSummary(row)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right text-xs">
                      <span
                        className="inline-flex items-center justify-end gap-1.5"
                        title={
                          row.email_sent
                            ? t('admin.ops.alertEvents.table.emailSent')
                            : t('admin.ops.alertEvents.table.emailIgnored')
                        }
                      >
                        {row.email_sent ? (
                          <Icon name="checkCircle" size="sm" className="text-green-600 dark:text-green-400" />
                        ) : (
                          <Icon name="ban" size="sm" className="text-gray-400 dark:text-gray-500" />
                        )}
                        <span className="text-[11px] font-bold text-gray-600 dark:text-gray-300">
                          {row.email_sent
                            ? t('admin.ops.alertEvents.table.emailSent')
                            : t('admin.ops.alertEvents.table.emailIgnored')}
                        </span>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {loadingMore && (
              <div className="flex items-center justify-center gap-2 py-3 text-xs text-gray-500 dark:text-gray-400">
                <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                {t('admin.ops.alertEvents.loading')}
              </div>
            )}
            {!hasMore && events.length > 0 && (
              <div className="py-3 text-center text-xs text-gray-400">-</div>
            )}
          </div>
        </div>
      )}

      <BaseDialog
        show={showDetail}
        title={t('admin.ops.alertEvents.detail.title')}
        width="wide"
        closeOnClickOutside
        onClose={closeDetail}
      >
        {detailLoading ? (
          <div className="flex items-center justify-center py-10 text-sm text-gray-500 dark:text-gray-400">
            {t('admin.ops.alertEvents.detail.loading')}
          </div>
        ) : !selected ? (
          <div className="py-10 text-center text-sm text-gray-500 dark:text-gray-400">
            {t('admin.ops.alertEvents.detail.empty')}
          </div>
        ) : (
          <div className="space-y-5">
            <div className="rounded-xl bg-gray-50 p-4 dark:bg-dark-900">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`inline-flex items-center rounded-full px-2 py-1 text-[10px] font-bold ${severityBadgeClass(String(selected.severity || ''))}`}>
                      {selected.severity || '-'}
                    </span>
                    <span className={`inline-flex items-center rounded-full px-2 py-1 text-[10px] font-bold ring-1 ring-inset ${statusBadgeClass(selected.status)}`}>
                      {formatStatusLabel(selected.status)}
                    </span>
                  </div>
                  <div className="mt-2 text-sm font-semibold text-gray-900 dark:text-white">{selected.title || '-'}</div>
                  {selected.description && (
                    <div className="mt-1 whitespace-pre-wrap text-xs text-gray-600 dark:text-gray-300">{selected.description}</div>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  <div className="flex items-center gap-2 rounded-lg bg-white px-2 py-1 ring-1 ring-gray-200 dark:bg-dark-800 dark:ring-dark-700">
                    <span className="text-[11px] font-bold text-gray-600 dark:text-gray-300">{t('admin.ops.alertEvents.detail.silence')}</span>
                    <Select modelValue={silenceDuration} options={silenceDurationOptions} className="w-[110px]" onUpdateModelValue={(v) => setSilenceDuration(String(v || '1h'))} />
                    <button type="button" className="btn btn-secondary btn-sm" disabled={detailActionLoading} onClick={() => void silenceAlert()}>
                      <Icon name="ban" size="sm" />
                      {t('common.apply')}
                    </button>
                  </div>
                  <button type="button" className="btn btn-secondary btn-sm" disabled={detailActionLoading} onClick={() => void manualResolve()}>
                    <Icon name="checkCircle" size="sm" />
                    {t('admin.ops.alertEvents.detail.manualResolve')}
                  </button>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="rounded-xl bg-gray-50 p-4 dark:bg-dark-900">
                <div className="text-xs font-bold uppercase tracking-wider text-gray-400">{t('admin.ops.alertEvents.detail.firedAt')}</div>
                <div className="mt-1 text-sm font-medium text-gray-900 dark:text-white">
                  {formatDateTime(selected.fired_at || selected.created_at)}
                </div>
              </div>
              <div className="rounded-xl bg-gray-50 p-4 dark:bg-dark-900">
                <div className="text-xs font-bold uppercase tracking-wider text-gray-400">{t('admin.ops.alertEvents.detail.resolvedAt')}</div>
                <div className="mt-1 text-sm font-medium text-gray-900 dark:text-white">
                  {selected.resolved_at ? formatDateTime(selected.resolved_at) : '-'}
                </div>
              </div>
              <div className="rounded-xl bg-gray-50 p-4 dark:bg-dark-900">
                <div className="text-xs font-bold uppercase tracking-wider text-gray-400">{t('admin.ops.alertEvents.detail.ruleId')}</div>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <div className="font-mono text-sm font-bold text-gray-900 dark:text-white">#{selected.rule_id}</div>
                  <a
                    className="inline-flex items-center gap-1 rounded-md bg-white px-2 py-1 text-[11px] font-bold text-gray-700 ring-1 ring-gray-200 hover:bg-gray-50 dark:bg-dark-800 dark:text-gray-200 dark:ring-dark-700 dark:hover:bg-dark-700"
                    href={`/admin/ops?open_alert_rules=1&alert_rule_id=${selected.rule_id}`}
                  >
                    <Icon name="externalLink" size="xs" />
                    {t('admin.ops.alertEvents.detail.viewRule')}
                  </a>
                  <a
                    className="inline-flex items-center gap-1 rounded-md bg-white px-2 py-1 text-[11px] font-bold text-gray-700 ring-1 ring-gray-200 hover:bg-gray-50 dark:bg-dark-800 dark:text-gray-200 dark:ring-dark-700 dark:hover:bg-dark-700"
                    href={`/admin/ops?platform=${encodeURIComponent(getDimensionString(selected, 'platform') || '')}&group_id=${selected.dimensions?.group_id || ''}&error_type=request&open_error_details=1`}
                  >
                    <Icon name="externalLink" size="xs" />
                    {t('admin.ops.alertEvents.detail.viewLogs')}
                  </a>
                </div>
              </div>
              <div className="rounded-xl bg-gray-50 p-4 dark:bg-dark-900">
                <div className="text-xs font-bold uppercase tracking-wider text-gray-400">{t('admin.ops.alertEvents.detail.dimensions')}</div>
                <div className="mt-1 text-sm text-gray-900 dark:text-white">
                  {getDimensionString(selected, 'platform') && <div>platform={getDimensionString(selected, 'platform')}</div>}
                  {selected.dimensions?.group_id != null && <div>group_id={selected.dimensions.group_id}</div>}
                  {getDimensionString(selected, 'region') && <div>region={getDimensionString(selected, 'region')}</div>}
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-dark-700 dark:bg-dark-800">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-bold text-gray-900 dark:text-white">{t('admin.ops.alertEvents.detail.historyTitle')}</div>
                  <div className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{t('admin.ops.alertEvents.detail.historyHint')}</div>
                </div>
                <Select modelValue={historyRange} options={historyRangeOptions} className="w-[140px]" onUpdateModelValue={(v) => setHistoryRange(String(v || '7d'))} />
              </div>
              {historyLoading ? (
                <div className="py-6 text-center text-xs text-gray-500 dark:text-gray-400">{t('admin.ops.alertEvents.detail.historyLoading')}</div>
              ) : history.length === 0 ? (
                <div className="py-6 text-center text-xs text-gray-500 dark:text-gray-400">{t('admin.ops.alertEvents.detail.historyEmpty')}</div>
              ) : (
                <div className="overflow-hidden rounded-lg border border-gray-100 dark:border-dark-700">
                  <table className="min-w-full divide-y divide-gray-100 dark:divide-dark-700">
                    <thead className="bg-gray-50 dark:bg-dark-900">
                      <tr>
                        <th className="px-3 py-2 text-left text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">{t('admin.ops.alertEvents.table.time')}</th>
                        <th className="px-3 py-2 text-left text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">{t('admin.ops.alertEvents.table.status')}</th>
                        <th className="px-3 py-2 text-left text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">{t('admin.ops.alertEvents.table.metric')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-dark-700">
                      {history.map((it) => (
                        <tr key={it.id} className="hover:bg-gray-50 dark:hover:bg-dark-700/50">
                          <td className="px-3 py-2 text-xs text-gray-600 dark:text-gray-300">
                            {formatDateTime(it.fired_at || it.created_at)}
                          </td>
                          <td className="px-3 py-2 text-xs">
                            <span className={`inline-flex items-center rounded-full px-2 py-1 text-[10px] font-bold ring-1 ring-inset ${statusBadgeClass(it.status)}`}>
                              {formatStatusLabel(it.status)}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-xs text-gray-600 dark:text-gray-300">
                            {typeof it.metric_value === 'number' && typeof it.threshold_value === 'number'
                              ? `${it.metric_value.toFixed(2)} / ${it.threshold_value.toFixed(2)}`
                              : '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </BaseDialog>
    </div>
  )
}
