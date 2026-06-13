'use client'

import { useMemo, useState } from 'react'
import { useI18n } from '@/lib/i18n'
import Pagination from '@/components/common/Pagination'
import Select from '@/components/common/Select'
import Icon from '@/components/icons/Icon'
import UserErrorDetailModal from '@/components/user/UserErrorDetailModal'
import { formatDateTime } from '@/lib/format'
import type { ApiKey, UserErrorRequest } from '@/lib/types'

interface UserErrorRequestsTableProps {
  rows: UserErrorRequest[]
  total: number
  loading: boolean
  page: number
  pageSize: number
  apiKeys?: ApiKey[]
  onFilter: (filter: { model: string; category: string; api_key_id: number | null }) => void
  onUpdatePage: (page: number) => void
  onUpdatePageSize: (pageSize: number) => void
}

const categoryCodes = [
  'auth',
  'rate_limit',
  'quota',
  'invalid_request',
  'service_unavailable',
  'upstream',
  'internal',
]

function statusClass(code: number): string {
  if (code >= 500) return 'badge-danger'
  if (code === 429) return 'badge-warning'
  return 'badge-gray'
}

export default function UserErrorRequestsTable({
  rows,
  total,
  loading,
  page,
  pageSize,
  apiKeys,
  onFilter,
  onUpdatePage,
  onUpdatePageSize,
}: UserErrorRequestsTableProps) {
  const { t } = useI18n()
  const [localModel, setLocalModel] = useState<string | null>('')
  const [localCategory, setLocalCategory] = useState<string>('')
  const [localApiKeyId, setLocalApiKeyId] = useState<number | null>(null)
  const [showDetail, setShowDetail] = useState(false)
  const [selectedId, setSelectedId] = useState<number | null>(null)

  const categoryOptions = useMemo(
    () => [
      { value: '', label: t('usage.errors.allCategories') },
      ...categoryCodes.map((c) => ({ value: c, label: t(`usage.errors.categories.${c}`) })),
    ],
    [t],
  )

  const keyOptions = useMemo(
    () => [
      { value: null, label: t('usage.errors.allKeys') },
      ...(apiKeys ?? []).map((k) => ({ value: k.id, label: k.name })),
    ],
    [apiKeys, t],
  )

  const modelOptions = useMemo(() => {
    const seen = new Set<string>()
    const opts: { value: string; label: string }[] = []
    for (const r of rows) {
      if (r.model && !seen.has(r.model)) {
        seen.add(r.model)
        opts.push({ value: r.model, label: r.model })
      }
    }
    return opts
  }, [rows])

  function apply() {
    onFilter({
      model: (localModel ?? '').trim(),
      category: localCategory || '',
      api_key_id: localApiKeyId,
    })
  }

  function openDetail(id: number) {
    setSelectedId(id)
    setShowDetail(true)
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex-shrink-0 px-6 py-4">
        <div className="flex flex-wrap items-end gap-4">
          <div className="min-w-[180px]">
            <label className="input-label">{t('usage.errors.model')}</label>
            <Select
              modelValue={localModel}
              options={modelOptions}
              searchable
              creatable
              clearable
              placeholder={t('usage.errors.modelPlaceholder')}
              onChange={() => apply()}
              onUpdateModelValue={(v) => setLocalModel(v as string | null)}
            />
          </div>
          <div className="min-w-[160px]">
            <label className="input-label">{t('usage.errors.keyName')}</label>
            <Select
              modelValue={localApiKeyId}
              options={keyOptions}
              placeholder={t('usage.errors.allKeys')}
              onChange={() => apply()}
              onUpdateModelValue={(v) => setLocalApiKeyId(v as number | null)}
            />
          </div>
          <div className="min-w-[140px]">
            <label className="input-label">{t('usage.errors.category')}</label>
            <Select
              modelValue={localCategory}
              options={categoryOptions}
              placeholder={t('usage.errors.allCategories')}
              onChange={() => apply()}
              onUpdateModelValue={(v) => setLocalCategory(String(v ?? ''))}
            />
          </div>
          <button type="button" className="btn btn-primary" onClick={apply}>
            <Icon name="search" size="sm" />
            {t('common.search')}
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr>
              <th className="px-4 py-2 text-left">{t('usage.errors.model')}</th>
              <th className="px-4 py-2 text-left">{t('usage.errors.keyName')}</th>
              <th className="px-4 py-2 text-left">{t('usage.errors.endpoint')}</th>
              <th className="px-4 py-2 text-left">{t('usage.errors.status')}</th>
              <th className="px-4 py-2 text-left">{t('usage.errors.category')}</th>
              <th className="px-4 py-2 text-left">{t('usage.errors.message')}</th>
              <th className="px-4 py-2 text-left">{t('usage.errors.platform')}</th>
              <th className="px-4 py-2 text-left">{t('usage.errors.time')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr
                key={i}
                className="cursor-pointer border-t border-gray-100 hover:bg-gray-50 dark:border-dark-700 dark:hover:bg-dark-800"
                onClick={() => openDetail(row.id)}
              >
                <td className="px-4 py-2">{row.model || '-'}</td>
                <td className="px-4 py-2">
                  <span>{row.key_name || '-'}</span>
                  {row.key_deleted ? (
                    <span className="ml-1 inline-flex items-center rounded px-1 py-px text-[10px] font-medium leading-tight bg-gray-100 text-gray-500 dark:bg-dark-700 dark:text-gray-400">
                      {t('usage.errors.keyDeleted')}
                    </span>
                  ) : null}
                </td>
                <td className="px-4 py-2">{row.inbound_endpoint || '-'}</td>
                <td className="px-4 py-2">
                  <span className={`badge ${statusClass(row.status_code)}`}>{row.status_code || '-'}</span>
                </td>
                <td className="px-4 py-2">{t(`usage.errors.categories.${row.category}`)}</td>
                <td className="max-w-[280px] truncate px-4 py-2" title={row.message}>
                  {row.message || '-'}
                </td>
                <td className="px-4 py-2">{row.platform || '-'}</td>
                <td className="px-4 py-2">{formatDateTime(row.created_at)}</td>
              </tr>
            ))}
            {!loading && rows.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-gray-400">
                  {t('usage.errors.empty')}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <div className="flex-shrink-0">
        <Pagination
          page={page}
          pageSize={pageSize}
          total={total}
          onUpdatePage={onUpdatePage}
          onUpdatePageSize={onUpdatePageSize}
        />
      </div>

      <UserErrorDetailModal show={showDetail} errorId={selectedId} onUpdateShow={setShowDetail} />
    </div>
  )
}
