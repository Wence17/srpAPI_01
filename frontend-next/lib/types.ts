export type ToastType = 'success' | 'error' | 'info' | 'warning'

export interface Toast {
  id: string
  type: ToastType
  message: string
  duration?: number
  createdAt: number
}

export type PlatformQuotaPlatform = 'anthropic' | 'openai' | 'gemini' | 'antigravity'
export type PlatformQuotaWindow = 'daily' | 'weekly' | 'monthly'

export interface PlatformQuotaItem {
  platform: PlatformQuotaPlatform | string
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
  pages: number
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
  url?: string
  page_slug?: string
  visibility?: 'user' | 'admin' | string
  sort_order: number
}

export interface LoginAgreementDocument {
  id: string
  title: string
  content_md: string
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
  home_content?: string
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

// ==================== Admin User Management ====================

export interface AdminUser extends User {
  notes: string
  last_used_at?: string | null
  deleted_at?: string | null
  group_rates?: Record<number, number>
  current_concurrency?: number
  allowed_groups?: number[] | null
  rpm_limit?: number
  last_active_at?: string | null
  subscriptions?: UserSubscription[]
}

export interface UpdateUserRequest {
  email?: string
  password?: string
  username?: string
  notes?: string
  role?: 'admin' | 'user'
  balance?: number
  concurrency?: number
  rpm_limit?: number
  status?: 'active' | 'disabled'
  allowed_groups?: number[] | null
  group_rates?: Record<number, number | null>
}

export interface BalanceHistoryItem {
  id: number
  code: string
  type: string
  value: number
  status: string
  used_by: number | null
  used_at: string | null
  created_at: string
  group_id: number | null
  validity_days: number
  notes: string
  user?: { id: number; email: string } | null
  group?: { id: number; name: string } | null
}

export interface BalanceHistoryResponse extends PaginatedResponse<BalanceHistoryItem> {
  total_recharged: number
}

export interface PlatformQuotaUpdateItem {
  platform: PlatformQuotaPlatform
  daily_limit_usd: number | null
  weekly_limit_usd: number | null
  monthly_limit_usd: number | null
}

export interface AdminBindAuthIdentityChannelRequest {
  channel: string
  channel_app_id: string
  channel_subject: string
  metadata?: Record<string, unknown> | null
}

export interface AdminBindAuthIdentityRequest {
  provider_type: string
  provider_key: string
  provider_subject: string
  issuer?: string | null
  metadata?: Record<string, unknown> | null
  channel?: AdminBindAuthIdentityChannelRequest
}

export interface AdminBoundAuthIdentityChannel {
  channel: string
  channel_app_id: string
  channel_subject: string
  metadata: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

export interface AdminBoundAuthIdentity {
  user_id: number
  provider_type: string
  provider_key: string
  provider_subject: string
  verified_at?: string | null
  issuer?: string | null
  metadata: Record<string, unknown> | null
  created_at: string
  updated_at: string
  channel?: AdminBoundAuthIdentityChannel | null
}

// ==================== User Attributes ====================

export type UserAttributeType =
  | 'text'
  | 'textarea'
  | 'number'
  | 'email'
  | 'url'
  | 'date'
  | 'select'
  | 'multi_select'

export interface UserAttributeOption {
  value: string
  label: string
  [key: string]: unknown
}

export interface UserAttributeValidation {
  min_length?: number
  max_length?: number
  min?: number
  max?: number
  pattern?: string
  message?: string
}

export interface UserAttributeDefinition {
  id: number
  key: string
  name: string
  description: string
  type: UserAttributeType
  options: UserAttributeOption[]
  required: boolean
  validation: UserAttributeValidation
  placeholder: string
  display_order: number
  enabled: boolean
  created_at: string
  updated_at: string
}

export interface UserAttributeValue {
  id: number
  user_id: number
  attribute_id: number
  value: string
  created_at: string
  updated_at: string
}

export type UserAttributeValuesMap = Record<number, string>

export interface CreateUserAttributeRequest {
  key: string
  name: string
  description?: string
  type: UserAttributeType
  options?: UserAttributeOption[]
  required?: boolean
  validation?: UserAttributeValidation
  placeholder?: string
  display_order?: number
  enabled?: boolean
}

export interface UpdateUserAttributeRequest {
  key?: string
  name?: string
  description?: string
  type?: UserAttributeType
  options?: UserAttributeOption[]
  required?: boolean
  validation?: UserAttributeValidation
  placeholder?: string
  display_order?: number
  enabled?: boolean
}

export interface RouteMeta {
  title: string
  description?: string
  originalComponent?: string
  requiresAuth?: boolean
  requiresAdmin?: boolean
  requiresPayment?: boolean
}

export interface FetchOptions {
  signal?: AbortSignal
}

// ==================== Account & Proxy Types ====================

export type AccountPlatform = 'anthropic' | 'openai' | 'gemini' | 'antigravity'
export type AccountType = 'oauth' | 'setup-token' | 'apikey' | 'upstream' | 'bedrock' | 'service_account'
export type OAuthAddMethod = 'oauth' | 'setup-token'
export type ProxyProtocol = 'http' | 'https' | 'socks5' | 'socks5h'

export interface ClaudeModel {
  id: string
  type: string
  display_name: string
  created_at: string
}

export interface Proxy {
  id: number
  name: string
  protocol: ProxyProtocol
  host: string
  port: number
  username: string | null
  password?: string | null
  status: 'active' | 'inactive'
  account_count?: number
  latency_ms?: number
  latency_status?: 'success' | 'failed'
  latency_message?: string
  ip_address?: string
  country?: string
  country_code?: string
  region?: string
  city?: string
  quality_status?: 'healthy' | 'warn' | 'challenge' | 'failed'
  quality_score?: number
  quality_grade?: string
  quality_summary?: string
  quality_checked?: number
  last_used_at?: string | null
  created_at: string
  updated_at: string
}

export interface ProxyAccountSummary {
  id: number
  name: string
  platform: AccountPlatform
  type: AccountType
  notes?: string | null
}

export interface ProxyQualityCheckItem {
  target: string
  status: 'pass' | 'warn' | 'fail' | 'challenge'
  http_status?: number
  latency_ms?: number
  message?: string
  cf_ray?: string
}

export interface ProxyQualityCheckResult {
  proxy_id: number
  score: number
  grade: string
  summary: string
  exit_ip?: string
  country?: string
  country_code?: string
  base_latency_ms?: number
  passed_count: number
  warn_count: number
  failed_count: number
  challenge_count: number
  checked_at: number
  items: ProxyQualityCheckItem[]
}

export interface GeminiCredentials {
  api_key?: string
  access_token?: string
  refresh_token?: string
  oauth_type?: 'code_assist' | 'google_one' | 'ai_studio' | string
  tier_id?:
    | 'google_one_free'
    | 'google_ai_pro'
    | 'google_ai_ultra'
    | 'gcp_standard'
    | 'gcp_enterprise'
    | 'aistudio_free'
    | 'aistudio_paid'
    | 'LEGACY'
    | 'PRO'
    | 'ULTRA'
    | string
  project_id?: string
  token_type?: string
  scope?: string
  expires_at?: string
  model_mapping?: Record<string, string>
}

export interface TempUnschedulableRule {
  error_code: number
  keywords: string[]
  duration_minutes: number
  description: string
}

export interface TempUnschedulableState {
  until_unix: number
  triggered_at_unix: number
  status_code: number
  matched_keyword: string
  rule_index: number
  error_message: string
}

export interface TempUnschedulableStatus {
  active: boolean
  state?: TempUnschedulableState
}

export interface Account {
  id: number
  name: string
  notes?: string | null
  platform: AccountPlatform
  type: AccountType
  credentials?: Record<string, unknown>
  credentials_status?: Record<string, boolean>
  extra?: (CodexUsageSnapshot &
    OpenAICompactState & {
      model_rate_limits?: Record<string, { rate_limited_at: string; rate_limit_reset_at: string }>
      antigravity_credits_overages?: Record<string, { activated_at: string; active_until: string }>
    } & Record<string, unknown>)
  proxy_id: number | null
  concurrency: number
  load_factor?: number | null
  current_concurrency?: number
  priority: number
  rate_multiplier?: number
  status: 'active' | 'inactive' | 'error'
  error_message: string | null
  last_used_at: string | null
  expires_at: number | null
  auto_pause_on_expired: boolean
  created_at: string
  updated_at: string
  proxy?: Proxy
  group_ids?: number[]
  groups?: Group[]
  schedulable: boolean
  rate_limited_at: string | null
  rate_limit_reset_at: string | null
  overload_until: string | null
  temp_unschedulable_until: string | null
  temp_unschedulable_reason: string | null
  session_window_start: string | null
  session_window_end: string | null
  session_window_status: 'allowed' | 'allowed_warning' | 'rejected' | null
  window_cost_limit?: number | null
  window_cost_sticky_reserve?: number | null
  max_sessions?: number | null
  session_idle_timeout_minutes?: number | null
  base_rpm?: number | null
  rpm_strategy?: string | null
  rpm_sticky_buffer?: number | null
  user_msg_queue_mode?: string | null
  enable_tls_fingerprint?: boolean | null
  tls_fingerprint_profile_id?: number | null
  session_id_masking_enabled?: boolean | null
  cache_ttl_override_enabled?: boolean | null
  cache_ttl_override_target?: string | null
  custom_base_url_enabled?: boolean | null
  custom_base_url?: string | null
  quota_limit?: number | null
  quota_used?: number | null
  quota_daily_limit?: number | null
  quota_daily_used?: number | null
  quota_weekly_limit?: number | null
  quota_weekly_used?: number | null
  quota_daily_reset_mode?: 'rolling' | 'fixed' | null
  quota_daily_reset_hour?: number | null
  quota_weekly_reset_mode?: 'rolling' | 'fixed' | null
  quota_weekly_reset_day?: number | null
  quota_weekly_reset_hour?: number | null
  quota_reset_timezone?: string | null
  quota_daily_reset_at?: string | null
  quota_weekly_reset_at?: string | null
  current_window_cost?: number | null
  active_sessions?: number | null
  current_rpm?: number | null
}

export interface WindowStats {
  requests: number
  tokens: number
  cost: number
  standard_cost?: number
  user_cost?: number
}

export interface UsageProgress {
  utilization: number
  resets_at: string | null
  remaining_seconds: number
  window_stats?: WindowStats | null
  used_requests?: number
  limit_requests?: number
}

export interface AntigravityModelQuota {
  utilization: number
  reset_time: string
}

export interface AccountUsageInfo {
  source?: 'passive' | 'active'
  updated_at: string | null
  five_hour: UsageProgress | null
  seven_day: UsageProgress | null
  seven_day_sonnet: UsageProgress | null
  gemini_shared_daily?: UsageProgress | null
  gemini_pro_daily?: UsageProgress | null
  gemini_flash_daily?: UsageProgress | null
  gemini_shared_minute?: UsageProgress | null
  gemini_pro_minute?: UsageProgress | null
  gemini_flash_minute?: UsageProgress | null
  antigravity_quota?: Record<string, AntigravityModelQuota> | null
  ai_credits?: Array<{
    credit_type?: string
    amount?: number
    minimum_balance?: number
  }> | null
  is_forbidden?: boolean
  forbidden_reason?: string
  forbidden_type?: string
  validation_url?: string
  needs_verify?: boolean
  is_banned?: boolean
  needs_reauth?: boolean
  error_code?: string
  error?: string
}

export interface CodexUsageSnapshot {
  codex_primary_used_percent?: number
  codex_primary_reset_after_seconds?: number
  codex_primary_window_minutes?: number
  codex_secondary_used_percent?: number
  codex_secondary_reset_after_seconds?: number
  codex_secondary_window_minutes?: number
  codex_primary_over_secondary_percent?: number
  codex_5h_used_percent?: number
  codex_5h_reset_after_seconds?: number
  codex_5h_reset_at?: string
  codex_5h_window_minutes?: number
  codex_7d_used_percent?: number
  codex_7d_reset_after_seconds?: number
  codex_7d_reset_at?: string
  codex_7d_window_minutes?: number
  codex_usage_updated_at?: string
}

export type OpenAICompactMode = 'auto' | 'force_on' | 'force_off'
export type OpenAIResponsesMode = 'auto' | 'force_responses' | 'force_chat_completions'
export type OpenAIEndpointCapability = 'chat_completions' | 'embeddings'

export interface OpenAICompactState {
  openai_compact_mode?: OpenAICompactMode
  openai_compact_supported?: boolean
  openai_compact_checked_at?: string
  openai_compact_last_status?: number
  openai_compact_last_error?: string
}

export interface OpenAIResponsesState {
  openai_responses_mode?: OpenAIResponsesMode
  openai_responses_supported?: boolean
}

export interface CreateAccountRequest {
  name: string
  notes?: string | null
  platform: AccountPlatform
  type: AccountType
  credentials: Record<string, unknown>
  extra?: Record<string, unknown>
  proxy_id?: number | null
  concurrency?: number
  load_factor?: number | null
  priority?: number
  rate_multiplier?: number
  group_ids?: number[]
  expires_at?: number | null
  auto_pause_on_expired?: boolean
  confirm_mixed_channel_risk?: boolean
}

export interface UpdateAccountRequest {
  name?: string
  notes?: string | null
  type?: AccountType
  credentials?: Record<string, unknown>
  extra?: Record<string, unknown>
  proxy_id?: number | null
  concurrency?: number
  load_factor?: number | null
  priority?: number
  rate_multiplier?: number
  schedulable?: boolean
  status?: 'active' | 'inactive' | 'error'
  group_ids?: number[]
  expires_at?: number | null
  auto_pause_on_expired?: boolean
  confirm_mixed_channel_risk?: boolean
}

export interface CheckMixedChannelRequest {
  platform: AccountPlatform
  group_ids: number[]
  account_id?: number
}

export interface MixedChannelWarningDetails {
  group_id: number
  group_name: string
  current_platform: string
  other_platform: string
}

export interface CheckMixedChannelResponse {
  has_risk: boolean
  error?: string
  message?: string
  details?: MixedChannelWarningDetails
}

export interface CreateProxyRequest {
  name: string
  protocol: ProxyProtocol
  host: string
  port: number
  username?: string | null
  password?: string | null
}

export interface UpdateProxyRequest {
  name?: string
  protocol?: ProxyProtocol
  host?: string
  port?: number
  username?: string | null
  password?: string | null
  status?: 'active' | 'inactive'
}

export interface AdminDataPayload {
  type?: string
  version?: number
  exported_at: string
  proxies: AdminDataProxy[]
  accounts: AdminDataAccount[]
}

export interface AdminDataProxy {
  proxy_key: string
  name: string
  protocol: ProxyProtocol
  host: string
  port: number
  username?: string | null
  password?: string | null
  status: 'active' | 'inactive'
}

export interface AdminDataAccount {
  name: string
  notes?: string | null
  platform: AccountPlatform
  type: AccountType
  credentials: Record<string, unknown>
  extra?: Record<string, unknown>
  proxy_key?: string | null
  concurrency: number
  priority: number
  rate_multiplier?: number | null
  expires_at?: number | null
  auto_pause_on_expired?: boolean
}

export interface AdminDataImportError {
  kind: 'proxy' | 'account'
  name?: string
  proxy_key?: string
  message: string
}

export interface AdminDataImportResult {
  proxy_created: number
  proxy_reused: number
  proxy_failed: number
  account_created: number
  account_failed: number
  errors?: AdminDataImportError[]
}

export interface CodexSessionImportRequest {
  content?: string
  contents?: string[]
  name?: string
  notes?: string | null
  group_ids?: number[]
  proxy_id?: number | null
  concurrency?: number
  priority?: number
  rate_multiplier?: number
  load_factor?: number | null
  expires_at?: number | null
  auto_pause_on_expired?: boolean
  credential_extras?: Record<string, unknown>
  extra?: Record<string, unknown>
  update_existing?: boolean
  skip_default_group_bind?: boolean
  confirm_mixed_channel_risk?: boolean
}

export interface CodexSessionImportMessage {
  index: number
  name?: string
  message: string
}

export interface CodexSessionImportItem {
  index: number
  name?: string
  action: 'created' | 'updated' | 'skipped' | 'failed'
  account_id?: number
  message?: string
}

export interface CodexSessionImportResult {
  total: number
  created: number
  updated: number
  skipped: number
  failed: number
  items?: CodexSessionImportItem[]
  warnings?: CodexSessionImportMessage[]
  errors?: CodexSessionImportMessage[]
}

// ==================== Account Usage Statistics ====================

export interface ModelStat {
  model: string
  requests: number
  input_tokens: number
  output_tokens: number
  cache_creation_tokens: number
  cache_read_tokens: number
  total_tokens: number
  cost: number
  actual_cost: number
  account_cost: number
}

export interface EndpointStat {
  endpoint: string
  requests: number
  total_tokens: number
  cost: number
  actual_cost: number
}

export interface AccountUsageHistory {
  date: string
  label: string
  requests: number
  tokens: number
  cost: number
  actual_cost: number
  user_cost: number
}

export interface AccountUsageSummary {
  days: number
  actual_days_used: number
  total_cost: number
  total_user_cost: number
  total_standard_cost: number
  total_requests: number
  total_tokens: number
  avg_daily_cost: number
  avg_daily_user_cost: number
  avg_daily_requests: number
  avg_daily_tokens: number
  avg_duration_ms: number
  today: {
    date: string
    cost: number
    user_cost: number
    requests: number
    tokens: number
  } | null
  highest_cost_day: {
    date: string
    label: string
    cost: number
    user_cost: number
    requests: number
  } | null
  highest_request_day: {
    date: string
    label: string
    requests: number
    cost: number
    user_cost: number
  } | null
}

export interface AccountUsageStatsResponse {
  history: AccountUsageHistory[]
  summary: AccountUsageSummary
  models: ModelStat[]
  endpoints: EndpointStat[]
  upstream_endpoints: EndpointStat[]
}

// ==================== Scheduled Test Types ====================

export interface ScheduledTestPlan {
  id: number
  account_id: number
  model_id: string
  cron_expression: string
  enabled: boolean
  max_results: number
  auto_recover: boolean
  last_run_at: string | null
  next_run_at: string | null
  created_at: string
  updated_at: string
}

export interface ScheduledTestResult {
  id: number
  plan_id: number
  status: string
  response_text: string
  error_message: string
  latency_ms: number
  started_at: string
  finished_at: string
  created_at: string
}

export interface CreateScheduledTestPlanRequest {
  account_id: number
  model_id: string
  cron_expression: string
  enabled?: boolean
  max_results?: number
  auto_recover?: boolean
}

export interface UpdateScheduledTestPlanRequest {
  model_id?: string
  cron_expression?: string
  enabled?: boolean
  max_results?: number
  auto_recover?: boolean
}
