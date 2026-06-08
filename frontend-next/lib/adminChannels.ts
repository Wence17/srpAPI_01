import { apiClient } from './apiClient'
import type { PaginatedResponse } from './types'

export type ChannelStatus = 'active' | 'inactive' | 'disabled'

export interface PricingInterval {
  id?: number
  min_tokens: number
  max_tokens: number | null
  tier_label: string
  input_price: number | null
  output_price: number | null
  cache_write_price: number | null
  cache_read_price: number | null
  per_request_price: number | null
  sort_order: number
}

export interface ChannelModelPricing {
  id?: number
  platform: string
  models: string[]
  billing_mode: string
  input_price: number | null
  output_price: number | null
  cache_write_price: number | null
  cache_read_price: number | null
  image_output_price: number | null
  per_request_price: number | null
  intervals: PricingInterval[]
}

export interface AccountStatsPricingRule {
  id?: number
  name: string
  group_ids: number[]
  account_ids: number[]
  pricing: ChannelModelPricing[]
}

export interface Channel {
  id: number
  name: string
  description: string
  status: ChannelStatus
  billing_model_source: string
  restrict_models: boolean
  group_ids: number[]
  model_pricing: ChannelModelPricing[]
  created_at: string
  updated_at: string
}

export async function list(
  page: number = 1,
  pageSize: number = 10,
  filters?: {
    status?: ChannelStatus
    search?: string
    sort_by?: string
    sort_order?: 'asc' | 'desc'
  },
  options?: { signal?: AbortSignal }
): Promise<PaginatedResponse<Channel>> {
  const { data } = await apiClient.get<PaginatedResponse<Channel>>('/admin/channels', {
    params: {
      page,
      page_size: pageSize,
      ...filters,
    },
    signal: options?.signal,
  })
  return data
}

export const adminChannelsAPI = {
  list,
}
