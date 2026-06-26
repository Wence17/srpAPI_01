'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import { useI18n } from '@/lib/i18n/I18nProvider'
import { useApp } from '@/context/AppContext'
import { useAnnouncementStore } from '@/lib/stores/announcements'
import { formatRelativeTime, formatRelativeWithDateTime } from '@/lib/format'
import type { UserAnnouncement } from '@/lib/types'
import Icon from '@/components/icons/Icon'

marked.setOptions({ breaks: true, gfm: true })

function renderMarkdown(content: string): string {
  if (!content) return ''
  const html = marked.parse(content) as string
  return DOMPurify.sanitize(html)
}

export default function AnnouncementBell() {
  const { t } = useI18n()
  const appStore = useApp()
  const {
    announcements,
    loading,
    currentPopup,
    unreadCount,
    fetchAnnouncements,
    markAsRead,
    markAllAsRead,
  } = useAnnouncementStore()

  const [mounted, setMounted] = useState(false)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [detailModalOpen, setDetailModalOpen] = useState(false)
  const [selectedAnnouncement, setSelectedAnnouncement] = useState<UserAnnouncement | null>(null)

  useEffect(() => {
    setMounted(true)
    fetchAnnouncements().catch((error) => {
      console.error('Failed to fetch announcements:', error)
    })
  }, [fetchAnnouncements])

  function openModal() {
    setIsModalOpen(true)
  }

  function closeModal() {
    setIsModalOpen(false)
  }

  function openDetail(announcement: UserAnnouncement) {
    setSelectedAnnouncement(announcement)
    setDetailModalOpen(true)
    if (!announcement.read_at) {
      handleMarkAsRead(announcement.id)
    }
  }

  function closeDetail() {
    setDetailModalOpen(false)
    setSelectedAnnouncement(null)
  }

  async function handleMarkAsRead(id: number) {
    try {
      await markAsRead(id)
    } catch (err: unknown) {
      appStore.showError((err as { message?: string })?.message || t('common.unknownError'))
    }
  }

  async function markAsReadAndClose(id: number) {
    await handleMarkAsRead(id)
    appStore.showSuccess(t('announcements.markedAsRead'))
    closeDetail()
  }

  async function handleMarkAllAsRead() {
    try {
      await markAllAsRead()
      appStore.showSuccess(t('announcements.allMarkedAsRead'))
    } catch (err: unknown) {
      appStore.showError((err as { message?: string })?.message || t('common.unknownError'))
    }
  }

  useEffect(() => {
    function handleEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        if (detailModalOpen) {
          closeDetail()
        } else if (isModalOpen) {
          closeModal()
        }
      }
    }
    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [detailModalOpen, isModalOpen])

  useEffect(() => {
    const anyOpen = isModalOpen || detailModalOpen || !!currentPopup
    document.body.style.overflow = anyOpen ? 'hidden' : ''
    return () => {
      document.body.style.overflow = ''
    }
  }, [isModalOpen, detailModalOpen, currentPopup])

  return (
    <div>
      {/* Bell button */}
      <button
        type="button"
        onClick={openModal}
        className={`relative flex h-9 w-9 items-center justify-center rounded-lg text-gray-600 transition-all hover:bg-gray-100 hover:scale-105 dark:text-gray-400 dark:hover:bg-dark-800 ${
          unreadCount > 0 ? 'text-blue-600 dark:text-blue-400' : ''
        }`}
        aria-label={t('announcements.title')}
      >
        <Icon name="bell" size="md" />
        {unreadCount > 0 ? (
          <span className="absolute right-1 top-1 flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
          </span>
        ) : null}
      </button>

      {/* List Modal */}
      {mounted && isModalOpen
        ? createPortal(
            <div
              className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-gradient-to-br from-black/70 via-black/60 to-black/70 p-4 pt-[8vh] backdrop-blur-md"
              onClick={closeModal}
            >
              <div
                className="w-full max-w-[620px] overflow-hidden rounded-3xl bg-white shadow-2xl ring-1 ring-black/5 dark:bg-dark-800 dark:ring-white/10"
                onClick={(e) => e.stopPropagation()}
              >
                {/* Header */}
                <div className="relative overflow-hidden border-b border-gray-100/80 bg-gradient-to-br from-blue-50/50 to-indigo-50/30 px-6 py-5 dark:border-dark-700/50 dark:from-blue-900/10 dark:to-indigo-900/5">
                  <div className="relative z-10 flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-lg shadow-blue-500/30">
                          <Icon name="bell" size="sm" />
                        </div>
                        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                          {t('announcements.title')}
                        </h2>
                      </div>
                      {unreadCount > 0 ? (
                        <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                          <span className="font-medium text-blue-600 dark:text-blue-400">{unreadCount}</span>{' '}
                          {t('announcements.unread')}
                        </p>
                      ) : null}
                    </div>
                    <div className="flex items-center gap-2">
                      {unreadCount > 0 ? (
                        <button
                          type="button"
                          onClick={handleMarkAllAsRead}
                          disabled={loading}
                          className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-medium text-white shadow-lg shadow-blue-500/30 transition-all hover:bg-blue-700 hover:shadow-xl disabled:opacity-50 dark:bg-blue-500 dark:hover:bg-blue-600"
                        >
                          {t('announcements.markAllRead')}
                        </button>
                      ) : null}
                      <button
                        type="button"
                        onClick={closeModal}
                        className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/50 text-gray-500 backdrop-blur-sm transition-all hover:bg-white hover:text-gray-700 dark:bg-dark-700/50 dark:text-gray-400 dark:hover:bg-dark-700 dark:hover:text-gray-300"
                        aria-label={t('common.close')}
                      >
                        <Icon name="x" size="sm" />
                      </button>
                    </div>
                  </div>
                  <div className="absolute right-0 top-0 h-full w-48 bg-gradient-to-l from-indigo-100/20 to-transparent dark:from-indigo-900/10" />
                </div>

                {/* Body */}
                <div className="max-h-[65vh] overflow-y-auto">
                  {loading ? (
                    <div className="flex items-center justify-center py-16">
                      <div className="relative">
                        <div className="h-12 w-12 animate-spin rounded-full border-4 border-gray-200 border-t-blue-600 dark:border-dark-600 dark:border-t-blue-400" />
                        <div className="absolute inset-0 h-12 w-12 animate-pulse rounded-full border-4 border-blue-400/30" />
                      </div>
                    </div>
                  ) : announcements.length > 0 ? (
                    <div>
                      {announcements.map((item) => (
                        <div
                          key={item.id}
                          className={`group relative flex items-center gap-4 border-b border-gray-100 px-6 py-4 transition-all hover:bg-gray-50 dark:border-dark-700 dark:hover:bg-dark-700/30 ${
                            !item.read_at ? 'bg-blue-50/30 dark:bg-blue-900/5' : ''
                          }`}
                          style={{ minHeight: 72 }}
                          onClick={() => openDetail(item)}
                        >
                          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center">
                            {!item.read_at ? (
                              <div className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-lg shadow-blue-500/30">
                                <span className="absolute inline-flex h-full w-full animate-ping rounded-xl bg-blue-400 opacity-75" />
                                <svg className="relative z-10 h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                              </div>
                            ) : (
                              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gray-100 text-gray-400 dark:bg-dark-700 dark:text-gray-600">
                                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                              </div>
                            )}
                          </div>

                          <div className="flex min-w-0 flex-1 items-center justify-between gap-4">
                            <div className="min-w-0 flex-1">
                              <h3 className="truncate text-sm font-medium text-gray-900 dark:text-white">{item.title}</h3>
                              <div className="mt-1 flex items-center gap-2">
                                <time className="text-xs text-gray-500 dark:text-gray-400">
                                  {formatRelativeTime(item.created_at, t)}
                                </time>
                                {!item.read_at ? (
                                  <span className="inline-flex items-center gap-1 rounded-md bg-blue-100 px-1.5 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
                                    <span className="relative flex h-1.5 w-1.5">
                                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-500 opacity-75" />
                                      <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-blue-600" />
                                    </span>
                                    {t('announcements.unread')}
                                  </span>
                                ) : null}
                              </div>
                            </div>

                            <div className="flex-shrink-0">
                              <svg className="h-5 w-5 text-gray-400 transition-transform group-hover:translate-x-1 dark:text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                              </svg>
                            </div>
                          </div>

                          {!item.read_at ? (
                            <div className="absolute left-0 top-0 h-full w-1 bg-gradient-to-b from-blue-500 to-indigo-600" />
                          ) : null}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-16">
                      <div className="relative mb-4">
                        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-gray-100 to-gray-200 dark:from-dark-700 dark:to-dark-600">
                          <Icon name="inbox" size="xl" className="text-gray-400 dark:text-gray-500" />
                        </div>
                        <div className="absolute -right-1 -top-1 flex h-6 w-6 items-center justify-center rounded-full bg-green-500 text-white">
                          <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                        </div>
                      </div>
                      <p className="text-sm font-medium text-gray-900 dark:text-white">{t('announcements.empty')}</p>
                      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{t('announcements.emptyDescription')}</p>
                    </div>
                  )}
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}

      {/* Detail Modal */}
      {mounted && detailModalOpen && selectedAnnouncement
        ? createPortal(
            <div
              className="fixed inset-0 z-[110] flex items-start justify-center overflow-y-auto bg-gradient-to-br from-black/70 via-black/60 to-black/70 p-4 pt-[6vh] backdrop-blur-md"
              onClick={closeDetail}
            >
              <div
                className="w-full max-w-[780px] overflow-hidden rounded-3xl bg-white shadow-2xl ring-1 ring-black/5 dark:bg-dark-800 dark:ring-white/10"
                onClick={(e) => e.stopPropagation()}
              >
                {/* Header */}
                <div className="relative overflow-hidden border-b border-gray-100 bg-gradient-to-br from-blue-50/80 via-indigo-50/50 to-purple-50/30 px-8 py-6 dark:border-dark-700 dark:from-blue-900/20 dark:via-indigo-900/10 dark:to-purple-900/5">
                  <div className="absolute right-0 top-0 h-full w-64 bg-gradient-to-l from-indigo-100/30 to-transparent dark:from-indigo-900/20" />
                  <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-gradient-to-br from-blue-400/20 to-indigo-500/20 blur-3xl" />
                  <div className="absolute -left-4 -bottom-4 h-24 w-24 rounded-full bg-gradient-to-tr from-purple-400/20 to-pink-500/20 blur-2xl" />

                  <div className="relative z-10 flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="mb-3 flex items-center gap-2">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-lg shadow-blue-500/30">
                          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="rounded-lg bg-blue-100 px-2.5 py-1 text-xs font-medium text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
                            {t('announcements.title')}
                          </span>
                          {!selectedAnnouncement.read_at ? (
                            <span className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-blue-500 to-indigo-600 px-2.5 py-1 text-xs font-medium text-white shadow-lg shadow-blue-500/30">
                              <span className="relative flex h-2 w-2">
                                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-75" />
                                <span className="relative inline-flex h-2 w-2 rounded-full bg-white" />
                              </span>
                              {t('announcements.unread')}
                            </span>
                          ) : null}
                        </div>
                      </div>

                      <h2 className="mb-3 text-2xl font-bold leading-tight text-gray-900 dark:text-white">
                        {selectedAnnouncement.title}
                      </h2>

                      <div className="flex items-center gap-4 text-sm text-gray-600 dark:text-gray-400">
                        <div className="flex items-center gap-1.5">
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          <time>{formatRelativeWithDateTime(selectedAnnouncement.created_at, t)}</time>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                          </svg>
                          <span>{selectedAnnouncement.read_at ? t('announcements.read') : t('announcements.unread')}</span>
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={closeDetail}
                      className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-white/50 text-gray-500 backdrop-blur-sm transition-all hover:bg-white hover:text-gray-700 hover:shadow-lg dark:bg-dark-700/50 dark:text-gray-400 dark:hover:bg-dark-700 dark:hover:text-gray-300"
                      aria-label={t('common.close')}
                    >
                      <Icon name="x" size="md" />
                    </button>
                  </div>
                </div>

                {/* Body with markdown */}
                <div className="max-h-[60vh] overflow-y-auto bg-white px-8 py-8 dark:bg-dark-800">
                  <div className="relative">
                    <div className="absolute left-0 top-0 bottom-0 w-1 rounded-full bg-gradient-to-b from-blue-500 via-indigo-500 to-purple-500" />
                    <div className="pl-6">
                      <div
                        className="markdown-body prose prose-sm max-w-none dark:prose-invert"
                        dangerouslySetInnerHTML={{ __html: renderMarkdown(selectedAnnouncement.content) }}
                      />
                    </div>
                  </div>
                </div>

                {/* Footer */}
                <div className="border-t border-gray-100 bg-gray-50/50 px-8 py-5 dark:border-dark-700 dark:bg-dark-900/30">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <span>{selectedAnnouncement.read_at ? t('announcements.readStatus') : t('announcements.markReadHint')}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={closeDetail}
                        className="rounded-xl border border-gray-300 bg-white px-5 py-2.5 text-sm font-medium text-gray-700 shadow-sm transition-all hover:bg-gray-50 hover:shadow dark:border-dark-600 dark:bg-dark-700 dark:text-gray-300 dark:hover:bg-dark-600"
                      >
                        {t('common.close')}
                      </button>
                      {!selectedAnnouncement.read_at ? (
                        <button
                          type="button"
                          onClick={() => markAsReadAndClose(selectedAnnouncement.id)}
                          className="rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-5 py-2.5 text-sm font-medium text-white shadow-lg shadow-blue-500/30 transition-all hover:shadow-xl hover:scale-105"
                        >
                          <span className="flex items-center gap-2">
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                            {t('announcements.markRead')}
                          </span>
                        </button>
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  )
}
