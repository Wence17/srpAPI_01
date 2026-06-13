'use client'

/**
 * Application shell wrapper.
 *
 * Verbatim port of AppLayout.vue: background decoration + sidebar + header +
 * main content, with the main column offset to make room for the collapsible
 * sidebar on large screens.
 *
 * The onboarding tour (`useOnboardingTour`) is a separate subsystem not yet
 * migrated; the onboarding store's replay callback is registered as a no-op
 * placeholder so the header's "restart tour" button degrades gracefully.
 */

import { useEffect } from 'react'
import { useApp } from '@/context/AppContext'
import { onboardingStore } from '@/lib/stores/onboarding'
import AppSidebar from './AppSidebar'
import AppHeader from './AppHeader'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { sidebarCollapsed } = useApp()

  useEffect(() => {
    // Placeholder until the interactive onboarding tour is ported.
    onboardingStore.setReplayCallback(() => {})
    return () => {
      onboardingStore.setReplayCallback(null)
    }
  }, [])

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
