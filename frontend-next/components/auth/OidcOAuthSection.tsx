'use client'

import { useMemo } from 'react'
import { useSearchParams } from 'next/navigation'
import { useI18n } from '@/lib/i18n'
import { getApiBaseUrl } from '@/lib/apiClient'
import { resolveAffiliateReferralCode, storeOAuthAffiliateCode } from '@/lib/oauthAffiliate'

interface OidcOAuthSectionProps {
  disabled?: boolean
  affCode?: string
  providerName?: string
  showDivider?: boolean
}

export default function OidcOAuthSection({
  disabled = false,
  affCode,
  providerName = 'OIDC',
  showDivider = true,
}: OidcOAuthSectionProps) {
  const { t } = useI18n()
  const searchParams = useSearchParams()

  const normalizedProviderName = useMemo(() => {
    const name = providerName?.trim()
    return name || 'OIDC'
  }, [providerName])

  const providerInitial = normalizedProviderName.charAt(0).toUpperCase() || 'O'

  function startLogin(): void {
    const redirectTo = searchParams.get('redirect') || '/dashboard'
    storeOAuthAffiliateCode(
      resolveAffiliateReferralCode(affCode, searchParams.get('aff'), searchParams.get('aff_code')),
    )
    const startURL = `${getApiBaseUrl()}/auth/oauth/oidc/start?redirect=${encodeURIComponent(redirectTo)}`
    window.location.href = startURL
  }

  return (
    <div className="space-y-4">
      <button type="button" disabled={disabled} className="btn btn-secondary w-full" onClick={startLogin}>
        <span className="mr-2 inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary-100 text-xs font-semibold text-primary-700 dark:bg-primary-900/30 dark:text-primary-300">
          {providerInitial}
        </span>
        {t('auth.oidc.signIn', { providerName: normalizedProviderName })}
      </button>

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
