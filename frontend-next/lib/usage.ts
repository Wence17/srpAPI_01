import { apiClient } from './apiClient'
import type { PaginatedResponse } from './types'

export interface TrendDataPoint {
  date: string
  requests: number
  total_tokens?: number
}

export interface ModelStat {
  model: string
  count: number
  total_tokens?: number
}

export interface UserDashboardStats {
  total_api_keys: number
  active_api_keys: number
  total_requests: number
  total_input_tokens: number
  total_output_tokens: number
  total_tokens: number
  total_cost: number
  total_actual_cost: number
  today_requests: number
  today_input_tokens: number
  today_output_tokens: number
  today_tokens: number
  today_cost: number
  today_actual_cost: number
  average_duration_ms: number
  rpm: number
  tpm: number
}

export interface UsageLogItem {
  id: number
  created_at: string
  request_id?: string
  model?: string
  total_tokens?: number
  prompt_tokens?: number
  completion_tokens?: number
  cost?: number
  actual_cost?: number
}

export interface UsageQueryParams {
  page?: number
  page_size?: number
  api_key_id?: number
  start_date?: string
  end_date?: string
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

export async function getDashboardTrend(params?: { start_date?: string; end_date?: string; granularity?: 'day' | 'hour' }): Promise<TrendResponse> {
  const { data } = await apiClient.get<TrendResponse>('/usage/dashboard/trend', {
    params
  })
  return data
}

export async function getDashboardModels(params?: { start_date?: string; end_date?: string }): Promise<ModelStatsResponse> {
  const { data } = await apiClient.get<ModelStatsResponse>('/usage/dashboard/models', {
    params
  })
  return data
}

export async function getByDateRange(startDate: string, endDate: string): Promise<PaginatedResponse<UsageLogItem>> {
  const { data } = await apiClient.get<PaginatedResponse<UsageLogItem>>('/usage', {
    params: {
      start_date: startDate,
      end_date: endDate,
      page: 1,
      page_size: 10
    }
  })
  return data
}

export async function listUsage(page = 1, pageSize = 10, apiKeyId?: number): Promise<PaginatedResponse<UsageLogItem>> {
  const params: UsageQueryParams = {
    page,
    page_size: pageSize
  }
  if (apiKeyId !== undefined) {
    params.api_key_id = apiKeyId
  }
  const { data } = await apiClient.get<PaginatedResponse<UsageLogItem>>('/usage', {
    params
  })
  return data
}

export const usageAPI = {
  getDashboardStats,
  getDashboardTrend,
  getDashboardModels,
  getByDateRange,
  listUsage
}
