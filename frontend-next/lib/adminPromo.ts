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

export interface PromoCodeFilters {
  status?: PromoCodeStatus
  search?: string
  sort_by?: string
  sort_order?: 'asc' | 'desc'
}

export async function list(
  page: number = 1,
  pageSize: number = 10,
  filters?: PromoCodeFilters,
  options?: { signal?: AbortSignal }
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

export const adminPromoAPI = {
  list,
}
