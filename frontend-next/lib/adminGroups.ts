import { apiClient } from './apiClient'
import type { PaginatedResponse } from './types'

export type GroupPlatform = 'anthropic' | 'openai' | 'gemini' | 'antigravity'
export type SubscriptionType = 'standard' | 'subscription'

export interface AdminGroup {
  id: number
  name: string
  description: string | null
  platform: GroupPlatform
  rate_multiplier: number
  rpm_limit?: number
  is_exclusive: boolean
  status: 'active' | 'inactive'
  subscription_type: SubscriptionType
  account_count?: number
  created_at: string
  updated_at: string
}

export interface GroupFilters {
  platform?: GroupPlatform
  status?: 'active' | 'inactive'
  is_exclusive?: boolean
  search?: string
  sort_by?: string
  sort_order?: 'asc' | 'desc'
}

export async function list(
  page: number = 1,
  pageSize: number = 10,
  filters?: GroupFilters,
  options?: { signal?: AbortSignal }
): Promise<PaginatedResponse<AdminGroup>> {
  const { data } = await apiClient.get<PaginatedResponse<AdminGroup>>('/admin/groups', {
    params: {
      page,
      page_size: pageSize,
      ...filters,
    },
    signal: options?.signal,
  })
  return data
}

export const adminGroupsAPI = {
  list,
}
