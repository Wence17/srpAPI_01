'use client'

import {
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'

interface HelpTooltipProps {
  content?: string
  trigger?: 'hover' | 'click'
  widthClass?: string
  children?: ReactNode
  triggerContent?: ReactNode
}

export default function HelpTooltip({
  content,
  trigger = 'hover',
  widthClass = 'w-64',
  children,
  triggerContent,
}: HelpTooltipProps) {
  const [show, setShow] = useState(false)
  const [mounted, setMounted] = useState(false)
  const triggerRef = useRef<HTMLDivElement | null>(null)
  const tooltipRef = useRef<HTMLDivElement | null>(null)
  const [tooltipStyle, setTooltipStyle] = useState({ top: '0px', left: '0px' })

  useEffect(() => setMounted(true), [])

  const updatePosition = () => {
    const el = triggerRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    setTooltipStyle({
      top: `${rect.top + window.scrollY}px`,
      left: `${rect.left + rect.width / 2 + window.scrollX}px`,
    })
  }

  const openTooltip = () => {
    setShow(true)
    requestAnimationFrame(updatePosition)
  }

  const closeTooltip = () => setShow(false)

  const onEnter = () => {
    if (trigger !== 'hover') return
    openTooltip()
  }

  const onLeave = () => {
    if (trigger !== 'hover') return
    closeTooltip()
  }

  const onClick = (event: ReactMouseEvent) => {
    if (trigger !== 'click') return
    event.stopPropagation()
    if (show) {
      closeTooltip()
      return
    }
    openTooltip()
  }

  useEffect(() => {
    const onDocumentClick = (event: MouseEvent) => {
      if (trigger !== 'click' || !show) return
      const target = event.target as Node | null
      if (!target) return
      if (triggerRef.current?.contains(target) || tooltipRef.current?.contains(target)) return
      closeTooltip()
    }

    const onDocumentKeydown = (event: KeyboardEvent) => {
      if (trigger === 'click' && event.key === 'Escape') closeTooltip()
    }

    const onViewportChange = () => {
      if (show) updatePosition()
    }

    document.addEventListener('click', onDocumentClick, true)
    document.addEventListener('keydown', onDocumentKeydown)
    window.addEventListener('resize', onViewportChange)
    window.addEventListener('scroll', onViewportChange, true)

    return () => {
      document.removeEventListener('click', onDocumentClick, true)
      document.removeEventListener('keydown', onDocumentKeydown)
      window.removeEventListener('resize', onViewportChange)
      window.removeEventListener('scroll', onViewportChange, true)
    }
  }, [show, trigger])

  return (
    <>
      <div
        ref={triggerRef}
        className="group relative ml-1 inline-flex items-center align-middle"
        onMouseEnter={onEnter}
        onMouseLeave={onLeave}
        onClick={onClick}
      >
        {triggerContent ?? (
          <svg
            className="h-4 w-4 cursor-help text-gray-400 transition-colors hover:text-primary-600 dark:text-gray-500 dark:hover:text-primary-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
        )}
      </div>

      {mounted && show
        ? createPortal(
            <div
              ref={tooltipRef}
              role="tooltip"
              className={`fixed z-[99999] -translate-x-1/2 -translate-y-full rounded-lg bg-gray-900 p-3 text-xs leading-relaxed text-white shadow-xl ring-1 ring-white/10 dark:bg-gray-800 ${widthClass}`}
              style={{ top: `calc(${tooltipStyle.top} - 8px)`, left: tooltipStyle.left }}
            >
              {trigger === 'click' ? (
                <button
                  type="button"
                  className="absolute right-1.5 top-1.5 rounded p-1 text-gray-300 transition-colors hover:bg-white/10 hover:text-white"
                  aria-label="Close"
                  onClick={(e) => {
                    e.stopPropagation()
                    closeTooltip()
                  }}
                >
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              ) : null}
              {children ?? content}
              <div className="absolute -bottom-1 left-1/2 h-2 w-2 -translate-x-1/2 rotate-45 bg-gray-900 dark:bg-gray-800" />
            </div>,
            document.body,
          )
        : null}
    </>
  )
}
