import { apiClient } from './apiClient'
import type {
  PaginatedResponse,
  UsageLog,
  UsageQueryParams,
  UsageStatsResponse,
  UserErrorListParams,
  UserErrorRequest,
  UserErrorRequestDetail,
} from './types'

export type UsageLogItem = UsageLog

export interface PlatformDashboardStats {
  platform: string
  total_requests: number
  total_tokens: number
  total_actual_cost: number
  today_actual_cost: number
}

export interface TrendDataPoint {
  date: string
  requests: number
  input_tokens: number
  output_tokens: number
  cache_creation_tokens: number
  cache_read_tokens: number
  total_tokens: number
  cost: number
  actual_cost: number
}

export interface ModelStat {
  model: string
  requests: number
  input_tokens?: number
  output_tokens?: number
  cache_creation_tokens?: number
  cache_read_tokens?: number
  total_tokens: number
  cost: number
  actual_cost: number
  account_cost?: number
}

export interface UserDashboardStats {
  total_api_keys: number
  active_api_keys: number
  total_requests: number
  total_input_tokens: number
  total_output_tokens: number
  total_cache_creation_tokens?: number
  total_cache_read_tokens?: number
  total_tokens: number
  total_cost: number
  total_actual_cost: number
  today_requests: number
  today_input_tokens: number
  today_output_tokens: number
  today_cache_creation_tokens?: number
  today_cache_read_tokens?: number
  today_tokens: number
  today_cost: number
  today_actual_cost: number
  average_duration_ms: number
  rpm: number
  tpm: number
  by_platform?: PlatformDashboardStats[]
}

export interface TrendResponse {
  trend: TrendDataPoint[]
  start_date: string
  end_date: string
  granularity: string
}

export interface ModelStatsResponse {
  models: ModelStat[]
  start_date: string
  end_date: string
}

export async function getDashboardStats(): Promise<UserDashboardStats> {
  const { data } = await apiClient.get<UserDashboardStats>('/usage/dashboard/stats')
  return data
}

export async function getDashboardTrend(params?: {
  start_date?: string
  end_date?: string
  granularity?: 'day' | 'hour'
}): Promise<TrendResponse> {
  const { data } = await apiClient.get<TrendResponse>('/usage/dashboard/trend', { params })
  return data
}

export async function getDashboardModels(params?: {
  start_date?: string
  end_date?: string
}): Promise<ModelStatsResponse> {
  const { data } = await apiClient.get<ModelStatsResponse>('/usage/dashboard/models', { params })
  return data
}

export async function list(
  page: number = 1,
  pageSize: number = 20,
  apiKeyId?: number,
): Promise<PaginatedResponse<UsageLog>> {
  const params: UsageQueryParams = { page, page_size: pageSize }
  if (apiKeyId !== undefined) {
    params.api_key_id = apiKeyId
  }
  const { data } = await apiClient.get<PaginatedResponse<UsageLog>>('/usage', { params })
  return data
}

export async function query(
  params: UsageQueryParams & { sort_by?: string; sort_order?: 'asc' | 'desc' },
  config: { signal?: AbortSignal } = {},
): Promise<PaginatedResponse<UsageLog>> {
  const { data } = await apiClient.get<PaginatedResponse<UsageLog>>('/usage', {
    ...config,
    params,
  })
  return data
}

export async function getStatsByDateRange(
  startDate: string,
  endDate: string,
  apiKeyId?: number,
): Promise<UsageStatsResponse> {
  const params: Record<string, unknown> = {
    start_date: startDate,
    end_date: endDate,
  }
  if (apiKeyId !== undefined) {
    params.api_key_id = apiKeyId
  }
  const { data } = await apiClient.get<UsageStatsResponse>('/usage/stats', { params })
  return data
}

export async function getByDateRange(
  startDate: string,
  endDate: string,
  apiKeyId?: number,
): Promise<PaginatedResponse<UsageLog>> {
  const params: UsageQueryParams = {
    start_date: startDate,
    end_date: endDate,
    page: 1,
    page_size: 10,
  }
  if (apiKeyId !== undefined) {
    params.api_key_id = apiKeyId
  }
  const { data } = await apiClient.get<PaginatedResponse<UsageLog>>('/usage', { params })
  return data
}

export async function listUsage(
  page = 1,
  pageSize = 10,
  apiKeyId?: number,
): Promise<PaginatedResponse<UsageLog>> {
  return list(page, pageSize, apiKeyId)
}

export async function listMyErrorRequests(
  params: UserErrorListParams,
  config: { signal?: AbortSignal } = {},
): Promise<PaginatedResponse<UserErrorRequest>> {
  const { data } = await apiClient.get<PaginatedResponse<UserErrorRequest>>('/usage/errors', {
    ...config,
    params,
  })
  return data
}

export async function getMyErrorDetail(id: number): Promise<UserErrorRequestDetail> {
  const { data } = await apiClient.get<UserErrorRequestDetail>(`/usage/errors/${id}`)
  return data
}

import type { BatchApiKeyUsageStats, BatchApiKeysUsageResponse } from './types'

export type { BatchApiKeyUsageStats, BatchApiKeysUsageResponse }

export async function getDashboardApiKeysUsage(
  apiKeyIds: number[],
  options?: { signal?: AbortSignal },
): Promise<BatchApiKeysUsageResponse> {
  const { data } = await apiClient.post<BatchApiKeysUsageResponse>(
    '/usage/dashboard/api-keys-usage',
    { api_key_ids: apiKeyIds },
    { signal: options?.signal },
  )
  return data
}

export const usageAPI = {
  list,
  query,
  getStatsByDateRange,
  getByDateRange,
  listUsage,
  getDashboardStats,
  getDashboardTrend,
  getDashboardModels,
  listMyErrorRequests,
  getMyErrorDetail,
  getDashboardApiKeysUsage,
}
