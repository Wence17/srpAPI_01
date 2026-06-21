'use client'

import { useRef, useState, type ClipboardEvent, type KeyboardEvent } from 'react'
import { useI18n } from '@/lib/i18n'
import Icon from '@/components/icons/Icon'
import { getPlatformTagClass } from '@/components/admin/channel/types'

interface ModelTagInputProps {
  models: string[]
  placeholder?: string
  platform?: string
  onUpdateModels: (models: string[]) => void
}

export default function ModelTagInput({
  models,
  placeholder,
  platform = '',
  onUpdateModels,
}: ModelTagInputProps) {
  const { t } = useI18n()
  const [inputValue, setInputValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const addModel = () => {
    const val = inputValue.trim()
    if (!val) return
    if (!models.includes(val)) {
      onUpdateModels([...models, val])
    }
    setInputValue('')
  }

  const removeModel = (idx: number) => {
    const next = [...models]
    next.splice(idx, 1)
    onUpdateModels(next)
  }

  const handleBackspace = (event: KeyboardEvent<HTMLInputElement>) => {
    if (inputValue === '' && models.length > 0) {
      removeModel(models.length - 1)
    }
  }

  const handlePaste = (event: ClipboardEvent<HTMLInputElement>) => {
    event.preventDefault()
    const text = event.clipboardData?.getData('text') || ''
    const items = text
      .split(/[,\n;]+/)
      .map((s) => s.trim())
      .filter(Boolean)
    if (items.length === 0) return
    const unique = [...new Set([...models, ...items])]
    onUpdateModels(unique)
    setInputValue('')
  }

  return (
    <div>
      <div className="flex min-h-[2.5rem] flex-wrap gap-1.5 rounded-lg border border-gray-200 bg-white p-2 dark:border-dark-600 dark:bg-dark-800">
        {models.map((model, idx) => (
          <span
            key={`${model}-${idx}`}
            className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-sm ${getPlatformTagClass(platform)}`}
          >
            {model}
            <button
              type="button"
              onClick={() => removeModel(idx)}
              className="ml-0.5 rounded-full p-0.5 hover:bg-primary-200 dark:hover:bg-primary-800"
            >
              <Icon name="x" size="xs" />
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          value={inputValue}
          type="text"
          className="min-w-[120px] flex-1 border-none bg-transparent text-sm outline-none placeholder:text-gray-400 dark:text-white"
          placeholder={models.length === 0 ? placeholder : ''}
          onChange={(event) => setInputValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === 'Tab') {
              event.preventDefault()
              addModel()
            }
            if (event.key === 'Backspace') {
              handleBackspace(event)
            }
          }}
          onPaste={handlePaste}
          onBlur={addModel}
        />
      </div>
      <p className="mt-1 text-xs text-gray-400">
        {t('admin.channels.form.modelInputHint', 'Press Enter to add, supports paste for batch import.')}
      </p>
    </div>
  )
}
