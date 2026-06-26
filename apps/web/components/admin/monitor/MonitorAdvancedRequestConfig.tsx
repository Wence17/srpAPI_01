'use client'

import { useEffect, useMemo, useState } from 'react'
import { useI18n } from '@/lib/i18n'
import type { APIMode, BodyOverrideMode, Provider } from '@/lib/adminChannelMonitor'
import { API_MODE_RESPONSES, PROVIDER_OPENAI } from '@/lib/channelMonitorConstants'

interface HeaderRow {
  name: string
  value: string
}

interface MonitorAdvancedRequestConfigProps {
  provider?: Provider
  apiMode?: APIMode
  extraHeaders: Record<string, string>
  bodyOverrideMode: BodyOverrideMode
  bodyOverride: Record<string, unknown> | null
  onUpdateExtraHeaders: (value: Record<string, string>) => void
  onUpdateBodyOverrideMode: (value: BodyOverrideMode) => void
  onUpdateBodyOverride: (value: Record<string, unknown> | null) => void
}

function toRows(headers: Record<string, string>): HeaderRow[] {
  const entries = Object.entries(headers || {})
  if (entries.length === 0) return [{ name: '', value: '' }]
  return entries.map(([name, value]) => ({ name, value }))
}

function toMap(rows: HeaderRow[]): Record<string, string> {
  const out: Record<string, string> = {}
  for (const row of rows) {
    const name = row.name.trim()
    if (name === '') continue
    out[name] = row.value
  }
  return out
}

function isSameHeaderMap(a: Record<string, string>, b: Record<string, string>): boolean {
  const ak = Object.keys(a)
  const bk = Object.keys(b || {})
  if (ak.length !== bk.length) return false
  for (const k of ak) {
    if (a[k] !== b[k]) return false
  }
  return true
}

function serializeBody(body: Record<string, unknown> | null): string {
  if (!body || Object.keys(body).length === 0) return ''
  return JSON.stringify(body, null, 2)
}

