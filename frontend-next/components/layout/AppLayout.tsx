'use client'

/**
 * Application shell wrapper.
 *
 * Verbatim port of AppLayout.vue: background decoration + sidebar + header +
 * main content, with the main column offset to make room for the collapsible
 * sidebar on large screens.
 */

import { useEffect } from 'react'
import { useApp } from '@/context/AppContext'
import { useAuth } from '@/context/AuthContext'
import { onboardingStore } from '@/lib/stores/onboarding'
import { useOnboardingTour } from '@/lib/useOnboardingTour'
import AppSidebar from './AppSidebar'
import AppHeader from './AppHeader'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { sidebarCollapsed } = useApp()
  const { isAdmin } = useAuth()

  const { replayTour } = useOnboardingTour({
    storageKey: isAdmin ? 'admin_guide' : 'user_guide',
    autoStart: true,
  })

  useEffect(() => {
    onboardingStore.setReplayCallback(replayTour)
    return () => {
      onboardingStore.setReplayCallback(null)
    }
  }, [replayTour])

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-dark-950">
      {/* Background Decoration */}
      <div className="pointer-events-none fixed inset-0 bg-mesh-gradient" />

      {/* Sidebar */}
      <AppSidebar />

      {/* Main Content Area */}
      <div
        className={`relative min-h-screen transition-all duration-300 ${
          sidebarCollapsed ? 'lg:ml-[72px]' : 'lg:ml-64'
        }`}
      >
        {/* Header */}
        <AppHeader />

        {/* Main Content */}
        <main className="p-4 md:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  )
}
