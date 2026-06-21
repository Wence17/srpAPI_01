'use client'

import { Suspense } from 'react'
import { I18nProvider } from '@/lib/i18n/I18nProvider'
import { AuthProvider } from '@/context/AuthContext'
import { AppProvider } from '@/context/AppContext'
import ToastHub from '@/components/ToastHub'
import AnnouncementPopup from '@/components/AnnouncementPopup'
import RouteAccessGuard from '@/components/RouteAccessGuard'

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <I18nProvider>
      <AuthProvider>
        <AppProvider>
          <Suspense fallback={null}>
            <RouteAccessGuard>{children}</RouteAccessGuard>
          </Suspense>
          <ToastHub />
          <AnnouncementPopup />
        </AppProvider>
      </AuthProvider>
    </I18nProvider>
  )
}
