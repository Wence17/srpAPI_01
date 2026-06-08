import { apiClient } from './apiClient'
import type { PaginatedResponse, UserSubscription } from './types'

export type SubscriptionStatus = 'active' | 'expired' | 'revoked'

export interface SubscriptionFilters {
  status?: SubscriptionStatus
  user_id?: number
  group_id?: number
  platform?: string
  sort_by?: string
  sort_order?: 'asc' | 'desc'
}

export async function list(
  page: number = 1,
  pageSize: number = 10,
  filters?: SubscriptionFilters,
  options?: { signal?: AbortSignal }
): Promise<PaginatedResponse<UserSubscription>> {
  const { data } = await apiClient.get<PaginatedResponse<UserSubscription>>('/admin/subscriptions', {
    params: {
      page,
      page_size: pageSize,
      ...filters,
    },
    signal: options?.signal,
  })
  return data
}

export const adminSubscriptionsAPI = {
  list,
}
