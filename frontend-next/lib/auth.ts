import { apiClient } from './apiClient'
import type {
  LoginRequest,
  RegisterRequest,
  AuthResponse,
  LoginResponse,
  TotpLoginResponse,
  PublicSettings,
  ValidatePromoCodeResponse,
  ValidateInvitationCodeResponse,
  SendVerifyCodeRequest,
  SendVerifyCodeResponse,
  PendingOAuthSendVerifyCodeResponse,
  ForgotPasswordRequest,
  ForgotPasswordResponse,
  ResetPasswordRequest,
  ResetPasswordResponse,
  OAuthTokenResponse,
  OAuthAdoptionDecision,
  PendingOAuthBindLoginResponse,
  PendingOAuthCreateAccountResponse,
  OAuthCompletionKind,
  PendingOAuthExchangeResponse,
  PendingAuthSessionSummary,
  PendingAuthTokenField,
} from './types'

const AUTH_TOKEN_KEY = 'auth_token'
const REFRESH_TOKEN_KEY = 'refresh_token'
const TOKEN_EXPIRES_AT_KEY = 'token_expires_at'
const AUTH_USER_KEY = 'auth_user'
const PENDING_AUTH_SESSION_KEY = 'pending_auth_session'

export function setAuthToken(token: string): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(AUTH_TOKEN_KEY, token)
}

export function setRefreshToken(token: string): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(REFRESH_TOKEN_KEY, token)
}

export function setTokenExpiresAt(expiresIn: number): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(TOKEN_EXPIRES_AT_KEY, String(Date.now() + expiresIn * 1000))
}

export function setAuthUser(user: unknown): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(AUTH_USER_KEY, JSON.stringify(user))
}

export function getAuthToken(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem(AUTH_TOKEN_KEY)
}

export function getRefreshToken(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem(REFRESH_TOKEN_KEY)
}

export function getTokenExpiresAt(): number | null {
  if (typeof window === 'undefined') return null
  const raw = localStorage.getItem(TOKEN_EXPIRES_AT_KEY)
  return raw ? parseInt(raw, 10) : null
}

