export interface RouteMeta {
  title: string
  description?: string
  originalComponent?: string
  requiresAuth?: boolean
  requiresAdmin?: boolean
  requiresPayment?: boolean
  requiresRiskControl?: boolean
}

export const routeMeta: Record<string, RouteMeta> = {
  '/home': { title: 'Home', description: 'Public landing page', originalComponent: 'HomeView.vue', requiresAuth: false },
  '/setup': { title: 'Setup', description: 'Initial setup wizard', originalComponent: 'SetupWizardView.vue', requiresAuth: false },
  '/login': { title: 'Login', description: 'User login page', originalComponent: 'LoginView.vue', requiresAuth: false },
  '/register': { title: 'Register', description: 'User registration page', originalComponent: 'RegisterView.vue', requiresAuth: false },
  '/email-verify': { title: 'Verify Email', description: 'Email verification page', originalComponent: 'EmailVerifyView.vue', requiresAuth: false },
  '/auth/callback': { title: 'OAuth Callback', description: 'OAuth callback handler', originalComponent: 'OAuthCallbackView.vue', requiresAuth: false },
  '/auth/oauth/callback': { title: 'OAuth Callback', description: 'OAuth callback alias', originalComponent: 'OAuthCallbackView.vue', requiresAuth: false },
  '/auth/linuxdo/callback': { title: 'LinuxDo OAuth Callback', description: 'LinuxDo auth callback', originalComponent: 'LinuxDoCallbackView.vue', requiresAuth: false },
  '/auth/wechat/callback': { title: 'WeChat OAuth Callback', description: 'WeChat auth callback', originalComponent: 'WechatCallbackView.vue', requiresAuth: false },
  '/auth/wechat/payment/callback': { title: 'WeChat Payment Callback', description: 'WeChat payment callback', originalComponent: 'WechatPaymentCallbackView.vue', requiresAuth: false },
  '/auth/dingtalk/callback': { title: 'DingTalk OAuth Callback', description: 'DingTalk auth callback', originalComponent: 'DingTalkCallbackView.vue', requiresAuth: false },
  '/auth/dingtalk/email-completion': { title: 'DingTalk Email Completion', description: 'DingTalk email completion page', originalComponent: 'DingTalkEmailCompletionView.vue', requiresAuth: false },
  '/auth/oidc/callback': { title: 'OIDC OAuth Callback', description: 'OIDC auth callback', originalComponent: 'OidcCallbackView.vue', requiresAuth: false },
  '/forgot-password': { title: 'Forgot Password', description: 'Request password reset', originalComponent: 'ForgotPasswordView.vue', requiresAuth: false },
  '/reset-password': { title: 'Reset Password', description: 'Reset user password', originalComponent: 'ResetPasswordView.vue', requiresAuth: false },
  '/key-usage': { title: 'Key Usage', description: 'Public API key usage page', originalComponent: 'KeyUsageView.vue', requiresAuth: false },
  '/dashboard': { title: 'Dashboard', description: 'User dashboard with statistics', originalComponent: 'DashboardView.vue', requiresAuth: true },
  '/keys': { title: 'API Keys', description: 'Manage API keys', originalComponent: 'KeysView.vue', requiresAuth: true },
  '/usage': { title: 'Usage Records', description: 'API usage records and statistics', originalComponent: 'UsageView.vue', requiresAuth: true },
  '/redeem': { title: 'Redeem Code', description: 'Redeem promo or voucher codes', originalComponent: 'RedeemView.vue', requiresAuth: true },
  '/affiliate': { title: 'Affiliate', description: 'Affiliate referral dashboard', originalComponent: 'AffiliateView.vue', requiresAuth: true },
  '/available-channels': { title: 'Available Channels', description: 'View available AI channels', originalComponent: 'AvailableChannelsView.vue', requiresAuth: true },
  '/profile': { title: 'Profile', description: 'User profile settings', originalComponent: 'ProfileView.vue', requiresAuth: true },
  '/subscriptions': { title: 'My Subscriptions', description: 'Manage your subscriptions', originalComponent: 'SubscriptionsView.vue', requiresAuth: true },
  '/purchase': { title: 'Purchase Subscription', description: 'Purchase or upgrade subscription', originalComponent: 'PaymentView.vue', requiresAuth: true, requiresPayment: true },
  '/orders': { title: 'My Orders', description: 'Purchase orders and payment history', originalComponent: 'UserOrdersView.vue', requiresAuth: true, requiresPayment: true },
  '/payment/qrcode': { title: 'Payment', description: 'QR code payment flow', originalComponent: 'PaymentQRCodeView.vue', requiresAuth: true, requiresPayment: true },
  '/payment/result': { title: 'Payment Result', description: 'Payment result page', originalComponent: 'PaymentResultView.vue', requiresAuth: false },
  '/payment/stripe': { title: 'Stripe Payment', description: 'Stripe payment page', originalComponent: 'StripePaymentView.vue', requiresAuth: false },
  '/payment/airwallex': { title: 'Airwallex Payment', description: 'Airwallex payment page', originalComponent: 'AirwallexPaymentView.vue', requiresAuth: false },
  '/payment/stripe-popup': { title: 'Payment', description: 'Stripe popup payment flow', originalComponent: 'StripePopupView.vue', requiresAuth: false },
  '/custom/[id]': { title: 'Custom Page', description: 'Custom menu page content', originalComponent: 'CustomPageView.vue', requiresAuth: true },
  '/legal/[documentId]': { title: 'Legal Document', description: 'Legal document viewer', originalComponent: 'LegalDocumentView.vue', requiresAuth: false },
  '/admin/dashboard': { title: 'Admin Dashboard', description: 'Admin overview and statistics', originalComponent: 'DashboardView.vue', requiresAuth: true, requiresAdmin: true },
  '/admin/ops': { title: 'Ops Monitoring', description: 'Operational monitoring dashboard', originalComponent: 'OpsDashboard.vue', requiresAuth: true, requiresAdmin: true },
  '/admin/users': { title: 'User Management', description: 'Manage registered users', originalComponent: 'UsersView.vue', requiresAuth: true, requiresAdmin: true },
  '/admin/groups': { title: 'Group Management', description: 'Manage account groups', originalComponent: 'GroupsView.vue', requiresAuth: true, requiresAdmin: true },
  '/admin/channels/pricing': { title: 'Channel Management', description: 'Manage pricing channels', originalComponent: 'ChannelsView.vue', requiresAuth: true, requiresAdmin: true },
  '/admin/channels/monitor': { title: 'Channel Monitor', description: 'Monitor upstream channel health', originalComponent: 'ChannelMonitorView.vue', requiresAuth: true, requiresAdmin: true },
  '/monitor': { title: 'Channel Status', description: 'View channel status', originalComponent: 'ChannelStatusView.vue', requiresAuth: true },
  '/admin/subscriptions': { title: 'Subscription Management', description: 'Manage subscriptions', originalComponent: 'SubscriptionsView.vue', requiresAuth: true, requiresAdmin: true },
  '/admin/accounts': { title: 'Account Management', description: 'Manage accounts', originalComponent: 'AccountsView.vue', requiresAuth: true, requiresAdmin: true },
  '/admin/announcements': { title: 'Announcements', description: 'Manage announcements', originalComponent: 'AnnouncementsView.vue', requiresAuth: true, requiresAdmin: true },
  '/admin/proxies': { title: 'Proxy Management', description: 'Manage proxy settings', originalComponent: 'ProxiesView.vue', requiresAuth: true, requiresAdmin: true },
  '/admin/redeem': { title: 'Redeem Code Management', description: 'Manage redeem codes', originalComponent: 'RedeemView.vue', requiresAuth: true, requiresAdmin: true },
  '/admin/promo-codes': { title: 'Promo Code Management', description: 'Manage promo codes', originalComponent: 'PromoCodesView.vue', requiresAuth: true, requiresAdmin: true },
  '/admin/settings': { title: 'System Settings', description: 'Manage system configuration', originalComponent: 'SettingsView.vue', requiresAuth: true, requiresAdmin: true },
  '/admin/risk-control': { title: 'Risk Control', description: 'Manage risk control rules', originalComponent: 'RiskControlView.vue', requiresAuth: true, requiresAdmin: true, requiresRiskControl: true },
  '/admin/usage': { title: 'Usage Records', description: 'Admin usage reports', originalComponent: 'UsageView.vue', requiresAuth: true, requiresAdmin: true },
  '/admin/affiliates/invites': { title: 'Affiliate Invite Records', description: 'Affiliate invite records', originalComponent: 'AdminAffiliateInvitesView.vue', requiresAuth: true, requiresAdmin: true },
  '/admin/affiliates/rebates': { title: 'Affiliate Rebate Records', description: 'Affiliate rebate records', originalComponent: 'AdminAffiliateRebatesView.vue', requiresAuth: true, requiresAdmin: true },
  '/admin/affiliates/transfers': { title: 'Affiliate Transfer Records', description: 'Affiliate transfer records', originalComponent: 'AdminAffiliateTransfersView.vue', requiresAuth: true, requiresAdmin: true },
  '/admin/orders/dashboard': { title: 'Payment Dashboard', description: 'Admin payment dashboard', originalComponent: 'AdminPaymentDashboardView.vue', requiresAuth: true, requiresAdmin: true, requiresPayment: true },
  '/admin/orders': { title: 'Order Management', description: 'Manage orders', originalComponent: 'AdminOrdersView.vue', requiresAuth: true, requiresAdmin: true, requiresPayment: true },
  '/admin/orders/plans': { title: 'Subscription Plans', description: 'Manage payment plans', originalComponent: 'AdminPaymentPlansView.vue', requiresAuth: true, requiresAdmin: true, requiresPayment: true },
}

