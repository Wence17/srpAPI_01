'use client'

import { Suspense } from 'react'
import StandardPendingOAuthCallbackView from '@/components/auth/StandardPendingOAuthCallbackView'

export default function OidcOAuthCallbackPage() {
  return (
    <Suspense fallback={null}>
      <StandardPendingOAuthCallbackView variant="oidc" testIdPrefix="oidc" />
    </Suspense>
  )
}
