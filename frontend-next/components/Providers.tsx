'use client'

import { I18nProvider } from '@/lib/i18n/I18nProvider'
import { AuthProvider } from '@/context/AuthContext'
import { AppProvider } from '@/context/AppContext'
import ToastHub from '@/components/ToastHub'
import AnnouncementPopup from '@/components/AnnouncementPopup'

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <I18nProvider>
      <AuthProvider>
        <AppProvider>
          {children}
          <ToastHub />
          <AnnouncementPopup />
        </AppProvider>
      </AuthProvider>
    </I18nProvider>
  )
}