export function getPersistedAuthUser() {
  if (typeof window === 'undefined') return null
  const raw = localStorage.getItem(AUTH_USER_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

export function clearAuthStorage(): void {
  if (typeof window === 'undefined') return
  localStorage.removeItem(AUTH_TOKEN_KEY)
  localStorage.removeItem(REFRESH_TOKEN_KEY)
  localStorage.removeItem(TOKEN_EXPIRES_AT_KEY)
  localStorage.removeItem(AUTH_USER_KEY)
}

export function isTotp2FARequired(response: LoginResponse): response is TotpLoginResponse {
  return typeof response === 'object' && response !== null && 'requires_2fa' in response && response.requires_2fa === true
}

export async function login(credentials: LoginRequest): Promise<LoginResponse> {
  const response = await apiClient.post<LoginResponse>('/auth/login', credentials)
  const data = response.data
  if (!isTotp2FARequired(data)) {
    setAuthToken(data.access_token)
    if (data.refresh_token) {
      setRefreshToken(data.refresh_token)
    }
    if (data.expires_in) {
      setTokenExpiresAt(data.expires_in)
    }
    setAuthUser(data.user)
  }
  return data
}

export async function login2FA(request: { temp_token: string; totp_code: string }): Promise<AuthResponse> {
  const response = await apiClient.post<AuthResponse>('/auth/login/2fa', request)
  const data = response.data
  setAuthToken(data.access_token)
  if (data.refresh_token) {
    setRefreshToken(data.refresh_token)
  }
  if (data.expires_in) {
    setTokenExpiresAt(data.expires_in)
  }
  setAuthUser(data.user)
  return data
}

export async function register(userData: RegisterRequest): Promise<AuthResponse> {
  const response = await apiClient.post<AuthResponse>('/auth/register', userData)
  const data = response.data
  setAuthToken(data.access_token)
  if (data.refresh_token) {
    setRefreshToken(data.refresh_token)
  }
  if (data.expires_in) {
    setTokenExpiresAt(data.expires_in)
  }
  setAuthUser(data.user)
  return data
}

export async function getCurrentUser(): Promise<import('./types').User & { run_mode?: 'standard' | 'simple' }> {
  const response = await apiClient.get<import('./types').User & { run_mode?: 'standard' | 'simple' }>('/auth/me')
  return response.data
}

export async function prepareOAuthBindAccessTokenCookie(): Promise<void> {
  if (!getAuthToken()) {
    return
  }
  await apiClient.post('/auth/oauth/bind-token')
}

export async function logout(): Promise<void> {
  const refreshToken = getRefreshToken()
  if (refreshToken) {
    try {
      await apiClient.post('/auth/logout', { refresh_token: refreshToken })
    } catch {
      // ignore
    }
  }
  clearAuthStorage()
}

export async function refreshToken(): Promise<{ access_token: string; refresh_token: string; expires_in: number }> {
  const refreshTokenValue = getRefreshToken()
  if (!refreshTokenValue) {
    throw new Error('No refresh token available')
  }
  const response = await apiClient.post<{ access_token: string; refresh_token: string; expires_in: number }>('/auth/refresh', {
    refresh_token: refreshTokenValue
  })
  return response.data
}

export async function getPublicSettings(): Promise<PublicSettings> {
  const response = await apiClient.get<PublicSettings>('/settings/public')
  return response.data
}

export type WeChatOAuthUnavailableReason =
  | 'external_browser_required'
  | 'wechat_browser_required'
  | 'native_app_required'
  | 'not_configured'
  | 'capability_unknown'

export type WeChatOAuthStartMode = 'open' | 'mp' | null

export interface ResolvedWeChatOAuthStart {
  mode: WeChatOAuthStartMode
  openEnabled: boolean
  mpEnabled: boolean
  mobileEnabled: boolean
  isWeChatBrowser: boolean
  unavailableReason: WeChatOAuthUnavailableReason | null
}

export type WeChatOAuthPublicSettings = {
  wechat_oauth_enabled?: boolean
  wechat_oauth_open_enabled?: boolean
  wechat_oauth_mp_enabled?: boolean
  wechat_oauth_mobile_enabled?: boolean
}

export function isWeChatWebOAuthEnabled(
  settings: WeChatOAuthPublicSettings | null | undefined,
): boolean {
  const legacyEnabled = settings?.wechat_oauth_enabled ?? false
  const hasExplicitCapabilities =
    typeof settings?.wechat_oauth_open_enabled === 'boolean' ||
    typeof settings?.wechat_oauth_mp_enabled === 'boolean'

  if (!hasExplicitCapabilities) {
    return legacyEnabled
  }

  return settings?.wechat_oauth_open_enabled === true || settings?.wechat_oauth_mp_enabled === true
}

export function hasExplicitWeChatOAuthCapabilities(
  settings: WeChatOAuthPublicSettings | null | undefined,
): settings is WeChatOAuthPublicSettings & {
  wechat_oauth_open_enabled: boolean
  wechat_oauth_mp_enabled: boolean
} {
  return (
    typeof settings?.wechat_oauth_open_enabled === 'boolean' &&
    typeof settings?.wechat_oauth_mp_enabled === 'boolean'
  )
}

export function resolveWeChatOAuthStart(
  settings: WeChatOAuthPublicSettings | null | undefined,
  userAgent?: string,
): ResolvedWeChatOAuthStart {
  const normalizedUserAgent = (
    userAgent ?? (typeof navigator !== 'undefined' ? navigator.userAgent : '') ??
    ''
  ).trim()
  const isWeChatBrowser = /MicroMessenger/i.test(normalizedUserAgent)
  const legacyEnabled = settings?.wechat_oauth_enabled ?? false
  const openEnabled =
    typeof settings?.wechat_oauth_open_enabled === 'boolean'
      ? settings.wechat_oauth_open_enabled
      : legacyEnabled
  const mpEnabled =
    typeof settings?.wechat_oauth_mp_enabled === 'boolean'
      ? settings.wechat_oauth_mp_enabled
      : legacyEnabled
  const mobileEnabled =
    typeof settings?.wechat_oauth_mobile_enabled === 'boolean'
      ? settings.wechat_oauth_mobile_enabled
      : false

  if (isWeChatBrowser) {
    if (mpEnabled) {
      return { mode: 'mp', openEnabled, mpEnabled, mobileEnabled, isWeChatBrowser, unavailableReason: null }
    }
    if (openEnabled) {
      return {
        mode: null,
        openEnabled,
        mpEnabled,
        mobileEnabled,
        isWeChatBrowser,
        unavailableReason: 'external_browser_required',
      }
    }
    return {
      mode: null,
      openEnabled,
      mpEnabled,
      mobileEnabled,
      isWeChatBrowser,
      unavailableReason: 'not_configured',
    }
  }

  if (openEnabled) {
    return { mode: 'open', openEnabled, mpEnabled, mobileEnabled, isWeChatBrowser, unavailableReason: null }
  }
  if (mpEnabled) {
    return {
      mode: null,
      openEnabled,
      mpEnabled,
      mobileEnabled,
      isWeChatBrowser,
      unavailableReason: 'wechat_browser_required',
    }
  }
  return {
    mode: null,
    openEnabled,
    mpEnabled,
    mobileEnabled,
    isWeChatBrowser,
    unavailableReason: 'not_configured',
  }
}

export async function validatePromoCode(code: string): Promise<ValidatePromoCodeResponse> {
  const { data } = await apiClient.post<ValidatePromoCodeResponse>('/auth/validate-promo-code', { code })
  return data
}

export async function validateInvitationCode(code: string): Promise<ValidateInvitationCodeResponse> {
  const { data } = await apiClient.post<ValidateInvitationCodeResponse>(
    '/auth/validate-invitation-code',
    { code },
  )
  return data
}

export function resolveWeChatOAuthStartStrict(
  settings: WeChatOAuthPublicSettings | null | undefined,
  userAgent?: string,
): ResolvedWeChatOAuthStart {
  const normalizedUserAgent = (
    userAgent ?? (typeof navigator !== 'undefined' ? navigator.userAgent : '') ?? ''
  ).trim()
  const isWeChatBrowser = /MicroMessenger/i.test(normalizedUserAgent)

  if (!hasExplicitWeChatOAuthCapabilities(settings)) {
    return {
      mode: null,
      openEnabled: false,
      mpEnabled: false,
      mobileEnabled: false,
      isWeChatBrowser,
      unavailableReason: 'capability_unknown',
    }
  }

  return resolveWeChatOAuthStart(settings, normalizedUserAgent)
}

function normalizePendingAuthTokenField(value: unknown): PendingAuthTokenField {
  return value === 'pending_oauth_token' ? 'pending_oauth_token' : 'pending_auth_token'
}

export function getPersistedPendingAuthSession(): PendingAuthSessionSummary | null {
  if (typeof window === 'undefined') return null
  const raw = localStorage.getItem(PENDING_AUTH_SESSION_KEY)
  if (!raw) return null

  try {
    const parsed = JSON.parse(raw) as Partial<PendingAuthSessionSummary> | null
    const provider = typeof parsed?.provider === 'string' ? parsed.provider.trim() : ''
    if (!provider) {
      localStorage.removeItem(PENDING_AUTH_SESSION_KEY)
      return null
    }
    return {
      token: typeof parsed?.token === 'string' ? parsed.token : '',
      token_field: normalizePendingAuthTokenField(parsed?.token_field),
      provider,
      redirect: typeof parsed?.redirect === 'string' ? parsed.redirect : undefined,
      adoption_required:
        typeof parsed?.adoption_required === 'boolean' ? parsed.adoption_required : undefined,
      suggested_display_name:
        typeof parsed?.suggested_display_name === 'string'
          ? parsed.suggested_display_name
          : undefined,
      suggested_avatar_url:
        typeof parsed?.suggested_avatar_url === 'string' ? parsed.suggested_avatar_url : undefined,
    }
  } catch {
    localStorage.removeItem(PENDING_AUTH_SESSION_KEY)
    return null
  }
}

export function persistPendingAuthSession(session: PendingAuthSessionSummary): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(PENDING_AUTH_SESSION_KEY, JSON.stringify(session))
}

export function clearPendingAuthSessionStorage(): void {
  if (typeof window === 'undefined') return
  localStorage.removeItem(PENDING_AUTH_SESSION_KEY)
}

export function isOAuthLoginCompletion(
  completion: Partial<OAuthTokenResponse>,
): completion is OAuthTokenResponse {
  return typeof completion.access_token === 'string' && completion.access_token.trim().length > 0
}

export function getOAuthCompletionKind(completion: Partial<OAuthTokenResponse>): OAuthCompletionKind {
  return isOAuthLoginCompletion(completion) ? 'login' : 'bind'
}

export function getPendingOAuthBindLoginKind(
  completion: PendingOAuthBindLoginResponse,
): OAuthCompletionKind {
  return getOAuthCompletionKind(completion)
}

export function isPendingOAuthCreateAccountRequired(
  completion: Pick<PendingOAuthBindLoginResponse, 'error'>,
): boolean {
  return completion.error === 'invitation_required'
}

export function hasPendingOAuthSuggestedProfile(
  completion: Pick<
    PendingOAuthBindLoginResponse,
    'suggested_display_name' | 'suggested_avatar_url'
  >,
): boolean {
  return Boolean(completion.suggested_display_name || completion.suggested_avatar_url)
}

function serializeOAuthAdoptionDecision(decision?: OAuthAdoptionDecision): Record<string, boolean> {
  const payload: Record<string, boolean> = {}
  if (typeof decision?.adoptDisplayName === 'boolean') {
    payload.adopt_display_name = decision.adoptDisplayName
  }
  if (typeof decision?.adoptAvatar === 'boolean') {
    payload.adopt_avatar = decision.adoptAvatar
  }
  return payload
}

export async function completePendingOAuthBindLogin(
  decision?: OAuthAdoptionDecision,
): Promise<PendingOAuthBindLoginResponse> {
  const { data } = await apiClient.post<PendingOAuthBindLoginResponse>(
    '/auth/oauth/pending/exchange',
    serializeOAuthAdoptionDecision(decision),
  )
  return data
}

export async function exchangePendingOAuthCompletion(
  decision?: OAuthAdoptionDecision,
): Promise<PendingOAuthExchangeResponse> {
  return completePendingOAuthBindLogin(decision)
}

async function createPendingOAuthAccount(
  provider: 'linuxdo' | 'oidc' | 'wechat' | 'dingtalk',
  invitationCode: string,
  decision?: OAuthAdoptionDecision,
  affiliateCode?: string,
): Promise<PendingOAuthCreateAccountResponse> {
  const normalizedAffiliateCode = affiliateCode?.trim()
  const { data } = await apiClient.post<PendingOAuthCreateAccountResponse>(
    `/auth/oauth/${provider}/complete-registration`,
    {
      invitation_code: invitationCode,
      ...(normalizedAffiliateCode ? { aff_code: normalizedAffiliateCode } : {}),
      ...serializeOAuthAdoptionDecision(decision),
    },
  )
  return data
}

export async function completeLinuxDoOAuthRegistration(
  invitationCode: string,
  decision?: OAuthAdoptionDecision,
  affiliateCode?: string,
): Promise<PendingOAuthCreateAccountResponse> {
  return createPendingOAuthAccount('linuxdo', invitationCode, decision, affiliateCode)
}

export async function completeOIDCOAuthRegistration(
  invitationCode: string,
  decision?: OAuthAdoptionDecision,
  affiliateCode?: string,
): Promise<PendingOAuthCreateAccountResponse> {
  return createPendingOAuthAccount('oidc', invitationCode, decision, affiliateCode)
}

export async function completeWeChatOAuthRegistration(
  invitationCode: string,
  decision?: OAuthAdoptionDecision,
  affiliateCode?: string,
): Promise<PendingOAuthCreateAccountResponse> {
  return createPendingOAuthAccount('wechat', invitationCode, decision, affiliateCode)
}

export async function completeDingTalkOAuthRegistration(
  invitationCode: string,
  decision?: OAuthAdoptionDecision,
  affiliateCode?: string,
): Promise<PendingOAuthCreateAccountResponse> {
  return createPendingOAuthAccount('dingtalk', invitationCode, decision, affiliateCode)
}

export function persistOAuthTokenContext(tokens: Partial<OAuthTokenResponse>): void {
  if (tokens.refresh_token) {
    setRefreshToken(tokens.refresh_token)
  }
  if (tokens.expires_in) {
    setTokenExpiresAt(tokens.expires_in)
  }
}

export async function sendVerifyCode(request: SendVerifyCodeRequest): Promise<SendVerifyCodeResponse> {
  const { data } = await apiClient.post<SendVerifyCodeResponse>('/auth/send-verify-code', request)
  return data
}

export async function sendPendingOAuthVerifyCode(
  request: SendVerifyCodeRequest,
): Promise<PendingOAuthSendVerifyCodeResponse> {
  const { data } = await apiClient.post<PendingOAuthSendVerifyCodeResponse>(
    '/auth/oauth/pending/send-verify-code',
    request,
  )
  return data
}

export async function forgotPassword(request: ForgotPasswordRequest): Promise<ForgotPasswordResponse> {
  const { data } = await apiClient.post<ForgotPasswordResponse>('/auth/forgot-password', request)
  return data
}

export async function resetPassword(request: ResetPasswordRequest): Promise<ResetPasswordResponse> {
  const { data } = await apiClient.post<ResetPasswordResponse>('/auth/reset-password', request)
  return data
}
