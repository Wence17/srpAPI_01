import { apiClient } from './apiClient'
import type { AdminUser, ApiKey, PaginatedResponse, UpdateUserRequest } from './types'

export type {
  AdminUser,
  PlatformQuotaItem,
  PlatformQuotaPlatform,
  PlatformQuotaUpdateItem,
  PlatformQuotaWindow,
  PlatformQuotasResponse,
  BalanceHistoryItem,
  BalanceHistoryResponse,
  AdminBindAuthIdentityRequest,
  AdminBoundAuthIdentity,
} from './types'

export interface AdminUserFilters {
  status?: 'active' | 'disabled'
  role?: 'admin' | 'user'
  search?: string
  group_name?: string
  attributes?: Record<number, string>
  include_subscriptions?: boolean
  sort_by?: string
  sort_order?: 'asc' | 'desc'
}

export async function list(
  page: number = 1,
  pageSize: number = 20,
  filters?: AdminUserFilters,
  options?: { signal?: AbortSignal },
): Promise<PaginatedResponse<AdminUser>> {
  const params: Record<string, unknown> = {
    page,
    page_size: pageSize,
    status: filters?.status,
    role: filters?.role,
    search: filters?.search,
    group_name: filters?.group_name,
    include_subscriptions: filters?.include_subscriptions,
    sort_by: filters?.sort_by,
    sort_order: filters?.sort_order,
  }

  if (filters?.attributes) {
    for (const [attrId, value] of Object.entries(filters.attributes)) {
      if (value) {
        params[`attr[${attrId}]`] = value
      }
    }
  }

  const { data } = await apiClient.get<PaginatedResponse<AdminUser>>('/admin/users', {
    params,
    signal: options?.signal,
  })
  return data
}

export async function getById(id: number, includeDeleted = false): Promise<AdminUser> {
  const url = includeDeleted ? `/admin/users/${id}?include_deleted=true` : `/admin/users/${id}`
  const { data } = await apiClient.get<AdminUser>(url)
  return data
}

export async function create(userData: {
  email: string
  password: string
  username?: string
  notes?: string
  balance?: number
  concurrency?: number
  rpm_limit?: number
  allowed_groups?: number[] | null
}): Promise<AdminUser> {
  const { data } = await apiClient.post<AdminUser>('/admin/users', userData)
  return data
}

export async function update(id: number, updates: UpdateUserRequest): Promise<AdminUser> {
  const { data } = await apiClient.put<AdminUser>(`/admin/users/${id}`, updates)
  return data
}

export async function deleteUser(id: number): Promise<{ message: string }> {
  const { data } = await apiClient.delete<{ message: string }>(`/admin/users/${id}`)
  return data
}

export async function updateBalance(
  id: number,
  balance: number,
  operation: 'set' | 'add' | 'subtract' = 'set',
  notes?: string,
): Promise<AdminUser> {
  const { data } = await apiClient.post<AdminUser>(`/admin/users/${id}/balance`, {
    balance,
    operation,
    notes: notes || '',
  })
  return data
}

export async function updateConcurrency(id: number, concurrency: number): Promise<AdminUser> {
  return update(id, { concurrency })
}

export async function toggleStatus(id: number, status: 'active' | 'disabled'): Promise<AdminUser> {
  return update(id, { status })
}

export async function getUserApiKeys(id: number): Promise<PaginatedResponse<ApiKey>> {
  const { data } = await apiClient.get<PaginatedResponse<ApiKey>>(`/admin/users/${id}/api-keys`)
  return data
}

export async function getUserUsageStats(
  id: number,
  period: string = 'month',
): Promise<{ total_requests: number; total_cost: number; total_tokens: number }> {
  const { data } = await apiClient.get<{
    total_requests: number
    total_cost: number
    total_tokens: number
  }>(`/admin/users/${id}/usage`, { params: { period } })
  return data
}

export async function getUserBalanceHistory(
  id: number,
  page: number = 1,
  pageSize: number = 20,
  type?: string,
): Promise<import('./types').BalanceHistoryResponse> {
  const params: Record<string, unknown> = { page, page_size: pageSize }
  if (type) params.type = type
  const { data } = await apiClient.get<import('./types').BalanceHistoryResponse>(
    `/admin/users/${id}/balance-history`,
    { params },
  )
  return data
}

export async function replaceGroup(
  userId: number,
  oldGroupId: number,
  newGroupId: number,
): Promise<{ migrated_keys: number }> {
  const { data } = await apiClient.post<{ migrated_keys: number }>(
    `/admin/users/${userId}/replace-group`,
    { old_group_id: oldGroupId, new_group_id: newGroupId },
  )
  return data
}

export async function bindUserAuthIdentity(
  userId: number,
  input: import('./types').AdminBindAuthIdentityRequest,
): Promise<import('./types').AdminBoundAuthIdentity> {
  const { data } = await apiClient.post<import('./types').AdminBoundAuthIdentity>(
    `/admin/users/${userId}/auth-identities`,
    input,
  )
  return data
}

export async function getPlatformQuotas(
  id: number,
): Promise<import('./types').PlatformQuotasResponse> {
  const { data } = await apiClient.get<import('./types').PlatformQuotasResponse>(
    `/admin/users/${id}/platform-quotas`,
  )
  return data
}

export async function updatePlatformQuotas(
  id: number,
  quotas: import('./types').PlatformQuotaUpdateItem[],
): Promise<import('./types').PlatformQuotasResponse> {
  const { data } = await apiClient.put<import('./types').PlatformQuotasResponse>(
    `/admin/users/${id}/platform-quotas`,
    { quotas },
  )
  return data
}

export async function resetPlatformQuotaWindow(
  id: number,
  platform: import('./types').PlatformQuotaPlatform,
  window: import('./types').PlatformQuotaWindow,
): Promise<import('./types').PlatformQuotasResponse> {
  const { data } = await apiClient.post<import('./types').PlatformQuotasResponse>(
    `/admin/users/${id}/platform-quotas/reset`,
    { platform, window },
  )
  return data
}

export const adminUsersAPI = {
  list,
  getById,
  create,
  update,
  delete: deleteUser,
  updateBalance,
  updateConcurrency,
  toggleStatus,
  getUserApiKeys,
  getUserUsageStats,
  getUserBalanceHistory,
  replaceGroup,
  bindUserAuthIdentity,
  getPlatformQuotas,
  updatePlatformQuotas,
  resetPlatformQuotaWindow,
}
