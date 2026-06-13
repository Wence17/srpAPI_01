'use client'

import { useEffect, useMemo, useState } from 'react'
import { useI18n } from '@/lib/i18n/I18nProvider'
import { useAuth } from '@/context/AuthContext'
import { useApp } from '@/context/AppContext'
import {
  hasExplicitWeChatOAuthCapabilities,
  resolveWeChatOAuthStartStrict,
  type WeChatOAuthPublicSettings,
} from '@/lib/auth'
import {
  bindEmailIdentity,
  sendEmailBindingCode,
  startOAuthBinding,
  unbindAuthIdentity,
  type BindableOAuthProvider,
} from '@/lib/user'
import Icon from '@/components/icons/Icon'
import { normalizeBindingStatus } from './profileInfoHelpers'
import type { User, UserAuthBindingStatus, UserAuthProvider } from '@/lib/types'

interface ProfileIdentityBindingsSectionProps {
  user: User | null
  linuxdoEnabled?: boolean
  dingtalkEnabled?: boolean
  oidcEnabled?: boolean
  oidcProviderName?: string
  wechatEnabled?: boolean
  wechatOpenEnabled?: boolean
  wechatMpEnabled?: boolean
  embedded?: boolean
  compact?: boolean
}

const legacyBindingNoteKeys: Record<string, string> = {
  'Primary account email is managed from the profile form.': 'profile.authBindings.notes.emailManagedFromProfile',
  'You can unbind this sign-in method.': 'profile.authBindings.notes.canUnbind',
  'Bind another sign-in method before unbinding.': 'profile.authBindings.notes.bindAnotherBeforeUnbind',
}

function resolveLegacyCompatibleWeChatSettings(
  settings: WeChatOAuthPublicSettings | null | undefined,
): (WeChatOAuthPublicSettings & {
  wechat_oauth_open_enabled: boolean
  wechat_oauth_mp_enabled: boolean
}) | null {
  if (!settings) {
    return null
  }
  if (hasExplicitWeChatOAuthCapabilities(settings)) {
    return settings
  }
  if (typeof settings.wechat_oauth_enabled !== 'boolean') {
    return null
  }
  return {
    ...settings,
    wechat_oauth_open_enabled: settings.wechat_oauth_enabled,
    wechat_oauth_mp_enabled: settings.wechat_oauth_enabled,
  }
}

function getBindingStatusForUser(
  user: User | null | undefined,
  provider: UserAuthProvider,
): boolean {
  if (provider === 'email') {
    if (typeof user?.email_bound === 'boolean') {
      return user.email_bound
    }
    const nested = user?.auth_bindings?.email ?? user?.identity_bindings?.email
    const normalized = normalizeBindingStatus(nested)
    return normalized ?? false
  }

  const directFlag = user?.[`${provider}_bound` as keyof User]
  if (typeof directFlag === 'boolean') {
    return directFlag
  }

  const nested = user?.auth_bindings?.[provider] ?? user?.identity_bindings?.[provider]
  const normalized = normalizeBindingStatus(nested)
  return normalized ?? false
}

