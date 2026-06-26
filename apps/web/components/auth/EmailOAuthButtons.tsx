'use client'

import { useMemo } from 'react'
import { useSearchParams } from 'next/navigation'
import { useI18n } from '@/lib/i18n'
import { getApiBaseUrl } from '@/lib/apiClient'
import { resolveAffiliateReferralCode, storeOAuthAffiliateCode } from '@/lib/oauthAffiliate'
import GitHubMark from './GitHubMark'
import GoogleMark from './GoogleMark'

const EMAIL_OAUTH_PENDING_PROVIDER_KEY = 'email_oauth_pending_provider'

type EmailOAuthProvider = 'github' | 'google'

interface EmailOAuthButtonsProps {
  disabled?: boolean
  affCode?: string
  githubEnabled?: boolean
  googleEnabled?: boolean
  showDivider?: boolean
}

export default function EmailOAuthButtons({
  disabled = false,
  affCode,
  githubEnabled = false,
  googleEnabled = false,
  showDivider = true,
}: EmailOAuthButtonsProps) {
  const { t } = useI18n()
  const searchParams = useSearchParams()

  const visibleProviders = useMemo(() => {
    const providers: EmailOAuthProvider[] = []
    if (githubEnabled) providers.push('github')
    if (googleEnabled) providers.push('google')
    return providers
  }, [githubEnabled, googleEnabled])

  const hasProviders = visibleProviders.length > 0
  const hasMultipleProviders = visibleProviders.length > 1

  function providerLabel(provider: EmailOAuthProvider): string {
    const name = provider === 'github' ? 'GitHub' : 'Google'
    return hasMultipleProviders ? name : t('auth.emailOAuth.signIn', { providerName: name })
  }

  function startLogin(provider: EmailOAuthProvider): void {
    const redirectTo = searchParams.get('redirect') || '/dashboard'
    const affiliateCode = resolveAffiliateReferralCode(
      affCode,
      searchParams.get('aff'),
      searchParams.get('aff_code'),
    )
    storeOAuthAffiliateCode(affiliateCode)
    window.sessionStorage.setItem(EMAIL_OAUTH_PENDING_PROVIDER_KEY, provider)
    const params = new URLSearchParams({ redirect: redirectTo })
    if (affiliateCode) {
      params.set('aff_code', affiliateCode)
    }
    const startURL = `${getApiBaseUrl()}/auth/oauth/${provider}/start?${params.toString()}`
    window.location.href = startURL
  }

  if (!hasProviders) {
    return null
  }

  return (
    <div className="space-y-4">
      {showDivider && (
        <div className="flex items-center gap-3">
          <div className="h-px flex-1 bg-gray-200 dark:bg-dark-700" />
          <span className="text-xs text-gray-500 dark:text-dark-400">{t('auth.oauthOrContinue')}</span>
          <div className="h-px flex-1 bg-gray-200 dark:bg-dark-700" />
        </div>
      )}

      <div className={`grid grid-cols-1 gap-3 ${hasMultipleProviders ? 'sm:grid-cols-2' : ''}`}>
        {visibleProviders.map((provider) => (
          <button
            key={provider}
            type="button"
            disabled={disabled}
            className="btn btn-secondary h-12 w-full justify-center gap-2"
            onClick={() => startLogin(provider)}
          >
            {provider === 'github' ? (
              <GitHubMark className="h-5 w-5 text-gray-800 dark:text-gray-100" />
            ) : (
              <GoogleMark className="h-5 w-5" />
            )}
            <span className="font-medium">{providerLabel(provider)}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
