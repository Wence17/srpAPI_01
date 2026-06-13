'use client'

import { Suspense } from 'react'
import StandardPendingOAuthCallbackView from '@/components/auth/StandardPendingOAuthCallbackView'

export default function DingTalkOAuthCallbackPage() {
  return (
    <Suspense fallback={null}>
      <StandardPendingOAuthCallbackView variant="dingtalk" testIdPrefix="dingtalk" />
    </Suspense>
  )
}
