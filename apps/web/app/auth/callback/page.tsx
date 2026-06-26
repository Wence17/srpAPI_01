'use client'

import { Suspense } from 'react'
import OAuthCallbackView from '@/components/auth/OAuthCallbackView'

export default function OAuthCallbackPage() {
  return (
    <Suspense fallback={null}>
      <OAuthCallbackView />
    </Suspense>
  )
}
