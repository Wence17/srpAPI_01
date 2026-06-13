'use client'

import { Suspense } from 'react'
import StandardPendingOAuthCallbackView from '@/components/auth/StandardPendingOAuthCallbackView'

export default function LinuxDoOAuthCallbackPage() {
  return (
    <Suspense fallback={null}>
      <StandardPendingOAuthCallbackView variant="linuxdo" testIdPrefix="linuxdo" />
    </Suspense>
  )
}
