'use client'

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import { useI18n } from '@/lib/i18n/I18nProvider'
import Icon from '@/components/icons/Icon'

export interface SelectOption {
  value: string | number | boolean | null
  label: string
  disabled?: boolean
  [key: string]: unknown
}

type SelectValue = string | number | boolean | null

interface SelectProps {
  modelValue: SelectValue | undefined
  options: SelectOption[] | Array<Record<string, unknown>>
  placeholder?: string
  disabled?: boolean
  error?: boolean
  searchable?: boolean | 'auto'
  searchPlaceholder?: string
  emptyText?: string
  valueKey?: string
  labelKey?: string
  creatable?: boolean
  creatablePrefix?: string
  clearable?: boolean
  className?: string
  onUpdateModelValue?: (value: SelectValue) => void
  onChange?: (value: SelectValue, option: SelectOption | null) => void
  renderSelected?: (option: any) => ReactNode
  renderOption?: (option: any, selected: boolean) => ReactNode
}

export default function Select({
  modelValue,
  options,
  placeholder,
  disabled = false,
  error = false,
  searchable = 'auto',
  searchPlaceholder,
  emptyText,
  valueKey = 'value',
  labelKey = 'label',
  creatable = false,
  creatablePrefix = '',
  clearable = false,
  className,
  onUpdateModelValue,
  onChange,
  renderSelected,
  renderOption,
}: SelectProps) {
  const { t } = useI18n()

  // Instance ID for unique click-outside detection
  const instanceId = useMemo(() => `select-${Math.random().toString(36).substring(2, 9)}`, [])

  const [isOpen, setIsOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [focusedIndex, setFocusedIndex] = useState(-1)
  const [dropdownPosition, setDropdownPosition] = useState<'bottom' | 'top'>('bottom')
  const [triggerRect, setTriggerRect] = useState<DOMRect | null>(null)
  const [mounted, setMounted] = useState(false)

  const containerRef = useRef<HTMLDivElement | null>(null)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const searchInputRef = useRef<HTMLInputElement | null>(null)
  const dropdownRef = useRef<HTMLDivElement | null>(null)
  const optionsListRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => setMounted(true), [])

  const placeholderText = placeholder ?? t('common.selectOption')
  const searchPlaceholderTextValue = searchPlaceholder ?? t('common.searchPlaceholder')
  const emptyTextDisplay = emptyText ?? t('common.noOptionsFound')

  const isSearchable = useMemo(() => {
    if (searchable === 'auto') return options.length > 5
    return searchable
  }, [searchable, options.length])

  const getOptionValue = useCallback(
    (option: any): any => {
      if (typeof option === 'object' && option !== null) {
        return option[valueKey]
      }
      return option
    },
    [valueKey],
  )

  const getOptionLabel = useCallback(
    (option: any): string => {
      if (typeof option === 'object' && option !== null) {
        return String(option[labelKey] ?? '')
      }
      return String(option ?? '')
    },
    [labelKey],
  )

  const isOptionDisabled = useCallback((option: any): boolean => {
    if (typeof option === 'object' && option !== null) {
      return !!option.disabled
    }
    return false
  }, [])

  const isGroupHeaderOption = useCallback((option: any): boolean => {
    if (typeof option === 'object' && option !== null) {
      return option.kind === 'group'
    }
    return false
  }, [])

  const selectedOption = useMemo(
    () => options.find((opt) => getOptionValue(opt) === modelValue) || null,
    [options, getOptionValue, modelValue],
  )

  const selectedLabel = useMemo(() => {
    if (selectedOption) {
      return getOptionLabel(selectedOption)
    }
    if (creatable && modelValue) {
      return String(modelValue)
    }
    return placeholderText
  }, [selectedOption, getOptionLabel, creatable, modelValue, placeholderText])

  const hasValue = modelValue !== null && modelValue !== undefined && modelValue !== ''

  const filteredOptions = useMemo(() => {
    let opts = options as any[]
    if (isSearchable && searchQuery) {
      const query = searchQuery.toLowerCase()
      opts = opts.filter((opt) => {
        if (getOptionLabel(opt).toLowerCase().includes(query)) return true
        if (opt.description && String(opt.description).toLowerCase().includes(query)) return true
        return false
      })
      if (creatable && searchQuery.trim()) {
        const trimmed = searchQuery.trim()
        const prefix = creatablePrefix || t('common.search')
        opts = [
          { [valueKey]: trimmed, [labelKey]: `${prefix} "${trimmed}"`, _creatable: true },
          ...opts,
        ]
      }
    }
    return opts
  }, [options, isSearchable, searchQuery, getOptionLabel, creatable, creatablePrefix, valueKey, labelKey, t])

  const isSelected = useCallback(
    (option: any): boolean => getOptionValue(option) === modelValue,
    [getOptionValue, modelValue],
  )

  const findNextEnabledIndex = useCallback(
    (startIndex: number): number => {
      const opts = filteredOptions
      if (opts.length === 0) return -1
      for (let offset = 0; offset < opts.length; offset++) {
        const idx = (startIndex + offset) % opts.length
        if (!isOptionDisabled(opts[idx])) return idx
      }
      return -1
    },
    [filteredOptions, isOptionDisabled],
  )

  const findPrevEnabledIndex = useCallback(
    (startIndex: number): number => {
      const opts = filteredOptions
      if (opts.length === 0) return -1
      for (let offset = 0; offset < opts.length; offset++) {
        const idx = (startIndex - offset + opts.length) % opts.length
        if (!isOptionDisabled(opts[idx])) return idx
      }
      return -1
    },
    [filteredOptions, isOptionDisabled],
  )

  const handleOptionMouseEnter = (option: any, index: number) => {
    if (isOptionDisabled(option) || isGroupHeaderOption(option)) return
    setFocusedIndex(index)
  }

  const updateTriggerRect = useCallback(() => {
    if (containerRef.current) {
      setTriggerRect(containerRef.current.getBoundingClientRect())
    }
  }, [])

  const calculateDropdownPosition = useCallback(() => {
    if (!containerRef.current) return
    updateTriggerRect()

    requestAnimationFrame(() => {
      if (!dropdownRef.current || !containerRef.current) return
      const rect = containerRef.current.getBoundingClientRect()
      const dropdownHeight = dropdownRef.current.offsetHeight || 240
      const spaceBelow = window.innerHeight - rect.bottom
      const spaceAbove = rect.top

      if (spaceBelow < dropdownHeight && spaceAbove > dropdownHeight) {
        setDropdownPosition('top')
      } else {
        setDropdownPosition('bottom')
      }
    })
  }, [updateTriggerRect])

  const toggle = () => {
    if (disabled) return
    setIsOpen((open) => !open)
  }

  const scrollToFocused = useCallback((index: number) => {
    requestAnimationFrame(() => {
      const list = optionsListRef.current
      if (!list) return
      const focusedEl = list.children[index] as HTMLElement | undefined
      if (!focusedEl) return

      if (focusedEl.offsetTop < list.scrollTop) {
        list.scrollTop = focusedEl.offsetTop
      } else if (focusedEl.offsetTop + focusedEl.offsetHeight > list.scrollTop + list.offsetHeight) {
        list.scrollTop = focusedEl.offsetTop + focusedEl.offsetHeight - list.offsetHeight
      }
    })
  }, [])

  const selectOption = useCallback(
    (option: any) => {
      const value = (getOptionValue(option) ?? null) as SelectValue
      onUpdateModelValue?.(value)
      onChange?.(value, option)
      setIsOpen(false)
      triggerRef.current?.focus()
    },
    [getOptionValue, onUpdateModelValue, onChange],
  )

  const clearSelection = useCallback(() => {
    if (disabled) return
    onUpdateModelValue?.(null)
    onChange?.(null, null)
  }, [disabled, onUpdateModelValue, onChange])

  const onTriggerKeyDown = (e: ReactKeyboardEvent) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      if (!isOpen) setIsOpen(true)
    }
  }

  const onDropdownKeyDown = (e: ReactKeyboardEvent) => {
    switch (e.key) {
      case 'ArrowDown': {
        e.preventDefault()
        const next = findNextEnabledIndex(focusedIndex + 1)
        setFocusedIndex(next)
        if (next >= 0) scrollToFocused(next)
        break
      }
      case 'ArrowUp': {
        e.preventDefault()
        const prev = findPrevEnabledIndex(focusedIndex - 1)
        setFocusedIndex(prev)
        if (prev >= 0) scrollToFocused(prev)
        break
      }
      case 'Enter':
        e.preventDefault()
        if (focusedIndex >= 0 && focusedIndex < filteredOptions.length) {
          const opt = filteredOptions[focusedIndex]
          if (!isOptionDisabled(opt)) selectOption(opt)
        }
        break
      case 'Escape':
        e.preventDefault()
        setIsOpen(false)
        triggerRef.current?.focus()
        break
      case 'Tab':
        setIsOpen(false)
        break
    }
  }

  // Open/close side effects (mirrors the Vue watch on isOpen)
  useEffect(() => {
    if (isOpen) {
      calculateDropdownPosition()
      if (filteredOptions.length === 0) {
        setFocusedIndex(-1)
      } else {
        const selectedIdx = filteredOptions.findIndex(isSelected)
        const initialIdx = selectedIdx >= 0 ? selectedIdx : 0
        setFocusedIndex(
          isOptionDisabled(filteredOptions[initialIdx])
            ? findNextEnabledIndex(initialIdx + 1)
            : initialIdx,
        )
      }

      if (isSearchable) {
        requestAnimationFrame(() => searchInputRef.current?.focus())
      }

      window.addEventListener('scroll', updateTriggerRect, { capture: true, passive: true })
      window.addEventListener('resize', calculateDropdownPosition)

      return () => {
        window.removeEventListener('scroll', updateTriggerRect, { capture: true })
        window.removeEventListener('resize', calculateDropdownPosition)
      }
    } else {
      setSearchQuery('')
      setFocusedIndex(-1)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen])

  // Click-outside detection scoped to this instance
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement
      const isInDropdown = !!target.closest(`.${instanceId}`)
      const isInTrigger = containerRef.current?.contains(target)
      if (!isInDropdown && !isInTrigger && isOpen) {
        setIsOpen(false)
      }
    }
    document.addEventListener('click', handleClickOutside)
    return () => document.removeEventListener('click', handleClickOutside)
  }, [instanceId, isOpen])

  const dropdownStyle = useMemo<CSSProperties>(() => {
    if (!triggerRect) return {}
    const style: CSSProperties = {
      position: 'fixed',
      left: `${triggerRect.left}px`,
      minWidth: `${triggerRect.width}px`,
      zIndex: 100000020,
    }
    if (dropdownPosition === 'top') {
      style.bottom = `${window.innerHeight - triggerRect.top + 4}px`
    } else {
      style.top = `${triggerRect.bottom + 4}px`
    }
    return style
  }, [triggerRect, dropdownPosition])

  return (
    <div className={['relative', className].filter(Boolean).join(' ')} ref={containerRef}>
      <button
        ref={triggerRef}
        type="button"
        onClick={toggle}
        disabled={disabled}
        aria-expanded={isOpen}
        aria-haspopup={true}
        aria-label="Select option"
        className={[
          'select-trigger',
          isOpen ? 'select-trigger-open' : '',
          error ? 'select-trigger-error' : '',
          disabled ? 'select-trigger-disabled' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        onKeyDown={onTriggerKeyDown}
      >
        <span className="select-value">
          {renderSelected ? renderSelected(selectedOption) : selectedLabel}
        </span>
        {clearable && hasValue && !disabled ? (
          <span
            className="select-clear"
            role="button"
            tabIndex={-1}
            aria-label="Clear selection"
            onClick={(e) => {
              e.stopPropagation()
              clearSelection()
            }}
            onMouseDown={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.stopPropagation()
                e.preventDefault()
                clearSelection()
              }
            }}
          >
            <Icon name="x" size="sm" />
          </span>
        ) : null}
        <span className="select-icon">
          <Icon
            name="chevronDown"
            size="md"
            className={`transition-transform duration-200${isOpen ? ' rotate-180' : ''}`}
          />
        </span>
      </button>

      {mounted && isOpen
        ? createPortal(
            <div
              ref={dropdownRef}
              className={`select-dropdown-portal ${instanceId}`}
              style={dropdownStyle}
              role="listbox"
              onClick={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
              onKeyDown={onDropdownKeyDown}
            >
              {isSearchable ? (
                <div className="select-search">
                  <Icon name="search" size="sm" className="text-gray-400" />
                  <input
                    ref={searchInputRef}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    type="text"
                    placeholder={searchPlaceholderTextValue}
                    className="select-search-input"
                    onClick={(e) => e.stopPropagation()}
                  />
                </div>
              ) : null}

              <div className="select-options" ref={optionsListRef}>
                {filteredOptions.map((option, index) => {
                  const optKey = `${typeof getOptionValue(option)}:${String(getOptionValue(option) ?? '')}`
                  const selected = isSelected(option)
                  return (
                    <div
                      key={optKey}
                      role="option"
                      aria-selected={selected}
                      aria-disabled={isOptionDisabled(option)}
                      onClick={(e) => {
                        e.stopPropagation()
                        if (!isOptionDisabled(option)) selectOption(option)
                      }}
                      onMouseEnter={() => handleOptionMouseEnter(option, index)}
                      className={[
                        'select-option',
                        isGroupHeaderOption(option) ? 'select-option-group' : '',
                        selected ? 'select-option-selected' : '',
                        isOptionDisabled(option) && !isGroupHeaderOption(option)
                          ? 'select-option-disabled'
                          : '',
                        focusedIndex === index && !isGroupHeaderOption(option)
                          ? 'select-option-focused'
                          : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                    >
                      {renderOption ? (
                        renderOption(option, selected)
                      ) : (
                        <>
                          {option._creatable ? (
                            <Icon name="search" size="sm" className="flex-shrink-0 text-gray-400" />
                          ) : null}
                          <span
                            className={`select-option-label${option._creatable ? ' italic text-gray-500 dark:text-dark-300' : ''}`}
                          >
                            {getOptionLabel(option)}
                          </span>
                          {selected ? (
                            <Icon name="check" size="sm" className="text-primary-500" strokeWidth={2} />
                          ) : null}
                        </>
                      )}
                    </div>
                  )
                })}

                {filteredOptions.length === 0 ? (
                  <div className="select-empty">{emptyTextDisplay}</div>
                ) : null}
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  )
}
