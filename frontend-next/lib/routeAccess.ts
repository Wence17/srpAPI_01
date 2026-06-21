import type { RouteMeta } from './routeMeta'

export const BACKEND_MODE_ALLOWED_PATHS = [
  '/login',
  '/key-usage',
  '/setup',
  '/payment/result',
  '/payment/airwallex',
  '/legal',
]

export const BACKEND_MODE_CALLBACK_PATHS = [
  '/auth/callback',
  '/auth/oauth/callback',
  '/auth/linuxdo/callback',
  '/auth/dingtalk/callback',
  '/auth/dingtalk/email-completion',
  '/auth/oidc/callback',
  '/auth/wechat/callback',
  '/auth/wechat/payment/callback',
]

export const BACKEND_MODE_PENDING_AUTH_PATHS = ['/register', '/email-verify']

export const SIMPLE_MODE_RESTRICTED_PATHS = [
  '/admin/groups',
  '/admin/subscriptions',
  '/admin/redeem',
  '/subscriptions',
  '/redeem',
]

export function isBackendModePublicRouteAllowed(
  path: string,
  hasPendingAuthSession: boolean,
): boolean {
  if (BACKEND_MODE_ALLOWED_PATHS.some((allowed) => path === allowed || path.startsWith(allowed))) {
    return true
  }
  if (BACKEND_MODE_CALLBACK_PATHS.some((callbackPath) => path === callbackPath)) {
    return true
  }
  if (
    hasPendingAuthSession &&
    BACKEND_MODE_PENDING_AUTH_PATHS.some((allowedPath) => path === allowedPath)
  ) {
    return true
  }
  return false
}

export function routeRequiresAuth(meta: RouteMeta): boolean {
  return meta.requiresAuth !== false
}

export interface RouteAccessDecision {
  allowed: boolean
  redirectTo?: string
  redirectSearch?: Record<string, string>
}

export function evaluateRouteAccess(input: {
  path: string
  meta: RouteMeta
  isAuthenticated: boolean
  isAdmin: boolean
  isSimpleMode: boolean
  backendModeEnabled: boolean
  hasPendingAuthSession: boolean
  paymentEnabled: boolean
  riskControlEnabled: boolean
}): RouteAccessDecision {
  const {
    path,
    meta,
    isAuthenticated,
    isAdmin,
    isSimpleMode,
    backendModeEnabled,
    hasPendingAuthSession,
    paymentEnabled,
    riskControlEnabled,
  } = input

  const requiresAuth = routeRequiresAuth(meta)

  if (!requiresAuth) {
    if (isAuthenticated && (path === '/login' || path === '/register')) {
      if (backendModeEnabled && !isAdmin) {
        return { allowed: true }
      }
      return { allowed: false, redirectTo: isAdmin ? '/admin/dashboard' : '/dashboard' }
    }

    if (backendModeEnabled && !isAuthenticated) {
      if (!isBackendModePublicRouteAllowed(path, hasPendingAuthSession)) {
        return { allowed: false, redirectTo: '/login' }
      }
    }

    return { allowed: true }
  }

  if (!isAuthenticated) {
    return {
      allowed: false,
      redirectTo: '/login',
      redirectSearch: { redirect: path },
    }
  }

  if (meta.requiresAdmin && !isAdmin) {
    return { allowed: false, redirectTo: '/dashboard' }
  }

  if (meta.requiresPayment && !paymentEnabled) {
    return { allowed: false, redirectTo: isAdmin ? '/admin/dashboard' : '/dashboard' }
  }

  if (meta.requiresRiskControl && !riskControlEnabled) {
    return { allowed: false, redirectTo: isAdmin ? '/admin/settings' : '/dashboard' }
  }

  if (
    isSimpleMode &&
    SIMPLE_MODE_RESTRICTED_PATHS.some((restricted) => path.startsWith(restricted))
  ) {
    return { allowed: false, redirectTo: isAdmin ? '/admin/dashboard' : '/dashboard' }
  }

  if (backendModeEnabled) {
    if (isAdmin) {
      return { allowed: true }
    }
    if (!isBackendModePublicRouteAllowed(path, hasPendingAuthSession)) {
      return { allowed: false, redirectTo: '/login' }
    }
  }

  return { allowed: true }
}