export default function ProfileIdentityBindingsSection({
  user,
  linuxdoEnabled = false,
  dingtalkEnabled = false,
  oidcEnabled = false,
  oidcProviderName = 'OIDC',
  wechatEnabled = false,
  wechatOpenEnabled,
  wechatMpEnabled,
  embedded = false,
  compact = false,
}: ProfileIdentityBindingsSectionProps) {
  const { t } = useI18n()
  const appStore = useApp()
  const { updateUser } = useAuth()

  const [localUser, setLocalUser] = useState<User | null>(null)
  const [isSendingEmailCode, setIsSendingEmailCode] = useState(false)
  const [isBindingEmail, setIsBindingEmail] = useState(false)
  const [isEmailFormExpanded, setIsEmailFormExpanded] = useState(!compact)
  const [unbindingProvider, setUnbindingProvider] = useState<BindableOAuthProvider | null>(null)
  const [emailBindingForm, setEmailBindingForm] = useState({
    email: '',
    verifyCode: '',
    password: '',
  })

  useEffect(() => {
    setLocalUser(null)
    if (!user) {
      return
    }
    if (typeof user.email === 'string' && !user.email.endsWith('.invalid')) {
      setEmailBindingForm((prev) => ({ ...prev, email: user.email }))
    }
  }, [user])

  useEffect(() => {
    if (!compact) {
      setIsEmailFormExpanded(true)
    }
  }, [compact])

  const currentUser = localUser ?? user

  const rowClass = embedded
    ? compact
      ? 'rounded-2xl border border-gray-100 bg-white p-4 shadow-sm dark:border-dark-700 dark:bg-dark-900/40'
      : 'rounded-2xl border border-gray-100 bg-gray-50/70 p-4 dark:border-dark-700 dark:bg-dark-900/30'
    : 'px-6 py-5'

  const wechatOAuthSettings = useMemo<WeChatOAuthPublicSettings | null>(() => {
    const cachedSettings = resolveLegacyCompatibleWeChatSettings(appStore.cachedPublicSettings)
    if (cachedSettings) {
      return cachedSettings
    }
    return resolveLegacyCompatibleWeChatSettings({
      wechat_oauth_enabled: wechatEnabled,
      wechat_oauth_open_enabled: wechatOpenEnabled,
      wechat_oauth_mp_enabled: wechatMpEnabled,
    })
  }, [appStore.cachedPublicSettings, wechatEnabled, wechatOpenEnabled, wechatMpEnabled])

  const resolvedWeChatBinding = useMemo(
    () => resolveWeChatOAuthStartStrict(wechatOAuthSettings),
    [wechatOAuthSettings],
  )

  const getBindingStatus = (provider: UserAuthProvider) => getBindingStatusForUser(currentUser, provider)

  const getBindingDetails = (provider: UserAuthProvider): UserAuthBindingStatus | null => {
    const binding = currentUser?.auth_bindings?.[provider] ?? currentUser?.identity_bindings?.[provider]
    if (!binding || typeof binding === 'boolean') {
      return null
    }
    return binding
  }

  const getDisplayableEmail = (targetUser: User | null | undefined): string => {
    const email = targetUser?.email?.trim() || ''
    if (!email) {
      return ''
    }
    if (email.endsWith('.invalid') && !getBindingStatusForUser(targetUser, 'email')) {
      return ''
    }
    return email
  }

  const isProviderEnabledForBinding = (provider: BindableOAuthProvider): boolean => {
    if (provider === 'linuxdo') {
      return linuxdoEnabled
    }
    if (provider === 'dingtalk') {
      return dingtalkEnabled
    }
    if (provider === 'oidc') {
      return oidcEnabled
    }
    return resolvedWeChatBinding.mode !== null
  }

  const emailBound = getBindingStatus('email')
  const showEmailForm = !compact || isEmailFormExpanded
  const emailPasswordPlaceholder = emailBound
    ? t('profile.authBindings.replaceEmailPasswordPlaceholder')
    : t('profile.authBindings.passwordPlaceholder')
  const emailSubmitActionLabel = emailBound
    ? t('profile.authBindings.confirmEmailReplaceAction')
    : t('profile.authBindings.confirmEmailBindAction')

  const providerItems = useMemo(
    () => [
      {
        provider: 'email' as const,
        label: t('profile.authBindings.providers.email'),
        bound: getBindingStatus('email'),
        canBind: false,
        canUnbind: false,
        details: getBindingDetails('email'),
      },
      {
        provider: 'linuxdo' as const,
        label: t('profile.authBindings.providers.linuxdo'),
        bound: getBindingStatus('linuxdo'),
        canBind:
          !getBindingStatus('linuxdo') &&
          isProviderEnabledForBinding('linuxdo') &&
          (getBindingDetails('linuxdo')?.can_bind ?? true),
        canUnbind: Boolean(getBindingStatus('linuxdo') && getBindingDetails('linuxdo')?.can_unbind),
        details: getBindingDetails('linuxdo'),
      },
      {
        provider: 'dingtalk' as const,
        label: t('profile.authBindings.providers.dingtalk'),
        bound: getBindingStatus('dingtalk'),
        canBind:
          !getBindingStatus('dingtalk') &&
          isProviderEnabledForBinding('dingtalk') &&
          (getBindingDetails('dingtalk')?.can_bind ?? true),
        canUnbind: Boolean(getBindingStatus('dingtalk') && getBindingDetails('dingtalk')?.can_unbind),
        details: getBindingDetails('dingtalk'),
      },
      {
        provider: 'oidc' as const,
        label: t('profile.authBindings.providers.oidc', { providerName: oidcProviderName }),
        bound: getBindingStatus('oidc'),
        canBind:
          !getBindingStatus('oidc') &&
          isProviderEnabledForBinding('oidc') &&
          (getBindingDetails('oidc')?.can_bind ?? true),
        canUnbind: Boolean(getBindingStatus('oidc') && getBindingDetails('oidc')?.can_unbind),
        details: getBindingDetails('oidc'),
      },
      {
        provider: 'wechat' as const,
        label: t('profile.authBindings.providers.wechat'),
        bound: getBindingStatus('wechat'),
        canBind:
          !getBindingStatus('wechat') &&
          isProviderEnabledForBinding('wechat') &&
          (getBindingDetails('wechat')?.can_bind ?? true),
        canUnbind: Boolean(getBindingStatus('wechat') && getBindingDetails('wechat')?.can_unbind),
        details: getBindingDetails('wechat'),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [currentUser, t, oidcProviderName, linuxdoEnabled, dingtalkEnabled, oidcEnabled, resolvedWeChatBinding.mode],
  )

  const providerInitial = (provider: UserAuthProvider): string => {
    if (provider === 'linuxdo') return 'L'
    if (provider === 'dingtalk') return 'D'
    if (provider === 'wechat') return 'W'
    if (provider === 'oidc') return 'O'
    return 'E'
  }

  const providerIconClass = (provider: UserAuthProvider): string => {
    if (provider === 'linuxdo') {
      return 'bg-orange-100 text-orange-600 dark:bg-orange-900/20 dark:text-orange-300'
    }
    if (provider === 'dingtalk') {
      return 'bg-blue-100 text-blue-600 dark:bg-blue-900/20 dark:text-blue-300'
    }
    if (provider === 'wechat') {
      return 'bg-green-100 text-green-600 dark:bg-green-900/20 dark:text-green-300'
    }
    if (provider === 'oidc') {
      return 'bg-sky-100 text-sky-600 dark:bg-sky-900/20 dark:text-sky-300'
    }
    return 'bg-primary-100 text-primary-600 dark:bg-primary-900/20 dark:text-primary-300'
  }

  const providerSummary = (provider: UserAuthProvider): string => {
    if (provider === 'email') {
      return getDisplayableEmail(currentUser)
    }
    return ''
  }

  const bindingCountLabel = (details: UserAuthBindingStatus | null): string => {
    if (!details || typeof details.bound_count !== 'number' || details.bound_count <= 1) {
      return ''
    }
    return t('profile.authBindings.boundCount', { count: details.bound_count })
  }

  const bindingNote = (details: UserAuthBindingStatus | null): string => {
    if (!details) {
      return ''
    }
    const noteKey = details.note_key?.trim() || legacyBindingNoteKeys[details.note?.trim() || ''] || ''
    if (noteKey) {
      const translated = t(noteKey)
      if (translated !== noteKey) {
        return translated
      }
    }
    return details.note?.trim() || ''
  }

  const hasBindingDetails = (provider: UserAuthProvider, details: UserAuthBindingStatus | null): boolean => {
    if (!details) {
      return false
    }
    const showsProviderIdentityDetails =
      provider !== 'email' && Boolean(details.display_name || details.subject_hint)
    return Boolean(showsProviderIdentityDetails || bindingCountLabel(details) || bindingNote(details))
  }

  const applyUpdatedUser = (nextUser: User) => {
    setLocalUser(nextUser)
    updateUser(nextUser)
  }

  const toggleEmailForm = () => {
    setIsEmailFormExpanded((prev) => !prev)
  }

  const startBinding = (provider: UserAuthProvider) => {
    if (provider === 'email') {
      return
    }
    const redirectTo =
      typeof window !== 'undefined'
        ? `${window.location.pathname}${window.location.search}` || '/profile'
        : '/profile'
    void startOAuthBinding(provider, {
      redirectTo,
      wechatOAuthSettings: provider === 'wechat' ? wechatOAuthSettings : null,
    })
  }

  const handleUnbind = async (provider: BindableOAuthProvider, providerLabel: string) => {
    setUnbindingProvider(provider)
    try {
      const nextUser = await unbindAuthIdentity(provider)
      applyUpdatedUser(nextUser)
      appStore.showSuccess(t('profile.authBindings.unbindSuccess', { providerName: providerLabel }))
    } catch (error) {
      appStore.showError((error as { message?: string }).message || t('common.tryAgain'))
    } finally {
      setUnbindingProvider(null)
    }
  }

  const validateEmailBindingForm = (requireCode: boolean): boolean => {
    if (!emailBindingForm.email) {
      appStore.showError(t('auth.emailRequired'))
      return false
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailBindingForm.email)) {
      appStore.showError(t('auth.invalidEmail'))
      return false
    }
    if (requireCode && !emailBindingForm.verifyCode) {
      appStore.showError(t('auth.codeRequired'))
      return false
    }
    if (requireCode && !emailBindingForm.password) {
      appStore.showError(t('auth.passwordRequired'))
      return false
    }
    if (requireCode && !emailBound && emailBindingForm.password.length < 6) {
      appStore.showError(t('auth.passwordMinLength'))
      return false
    }
    return true
  }

  const sendEmailCode = async () => {
    if (!validateEmailBindingForm(false)) {
      return
    }
    setIsSendingEmailCode(true)
    try {
      await sendEmailBindingCode(emailBindingForm.email)
      appStore.showSuccess(t('profile.authBindings.codeSentTo', { email: emailBindingForm.email }))
    } catch (error) {
      appStore.showError((error as { message?: string }).message || t('auth.sendCodeFailed'))
    } finally {
      setIsSendingEmailCode(false)
    }
  }

  const bindEmail = async () => {
    if (!validateEmailBindingForm(true)) {
      return
    }
    setIsBindingEmail(true)
    try {
      const nextUser = await bindEmailIdentity({
        email: emailBindingForm.email,
        verify_code: emailBindingForm.verifyCode,
        password: emailBindingForm.password,
      })
      const replacingBoundEmail = emailBound
      applyUpdatedUser(nextUser)
      setEmailBindingForm((prev) => ({ ...prev, verifyCode: '', password: '' }))
      if (compact) {
        setIsEmailFormExpanded(false)
      }
      appStore.showSuccess(
        replacingBoundEmail ? t('profile.authBindings.replaceSuccess') : t('profile.authBindings.bindSuccess'),
      )
    } catch (error) {
      appStore.showError((error as { message?: string }).message || t('common.tryAgain'))
    } finally {
      setIsBindingEmail(false)
    }
  }

  return (
    <div className={embedded ? 'space-y-4' : 'card overflow-hidden'}>
      {!embedded && (
        <div className="border-b border-gray-100 px-6 py-4 dark:border-dark-700">
          <h2 className="text-lg font-medium text-gray-900 dark:text-white">{t('profile.authBindings.title')}</h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{t('profile.authBindings.description')}</p>
        </div>
      )}

      <div className={embedded ? 'space-y-4' : 'divide-y divide-gray-100 dark:divide-dark-700'}>
        {embedded && (
          <div>
            <p className="text-sm font-semibold text-gray-900 dark:text-white">{t('profile.authBindings.title')}</p>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{t('profile.authBindings.description')}</p>
          </div>
        )}

        {providerItems.map((item) => (
          <div key={item.provider} className={rowClass}>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex min-w-0 flex-1 items-start gap-4">
                <div
                  className={`${providerIconClass(item.provider)} flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-sm font-semibold`}
                >
                  {item.provider === 'email' ? (
                    <Icon name="mail" size="sm" className="text-current" />
                  ) : (
                    <span>{providerInitial(item.provider)}</span>
                  )}
                </div>

                <div className="min-w-0 flex-1 space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-medium text-gray-900 dark:text-white">{item.label}</h3>
                    <span
                      data-testid={`profile-binding-${item.provider}-status`}
                      className={`badge ${item.bound ? 'badge-success' : 'badge-gray'}`}
                    >
                      {item.bound
                        ? t('profile.authBindings.status.bound')
                        : t('profile.authBindings.status.notBound')}
                    </span>
                  </div>

                  {providerSummary(item.provider) && (
                    <p className="text-sm text-gray-600 dark:text-gray-300">{providerSummary(item.provider)}</p>
                  )}

                  {hasBindingDetails(item.provider, item.details) && (
                    <div className="grid gap-1 text-sm text-gray-500 dark:text-gray-400">
                      {item.provider !== 'email' && item.details?.display_name && (
                        <p className="font-medium text-gray-700 dark:text-gray-200">{item.details.display_name}</p>
                      )}
                      {item.provider !== 'email' && item.details?.subject_hint && <p>{item.details.subject_hint}</p>}
                      {bindingCountLabel(item.details) && <p>{bindingCountLabel(item.details)}</p>}
                      {bindingNote(item.details) && <p>{bindingNote(item.details)}</p>}
                    </div>
                  )}

                  {item.provider === 'email' && showEmailForm && (
                    <div
                      data-testid="profile-binding-email-form"
                      className="grid gap-2 sm:grid-cols-[minmax(0,1.4fr)_auto]"
                    >
                      <input
                        value={emailBindingForm.email}
                        onChange={(event) =>
                          setEmailBindingForm((prev) => ({ ...prev, email: event.target.value.trim() }))
                        }
                        data-testid="profile-binding-email-input"
                        type="email"
                        className="input"
                        placeholder={t('profile.authBindings.emailPlaceholder')}
                        disabled={isSendingEmailCode || isBindingEmail}
                      />
                      <button
                        data-testid="profile-binding-email-send-code"
                        type="button"
                        className="btn btn-secondary btn-sm"
                        disabled={isSendingEmailCode || isBindingEmail}
                        onClick={sendEmailCode}
                      >
                        {isSendingEmailCode ? t('common.loading') : t('profile.authBindings.sendCodeAction')}
                      </button>
                      <input
                        value={emailBindingForm.verifyCode}
                        onChange={(event) =>
                          setEmailBindingForm((prev) => ({ ...prev, verifyCode: event.target.value.trim() }))
                        }
                        data-testid="profile-binding-email-code-input"
                        type="text"
                        inputMode="numeric"
                        maxLength={6}
                        className="input"
                        placeholder={t('profile.authBindings.codePlaceholder')}
                        disabled={isBindingEmail}
                      />
                      <input
                        value={emailBindingForm.password}
                        onChange={(event) =>
                          setEmailBindingForm((prev) => ({ ...prev, password: event.target.value }))
                        }
                        data-testid="profile-binding-email-password-input"
                        type="password"
                        className="input"
                        placeholder={emailPasswordPlaceholder}
                        disabled={isBindingEmail}
                      />
                      <button
                        data-testid="profile-binding-email-submit"
                        type="button"
                        className="btn btn-primary btn-sm sm:col-span-2"
                        disabled={isBindingEmail}
                        onClick={bindEmail}
                      >
                        {isBindingEmail ? t('common.loading') : emailSubmitActionLabel}
                      </button>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex shrink-0 flex-wrap items-center gap-3">
                {item.provider === 'email' && compact && (
                  <button
                    data-testid="profile-binding-email-toggle"
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={toggleEmailForm}
                  >
                    {showEmailForm
                      ? t('profile.authBindings.hideEmailFormAction')
                      : t('profile.authBindings.manageEmailAction')}
                  </button>
                )}
                {item.canBind && (
                  <button
                    data-testid={`profile-binding-${item.provider}-action`}
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={() => startBinding(item.provider)}
                  >
                    {t('profile.authBindings.bindAction', { providerName: item.label })}
                  </button>
                )}
                {item.canUnbind && (
                  <button
                    data-testid={`profile-binding-${item.provider}-unbind`}
                    type="button"
                    className="btn btn-secondary btn-sm"
                    disabled={unbindingProvider === item.provider}
                    onClick={() => {
                      if (item.provider !== 'email') {
                        void handleUnbind(item.provider, item.label)
                      }
                    }}
                  >
                    {unbindingProvider === item.provider
                      ? t('common.loading')
                      : t('profile.authBindings.unbindAction')}
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
