import { apiClient } from './apiClient'
import type { PaginatedResponse } from './types'

export type AnnouncementStatus = 'draft' | 'active' | 'archived'
export type AnnouncementNotifyMode = 'silent' | 'popup'

export interface AnnouncementCondition {
  type: 'subscription' | 'balance'
  operator: 'in' | 'gt' | 'gte' | 'lt' | 'lte' | 'eq'
  group_ids?: number[]
  value?: number
}

export interface AnnouncementConditionGroup {
  all_of?: AnnouncementCondition[]
}

export interface AnnouncementTargeting {
  any_of?: AnnouncementConditionGroup[]
}

export interface Announcement {
  id: number
  title: string
  content: string
  status: AnnouncementStatus
  notify_mode: AnnouncementNotifyMode
  targeting: AnnouncementTargeting
  starts_at?: string
  ends_at?: string
  created_at: string
  updated_at: string
}

export interface AnnouncementFilters {
  status?: AnnouncementStatus
  search?: string
  sort_by?: string
  sort_order?: 'asc' | 'desc'
}

export async function list(
  page: number = 1,
  pageSize: number = 10,
  filters?: AnnouncementFilters,
  options?: { signal?: AbortSignal }
): Promise<PaginatedResponse<Announcement>> {
  const { data } = await apiClient.get<PaginatedResponse<Announcement>>('/admin/announcements', {
    params: {
      page,
      page_size: pageSize,
      ...filters,
    },
    signal: options?.signal,
  })
  return data
}

export const adminAnnouncementsAPI = {
  list,
}
