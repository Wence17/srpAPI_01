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
  user?: { id: number; email?: string; username?: string }
  group?: { id: number; name: string }
}

export interface GenerateRedeemCodesRequest {
  count: number
  type: RedeemCodeType
  value: number
  group_id?: number | null
  validity_days?: number
  expires_at?: string | null
  expires_in_days?: number
}

export interface BatchUpdateRedeemCodeFields {
  status?: 'unused' | 'disabled'
  expires_at?: string | null
  notes?: string
  group_id?: number | null
}

export interface RedeemCodeFilters {
  type?: RedeemCodeType
  status?: 'active' | 'used' | 'expired' | 'unused' | 'disabled'
  search?: string
  sort_by?: string
  sort_order?: 'asc' | 'desc'
}

export interface RedeemCodeStats {
  total_codes: number
  active_codes: number
  used_codes: number
  expired_codes: number
  total_value_distributed: number
  by_type: Record<RedeemCodeType, number>
}

export async function list(
  page: number = 1,
  pageSize: number = 20,
  filters?: RedeemCodeFilters,
  options?: { signal?: AbortSignal },
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

export async function getById(id: number): Promise<RedeemCode> {
  const { data } = await apiClient.get<RedeemCode>(`/admin/redeem-codes/${id}`)
  return data
}

export async function generate(
  count: number,
  type: RedeemCodeType,
  value: number,
  groupId?: number | null,
  validityDays?: number,
  expiresInDays?: number | null,
): Promise<RedeemCode[]> {
  const payload: GenerateRedeemCodesRequest = { count, type, value }

  if (type === 'subscription') {
    payload.group_id = groupId
    if (validityDays && validityDays > 0) {
      payload.validity_days = validityDays
    }
  }
  if (expiresInDays && expiresInDays > 0) {
    payload.expires_in_days = expiresInDays
  }

  const { data } = await apiClient.post<RedeemCode[]>('/admin/redeem-codes/generate', payload)
  return data
}

export async function deleteCode(id: number): Promise<{ message: string }> {
  const { data } = await apiClient.delete<{ message: string }>(`/admin/redeem-codes/${id}`)
  return data
}

export async function batchDelete(ids: number[]): Promise<{ deleted: number; message: string }> {
  const { data } = await apiClient.post<{ deleted: number; message: string }>(
    '/admin/redeem-codes/batch-delete',
    { ids },
  )
  return data
}

export async function batchUpdate(
  ids: number[],
  fields: BatchUpdateRedeemCodeFields,
): Promise<{ updated: number; message: string }> {
  const { data } = await apiClient.post<{ updated: number; message: string }>(
    '/admin/redeem-codes/batch-update',
    { ids, fields },
  )
  return data
}

export async function expire(id: number): Promise<RedeemCode> {
  const { data } = await apiClient.post<RedeemCode>(`/admin/redeem-codes/${id}/expire`)
  return data
}

export async function getStats(): Promise<RedeemCodeStats> {
  const { data } = await apiClient.get<RedeemCodeStats>('/admin/redeem-codes/stats')
  return data
}

export async function exportCodes(filters?: {
  type?: RedeemCodeType
  status?: 'used' | 'expired' | 'unused' | 'disabled'
  search?: string
  sort_by?: string
  sort_order?: 'asc' | 'desc'
}): Promise<Blob> {
  const response = await apiClient.get('/admin/redeem-codes/export', {
    params: filters,
    responseType: 'blob',
  })
  return response.data as Blob
}

export const adminRedeemAPI = {
  list,
  getById,
  generate,
  delete: deleteCode,
  batchDelete,
  batchUpdate,
  expire,
  getStats,
  exportCodes,
}
