'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import Icon from '@/components/icons/Icon'
import styles from '@/components/legal/legal-document.module.css'
import { useApp } from '@/context/AppContext'
import { getPublicSettings } from '@/lib/auth'
import { sanitizeUrl } from '@/lib/url'
import type { LoginAgreementDocument, PublicSettings } from '@/lib/types'

type LegalDocumentIcon = 'document' | 'shield' | 'globe' | 'cog'

marked.setOptions({
  breaks: true,
  gfm: true,
})

function resolveDocumentIcon(title: string): LegalDocumentIcon {
  if (title.includes('政策') || title.includes('隐私')) return 'shield'
  if (title.includes('国家') || title.includes('地区')) return 'globe'
  if (title.includes('特定')) return 'cog'
  return 'document'
}

export default function LegalDocumentPage() {
  const params = useParams()
  const app = useApp()
  const documentId = String(params.documentId || '')

  const [settings, setSettings] = useState<PublicSettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setLoadError(false)
    getPublicSettings()
      .then((data) => {
        if (!cancelled) setSettings(data)
      })
      .catch(() => {
        if (!cancelled) setLoadError(true)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const siteName = settings?.site_name || app.siteName || 'Sub2API'
  const siteLogo =
    sanitizeUrl(settings?.site_logo || app.siteLogo || '', {
      allowRelative: true,
      allowDataUrl: true,
    }) || '/logo.png'
  const updatedAt = settings?.login_agreement_updated_at || ''
  const documents = settings?.login_agreement_documents ?? []

  const currentDocument = useMemo<LoginAgreementDocument | null>(() => {
    if (!documentId) return null
    return documents.find((doc) => doc.id === documentId) ?? null
  }, [documentId, documents])

  const hasContent = Boolean(currentDocument?.content_md?.trim())

  const renderedHtml = useMemo(() => {
    const content = currentDocument?.content_md?.trim() || ''
    if (!content) return ''
    const html = marked.parse(content) as string
    return DOMPurify.sanitize(html)
  }, [currentDocument?.content_md])

  const documentIcon = resolveDocumentIcon(currentDocument?.title || '')

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 dark:bg-dark-950 dark:text-white">
      <header className="border-b border-gray-200 bg-white/95 dark:border-dark-800 dark:bg-dark-900/95">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <Link href="/home" className="flex min-w-0 items-center gap-3">
            <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-gray-200 dark:bg-dark-800 dark:ring-dark-700">
              <img src={siteLogo} alt="Logo" className="h-full w-full object-contain" />
            </span>
            <span className="truncate text-base font-semibold text-gray-950 dark:text-white">
              {siteName}
            </span>
          </Link>
          <Link
            href="/login"
            className="inline-flex flex-shrink-0 items-center justify-center rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white shadow-sm shadow-primary-600/20 transition hover:bg-primary-700"
          >
            登录
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:py-10">
        {loading ? (
          <div className="flex min-h-[320px] items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary-600" />
          </div>
        ) : loadError ? (
          <section className="rounded-lg border border-red-200 bg-red-50 p-6 text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200">
            <h1 className="text-lg font-semibold">文档加载失败</h1>
            <p className="mt-2 text-sm">请稍后刷新页面重试。</p>
          </section>
        ) : !currentDocument ? (
          <section className="rounded-lg border border-gray-200 bg-white p-6 dark:border-dark-700 dark:bg-dark-900">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-md bg-gray-100 text-gray-600 dark:bg-dark-800 dark:text-dark-300">
                <Icon name="document" size="sm" />
              </span>
              <div>
                <h1 className="text-lg font-semibold text-gray-900 dark:text-white">文档不存在</h1>
                <p className="mt-2 text-sm leading-6 text-gray-600 dark:text-dark-300">
                  当前条款文档不存在或已被管理员移除。
                </p>
              </div>
            </div>
          </section>
        ) : (
          <article>
            <div className="mb-8 border-b border-gray-200 pb-6 dark:border-dark-700">
              <div className="flex items-start gap-4">
                <span className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-md bg-primary-50 text-primary-700 dark:bg-primary-500/10 dark:text-primary-300">
                  <Icon name={documentIcon} size="md" />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-primary-700 dark:text-primary-300">
                    登录条款
                  </p>
                  <h1 className="mt-2 break-words text-2xl font-bold tracking-normal text-gray-950 dark:text-white sm:text-3xl">
                    {currentDocument.title}
                  </h1>
                  {updatedAt ? (
                    <p className="mt-3 text-sm text-gray-500 dark:text-dark-400">
                      更新日期：{updatedAt}
                    </p>
                  ) : null}
                </div>
              </div>
            </div>

            {hasContent ? (
              <div
                className={styles.legalDocumentContent}
                dangerouslySetInnerHTML={{ __html: renderedHtml }}
              />
            ) : (
              <div className="rounded-lg border border-dashed border-gray-300 bg-white px-6 py-14 text-center text-sm text-gray-500 dark:border-dark-700 dark:bg-dark-900 dark:text-dark-400">
                暂无正文内容
              </div>
            )}
          </article>
        )}
      </main>
    </div>
  )
}
