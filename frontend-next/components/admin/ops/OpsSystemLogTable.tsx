'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useApp } from '@/context/AppContext'
import Pagination from '@/components/common/Pagination'
import Select from '@/components/common/Select'
import {
  adminOpsAPI,
  type OpsRuntimeLogConfig,
  type OpsSystemLog,
  type OpsSystemLogSinkHealth,
} from '@/lib/adminOps'

interface OpsSystemLogTableProps {
  platformFilter?: string
  refreshToken?: number
}

type TimeRangeFilter = '5m' | '30m' | '1h' | '6h' | '24h' | '7d' | '30d'

const runtimeLevelOptions = [
  { value: 'debug', label: 'debug' },
  { value: 'info', label: 'info' },
  { value: 'warn', label: 'warn' },
  { value: 'error', label: 'error' },
]

const stacktraceLevelOptions = [
  { value: 'none', label: 'none' },
  { value: 'error', label: 'error' },
  { value: 'fatal', label: 'fatal' },
]

const timeRangeOptions = [
  { value: '5m', label: '5m' },
  { value: '30m', label: '30m' },
  { value: '1h', label: '1h' },
  { value: '6h', label: '6h' },
  { value: '24h', label: '24h' },
  { value: '7d', label: '7d' },
  { value: '30d', label: '30d' },
]

const filterLevelOptions = [
  { value: '', label: '全部' },
  { value: 'debug', label: 'debug' },
  { value: 'info', label: 'info' },
  { value: 'warn', label: 'warn' },
  { value: 'error', label: 'error' },
]

function levelBadgeClass(level: string): string {
  const v = String(level || '').toLowerCase()
  if (v === 'error' || v === 'fatal') return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'
  if (v === 'warn' || v === 'warning') return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
  if (v === 'debug') return 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
  return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
}

function formatTime(value: string): string {
  if (!value) return '-'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleString()
}

function getExtraString(extra: Record<string, unknown> | undefined, key: string): string {
  if (!extra) return ''
  const v = extra[key]
  if (v == null) return ''
  if (typeof v === 'string') return v.trim()
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  return ''
}

function formatSystemLogDetail(row: OpsSystemLog): string {
  const parts: string[] = []
  const msg = String(row.message || '').trim()
  if (msg) parts.push(msg)

  const extra = row.extra || {}
  const statusCode = getExtraString(extra, 'status_code')
  const latencyMs = getExtraString(extra, 'latency_ms')
  const method = getExtraString(extra, 'method')
  const path = getExtraString(extra, 'path')
  const clientIP = getExtraString(extra, 'client_ip')
  const protocol = getExtraString(extra, 'protocol')

  const accessParts: string[] = []
  if (statusCode) accessParts.push(`status=${statusCode}`)
  if (latencyMs) accessParts.push(`latency_ms=${latencyMs}`)
  if (method) accessParts.push(`method=${method}`)
  if (path) accessParts.push(`path=${path}`)
  if (clientIP) accessParts.push(`ip=${clientIP}`)
  if (protocol) accessParts.push(`proto=${protocol}`)
  if (accessParts.length > 0) parts.push(accessParts.join(' '))

  const corrParts: string[] = []
  if (row.request_id) corrParts.push(`req=${row.request_id}`)
  if (row.client_request_id) corrParts.push(`client_req=${row.client_request_id}`)
  if (row.user_id != null) corrParts.push(`user=${row.user_id}`)
  if (row.account_id != null) corrParts.push(`acc=${row.account_id}`)
  if (row.platform) corrParts.push(`platform=${row.platform}`)
  if (row.model) corrParts.push(`model=${row.model}`)
  if (corrParts.length > 0) parts.push(corrParts.join(' '))

  const errors = getExtraString(extra, 'errors')
  if (errors) parts.push(`errors=${errors}`)
  const err = getExtraString(extra, 'err') || getExtraString(extra, 'error')
  if (err) parts.push(`error=${err}`)

  return parts.join('  ')
}

function toRFC3339(value: string): string | undefined {
  if (!value) return undefined
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return undefined
  return d.toISOString()
}

