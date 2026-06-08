import { apiClient } from './apiClient'

export type ModerationMode = 'off' | 'observe' | 'pre_block'
export type KeywordBlockingMode = 'keyword_only' | 'keyword_and_api' | 'api_only'
export type ContentModerationModelFilterType = 'all' | 'include' | 'exclude'

export interface ContentModerationModelFilter {
  type: ContentModerationModelFilterType
  models: string[]
}

export interface ContentModerationAPIKeyStatus {
  index: number
  key_hash: string
  masked: string
  status: 'unknown' | 'ok' | 'error' | 'frozen'
  failure_count: number
  success_count: number
  last_error: string
  last_checked_at?: string
  frozen_until?: string
  last_latency_ms: number
  last_http_status: number
  last_tested: boolean
  configured: boolean
}

export interface ContentModerationConfig {
  enabled: boolean
  mode: ModerationMode
  base_url: string
  model: string
  api_key_configured: boolean
  api_key_masked: string
  api_key_count: number
  api_key_masks: string[]
  api_key_statuses: ContentModerationAPIKeyStatus[]
  timeout_ms: number
  sample_rate: number
  all_groups: boolean
  group_ids: number[]
  record_non_hits: boolean
  thresholds: Record<string, number>
  worker_count: number
  queue_size: number
  block_status: number
  block_message: string
  email_on_hit: boolean
  auto_ban_enabled: boolean
  ban_threshold: number
  violation_window_hours: number
  retry_count: number
  hit_retention_days: number
  non_hit_retention_days: number
  pre_hash_check_enabled: boolean
  blocked_keywords: string[]
  keyword_blocking_mode: KeywordBlockingMode
  model_filter: ContentModerationModelFilter
}

export interface ContentModerationRuntimeStatus {
  enabled: boolean
  risk_control_enabled: boolean
  mode: ModerationMode
  worker_count: number
  max_workers: number
  active_workers: number
  idle_workers: number
  queue_size: number
  queue_length: number
  queue_usage_percent: number
  enqueued: number
  dropped: number
  processed: number
  errors: number
  pre_block_active: number
  pre_block_checked: number
  pre_block_allowed: number
  pre_block_blocked: number
  pre_block_errors: number
  pre_block_avg_latency_ms: number
  pre_block_api_key_active: number
  pre_block_api_key_available_count: number
  pre_block_api_key_total_calls: number
  pre_block_api_key_loads: ContentModerationAPIKeyLoad[]
  api_key_statuses: ContentModerationAPIKeyStatus[]
  flagged_hash_count: number
  last_cleanup_at?: string
  last_cleanup_deleted_hit: number
  last_cleanup_deleted_non_hit: number
}

export interface ContentModerationAPIKeyLoad {
  index: number
  key_hash: string
  masked: string
  status: 'unknown' | 'ok' | 'error' | 'frozen'
  active: number
  total: number
  success: number
  errors: number
  avg_latency_ms: number
  last_latency_ms: number
  last_http_status: number
}

export interface UpdateContentModerationConfig {
  enabled?: boolean
  mode?: ModerationMode
  base_url?: string
  model?: string
  api_key?: string
  api_keys?: string[]
  api_keys_mode?: 'append' | 'replace'
  delete_api_key_hashes?: string[]
  clear_api_key?: boolean
  timeout_ms?: number
  sample_rate?: number
  all_groups?: boolean
  group_ids?: number[]
  record_non_hits?: boolean
  thresholds?: Record<string, number>
  worker_count?: number
  queue_size?: number
  block_status?: number
  block_message?: string
  email_on_hit?: boolean
  auto_ban_enabled?: boolean
  ban_threshold?: number
  violation_window_hours?: number
  retry_count?: number
  hit_retention_days?: number
  non_hit_retention_days?: number
  pre_hash_check_enabled?: boolean
  blocked_keywords?: string[]
  keyword_blocking_mode?: KeywordBlockingMode
  model_filter?: ContentModerationModelFilter
}

export async function getConfig(): Promise<ContentModerationConfig> {
  const { data } = await apiClient.get<ContentModerationConfig>('/admin/risk-control/config')
  return data
}

export async function updateConfig(payload: UpdateContentModerationConfig): Promise<ContentModerationConfig> {
  const { data } = await apiClient.put<ContentModerationConfig>('/admin/risk-control/config', payload)
  return data
}

export async function getStatus(): Promise<ContentModerationRuntimeStatus> {
  const { data } = await apiClient.get<ContentModerationRuntimeStatus>('/admin/risk-control/status')
  return data
}

export const adminRiskControlAPI = {
  getConfig,
  updateConfig,
  getStatus,
}
