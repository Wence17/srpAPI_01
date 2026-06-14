'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { BasePaginationResponse, FetchOptions } from './types'
import { getPersistedPageSize, setPersistedPageSize } from './usePersistedPageSize'

interface PaginationState {
  page: number
  page_size: number
  total: number
  pages: number
}

interface TableLoaderOptions<T, P> {
  fetchFn: (
    page: number,
    pageSize: number,
    params: P,
    options?: FetchOptions,
  ) => Promise<BasePaginationResponse<T>>
  initialParams?: P
  pageSize?: number
  debounceMs?: number
}

function isAbortError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const err = error as { name?: string; code?: string }
  return err.name === 'AbortError' || err.code === 'ERR_CANCELED' || err.name === 'CanceledError'
}

/**
 * Generic table data loader hook.
 * Handles pagination, filters, debounced search reload, and request cancellation.
 */
export function useTableLoader<T, P extends Record<string, unknown>>(
  options: TableLoaderOptions<T, P>,
) {
  const { fetchFn, initialParams, pageSize, debounceMs = 300 } = options

  const [items, setItems] = useState<T[]>([])
  const [loading, setLoading] = useState(false)
  const [params, setParams] = useState<P>({ ...(initialParams || {}) } as P)
  const [pagination, setPagination] = useState<PaginationState>({
    page: 1,
    page_size: pageSize ?? getPersistedPageSize(),
    total: 0,
    pages: 0,
  })

  const abortControllerRef = useRef<AbortController | null>(null)
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const paramsRef = useRef(params)
  const paginationRef = useRef(pagination)

  paramsRef.current = params
  paginationRef.current = pagination

  const load = useCallback(
    async (overrides?: { page?: number; page_size?: number }) => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }
      const currentController = new AbortController()
      abortControllerRef.current = currentController
      setLoading(true)

      const page = overrides?.page ?? paginationRef.current.page
      const page_size = overrides?.page_size ?? paginationRef.current.page_size

      try {
        const response = await fetchFn(page, page_size, paramsRef.current, {
          signal: currentController.signal,
        })

        setItems(response.items || [])
        setPagination((prev) => ({
          ...prev,
          page,
          page_size,
          total: response.total || 0,
          pages: response.pages || 0,
        }))
      } catch (error) {
        if (!isAbortError(error)) {
          console.error('Table load error:', error)
          throw error
        }
      } finally {
        if (abortControllerRef.current === currentController) {
          setLoading(false)
        }
      }
    },
    [fetchFn],
  )

  const reload = useCallback(() => {
    setPagination((prev) => ({ ...prev, page: 1 }))
    return load({ page: 1 })
  }, [load])

  const debouncedReload = useCallback(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current)
    }
    debounceTimerRef.current = setTimeout(() => {
      void reload()
    }, debounceMs)
  }, [debounceMs, reload])

  const handlePageChange = useCallback(
    (page: number) => {
      const validPage = Math.max(1, Math.min(page, paginationRef.current.pages || 1))
      setPagination((prev) => ({ ...prev, page: validPage }))
      void load({ page: validPage })
    },
    [load],
  )

  const handlePageSizeChange = useCallback(
    (size: number) => {
      setPagination((prev) => ({ ...prev, page_size: size, page: 1 }))
      setPersistedPageSize(size)
      void load({ page: 1, page_size: size })
    },
    [load],
  )

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort()
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current)
      }
    }
  }, [])

  return {
    items,
    setItems,
    loading,
    params,
    setParams,
    pagination,
    setPagination,
    load,
    reload,
    debouncedReload,
    handlePageChange,
    handlePageSizeChange,
  }
}
