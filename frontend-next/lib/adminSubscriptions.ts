import { apiClient } from './apiClient'
import type {
  AssignSubscriptionRequest,
  BulkAssignSubscriptionRequest,
  ExtendSubscriptionRequest,
  PaginatedResponse,
  SubscriptionProgress,
  UserSubscription,
} from './types'

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
  pageSize: number = 20,
  filters?: SubscriptionFilters,
  options?: { signal?: AbortSignal },
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

export async function getById(id: number): Promise<UserSubscription> {
  const { data } = await apiClient.get<UserSubscription>(`/admin/subscriptions/${id}`)
  return data
}

export async function getProgress(id: number): Promise<SubscriptionProgress> {
  const { data } = await apiClient.get<SubscriptionProgress>(`/admin/subscriptions/${id}/progress`)
  return data
}

export async function assign(request: AssignSubscriptionRequest): Promise<UserSubscription> {
  const { data } = await apiClient.post<UserSubscription>('/admin/subscriptions/assign', request)
  return data
}

export async function bulkAssign(
  request: BulkAssignSubscriptionRequest,
): Promise<UserSubscription[]> {
  const { data } = await apiClient.post<UserSubscription[]>(
    '/admin/subscriptions/bulk-assign',
    request,
  )
  return data
}

export async function extend(
  id: number,
  request: ExtendSubscriptionRequest,
): Promise<UserSubscription> {
  const { data } = await apiClient.post<UserSubscription>(
    `/admin/subscriptions/${id}/extend`,
    request,
  )
  return data
}

export async function revoke(id: number): Promise<{ message: string }> {
  const { data } = await apiClient.delete<{ message: string }>(`/admin/subscriptions/${id}`)
  return data
}

export async function resetQuota(
  id: number,
  options: { daily: boolean; weekly: boolean; monthly: boolean },
): Promise<UserSubscription> {
  const { data } = await apiClient.post<UserSubscription>(
    `/admin/subscriptions/${id}/reset-quota`,
    options,
  )
  return data
}

export async function listByGroup(
  groupId: number,
  page: number = 1,
  pageSize: number = 20,
): Promise<PaginatedResponse<UserSubscription>> {
  const { data } = await apiClient.get<PaginatedResponse<UserSubscription>>(
    `/admin/groups/${groupId}/subscriptions`,
    { params: { page, page_size: pageSize } },
  )
  return data
}

export async function listByUser(
  userId: number,
  page: number = 1,
  pageSize: number = 20,
): Promise<PaginatedResponse<UserSubscription>> {
  const { data } = await apiClient.get<PaginatedResponse<UserSubscription>>(
    `/admin/users/${userId}/subscriptions`,
    { params: { page, page_size: pageSize } },
  )
  return data
}

export const adminSubscriptionsAPI = {
  list,
  getById,
  getProgress,
  assign,
  bulkAssign,
  extend,
  revoke,
  resetQuota,
  listByGroup,
  listByUser,
}