export default function MonitorAdvancedRequestConfig({
  provider,
  apiMode,
  extraHeaders,
  bodyOverrideMode,
  bodyOverride,
  onUpdateExtraHeaders,
  onUpdateBodyOverrideMode,
  onUpdateBodyOverride,
}: MonitorAdvancedRequestConfigProps) {
  const { t } = useI18n()
  const [headerRows, setHeaderRows] = useState<HeaderRow[]>(() => toRows(extraHeaders))
  const [headersError, setHeadersError] = useState('')
  const [bodyText, setBodyText] = useState(() => serializeBody(bodyOverride))
  const [bodyError, setBodyError] = useState('')

  useEffect(() => {
    if (!isSameHeaderMap(toMap(headerRows), extraHeaders)) {
      setHeaderRows(toRows(extraHeaders))
    }
    setHeadersError('')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [extraHeaders])

  useEffect(() => {
    setBodyText(serializeBody(bodyOverride))
    setBodyError('')
  }, [bodyOverride])

  const commitHeaders = (rows: HeaderRow[]) => {
    for (const row of rows) {
      const name = row.name.trim()
      if (name === '') continue
      if (name.includes(':') || /\s/.test(name)) {
        setHeadersError(t('admin.channelMonitor.advanced.headerNameInvalid', { name }))
        return
      }
    }
    setHeadersError('')
    onUpdateExtraHeaders(toMap(rows))
  }

  const addRow = () => {
    setHeaderRows((prev) => [...prev, { name: '', value: '' }])
  }

  const removeRow = (index: number) => {
    setHeaderRows((prev) => {
      const next = [...prev]
      next.splice(index, 1)
      if (next.length === 0) next.push({ name: '', value: '' })
      commitHeaders(next)
      return next
    })
  }

  const updateHeaderRow = (index: number, field: 'name' | 'value', value: string) => {
    setHeaderRows((prev) => {
      const next = [...prev]
      next[index] = { ...next[index], [field]: value }
      return next
    })
  }

  const commitBody = () => {
    if (bodyOverrideMode === 'off') return
    const trimmed = bodyText.trim()
    if (trimmed === '') {
      onUpdateBodyOverride(null)
      setBodyError('')
      return
    }
    try {
      const parsed = JSON.parse(trimmed)
      if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
        setBodyError(t('admin.channelMonitor.advanced.bodyJsonObjectError'))
        return
      }
      onUpdateBodyOverride(parsed as Record<string, unknown>)
      setBodyError('')
    } catch (error) {
      setBodyError(
        `${t('admin.channelMonitor.advanced.bodyJsonError')}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      )
    }
  }

  const formatBody = () => {
    const trimmed = bodyText.trim()
    if (trimmed === '') return
    try {
      const parsed = JSON.parse(trimmed)
      setBodyText(JSON.stringify(parsed, null, 2))
      setBodyError('')
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        onUpdateBodyOverride(parsed as Record<string, unknown>)
      }
    } catch (error) {
      setBodyError(
        `${t('admin.channelMonitor.advanced.bodyJsonError')}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      )
    }
  }

  const updateBodyMode = (mode: BodyOverrideMode) => {
    onUpdateBodyOverrideMode(mode)
    if (mode === 'off') {
      onUpdateBodyOverride(null)
    }
  }

  const bodyModeOptions = useMemo(
    () => [
      { value: 'off' as BodyOverrideMode, label: t('admin.channelMonitor.advanced.bodyModeOff') },
      { value: 'merge' as BodyOverrideMode, label: t('admin.channelMonitor.advanced.bodyModeMerge') },
      {
        value: 'replace' as BodyOverrideMode,
        label: t('admin.channelMonitor.advanced.bodyModeReplace'),
      },
    ],
    [t],
  )

  const bodyModeHint = useMemo(() => {
    switch (bodyOverrideMode) {
      case 'merge':
        return t('admin.channelMonitor.advanced.bodyModeHintMerge')
      case 'replace':
        return t('admin.channelMonitor.advanced.bodyModeHintReplace')
      default:
        return t('admin.channelMonitor.advanced.bodyModeHintOff')
    }
  }, [bodyOverrideMode, t])

  const bodyPlaceholder = useMemo(() => {
    if (provider === PROVIDER_OPENAI && apiMode === API_MODE_RESPONSES) {
      if (bodyOverrideMode === 'merge') {
        return '{\n  "max_output_tokens": 20\n}'
      }
      return '{\n  "model": "gpt-4o-mini",\n  "instructions": "You are a health check endpoint. Reply briefly.",\n  "input": "Reply with exactly: ok",\n  "max_output_tokens": 20,\n  "stream": false\n}'
    }
    if (provider === PROVIDER_OPENAI) {
      if (bodyOverrideMode === 'merge') {
        return '{\n  "max_tokens": 20\n}'
      }
      return '{\n  "model": "gpt-4o-mini",\n  "messages": [{"role":"user","content":"Reply with exactly: ok"}],\n  "max_tokens": 20,\n  "stream": false\n}'
    }
    if (bodyOverrideMode === 'merge') {
      return '{\n  "system": "You are Claude Code..."\n}'
    }
    return '{\n  "model": "claude-x",\n  "messages": [{"role":"user","content":"hi"}],\n  "max_tokens": 10\n}'
  }, [provider, apiMode, bodyOverrideMode])

  const bodyModeButtonClass = (mode: BodyOverrideMode): string => {
    const active = bodyOverrideMode === mode
    if (active) {
      return 'border-primary-500 bg-primary-50 text-primary-700 dark:bg-primary-500/15 dark:text-primary-300 dark:border-primary-400'
    }
    return 'border-gray-200 bg-white text-gray-600 hover:border-primary-300 dark:border-dark-700 dark:bg-dark-800 dark:text-gray-400'
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="input-label">{t('admin.channelMonitor.advanced.headers')}</label>
        <div className="space-y-1.5">
          {headerRows.map((row, index) => (
            <div key={index} className="flex items-center gap-2">
              <input
                value={row.name}
                type="text"
                spellCheck={false}
                placeholder={t('admin.channelMonitor.advanced.headerNamePlaceholder')}
                className="input w-52 flex-none font-mono text-xs"
                onChange={(event) => updateHeaderRow(index, 'name', event.target.value)}
                onBlur={() => commitHeaders(headerRows)}
              />
              <input
                value={row.value}
                type="text"
                spellCheck={false}
                placeholder={t('admin.channelMonitor.advanced.headerValuePlaceholder')}
                className="input flex-1 font-mono text-xs"
                onChange={(event) => updateHeaderRow(index, 'value', event.target.value)}
                onBlur={() => commitHeaders(headerRows)}
              />
              <button
                type="button"
                className="flex-none rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10 dark:hover:text-red-400"
                title={t('common.delete')}
                onClick={() => removeRow(index)}
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          ))}
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded border border-dashed border-gray-300 px-2 py-1 text-xs text-gray-500 hover:border-primary-400 hover:text-primary-600 dark:border-dark-600 dark:text-gray-400 dark:hover:border-primary-500 dark:hover:text-primary-400"
            onClick={addRow}
          >
            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
            </svg>
            {t('admin.channelMonitor.advanced.headerAddRow')}
          </button>
        </div>
        {headersError ? (
          <p className="mt-1 text-xs text-red-500">{headersError}</p>
        ) : (
          <p className="mt-1 text-xs text-gray-400">{t('admin.channelMonitor.advanced.headersHint')}</p>
        )}
      </div>

      <div>
        <label className="input-label">{t('admin.channelMonitor.advanced.bodyMode')}</label>
        <div className="grid grid-cols-3 gap-3">
          {bodyModeOptions.map((opt) => (
            <button
              key={opt.value}
              type="button"
              className={`rounded-lg border-2 px-3 py-2 text-sm font-medium transition-colors ${bodyModeButtonClass(opt.value)}`}
              onClick={() => updateBodyMode(opt.value)}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <p className="mt-1 text-xs text-gray-400">{bodyModeHint}</p>
      </div>

      {bodyOverrideMode !== 'off' ? (
        <div>
          <div className="mb-1 flex items-center justify-between">
            <label className="input-label !mb-0">{t('admin.channelMonitor.advanced.bodyJson')}</label>
            <button
              type="button"
              className="text-xs text-primary-600 hover:underline disabled:cursor-not-allowed disabled:text-gray-400 disabled:no-underline dark:text-primary-400"
              disabled={!bodyText.trim()}
              onClick={formatBody}
            >
              {t('admin.channelMonitor.advanced.bodyJsonFormat')}
            </button>
          </div>
          <textarea
            value={bodyText}
            rows={10}
            placeholder={bodyPlaceholder}
            className="input font-mono text-xs"
            style={{ whiteSpace: 'pre', overflowWrap: 'normal', overflowX: 'auto' }}
            spellCheck={false}
            onChange={(event) => setBodyText(event.target.value)}
            onBlur={commitBody}
          />
          {bodyError ? (
            <p className="mt-1 text-xs text-red-500">{bodyError}</p>
          ) : (
            <p className="mt-1 text-xs text-gray-400">{t('admin.channelMonitor.advanced.bodyJsonHint')}</p>
          )}
        </div>
      ) : null}
    </div>
  )
}
