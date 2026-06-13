'use client'

import { useSearchParams } from 'next/navigation'
import { useI18n } from '@/lib/i18n'
import { getApiBaseUrl } from '@/lib/apiClient'
import { resolveAffiliateReferralCode, storeOAuthAffiliateCode } from '@/lib/oauthAffiliate'

interface DingTalkOAuthSectionProps {
  disabled?: boolean
  affCode?: string
  showDivider?: boolean
}

export default function DingTalkOAuthSection({
  disabled = false,
  affCode,
  showDivider = true,
}: DingTalkOAuthSectionProps) {
  const { t } = useI18n()
  const searchParams = useSearchParams()

  function startLogin(): void {
    const redirectTo = searchParams.get('redirect') || '/dashboard'
    storeOAuthAffiliateCode(
      resolveAffiliateReferralCode(affCode, searchParams.get('aff'), searchParams.get('aff_code')),
    )
    const startURL = `${getApiBaseUrl()}/auth/oauth/dingtalk/start?redirect=${encodeURIComponent(redirectTo)}`
    window.location.href = startURL
  }

  return (
    <div className="space-y-4">
      <button type="button" disabled={disabled} className="btn btn-secondary w-full" onClick={startLogin}>
        <svg
          className="icon mr-2"
          viewBox="0 0 24 24"
          xmlns="http://www.w3.org/2000/svg"
          width="20"
          height="20"
          aria-hidden="true"
          style={{ flexShrink: 0 }}
        >
          <circle cx="12" cy="12" r="12" fill="#1677FF" />
          <text
            x="12"
            y="17"
            fontFamily="sans-serif"
            fontSize="13"
            fontWeight="bold"
            fill="white"
            textAnchor="middle"
          >
            钉
          </text>
        </svg>
        {t('auth.dingtalk.signIn')}
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
