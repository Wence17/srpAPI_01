'use client'

import { useEffect, useState } from 'react'
import { useI18n } from '@/lib/i18n'
import BaseDialog from '@/components/common/BaseDialog'
import { getMyErrorDetail } from '@/lib/usage'
import { formatDateTime } from '@/lib/format'
import type { UserErrorRequestDetail } from '@/lib/types'

interface UserErrorDetailModalProps {
  show: boolean
  errorId: number | null
  onUpdateShow: (show: boolean) => void
}

function statusClass(code: number): string {
  if (code >= 500) return 'badge-danger'
  if (code === 429) return 'badge-warning'
  return 'badge-gray'
}

export default function UserErrorDetailModal({ show, errorId, onUpdateShow }: UserErrorDetailModalProps) {
  const { t } = useI18n()
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState(false)
  const [detail, setDetail] = useState<UserErrorRequestDetail | null>(null)

  useEffect(() => {
    if (!show || errorId == null) {
      if (!show) {
        setDetail(null)
        setLoadError(false)
      }
      return
    }

    let cancelled = false

    async function fetchDetail(id: number) {
      setLoading(true)
      setLoadError(false)
      setDetail(null)
      try {
        const data = await getMyErrorDetail(id)
        if (!cancelled) setDetail(data)
      } catch (e) {
        console.error('[UserErrorDetailModal] Failed to load error detail:', e)
        if (!cancelled) setLoadError(true)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    fetchDetail(errorId)
    return () => {
      cancelled = true
    }
  }, [show, errorId])

  return (
    <BaseDialog
      show={show}
      title={t('usage.errors.detail.title')}
      width="wide"
      onClose={() => onUpdateShow(false)}
    >
      {loading ? (
        <div className="flex justify-center py-10">
          <svg className="h-7 w-7 animate-spin text-primary-500" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
        </div>
      ) : loadError ? (
        <div className="py-8 text-center text-sm text-red-500">{t('usage.errors.detail.loadFailed')}</div>
      ) : detail ? (
        <div className="space-y-4 text-sm">
          <div className="grid grid-cols-2 gap-x-6 gap-y-3">
            <div>
              <span className="font-medium text-gray-500 dark:text-dark-400">{t('usage.errors.time')}</span>
              <p className="mt-0.5 text-gray-900 dark:text-dark-100">{formatDateTime(detail.created_at)}</p>
            </div>
            <div>
              <span className="font-medium text-gray-500 dark:text-dark-400">{t('usage.errors.model')}</span>
              <p className="mt-0.5 text-gray-900 dark:text-dark-100">{detail.model || '-'}</p>
            </div>
            <div>
              <span className="font-medium text-gray-500 dark:text-dark-400">{t('usage.errors.endpoint')}</span>
              <p className="mt-0.5 text-gray-900 dark:text-dark-100">{detail.inbound_endpoint || '-'}</p>
            </div>
            <div>
              <span className="font-medium text-gray-500 dark:text-dark-400">{t('usage.errors.status')}</span>
              <p className="mt-0.5">
                <span className={`badge ${statusClass(detail.status_code)}`}>{detail.status_code || '-'}</span>
              </p>
            </div>
            <div>
              <span className="font-medium text-gray-500 dark:text-dark-400">{t('usage.errors.category')}</span>
              <p className="mt-0.5 text-gray-900 dark:text-dark-100">
                {t(`usage.errors.categories.${detail.category}`)}
              </p>
            </div>
            <div>
              <span className="font-medium text-gray-500 dark:text-dark-400">{t('usage.errors.platform')}</span>
              <p className="mt-0.5 text-gray-900 dark:text-dark-100">{detail.platform || '-'}</p>
            </div>
            {detail.upstream_status_code != null ? (
              <div>
                <span className="font-medium text-gray-500 dark:text-dark-400">
                  {t('usage.errors.detail.upstreamStatus')}
                </span>
                <p className="mt-0.5 text-gray-900 dark:text-dark-100">{detail.upstream_status_code}</p>
              </div>
            ) : null}
          </div>

          {detail.message ? (
            <div>
              <span className="font-medium text-gray-500 dark:text-dark-400">{t('usage.errors.message')}</span>
              <p className="mt-0.5 break-all text-gray-900 dark:text-dark-100">{detail.message}</p>
            </div>
          ) : null}

          {detail.error_body ? (
            <div>
              <span className="font-medium text-gray-500 dark:text-dark-400">
                {t('usage.errors.detail.responseBody')}
              </span>
              <pre className="mt-1 max-h-[40vh] overflow-auto whitespace-pre-wrap break-all rounded-lg border border-gray-200 bg-gray-50 p-3 text-xs text-gray-800 dark:border-dark-700 dark:bg-dark-900 dark:text-dark-200">
                {detail.error_body}
              </pre>
            </div>
          ) : null}
        </div>
      ) : null}
    </BaseDialog>
  )
}
