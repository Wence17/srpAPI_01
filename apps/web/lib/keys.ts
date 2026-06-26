import { apiClient } from './apiClient'
import type {
  ApiKey,
  CreateApiKeyRequest,
  PaginatedResponse,
  UpdateApiKeyRequest,
} from './types'

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
  filters?: ApiKeyListFilters,
  options?: { signal?: AbortSignal },
): Promise<PaginatedResponse<ApiKey>> {
  const params = {
    page,
    page_size: pageSize,
    ...filters,
  }
  const { data } = await apiClient.get<PaginatedResponse<ApiKey>>('/keys', {
    params,
    signal: options?.signal,
  })
  return data
}

export async function list(
  page = 1,
  pageSize = 10,
  filters?: ApiKeyListFilters,
  options?: { signal?: AbortSignal },
): Promise<PaginatedResponse<ApiKey>> {
  return listKeys(page, pageSize, filters, options)
}

export async function getById(id: number): Promise<ApiKey> {
  const { data } = await apiClient.get<ApiKey>(`/keys/${id}`)
  return data
}

export async function create(
  name: string,
  groupId?: number | null,
  customKey?: string,
  ipWhitelist?: string[],
  ipBlacklist?: string[],
  quota?: number,
  expiresInDays?: number,
  rateLimitData?: { rate_limit_5h?: number; rate_limit_1d?: number; rate_limit_7d?: number },
): Promise<ApiKey> {
  const payload: CreateApiKeyRequest = { name }
  if (groupId !== undefined) {
    payload.group_id = groupId
  }
  if (customKey) {
    payload.custom_key = customKey
  }
  if (ipWhitelist && ipWhitelist.length > 0) {
    payload.ip_whitelist = ipWhitelist
  }
  if (ipBlacklist && ipBlacklist.length > 0) {
    payload.ip_blacklist = ipBlacklist
  }
  if (quota !== undefined && quota > 0) {
    payload.quota = quota
  }
  if (expiresInDays !== undefined && expiresInDays > 0) {
    payload.expires_in_days = expiresInDays
  }
  if (rateLimitData?.rate_limit_5h && rateLimitData.rate_limit_5h > 0) {
    payload.rate_limit_5h = rateLimitData.rate_limit_5h
  }
  if (rateLimitData?.rate_limit_1d && rateLimitData.rate_limit_1d > 0) {
    payload.rate_limit_1d = rateLimitData.rate_limit_1d
  }
  if (rateLimitData?.rate_limit_7d && rateLimitData.rate_limit_7d > 0) {
    payload.rate_limit_7d = rateLimitData.rate_limit_7d
  }

  const { data } = await apiClient.post<ApiKey>('/keys', payload)
  return data
}

export async function update(id: number, updates: UpdateApiKeyRequest): Promise<ApiKey> {
  const { data } = await apiClient.put<ApiKey>(`/keys/${id}`, updates)
  return data
}

export async function deleteKey(id: number): Promise<{ message: string }> {
  const { data } = await apiClient.delete<{ message: string }>(`/keys/${id}`)
  return data
}

export async function toggleStatus(id: number, status: 'active' | 'inactive'): Promise<ApiKey> {
  return update(id, { status })
}

export const keysAPI = {
  list,
  listKeys,
  getById,
  create,
  update,
  delete: deleteKey,
  toggleStatus,
}
