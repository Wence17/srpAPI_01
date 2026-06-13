'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { getPublicSettings } from '@/lib/auth'
import { checkUpdates, type ReleaseInfo, type VersionInfo } from '@/lib/adminSystem'
import type { PublicSettings, Toast } from '@/lib/types'

interface AppContextValue {
  // Public settings
  siteName: string
  siteLogo: string
  siteVersion: string
  contactInfo: string
  docUrl: string
  apiBaseUrl: string
  publicSettingsLoaded: boolean
  cachedPublicSettings: PublicSettings | null
  backendModeEnabled: boolean
  fetchPublicSettings: () => Promise<void>

  // Sidebar / mobile UI state
  sidebarCollapsed: boolean
  mobileOpen: boolean
  toggleSidebar: () => void
  setSidebarCollapsed: (collapsed: boolean) => void
  toggleMobileSidebar: () => void
  setMobileOpen: (open: boolean) => void

  // Version state
  versionLoading: boolean
  currentVersion: string
  latestVersion: string
  hasUpdate: boolean
  buildType: string
  releaseInfo: ReleaseInfo | null
  fetchVersion: (force?: boolean) => Promise<VersionInfo | null>
  clearVersionCache: () => void

  // Toasts
  toasts: Toast[]
  showToast: (type: Toast['type'], message: string, duration?: number) => string
  showSuccess: (message: string, duration?: number) => string
  showError: (message: string, duration?: number) => string
  showInfo: (message: string, duration?: number) => string
  showWarning: (message: string, duration?: number) => string
  hideToast: (id: string) => void
}

