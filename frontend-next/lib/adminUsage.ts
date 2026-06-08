import { apiClient } from './apiClient'
import type { PaginatedResponse } from './types'

export type UsageRequestType = 'chat' | 'embedding' | 'image' | 'audio' | 'function' | string

export interface AdminUsageLog {
  id: number
  user_id?: number | null
  api_key_id?: number | null
  account_id?: number | null
  group_id?: number | null
  created_at: string
  request_type?: string | null
  model?: string | null
  prompt_tokens?: number | null
  completion_tokens?: number | null
  total_tokens?: number | null
  cost?: number | null
  status_code?: number | null
  upstream_status_code?: number | null
}

export interface UsageCleanupTask {
  id: number
  status: string
  created_at: string
  updated_at: string
}

export interface AdminUsageStatsResponse {
  total_requests?: number
  total_input_tokens?: number
  total_output_tokens?: number
  total_cache_tokens?: number
  total_tokens?: number
  total_cost?: number
  total_actual_cost?: number
  total_account_cost?: number
  average_duration_ms?: number
}

export interface AdminUsageQueryParams {
  page?: number
  page_size?: number
  user_id?: number
  api_key_id?: number
  account_id?: number
  group_id?: number
  model?: string | null
  request_type?: UsageRequestType | null
  stream?: boolean | null
  billing_type?: number | null
  start_time?: string
  end_time?: string
  sort_by?: string
  sort_order?: 'asc' | 'desc'
}

export async function list(
  params: AdminUsageQueryParams = { page: 1, page_size: 10 }
): Promise<PaginatedResponse<AdminUsageLog>> {
  const { data } = await apiClient.get<PaginatedResponse<AdminUsageLog>>('/admin/usage', {
    params
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
  } = {}
): Promise<AdminUsageStatsResponse> {
  const { data } = await apiClient.get<AdminUsageStatsResponse>('/admin/usage/stats', {
    params
  })
  return data
}

export const adminUsageAPI = {
  list,
  getStats
}
