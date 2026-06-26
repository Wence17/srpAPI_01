import { apiClient } from './apiClient'
import type {
  AdminUsageLog,
  EndpointStat,
  PaginatedResponse,
  UsageQueryParams,
  UsageRequestType,
} from './types'

export type {
  AdminUsageLog,
  UsageCleanupTask,
  UsageCleanupFilters,
} from './types'

export interface AdminUsageStatsResponse {
  total_requests: number
  total_input_tokens: number
  total_output_tokens: number
  total_cache_tokens: number
  total_tokens: number
  total_cost: number
  total_actual_cost: number
  total_account_cost: number
  average_duration_ms: number
  endpoints?: EndpointStat[]
  upstream_endpoints?: EndpointStat[]
  endpoint_paths?: EndpointStat[]
}

export interface SimpleUser {
  id: number
  email: string
  deleted: boolean
}

export interface SimpleApiKey {
  id: number
  name: string
  user_id: number
}

export interface CreateUsageCleanupTaskRequest {
  start_date: string
  end_date: string
  user_id?: number
  api_key_id?: number
  account_id?: number
  group_id?: number
  model?: string | null
  request_type?: UsageRequestType | null
  stream?: boolean | null
  billing_type?: number | null
  timezone?: string
}

export interface AdminUsageQueryParams extends UsageQueryParams {
  exact_total?: boolean
  billing_mode?: string
}

export async function list(
  params: AdminUsageQueryParams,
  options?: { signal?: AbortSignal },
): Promise<PaginatedResponse<AdminUsageLog>> {
  const { data } = await apiClient.get<PaginatedResponse<AdminUsageLog>>('/admin/usage', {
    params,
    signal: options?.signal,
  })
  return data
}

export async function getStats(
  params: {
    user_id?: number
    api_key_id?: number
    account_id?: number
    group_id?: number
    model?: string
    request_type?: UsageRequestType
    stream?: boolean
    period?: string
    start_date?: string
    end_date?: string
    timezone?: string
    nocache?: number
    billing_type?: number | null
    billing_mode?: string
  } = {},
): Promise<AdminUsageStatsResponse> {
  const { data } = await apiClient.get<AdminUsageStatsResponse>('/admin/usage/stats', {
    params,
  })
  return data
}

export async function searchUsers(keyword: string): Promise<SimpleUser[]> {
  const { data } = await apiClient.get<SimpleUser[]>('/admin/usage/search-users', {
    params: { q: keyword },
  })
  return data
}

export async function searchApiKeys(userId?: number, keyword?: string): Promise<SimpleApiKey[]> {
  const params: Record<string, unknown> = {}
  if (userId !== undefined) {
    params.user_id = userId
  }
  if (keyword) {
    params.q = keyword
  }
  const { data } = await apiClient.get<SimpleApiKey[]>('/admin/usage/search-api-keys', {
    params,
  })
  return data
}

export async function listCleanupTasks(
  params: { page?: number; page_size?: number },
  options?: { signal?: AbortSignal },
): Promise<PaginatedResponse<import('./types').UsageCleanupTask>> {
  const { data } = await apiClient.get<PaginatedResponse<import('./types').UsageCleanupTask>>(
    '/admin/usage/cleanup-tasks',
    {
      params,
      signal: options?.signal,
    },
  )
  return data
}

export async function createCleanupTask(
  payload: CreateUsageCleanupTaskRequest,
): Promise<import('./types').UsageCleanupTask> {
  const { data } = await apiClient.post<import('./types').UsageCleanupTask>(
    '/admin/usage/cleanup-tasks',
    payload,
  )
  return data
}

export async function cancelCleanupTask(taskId: number): Promise<{ id: number; status: string }> {
  const { data } = await apiClient.post<{ id: number; status: string }>(
    `/admin/usage/cleanup-tasks/${taskId}/cancel`,
  )
  return data
}

export const adminUsageAPI = {
  list,
  getStats,
  searchUsers,
  searchApiKeys,
  listCleanupTasks,
  createCleanupTask,
  cancelCleanupTask,
}
