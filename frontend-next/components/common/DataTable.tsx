'use client'

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react'
import {
  useVirtualizer,
  observeElementRect as observeElementRectDefault,
  type Virtualizer,
} from '@tanstack/react-virtual'
import { useI18n } from '@/lib/i18n/I18nProvider'
import Icon from '@/components/icons/Icon'
import type { Column } from './types'

export interface DataTableCellContext {
  row: any
  value: any
  expanded: boolean
}

export interface DataTableHeaderContext {
  column: Column
  sortKey: string
  sortOrder: 'asc' | 'desc'
}

interface DataTableProps {
  columns: Column[]
  data: any[]
  loading?: boolean
  stickyFirstColumn?: boolean
  stickyActionsColumn?: boolean
  expandableActions?: boolean
  actionsCount?: number
  rowKey?: string | ((row: any) => string | number)
  defaultSortKey?: string
  defaultSortOrder?: 'asc' | 'desc'
  sortStorageKey?: string
  serverSideSort?: boolean
  estimateRowHeight?: number
  overscan?: number
  onSort?: (key: string, order: 'asc' | 'desc') => void
  /** Named cell renderers, keyed by `cell-${column.key}` slot semantics (key only) */
  cells?: Record<string, (ctx: DataTableCellContext) => ReactNode>
  /** Named header renderers, keyed by column.key */
  headerCells?: Record<string, (ctx: DataTableHeaderContext) => ReactNode>
  /** Custom empty-state content (mirrors the `empty` slot) */
  emptySlot?: ReactNode
}

const desktopViewportQuery = '(min-width: 768px)'

// 兜底高度:表格区域大致 = 视口高度 - 顶栏/外边距/筛选/分页 ≈ 320px
const estimatedViewportHeight = () => {
  if (typeof window === 'undefined') return 600
  return Math.max(window.innerHeight - 320, 400)
}

type PersistedSortState = {
  key: string
  order: 'asc' | 'desc'
}

const collator = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: 'base',
})

const isNullishOrEmpty = (value: any) => value === null || value === undefined || value === ''

const toFiniteNumberOrNull = (value: any): number | null => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value === 'boolean') return value ? 1 : 0
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) return null
    const n = Number(trimmed)
    return Number.isFinite(n) ? n : null
  }
  return null
}

