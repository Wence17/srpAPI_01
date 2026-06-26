'use client'

import { useEffect, useMemo, useState } from 'react'
import { useI18n } from '@/lib/i18n'
import type { Account, GeminiCredentials } from '@/lib/types'

interface AccountQuotaInfoProps {
  account: Account
}

export default function AccountQuotaInfo({ account }: AccountQuotaInfoProps) {
  const { t } = useI18n()
  const [now, setNow] = useState(() => new Date())

  const creds = account.credentials as GeminiCredentials | undefined

  const isCodeAssist = useMemo(() => {
    return creds?.oauth_type === 'code_assist' || (!creds?.oauth_type && !!creds?.project_id)
  }, [creds?.oauth_type, creds?.project_id])

  const isGoogleOne = creds?.oauth_type === 'google_one'

  const shouldShowQuota = account.platform === 'gemini'

  const tierLabel = useMemo(() => {
    if (isCodeAssist) {
      const tier = (creds?.tier_id || '').toString().trim().toLowerCase()
      if (tier === 'gcp_enterprise') return 'GCP Enterprise'
      if (tier === 'gcp_standard') return 'GCP Standard'
      const upper = (creds?.tier_id || '').toString().trim().toUpperCase()
      if (upper.includes('ULTRA') || upper.includes('ENTERPRISE')) return 'GCP Enterprise'
      if (upper) return `GCP ${upper}`
      return 'GCP'
    }

    if (isGoogleOne) {
      const tier = (creds?.tier_id || '').toString().trim().toLowerCase()
      if (tier === 'google_ai_ultra') return 'Google AI Ultra'
      if (tier === 'google_ai_pro') return 'Google AI Pro'
      if (tier === 'google_one_free') return 'Google One Free'
      const upper = (creds?.tier_id || '').toString().trim().toUpperCase()
      if (upper === 'AI_PREMIUM') return 'Google AI Pro'
      if (upper === 'GOOGLE_ONE_UNLIMITED') return 'Google AI Ultra'
      if (upper) return `Google One ${upper}`
      return 'Google One'
    }

    const tier = (creds?.tier_id || '').toString().trim().toLowerCase()
    if (tier === 'aistudio_paid') return 'AI Studio Pay-as-you-go'
    if (tier === 'aistudio_free') return 'AI Studio Free Tier'
    return 'AI Studio'
  }, [creds?.tier_id, isCodeAssist, isGoogleOne])

  const tierBadgeClass = useMemo(() => {
    if (isCodeAssist) {
      const tier = (creds?.tier_id || '').toString().trim().toLowerCase()
      if (tier === 'gcp_enterprise') {
        return 'bg-purple-100 text-purple-600 dark:bg-purple-900/40 dark:text-purple-300'
      }
      if (tier === 'gcp_standard') {
        return 'bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-300'
      }
      const upper = (creds?.tier_id || '').toString().trim().toUpperCase()
      if (upper.includes('ULTRA') || upper.includes('ENTERPRISE')) {
        return 'bg-purple-100 text-purple-600 dark:bg-purple-900/40 dark:text-purple-300'
      }
      return 'bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-300'
    }

    if (isGoogleOne) {
      const tier = (creds?.tier_id || '').toString().trim().toLowerCase()
      if (tier === 'google_ai_ultra') {
        return 'bg-purple-100 text-purple-600 dark:bg-purple-900/40 dark:text-purple-300'
      }
      if (tier === 'google_ai_pro') {
        return 'bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-300'
      }
      if (tier === 'google_one_free') {
        return 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'
      }
      const upper = (creds?.tier_id || '').toString().trim().toUpperCase()
      if (upper === 'GOOGLE_ONE_UNLIMITED') {
        return 'bg-purple-100 text-purple-600 dark:bg-purple-900/40 dark:text-purple-300'
      }
      if (upper === 'AI_PREMIUM') {
        return 'bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-300'
      }
      return 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'
    }

    const tier = (creds?.tier_id || '').toString().trim().toLowerCase()
    if (tier === 'aistudio_paid') {
      return 'bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-300'
    }
    if (tier === 'aistudio_free') {
      return 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'
    }
    return 'bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-300'
  }, [creds?.tier_id, isCodeAssist, isGoogleOne])

  const isRateLimited = useMemo(() => {
    if (!account.rate_limit_reset_at) return false
    const resetTime = Date.parse(account.rate_limit_reset_at)
    if (Number.isNaN(resetTime)) return false
    return resetTime > now.getTime()
  }, [account.rate_limit_reset_at, now])

  const resetCountdown = useMemo(() => {
    if (!account.rate_limit_reset_at) return ''
    const resetTime = Date.parse(account.rate_limit_reset_at)
    if (Number.isNaN(resetTime)) return '-'

    const diffMs = resetTime - now.getTime()
    if (diffMs <= 0) return t('admin.accounts.gemini.rateLimit.now')

    const diffSeconds = Math.floor(diffMs / 1000)
    const diffMinutes = Math.floor(diffSeconds / 60)
    const diffHours = Math.floor(diffMinutes / 60)

    if (diffMinutes < 1) return `${diffSeconds}s`
    if (diffHours < 1) {
      const secs = diffSeconds % 60
      return `${diffMinutes}m ${secs}s`
    }
    const mins = diffMinutes % 60
    return `${diffHours}h ${mins}m`
  }, [account.rate_limit_reset_at, now, t])

  const isUrgent = useMemo(() => {
    if (!account.rate_limit_reset_at) return false
    const resetTime = Date.parse(account.rate_limit_reset_at)
    if (Number.isNaN(resetTime)) return false
    const diffMs = resetTime - now.getTime()
    return diffMs > 0 && diffMs < 60000
  }, [account.rate_limit_reset_at, now])

  useEffect(() => {
    if (!isRateLimited) return
    const timer = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(timer)
  }, [isRateLimited])

  if (!shouldShowQuota) return null

  return (
    <div>
      <div className="mb-1 flex items-center gap-1">
        <span className={`badge rounded px-2 py-0.5 text-xs font-medium ${tierBadgeClass}`}>
          {tierLabel}
        </span>
      </div>

      <div className="text-xs text-gray-400 dark:text-gray-500">
        {!isRateLimited ? (
          <span>{t('admin.accounts.gemini.rateLimit.unlimited')}</span>
        ) : (
          <span
            className={`font-medium ${
              isUrgent
                ? 'animate-pulse text-red-600 dark:text-red-400'
                : 'text-amber-600 dark:text-amber-400'
            }`}
          >
            {t('admin.accounts.gemini.rateLimit.limited', { time: resetCountdown })}
          </span>
        )}
      </div>
    </div>
  )
}
