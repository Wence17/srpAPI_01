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
  daily_limit_usd?: number | null
  weekly_limit_usd?: number | null
  monthly_limit_usd?: number | null
  daily_usage_usd?: number
  weekly_usage_usd?: number
  monthly_usage_usd?: number
  daily_window_start?: string | null
  weekly_window_start?: string | null
  monthly_window_start?: string | null
  daily_window_resets_at?: string | null
  weekly_window_resets_at?: string | null
  monthly_window_resets_at?: string | null
  /** @deprecated legacy fields */
  quota?: number
  usage?: number
  limit?: number
}

export interface PlatformQuotasResponse {
  platform_quotas: PlatformQuotaItem[]
}

export interface PaginatedResponse<T> {
  items: T[]
  total: number
  page: number
  page_size: number
  pages?: number
}

export type GroupPlatform = 'anthropic' | 'openai' | 'gemini' | 'antigravity' | string

export type SubscriptionType = 'standard' | 'subscription' | string

export interface CustomEndpoint {
  name: string
  endpoint: string
  description: string
}

export interface Group {
  id: number
  name: string
  description: string | null
  platform: GroupPlatform
  rate_multiplier: number
  is_exclusive?: boolean
  status?: 'active' | 'inactive'
  subscription_type: SubscriptionType
  account_count?: number
  allow_messages_dispatch?: boolean
}

export interface BasePaginationResponse<T> {
  items: T[]
  total: number
  page: number
  page_size: number
  pages: number
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
    description?: string
    platform?: string
    subscription_type?: string
    rate_multiplier?: number
    daily_limit_usd?: number | null
    weekly_limit_usd?: number | null
    monthly_limit_usd?: number | null
    supported_model_scopes?: string[]
  }
}

export type UsageRequestType = 'unknown' | 'sync' | 'stream' | 'ws_v2'

export type ImageSizeSource = 'output' | 'input' | 'default' | 'legacy' | string

export type ImageSizeBreakdown = Record<string, number>

export interface UsageLog {
  id: number
  user_id: number
  api_key_id: number
  account_id: number | null
  request_id: string
  model: string
  service_tier?: string | null
  reasoning_effort?: string | null
  inbound_endpoint?: string | null
  upstream_endpoint?: string | null
  group_id: number | null
  subscription_id: number | null
  input_tokens: number
  output_tokens: number
  cache_creation_tokens: number
  cache_read_tokens: number
  cache_creation_5m_tokens: number
  cache_creation_1h_tokens: number
  input_cost: number
  output_cost: number
  cache_creation_cost: number
  cache_read_cost: number
  total_cost: number
  actual_cost: number
  rate_multiplier: number
  billing_type: number
  request_type?: UsageRequestType
  stream: boolean
  openai_ws_mode?: boolean
  duration_ms: number | null
  first_token_ms: number | null
  image_count: number
  image_size: string | null
  image_input_size: string | null
  image_output_size: string | null
  image_size_source: ImageSizeSource | null
  image_size_breakdown: ImageSizeBreakdown | null
  user_agent: string | null
  cache_ttl_overridden: boolean
  billing_mode?: string | null
  created_at: string
  api_key?: ApiKey
}

export interface BatchApiKeyUsageStats {
  api_key_id: number
  today_actual_cost: number
  total_actual_cost: number
}

export interface BatchApiKeysUsageResponse {
  stats: Record<string, BatchApiKeyUsageStats>
}

export interface UsageStatsResponse {
  period?: string
  total_requests: number
  total_input_tokens: number
  total_output_tokens: number
  total_cache_tokens?: number
  total_tokens: number
  total_cost: number
  total_actual_cost: number
  average_duration_ms: number
  models?: Record<string, number>
}

export interface UserErrorRequest {
  id: number
  created_at: string
  model: string
  inbound_endpoint: string
  status_code: number
  category: string
  platform: string
  message: string
  key_name: string
  key_deleted: boolean
}

export interface UserErrorRequestDetail extends UserErrorRequest {
  error_body: string
  upstream_status_code?: number
}

export interface UserErrorListParams {
  page?: number
  page_size?: number
  start_date?: string
  end_date?: string
  timezone?: string
  model?: string
  status_code?: number
  category?: string
  api_key_id?: number
}