/**
 * Per-path i18n title/description keys, mirroring the Vue router `meta.titleKey`
 * / `meta.descriptionKey`. The AppHeader resolves these against the active
 * locale to render the page title and subtitle.
 */
export interface RouteTitleKeys {
  titleKey?: string
  descriptionKey?: string
}

export const routeTitleKeys: Record<string, RouteTitleKeys> = {
  '/dashboard': { titleKey: 'dashboard.title', descriptionKey: 'dashboard.welcomeMessage' },
  '/keys': { titleKey: 'keys.title', descriptionKey: 'keys.description' },
  '/usage': { titleKey: 'usage.title', descriptionKey: 'usage.description' },
  '/redeem': { titleKey: 'redeem.title', descriptionKey: 'redeem.description' },
  '/affiliate': { titleKey: 'affiliate.title', descriptionKey: 'affiliate.description' },
  '/available-channels': { titleKey: 'availableChannels.title', descriptionKey: 'availableChannels.description' },
  '/profile': { titleKey: 'profile.title', descriptionKey: 'profile.description' },
  '/subscriptions': { titleKey: 'userSubscriptions.title', descriptionKey: 'userSubscriptions.description' },
  '/purchase': { titleKey: 'nav.buySubscription', descriptionKey: 'purchase.description' },
  '/orders': { titleKey: 'nav.myOrders' },
  '/monitor': { titleKey: 'nav.channelStatus' },
  '/payment/qrcode': { titleKey: 'payment.qr.scanToPay' },
  '/payment/result': { titleKey: 'payment.result.success' },
  '/payment/stripe': { titleKey: 'payment.stripePay' },
  '/payment/airwallex': { titleKey: 'payment.airwallexPay' },
  '/admin/dashboard': { titleKey: 'admin.dashboard.title', descriptionKey: 'admin.dashboard.description' },
  '/admin/ops': { titleKey: 'admin.ops.title', descriptionKey: 'admin.ops.description' },
  '/admin/users': { titleKey: 'admin.users.title', descriptionKey: 'admin.users.description' },
  '/admin/groups': { titleKey: 'admin.groups.title', descriptionKey: 'admin.groups.description' },
  '/admin/channels/pricing': { titleKey: 'admin.channels.title', descriptionKey: 'admin.channels.description' },
  '/admin/channels/monitor': { titleKey: 'admin.channelMonitor.title', descriptionKey: 'admin.channelMonitor.description' },
  '/admin/subscriptions': { titleKey: 'admin.subscriptions.title', descriptionKey: 'admin.subscriptions.description' },
  '/admin/accounts': { titleKey: 'admin.accounts.title', descriptionKey: 'admin.accounts.description' },
  '/admin/announcements': { titleKey: 'admin.announcements.title', descriptionKey: 'admin.announcements.description' },
  '/admin/proxies': { titleKey: 'admin.proxies.title', descriptionKey: 'admin.proxies.description' },
  '/admin/redeem': { titleKey: 'admin.redeem.title', descriptionKey: 'admin.redeem.description' },
  '/admin/promo-codes': { titleKey: 'admin.promo.title', descriptionKey: 'admin.promo.description' },
  '/admin/settings': { titleKey: 'admin.settings.title', descriptionKey: 'admin.settings.description' },
  '/admin/risk-control': { titleKey: 'admin.riskControl.title', descriptionKey: 'admin.riskControl.description' },
  '/admin/usage': { titleKey: 'admin.usage.title', descriptionKey: 'admin.usage.description' },
  '/admin/affiliates/invites': { titleKey: 'nav.affiliateInviteRecords', descriptionKey: 'admin.affiliates.invitesDescription' },
  '/admin/affiliates/rebates': { titleKey: 'nav.affiliateRebateRecords', descriptionKey: 'admin.affiliates.rebatesDescription' },
  '/admin/affiliates/transfers': { titleKey: 'nav.affiliateTransferRecords', descriptionKey: 'admin.affiliates.transfersDescription' },
  '/admin/orders/dashboard': { titleKey: 'nav.paymentDashboard' },
  '/admin/orders': { titleKey: 'nav.orderManagement' },
  '/admin/orders/plans': { titleKey: 'nav.paymentPlans' },
}

export const dynamicRoutePatterns: Array<{ prefix: string; meta: RouteMeta }> = [
  {
    prefix: '/legal/',
    meta: {
      title: 'Legal Document',
      description: 'Legal document viewer',
      originalComponent: 'LegalDocumentView.vue',
      requiresAuth: false,
    },
  },
  {
    prefix: '/custom/',
    meta: {
      title: 'Custom Page',
      description: 'Custom menu page content',
      originalComponent: 'CustomPageView.vue',
      requiresAuth: true,
    },
  },
]
