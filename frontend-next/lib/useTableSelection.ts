'use client'

import { useCallback, useMemo, useState } from 'react'

interface UseTableSelectionOptions<T> {
  rows: T[]
  getId: (row: T) => number
}

export function useTableSelection<T>({ rows, getId }: UseTableSelectionOptions<T>) {
  const [selectedSet, setSelectedSet] = useState<Set<number>>(() => new Set())

  const selectedIds = useMemo(() => Array.from(selectedSet), [selectedSet])
  const selectedCount = selectedSet.size

  const isSelected = useCallback((id: number) => selectedSet.has(id), [selectedSet])

  const replaceSelectedSet = useCallback((next: Set<number>) => {
    setSelectedSet(next)
  }, [])

  const setSelectedIds = useCallback((ids: number[]) => {
    setSelectedSet(new Set(ids))
  }, [])

  const select = useCallback(
    (id: number) => {
      setSelectedSet((prev) => {
        if (prev.has(id)) return prev
        const next = new Set(prev)
        next.add(id)
        return next
      })
    },
    [],
  )

  const deselect = useCallback(
    (id: number) => {
      setSelectedSet((prev) => {
        if (!prev.has(id)) return prev
        const next = new Set(prev)
        next.delete(id)
        return next
      })
    },
    [],
  )

  const toggle = useCallback(
    (id: number) => {
      setSelectedSet((prev) => {
        const next = new Set(prev)
        if (next.has(id)) {
          next.delete(id)
        } else {
          next.add(id)
        }
        return next
      })
    },
    [],
  )

  const clear = useCallback(() => {
    setSelectedSet((prev) => (prev.size === 0 ? prev : new Set()))
  }, [])

  const removeMany = useCallback((ids: number[]) => {
    if (ids.length === 0) return
    setSelectedSet((prev) => {
      if (prev.size === 0) return prev
      const next = new Set(prev)
      let changed = false
      ids.forEach((id) => {
        if (next.delete(id)) changed = true
      })
      return changed ? next : prev
    })
  }, [])

  const allVisibleSelected = useMemo(() => {
    if (rows.length === 0) return false
    return rows.every((row) => selectedSet.has(getId(row)))
  }, [rows, selectedSet, getId])

  const toggleVisible = useCallback(
    (checked: boolean) => {
      setSelectedSet((prev) => {
        const next = new Set(prev)
        rows.forEach((row) => {
          const id = getId(row)
          if (checked) {
            next.add(id)
          } else {
            next.delete(id)
          }
        })
        return next
      })
    },
    [rows, getId],
  )

  const batchUpdate = useCallback((updater: (draft: Set<number>) => void) => {
    setSelectedSet((prev) => {
      const draft = new Set(prev)
      updater(draft)
      return draft
    })
  }, [])

  const selectVisible = useCallback(() => {
    toggleVisible(true)
  }, [toggleVisible])

  return {
    selectedSet,
    selectedIds,
    selectedCount,
    allVisibleSelected,
    isSelected,
    setSelectedIds,
    select,
    deselect,
    toggle,
    clear,
    removeMany,
    toggleVisible,
    selectVisible,
    batchUpdate,
  }
}