export interface UsageQueryParams {
  page?: number
  page_size?: number
  api_key_id?: number
  user_id?: number
  account_id?: number
  group_id?: number
  model?: string
  request_type?: UsageRequestType
  stream?: boolean
  billing_type?: number | null
  start_date?: string
  end_date?: string
  sort_by?: string
  sort_order?: 'asc' | 'desc'
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
    platform?: GroupPlatform
    subscription_type?: SubscriptionType
    rate_multiplier?: number
    allow_messages_dispatch?: boolean
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

export interface CreateApiKeyRequest {
  name: string
  group_id?: number | null
  custom_key?: string
  ip_whitelist?: string[]
  ip_blacklist?: string[]
  quota?: number
  expires_in_days?: number
  rate_limit_5h?: number
  rate_limit_1d?: number
  rate_limit_7d?: number
}

export interface UpdateApiKeyRequest {
  name?: string
  group_id?: number | null
  status?: 'active' | 'inactive'
  ip_whitelist?: string[]
  ip_blacklist?: string[]
  quota?: number
  expires_at?: string | null
  reset_quota?: boolean
  rate_limit_5h?: number
  rate_limit_1d?: number
  rate_limit_7d?: number
  reset_rate_limit_usage?: boolean
}

export interface CustomMenuItem {
  id: string
  label: string
  path?: string
  icon_svg?: string
  visibility?: 'user' | 'admin' | string
  sort_order: number
}

export interface LoginAgreementDocument {
  id?: string
  title: string
}

/** Notification email entry with enable/disable and verification state.
 *  email="" is a placeholder for the primary email (user's registration email or admin email). */
export interface NotifyEmailEntry {
  email: string
  disabled: boolean
  verified: boolean
}

export type UserAuthProvider = 'email' | 'linuxdo' | 'oidc' | 'wechat' | 'github' | 'google' | 'dingtalk'

export interface UserAuthBindingStatus {
  bound?: boolean
  bound_count?: number
  provider?: UserAuthProvider | string
  provider_key?: string | null
  provider_subject?: string | null
  issuer?: string | null
  label?: string | null
  provider_label?: string | null
  display_name?: string | null
  subject_hint?: string | null
  verified_at?: string | null
  bind_start_path?: string | null
  can_bind?: boolean
  can_unbind?: boolean
  note_key?: string | null
  note?: string | null
  metadata?: Record<string, unknown>
}

export interface UserProfileSourceContext {
  provider?: UserAuthProvider | string
  source?: string | null
  label?: string | null
  provider_label?: string | null
}

export interface PublicSettings {
  site_name?: string
  site_logo?: string
  site_subtitle?: string
  contact_info?: string
  frontend_url?: string
  api_base_url?: string
  doc_url?: string
  version?: string
  backend_mode_enabled?: boolean
  payment_enabled?: boolean
  risk_control_enabled?: boolean
  affiliate_enabled?: boolean
  channel_monitor_enabled?: boolean
  available_channels_enabled?: boolean
  custom_menu_items?: CustomMenuItem[]
  registration_enabled?: boolean
  email_verify_enabled?: boolean
  force_email_on_third_party_signup?: boolean
  registration_email_suffix_whitelist?: string[]
  promo_code_enabled?: boolean
  password_reset_enabled?: boolean
  invitation_code_enabled?: boolean
  login_agreement_enabled?: boolean
  login_agreement_mode?: 'modal' | 'checkbox' | string
  login_agreement_updated_at?: string
  login_agreement_revision?: string
  login_agreement_documents?: LoginAgreementDocument[]
  turnstile_enabled?: boolean
  turnstile_site_key?: string
  linuxdo_oauth_enabled?: boolean
  dingtalk_oauth_enabled?: boolean
  wechat_oauth_enabled?: boolean
  wechat_oauth_open_enabled?: boolean
  wechat_oauth_mp_enabled?: boolean
  wechat_oauth_mobile_enabled?: boolean
  oidc_oauth_enabled?: boolean
  oidc_oauth_provider_name?: string
  github_oauth_enabled?: boolean
  google_oauth_enabled?: boolean
  balance_low_notify_enabled?: boolean
  balance_low_notify_threshold?: number
  allow_user_view_error_requests?: boolean
  hide_ccs_import_button?: boolean
  custom_endpoints?: CustomEndpoint[]
}

export interface UserAnnouncement {
  id: number
  title: string
  content: string
  notify_mode?: 'popup' | 'banner' | string
  created_at: string
  updated_at?: string
  read_at: string | null
}

export interface User {
  id: string | number
  email: string
  username?: string
  avatar_url?: string | null
  avatar_source?: string | UserProfileSourceContext | null
  username_source?: string | UserProfileSourceContext | null
  display_name_source?: string | UserProfileSourceContext | null
  nickname_source?: string | UserProfileSourceContext | null
  profile_sources?: {
    avatar?: string | UserProfileSourceContext | null
    username?: string | UserProfileSourceContext | null
    display_name?: string | UserProfileSourceContext | null
    nickname?: string | UserProfileSourceContext | null
  }
  auth_bindings?: Partial<Record<UserAuthProvider, boolean | UserAuthBindingStatus>>
  identity_bindings?: Partial<Record<UserAuthProvider, boolean | UserAuthBindingStatus>>
  email_bound?: boolean
  linuxdo_bound?: boolean
  oidc_bound?: boolean
  wechat_bound?: boolean
  dingtalk_bound?: boolean
  role?: 'admin' | 'user' | string
  /** User balance for API usage (used by the payment/recharge flow) */
  balance?: number
  /** Allowed concurrent requests */
  concurrency?: number
  status?: 'active' | 'disabled' | string
  balance_notify_enabled?: boolean
  balance_notify_threshold?: number | null
  balance_notify_extra_emails?: NotifyEmailEntry[]
  created_at?: string
  updated_at?: string
  /** Runtime mode for the account: 'standard' (default) or 'simple'. */
  run_mode?: 'standard' | 'simple' | string
}

export interface ChangePasswordRequest {
  old_password: string
  new_password: string
}

export interface TotpStatus {
  enabled: boolean
  enabled_at: number | null
  feature_enabled: boolean
}

export interface TotpSetupRequest {
  email_code?: string
  password?: string
}

export interface TotpSetupResponse {
  secret: string
  qr_code_url: string
  setup_token: string
  countdown: number
}

export interface TotpEnableRequest {
  totp_code: string
  setup_token: string
}

export interface TotpEnableResponse {
  success: boolean
}

export interface TotpDisableRequest {
  email_code?: string
  password?: string
}

export interface TotpVerificationMethod {
  method: 'email' | 'password'
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
  user_email_masked?: string
}

export interface LoginRequest {
  email: string
  password: string
  remember_me?: boolean
  turnstile_token?: string
}

export interface RegisterRequest {
  email: string
  password: string
  username?: string
  verify_code?: string
  turnstile_token?: string
  promo_code?: string
  invitation_code?: string
  aff_code?: string
}

export interface ValidatePromoCodeResponse {
  valid: boolean
  bonus_amount?: number
  error_code?: string
  message?: string
}

export interface ValidateInvitationCodeResponse {
  valid: boolean
  error_code?: string
}

export interface SendVerifyCodeRequest {
  email: string
  turnstile_token?: string
  pending_auth_token?: string
  pending_oauth_token?: string
}

export interface SendVerifyCodeResponse {
  message: string
  countdown: number
}

export interface PendingOAuthSendVerifyCodeResponse extends SendVerifyCodeResponse {
  auth_result?: string
  provider?: string
  redirect?: string
}

export interface ForgotPasswordRequest {
  email: string
  turnstile_token?: string
}

export interface ForgotPasswordResponse {
  message: string
}

export interface ResetPasswordRequest {
  email: string
  token: string
  new_password: string
}

export interface ResetPasswordResponse {
  message: string
}

export interface OAuthTokenResponse {
  access_token: string
  refresh_token?: string
  expires_in?: number
  token_type?: string
  provider?: string
  redirect?: string
}

export interface PendingOAuthBindLoginResponse extends Partial<OAuthTokenResponse> {
  auth_result?: string
  redirect?: string
  error?: string
  requires_2fa?: boolean
  temp_token?: string
  user_email_masked?: string
  adoption_required?: boolean
  suggested_display_name?: string
  suggested_avatar_url?: string
}

export type PendingOAuthExchangeResponse = PendingOAuthBindLoginResponse

export interface PendingOAuthCreateAccountResponse extends OAuthTokenResponse {
  auth_result?: string
}

export type OAuthCompletionKind = 'login' | 'bind'

export interface OAuthAdoptionDecision {
  adoptDisplayName?: boolean
  adoptAvatar?: boolean
}

export type PendingAuthTokenField = 'pending_auth_token' | 'pending_oauth_token'

export interface PendingAuthSessionSummary {
  token: string
  token_field: PendingAuthTokenField
  provider: string
  redirect?: string
  adoption_required?: boolean
  suggested_display_name?: string
  suggested_avatar_url?: string
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
