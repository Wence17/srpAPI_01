'use client'

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent,
  type ChangeEvent,
  type FormEvent,
  type KeyboardEvent,
} from 'react'
import { useI18n } from '@/lib/i18n'
import { useApp } from '@/context/AppContext'
import { useAdminSettingsStore } from '@/lib/stores/adminSettings'
import {
  adminSettingsAPI,
  appendAuthSourceDefaultsToUpdateRequest,
  buildAuthSourceDefaultsState,
  normalizePlatformQuotasMap,
  sanitizePlatformQuotasMap,
  defaultWeChatConnectScopesForMode,
  deriveWeChatConnectStoredMode,
  normalizeDefaultSubscriptionSettings,
  resolveWeChatConnectModeCapabilities,
  type AuthSourceDefaultsState,
  type AuthSourceType,
  type SystemSettings,
  type UpdateSettingsRequest,
  type DefaultSubscriptionSetting,
  type DefaultPlatformQuotasMap,
  type OpenAIFastPolicyRule,
  type WeChatConnectMode,
  type WebSearchEmulationConfig,
  type WebSearchProviderConfig,
  type WebSearchTestResult,
} from '@/lib/adminSettings'
import { adminGroupsAPI } from '@/lib/adminGroups'
import { adminProxiesAPI } from '@/lib/adminProxies'
import { adminPaymentAPI } from '@/lib/adminPayment'
import { affiliatesAPI, type AffiliateAdminEntry, type SimpleUser as AffiliateSimpleUser } from '@/lib/adminAffiliates'
import {
  isRegistrationEmailSuffixDomainValid,
  normalizeRegistrationEmailSuffixDomain,
  normalizeRegistrationEmailSuffixDomains,
  parseRegistrationEmailSuffixWhitelistInput,
} from '@/lib/registrationEmailPolicy'
import { extractApiErrorMessage, extractI18nErrorMessage } from '@/lib/apiError'
import { useClipboard } from '@/lib/useClipboard'
import { normalizeVisibleMethod } from '@/lib/payment/paymentFlow'
import Link from 'next/link'
import AppLayout from '@/components/layout/AppLayout'
import Icon from '@/components/icons/Icon'
import Select from '@/components/common/Select'
import ConfirmDialog from '@/components/common/ConfirmDialog'
import Toggle from '@/components/common/Toggle'
import ProxySelector from '@/components/common/ProxySelector'
import HelpTooltip from '@/components/common/HelpTooltip'
import PaymentProviderList from '@/components/payment/PaymentProviderList'
import PaymentProviderDialog, { type PaymentProviderDialogHandle } from '@/components/payment/PaymentProviderDialog'
import GroupOptionItem from '@/components/keys/GroupOptionItem'
import GroupBadge from '@/components/keys/GroupBadge'
import ImageUpload from '@/components/common/ImageUpload'
import BackupSettings from '@/components/admin/settings/BackupSettings'
import EmailTemplateEditor from '@/components/admin/settings/EmailTemplateEditor'
import type { AdminGroup, LoginAgreementDocument, NotifyEmailEntry, Proxy } from '@/lib/types'
import type { ProviderInstance } from '@/lib/payment/types'

export default function AdminSettingsPage() {
  const { t, locale } = useI18n()
  const { showSuccess, showError, fetchPublicSettings } = useApp()
  const { fetch: fetchAdminSettings } = useAdminSettingsStore()
  const { copyToClipboard } = useClipboard()
  const isZhLocale = locale.startsWith('zh')
  const providerDialogRef = useRef<PaymentProviderDialogHandle | null>(null)
  const prevAffiliateEnabledRef = useRef<boolean | undefined>(undefined)
  const prevDingtalkPolicyRef = useRef<string | undefined>(undefined)
  const [, setTick] = useState(0)
  const bump = useCallback(() => setTick((n) => n + 1), [])

  function localText(zh: string, en: string): string {
    return isZhLocale ? zh : en
  }



const paymentGuideHref = useMemo(() =>
  locale.startsWith("zh")
    ? "https://github.com/Wei-Shaw/sub2api/blob/main/docs/PAYMENT_CN.md"
    : "https://github.com/Wei-Shaw/sub2api/blob/main/docs/PAYMENT.md"
,
  [locale]
);

const paymentMethodsHref = useMemo(() =>
  locale.startsWith("zh")
    ? "https://github.com/Wei-Shaw/sub2api/blob/main/docs/PAYMENT_CN.md#支持的支付方式"
    : "https://github.com/Wei-Shaw/sub2api/blob/main/docs/PAYMENT.md#supported-payment-methods"
,
  [locale]
);

type SettingsTab =
  | "general"
  | "agreement"
  | "features"
  | "security"
  | "users"
  | "gateway"
  | "payment"
  | "email"
  | "backup";
const [activeTab, setActiveTab] = useState<SettingsTab>("general");
const settingsTabs = [
  { key: "general" as SettingsTab, icon: "home" as const },
  { key: "agreement" as SettingsTab, icon: "document" as const },
  { key: "features" as SettingsTab, icon: "bolt" as const },
  { key: "security" as SettingsTab, icon: "shield" as const },
  { key: "users" as SettingsTab, icon: "user" as const },
  { key: "gateway" as SettingsTab, icon: "server" as const },
  { key: "payment" as SettingsTab, icon: "creditCard" as const },
  { key: "email" as SettingsTab, icon: "mail" as const },
  { key: "backup" as SettingsTab, icon: "database" as const },
];

const settingsTabKeyboardActions = {
  ArrowLeft: -1,
  ArrowUp: -1,
  ArrowRight: 1,
  ArrowDown: 1,
  Home: "first",
  End: "last",
} as const;

function selectSettingsTab(tab: SettingsTab): void {
  setActiveTab(tab);
}

function focusSettingsTab(tab: SettingsTab): void {
  window.requestAnimationFrame(() => {
    document.getElementById(`settings-tab-${tab}`)?.focus();
  });
}

function handleSettingsTabKeydown(event: KeyboardEvent, tab: SettingsTab): void {
  const action =
    settingsTabKeyboardActions[
      event.key as keyof typeof settingsTabKeyboardActions
    ];
  if (action === undefined) {
    return;
  }

  event.preventDefault();
  const currentIndex = settingsTabs.findIndex((item) => item.key === tab);
  let nextIndex = currentIndex < 0 ? 0 : currentIndex;

  if (action === "first") {
    nextIndex = 0;
  } else if (action === "last") {
    nextIndex = settingsTabs.length - 1;
  } else {
    nextIndex =
      (nextIndex + action + settingsTabs.length) % settingsTabs.length;
  }

  const nextTab = settingsTabs[nextIndex]?.key;
  if (!nextTab) {
    return;
  }

  selectSettingsTab(nextTab);
  focusSettingsTab(nextTab);
}


const [loading, setLoading] = useState(true);
const [loadFailed, setLoadFailed] = useState(false);
const [saving, setSaving] = useState(false);
const [testingSmtp, setTestingSmtp] = useState(false);
const [sendingTestEmail, setSendingTestEmail] = useState(false);
const [smtpPasswordManuallyEdited, setSmtpPasswordManuallyEdited] = useState(false);
const [testEmailAddress, setTestEmailAddress] = useState("");
const [registrationEmailSuffixWhitelistTags, setRegistrationEmailSuffixWhitelistTags] = useState<string[]>([]);
const [registrationEmailSuffixWhitelistDraft, setRegistrationEmailSuffixWhitelistDraft] = useState("");
const [tablePageSizeOptionsInput, setTablePageSizeOptionsInput] = useState("10, 20, 50, 100");

// Admin API Key 状态
const [adminApiKeyLoading, setAdminApiKeyLoading] = useState(true);
const [adminApiKeyExists, setAdminApiKeyExists] = useState(false);
const [adminApiKeyMasked, setAdminApiKeyMasked] = useState("");
const [adminApiKeyOperating, setAdminApiKeyOperating] = useState(false);
const [newAdminApiKey, setNewAdminApiKey] = useState("");
const [subscriptionGroups, setSubscriptionGroups] = useState<AdminGroup[]>([]);

// Overload Cooldown (529) 状态
const [overloadCooldownLoading, setOverloadCooldownLoading] = useState(true);
const [overloadCooldownSaving, setOverloadCooldownSaving] = useState(false);
const overloadCooldownFormRef = useRef({
  enabled: true,
  cooldown_minutes: 10,
});
  const overloadCooldownForm = overloadCooldownFormRef.current

// Rate Limit Cooldown (429) 状态
const [rateLimit429CooldownLoading, setRateLimit429CooldownLoading] = useState(true);
const [rateLimit429CooldownSaving, setRateLimit429CooldownSaving] = useState(false);
const rateLimit429CooldownFormRef = useRef({
  enabled: true,
  cooldown_seconds: 5,
});
  const rateLimit429CooldownForm = rateLimit429CooldownFormRef.current

// Stream Timeout 状态
const [streamTimeoutLoading, setStreamTimeoutLoading] = useState(true);
const [streamTimeoutSaving, setStreamTimeoutSaving] = useState(false);
const streamTimeoutFormRef = useRef({
  enabled: true,
  action: "temp_unsched" as "temp_unsched" | "error" | "none",
  temp_unsched_minutes: 5,
  threshold_count: 3,
  threshold_window_minutes: 10,
});
  const streamTimeoutForm = streamTimeoutFormRef.current

// Rectifier 状态
const [rectifierLoading, setRectifierLoading] = useState(true);
const [rectifierSaving, setRectifierSaving] = useState(false);
const rectifierFormRef = useRef({
  enabled: true,
  thinking_signature_enabled: true,
  thinking_budget_enabled: true,
  apikey_signature_enabled: false,
  apikey_signature_patterns: [] as string[],
});
  const rectifierForm = rectifierFormRef.current

// Beta Policy 状态
const [betaPolicyLoading, setBetaPolicyLoading] = useState(true);
const [betaPolicySaving, setBetaPolicySaving] = useState(false);
const betaPolicyFormRef = useRef({
  rules: [] as Array<{
    beta_token: string;
    action: "pass" | "filter" | "block";
    scope: "all" | "oauth" | "apikey" | "bedrock";
    error_message?: string;
    model_whitelist?: string[];
    fallback_action?: "pass" | "filter" | "block";
    fallback_error_message?: string;
  }>,
});
  const betaPolicyForm = betaPolicyFormRef.current

// OpenAI Fast/Flex Policy 状态
const openaiFastPolicyFormRef = useRef({
  rules: [] as OpenAIFastPolicyRule[],
});
  const openaiFastPolicyForm = openaiFastPolicyFormRef.current
// 标记 openai_fast_policy_settings 是否已成功从后端加载，
// 避免后端 GET 出错或字段缺失时，保存把默认规则覆盖成空数组。
const [openaiFastPolicyLoaded, setOpenaiFastPolicyLoaded] = useState(false);

const tablePageSizeMin = 5;
const tablePageSizeMax = 1000;
const tablePageSizeDefault = 20;

function defaultLoginAgreementDocuments(): LoginAgreementDocument[] {
  return [
    {
      id: "terms",
      title: "服务条款",
      content_md: "",
    },
    {
      id: "usage-policy",
      title: "使用政策",
      content_md: "",
    },
    {
      id: "supported-regions",
      title: "支持的国家和地区",
      content_md: "",
    },
    {
      id: "service-specific-terms",
      title: "服务特定条款",
      content_md: "",
    },
  ];
}

function normalizeLoginAgreementDocumentId(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/[-_]{2,}/g, "-")
    .replace(/^[-_]+|[-_]+$/g, "");
}

function loginAgreementRoutePath(
  doc: LoginAgreementDocument,
  index: number,
): string {
  const id =
    normalizeLoginAgreementDocumentId(doc.id || doc.title) || `doc-${index + 1}`;
  return `/legal/${id}`;
}

interface DefaultSubscriptionGroupOption {
  value: number;
  label: string;
  description: string | null;
  platform: AdminGroup["platform"];
  subscriptionType: AdminGroup["subscription_type"];
  rate: number;
  [key: string]: unknown;
}

type SettingsForm = Omit<
  SystemSettings,
  | "wechat_connect_open_enabled"
  | "wechat_connect_mp_enabled"
  | "wechat_connect_mobile_enabled"
> & {
  smtp_password: string;
  turnstile_secret_key: string;
  linuxdo_connect_client_secret: string;
  dingtalk_connect_client_secret: string;
  wechat_connect_app_secret: string;
  wechat_connect_open_app_secret: string;
  wechat_connect_mp_app_secret: string;
  wechat_connect_mobile_app_secret: string;
  wechat_connect_open_enabled: boolean;
  wechat_connect_mp_enabled: boolean;
  wechat_connect_mobile_enabled: boolean;
  oidc_connect_client_secret: string;
  github_oauth_client_secret: string;
  google_oauth_client_secret: string;
  force_email_on_third_party_signup: boolean;
  openai_advanced_scheduler_enabled: boolean;
  // 系统全局平台限额 map；form 内始终归一化为全 4 平台对象（模板非空绑定依赖此不变量）
  default_platform_quotas: DefaultPlatformQuotasMap;
};

const formRef = useRef<SettingsForm>({
  registration_enabled: true,
  email_verify_enabled: false,
  registration_email_suffix_whitelist: [] as string[],
  promo_code_enabled: true,
  invitation_code_enabled: false,
  password_reset_enabled: false,
  totp_enabled: false,
  totp_encryption_key_configured: false,
  login_agreement_enabled: false,
  login_agreement_mode: "modal",
  login_agreement_updated_at: "2026-03-31",
  login_agreement_documents: defaultLoginAgreementDocuments(),
  default_balance: 0,
  default_platform_quotas: normalizePlatformQuotasMap() as DefaultPlatformQuotasMap,
  affiliate_rebate_rate: 20,
  affiliate_rebate_freeze_hours: 0,
  affiliate_rebate_duration_days: 0,
  affiliate_rebate_per_invitee_cap: 0,
  default_concurrency: 1,
  default_subscriptions: [] as DefaultSubscriptionSetting[],
  force_email_on_third_party_signup: false,
  default_user_rpm_limit: 0,
  site_name: "Sub2API",
  site_logo: "",
  site_subtitle: "Subscription to API Conversion Platform",
  api_base_url: "",
  contact_info: "",
  doc_url: "",
  home_content: "",
  backend_mode_enabled: false,
  hide_ccs_import_button: false,
  payment_enabled: false,
  risk_control_enabled: false,
  payment_min_amount: 1,
  payment_max_amount: 10000,
  payment_daily_limit: 50000,
  payment_max_pending_orders: 3,
  payment_order_timeout_minutes: 30,
  payment_balance_disabled: false,
  payment_balance_recharge_multiplier: 1,
  payment_recharge_fee_rate: 0,
  payment_enabled_types: [] as string[],
  payment_help_image_url: "",
  payment_help_text: "",
  payment_product_name_prefix: "",
  payment_product_name_suffix: "",
  payment_load_balance_strategy: "round-robin",
  payment_cancel_rate_limit_enabled: false,
  payment_cancel_rate_limit_max: 10,
  payment_cancel_rate_limit_window: 1,
  payment_cancel_rate_limit_unit: "day",
  payment_cancel_rate_limit_window_mode: "rolling",
  payment_alipay_force_qrcode: false,
  table_default_page_size: tablePageSizeDefault,
  table_page_size_options: [10, 20, 50, 100],
  custom_menu_items: [] as Array<{
    id: string;
    label: string;
    icon_svg: string;
    url: string;
    visibility: "user" | "admin";
    sort_order: number;
  }>,
  custom_endpoints: [] as Array<{
    name: string;
    endpoint: string;
    description: string;
  }>,
  frontend_url: "",
  smtp_host: "",
  smtp_port: 587,
  smtp_username: "",
  smtp_password: "",
  smtp_password_configured: false,
  smtp_from_email: "",
  smtp_from_name: "",
  smtp_use_tls: true,
  // Cloudflare Turnstile
  turnstile_enabled: false,
  turnstile_site_key: "",
  turnstile_secret_key: "",
  turnstile_secret_key_configured: false,
  api_key_acl_trust_forwarded_ip: false,
  // LinuxDo Connect OAuth 登录
  linuxdo_connect_enabled: false,
  linuxdo_connect_client_id: "",
  linuxdo_connect_client_secret: "",
  linuxdo_connect_client_secret_configured: false,
  linuxdo_connect_redirect_url: "",
  // DingTalk Connect OAuth 登录
  dingtalk_connect_enabled: false,
  dingtalk_connect_client_id: "",
  dingtalk_connect_client_secret: "",
  dingtalk_connect_client_secret_configured: false,
  dingtalk_connect_redirect_url: "",
  dingtalk_connect_corp_restriction_policy: "none",
  dingtalk_connect_internal_corp_id: "",
  dingtalk_connect_bypass_registration: false,
  dingtalk_connect_sync_corp_email: false,
  dingtalk_connect_sync_display_name: false,
  dingtalk_connect_sync_dept: false,
  dingtalk_connect_sync_corp_email_attr_key: "dingtalk_email",
  dingtalk_connect_sync_display_name_attr_key: "dingtalk_name",
  dingtalk_connect_sync_dept_attr_key: "dingtalk_department",
  dingtalk_connect_sync_corp_email_attr_name: "钉钉企业邮箱",
  dingtalk_connect_sync_display_name_attr_name: "钉钉姓名",
  dingtalk_connect_sync_dept_attr_name: "钉钉部门",
  wechat_connect_enabled: false,
  wechat_connect_app_id: "",
  wechat_connect_app_secret: "",
  wechat_connect_app_secret_configured: false,
  wechat_connect_open_app_id: "",
  wechat_connect_open_app_secret: "",
  wechat_connect_open_app_secret_configured: false,
  wechat_connect_mp_app_id: "",
  wechat_connect_mp_app_secret: "",
  wechat_connect_mp_app_secret_configured: false,
  wechat_connect_mobile_app_id: "",
  wechat_connect_mobile_app_secret: "",
  wechat_connect_mobile_app_secret_configured: false,
  wechat_connect_open_enabled: false,
  wechat_connect_mp_enabled: false,
  wechat_connect_mobile_enabled: false,
  wechat_connect_mode: "open",
  wechat_connect_scopes: "snsapi_login",
  wechat_connect_redirect_url: "",
  wechat_connect_frontend_redirect_url: "/auth/wechat/callback",
  // Generic OIDC OAuth 登录
  oidc_connect_enabled: false,
  oidc_connect_provider_name: "OIDC",
  oidc_connect_client_id: "",
  oidc_connect_client_secret: "",
  oidc_connect_client_secret_configured: false,
  oidc_connect_issuer_url: "",
  oidc_connect_discovery_url: "",
  oidc_connect_authorize_url: "",
  oidc_connect_token_url: "",
  oidc_connect_userinfo_url: "",
  oidc_connect_jwks_url: "",
  oidc_connect_scopes: "openid email profile",
  oidc_connect_redirect_url: "",
  oidc_connect_frontend_redirect_url: "/auth/oidc/callback",
  oidc_connect_token_auth_method: "client_secret_post",
  oidc_connect_use_pkce: false,
  oidc_connect_validate_id_token: false,
  oidc_connect_allowed_signing_algs: "RS256,ES256,PS256",
  oidc_connect_clock_skew_seconds: 120,
  oidc_connect_require_email_verified: false,
  oidc_connect_userinfo_email_path: "",
  oidc_connect_userinfo_id_path: "",
  oidc_connect_userinfo_username_path: "",
  // GitHub / Google 邮箱快捷登录
  github_oauth_enabled: false,
  github_oauth_client_id: "",
  github_oauth_client_secret: "",
  github_oauth_client_secret_configured: false,
  github_oauth_redirect_url: "",
  github_oauth_frontend_redirect_url: "/auth/oauth/callback",
  google_oauth_enabled: false,
  google_oauth_client_id: "",
  google_oauth_client_secret: "",
  google_oauth_client_secret_configured: false,
  google_oauth_redirect_url: "",
  google_oauth_frontend_redirect_url: "/auth/oauth/callback",
  // Model fallback
  enable_model_fallback: false,
  fallback_model_anthropic: "claude-3-5-sonnet-20241022",
  fallback_model_openai: "gpt-4o",
  fallback_model_gemini: "gemini-2.5-pro",
  fallback_model_antigravity: "gemini-2.5-pro",
  // Identity patch (Claude -> Gemini)
  enable_identity_patch: true,
  identity_patch_prompt: "",
  // Ops monitoring (vNext)
  ops_monitoring_enabled: true,
  ops_realtime_monitoring_enabled: true,
  ops_query_mode_default: "auto",
  ops_metrics_interval_seconds: 60,
  // Claude Code version check
  min_claude_code_version: "",
  max_claude_code_version: "",
  // 分组隔离
  allow_ungrouped_key_scheduling: false,
  openai_advanced_scheduler_enabled: false,
  // Gateway forwarding behavior
  enable_fingerprint_unification: true,
  enable_metadata_passthrough: false,
  enable_cch_signing: false,
  enable_anthropic_cache_ttl_1h_injection: false,
  rewrite_message_cache_control: false,
  antigravity_user_agent_version: "",
  openai_codex_user_agent: "",
  openai_allow_claude_code_codex_plugin: false,
  // 余额、订阅到期与账号限额通知
  balance_low_notify_enabled: false,
  balance_low_notify_threshold: 0,
  balance_low_notify_recharge_url: "",
  subscription_expiry_notify_enabled: true,
  account_quota_notify_enabled: false,
  account_quota_notify_emails: [] as NotifyEmailEntry[],
  // Channel Monitor feature switch
  channel_monitor_enabled: true,
  channel_monitor_default_interval_seconds: 60,
  // Available Channels feature switch
  available_channels_enabled: false,
  // Affiliate (邀请返利) feature switch
  affiliate_enabled: false,
  // Allow user view error requests
  allow_user_view_error_requests: false,
});
  const form = formRef.current

const authSourceDefaultsRef = useRef(
  buildAuthSourceDefaultsState({}),
);
  const authSourceDefaults = authSourceDefaultsRef.current

const authSourceDefaultsMeta = useMemo(() => [
  {
    source: "email" as AuthSourceType,
    title: t("admin.settings.authSourceDefaults.sources.email.title"),
    description: t("admin.settings.authSourceDefaults.sources.email.description"),
  },
  {
    source: "linuxdo" as AuthSourceType,
    title: t("admin.settings.authSourceDefaults.sources.linuxdo.title"),
    description: t("admin.settings.authSourceDefaults.sources.linuxdo.description"),
  },
  {
    source: "oidc" as AuthSourceType,
    title: t("admin.settings.authSourceDefaults.sources.oidc.title"),
    description: t("admin.settings.authSourceDefaults.sources.oidc.description"),
  },
  {
    source: "wechat" as AuthSourceType,
    title: t("admin.settings.authSourceDefaults.sources.wechat.title"),
    description: t("admin.settings.authSourceDefaults.sources.wechat.description"),
  },
  {
    source: "github" as AuthSourceType,
    title: "GitHub",
    description: localText(
      "通过 GitHub 已验证邮箱首次注册或首次绑定时应用。",
      "Applied on first signup or first bind through a verified GitHub email.",
    ),
  },
  {
    source: "google" as AuthSourceType,
    title: "Google",
    description: localText(
      "通过 Google 已验证邮箱首次注册或首次绑定时应用。",
      "Applied on first signup or first bind through a verified Google email.",
    ),
  },
  {
    source: "dingtalk" as AuthSourceType,
    title: "钉钉",
    description: localText(
      "通过钉钉首次注册或首次绑定时应用。",
      "Applied on first signup or first bind through DingTalk.",
    ),
  },
], [t, isZhLocale]);

// Proxies for web search emulation ProxySelector
const [webSearchProxies, setWebSearchProxies] = useState<Proxy[]>([]);

// Web Search Emulation config (loaded/saved separately)
const DEFAULT_WEB_SEARCH_QUOTA_LIMIT = 1000;

const webSearchConfigRef = useRef<WebSearchEmulationConfig>({
  enabled: false,
  providers: [],
});
  const webSearchConfig = webSearchConfigRef.current

const expandedProvidersRef = useRef<Record<number, boolean>>({});
  const expandedProviders = expandedProvidersRef.current
const apiKeyVisibleRef = useRef<Record<number, boolean>>({});
  const apiKeyVisible = apiKeyVisibleRef.current
const [wsTestQuery, setWsTestQuery] = useState("");
const [wsTestLoading, setWsTestLoading] = useState(false);
const [wsTestResult, setWsTestResult] = useState<WebSearchTestResult | null>(null);
const [wsTestDialogOpen, setWsTestDialogOpen] = useState(false);

function openTestDialog() {
  setWsTestResult(null);
  setWsTestDialogOpen(true);
}

function toggleProviderExpand(idx: number) {
  expandedProviders[idx] = !expandedProviders[idx];
}

function removeWebSearchProvider(idx: number) {
  webSearchConfig.providers.splice(idx, 1);
  // Re-index expandedProviders and apiKeyVisible after removal
  const newExpanded: Record<number, boolean> = {};
  const newVisible: Record<number, boolean> = {};
  for (let i = 0; i < webSearchConfig.providers.length; i++) {
    const oldIdx = i >= idx ? i + 1 : i;
    newExpanded[i] = expandedProviders[oldIdx] ?? false;
    newVisible[i] = apiKeyVisible[oldIdx] ?? false;
  }
  Object.keys(expandedProviders).forEach(
    (k) => delete expandedProviders[Number(k)],
  );
  Object.keys(apiKeyVisible).forEach((k) => delete apiKeyVisible[Number(k)]);
  Object.assign(expandedProvidersRef.current, newExpanded); bump();
  Object.assign(apiKeyVisibleRef.current, newVisible); bump();
}

function addWebSearchProvider() {
  const idx = webSearchConfig.providers.length;
  webSearchConfig.providers.push({
    type: "brave",
    api_key: "",
    api_key_configured: false,
    quota_limit: DEFAULT_WEB_SEARCH_QUOTA_LIMIT,
    subscribed_at: null,
    proxy_id: null,
    expires_at: null,
  } as WebSearchProviderConfig);
  expandedProviders[idx] = true;
}

