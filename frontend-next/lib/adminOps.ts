import { apiClient } from './apiClient'

export type OpsQueryMode = 'auto' | 'raw' | 'preagg'

export interface OpsDashboardOverview {
  start_time?: string
  end_time?: string
  platform?: string
  group_id?: number | null
  success_count?: number
  error_count_total?: number
  error_count_sla?: number
  request_count_total?: number
  request_count_sla?: number
  token_consumed?: number
  sla?: number
  error_rate?: number
  upstream_error_rate?: number
  upstream_error_count_excl_429_529?: number
  upstream_429_count?: number
  upstream_529_count?: number
  qps?: {
    current?: number
    peak?: number
    avg?: number
  }
  tps?: {
    current?: number
    peak?: number
    avg?: number
  }
}

export interface OpsRequestOptions {
  signal?: AbortSignal
}

export async function getDashboardOverview(
  params: {
    time_range?: '5m' | '30m' | '1h' | '6h' | '24h'
    start_time?: string
    end_time?: string
    platform?: string
    group_id?: number | null
    mode?: OpsQueryMode
  } = {},
  options: OpsRequestOptions = {}
): Promise<OpsDashboardOverview> {
  const { data } = await apiClient.get<OpsDashboardOverview>('/admin/ops/dashboard/overview', {
    params,
    signal: options.signal
  })
  return data
}

export const adminOpsAPI = {
  getDashboardOverview
}
