'use client'

import type { Virtualizer } from '@tanstack/react-virtual'
import { useEffect, useRef, useState, type RefObject } from 'react'

/**
 * WeChat-style swipe/drag to select rows in a DataTable,
 * with a semi-transparent marquee overlay showing the selection area.
 */
export interface SwipeSelectAdapter {
  isSelected: (id: number) => boolean
  select: (id: number) => void
  deselect: (id: number) => void
  batchUpdate?: (updater: (draft: Set<number>) => void) => void
}

export interface SwipeSelectVirtualContext {
  getVirtualizer: () => Virtualizer<HTMLElement, Element> | null
  getSortedData: () => unknown[]
  getRowId: (row: unknown, index: number) => number
}

export function useSwipeSelect(
  containerRef: RefObject<HTMLElement | null>,
  adapter: SwipeSelectAdapter,
  virtualContext?: SwipeSelectVirtualContext,
) {
  const [isDragging, setIsDragging] = useState(false)
  const adapterRef = useRef(adapter)
  const virtualContextRef = useRef(virtualContext)

  adapterRef.current = adapter
  virtualContextRef.current = virtualContext

  useEffect(() => {
    let dragging = false
    let dragMode: 'select' | 'deselect' = 'select'
    let startRowIndex = -1
    let lastEndIndex = -1
    let startY = 0
    let lastMouseY = 0
    let pendingStartY = 0
    let initialSelectedSnapshot = new Map<number, boolean>()
    let cachedRows: HTMLElement[] = []
    let marqueeEl: HTMLDivElement | null = null
    let cachedScrollParent: HTMLElement | null = null

    const DRAG_THRESHOLD = 5
    const SCROLL_ZONE = 60
    const SCROLL_SPEED = 8

    function getActivationRoot(): HTMLElement | null {
      const container = containerRef.current
      if (!container) return null
      return (container.closest('.table-page-layout') as HTMLElement | null) || container
    }

    function getDataRows(): HTMLElement[] {
      const container = containerRef.current
      if (!container) return []
      return Array.from(container.querySelectorAll('tbody tr[data-row-id]'))
    }

    function getRowId(el: HTMLElement): number | null {
      const raw = el.getAttribute('data-row-id')
      if (raw === null) return null
      const id = Number(raw)
      return Number.isFinite(id) ? id : null
    }

    function findRowIndexAtY(clientY: number): number {
      const len = cachedRows.length
      if (len === 0) return -1

      const firstRect = cachedRows[0].getBoundingClientRect()
      if (clientY < firstRect.top) return 0
      const lastRect = cachedRows[len - 1].getBoundingClientRect()
      if (clientY > lastRect.bottom) return len - 1

      let lo = 0
      let hi = len - 1
      while (lo <= hi) {
        const mid = (lo + hi) >>> 1
        const rect = cachedRows[mid].getBoundingClientRect()
        if (clientY < rect.top) hi = mid - 1
        else if (clientY > rect.bottom) lo = mid + 1
        else return mid
      }
      if (hi < 0) return 0
      if (lo >= len) return len - 1
      const rHi = cachedRows[hi].getBoundingClientRect()
      const rLo = cachedRows[lo].getBoundingClientRect()
      return clientY - rHi.bottom < rLo.top - clientY ? hi : lo
    }

    function findRowIndexAtYVirtual(clientY: number): number {
      const ctx = virtualContextRef.current
      if (!ctx) return -1
      const virt = ctx.getVirtualizer()
      if (!virt) return -1
      const scrollEl = virt.scrollElement
      if (!scrollEl) return -1

      const scrollRect = scrollEl.getBoundingClientRect()
      const thead = scrollEl.querySelector('thead')
      const theadHeight = thead ? thead.getBoundingClientRect().height : 0
      const contentY = clientY - scrollRect.top - theadHeight + scrollEl.scrollTop

      const items = virt.getVirtualItems()
      for (const item of items) {
        if (contentY >= item.start && contentY < item.end) return item.index
      }

      const totalCount = ctx.getSortedData().length
      if (totalCount === 0) return -1
      const est = virt.options.estimateSize(0)
      const guess = Math.floor(contentY / est)
      return Math.max(0, Math.min(totalCount - 1, guess))
    }

    function onSelectStart(e: Event) {
      e.preventDefault()
    }

    function createMarquee() {
      removeMarquee()
      marqueeEl = document.createElement('div')
      const isDark = document.documentElement.classList.contains('dark')
      Object.assign(marqueeEl.style, {
        position: 'fixed',
        background: isDark ? 'rgba(96, 165, 250, 0.15)' : 'rgba(59, 130, 246, 0.12)',
        border: isDark ? '1.5px solid rgba(96, 165, 250, 0.5)' : '1.5px solid rgba(59, 130, 246, 0.4)',
        borderRadius: '4px',
        pointerEvents: 'none',
        zIndex: '9999',
        transition: 'none',
      })
      document.body.appendChild(marqueeEl)
    }

    function updateMarquee(currentY: number) {
      if (!marqueeEl || !containerRef.current) return
      const containerRect = containerRef.current.getBoundingClientRect()
      const top = Math.min(startY, currentY)
      const bottom = Math.max(startY, currentY)
      marqueeEl.style.left = `${containerRect.left}px`
      marqueeEl.style.width = `${containerRect.width}px`
      marqueeEl.style.top = `${top}px`
      marqueeEl.style.height = `${bottom - top}px`
    }

    function removeMarquee() {
      if (marqueeEl) {
        marqueeEl.remove()
        marqueeEl = null
      }
    }

    function applyRange(endIndex: number) {
      const currentAdapter = adapterRef.current
      if (startRowIndex < 0 || endIndex < 0) return
      const rangeMin = Math.min(startRowIndex, endIndex)
      const rangeMax = Math.max(startRowIndex, endIndex)
      const prevMin = lastEndIndex >= 0 ? Math.min(startRowIndex, lastEndIndex) : rangeMin
      const prevMax = lastEndIndex >= 0 ? Math.max(startRowIndex, lastEndIndex) : rangeMax
      const lo = Math.min(rangeMin, prevMin)
      const hi = Math.max(rangeMax, prevMax)

      if (currentAdapter.batchUpdate) {
        currentAdapter.batchUpdate((draft) => {
          for (let i = lo; i <= hi && i < cachedRows.length; i++) {
            const id = getRowId(cachedRows[i])
            if (id === null) continue
            const shouldBeSelected =
              i >= rangeMin && i <= rangeMax
                ? dragMode === 'select'
                : (initialSelectedSnapshot.get(id) ?? false)
            if (shouldBeSelected) draft.add(id)
            else draft.delete(id)
          }
        })
      } else {
        for (let i = lo; i <= hi && i < cachedRows.length; i++) {
          const id = getRowId(cachedRows[i])
          if (id === null) continue
          if (i >= rangeMin && i <= rangeMax) {
            if (dragMode === 'select') currentAdapter.select(id)
            else currentAdapter.deselect(id)
          } else {
            const wasSelected = initialSelectedSnapshot.get(id) ?? false
            if (wasSelected) currentAdapter.select(id)
            else currentAdapter.deselect(id)
          }
        }
      }
      lastEndIndex = endIndex
    }

    function applyRangeVirtual(endIndex: number) {
      const ctx = virtualContextRef.current
      const currentAdapter = adapterRef.current
      if (!ctx || startRowIndex < 0 || endIndex < 0) return
      const rangeMin = Math.min(startRowIndex, endIndex)
      const rangeMax = Math.max(startRowIndex, endIndex)
      const prevMin = lastEndIndex >= 0 ? Math.min(startRowIndex, lastEndIndex) : rangeMin
      const prevMax = lastEndIndex >= 0 ? Math.max(startRowIndex, lastEndIndex) : rangeMax
      const lo = Math.min(rangeMin, prevMin)
      const hi = Math.max(rangeMax, prevMax)
      const data = ctx.getSortedData()

      if (currentAdapter.batchUpdate) {
        currentAdapter.batchUpdate((draft) => {
          for (let i = lo; i <= hi && i < data.length; i++) {
            const id = ctx.getRowId(data[i], i)
            const shouldBeSelected =
              i >= rangeMin && i <= rangeMax
                ? dragMode === 'select'
                : (initialSelectedSnapshot.get(id) ?? false)
            if (shouldBeSelected) draft.add(id)
            else draft.delete(id)
          }
        })
      } else {
        for (let i = lo; i <= hi && i < data.length; i++) {
          const id = ctx.getRowId(data[i], i)
          if (i >= rangeMin && i <= rangeMax) {
            if (dragMode === 'select') currentAdapter.select(id)
            else currentAdapter.deselect(id)
          } else {
            const wasSelected = initialSelectedSnapshot.get(id) ?? false
            if (wasSelected) currentAdapter.select(id)
            else currentAdapter.deselect(id)
          }
        }
      }
      lastEndIndex = endIndex
    }

    function getScrollParent(el: HTMLElement): HTMLElement {
      let parent = el.parentElement
      while (parent && parent !== document.documentElement) {
        const { overflow, overflowY } = getComputedStyle(parent)
        if (/(auto|scroll)/.test(overflow + overflowY)) return parent
        parent = parent.parentElement
      }
      return document.documentElement
    }

    function isOnScrollbar(e: MouseEvent): boolean {
      let el = e.target as HTMLElement | null
      while (el && el !== document.documentElement) {
        const hasVScroll = el.scrollHeight > el.clientHeight
        const hasHScroll = el.scrollWidth > el.clientWidth
        if (hasVScroll || hasHScroll) {
          const rect = el.getBoundingClientRect()
          if (hasVScroll && e.clientX > rect.left + el.clientWidth) return true
          if (hasHScroll && e.clientY > rect.top + el.clientHeight) return true
        }
        el = el.parentElement
      }
      const docEl = document.documentElement
      if (e.clientX >= docEl.clientWidth || e.clientY >= docEl.clientHeight) return true
      return false
    }

    function shouldPreferNativeTextSelection(target: HTMLElement): boolean {
      const row = target.closest('tbody tr[data-row-id]')
      if (!row) return false
      const cell = target.closest('td, th')
      if (!cell) return false
      return target !== cell && !target.closest('[data-swipe-select-handle]')
    }

    function hasDirectTextContent(target: HTMLElement): boolean {
      return Array.from(target.childNodes).some(
        (node) => node.nodeType === Node.TEXT_NODE && (node.textContent?.trim().length ?? 0) > 0,
      )
    }

    function shouldPreferNativeSelectionOutsideRows(target: HTMLElement): boolean {
      const activationRoot = getActivationRoot()
      if (!activationRoot) return false
      if (!activationRoot.contains(target)) return false
      if (target.closest('tbody tr[data-row-id]')) return false
      return hasDirectTextContent(target)
    }

    function onMouseDown(e: MouseEvent) {
      if (e.button !== 0) return
      if (!containerRef.current) return

      const target = e.target as HTMLElement
      const activationRoot = getActivationRoot()
      if (!activationRoot || !activationRoot.contains(target)) return
      if (isOnScrollbar(e)) return

      if (
        target.closest(
          'button, a, input, select, textarea, [role="button"], [role="menuitem"], [role="combobox"], [role="dialog"]',
        )
      ) {
        return
      }
      if (shouldPreferNativeTextSelection(target)) return
      if (shouldPreferNativeSelectionOutsideRows(target)) return

      const ctx = virtualContextRef.current
      if (ctx) {
        const data = ctx.getSortedData()
        if (data.length === 0) return
      } else {
        cachedRows = getDataRows()
        if (cachedRows.length === 0) return
      }

      pendingStartY = e.clientY
      document.addEventListener('selectstart', onSelectStart)
      document.addEventListener('mousemove', onThresholdMove)
      document.addEventListener('mouseup', onThresholdUp)
    }

    function onThresholdMove(e: MouseEvent) {
      if (Math.abs(e.clientY - pendingStartY) < DRAG_THRESHOLD) return
      document.removeEventListener('mousemove', onThresholdMove)
      document.removeEventListener('mouseup', onThresholdUp)

      if (virtualContextRef.current) {
        beginDragVirtual(pendingStartY)
      } else {
        beginDrag(pendingStartY)
      }

      lastMouseY = e.clientY
      updateMarquee(e.clientY)
      const findIdx = virtualContextRef.current ? findRowIndexAtYVirtual : findRowIndexAtY
      const apply = virtualContextRef.current ? applyRangeVirtual : applyRange
      const rowIdx = findIdx(e.clientY)
      if (rowIdx >= 0) apply(rowIdx)
      autoScroll(e)

      document.addEventListener('mousemove', onMouseMove)
      document.addEventListener('mouseup', onMouseUp)
      document.addEventListener('wheel', onWheel, { passive: true })
    }

    function onThresholdUp() {
      document.removeEventListener('mousemove', onThresholdMove)
      document.removeEventListener('mouseup', onThresholdUp)
      document.removeEventListener('selectstart', onSelectStart)
      cachedRows = []
    }

    function beginDrag(clientY: number) {
      const currentAdapter = adapterRef.current
      startRowIndex = findRowIndexAtY(clientY)
      const startRowId = startRowIndex >= 0 ? getRowId(cachedRows[startRowIndex]) : null
      dragMode = startRowId !== null && currentAdapter.isSelected(startRowId) ? 'deselect' : 'select'

      initialSelectedSnapshot = new Map()
      for (const row of cachedRows) {
        const id = getRowId(row)
        if (id !== null) initialSelectedSnapshot.set(id, currentAdapter.isSelected(id))
      }

      dragging = true
      setIsDragging(true)
      startY = clientY
      lastMouseY = clientY
      lastEndIndex = -1
      cachedScrollParent =
        cachedRows.length > 0
          ? getScrollParent(cachedRows[0])
          : containerRef.current
            ? getScrollParent(containerRef.current)
            : null

      createMarquee()
      updateMarquee(clientY)
      applyRange(startRowIndex)
      window.getSelection()?.removeAllRanges()
    }

    function beginDragVirtual(clientY: number) {
      const ctx = virtualContextRef.current
      const currentAdapter = adapterRef.current
      if (!ctx) return

      startRowIndex = findRowIndexAtYVirtual(clientY)
      const data = ctx.getSortedData()
      const startRowId =
        startRowIndex >= 0 && startRowIndex < data.length
          ? ctx.getRowId(data[startRowIndex], startRowIndex)
          : null
      dragMode = startRowId !== null && currentAdapter.isSelected(startRowId) ? 'deselect' : 'select'

      initialSelectedSnapshot = new Map()
      for (let i = 0; i < data.length; i++) {
        const id = ctx.getRowId(data[i], i)
        initialSelectedSnapshot.set(id, currentAdapter.isSelected(id))
      }

      dragging = true
      setIsDragging(true)
      startY = clientY
      lastMouseY = clientY
      lastEndIndex = -1

      const virt = ctx.getVirtualizer()
      cachedScrollParent =
        virt?.scrollElement ?? (containerRef.current ? getScrollParent(containerRef.current) : null)

      createMarquee()
      updateMarquee(clientY)
      applyRangeVirtual(startRowIndex)
      window.getSelection()?.removeAllRanges()
    }

    let moveRAF = 0

    function onMouseMove(e: MouseEvent) {
      if (!dragging) return
      lastMouseY = e.clientY
      const findIdx = virtualContextRef.current ? findRowIndexAtYVirtual : findRowIndexAtY
      const apply = virtualContextRef.current ? applyRangeVirtual : applyRange
      cancelAnimationFrame(moveRAF)
      moveRAF = requestAnimationFrame(() => {
        updateMarquee(lastMouseY)
        const rowIdx = findIdx(lastMouseY)
        if (rowIdx >= 0 && rowIdx !== lastEndIndex) apply(rowIdx)
      })
      autoScroll(e)
    }

    function onWheel() {
      if (!dragging) return
      const findIdx = virtualContextRef.current ? findRowIndexAtYVirtual : findRowIndexAtY
      const apply = virtualContextRef.current ? applyRangeVirtual : applyRange
      requestAnimationFrame(() => {
        if (!dragging) return
        const rowIdx = findIdx(lastMouseY)
        if (rowIdx >= 0) apply(rowIdx)
      })
    }

    let scrollRAF = 0

    function autoScroll(e: MouseEvent) {
      cancelAnimationFrame(scrollRAF)
      const scrollEl = cachedScrollParent
      if (!scrollEl) return

      let dy = 0
      if (scrollEl === document.documentElement) {
        if (e.clientY < SCROLL_ZONE) dy = -SCROLL_SPEED
        else if (e.clientY > window.innerHeight - SCROLL_ZONE) dy = SCROLL_SPEED
      } else {
        const rect = scrollEl.getBoundingClientRect()
        if (e.clientY < rect.top + SCROLL_ZONE) dy = -SCROLL_SPEED
        else if (e.clientY > rect.bottom - SCROLL_ZONE) dy = SCROLL_SPEED
      }

      if (dy !== 0) {
        const findIdx = virtualContextRef.current ? findRowIndexAtYVirtual : findRowIndexAtY
        const apply = virtualContextRef.current ? applyRangeVirtual : applyRange
        const step = () => {
          const prevScrollTop = scrollEl.scrollTop
          scrollEl.scrollTop += dy
          if (scrollEl.scrollTop !== prevScrollTop) {
            const rowIdx = findIdx(lastMouseY)
            if (rowIdx >= 0 && rowIdx !== lastEndIndex) apply(rowIdx)
          }
          scrollRAF = requestAnimationFrame(step)
        }
        scrollRAF = requestAnimationFrame(step)
      }
    }

    function stopAutoScroll() {
      cancelAnimationFrame(scrollRAF)
    }

    function cleanupDrag() {
      dragging = false
      setIsDragging(false)
      startRowIndex = -1
      lastEndIndex = -1
      cachedRows = []
      initialSelectedSnapshot.clear()
      cachedScrollParent = null
      cancelAnimationFrame(moveRAF)
      stopAutoScroll()
      removeMarquee()
      document.removeEventListener('selectstart', onSelectStart)
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
      document.removeEventListener('wheel', onWheel)
    }

    function onMouseUp() {
      cleanupDrag()
    }

    function onWindowBlur() {
      if (dragging) cleanupDrag()
      document.removeEventListener('mousemove', onThresholdMove)
      document.removeEventListener('mouseup', onThresholdUp)
      document.removeEventListener('selectstart', onSelectStart)
    }

    document.addEventListener('mousedown', onMouseDown)
    window.addEventListener('blur', onWindowBlur)

    return () => {
      document.removeEventListener('mousedown', onMouseDown)
      window.removeEventListener('blur', onWindowBlur)
      document.removeEventListener('mousemove', onThresholdMove)
      document.removeEventListener('mouseup', onThresholdUp)
      document.removeEventListener('selectstart', onSelectStart)
      cleanupDrag()
    }
  }, [containerRef])

  return { isDragging }
}
