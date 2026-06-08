import { apiClient } from './apiClient'

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

export async function getStats(): Promise<AdminDashboardStats> {
  const { data } = await apiClient.get<AdminDashboardStats>('/admin/dashboard/stats')
  return data
}

export async function getRealtimeMetrics(): Promise<RealtimeMetrics> {
  const { data } = await apiClient.get<RealtimeMetrics>('/admin/dashboard/realtime')
  return data
}

export const adminDashboardAPI = {
  getStats,
  getRealtimeMetrics
}