export default function OpsSystemLogTable({
  platformFilter = '',
  refreshToken = 0,
}: OpsSystemLogTableProps) {
  const appStore = useApp()

  const [loading, setLoading] = useState(false)
  const [logs, setLogs] = useState<OpsSystemLog[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)

  const [health, setHealth] = useState<OpsSystemLogSinkHealth>({
    queue_depth: 0,
    queue_capacity: 0,
    dropped_count: 0,
    write_failed_count: 0,
    written_count: 0,
    avg_write_delay_ms: 0,
  })

  const [runtimeLoading, setRuntimeLoading] = useState(false)
  const [runtimeSaving, setRuntimeSaving] = useState(false)
  const [runtimeConfig, setRuntimeConfig] = useState<OpsRuntimeLogConfig>({
    level: 'info',
    enable_sampling: false,
    sampling_initial: 100,
    sampling_thereafter: 100,
    caller: true,
    stacktrace_level: 'error',
    retention_days: 30,
  })

  const [filters, setFilters] = useState({
    time_range: '1h' as TimeRangeFilter,
    start_time: '',
    end_time: '',
    level: '',
    component: '',
    request_id: '',
    client_request_id: '',
    user_id: '',
    account_id: '',
    platform: platformFilter || '',
    model: '',
    q: '',
  })

  const hasData = logs.length > 0

  const buildQuery = useCallback(() => {
    const query: Record<string, unknown> = {
      page,
      page_size: pageSize,
      time_range: filters.time_range,
    }
    if (filters.start_time) query.start_time = toRFC3339(filters.start_time)
    if (filters.end_time) query.end_time = toRFC3339(filters.end_time)
    if (filters.level.trim()) query.level = filters.level.trim()
    if (filters.component.trim()) query.component = filters.component.trim()
    if (filters.request_id.trim()) query.request_id = filters.request_id.trim()
    if (filters.client_request_id.trim()) query.client_request_id = filters.client_request_id.trim()
    if (filters.user_id.trim()) {
      const v = Number.parseInt(filters.user_id.trim(), 10)
      if (Number.isFinite(v) && v > 0) query.user_id = v
    }
    if (filters.account_id.trim()) {
      const v = Number.parseInt(filters.account_id.trim(), 10)
      if (Number.isFinite(v) && v > 0) query.account_id = v
    }
    if (filters.platform.trim()) query.platform = filters.platform.trim()
    if (filters.model.trim()) query.model = filters.model.trim()
    if (filters.q.trim()) query.q = filters.q.trim()
    return query
  }, [page, pageSize, filters])

  const fetchLogs = useCallback(async () => {
    setLoading(true)
    try {
      const res = await adminOpsAPI.listSystemLogs(buildQuery())
      setLogs(res.items || [])
      setTotal(res.total || 0)
    } catch (err: unknown) {
      console.error('[OpsSystemLogTable] Failed to fetch logs', err)
      const detail =
        err &&
        typeof err === 'object' &&
        'response' in err &&
        (err as { response?: { data?: { detail?: string } } }).response?.data?.detail
      appStore.showError(typeof detail === 'string' ? detail : '系统日志加载失败')
    } finally {
      setLoading(false)
    }
  }, [buildQuery, appStore])

  const fetchHealth = useCallback(async () => {
    try {
      setHealth(await adminOpsAPI.getSystemLogSinkHealth())
    } catch {
      // ignore
    }
  }, [])

  const loadRuntimeConfig = useCallback(async () => {
    setRuntimeLoading(true)
    try {
      setRuntimeConfig(await adminOpsAPI.getRuntimeLogConfig())
    } catch (err) {
      console.error('[OpsSystemLogTable] Failed to load runtime log config', err)
    } finally {
      setRuntimeLoading(false)
    }
  }, [])

  const saveRuntimeConfig = useCallback(async () => {
    setRuntimeSaving(true)
    try {
      setRuntimeConfig(await adminOpsAPI.updateRuntimeLogConfig({ ...runtimeConfig }))
      appStore.showSuccess('日志运行时配置已生效')
    } catch (err: unknown) {
      console.error('[OpsSystemLogTable] Failed to save runtime log config', err)
      const detail =
        err &&
        typeof err === 'object' &&
        'response' in err &&
        (err as { response?: { data?: { detail?: string } } }).response?.data?.detail
      appStore.showError(typeof detail === 'string' ? detail : '保存日志配置失败')
    } finally {
      setRuntimeSaving(false)
    }
  }, [runtimeConfig, appStore])

  const resetRuntimeConfig = useCallback(async () => {
    if (!window.confirm('确认回滚为启动配置（env/yaml）并立即生效？')) return
    setRuntimeSaving(true)
    try {
      setRuntimeConfig(await adminOpsAPI.resetRuntimeLogConfig())
      appStore.showSuccess('已回滚到启动日志配置')
      await fetchHealth()
    } catch (err: unknown) {
      console.error('[OpsSystemLogTable] Failed to reset runtime log config', err)
      const detail =
        err &&
        typeof err === 'object' &&
        'response' in err &&
        (err as { response?: { data?: { detail?: string } } }).response?.data?.detail
      appStore.showError(typeof detail === 'string' ? detail : '回滚日志配置失败')
    } finally {
      setRuntimeSaving(false)
    }
  }, [appStore, fetchHealth])

  const cleanupCurrentFilter = useCallback(async () => {
    if (!window.confirm('确认按当前筛选条件清理系统日志？该操作不可撤销。')) return
    try {
      const payload = {
        start_time: toRFC3339(filters.start_time),
        end_time: toRFC3339(filters.end_time),
        level: filters.level.trim() || undefined,
        component: filters.component.trim() || undefined,
        request_id: filters.request_id.trim() || undefined,
        client_request_id: filters.client_request_id.trim() || undefined,
        user_id: filters.user_id.trim() ? Number.parseInt(filters.user_id.trim(), 10) : undefined,
        account_id: filters.account_id.trim() ? Number.parseInt(filters.account_id.trim(), 10) : undefined,
        platform: filters.platform.trim() || undefined,
        model: filters.model.trim() || undefined,
        q: filters.q.trim() || undefined,
      }
      const res = await adminOpsAPI.cleanupSystemLogs(payload)
      appStore.showSuccess(`清理完成，删除 ${res.deleted || 0} 条日志`)
      setPage(1)
      await Promise.all([fetchLogs(), fetchHealth()])
    } catch (err: unknown) {
      console.error('[OpsSystemLogTable] Failed to cleanup logs', err)
      const detail =
        err &&
        typeof err === 'object' &&
        'response' in err &&
        (err as { response?: { data?: { detail?: string } } }).response?.data?.detail
      appStore.showError(typeof detail === 'string' ? detail : '清理系统日志失败')
    }
  }, [filters, appStore, fetchLogs, fetchHealth])

  const resetFilters = useCallback(() => {
    setFilters({
      time_range: '1h',
      start_time: '',
      end_time: '',
      level: '',
      component: '',
      request_id: '',
      client_request_id: '',
      user_id: '',
      account_id: '',
      platform: platformFilter || '',
      model: '',
      q: '',
    })
    setPage(1)
  }, [platformFilter])

  const applyFilters = () => {
    setPage(1)
    void fetchLogs()
  }

  const updateFilter = <K extends keyof typeof filters>(key: K, value: (typeof filters)[K]) => {
    setFilters((prev) => ({ ...prev, [key]: value }))
  }

  useEffect(() => {
    if (platformFilter) {
      setFilters((prev) => ({ ...prev, platform: prev.platform || platformFilter }))
    }
    void Promise.all([fetchLogs(), fetchHealth(), loadRuntimeConfig()])
  }, [])

  useEffect(() => {
    if (platformFilter && !filters.platform) {
      setFilters((prev) => ({ ...prev, platform: platformFilter }))
      setPage(1)
      void fetchLogs()
    }
  }, [platformFilter])

  useEffect(() => {
    void fetchLogs()
    void fetchHealth()
  }, [refreshToken])

  useEffect(() => {
    void fetchLogs()
  }, [page, pageSize])

  const filterFields = useMemo(
    () =>
      [
        { key: 'time_range' as const, label: '时间范围', type: 'select', options: timeRangeOptions },
        { key: 'start_time' as const, label: '开始时间（可选）', type: 'datetime-local' },
        { key: 'end_time' as const, label: '结束时间（可选）', type: 'datetime-local' },
        { key: 'level' as const, label: '级别', type: 'select', options: filterLevelOptions },
        { key: 'component' as const, label: '组件', type: 'text', placeholder: '如 http.access' },
        { key: 'request_id' as const, label: 'request_id', type: 'text' },
        { key: 'client_request_id' as const, label: 'client_request_id', type: 'text' },
        { key: 'user_id' as const, label: 'user_id', type: 'text' },
        { key: 'account_id' as const, label: 'account_id', type: 'text' },
        { key: 'platform' as const, label: '平台', type: 'text' },
        { key: 'model' as const, label: '模型', type: 'text' },
        { key: 'q' as const, label: '关键词', type: 'text', placeholder: '消息/request_id' },
      ] as const,
    [],
  )

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm dark:border-dark-700 dark:bg-dark-900/60">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-gray-900 dark:text-white">系统日志</h3>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">默认按最新时间倒序，支持筛选搜索与按条件清理。</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="rounded-md bg-gray-100 px-2 py-1 text-gray-700 dark:bg-dark-700 dark:text-gray-200">
            队列 {health.queue_depth}/{health.queue_capacity}
          </span>
          <span className="rounded-md bg-gray-100 px-2 py-1 text-gray-700 dark:bg-dark-700 dark:text-gray-200">
            写入 {health.written_count}
          </span>
          <span className="rounded-md bg-amber-100 px-2 py-1 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
            丢弃 {health.dropped_count}
          </span>
          <span className="rounded-md bg-red-100 px-2 py-1 text-red-700 dark:bg-red-900/30 dark:text-red-300">
            失败 {health.write_failed_count}
          </span>
        </div>
      </div>

      <div className="mb-4 rounded-xl border border-gray-200 bg-gray-50 p-3 dark:border-dark-700 dark:bg-dark-800/70">
        <div className="mb-2 flex items-center justify-between">
          <div className="text-xs font-semibold text-gray-700 dark:text-gray-200">运行时日志配置（实时生效）</div>
          {runtimeLoading && <span className="text-xs text-gray-500">加载中...</span>}
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-6">
          <label className="text-xs text-gray-600 dark:text-gray-300">
            级别
            <Select
              modelValue={runtimeConfig.level}
              options={runtimeLevelOptions}
              className="mt-1"
              onUpdateModelValue={(v) => setRuntimeConfig((c) => ({ ...c, level: String(v) as OpsRuntimeLogConfig['level'] }))}
            />
          </label>
          <label className="text-xs text-gray-600 dark:text-gray-300">
            堆栈阈值
            <Select
              modelValue={runtimeConfig.stacktrace_level}
              options={stacktraceLevelOptions}
              className="mt-1"
              onUpdateModelValue={(v) => setRuntimeConfig((c) => ({ ...c, stacktrace_level: String(v) as OpsRuntimeLogConfig['stacktrace_level'] }))}
            />
          </label>
          <label className="text-xs text-gray-600 dark:text-gray-300">
            采样初始
            <input
              type="number"
              min={1}
              className="input mt-1"
              value={runtimeConfig.sampling_initial}
              onChange={(e) => setRuntimeConfig((c) => ({ ...c, sampling_initial: Number(e.target.value) }))}
            />
          </label>
          <label className="text-xs text-gray-600 dark:text-gray-300">
            采样后续
            <input
              type="number"
              min={1}
              className="input mt-1"
              value={runtimeConfig.sampling_thereafter}
              onChange={(e) => setRuntimeConfig((c) => ({ ...c, sampling_thereafter: Number(e.target.value) }))}
            />
          </label>
          <label className="text-xs text-gray-600 dark:text-gray-300">
            保留天数
            <input
              type="number"
              min={1}
              max={3650}
              className="input mt-1"
              value={runtimeConfig.retention_days}
              onChange={(e) => setRuntimeConfig((c) => ({ ...c, retention_days: Number(e.target.value) }))}
            />
          </label>
          <div className="md:col-span-2 xl:col-span-6">
            <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <label className="inline-flex items-center gap-2 text-xs text-gray-600 dark:text-gray-300">
                  <input
                    type="checkbox"
                    checked={runtimeConfig.caller}
                    onChange={(e) => setRuntimeConfig((c) => ({ ...c, caller: e.target.checked }))}
                  />
                  caller
                </label>
                <label className="inline-flex items-center gap-2 text-xs text-gray-600 dark:text-gray-300">
                  <input
                    type="checkbox"
                    checked={runtimeConfig.enable_sampling}
                    onChange={(e) => setRuntimeConfig((c) => ({ ...c, enable_sampling: e.target.checked }))}
                  />
                  sampling
                </label>
              </div>
              <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                <button type="button" className="btn btn-primary btn-sm" disabled={runtimeSaving} onClick={() => void saveRuntimeConfig()}>
                  {runtimeSaving ? '保存中...' : '保存并生效'}
                </button>
                <button type="button" className="btn btn-secondary btn-sm" disabled={runtimeSaving} onClick={() => void resetRuntimeConfig()}>
                  回滚默认值
                </button>
              </div>
            </div>
          </div>
        </div>
        {health.last_error && (
          <p className="mt-2 text-xs text-red-600 dark:text-red-400">最近写入错误：{health.last_error}</p>
        )}
      </div>

      <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-5">
        {filterFields.map((field) => (
          <label key={field.key} className="text-xs text-gray-600 dark:text-gray-300">
            {field.label}
            {field.type === 'select' ? (
              <Select
                modelValue={filters[field.key]}
                options={field.options || []}
                className="mt-1"
                onUpdateModelValue={(v) => updateFilter(field.key, String(v) as never)}
              />
            ) : (
              <input
                type={field.type}
                className="input mt-1"
                placeholder={'placeholder' in field ? field.placeholder : undefined}
                value={filters[field.key]}
                onChange={(e) => updateFilter(field.key, e.target.value as never)}
              />
            )}
          </label>
        ))}
      </div>

      <div className="mb-3 flex flex-wrap gap-2">
        <button type="button" className="btn btn-primary btn-sm" onClick={applyFilters}>
          查询
        </button>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={() => {
            resetFilters()
            setTimeout(() => void fetchLogs(), 0)
          }}
        >
          重置
        </button>
        <button type="button" className="btn btn-danger btn-sm" onClick={() => void cleanupCurrentFilter()}>
          按当前筛选清理
        </button>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => void fetchHealth()}>
          刷新健康指标
        </button>
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200 dark:border-dark-700">
        {loading ? (
          <div className="px-4 py-8 text-center text-sm text-gray-500">加载中...</div>
        ) : !hasData ? (
          <div className="px-4 py-8 text-center text-sm text-gray-500">暂无系统日志</div>
        ) : (
          <div className="overflow-auto">
            <table className="min-w-full table-fixed divide-y divide-gray-200 dark:divide-dark-700">
              <thead className="bg-gray-50 dark:bg-dark-900">
                <tr>
                  <th className="w-[170px] px-3 py-2 text-left text-[11px] font-semibold text-gray-500">时间</th>
                  <th className="w-[80px] px-3 py-2 text-left text-[11px] font-semibold text-gray-500">级别</th>
                  <th className="px-3 py-2 text-left text-[11px] font-semibold text-gray-500">日志详细信息</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-dark-800">
                {logs.map((row) => (
                  <tr key={row.id} className="align-top">
                    <td className="px-3 py-2 text-xs text-gray-700 dark:text-gray-300">{formatTime(row.created_at)}</td>
                    <td className="px-3 py-2 text-xs">
                      <span className={`inline-flex rounded-full px-2 py-0.5 font-semibold ${levelBadgeClass(row.level)}`}>
                        {row.level}
                      </span>
                    </td>
                    <td className="whitespace-normal break-all px-3 py-2 text-xs text-gray-700 dark:text-gray-300">
                      {formatSystemLogDetail(row)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pagination
          total={total}
          page={page}
          pageSize={pageSize}
          onUpdatePage={(next) => setPage(next)}
          onUpdatePageSize={(next) => {
            setPageSize(next)
            setPage(1)
          }}
        />
      </div>
    </section>
  )
}