const AppContext = createContext<AppContextValue | undefined>(undefined)

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [siteName, setSiteName] = useState('Sub2API')
  const [siteLogo, setSiteLogo] = useState('')
  const [siteVersion, setSiteVersion] = useState('')
  const [contactInfo, setContactInfo] = useState('')
  const [docUrl, setDocUrl] = useState('')
  const [apiBaseUrl, setApiBaseUrl] = useState('')
  const [publicSettingsLoaded, setPublicSettingsLoaded] = useState(false)
  const [cachedPublicSettings, setCachedPublicSettings] = useState<PublicSettings | null>(null)

  const [sidebarCollapsed, setSidebarCollapsedState] = useState(false)
  const [mobileOpen, setMobileOpenState] = useState(false)

  // Version cache state
  const [versionLoading, setVersionLoading] = useState(false)
  const [currentVersion, setCurrentVersion] = useState('')
  const [latestVersion, setLatestVersion] = useState('')
  const [hasUpdate, setHasUpdate] = useState(false)
  const [buildType, setBuildType] = useState('source')
  const [releaseInfo, setReleaseInfo] = useState<ReleaseInfo | null>(null)
  const versionLoadedRef = useRef(false)
  const versionLoadingRef = useRef(false)

  const [toasts, setToasts] = useState<Toast[]>([])
  const toastCounterRef = useRef(0)

  const backendModeEnabled = cachedPublicSettings?.backend_mode_enabled === true

  const fetchPublicSettingsHandler = useCallback(async () => {
    try {
      const settings = (await getPublicSettings()) as PublicSettings
      setCachedPublicSettings(settings)
      setSiteName(settings.site_name || 'Sub2API')
      setSiteLogo(settings.site_logo || '')
      setSiteVersion(settings.version || '')
      setContactInfo(settings.contact_info || '')
      setApiBaseUrl(settings.api_base_url || '')
      setDocUrl(settings.doc_url || '')
      setPublicSettingsLoaded(true)
    } catch (error) {
      console.error('Failed to fetch public settings:', error)
    }
  }, [])

  useEffect(() => {
    fetchPublicSettingsHandler().catch(console.error)
  }, [fetchPublicSettingsHandler])

  // ==================== Sidebar / mobile ====================

  const toggleSidebar = useCallback(() => {
    setSidebarCollapsedState((prev) => !prev)
  }, [])

  const setSidebarCollapsed = useCallback((collapsed: boolean) => {
    setSidebarCollapsedState(collapsed)
  }, [])

  const toggleMobileSidebar = useCallback(() => {
    setMobileOpenState((prev) => !prev)
  }, [])

  const setMobileOpen = useCallback((open: boolean) => {
    setMobileOpenState(open)
  }, [])

  // ==================== Version management ====================

  const fetchVersion = useCallback(async (force = false): Promise<VersionInfo | null> => {
    if (versionLoadedRef.current && !force) {
      return {
        current_version: currentVersion,
        latest_version: latestVersion,
        has_update: hasUpdate,
        build_type: buildType,
        release_info: releaseInfo || undefined,
        cached: true,
      }
    }

    if (versionLoadingRef.current) {
      return null
    }

    versionLoadingRef.current = true
    setVersionLoading(true)
    try {
      const data = await checkUpdates(force)
      setCurrentVersion(data.current_version)
      setLatestVersion(data.latest_version)
      setHasUpdate(data.has_update)
      setBuildType(data.build_type || 'source')
      setReleaseInfo(data.release_info || null)
      versionLoadedRef.current = true
      return data
    } catch (error) {
      console.error('Failed to fetch version:', error)
      return null
    } finally {
      versionLoadingRef.current = false
      setVersionLoading(false)
    }
  }, [currentVersion, latestVersion, hasUpdate, buildType, releaseInfo])

  const clearVersionCache = useCallback(() => {
    versionLoadedRef.current = false
    setHasUpdate(false)
  }, [])

  // ==================== Toasts ====================

  const showToast = useCallback((type: Toast['type'], message: string, duration = 3000) => {
    const id = `toast-${++toastCounterRef.current}`
    const toast: Toast = {
      id,
      type,
      message,
      duration,
      createdAt: Date.now(),
    }
    setToasts((prev) => [...prev, toast])
    if (duration > 0) {
      window.setTimeout(() => {
        setToasts((prev) => prev.filter((item) => item.id !== id))
      }, duration)
    }
    return id
  }, [])

  const showSuccess = useCallback((message: string, duration = 3000) => showToast('success', message, duration), [showToast])
  const showError = useCallback((message: string, duration = 5000) => showToast('error', message, duration), [showToast])
  const showInfo = useCallback((message: string, duration = 3000) => showToast('info', message, duration), [showToast])
  const showWarning = useCallback((message: string, duration = 4000) => showToast('warning', message, duration), [showToast])

  const hideToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id))
  }, [])

  const value = useMemo<AppContextValue>(
    () => ({
      siteName,
      siteLogo,
      siteVersion,
      contactInfo,
      docUrl,
      apiBaseUrl,
      publicSettingsLoaded,
      cachedPublicSettings,
      backendModeEnabled,
      fetchPublicSettings: fetchPublicSettingsHandler,
      sidebarCollapsed,
      mobileOpen,
      toggleSidebar,
      setSidebarCollapsed,
      toggleMobileSidebar,
      setMobileOpen,
      versionLoading,
      currentVersion,
      latestVersion,
      hasUpdate,
      buildType,
      releaseInfo,
      fetchVersion,
      clearVersionCache,
      toasts,
      showToast,
      showSuccess,
      showError,
      showInfo,
      showWarning,
      hideToast,
    }),
    [
      siteName,
      siteLogo,
      siteVersion,
      contactInfo,
      docUrl,
      apiBaseUrl,
      publicSettingsLoaded,
      cachedPublicSettings,
      backendModeEnabled,
      fetchPublicSettingsHandler,
      sidebarCollapsed,
      mobileOpen,
      toggleSidebar,
      setSidebarCollapsed,
      toggleMobileSidebar,
      setMobileOpen,
      versionLoading,
      currentVersion,
      latestVersion,
      hasUpdate,
      buildType,
      releaseInfo,
      fetchVersion,
      clearVersionCache,
      toasts,
      showToast,
      showSuccess,
      showError,
      showInfo,
      showWarning,
      hideToast,
    ],
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
