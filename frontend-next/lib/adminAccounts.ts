import { apiClient } from './apiClient'
import type { PaginatedResponse } from './types'

export interface AdminAccount {
  id: number
  name: string
  platform: string
  type: string
  status: 'active' | 'inactive' | 'error' | string
  proxy_id: number | null
  proxy?: { id: number; host: string }
  concurrency: number
  current_concurrency?: number | null
  rate_multiplier?: number | null
  last_used_at?: string | null
  created_at: string
  updated_at: string
}

export interface AdminAccountFilters {
  platform?: string
  type?: string
  status?: string
  search?: string
}

export async function list(
  page: number = 1,
  pageSize: number = 10,
  filters?: AdminAccountFilters,
  options?: { signal?: AbortSignal }
): Promise<PaginatedResponse<AdminAccount>> {
  const { data } = await apiClient.get<PaginatedResponse<AdminAccount>>('/admin/accounts', {
    params: {
      page,
      page_size: pageSize,
      platform: filters?.platform,
      type: filters?.type,
      status: filters?.status,
      search: filters?.search,
    },
    signal: options?.signal,
  })
  return data
}

export const adminAccountsAPI = {
  list,
}
