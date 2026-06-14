import { apiClient } from './apiClient'
import type { PaginatedResponse, Proxy } from './types'

export type { Proxy } from './types'

export type ProxyStatus = 'active' | 'inactive'

/** @deprecated Use `Proxy` from `./types` */
export type AdminProxy = Proxy

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

export interface ProxyListFilters {
  protocol?: string
  status?: ProxyStatus
  search?: string
  sort_by?: string
  sort_order?: 'asc' | 'desc'
}

export async function list(
  page: number = 1,
  pageSize: number = 10,
  filters?: ProxyListFilters,
  options?: { signal?: AbortSignal }
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

export interface ProxyTestResult {
  success: boolean
  message: string
  latency_ms?: number
  ip_address?: string
  city?: string
  region?: string
  country?: string
}

export async function testProxy(id: number): Promise<ProxyTestResult> {
  const { data } = await apiClient.post<ProxyTestResult>(`/admin/proxies/${id}/test`)
  return data
}

export const adminProxiesAPI = {
  list,
  getAll,
  getAllWithCount,
  testProxy,
}
