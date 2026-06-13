'use client'

import { Suspense } from 'react'
import OAuthCallbackView from '@/components/auth/OAuthCallbackView'

export default function OAuthCallbackAliasPage() {
  return (
    <Suspense fallback={null}>
      <OAuthCallbackView isEmailOAuthRoute />
    </Suspense>
  )
}
