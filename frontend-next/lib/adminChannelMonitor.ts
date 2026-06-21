import { apiClient } from './apiClient'

export type Provider = 'openai' | 'anthropic' | 'gemini'
export type MonitorStatus = 'operational' | 'degraded' | 'failed' | 'error'
export type BodyOverrideMode = 'off' | 'merge' | 'replace'
export type APIMode = 'chat_completions' | 'responses'

export interface ChannelMonitor {
  id: number
  name: string
  provider: Provider
  api_mode: APIMode
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
  body_override_mode: BodyOverrideMode
  body_override: Record<string, unknown> | null
}

export interface ExtraModelStatus {
  model: string
  status: MonitorStatus | ''
  latency_ms: number | null
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

export interface CreateParams {
  name: string
  provider: Provider
  api_mode?: APIMode
  endpoint: string
  api_key: string
  primary_model: string
  extra_models?: string[]
  group_name?: string
  enabled?: boolean
  interval_seconds: number
  template_id?: number | null
  extra_headers?: Record<string, string>
  body_override_mode?: BodyOverrideMode
  body_override?: Record<string, unknown> | null
}

export type UpdateParams = Partial<CreateParams> & {
  clear_template?: boolean
}

export interface CheckResult {
  model: string
  status: MonitorStatus
  latency_ms: number | null
  ping_latency_ms: number | null
  message: string
  checked_at: string
}

export interface RunNowResponse {
  results: CheckResult[]
}

export interface HistoryItem {
  id: number
  model: string
  status: MonitorStatus
  latency_ms: number | null
  ping_latency_ms: number | null
  message: string
  checked_at: string
}

export interface HistoryParams {
  model?: string
  limit?: number
}

export interface HistoryResponse {
  items: HistoryItem[]
}

export async function list(
  params: ListParams = {},
  options?: { signal?: AbortSignal },
): Promise<ListResponse> {
  const { data } = await apiClient.get<ListResponse>('/admin/channel-monitors', {
    params,
    signal: options?.signal,
  })
  return data
}

export async function get(id: number): Promise<ChannelMonitor> {
  const { data } = await apiClient.get<ChannelMonitor>(`/admin/channel-monitors/${id}`)
  return data
}

export async function create(params: CreateParams): Promise<ChannelMonitor> {
  const { data } = await apiClient.post<ChannelMonitor>('/admin/channel-monitors', params)
  return data
}

export async function update(id: number, params: UpdateParams): Promise<ChannelMonitor> {
  const { data } = await apiClient.put<ChannelMonitor>(`/admin/channel-monitors/${id}`, params)
  return data
}

export async function del(id: number): Promise<void> {
  await apiClient.delete(`/admin/channel-monitors/${id}`)
}

export async function runNow(id: number): Promise<RunNowResponse> {
  const { data } = await apiClient.post<RunNowResponse>(`/admin/channel-monitors/${id}/run`)
  return data
}

export async function listHistory(
  id: number,
  params: HistoryParams = {},
): Promise<HistoryResponse> {
  const { data } = await apiClient.get<HistoryResponse>(`/admin/channel-monitors/${id}/history`, {
    params,
  })
  return data
}

export const adminChannelMonitorAPI = {
  list,
  get,
  create,
  update,
  del,
  runNow,
  listHistory,
}

export default adminChannelMonitorAPI
