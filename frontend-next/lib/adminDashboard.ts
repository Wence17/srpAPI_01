import { apiClient } from './apiClient'
import type { ModelStat, TrendDataPoint } from './usage'

export type { ModelStat, TrendDataPoint }

export interface AdminDashboardStats {
  total_api_keys?: number
  active_api_keys?: number
  total_accounts?: number
  normal_accounts?: number
  error_accounts?: number
  today_requests?: number
  total_requests?: number
  today_new_users?: number
  total_users?: number
  today_tokens?: number
  total_tokens?: number
  today_actual_cost?: number
  today_account_cost?: number
  today_cost?: number
  total_actual_cost?: number
  total_account_cost?: number
  total_cost?: number
  rpm?: number
  tpm?: number
  average_duration_ms?: number
  active_users?: number
}

export interface RealtimeMetrics {
  active_requests: number
  requests_per_minute: number
  average_response_time: number
  error_rate: number
}

export interface DashboardSnapshotV2Params {
  start_date?: string
  end_date?: string
  granularity?: 'day' | 'hour'
  include_stats?: boolean
  include_trend?: boolean
  include_model_stats?: boolean
  include_group_stats?: boolean
  include_users_trend?: boolean
  users_trend_limit?: number
}

export interface DashboardSnapshotV2Stats extends AdminDashboardStats {
  uptime?: number
}

export interface DashboardSnapshotV2Response {
  generated_at: string
  start_date: string
  end_date: string
  granularity: string
  stats?: DashboardSnapshotV2Stats
  trend?: TrendDataPoint[]
  models?: ModelStat[]
}

export interface UserUsageTrendPoint {
  date: string
  user_id: number
  email: string
  username: string
  requests: number
  tokens: number
  cost: number
  actual_cost: number
}

export interface UserTrendResponse {
  trend: UserUsageTrendPoint[]
  start_date: string
  end_date: string
  granularity: string
}

export interface UserSpendingRankingItem {
  user_id: number
  email: string
  actual_cost: number
  requests: number
  tokens: number
}

export interface UserSpendingRankingResponse {
  ranking: UserSpendingRankingItem[]
  total_actual_cost: number
  total_requests: number
  total_tokens: number
  start_date: string
  end_date: string
}

export interface UserBreakdownItem {
  user_id: number
  email: string
  requests: number
  total_tokens: number
  cost: number
  actual_cost: number
  account_cost: number
}

export interface UserBreakdownParams {
  start_date?: string
  end_date?: string
  model?: string
  model_source?: 'requested' | 'upstream' | 'mapping'
  limit?: number
}

export interface UserBreakdownResponse {
  users: UserBreakdownItem[]
  start_date: string
  end_date: string
}

export async function getStats(): Promise<AdminDashboardStats> {
  const { data } = await apiClient.get<AdminDashboardStats>('/admin/dashboard/stats')
  return data
}

export async function getRealtimeMetrics(): Promise<RealtimeMetrics> {
  const { data } = await apiClient.get<RealtimeMetrics>('/admin/dashboard/realtime')
  return data
}

export async function getSnapshotV2(
  params?: DashboardSnapshotV2Params,
): Promise<DashboardSnapshotV2Response> {
  const { data } = await apiClient.get<DashboardSnapshotV2Response>('/admin/dashboard/snapshot-v2', {
    params,
  })
  return data
}

export async function getUserUsageTrend(params?: {
  start_date?: string
  end_date?: string
  granularity?: 'day' | 'hour'
  limit?: number
}): Promise<UserTrendResponse> {
  const { data } = await apiClient.get<UserTrendResponse>('/admin/dashboard/users-trend', { params })
  return data
}

export async function getUserSpendingRanking(params?: {
  start_date?: string
  end_date?: string
  limit?: number
}): Promise<UserSpendingRankingResponse> {
  const { data } = await apiClient.get<UserSpendingRankingResponse>('/admin/dashboard/users-ranking', {
    params,
  })
  return data
}

export async function getUserBreakdown(params: UserBreakdownParams): Promise<UserBreakdownResponse> {
  const { data } = await apiClient.get<UserBreakdownResponse>('/admin/dashboard/user-breakdown', {
    params,
  })
  return data
}

export interface PlatformUsage {
  platform: string
  today_actual_cost: number
  total_actual_cost: number
}

export interface BatchUserUsageStats {
  user_id: number
  today_actual_cost: number
  total_actual_cost: number
  by_platform?: PlatformUsage[]
}

export interface BatchUsersUsageResponse {
  stats: Record<string, BatchUserUsageStats>
}

export async function getBatchUsersUsage(userIds: number[]): Promise<BatchUsersUsageResponse> {
  const { data } = await apiClient.post<BatchUsersUsageResponse>('/admin/dashboard/users-usage', {
    user_ids: userIds,
  })
  return data
}

export const adminDashboardAPI = {
  getStats,
  getRealtimeMetrics,
  getSnapshotV2,
  getUserUsageTrend,
  getUserSpendingRanking,
  getUserBreakdown,
  getBatchUsersUsage,
}
