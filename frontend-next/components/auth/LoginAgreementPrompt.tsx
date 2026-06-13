'use client'

import Link from 'next/link'
import { useMemo } from 'react'
import Icon from '@/components/icons/Icon'
import type { LoginAgreementDocument } from '@/lib/types'

interface LoginAgreementPromptProps {
  accepted: boolean
  documents: LoginAgreementDocument[]
  mode: 'modal' | 'checkbox' | string
  updatedAt?: string
  visible: boolean
  onAccept: () => void
  onReject: () => void
  onOpen: () => void
}

function documentPath(doc: LoginAgreementDocument): string {
  return `/legal/${encodeURIComponent(doc.id || doc.title)}`
}

function documentIcon(index: number, title: string): 'document' | 'shield' | 'globe' | 'cog' {
  if (title.includes('政策') || title.includes('隐私')) {
    return 'shield'
  }
  if (title.includes('国家') || title.includes('地区')) {
    return 'globe'
  }
  if (index === 3) {
    return 'cog'
  }
  return 'document'
}

export default function LoginAgreementPrompt({
  accepted,
  documents: rawDocuments,
  mode,
  updatedAt = '',
  visible,
  onAccept,
  onReject,
  onOpen,
}: LoginAgreementPromptProps) {
  const documents = useMemo(
    () => rawDocuments.filter((doc) => doc.title.trim()),
    [rawDocuments],
  )
  const agreementMode = mode === 'checkbox' ? 'checkbox' : 'modal'
  const dialogVisible = visible && documents.length > 0

  if (agreementMode === 'checkbox' && documents.length > 0) {
    return (
      <div className="px-0.5">
        <div className="flex items-start gap-2">
          <input
            id="login-agreement-consent"
            type="checkbox"
            checked={accepted}
            className="mt-[2px] h-4 w-4 flex-shrink-0 rounded border-gray-300 text-primary-600 focus:ring-primary-500 dark:border-dark-600 dark:bg-dark-900"
            onChange={(event) => {
              if (event.target.checked) {
                onAccept()
              } else {
                onReject()
              }
            }}
          />
          <div className="min-w-0 flex-1">
            <p className="text-[13px] leading-5 text-gray-600 dark:text-dark-300">
              <label
                htmlFor="login-agreement-consent"
                className="cursor-pointer text-gray-700 dark:text-dark-200"
              >
                我已阅读并同意
              </label>
              {documents.map((doc, index) => (
                <span key={doc.id || doc.title}>
                  <Link
                    href={documentPath(doc)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium text-primary-600 underline-offset-4 transition hover:text-primary-700 hover:underline dark:text-primary-300 dark:hover:text-primary-200"
                  >
                    {doc.title}
                  </Link>
                  {index < documents.length - 1 && <span>、</span>}
                </span>
              ))}
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <>
      {!accepted && documents.length > 0 && (
        <div className="rounded-lg border border-primary-100 bg-primary-50/70 p-3 text-sm text-primary-900 dark:border-primary-500/20 dark:bg-primary-500/10 dark:text-primary-100">
          <div className="flex items-start gap-3">
            <Icon name="shield" size="sm" className="mt-0.5 flex-shrink-0 text-primary-600 dark:text-primary-300" />
            <div className="min-w-0 flex-1">
              <p className="font-medium">继续登录前需要先同意最新条款。</p>
              <p className="mt-1 text-primary-700 dark:text-primary-200/80">
                未同意前，账号密码输入和快捷登录会保持禁用。
              </p>
            </div>
            <button
              type="button"
              className="flex-shrink-0 rounded-md bg-primary-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-primary-700"
              onClick={onOpen}
            >
              查看条款
            </button>
          </div>
        </div>
      )}

      {dialogVisible && (
        <div className="fixed inset-0 z-[140] flex items-center justify-center overflow-y-auto bg-gray-950/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-[600px] overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-black/10 dark:bg-dark-900 dark:ring-white/10">
            <div className="border-b border-gray-100 bg-white px-6 py-6 dark:border-dark-800 dark:bg-dark-900">
              <div className="flex items-start gap-4">
                <span className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary-700 ring-1 ring-primary-100 dark:bg-primary-500/10 dark:text-primary-300 dark:ring-primary-500/20">
                  <Icon name="shield" size="md" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-xl font-bold tracking-normal text-gray-950 dark:text-white">
                      条款更新通知
                    </h2>
                    {updatedAt && (
                      <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-600 dark:bg-dark-800 dark:text-dark-300">
                        {updatedAt}
                      </span>
                    )}
                  </div>
                  <p className="mt-2 text-sm leading-6 text-gray-600 dark:text-dark-300">
                    我们的服务条款已于 {updatedAt || '近期'} 更新。在继续使用服务之前，请仔细阅读并同意以下条款。
                  </p>
                </div>
              </div>
            </div>

            <div className="max-h-[58vh] overflow-y-auto px-6 py-5">
              <div className="mb-3 flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-gray-900 dark:text-white">相关文档</p>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {documents.map((doc, index) => (
                  <Link
                    key={doc.id || doc.title}
                    href={documentPath(doc)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group flex min-h-[72px] w-full items-center gap-3 rounded-xl border border-gray-200 bg-gray-50/70 px-4 py-3 text-left transition hover:-translate-y-0.5 hover:border-primary-200 hover:bg-white hover:shadow-sm dark:border-dark-700 dark:bg-dark-800/70 dark:hover:border-primary-500/30 dark:hover:bg-dark-800"
                  >
                    <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-white text-gray-700 ring-1 ring-gray-200 transition group-hover:bg-primary-50 group-hover:text-primary-700 group-hover:ring-primary-100 dark:bg-dark-900 dark:text-dark-200 dark:ring-dark-700 dark:group-hover:bg-primary-500/10 dark:group-hover:text-primary-200 dark:group-hover:ring-primary-500/20">
                      <Icon name={documentIcon(index, doc.title)} size="sm" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-gray-950 dark:text-white">
                        {doc.title}
                      </span>
                    </span>
                    <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-gray-400 transition group-hover:bg-primary-50 group-hover:text-primary-600 dark:group-hover:bg-primary-500/10 dark:group-hover:text-primary-300">
                      <Icon name="externalLink" size="sm" />
                    </span>
                  </Link>
                ))}
              </div>
            </div>

            <div className="border-t border-gray-100 bg-gray-50/80 px-6 py-4 dark:border-dark-800 dark:bg-dark-950/60">
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  className="rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-semibold text-gray-700 transition hover:bg-gray-100 dark:border-dark-700 dark:bg-dark-800 dark:text-dark-200 dark:hover:bg-dark-700"
                  onClick={onReject}
                >
                  拒绝
                </button>
                <button
                  type="button"
                  className="rounded-xl bg-primary-600 px-4 py-3 text-sm font-semibold text-white shadow-sm shadow-primary-600/20 transition hover:bg-primary-700"
                  onClick={onAccept}
                >
                  同意并继续
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
