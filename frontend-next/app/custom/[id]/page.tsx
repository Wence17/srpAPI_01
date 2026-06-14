'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'next/navigation'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import AppLayout from '@/components/layout/AppLayout'
import Icon from '@/components/icons/Icon'
import styles from '@/components/custom/custom-page.module.css'
import { useI18n } from '@/lib/i18n/I18nProvider'
import { useAuth } from '@/context/AuthContext'
import { useApp } from '@/context/AppContext'
import { useAdminSettingsStore } from '@/lib/stores/adminSettings'
import { buildEmbeddedUrl, detectTheme } from '@/lib/embeddedUrl'
import type { CustomMenuItem } from '@/lib/types'

interface TocItem {
  id: string
  text: string
  level: number
}

function generateHeadingId(text: string, index: number): string {
  const base = text
    .toLowerCase()
    .replace(/[^\w一-鿿]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return base ? `${base}-${index}` : `heading-${index}`
}

function isRelativeMarkdownAsset(src: string): boolean {
  const trimmed = src.trim()
  if (
    !trimmed ||
    /^[a-z][a-z0-9+.-]*:/i.test(trimmed) ||
    trimmed.startsWith('//') ||
    trimmed.startsWith('/')
  ) {
    return false
  }
  const [pathPart] = trimmed.split(/([?#].*)/, 2)
  return pathPart
    .split('/')
    .filter((part) => part && part !== '.')
    .every((part) => part !== '..' && !part.includes('\\'))
}

function buildPageImageUrl(slug: string, src: string): string {
  const trimmed = src.trim()
  const [pathPart, suffix = ''] = trimmed.split(/([?#].*)/, 2)
  const encodedPath = pathPart
    .split('/')
    .filter((part) => part && part !== '.')
    .map((part) => encodeURIComponent(part))
    .join('/')
  return `/api/v1/pages/${encodeURIComponent(slug)}/images/${encodedPath}${suffix}`
}

function tocLevelClass(level: number): string {
  switch (level) {
    case 1:
      return styles.tocLevel1
    case 2:
      return styles.tocLevel2
    case 3:
      return styles.tocLevel3
    case 4:
      return styles.tocLevel4
    default:
      return styles.tocLevel1
  }
}

export default function CustomPagePage() {
  const { t, locale } = useI18n()
  const params = useParams()
  const { user, token, isAdmin } = useAuth()
  const { cachedPublicSettings, publicSettingsLoaded, fetchPublicSettings } = useApp()
  const adminSettingsStore = useAdminSettingsStore()

  const menuItemId = String(params.id || '')

  const [loading, setLoading] = useState(false)
  const [pageTheme, setPageTheme] = useState<'light' | 'dark'>('light')
  const [renderedHtml, setRenderedHtml] = useState('')
  const [tocItems, setTocItems] = useState<TocItem[]>([])
  const [tocVisible, setTocVisible] = useState(
    () => (typeof window !== 'undefined' ? window.innerWidth > 768 : true),
  )
  const [activeHeadingId, setActiveHeadingId] = useState('')

  const markdownContainerRef = useRef<HTMLDivElement | null>(null)
  const scrollRafIdRef = useRef(0)
  const themeObserverRef = useRef<MutationObserver | null>(null)

  const menuItem = useMemo<CustomMenuItem | null>(() => {
    const publicItems = cachedPublicSettings?.custom_menu_items ?? []
    const found = publicItems.find((item) => item.id === menuItemId) ?? null
    if (found) return found
    if (isAdmin) {
      return adminSettingsStore.customMenuItems.find((item) => item.id === menuItemId) ?? null
    }
    return null
  }, [cachedPublicSettings, menuItemId, isAdmin, adminSettingsStore.customMenuItems])

  const markdownSlug = useMemo(() => {
    const item = menuItem
    if (!item) return ''
    if (item.page_slug) return item.page_slug
    if (item.url?.startsWith('md:')) return item.url.slice(3)
    return ''
  }, [menuItem])

  const isMarkdownMode = !!markdownSlug

  const embeddedUrl = useMemo(() => {
    if (!menuItem || isMarkdownMode || !menuItem.url) return ''
    const userId =
      user?.id != null && !Number.isNaN(Number(user.id)) ? Number(user.id) : undefined
    return buildEmbeddedUrl(menuItem.url, userId, token, pageTheme, locale)
  }, [menuItem, isMarkdownMode, user?.id, token, pageTheme, locale])

  const isValidUrl =
    !isMarkdownMode &&
    (embeddedUrl.startsWith('http://') || embeddedUrl.startsWith('https://'))

  const injectCopyButtons = useCallback(() => {
    const container = markdownContainerRef.current
    if (!container) return

    container.querySelectorAll('pre').forEach((pre) => {
      if (pre.querySelector('.copy-btn')) return
      const btn = document.createElement('button')
      btn.className = 'copy-btn'
      btn.textContent = '复制'
      btn.addEventListener('click', async () => {
        const code = pre.querySelector('code')?.textContent ?? pre.textContent ?? ''
        try {
          await navigator.clipboard.writeText(code)
          btn.textContent = '已复制 ✓'
          setTimeout(() => {
            btn.textContent = '复制'
          }, 2000)
        } catch {
          btn.textContent = '失败'
          setTimeout(() => {
            btn.textContent = '复制'
          }, 2000)
        }
      })
      pre.style.position = 'relative'
      pre.appendChild(btn)
    })
  }, [])

  const fetchAndRenderMarkdown = useCallback(
    async (slug: string) => {
      setLoading(true)
      setTocItems([])
      setActiveHeadingId('')
      try {
        const resp = await fetch(`/api/v1/pages/${encodeURIComponent(slug)}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        })
        if (!resp.ok) {
          setRenderedHtml('<p class="text-red-500">Page not found</p>')
          return
        }
        let raw = await resp.text()

        raw = raw.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (match, alt, src) =>
          isRelativeMarkdownAsset(src) ? `![${alt}](${buildPageImageUrl(slug, src)})` : match,
        )

        const html = marked.parse(raw) as string
        const sanitized = DOMPurify.sanitize(html, {
          ADD_TAGS: ['iframe'],
          ADD_ATTR: ['allowfullscreen', 'frameborder', 'src'],
        })

        const toc: TocItem[] = []
        let headingIndex = 0
        const withIds = sanitized.replace(
          /<(h[1-4])[^>]*>(.*?)<\/h[1-4]>/gi,
          (_, tag: string, content: string) => {
            const level = parseInt(tag[1], 10)
            const text = content.replace(/<[^>]+>/g, '').trim()
            const id = generateHeadingId(text, headingIndex++)
            toc.push({ id, text, level })
            return `<${tag} id="${id}">${content}</${tag}>`
          },
        )

        setRenderedHtml(withIds)
        setTocItems(toc)
      } catch {
        setRenderedHtml('<p class="text-red-500">Failed to load page</p>')
      } finally {
        setLoading(false)
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            injectCopyButtons()
          })
        })
      }
    },
    [token, injectCopyButtons],
  )

  const scrollToHeading = useCallback((id: string) => {
    const container = markdownContainerRef.current
    if (!container) return
    const el = container.querySelector(`#${CSS.escape(id)}`)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' })
      setActiveHeadingId(id)
      if (window.innerWidth <= 640) {
        setTocVisible(false)
      }
    }
  }, [])

  const onContentScroll = useCallback(() => {
    if (scrollRafIdRef.current) return
    scrollRafIdRef.current = requestAnimationFrame(() => {
      scrollRafIdRef.current = 0
      const container = markdownContainerRef.current
      if (!container || tocItems.length === 0) return

      const containerRect = container.getBoundingClientRect()
      let current = ''

      for (const item of tocItems) {
        const el = container.querySelector(`#${CSS.escape(item.id)}`) as HTMLElement | null
        if (el) {
          const elRect = el.getBoundingClientRect()
          if (elRect.top - containerRect.top <= 100) {
            current = item.id
          }
        }
      }
      setActiveHeadingId(current)
    })
  }, [tocItems])

  useEffect(() => {
    if (markdownSlug) {
      fetchAndRenderMarkdown(markdownSlug)
    } else {
      setRenderedHtml('')
      setTocItems([])
    }
  }, [markdownSlug, fetchAndRenderMarkdown])

  useEffect(() => {
    setPageTheme(detectTheme())

    if (typeof document !== 'undefined') {
      const observer = new MutationObserver(() => {
        setPageTheme(detectTheme())
      })
      observer.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['class'],
      })
      themeObserverRef.current = observer
    }

    return () => {
      themeObserverRef.current?.disconnect()
      themeObserverRef.current = null
    }
  }, [])

  useEffect(() => {
    if (publicSettingsLoaded) return
    let cancelled = false
    setLoading(true)
    fetchPublicSettings()
      .catch(console.error)
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [publicSettingsLoaded, fetchPublicSettings])

  return (
    <AppLayout>
      <div className={styles.customPageLayout}>
        <div className="card flex-1 min-h-0 overflow-hidden">
          {loading ? (
            <div className="flex h-full items-center justify-center py-12">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary-500 border-t-transparent" />
            </div>
          ) : !menuItem ? (
            <div className="flex h-full items-center justify-center p-10 text-center">
              <div className="max-w-md">
                <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 dark:bg-dark-700">
                  <Icon name="link" size="lg" className="text-gray-400" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                  {t('customPage.notFoundTitle')}
                </h3>
                <p className="mt-2 text-sm text-gray-500 dark:text-dark-400">
                  {t('customPage.notFoundDesc')}
                </p>
              </div>
            </div>
          ) : isMarkdownMode ? (
            <div className="relative flex h-full overflow-hidden">
              {tocVisible ? (
                <aside className={styles.tocSidebar}>
                  <div className={styles.tocHeader}>
                    <span className={styles.tocTitle}>目录</span>
                    <button
                      type="button"
                      className={styles.tocCloseBtn}
                      onClick={() => setTocVisible(false)}
                      aria-label="Close table of contents"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M15 18l-6-6 6-6" />
                      </svg>
                    </button>
                  </div>
                  <nav className={styles.tocNav}>
                    {tocItems.map((item) => (
                      <a
                        key={item.id}
                        href={`#${item.id}`}
                        className={`${styles.tocItem} ${tocLevelClass(item.level)} ${
                          activeHeadingId === item.id ? styles.tocItemActive : ''
                        }`}
                        onClick={(event) => {
                          event.preventDefault()
                          scrollToHeading(item.id)
                        }}
                      >
                        {item.text}
                      </a>
                    ))}
                  </nav>
                </aside>
              ) : null}

              {!tocVisible && tocItems.length > 0 ? (
                <button
                  type="button"
                  className={styles.tocToggleBtn}
                  onClick={() => setTocVisible(true)}
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M3 12h18M3 6h18M3 18h18" />
                  </svg>
                  <span className="ml-1 text-xs">目录</span>
                </button>
              ) : null}

              <div
                ref={markdownContainerRef}
                className={styles.markdownPageContent}
                dangerouslySetInnerHTML={{ __html: renderedHtml }}
                onScroll={onContentScroll}
              />
            </div>
          ) : !isValidUrl ? (
            <div className="flex h-full items-center justify-center p-10 text-center">
              <div className="max-w-md">
                <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 dark:bg-dark-700">
                  <Icon name="link" size="lg" className="text-gray-400" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                  {t('customPage.notConfiguredTitle')}
                </h3>
                <p className="mt-2 text-sm text-gray-500 dark:text-dark-400">
                  {t('customPage.notConfiguredDesc')}
                </p>
              </div>
            </div>
          ) : (
            <div className={styles.customEmbedShell}>
              <a
                href={embeddedUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={`btn btn-secondary btn-sm ${styles.customOpenFab}`}
              >
                <Icon name="externalLink" size="sm" className="mr-1.5" strokeWidth={2} />
                {t('customPage.openInNewTab')}
              </a>
              <iframe
                src={embeddedUrl}
                className={styles.customEmbedFrame}
                allowFullScreen
                title={menuItem.label}
              />
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  )
}
