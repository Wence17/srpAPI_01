import { apiClient } from './apiClient'
import type { PaginatedResponse } from './types'

export type RedeemCodeType = 'balance' | 'concurrency' | 'subscription' | 'invitation'
export type RedeemCodeStatus = 'active' | 'used' | 'expired' | 'unused' | 'disabled'

export interface RedeemCode {
  id: number
  code: string
  type: RedeemCodeType
  value: number
  status: RedeemCodeStatus
  used_by: number | null
  used_at: string | null
  created_at: string
  expires_at?: string | null
  updated_at?: string
  notes?: string
  group_id?: number | null
  validity_days?: number
  user?: { id: string; email: string; username?: string }
  group?: { id: number; name: string }
}

export interface RedeemCodeFilters {
  type?: RedeemCodeType
  status?: RedeemCodeStatus
  search?: string
  sort_by?: string
  sort_order?: 'asc' | 'desc'
}

export async function list(
  page: number = 1,
  pageSize: number = 10,
  filters?: RedeemCodeFilters,
  options?: { signal?: AbortSignal }
): Promise<PaginatedResponse<RedeemCode>> {
  const { data } = await apiClient.get<PaginatedResponse<RedeemCode>>('/admin/redeem-codes', {
    params: {
      page,
      page_size: pageSize,
      ...filters,
    },
    signal: options?.signal,
  })
  return data
}

export async function getStats(): Promise<{
  total_codes: number
  active_codes: number
  used_codes: number
  expired_codes: number
  total_value_distributed: number
  by_type: Record<RedeemCodeType, number>
}> {
  const { data } = await apiClient.get<{
    total_codes: number
    active_codes: number
    used_codes: number
    expired_codes: number
    total_value_distributed: number
    by_type: Record<RedeemCodeType, number>
  }>('/admin/redeem-codes/stats')
  return data
}

export const adminRedeemAPI = {
  list,
  getStats,
}
