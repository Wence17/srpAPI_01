'use client'

import { useMemo, useState } from 'react'
import { useI18n } from '@/lib/i18n/I18nProvider'
import Icon from '@/components/icons/Icon'
import Select from './Select'
import {
  getConfiguredTablePageSizeOptions,
  normalizeTablePageSize,
} from '@/lib/tablePreferences'
import { setPersistedPageSize } from '@/lib/usePersistedPageSize'

interface PaginationProps {
  total: number
  page: number
  pageSize: number
  pageSizeOptions?: number[]
  showPageSizeSelector?: boolean
  showJump?: boolean
  onUpdatePage?: (page: number) => void
  onUpdatePageSize?: (pageSize: number) => void
}

export default function Pagination({
  total,
  page,
  pageSize,
  showPageSizeSelector = true,
  showJump = false,
  onUpdatePage,
  onUpdatePageSize,
}: PaginationProps) {
  const { t } = useI18n()

  const totalPages = useMemo(() => Math.ceil(total / pageSize), [total, pageSize])

  const fromItem = useMemo(() => {
    if (total === 0) return 0
    return (page - 1) * pageSize + 1
  }, [total, page, pageSize])

  const toItem = useMemo(() => {
    const to = page * pageSize
    return to > total ? total : to
  }, [page, pageSize, total])

  const pageSizeSelectOptions = useMemo(() => {
    const opts = Array.from(
      new Set([...getConfiguredTablePageSizeOptions(), normalizeTablePageSize(pageSize)]),
    ).sort((a, b) => a - b)

    return opts.map((size) => ({
      value: size,
      label: String(size),
    }))
  }, [pageSize])

  const [jumpPage, setJumpPage] = useState('')

  const visiblePages = useMemo(() => {
    const pages: (number | string)[] = []
    const maxVisible = 7
    const totalP = totalPages

    if (totalP <= maxVisible) {
      for (let i = 1; i <= totalP; i++) {
        pages.push(i)
      }
    } else {
      pages.push(1)

      const start = Math.max(2, page - 2)
      const end = Math.min(totalP - 1, page + 2)

      if (start > 2) {
        pages.push('...')
      }

      for (let i = start; i <= end; i++) {
        pages.push(i)
      }

      if (end < totalP - 1) {
        pages.push('...')
      }

      pages.push(totalP)
    }

    return pages
  }, [totalPages, page])

  const goToPage = (newPage: number) => {
    if (newPage >= 1 && newPage <= totalPages && newPage !== page) {
      onUpdatePage?.(newPage)
    }
  }

  const handlePageSizeChange = (value: string | number | boolean | null) => {
    if (value === null || typeof value === 'boolean') return
    const newPageSize = normalizeTablePageSize(typeof value === 'string' ? parseInt(value, 10) : value)
    setPersistedPageSize(newPageSize)
    onUpdatePageSize?.(newPageSize)
  }

  const submitJump = () => {
    const value = jumpPage.trim()
    if (!value) return
    const pageNum = Number.parseInt(value, 10)
    if (Number.isNaN(pageNum)) return
    const nextPage = Math.min(Math.max(pageNum, 1), totalPages)
    setJumpPage('')
    goToPage(nextPage)
  }

  return (
    <div className="flex items-center justify-between border-t border-gray-200 bg-white px-4 py-3 dark:border-dark-700 dark:bg-dark-800 sm:px-6">
      {/* Mobile pagination */}
      <div className="flex flex-1 items-center justify-between sm:hidden">
        <button
          onClick={() => goToPage(page - 1)}
          disabled={page === 1}
          className="relative inline-flex items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-dark-600 dark:bg-dark-700 dark:text-gray-200 dark:hover:bg-dark-600"
        >
          {t('pagination.previous')}
        </button>
        <span className="text-sm text-gray-700 dark:text-gray-300">
          {t('pagination.pageOf', { page, total: totalPages })}
        </span>
        <button
          onClick={() => goToPage(page + 1)}
          disabled={page === totalPages}
          className="relative ml-3 inline-flex items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-dark-600 dark:bg-dark-700 dark:text-gray-200 dark:hover:bg-dark-600"
        >
          {t('pagination.next')}
        </button>
      </div>

      <div className="hidden sm:flex sm:flex-1 sm:items-center sm:justify-between">
        {/* Desktop pagination info */}
        <div className="flex items-center space-x-4">
          <p className="text-sm text-gray-700 dark:text-gray-300">
            {t('pagination.showing')} <span className="font-medium">{fromItem}</span>{' '}
            {t('pagination.to')} <span className="font-medium">{toItem}</span>{' '}
            {t('pagination.of')} <span className="font-medium">{total}</span>{' '}
            {t('pagination.results')}
          </p>

          {showPageSizeSelector ? (
            <div className="flex items-center space-x-2">
              <span className="text-sm text-gray-700 dark:text-gray-300">
                {t('pagination.perPage')}:
              </span>
              <div className="page-size-select w-20">
                <Select
                  modelValue={pageSize}
                  options={pageSizeSelectOptions}
                  onUpdateModelValue={handlePageSizeChange}
                />
              </div>
            </div>
          ) : null}

          {showJump ? (
            <div className="flex items-center space-x-2">
              <span className="text-sm text-gray-700 dark:text-gray-300">
                {t('pagination.jumpTo')}
              </span>
              <input
                value={jumpPage}
                onChange={(e) => setJumpPage(e.target.value)}
                type="number"
                min={1}
                max={totalPages}
                className="input w-20 text-sm"
                placeholder={t('pagination.jumpPlaceholder')}
                onKeyUp={(e) => {
                  if (e.key === 'Enter') submitJump()
                }}
              />
              <button type="button" className="btn btn-ghost btn-sm" onClick={submitJump}>
                {t('pagination.jumpAction')}
              </button>
            </div>
          ) : null}
        </div>

        {/* Desktop pagination buttons */}
        <nav
          className="relative z-0 inline-flex -space-x-px rounded-md shadow-sm"
          aria-label="Pagination"
        >
          <button
            onClick={() => goToPage(page - 1)}
            disabled={page === 1}
            className="relative inline-flex items-center rounded-l-md border border-gray-300 bg-white px-2 py-2 text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-dark-600 dark:bg-dark-700 dark:text-gray-400 dark:hover:bg-dark-600"
            aria-label={t('pagination.previous')}
          >
            <Icon name="chevronLeft" size="md" />
          </button>

          {visiblePages.map((pageNum, index) => (
            <button
              key={`${pageNum}-${index}`}
              onClick={() => typeof pageNum === 'number' && goToPage(pageNum)}
              disabled={typeof pageNum !== 'number'}
              className={[
                'relative inline-flex items-center border px-4 py-2 text-sm font-medium',
                pageNum === page
                  ? 'z-10 border-primary-500 bg-primary-50 text-primary-600 dark:bg-primary-900/30 dark:text-primary-400'
                  : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50 dark:border-dark-600 dark:bg-dark-700 dark:text-gray-300 dark:hover:bg-dark-600',
                typeof pageNum !== 'number' ? 'cursor-default' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              aria-label={
                typeof pageNum === 'number' ? t('pagination.goToPage', { page: pageNum }) : undefined
              }
              aria-current={pageNum === page ? 'page' : undefined}
            >
              {pageNum}
            </button>
          ))}

          <button
            onClick={() => goToPage(page + 1)}
            disabled={page === totalPages}
            className="relative inline-flex items-center rounded-r-md border border-gray-300 bg-white px-2 py-2 text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-dark-600 dark:bg-dark-700 dark:text-gray-400 dark:hover:bg-dark-600"
            aria-label={t('pagination.next')}
          >
            <Icon name="chevronRight" size="md" />
          </button>
        </nav>
      </div>
    </div>
  )
}
