'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import AuthLayout from '@/components/layout/AuthLayout'
import PendingOAuthCreateAccountForm, {
  type PendingOAuthCreateAccountPayload,
} from '@/components/auth/PendingOAuthCreateAccountForm'
import { useAuth } from '@/context/AuthContext'
import { useApp } from '@/context/AppContext'
import { useI18n } from '@/lib/i18n'
import { apiClient } from '@/lib/apiClient'
import { persistOAuthTokenContext } from '@/lib/auth'
import type { PendingOAuthExchangeResponse } from '@/lib/types'
import { clearAllAffiliateReferralCodes } from '@/lib/oauthAffiliate'
import { getRequestErrorMessage, sanitizeRedirectPath } from '@/lib/oauthCallback'

function DingTalkEmailCompletionContent() {
  const { t } = useI18n()
  const router = useRouter()
  const searchParams = useSearchParams()
  const authStore = useAuth()
  const appStore = useApp()

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [accountActionError, setAccountActionError] = useState('')

  const initialEmail = searchParams.get('email') || ''

  useEffect(() => {
    if (accountActionError) {
      appStore.showError(accountActionError)
    }
  }, [accountActionError, appStore])

  const navigateToBindLogin = (email: string) => {
    const query = new URLSearchParams({ bind: '1' })
    if (email) query.set('email', email)
    const redirect = searchParams.get('redirect')
    if (redirect) query.set('redirect', redirect)
    router.replace(`/auth/dingtalk/callback?${query.toString()}`)
  }

  const handleCreateAccount = async (payload: PendingOAuthCreateAccountPayload) => {
    setAccountActionError('')
    if (!payload.email || !payload.password) return

    setIsSubmitting(true)
    try {
      const { data } = await apiClient.post<
        PendingOAuthExchangeResponse & {
          step?: string
          redirect?: string
          existing_account_bindable?: boolean
        }
      >('/auth/oauth/pending/create-account', {
        email: payload.email,
        password: payload.password,
        verify_code: payload.verifyCode || undefined,
        invitation_code: payload.invitationCode || undefined,
      })

      const redirect = sanitizeRedirectPath(data.redirect || searchParams.get('redirect'))

      if (data.access_token) {
        persistOAuthTokenContext(data)
        await authStore.setToken(data.access_token)
        clearAllAffiliateReferralCodes()
        appStore.showSuccess(t('auth.loginSuccess'))
        router.replace(redirect)
        return
      }

      if (data.step === 'choose_account_action_required' || data.existing_account_bindable === true) {
        navigateToBindLogin(payload.email)
        return
      }

      setAccountActionError(t('auth.loginFailed'))
    } catch (e: unknown) {
      const err = e as { response?: { data?: { reason?: string } } }
      if (err.response?.data?.reason === 'REGISTRATION_DISABLED') {
        appStore.showInfo(t('auth.dingtalk.registrationDisabledRedirectToBind'))
        navigateToBindLogin(payload.email)
        return
      }
      setAccountActionError(getRequestErrorMessage(e, t('auth.loginFailed')))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <AuthLayout>
      <div className="space-y-6">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
            {t('auth.dingtalk.createAccountTitle')}
          </h2>
          <p className="mt-2 text-sm text-gray-500 dark:text-dark-400">
            {t('auth.oauthFlow.createAccountHint')}
          </p>
        </div>

        <PendingOAuthCreateAccountForm
          testIdPrefix="dingtalk"
          initialEmail={initialEmail}
          isSubmitting={isSubmitting}
          errorMessage={accountActionError}
          onSubmit={handleCreateAccount}
          onSwitchToBind={navigateToBindLogin}
        />
      </div>
    </AuthLayout>
  )
}

export default function DingTalkEmailCompletionPage() {
  return (
    <Suspense fallback={null}>
      <DingTalkEmailCompletionContent />
    </Suspense>
  )
}
