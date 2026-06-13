/**
 * Announcement Store
 *
 * Ported from the original Pinia store (src/stores/announcements.ts) to a
 * singleton external store. Handles fetching user announcements (throttled),
 * unread counting, popup queueing, and read-state mutations.
 */

import announcementsAPI from '../announcements'
import type { UserAnnouncement } from '../types'
import { createStore, useStore } from '../createStore'

const THROTTLE_MS = 20 * 60 * 1000 // 20 minutes

interface AnnouncementState {
  announcements: UserAnnouncement[]
  loading: boolean
  currentPopup: UserAnnouncement | null
}

const store = createStore<AnnouncementState>({
  announcements: [],
  loading: false,
  currentPopup: null,
})

// Non-reactive bookkeeping (matches the original store's plain refs/locals).
let lastFetchTime = 0
let popupQueue: UserAnnouncement[] = []
let shownPopupIds = new Set<number>()

function getUnreadCount(): number {
  return store.getState().announcements.filter((a) => !a.read_at).length
}

async function fetchAnnouncements(force = false): Promise<void> {
  const now = Date.now()
  if (!force && lastFetchTime > 0 && now - lastFetchTime < THROTTLE_MS) {
    return
  }

  // Set immediately to prevent concurrent duplicate requests.
  lastFetchTime = now

  try {
    store.setState({ loading: true })
    const all = await announcementsAPI.list(false)
    store.setState({ announcements: all.slice(0, 20) })
    enqueueNewPopups()
  } catch (err) {
    // Revert throttle timestamp on failure so retry is allowed.
    lastFetchTime = 0
    console.error('Failed to fetch announcements:', err)
  } finally {
    store.setState({ loading: false })
  }
}

function enqueueNewPopups() {
  const { announcements } = store.getState()
  const newPopups = announcements.filter(
    (a) => a.notify_mode === 'popup' && !a.read_at && !shownPopupIds.has(a.id),
  )
  if (newPopups.length === 0) return

  for (const p of newPopups) {
    if (!popupQueue.some((q) => q.id === p.id)) {
      popupQueue.push(p)
    }
  }

  if (!store.getState().currentPopup) {
    showNextPopup()
  }
}

function showNextPopup() {
  if (popupQueue.length === 0) {
    store.setState({ currentPopup: null })
    return
  }
  const next = popupQueue.shift()!
  shownPopupIds.add(next.id)
  store.setState({ currentPopup: next })
}

async function dismissPopup() {
  const current = store.getState().currentPopup
  if (!current) return
  const id = current.id
  store.setState({ currentPopup: null })

  // Mark as read (fire-and-forget, UI already updated).
  markAsRead(id)

  if (popupQueue.length > 0) {
    setTimeout(() => showNextPopup(), 300)
  }
}

async function markAsRead(id: number) {
  try {
    await announcementsAPI.markRead(id)
    store.setState((prev) => ({
      announcements: prev.announcements.map((a) =>
        a.id === id ? { ...a, read_at: new Date().toISOString() } : a,
      ),
    }))
  } catch (err) {
    console.error('Failed to mark announcement as read:', err)
  }
}

async function markAllAsRead() {
  const unread = store.getState().announcements.filter((a) => !a.read_at)
  if (unread.length === 0) return

  try {
    store.setState({ loading: true })
    await Promise.all(unread.map((a) => announcementsAPI.markRead(a.id)))
    const nowIso = new Date().toISOString()
    store.setState((prev) => ({
      announcements: prev.announcements.map((a) => (a.read_at ? a : { ...a, read_at: nowIso })),
    }))
  } catch (err) {
    console.error('Failed to mark all as read:', err)
    throw err
  } finally {
    store.setState({ loading: false })
  }
}

function reset() {
  lastFetchTime = 0
  shownPopupIds = new Set()
  popupQueue = []
  store.setState({ announcements: [], currentPopup: null, loading: false })
}

export const announcementStore = {
  getState: store.getState,
  subscribe: store.subscribe,
  getUnreadCount,
  fetchAnnouncements,
  dismissPopup,
  markAsRead,
  markAllAsRead,
  reset,
}

export function useAnnouncementStore() {
  const announcements = useStore(store, (s) => s.announcements)
  const loading = useStore(store, (s) => s.loading)
  const currentPopup = useStore(store, (s) => s.currentPopup)
  const unreadCount = announcements.filter((a) => !a.read_at).length

  return {
    announcements,
    loading,
    currentPopup,
    unreadCount,
    fetchAnnouncements,
    dismissPopup,
    markAsRead,
    markAllAsRead,
    reset,
  }
}
