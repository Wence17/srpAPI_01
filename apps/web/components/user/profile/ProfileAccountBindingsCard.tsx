'use client'

import ProfileIdentityBindingsSection from './ProfileIdentityBindingsSection'
import type { User } from '@/lib/types'

interface ProfileAccountBindingsCardProps {
  user: User | null
  linuxdoEnabled?: boolean
  dingtalkEnabled?: boolean
  oidcEnabled?: boolean
  oidcProviderName?: string
  wechatEnabled?: boolean
  wechatOpenEnabled?: boolean
  wechatMpEnabled?: boolean
}

export default function ProfileAccountBindingsCard({
  user,
  linuxdoEnabled = false,
  dingtalkEnabled = false,
  oidcEnabled = false,
  oidcProviderName = 'OIDC',
  wechatEnabled = false,
  wechatOpenEnabled,
  wechatMpEnabled,
}: ProfileAccountBindingsCardProps) {
  return (
    <ProfileIdentityBindingsSection
      user={user}
      linuxdoEnabled={linuxdoEnabled}
      dingtalkEnabled={dingtalkEnabled}
      oidcEnabled={oidcEnabled}
      oidcProviderName={oidcProviderName}
      wechatEnabled={wechatEnabled}
      wechatOpenEnabled={wechatOpenEnabled}
      wechatMpEnabled={wechatMpEnabled}
    />
  )
}
