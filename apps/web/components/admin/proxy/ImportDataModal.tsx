'use client'

import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import { useI18n } from '@/lib/i18n'
import { useApp } from '@/context/AppContext'
import { adminProxiesAPI } from '@/lib/adminProxies'
import BaseDialog from '@/components/common/BaseDialog'
import type { AdminDataImportResult } from '@/lib/types'

interface ImportDataModalProps {
  show: boolean
  onClose: () => void
  onImported?: () => void
}

async function readFileAsText(sourceFile: File): Promise<string> {
  if (typeof sourceFile.text === 'function') {
    return sourceFile.text()
  }

  if (typeof sourceFile.arrayBuffer === 'function') {
    const buffer = await sourceFile.arrayBuffer()
    return new TextDecoder().decode(buffer)
  }

  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.onerror = () => reject(reader.error || new Error('Failed to read file'))
    reader.readAsText(sourceFile)
  })
}

export default function ImportDataModal({ show, onClose, onImported }: ImportDataModalProps) {
  const { t } = useI18n()
  const appStore = useApp()
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [importing, setImporting] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [result, setResult] = useState<AdminDataImportResult | null>(null)

  const fileName = file?.name || ''
  const errorItems = result?.errors || []

  useEffect(() => {
    if (show) {
      setFile(null)
      setResult(null)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }, [show])

  const openFilePicker = () => {
    fileInputRef.current?.click()
  }

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    setFile(event.target.files?.[0] || null)
  }

  const handleClose = () => {
    if (importing) return
    onClose()
  }

  const handleImport = async (event: FormEvent) => {
    event.preventDefault()

    if (!file) {
      appStore.showError(t('admin.proxies.dataImportSelectFile'))
      return
    }

    setImporting(true)
    try {
      const text = await readFileAsText(file)
      const dataPayload = JSON.parse(text)

      const res = await adminProxiesAPI.importData({ data: dataPayload })

      setResult(res)

      const msgParams: Record<string, unknown> = {
        proxy_created: res.proxy_created,
        proxy_reused: res.proxy_reused,
        proxy_failed: res.proxy_failed,
      }

      if (res.proxy_failed > 0) {
        appStore.showError(t('admin.proxies.dataImportCompletedWithErrors', msgParams))
      } else {
        appStore.showSuccess(t('admin.proxies.dataImportSuccess', msgParams))
        onImported?.()
      }
    } catch (error: unknown) {
      if (error instanceof SyntaxError) {
        appStore.showError(t('admin.proxies.dataImportParseFailed'))
      } else {
        appStore.showError(
          (error as Error)?.message || t('admin.proxies.dataImportFailed'),
        )
      }
    } finally {
      setImporting(false)
    }
  }

  return (
    <BaseDialog
      show={show}
      title={t('admin.proxies.dataImportTitle')}
      width="normal"
      closeOnClickOutside
      onClose={handleClose}
      footer={
        <div className="flex justify-end gap-3">
          <button className="btn btn-secondary" type="button" disabled={importing} onClick={handleClose}>
            {t('common.cancel')}
          </button>
          <button
            className="btn btn-primary"
            type="submit"
            form="import-proxy-data-form"
            disabled={importing}
          >
            {importing ? t('admin.proxies.dataImporting') : t('admin.proxies.dataImportButton')}
          </button>
        </div>
      }
    >
      <form id="import-proxy-data-form" className="space-y-4" onSubmit={handleImport}>
        <div className="text-sm text-gray-600 dark:text-dark-300">
          {t('admin.proxies.dataImportHint')}
        </div>
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-600 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-400">
          {t('admin.proxies.dataImportWarning')}
        </div>

        <div>
          <label className="input-label">{t('admin.proxies.dataImportFile')}</label>
          <div className="flex items-center justify-between gap-3 rounded-lg border border-dashed border-gray-300 bg-gray-50 px-4 py-3 dark:border-dark-600 dark:bg-dark-800">
            <div className="min-w-0">
              <div className="truncate text-sm text-gray-700 dark:text-dark-200">
                {fileName || t('admin.proxies.dataImportSelectFile')}
              </div>
              <div className="text-xs text-gray-500 dark:text-dark-400">JSON (.json)</div>
            </div>
            <button type="button" className="btn btn-secondary shrink-0" onClick={openFilePicker}>
              {t('common.chooseFile')}
            </button>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            accept="application/json,.json"
            onChange={handleFileChange}
          />
        </div>

        {result ? (
          <div className="space-y-2 rounded-xl border border-gray-200 p-4 dark:border-dark-700">
            <div className="text-sm font-medium text-gray-900 dark:text-white">
              {t('admin.proxies.dataImportResult')}
            </div>
            <div className="text-sm text-gray-700 dark:text-dark-300">
              {t('admin.proxies.dataImportResultSummary', { ...result })}
            </div>

            {errorItems.length > 0 ? (
              <div className="mt-2">
                <div className="text-sm font-medium text-red-600 dark:text-red-400">
                  {t('admin.proxies.dataImportErrors')}
                </div>
                <div className="mt-2 max-h-48 overflow-auto rounded-lg bg-gray-50 p-3 font-mono text-xs dark:bg-dark-800">
                  {errorItems.map((item, idx) => (
                    <div key={idx} className="whitespace-pre-wrap">
                      {item.kind} {item.name || item.proxy_key || '-'} — {item.message}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </form>
    </BaseDialog>
  )
}
