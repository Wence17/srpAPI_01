import { apiClient } from './apiClient'

export type Provider = 'openai' | 'anthropic' | 'gemini'
export type MonitorStatus = 'operational' | 'degraded' | 'failed' | 'error' | ''

export interface ExtraModelStatus {
  model: string
  status: MonitorStatus | ''
  latency_ms: number | null
}

export interface ChannelMonitor {
  id: number
  name: string
  provider: Provider
  api_mode: string
  endpoint: string
  api_key_masked: string
  api_key_decrypt_failed?: boolean
  primary_model: string
  extra_models: string[]
  group_name: string
  enabled: boolean
  interval_seconds: number
  last_checked_at: string | null
  created_by: number
  created_at: string
  updated_at: string
  primary_status: MonitorStatus | ''
  primary_latency_ms: number | null
  availability_7d: number
  extra_models_status: ExtraModelStatus[]
  template_id: number | null
  extra_headers: Record<string, string>
  body_override_mode: string
  body_override: Record<string, unknown> | null
}

export interface ListParams {
  page?: number
  page_size?: number
  provider?: Provider
  enabled?: boolean
  search?: string
}

export interface ListResponse {
  items: ChannelMonitor[]
  total: number
  page: number
  page_size: number
  pages: number
}

export async function list(
  params: ListParams = {},
  options?: { signal?: AbortSignal }
): Promise<ListResponse> {
  const { data } = await apiClient.get<ListResponse>('/admin/channel-monitors', {
    params,
    signal: options?.signal,
  })
  return data
}

export const adminChannelMonitorAPI = {
  list,
}
