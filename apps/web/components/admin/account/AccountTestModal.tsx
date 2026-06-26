'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useI18n } from '@/lib/i18n'
import { useClipboard } from '@/lib/useClipboard'
import { adminAccountsAPI } from '@/lib/adminAccounts'
import BaseDialog from '@/components/common/BaseDialog'
import Select from '@/components/common/Select'
import Icon from '@/components/icons/Icon'
import type { Account, ClaudeModel } from '@/lib/types'

interface OutputLine {
  text: string
  class: string
}

interface PreviewImage {
  url: string
  mimeType?: string
}

interface AccountTestModalProps {
  show: boolean
  account: Account | null
  onClose: () => void
}

type TestStatus = 'idle' | 'connecting' | 'success' | 'error'

const PRIORITIZED_GEMINI_MODELS = [
  'gemini-3.1-flash-image',
  'gemini-2.5-flash-image',
  'gemini-3.5-flash',
  'gemini-2.5-flash',
  'gemini-2.5-pro',
  'gemini-3-flash-preview',
  'gemini-3-pro-preview',
  'gemini-2.0-flash',
]

function sortTestModels(models: ClaudeModel[]): ClaudeModel[] {
  const priorityMap = new Map(PRIORITIZED_GEMINI_MODELS.map((id, index) => [id, index]))
  return [...models].sort((a, b) => {
    const aPriority = priorityMap.get(a.id) ?? Number.MAX_SAFE_INTEGER
    const bPriority = priorityMap.get(b.id) ?? Number.MAX_SAFE_INTEGER
    return aPriority - bPriority
  })
}

