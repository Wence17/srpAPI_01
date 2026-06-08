import { apiClient } from './apiClient'
import type { PaginatedResponse } from './types'

export type ProxyStatus = 'active' | 'inactive'

export interface Proxy {
  id: number
  protocol: string
  host: string
  port: number
  username?: string | null
  status: ProxyStatus
  account_count?: number
  last_used_at?: string | null
  created_at: string
  updated_at: string
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

export const adminProxiesAPI = {
  list,
}
