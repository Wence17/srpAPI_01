import { apiClient } from './apiClient'
import type { PaginatedResponse } from './types'

export type PromoCodeStatus = 'active' | 'disabled'

export interface PromoCode {
  id: number
  code: string
  bonus_amount: number
  max_uses: number
  used_count: number
  status: PromoCodeStatus
  expires_at: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export interface PromoCodeUsage {
  id: number
  promo_code_id: number
  user_id: number
  bonus_amount: number
  used_at: string
  user?: {
    id: number
    email?: string
    username?: string
  }
}

export interface CreatePromoCodeRequest {
  code?: string
  bonus_amount: number
  max_uses?: number
  expires_at?: number | null
  notes?: string
}

export interface UpdatePromoCodeRequest {
  code?: string
  bonus_amount?: number
  max_uses?: number
  status?: PromoCodeStatus
  expires_at?: number | null
  notes?: string
}

export interface PromoCodeFilters {
  status?: string
  search?: string
  sort_by?: string
  sort_order?: 'asc' | 'desc'
}

export async function list(
  page: number = 1,
  pageSize: number = 20,
  filters?: PromoCodeFilters,
  options?: { signal?: AbortSignal },
): Promise<PaginatedResponse<PromoCode>> {
  const { data } = await apiClient.get<PaginatedResponse<PromoCode>>('/admin/promo-codes', {
    params: {
      page,
      page_size: pageSize,
      ...filters,
    },
    signal: options?.signal,
  })
  return data
}

export async function getById(id: number): Promise<PromoCode> {
  const { data } = await apiClient.get<PromoCode>(`/admin/promo-codes/${id}`)
  return data
}

export async function create(request: CreatePromoCodeRequest): Promise<PromoCode> {
  const { data } = await apiClient.post<PromoCode>('/admin/promo-codes', request)
  return data
}

export async function update(id: number, request: UpdatePromoCodeRequest): Promise<PromoCode> {
  const { data } = await apiClient.put<PromoCode>(`/admin/promo-codes/${id}`, request)
  return data
}

export async function deleteCode(id: number): Promise<{ message: string }> {
  const { data } = await apiClient.delete<{ message: string }>(`/admin/promo-codes/${id}`)
  return data
}

export async function getUsages(
  id: number,
  page: number = 1,
  pageSize: number = 20,
): Promise<PaginatedResponse<PromoCodeUsage>> {
  const { data } = await apiClient.get<PaginatedResponse<PromoCodeUsage>>(
    `/admin/promo-codes/${id}/usages`,
    { params: { page, page_size: pageSize } },
  )
  return data
}

export const adminPromoAPI = {
  list,
  getById,
  create,
  update,
  delete: deleteCode,
  getUsages,
}
