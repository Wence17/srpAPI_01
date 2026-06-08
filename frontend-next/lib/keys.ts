import { apiClient } from './apiClient'
import type { ApiKey, PaginatedResponse } from './types'

export interface ApiKeyListFilters {
  search?: string
  status?: string
  group_id?: number | string
  sort_by?: string
  sort_order?: 'asc' | 'desc'
}

export async function listKeys(
  page = 1,
  pageSize = 10,
  filters?: ApiKeyListFilters
): Promise<PaginatedResponse<ApiKey>> {
  const params = {
    page,
    page_size: pageSize,
    ...filters
  }
  const { data } = await apiClient.get<PaginatedResponse<ApiKey>>('/keys', {
    params
  })
  return data
}

export const keysAPI = {
  listKeys
}
