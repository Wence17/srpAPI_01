'use client'

import { useMemo } from 'react'
import { useI18n } from '@/lib/i18n/I18nProvider'
import Icon from '@/components/icons/Icon'
import ProfileAvatarCard from './ProfileAvatarCard'
import ProfileEditForm from './ProfileEditForm'
import ProfileIdentityBindingsSection from './ProfileIdentityBindingsSection'
import { buildSourceHints, formatCurrency, isEmailBound } from './profileInfoHelpers'
import type { User } from '@/lib/types'

interface ProfileInfoCardProps {
  user: User | null
  linuxdoEnabled?: boolean
  dingtalkEnabled?: boolean
  oidcEnabled?: boolean
  oidcProviderName?: string
  wechatEnabled?: boolean
  wechatOpenEnabled?: boolean
  wechatMpEnabled?: boolean
}

export default function ProfileInfoCard({
  user,
  linuxdoEnabled = false,
  dingtalkEnabled = false,
  oidcEnabled = false,
  oidcProviderName = 'OIDC',
  wechatEnabled = false,
  wechatOpenEnabled,
  wechatMpEnabled,
}: ProfileInfoCardProps) {
  const { t } = useI18n()

  const avatarUrl = user?.avatar_url?.trim() || ''
  const displayName = user?.username?.trim() || user?.email?.trim() || t('profile.user')
  const primaryEmailDisplay = useMemo(() => {
    const email = user?.email?.trim() || ''
    if (!email) {
      return ''
    }
    if (email.endsWith('.invalid') && !isEmailBound(user)) {
      return ''
    }
    return email
  }, [user])
  const avatarInitial = displayName.charAt(0).toUpperCase() || 'U'
  const memberSinceLabel = useMemo(() => {
    const raw = user?.created_at?.trim()
    if (!raw) {
      return '-'
    }
    const date = new Date(raw)
    if (Number.isNaN(date.getTime())) {
      return '-'
    }
    return new Intl.DateTimeFormat(undefined, {
      year: 'numeric',
      month: 'short',
    }).format(date)
  }, [user?.created_at])

  const sourceHints = useMemo(
    () => buildSourceHints(user, t, oidcProviderName),
    [user, t, oidcProviderName],
  )

  return (
    <div className="space-y-6">
      <section
        data-testid="profile-overview-hero"
        className="card overflow-hidden border border-primary-100/80 bg-gradient-to-br from-primary-50 via-white to-amber-50/70 dark:border-primary-900/40 dark:from-primary-950/40 dark:via-dark-900 dark:to-dark-950"
      >
        <div className="px-6 py-6 md:px-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
            <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-[1.75rem] bg-gradient-to-br from-primary-500 to-primary-600 text-2xl font-bold text-white shadow-lg shadow-primary-500/20">
              {avatarUrl ? (
                <img src={avatarUrl} alt={displayName} className="h-full w-full object-cover" />
              ) : (
                <span>{avatarInitial}</span>
              )}
            </div>

            <div className="min-w-0 flex-1 space-y-5">
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="truncate text-2xl font-semibold text-gray-900 dark:text-white">{displayName}</h2>
                  <span className={`badge ${user?.role === 'admin' ? 'badge-primary' : 'badge-gray'}`}>
                    {user?.role === 'admin' ? t('profile.administrator') : t('profile.user')}
                  </span>
                  <span className={`badge ${user?.status === 'active' ? 'badge-success' : 'badge-danger'}`}>
                    {user?.status === 'active' ? t('common.active') : t('common.disabled')}
                  </span>
                </div>

                <div className="space-y-1">
                  <p className="truncate text-sm text-gray-600 dark:text-gray-300">{primaryEmailDisplay}</p>
                  {sourceHints.length > 0 && (
                    <div className="flex flex-wrap gap-2 text-xs text-gray-500 dark:text-gray-400">
                      {sourceHints.map((hint) => (
                        <span
                          key={hint.key}
                          className="inline-flex items-center gap-1 rounded-full bg-white/80 px-3 py-1 ring-1 ring-primary-100 dark:bg-dark-900/70 dark:ring-primary-900/40"
                        >
                          <Icon name="link" size="sm" />
                          {hint.text}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <div
                  data-testid="profile-overview-metric-balance"
                  className="rounded-2xl bg-white/85 px-4 py-3 shadow-sm ring-1 ring-white/70 dark:bg-dark-900/60 dark:ring-dark-700"
                >
                  <p className="text-xs font-medium uppercase tracking-[0.16em] text-gray-400 dark:text-gray-500">
                    {t('profile.accountBalance')}
                  </p>
                  <p className="mt-1 text-lg font-semibold text-gray-900 dark:text-white">
                    {formatCurrency(user?.balance || 0)}
                  </p>
                </div>
                <div
                  data-testid="profile-overview-metric-concurrency"
                  className="rounded-2xl bg-white/85 px-4 py-3 shadow-sm ring-1 ring-white/70 dark:bg-dark-900/60 dark:ring-dark-700"
                >
                  <p className="text-xs font-medium uppercase tracking-[0.16em] text-gray-400 dark:text-gray-500">
                    {t('profile.concurrencyLimit')}
                  </p>
                  <p className="mt-1 text-lg font-semibold text-gray-900 dark:text-white">{user?.concurrency || 0}</p>
                </div>
                <div
                  data-testid="profile-overview-metric-member-since"
                  className="rounded-2xl bg-white/85 px-4 py-3 shadow-sm ring-1 ring-white/70 dark:bg-dark-900/60 dark:ring-dark-700"
                >
                  <p className="text-xs font-medium uppercase tracking-[0.16em] text-gray-400 dark:text-gray-500">
                    {t('profile.memberSince')}
                  </p>
                  <p className="mt-1 text-lg font-semibold text-gray-900 dark:text-white">{memberSinceLabel}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="space-y-6">
        <div data-testid="profile-main-column" className="space-y-6">
          <section
            data-testid="profile-basics-panel"
            className="card border border-gray-100 bg-white/90 p-6 dark:border-dark-700 dark:bg-dark-900/50"
          >
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{t('profile.basicsTitle')}</h3>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{t('profile.basicsDescription')}</p>
              </div>
            </div>

            <div className="grid gap-6 sm:grid-cols-1 md:grid-cols-2">
              <div className="rounded-3xl border border-gray-100 bg-gray-50/80 p-5 dark:border-dark-700 dark:bg-dark-900/30">
                <ProfileAvatarCard user={user} embedded />
              </div>

              <div className="rounded-3xl border border-gray-100 bg-gray-50/80 p-5 dark:border-dark-700 dark:bg-dark-900/30">
                <ProfileEditForm initialUsername={user?.username || ''} embedded />
              </div>
            </div>
          </section>

          <section
            data-testid="profile-auth-bindings-panel"
            className="card border border-gray-100 bg-white/90 p-6 dark:border-dark-700 dark:bg-dark-900/50"
          >
            <ProfileIdentityBindingsSection
              user={user}
              linuxdoEnabled={linuxdoEnabled}
              dingtalkEnabled={dingtalkEnabled}
              oidcEnabled={oidcEnabled}
              oidcProviderName={oidcProviderName}
              wechatEnabled={wechatEnabled}
              wechatOpenEnabled={wechatOpenEnabled}
              wechatMpEnabled={wechatMpEnabled}
              embedded
              compact
            />
          </section>
        </div>

        <div data-testid="profile-side-column" className="space-y-6">
          {sourceHints.length > 0 && (
            <section className="card border border-gray-100 bg-white/90 p-6 dark:border-dark-700 dark:bg-dark-900/50">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{t('profile.linkedProfileSources')}</h3>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                {t('profile.linkedProfileSourcesDescription')}
              </p>

              <div className="mt-5 grid gap-3">
                {sourceHints.map((hint) => (
                  <div
                    key={hint.key}
                    className="flex items-start gap-3 rounded-2xl border border-gray-100 bg-gray-50/80 px-4 py-3 text-sm text-gray-600 dark:border-dark-700 dark:bg-dark-900/30 dark:text-gray-300"
                  >
                    <Icon name="link" size="sm" className="mt-0.5 text-gray-400 dark:text-gray-500" />
                    <span>{hint.text}</span>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  )
}
