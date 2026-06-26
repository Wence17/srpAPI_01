'use client'

import { useEffect, useState } from 'react'
import { useI18n } from '@/lib/i18n/I18nProvider'
import { useAuth } from '@/context/AuthContext'
import { getPublicSettings, isWeChatWebOAuthEnabled } from '@/lib/auth'
import AppLayout from '@/components/layout/AppLayout'
import Icon from '@/components/icons/Icon'
import ProfileInfoCard from '@/components/user/profile/ProfileInfoCard'
import ProfilePasswordForm from '@/components/user/profile/ProfilePasswordForm'
import ProfileBalanceNotifyCard from '@/components/user/profile/ProfileBalanceNotifyCard'
import ProfileTotpCard from '@/components/user/profile/ProfileTotpCard'

export default function ProfilePage() {
  const { t } = useI18n()
  const { user, refreshUser } = useAuth()
  const [contactInfo, setContactInfo] = useState('')
  const [balanceLowNotifyEnabled, setBalanceLowNotifyEnabled] = useState(false)
  const [systemDefaultThreshold, setSystemDefaultThreshold] = useState(0)
  const [linuxdoOAuthEnabled, setLinuxdoOAuthEnabled] = useState(false)
  const [dingtalkOAuthEnabled, setDingtalkOAuthEnabled] = useState(false)
  const [wechatOAuthEnabled, setWechatOAuthEnabled] = useState(false)
  const [wechatOAuthOpenEnabled, setWechatOAuthOpenEnabled] = useState<boolean | undefined>(undefined)
  const [wechatOAuthMPEnabled, setWechatOAuthMPEnabled] = useState<boolean | undefined>(undefined)
  const [oidcOAuthEnabled, setOidcOAuthEnabled] = useState(false)
  const [oidcOAuthProviderName, setOidcOAuthProviderName] = useState('OIDC')

  useEffect(() => {
    const profileRefresh = refreshUser().catch((error) => {
      console.error('Failed to refresh profile:', error)
    })

    const settingsLoad = getPublicSettings()
      .then((settings) => {
        if (!settings) {
          return
        }
        setContactInfo(settings.contact_info || '')
        setBalanceLowNotifyEnabled(settings.balance_low_notify_enabled ?? false)
        setSystemDefaultThreshold(settings.balance_low_notify_threshold ?? 0)
        setLinuxdoOAuthEnabled(settings.linuxdo_oauth_enabled ?? false)
        setDingtalkOAuthEnabled(settings.dingtalk_oauth_enabled ?? false)
        setWechatOAuthEnabled(isWeChatWebOAuthEnabled(settings))
        setWechatOAuthOpenEnabled(
          typeof settings.wechat_oauth_open_enabled === 'boolean' ? settings.wechat_oauth_open_enabled : undefined,
        )
        setWechatOAuthMPEnabled(
          typeof settings.wechat_oauth_mp_enabled === 'boolean' ? settings.wechat_oauth_mp_enabled : undefined,
        )
        setOidcOAuthEnabled(settings.oidc_oauth_enabled ?? false)
        setOidcOAuthProviderName(settings.oidc_oauth_provider_name || 'OIDC')
      })
      .catch((error) => {
        console.error('Failed to load settings:', error)
      })

    void Promise.all([profileRefresh, settingsLoad])
  }, [refreshUser])

  return (
    <AppLayout>
      <div data-testid="profile-shell" className="mx-auto max-w-[950px] space-y-6">
        <ProfileInfoCard
          user={user}
          linuxdoEnabled={linuxdoOAuthEnabled}
          dingtalkEnabled={dingtalkOAuthEnabled}
          oidcEnabled={oidcOAuthEnabled}
          oidcProviderName={oidcOAuthProviderName}
          wechatEnabled={wechatOAuthEnabled}
          wechatOpenEnabled={wechatOAuthOpenEnabled}
          wechatMpEnabled={wechatOAuthMPEnabled}
        />

        {contactInfo && (
          <div className="card border-primary-200 bg-primary-50 p-6 dark:bg-primary-900/20">
            <div className="flex items-center gap-4">
              <div className="rounded-xl bg-primary-100 p-3 text-primary-600">
                <Icon name="chat" size="lg" />
              </div>
              <div>
                <h3 className="font-semibold text-primary-800 dark:text-primary-200">{t('common.contactSupport')}</h3>
                <p className="text-sm font-medium">{contactInfo}</p>
              </div>
            </div>
          </div>
        )}

        <ProfilePasswordForm />

        {user && balanceLowNotifyEnabled && (
          <ProfileBalanceNotifyCard
            enabled={user.balance_notify_enabled ?? true}
            threshold={user.balance_notify_threshold}
            extraEmails={user.balance_notify_extra_emails ?? []}
            systemDefaultThreshold={systemDefaultThreshold}
            userEmail={user.email}
          />
        )}

        <ProfileTotpCard />
      </div>
    </AppLayout>
  )
}
