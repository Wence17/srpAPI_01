'use client'

import { useMemo } from 'react'
import { useI18n } from '@/lib/i18n'
import type { AccountPlatform, AccountType } from '@/lib/types'
import PlatformIcon from '@/components/common/PlatformIcon'
import Icon from '@/components/icons/Icon'

interface PlatformTypeBadgeProps {
  platform: AccountPlatform
  type: AccountType
  planType?: string
  privacyMode?: string
  subscriptionExpiresAt?: string
}

export default function PlatformTypeBadge({
  platform,
  type,
  planType,
  privacyMode,
  subscriptionExpiresAt,
}: PlatformTypeBadgeProps) {
  const { t } = useI18n()

  const platformLabel = useMemo(() => {
    if (platform === 'anthropic') return 'Anthropic'
    if (platform === 'openai') return 'OpenAI'
    if (platform === 'antigravity') return 'Antigravity'
    return 'Gemini'
  }, [platform])

  const typeLabel = useMemo(() => {
    switch (type) {
      case 'oauth':
        return 'OAuth'
      case 'setup-token':
        return 'Token'
      case 'apikey':
        return 'Key'
      case 'bedrock':
        return 'AWS'
      case 'service_account':
        return 'Vertex'
      default:
        return type
    }
  }, [type])

  const planLabel = useMemo(() => {
    if (!planType) return ''
    const lower = planType.toLowerCase()
    switch (lower) {
      case 'plus':
        return 'Plus'
      case 'team':
        return 'Team'
      case 'chatgptpro':
      case 'pro':
        return 'Pro'
      case 'free':
        return 'Free'
      case 'abnormal':
        return t('admin.accounts.subscriptionAbnormal')
      default:
        return planType
    }
  }, [planType, t])

  const platformClass = useMemo(() => {
    if (platform === 'anthropic') {
      return 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400'
    }
    if (platform === 'openai') {
      return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
    }
    if (platform === 'antigravity') {
      return 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400'
    }
    return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
  }, [platform])

  const typeClass = useMemo(() => {
    if (platform === 'anthropic') {
      return 'bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400'
    }
    if (platform === 'openai') {
      return 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400'
    }
    if (platform === 'antigravity') {
      return 'bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400'
    }
    return 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400'
  }, [platform])

  const planBadgeClass = useMemo(() => {
    if (planType && planType.toLowerCase() === 'abnormal') {
      return 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400'
    }
    return typeClass
  }, [planType, typeClass])

  const expiresLabel = useMemo(() => {
    if (!subscriptionExpiresAt || !planType) return ''
    if (planType.toLowerCase() === 'free') return ''
    try {
      const d = new Date(subscriptionExpiresAt)
      if (isNaN(d.getTime())) return ''
      const yyyy = d.getFullYear()
      const mm = String(d.getMonth() + 1).padStart(2, '0')
      const dd = String(d.getDate()).padStart(2, '0')
      return `${t('admin.accounts.subscriptionExpires')} ${yyyy}-${mm}-${dd}`
    } catch {
      return ''
    }
  }, [planType, subscriptionExpiresAt, t])

  const privacyBadge = useMemo(() => {
    if (type !== 'oauth' || !privacyMode) return null
    if (platform !== 'openai' && platform !== 'antigravity') return null

    const shieldCheck =
      'M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z'
    const shieldX =
      'M12 9v3.75m0-10.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285zM12 18h.008v.008H12V18z'

    switch (privacyMode) {
      case 'training_off':
        return {
          label: 'Private',
          icon: shieldCheck,
          title: t('admin.accounts.privacyTrainingOff'),
          class: 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400',
        }
      case 'training_set_cf_blocked':
        return {
          label: 'CF',
          icon: shieldX,
          title: t('admin.accounts.privacyCfBlocked'),
          class: 'bg-yellow-100 text-yellow-600 dark:bg-yellow-900/30 dark:text-yellow-400',
        }
      case 'training_set_failed':
        return {
          label: 'Fail',
          icon: shieldX,
          title: t('admin.accounts.privacyFailed'),
          class: 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400',
        }
      case 'privacy_set':
        return {
          label: 'Private',
          icon: shieldCheck,
          title: t('admin.accounts.privacyAntigravitySet'),
          class: 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400',
        }
      case 'privacy_set_failed':
        return {
          label: 'Fail',
          icon: shieldX,
          title: t('admin.accounts.privacyAntigravityFailed'),
          class: 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400',
        }
      default:
        return null
    }
  }, [platform, privacyMode, t, type])

  return (
    <div className="inline-flex flex-col gap-0.5 text-xs font-medium">
      <div className="inline-flex items-center overflow-hidden rounded-md">
        <span className={`inline-flex items-center gap-1 px-2 py-1 ${platformClass}`}>
          <PlatformIcon platform={platform} size="xs" />
          <span>{platformLabel}</span>
        </span>
        <span className={`inline-flex items-center gap-1 px-1.5 py-1 ${typeClass}`}>
          {type === 'oauth' ? (
            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"
              />
            </svg>
          ) : type === 'setup-token' ? (
            <Icon name="shield" size="xs" />
          ) : type === 'service_account' ? (
            <Icon name="cloud" size="xs" />
          ) : (
            <Icon name="key" size="xs" />
          )}
          <span>{typeLabel}</span>
        </span>
      </div>

      {(planLabel || privacyBadge) && (
        <div className="inline-flex items-center overflow-hidden rounded-md">
          {planLabel ? (
            <span className={`inline-flex items-center gap-1 px-1.5 py-1 ${planBadgeClass}`}>
              <span>{planLabel}</span>
            </span>
          ) : null}
          {privacyBadge ? (
            <span
              className={`inline-flex items-center gap-1 px-1.5 py-1 ${privacyBadge.class}`}
              title={privacyBadge.title}
            >
              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d={privacyBadge.icon} />
              </svg>
              <span>{privacyBadge.label}</span>
            </span>
          ) : null}
        </div>
      )}

      {expiresLabel ? (
        <div
          className="text-[10px] leading-tight text-gray-400 dark:text-gray-500 pl-0.5"
          title={subscriptionExpiresAt}
        >
          {expiresLabel}
        </div>
      ) : null}
    </div>
  )
}
