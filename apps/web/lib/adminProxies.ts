import { apiClient } from './apiClient'
import type {
  AdminDataImportResult,
  AdminDataPayload,
  CreateProxyRequest,
  PaginatedResponse,
  Proxy,
  ProxyAccountSummary,
  ProxyProtocol,
  ProxyQualityCheckResult,
  UpdateProxyRequest,
} from './types'

export type { Proxy } from './types'
export type { ProxyProtocol, ProxyQualityCheckResult, ProxyAccountSummary } from './types'

export type ProxyStatus = 'active' | 'inactive'

/** @deprecated Use `Proxy` from `./types` */
export type AdminProxy = Proxy

export interface ProxyListFilters {
  protocol?: string
  status?: ProxyStatus
  search?: string
  sort_by?: string
  sort_order?: 'asc' | 'desc'
}

export interface ProxyTestResult {
  success: boolean
  message: string
  latency_ms?: number
  ip_address?: string
  city?: string
  region?: string
  country?: string
  country_code?: string
}

export async function getAll(): Promise<Proxy[]> {
  const { data } = await apiClient.get<Proxy[]>('/admin/proxies/all')
  return data
}

export async function getAllWithCount(): Promise<Proxy[]> {
  const { data } = await apiClient.get<Proxy[]>('/admin/proxies/all', {
    params: { with_count: 'true' },
  })
  return data
}

export async function getById(id: number): Promise<Proxy> {
  const { data } = await apiClient.get<Proxy>(`/admin/proxies/${id}`)
  return data
}

export async function list(
  page: number = 1,
  pageSize: number = 10,
  filters?: ProxyListFilters,
  options?: { signal?: AbortSignal },
): Promise<PaginatedResponse<Proxy>> {
  const { data } = await apiClient.get<PaginatedResponse<Proxy>>('/admin/proxies', {
    params: {
      page,
      page_size: pageSize,
      ...filters,
    },
    signal: options?.signal,
  })
  return data
}

export async function create(proxyData: CreateProxyRequest): Promise<Proxy> {
  const { data } = await apiClient.post<Proxy>('/admin/proxies', proxyData)
  return data
}

export async function update(id: number, updates: UpdateProxyRequest): Promise<Proxy> {
  const { data } = await apiClient.put<Proxy>(`/admin/proxies/${id}`, updates)
  return data
}

export async function deleteProxy(id: number): Promise<{ message: string }> {
  const { data } = await apiClient.delete<{ message: string }>(`/admin/proxies/${id}`)
  return data
}

export async function toggleStatus(id: number, status: ProxyStatus): Promise<Proxy> {
  return update(id, { status })
}

export async function testProxy(id: number): Promise<ProxyTestResult> {
  const { data } = await apiClient.post<ProxyTestResult>(`/admin/proxies/${id}/test`)
  return data
}

export async function checkProxyQuality(id: number): Promise<ProxyQualityCheckResult> {
  const { data } = await apiClient.post<ProxyQualityCheckResult>(
    `/admin/proxies/${id}/quality-check`,
  )
  return data
}

export async function getStats(id: number): Promise<{
  total_accounts: number
  active_accounts: number
  total_requests: number
  success_rate: number
  average_latency: number
}> {
  const { data } = await apiClient.get<{
    total_accounts: number
    active_accounts: number
    total_requests: number
    success_rate: number
    average_latency: number
  }>(`/admin/proxies/${id}/stats`)
  return data
}

export async function getProxyAccounts(id: number): Promise<ProxyAccountSummary[]> {
  const { data } = await apiClient.get<ProxyAccountSummary[]>(`/admin/proxies/${id}/accounts`)
  return data
}

export async function batchCreate(
  proxies: Array<{
    protocol: string
    host: string
    port: number
    username?: string
    password?: string
  }>,
): Promise<{ created: number; skipped: number }> {
  const { data } = await apiClient.post<{ created: number; skipped: number }>(
    '/admin/proxies/batch',
    { proxies },
  )
  return data
}

export async function batchDelete(ids: number[]): Promise<{
  deleted_ids: number[]
  skipped: Array<{ id: number; reason: string }>
}> {
  const { data } = await apiClient.post<{
    deleted_ids: number[]
    skipped: Array<{ id: number; reason: string }>
  }>('/admin/proxies/batch-delete', { ids })
  return data
}

export async function exportData(options?: {
  ids?: number[]
  filters?: ProxyListFilters
}): Promise<AdminDataPayload> {
  const params: Record<string, string> = {}
  if (options?.ids && options.ids.length > 0) {
    params.ids = options.ids.join(',')
  } else if (options?.filters) {
    const { protocol, status, search, sort_by, sort_order } = options.filters
    if (protocol) params.protocol = protocol
    if (status) params.status = status
    if (search) params.search = search
    if (sort_by) params.sort_by = sort_by
    if (sort_order) params.sort_order = sort_order
  }
  const { data } = await apiClient.get<AdminDataPayload>('/admin/proxies/data', { params })
  return data
}

export async function importData(payload: {
  data: AdminDataPayload
}): Promise<AdminDataImportResult> {
  const { data } = await apiClient.post<AdminDataImportResult>('/admin/proxies/data', payload)
  return data
}

export const adminProxiesAPI = {
  list,
  getAll,
  getAllWithCount,
  getById,
  create,
  update,
  delete: deleteProxy,
  toggleStatus,
  testProxy,
  checkProxyQuality,
  getStats,
  getProxyAccounts,
  batchCreate,
  batchDelete,
  exportData,
  importData,
}
