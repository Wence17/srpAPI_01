'use client'

import { AuthProvider } from '@/context/AuthContext'
import { AppProvider } from '@/context/AppContext'
import ToastHub from '@/components/ToastHub'
import AnnouncementPopup from '@/components/AnnouncementPopup'

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <AppProvider>
        {children}
        <ToastHub />
        <AnnouncementPopup />
      </AppProvider>
    </AuthProvider>
  )
}
