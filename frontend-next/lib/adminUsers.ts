import { apiClient } from './apiClient'
import type { PaginatedResponse } from './types'

export interface AdminUser {
  id: number
  email: string
  username: string
  role: 'admin' | 'user' | string
  status: 'active' | 'disabled' | string
  balance?: number
  concurrency?: number
  allowed_groups?: number[] | null
  last_active_at?: string | null
  created_at: string
}

export interface AdminUserFilters {
  status?: 'active' | 'disabled'
  role?: 'admin' | 'user'
  search?: string
}

export async function list(
  page: number = 1,
  pageSize: number = 10,
  filters?: AdminUserFilters,
  options?: { signal?: AbortSignal }
): Promise<PaginatedResponse<AdminUser>> {
  const { data } = await apiClient.get<PaginatedResponse<AdminUser>>('/admin/users', {
    params: {
      page,
      page_size: pageSize,
      status: filters?.status,
      role: filters?.role,
      search: filters?.search,
    },
    signal: options?.signal,
  })
  return data
}

export const adminUsersAPI = {
  list,
}
