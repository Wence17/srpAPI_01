'use client'

import { Suspense } from 'react'
import WechatOAuthCallbackView from '@/components/auth/WechatOAuthCallbackView'

export default function WeChatOAuthCallbackPage() {
  return (
    <Suspense fallback={null}>
      <WechatOAuthCallbackView />
    </Suspense>
  )
}
