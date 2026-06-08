'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { getPublicSettings } from '@/lib/auth'
import type { PublicSettings, Toast } from '@/lib/types'

interface AppContextValue {
  siteName: string
  siteLogo: string
  contactInfo: string
  cachedPublicSettings: PublicSettings | null
  backendModeEnabled: boolean
  fetchPublicSettings: () => Promise<void>
  toasts: Toast[]
  showToast: (type: Toast['type'], message: string, duration?: number) => string
  hideToast: (id: string) => void
}

const AppContext = createContext<AppContextValue | undefined>(undefined)

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [siteName, setSiteName] = useState('Sub2API')
  const [siteLogo, setSiteLogo] = useState('')
  const [contactInfo, setContactInfo] = useState('')
  const [cachedPublicSettings, setCachedPublicSettings] = useState<PublicSettings | null>(null)
  const [toasts, setToasts] = useState<Toast[]>([])
  const [toastCounter, setToastCounter] = useState(0)

  const backendModeEnabled = cachedPublicSettings?.backend_mode_enabled === true

  const fetchPublicSettingsHandler = useCallback(async () => {
    try {
      const settings = (await getPublicSettings()) as PublicSettings
      setCachedPublicSettings(settings)
      if (settings.site_name) {
        setSiteName(settings.site_name)
      }
      if (settings.site_logo) {
        setSiteLogo(settings.site_logo)
      }
      if (settings.contact_info) {
        setContactInfo(settings.contact_info)
      }
    } catch (error) {
      console.error('Failed to fetch public settings:', error)
    }
  }, [])

  useEffect(() => {
    fetchPublicSettingsHandler().catch(console.error)
  }, [fetchPublicSettingsHandler])

  const showToast = useCallback((type: Toast['type'], message: string, duration = 3000) => {
    const id = `toast-${toastCounter + 1}`
    setToastCounter((value) => value + 1)
    const toast: Toast = {
      id,
      type,
      message,
      duration,
      createdAt: Date.now()
    }
    setToasts((prev) => [...prev, toast])
    if (duration > 0) {
      window.setTimeout(() => {
        setToasts((prev) => prev.filter((item) => item.id !== id))
      }, duration)
    }
    return id
  }, [toastCounter])

  const hideToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id))
  }, [])

  const value = useMemo(
    () => ({
      siteName,
      siteLogo,
      contactInfo,
      cachedPublicSettings,
      backendModeEnabled,
      fetchPublicSettings: fetchPublicSettingsHandler,
      toasts,
      showToast,
      hideToast
    }),
    [siteName, siteLogo, contactInfo, cachedPublicSettings, backendModeEnabled, fetchPublicSettingsHandler, toasts, showToast, hideToast]
  )

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

export function useApp() {
  const context = useContext(AppContext)
  if (!context) {
    throw new Error('useApp must be used within AppProvider')
  }
  return context
}