const toSortableString = (value: any): string => {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (value instanceof Date) return value.toISOString()
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

const compareSortValues = (a: any, b: any): number => {
  const aEmpty = isNullishOrEmpty(a)
  const bEmpty = isNullishOrEmpty(b)
  if (aEmpty && bEmpty) return 0
  if (aEmpty) return 1
  if (bEmpty) return -1

  const aNum = toFiniteNumberOrNull(a)
  const bNum = toFiniteNumberOrNull(b)
  if (aNum !== null && bNum !== null) {
    if (aNum === bNum) return 0
    return aNum < bNum ? -1 : 1
  }

  const aStr = toSortableString(a)
  const bStr = toSortableString(b)
  const res = collator.compare(aStr, bStr)
  if (res === 0) return 0
  return res < 0 ? -1 : 1
}

export default function DataTable({
  columns,
  data,
  loading = false,
  stickyFirstColumn = true,
  stickyActionsColumn = true,
  expandableActions = true,
  actionsCount,
  rowKey,
  defaultSortKey,
  defaultSortOrder = 'asc',
  sortStorageKey,
  serverSideSort = false,
  estimateRowHeight,
  overscan,
  onSort,
  cells,
  headerCells,
  emptySlot,
}: DataTableProps) {
  const { t } = useI18n()

  const [isDesktopViewport, setIsDesktopViewport] = useState(true)

  const tableWrapperRef = useRef<HTMLDivElement | null>(null)
  const [isScrollable, setIsScrollable] = useState(false)
  const [, setActionsColumnNeedsExpanding] = useState(false)

  const [sortKey, setSortKey] = useState<string>('')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc')
  const [actionsExpanded, setActionsExpanded] = useState(false)

  const sortKeyRef = useRef(sortKey)
  sortKeyRef.current = sortKey
  const sortOrderRef = useRef(sortOrder)
  sortOrderRef.current = sortOrder

  // Keep latest props/state available to closures without re-binding listeners.
  const columnsRef = useRef(columns)
  columnsRef.current = columns
  const sortStorageKeyRef = useRef(sortStorageKey)
  sortStorageKeyRef.current = sortStorageKey

  const getSortableKeys = useCallback(() => {
    const keys = new Set<string>()
    for (const col of columnsRef.current) {
      if (col.sortable) keys.add(col.key)
    }
    return keys
  }, [])

  const normalizeSortKey = useCallback(
    (candidate: string) => {
      if (!candidate) return ''
      const sortableKeys = getSortableKeys()
      return sortableKeys.has(candidate) ? candidate : ''
    },
    [getSortableKeys],
  )

  const normalizeSortOrder = useCallback((candidate: any): 'asc' | 'desc' => {
    return candidate === 'desc' ? 'desc' : 'asc'
  }, [])

  const readPersistedSortState = useCallback((): PersistedSortState | null => {
    if (!sortStorageKeyRef.current) return null
    try {
      const raw = localStorage.getItem(sortStorageKeyRef.current)
      if (!raw) return null
      const parsed = JSON.parse(raw) as Partial<PersistedSortState>
      const key = normalizeSortKey(typeof parsed.key === 'string' ? parsed.key : '')
      if (!key) return null
      return { key, order: normalizeSortOrder(parsed.order) }
    } catch (e) {
      console.error('[DataTable] Failed to read persisted sort state:', e)
      return null
    }
  }, [normalizeSortKey, normalizeSortOrder])

  const writePersistedSortState = useCallback((state: PersistedSortState) => {
    if (!sortStorageKeyRef.current) return
    try {
      localStorage.setItem(sortStorageKeyRef.current, JSON.stringify(state))
    } catch (e) {
      console.error('[DataTable] Failed to persist sort state:', e)
    }
  }, [])

  const resolveInitialSortState = useCallback((): PersistedSortState | null => {
    const persisted = readPersistedSortState()
    if (persisted) return persisted

    const key = normalizeSortKey(defaultSortKey || '')
    if (!key) return null
    return { key, order: normalizeSortOrder(defaultSortOrder) }
  }, [readPersistedSortState, normalizeSortKey, normalizeSortOrder, defaultSortKey, defaultSortOrder])

  const applySortState = useCallback((state: PersistedSortState | null) => {
    if (!state) return
    setSortKey(state.key)
    setSortOrder(state.order)
  }, [])

  const resolveRowKey = useCallback(
    (row: any, index: number) => {
      if (typeof rowKey === 'function') {
        const key = rowKey(row)
        return key ?? index
      }
      if (typeof rowKey === 'string' && rowKey) {
        const key = row?.[rowKey]
        return key ?? index
      }
      const key = row?.id
      return key ?? index
    },
    [rowKey],
  )

  const dataColumns = useMemo(() => columns.filter((column) => column.key !== 'actions'), [columns])
  const columnsSignature = useMemo(
    () => columns.map((column) => `${column.key}:${column.sortable ? '1' : '0'}`).join('|'),
    [columns],
  )

  const hasActionsColumn = useMemo(
    () => columns.some((column) => column.key === 'actions'),
    [columns],
  )
  const hasSelectColumn = useMemo(
    () => columns.length > 0 && columns[0].key === 'select',
    [columns],
  )

  // 检查是否可滚动
  const checkScrollable = useCallback(() => {
    if (tableWrapperRef.current) {
      setIsScrollable(
        tableWrapperRef.current.scrollWidth > tableWrapperRef.current.clientWidth,
      )
    }
  }, [])

  // 检查操作列是否需要展开
  const checkActionsColumnWidth = useCallback(() => {
    const wrapper = tableWrapperRef.current
    if (!wrapper) return

    const firstActionCell = wrapper.querySelector('tbody tr:first-child td:last-child')
    if (!firstActionCell) return

    const actionsContainer = firstActionCell.querySelector('div')
    if (!actionsContainer) return

    const actionItems = actionsContainer.querySelectorAll('button, a, [role="button"]')
    if (actionItems.length <= 2) {
      setActionsColumnNeedsExpanding(false)
      return
    }

    let totalWidth = 0
    actionItems.forEach((item, index) => {
      totalWidth += (item as HTMLElement).offsetWidth
      if (index < actionItems.length - 1) {
        totalWidth += 4 // gap-1 = 4px
      }
    })

    const cellWidth = (firstActionCell as HTMLElement).clientWidth - 32

    setActionsColumnNeedsExpanding(totalWidth > cellWidth)
  }, [])

  // 覆写默认 observeElementRect:过滤掉 0 高度读数(根治整表空白的关键)
  const observeElementRectNonZero = useCallback(
    (instance: Virtualizer<HTMLDivElement, Element>, cb: (rect: { width: number; height: number }) => void) =>
      observeElementRectDefault(instance, (rect) => {
        if (rect.height > 0) cb(rect)
      }),
    [],
  )

  const handleSort = useCallback(
    (key: string) => {
      let newOrder: 'asc' | 'desc' = 'asc'
      if (sortKeyRef.current === key) {
        newOrder = sortOrderRef.current === 'asc' ? 'desc' : 'asc'
      }

      if (serverSideSort) {
        // Server-side sort mode: emit event and update internal state for UI feedback
        setSortKey(key)
        setSortOrder(newOrder)
        onSort?.(key, newOrder)
      } else {
        // Client-side sort mode: just update internal state
        setSortKey(key)
        setSortOrder(newOrder)
      }
    },
    [serverSideSort, onSort],
  )

  const sortedData = useMemo(() => {
    if (serverSideSort || !sortKey || !data) return data

    const key = sortKey
    const order = sortOrder

    return data
      .map((row, index) => ({ row, index }))
      .sort((a, b) => {
        const cmp = compareSortValues(a.row?.[key], b.row?.[key])
        if (cmp !== 0) return order === 'asc' ? cmp : -cmp
        return a.index - b.index
      })
      .map((item) => item.row)
  }, [serverSideSort, sortKey, sortOrder, data])

  // --- Virtual scrolling ---
  const rowVirtualizer = useVirtualizer<HTMLDivElement, Element>({
    count: isDesktopViewport ? sortedData?.length ?? 0 : 0,
    getScrollElement: () => tableWrapperRef.current,
    estimateSize: () => estimateRowHeight ?? 56,
    overscan: overscan ?? 5,
    // 兜底高度:首个有效高度读数到来前,先按一屏渲染,避免空白帧
    initialRect: { width: 0, height: estimatedViewportHeight() },
    // 关键:过滤 0 高度读数,杜绝 scrollRect 被钉成 0 → calculateRange 返回 null → 整表空白
    observeElementRect: observeElementRectNonZero,
    // 把测量类 ResizeObserver 回调批到 rAF,避免滚动中同步 reflow 风暴导致的校正抖动/空白
    useAnimationFrameWithResizeObserver: true,
  })

  const virtualItems = rowVirtualizer.getVirtualItems()

  const virtualPaddingTop = virtualItems.length > 0 ? virtualItems[0].start : 0
  const virtualPaddingBottom =
    virtualItems.length === 0
      ? 0
      : rowVirtualizer.getTotalSize() - virtualItems[virtualItems.length - 1].end

  const measureElement = useCallback(
    (el: Element | null) => {
      if (el) {
        rowVirtualizer.measureElement(el)
      }
    },
    [rowVirtualizer],
  )

  // 生成固定列的 CSS 类
  const getStickyColumnClass = useCallback(
    (column: Column, index: number) => {
      const classes: string[] = []

      if (stickyFirstColumn) {
        if (hasSelectColumn) {
          if (index === 0) {
            classes.push('sticky-col sticky-col-left-first')
          } else if (index === 1) {
            classes.push('sticky-col sticky-col-left-second')
          }
        } else {
          if (index === 0) {
            classes.push('sticky-col sticky-col-left')
          }
        }
      }

      if (stickyActionsColumn && column.key === 'actions') {
        classes.push('sticky-col sticky-col-right')
      }

      return classes.join(' ')
    },
    [stickyFirstColumn, stickyActionsColumn, hasSelectColumn],
  )

  // 根据列数自适应调整内边距
  const getAdaptivePaddingClass = useCallback(() => {
    const columnCount = columns.length

    if (columnCount >= 10) {
      return 'px-2'
    } else if (columnCount >= 7) {
      return 'px-3'
    } else if (columnCount >= 5) {
      return 'px-4'
    } else {
      return 'px-6'
    }
  }, [columns.length])

  // Track desktop viewport via matchMedia (mirrors the Vue onMounted/onUnmounted setup)
  useEffect(() => {
    if (typeof window === 'undefined') return
    const mq = window.matchMedia(desktopViewportQuery)
    setIsDesktopViewport(mq.matches)
    const listener = (event: MediaQueryListEvent) => setIsDesktopViewport(event.matches)
    if (typeof mq.addEventListener === 'function') {
      mq.addEventListener('change', listener)
    } else {
      mq.addListener(listener)
    }
    return () => {
      if (typeof mq.removeEventListener === 'function') {
        mq.removeEventListener('change', listener)
      } else {
        mq.removeListener(listener)
      }
    }
  }, [])

  // Attach/detach desktop table tracking (scroll + actions column width)
  useEffect(() => {
    if (!isDesktopViewport) return
    const wrapper = tableWrapperRef.current
    if (!wrapper) return

    checkScrollable()
    checkActionsColumnWidth()

    let resizeObserver: ResizeObserver | null = null
    let resizeHandler: (() => void) | null = null

    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => {
        checkScrollable()
        checkActionsColumnWidth()
      })
      resizeObserver.observe(wrapper)
    } else {
      resizeHandler = () => {
        checkScrollable()
        checkActionsColumnWidth()
      }
      window.addEventListener('resize', resizeHandler)
    }

    return () => {
      resizeObserver?.disconnect()
      if (resizeHandler) window.removeEventListener('resize', resizeHandler)
    }
  }, [isDesktopViewport, checkScrollable, checkActionsColumnWidth])

  // 数据/列变化时重新检查滚动状态
  useEffect(() => {
    if (!isDesktopViewport) return
    const id = requestAnimationFrame(() => {
      checkScrollable()
      checkActionsColumnWidth()
    })
    return () => cancelAnimationFrame(id)
  }, [data.length, columnsSignature, isDesktopViewport, checkScrollable, checkActionsColumnWidth])

  // 单独监听展开状态变化，只更新滚动状态
  useEffect(() => {
    const id = requestAnimationFrame(() => checkScrollable())
    return () => cancelAnimationFrame(id)
  }, [actionsExpanded, checkScrollable])

  // Init + keep persisted sort state consistent with current columns
  const didInitSort = useRef(false)

  useEffect(() => {
    const initial = resolveInitialSortState()
    applySortState(initial)
    didInitSort.current = true
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const normalized = normalizeSortKey(sortKey)
    if (!sortKey) {
      const initial = resolveInitialSortState()
      applySortState(initial)
      return
    }

    if (!normalized) {
      const fallback = resolveInitialSortState()
      if (fallback) {
        applySortState(fallback)
      } else {
        setSortKey('')
        setSortOrder('asc')
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [columnsSignature])

  useEffect(() => {
    if (!didInitSort.current) return
    if (!sortStorageKeyRef.current) return
    const key = normalizeSortKey(sortKey)
    if (!key) return
    writePersistedSortState({ key, order: normalizeSortOrder(sortOrder) })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortKey, sortOrder])

  const renderCell = (column: Column, row: any): ReactNode => {
    const value = row?.[column.key]
    const renderer = cells?.[column.key]
    if (renderer) return renderer({ row, value, expanded: actionsExpanded })
    if (column.formatter) return column.formatter(value, row)
    return value as ReactNode
  }

  const renderActionsCell = (row: any): ReactNode => {
    const renderer = cells?.actions
    if (renderer) return renderer({ row, value: row?.actions, expanded: actionsExpanded })
    return null
  }

  const renderEmpty = (): ReactNode => {
    if (emptySlot !== undefined) return emptySlot
    return (
      <div className="flex flex-col items-center">
        <Icon name="inbox" size="xl" className="mb-4 h-12 w-12 text-gray-400 dark:text-dark-500" />
        <p className="text-lg font-medium text-gray-900 dark:text-gray-100">{t('empty.noData')}</p>
      </div>
    )
  }

  // ----- Mobile / non-desktop layout -----
  if (!isDesktopViewport) {
    return (
      <div className="space-y-3">
        {loading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="rounded-lg border border-gray-200 bg-white p-4 dark:border-dark-700 dark:bg-dark-900"
            >
              <div className="space-y-3">
                {dataColumns.map((column) => (
                  <div key={column.key} className="flex justify-between">
                    <div className="h-4 w-20 animate-pulse rounded bg-gray-200 dark:bg-dark-700" />
                    <div className="h-4 w-32 animate-pulse rounded bg-gray-200 dark:bg-dark-700" />
                  </div>
                ))}
                {hasActionsColumn ? (
                  <div className="border-t border-gray-200 pt-3 dark:border-dark-700">
                    <div className="h-8 w-full animate-pulse rounded bg-gray-200 dark:bg-dark-700" />
                  </div>
                ) : null}
              </div>
            </div>
          ))
        ) : !data || data.length === 0 ? (
          <div className="rounded-lg border border-gray-200 bg-white p-12 text-center dark:border-dark-700 dark:bg-dark-900">
            {renderEmpty()}
          </div>
        ) : (
          sortedData.map((row, index) => (
            <div
              key={resolveRowKey(row, index)}
              className="rounded-lg border border-gray-200 bg-white p-4 dark:border-dark-700 dark:bg-dark-900"
            >
              <div className="space-y-3">
                {dataColumns.map((column) => (
                  <div key={column.key} className="flex items-start justify-between gap-4">
                    <span className="text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-dark-400">
                      {column.label}
                    </span>
                    <div className="text-right text-sm text-gray-900 dark:text-gray-100">
                      {renderCell(column, row)}
                    </div>
                  </div>
                ))}
                {hasActionsColumn ? (
                  <div className="border-t border-gray-200 pt-3 dark:border-dark-700">
                    {renderActionsCell(row)}
                  </div>
                ) : null}
              </div>
            </div>
          ))
        )}
      </div>
    )
  }

  // ----- Desktop table layout -----
  const wrapperClasses = ['table-wrapper']
  if (actionsExpanded) wrapperClasses.push('actions-expanded')
  if (isScrollable) wrapperClasses.push('is-scrollable')

  return (
    <div ref={tableWrapperRef} className={wrapperClasses.join(' ')}>
      <table className="w-full min-w-max divide-y divide-gray-200 dark:divide-dark-700">
        <thead className="table-header bg-gray-50 dark:bg-dark-800">
          <tr>
            {columns.map((column, index) => {
              const headerRenderer = headerCells?.[column.key]
              return (
                <th
                  key={column.key}
                  scope="col"
                  className={[
                    'sticky-header-cell py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-dark-400',
                    getAdaptivePaddingClass(),
                    column.sortable ? 'cursor-pointer hover:bg-gray-100 dark:hover:bg-dark-700' : '',
                    getStickyColumnClass(column, index),
                    column.class || '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  onClick={() => column.sortable && handleSort(column.key)}
                >
                  {headerRenderer ? (
                    headerRenderer({ column, sortKey, sortOrder })
                  ) : (
                    <div className="flex items-center space-x-1">
                      <span>{column.label}</span>
                      {column.sortable ? (
                        <span className="text-gray-400 dark:text-dark-500">
                          {sortKey === column.key ? (
                            <svg
                              className={`h-4 w-4${sortOrder === 'desc' ? ' rotate-180 transform' : ''}`}
                              fill="currentColor"
                              viewBox="0 0 20 20"
                            >
                              <path
                                fillRule="evenodd"
                                d="M14.707 12.707a1 1 0 01-1.414 0L10 9.414l-3.293 3.293a1 1 0 01-1.414-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 010 1.414z"
                                clipRule="evenodd"
                              />
                            </svg>
                          ) : (
                            <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
                              <path d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" />
                            </svg>
                          )}
                        </span>
                      ) : null}
                    </div>
                  )}
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody className="table-body divide-y divide-gray-200 bg-white dark:divide-dark-700 dark:bg-dark-900">
          {loading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <tr key={i}>
                {columns.map((column) => (
                  <td
                    key={column.key}
                    className={['whitespace-nowrap py-4', getAdaptivePaddingClass()].join(' ')}
                  >
                    <div className="animate-pulse">
                      <div className="h-4 w-3/4 rounded bg-gray-200 dark:bg-dark-700" />
                    </div>
                  </td>
                ))}
              </tr>
            ))
          ) : !data || data.length === 0 ? (
            <tr>
              <td
                colSpan={columns.length}
                className={['py-12 text-center text-gray-500 dark:text-dark-400', getAdaptivePaddingClass()].join(' ')}
              >
                {renderEmpty()}
              </td>
            </tr>
          ) : (
            <>
              {virtualPaddingTop > 0 ? (
                <tr aria-hidden="true">
                  <td
                    colSpan={columns.length}
                    style={{ height: `${virtualPaddingTop}px`, padding: 0, border: 'none' }}
                  />
                </tr>
              ) : null}
              {virtualItems.map((virtualRow) => {
                const row = sortedData[virtualRow.index]
                return (
                  <tr
                    key={resolveRowKey(row, virtualRow.index)}
                    data-row-id={resolveRowKey(row, virtualRow.index)}
                    data-index={virtualRow.index}
                    ref={measureElement}
                    className="hover:bg-gray-50 dark:hover:bg-dark-800"
                  >
                    {columns.map((column, colIndex) => (
                      <td
                        key={column.key}
                        className={[
                          'whitespace-nowrap py-4 text-sm text-gray-900 dark:text-gray-100',
                          getAdaptivePaddingClass(),
                          getStickyColumnClass(column, colIndex),
                          column.class || '',
                        ]
                          .filter(Boolean)
                          .join(' ')}
                      >
                        {column.key === 'actions' ? renderActionsCell(row) : renderCell(column, row)}
                      </td>
                    ))}
                  </tr>
                )
              })}
              {virtualPaddingBottom > 0 ? (
                <tr aria-hidden="true">
                  <td
                    colSpan={columns.length}
                    style={{ height: `${virtualPaddingBottom}px`, padding: 0, border: 'none' } as CSSProperties}
                  />
                </tr>
              ) : null}
            </>
          )}
        </tbody>
      </table>
    </div>
  )
}
