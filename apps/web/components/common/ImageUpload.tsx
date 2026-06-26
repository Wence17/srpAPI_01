'use client'

import { useMemo, useRef, useState, type ChangeEvent } from 'react'
import Icon from '@/components/icons/Icon'
import { sanitizeSvg } from '@/lib/sanitize'

interface ImageUploadProps {
  value: string
  onChange: (value: string) => void
  mode?: 'image' | 'svg'
  size?: 'sm' | 'md'
  uploadLabel?: string
  removeLabel?: string
  hint?: string
  maxSize?: number
}

export default function ImageUpload({
  value,
  onChange,
  mode = 'image',
  size = 'md',
  uploadLabel = 'Upload',
  removeLabel = 'Remove',
  hint = '',
  maxSize = 300 * 1024,
}: ImageUploadProps) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [error, setError] = useState('')

  const acceptTypes = mode === 'svg' ? '.svg' : 'image/*'

  const sanitizedValue = useMemo(
    () => (mode === 'svg' ? sanitizeSvg(value ?? '') : ''),
    [mode, value],
  )

  const previewSizeClass = size === 'sm' ? 'h-14 w-14' : 'h-20 w-20'
  const innerSizeClass = size === 'sm' ? 'h-7 w-7' : 'h-12 w-12'
  const placeholderSizeClass = size === 'sm' ? 'h-5 w-5' : 'h-8 w-8'

  const handleUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.target
    const file = input.files?.[0]
    setError('')

    if (!file) return

    if (maxSize && file.size > maxSize) {
      setError(
        `File too large (${(file.size / 1024).toFixed(1)} KB), max ${(maxSize / 1024).toFixed(0)} KB`,
      )
      input.value = ''
      return
    }

    const reader = new FileReader()
    if (mode === 'svg') {
      reader.onload = (e) => {
        const text = e.target?.result as string
        if (text) onChange(text.trim())
      }
      reader.readAsText(file)
    } else {
      if (!file.type.startsWith('image/')) {
        setError('Please select an image file')
        input.value = ''
        return
      }
      reader.onload = (e) => {
        onChange(e.target?.result as string)
      }
      reader.readAsDataURL(file)
    }

    reader.onerror = () => {
      setError('Failed to read file')
    }
    input.value = ''
  }

  return (
    <div className="flex items-start gap-4">
      <div className="flex-shrink-0">
        <div
          className={[
            'flex items-center justify-center overflow-hidden rounded-xl border-2 border-dashed border-gray-300 bg-gray-50 dark:border-dark-600 dark:bg-dark-800',
            previewSizeClass,
            value ? 'border-solid' : '',
          ].join(' ')}
        >
          {mode === 'svg' && value ? (
            <span
              className={`text-gray-600 dark:text-gray-300 [&>svg]:h-full [&>svg]:w-full ${innerSizeClass}`}
              dangerouslySetInnerHTML={{ __html: sanitizedValue }}
            />
          ) : mode === 'image' && value ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={value} alt="" className="h-full w-full object-contain" />
          ) : (
            <svg
              className={`text-gray-400 dark:text-dark-500 ${placeholderSizeClass}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="1.5"
                d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
            </svg>
          )}
        </div>
      </div>

      <div className="flex-1 space-y-2">
        <div className="flex items-center gap-2">
          <label className="btn btn-secondary btn-sm cursor-pointer">
            <input
              ref={inputRef}
              type="file"
              accept={acceptTypes}
              className="hidden"
              onChange={handleUpload}
            />
            <Icon name="upload" size="sm" className="mr-1.5" strokeWidth={2} />
            {uploadLabel}
          </label>
          {value ? (
            <button
              type="button"
              className="btn btn-secondary btn-sm text-red-600 hover:text-red-700 dark:text-red-400"
              onClick={() => onChange('')}
            >
              <Icon name="trash" size="sm" className="mr-1.5" strokeWidth={2} />
              {removeLabel}
            </button>
          ) : null}
        </div>
        {hint ? <p className="text-xs text-gray-500 dark:text-gray-400">{hint}</p> : null}
        {error ? <p className="text-xs text-red-500">{error}</p> : null}
      </div>
    </div>
  )
}
