'use client'

import { useEffect, useMemo } from 'react'
import { useSearchParams } from 'next/navigation'
import { useI18n } from '@/lib/i18n'
import { getApiBaseUrl } from '@/lib/apiClient'
import { resolveWeChatOAuthStart } from '@/lib/auth'
import { useApp } from '@/context/AppContext'
import { resolveAffiliateReferralCode, storeOAuthAffiliateCode } from '@/lib/oauthAffiliate'

interface WechatOAuthSectionProps {
  disabled?: boolean
  affCode?: string
  showDivider?: boolean
}

export default function WechatOAuthSection({
  disabled = false,
  affCode,
  showDivider = true,
}: WechatOAuthSectionProps) {
  const { cachedPublicSettings, publicSettingsLoaded, fetchPublicSettings } = useApp()
  const searchParams = useSearchParams()
  const { t, locale } = useI18n()

  const providerName = t('auth.wechatProviderName')

  function localizeWeChatHint(zh: string, en: string): string {
    return locale.startsWith('zh') ? zh : en
  }

  const resolvedStart = useMemo(
    () => resolveWeChatOAuthStart(cachedPublicSettings),
    [cachedPublicSettings],
  )

  const buttonDisabled = disabled || resolvedStart.mode === null

  const disabledHint = useMemo(() => {
    if (disabled) {
      return ''
    }
    switch (resolvedStart.unavailableReason) {
      case 'external_browser_required':
        return t('auth.oauthFlow.wechatSystemBrowserOnly')
      case 'wechat_browser_required':
        return t('auth.oauthFlow.wechatBrowserOnly')
      case 'native_app_required':
        return localizeWeChatHint(
          '当前仅配置微信移动应用登录，需要在原生 App 中通过微信 SDK 发起授权。',
          'This site only has WeChat mobile app login configured. Continue from the native app through the WeChat SDK.',
        )
      case 'not_configured':
        return t('auth.oauthFlow.wechatNotConfigured')
      default:
        return ''
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [disabled, resolvedStart.unavailableReason, t, locale])

  useEffect(() => {
    if (!cachedPublicSettings && !publicSettingsLoaded) {
      fetchPublicSettings()
    }
  }, [cachedPublicSettings, publicSettingsLoaded, fetchPublicSettings])

  function startLogin(): void {
    if (buttonDisabled || !resolvedStart.mode) {
      return
    }
    const redirectTo = searchParams.get('redirect') || '/dashboard'
    storeOAuthAffiliateCode(
      resolveAffiliateReferralCode(affCode, searchParams.get('aff'), searchParams.get('aff_code')),
    )
    const mode = resolvedStart.mode
    const startURL = `${getApiBaseUrl()}/auth/oauth/wechat/start?mode=${mode}&redirect=${encodeURIComponent(redirectTo)}`
    window.location.href = startURL
  }

  return (
    <div className="space-y-4">
      <button type="button" disabled={buttonDisabled} className="btn btn-secondary w-full" onClick={startLogin}>
        <span className="mr-2 inline-flex h-5 w-5 items-center justify-center rounded-full bg-green-100 text-xs font-semibold text-green-700 dark:bg-green-900/30 dark:text-green-300">
          W
        </span>
        {t('auth.oidc.signIn', { providerName })}
      </button>

      {disabledHint && (
        <p data-testid="wechat-oauth-hint" className="text-sm text-amber-600 dark:text-amber-400">
          {disabledHint}
        </p>
      )}

      {showDivider && (
        <div className="flex items-center gap-3">
          <div className="h-px flex-1 bg-gray-200 dark:bg-dark-700" />
          <span className="text-xs text-gray-500 dark:text-dark-400">{t('auth.oauthOrContinue')}</span>
          <div className="h-px flex-1 bg-gray-200 dark:bg-dark-700" />
        </div>
      )}
    </div>
  )
}
