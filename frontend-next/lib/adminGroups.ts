import { apiClient } from './apiClient'
import type {
  AdminGroup,
  CreateGroupRequest,
  GroupPlatform,
  PaginatedResponse,
  UpdateGroupRequest,
} from './types'

export type { AdminGroup, GroupPlatform, SubscriptionType } from './types'

export interface GroupFilters {
  platform?: GroupPlatform
  status?: 'active' | 'inactive'
  is_exclusive?: boolean
  search?: string
  sort_by?: string
  sort_order?: 'asc' | 'desc'
}

export interface GroupRateMultiplierEntry {
  user_id: number
  user_name: string
  user_email: string
  user_notes: string
  user_status: string
  rate_multiplier?: number | null
  rpm_override?: number | null
}

export interface GroupRPMOverrideEntry {
  user_id: number
  user_name: string
  user_email: string
  user_notes: string
  user_status: string
  rpm_override: number
}

export interface GroupCapacitySummary {
  group_id: number
  concurrency_used: number
  concurrency_max: number
  sessions_used: number
  sessions_max: number
  rpm_used: number
  rpm_max: number
}

export interface GroupUsageSummary {
  group_id: number
  today_cost: number
  total_cost: number
}

export async function list(
  page: number = 1,
  pageSize: number = 10,
  filters?: GroupFilters,
  options?: { signal?: AbortSignal },
): Promise<PaginatedResponse<AdminGroup>> {
  const { data } = await apiClient.get<PaginatedResponse<AdminGroup>>('/admin/groups', {
    params: {
      page,
      page_size: pageSize,
      ...filters,
    },
    signal: options?.signal,
  })
  return data
}

export async function getAll(platform?: GroupPlatform): Promise<AdminGroup[]> {
  const { data } = await apiClient.get<AdminGroup[]>('/admin/groups/all', {
    params: platform ? { platform } : undefined,
  })
  return data
}

export async function getByPlatform(platform: GroupPlatform): Promise<AdminGroup[]> {
  return getAll(platform)
}

export async function getById(id: number): Promise<AdminGroup> {
  const { data } = await apiClient.get<AdminGroup>(`/admin/groups/${id}`)
  return data
}

export async function getModelsListCandidates(
  id: number,
  platform?: GroupPlatform,
): Promise<string[]> {
  const { data } = await apiClient.get<{ models: string[] }>(
    `/admin/groups/${id}/models-list-candidates`,
    {
      params: platform ? { platform } : undefined,
    },
  )
  return data.models || []
}

export async function create(groupData: CreateGroupRequest): Promise<AdminGroup> {
  const { data } = await apiClient.post<AdminGroup>('/admin/groups', groupData)
  return data
}

export async function update(id: number, updates: UpdateGroupRequest): Promise<AdminGroup> {
  const { data } = await apiClient.put<AdminGroup>(`/admin/groups/${id}`, updates)
  return data
}

export async function deleteGroup(id: number): Promise<{ message: string }> {
  const { data } = await apiClient.delete<{ message: string }>(`/admin/groups/${id}`)
  return data
}

export async function toggleStatus(
  id: number,
  status: 'active' | 'inactive',
): Promise<AdminGroup> {
  return update(id, { status })
}

export async function getStats(id: number): Promise<{
  total_api_keys: number
  active_api_keys: number
  total_requests: number
  total_cost: number
}> {
  const { data } = await apiClient.get<{
    total_api_keys: number
    active_api_keys: number
    total_requests: number
    total_cost: number
  }>(`/admin/groups/${id}/stats`)
  return data
}

export async function getGroupApiKeys(
  id: number,
  page: number = 1,
  pageSize: number = 20,
): Promise<PaginatedResponse<unknown>> {
  const { data } = await apiClient.get<PaginatedResponse<unknown>>(`/admin/groups/${id}/api-keys`, {
    params: { page, page_size: pageSize },
  })
  return data
}

export async function getGroupRateMultipliers(id: number): Promise<GroupRateMultiplierEntry[]> {
  const { data } = await apiClient.get<GroupRateMultiplierEntry[]>(
    `/admin/groups/${id}/rate-multipliers`,
  )
  return data
}

export async function updateSortOrder(
  updates: Array<{ id: number; sort_order: number }>,
): Promise<{ message: string }> {
  const { data } = await apiClient.put<{ message: string }>('/admin/groups/sort-order', {
    updates,
  })
  return data
}

export async function clearGroupRateMultipliers(id: number): Promise<{ message: string }> {
  const { data } = await apiClient.delete<{ message: string }>(
    `/admin/groups/${id}/rate-multipliers`,
  )
  return data
}

export async function batchSetGroupRateMultipliers(
  id: number,
  entries: Array<{ user_id: number; rate_multiplier: number }>,
): Promise<{ message: string }> {
  const { data } = await apiClient.put<{ message: string }>(
    `/admin/groups/${id}/rate-multipliers`,
    { entries },
  )
  return data
}

export async function getGroupRPMOverrides(id: number): Promise<GroupRPMOverrideEntry[]> {
  const { data } = await apiClient.get<GroupRateMultiplierEntry[]>(
    `/admin/groups/${id}/rate-multipliers`,
  )
  return data
    .filter((entry) => entry.rpm_override != null)
    .map((entry) => ({
      user_id: entry.user_id,
      user_name: entry.user_name,
      user_email: entry.user_email,
      user_notes: entry.user_notes,
      user_status: entry.user_status,
      rpm_override: entry.rpm_override as number,
    }))
}

export async function batchSetGroupRPMOverrides(
  id: number,
  entries: Array<{ user_id: number; rpm_override: number }>,
): Promise<{ message: string }> {
  const { data } = await apiClient.put<{ message: string }>(`/admin/groups/${id}/rpm-overrides`, {
    entries,
  })
  return data
}

export async function clearGroupRPMOverrides(id: number): Promise<{ message: string }> {
  const { data } = await apiClient.delete<{ message: string }>(`/admin/groups/${id}/rpm-overrides`)
  return data
}

export async function getUsageSummary(timezone?: string): Promise<GroupUsageSummary[]> {
  const { data } = await apiClient.get<GroupUsageSummary[]>('/admin/groups/usage-summary', {
    params: timezone ? { timezone } : undefined,
  })
  return data
}

export async function getCapacitySummary(): Promise<GroupCapacitySummary[]> {
  const { data } = await apiClient.get<GroupCapacitySummary[]>('/admin/groups/capacity-summary')
  return data
}

export const adminGroupsAPI = {
  list,
  getAll,
  getByPlatform,
  getById,
  getModelsListCandidates,
  create,
  update,
  delete: deleteGroup,
  toggleStatus,
  getStats,
  getGroupApiKeys,
  getGroupRateMultipliers,
  clearGroupRateMultipliers,
  batchSetGroupRateMultipliers,
  getGroupRPMOverrides,
  clearGroupRPMOverrides,
  batchSetGroupRPMOverrides,
  updateSortOrder,
  getUsageSummary,
  getCapacitySummary,
}
