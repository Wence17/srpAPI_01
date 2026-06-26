import type { User, UserAuthBindingStatus, UserAuthProvider, UserProfileSourceContext } from '@/lib/types'

type TranslateFn = (key: string, params?: Record<string, unknown>) => string

export function normalizeBindingStatus(binding: boolean | UserAuthBindingStatus | undefined): boolean | null {
  if (typeof binding === 'boolean') {
    return binding
  }
  if (!binding) {
    return null
  }
  if (typeof binding.bound === 'boolean') {
    return binding.bound
  }
  return Boolean(binding.provider_subject || binding.issuer || binding.provider_key)
}

export function isEmailBound(user: User | null | undefined): boolean {
  if (typeof user?.email_bound === 'boolean') {
    return user.email_bound
  }
  const nested = user?.auth_bindings?.email ?? user?.identity_bindings?.email
  const normalized = normalizeBindingStatus(nested)
  return normalized ?? false
}

export function formatCurrency(value: number): string {
  return `$${value.toFixed(2)}`
}

export function normalizeProvider(value: string): UserAuthProvider | null {
  const normalized = value.trim().toLowerCase()
  if (
    normalized === 'email' ||
    normalized === 'linuxdo' ||
    normalized === 'wechat' ||
    normalized === 'github' ||
    normalized === 'google'
  ) {
    return normalized
  }
  if (normalized === 'oidc' || normalized.startsWith('oidc:') || normalized.startsWith('oidc/')) {
    return 'oidc'
  }
  return null
}

function readObjectString(source: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    const value = source[key]
    if (typeof value === 'string' && value.trim()) {
      return value.trim()
    }
  }
  return ''
}

function resolveThirdPartySource(
  rawSource: string | UserProfileSourceContext | null | undefined,
  providerLabels: Record<UserAuthProvider, string>,
): { provider: UserAuthProvider; label: string } | null {
  if (!rawSource) {
    return null
  }

  if (typeof rawSource === 'string') {
    const provider = normalizeProvider(rawSource)
    if (!provider || provider === 'email') {
      return null
    }
    return {
      provider,
      label: providerLabels[provider],
    }
  }

  const sourceRecord = rawSource as Record<string, unknown>
  const provider = normalizeProvider(
    readObjectString(sourceRecord, 'provider', 'source', 'provider_type', 'auth_provider'),
  )
  if (!provider || provider === 'email') {
    return null
  }

  const explicitLabel = readObjectString(
    sourceRecord,
    'provider_label',
    'label',
    'provider_name',
    'providerName',
  )

  return {
    provider,
    label: explicitLabel || providerLabels[provider],
  }
}

export function buildSourceHints(
  user: User | null | undefined,
  t: TranslateFn,
  oidcProviderName: string,
): Array<{ key: string; text: string }> {
  if (!user) {
    return []
  }

  const providerLabels: Record<UserAuthProvider, string> = {
    email: t('profile.authBindings.providers.email'),
    linuxdo: t('profile.authBindings.providers.linuxdo'),
    dingtalk: t('profile.authBindings.providers.dingtalk'),
    oidc: t('profile.authBindings.providers.oidc', { providerName: oidcProviderName }),
    wechat: t('profile.authBindings.providers.wechat'),
    github: 'GitHub',
    google: 'Google',
  }

  const hints: Array<{ key: string; text: string }> = []
  const avatarSource = resolveThirdPartySource(
    user.profile_sources?.avatar ?? user.avatar_source,
    providerLabels,
  )
  const usernameSource = resolveThirdPartySource(
    user.profile_sources?.username ??
      user.profile_sources?.display_name ??
      user.profile_sources?.nickname ??
      user.display_name_source ??
      user.username_source ??
      user.nickname_source,
    providerLabels,
  )

  if (avatarSource) {
    hints.push({
      key: 'avatar',
      text: t('profile.authBindings.source.avatar', { providerName: avatarSource.label }),
    })
  }

  if (usernameSource) {
    hints.push({
      key: 'username',
      text: t('profile.authBindings.source.username', { providerName: usernameSource.label }),
    })
  }

  return hints
}
