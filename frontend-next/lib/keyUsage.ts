export interface KeyUsageRateLimit {
  window: string
  used: number
  limit: number
  reset_at?: string | null
}

export interface KeyUsageQuota {
  used: number
  limit: number
  remaining: number
}

export interface KeyUsageSubscription {
  daily_usage_usd: number
  daily_limit_usd: number
  weekly_usage_usd: number
  weekly_limit_usd: number
  monthly_usage_usd: number
  monthly_limit_usd: number
  expires_at?: string | null
}

export interface KeyUsageTokenStats {
  requests?: number
  input_tokens?: number
  output_tokens?: number
  total_tokens?: number
  cache_creation_tokens?: number
  cache_read_tokens?: number
  actual_cost?: number
}

export interface KeyUsageUsageBlock {
  today?: KeyUsageTokenStats
  total?: KeyUsageTokenStats
  rpm?: number
  tpm?: number
  average_duration_ms?: number
}

export interface KeyUsageModelStat {
  model?: string
  requests?: number
  input_tokens?: number
  output_tokens?: number
  cache_creation_tokens?: number
  cache_read_tokens?: number
  total_tokens?: number
  cost?: number
  actual_cost?: number
}

export interface KeyUsageDailyRow {
  date: string
  requests: number
  input_tokens: number
  output_tokens: number
  cache_read_tokens: number
  cache_write_tokens: number
  cost: number
  actual_cost?: number
}

export interface KeyUsageResponse {
  mode?: string
  status?: string
  isValid?: boolean
  planName?: string
  balance?: number
  remaining?: number | null
  expires_at?: string | null
  days_until_expiry?: number | null
  quota?: KeyUsageQuota
  rate_limits?: KeyUsageRateLimit[]
  subscription?: KeyUsageSubscription
  usage?: KeyUsageUsageBlock
  model_stats?: KeyUsageModelStat[]
  daily_usage?: KeyUsageDailyRow[]
}

export async function fetchKeyUsage(
  key: string,
  dateParams: string,
  queryFailedLabel = 'Query failed',
): Promise<KeyUsageResponse> {
  const url = '/v1/usage' + (dateParams ? '?' + dateParams : '')
  const res = await fetch(url, {
    headers: { Authorization: 'Bearer ' + key },
  })
  if (!res.ok) {
    const body = await res.json().catch(() => null)
    const msg =
      body?.error?.message ||
      body?.message ||
      `${queryFailedLabel} (${res.status})`
    throw new Error(msg)
  }
  return (await res.json()) as KeyUsageResponse
}