export default function AccountTestModal({ show, account, onClose }: AccountTestModalProps) {
  const { t } = useI18n()
  const { copyToClipboard } = useClipboard()
  const terminalRef = useRef<HTMLDivElement | null>(null)
  const abortControllerRef = useRef<AbortController | null>(null)

  const [status, setStatus] = useState<TestStatus>('idle')
  const [outputLines, setOutputLines] = useState<OutputLine[]>([])
  const [streamingContent, setStreamingContent] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [availableModels, setAvailableModels] = useState<ClaudeModel[]>([])
  const [selectedModelId, setSelectedModelId] = useState('')
  const [testPrompt, setTestPrompt] = useState('')
  const [loadingModels, setLoadingModels] = useState(false)
  const [generatedImages, setGeneratedImages] = useState<PreviewImage[]>([])
  const [previewImageUrl, setPreviewImageUrl] = useState('')
  const [mounted, setMounted] = useState(false)

  useEffect(() => setMounted(true), [])

  const supportsGeminiImageTest = useMemo(() => {
    const modelID = selectedModelId.toLowerCase()
    if (!modelID.startsWith('gemini-') || !modelID.includes('-image')) return false
    return (
      account?.platform === 'gemini' ||
      (account?.platform === 'antigravity' && account?.type === 'apikey')
    )
  }, [account, selectedModelId])

  const supportsOpenAIImageTest = useMemo(() => {
    const modelID = selectedModelId.toLowerCase()
    if (!modelID.startsWith('gpt-image-')) return false
    return account?.platform === 'openai'
  }, [account, selectedModelId])

  const supportsImageTest = supportsGeminiImageTest || supportsOpenAIImageTest

  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      if (terminalRef.current) {
        terminalRef.current.scrollTop = terminalRef.current.scrollHeight
      }
    })
  }, [])

  const addLine = useCallback(
    (text: string, className = 'text-gray-300') => {
      setOutputLines((prev) => [...prev, { text, class: className }])
      scrollToBottom()
    },
    [scrollToBottom],
  )

  const abortStream = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
    }
  }, [])

  const resetState = useCallback(() => {
    setStatus('idle')
    setOutputLines([])
    setStreamingContent('')
    setErrorMessage('')
    setGeneratedImages([])
    setPreviewImageUrl('')
  }, [])

  const loadAvailableModels = useCallback(async () => {
    if (!account) return

    setLoadingModels(true)
    setSelectedModelId('')
    try {
      const models = await adminAccountsAPI.getAvailableModels(account.id)
      const sorted =
        account.platform === 'gemini' || account.platform === 'antigravity'
          ? sortTestModels(models)
          : models
      setAvailableModels(sorted)
      if (sorted.length > 0) {
        if (account.platform === 'gemini') {
          setSelectedModelId(sorted[0].id)
        } else {
          const sonnetModel = sorted.find((m) => m.id.includes('sonnet'))
          setSelectedModelId(sonnetModel?.id || sorted[0].id)
        }
      }
    } catch (error) {
      console.error('Failed to load available models:', error)
      setAvailableModels([])
      setSelectedModelId('')
    } finally {
      setLoadingModels(false)
    }
  }, [account])

  useEffect(() => {
    if (show && account) {
      setTestPrompt('')
      resetState()
      void loadAvailableModels()
    } else {
      abortStream()
    }
  }, [show, account, resetState, loadAvailableModels, abortStream])

  useEffect(() => {
    if (supportsImageTest && !testPrompt.trim()) {
      setTestPrompt(t('admin.accounts.imagePromptDefault'))
    }
  }, [selectedModelId, supportsImageTest, testPrompt, t])

  const handleEvent = useCallback(
    (event: {
      type: string
      text?: string
      model?: string
      success?: boolean
      error?: string
      image_url?: string
      mime_type?: string
    }) => {
      switch (event.type) {
        case 'test_start':
          addLine(t('admin.accounts.connectedToApi'), 'text-green-400')
          if (event.model) {
            addLine(t('admin.accounts.usingModel', { model: event.model }), 'text-cyan-400')
          }
          addLine(
            supportsImageTest
              ? t('admin.accounts.sendingImageRequest')
              : t('admin.accounts.sendingTestMessage'),
            'text-gray-400',
          )
          addLine('', 'text-gray-300')
          addLine(t('admin.accounts.response'), 'text-yellow-400')
          break

        case 'content':
          if (event.text) {
            setStreamingContent((prev) => prev + event.text)
            scrollToBottom()
          }
          break

        case 'image':
          if (event.image_url) {
            setGeneratedImages((prev) => {
              const next = [...prev, { url: event.image_url!, mimeType: event.mime_type }]
              addLine(
                t('admin.accounts.imageReceived', { count: next.length }),
                'text-purple-300',
              )
              return next
            })
          }
          break

        case 'test_complete':
          setStreamingContent((prev) => {
            if (prev) addLine(prev, 'text-green-300')
            return ''
          })
          if (event.success) {
            setStatus('success')
          } else {
            setStatus('error')
            setErrorMessage(event.error || 'Test failed')
          }
          break

        case 'error':
          setStatus('error')
          setErrorMessage(event.error || 'Unknown error')
          setStreamingContent((prev) => {
            if (prev) addLine(prev, 'text-green-300')
            return ''
          })
          break
      }
    },
    [addLine, scrollToBottom, supportsImageTest, t],
  )

  const startTest = async () => {
    if (!account || !selectedModelId) return

    resetState()
    setStatus('connecting')
    addLine(t('admin.accounts.startingTestForAccount', { name: account.name }), 'text-blue-400')
    addLine(t('admin.accounts.testAccountTypeLabel', { type: account.type }), 'text-gray-400')
    addLine('', 'text-gray-300')

    abortStream()
    abortControllerRef.current = new AbortController()

    try {
      const response = await fetch(`/api/v1/admin/accounts/${account.id}/test`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${localStorage.getItem('auth_token')}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model_id: selectedModelId,
          prompt: supportsImageTest ? testPrompt.trim() : '',
        }),
        signal: abortControllerRef.current.signal,
      })

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      const reader = response.body?.getReader()
      if (!reader) throw new Error('No response body')

      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const jsonStr = line.slice(6).trim()
            if (jsonStr) {
              try {
                handleEvent(JSON.parse(jsonStr))
              } catch (e) {
                console.error('Failed to parse SSE event:', e)
              }
            }
          }
        }
      }
    } catch (error: unknown) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        setStatus('idle')
        return
      }
      setStatus('error')
      const msg = error instanceof Error ? error.message : 'Unknown error'
      setErrorMessage(msg)
      addLine(`Error: ${msg}`, 'text-red-400')
    }
  }

  const handleClose = () => {
    abortStream()
    onClose()
  }

  const copyOutput = () => {
    const text = outputLines.map((l) => l.text).join('\n')
    void copyToClipboard(text, t('admin.accounts.outputCopied'))
  }

  return (
    <>
      <BaseDialog
        show={show}
        title={t('admin.accounts.testAccountConnection')}
        width="normal"
        onClose={handleClose}
        footer={
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={handleClose}
              className="rounded-lg bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-200 dark:bg-dark-600 dark:text-gray-300 dark:hover:bg-dark-500"
            >
              {t('common.close')}
            </button>
            <button
              type="button"
              onClick={() => void startTest()}
              disabled={status === 'connecting' || !selectedModelId}
              className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all ${
                status === 'connecting' || !selectedModelId
                  ? 'cursor-not-allowed bg-primary-400 text-white'
                  : status === 'success'
                    ? 'bg-green-500 text-white hover:bg-green-600'
                    : status === 'error'
                      ? 'bg-orange-500 text-white hover:bg-orange-600'
                      : 'bg-primary-500 text-white hover:bg-primary-600'
              }`}
            >
              {status === 'connecting' ? (
                <Icon name="refresh" size="sm" className="animate-spin" strokeWidth={2} />
              ) : status === 'idle' ? (
                <Icon name="play" size="sm" strokeWidth={2} />
              ) : (
                <Icon name="refresh" size="sm" strokeWidth={2} />
              )}
              <span>
                {status === 'connecting'
                  ? t('admin.accounts.testing')
                  : status === 'idle'
                    ? t('admin.accounts.startTest')
                    : t('admin.accounts.retry')}
              </span>
            </button>
          </div>
        }
      >
        <div className="space-y-4">
          {account ? (
            <div className="flex items-center justify-between rounded-xl border border-gray-200 bg-gradient-to-r from-gray-50 to-gray-100 p-3 dark:border-dark-500 dark:from-dark-700 dark:to-dark-600">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-primary-500 to-primary-600">
                  <Icon name="play" size="md" className="text-white" strokeWidth={2} />
                </div>
                <div>
                  <div className="font-semibold text-gray-900 dark:text-gray-100">{account.name}</div>
                  <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
                    <span className="rounded bg-gray-200 px-1.5 py-0.5 text-[10px] font-medium uppercase dark:bg-dark-500">
                      {account.type}
                    </span>
                    <span>{t('admin.accounts.account')}</span>
                  </div>
                </div>
              </div>
              <span
                className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                  account.status === 'active'
                    ? 'bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-400'
                    : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'
                }`}
              >
                {account.status}
              </span>
            </div>
          ) : null}

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
              {t('admin.accounts.selectTestModel')}
            </label>
            <Select
              modelValue={selectedModelId}
              options={availableModels as unknown as Array<Record<string, unknown>>}
              disabled={loadingModels || status === 'connecting'}
              valueKey="id"
              labelKey="display_name"
              placeholder={
                loadingModels ? `${t('common.loading')}...` : t('admin.accounts.selectTestModel')
              }
              onUpdateModelValue={(value) => setSelectedModelId(String(value ?? ''))}
            />
          </div>

          {supportsImageTest ? (
            <div className="space-y-1.5">
              <label className="input-label">{t('admin.accounts.imagePromptLabel')}</label>
              <textarea
                className="input"
                rows={3}
                value={testPrompt}
                disabled={status === 'connecting'}
                placeholder={t('admin.accounts.imagePromptPlaceholder')}
                onChange={(e) => setTestPrompt(e.target.value)}
              />
              <p className="input-hint">{t('admin.accounts.imageTestHint')}</p>
            </div>
          ) : null}

          <div className="group relative">
            <div
              ref={terminalRef}
              className="max-h-[240px] min-h-[120px] overflow-y-auto rounded-xl border border-gray-700 bg-gray-900 p-4 font-mono text-sm dark:border-gray-800 dark:bg-black"
            >
              {status === 'idle' ? (
                <div className="flex items-center gap-2 text-gray-500">
                  <Icon name="play" size="sm" strokeWidth={2} />
                  <span>{t('admin.accounts.readyToTest')}</span>
                </div>
              ) : status === 'connecting' ? (
                <div className="flex items-center gap-2 text-yellow-400">
                  <Icon name="refresh" size="sm" className="animate-spin" strokeWidth={2} />
                  <span>{t('admin.accounts.connectingToApi')}</span>
                </div>
              ) : null}

              {outputLines.map((line, index) => (
                <div key={index} className={line.class}>
                  {line.text}
                </div>
              ))}

              {streamingContent ? (
                <div className="text-green-400">
                  {streamingContent}
                  <span className="animate-pulse">_</span>
                </div>
              ) : null}

              {status === 'success' ? (
                <div className="mt-3 flex items-center gap-2 border-t border-gray-700 pt-3 text-green-400">
                  <Icon name="check" size="sm" strokeWidth={2} />
                  <span>{t('admin.accounts.testCompleted')}</span>
                </div>
              ) : status === 'error' ? (
                <div className="mt-3 flex items-center gap-2 border-t border-gray-700 pt-3 text-red-400">
                  <Icon name="x" size="sm" strokeWidth={2} />
                  <span>{errorMessage}</span>
                </div>
              ) : null}
            </div>

            {outputLines.length > 0 ? (
              <button
                type="button"
                onClick={copyOutput}
                className="absolute right-2 top-2 rounded-lg bg-gray-800/80 p-1.5 text-gray-400 opacity-0 transition-all hover:bg-gray-700 hover:text-white group-hover:opacity-100"
                title={t('admin.accounts.copyOutput')}
              >
                <Icon name="link" size="sm" strokeWidth={2} />
              </button>
            ) : null}
          </div>

          {generatedImages.length > 0 ? (
            <div className="space-y-2">
              <div className="text-xs font-medium text-gray-600 dark:text-gray-300">
                {t('admin.accounts.imagePreview')}
              </div>
              <div className="flex flex-wrap justify-center gap-3">
                {generatedImages.map((image, index) => (
                  <div
                    key={`${image.url}-${index}`}
                    className="group/img relative cursor-pointer overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm transition hover:border-primary-300 hover:shadow-md dark:border-dark-500 dark:bg-dark-700"
                    onClick={() => setPreviewImageUrl(image.url)}
                  >
                    <img
                      src={image.url}
                      alt={`test-image-${index + 1}`}
                      className="max-h-[360px] w-full object-contain"
                    />
                    <div className="absolute inset-0 flex items-center justify-center bg-black/0 transition-colors group-hover/img:bg-black/20">
                      <Icon
                        name="eye"
                        size="lg"
                        className="text-white opacity-0 drop-shadow-lg transition-opacity group-hover/img:opacity-100"
                        strokeWidth={2}
                      />
                    </div>
                    <div className="border-t border-gray-100 px-3 py-1.5 text-xs text-gray-500 dark:border-dark-500 dark:text-gray-300">
                      {image.mimeType || 'image/*'}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <div className="flex items-center justify-between px-1 text-xs text-gray-500 dark:text-gray-400">
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1">
                <Icon name="grid" size="sm" strokeWidth={2} />
                {t('admin.accounts.testModel')}
              </span>
            </div>
            <span className="flex items-center gap-1">
              <Icon name="chat" size="sm" strokeWidth={2} />
              {supportsImageTest
                ? t('admin.accounts.imageTestMode')
                : t('admin.accounts.testPrompt')}
            </span>
          </div>
        </div>
      </BaseDialog>

      {mounted && previewImageUrl
        ? createPortal(
            <div
              className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4"
              onClick={() => setPreviewImageUrl('')}
            >
              <button
                type="button"
                className="absolute right-4 top-4 rounded-full bg-black/50 p-2 text-white transition-colors hover:bg-black/70"
                onClick={() => setPreviewImageUrl('')}
              >
                <Icon name="x" size="lg" strokeWidth={2} />
              </button>
              <img
                src={previewImageUrl}
                alt="preview"
                className="max-h-[90vh] max-w-[90vw] rounded-lg object-contain shadow-2xl"
              />
            </div>,
            document.body,
          )
        : null}
    </>
  )
}