function formatSubscribedAt(ts: number | null): string {
  if (!ts) return "";
  // Use UTC to avoid timezone drift on repeated edits
  const d = new Date(ts * 1000);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseSubscribedAt(dateStr: string): number | null {
  if (!dateStr) return null;
  // Parse as UTC to match formatSubscribedAt
  return Math.floor(new Date(dateStr + "T00:00:00Z").getTime() / 1000);
}

function quotaPercentage(provider: WebSearchProviderConfig): number {
  if (!provider.quota_limit || provider.quota_limit <= 0) return 0;
  return ((provider.quota_used ?? 0) / provider.quota_limit) * 100;
}

async function resetWebSearchUsage(idx: number) {
  const provider = webSearchConfig.providers[idx];
  if (!provider) return;
  if (!confirm(t("admin.settings.webSearchEmulation.resetUsageConfirm")))
    return;
  try {
    await adminSettingsAPI.resetWebSearchUsage({
      provider_type: provider.type,
    });
    provider.quota_used = 0;
    showSuccess(
      t("admin.settings.webSearchEmulation.resetUsageSuccess"),
    );
  } catch (err: unknown) {
    showError(extractApiErrorMessage(err, t("common.error")));
  }
}

async function copyApiKey(idx: number) {
  const key = webSearchConfig.providers[idx]?.api_key;
  if (!key) {
    showError(
      t("admin.settings.webSearchEmulation.apiKeyPlaceholder"),
    );
    return;
  }
  try {
    await navigator.clipboard.writeText(key);
    showSuccess(t("admin.settings.webSearchEmulation.copied"));
  } catch {
    showError(t("common.error"));
  }
}

async function testWebSearchProvider() {
  setWsTestLoading(true);
  setWsTestResult(null);
  try {
    const query =
      wsTestQuery.trim() ||
      t("admin.settings.webSearchEmulation.testDefaultQuery");
    setWsTestResult(await adminSettingsAPI.testWebSearchEmulation(query));
  } catch (err: unknown) {
    showError(extractApiErrorMessage(err, t("common.error")));
  } finally {
    setWsTestLoading(false);
  }
}

async function loadWebSearchConfig() {
  try {
    const [resp, proxiesResp] = await Promise.all([
      adminSettingsAPI.getWebSearchEmulationConfig(),
      adminProxiesAPI.getAll().catch(() => [] as Proxy[]),
    ]);
    if (resp) {
      webSearchConfig.enabled = resp.enabled || false;
      webSearchConfig.providers = resp.providers || [];
    }
    setWebSearchProxies(proxiesResp);
  } catch (err: unknown) {
    // 404 is expected when config hasn't been created yet; show error for other failures
    const status = (err as { status?: number })?.status;
    if (status !== 404 && status !== undefined) {
      showError(extractApiErrorMessage(err, t("common.error")));
    }
  }
}

async function saveWebSearchConfig(): Promise<boolean> {
  try {
    for (const p of webSearchConfig.providers) {
      const raw = p.quota_limit;
      if (raw != null && Number(raw) !== 0 && Number(raw) < 1) {
        showError(
          t("admin.settings.webSearchEmulation.quotaLimitMustBePositive"),
        );
        return false;
      }
    }
    const providers = webSearchConfig.providers.map(
      (p: WebSearchProviderConfig) => ({
        ...p,
        quota_limit: Number(p.quota_limit) > 0 ? Number(p.quota_limit) : null,
      }),
    );
    await adminSettingsAPI.updateWebSearchEmulationConfig({
      enabled: webSearchConfig.enabled,
      providers,
    });
    return true;
  } catch (err: unknown) {
    showError(extractApiErrorMessage(err, t("common.error")));
    return false;
  }
}

const defaultSubscriptionGroupOptions = useMemo<DefaultSubscriptionGroupOption[]>(() =>
  subscriptionGroups.map((group) => ({
    value: group.id,
    label: group.name,
    description: group.description,
    platform: group.platform,
    subscriptionType: group.subscription_type,
    rate: group.rate_multiplier,
  })),
[subscriptionGroups]);

const registrationEmailSuffixWhitelistSeparatorKeys = new Set([
  " ",
  ",",
  "，",
  "Enter",
  "Tab",
]);

function removeRegistrationEmailSuffixWhitelistTag(suffix: string) {
  setRegistrationEmailSuffixWhitelistTags(
    registrationEmailSuffixWhitelistTags.filter(
      (item) => item !== suffix,
    ));
}

function addRegistrationEmailSuffixWhitelistTag(raw: string) {
  const suffix = normalizeRegistrationEmailSuffixDomain(raw);
  if (
    !isRegistrationEmailSuffixDomainValid(suffix) ||
    registrationEmailSuffixWhitelistTags.includes(suffix)
  ) {
    return;
  }
  setRegistrationEmailSuffixWhitelistTags([
    ...registrationEmailSuffixWhitelistTags,
    suffix,
  ]);
}

function commitRegistrationEmailSuffixWhitelistDraft() {
  if (!registrationEmailSuffixWhitelistDraft) {
    return;
  }
  addRegistrationEmailSuffixWhitelistTag(
    registrationEmailSuffixWhitelistDraft,
  );
  setRegistrationEmailSuffixWhitelistDraft("");
}

function handleRegistrationEmailSuffixWhitelistDraftInput() {
  setRegistrationEmailSuffixWhitelistDraft(
    normalizeRegistrationEmailSuffixDomain(
      registrationEmailSuffixWhitelistDraft,
    ));
}

function handleRegistrationEmailSuffixWhitelistDraftKeydown(
  event: KeyboardEvent,
) {
  if ('isComposing' in event.nativeEvent && event.nativeEvent.isComposing) {
    return;
  }

  if (registrationEmailSuffixWhitelistSeparatorKeys.has(event.key)) {
    event.preventDefault();
    commitRegistrationEmailSuffixWhitelistDraft();
    return;
  }

  if (
    event.key === "Backspace" &&
    !registrationEmailSuffixWhitelistDraft &&
    registrationEmailSuffixWhitelistTags.length > 0
  ) {
    registrationEmailSuffixWhitelistTags.pop();
  }
}

function handleRegistrationEmailSuffixWhitelistPaste(event: ClipboardEvent) {
  const text = event.clipboardData?.getData("text") || "";
  if (!text.trim()) {
    return;
  }
  event.preventDefault();
  const tokens = parseRegistrationEmailSuffixWhitelistInput(text);
  for (const token of tokens) {
    addRegistrationEmailSuffixWhitelistTag(token);
  }
}

// Quota notify email helpers
const addQuotaNotifyEmail = () => {
  if (!form.account_quota_notify_emails) {
    form.account_quota_notify_emails = [];
  }
  form.account_quota_notify_emails.push({
    email: "",
    disabled: false,
    verified: true,
  });
};

const currentOrigin =
  typeof window !== "undefined" ? window.location.origin : "";

// LinuxDo OAuth redirect URL suggestion
const linuxdoRedirectUrlSuggestion = useMemo(() => {
  if (typeof window === "undefined") return "";
  const origin =
    window.location.origin ||
    `${window.location.protocol}//${window.location.host}`;
  return `${origin}/api/v1/auth/oauth/linuxdo/callback`;
}, []);

async function setAndCopyLinuxdoRedirectUrl() {
  const url = linuxdoRedirectUrlSuggestion;
  if (!url) return;

  form.linuxdo_connect_redirect_url = url;
  await copyToClipboard(
    url,
    t("admin.settings.linuxdo.redirectUrlSetAndCopied"),
  );
}

type EmailOAuthProvider = "github" | "google";

const githubOAuthRedirectUrlSuggestion = useMemo(() => {
  if (typeof window === "undefined") return "";
  const origin =
    window.location.origin ||
    `${window.location.protocol}//${window.location.host}`;
  return `${origin}/api/v1/auth/oauth/github/callback`;
}, []);

const googleOAuthRedirectUrlSuggestion = useMemo(() => {
  if (typeof window === "undefined") return "";
  const origin =
    window.location.origin ||
    `${window.location.protocol}//${window.location.host}`;
  return `${origin}/api/v1/auth/oauth/google/callback`;
}, []);

async function setAndCopyEmailOAuthRedirectUrl(provider: EmailOAuthProvider) {
  const url =
    provider === "github"
      ? githubOAuthRedirectUrlSuggestion
      : googleOAuthRedirectUrlSuggestion;
  if (!url) return;

  if (provider === "github") {
    form.github_oauth_redirect_url = url;
  } else {
    form.google_oauth_redirect_url = url;
  }
  await copyToClipboard(
    url,
    localText("回调地址已写入并复制。", "Callback URL set and copied."),
  );
}

const wechatRedirectUrlSuggestion = useMemo(() => {
  if (typeof window === "undefined") return "";
  const origin =
    window.location.origin ||
    `${window.location.protocol}//${window.location.host}`;
  return `${origin}/api/v1/auth/oauth/wechat/callback`;
}, []);

function syncWeChatConnectMode(preferredMode?: WeChatConnectMode) {
  if (form.wechat_connect_mp_enabled && form.wechat_connect_mobile_enabled) {
    if (preferredMode === "mobile") {
      form.wechat_connect_mp_enabled = false;
    } else {
      form.wechat_connect_mobile_enabled = false;
    }
  }

  const capabilities = resolveWeChatConnectModeCapabilities(
    form.wechat_connect_open_enabled,
    form.wechat_connect_mp_enabled,
    form.wechat_connect_mobile_enabled,
    form.wechat_connect_mode,
  );
  form.wechat_connect_open_enabled = capabilities.openEnabled;
  form.wechat_connect_mp_enabled = capabilities.mpEnabled;
  form.wechat_connect_mobile_enabled = capabilities.mobileEnabled;
  form.wechat_connect_mode = deriveWeChatConnectStoredMode(
    capabilities.openEnabled,
    capabilities.mpEnabled,
    capabilities.mobileEnabled,
    form.wechat_connect_mode,
  );
  form.wechat_connect_scopes = defaultWeChatConnectScopesForMode(
    form.wechat_connect_mode,
  );
}

function handleWeChatOpenEnabledChange(value: boolean) {
  form.wechat_connect_open_enabled = value;
  syncWeChatConnectMode(value ? "open" : undefined);
}

function handleWeChatMPEnabledChange(value: boolean) {
  form.wechat_connect_mp_enabled = value;
  if (value) {
    form.wechat_connect_mobile_enabled = false;
  }
  syncWeChatConnectMode(value ? "mp" : undefined);
}

function handleWeChatMobileEnabledChange(value: boolean) {
  form.wechat_connect_mobile_enabled = value;
  if (value) {
    form.wechat_connect_mp_enabled = false;
  }
  syncWeChatConnectMode(value ? "mobile" : undefined);
}

async function setAndCopyWeChatRedirectUrl() {
  const url = wechatRedirectUrlSuggestion;
  if (!url) return;

  form.wechat_connect_redirect_url = url;
  await copyToClipboard(
    url,
    t("admin.settings.wechatConnect.redirectUrlSetAndCopied"),
  );
}

const oidcRedirectUrlSuggestion = useMemo(() => {
  if (typeof window === "undefined") return "";
  const origin =
    window.location.origin ||
    `${window.location.protocol}//${window.location.host}`;
  return `${origin}/api/v1/auth/oauth/oidc/callback`;
}, []);

async function setAndCopyOIDCRedirectUrl() {
  const url = oidcRedirectUrlSuggestion;
  if (!url) return;

  form.oidc_connect_redirect_url = url;
  await copyToClipboard(url, t("admin.settings.oidc.redirectUrlSetAndCopied"));
}

// Custom menu item management
function addMenuItem() {
  form.custom_menu_items.push({
    id: "",
    label: "",
    icon_svg: "",
    url: "",
    visibility: "user",
    sort_order: form.custom_menu_items.length,
  });
}

function removeMenuItem(index: number) {
  form.custom_menu_items.splice(index, 1);
  // Re-index sort_order
  form.custom_menu_items.forEach((item, i) => {
    item.sort_order = i;
  });
}

function moveMenuItem(index: number, direction: -1 | 1) {
  const targetIndex = index + direction;
  if (targetIndex < 0 || targetIndex >= form.custom_menu_items.length) return;
  const items = form.custom_menu_items;
  const temp = items[index];
  items[index] = items[targetIndex];
  items[targetIndex] = temp;
  // Re-index sort_order
  items.forEach((item, i) => {
    item.sort_order = i;
  });
}

// Custom endpoint management
function addEndpoint() {
  form.custom_endpoints.push({ name: "", endpoint: "", description: "" });
}

function removeEndpoint(index: number) {
  form.custom_endpoints.splice(index, 1);
}

function addLoginAgreementDocument() {
  form.login_agreement_documents.push({
    id: `custom-${Date.now().toString(36)}`,
    title: "",
    content_md: "",
  });
}

function removeLoginAgreementDocument(index: number) {
  form.login_agreement_documents.splice(index, 1);
}

function normalizeLoginAgreementDocumentsForSave(): LoginAgreementDocument[] {
  return form.login_agreement_documents
    .map((doc, index) => ({
      id:
        normalizeLoginAgreementDocumentId(doc.id || doc.title) ||
        `doc-${index + 1}`,
      title: doc.title.trim(),
      content_md: doc.content_md.trim(),
    }))
    .filter((doc) => doc.title || doc.content_md);
}

function findDuplicateLoginAgreementDocumentId(
  documents: LoginAgreementDocument[],
): string | null {
  const seen = new Set<string>();
  for (const doc of documents) {
    if (seen.has(doc.id)) {
      return doc.id;
    }
    seen.add(doc.id);
  }
  return null;
}

function formatTablePageSizeOptions(options: number[]): string {
  return options.join(", ");
}

function parseTablePageSizeOptionsInput(raw: string): number[] | null {
  const tokens = raw
    .split(",")
    .map((token) => token.trim())
    .filter((token) => token.length > 0);

  if (tokens.length === 0) {
    return null;
  }

  const parsed = tokens.map((token) => Number(token));
  if (parsed.some((value) => !Number.isInteger(value))) {
    return null;
  }

  const deduped = Array.from(new Set(parsed)).sort((a, b) => a - b);
  if (
    deduped.some(
      (value) => value < tablePageSizeMin || value > tablePageSizeMax,
    )
  ) {
    return null;
  }

  return deduped;
}

async function loadSettings() {
  setLoading(true);
  setLoadFailed(false);
  try {
    const settings = await adminSettingsAPI.getSettings();
    settings.payment_load_balance_strategy =
      settings.payment_load_balance_strategy || "round-robin";
    // Only assign non-null values from backend (null means unconfigured, keep defaults)
    for (const [key, value] of Object.entries(settings)) {
      if (value !== null && value !== undefined) {
        (form as Record<string, unknown>)[key] = value;
      }
    }
    form.login_agreement_mode =
      settings.login_agreement_mode === "checkbox" ? "checkbox" : "modal";
    form.login_agreement_updated_at =
      settings.login_agreement_updated_at || "2026-03-31";
    form.login_agreement_documents =
      Array.isArray(settings.login_agreement_documents) &&
      settings.login_agreement_documents.length > 0
        ? settings.login_agreement_documents.map((doc) => ({
            id: doc.id || "",
            title: doc.title || "",
            content_md: doc.content_md || "",
          }))
        : defaultLoginAgreementDocuments();
    Object.assign(authSourceDefaultsRef.current, buildAuthSourceDefaultsState(settings)); bump();
    form.default_platform_quotas = normalizePlatformQuotasMap(settings.default_platform_quotas);
    form.backend_mode_enabled = settings.backend_mode_enabled;
    form.default_subscriptions = normalizeDefaultSubscriptionSettings(
      settings.default_subscriptions,
    );
    setRegistrationEmailSuffixWhitelistTags(
      normalizeRegistrationEmailSuffixDomains(
        settings.registration_email_suffix_whitelist,
      ));
    setTablePageSizeOptionsInput( formatTablePageSizeOptions(
      Array.isArray(settings.table_page_size_options)
        ? settings.table_page_size_options
        : [10, 20, 50, 100],
    ));
    setRegistrationEmailSuffixWhitelistDraft("");
    form.smtp_password = "";
    setSmtpPasswordManuallyEdited(false);
    form.turnstile_secret_key = "";
    form.linuxdo_connect_client_secret = "";
    form.dingtalk_connect_client_secret = "";
    form.github_oauth_client_secret = "";
    form.google_oauth_client_secret = "";
    form.wechat_connect_app_secret = "";
    form.wechat_connect_open_app_secret = "";
    form.wechat_connect_mp_app_secret = "";
    form.wechat_connect_mobile_app_secret = "";
    const wechatCapabilities = resolveWeChatConnectModeCapabilities(
      settings.wechat_connect_open_enabled,
      settings.wechat_connect_mp_enabled,
      settings.wechat_connect_mobile_enabled,
      settings.wechat_connect_mode,
    );
    form.wechat_connect_open_enabled = wechatCapabilities.openEnabled;
    form.wechat_connect_mp_enabled = wechatCapabilities.mpEnabled;
    form.wechat_connect_mobile_enabled = wechatCapabilities.mobileEnabled;
    form.wechat_connect_mode = deriveWeChatConnectStoredMode(
      wechatCapabilities.openEnabled,
      wechatCapabilities.mpEnabled,
      wechatCapabilities.mobileEnabled,
      settings.wechat_connect_mode,
    );
    const legacyWeChatAppID = String(settings.wechat_connect_app_id || "").trim();
    const legacyWeChatSecretConfigured = Boolean(
      settings.wechat_connect_app_secret_configured,
    );
    if (!form.wechat_connect_open_app_id && wechatCapabilities.openEnabled) {
      form.wechat_connect_open_app_id = legacyWeChatAppID;
    }
    if (!form.wechat_connect_mp_app_id && wechatCapabilities.mpEnabled) {
      form.wechat_connect_mp_app_id = legacyWeChatAppID;
    }
    if (!form.wechat_connect_mobile_app_id && wechatCapabilities.mobileEnabled) {
      form.wechat_connect_mobile_app_id = legacyWeChatAppID;
    }
    if (
      !form.wechat_connect_open_app_secret_configured &&
      wechatCapabilities.openEnabled
    ) {
      form.wechat_connect_open_app_secret_configured =
        legacyWeChatSecretConfigured;
    }
    if (
      !form.wechat_connect_mp_app_secret_configured &&
      wechatCapabilities.mpEnabled
    ) {
      form.wechat_connect_mp_app_secret_configured = legacyWeChatSecretConfigured;
    }
    if (
      !form.wechat_connect_mobile_app_secret_configured &&
      wechatCapabilities.mobileEnabled
    ) {
      form.wechat_connect_mobile_app_secret_configured =
        legacyWeChatSecretConfigured;
    }
    form.wechat_connect_scopes = defaultWeChatConnectScopesForMode(
      form.wechat_connect_mode,
    );
    form.oidc_connect_client_secret = "";

    // Load OpenAI fast/flex policy rules from bulk settings.
    // 仅当 payload 真的包含该字段时填充并标记为已加载；否则保持表单空值，
    // 让 saveSettings 在未加载时跳过该字段，防止覆盖后端默认规则。
    if (
      settings.openai_fast_policy_settings &&
      Array.isArray(settings.openai_fast_policy_settings.rules)
    ) {
      openaiFastPolicyForm.rules =
        settings.openai_fast_policy_settings.rules.map((rule) => ({
          ...rule,
          model_whitelist: rule.model_whitelist
            ? [...rule.model_whitelist]
            : [],
        }));
      setOpenaiFastPolicyLoaded(true);
    }

    // Load web search emulation config separately
    await loadWebSearchConfig();
  } catch (error: unknown) {
    setLoadFailed(true);
    showError(
      extractApiErrorMessage(error, t("admin.settings.failedToLoad")),
    );
  } finally {
    setLoading(false);
  }
}

async function loadSubscriptionGroups() {
  try {
    const groups = await adminGroupsAPI.getAll();
    setSubscriptionGroups( groups.filter(
      (group) =>
        group.subscription_type === "subscription" && group.status === "active",
    ));
  } catch (_error: unknown) {
    setSubscriptionGroups([]);
  }
}

function findNextAvailableSubscriptionGroup(
  existingGroupIDs: number[],
): AdminGroup | undefined {
  const existing = new Set(existingGroupIDs);
  return subscriptionGroups.find((group) => !existing.has(group.id));
}

function addDefaultSubscription() {
  if (subscriptionGroups.length === 0) return;
  const candidate = findNextAvailableSubscriptionGroup(
    form.default_subscriptions.map((item) => item.group_id),
  );
  if (!candidate) return;
  form.default_subscriptions.push({
    group_id: candidate.id,
    validity_days: 30,
  });
}

function removeDefaultSubscription(index: number) {
  form.default_subscriptions.splice(index, 1);
}

function addAuthSourceDefaultSubscription(source: AuthSourceType) {
  if (subscriptionGroups.length === 0) return;
  const candidate = findNextAvailableSubscriptionGroup(
    authSourceDefaults[source].subscriptions.map((item) => item.group_id),
  );
  if (!candidate) return;
  authSourceDefaults[source].subscriptions.push({
    group_id: candidate.id,
    validity_days: 30,
  });
}

function removeAuthSourceDefaultSubscription(
  source: AuthSourceType,
  index: number,
) {
  authSourceDefaults[source].subscriptions.splice(index, 1);
}

function findDuplicateDefaultSubscription(
  subscriptions: DefaultSubscriptionSetting[],
): DefaultSubscriptionSetting | undefined {
  const seenGroupIDs = new Set<number>();

  return subscriptions.find((item) => {
    if (seenGroupIDs.has(item.group_id)) {
      return true;
    }
    seenGroupIDs.add(item.group_id);
    return false;
  });
}

async function saveSettings() {
  setSaving(true);
  try {
    const normalizedTableDefaultPageSize = Math.floor(
      Number(form.table_default_page_size),
    );
    if (
      !Number.isInteger(normalizedTableDefaultPageSize) ||
      normalizedTableDefaultPageSize < tablePageSizeMin ||
      normalizedTableDefaultPageSize > tablePageSizeMax
    ) {
      showError(
        t("admin.settings.site.tableDefaultPageSizeRangeError", {
          min: tablePageSizeMin,
          max: tablePageSizeMax,
        }),
      );
      return;
    }

    const normalizedTablePageSizeOptions = parseTablePageSizeOptionsInput(
      tablePageSizeOptionsInput,
    );
    if (!normalizedTablePageSizeOptions) {
      showError(
        t("admin.settings.site.tablePageSizeOptionsFormatError", {
          min: tablePageSizeMin,
          max: tablePageSizeMax,
        }),
      );
      return;
    }

    form.table_default_page_size = normalizedTableDefaultPageSize;
    form.table_page_size_options = normalizedTablePageSizeOptions;

    const normalizedLoginAgreementDocuments =
      normalizeLoginAgreementDocumentsForSave();
    if (form.login_agreement_enabled && normalizedLoginAgreementDocuments.length === 0) {
      showError(
        localText(
          "启用登录条款确认时，至少需要保留一份文档。",
          "At least one document is required when login agreement is enabled.",
        ),
      );
      return;
    }
    const emptyTitleDocument = normalizedLoginAgreementDocuments.find(
      (doc) => !doc.title,
    );
    if (emptyTitleDocument) {
      showError(
        localText(
          "登录条款文档名称不能为空。",
          "Login agreement document title cannot be empty.",
        ),
      );
      return;
    }
    const duplicateLoginAgreementDocumentId =
      findDuplicateLoginAgreementDocumentId(normalizedLoginAgreementDocuments);
    if (duplicateLoginAgreementDocumentId) {
      showError(
        localText(
          `登录条款文档路由不能重复：/legal/${duplicateLoginAgreementDocumentId}`,
          `Login agreement document routes cannot be duplicated: /legal/${duplicateLoginAgreementDocumentId}`,
        ),
      );
      return;
    }
    form.login_agreement_mode =
      form.login_agreement_mode === "checkbox" ? "checkbox" : "modal";
    form.login_agreement_documents = normalizedLoginAgreementDocuments;

    const normalizedDefaultSubscriptions = normalizeDefaultSubscriptionSettings(
      form.default_subscriptions,
    );
    const duplicateDefaultSubscription = findDuplicateDefaultSubscription(
      normalizedDefaultSubscriptions,
    );
    if (duplicateDefaultSubscription) {
      showError(
        t("admin.settings.defaults.defaultSubscriptionsDuplicate", {
          groupId: duplicateDefaultSubscription.group_id,
        }),
      );
      return;
    }

    for (const authSource of authSourceDefaultsMeta) {
      authSourceDefaults[authSource.source].subscriptions =
        normalizeDefaultSubscriptionSettings(
          authSourceDefaults[authSource.source].subscriptions,
        );
      const duplicate = findDuplicateDefaultSubscription(
        authSourceDefaults[authSource.source].subscriptions,
      );
      if (duplicate) {
        showError(
          `${authSource.title}: ${t(
            "admin.settings.defaults.defaultSubscriptionsDuplicate",
            {
              groupId: duplicate.group_id,
            },
          )}`,
        );
        return;
      }
    }

    if (form.wechat_connect_mp_enabled && form.wechat_connect_mobile_enabled) {
      showError(
        localText(
          "公众号和移动应用不能同时启用。",
          "Official Account and Mobile App cannot be enabled at the same time.",
        ),
      );
      return;
    }
    // Validate URL fields — novalidate disables browser-native checks, so we validate here
    const isValidHttpUrl = (url: string): boolean => {
      if (!url) return true;
      try {
        const u = new URL(url);
        return u.protocol === "http:" || u.protocol === "https:";
      } catch {
        return false;
      }
    };
    // Optional URL fields: auto-clear invalid values so they don't cause backend 400 errors
    if (!isValidHttpUrl(form.frontend_url)) form.frontend_url = "";
    if (!isValidHttpUrl(form.doc_url)) form.doc_url = "";
    syncWeChatConnectMode();
    const wechatStoredMode = deriveWeChatConnectStoredMode(
      form.wechat_connect_open_enabled,
      form.wechat_connect_mp_enabled,
      form.wechat_connect_mobile_enabled,
      form.wechat_connect_mode,
    );

    const payload: UpdateSettingsRequest = {
      registration_enabled: form.registration_enabled,
      email_verify_enabled: form.email_verify_enabled,
      registration_email_suffix_whitelist:
        registrationEmailSuffixWhitelistTags.map((suffix) =>
          suffix.startsWith("*.") ? suffix : `@${suffix}`,
        ),
      promo_code_enabled: form.promo_code_enabled,
      invitation_code_enabled: form.invitation_code_enabled,
      password_reset_enabled: form.password_reset_enabled,
      totp_enabled: form.totp_enabled,
      login_agreement_enabled: form.login_agreement_enabled,
      login_agreement_mode: form.login_agreement_mode,
      login_agreement_updated_at: form.login_agreement_updated_at,
      login_agreement_documents: form.login_agreement_documents,
      default_balance: form.default_balance,
      affiliate_rebate_rate: Math.min(
        100,
        Math.max(0, Number(form.affiliate_rebate_rate) || 0),
      ),
      affiliate_rebate_freeze_hours: Math.max(0, Math.min(720, Number(form.affiliate_rebate_freeze_hours) || 0)),
      affiliate_rebate_duration_days: Math.max(0, Math.min(3650, Math.floor(Number(form.affiliate_rebate_duration_days) || 0))),
      affiliate_rebate_per_invitee_cap: Math.max(0, Number(form.affiliate_rebate_per_invitee_cap) || 0),
      default_concurrency: form.default_concurrency,
      default_subscriptions: normalizedDefaultSubscriptions,
      force_email_on_third_party_signup: form.force_email_on_third_party_signup,
      default_user_rpm_limit: form.default_user_rpm_limit,
      site_name: form.site_name,
      site_logo: form.site_logo,
      site_subtitle: form.site_subtitle,
      api_base_url: form.api_base_url,
      contact_info: form.contact_info,
      doc_url: form.doc_url,
      home_content: form.home_content,
      backend_mode_enabled: form.backend_mode_enabled,
      hide_ccs_import_button: form.hide_ccs_import_button,
      table_default_page_size: form.table_default_page_size,
      table_page_size_options: form.table_page_size_options,
      custom_menu_items: form.custom_menu_items,
      custom_endpoints: form.custom_endpoints,
      frontend_url: form.frontend_url,
      smtp_host: form.smtp_host,
      smtp_port: form.smtp_port,
      smtp_username: form.smtp_username,
      smtp_password: form.smtp_password || undefined,
      smtp_from_email: form.smtp_from_email,
      smtp_from_name: form.smtp_from_name,
      smtp_use_tls: form.smtp_use_tls,
      turnstile_enabled: form.turnstile_enabled,
      turnstile_site_key: form.turnstile_site_key,
      turnstile_secret_key: form.turnstile_secret_key || undefined,
      api_key_acl_trust_forwarded_ip: form.api_key_acl_trust_forwarded_ip,
      linuxdo_connect_enabled: form.linuxdo_connect_enabled,
      linuxdo_connect_client_id: form.linuxdo_connect_client_id,
      linuxdo_connect_client_secret:
        form.linuxdo_connect_client_secret || undefined,
      linuxdo_connect_redirect_url: form.linuxdo_connect_redirect_url,
      dingtalk_connect_enabled: form.dingtalk_connect_enabled,
      dingtalk_connect_client_id: form.dingtalk_connect_client_id,
      dingtalk_connect_client_secret:
        form.dingtalk_connect_client_secret || undefined,
      dingtalk_connect_redirect_url: form.dingtalk_connect_redirect_url,
      dingtalk_connect_corp_restriction_policy:
        form.dingtalk_connect_corp_restriction_policy,
      dingtalk_connect_internal_corp_id: form.dingtalk_connect_internal_corp_id,
      dingtalk_connect_bypass_registration: form.dingtalk_connect_bypass_registration,
      dingtalk_connect_sync_corp_email: form.dingtalk_connect_sync_corp_email,
      dingtalk_connect_sync_display_name: form.dingtalk_connect_sync_display_name,
      dingtalk_connect_sync_dept: form.dingtalk_connect_sync_dept,
      dingtalk_connect_sync_corp_email_attr_key: form.dingtalk_connect_sync_corp_email_attr_key,
      dingtalk_connect_sync_display_name_attr_key: form.dingtalk_connect_sync_display_name_attr_key,
      dingtalk_connect_sync_dept_attr_key: form.dingtalk_connect_sync_dept_attr_key,
      dingtalk_connect_sync_corp_email_attr_name: form.dingtalk_connect_sync_corp_email_attr_name,
      dingtalk_connect_sync_display_name_attr_name: form.dingtalk_connect_sync_display_name_attr_name,
      dingtalk_connect_sync_dept_attr_name: form.dingtalk_connect_sync_dept_attr_name,
      wechat_connect_enabled: form.wechat_connect_enabled,
      wechat_connect_app_id:
        form.wechat_connect_open_app_id ||
        form.wechat_connect_mp_app_id ||
        form.wechat_connect_mobile_app_id ||
        form.wechat_connect_app_id,
      wechat_connect_app_secret: form.wechat_connect_app_secret || undefined,
      wechat_connect_open_app_id: form.wechat_connect_open_app_id,
      wechat_connect_open_app_secret:
        form.wechat_connect_open_app_secret || undefined,
      wechat_connect_mp_app_id: form.wechat_connect_mp_app_id,
      wechat_connect_mp_app_secret:
        form.wechat_connect_mp_app_secret || undefined,
      wechat_connect_mobile_app_id: form.wechat_connect_mobile_app_id,
      wechat_connect_mobile_app_secret:
        form.wechat_connect_mobile_app_secret || undefined,
      wechat_connect_open_enabled: form.wechat_connect_open_enabled,
      wechat_connect_mp_enabled: form.wechat_connect_mp_enabled,
      wechat_connect_mobile_enabled: form.wechat_connect_mobile_enabled,
      wechat_connect_mode: wechatStoredMode,
      wechat_connect_scopes:
        defaultWeChatConnectScopesForMode(wechatStoredMode),
      wechat_connect_redirect_url: form.wechat_connect_redirect_url,
      wechat_connect_frontend_redirect_url:
        form.wechat_connect_frontend_redirect_url,
      oidc_connect_enabled: form.oidc_connect_enabled,
      oidc_connect_provider_name: form.oidc_connect_provider_name,
      oidc_connect_client_id: form.oidc_connect_client_id,
      oidc_connect_client_secret: form.oidc_connect_client_secret || undefined,
      oidc_connect_issuer_url: form.oidc_connect_issuer_url,
      oidc_connect_discovery_url: form.oidc_connect_discovery_url,
      oidc_connect_authorize_url: form.oidc_connect_authorize_url,
      oidc_connect_token_url: form.oidc_connect_token_url,
      oidc_connect_userinfo_url: form.oidc_connect_userinfo_url,
      oidc_connect_jwks_url: form.oidc_connect_jwks_url,
      oidc_connect_scopes: form.oidc_connect_scopes,
      oidc_connect_redirect_url: form.oidc_connect_redirect_url,
      oidc_connect_frontend_redirect_url:
        form.oidc_connect_frontend_redirect_url,
      oidc_connect_token_auth_method: form.oidc_connect_token_auth_method,
      oidc_connect_use_pkce: form.oidc_connect_use_pkce,
      oidc_connect_validate_id_token: form.oidc_connect_validate_id_token,
      oidc_connect_allowed_signing_algs: form.oidc_connect_allowed_signing_algs,
      oidc_connect_clock_skew_seconds: form.oidc_connect_clock_skew_seconds,
      oidc_connect_require_email_verified:
        form.oidc_connect_require_email_verified,
      oidc_connect_userinfo_email_path: form.oidc_connect_userinfo_email_path,
      oidc_connect_userinfo_id_path: form.oidc_connect_userinfo_id_path,
      oidc_connect_userinfo_username_path:
        form.oidc_connect_userinfo_username_path,
      github_oauth_enabled: form.github_oauth_enabled,
      github_oauth_client_id: form.github_oauth_client_id,
      github_oauth_client_secret:
        form.github_oauth_client_secret || undefined,
      github_oauth_redirect_url: form.github_oauth_redirect_url,
      github_oauth_frontend_redirect_url:
        form.github_oauth_frontend_redirect_url,
      google_oauth_enabled: form.google_oauth_enabled,
      google_oauth_client_id: form.google_oauth_client_id,
      google_oauth_client_secret:
        form.google_oauth_client_secret || undefined,
      google_oauth_redirect_url: form.google_oauth_redirect_url,
      google_oauth_frontend_redirect_url:
        form.google_oauth_frontend_redirect_url,
      enable_model_fallback: form.enable_model_fallback,
      fallback_model_anthropic: form.fallback_model_anthropic,
      fallback_model_openai: form.fallback_model_openai,
      fallback_model_gemini: form.fallback_model_gemini,
      fallback_model_antigravity: form.fallback_model_antigravity,
      enable_identity_patch: form.enable_identity_patch,
      identity_patch_prompt: form.identity_patch_prompt,
      min_claude_code_version: form.min_claude_code_version,
      max_claude_code_version: form.max_claude_code_version,
      allow_ungrouped_key_scheduling: form.allow_ungrouped_key_scheduling,
      enable_fingerprint_unification: form.enable_fingerprint_unification,
      enable_metadata_passthrough: form.enable_metadata_passthrough,
      enable_cch_signing: form.enable_cch_signing,
      enable_anthropic_cache_ttl_1h_injection:
        form.enable_anthropic_cache_ttl_1h_injection,
      rewrite_message_cache_control: form.rewrite_message_cache_control,
      antigravity_user_agent_version:
        form.antigravity_user_agent_version?.trim() || "",
      openai_codex_user_agent:
        form.openai_codex_user_agent?.trim() || "",
      openai_allow_claude_code_codex_plugin: form.openai_allow_claude_code_codex_plugin,
      // Payment configuration
      payment_enabled: form.payment_enabled,
      risk_control_enabled: form.risk_control_enabled,
      payment_min_amount: Number(form.payment_min_amount) || 0,
      payment_max_amount: Number(form.payment_max_amount) || 0,
      payment_daily_limit: Number(form.payment_daily_limit) || 0,
      payment_max_pending_orders: Number(form.payment_max_pending_orders) || 0,
      payment_order_timeout_minutes:
        Number(form.payment_order_timeout_minutes) || 0,
      payment_balance_disabled: form.payment_balance_disabled,
      payment_balance_recharge_multiplier:
        Number(form.payment_balance_recharge_multiplier) || 1,
      payment_recharge_fee_rate: Number(form.payment_recharge_fee_rate) || 0,
      payment_enabled_types: form.payment_enabled_types,
      payment_load_balance_strategy: form.payment_load_balance_strategy,
      payment_product_name_prefix: form.payment_product_name_prefix,
      payment_product_name_suffix: form.payment_product_name_suffix,
      payment_help_image_url: form.payment_help_image_url,
      payment_help_text: form.payment_help_text,
      payment_cancel_rate_limit_enabled: form.payment_cancel_rate_limit_enabled,
      payment_cancel_rate_limit_max:
        Number(form.payment_cancel_rate_limit_max) || 10,
      payment_cancel_rate_limit_window:
        Number(form.payment_cancel_rate_limit_window) || 1,
      payment_cancel_rate_limit_unit: form.payment_cancel_rate_limit_unit,
      payment_cancel_rate_limit_window_mode:
        form.payment_cancel_rate_limit_window_mode,
      payment_alipay_force_qrcode: form.payment_alipay_force_qrcode,
      openai_advanced_scheduler_enabled: form.openai_advanced_scheduler_enabled,
      // 余额、订阅到期与账号限额通知
      balance_low_notify_enabled: form.balance_low_notify_enabled,
      balance_low_notify_threshold:
        Number(form.balance_low_notify_threshold) || 0,
      balance_low_notify_recharge_url: (form.balance_low_notify_recharge_url =
        form.balance_low_notify_recharge_url || currentOrigin),
      subscription_expiry_notify_enabled:
        form.subscription_expiry_notify_enabled,
      account_quota_notify_enabled: form.account_quota_notify_enabled,
      account_quota_notify_emails: (
        form.account_quota_notify_emails || []
      ).filter((e) => e.email.trim() !== ""),
      // Channel Monitor feature switch
      channel_monitor_enabled: form.channel_monitor_enabled,
      channel_monitor_default_interval_seconds:
        Number(form.channel_monitor_default_interval_seconds) || 60,
      // Available Channels feature switch
      available_channels_enabled: form.available_channels_enabled,
      // Affiliate (邀请返利) feature switch
      affiliate_enabled: form.affiliate_enabled,
      allow_user_view_error_requests: form.allow_user_view_error_requests,
    };

    // 仅当 openai_fast_policy_settings 已成功从后端加载时才回写，
    // 否则省略整个字段，让后端保留既有规则（含默认值）。
    if (openaiFastPolicyLoaded) {
      payload.openai_fast_policy_settings = {
        rules: openaiFastPolicyForm.rules.map((rule) => {
          const whitelist = (rule.model_whitelist || [])
            .map((p) => p.trim())
            .filter((p) => p !== "");
          const hasWhitelist = whitelist.length > 0;
          return {
            service_tier: rule.service_tier,
            action: rule.action,
            scope: rule.scope,
            error_message:
              rule.action === "block" ? rule.error_message : undefined,
            model_whitelist: hasWhitelist ? whitelist : undefined,
            fallback_action: hasWhitelist
              ? rule.fallback_action || "pass"
              : undefined,
            fallback_error_message:
              hasWhitelist && rule.fallback_action === "block"
                ? rule.fallback_error_message
                : undefined,
          };
        }),
      };
    }

    payload.default_platform_quotas = sanitizePlatformQuotasMap(form.default_platform_quotas);
    appendAuthSourceDefaultsToUpdateRequest(payload, authSourceDefaults);

    const updated = await adminSettingsAPI.updateSettings(payload);
    for (const [key, value] of Object.entries(updated)) {
      if (key === "openai_fast_policy_settings") continue;
      if (value !== null && value !== undefined) {
        (form as Record<string, unknown>)[key] = value;
      }
    }
    Object.assign(authSourceDefaultsRef.current, buildAuthSourceDefaultsState(updated)); bump();
    form.default_platform_quotas = normalizePlatformQuotasMap(updated.default_platform_quotas);
    setRegistrationEmailSuffixWhitelistTags(
      normalizeRegistrationEmailSuffixDomains(
        updated.registration_email_suffix_whitelist,
      ));
    setTablePageSizeOptionsInput( formatTablePageSizeOptions(
      Array.isArray(updated.table_page_size_options)
        ? updated.table_page_size_options
        : [10, 20, 50, 100],
    ));
    setRegistrationEmailSuffixWhitelistDraft("");
    form.smtp_password = "";
    setSmtpPasswordManuallyEdited(false);
    form.turnstile_secret_key = "";
    form.linuxdo_connect_client_secret = "";
    form.dingtalk_connect_client_secret = "";
    form.github_oauth_client_secret = "";
    form.google_oauth_client_secret = "";
    form.wechat_connect_app_secret = "";
    form.wechat_connect_open_app_secret = "";
    form.wechat_connect_mp_app_secret = "";
    form.wechat_connect_mobile_app_secret = "";
    const updatedWechatCapabilities = resolveWeChatConnectModeCapabilities(
      updated.wechat_connect_open_enabled,
      updated.wechat_connect_mp_enabled,
      updated.wechat_connect_mobile_enabled,
      updated.wechat_connect_mode,
    );
    form.wechat_connect_open_enabled = updatedWechatCapabilities.openEnabled;
    form.wechat_connect_mp_enabled = updatedWechatCapabilities.mpEnabled;
    form.wechat_connect_mobile_enabled =
      updatedWechatCapabilities.mobileEnabled;
    form.wechat_connect_mode = deriveWeChatConnectStoredMode(
      updatedWechatCapabilities.openEnabled,
      updatedWechatCapabilities.mpEnabled,
      updatedWechatCapabilities.mobileEnabled,
      updated.wechat_connect_mode,
    );
    form.wechat_connect_scopes = defaultWeChatConnectScopesForMode(
      form.wechat_connect_mode,
    );
    form.oidc_connect_client_secret = "";
    // Refresh OpenAI fast/flex policy from server response
    if (
      updated.openai_fast_policy_settings &&
      Array.isArray(updated.openai_fast_policy_settings.rules)
    ) {
      openaiFastPolicyForm.rules =
        updated.openai_fast_policy_settings.rules.map((rule) => ({
          ...rule,
          model_whitelist: rule.model_whitelist
            ? [...rule.model_whitelist]
            : [],
        }));
      setOpenaiFastPolicyLoaded(true);
    }
    // Save web search emulation config separately (errors handled internally)
    const wsOk = await saveWebSearchConfig();
    // Refresh cached settings so sidebar/header update immediately
    await fetchPublicSettings();
    await fetchAdminSettings(true);
    if (wsOk) {
      showSuccess(t("admin.settings.settingsSaved"));
    }
  } catch (error: unknown) {
    showError(
      extractApiErrorMessage(error, t("admin.settings.failedToSave")),
    );
  } finally {
    setSaving(false);
  }
}

async function testSmtpConnection() {
  setTestingSmtp(true);
  try {
    const smtpPasswordForTest = smtpPasswordManuallyEdited
      ? form.smtp_password
      : "";
    const result = await adminSettingsAPI.testSmtpConnection({
      smtp_host: form.smtp_host,
      smtp_port: form.smtp_port,
      smtp_username: form.smtp_username,
      smtp_password: smtpPasswordForTest,
      smtp_use_tls: form.smtp_use_tls,
    });
    // API returns { message: "..." } on success, errors are thrown as exceptions
    showSuccess(
      result.message || t("admin.settings.smtpConnectionSuccess"),
    );
  } catch (error: unknown) {
    showError(
      extractApiErrorMessage(error, t("admin.settings.failedToTestSmtp")),
    );
  } finally {
    setTestingSmtp(false);
  }
}

async function sendTestEmail() {
  if (!testEmailAddress) {
    showError(t("admin.settings.testEmail.enterRecipientHint"));
    return;
  }

  setSendingTestEmail(true);
  try {
    const smtpPasswordForSend = smtpPasswordManuallyEdited
      ? form.smtp_password
      : "";
    const result = await adminSettingsAPI.sendTestEmail({
      email: testEmailAddress,
      smtp_host: form.smtp_host,
      smtp_port: form.smtp_port,
      smtp_username: form.smtp_username,
      smtp_password: smtpPasswordForSend,
      smtp_from_email: form.smtp_from_email,
      smtp_from_name: form.smtp_from_name,
      smtp_use_tls: form.smtp_use_tls,
    });
    // API returns { message: "..." } on success, errors are thrown as exceptions
    showSuccess(result.message || t("admin.settings.testEmailSent"));
  } catch (error: unknown) {
    showError(
      extractApiErrorMessage(error, t("admin.settings.failedToSendTestEmail")),
    );
  } finally {
    setSendingTestEmail(false);
  }
}

// Admin API Key 方法
async function loadAdminApiKey() {
  setAdminApiKeyLoading(true);
  try {
    const status = await adminSettingsAPI.getAdminApiKey();
    setAdminApiKeyExists(status.exists);
    setAdminApiKeyMasked(status.masked_key);
  } catch (_error: unknown) {
    // Silent fail - admin API key status is non-critical
  } finally {
    setAdminApiKeyLoading(false);
  }
}

async function createAdminApiKey() {
  setAdminApiKeyOperating(true);
  try {
    const result = await adminSettingsAPI.regenerateAdminApiKey();
    setNewAdminApiKey(result.key);
    setAdminApiKeyExists(true);
    setAdminApiKeyMasked(result.key.substring(0, 10) + "..." + result.key.slice(-4));
    showSuccess(t("admin.settings.adminApiKey.keyGenerated"));
  } catch (error: unknown) {
    showError(extractApiErrorMessage(error, t("common.error")));
  } finally {
    setAdminApiKeyOperating(false);
  }
}

async function regenerateAdminApiKey() {
  if (!confirm(t("admin.settings.adminApiKey.regenerateConfirm"))) return;
  await createAdminApiKey();
}

async function deleteAdminApiKey() {
  if (!confirm(t("admin.settings.adminApiKey.deleteConfirm"))) return;
  setAdminApiKeyOperating(true);
  try {
    await adminSettingsAPI.deleteAdminApiKey();
    setAdminApiKeyExists(false);
    setAdminApiKeyMasked("");
    setNewAdminApiKey("");
    showSuccess(t("admin.settings.adminApiKey.keyDeleted"));
  } catch (error: unknown) {
    showError(extractApiErrorMessage(error, t("common.error")));
  } finally {
    setAdminApiKeyOperating(false);
  }
}

function copyNewKey() {
  navigator.clipboard
    .writeText(newAdminApiKey)
    .then(() => {
      showSuccess(t("admin.settings.adminApiKey.keyCopied"));
    })
    .catch(() => {
      showError(t("common.copyFailed"));
    });
}

// Overload Cooldown 方法
async function loadOverloadCooldownSettings() {
  setOverloadCooldownLoading(true);
  try {
    const settings = await adminSettingsAPI.getOverloadCooldownSettings();
    Object.assign(overloadCooldownFormRef.current, settings); bump();
  } catch (_error: unknown) {
    // Silent fail - settings will use defaults
  } finally {
    setOverloadCooldownLoading(false);
  }
}

async function saveOverloadCooldownSettings() {
  setOverloadCooldownSaving(true);
  try {
    const updated = await adminSettingsAPI.updateOverloadCooldownSettings({
      enabled: overloadCooldownForm.enabled,
      cooldown_minutes: overloadCooldownForm.cooldown_minutes,
    });
    Object.assign(overloadCooldownFormRef.current, updated); bump();
    showSuccess(t("admin.settings.overloadCooldown.saved"));
  } catch (error: unknown) {
    showError(
      extractApiErrorMessage(
        error,
        t("admin.settings.overloadCooldown.saveFailed"),
      ),
    );
  } finally {
    setOverloadCooldownSaving(false);
  }
}

// Rate Limit Cooldown (429) 方法
async function loadRateLimit429CooldownSettings() {
  setRateLimit429CooldownLoading(true);
  try {
    const settings = await adminSettingsAPI.getRateLimit429CooldownSettings();
    Object.assign(rateLimit429CooldownFormRef.current, settings); bump();
  } catch (_error: unknown) {
    // Silent fail - settings will use defaults
  } finally {
    setRateLimit429CooldownLoading(false);
  }
}

async function saveRateLimit429CooldownSettings() {
  setRateLimit429CooldownSaving(true);
  try {
    const updated = await adminSettingsAPI.updateRateLimit429CooldownSettings({
      enabled: rateLimit429CooldownForm.enabled,
      cooldown_seconds: rateLimit429CooldownForm.cooldown_seconds,
    });
    Object.assign(rateLimit429CooldownFormRef.current, updated); bump();
    showSuccess(t("admin.settings.rateLimit429Cooldown.saved"));
  } catch (error: unknown) {
    showError(
      extractApiErrorMessage(
        error,
        t("admin.settings.rateLimit429Cooldown.saveFailed"),
      ),
    );
  } finally {
    setRateLimit429CooldownSaving(false);
  }
}

// Stream Timeout 方法
async function loadStreamTimeoutSettings() {
  setStreamTimeoutLoading(true);
  try {
    const settings = await adminSettingsAPI.getStreamTimeoutSettings();
    Object.assign(streamTimeoutFormRef.current, settings); bump();
  } catch (_error: unknown) {
    // Silent fail - settings will use defaults
  } finally {
    setStreamTimeoutLoading(false);
  }
}

async function saveStreamTimeoutSettings() {
  setStreamTimeoutSaving(true);
  try {
    const updated = await adminSettingsAPI.updateStreamTimeoutSettings({
      enabled: streamTimeoutForm.enabled,
      action: streamTimeoutForm.action,
      temp_unsched_minutes: streamTimeoutForm.temp_unsched_minutes,
      threshold_count: streamTimeoutForm.threshold_count,
      threshold_window_minutes: streamTimeoutForm.threshold_window_minutes,
    });
    Object.assign(streamTimeoutFormRef.current, updated); bump();
    showSuccess(t("admin.settings.streamTimeout.saved"));
  } catch (error: unknown) {
    showError(
      extractApiErrorMessage(
        error,
        t("admin.settings.streamTimeout.saveFailed"),
      ),
    );
  } finally {
    setStreamTimeoutSaving(false);
  }
}

// Rectifier 方法
async function loadRectifierSettings() {
  setRectifierLoading(true);
  try {
    const settings = await adminSettingsAPI.getRectifierSettings();
    Object.assign(rectifierFormRef.current, settings); bump();
    // 确保 patterns 是数组（旧数据可能为 null）
    if (!Array.isArray(rectifierForm.apikey_signature_patterns)) {
      rectifierForm.apikey_signature_patterns = [];
    }
  } catch (_error: unknown) {
    // Silent fail - settings will use defaults
  } finally {
    setRectifierLoading(false);
  }
}

async function saveRectifierSettings() {
  setRectifierSaving(true);
  try {
    const updated = await adminSettingsAPI.updateRectifierSettings({
      enabled: rectifierForm.enabled,
      thinking_signature_enabled: rectifierForm.thinking_signature_enabled,
      thinking_budget_enabled: rectifierForm.thinking_budget_enabled,
      apikey_signature_enabled: rectifierForm.apikey_signature_enabled,
      apikey_signature_patterns: rectifierForm.apikey_signature_patterns.filter(
        (p) => p.trim() !== "",
      ),
    });
    Object.assign(rectifierFormRef.current, updated); bump();
    if (!Array.isArray(rectifierForm.apikey_signature_patterns)) {
      rectifierForm.apikey_signature_patterns = [];
    }
    showSuccess(t("admin.settings.rectifier.saved"));
  } catch (error: unknown) {
    showError(
      extractApiErrorMessage(error, t("admin.settings.rectifier.saveFailed")),
    );
  } finally {
    setRectifierSaving(false);
  }
}

const betaPolicyActionOptions = useMemo(() => [
  { value: "pass", label: t("admin.settings.betaPolicy.actionPass") },
  { value: "filter", label: t("admin.settings.betaPolicy.actionFilter") },
  { value: "block", label: t("admin.settings.betaPolicy.actionBlock") },
], [t]);

const betaPolicyScopeOptions = useMemo(() => [
  { value: "all", label: t("admin.settings.betaPolicy.scopeAll") },
  { value: "oauth", label: t("admin.settings.betaPolicy.scopeOAuth") },
  { value: "apikey", label: t("admin.settings.betaPolicy.scopeAPIKey") },
  { value: "bedrock", label: t("admin.settings.betaPolicy.scopeBedrock") },
], [t]);

// Beta Policy 方法
const betaDisplayNames: Record<string, string> = {
  "fast-mode-2026-02-01": "Fast Mode",
  "context-1m-2025-08-07": "Context 1M",
};

// 快捷预设：按 beta_token 定义预设方案
const betaPresets: Record<
  string,
  Array<{
    label: string;
    description: string;
    action: "pass" | "filter" | "block";
    model_whitelist: string[];
    fallback_action: "pass" | "filter" | "block";
  }>
> = {
  "context-1m-2025-08-07": [
    {
      label: t("admin.settings.betaPolicy.presetOpusOnly"),
      description: t("admin.settings.betaPolicy.presetOpusOnlyDesc"),
      action: "pass",
      model_whitelist: ["claude-opus-4-6"],
      fallback_action: "filter",
    },
  ],
};

// 常用模型模式（具体 ID + 通配符示例）
const commonModelPatterns = [
  "claude-opus-4-6",
  "claude-sonnet-4-6",
  "claude-opus-*",
  "claude-sonnet-*",
];

function getBetaDisplayName(token: string): string {
  return betaDisplayNames[token] || token;
}

function applyBetaPreset(
  rule: (typeof betaPolicyForm.rules)[number],
  preset: {
    action: "pass" | "filter" | "block";
    model_whitelist: string[];
    fallback_action: "pass" | "filter" | "block";
  },
) {
  rule.action = preset.action;
  rule.model_whitelist = [...preset.model_whitelist];
  rule.fallback_action = preset.fallback_action;
}

function addQuickPattern(
  rule: (typeof betaPolicyForm.rules)[number],
  pattern: string,
) {
  if (!rule.model_whitelist) rule.model_whitelist = [];
  if (!rule.model_whitelist.includes(pattern)) {
    rule.model_whitelist.push(pattern);
  }
}

async function loadBetaPolicySettings() {
  setBetaPolicyLoading(true);
  try {
    const settings = await adminSettingsAPI.getBetaPolicySettings();
    betaPolicyForm.rules = settings.rules;
  } catch (_error: unknown) {
    // Silent fail - settings will use defaults
  } finally {
    setBetaPolicyLoading(false);
  }
}

// ==================== OpenAI Fast/Flex Policy ====================

const openaiFastPolicyTierOptions = useMemo(() => [
  { value: "all", label: t("admin.settings.openaiFastPolicy.tierAll") },
  {
    value: "priority",
    label: t("admin.settings.openaiFastPolicy.tierPriority"),
  },
  { value: "flex", label: t("admin.settings.openaiFastPolicy.tierFlex") },
], [t]);

const openaiFastPolicyActionOptions = useMemo(() => [
  { value: "pass", label: t("admin.settings.openaiFastPolicy.actionPass") },
  { value: "filter", label: t("admin.settings.openaiFastPolicy.actionFilter") },
  { value: "block", label: t("admin.settings.openaiFastPolicy.actionBlock") },
], [t]);

const openaiFastPolicyScopeOptions = useMemo(() => [
  { value: "all", label: t("admin.settings.openaiFastPolicy.scopeAll") },
  { value: "oauth", label: t("admin.settings.openaiFastPolicy.scopeOAuth") },
  { value: "apikey", label: t("admin.settings.openaiFastPolicy.scopeAPIKey") },
  {
    value: "bedrock",
    label: t("admin.settings.openaiFastPolicy.scopeBedrock"),
  },
], [t]);

function addOpenAIFastPolicyRule() {
  openaiFastPolicyForm.rules.push({
    service_tier: "priority",
    action: "filter",
    scope: "all",
    error_message: "",
    model_whitelist: [],
    fallback_action: "pass",
    fallback_error_message: "",
  });
}

function removeOpenAIFastPolicyRule(index: number) {
  openaiFastPolicyForm.rules.splice(index, 1);
}

function addOpenAIFastPolicyModelPattern(rule: OpenAIFastPolicyRule) {
  if (!rule.model_whitelist) rule.model_whitelist = [];
  rule.model_whitelist.push("");
}

function removeOpenAIFastPolicyModelPattern(
  rule: OpenAIFastPolicyRule,
  idx: number,
) {
  rule.model_whitelist?.splice(idx, 1);
}

async function saveBetaPolicySettings() {
  setBetaPolicySaving(true);
  try {
    // Clean up empty patterns before saving
    const cleanedRules = betaPolicyForm.rules.map((rule) => {
      const whitelist = rule.model_whitelist?.filter((p) => p.trim() !== "");
      const hasWhitelist = whitelist && whitelist.length > 0;
      return {
        beta_token: rule.beta_token,
        action: rule.action,
        scope: rule.scope,
        error_message: rule.error_message,
        model_whitelist: hasWhitelist ? whitelist : undefined,
        fallback_action: hasWhitelist
          ? rule.fallback_action || "pass"
          : undefined,
        fallback_error_message:
          hasWhitelist && rule.fallback_action === "block"
            ? rule.fallback_error_message
            : undefined,
      };
    });
    const updated = await adminSettingsAPI.updateBetaPolicySettings({
      rules: cleanedRules,
    });
    betaPolicyForm.rules = updated.rules;
    showSuccess(t("admin.settings.betaPolicy.saved"));
  } catch (error: unknown) {
    showError(
      extractApiErrorMessage(error, t("admin.settings.betaPolicy.saveFailed")),
    );
  } finally {
    setBetaPolicySaving(false);
  }
}

// ==================== Provider Management ====================

const allPaymentTypes = useMemo(() => [
  { value: "easypay", label: t("payment.methods.easypay") },
  { value: "alipay", label: t("payment.methods.alipay") },
  { value: "wxpay", label: t("payment.methods.wxpay") },
  { value: "stripe", label: t("payment.methods.stripe") },
  { value: "airwallex", label: t("payment.methods.airwallex") },
], [t]);

function isPaymentTypeEnabled(type: string): boolean {
  return form.payment_enabled_types.includes(type);
}

const hasAnyPaymentTypeEnabled = useMemo(
  () => form.payment_enabled_types.length > 0,
  [form.payment_enabled_types],
);

function togglePaymentType(type: string) {
  if (form.payment_enabled_types.includes(type)) {
    form.payment_enabled_types = form.payment_enabled_types.filter(
      (t) => t !== type,
    );
    // Disable all provider instances matching this type
    disableProvidersByType(type);
  } else {
    form.payment_enabled_types = [...form.payment_enabled_types, type];
  }
}

async function disableProvidersByType(type: string) {
  const matching = providers.filter(
    (p) => p.provider_key === type && p.enabled,
  );
  for (const p of matching) {
    try {
      await adminPaymentAPI.updateProvider(p.id, { enabled: false });
      p.enabled = false;
    } catch (err: unknown) {
      slog("disable provider failed", p.id, err);
    }
  }
}

function slog(...args: unknown[]) {
  console.warn("[payment]", ...args);
}

const [providersLoading, setProvidersLoading] = useState(false);
const [providerSaving, setProviderSaving] = useState(false);
const [providers, setProviders] = useState<ProviderInstance[]>([]);
const [showProviderDialog, setShowProviderDialog] = useState(false);
const [showDeleteProviderDialog, setShowDeleteProviderDialog] = useState(false);
const [editingProvider, setEditingProvider] = useState<ProviderInstance | null>(null);
const [deletingProviderId, setDeletingProviderId] = useState<number | null>(null);

const providerKeyOptions = useMemo(() => [
  { value: "easypay", label: t("admin.settings.payment.providerEasypay") },
  { value: "alipay", label: t("admin.settings.payment.providerAlipay") },
  { value: "wxpay", label: t("admin.settings.payment.providerWxpay") },
  { value: "stripe", label: t("admin.settings.payment.providerStripe") },
  { value: "airwallex", label: t("admin.settings.payment.providerAirwallex") },
], [t]);

const enabledProviderKeyOptions = useMemo(() => {
  const enabled = form.payment_enabled_types;
  return providerKeyOptions.filter((opt) => enabled.includes(opt.value));
}, [form.payment_enabled_types, providerKeyOptions]);

const loadBalanceOptions = useMemo(() => [
  {
    value: "round-robin",
    label: t("admin.settings.payment.strategyRoundRobin"),
  },
  {
    value: "least-amount",
    label: t("admin.settings.payment.strategyLeastAmount"),
  },
], [t]);

const cancelRateLimitUnitOptions = useMemo(() => [
  {
    value: "minute",
    label: t("admin.settings.payment.cancelRateLimitUnitMinute"),
  },
  { value: "hour", label: t("admin.settings.payment.cancelRateLimitUnitHour") },
  { value: "day", label: t("admin.settings.payment.cancelRateLimitUnitDay") },
], [t]);

const cancelRateLimitModeOptions = useMemo(() => [
  {
    value: "rolling",
    label: t("admin.settings.payment.cancelRateLimitWindowModeRolling"),
  },
  {
    value: "fixed",
    label: t("admin.settings.payment.cancelRateLimitWindowModeFixed"),
  },
], [t]);

type ProviderEnablementCandidate = Pick<
  ProviderInstance,
  "id" | "provider_key" | "supported_types" | "enabled" | "name"
>;

function getProviderVisibleMethods(
  provider: ProviderEnablementCandidate,
): Array<"alipay" | "wxpay"> {
  if (!provider.enabled) {
    return [];
  }

  const supportedTypes = Array.isArray(provider.supported_types)
    ? provider.supported_types
    : [];
  const methods = new Set<"alipay" | "wxpay">();
  const addMethod = (type: string) => {
    const method = normalizeVisibleMethod(type);
    if (method === "alipay" || method === "wxpay") {
      methods.add(method);
    }
  };

  if (provider.provider_key === "alipay") {
    if (supportedTypes.length === 0) {
      methods.add("alipay");
    } else {
      supportedTypes.forEach((type) => {
        if (normalizeVisibleMethod(type) === "alipay") {
          methods.add("alipay");
        }
      });
    }
  } else if (provider.provider_key === "wxpay") {
    if (supportedTypes.length === 0) {
      methods.add("wxpay");
    } else {
      supportedTypes.forEach((type) => {
        if (normalizeVisibleMethod(type) === "wxpay") {
          methods.add("wxpay");
        }
      });
    }
  } else if (provider.provider_key === "easypay") {
    supportedTypes.forEach(addMethod);
  }

  return Array.from(methods);
}

function findProviderEnablementConflict(
  candidate: ProviderEnablementCandidate,
): { method: "alipay" | "wxpay"; conflicting: ProviderInstance } | null {
  const claimedMethods = getProviderVisibleMethods(candidate);
  if (claimedMethods.length === 0) {
    return null;
  }

  for (const other of providers) {
    if (other.id === candidate.id || !other.enabled) {
      continue;
    }

    const otherMethods = getProviderVisibleMethods(other);
    const matchedMethod = claimedMethods.find((method) =>
      otherMethods.includes(method),
    );
    if (matchedMethod) {
      return {
        method: matchedMethod,
        conflicting: other,
      };
    }
  }

  return null;
}

function showProviderEnablementConflict(
  conflict: { method: "alipay" | "wxpay"; conflicting: ProviderInstance },
) {
  showError(
    t("admin.settings.payment.enableConflict", {
      method: t(`payment.methods.${conflict.method}`),
      provider: conflict.conflicting.name,
    }),
  );
}

async function loadProviders() {
  setProvidersLoading(true);
  try {
    const res = await adminPaymentAPI.getProviders();
    setProviders(res || []);
  } catch (err: unknown) {
    showError(extractI18nErrorMessage(err, t, "payment.errors", t("common.error")));
  } finally {
    setProvidersLoading(false);
  }
}

function openCreateProvider() {
  setEditingProvider(null);
  providerDialogRef.current?.reset(
    enabledProviderKeyOptions[0]?.value || "easypay",
  );
  setShowProviderDialog(true);
}

function openEditProvider(provider: ProviderInstance) {
  setEditingProvider(provider);
  providerDialogRef.current?.loadProvider(provider);
  setShowProviderDialog(true);
}

async function handleSaveProvider(payload: Partial<ProviderInstance>) {
  setProviderSaving(true);
  try {
    const candidate: ProviderEnablementCandidate = {
      id: editingProvider?.id ?? 0,
      provider_key:
        payload.provider_key ?? editingProvider?.provider_key ?? "",
      supported_types:
        payload.supported_types ?? editingProvider?.supported_types ?? [],
      enabled: payload.enabled ?? editingProvider?.enabled ?? false,
      name: payload.name ?? editingProvider?.name ?? "",
    };
    const conflict = findProviderEnablementConflict(candidate);
    if (conflict) {
      showProviderEnablementConflict(conflict);
      return;
    }

    if (editingProvider) {
      await adminPaymentAPI.updateProvider(editingProvider.id, payload);
    } else {
      await adminPaymentAPI.createProvider(payload);
    }
    setShowProviderDialog(false);
    // Reload full list (API returns decrypted/formatted data with correct sort order)
    await loadProviders();
    // Auto-save settings so provider changes take effect immediately
    await saveSettings();
  } catch (err: unknown) {
    showError(extractI18nErrorMessage(err, t, "payment.errors", t("common.error")));
  } finally {
    setProviderSaving(false);
  }
}

async function handleToggleField(
  provider: ProviderInstance,
  field: "enabled" | "refund_enabled" | "allow_user_refund",
) {
  let newValue: boolean;
  if (field === "enabled") newValue = !provider.enabled;
  else if (field === "refund_enabled") newValue = !provider.refund_enabled;
  else newValue = !provider.allow_user_refund;

  if (field === "enabled" && newValue) {
    const conflict = findProviderEnablementConflict({
      id: provider.id,
      provider_key: provider.provider_key,
      supported_types: provider.supported_types,
      enabled: true,
      name: provider.name,
    });
    if (conflict) {
      showProviderEnablementConflict(conflict);
      return;
    }
  }

  const payload: Record<string, boolean> = { [field]: newValue };
  // Cascade: turning off refund_enabled also turns off allow_user_refund
  if (field === "refund_enabled" && !newValue) {
    payload.allow_user_refund = false;
  }
  try {
    await adminPaymentAPI.updateProvider(provider.id, payload);
    await loadProviders();
  } catch (err: unknown) {
    showError(extractI18nErrorMessage(err, t, "payment.errors", t("common.error")));
  }
}

async function handleToggleType(provider: ProviderInstance, type: string) {
  const updated = provider.supported_types.includes(type)
    ? provider.supported_types.filter((t) => t !== type)
    : [...provider.supported_types, type];
  const conflict = findProviderEnablementConflict({
    id: provider.id,
    provider_key: provider.provider_key,
    supported_types: updated,
    enabled: provider.enabled,
    name: provider.name,
  });
  if (conflict) {
    showProviderEnablementConflict(conflict);
    return;
  }
  try {
    await adminPaymentAPI.updateProvider(provider.id, {
      supported_types: updated,
    } as any);
    await loadProviders();
  } catch (err: unknown) {
    showError(extractI18nErrorMessage(err, t, "payment.errors", t("common.error")));
  }
}

function confirmDeleteProvider(provider: ProviderInstance) {
  setDeletingProviderId(provider.id);
  setShowDeleteProviderDialog(true);
}

async function handleReorderProviders(
  updates: { id: number; sort_order: number }[],
) {
  try {
    await Promise.all(
      updates.map((u) =>
        adminPaymentAPI.updateProvider(u.id, {
          sort_order: u.sort_order,
        } as Partial<ProviderInstance>),
      ),
    );
    await loadProviders();
  } catch (err: unknown) {
    showError(extractI18nErrorMessage(err, t, "payment.errors", t("common.error")));
    loadProviders();
  }
}

async function handleDeleteProvider() {
  if (!deletingProviderId) return;
  try {
    await adminPaymentAPI.deleteProvider(deletingProviderId);
    showSuccess(t("common.deleted"));
    setShowDeleteProviderDialog(false);
    loadProviders();
  } catch (err: unknown) {
    showError(extractI18nErrorMessage(err, t, "payment.errors", t("common.error")));
  }
}

useEffect(() => {
  loadSettings();
  loadSubscriptionGroups();
  loadAdminApiKey();
  loadOverloadCooldownSettings();
  loadRateLimit429CooldownSettings();
  loadStreamTimeoutSettings();
  loadRectifierSettings();
  loadBetaPolicySettings();
  loadProviders();
}, []);

// =========================
// Affiliate (邀请返利) 专属用户管理
// =========================

interface AffiliateState {
  loading: boolean;
  entries: AffiliateAdminEntry[];
  total: number;
  page: number;
  pageSize: number;
  search: string;
  selected: number[];
  searchTimer: number | null;
}

const affiliateStateRef = useRef<AffiliateState>({
  loading: false,
  entries: [],
  total: 0,
  page: 1,
  pageSize: 20,
  search: "",
  selected: [],
  searchTimer: null,
});
  const affiliateState = affiliateStateRef.current

// `rate` is typed as string|number because <input type="number"> makes Vue's
// v-model auto-cast the bound value to a Number on every keystroke. We keep
// both shapes and normalize at read time.
interface AffiliateModalState {
  open: boolean;
  mode: "add" | "edit";
  saving: boolean;
  userQuery: string;
  userResults: AffiliateSimpleUser[];
  selectedUser: AffiliateSimpleUser | null;
  editingEntry: AffiliateAdminEntry | null;
  code: string;
  rate: string | number;
  searchTimer: number | null;
}

const affiliateModalRef = useRef<AffiliateModalState>({
  open: false,
  mode: "add",
  saving: false,
  userQuery: "",
  userResults: [],
  selectedUser: null,
  editingEntry: null,
  code: "",
  rate: "",
  searchTimer: null,
});
  const affiliateModal = affiliateModalRef.current

const affiliateBatchModalRef = useRef({
  open: false,
  saving: false,
  rate: "",
});
  const affiliateBatchModal = affiliateBatchModalRef.current

// affiliateConfirmDialog drives the project-standard <ConfirmDialog>. We can't
// `await` the user's response from the dialog component, so the confirm action
// runs from the @confirm callback once the user clicks the dialog's confirm
// button.
const affiliateConfirmDialogRef = useRef<{
  show: boolean;
  title: string;
  message: string;
  confirmText: string;
  pending: (() => Promise<unknown>) | null;
}>({
  show: false,
  title: "",
  message: "",
  confirmText: "",
  pending: null,
});
  const affiliateConfirmDialog = affiliateConfirmDialogRef.current

function openAffiliateConfirm(
  title: string,
  message: string,
  confirmText: string,
  fn: () => Promise<unknown>,
) {
  affiliateConfirmDialog.title = title;
  affiliateConfirmDialog.message = message;
  affiliateConfirmDialog.confirmText = confirmText;
  affiliateConfirmDialog.pending = fn;
  affiliateConfirmDialog.show = true;
}

async function handleAffiliateConfirm() {
  const fn = affiliateConfirmDialog.pending;
  affiliateConfirmDialog.show = false;
  affiliateConfirmDialog.pending = null;
  if (!fn) return;
  try {
    await fn();
    showSuccess(t("common.saved"));
    await loadAffiliateUsers();
  } catch (err) {
    showError(extractApiErrorMessage(err, t("common.error")));
  }
}

function cancelAffiliateConfirm() {
  affiliateConfirmDialog.show = false;
  affiliateConfirmDialog.pending = null;
}

// debounceTimer wires a single timer slot to a callback with a delay,
// canceling any pending invocation. Used for type-as-you-go search inputs.
function debounceTimer(slot: { searchTimer: number | null }, delayMs: number, run: () => void) {
  if (slot.searchTimer != null) window.clearTimeout(slot.searchTimer);
  slot.searchTimer = window.setTimeout(run, delayMs);
}

// parseRebateRate validates 0-100 numeric input. Returns the parsed number on
// success, null when the field is empty (caller decides empty semantics), or
// undefined on invalid input (after surfacing a toast).
//
// Accepts unknown because <input type="number"> makes Vue's v-model coerce
// the value to Number on each keystroke (e.g. typing "30" lands a `30: number`
// in state, not a `"30": string`). String("") and (30).trim() would crash, so
// we normalize here instead of forcing every caller to remember.
function parseRebateRate(raw: unknown): number | null | undefined {
  const s = String(raw ?? "").trim();
  if (s === "") return null;
  const parsed = Number(s);
  if (Number.isNaN(parsed) || parsed < 0 || parsed > 100) {
    showError(t("admin.settings.features.affiliate.modal.errorBadRate"));
    return undefined;
  }
  return parsed;
}

async function loadAffiliateUsers() {
  affiliateState.loading = true;
  try {
    const res = await affiliatesAPI.listUsers({
      page: affiliateState.page,
      page_size: affiliateState.pageSize,
      search: affiliateState.search,
    });
    affiliateState.entries = res.items ?? [];
    affiliateState.total = res.total ?? 0;
    // Drop selections that are no longer visible.
    const visibleIds = new Set(affiliateState.entries.map((e) => e.user_id));
    affiliateState.selected = affiliateState.selected.filter((id) => visibleIds.has(id));
  } catch (err) {
    showError(extractApiErrorMessage(err, t("common.error")));
  } finally {
    affiliateState.loading = false;
  }
}

function onAffiliateSearchInput() {
  debounceTimer(affiliateState, 300, () => {
    affiliateState.page = 1;
    loadAffiliateUsers();
  });
}

function changeAffiliatePage(page: number) {
  if (page < 1) return;
  affiliateState.page = page;
  loadAffiliateUsers();
}

function toggleAffiliateSelectAll(e: ChangeEvent<HTMLInputElement>) {
  const checked = (e.target as HTMLInputElement).checked;
  affiliateState.selected = checked ? affiliateState.entries.map((entry) => entry.user_id) : [];
}

function toggleAffiliateSelect(userId: number) {
  const idx = affiliateState.selected.indexOf(userId);
  if (idx >= 0) affiliateState.selected.splice(idx, 1);
  else affiliateState.selected.push(userId);
}

// openAffiliateModal opens the add/edit modal, prefilling fields from the
// edited entry when present and resetting them otherwise.
function openAffiliateModal(entry: AffiliateAdminEntry | null) {
  affiliateModal.open = true;
  affiliateModal.mode = entry ? "edit" : "add";
  affiliateModal.userQuery = "";
  affiliateModal.userResults = [];
  affiliateModal.selectedUser = null;
  affiliateModal.editingEntry = entry;
  affiliateModal.code = entry?.aff_code_custom ? entry.aff_code : "";
  affiliateModal.rate =
    entry?.aff_rebate_rate_percent != null ? String(entry.aff_rebate_rate_percent) : "";
}

function closeAffiliateModal() {
  affiliateModal.open = false;
  if (affiliateModal.searchTimer != null) {
    window.clearTimeout(affiliateModal.searchTimer);
    affiliateModal.searchTimer = null;
  }
}

function onAffiliateUserSearchInput() {
  const q = affiliateModal.userQuery.trim();
  if (!q) {
    affiliateModal.userResults = [];
    return;
  }
  debounceTimer(affiliateModal, 300, async () => {
    try {
      affiliateModal.userResults = await affiliatesAPI.lookupUsers(q);
    } catch (err) {
      showError(extractApiErrorMessage(err, t("common.error")));
    }
  });
}

// selectAffiliateUser picks a user from the dropdown and collapses the search
// UI. Clearing the result list also clears the visual dropdown.
function selectAffiliateUser(user: AffiliateSimpleUser) {
  affiliateModal.selectedUser = user;
  affiliateModal.userQuery = "";
  affiliateModal.userResults = [];
}

function clearSelectedAffiliateUser() {
  affiliateModal.selectedUser = null;
}

// affiliateModalCanSubmit guards the Save button: must have a user picked AND
// produce at least one field change. Without this the admin could "save" an
// empty payload that silently does nothing — the user reported exactly that
// confusion.
const affiliateModalCanSubmit = useMemo(() => {
  if (affiliateModal.mode === "add") {
    if (!affiliateModal.selectedUser) return false;
  } else if (!affiliateModal.editingEntry) {
    return false;
  }
  const codeFilled = affiliateModal.code.trim() !== "";
  const rateFilled = String(affiliateModal.rate ?? "").trim() !== "";
  if (codeFilled || rateFilled) return true;
  // Edit mode + empty rate input is a meaningful "clear" only if the user
  // currently has an exclusive rate to clear.
  return (
    affiliateModal.mode === "edit" &&
    affiliateModal.editingEntry?.aff_rebate_rate_percent != null
  );
}, [affiliateModal.mode, affiliateModal.selectedUser, affiliateModal.editingEntry, affiliateModal.code, affiliateModal.rate]);

async function submitAffiliateModal() {
  if (!affiliateModalCanSubmit) {
    // Should be unreachable because the button is disabled, but keep a guard.
    showError(t("admin.settings.features.affiliate.modal.errorEmpty"));
    return;
  }

  let userId: number;
  if (affiliateModal.mode === "add") {
    userId = affiliateModal.selectedUser!.id;
  } else {
    userId = affiliateModal.editingEntry!.user_id;
  }

  const payload: Parameters<typeof affiliatesAPI.updateUserSettings>[1] = {};
  const codeRaw = affiliateModal.code.trim();
  if (codeRaw) payload.aff_code = codeRaw.toUpperCase();

  const rateInput = parseRebateRate(affiliateModal.rate);
  if (rateInput === undefined) return; // toast already shown
  if (rateInput === null) {
    if (affiliateModal.mode === "edit" && affiliateModal.editingEntry?.aff_rebate_rate_percent != null) {
      payload.clear_rebate_rate = true;
    }
  } else {
    payload.aff_rebate_rate_percent = rateInput;
  }

  affiliateModal.saving = true;
  try {
    await affiliatesAPI.updateUserSettings(userId, payload);
    showSuccess(t("common.saved"));
    closeAffiliateModal();
    affiliateState.page = 1;
    await loadAffiliateUsers();
  } catch (err) {
    showError(extractApiErrorMessage(err, t("common.error")));
  } finally {
    affiliateModal.saving = false;
  }
}

// askResetAffiliateUser prompts via the project ConfirmDialog, then on confirm
// calls the backend "reset all" endpoint that clears both the exclusive rate
// AND regenerates the invite code as a system random one.
function askResetAffiliateUser(entry: AffiliateAdminEntry) {
  openAffiliateConfirm(
    t("admin.settings.features.affiliate.customUsers.resetTitle"),
    t("admin.settings.features.affiliate.customUsers.resetMessage", {
      email: entry.email || `#${entry.user_id}`,
    }),
    t("common.delete"),
    () => affiliatesAPI.clearUserSettings(entry.user_id),
  );
}

function openAffiliateBatchModal() {
  if (affiliateState.selected.length === 0) return;
  affiliateBatchModal.open = true;
  affiliateBatchModal.rate = "";
}

async function submitAffiliateBatchModal() {
  const rateInput = parseRebateRate(affiliateBatchModal.rate);
  if (rateInput === undefined) return;
  const userIDs = [...affiliateState.selected];
  const payload: Parameters<typeof affiliatesAPI.batchSetRate>[0] =
    rateInput === null
      ? { user_ids: userIDs, clear: true }
      : { user_ids: userIDs, aff_rebate_rate_percent: rateInput };

  affiliateBatchModal.saving = true;
  try {
    await affiliatesAPI.batchSetRate(payload);
    showSuccess(t("common.saved"));
    affiliateBatchModal.open = false;
    affiliateState.selected = [];
    await loadAffiliateUsers();
  } catch (err) {
    showError(extractApiErrorMessage(err, t("common.error")));
  } finally {
    affiliateBatchModal.saving = false;
  }
}

// Load the per-user table the first time the affiliate switch is observed
// as enabled. The form starts disabled and is updated to the server's value
// after the settings load — so this fires either when the saved value is
// truthy on first paint, or when the admin manually toggles it on.
useEffect(() => {
  const enabled = form.affiliate_enabled
  const prev = prevAffiliateEnabledRef.current
  if (enabled && !prev) loadAffiliateUsers()
  prevAffiliateEnabledRef.current = enabled
}, [form.affiliate_enabled])

// bypass_registration 与身份同步三开关仅在 internal_only 模式下生效。切换 policy 到其它值时，
// 立即把相关字段重置为 false，避免保存请求里残留旧值。后端 admin handler 与
// 配置加载层都有 coerce 兜底，这里是 UX 层的同步而非安全防线。
useEffect(() => {
  const policy = form.dingtalk_connect_corp_restriction_policy
  if (policy !== 'internal_only') {
    if (form.dingtalk_connect_bypass_registration) form.dingtalk_connect_bypass_registration = false
    if (form.dingtalk_connect_sync_corp_email) form.dingtalk_connect_sync_corp_email = false
    if (form.dingtalk_connect_sync_display_name) form.dingtalk_connect_sync_display_name = false
    if (form.dingtalk_connect_sync_dept) form.dingtalk_connect_sync_dept = false
  }
}, [form.dingtalk_connect_corp_restriction_policy])

  const __set = useCallback((path: string, value: unknown) => {
    const parts = path.split('.')
    const root = parts[0]
    const field = parts[parts.length - 1]
    const refMap: Record<string, { current: Record<string, unknown> }> = {
      form: formRef as unknown as { current: Record<string, unknown> },
      overloadCooldownForm: overloadCooldownFormRef as unknown as { current: Record<string, unknown> },
      rateLimit429CooldownForm: rateLimit429CooldownFormRef as unknown as { current: Record<string, unknown> },
      streamTimeoutForm: streamTimeoutFormRef as unknown as { current: Record<string, unknown> },
      rectifierForm: rectifierFormRef as unknown as { current: Record<string, unknown> },
      betaPolicyForm: betaPolicyFormRef as unknown as { current: Record<string, unknown> },
      openaiFastPolicyForm: openaiFastPolicyFormRef as unknown as { current: Record<string, unknown> },
      webSearchConfig: webSearchConfigRef as unknown as { current: Record<string, unknown> },
      affiliateState: affiliateStateRef as unknown as { current: Record<string, unknown> },
      affiliateModal: affiliateModalRef as unknown as { current: Record<string, unknown> },
      affiliateBatchModal: affiliateBatchModalRef as unknown as { current: Record<string, unknown> },
      affiliateConfirmDialog: affiliateConfirmDialogRef as unknown as { current: Record<string, unknown> },
      authSourceDefaults: authSourceDefaultsRef as unknown as { current: Record<string, unknown> },
    }
    if (parts.length === 1 && refMap[root]) {
      Object.assign(refMap[root].current, value as Record<string, unknown>)
      bump()
      return
    }
    if (refMap[root]) {
      refMap[root].current[field] = value
      bump()
      return
    }
    if (root === 'expandedProviders' || root === 'apiKeyVisible') {
      const r = root === 'expandedProviders' ? expandedProvidersRef : apiKeyVisibleRef
      r.current[Number(field)] = value as boolean
      bump()
    }
  }, [bump])

  if (loading) {
    return (
      <AppLayout>
        <div className="mx-auto max-w-6xl space-y-6">
          <div className="flex items-center justify-center py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary-600" />
          </div>
        </div>
      </AppLayout>
    )
  }

  return (
    <AppLayout>
      <div className="mx-auto max-w-6xl space-y-6">
        <form onSubmit={(e) => { e.preventDefault(); saveSettings() }} className="space-y-6" noValidate>
        {/* Tab Navigation */}
        <div className="settings-tabs-shell">
          <nav
            className="settings-tabs-scroll"
            role="tablist"
            aria-label={t('admin.settings.title')}
          >
            <div className="settings-tabs">
              {settingsTabs.map((tab, idx) => (<button id={`settings-tab-${tab.key}`}
                type="button"
                role="tab"
                aria-selected={activeTab === tab.key}
                tabIndex={activeTab === tab.key ? 0 : -1}
                className={`settings-tab ${activeTab === tab.key ? 'settings-tab-active' : ''}`}
                onClick={() => selectSettingsTab(tab.key)}
                onKeyDown={(e) => handleSettingsTabKeydown(e, tab.key)} key={tab.key}>
                <span className="settings-tab-icon">
                  <Icon name={tab.icon} size="sm" />
                </span>
                <span className="settings-tab-label">{t(`admin.settings.tabs.${tab.key}`)}</span>
              </button>))}
            </div>
          </nav>
        </div>

        {/* Tab: Security — Admin API Key */}
        <div style={{ display: (activeTab === 'security') ? undefined : 'none' }} className="space-y-6">
          {/* Admin API Key Settings */}
          <div className="card">
            <div
              className="border-b border-gray-100 px-6 py-4 dark:border-dark-700"
            >
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                {t("admin.settings.adminApiKey.title")}
              </h2>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                {t("admin.settings.adminApiKey.description")}
              </p>
            </div>
            <div className="space-y-4 p-6">
              {/* Security Warning */}
              <div
                className="rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-900/20"
              >
                <div className="flex items-start">
                  <Icon
                    name="exclamationTriangle"
                    size="md"
                    className="mt-0.5 flex-shrink-0 text-amber-500"
                  />
                  <p className="ml-3 text-sm text-amber-700 dark:text-amber-300">
                    {t("admin.settings.adminApiKey.securityWarning")}
                  </p>
                </div>
              </div>

              {/* Loading State */}
              <div className="flex items-center gap-2 text-gray-500" style={{ display: (adminApiKeyLoading) ? undefined : 'none' }}>
                <div
                  className="h-4 w-4 animate-spin rounded-full border-b-2 border-primary-600"
                ></div>
                {t("common.loading")}
              </div>

              {/* No Key Configured */}
              <div className="flex items-center justify-between" style={{ display: (!(adminApiKeyLoading) && (!adminApiKeyExists)) ? undefined : 'none' }}>
                <span className="text-gray-500 dark:text-gray-400">
                  {t("admin.settings.adminApiKey.notConfigured")}
                </span>
                <button
                  type="button"
                  onClick={() => createAdminApiKey()}
                  disabled={adminApiKeyOperating}
                  className="btn btn-primary btn-sm"
                >
                  <svg className="mr-1 h-4 w-4 animate-spin"
                    fill="none"
                    viewBox="0 0 24 24" style={{ display: (adminApiKeyOperating) ? undefined : 'none' }}>
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    ></circle>
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    ></path>
                  </svg>
                  {adminApiKeyOperating
                      ? t("admin.settings.adminApiKey.creating")
                      : t("admin.settings.adminApiKey.create")}
                </button>
              </div>

              {/* Key Exists */}
              <div className="space-y-4" style={{ display: (!adminApiKeyLoading && adminApiKeyExists) ? undefined : 'none' }}>
                <div className="flex items-center justify-between">
                  <div>
                    <label
                      className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300"
                    >
                      {t("admin.settings.adminApiKey.currentKey")}
                    </label>
                    <code
                      className="rounded bg-gray-100 px-2 py-1 font-mono text-sm text-gray-900 dark:bg-dark-700 dark:text-gray-100"
                    >
                      {adminApiKeyMasked}
                    </code>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => regenerateAdminApiKey()}
                      disabled={adminApiKeyOperating}
                      className="btn btn-secondary btn-sm"
                    >
                      {adminApiKeyOperating
                          ? t("admin.settings.adminApiKey.regenerating")
                          : t("admin.settings.adminApiKey.regenerate")}
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteAdminApiKey()}
                      disabled={adminApiKeyOperating}
                      className="btn btn-secondary btn-sm text-red-600 hover:text-red-700 dark:text-red-400"
                    >
                      {t("admin.settings.adminApiKey.delete")}
                    </button>
                  </div>
                </div>

                {/* Newly Generated Key Display */}
                <div className="space-y-3 rounded-lg border border-green-200 bg-green-50 p-4 dark:border-green-800 dark:bg-green-900/20" style={{ display: (newAdminApiKey) ? undefined : 'none' }}>
                  <p
                    className="text-sm font-medium text-green-700 dark:text-green-300"
                  >
                    {t("admin.settings.adminApiKey.keyWarning")}
                  </p>
                  <div className="flex items-center gap-2">
                    <code
                      className="flex-1 select-all break-all rounded border border-green-300 bg-white px-3 py-2 font-mono text-sm dark:border-green-700 dark:bg-dark-800"
                    >
                      {newAdminApiKey}
                    </code>
                    <button
                      type="button"
                      onClick={() => copyNewKey()}
                      className="btn btn-primary btn-sm flex-shrink-0"
                    >
                      {t("admin.settings.adminApiKey.copyKey")}
                    </button>
                  </div>
                  <p className="text-xs text-green-600 dark:text-green-400">
                    {t("admin.settings.adminApiKey.usage")}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
        {/* /Tab: Security — Admin API Key */}

        {/* Tab: Gateway */}
        <div style={{ display: (activeTab === 'gateway') ? undefined : 'none' }} className="space-y-6">
          {/* Overload Cooldown (529) Settings */}
          <div className="card">
            <div
              className="border-b border-gray-100 px-6 py-4 dark:border-dark-700"
            >
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                {t("admin.settings.overloadCooldown.title")}
              </h2>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                {t("admin.settings.overloadCooldown.description")}
              </p>
            </div>
            <div className="space-y-5 p-6">
              <div className="flex items-center gap-2 text-gray-500" style={{ display: (overloadCooldownLoading) ? undefined : 'none' }}>
                <div
                  className="h-4 w-4 animate-spin rounded-full border-b-2 border-primary-600"
                ></div>
                {t("common.loading")}
              </div>

              <div style={{ display: (!(newAdminApiKey)) ? undefined : 'none' }}>
                <div className="flex items-center justify-between">
                  <div>
                    <label className="font-medium text-gray-900 dark:text-white">{t("admin.settings.overloadCooldown.enabled")}</label>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {t("admin.settings.overloadCooldown.enabledHint")}
                    </p>
                  </div>
                  <Toggle modelValue={overloadCooldownForm.enabled} onUpdateModelValue={(v) => __set("overloadCooldownForm.enabled", v)} />
                </div>

                <div style={{ display: (overloadCooldownForm.enabled) ? undefined : 'none' }}
                  className="space-y-4 border-t border-gray-100 pt-4 dark:border-dark-700"
                >
                  <div>
                    <label
                      className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300"
                    >
                      {t("admin.settings.overloadCooldown.cooldownMinutes")}
                    </label>
                    <input
                      value={overloadCooldownForm.cooldown_minutes ?? ''} onChange={(e) => __set("overloadCooldownForm.cooldown_minutes", Number((e.target as HTMLInputElement).value))}
                      type="number"
                      min="1"
                      max="120"
                      className="input w-32"
                    />
                    <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
                      {t("admin.settings.overloadCooldown.cooldownMinutesHint")}
                    </p>
                  </div>
                </div>

                <div
                  className="flex justify-end border-t border-gray-100 pt-4 dark:border-dark-700"
                >
                  <button
                    type="button"
                    onClick={() => saveOverloadCooldownSettings()}
                    disabled={overloadCooldownSaving}
                    className="btn btn-primary btn-sm"
                  >
                    <svg style={{ display: (overloadCooldownSaving) ? undefined : 'none' }}
                      className="mr-1 h-4 w-4 animate-spin"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      ></circle>
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      ></path>
                    </svg>
                    {overloadCooldownSaving
                        ? t("common.saving")
                        : t("common.save")}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Rate Limit Cooldown (429) Settings */}
          <div className="card">
            <div
              className="border-b border-gray-100 px-6 py-4 dark:border-dark-700"
            >
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                {t("admin.settings.rateLimit429Cooldown.title")}
              </h2>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                {t("admin.settings.rateLimit429Cooldown.description")}
              </p>
            </div>
            <div className="space-y-5 p-6">
              <div className="flex items-center gap-2 text-gray-500" style={{ display: (rateLimit429CooldownLoading) ? undefined : 'none' }}>
                <div
                  className="h-4 w-4 animate-spin rounded-full border-b-2 border-primary-600"
                ></div>
                {t("common.loading")}
              </div>

              <div style={{ display: (!(rateLimit429CooldownLoading)) ? undefined : 'none' }}>
                <div className="flex items-center justify-between">
                  <div>
                    <label className="font-medium text-gray-900 dark:text-white">{t("admin.settings.rateLimit429Cooldown.enabled")}</label>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {t("admin.settings.rateLimit429Cooldown.enabledHint")}
                    </p>
                  </div>
                  <Toggle modelValue={rateLimit429CooldownForm.enabled} onUpdateModelValue={(v) => __set("rateLimit429CooldownForm.enabled", v)} />
                </div>

                <div style={{ display: (rateLimit429CooldownForm.enabled) ? undefined : 'none' }}
                  className="space-y-4 border-t border-gray-100 pt-4 dark:border-dark-700"
                >
                  <div>
                    <label
                      className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300"
                    >
                      {t(
                          "admin.settings.rateLimit429Cooldown.cooldownSeconds",
                        )}
                    </label>
                    <input
                      value={rateLimit429CooldownForm.cooldown_seconds ?? ''} onChange={(e) => __set("rateLimit429CooldownForm.cooldown_seconds", Number((e.target as HTMLInputElement).value))}
                      type="number"
                      min="1"
                      max="7200"
                      className="input w-32"
                    />
                    <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
                      {t(
                          "admin.settings.rateLimit429Cooldown.cooldownSecondsHint",
                        )}
                    </p>
                  </div>
                </div>

                <div
                  className="flex justify-end border-t border-gray-100 pt-4 dark:border-dark-700"
                >
                  <button
                    type="button"
                    onClick={() => saveRateLimit429CooldownSettings()}
                    disabled={rateLimit429CooldownSaving}
                    className="btn btn-primary btn-sm"
                  >
                    <svg style={{ display: (rateLimit429CooldownSaving) ? undefined : 'none' }}
                      className="mr-1 h-4 w-4 animate-spin"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      ></circle>
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      ></path>
                    </svg>
                    {rateLimit429CooldownSaving
                        ? t("common.saving")
                        : t("common.save")}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Stream Timeout Settings */}
          <div className="card">
            <div
              className="border-b border-gray-100 px-6 py-4 dark:border-dark-700"
            >
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                {t("admin.settings.streamTimeout.title")}
              </h2>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                {t("admin.settings.streamTimeout.description")}
              </p>
            </div>
            <div className="space-y-5 p-6">
              {/* Loading State */}
              <div className="flex items-center gap-2 text-gray-500" style={{ display: (streamTimeoutLoading) ? undefined : 'none' }}>
                <div
                  className="h-4 w-4 animate-spin rounded-full border-b-2 border-primary-600"
                ></div>
                {t("common.loading")}
              </div>

              <div style={{ display: (!(streamTimeoutLoading)) ? undefined : 'none' }}>
                {/* Enable Stream Timeout */}
                <div className="flex items-center justify-between">
                  <div>
                    <label className="font-medium text-gray-900 dark:text-white">{t("admin.settings.streamTimeout.enabled")}</label>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {t("admin.settings.streamTimeout.enabledHint")}
                    </p>
                  </div>
                  <Toggle modelValue={streamTimeoutForm.enabled} onUpdateModelValue={(v) => __set("streamTimeoutForm.enabled", v)} />
                </div>

                {/* Settings - Only show when enabled */}
                <div style={{ display: (streamTimeoutForm.enabled) ? undefined : 'none' }}
                  className="space-y-4 border-t border-gray-100 pt-4 dark:border-dark-700"
                >
                  {/* Action */}
                  <div>
                    <label
                      className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300"
                    >
                      {t("admin.settings.streamTimeout.action")}
                    </label>
                    <select
                      value={streamTimeoutForm.action ?? ''} onChange={(e) => __set("streamTimeoutForm.action", e.target.value)}
                      className="input w-64"
                    >
                      <option value="temp_unsched">
                        {t("admin.settings.streamTimeout.actionTempUnsched")}
                      </option>
                      <option value="error">
                        {t("admin.settings.streamTimeout.actionError")}
                      </option>
                      <option value="none">
                        {t("admin.settings.streamTimeout.actionNone")}
                      </option>
                    </select>
                    <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
                      {t("admin.settings.streamTimeout.actionHint")}
                    </p>
                  </div>

                  {/* Temp Unsched Minutes (only show when action is temp_unsched) */}
                  <div style={{ display: (streamTimeoutForm.action === 'temp_unsched') ? undefined : 'none' }}>
                    <label
                      className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300"
                    >
                      {t("admin.settings.streamTimeout.tempUnschedMinutes")}
                    </label>
                    <input
                      value={streamTimeoutForm.temp_unsched_minutes ?? ''} onChange={(e) => __set("streamTimeoutForm.temp_unsched_minutes", Number((e.target as HTMLInputElement).value))}
                      type="number"
                      min="1"
                      max="60"
                      className="input w-32"
                    />
                    <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
                      {t("admin.settings.streamTimeout.tempUnschedMinutesHint")}
                    </p>
                  </div>

                  {/* Threshold Count */}
                  <div>
                    <label
                      className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300"
                    >
                      {t("admin.settings.streamTimeout.thresholdCount")}
                    </label>
                    <input
                      value={streamTimeoutForm.threshold_count ?? ''} onChange={(e) => __set("streamTimeoutForm.threshold_count", Number((e.target as HTMLInputElement).value))}
                      type="number"
                      min="1"
                      max="10"
                      className="input w-32"
                    />
                    <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
                      {t("admin.settings.streamTimeout.thresholdCountHint")}
                    </p>
                  </div>

                  {/* Threshold Window Minutes */}
                  <div>
                    <label
                      className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300"
                    >
                      {t("admin.settings.streamTimeout.thresholdWindowMinutes")}
                    </label>
                    <input
                      value={streamTimeoutForm.threshold_window_minutes ?? ''} onChange={(e) => __set("streamTimeoutForm.threshold_window_minutes", Number((e.target as HTMLInputElement).value))}
                      type="number"
                      min="1"
                      max="60"
                      className="input w-32"
                    />
                    <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
                      {t(
                          "admin.settings.streamTimeout.thresholdWindowMinutesHint",
                        )}
                    </p>
                  </div>
                </div>

                {/* Save Button */}
                <div
                  className="flex justify-end border-t border-gray-100 pt-4 dark:border-dark-700"
                >
                  <button
                    type="button"
                    onClick={() => saveStreamTimeoutSettings()}
                    disabled={streamTimeoutSaving}
                    className="btn btn-primary btn-sm"
                  >
                    <svg style={{ display: (streamTimeoutSaving) ? undefined : 'none' }}
                      className="mr-1 h-4 w-4 animate-spin"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      ></circle>
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      ></path>
                    </svg>
                    {streamTimeoutSaving
                        ? t("common.saving")
                        : t("common.save")}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Request Rectifier Settings */}
          <div className="card">
            <div
              className="border-b border-gray-100 px-6 py-4 dark:border-dark-700"
            >
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                {t("admin.settings.rectifier.title")}
              </h2>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                {t("admin.settings.rectifier.description")}
              </p>
            </div>
            <div className="space-y-5 p-6">
              {/* Loading State */}
              <div className="flex items-center gap-2 text-gray-500" style={{ display: (rectifierLoading) ? undefined : 'none' }}>
                <div
                  className="h-4 w-4 animate-spin rounded-full border-b-2 border-primary-600"
                ></div>
                {t("common.loading")}
              </div>

              <div style={{ display: (!(rectifierLoading)) ? undefined : 'none' }}>
                {/* Master Toggle */}
                <div className="flex items-center justify-between">
                  <div>
                    <label className="font-medium text-gray-900 dark:text-white">{t("admin.settings.rectifier.enabled")}</label>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {t("admin.settings.rectifier.enabledHint")}
                    </p>
                  </div>
                  <Toggle modelValue={rectifierForm.enabled} onUpdateModelValue={(v) => __set("rectifierForm.enabled", v)} />
                </div>

                {/* Sub-toggles (only show when master is enabled) */}
                <div style={{ display: (rectifierForm.enabled) ? undefined : 'none' }}
                  className="space-y-4 border-t border-gray-100 pt-4 dark:border-dark-700"
                >
                  {/* Thinking Signature Rectifier */}
                  <div className="flex items-center justify-between">
                    <div>
                      <label
                        className="text-sm font-medium text-gray-700 dark:text-gray-300"
                        >{t("admin.settings.rectifier.thinkingSignature")}</label
                      >
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {t("admin.settings.rectifier.thinkingSignatureHint")}
                      </p>
                    </div>
                    <Toggle
                      modelValue={rectifierForm.thinking_signature_enabled} onUpdateModelValue={(v) => __set("rectifierForm.thinking_signature_enabled", v)}
                    />
                  </div>

                  {/* Thinking Budget Rectifier */}
                  <div className="flex items-center justify-between">
                    <div>
                      <label
                        className="text-sm font-medium text-gray-700 dark:text-gray-300"
                        >{t("admin.settings.rectifier.thinkingBudget")}</label
                      >
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {t("admin.settings.rectifier.thinkingBudgetHint")}
                      </p>
                    </div>
                    <Toggle modelValue={rectifierForm.thinking_budget_enabled} onUpdateModelValue={(v) => __set("rectifierForm.thinking_budget_enabled", v)} />
                  </div>

                  {/* API Key Signature Rectifier */}
                  <div className="flex items-center justify-between">
                    <div>
                      <label
                        className="text-sm font-medium text-gray-700 dark:text-gray-300"
                        >{t("admin.settings.rectifier.apikeySignature")}</label
                      >
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {t("admin.settings.rectifier.apikeySignatureHint")}
                      </p>
                    </div>
                    <Toggle modelValue={rectifierForm.apikey_signature_enabled} onUpdateModelValue={(v) => __set("rectifierForm.apikey_signature_enabled", v)} />
                  </div>

                  {/* Custom Patterns (only when apikey_signature_enabled) */}
                  <div style={{ display: (rectifierForm.apikey_signature_enabled) ? undefined : 'none' }}
                    className="ml-4 space-y-3 border-l-2 border-gray-200 pl-4 dark:border-dark-600"
                  >
                    <div>
                      <label
                        className="text-sm font-medium text-gray-700 dark:text-gray-300"
                        >{t("admin.settings.rectifier.apikeyPatterns")}</label
                      >
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {t("admin.settings.rectifier.apikeyPatternsHint")}
                      </p>
                    </div>
                    {rectifierForm.apikey_signature_patterns.map((_, index) => (<div key={index} className="flex items-center gap-2">
                      <input
                        value={rectifierForm.apikey_signature_patterns[index] ?? ''} onChange={(e) => __set("rectifierForm.apikey_signature_patterns[index]", (e.target as HTMLInputElement).value)}
                        type="text"
                        className="input input-sm flex-1"
                        placeholder={
                          t('admin.settings.rectifier.apikeyPatternPlaceholder')
                        }
                      />
                      <button
                        type="button"
                        onClick={() => { rectifierForm.apikey_signature_patterns.splice(index, 1) }}
                        className="btn btn-ghost btn-xs text-red-500 hover:text-red-700"
                      >
                        <svg
                          className="h-4 w-4"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="2"
                            d="M6 18L18 6M6 6l12 12"
                          />
                        </svg>
                      </button>
                    </div>
                    ))}
                    <button
                      type="button"
                      onClick={(e) => rectifierForm.apikey_signature_patterns.push('')}
                      className="btn btn-ghost btn-xs text-primary-600 dark:text-primary-400"
                    >
                      + {t("admin.settings.rectifier.addPattern")}
                    </button>
                  </div>
                </div>

                {/* Save Button */}
                <div
                  className="flex justify-end border-t border-gray-100 pt-4 dark:border-dark-700"
                >
                  <button
                    type="button"
                    onClick={() => saveRectifierSettings()}
                    disabled={rectifierSaving}
                    className="btn btn-primary btn-sm"
                  >
                    <svg style={{ display: (rectifierSaving) ? undefined : 'none' }}
                      className="mr-1 h-4 w-4 animate-spin"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      ></circle>
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      ></path>
                    </svg>
                    {rectifierSaving ? t("common.saving") : t("common.save")}
                  </button>
                </div>
              </div>
            </div>
          </div>
          {/* Beta Policy Settings */}
          <div className="card">
            <div
              className="border-b border-gray-100 px-6 py-4 dark:border-dark-700"
            >
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                {t("admin.settings.betaPolicy.title")}
              </h2>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                {t("admin.settings.betaPolicy.description")}
              </p>
            </div>
            <div className="space-y-5 p-6">
              {/* Loading State */}
              <div className="flex items-center gap-2 text-gray-500" style={{ display: (betaPolicyLoading) ? undefined : 'none' }}>
                <div
                  className="h-4 w-4 animate-spin rounded-full border-b-2 border-primary-600"
                ></div>
                {t("common.loading")}
              </div>

              <div style={{ display: (!(betaPolicyLoading)) ? undefined : 'none' }}>
                {/* Rule Cards */}
                {betaPolicyForm.rules.map((rule, idx) => (<div className="rounded-lg border border-gray-200 p-4 dark:border-dark-600" key={rule.beta_token}>
                  <div className="mb-3 flex items-center gap-2">
                    <span
                      className="text-sm font-medium text-gray-900 dark:text-white"
                    >
                      {getBetaDisplayName(rule.beta_token)}
                    </span>
                    <span
                      className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-500 dark:bg-dark-700 dark:text-gray-400"
                    >
                      {rule.beta_token}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    {/* Action */}
                    <div>
                      <label
                        className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400"
                      >
                        {t("admin.settings.betaPolicy.action")}
                      </label>
                      <Select
                        modelValue={rule.action}
                        onUpdateModelValue={(v) => { rule.action = v as any }}
                        options={betaPolicyActionOptions}
                      />
                    </div>

                    {/* Scope */}
                    <div>
                      <label
                        className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400"
                      >
                        {t("admin.settings.betaPolicy.scope")}
                      </label>
                      <Select
                        modelValue={rule.scope}
                        onUpdateModelValue={(v) => { rule.scope = v as any }}
                        options={betaPolicyScopeOptions}
                      />
                    </div>
                  </div>

                  {/* Error Message (only when action=block) */}
                  <div style={{ display: (rule.action === 'block') ? undefined : 'none' }} className="mt-3">
                    <label
                      className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400"
                    >
                      {t("admin.settings.betaPolicy.errorMessage")}
                    </label>
                    <input
                      value={rule.error_message ?? ''} onChange={(e) => __set("rule.error_message", (e.target as HTMLInputElement).value)}
                      type="text"
                      className="input"
                      placeholder={
                        t('admin.settings.betaPolicy.errorMessagePlaceholder')
                      }
                    />
                    <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
                      {t("admin.settings.betaPolicy.errorMessageHint")}
                    </p>
                  </div>

                  {/* Quick Presets (only for tokens with presets) */}
                  <div style={{ display: (betaPresets[rule.beta_token]?.length) ? undefined : 'none' }} className="mt-3">
                    <label
                      className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400"
                    >
                      {t("admin.settings.betaPolicy.quickPresets")}
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {betaPresets[rule.beta_token].map((preset) => (<button
                        type="button"
                        className="inline-flex items-center gap-1 rounded-md border border-primary-200 bg-primary-50 px-2.5 py-1 text-xs font-medium text-primary-700 transition-colors hover:bg-primary-100 dark:border-primary-800 dark:bg-primary-900/30 dark:text-primary-300 dark:hover:bg-primary-900/50"
                        key={preset.label} onClick={() => applyBetaPreset(rule, preset)}
                        title={preset.description}
                      >
                        {preset.label}
                      </button>
                      ))}
                    </div>
                  </div>

                  {/* Model Whitelist */}
                  <div className="mt-3">
                    <label
                      className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400"
                    >
                      {t("admin.settings.betaPolicy.modelWhitelist")}
                    </label>
                    <p className="mb-2 text-xs text-gray-400 dark:text-gray-500">
                      {t("admin.settings.betaPolicy.modelWhitelistHint")}
                    </p>
                    {/* Existing patterns */}
                    {(rule.model_whitelist || []).map((_, index) => (<div
                      className="mb-1.5 flex items-center gap-2"
                     key={index}>
                      <input
                        value={rule.model_whitelist![index] ?? ''} onChange={(e) => __set("rule.model_whitelist![index]", (e.target as HTMLInputElement).value)}
                        type="text"
                        className="input input-sm flex-1"
                        placeholder={
                          t('admin.settings.betaPolicy.modelPatternPlaceholder')
                        }
                      />
                      <button
                        type="button"
                        onClick={(e) => rule.model_whitelist!.splice(index, 1)}
                        className="shrink-0 rounded p-1 text-red-400 transition-colors hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20"
                      >
                        <svg
                          className="h-4 w-4"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth="2"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M6 18L18 6M6 6l12 12"
                          />
                        </svg>
                      </button>
                    </div>
                    ))}
                    {/* Add pattern button */}
                    <button
                      type="button"
                      onClick={() => { if (!rule.model_whitelist) rule.model_whitelist = []; rule.model_whitelist.push(''); }}
                      className="mb-2 inline-flex items-center gap-1 text-xs text-primary-600 transition-colors hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300"
                    >
                      <svg
                        className="h-3.5 w-3.5"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M12 4v16m8-8H4"
                        />
                      </svg>
                      {t("admin.settings.betaPolicy.addModelPattern")}
                    </button>
                    {/* Common pattern chips */}
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-xs text-gray-400 dark:text-gray-500"
                        >{t("admin.settings.betaPolicy.commonPatterns")}:</span
                      >
                      {commonModelPatterns.map((pattern) => (<button
                        type="button"
                        className="rounded border border-gray-200 px-2 py-0.5 text-xs text-gray-600 transition-colors hover:border-primary-300 hover:bg-primary-50 hover:text-primary-700 dark:border-dark-600 dark:text-gray-400 dark:hover:border-primary-700 dark:hover:bg-primary-900/30 dark:hover:text-primary-300"
                        key={pattern} onClick={() => addQuickPattern(rule, pattern)}
                      >
                        {pattern}
                      </button>
                      ))}
                    </div>
                  </div>

                  {/* Fallback Action (only when model_whitelist is non-empty) */}
                  <div style={{ display: (
                      rule.model_whitelist && rule.model_whitelist.length > 0
                    ) ? undefined : 'none' }}
                    className="mt-3"
                  >
                    <label
                      className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400"
                    >
                      {t("admin.settings.betaPolicy.fallbackAction")}
                    </label>
                    <Select
                      modelValue={rule.fallback_action || 'pass'}
                      onUpdateModelValue={(v) => { rule.fallback_action = v as any }}
                      options={betaPolicyActionOptions}
                    />
                    <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
                      {t("admin.settings.betaPolicy.fallbackActionHint")}
                    </p>
                    {/* Fallback Error Message (only when fallback_action=block) */}
                    <div style={{ display: (rule.fallback_action === 'block') ? undefined : 'none' }} className="mt-2">
                      <input
                        value={rule.fallback_error_message ?? ''} onChange={(e) => __set("rule.fallback_error_message", (e.target as HTMLInputElement).value)}
                        type="text"
                        className="input"
                        placeholder={
                          t(
                            'admin.settings.betaPolicy.fallbackErrorMessagePlaceholder',
                          )
                        }
                      />
                      <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
                        {t("admin.settings.betaPolicy.errorMessageHint")}
                      </p>
                    </div>
                  </div>
                </div>))}

                {/* Save Button */}
                <div
                  className="flex justify-end border-t border-gray-100 pt-4 dark:border-dark-700"
                >
                  <button
                    type="button"
                    onClick={() => saveBetaPolicySettings()}
                    disabled={betaPolicySaving}
                    className="btn btn-primary btn-sm"
                  >
                    <svg style={{ display: (betaPolicySaving) ? undefined : 'none' }}
                      className="mr-1 h-4 w-4 animate-spin"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      ></circle>
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      ></path>
                    </svg>
                    {betaPolicySaving ? t("common.saving") : t("common.save")}
                  </button>
                </div>
              </div>
            </div>
          </div>
          {/* OpenAI Fast/Flex Policy Settings */}
          <div className="card">
            <div
              className="border-b border-gray-100 px-6 py-4 dark:border-dark-700"
            >
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                {t("admin.settings.openaiFastPolicy.title")}
              </h2>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                {t("admin.settings.openaiFastPolicy.description")}
              </p>
            </div>
            <div className="space-y-5 p-6">
              {/* Empty state */}
              <div className="rounded-lg border border-dashed border-gray-200 p-6 text-center text-sm text-gray-500 dark:border-dark-600 dark:text-gray-400" style={{ display: (openaiFastPolicyForm.rules.length === 0) ? undefined : 'none' }}>
                {t("admin.settings.openaiFastPolicy.empty")}
              </div>

              {/* Rule Cards */}
              {openaiFastPolicyForm.rules.map((rule, ruleIndex) => (<div
                className="rounded-lg border border-gray-200 p-4 dark:border-dark-600"
               key={ruleIndex}>
                <div className="mb-3 flex items-center justify-between">
                  <span
                    className="text-sm font-medium text-gray-900 dark:text-white"
                  >
                    {t("admin.settings.openaiFastPolicy.ruleHeader", {
                        index: ruleIndex + 1,
                      })}
                  </span>
                  <button
                    type="button"
                    onClick={(e) => removeOpenAIFastPolicyRule(ruleIndex)}
                    className="rounded p-1 text-red-400 transition-colors hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20"
                    title={t('admin.settings.openaiFastPolicy.removeRule')}
                  >
                    <svg
                      className="h-4 w-4"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M6 18L18 6M6 6l12 12"
                      />
                    </svg>
                  </button>
                </div>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                  {/* Service Tier */}
                  <div>
                    <label
                      className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400"
                    >
                      {t("admin.settings.openaiFastPolicy.serviceTier")}
                    </label>
                    <Select
                      modelValue={rule.service_tier}
                      onUpdateModelValue={(v) => { rule.service_tier = v as
                          | 'all'
                          | 'priority'
                          | 'flex' }}
                      options={openaiFastPolicyTierOptions}
                    />
                  </div>

                  {/* Action */}
                  <div>
                    <label
                      className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400"
                    >
                      {t("admin.settings.openaiFastPolicy.action")}
                    </label>
                    <Select
                      modelValue={rule.action}
                      onUpdateModelValue={(v) => { rule.action = v as 'pass' | 'filter' | 'block' }}
                      options={openaiFastPolicyActionOptions}
                    />
                  </div>

                  {/* Scope */}
                  <div>
                    <label
                      className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400"
                    >
                      {t("admin.settings.openaiFastPolicy.scope")}
                    </label>
                    <Select
                      modelValue={rule.scope}
                      onUpdateModelValue={(v) => { rule.scope = v as
                          | 'all'
                          | 'oauth'
                          | 'apikey'
                          | 'bedrock' }}
                      options={openaiFastPolicyScopeOptions}
                    />
                  </div>
                </div>

                {/* Error Message (only when action=block) */}
                <div className="mt-3" style={{ display: (rule.action === 'block') ? undefined : 'none' }}>
                  <label
                    className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400"
                  >
                    {t("admin.settings.openaiFastPolicy.errorMessage")}
                  </label>
                  <input
                    value={rule.error_message ?? ''} onChange={(e) => __set("rule.error_message", (e.target as HTMLInputElement).value)}
                    type="text"
                    className="input"
                    placeholder={
                      t(
                        'admin.settings.openaiFastPolicy.errorMessagePlaceholder',
                      )
                    }
                  />
                  <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
                    {t("admin.settings.openaiFastPolicy.errorMessageHint")}
                  </p>
                </div>

                {/* Model Whitelist */}
                <div className="mt-3">
                  <label
                    className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400"
                  >
                    {t("admin.settings.openaiFastPolicy.modelWhitelist")}
                  </label>
                  <p className="mb-2 text-xs text-gray-400 dark:text-gray-500">
                    {t("admin.settings.openaiFastPolicy.modelWhitelistHint")}
                  </p>
                  {(rule.model_whitelist || []).map((_, patternIdx) => (<div
                    className="mb-1.5 flex items-center gap-2"
                   key={patternIdx}>
                    <input
                      value={rule.model_whitelist![patternIdx] ?? ''} onChange={(e) => __set("rule.model_whitelist![patternIdx]", (e.target as HTMLInputElement).value)}
                      type="text"
                      className="input input-sm flex-1"
                      placeholder={
                        t(
                          'admin.settings.openaiFastPolicy.modelPatternPlaceholder',
                        )
                      }
                    />
                    <button
                      type="button"
                      onClick={() => removeOpenAIFastPolicyModelPattern(rule, patternIdx)}
                      className="shrink-0 rounded p-1 text-red-400 transition-colors hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20"
                    >
                      <svg
                        className="h-4 w-4"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M6 18L18 6M6 6l12 12"
                        />
                      </svg>
                    </button>
                  </div>))}
                  <button
                    type="button"
                    onClick={(e) => addOpenAIFastPolicyModelPattern(rule)}
                    className="mb-2 inline-flex items-center gap-1 text-xs text-primary-600 transition-colors hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300"
                  >
                    <svg
                      className="h-3.5 w-3.5"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M12 4v16m8-8H4"
                      />
                    </svg>
                    {t("admin.settings.openaiFastPolicy.addModelPattern")}
                  </button>
                </div>

                {/* Fallback Action (only when model_whitelist is non-empty) */}
                <div className="mt-3" style={{ display: (
                    rule.model_whitelist && rule.model_whitelist.length > 0
                  ) ? undefined : 'none' }}>
                  <label
                    className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400"
                  >
                    {t("admin.settings.openaiFastPolicy.fallbackAction")}
                  </label>
                  <Select
                    modelValue={rule.fallback_action || 'pass'}
                    onUpdateModelValue={(v) => { rule.fallback_action = v as 'pass' | 'filter' | 'block' }}
                    options={openaiFastPolicyActionOptions}
                  />
                  <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
                    {t("admin.settings.openaiFastPolicy.fallbackActionHint")}
                  </p>
                  <div className="mt-2" style={{ display: (rule.fallback_action === 'block') ? undefined : 'none' }}>
                    <input
                      value={rule.fallback_error_message ?? ''} onChange={(e) => __set("rule.fallback_error_message", (e.target as HTMLInputElement).value)}
                      type="text"
                      className="input"
                      placeholder={
                        t(
                          'admin.settings.openaiFastPolicy.fallbackErrorMessagePlaceholder',
                        )
                      }
                    />
                  </div>
                </div>
              </div>))}

              {/* Add Rule Button */}
              <div>
                <button
                  type="button"
                  onClick={() => addOpenAIFastPolicyRule()}
                  className="btn btn-secondary btn-sm inline-flex items-center gap-1"
                >
                  <svg
                    className="h-4 w-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M12 4v16m8-8H4"
                    />
                  </svg>
                  {t("admin.settings.openaiFastPolicy.addRule")}
                </button>
                <p className="mt-2 text-xs text-gray-400 dark:text-gray-500">
                  {t("admin.settings.openaiFastPolicy.saveHint")}
                </p>
              </div>
            </div>
          </div>
        </div>
        {/* /Tab: Gateway */}

        {/* Tab: Security — Registration, Turnstile, LinuxDo */}
        <div style={{ display: (activeTab === 'security') ? undefined : 'none' }} className="space-y-6">
          {/* Registration Settings */}
          <div className="card">
            <div
              className="border-b border-gray-100 px-6 py-4 dark:border-dark-700"
            >
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                {t("admin.settings.registration.title")}
              </h2>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                {t("admin.settings.registration.description")}
              </p>
            </div>
            <div className="space-y-5 p-6">
              {/* Enable Registration */}
              <div className="flex items-center justify-between">
                <div>
                  <label className="font-medium text-gray-900 dark:text-white">{t("admin.settings.registration.enableRegistration")}</label>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {t("admin.settings.registration.enableRegistrationHint")}
                  </p>
                </div>
                <Toggle modelValue={form.registration_enabled} onUpdateModelValue={(v) => __set("form.registration_enabled", v)} />
              </div>

              {/* Email Verification */}
              <div
                className="flex items-center justify-between border-t border-gray-100 pt-4 dark:border-dark-700"
              >
                <div>
                  <label className="font-medium text-gray-900 dark:text-white">{t("admin.settings.registration.emailVerification")}</label>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {t("admin.settings.registration.emailVerificationHint")}
                  </p>
                </div>
                <Toggle modelValue={form.email_verify_enabled} onUpdateModelValue={(v) => __set("form.email_verify_enabled", v)} />
              </div>

              {/* Email Suffix Whitelist */}
              <div className="border-t border-gray-100 pt-4 dark:border-dark-700">
                <label className="font-medium text-gray-900 dark:text-white">{t("admin.settings.registration.emailSuffixWhitelist")}</label>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  {t("admin.settings.registration.emailSuffixWhitelistHint")}
                </p>
                <div
                  className="mt-3 rounded-lg border border-gray-300 bg-white p-2 dark:border-dark-500 dark:bg-dark-700"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    {registrationEmailSuffixWhitelistTags.map((suffix, idx) => (<span className="inline-flex items-center gap-1 rounded bg-gray-100 px-2 py-1 text-xs font-mono text-gray-700 dark:bg-dark-600 dark:text-gray-200" key={suffix}>
                      <span>{suffix}</span>
                      <button
                        type="button"
                        className="rounded-full text-gray-500 hover:bg-gray-200 hover:text-gray-700 dark:text-gray-300 dark:hover:bg-dark-500 dark:hover:text-white"
                        onClick={(e) => 
                          removeRegistrationEmailSuffixWhitelistTag(suffix)
                        }
                      >
                        <Icon
                          name="x"
                          size="xs"
                          className="h-3.5 w-3.5"
                          strokeWidth={2}
                        />
                      </button>
                    </span>))}

                    <div
                      className="flex min-w-[220px] flex-1 items-center gap-1 rounded border border-transparent px-2 py-1 focus-within:border-primary-300 dark:focus-within:border-primary-700"
                    >
                      <input
                        value={registrationEmailSuffixWhitelistDraft ?? ''} onChange={(e) => __set("registrationEmailSuffixWhitelistDraft", (e.target as HTMLInputElement).value)}
                        type="text"
                        className="w-full bg-transparent text-sm font-mono text-gray-900 outline-none placeholder:text-gray-400 dark:text-white dark:placeholder:text-gray-500"
                        placeholder={
                          t(
                            'admin.settings.registration.emailSuffixWhitelistPlaceholder',
                          )
                        }
                        onInput={() => handleRegistrationEmailSuffixWhitelistDraftInput()}
                        onKeyDown={(e) => handleRegistrationEmailSuffixWhitelistDraftKeydown(e)}
                        onBlur={() => commitRegistrationEmailSuffixWhitelistDraft()}
                        onPaste={(e) => handleRegistrationEmailSuffixWhitelistPaste(e)}
                      />
                    </div>
                  </div>
                </div>
                <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                  {t(
                      "admin.settings.registration.emailSuffixWhitelistInputHint",
                    )}
                </p>
              </div>

              {/* Promo Code */}
              <div
                className="flex items-center justify-between border-t border-gray-100 pt-4 dark:border-dark-700"
              >
                <div>
                  <label className="font-medium text-gray-900 dark:text-white">{t("admin.settings.registration.promoCode")}</label>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {t("admin.settings.registration.promoCodeHint")}
                  </p>
                </div>
                <Toggle modelValue={form.promo_code_enabled} onUpdateModelValue={(v) => __set("form.promo_code_enabled", v)} />
              </div>

              {/* Invitation Code */}
              <div
                className="flex items-center justify-between border-t border-gray-100 pt-4 dark:border-dark-700"
              >
                <div>
                  <label className="font-medium text-gray-900 dark:text-white">{t("admin.settings.registration.invitationCode")}</label>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {t("admin.settings.registration.invitationCodeHint")}
                  </p>
                </div>
                <Toggle modelValue={form.invitation_code_enabled} onUpdateModelValue={(v) => __set("form.invitation_code_enabled", v)} />
              </div>
              {/* Password Reset - Only show when email verification is enabled */}
              <div className="flex items-center justify-between border-t border-gray-100 pt-4 dark:border-dark-700" style={{ display: (form.email_verify_enabled) ? undefined : 'none' }}>
                <div>
                  <label className="font-medium text-gray-900 dark:text-white">{t("admin.settings.registration.passwordReset")}</label>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {t("admin.settings.registration.passwordResetHint")}
                  </p>
                </div>
                <Toggle modelValue={form.password_reset_enabled} onUpdateModelValue={(v) => __set("form.password_reset_enabled", v)} />
              </div>
              {/* Frontend URL - Only show when password reset is enabled */}
              <div className="border-t border-gray-100 pt-4 dark:border-dark-700" style={{ display: (form.email_verify_enabled && form.password_reset_enabled) ? undefined : 'none' }}>
                <label
                  className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300"
                >
                  {t("admin.settings.registration.frontendUrl")}
                </label>
                <input
                  value={form.frontend_url ?? ''} onChange={(e) => __set("form.frontend_url", (e.target as HTMLInputElement).value)}
                  type="url"
                  className="input"
                  placeholder={
                    t('admin.settings.registration.frontendUrlPlaceholder')
                  }
                />
                <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
                  {t("admin.settings.registration.frontendUrlHint")}
                </p>
              </div>

              {/* TOTP 2FA */}
              <div
                className="flex items-center justify-between border-t border-gray-100 pt-4 dark:border-dark-700"
              >
                <div>
                  <label className="font-medium text-gray-900 dark:text-white">{t("admin.settings.registration.totp")}</label>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {t("admin.settings.registration.totpHint")}
                  </p>
                  {/* Warning when encryption key not configured */}
                  <p className="mt-2 text-sm text-amber-600 dark:text-amber-400" style={{ display: (!form.totp_encryption_key_configured) ? undefined : 'none' }}>
                    {t("admin.settings.registration.totpKeyNotConfigured")}
                  </p>
                </div>
                <div className={!form.totp_encryption_key_configured ? 'pointer-events-none opacity-50' : undefined}>
                <Toggle
                  modelValue={form.totp_enabled} onUpdateModelValue={(v) => __set("form.totp_enabled", v)}
                />
                </div>
              </div>
            </div>
          </div>

          {/* API Key IP ACL Settings */}
          <div className="card">
            <div
              className="border-b border-gray-100 px-6 py-4 dark:border-dark-700"
            >
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                {t("admin.settings.apiKeyAcl.title")}
              </h2>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                {t("admin.settings.apiKeyAcl.description")}
              </p>
            </div>
            <div className="space-y-5 p-6">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <label className="font-medium text-gray-900 dark:text-white">
                    {t("admin.settings.apiKeyAcl.trustForwardedIp")}
                  </label>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {t("admin.settings.apiKeyAcl.trustForwardedIpHint")}
                  </p>
                </div>
                <Toggle modelValue={form.api_key_acl_trust_forwarded_ip} onUpdateModelValue={(v) => __set("form.api_key_acl_trust_forwarded_ip", v)} />
              </div>
            </div>
          </div>

          {/* Cloudflare Turnstile Settings */}
          <div className="card">
            <div
              className="border-b border-gray-100 px-6 py-4 dark:border-dark-700"
            >
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                {t("admin.settings.turnstile.title")}
              </h2>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                {t("admin.settings.turnstile.description")}
              </p>
            </div>
            <div className="space-y-5 p-6">
              {/* Enable Turnstile */}
              <div className="flex items-center justify-between">
                <div>
                  <label className="font-medium text-gray-900 dark:text-white">{t("admin.settings.turnstile.enableTurnstile")}</label>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {t("admin.settings.turnstile.enableTurnstileHint")}
                  </p>
                </div>
                <Toggle modelValue={form.turnstile_enabled} onUpdateModelValue={(v) => __set("form.turnstile_enabled", v)} />
              </div>

              {/* Turnstile Keys - Only show when enabled */}
              <div className="border-t border-gray-100 pt-4 dark:border-dark-700" style={{ display: (form.turnstile_enabled) ? undefined : 'none' }}>
                <div className="grid grid-cols-1 gap-6">
                  <div>
                    <label
                      className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300"
                    >
                      {t("admin.settings.turnstile.siteKey")}
                    </label>
                    <input
                      value={form.turnstile_site_key ?? ''} onChange={(e) => __set("form.turnstile_site_key", (e.target as HTMLInputElement).value)}
                      type="text"
                      className="input font-mono text-sm"
                      placeholder="0x4AAAAAAA..."
                    />
                    <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
                      {t("admin.settings.turnstile.siteKeyHint")}
                      <a
                        href="https://dash.cloudflare.com/"
                        target="_blank"
                        className="text-primary-600 hover:text-primary-500"
                        >{t("admin.settings.turnstile.cloudflareDashboard")}</a
                      >
                    </p>
                  </div>
                  <div>
                    <label
                      className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300"
                    >
                      {t("admin.settings.turnstile.secretKey")}
                    </label>
                    <input
                      value={form.turnstile_secret_key ?? ''} onChange={(e) => __set("form.turnstile_secret_key", (e.target as HTMLInputElement).value)}
                      type="password"
                      className="input font-mono text-sm"
                      placeholder="0x4AAAAAAA..."
                    />
                    <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
                      {form.turnstile_secret_key_configured
                          ? t(
                              "admin.settings.turnstile.secretKeyConfiguredHint",
                            )
                          : t("admin.settings.turnstile.secretKeyHint")}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* LinuxDo Connect OAuth 登录 */}
          <div className="card">
            <div
              className="border-b border-gray-100 px-6 py-4 dark:border-dark-700"
            >
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                {t("admin.settings.linuxdo.title")}
              </h2>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                {t("admin.settings.linuxdo.description")}
              </p>
            </div>
            <div className="space-y-5 p-6">
              <div className="flex items-center justify-between">
                <div>
                  <label className="font-medium text-gray-900 dark:text-white">{t("admin.settings.linuxdo.enable")}</label>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {t("admin.settings.linuxdo.enableHint")}
                  </p>
                </div>
                <Toggle modelValue={form.linuxdo_connect_enabled} onUpdateModelValue={(v) => __set("form.linuxdo_connect_enabled", v)} />
              </div>

              <div className="border-t border-gray-100 pt-4 dark:border-dark-700" style={{ display: (form.linuxdo_connect_enabled) ? undefined : 'none' }}>
                <div className="grid grid-cols-1 gap-6">
                  <div>
                    <label
                      className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300"
                    >
                      {t("admin.settings.linuxdo.clientId")}
                    </label>
                    <input
                      value={form.linuxdo_connect_client_id ?? ''} onChange={(e) => __set("form.linuxdo_connect_client_id", (e.target as HTMLInputElement).value)}
                      type="text"
                      className="input font-mono text-sm"
                      placeholder={
                        t('admin.settings.linuxdo.clientIdPlaceholder')
                      }
                    />
                    <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
                      {t("admin.settings.linuxdo.clientIdHint")}
                    </p>
                  </div>

                  <div>
                    <label
                      className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300"
                    >
                      {t("admin.settings.linuxdo.clientSecret")}
                    </label>
                    <input
                      value={form.linuxdo_connect_client_secret ?? ''} onChange={(e) => __set("form.linuxdo_connect_client_secret", (e.target as HTMLInputElement).value)}
                      type="password"
                      className="input font-mono text-sm"
                      placeholder={
                        form.linuxdo_connect_client_secret_configured
                          ? t(
                              'admin.settings.linuxdo.clientSecretConfiguredPlaceholder',
                            )
                          : t('admin.settings.linuxdo.clientSecretPlaceholder')
                      }
                    />
                    <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
                      {form.linuxdo_connect_client_secret_configured
                          ? t(
                              "admin.settings.linuxdo.clientSecretConfiguredHint",
                            )
                          : t("admin.settings.linuxdo.clientSecretHint")}
                    </p>
                  </div>

                  <div>
                    <label
                      className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300"
                    >
                      {t("admin.settings.linuxdo.redirectUrl")}
                    </label>
                    <input
                      value={form.linuxdo_connect_redirect_url ?? ''} onChange={(e) => __set("form.linuxdo_connect_redirect_url", (e.target as HTMLInputElement).value)}
                      type="url"
                      className="input font-mono text-sm"
                      placeholder={
                        t('admin.settings.linuxdo.redirectUrlPlaceholder')
                      }
                    />
                    <div
                      className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3"
                    >
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm w-fit"
                        onClick={() => setAndCopyLinuxdoRedirectUrl()}
                      >
                        {t("admin.settings.linuxdo.quickSetCopy")}
                      </button>
                      <code className="select-all break-all rounded bg-gray-50 px-2 py-1 font-mono text-xs text-gray-600 dark:bg-dark-800 dark:text-gray-300" style={{ display: (linuxdoRedirectUrlSuggestion) ? undefined : 'none' }}>
                        {linuxdoRedirectUrlSuggestion}
                      </code>
                    </div>
                    <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
                      {t("admin.settings.linuxdo.redirectUrlHint")}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* GitHub / Google 邮箱快捷登录 */}
          <div className="card">
            <div
              className="border-b border-gray-100 px-6 py-4 dark:border-dark-700"
            >
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                {localText("邮箱快捷登录", "Email OAuth Sign-in")}
              </h2>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                {localText(
                    "开启 GitHub 或 Google 邮箱授权登录后，系统会读取已验证邮箱，存在则直接登录，不存在则自动注册。",
                    "After GitHub or Google email OAuth is enabled, the system reads a verified email, signs in matching users, and auto-registers missing users.",
                  )}
              </p>
            </div>
            <div className="space-y-6 p-6">
              <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
                <div className="rounded-lg border border-gray-200 p-4 dark:border-dark-700">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h3 className="font-medium text-gray-900 dark:text-white">
                        GitHub
                      </h3>
                      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                        {localText(
                            "GitHub OAuth App 需要 read:user user:email 权限，回调地址填写下方后端地址。",
                            "GitHub OAuth App needs read:user user:email scopes. Use the backend callback URL below.",
                          )}
                      </p>
                    </div>
                    <Toggle modelValue={form.github_oauth_enabled} onUpdateModelValue={(v) => __set("form.github_oauth_enabled", v)} />
                  </div>

                  <div className="mt-4 space-y-4" style={{ display: (form.github_oauth_enabled) ? undefined : 'none' }}>
                    <div className="rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-600 dark:bg-dark-800 dark:text-gray-300">
                      <div style={{ display: (isZhLocale) ? undefined : 'none' }}>
                        开通引导：GitHub Settings → Developer settings →
                        <a
                          data-testid="github-oauth-apps-guide-link"
                          href="https://github.com/settings/developers"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-medium text-primary-600 hover:underline dark:text-primary-400"
                        >OAuth Apps</a>
                        → New OAuth App；Homepage URL 填站点域名，Authorization callback URL 填下面的后端回调地址。
                      </div>
                      <div style={{ display: (!(openaiFastPolicyForm.rules.length === 0)) ? undefined : 'none' }}>
                        Setup guide: GitHub Settings → Developer settings →
                        <a
                          data-testid="github-oauth-apps-guide-link"
                          href="https://github.com/settings/developers"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-medium text-primary-600 hover:underline dark:text-primary-400"
                        >OAuth Apps</a>
                        → New OAuth App. Use your site origin as Homepage URL and the backend callback URL below as Authorization callback URL.
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                      <div>
                        <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">Client ID</label>
                        <input
                          value={form.github_oauth_client_id ?? ''} onChange={(e) => __set("form.github_oauth_client_id", (e.target as HTMLInputElement).value)}
                          type="text"
                          className="input font-mono text-sm"
                          placeholder="GitHub OAuth Client ID"
                        />
                      </div>
                      <div>
                        <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">Client Secret</label>
                        <input
                          value={form.github_oauth_client_secret ?? ''} onChange={(e) => __set("form.github_oauth_client_secret", (e.target as HTMLInputElement).value)}
                          type="password"
                          className="input font-mono text-sm"
                          placeholder={
                            form.github_oauth_client_secret_configured
                              ? localText('密钥已配置，留空以保留当前值。', 'Secret configured. Leave empty to keep the current value.')
                              : 'GitHub OAuth Client Secret'
                          }
                        />
                      </div>
                    </div>

                    <div>
                      <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                        {localText("后端回调地址", "Backend Callback URL")}
                      </label>
                      <input
                        value={form.github_oauth_redirect_url ?? ''} onChange={(e) => __set("form.github_oauth_redirect_url", (e.target as HTMLInputElement).value)}
                        type="url"
                        className="input font-mono text-sm"
                        placeholder="https://your-domain.com/api/v1/auth/oauth/github/callback"
                      />
                      <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm w-fit"
                          onClick={(e) => setAndCopyEmailOAuthRedirectUrl('github')}
                        >
                          {localText("生成并复制", "Generate and copy")}
                        </button>
                        <code className="select-all break-all rounded bg-gray-50 px-2 py-1 font-mono text-xs text-gray-600 dark:bg-dark-800 dark:text-gray-300" style={{ display: (githubOAuthRedirectUrlSuggestion) ? undefined : 'none' }}>
                          {githubOAuthRedirectUrlSuggestion}
                        </code>
                      </div>
                    </div>

                    <div>
                      <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                        {localText("前端回跳地址", "Frontend Callback URL")}
                      </label>
                      <input
                        value={form.github_oauth_frontend_redirect_url ?? ''} onChange={(e) => __set("form.github_oauth_frontend_redirect_url", (e.target as HTMLInputElement).value)}
                        type="text"
                        className="input font-mono text-sm"
                        placeholder="/auth/oauth/callback"
                      />
                    </div>
                  </div>
                </div>

                <div className="rounded-lg border border-gray-200 p-4 dark:border-dark-700">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h3 className="font-medium text-gray-900 dark:text-white">
                        Google
                      </h3>
                      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                        {localText(
                            "Google OAuth 客户端需要 openid email profile 范围，并在凭据里登记后端回调地址。",
                            "Google OAuth client needs openid email profile scopes and the backend callback URL registered in credentials.",
                          )}
                      </p>
                    </div>
                    <Toggle modelValue={form.google_oauth_enabled} onUpdateModelValue={(v) => __set("form.google_oauth_enabled", v)} />
                  </div>

                  <div className="mt-4 space-y-4" style={{ display: (form.google_oauth_enabled) ? undefined : 'none' }}>
                    <div className="rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-600 dark:bg-dark-800 dark:text-gray-300">
                      {localText(
                          "开通引导：Google Cloud Console → APIs & Services → OAuth consent screen 完成同意屏幕；Credentials → Create Credentials → OAuth client ID，类型选择 Web application，并把下面地址加入 Authorized redirect URIs。",
                          "Setup guide: Google Cloud Console → APIs & Services → OAuth consent screen, then Credentials → Create Credentials → OAuth client ID, choose Web application, and add the URL below to Authorized redirect URIs.",
                        )}
                    </div>

                    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                      <div>
                        <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">Client ID</label>
                        <input
                          value={form.google_oauth_client_id ?? ''} onChange={(e) => __set("form.google_oauth_client_id", (e.target as HTMLInputElement).value)}
                          type="text"
                          className="input font-mono text-sm"
                          placeholder="Google OAuth Client ID"
                        />
                      </div>
                      <div>
                        <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">Client Secret</label>
                        <input
                          value={form.google_oauth_client_secret ?? ''} onChange={(e) => __set("form.google_oauth_client_secret", (e.target as HTMLInputElement).value)}
                          type="password"
                          className="input font-mono text-sm"
                          placeholder={
                            form.google_oauth_client_secret_configured
                              ? localText('密钥已配置，留空以保留当前值。', 'Secret configured. Leave empty to keep the current value.')
                              : 'Google OAuth Client Secret'
                          }
                        />
                      </div>
                    </div>

                    <div>
                      <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                        {localText("后端回调地址", "Backend Callback URL")}
                      </label>
                      <input
                        value={form.google_oauth_redirect_url ?? ''} onChange={(e) => __set("form.google_oauth_redirect_url", (e.target as HTMLInputElement).value)}
                        type="url"
                        className="input font-mono text-sm"
                        placeholder="https://your-domain.com/api/v1/auth/oauth/google/callback"
                      />
                      <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm w-fit"
                          onClick={(e) => setAndCopyEmailOAuthRedirectUrl('google')}
                        >
                          {localText("生成并复制", "Generate and copy")}
                        </button>
                        <code className="select-all break-all rounded bg-gray-50 px-2 py-1 font-mono text-xs text-gray-600 dark:bg-dark-800 dark:text-gray-300" style={{ display: (googleOAuthRedirectUrlSuggestion) ? undefined : 'none' }}>
                          {googleOAuthRedirectUrlSuggestion}
                        </code>
                      </div>
                    </div>

                    <div>
                      <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                        {localText("前端回跳地址", "Frontend Callback URL")}
                      </label>
                      <input
                        value={form.google_oauth_frontend_redirect_url ?? ''} onChange={(e) => __set("form.google_oauth_frontend_redirect_url", (e.target as HTMLInputElement).value)}
                        type="text"
                        className="input font-mono text-sm"
                        placeholder="/auth/oauth/callback"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* WeChat Connect OAuth 登录 */}
          <div className="card">
            <div
              className="border-b border-gray-100 px-6 py-4 dark:border-dark-700"
            >
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                {t("admin.settings.wechatConnect.title")}
              </h2>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                {t("admin.settings.wechatConnect.description")}
              </p>
            </div>
            <div className="space-y-5 p-6">
              <div className="flex items-center justify-between">
                <div>
                  <label className="font-medium text-gray-900 dark:text-white">{t("admin.settings.wechatConnect.enabledLabel")}</label>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {t("admin.settings.wechatConnect.enabledHint")}
                  </p>
                </div>
                <Toggle
                  modelValue={form.wechat_connect_enabled} onUpdateModelValue={(v) => __set("form.wechat_connect_enabled", v)}
                  data-testid="wechat-connect-enabled"
                />
              </div>

              <div className="space-y-6 border-t border-gray-100 pt-4 dark:border-dark-700" style={{ display: (form.wechat_connect_enabled) ? undefined : 'none' }}>
                <div className="space-y-4">
                  <div
                    className="rounded-lg border border-gray-200 p-4 dark:border-dark-700"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <h3 className="font-medium text-gray-900 dark:text-white">
                          {localText("PC 应用", "PC App")}
                        </h3>
                        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                          {localText(
                              "桌面浏览器通过微信开放平台扫码登录。可与公众号或移动应用同时存在。",
                              "Desktop browsers sign in through WeChat Open Platform QR login. This can coexist with Official Account or Mobile App.",
                            )}
                        </p>
                      </div>
                      <Toggle
                        modelValue={form.wechat_connect_open_enabled}
                        data-testid="wechat-connect-open-enabled"
                        onUpdateModelValue={(v) => { handleWeChatOpenEnabledChange }}
                      />
                    </div>
                    <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2" style={{ display: (form.wechat_connect_open_enabled) ? undefined : 'none' }}>
                      <div>
                        <label
                          className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300"
                        >
                          {localText("PC AppID", "PC App ID")}
                        </label>
                        <input
                          value={form.wechat_connect_open_app_id ?? ''} onChange={(e) => __set("form.wechat_connect_open_app_id", (e.target as HTMLInputElement).value)}
                          data-testid="wechat-connect-open-app-id"
                          type="text"
                          className="input font-mono text-sm"
                          placeholder={
                            localText(
                              '微信开放平台 PC 应用 AppID',
                              'WeChat Open Platform PC App ID',
                            )
                          }
                        />
                      </div>
                      <div>
                        <label
                          className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300"
                        >
                          {localText("PC AppSecret", "PC App Secret")}
                        </label>
                        <input
                          value={form.wechat_connect_open_app_secret ?? ''} onChange={(e) => __set("form.wechat_connect_open_app_secret", (e.target as HTMLInputElement).value)}
                          data-testid="wechat-connect-open-app-secret"
                          type="password"
                          className="input font-mono text-sm"
                          placeholder={
                            form.wechat_connect_open_app_secret_configured
                              ? localText(
                                  '密钥已配置，留空以保留当前值。',
                                  'Secret configured. Leave empty to keep the current value.',
                                )
                              : localText(
                                  '微信开放平台 PC 应用 AppSecret',
                                  'WeChat Open Platform PC App Secret',
                                )
                          }
                        />
                      </div>
                    </div>
                  </div>

                  <div
                    className="rounded-lg border border-gray-200 p-4 dark:border-dark-700"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <h3 className="font-medium text-gray-900 dark:text-white">
                          {localText("公众号", "Official Account")}
                        </h3>
                        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                          {localText(
                              "仅在微信内浏览器可用；非微信环境下会显示不可用。",
                              "Only available inside the WeChat browser. It is shown as unavailable outside WeChat.",
                            )}
                        </p>
                      </div>
                      <Toggle
                        modelValue={form.wechat_connect_mp_enabled}
                        data-testid="wechat-connect-mp-enabled"
                        onUpdateModelValue={(v) => { handleWeChatMPEnabledChange }}
                      />
                    </div>
                    <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2" style={{ display: (form.wechat_connect_mp_enabled) ? undefined : 'none' }}>
                      <div>
                        <label
                          className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300"
                        >
                          {localText("公众号 AppID", "Official Account App ID")}
                        </label>
                        <input
                          value={form.wechat_connect_mp_app_id ?? ''} onChange={(e) => __set("form.wechat_connect_mp_app_id", (e.target as HTMLInputElement).value)}
                          data-testid="wechat-connect-mp-app-id"
                          type="text"
                          className="input font-mono text-sm"
                          placeholder={
                            localText(
                              '公众号 AppID',
                              'Official Account App ID',
                            )
                          }
                        />
                      </div>
                      <div>
                        <label
                          className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300"
                        >
                          {localText(
                              "公众号 AppSecret",
                              "Official Account App Secret",
                            )}
                        </label>
                        <input
                          value={form.wechat_connect_mp_app_secret ?? ''} onChange={(e) => __set("form.wechat_connect_mp_app_secret", (e.target as HTMLInputElement).value)}
                          data-testid="wechat-connect-mp-app-secret"
                          type="password"
                          className="input font-mono text-sm"
                          placeholder={
                            form.wechat_connect_mp_app_secret_configured
                              ? localText(
                                  '密钥已配置，留空以保留当前值。',
                                  'Secret configured. Leave empty to keep the current value.',
                                )
                              : localText(
                                  '公众号 AppSecret',
                                  'Official Account App Secret',
                                )
                          }
                        />
                      </div>
                    </div>
                  </div>

                  <div
                    className="rounded-lg border border-gray-200 p-4 dark:border-dark-700"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <h3 className="font-medium text-gray-900 dark:text-white">
                          {localText("移动应用", "Mobile App")}
                        </h3>
                        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                          {localText(
                              "原生移动端通过微信 SDK 唤起授权，网页端不会直接发起该流程。",
                              "Native mobile clients start authorization through the WeChat SDK. The web UI does not launch this flow directly.",
                            )}
                        </p>
                      </div>
                      <Toggle
                        modelValue={form.wechat_connect_mobile_enabled}
                        data-testid="wechat-connect-mobile-enabled"
                        onUpdateModelValue={(v) => { handleWeChatMobileEnabledChange }}
                      />
                    </div>
                    <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2" style={{ display: (form.wechat_connect_mobile_enabled) ? undefined : 'none' }}>
                      <div>
                        <label
                          className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300"
                        >
                          {localText("移动应用 AppID", "Mobile App ID")}
                        </label>
                        <input
                          value={form.wechat_connect_mobile_app_id ?? ''} onChange={(e) => __set("form.wechat_connect_mobile_app_id", (e.target as HTMLInputElement).value)}
                          data-testid="wechat-connect-mobile-app-id"
                          type="text"
                          className="input font-mono text-sm"
                          placeholder={
                            localText(
                              '移动应用 AppID',
                              'Mobile App ID',
                            )
                          }
                        />
                      </div>
                      <div>
                        <label
                          className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300"
                        >
                          {localText("移动应用 AppSecret", "Mobile App Secret")}
                        </label>
                        <input
                          value={form.wechat_connect_mobile_app_secret ?? ''} onChange={(e) => __set("form.wechat_connect_mobile_app_secret", (e.target as HTMLInputElement).value)}
                          data-testid="wechat-connect-mobile-app-secret"
                          type="password"
                          className="input font-mono text-sm"
                          placeholder={
                            form.wechat_connect_mobile_app_secret_configured
                              ? localText(
                                  '密钥已配置，留空以保留当前值。',
                                  'Secret configured. Leave empty to keep the current value.',
                                )
                              : localText(
                                  '移动应用 AppSecret',
                                  'Mobile App Secret',
                                )
                          }
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700 dark:border-amber-900/40 dark:bg-amber-900/10 dark:text-amber-300" style={{ display: (
                    form.wechat_connect_open_enabled &&
                    (form.wechat_connect_mp_enabled ||
                      form.wechat_connect_mobile_enabled)
                  ) ? undefined : 'none' }}>
                  {localText(
                      "如果同时启用 PC 应用和公众号/移动应用，这些应用需要挂在同一个微信开放平台主体下，否则 UnionID 无法稳定归并账号。",
                      "When PC App is enabled together with Official Account or Mobile App, they should belong to the same WeChat Open Platform account so UnionID can merge identities reliably.",
                    )}
                </div>

                <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                  <div>
                    <label
                      className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300"
                    >
                      {localText(
                          "浏览器回调地址",
                          "Browser Redirect URL",
                        )}
                    </label>
                    <input
                      data-testid="wechat-connect-redirect-url"
                      value={form.wechat_connect_redirect_url ?? ''} onChange={(e) => __set("form.wechat_connect_redirect_url", (e.target as HTMLInputElement).value)}
                      type="url"
                      className="input font-mono text-sm"
                      placeholder={t('admin.settings.wechatConnect.redirectUrlPlaceholder')}
                    />
                    <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
                      {localText(
                          "用于 PC 应用和公众号的网页回调。移动应用走原生 SDK 时不直接使用这个浏览器回调。",
                          "Used by PC App and Official Account browser callbacks. Native mobile SDK flows do not start from this browser callback directly.",
                        )}
                    </p>
                    <div
                      className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3"
                    >
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm w-fit"
                        onClick={() => setAndCopyWeChatRedirectUrl()}
                      >
                        {t("admin.settings.wechatConnect.generateAndCopy")}
                      </button>
                      <code className="select-all break-all rounded bg-gray-50 px-2 py-1 font-mono text-xs text-gray-600 dark:bg-dark-800 dark:text-gray-300" style={{ display: (wechatRedirectUrlSuggestion) ? undefined : 'none' }}>
                        {wechatRedirectUrlSuggestion}
                      </code>
                    </div>
                  </div>
                </div>

                <div>
                  <label
                    className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300"
                  >
                    {t("admin.settings.wechatConnect.frontendRedirectUrlLabel")}
                  </label>
                  <input
                    data-testid="wechat-connect-frontend-redirect-url"
                    value={form.wechat_connect_frontend_redirect_url ?? ''} onChange={(e) => __set("form.wechat_connect_frontend_redirect_url", (e.target as HTMLInputElement).value)}
                    type="text"
                    className="input font-mono text-sm"
                    placeholder={t('admin.settings.wechatConnect.frontendRedirectUrlPlaceholder')}
                  />
                  <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
                    {t("admin.settings.wechatConnect.frontendRedirectUrlHint")}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* DingTalk Connect OAuth 登录 */}
          <div className="card">
            <div
              className="border-b border-gray-100 px-6 py-4 dark:border-dark-700"
            >
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                {t("admin.settings.dingtalk.title")}
              </h2>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                {t("admin.settings.dingtalk.description")}
              </p>
            </div>
            <div className="space-y-5 p-6">
              <div className="flex items-center justify-between">
                <div>
                  <label className="font-medium text-gray-900 dark:text-white">{t("admin.settings.dingtalk.enable")}</label>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {t("admin.settings.dingtalk.enableHint")}
                  </p>
                </div>
                <Toggle modelValue={form.dingtalk_connect_enabled} onUpdateModelValue={(v) => __set("form.dingtalk_connect_enabled", v)} />
              </div>

              <div className="border-t border-gray-100 pt-4 dark:border-dark-700" style={{ display: (form.dingtalk_connect_enabled) ? undefined : 'none' }}>
                <div className="grid grid-cols-1 gap-6">
                  <div>
                    <label
                      className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300"
                    >
                      {t("admin.settings.dingtalk.clientId")}
                    </label>
                    <input
                      value={form.dingtalk_connect_client_id ?? ''} onChange={(e) => __set("form.dingtalk_connect_client_id", (e.target as HTMLInputElement).value)}
                      type="text"
                      className="input font-mono text-sm"
                      placeholder={
                        t('admin.settings.dingtalk.clientIdPlaceholder')
                      }
                    />
                    <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
                      {t("admin.settings.dingtalk.clientIdHint")}
                    </p>
                  </div>

                  <div>
                    <label
                      className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300"
                    >
                      {t("admin.settings.dingtalk.clientSecret")}
                    </label>
                    <input
                      value={form.dingtalk_connect_client_secret ?? ''} onChange={(e) => __set("form.dingtalk_connect_client_secret", (e.target as HTMLInputElement).value)}
                      type="password"
                      className="input font-mono text-sm"
                      placeholder={
                        form.dingtalk_connect_client_secret_configured
                          ? t(
                              'admin.settings.dingtalk.clientSecretConfiguredPlaceholder',
                            )
                          : t('admin.settings.dingtalk.clientSecretPlaceholder')
                      }
                    />
                    <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
                      {form.dingtalk_connect_client_secret_configured
                          ? t(
                              "admin.settings.dingtalk.clientSecretConfiguredHint",
                            )
                          : t("admin.settings.dingtalk.clientSecretHint")}
                    </p>
                  </div>

                  <div>
                    <label
                      className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300"
                    >
                      {t("admin.settings.dingtalk.redirectUrl")}
                    </label>
                    <input
                      value={form.dingtalk_connect_redirect_url ?? ''} onChange={(e) => __set("form.dingtalk_connect_redirect_url", (e.target as HTMLInputElement).value)}
                      type="url"
                      className="input font-mono text-sm"
                      placeholder={
                        t('admin.settings.dingtalk.redirectUrlPlaceholder')
                      }
                    />
                    <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
                      {t("admin.settings.dingtalk.redirectUrlHint")}
                    </p>
                  </div>

                  {/* Corp Restriction Policy */}
                  <div className="border-t border-gray-100 pt-4 dark:border-dark-700">
                    <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                      {t("admin.settings.dingtalk.corpPolicy.label")}
                    </label>
                    <p className="mb-3 text-xs text-gray-500 dark:text-gray-400">
                      {t("admin.settings.dingtalk.corpPolicy.hint")}
                    </p>
                    <div className="space-y-2">
                      <label className="flex cursor-pointer items-center gap-3">
                        <input
                          checked={form.dingtalk_connect_corp_restriction_policy === 'none'}
                          onChange={() => { form.dingtalk_connect_corp_restriction_policy = 'none'; bump() }}
                          type="radio"
                          name="dingtalk_corp_policy"
                          className="h-4 w-4 text-primary-600"
                        />
                        <span className="text-sm text-gray-700 dark:text-gray-300">
                          {t("admin.settings.dingtalk.corpPolicy.none")}
                        </span>
                      </label>
                      <label className="flex cursor-pointer items-center gap-3">
                        <input
                          checked={form.dingtalk_connect_corp_restriction_policy === 'internal_only'}
                          onChange={() => { form.dingtalk_connect_corp_restriction_policy = 'internal_only'; bump() }}
                          type="radio"
                          name="dingtalk_corp_policy"
                          className="h-4 w-4 text-primary-600"
                        />
                        <span className="text-sm text-gray-700 dark:text-gray-300">
                          {t("admin.settings.dingtalk.corpPolicy.internalOnly")}
                        </span>
                      </label>
                    </div>
                  </div>

                  {/* bypass_registration toggle（仅 internal_only 模式下可见可用） */}
                  <div className="flex items-center justify-between pt-4 border-t border-gray-100 dark:border-dark-700" style={{ display: (form.dingtalk_connect_corp_restriction_policy === 'internal_only') ? undefined : 'none' }}>
                    <div>
                      <label className="font-medium text-gray-900 dark:text-white">{t("admin.settings.dingtalk.bypassRegistration")}</label>
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        {t("admin.settings.dingtalk.bypassRegistrationHint")}
                      </p>
                    </div>
                    <Toggle modelValue={form.dingtalk_connect_bypass_registration} onUpdateModelValue={(v) => __set("form.dingtalk_connect_bypass_registration", v)} />
                  </div>

                  {/* 身份同步开关（仅 internal_only 模式下可见） */}
                  <div className="pt-4 border-t border-gray-100 dark:border-dark-700 space-y-2" style={{ display: (form.dingtalk_connect_corp_restriction_policy === 'internal_only') ? undefined : 'none' }}>
                    <div className="flex items-center justify-between">
                      <div>
                        <label className="font-medium text-gray-900 dark:text-white">{t("admin.settings.dingtalk.syncDisplayName")}</label>
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                          {t("admin.settings.dingtalk.syncDisplayNameHint")}
                        </p>
                      </div>
                      <Toggle modelValue={form.dingtalk_connect_sync_display_name} onUpdateModelValue={(v) => __set("form.dingtalk_connect_sync_display_name", v)} />
                    </div>
                    <div className="space-y-2" style={{ display: (form.dingtalk_connect_sync_display_name) ? undefined : 'none' }}>
                      <div className="flex items-center gap-2">
                        <label className="text-sm text-gray-600 dark:text-gray-400 whitespace-nowrap min-w-[5rem]">
                          {t("admin.settings.dingtalk.syncDisplayNameTarget")}
                        </label>
                        <input
                          value={form.dingtalk_connect_sync_display_name_attr_key ?? ''} onChange={(e) => __set("form.dingtalk_connect_sync_display_name_attr_key", (e.target as HTMLInputElement).value)}
                          type="text"
                          placeholder="dingtalk_name"
                          className="input text-sm flex-1 max-w-xs"
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <label className="text-sm text-gray-600 dark:text-gray-400 whitespace-nowrap min-w-[5rem]">
                          {t("admin.settings.dingtalk.syncAttrDisplayName")}
                        </label>
                        <input
                          value={form.dingtalk_connect_sync_display_name_attr_name ?? ''} onChange={(e) => __set("form.dingtalk_connect_sync_display_name_attr_name", (e.target as HTMLInputElement).value)}
                          type="text"
                          placeholder="钉钉姓名"
                          className="input text-sm flex-1 max-w-xs"
                        />
                      </div>
                    </div>
                    <p className="text-xs text-gray-400 dark:text-gray-500" style={{ display: (form.dingtalk_connect_sync_display_name) ? undefined : 'none' }}>
                      {t("admin.settings.dingtalk.syncDisplayNameTargetHint")}
                    </p>
                  </div>
                  <div className="pt-4 border-t border-gray-100 dark:border-dark-700 space-y-2" style={{ display: (form.dingtalk_connect_corp_restriction_policy === 'internal_only') ? undefined : 'none' }}>
                    <div className="flex items-center justify-between">
                      <div>
                        <label className="font-medium text-gray-900 dark:text-white">{t("admin.settings.dingtalk.syncCorpEmail")}</label>
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                          {t("admin.settings.dingtalk.syncCorpEmailHint")}
                        </p>
                        <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                          {t("admin.settings.dingtalk.syncCorpEmailPermissionHint")}
                        </p>
                      </div>
                      <Toggle modelValue={form.dingtalk_connect_sync_corp_email} onUpdateModelValue={(v) => __set("form.dingtalk_connect_sync_corp_email", v)} />
                    </div>
                    <div className="space-y-2" style={{ display: (form.dingtalk_connect_sync_corp_email) ? undefined : 'none' }}>
                      <div className="flex items-center gap-2">
                        <label className="text-sm text-gray-600 dark:text-gray-400 whitespace-nowrap min-w-[5rem]">
                          {t("admin.settings.dingtalk.syncCorpEmailTarget")}
                        </label>
                        <input
                          value={form.dingtalk_connect_sync_corp_email_attr_key ?? ''} onChange={(e) => __set("form.dingtalk_connect_sync_corp_email_attr_key", (e.target as HTMLInputElement).value)}
                          type="text"
                          placeholder="dingtalk_email"
                          className="input text-sm flex-1 max-w-xs"
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <label className="text-sm text-gray-600 dark:text-gray-400 whitespace-nowrap min-w-[5rem]">
                          {t("admin.settings.dingtalk.syncAttrDisplayName")}
                        </label>
                        <input
                          value={form.dingtalk_connect_sync_corp_email_attr_name ?? ''} onChange={(e) => __set("form.dingtalk_connect_sync_corp_email_attr_name", (e.target as HTMLInputElement).value)}
                          type="text"
                          placeholder="钉钉企业邮箱"
                          className="input text-sm flex-1 max-w-xs"
                        />
                      </div>
                    </div>
                    <p className="text-xs text-gray-400 dark:text-gray-500" style={{ display: (form.dingtalk_connect_sync_corp_email) ? undefined : 'none' }}>
                      {t("admin.settings.dingtalk.syncCorpEmailTargetHint")}
                    </p>
                  </div>
                  <div className="pt-4 border-t border-gray-100 dark:border-dark-700 space-y-2" style={{ display: (form.dingtalk_connect_corp_restriction_policy === 'internal_only') ? undefined : 'none' }}>
                    <div className="flex items-center justify-between">
                      <div>
                        <label className="font-medium text-gray-900 dark:text-white">{t("admin.settings.dingtalk.syncDept")}</label>
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                          {t("admin.settings.dingtalk.syncDeptHint")}
                        </p>
                        <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                          {t("admin.settings.dingtalk.syncDeptPermissionHint")}
                        </p>
                      </div>
                      <Toggle modelValue={form.dingtalk_connect_sync_dept} onUpdateModelValue={(v) => __set("form.dingtalk_connect_sync_dept", v)} />
                    </div>
                    <div className="space-y-2" style={{ display: (form.dingtalk_connect_sync_dept) ? undefined : 'none' }}>
                      <div className="flex items-center gap-2">
                        <label className="text-sm text-gray-600 dark:text-gray-400 whitespace-nowrap min-w-[5rem]">
                          {t("admin.settings.dingtalk.syncDeptTarget")}
                        </label>
                        <input
                          value={form.dingtalk_connect_sync_dept_attr_key ?? ''} onChange={(e) => __set("form.dingtalk_connect_sync_dept_attr_key", (e.target as HTMLInputElement).value)}
                          type="text"
                          placeholder="dingtalk_department"
                          className="input text-sm flex-1 max-w-xs"
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <label className="text-sm text-gray-600 dark:text-gray-400 whitespace-nowrap min-w-[5rem]">
                          {t("admin.settings.dingtalk.syncAttrDisplayName")}
                        </label>
                        <input
                          value={form.dingtalk_connect_sync_dept_attr_name ?? ''} onChange={(e) => __set("form.dingtalk_connect_sync_dept_attr_name", (e.target as HTMLInputElement).value)}
                          type="text"
                          placeholder="钉钉部门"
                          className="input text-sm flex-1 max-w-xs"
                        />
                      </div>
                    </div>
                    <p className="text-xs text-gray-400 dark:text-gray-500" style={{ display: (form.dingtalk_connect_sync_dept) ? undefined : 'none' }}>
                      {t("admin.settings.dingtalk.syncDeptTargetHint")}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Generic OIDC OAuth 登录 */}
          <div className="card">
            <div
              className="border-b border-gray-100 px-6 py-4 dark:border-dark-700"
            >
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                {t("admin.settings.oidc.title")}
              </h2>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                {t("admin.settings.oidc.description")}
              </p>
            </div>
            <div className="space-y-5 p-6">
              <div className="flex items-center justify-between">
                <div>
                  <label className="font-medium text-gray-900 dark:text-white">{t("admin.settings.oidc.enable")}</label>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {t("admin.settings.oidc.enableHint")}
                  </p>
                </div>
                <Toggle modelValue={form.oidc_connect_enabled} onUpdateModelValue={(v) => __set("form.oidc_connect_enabled", v)} />
              </div>

              <div className="space-y-6 border-t border-gray-100 pt-4 dark:border-dark-700" style={{ display: (form.oidc_connect_enabled) ? undefined : 'none' }}>
                <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                  <div>
                    <label
                      className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300"
                    >
                      {t("admin.settings.oidc.providerName")}
                    </label>
                    <input
                      value={form.oidc_connect_provider_name ?? ''} onChange={(e) => __set("form.oidc_connect_provider_name", (e.target as HTMLInputElement).value)}
                      type="text"
                      className="input"
                      placeholder={
                        t('admin.settings.oidc.providerNamePlaceholder')
                      }
                    />
                  </div>

                  <div>
                    <label
                      className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300"
                    >
                      {t("admin.settings.oidc.clientId")}
                    </label>
                    <input
                      value={form.oidc_connect_client_id ?? ''} onChange={(e) => __set("form.oidc_connect_client_id", (e.target as HTMLInputElement).value)}
                      type="text"
                      className="input font-mono text-sm"
                      placeholder={
                        t('admin.settings.oidc.clientIdPlaceholder')
                      }
                    />
                  </div>

                  <div>
                    <label
                      className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300"
                    >
                      {t("admin.settings.oidc.clientSecret")}
                    </label>
                    <input
                      value={form.oidc_connect_client_secret ?? ''} onChange={(e) => __set("form.oidc_connect_client_secret", (e.target as HTMLInputElement).value)}
                      type="password"
                      className="input font-mono text-sm"
                      placeholder={
                        form.oidc_connect_client_secret_configured
                          ? t(
                              'admin.settings.oidc.clientSecretConfiguredPlaceholder',
                            )
                          : t('admin.settings.oidc.clientSecretPlaceholder')
                      }
                    />
                    <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
                      {form.oidc_connect_client_secret_configured
                          ? t("admin.settings.oidc.clientSecretConfiguredHint")
                          : t("admin.settings.oidc.clientSecretHint")}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                  <div>
                    <label
                      className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300"
                    >
                      {t("admin.settings.oidc.issuerUrl")}
                    </label>
                    <input
                      value={form.oidc_connect_issuer_url ?? ''} onChange={(e) => __set("form.oidc_connect_issuer_url", (e.target as HTMLInputElement).value)}
                      type="url"
                      className="input font-mono text-sm"
                      placeholder={
                        t('admin.settings.oidc.issuerUrlPlaceholder')
                      }
                    />
                  </div>

                  <div>
                    <label
                      className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300"
                    >
                      {t("admin.settings.oidc.discoveryUrl")}
                    </label>
                    <input
                      value={form.oidc_connect_discovery_url ?? ''} onChange={(e) => __set("form.oidc_connect_discovery_url", (e.target as HTMLInputElement).value)}
                      type="url"
                      className="input font-mono text-sm"
                      placeholder={
                        t('admin.settings.oidc.discoveryUrlPlaceholder')
                      }
                    />
                  </div>

                  <div>
                    <label
                      className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300"
                    >
                      {t("admin.settings.oidc.authorizeUrl")}
                    </label>
                    <input
                      value={form.oidc_connect_authorize_url ?? ''} onChange={(e) => __set("form.oidc_connect_authorize_url", (e.target as HTMLInputElement).value)}
                      type="url"
                      className="input font-mono text-sm"
                      placeholder={
                        t('admin.settings.oidc.authorizeUrlPlaceholder')
                      }
                    />
                  </div>

                  <div>
                    <label
                      className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300"
                    >
                      {t("admin.settings.oidc.tokenUrl")}
                    </label>
                    <input
                      value={form.oidc_connect_token_url ?? ''} onChange={(e) => __set("form.oidc_connect_token_url", (e.target as HTMLInputElement).value)}
                      type="url"
                      className="input font-mono text-sm"
                      placeholder={
                        t('admin.settings.oidc.tokenUrlPlaceholder')
                      }
                    />
                  </div>

                  <div>
                    <label
                      className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300"
                    >
                      {t("admin.settings.oidc.userinfoUrl")}
                    </label>
                    <input
                      value={form.oidc_connect_userinfo_url ?? ''} onChange={(e) => __set("form.oidc_connect_userinfo_url", (e.target as HTMLInputElement).value)}
                      type="url"
                      className="input font-mono text-sm"
                      placeholder={
                        t('admin.settings.oidc.userinfoUrlPlaceholder')
                      }
                    />
                  </div>

                  <div>
                    <label
                      className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300"
                    >
                      {t("admin.settings.oidc.jwksUrl")}
                    </label>
                    <input
                      value={form.oidc_connect_jwks_url ?? ''} onChange={(e) => __set("form.oidc_connect_jwks_url", (e.target as HTMLInputElement).value)}
                      type="url"
                      className="input font-mono text-sm"
                      placeholder={t('admin.settings.oidc.jwksUrlPlaceholder')}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                  <div>
                    <label
                      className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300"
                    >
                      {t("admin.settings.oidc.scopes")}
                    </label>
                    <input
                      value={form.oidc_connect_scopes ?? ''} onChange={(e) => __set("form.oidc_connect_scopes", (e.target as HTMLInputElement).value)}
                      type="text"
                      className="input font-mono text-sm"
                      placeholder={t('admin.settings.oidc.scopesPlaceholder')}
                    />
                    <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
                      {t("admin.settings.oidc.scopesHint")}
                    </p>
                  </div>

                  <div>
                    <label
                      className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300"
                    >
                      {t("admin.settings.oidc.redirectUrl")}
                    </label>
                    <input
                      value={form.oidc_connect_redirect_url ?? ''} onChange={(e) => __set("form.oidc_connect_redirect_url", (e.target as HTMLInputElement).value)}
                      type="url"
                      className="input font-mono text-sm"
                      placeholder={
                        t('admin.settings.oidc.redirectUrlPlaceholder')
                      }
                    />
                    <div
                      className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3"
                    >
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm w-fit"
                        onClick={() => setAndCopyOIDCRedirectUrl()}
                      >
                        {t("admin.settings.oidc.quickSetCopy")}
                      </button>
                      <code className="select-all break-all rounded bg-gray-50 px-2 py-1 font-mono text-xs text-gray-600 dark:bg-dark-800 dark:text-gray-300" style={{ display: (oidcRedirectUrlSuggestion) ? undefined : 'none' }}>
                        {oidcRedirectUrlSuggestion}
                      </code>
                    </div>
                    <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
                      {t("admin.settings.oidc.redirectUrlHint")}
                    </p>
                  </div>

                  <div className="lg:col-span-2">
                    <label
                      className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300"
                    >
                      {t("admin.settings.oidc.frontendRedirectUrl")}
                    </label>
                    <input
                      value={form.oidc_connect_frontend_redirect_url ?? ''} onChange={(e) => __set("form.oidc_connect_frontend_redirect_url", (e.target as HTMLInputElement).value)}
                      type="text"
                      className="input font-mono text-sm"
                      placeholder={
                        t('admin.settings.oidc.frontendRedirectUrlPlaceholder')
                      }
                    />
                    <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
                      {t("admin.settings.oidc.frontendRedirectUrlHint")}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                  <div>
                    <label
                      className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300"
                    >
                      {t("admin.settings.oidc.tokenAuthMethod")}
                    </label>
                    <select
                      value={form.oidc_connect_token_auth_method ?? ''} onChange={(e) => __set("form.oidc_connect_token_auth_method", e.target.value)}
                      className="input font-mono text-sm"
                    >
                      <option value="client_secret_post">
                        client_secret_post
                      </option>
                      <option value="client_secret_basic">
                        client_secret_basic
                      </option>
                      <option value="none">none</option>
                    </select>
                  </div>

                  <div>
                    <label
                      className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300"
                    >
                      {t("admin.settings.oidc.clockSkewSeconds")}
                    </label>
                    <input
                      value={form.oidc_connect_clock_skew_seconds ?? ''} onChange={(e) => __set("form.oidc_connect_clock_skew_seconds", Number((e.target as HTMLInputElement).value))}
                      type="number"
                      min="0"
                      max="600"
                      className="input"
                    />
                  </div>

                  <div>
                    <label
                      className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300"
                    >
                      {t("admin.settings.oidc.allowedSigningAlgs")}
                    </label>
                    <input
                      value={form.oidc_connect_allowed_signing_algs ?? ''} onChange={(e) => __set("form.oidc_connect_allowed_signing_algs", (e.target as HTMLInputElement).value)}
                      type="text"
                      className="input font-mono text-sm"
                      placeholder={
                        t('admin.settings.oidc.allowedSigningAlgsPlaceholder')
                      }
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                  <div
                    className="flex items-center justify-between rounded border border-gray-200 px-4 py-3 dark:border-dark-700"
                  >
                    <div>
                      <label className="font-medium text-gray-900 dark:text-white">
                        {t("admin.settings.oidc.usePkce")}
                      </label>
                    </div>
                    <Toggle
                      modelValue={form.oidc_connect_use_pkce} onUpdateModelValue={(v) => __set("form.oidc_connect_use_pkce", v)}
                      data-testid="oidc-connect-use-pkce"
                    />
                  </div>

                  <div
                    className="flex items-center justify-between rounded border border-gray-200 px-4 py-3 dark:border-dark-700"
                  >
                    <div>
                      <label className="font-medium text-gray-900 dark:text-white">
                        {t("admin.settings.oidc.validateIdToken")}
                      </label>
                    </div>
                    <Toggle
                      modelValue={form.oidc_connect_validate_id_token} onUpdateModelValue={(v) => __set("form.oidc_connect_validate_id_token", v)}
                      data-testid="oidc-connect-validate-id-token"
                    />
                  </div>

                  <div
                    className="flex items-center justify-between rounded border border-gray-200 px-4 py-3 dark:border-dark-700"
                  >
                    <div>
                      <label className="font-medium text-gray-900 dark:text-white">
                        {t("admin.settings.oidc.requireEmailVerified")}
                      </label>
                    </div>
                    <Toggle
                      modelValue={form.oidc_connect_require_email_verified} onUpdateModelValue={(v) => __set("form.oidc_connect_require_email_verified", v)}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                  <div>
                    <label
                      className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300"
                    >
                      {t("admin.settings.oidc.userinfoEmailPath")}
                    </label>
                    <input
                      value={form.oidc_connect_userinfo_email_path ?? ''} onChange={(e) => __set("form.oidc_connect_userinfo_email_path", (e.target as HTMLInputElement).value)}
                      type="text"
                      className="input font-mono text-sm"
                      placeholder={
                        t('admin.settings.oidc.userinfoEmailPathPlaceholder')
                      }
                    />
                  </div>

                  <div>
                    <label
                      className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300"
                    >
                      {t("admin.settings.oidc.userinfoIdPath")}
                    </label>
                    <input
                      value={form.oidc_connect_userinfo_id_path ?? ''} onChange={(e) => __set("form.oidc_connect_userinfo_id_path", (e.target as HTMLInputElement).value)}
                      type="text"
                      className="input font-mono text-sm"
                      placeholder={
                        t('admin.settings.oidc.userinfoIdPathPlaceholder')
                      }
                    />
                  </div>

                  <div>
                    <label
                      className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300"
                    >
                      {t("admin.settings.oidc.userinfoUsernamePath")}
                    </label>
                    <input
                      value={form.oidc_connect_userinfo_username_path ?? ''} onChange={(e) => __set("form.oidc_connect_userinfo_username_path", (e.target as HTMLInputElement).value)}
                      type="text"
                      className="input font-mono text-sm"
                      placeholder={
                        t('admin.settings.oidc.userinfoUsernamePathPlaceholder')
                      }
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        {/* /Tab: Security — Registration, Turnstile, LinuxDo, OIDC */}

        {/* Tab: Users */}
        <div style={{ display: (activeTab === 'users') ? undefined : 'none' }} className="space-y-6">
          {/* Default Settings */}
          <div className="card">
            <div
              className="border-b border-gray-100 px-6 py-4 dark:border-dark-700"
            >
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                {t("admin.settings.defaults.title")}
              </h2>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                {t("admin.settings.defaults.description")}
              </p>
            </div>
            <div className="space-y-6 p-6">
              <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                <div>
                  <label
                    className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300"
                  >
                    {t("admin.settings.defaults.defaultBalance")}
                  </label>
                  <input
                    value={form.default_balance ?? ''} onChange={(e) => __set("form.default_balance", Number((e.target as HTMLInputElement).value))}
                    type="number"
                    step="0.01"
                    min="0"
                    className="input"
                    placeholder="0.00"
                  />
                  <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
                    {t("admin.settings.defaults.defaultBalanceHint")}
                  </p>
                </div>
                <div>
                  <label
                    className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300"
                  >
                    {t("admin.settings.defaults.defaultConcurrency")}
                  </label>
                  <input
                    value={form.default_concurrency ?? ''} onChange={(e) => __set("form.default_concurrency", Number((e.target as HTMLInputElement).value))}
                    type="number"
                    min="1"
                    className="input"
                    placeholder="1"
                  />
                  <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
                    {t("admin.settings.defaults.defaultConcurrencyHint")}
                  </p>
                </div>
                <div>
                  <label
                    className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300"
                  >
                    {t("admin.settings.defaults.defaultUserRpmLimit")}
                  </label>
                  <input
                    value={form.default_user_rpm_limit ?? ''} onChange={(e) => __set("form.default_user_rpm_limit", Number((e.target as HTMLInputElement).value))}
                    type="number"
                    min="0"
                    step="1"
                    className="input"
                    placeholder="0"
                  />
                  <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
                    {t("admin.settings.defaults.defaultUserRpmLimitHint")}
                  </p>
                </div>
              </div>

              <div className="border-t border-gray-100 pt-4 dark:border-dark-700">
                <div className="mb-3 flex items-center justify-between">
                  <div>
                    <label className="font-medium text-gray-900 dark:text-white">
                      {t("admin.settings.defaults.defaultSubscriptions")}
                    </label>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {t("admin.settings.defaults.defaultSubscriptionsHint")}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => addDefaultSubscription()}
                    disabled={subscriptionGroups.length === 0}
                  >
                    {t("admin.settings.defaults.addDefaultSubscription")}
                  </button>
                </div>

                <div className="rounded border border-dashed border-gray-300 px-4 py-3 text-sm text-gray-500 dark:border-dark-600 dark:text-gray-400" style={{ display: (form.default_subscriptions.length === 0) ? undefined : 'none' }}>
                  {t("admin.settings.defaults.defaultSubscriptionsEmpty")}
                </div>

                <div className="space-y-3" style={{ display: (form.default_subscriptions.length > 0) ? undefined : 'none' }}>
                  {form.default_subscriptions.map((item, index) => (<div
                    className="grid grid-cols-1 gap-3 rounded border border-gray-200 p-3 md:grid-cols-[1fr_160px_auto] dark:border-dark-600"
                    key={index}
                  >
                    <div>
                      <label
                        className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400"
                      >
                        {t("admin.settings.defaults.subscriptionGroup")}
                      </label>
                      <Select
                        modelValue={item.group_id ?? ''}
                        onUpdateModelValue={(v) => { item.group_id = Number(v); bump() }}
                        className="default-sub-group-select"
                        options={defaultSubscriptionGroupOptions}
                        placeholder={
                          t('admin.settings.defaults.subscriptionGroup')
                        }
                      />
                    </div>
                    <div>
                      <label
                        className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400"
                      >
                        {t("admin.settings.defaults.subscriptionValidityDays")}
                      </label>
                      <input
                        value={item.validity_days ?? ''} onChange={(e) => __set("item.validity_days", Number((e.target as HTMLInputElement).value))}
                        type="number"
                        min="1"
                        max="36500"
                        className="input h-[42px]"
                      />
                    </div>
                    <div className="flex items-end">
                      <button
                        type="button"
                        className="btn btn-secondary default-sub-delete-btn w-full text-red-600 hover:text-red-700 dark:text-red-400"
                        onClick={(e) => removeDefaultSubscription(index)}
                      >
                        {t("common.delete")}
                      </button>
                    </div>
                  </div>))}
                </div>
              </div>

              {/* ★ 新增：系统全局默认平台限额矩阵 */}
              <div className="border-t border-gray-100 pt-4 dark:border-dark-700">
                <div className="mb-3">
                  <label className="font-medium text-gray-900 dark:text-white">
                    {t("admin.settings.defaults.defaultPlatformQuotas")}
                  </label>
                  <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                    {t("admin.settings.defaults.defaultPlatformQuotasHint")}
                  </p>
                  <p className="mt-0.5 text-xs text-amber-600 dark:text-amber-400">
                    {t("admin.settings.defaults.platformQuotaNotice")}
                  </p>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs text-gray-500 dark:text-gray-400">
                        <th className="pb-2 pr-4 font-medium">{t("admin.settings.platformQuota.platform")}</th>
                        <th className="pb-2 pr-4 font-medium">{t("admin.settings.platformQuota.daily")}</th>
                        <th className="pb-2 pr-4 font-medium">{t("admin.settings.platformQuota.weekly")}</th>
                        <th className="pb-2 font-medium">{t("admin.settings.platformQuota.monthly")}</th>
                      </tr>
                    </thead>
                    <tbody className="space-y-2">
                      {(['anthropic', 'openai', 'gemini', 'antigravity'] as const).map((p, idx) => (<tr className="align-top" key={p}>
                        <td className="pr-4 py-1">
                          <span className="font-mono text-xs text-gray-700 dark:text-gray-300">{p}</span>
                        </td>
                        <td className="pr-4 py-1">
                          <input
                            value={form.default_platform_quotas[p]!.daily ?? ''} onChange={(e) => __set("form.default_platform_quotas[p]!.daily", Number((e.target as HTMLInputElement).value))}
                            type="number"
                            step="0.01"
                            min="0"
                            className="input h-8 w-28 text-sm"
                            placeholder={t('admin.settings.platformQuota.placeholder')}
                          />
                        </td>
                        <td className="pr-4 py-1">
                          <input
                            value={form.default_platform_quotas[p]!.weekly ?? ''} onChange={(e) => __set("form.default_platform_quotas[p]!.weekly", Number((e.target as HTMLInputElement).value))}
                            type="number"
                            step="0.01"
                            min="0"
                            className="input h-8 w-28 text-sm"
                            placeholder={t('admin.settings.platformQuota.placeholder')}
                          />
                        </td>
                        <td className="py-1">
                          <input
                            value={form.default_platform_quotas[p]!.monthly ?? ''} onChange={(e) => __set("form.default_platform_quotas[p]!.monthly", Number((e.target as HTMLInputElement).value))}
                            type="number"
                            step="0.01"
                            min="0"
                            className="input h-8 w-28 text-sm"
                            placeholder={t('admin.settings.platformQuota.placeholder')}
                          />
                        </td>
                      </tr>))}
                    </tbody>
                  </table>
                </div>
              </div>
              {/* /全局平台限额矩阵 */}
            </div>
          </div>

          <div className="card">
            <div
              className="border-b border-gray-100 px-6 py-4 dark:border-dark-700"
            >
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                {t("admin.settings.authSourceDefaults.title")}
              </h2>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                {t("admin.settings.authSourceDefaults.description")}
              </p>
            </div>
            <div className="space-y-6 p-6">
              <div
                className="flex items-center justify-between rounded border border-gray-200 px-4 py-3 dark:border-dark-700"
              >
                <div>
                  <label className="font-medium text-gray-900 dark:text-white">
                    {t("admin.settings.authSourceDefaults.requireEmailLabel")}
                  </label>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {t("admin.settings.authSourceDefaults.requireEmailHint")}
                  </p>
                </div>
                <Toggle modelValue={form.force_email_on_third_party_signup} onUpdateModelValue={(v) => __set("form.force_email_on_third_party_signup", v)} />
              </div>

              <div className="space-y-4">
                {authSourceDefaultsMeta.map((authSource, idx) => (<div className="rounded-xl border border-gray-200 p-4 dark:border-dark-700" key={authSource.source}>
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <div className="font-medium text-gray-900 dark:text-white">
                        {authSource.title}
                      </div>
                      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                        {authSource.description}
                      </p>
                    </div>
                    <Toggle
                      modelValue={authSourceDefaults[authSource.source].grant_on_signup} onUpdateModelValue={(v) => __set("authSourceDefaults[authSource.source].grant_on_signup", v)}
                      data-testid={`auth-source-${authSource.source}-enabled`}
                    />
                  </div>

                  <div data-testid={`auth-source-${authSource.source}-panel`}
                    className="mt-4 space-y-4 border-t border-gray-100 pt-4 dark:border-dark-700" style={{ display: (authSourceDefaults[authSource.source].grant_on_signup) ? undefined : 'none' }}>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {t("admin.settings.authSourceDefaults.enabledHint")}
                    </p>

                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                      <div>
                        <label
                          className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300"
                        >
                          {t("admin.settings.defaults.defaultBalance")}
                        </label>
                        <input
                          value={authSourceDefaults[authSource.source].balance ?? ''} onChange={(e) => __set("authSourceDefaults[authSource.source].balance", Number((e.target as HTMLInputElement).value))}
                          type="number"
                          step="0.01"
                          min="0"
                          className="input"
                          placeholder="0.00"
                        />
                      </div>
                      <div>
                        <label
                          className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300"
                        >
                          {t("admin.settings.defaults.defaultConcurrency")}
                        </label>
                        <input
                          value={authSourceDefaults[authSource.source].concurrency ?? ''} onChange={(e) => __set("authSourceDefaults[authSource.source].concurrency", Number((e.target as HTMLInputElement).value))}
                          type="number"
                          min="1"
                          className="input"
                          placeholder="5"
                        />
                      </div>
                    </div>

                    <div
                      className="flex items-center justify-between rounded border border-gray-200 px-4 py-3 dark:border-dark-700"
                    >
                      <div>
                        <label
                          className="font-medium text-gray-900 dark:text-white"
                        >
                          {t("admin.settings.authSourceDefaults.grantOnFirstBindLabel")}
                        </label>
                        <p
                          className="mt-0.5 text-xs text-gray-500 dark:text-gray-400"
                        >
                          {t("admin.settings.authSourceDefaults.grantOnFirstBindHint")}
                        </p>
                      </div>
                      <Toggle
                        modelValue={authSourceDefaults[authSource.source].grant_on_first_bind} onUpdateModelValue={(v) => __set("authSourceDefaults[authSource.source].grant_on_first_bind", v)}
                      />
                    </div>

                    <div className="mb-3 flex items-center justify-between">
                      <div>
                        <label
                          className="font-medium text-gray-900 dark:text-white"
                        >
                          {t("admin.settings.authSourceDefaults.defaultSubscriptionsLabel")}
                        </label>
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                          {t("admin.settings.authSourceDefaults.defaultSubscriptionsHint")}
                        </p>
                      </div>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => addAuthSourceDefaultSubscription(authSource.source)}
                        disabled={subscriptionGroups.length === 0}
                      >
                        {t("admin.settings.defaults.addDefaultSubscription")}
                      </button>
                    </div>

                    <div className="rounded border border-dashed border-gray-300 px-4 py-3 text-sm text-gray-500 dark:border-dark-600 dark:text-gray-400" style={{ display: (
                        authSourceDefaults[authSource.source].subscriptions
                          .length === 0
                      ) ? undefined : 'none' }}>
                      {t("admin.settings.authSourceDefaults.noSourceSubscriptions")}
                    </div>

                    <div className="space-y-3" style={{ display: (!(authSourceDefaults[authSource.source].grant_on_signup)) ? undefined : 'none' }}>
                      {authSourceDefaults[
                          authSource.source
                        ].subscriptions.map((item, index) => (<div
                        className="grid grid-cols-1 gap-3 rounded border border-gray-200 p-3 md:grid-cols-[1fr_160px_auto] dark:border-dark-600"
                       key={index}>
                        <div>
                          <label
                            className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400"
                          >
                            {t("admin.settings.defaults.subscriptionGroup")}
                          </label>
                          <Select
                            modelValue={item.group_id ?? ''}
                            onUpdateModelValue={(v) => { item.group_id = Number(v); bump() }}
                            className="default-sub-group-select"
                            options={defaultSubscriptionGroupOptions}
                            placeholder={
                              t('admin.settings.defaults.subscriptionGroup')
                            }
                          />
                        </div>
                        <div>
                          <label
                            className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400"
                          >
                            {t(
                                "admin.settings.defaults.subscriptionValidityDays",
                              )}
                          </label>
                          <input
                            value={item.validity_days ?? ''} onChange={(e) => __set("item.validity_days", Number((e.target as HTMLInputElement).value))}
                            type="number"
                            min="1"
                            max="36500"
                            className="input h-[42px]"
                          />
                        </div>
                        <div className="flex items-end">
                          <button
                            type="button"
                            className="btn btn-secondary w-full text-red-600 hover:text-red-700 dark:text-red-400"
                            onClick={() =>
                              removeAuthSourceDefaultSubscription(
                                authSource.source,
                                index,
                              )
                            }
                          >
                            {t("common.delete")}
                          </button>
                        </div>
                      </div>))}
                    </div>

                    {/* ★ 新增：auth source 平台限额覆盖区块 */}
                    <div className="border-t border-gray-100 pt-4 dark:border-dark-700">
                      <div className="mb-3">
                        <label className="font-medium text-gray-900 dark:text-white">
                          {t("admin.settings.authSourceDefaults.platformQuotasOverride")}
                        </label>
                        <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                          {t("admin.settings.authSourceDefaults.platformQuotasOverrideHint")}
                        </p>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="min-w-full text-sm">
                          <thead>
                            <tr className="text-left text-xs text-gray-500 dark:text-gray-400">
                              <th className="pb-2 pr-4 font-medium">{t("admin.settings.platformQuota.platform")}</th>
                              <th className="pb-2 pr-4 font-medium">{t("admin.settings.platformQuota.daily")}</th>
                              <th className="pb-2 pr-4 font-medium">{t("admin.settings.platformQuota.weekly")}</th>
                              <th className="pb-2 font-medium">{t("admin.settings.platformQuota.monthly")}</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(['anthropic', 'openai', 'gemini', 'antigravity'] as const).map((p) => (
                              <tr className="align-top" key={`${authSource.source}-${p}`}>
                              <td className="pr-4 py-1">
                                <span className="font-mono text-xs text-gray-700 dark:text-gray-300">{p}</span>
                              </td>
                              <td className="pr-4 py-1">
                                <input
                                  value={authSourceDefaults[authSource.source].platform_quotas[p]!.daily ?? ''} onChange={(e) => __set("authSourceDefaults[authSource.source].platform_quotas[p]!.daily", Number((e.target as HTMLInputElement).value))}
                                  type="number"
                                  step="0.01"
                                  min="0"
                                  className="input h-8 w-28 text-sm"
                                  placeholder={t('admin.settings.platformQuota.placeholder')}
                                />
                              </td>
                              <td className="pr-4 py-1">
                                <input
                                  value={authSourceDefaults[authSource.source].platform_quotas[p]!.weekly ?? ''} onChange={(e) => __set("authSourceDefaults[authSource.source].platform_quotas[p]!.weekly", Number((e.target as HTMLInputElement).value))}
                                  type="number"
                                  step="0.01"
                                  min="0"
                                  className="input h-8 w-28 text-sm"
                                  placeholder={t('admin.settings.platformQuota.placeholder')}
                                />
                              </td>
                              <td className="py-1">
                                <input
                                  value={authSourceDefaults[authSource.source].platform_quotas[p]!.monthly ?? ''} onChange={(e) => __set("authSourceDefaults[authSource.source].platform_quotas[p]!.monthly", Number((e.target as HTMLInputElement).value))}
                                  type="number"
                                  step="0.01"
                                  min="0"
                                  className="input h-8 w-28 text-sm"
                                  placeholder={t('admin.settings.platformQuota.placeholder')}
                                />
                              </td>
                            </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                    {/* /auth source 平台限额覆盖区块 */}
                  </div>
                </div>))}
              </div>
            </div>
          </div>
        </div>
        {/* /Tab: Users */}

        {/* Tab: Gateway — Claude Code, Scheduling */}
        <div style={{ display: (activeTab === 'gateway') ? undefined : 'none' }} className="space-y-6">
          {/* Claude Code Settings */}
          <div className="card">
            <div
              className="border-b border-gray-100 px-6 py-4 dark:border-dark-700"
            >
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                {t("admin.settings.claudeCode.title")}
              </h2>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                {t("admin.settings.claudeCode.description")}
              </p>
            </div>
            <div className="p-6">
              <div>
                <label
                  className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300"
                >
                  {t("admin.settings.claudeCode.minVersion")}
                </label>
                <input
                  value={form.min_claude_code_version ?? ''} onChange={(e) => __set("form.min_claude_code_version", (e.target as HTMLInputElement).value)}
                  type="text"
                  className="input max-w-xs font-mono text-sm"
                  placeholder={
                    t('admin.settings.claudeCode.minVersionPlaceholder')
                  }
                />
                <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
                  {t("admin.settings.claudeCode.minVersionHint")}
                </p>
              </div>
              <div className="mt-4">
                <label
                  className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300"
                >
                  {t("admin.settings.claudeCode.maxVersion")}
                </label>
                <input
                  value={form.max_claude_code_version ?? ''} onChange={(e) => __set("form.max_claude_code_version", (e.target as HTMLInputElement).value)}
                  type="text"
                  className="input max-w-xs font-mono text-sm"
                  placeholder={
                    t('admin.settings.claudeCode.maxVersionPlaceholder')
                  }
                />
                <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
                  {t("admin.settings.claudeCode.maxVersionHint")}
                </p>
              </div>
            </div>
          </div>

          {/* Gateway Scheduling Settings */}
          <div className="card">
            <div
              className="border-b border-gray-100 px-6 py-4 dark:border-dark-700"
            >
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                {t("admin.settings.scheduling.title")}
              </h2>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                {t("admin.settings.scheduling.description")}
              </p>
            </div>
            <div className="space-y-5 p-6">
              <div className="flex items-center justify-between">
                <div>
                  <label
                    className="text-sm font-medium text-gray-700 dark:text-gray-300"
                  >
                    {t("admin.settings.scheduling.allowUngroupedKey")}
                  </label>
                  <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                    {t("admin.settings.scheduling.allowUngroupedKeyHint")}
                  </p>
                </div>
                <Toggle modelValue={form.allow_ungrouped_key_scheduling} onUpdateModelValue={(v) => __set("form.allow_ungrouped_key_scheduling", v)} />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <label
                    className="text-sm font-medium text-gray-700 dark:text-gray-300"
                  >
                    {t("admin.settings.openaiExperimentalScheduler.title")}
                  </label>
                  <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                    {t("admin.settings.openaiExperimentalScheduler.description")}
                  </p>
                </div>
                <Toggle modelValue={form.openai_advanced_scheduler_enabled} onUpdateModelValue={(v) => __set("form.openai_advanced_scheduler_enabled", v)} />
              </div>
            </div>
          </div>

          {/* Gateway Forwarding Behavior */}
          <div className="card">
            <div
              className="border-b border-gray-100 px-6 py-4 dark:border-dark-700"
            >
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                {t("admin.settings.gatewayForwarding.title")}
              </h2>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                {t("admin.settings.gatewayForwarding.description")}
              </p>
            </div>
            <div className="space-y-5 p-6">
              {/* Fingerprint Unification */}
              <div className="flex items-center justify-between">
                <div>
                  <label
                    className="text-sm font-medium text-gray-700 dark:text-gray-300"
                  >
                    {t(
                        "admin.settings.gatewayForwarding.fingerprintUnification",
                      )}
                  </label>
                  <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                    {t(
                        "admin.settings.gatewayForwarding.fingerprintUnificationHint",
                      )}
                  </p>
                </div>
                <Toggle modelValue={form.enable_fingerprint_unification} onUpdateModelValue={(v) => __set("form.enable_fingerprint_unification", v)} />
              </div>

              {/* Metadata Passthrough */}
              <div className="flex items-center justify-between">
                <div>
                  <label
                    className="text-sm font-medium text-gray-700 dark:text-gray-300"
                  >
                    {t("admin.settings.gatewayForwarding.metadataPassthrough")}
                  </label>
                  <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                    {t(
                        "admin.settings.gatewayForwarding.metadataPassthroughHint",
                      )}
                  </p>
                </div>
                <Toggle modelValue={form.enable_metadata_passthrough} onUpdateModelValue={(v) => __set("form.enable_metadata_passthrough", v)} />
              </div>

              {/* CCH Signing */}
              <div className="flex items-center justify-between">
                <div>
                  <label
                    className="text-sm font-medium text-gray-700 dark:text-gray-300"
                  >
                    {t("admin.settings.gatewayForwarding.cchSigning")}
                  </label>
                  <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                    {t("admin.settings.gatewayForwarding.cchSigningHint")}
                  </p>
                </div>
                <Toggle modelValue={form.enable_cch_signing} onUpdateModelValue={(v) => __set("form.enable_cch_signing", v)} />
              </div>

              {/* Anthropic Cache TTL 1h Injection */}
              <div className="flex items-center justify-between">
                <div>
                  <label
                    className="text-sm font-medium text-gray-700 dark:text-gray-300"
                  >
                    {t(
                        "admin.settings.gatewayForwarding.anthropicCacheTTL1hInjection",
                      )}
                  </label>
                  <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                    {t(
                        "admin.settings.gatewayForwarding.anthropicCacheTTL1hInjectionHint",
                      )}
                  </p>
                </div>
                <Toggle
                  modelValue={form.enable_anthropic_cache_ttl_1h_injection} onUpdateModelValue={(v) => __set("form.enable_anthropic_cache_ttl_1h_injection", v)}
                />
              </div>

              {/* messages cache_control 改写 */}
              <div className="flex items-center justify-between">
                <div>
                  <label
                    className="text-sm font-medium text-gray-700 dark:text-gray-300"
                  >
                    {t(
                        "admin.settings.gatewayForwarding.rewriteMessageCacheControl",
                      )}
                  </label>
                  <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                    {t(
                        "admin.settings.gatewayForwarding.rewriteMessageCacheControlHint",
                      )}
                  </p>
                </div>
                <Toggle modelValue={form.rewrite_message_cache_control} onUpdateModelValue={(v) => __set("form.rewrite_message_cache_control", v)} />
              </div>

              {/* Antigravity UA 版本 */}
              <div>
                <label
                  className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300"
                >
                  {t(
                      "admin.settings.gatewayForwarding.antigravityUserAgentVersion",
                    )}
                </label>
                <input
                  value={form.antigravity_user_agent_version ?? ''} onChange={(e) => __set("form.antigravity_user_agent_version", (e.target as HTMLInputElement).value)}
                  type="text"
                  className="input max-w-xs font-mono text-sm"
                  placeholder={
                    t(
                      'admin.settings.gatewayForwarding.antigravityUserAgentVersionPlaceholder',
                    )
                  }
                />
                <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
                  {t(
                      "admin.settings.gatewayForwarding.antigravityUserAgentVersionHint",
                    )}
                </p>
              </div>

              {/* OpenAI Codex UA */}
              <div>
                <label
                  className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300"
                >
                  {t(
                      "admin.settings.gatewayForwarding.openaiCodexUserAgent",
                    )}
                </label>
                <input
                  value={form.openai_codex_user_agent ?? ''} onChange={(e) => __set("form.openai_codex_user_agent", (e.target as HTMLInputElement).value)}
                  type="text"
                  className="input w-full font-mono text-sm"
                  placeholder={
                    t(
                      'admin.settings.gatewayForwarding.openaiCodexUserAgentPlaceholder',
                    )
                  }
                />
                <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
                  {t(
                      "admin.settings.gatewayForwarding.openaiCodexUserAgentHint",
                    )}
                </p>
              </div>

              {/* 是否允许在 Claude Code 中使用 Codex 插件（全局开关） */}
              <div className="flex items-center justify-between">
                <div className="pr-4">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    {t("admin.settings.gatewayForwarding.openaiAllowClaudeCodeCodexPlugin")}
                  </label>
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    {t("admin.settings.gatewayForwarding.openaiAllowClaudeCodeCodexPluginDesc")}
                  </p>
                </div>
                <Toggle modelValue={form.openai_allow_claude_code_codex_plugin} onUpdateModelValue={(v) => __set("form.openai_allow_claude_code_codex_plugin", v)} />
              </div>
            </div>
          </div>
          {/* Web Search Emulation */}
          <div className="card">
            <div
              className="border-b border-gray-100 px-6 py-4 dark:border-dark-700"
            >
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                {t("admin.settings.webSearchEmulation.title")}
              </h2>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                {t("admin.settings.webSearchEmulation.description")}
              </p>
            </div>
            <div className="space-y-5 p-6">
              {/* Global Toggle */}
              <div className="flex items-center justify-between">
                <div>
                  <label
                    className="text-sm font-medium text-gray-700 dark:text-gray-300"
                  >
                    {t("admin.settings.webSearchEmulation.enabled")}
                  </label>
                  <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                    {t("admin.settings.webSearchEmulation.enabledHint")}
                  </p>
                </div>
                <Toggle modelValue={webSearchConfig.enabled} onUpdateModelValue={(v) => __set("webSearchConfig.enabled", v)} />
              </div>

              {/* Providers */}
              <div className="space-y-4" style={{ display: (webSearchConfig.enabled) ? undefined : 'none' }}>
                <div className="flex items-center justify-between">
                  <label
                    className="text-sm font-medium text-gray-700 dark:text-gray-300"
                  >
                    {t("admin.settings.webSearchEmulation.providers")}
                  </label>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => addWebSearchProvider()}
                  >
                    {t("admin.settings.webSearchEmulation.addProvider")}
                  </button>
                </div>

                <div className="rounded-lg border border-dashed border-gray-300 p-4 text-center text-sm text-gray-400 dark:border-dark-600" style={{ display: (webSearchConfig.providers.length === 0) ? undefined : 'none' }}>
                  {t("admin.settings.webSearchEmulation.noProviders")}
                </div>

                {webSearchConfig.providers.map((provider, pIdx) => (<div
                  className="rounded-lg border border-gray-200 dark:border-dark-600"
                 key={pIdx}>
                  {/* Collapsible header */}
                  <div
                    className="flex cursor-pointer items-center justify-between px-4 py-3"
                    onClick={(e) => toggleProviderExpand(pIdx)}
                  >
                    <div className="flex items-center gap-3">
                      <svg
                        className={`h-4 w-4 text-gray-400 transition-transform ${expandedProviders[pIdx] ? 'rotate-90' : ''}`}
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth="2"
                          d="M9 5l7 7-7 7"
                        />
                      </svg>
                      <Select
                        modelValue={provider.type} onUpdateModelValue={(v) => __set("provider.type", v)}
                        options={[
                          { value: 'brave', label: 'Brave Search' },
                          { value: 'tavily', label: 'Tavily' },
                        ]}
                        className="w-36"
                        
                      />
                      {/* Quota summary (always visible) */}
                      <span className="text-xs text-gray-400">
                        {provider.quota_used ?? 0} /
                        {provider.quota_limit != null &&
                          provider.quota_limit > 0
                            ? provider.quota_limit
                            : "∞"}
                      </span>
                      <span className="text-xs text-green-500" style={{ display: (
                          !expandedProviders[pIdx] &&
                          provider.api_key_configured
                        ) ? undefined : 'none' }}>
                        {t(
                            "admin.settings.webSearchEmulation.apiKeyConfigured",
                          )}
                      </span>
                    </div>
                    <button
                      type="button"
                      className="text-red-500 hover:text-red-700 text-xs"
                      onClick={(e) => { e.stopPropagation(); removeWebSearchProvider(pIdx) }}
                    >
                      {t("admin.settings.webSearchEmulation.removeProvider")}
                    </button>
                  </div>

                  {/* Expanded content */}
                  <div className="space-y-3 border-t border-gray-100 px-4 pb-4 pt-3 dark:border-dark-700" style={{ display: (expandedProviders[pIdx]) ? undefined : 'none' }}>
                    {/* API Key with inline show/copy */}
                    <div>
                      <label className="text-xs text-gray-500">{t("admin.settings.webSearchEmulation.apiKey")}</label>
                      <div className="relative">
                        <input
                          value={provider.api_key ?? ''} onChange={(e) => __set("provider.api_key", (e.target as HTMLInputElement).value)}
                          type={apiKeyVisible[pIdx] ? 'text' : 'password'}
                          className={`input w-full text-sm ${provider.api_key || provider.api_key_configured ? 'pr-16' : ''}`}
                          placeholder={
                            provider.api_key_configured
                              ? '••••••••'
                              : t(
                                  'admin.settings.webSearchEmulation.apiKeyPlaceholder',
                                )
                          }
                        />
                        <div className="absolute inset-y-0 right-0 flex items-center pr-1.5" style={{ display: (provider.api_key || provider.api_key_configured) ? undefined : 'none' }}>
                          <button
                            type="button"
                            className="rounded p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                            title={
                              apiKeyVisible[pIdx]
                                ? t(
                                    'admin.settings.webSearchEmulation.hideApiKey',
                                  )
                                : t(
                                    'admin.settings.webSearchEmulation.showApiKey',
                                  )
                            }
                            onClick={() => apiKeyVisible[pIdx] = !apiKeyVisible[pIdx]}
                          >
                            <svg className="h-4 w-4"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor" style={{ display: (!apiKeyVisible[pIdx]) ? undefined : 'none' }}>
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth="2"
                                d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                              />
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth="2"
                                d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                              />
                            </svg>
                            <svg className="h-4 w-4"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor" style={{ display: (apiKeyVisible[pIdx]) ? undefined : 'none' }}>
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth="2"
                                d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L3 3m6.878 6.878L21 21"
                              />
                            </svg>
                          </button>
                          <button
                            type="button"
                            className={`rounded p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300${!provider.api_key ? ' opacity-30 cursor-not-allowed' : ''}`}
                            title={
                              t('admin.settings.webSearchEmulation.copyApiKey')
                            }
                            disabled={!provider.api_key}
                            onClick={() => copyApiKey(pIdx)}
                          >
                            <svg
                              className="h-4 w-4"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth="2"
                                d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                              />
                            </svg>
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Quota + Subscription in compact row */}
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs text-gray-500">{t("admin.settings.webSearchEmulation.quotaLimit")}</label>
                        <input
                          value={provider.quota_limit ?? ''} onChange={(e) => __set("provider.quota_limit", (e.target as HTMLInputElement).value)}
                          type="number"
                          min="1"
                          className="input text-sm"
                          placeholder={'∞'}
                        />
                        <p className="mt-0.5 text-xs text-gray-400">
                          {t(
                              "admin.settings.webSearchEmulation.quotaLimitHint",
                            )}
                        </p>
                      </div>
                      <div>
                        <label className="text-xs text-gray-500">{t("admin.settings.webSearchEmulation.subscribedAt")}</label>
                        <input
                          value={formatSubscribedAt(provider.subscribed_at)}
                          type="date"
                          className="input text-sm"
                          onInput={(e) => 
                            provider.subscribed_at = parseSubscribedAt(
                              (e.target as HTMLInputElement).value,
                            )
                          }
                        />
                        <p className="mt-0.5 text-xs text-gray-400">
                          {t(
                              "admin.settings.webSearchEmulation.subscribedAtHint",
                            )}
                        </p>
                      </div>
                    </div>

                    {/* Usage display */}
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-500">
                        {t('admin.settings.webSearchEmulation.quotaUsage')}:
                      </span>
                      <div
                        className="h-1.5 flex-1 rounded-full bg-gray-200 dark:bg-dark-600"
                        style={{
                          display:
                            provider.quota_limit != null && provider.quota_limit > 0
                              ? undefined
                              : 'none',
                        }}
                      >
                        <div
                          className={`h-full rounded-full transition-all duration-300 ${
                            quotaPercentage(provider) > 90
                              ? 'bg-red-500'
                              : quotaPercentage(provider) > 70
                                ? 'bg-yellow-500'
                                : 'bg-green-500'
                          }`}
                          style={{
                            width: `${Math.min(quotaPercentage(provider), 100)}%`,
                          }}
                        />
                      </div>
                      <div
                        className="flex-1"
                        style={{
                          display:
                            provider.quota_limit != null && provider.quota_limit > 0
                              ? 'none'
                              : undefined,
                        }}
                      >
                      <span className="text-xs text-gray-500">
                        {provider.quota_used ?? 0} /{' '}
                        {provider.quota_limit != null && provider.quota_limit > 0
                          ? provider.quota_limit
                          : '∞'}
                      </span>
                      <button type="button"
                        className="text-xs text-primary-600 hover:text-primary-700"
                        onClick={(e) => resetWebSearchUsage(pIdx)} style={{ display: ((provider.quota_used ?? 0) > 0) ? undefined : 'none' }}>
                        {t("admin.settings.webSearchEmulation.resetUsage")}
                      </button>
                    </div>
                    </div>

                    {/* Proxy + Test on same row */}
                    <div className="flex items-end gap-3">
                      <div className="flex-1">
                        <label className="text-xs text-gray-500">{t("admin.settings.webSearchEmulation.proxy")}</label>
                        <ProxySelector
                          modelValue={provider.proxy_id} onUpdateModelValue={(v) => __set("provider.proxy_id", v)}
                          proxies={webSearchProxies}
                        />
                      </div>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm whitespace-nowrap"
                        onClick={() => openTestDialog()}
                      >
                        {t("admin.settings.webSearchEmulation.test")}
                      </button>
                    </div>
                  </div>
                </div>
                ))}
              </div>
            </div>
          </div>

          {/* Web Search Test Dialog */}
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
            style={{ display: wsTestDialogOpen ? undefined : 'none' }} onClick={(e) => { if (e.target === e.currentTarget) setWsTestDialogOpen(false) }}>
            <div
              className="mx-4 w-full max-w-lg rounded-xl bg-white p-6 shadow-xl dark:bg-dark-800"
            >
              <h3
                className="mb-4 text-lg font-semibold text-gray-900 dark:text-white"
              >
                {t("admin.settings.webSearchEmulation.testResultTitle")}
              </h3>
              <div className="flex items-center gap-2">
                <input
                  value={wsTestQuery ?? ''} onChange={(e) => __set("wsTestQuery", (e.target as HTMLInputElement).value)}
                  type="text"
                  className="input flex-1 text-sm"
                  placeholder={
                    t('admin.settings.webSearchEmulation.testDefaultQuery')
                  }
                  onKeyUp={(e) => { if (e.key === 'Enter') testWebSearchProvider() }}
                />
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  disabled={wsTestLoading}
                  onClick={() => testWebSearchProvider()}
                >
                  {wsTestLoading
                      ? t("admin.settings.webSearchEmulation.testing")
                      : t("admin.settings.webSearchEmulation.test")}
                </button>
              </div>
              {/* Test results */}
              <div className="mt-4 max-h-80 overflow-y-auto rounded-lg bg-gray-50 p-4 dark:bg-dark-700" style={{ display: (wsTestResult) ? undefined : 'none' }}>
                {wsTestResult ? (
                <>
                <p
                  className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300"
                >
                  {t("admin.settings.webSearchEmulation.testResultProvider")}: {wsTestResult.provider}
                </p>
                <div className="text-sm text-gray-400" style={{ display: (wsTestResult.results.length === 0) ? undefined : 'none' }}>
                  {t("admin.settings.webSearchEmulation.testNoResults")}
                </div>
                {wsTestResult.results.map((r, rIdx) => (
                  <div
                    className="mt-2 border-t border-gray-200 pt-2 first:mt-0 first:border-0 first:pt-0 dark:border-dark-600"
                    key={rIdx}
                  >
                  <a
                    href={r.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sm font-medium text-blue-600 hover:underline dark:text-blue-400"
                  >
                    {r.title}
                  </a>
                  <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                    {r.snippet}
                  </p>
                </div>
                ))}
                </>
                ) : null}
              </div>
              <div className="mt-4 flex justify-end">
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => setWsTestDialogOpen(false)}
                >
                  {t("common.close")}
                </button>
              </div>
            </div>
          </div>

        {/* Usage Records Settings */}
        <div className="card">
          <div className="border-b border-gray-100 px-6 py-4 dark:border-dark-700">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              {t('admin.settings.usageRecords.title')}
            </h2>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              {t('admin.settings.usageRecords.description')}
            </p>
          </div>
          <div className="space-y-4 p-6">
            {/* User error requests visibility */}
            <div className="flex items-center justify-between">
              <div>
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  {t('admin.settings.user_error_view.label')}
                </label>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {t('admin.settings.user_error_view.description')}
                </p>
              </div>
              <label className="toggle">
                <input checked={form.allow_user_view_error_requests ?? false} onChange={(e) => __set("form.allow_user_view_error_requests", (e.target as HTMLInputElement).checked)} type="checkbox" />
                <span className="toggle-slider"></span>
              </label>
            </div>
          </div>
        </div>
        </div>
        {/* /Tab: Gateway — Claude Code, Scheduling */}

        {/* Tab: General */}
        <div style={{ display: (activeTab === 'general') ? undefined : 'none' }} className="space-y-6">
          {/* Site Settings */}
          <div className="card">
            <div
              className="border-b border-gray-100 px-6 py-4 dark:border-dark-700"
            >
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                {t("admin.settings.site.title")}
              </h2>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                {t("admin.settings.site.description")}
              </p>
            </div>
            <div className="space-y-6 p-6">
              {/* Backend Mode */}
              <div
                className="flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-900/20"
              >
                <div>
                  <h3 className="text-sm font-medium text-gray-900 dark:text-white">
                    {t("admin.settings.site.backendMode")}
                  </h3>
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    {t("admin.settings.site.backendModeDescription")}
                  </p>
	                </div>
	                <Toggle modelValue={form.backend_mode_enabled} onUpdateModelValue={(v) => __set("form.backend_mode_enabled", v)} />
	              </div>

	              <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                <div>
                  <label
                    className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300"
                  >
                    {t("admin.settings.site.siteName")}
                  </label>
                  <input
                    value={form.site_name ?? ''} onChange={(e) => __set("form.site_name", (e.target as HTMLInputElement).value)}
                    type="text"
                    className="input"
                    placeholder={t('admin.settings.site.siteNamePlaceholder')}
                  />
                  <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
                    {t("admin.settings.site.siteNameHint")}
                  </p>
                </div>
                <div>
                  <label
                    className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300"
                  >
                    {t("admin.settings.site.siteSubtitle")}
                  </label>
                  <input
                    value={form.site_subtitle ?? ''} onChange={(e) => __set("form.site_subtitle", (e.target as HTMLInputElement).value)}
                    type="text"
                    className="input"
                    placeholder={
                      t('admin.settings.site.siteSubtitlePlaceholder')
                    }
                  />
                  <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
                    {t("admin.settings.site.siteSubtitleHint")}
                  </p>
                </div>
              </div>

              {/* API Base URL */}
              <div>
                <label
                  className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300"
                >
                  {t("admin.settings.site.apiBaseUrl")}
                </label>
                <input
                  value={form.api_base_url ?? ''} onChange={(e) => __set("form.api_base_url", (e.target as HTMLInputElement).value)}
                  type="text"
                  className="input font-mono text-sm"
                  placeholder={t('admin.settings.site.apiBaseUrlPlaceholder')}
                />
                <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
                  {t("admin.settings.site.apiBaseUrlHint")}
                </p>
              </div>

              {/* Global Table Preferences */}
              <div className="border-t border-gray-100 pt-4 dark:border-dark-700">
                <h3 className="text-sm font-medium text-gray-900 dark:text-white">
                  {t("admin.settings.site.tablePreferencesTitle")}
                </h3>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  {t("admin.settings.site.tablePreferencesDescription")}
                </p>
                <div className="mt-4 grid grid-cols-1 gap-6 md:grid-cols-2">
                  <div>
                    <label
                      className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300"
                    >
                      {t("admin.settings.site.tableDefaultPageSize")}
                    </label>
                    <input
                      value={form.table_default_page_size ?? ''} onChange={(e) => __set("form.table_default_page_size", Number((e.target as HTMLInputElement).value))}
                      type="number"
                      min="5"
                      max="1000"
                      step="1"
                      className="input w-40"
                    />
                    <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
                      {t("admin.settings.site.tableDefaultPageSizeHint")}
                    </p>
                  </div>
                  <div>
                    <label
                      className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300"
                    >
                      {t("admin.settings.site.tablePageSizeOptions")}
                    </label>
                    <input
                      value={tablePageSizeOptionsInput ?? ''} onChange={(e) => __set("tablePageSizeOptionsInput", (e.target as HTMLInputElement).value)}
                      type="text"
                      className="input font-mono text-sm"
                      placeholder={
                        t('admin.settings.site.tablePageSizeOptionsPlaceholder')
                      }
                    />
                    <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
                      {t("admin.settings.site.tablePageSizeOptionsHint")}
                    </p>
                  </div>
                </div>
              </div>

              {/* Custom Endpoints */}
              <div>
                <label
                  className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300"
                >
                  {t("admin.settings.site.customEndpoints.title")}
                </label>
                <p className="mb-3 text-xs text-gray-500 dark:text-gray-400">
                  {t("admin.settings.site.customEndpoints.description")}
                </p>

                <div className="space-y-3">
                  {form.custom_endpoints.map((ep, index) => (<div
                    className="rounded-lg border border-gray-200 p-4 dark:border-dark-600"
                   key={index}>
                    <div className="mb-3 flex items-center justify-between">
                      <span
                        className="text-sm font-medium text-gray-700 dark:text-gray-300"
                      >
                        {t("admin.settings.site.customEndpoints.itemLabel", {
                            n: index + 1,
                          })}
                      </span>
                      <button
                        type="button"
                        className="rounded p-1 text-red-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20"
                        onClick={(e) => removeEndpoint(index)}
                      >
                        <svg
                          className="h-4 w-4"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth="2"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                          />
                        </svg>
                      </button>
                    </div>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div>
                        <label
                          className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400"
                        >
                          {t("admin.settings.site.customEndpoints.name")}
                        </label>
                        <input
                          value={ep.name ?? ''} onChange={(e) => __set("ep.name", (e.target as HTMLInputElement).value)}
                          type="text"
                          className="input text-sm"
                          placeholder={
                            t(
                              'admin.settings.site.customEndpoints.namePlaceholder',
                            )
                          }
                        />
                      </div>
                      <div>
                        <label
                          className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400"
                        >
                          {t("admin.settings.site.customEndpoints.endpointUrl")}
                        </label>
                        <input
                          value={ep.endpoint ?? ''} onChange={(e) => __set("ep.endpoint", (e.target as HTMLInputElement).value)}
                          type="url"
                          className="input font-mono text-sm"
                          placeholder={
                            t(
                              'admin.settings.site.customEndpoints.endpointUrlPlaceholder',
                            )
                          }
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <label
                          className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400"
                        >
                          {t(
                              "admin.settings.site.customEndpoints.descriptionLabel",
                            )}
                        </label>
                        <input
                          value={ep.description ?? ''} onChange={(e) => __set("ep.description", (e.target as HTMLInputElement).value)}
                          type="text"
                          className="input text-sm"
                          placeholder={
                            t(
                              'admin.settings.site.customEndpoints.descriptionPlaceholder',
                            )
                          }
                        />
                      </div>
                    </div>
                  </div>))}

                </div>
                <button
                  type="button"
                  className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-gray-300 px-4 py-2.5 text-sm text-gray-500 transition-colors hover:border-primary-400 hover:text-primary-600 dark:border-dark-600 dark:text-gray-400 dark:hover:border-primary-500 dark:hover:text-primary-400"
                  onClick={() => addEndpoint()}
                >
                  <svg
                    className="h-4 w-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M12 4v16m8-8H4"
                    />
                  </svg>
                  {t("admin.settings.site.customEndpoints.add")}
                </button>
              </div>

              {/* Contact Info */}
              <div>
                <label
                  className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300"
                >
                  {t("admin.settings.site.contactInfo")}
                </label>
                <input
                  value={form.contact_info ?? ''} onChange={(e) => __set("form.contact_info", (e.target as HTMLInputElement).value)}
                  type="text"
                  className="input"
                  placeholder={t('admin.settings.site.contactInfoPlaceholder')}
                />
                <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
                  {t("admin.settings.site.contactInfoHint")}
                </p>
              </div>

              {/* Doc URL */}
              <div>
                <label
                  className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300"
                >
                  {t("admin.settings.site.docUrl")}
                </label>
                <input
                  value={form.doc_url ?? ''} onChange={(e) => __set("form.doc_url", (e.target as HTMLInputElement).value)}
                  type="url"
                  className="input font-mono text-sm"
                  placeholder={t('admin.settings.site.docUrlPlaceholder')}
                />
                <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
                  {t("admin.settings.site.docUrlHint")}
                </p>
              </div>

              {/* Site Logo Upload */}
              <div>
                <label
                  className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300"
                >
                  {t("admin.settings.site.siteLogo")}
                </label>
                <ImageUpload
                  value={form.site_logo}
                  onChange={(v) => __set("form.site_logo", v)}
                  mode="image"
                  uploadLabel={t('admin.settings.site.uploadImage')}
                  removeLabel={t('admin.settings.site.remove')}
                  hint={t('admin.settings.site.logoHint')}
                  maxSize={300 * 1024}
                />
              </div>

              {/* Home Content */}
              <div>
                <label
                  className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300"
                >
                  {t("admin.settings.site.homeContent")}
                </label>
                <textarea
                  value={form.home_content ?? ''} onChange={(e) => __set("form.home_content", e.target.value)}
                  rows={6}
                  className="input font-mono text-sm"
                  placeholder={t('admin.settings.site.homeContentPlaceholder')}
                ></textarea>
                <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
                  {t("admin.settings.site.homeContentHint")}
                </p>
                {/* iframe CSP Warning */}
                <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
                  {t("admin.settings.site.homeContentIframeWarning")}
                </p>
              </div>

              {/* Hide CCS Import Button */}
              <div
                className="flex items-center justify-between border-t border-gray-100 pt-4 dark:border-dark-700"
              >
                <div>
                  <label className="font-medium text-gray-900 dark:text-white">{t("admin.settings.site.hideCcsImportButton")}</label>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {t("admin.settings.site.hideCcsImportButtonHint")}
                  </p>
                </div>
                <Toggle modelValue={form.hide_ccs_import_button} onUpdateModelValue={(v) => __set("form.hide_ccs_import_button", v)} />
              </div>
            </div>
          </div>

          {/* Custom Menu Items */}
          <div className="card">
            <div
              className="border-b border-gray-100 px-6 py-4 dark:border-dark-700"
            >
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                {t("admin.settings.customMenu.title")}
              </h2>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                {t("admin.settings.customMenu.description")}
              </p>
            </div>
            <div className="space-y-4 p-6">
              {/* Existing menu items */}
              {form.custom_menu_items.map((item, index) => (<div
                className="rounded-lg border border-gray-200 p-4 dark:border-dark-600"
               key={index}>
                <div className="mb-3 flex items-center justify-between">
                  <span
                    className="text-sm font-medium text-gray-700 dark:text-gray-300"
                  >
                    {t("admin.settings.customMenu.itemLabel", { n: index + 1 })}
                  </span>
                  <div className="flex items-center gap-2">
                    {/* Move up */}
                    <button type="button"
                      className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-dark-700"
                      title={t('admin.settings.customMenu.moveUp')}
                      onClick={(e) => moveMenuItem(index, -1)} style={{ display: (index > 0) ? undefined : 'none' }}>
                      <svg
                        className="h-4 w-4"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M5 15l7-7 7 7"
                        />
                      </svg>
                    </button>
                    {/* Move down */}
                    <button type="button"
                      className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-dark-700"
                      title={t('admin.settings.customMenu.moveDown')}
                      onClick={(e) => moveMenuItem(index, 1)} style={{ display: (index < form.custom_menu_items.length - 1) ? undefined : 'none' }}>
                      <svg
                        className="h-4 w-4"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M19 9l-7 7-7-7"
                        />
                      </svg>
                    </button>
                    {/* Delete */}
                    <button
                      type="button"
                      className="rounded p-1 text-red-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20"
                      title={t('admin.settings.customMenu.remove')}
                      onClick={(e) => removeMenuItem(index)}
                    >
                      <svg
                        className="h-4 w-4"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                        />
                      </svg>
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {/* Label */}
                  <div>
                    <label
                      className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400"
                    >
                      {t("admin.settings.customMenu.name")}
                    </label>
                    <input
                      value={item.label ?? ''} onChange={(e) => __set("item.label", (e.target as HTMLInputElement).value)}
                      type="text"
                      className="input text-sm"
                      placeholder={
                        t('admin.settings.customMenu.namePlaceholder')
                      }
                    />
                  </div>

                  {/* Visibility */}
                  <div>
                    <label
                      className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400"
                    >
                      {t("admin.settings.customMenu.visibility")}
                    </label>
                    <select value={item.visibility ?? ''} onChange={(e) => { item.visibility = e.target.value as 'user' | 'admin'; bump() }} className="input text-sm">
                      <option value="user">
                        {t("admin.settings.customMenu.visibilityUser")}
                      </option>
                      <option value="admin">
                        {t("admin.settings.customMenu.visibilityAdmin")}
                      </option>
                    </select>
                  </div>

                  {/* URL (full width) */}
                  <div className="sm:col-span-2">
                    <label
                      className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400"
                    >
                      {t("admin.settings.customMenu.url")}
                    </label>
                    <input
                      value={item.url ?? ''} onChange={(e) => __set("item.url", (e.target as HTMLInputElement).value)}
                      type="url"
                      className="input font-mono text-sm"
                      placeholder={
                        t('admin.settings.customMenu.urlPlaceholder')
                      }
                    />
                  </div>

                  {/* SVG Icon (full width) */}
                  <div className="sm:col-span-2">
                    <label
                      className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400"
                    >
                      {t("admin.settings.customMenu.iconSvg")}
                    </label>
                    <ImageUpload
                      value={item.icon_svg ?? ''}
                      onChange={(v) => { item.icon_svg = v; bump() }}
                      mode="svg"
                      size="sm"
                      uploadLabel={t('admin.settings.customMenu.uploadSvg')}
                      removeLabel={t('admin.settings.customMenu.removeSvg')}
                    />
                  </div>
                </div>
              </div>))}

              {/* Add button */}
              <button
                type="button"
                className="flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-gray-300 py-3 text-sm text-gray-500 transition-colors hover:border-primary-400 hover:text-primary-600 dark:border-dark-600 dark:text-gray-400 dark:hover:border-primary-500 dark:hover:text-primary-400"
                onClick={() => addMenuItem()}
              >
                <svg
                  className="h-4 w-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 4v16m8-8H4"
                  />
                </svg>
                {t("admin.settings.customMenu.add")}
              </button>
            </div>
          </div>
	        </div>
	        {/* /Tab: General */}

	        {/* Tab: Login Agreement */}
	        <div style={{ display: (activeTab === 'agreement') ? undefined : 'none' }} className="space-y-6">
	          <div className="card">
	            <div className="border-b border-gray-100 px-6 py-4 dark:border-dark-700">
	              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
	                <div>
	                  <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
	                    {localText("登录条款确认", "Login agreement")}
	                  </h2>
	                  <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
	                    {localText(
	                        "控制登录页是否要求用户先阅读并同意服务条款、隐私政策或其他 Markdown 文档。",
	                        "Control whether the login page requires users to accept Markdown policy documents first.",
	                      )}
	                  </p>
	                </div>
	                <div className="flex items-center gap-3">
	                  <span className="text-sm text-gray-600 dark:text-gray-300">
	                    {form.login_agreement_enabled ? localText("已启用", "Enabled") : localText("未启用", "Disabled")}
	                  </span>
	                  <Toggle modelValue={form.login_agreement_enabled} onUpdateModelValue={(v) => __set("form.login_agreement_enabled", v)} />
	                </div>
	              </div>
	            </div>

	            <div className="space-y-6 p-6">
	              <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_220px]">
	                <div>
	                  <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
	                    {localText("展示形式", "Display mode")}
	                  </label>
	                  <div className="grid grid-cols-2 gap-2 rounded-lg bg-gray-100 p-1 dark:bg-dark-700">
                    <button
                      type="button"
                      className={`inline-flex items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition ${
                        form.login_agreement_mode === 'modal'
                          ? 'bg-white text-primary-700 shadow-sm dark:bg-dark-800 dark:text-primary-300'
                          : 'text-gray-600 hover:text-gray-900 dark:text-dark-300 dark:hover:text-white'
                      }`}
                      onClick={() => { form.login_agreement_mode = 'modal'; bump() }}
                    >
                      <Icon name="shield" size="sm" />
                      {localText("弹窗", "Modal")}
                    </button>
                    <button
                      type="button"
                      className={`inline-flex items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition ${
                        form.login_agreement_mode === 'checkbox'
                          ? 'bg-white text-primary-700 shadow-sm dark:bg-dark-800 dark:text-primary-300'
                          : 'text-gray-600 hover:text-gray-900 dark:text-dark-300 dark:hover:text-white'
                      }`}
                      onClick={() => { form.login_agreement_mode = 'checkbox'; bump() }}
                    >
                      <Icon name="checkCircle" size="sm" />
                      {localText("复选框", "Checkbox")}
                    </button>
                  </div>
                  <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
                    {form.login_agreement_mode === "checkbox"
                        ? localText("复选框会显示在登录按钮下方，未勾选前所有登录入口禁用。", "The checkbox appears below the login button and gates all login actions.")
                        : localText("弹窗会在登录页打开，用户拒绝后所有登录入口保持禁用。", "The modal opens on the login page and gates all login actions until accepted.")}
                  </p>
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    {localText("条款更新日期", "Updated date")}
                  </label>
                  <input
                    value={form.login_agreement_updated_at ?? ''} onChange={(e) => __set("form.login_agreement_updated_at", (e.target as HTMLInputElement).value)}
                    type="date"
                    className="input"
                  />
                  <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
                    {localText("日期或文档内容变化后，用户需要重新同意。", "Changing the date or content requires fresh consent.")}
                  </p>
                </div>
              </div>

              <div>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h3 className="text-sm font-medium text-gray-900 dark:text-white">
                      {localText("协议文档", "Agreement documents")}
                    </h3>
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                      {localText(
                          "文档名称可自定义，内容按 Markdown 保存。可参考：服务条款、使用政策、支持的国家和地区、服务特定条款。",
                          "Document titles are customizable and content is saved as Markdown.",
                        )}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="btn btn-primary btn-sm inline-flex items-center gap-1.5"
                    onClick={() => addLoginAgreementDocument()}
                  >
                    <Icon name="plus" size="sm" />
                    {localText("添加文档", "Add document")}
                  </button>
                </div>

                <div className="mt-4 space-y-3">
                  {form.login_agreement_documents.map((doc, index) => (<div
                    className="rounded-lg border border-gray-200 bg-white p-4 dark:border-dark-700 dark:bg-dark-800/60"
                   key={index}>
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-md bg-gray-100 text-gray-700 dark:bg-dark-700 dark:text-dark-200">
                          <Icon
                            name={
                              index === 1
                                ? 'shield'
                                : index === 2
                                  ? 'globe'
                                  : index === 3
                                    ? 'cog'
                                    : 'document'
                            }
                            size="sm"
                          />
                        </span>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-gray-900 dark:text-white">
                            {doc.title || localText("未命名文档", "Untitled document")}
                          </p>
                          <p className="truncate text-xs text-gray-500 dark:text-gray-400">
                            {loginAgreementRoutePath(doc, index)}
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        className="rounded-md p-2 text-red-400 transition hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-40 dark:hover:bg-red-900/20"
                        disabled={
                          form.login_agreement_enabled &&
                          form.login_agreement_documents.length <= 1
                        }
                        onClick={(e) => removeLoginAgreementDocument(index)}
                      >
                        <Icon name="trash" size="sm" />
                      </button>
                    </div>

                    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                      <div>
                        <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">
                          {localText("文档名称", "Document title")}
                        </label>
                        <input
                          value={doc.title ?? ''} onChange={(e) => __set("doc.title", (e.target as HTMLInputElement).value)}
                          type="text"
                          className="input text-sm"
                          placeholder={localText('例如：服务条款', 'Example: Terms of Service')}
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">
                          {localText("路由标识", "Route slug")}
                        </label>
                        <div className="flex overflow-hidden rounded-lg border border-gray-300 bg-white focus-within:border-primary-500 focus-within:ring-1 focus-within:ring-primary-500 dark:border-dark-600 dark:bg-dark-900">
                          <span className="inline-flex flex-shrink-0 items-center border-r border-gray-200 bg-gray-50 px-3 text-sm text-gray-500 dark:border-dark-700 dark:bg-dark-800 dark:text-dark-400">
                            /legal/
                          </span>
                          <input
                            value={doc.id ?? ''} onChange={(e) => __set("doc.id", (e.target as HTMLInputElement).value)}
                            type="text"
                            className="min-w-0 flex-1 border-0 bg-transparent px-3 py-2 text-sm text-gray-900 outline-none placeholder:text-gray-400 focus:ring-0 dark:text-white dark:placeholder:text-dark-500"
                            placeholder="usage-policy"
                          />
                        </div>
                      </div>
                    </div>
                    <div className="mt-3">
                      <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">
                        {localText("Markdown 内容", "Markdown content")}
                      </label>
                        <textarea
                          value={doc.content_md ?? ''} onChange={(e) => __set("doc.content_md", e.target.value)}
                          rows={8}
                          className="input font-mono text-sm"
                          placeholder={localText('在这里填写正式 Markdown 内容。', 'Write the final Markdown content here.')}
                        ></textarea>
                    </div>
                  </div>))}
                </div>
              </div>
            </div>
          </div>
        </div>
        {/* /Tab: Login Agreement */}

	        {/* Tab: Features (功能开关) */}
        <div style={{ display: (activeTab === 'features') ? undefined : 'none' }} className="space-y-6">

        <div className="card">
          <div className="border-b border-gray-100 px-6 py-4 dark:border-dark-700">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              {t('admin.settings.features.channelMonitor.title')}
            </h2>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              {t('admin.settings.features.channelMonitor.description')}
            </p>
            <p className="mt-1.5 text-xs">
              <Link
                href="/admin/channels/monitor"
                className="inline-flex items-center gap-1 text-primary-600 hover:underline dark:text-primary-400"
              >
                {t('admin.settings.features.channelMonitor.configureLink')}
                <span aria-hidden="true">→</span>
              </Link>
            </p>
          </div>
          <div className="space-y-5 p-6">
            <div className="flex items-center justify-between">
              <div>
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  {t('admin.settings.features.channelMonitor.enabled')}
                </label>
                <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                  {t('admin.settings.features.channelMonitor.enabledHint')}
                </p>
              </div>
              <Toggle modelValue={form.channel_monitor_enabled} onUpdateModelValue={(v) => __set("form.channel_monitor_enabled", v)} />
            </div>

            <div style={{ display: (form.channel_monitor_enabled) ? undefined : 'none' }}>
              <label className="input-label">
                {t('admin.settings.features.channelMonitor.defaultInterval')}
                <span className="text-red-500">*</span>
              </label>
              <input
                value={form.channel_monitor_default_interval_seconds ?? ''} onChange={(e) => __set("form.channel_monitor_default_interval_seconds", Number((e.target as HTMLInputElement).value))}
                type="number"
                min="15"
                max="3600"
                className="input"
              />
              <p className="mt-1 text-xs text-gray-400">
                {t('admin.settings.features.channelMonitor.defaultIntervalHint')}
              </p>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="border-b border-gray-100 px-6 py-4 dark:border-dark-700">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              {t('admin.settings.features.availableChannels.title')}
            </h2>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              {t('admin.settings.features.availableChannels.description')}
            </p>
            <p className="mt-1.5 text-xs">
              <Link
                href="/admin/channels/pricing"
                className="inline-flex items-center gap-1 text-primary-600 hover:underline dark:text-primary-400"
              >
                {t('admin.settings.features.availableChannels.configureLink')}
                <span aria-hidden="true">→</span>
              </Link>
            </p>
          </div>
          <div className="space-y-5 p-6">
            <div className="flex items-center justify-between">
              <div>
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  {t('admin.settings.features.availableChannels.enabled')}
                </label>
                <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                  {t('admin.settings.features.availableChannels.enabledHint')}
                </p>
              </div>
              <Toggle modelValue={form.available_channels_enabled} onUpdateModelValue={(v) => __set("form.available_channels_enabled", v)} />
            </div>
          </div>
        </div>

        <div className="card">
          <div className="border-b border-gray-100 px-6 py-4 dark:border-dark-700">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              {t('admin.settings.features.riskControl.title')}
            </h2>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              {t('admin.settings.features.riskControl.description')}
            </p>
            <p className="mt-1.5 text-xs">
              <Link
                href="/admin/risk-control"
                className="inline-flex items-center gap-1 text-primary-600 hover:underline dark:text-primary-400"
              >
                {t('admin.settings.features.riskControl.configureLink')}
                <span aria-hidden="true">→</span>
              </Link>
            </p>
          </div>
          <div className="space-y-5 p-6">
            <div className="flex items-center justify-between">
              <div>
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  {t('admin.settings.features.riskControl.enabled')}
                </label>
                <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                  {t('admin.settings.features.riskControl.enabledHint')}
                </p>
              </div>
              <Toggle modelValue={form.risk_control_enabled} onUpdateModelValue={(v) => __set("form.risk_control_enabled", v)} />
            </div>
          </div>
        </div>

        {/* Affiliate (邀请返利) feature card */}
        <div className="card">
          <div className="border-b border-gray-100 px-6 py-4 dark:border-dark-700">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              {t('admin.settings.features.affiliate.title')}
            </h2>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              {t('admin.settings.features.affiliate.description')}
            </p>
          </div>
          <div className="space-y-5 p-6">
            <div className="flex items-center justify-between">
              <div>
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  {t('admin.settings.features.affiliate.enabled')}
                </label>
                <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                  {t('admin.settings.features.affiliate.enabledHint')}
                </p>
              </div>
              <Toggle modelValue={form.affiliate_enabled} onUpdateModelValue={(v) => __set("form.affiliate_enabled", v)} />
            </div>

            <div className="space-y-6" style={{ display: (form.affiliate_enabled) ? undefined : 'none' }}>
              <div>
                <label className="input-label">
                  {t('admin.settings.features.affiliate.rebateRate')}
                </label>
                <div className="relative">
                  <input
                    value={form.affiliate_rebate_rate ?? ''} onChange={(e) => __set("form.affiliate_rebate_rate", Number((e.target as HTMLInputElement).value))}
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    className="input pr-8"
                    placeholder="20"
                  />
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">%</span>
                </div>
                <p className="mt-1 text-xs text-gray-400">
                  {t('admin.settings.features.affiliate.rebateRateHint')}
                </p>
              </div>

              <div>
                <label className="input-label">
                  {t('admin.settings.features.affiliate.freezeHours')}
                </label>
                <input
                  value={form.affiliate_rebate_freeze_hours ?? ''} onChange={(e) => __set("form.affiliate_rebate_freeze_hours", Number((e.target as HTMLInputElement).value))}
                  type="number"
                  step="1"
                  min="0"
                  max="720"
                  className="input"
                />
                <p className="mt-1 text-xs text-gray-400">
                  {t('admin.settings.features.affiliate.freezeHoursDesc')}
                </p>
              </div>

              <div>
                <label className="input-label">
                  {t('admin.settings.features.affiliate.durationDays')}
                </label>
                <input
                  value={form.affiliate_rebate_duration_days ?? ''} onChange={(e) => __set("form.affiliate_rebate_duration_days", Number((e.target as HTMLInputElement).value))}
                  type="number"
                  step="1"
                  min="0"
                  max="3650"
                  className="input"
                />
                <p className="mt-1 text-xs text-gray-400">
                  {t('admin.settings.features.affiliate.durationDaysDesc')}
                </p>
              </div>

              <div>
                <label className="input-label">
                  {t('admin.settings.features.affiliate.perInviteeCap')}
                </label>
                <input
                  value={form.affiliate_rebate_per_invitee_cap ?? ''} onChange={(e) => __set("form.affiliate_rebate_per_invitee_cap", Number((e.target as HTMLInputElement).value))}
                  type="number"
                  step="0.01"
                  min="0"
                  className="input"
                />
                <p className="mt-1 text-xs text-gray-400">
                  {t('admin.settings.features.affiliate.perInviteeCapDesc')}
                </p>
              </div>

              {/* 专属用户管理 */}
              <div className="border-t border-gray-100 pt-6 dark:border-dark-700">
                <div className="mb-3 flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
                      {t('admin.settings.features.affiliate.customUsers.title')}
                    </h3>
                    <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                      {t('admin.settings.features.affiliate.customUsers.description')}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={(e) => openAffiliateModal(null)}
                  >
                    + {t('admin.settings.features.affiliate.customUsers.addButton')}
                  </button>
                </div>

                <div className="mb-3 flex items-center gap-2">
                  <input
                    value={affiliateState.search ?? ''} onChange={(e) => __set("affiliateState.search", (e.target as HTMLInputElement).value)}
                    type="text"
                    className="input flex-1"
                    placeholder={t('admin.settings.features.affiliate.customUsers.searchPlaceholder')}
                    onInput={() => onAffiliateSearchInput()}
                  />
                  <button type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => openAffiliateBatchModal()} style={{ display: (affiliateState.selected.length > 0) ? undefined : 'none' }}>
                    {t('admin.settings.features.affiliate.customUsers.batchButton', { count: affiliateState.selected.length })}
                  </button>
                </div>

                <div className="overflow-hidden rounded-lg border border-gray-200 dark:border-dark-700">
                  <table className="min-w-full divide-y divide-gray-200 dark:divide-dark-700">
                    <thead className="bg-gray-50 dark:bg-dark-800">
                      <tr>
                        <th className="px-3 py-2 text-left">
                          <input
                            type="checkbox"
                            checked={affiliateState.entries.length > 0 && affiliateState.selected.length === affiliateState.entries.length}
                            onChange={(e) => toggleAffiliateSelectAll(e)}
                          />
                        </th>
                        <th className="px-3 py-2 text-left text-xs font-medium uppercase text-gray-500">{t('admin.settings.features.affiliate.customUsers.col.email')}</th>
                        <th className="px-3 py-2 text-left text-xs font-medium uppercase text-gray-500">{t('admin.settings.features.affiliate.customUsers.col.username')}</th>
                        <th className="px-3 py-2 text-left text-xs font-medium uppercase text-gray-500">{t('admin.settings.features.affiliate.customUsers.col.code')}</th>
                        <th className="px-3 py-2 text-left text-xs font-medium uppercase text-gray-500">{t('admin.settings.features.affiliate.customUsers.col.rate')}</th>
                        <th className="px-3 py-2 text-left text-xs font-medium uppercase text-gray-500">{t('admin.settings.features.affiliate.customUsers.col.actions')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 bg-white dark:divide-dark-700 dark:bg-dark-900">
                      <tr style={{ display: (affiliateState.loading) ? undefined : 'none' }}>
                        <td colSpan={6} className="px-3 py-6 text-center text-sm text-gray-500">
                          {t('common.loading')}
                        </td>
                      </tr>
                      <tr style={{ display: (!affiliateState.loading && affiliateState.entries.length === 0) ? undefined : 'none' }}>
                        <td colSpan={6} className="px-3 py-6 text-center text-sm text-gray-500">
                          {t('admin.settings.features.affiliate.customUsers.empty')}
                        </td>
                      </tr>
                      {affiliateState.entries.map((entry, idx) => (<tr key={entry.user_id}>
                        <td className="px-3 py-2">
                          <input
                            type="checkbox"
                            checked={affiliateState.selected.includes(entry.user_id)}
                            onChange={(e) => toggleAffiliateSelect(entry.user_id)}
                          />
                        </td>
                        <td className="px-3 py-2 text-sm text-gray-900 dark:text-white">{entry.email}</td>
                        <td className="px-3 py-2 text-sm text-gray-600 dark:text-gray-300">{entry.username}</td>
                        <td className="px-3 py-2 text-sm font-mono">
                          {entry.aff_code}
                          <span className="ml-1 inline-block rounded bg-primary-100 px-1.5 py-0.5 text-[10px] font-medium text-primary-700 dark:bg-primary-900/30 dark:text-primary-300" style={{ display: (entry.aff_code_custom) ? undefined : 'none' }}>{t('admin.settings.features.affiliate.customUsers.customBadge')}</span>
                        </td>
                        <td className="px-3 py-2 text-sm">
                          <span style={{ display: (entry.aff_rebate_rate_percent != null) ? undefined : 'none' }}>{entry.aff_rebate_rate_percent}%</span>
                          <span className="text-gray-400" style={{ display: (entry.aff_rebate_rate_percent == null) ? undefined : 'none' }}>{t('admin.settings.features.affiliate.customUsers.useGlobal')}</span>
                        </td>
                        <td className="px-3 py-2 text-sm">
                          <div className="flex items-center gap-2">
                            <button type="button" className="text-primary-600 hover:underline" onClick={(e) => openAffiliateModal(entry)}>
                              {t('common.edit')}
                            </button>
                            <button
                              type="button"
                              className="text-red-600 hover:underline"
                              onClick={(e) => askResetAffiliateUser(entry)}
                            >
                              {t('common.delete')}
                            </button>
                          </div>
                        </td>
                      </tr>))}
                    </tbody>
                  </table>
                </div>

                <div className="mt-3 flex items-center justify-between text-sm" style={{ display: (affiliateState.total > affiliateState.pageSize) ? undefined : 'none' }}>
                  <span className="text-gray-500">
                    {t('admin.settings.features.affiliate.customUsers.totalLabel', { total: affiliateState.total })}
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      disabled={affiliateState.page <= 1}
                      onClick={(e) => changeAffiliatePage(affiliateState.page - 1)}
                    >
                      {t('pagination.previous')}
                    </button>
                    <span className="text-gray-500">{affiliateState.page} / {Math.max(1, Math.ceil(affiliateState.total / affiliateState.pageSize))}</span>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      disabled={affiliateState.page >= Math.ceil(affiliateState.total / affiliateState.pageSize)}
                      onClick={(e) => changeAffiliatePage(affiliateState.page + 1)}
                    >
                      {t('pagination.next')}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Affiliate add/edit modal */}
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          style={{ display: affiliateModal.open ? undefined : 'none' }} onClick={(e) => { if (e.target === e.currentTarget) closeAffiliateModal() }}>
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl dark:bg-dark-900">
            <h3 className="mb-4 text-lg font-semibold">
              {affiliateModal.mode === 'add' ? t('admin.settings.features.affiliate.modal.addTitle') : t('admin.settings.features.affiliate.modal.editTitle')}
            </h3>
            <div className="space-y-4">
              <div style={{ display: (affiliateModal.mode === 'add') ? undefined : 'none' }}>
                <label className="input-label">{t('admin.settings.features.affiliate.modal.userLabel')}</label>
                {/* Chip showing the picked user; clicking it re-opens the search */}
                <div className="flex items-center justify-between rounded-md border border-primary-200 bg-primary-50 px-3 py-2 dark:border-primary-700/50 dark:bg-primary-900/20" style={{ display: (affiliateModal.selectedUser) ? undefined : 'none' }}>
                  <div className="text-sm">
                    <span className="font-medium text-gray-900 dark:text-white">{affiliateModal.selectedUser?.email}</span>
                    <span className="ml-1 text-xs text-gray-500">({affiliateModal.selectedUser?.username})</span>
                  </div>
                  <button
                    type="button"
                    className="text-lg leading-none text-gray-400 hover:text-red-600"
                    title={t('admin.settings.features.affiliate.modal.changeUser')}
                    onClick={() => clearSelectedAffiliateUser()}
                  >
                    ×
                  </button>
                </div>
                {/* Search input + result dropdown — hidden once a selection is made */}
                <div style={{ display: (!(affiliateState.total > affiliateState.pageSize)) ? undefined : 'none' }}>
                  <input
                    value={affiliateModal.userQuery ?? ''} onChange={(e) => __set("affiliateModal.userQuery", (e.target as HTMLInputElement).value)}
                    type="text"
                    className="input"
                    placeholder={t('admin.settings.features.affiliate.modal.userPlaceholder')}
                    onInput={() => onAffiliateUserSearchInput()}
                  />
                  <div style={{ display: (affiliateModal.userResults.length > 0) ? undefined : 'none' }}
                    className="mt-1 max-h-40 overflow-y-auto rounded border border-gray-200 dark:border-dark-700"
                  >
                    {affiliateModal.userResults.map((u, idx) => (<button type="button"
                      className="w-full px-3 py-1.5 text-left text-sm hover:bg-gray-100 dark:hover:bg-dark-800"
                      onClick={(e) => selectAffiliateUser(u)} key={u.id}>
                      {u.email} <span className="text-xs text-gray-500">({u.username})</span>
                    </button>))}
                  </div>
                </div>
              </div>
              <div style={{ display: affiliateModal.editingEntry ? undefined : 'none' }}>
                <label className="input-label">{t('admin.settings.features.affiliate.modal.userLabel')}</label>
                <input
                  type="text"
                  className="input"
                  value={affiliateModal.editingEntry ? affiliateModal.editingEntry.email : ''}
                  disabled
                />
              </div>

              <div>
                <label className="input-label">{t('admin.settings.features.affiliate.modal.codeLabel')}</label>
                <input
                  value={affiliateModal.code ?? ''} onChange={(e) => __set("affiliateModal.code", (e.target as HTMLInputElement).value)}
                  type="text"
                  className="input font-mono"
                  placeholder={t('admin.settings.features.affiliate.modal.codePlaceholder')}
                  maxLength={32}
                />
                <p className="mt-1 text-xs text-gray-400">
                  {t('admin.settings.features.affiliate.modal.codeHint')}
                </p>
              </div>

              <div>
                <label className="input-label">{t('admin.settings.features.affiliate.modal.rateLabel')}</label>
                <div className="relative">
                  <input
                    value={affiliateModal.rate ?? ''} onChange={(e) => __set("affiliateModal.rate", (e.target as HTMLInputElement).value)}
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    className="input pr-8"
                    placeholder={t('admin.settings.features.affiliate.modal.ratePlaceholder')}
                  />
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">%</span>
                </div>
                <p className="mt-1 text-xs text-gray-400">
                  {t('admin.settings.features.affiliate.modal.rateHint')}
                </p>
              </div>
            </div>

            <div className="mt-6 flex items-center justify-between gap-3">
              <p className="text-xs text-gray-500 dark:text-gray-400" style={{ display: (!affiliateModalCanSubmit) ? undefined : 'none' }}>
                {t('admin.settings.features.affiliate.modal.errorEmpty')}
              </p>
              <span style={{ display: (!(!affiliateModalCanSubmit)) ? undefined : 'none' }}></span>
              <div className="flex gap-2">
                <button type="button" className="btn btn-secondary" onClick={() => closeAffiliateModal()}>
                  {t('common.cancel')}
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={affiliateModal.saving || !affiliateModalCanSubmit}
                  onClick={() => submitAffiliateModal()}
                >
                  {affiliateModal.saving ? t('common.saving') : t('common.save')}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Affiliate batch rate modal */}
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          style={{ display: affiliateBatchModal.open ? undefined : 'none' }} onClick={(e) => { if (e.target === e.currentTarget) { affiliateBatchModal.open = false; bump() } }}>
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl dark:bg-dark-900">
            <h3 className="mb-4 text-lg font-semibold">
              {t('admin.settings.features.affiliate.batchModal.title', { count: affiliateState.selected.length })}
            </h3>
            <p className="mb-4 text-sm text-gray-500">
              {t('admin.settings.features.affiliate.batchModal.hint')}
            </p>
            <div className="relative">
              <input
                value={affiliateBatchModal.rate ?? ''} onChange={(e) => __set("affiliateBatchModal.rate", (e.target as HTMLInputElement).value)}
                type="number"
                step="0.01"
                min="0"
                max="100"
                className="input pr-8"
                placeholder={t('admin.settings.features.affiliate.batchModal.placeholder')}
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">%</span>
            </div>
            <p className="mt-2 text-xs text-gray-400">
              {t('admin.settings.features.affiliate.batchModal.clearHint')}
            </p>
            <div className="mt-6 flex justify-end gap-2">
              <button type="button" className="btn btn-secondary" onClick={() => affiliateBatchModal.open = false}>
                {t('common.cancel')}
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={affiliateBatchModal.saving}
                onClick={() => submitAffiliateBatchModal()}
              >
                {affiliateBatchModal.saving ? t('common.saving') : t('common.save')}
              </button>
            </div>
          </div>
        </div>

        </div>{/* /Tab: Features */}

        {/* Tab: Email */}
        {/* Tab: Payment */}
        <div style={{ display: (activeTab === 'payment') ? undefined : 'none' }} className="space-y-6">
          {/* Payment System Settings */}
          <div className="card">
            <div
              className="border-b border-gray-100 px-6 py-4 dark:border-dark-700"
            >
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                {t("admin.settings.payment.title")}
              </h2>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                {t("admin.settings.payment.description")}
                <a
                  href={paymentGuideHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ml-2 inline-flex items-center text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300"
                >
                  <svg
                    className="mr-0.5 h-3.5 w-3.5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                    />
                  </svg>
                  {t("admin.settings.payment.configGuide")}
                </a>
              </p>
            </div>
            <div className="space-y-4 p-6">
              {/* Enable toggle */}
              <div className="flex items-center justify-between">
                <div>
                  <label className="font-medium text-gray-900 dark:text-white">{t("admin.settings.payment.enabled")}</label>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {t("admin.settings.payment.enabledHint")}
                  </p>
                </div>
                <Toggle modelValue={form.payment_enabled} onUpdateModelValue={(v) => __set("form.payment_enabled", v)} />
              </div>
              <div style={{ display: (form.payment_enabled) ? undefined : 'none' }}>
                {/* Row 1: Product name */}
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="input-label">{t("admin.settings.payment.productNamePrefix")}</label
                    ><input
                      value={form.payment_product_name_prefix ?? ''} onChange={(e) => __set("form.payment_product_name_prefix", (e.target as HTMLInputElement).value)}
                      type="text"
                      className="input"
                      placeholder="Sub2API"
                    />
                  </div>
                  <div>
                    <label className="input-label">{t("admin.settings.payment.productNameSuffix")}</label
                    ><input
                      value={form.payment_product_name_suffix ?? ''} onChange={(e) => __set("form.payment_product_name_suffix", (e.target as HTMLInputElement).value)}
                      type="text"
                      className="input"
                      placeholder="CNY"
                    />
                  </div>
                  <div>
                    <label className="input-label">{t("admin.settings.payment.preview")}</label>
                    <div
                      className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-600 dark:border-dark-600 dark:bg-dark-800 dark:text-gray-300"
                    >
                      {(form.payment_product_name_prefix || "Sub2API") +
                        " 100 " +
                        (form.payment_product_name_suffix || "CNY")}
                    </div>
                  </div>
                </div>
                {/* Row 2: Balance toggle + amounts */}
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                  <div>
                    <label className="input-label">{t("admin.settings.payment.minAmount")}</label
                    ><input
                      value={form.payment_min_amount || ''}
                      onInput={(e) => 
                        form.payment_min_amount =
                          parseFloat(
                            (e.target as HTMLInputElement).value,
                          ) || 0
                      }
                      type="number"
                      step="0.01"
                      min="0"
                      className="input"
                      placeholder={t('admin.settings.payment.noLimit')}
                    />
                  </div>
                  <div>
                    <label className="input-label">{t("admin.settings.payment.maxAmount")}</label
                    ><input
                      value={form.payment_max_amount || ''}
                      onInput={(e) => 
                        form.payment_max_amount =
                          parseFloat(
                            (e.target as HTMLInputElement).value,
                          ) || 0
                      }
                      type="number"
                      step="0.01"
                      min="0"
                      className="input"
                      placeholder={t('admin.settings.payment.noLimit')}
                    />
                  </div>
                  <div>
                    <label className="input-label">{t("admin.settings.payment.dailyLimit")}</label
                    ><input
                      value={form.payment_daily_limit || ''}
                      onInput={(e) => 
                        form.payment_daily_limit =
                          parseFloat(
                            (e.target as HTMLInputElement).value,
                          ) || 0
                      }
                      type="number"
                      step="0.01"
                      min="0"
                      className="input"
                      placeholder={t('admin.settings.payment.noLimit')}
                    />
                  </div>
                  <div>
                    <label className="input-label">{t("admin.settings.payment.balanceRechargeMultiplier")}</label>
                    <input
                      value={form.payment_balance_recharge_multiplier || ''}
                      onInput={(e) => 
                        form.payment_balance_recharge_multiplier =
                          parseFloat(
                            (e.target as HTMLInputElement).value,
                          ) || 1
                      }
                      type="number"
                      step="0.01"
                      min="0.01"
                      className="input"
                    />
                    <p className="mt-0.5 text-xs text-gray-400">
                      {t(
                          "admin.settings.payment.balanceRechargeMultiplierHint",
                        )}
                    </p>
                    <p
                      className="mt-1 text-xs font-medium text-primary-600 dark:text-primary-400"
                    >
                      {t("admin.settings.payment.balanceRechargePreview", {
                          usd: (
                            Number(form.payment_balance_recharge_multiplier) ||
                            1
                          ).toFixed(2),
                        })}
                    </p>
                  </div>
                  <div>
                    <label className="input-label">{t("admin.settings.payment.rechargeFeeRate")}</label>
                    <div className="relative">
                      <input
                        value={form.payment_recharge_fee_rate ?? ''}
                        onInput={(e) => 
                          form.payment_recharge_fee_rate = Math.min(
                            100,
                            Math.max(
                              0,
                              Math.round(
                                parseFloat(
                                  (e.target as HTMLInputElement).value ||
                                    '0',
                                ) * 100,
                              ) / 100,
                            ),
                          )
                        }
                        type="number"
                        step="0.01"
                        min="0"
                        max="100"
                        className="input pr-8"
                      />
                      <span
                        className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3 text-gray-400"
                        >%</span
                      >
                    </div>
                    <p className="mt-0.5 text-xs text-gray-400">
                      {t("admin.settings.payment.rechargeFeeRateHint")}
                    </p>
                    <p className="mt-1 text-xs font-medium text-primary-600 dark:text-primary-400" style={{ display: ((Number(form.payment_recharge_fee_rate) || 0) > 0) ? undefined : 'none' }}>
                      {t("admin.settings.payment.rechargeFeePreview", {
                          fee: (
                            Number(form.payment_recharge_fee_rate) || 0
                          ).toFixed(2),
                        })}
                    </p>
                  </div>
                  <div>
                    <label className="input-label"
                      >{t("admin.settings.payment.orderTimeout")}
                      <span className="text-red-500">*</span></label
                    ><input
                      value={form.payment_order_timeout_minutes ?? ''} onChange={(e) => __set("form.payment_order_timeout_minutes", Number((e.target as HTMLInputElement).value))}
                      type="number"
                      min="1"
                      className="input"
                      required
                    />
                    <p className="mt-0.5 text-xs text-gray-400">
                      {t("admin.settings.payment.orderTimeoutHint")}
                    </p>
                  </div>
                </div>
                {/* Row 3: Pending orders + load balance + cancel rate limit (all in one row) */}
                <div className="flex flex-wrap items-end gap-4">
                  <div className="w-28">
                    <label className="input-label">{t("admin.settings.payment.maxPendingOrders")}</label
                    ><input
                      value={form.payment_max_pending_orders ?? ''} onChange={(e) => __set("form.payment_max_pending_orders", Number((e.target as HTMLInputElement).value))}
                      type="number"
                      min="1"
                      className="input"
                    />
                  </div>
                  <div>
                    <label className="input-label">{t("admin.settings.payment.loadBalanceStrategy")}</label>
                    <Select
                      modelValue={form.payment_load_balance_strategy} onUpdateModelValue={(v) => __set("form.payment_load_balance_strategy", v)}
                      options={loadBalanceOptions}
                      className="w-40"
                    />
                  </div>
                  <div>
                    <label className="input-label">{t("admin.settings.payment.cancelRateLimit")}</label>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 ${
                          form.payment_cancel_rate_limit_enabled
                            ? 'bg-primary-500'
                            : 'bg-gray-300 dark:bg-dark-600'
                        }`}
                        onClick={() => {
                          form.payment_cancel_rate_limit_enabled =
                            !form.payment_cancel_rate_limit_enabled
                        }}
                      >
                        <span
                          className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                            form.payment_cancel_rate_limit_enabled
                              ? 'translate-x-5'
                              : 'translate-x-0'
                          }`}
                        />
                      </button>
                      <Select
                        modelValue={form.payment_cancel_rate_limit_window_mode} onUpdateModelValue={(v) => __set("form.payment_cancel_rate_limit_window_mode", v)}
                        options={cancelRateLimitModeOptions}
                        className="w-24"
                        disabled={!form.payment_cancel_rate_limit_enabled}
                      />
                      <span
                        className={`text-sm whitespace-nowrap ${
                          form.payment_cancel_rate_limit_enabled
                            ? 'text-gray-700 dark:text-gray-300'
                            : 'text-gray-400 dark:text-gray-600'
                        }`}
                      >
                        {t('admin.settings.payment.cancelRateLimitEvery')}
                      </span>
                      <input
                        value={form.payment_cancel_rate_limit_window ?? ''} onChange={(e) => __set("form.payment_cancel_rate_limit_window", Number((e.target as HTMLInputElement).value))}
                        type="number"
                        min="1"
                        required
                        className="input w-14 text-center"
                        disabled={!form.payment_cancel_rate_limit_enabled}
                      />
                      <Select
                        modelValue={form.payment_cancel_rate_limit_unit} onUpdateModelValue={(v) => __set("form.payment_cancel_rate_limit_unit", v)}
                        options={cancelRateLimitUnitOptions}
                        className="w-28"
                        disabled={!form.payment_cancel_rate_limit_enabled}
                      />
                      <span
                        className={`text-sm whitespace-nowrap ${
                          form.payment_cancel_rate_limit_enabled
                            ? 'text-gray-700 dark:text-gray-300'
                            : 'text-gray-400 dark:text-gray-600'
                        }`}
                      >
                        {t('admin.settings.payment.cancelRateLimitAllowMax')}
                      </span>
                      <input
                        value={form.payment_cancel_rate_limit_max ?? ''} onChange={(e) => __set("form.payment_cancel_rate_limit_max", Number((e.target as HTMLInputElement).value))}
                        type="number"
                        min="1"
                        required
                        className="input w-14 text-center"
                        disabled={!form.payment_cancel_rate_limit_enabled}
                      />
                      <span
                        className={`text-sm whitespace-nowrap ${
                          form.payment_cancel_rate_limit_enabled
                            ? 'text-gray-700 dark:text-gray-300'
                            : 'text-gray-400 dark:text-gray-600'
                        }`}
                      >
                        {t('admin.settings.payment.cancelRateLimitTimes')}
                      </span>
                    </div>
                  </div>
                  <div>
                    <label className="input-label">{t("admin.settings.payment.alipayForceQRCode")}</label>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 ${
                          form.payment_alipay_force_qrcode
                            ? 'bg-primary-500'
                            : 'bg-gray-300 dark:bg-dark-600'
                        }`}
                        onClick={() => {
                          form.payment_alipay_force_qrcode = !form.payment_alipay_force_qrcode
                        }}
                      >
                        <span
                          className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                            form.payment_alipay_force_qrcode
                              ? 'translate-x-5'
                              : 'translate-x-0'
                          }`}
                        />
                      </button>
                      <span className="text-sm text-gray-500 dark:text-gray-400">{t("admin.settings.payment.alipayForceQRCodeHint")}</span>
                    </div>
                  </div>
                </div>
                {/* Row 4: Enabled payment types (provider badges like sub2apipay) */}
                <div>
                  <label className="input-label">{t("admin.settings.payment.enabledPaymentTypes")}</label>
                  <div className="mt-1.5 flex flex-wrap gap-2">
                    {allPaymentTypes.map((pt) => (
                      <button
                        key={pt.value}
                        type="button"
                        onClick={() => togglePaymentType(pt.value)}
                        className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition-all ${
                          isPaymentTypeEnabled(pt.value)
                            ? 'border-primary-500 bg-primary-500 text-white shadow-sm'
                            : 'border-gray-300 bg-white text-gray-600 hover:border-gray-400 hover:bg-gray-50 dark:border-dark-600 dark:bg-dark-800 dark:text-gray-300 dark:hover:border-dark-500'
                        }`}
                      >
                        {pt.label}
                      </button>
                    ))}
                  </div>
                  <p className="mt-2 text-xs text-gray-400 dark:text-gray-500">
                    {t("admin.settings.payment.enabledPaymentTypesHint")}
                    <a
                      href={paymentMethodsHref}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ml-1 text-primary-500 hover:text-primary-600 dark:text-primary-400 dark:hover:text-primary-300"
                    >
                      {t("admin.settings.payment.findProvider")}
                      <svg
                        className="mb-0.5 ml-0.5 inline h-3 w-3"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth="2"
                          d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                        />
                      </svg>
                    </a>
                  </p>
                </div>
                {/* Row 5: Help image + text */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="input-label">{t("admin.settings.payment.helpImage")}</label>
                    <ImageUpload
                      value={form.payment_help_image_url}
                      onChange={(v) => __set("form.payment_help_image_url", v)}
                      uploadLabel={t('admin.settings.site.uploadImage')}
                      removeLabel={t('admin.settings.site.remove')}
                    />
                  </div>
                  <div>
                    <label className="input-label">{t("admin.settings.payment.helpText")}</label>
                    <textarea
                      value={form.payment_help_text ?? ''} onChange={(e) => __set("form.payment_help_text", e.target.value)}
                      rows={3}
                      className="input"
                      placeholder={
                        t('admin.settings.payment.helpTextPlaceholder')
                      }
                    ></textarea>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Provider Management */}
          <PaymentProviderList providers={providers}
            loading={providersLoading}
            canCreate={hasAnyPaymentTypeEnabled}
            enabledPaymentTypes={form.payment_enabled_types}
            allPaymentTypes={allPaymentTypes}
            redirectLabel={t('admin.settings.payment.easypayRedirect')}
            onRefresh={() => loadProviders()}
            onCreate={() => openCreateProvider()}
            onEdit={(provider) => openEditProvider(provider)}
            onDelete={(provider) => confirmDeleteProvider(provider)}
            onToggleField={(provider, field) => handleToggleField(provider, field)}
            onToggleType={(provider, type) => handleToggleType(provider, type)}
            onReorder={(items) => handleReorderProviders(items)}
           />
        </div>

        <div style={{ display: (activeTab === 'email') ? undefined : 'none' }} className="space-y-6">
          {/* Email disabled hint - show when email_verify_enabled is off */}
          <div className="card" style={{ display: (!form.email_verify_enabled) ? undefined : 'none' }}>
            <div className="p-6">
              <div className="flex items-start gap-3">
                <Icon
                  name="mail"
                  size="md"
                  className="mt-0.5 flex-shrink-0 text-gray-400 dark:text-gray-500"
                />
                <div>
                  <h3 className="font-medium text-gray-900 dark:text-white">
                    {t("admin.settings.emailTabDisabledTitle")}
                  </h3>
                  <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                    {t("admin.settings.emailTabDisabledHint")}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* SMTP Settings - Only show when email verification is enabled */}
          <div className="card" style={{ display: (form.email_verify_enabled) ? undefined : 'none' }}>
            <div
              className="flex items-center justify-between border-b border-gray-100 px-6 py-4 dark:border-dark-700"
            >
              <div>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                  {t("admin.settings.smtp.title")}
                </h2>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  {t("admin.settings.smtp.description")}
                </p>
              </div>
              <button
                type="button"
                onClick={() => testSmtpConnection()}
                disabled={testingSmtp || loadFailed}
                className="btn btn-secondary btn-sm"
              >
                <svg className="h-4 w-4 animate-spin"
                  fill="none"
                  viewBox="0 0 24 24" style={{ display: (testingSmtp) ? undefined : 'none' }}>
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  ></circle>
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  ></path>
                </svg>
                {testingSmtp
                    ? t("admin.settings.smtp.testing")
                    : t("admin.settings.smtp.testConnection")}
              </button>
            </div>
            <div className="space-y-6 p-6">
              <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                <div>
                  <label
                    className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300"
                  >
                    {t("admin.settings.smtp.host")}
                  </label>
                  <input
                    value={form.smtp_host ?? ''} onChange={(e) => __set("form.smtp_host", (e.target as HTMLInputElement).value)}
                    type="text"
                    className="input"
                    placeholder={t('admin.settings.smtp.hostPlaceholder')}
                  />
                </div>
                <div>
                  <label
                    className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300"
                  >
                    {t("admin.settings.smtp.port")}
                  </label>
                  <input
                    value={form.smtp_port ?? ''} onChange={(e) => __set("form.smtp_port", Number((e.target as HTMLInputElement).value))}
                    type="number"
                    min="1"
                    max="65535"
                    className="input"
                    placeholder={t('admin.settings.smtp.portPlaceholder')}
                  />
                </div>
                <div>
                  <label
                    className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300"
                  >
                    {t("admin.settings.smtp.username")}
                  </label>
                  <input
                    value={form.smtp_username ?? ''} onChange={(e) => __set("form.smtp_username", (e.target as HTMLInputElement).value)}
                    type="text"
                    className="input"
                    placeholder={t('admin.settings.smtp.usernamePlaceholder')}
                  />
                </div>
                <div>
                  <label
                    className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300"
                  >
                    {t("admin.settings.smtp.password")}
                  </label>
                  <input
                    value={form.smtp_password ?? ''} onChange={(e) => __set("form.smtp_password", (e.target as HTMLInputElement).value)}
                    type="password"
                    className="input"
                    autoComplete="new-password"
                    autoCapitalize="off"
                    spellCheck={false}
                    onKeyDown={() => setSmtpPasswordManuallyEdited(true)}
                    onPaste={() => setSmtpPasswordManuallyEdited(true)}
                    placeholder={
                      form.smtp_password_configured
                        ? t('admin.settings.smtp.passwordConfiguredPlaceholder')
                        : t('admin.settings.smtp.passwordPlaceholder')
                    }
                  />
                  <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
                    {form.smtp_password_configured
                        ? t("admin.settings.smtp.passwordConfiguredHint")
                        : t("admin.settings.smtp.passwordHint")}
                  </p>
                </div>
                <div>
                  <label
                    className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300"
                  >
                    {t("admin.settings.smtp.fromEmail")}
                  </label>
                  <input
                    value={form.smtp_from_email ?? ''} onChange={(e) => __set("form.smtp_from_email", (e.target as HTMLInputElement).value)}
                    type="email"
                    className="input"
                    placeholder={t('admin.settings.smtp.fromEmailPlaceholder')}
                  />
                </div>
                <div>
                  <label
                    className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300"
                  >
                    {t("admin.settings.smtp.fromName")}
                  </label>
                  <input
                    value={form.smtp_from_name ?? ''} onChange={(e) => __set("form.smtp_from_name", (e.target as HTMLInputElement).value)}
                    type="text"
                    className="input"
                    placeholder={t('admin.settings.smtp.fromNamePlaceholder')}
                  />
                </div>
              </div>

              {/* Use TLS Toggle */}
              <div
                className="flex items-center justify-between border-t border-gray-100 pt-4 dark:border-dark-700"
              >
                <div>
                  <label className="font-medium text-gray-900 dark:text-white">{t("admin.settings.smtp.useTls")}</label>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {t("admin.settings.smtp.useTlsHint")}
                  </p>
                </div>
                <Toggle modelValue={form.smtp_use_tls} onUpdateModelValue={(v) => __set("form.smtp_use_tls", v)} />
              </div>
            </div>
          </div>

          {/* Send Test Email - Only show when email verification is enabled */}
          <div className="card" style={{ display: (form.email_verify_enabled) ? undefined : 'none' }}>
            <div
              className="border-b border-gray-100 px-6 py-4 dark:border-dark-700"
            >
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                {t("admin.settings.testEmail.title")}
              </h2>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                {t("admin.settings.testEmail.description")}
              </p>
            </div>
            <div className="p-6">
              <div className="flex items-end gap-4">
                <div className="flex-1">
                  <label
                    className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300"
                  >
                    {t("admin.settings.testEmail.recipientEmail")}
                  </label>
                  <input
                    value={testEmailAddress ?? ''} onChange={(e) => __set("testEmailAddress", (e.target as HTMLInputElement).value)}
                    type="email"
                    className="input"
                    placeholder={
                      t('admin.settings.testEmail.recipientEmailPlaceholder')
                    }
                  />
                </div>
                <button
                  type="button"
                  onClick={() => sendTestEmail()}
                  disabled={
                    sendingTestEmail || !testEmailAddress || loadFailed
                  }
                  className="btn btn-secondary"
                >
                  <svg className="h-4 w-4 animate-spin"
                    fill="none"
                    viewBox="0 0 24 24" style={{ display: (sendingTestEmail) ? undefined : 'none' }}>
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    ></circle>
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    ></path>
                  </svg>
                  {sendingTestEmail
                      ? t("admin.settings.testEmail.sending")
                      : t("admin.settings.testEmail.sendTestEmail")}
                </button>
              </div>
            </div>
          </div>

          {/* 订阅到期提醒 */}
          <div className="card">
            <div
              className="border-b border-gray-100 px-6 py-4 dark:border-dark-700"
            >
              <h3 className="text-base font-medium text-gray-900 dark:text-white">
                {t("admin.settings.subscriptionExpiryNotify.title")}
              </h3>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                {t("admin.settings.subscriptionExpiryNotify.description")}
              </p>
            </div>
            <div className="px-6 py-6">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <label
                    className="mb-0 block text-sm font-medium text-gray-700 dark:text-gray-300"
                  >
                    {t("admin.settings.subscriptionExpiryNotify.enabled")}
                  </label>
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    {t("admin.settings.subscriptionExpiryNotify.enabledHint")}
                  </p>
                </div>
                <Toggle modelValue={form.subscription_expiry_notify_enabled} onUpdateModelValue={(v) => __set("form.subscription_expiry_notify_enabled", v)} />
              </div>
            </div>
          </div>

          <EmailTemplateEditor />

          {/* Balance Low Notification */}
          <div className="card">
            <div
              className="border-b border-gray-100 px-6 py-4 dark:border-dark-700"
            >
              <h3 className="text-base font-medium text-gray-900 dark:text-white">
                {t("admin.settings.balanceNotify.title")}
              </h3>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                {t("admin.settings.balanceNotify.description")}
              </p>
            </div>
            <div className="px-6 py-6 space-y-4">
              <div className="flex items-center justify-between">
                <label
                  className="mb-0 block text-sm font-medium text-gray-700 dark:text-gray-300"
                  >{t("admin.settings.balanceNotify.enabled")}</label
                >
                <Toggle modelValue={form.balance_low_notify_enabled} onUpdateModelValue={(v) => __set("form.balance_low_notify_enabled", v)} />
              </div>
              <div style={{ display: (form.balance_low_notify_enabled) ? undefined : 'none' }}>
                <label
                  className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300"
                  >{t("admin.settings.balanceNotify.threshold")}</label
                >
                <div className="relative">
                  <span
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                    >$</span
                  >
                  <input
                    value={form.balance_low_notify_threshold ?? ''} onChange={(e) => __set("form.balance_low_notify_threshold", Number((e.target as HTMLInputElement).value))}
                    type="number"
                    min="0"
                    step="0.01"
                    className="input pl-7"
                  />
                </div>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  {t("admin.settings.balanceNotify.thresholdHint")}
                </p>
              </div>
              <div>
                <label
                  className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300"
                  >{t("admin.settings.balanceNotify.rechargeUrl")}</label
                >
                <input
                  value={form.balance_low_notify_recharge_url ?? ''} onChange={(e) => __set("form.balance_low_notify_recharge_url", (e.target as HTMLInputElement).value)}
                  type="url"
                  className="input"
                  placeholder={currentOrigin}
                />
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  {t("admin.settings.balanceNotify.rechargeUrlHint")}
                </p>
              </div>
            </div>
          </div>

          {/* Account Quota Notification */}
          <div className="card">
            <div
              className="border-b border-gray-100 px-6 py-4 dark:border-dark-700"
            >
              <h3 className="text-base font-medium text-gray-900 dark:text-white">
                {t("admin.settings.quotaNotify.title")}
              </h3>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                {t("admin.settings.quotaNotify.description")}
              </p>
            </div>
            <div className="px-6 py-6 space-y-4">
              <div className="flex items-center justify-between">
                <label className="mb-0 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  {t('admin.settings.quotaNotify.enabled')}
                </label>
                <Toggle modelValue={form.account_quota_notify_enabled} onUpdateModelValue={(v) => __set('form.account_quota_notify_enabled', v)} />
              </div>
              <div style={{ display: form.account_quota_notify_enabled ? undefined : 'none' }}>
                <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  {t('admin.settings.quotaNotify.emails')}
                </label>
                <div className="space-y-2">
                  {(form.account_quota_notify_emails || []).map((entry, index) => (
                    <div className="flex items-center gap-2" key={index}>
                    <label
                      className="relative inline-flex items-center cursor-pointer shrink-0"
                    >
                      <input
                        type="checkbox"
                        checked={!entry.disabled}
                        onChange={() => { entry.disabled = !entry.disabled }}
                        className="sr-only peer"
                      />
                      <div
                        className="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer dark:bg-gray-600 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all dark:after:border-gray-500 peer-checked:bg-primary-600"
                      ></div>
                    </label>
                    <input
                      value={entry.email ?? ''} onChange={(e) => __set("entry.email", (e.target as HTMLInputElement).value)}
                      type="email"
                      className="input flex-1"
                      placeholder={
                        t('admin.settings.quotaNotify.emailPlaceholder')
                      }
                    />
                    <button
                      onClick={(e) => form.account_quota_notify_emails.splice(index, 1)}
                      className="btn btn-secondary px-2"
                      type="button"
                    >
                      <Icon name="x" size="xs" className="h-4 w-4" />
                    </button>
                  </div>
                  ))}
                  <button
                    onClick={() => addQuotaNotifyEmail()}
                    className="btn btn-secondary btn-sm"
                    type="button"
                  >
                    + {t('admin.settings.quotaNotify.addEmail')}
                  </button>
                </div>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  {t("admin.settings.quotaNotify.emailsHint")}
                </p>
              </div>
            </div>
          </div>
        </div>
        {/* /Tab: Email */}

        {/* Tab: Backup */}
        <div style={{ display: (activeTab === 'backup') ? undefined : 'none' }}>
          <BackupSettings />
        </div>

        {/* Save Button */}
        <div style={{ display: (activeTab !== 'backup') ? undefined : 'none' }} className="flex justify-end">
          <button
            type="submit"
            disabled={saving || loadFailed}
            className="btn btn-primary"
          >
            <svg className="h-4 w-4 animate-spin"
              fill="none"
              viewBox="0 0 24 24" style={{ display: (saving) ? undefined : 'none' }}>
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              ></circle>
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              ></path>
            </svg>
            {saving
                ? t("admin.settings.saving")
                : t("admin.settings.saveSettings")}
          </button>
        </div>
      </form>
        <PaymentProviderDialog
          ref={providerDialogRef}
          show={showProviderDialog}
          saving={providerSaving}
          editing={editingProvider}
          allKeyOptions={providerKeyOptions}
          enabledKeyOptions={enabledProviderKeyOptions}
          allPaymentTypes={allPaymentTypes}
          redirectLabel={t('admin.settings.payment.easypayRedirect')}
          onClose={() => setShowProviderDialog(false)}
          onSave={handleSaveProvider}
        />
        <ConfirmDialog
          show={showDeleteProviderDialog}
          title={t('admin.settings.payment.deleteProvider')}
          message={t('admin.settings.payment.deleteProviderConfirm')}
          confirmText={t('common.delete')}
          danger
          onConfirm={handleDeleteProvider}
          onCancel={() => setShowDeleteProviderDialog(false)}
        />
        <ConfirmDialog
          show={affiliateConfirmDialog.show}
          title={affiliateConfirmDialog.title}
          message={affiliateConfirmDialog.message}
          confirmText={affiliateConfirmDialog.confirmText}
          danger
          onConfirm={handleAffiliateConfirm}
          onCancel={cancelAffiliateConfirm}
        />
      </div>
    </AppLayout>
  )
}
