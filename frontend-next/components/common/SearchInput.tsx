'use client'

import { useCallback, useEffect, useRef, type ChangeEvent } from 'react'
import Icon from '@/components/icons/Icon'

interface SearchInputProps {
  modelValue: string
  placeholder?: string
  debounceMs?: number
  className?: string
  onUpdateModelValue?: (value: string) => void
  onSearch?: (value: string) => void
}

export default function SearchInput({
  modelValue,
  placeholder = 'Search...',
  debounceMs = 300,
  className,
  onUpdateModelValue,
  onSearch,
}: SearchInputProps) {
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [])

  const handleInput = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const value = event.target.value
      onUpdateModelValue?.(value)
      if (debounceRef.current) clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(() => {
        onSearch?.(value)
      }, debounceMs)
    },
    [debounceMs, onSearch, onUpdateModelValue],
  )

  return (
    <div className={`relative w-full${className ? ` ${className}` : ''}`}>
      <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
        <Icon name="search" size="md" className="text-gray-400" />
      </div>
      <input
        value={modelValue}
        type="text"
        className="input pl-10"
        placeholder={placeholder}
        onChange={handleInput}
      />
    </div>
  )
}
