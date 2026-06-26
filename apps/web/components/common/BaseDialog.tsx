'use client'

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import Icon from '@/components/icons/Icon'

type DialogWidth = 'narrow' | 'normal' | 'wide' | 'extra-wide' | 'full'

interface BaseDialogProps {
  show: boolean
  title: string
  width?: DialogWidth
  closeOnEscape?: boolean
  closeOnClickOutside?: boolean
  zIndex?: number
  onClose: () => void
  children?: ReactNode
  footer?: ReactNode
}

let dialogIdCounter = 0

export default function BaseDialog({
  show,
  title,
  width = 'normal',
  closeOnEscape = true,
  closeOnClickOutside = false,
  zIndex = 50,
  onClose,
  children,
  footer,
}: BaseDialogProps) {
  const dialogId = useMemo(() => `modal-title-${++dialogIdCounter}`, [])
  const dialogRef = useRef<HTMLDivElement | null>(null)
  const previousActiveElement = useRef<HTMLElement | null>(null)
  const [mounted, setMounted] = useState(false)

  useEffect(() => setMounted(true), [])

  const zIndexStyle = useMemo<CSSProperties | undefined>(
    () => (zIndex !== 50 ? { zIndex } : undefined),
    [zIndex],
  )

  const widthClasses = useMemo(() => {
    const widths: Record<DialogWidth, string> = {
      narrow: 'max-w-md',
      normal: 'max-w-lg',
      wide: 'w-full sm:max-w-2xl md:max-w-3xl lg:max-w-4xl',
      'extra-wide': 'w-full sm:max-w-3xl md:max-w-4xl lg:max-w-5xl xl:max-w-6xl',
      full: 'w-full sm:max-w-4xl md:max-w-5xl lg:max-w-6xl xl:max-w-7xl',
    }
    return widths[width]
  }, [width])

  const handleClose = () => {
    if (closeOnClickOutside) {
      onClose()
    }
  }

  // Prevent body scroll when modal is open and manage focus
  useEffect(() => {
    if (show) {
      previousActiveElement.current = document.activeElement as HTMLElement
      document.body.classList.add('modal-open')

      requestAnimationFrame(() => {
        if (dialogRef.current) {
          const firstFocusable = dialogRef.current.querySelector<HTMLElement>(
            'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
          )
          firstFocusable?.focus()
        }
      })
    } else {
      document.body.classList.remove('modal-open')
      if (previousActiveElement.current && typeof previousActiveElement.current.focus === 'function') {
        previousActiveElement.current.focus()
      }
      previousActiveElement.current = null
    }
  }, [show])

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (show && closeOnEscape && event.key === 'Escape') {
        onClose()
      }
    }
    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('keydown', handleEscape)
      document.body.classList.remove('modal-open')
    }
  }, [show, closeOnEscape, onClose])

  if (!mounted || !show) return null

  return createPortal(
    <div
      className="modal-overlay"
      style={zIndexStyle}
      aria-labelledby={dialogId}
      role="dialog"
      aria-modal="true"
      onClick={(e) => {
        if (e.target === e.currentTarget) handleClose()
      }}
    >
      <div
        ref={dialogRef}
        className={['modal-content', widthClasses].join(' ')}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h3 id={dialogId} className="modal-title">
            {title}
          </h3>
          <button
            onClick={onClose}
            className="-mr-2 rounded-xl p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:text-dark-500 dark:hover:bg-dark-700 dark:hover:text-dark-300"
            aria-label="Close modal"
          >
            <Icon name="x" size="md" />
          </button>
        </div>

        <div className="modal-body">{children}</div>

        {footer ? <div className="modal-footer">{footer}</div> : null}
      </div>
    </div>,
    document.body,
  )
}
