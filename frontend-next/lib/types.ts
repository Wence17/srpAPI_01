export type ToastType = 'success' | 'error' | 'info' | 'warning'

export interface Toast {
  id: string
  type: ToastType
  message: string
  duration?: number
  createdAt: number
}

export interface PlatformQuotaItem {
  platform: string
  quota: number
  usage: number
  limit: number
}

export interface PlatformQuotasResponse {
  platform_quotas: PlatformQuotaItem[]
}

export interface PaginatedResponse<T> {
  items: T[]
  total: number
  page: number
  page_size: number
}

export interface UserSubscription {
  id: number
  user_id: number
  group_id: number
  status: 'active' | 'expired' | 'revoked'
  starts_at: string
  expires_at: string | null
  daily_usage_usd: number
  weekly_usage_usd: number
  monthly_usage_usd: number
  daily_window_start: string | null
  weekly_window_start: string | null
  monthly_window_start: string | null
  created_at: string
  updated_at: string
  user?: User
  group?: {
    id: number
    name: string
    platform?: string
  }
}

export interface SubscriptionProgress {
  subscription_id: number
  daily: {
    used: number
    limit: number | null
    percentage: number
    reset_in_seconds: number | null
  } | null
  weekly: {
    used: number
    limit: number | null
    percentage: number
    reset_in_seconds: number | null
  } | null
  monthly: {
    used: number
    limit: number | null
    percentage: number
    reset_in_seconds: number | null
  } | null
  expires_at: string | null
  days_remaining: number | null
}

export interface AssignSubscriptionRequest {
  user_id: number
  group_id: number
  validity_days?: number
}

export interface BulkAssignSubscriptionRequest {
  user_ids: number[]
  group_id: number
  validity_days?: number
}

export interface ExtendSubscriptionRequest {
  days: number
}

export interface ApiKey {
  id: number
  user_id: number
  key: string
  name: string
  group_id: number | null
  status: 'active' | 'inactive' | 'quota_exhausted' | 'expired'
  ip_whitelist: string[]
  ip_blacklist: string[]
  last_used_at: string | null
  quota: number
  quota_used: number
  expires_at: string | null
  created_at: string
  updated_at: string
  group?: {
    id: number
    name: string
    platform?: string
    subscription_type?: string
    rate_multiplier?: number
  }
  rate_limit_5h: number
  rate_limit_1d: number
  rate_limit_7d: number
  usage_5h: number
  usage_1d: number
  usage_7d: number
  window_5h_start: string | null
  window_1d_start: string | null
  window_7d_start: string | null
  reset_5h_at: string | null
  reset_1d_at: string | null
  reset_7d_at: string | null
}

export interface PublicSettings {
  site_name?: string
  site_logo?: string
  contact_info?: string
  frontend_url?: string
  backend_mode_enabled?: boolean
  payment_enabled?: boolean
  risk_control_enabled?: boolean
  custom_menu_items?: Array<{ id: string; label: string; path: string }>
}

export interface User {
  id: string
  email: string
  username?: string
  role?: 'admin' | 'user' | string
  avatar_url?: string | null
}

export interface AuthResponse {
  access_token: string
  refresh_token?: string
  expires_in?: number
  token_type?: string
  user: User
}

export interface TotpLoginResponse {
  requires_2fa: true
  temp_token: string
  auth_method: string
}

export interface LoginRequest {
  email: string
  password: string
  remember_me?: boolean
}

export interface RegisterRequest {
  email: string
  password: string
  username?: string
}

export type LoginResponse = AuthResponse | TotpLoginResponse

export interface RouteMeta {
  title: string
  description?: string
  originalComponent?: string
  requiresAuth?: boolean
  requiresAdmin?: boolean
  requiresPayment?: boolean
}
