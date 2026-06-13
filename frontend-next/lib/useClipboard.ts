'use client'

import { useCallback, useState } from 'react'
import { useApp } from '@/context/AppContext'
import { useI18n } from '@/lib/i18n'

function isClipboardSupported(): boolean {
  return !!(navigator.clipboard && window.isSecureContext)
}

function fallbackCopy(text: string): boolean {
  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.style.cssText = 'position:fixed;left:-9999px;top:-9999px'
  document.body.appendChild(textarea)
  textarea.select()
  try {
    return document.execCommand('copy')
  } finally {
    document.body.removeChild(textarea)
  }
}

export function useClipboard() {
  const appStore = useApp()
  const { t } = useI18n()
  const [copied, setCopied] = useState(false)

  const copyToClipboard = useCallback(
    async (text: string, successMessage?: string): Promise<boolean> => {
      if (!text) return false

      let success = false

      if (isClipboardSupported()) {
        try {
          await navigator.clipboard.writeText(text)
          success = true
        } catch {
          success = fallbackCopy(text)
        }
      } else {
        success = fallbackCopy(text)
      }

      if (success) {
        setCopied(true)
        appStore.showSuccess(successMessage || t('common.copiedToClipboard'))
        setTimeout(() => setCopied(false), 2000)
      } else {
        appStore.showError(t('common.copyFailed'))
      }

      return success
    },
    [appStore, t],
  )

  return { copied, copyToClipboard }
}
