'use client'

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useState,
} from 'react'
import { useI18n } from '@/lib/i18n'
import { useClipboard } from '@/lib/useClipboard'
import Icon from '@/components/icons/Icon'
import type { AddMethod, AuthInputMethod } from '@/hooks/useAccountOAuth'

export interface OAuthAuthorizationFlowHandle {
  authCode: string
  oauthState: string
  projectId: string
  sessionKey: string
  refreshToken: string
  sessionToken: string
  codexSession: string
  inputMethod: AuthInputMethod
  reset: () => void
}

interface OAuthAuthorizationFlowProps {
  addMethod?: AddMethod
  authUrl?: string
  sessionId?: string
  loading?: boolean
  error?: string
  showHelp?: boolean
  showProxyWarning?: boolean
  showCookieOption?: boolean
  allowMultiple?: boolean
  methodLabel?: string
  showRefreshTokenOption?: boolean
  showMobileRefreshTokenOption?: boolean
  showSessionTokenOption?: boolean
  showAccessTokenOption?: boolean
  showCodexSessionImportOption?: boolean
  platform?: 'openai' | 'gemini' | 'antigravity' | 'anthropic'
  showProjectId?: boolean
  onGenerateUrl?: () => void
  onCookieAuth?: (sessionKey: string) => void
  onValidateRefreshToken?: (refreshToken: string) => void
  onValidateMobileRefreshToken?: (refreshToken: string) => void
  onValidateSessionToken?: (sessionToken: string) => void
  onImportAccessToken?: (accessToken: string) => void
  onImportCodexSession?: (content: string) => void
  onInputMethodChange?: (method: AuthInputMethod) => void
}

function SpinnerIcon() {
  return (
    <svg className="-ml-1 mr-2 h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  )
}

const OAuthAuthorizationFlow = forwardRef<OAuthAuthorizationFlowHandle, OAuthAuthorizationFlowProps>(
  function OAuthAuthorizationFlow(
    {
      authUrl = '',
      loading = false,
      error = '',
      showHelp = true,
      showProxyWarning = true,
      allowMultiple = false,
      methodLabel = 'Authorization Method',
      showCookieOption = true,
      showRefreshTokenOption = false,
      showMobileRefreshTokenOption = false,
      showSessionTokenOption = false,
      showAccessTokenOption = false,
      showCodexSessionImportOption = false,
      platform = 'anthropic',
      showProjectId = true,
      onGenerateUrl,
      onCookieAuth,
      onValidateRefreshToken,
      onValidateMobileRefreshToken,
      onImportCodexSession,
      onInputMethodChange,
    },
    ref,
  ) {
    const { t } = useI18n()
    const { copied, copyToClipboard } = useClipboard()

    const [inputMethod, setInputMethod] = useState<AuthInputMethod>('manual')
    const [authCodeInput, setAuthCodeInput] = useState('')
    const [sessionKeyInput, setSessionKeyInput] = useState('')
    const [refreshTokenInput, setRefreshTokenInput] = useState('')
    const [sessionTokenInput, setSessionTokenInput] = useState('')
    const [codexSessionInput, setCodexSessionInput] = useState('')
    const [showHelpDialog, setShowHelpDialog] = useState(false)
    const [oauthState, setOauthState] = useState('')
    const [projectId, setProjectId] = useState('')

    useImperativeHandle(ref, () => ({
      authCode: authCodeInput,
      oauthState,
      projectId,
      sessionKey: sessionKeyInput,
      refreshToken: refreshTokenInput,
      sessionToken: sessionTokenInput,
      codexSession: codexSessionInput,
      inputMethod,
      reset: () => {
        setAuthCodeInput('')
        setOauthState('')
        setProjectId('')
        setSessionKeyInput('')
        setRefreshTokenInput('')
        setSessionTokenInput('')
        setCodexSessionInput('')
        setInputMethod('manual')
        setShowHelpDialog(false)
      },
    }))

    const getOAuthKey = (key: string) => {
      if (platform === 'openai') return `admin.accounts.oauth.openai.${key}`
      if (platform === 'gemini') return `admin.accounts.oauth.gemini.${key}`
      if (platform === 'antigravity') return `admin.accounts.oauth.antigravity.${key}`
      return `admin.accounts.oauth.${key}`
    }

    const oauthTitle = t(getOAuthKey('title'))
    const oauthFollowSteps = t(getOAuthKey('followSteps'))
    const oauthStep1GenerateUrl = t(getOAuthKey('step1GenerateUrl'))
    const oauthGenerateAuthUrl = t(getOAuthKey('generateAuthUrl'))
    const oauthStep2OpenUrl = t(getOAuthKey('step2OpenUrl'))
    const oauthOpenUrlDesc = t(getOAuthKey('openUrlDesc'))
    const oauthStep3EnterCode = t(getOAuthKey('step3EnterCode'))
    const oauthAuthCodeDesc = t(getOAuthKey('authCodeDesc'))
    const oauthAuthCode = t(getOAuthKey('authCode'))
    const oauthAuthCodePlaceholder = t(getOAuthKey('authCodePlaceholder'))
    const oauthAuthCodeHint = t(getOAuthKey('authCodeHint'))
    const oauthImportantNotice =
      platform === 'openai'
        ? t('admin.accounts.oauth.openai.importantNotice')
        : platform === 'antigravity'
          ? t('admin.accounts.oauth.antigravity.importantNotice')
          : ''

    const showMethodSelection =
      showCookieOption ||
      showRefreshTokenOption ||
      showMobileRefreshTokenOption ||
      showSessionTokenOption ||
      showAccessTokenOption ||
      showCodexSessionImportOption

    const parsedKeyCount = useMemo(
      () =>
        sessionKeyInput
          .split('\n')
          .map((k) => k.trim())
          .filter(Boolean).length,
      [sessionKeyInput],
    )

    const parsedRefreshTokenCount = useMemo(
      () =>
        refreshTokenInput
          .split('\n')
          .map((rt) => rt.trim())
          .filter(Boolean).length,
      [refreshTokenInput],
    )

    const parsedCodexSessionCount = useMemo(() => {
      const trimmed = codexSessionInput.trim()
      if (!trimmed) return 0
      if (trimmed.startsWith('{') || trimmed.startsWith('[')) return 1
      return trimmed
        .split('\n')
        .map((item) => item.trim())
        .filter(Boolean).length
    }, [codexSessionInput])

    useEffect(() => {
      onInputMethodChange?.(inputMethod)
    }, [inputMethod, onInputMethodChange])

    useEffect(() => {
      if (platform !== 'openai' && platform !== 'gemini' && platform !== 'antigravity') return
      const trimmed = authCodeInput.trim()
      if (!trimmed.includes('?') || !trimmed.includes('code=')) return

      try {
        const url = new URL(trimmed)
        const code = url.searchParams.get('code')
        const stateParam = url.searchParams.get('state')
        if (stateParam) setOauthState(stateParam)
        if (code && code !== trimmed) setAuthCodeInput(code)
      } catch {
        const match = trimmed.match(/[?&]code=([^&]+)/)
        const stateMatch = trimmed.match(/[?&]state=([^&]+)/)
        if (stateMatch?.[1]) setOauthState(stateMatch[1])
        if (match?.[1] && match[1] !== trimmed) setAuthCodeInput(match[1])
      }
    }, [authCodeInput, platform])

    const handleGenerateUrl = () => onGenerateUrl?.()
    const handleCopyUrl = () => {
      if (authUrl) void copyToClipboard(authUrl)
    }
    const handleRegenerate = () => {
      setAuthCodeInput('')
      onGenerateUrl?.()
    }
    const handleCookieAuth = () => {
      if (sessionKeyInput.trim()) onCookieAuth?.(sessionKeyInput)
    }
    const handleValidateRefreshToken = () => {
      if (!refreshTokenInput.trim()) return
      if (inputMethod === 'mobile_refresh_token') {
        onValidateMobileRefreshToken?.(refreshTokenInput.trim())
      } else {
        onValidateRefreshToken?.(refreshTokenInput.trim())
      }
    }
    const handleImportCodexSession = () => {
      if (codexSessionInput.trim()) onImportCodexSession?.(codexSessionInput.trim())
    }

    const methodOptions: Array<{ value: AuthInputMethod; label: string; show: boolean }> = [
      { value: 'manual', label: t('admin.accounts.oauth.manualAuth'), show: true },
      { value: 'cookie', label: t('admin.accounts.oauth.cookieAutoAuth'), show: showCookieOption },
      {
        value: 'refresh_token',
        label: t(getOAuthKey('refreshTokenAuth')),
        show: showRefreshTokenOption,
      },
      {
        value: 'mobile_refresh_token',
        label: t('admin.accounts.oauth.openai.mobileRefreshTokenAuth', '手动输入 Mobile RT'),
        show: showMobileRefreshTokenOption,
      },
      {
        value: 'session_token',
        label: t(getOAuthKey('sessionTokenAuth')),
        show: showSessionTokenOption,
      },
      {
        value: 'access_token',
        label: t('admin.accounts.oauth.openai.accessTokenAuth', '手动输入 AT'),
        show: showAccessTokenOption,
      },
      {
        value: 'codex_session',
        label: t('admin.accounts.oauth.openai.codexSessionAuth'),
        show: showCodexSessionImportOption,
      },
    ]

    return (
      <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-700 dark:bg-blue-900/30">
        <div className="flex items-start gap-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-500">
            <Icon name="link" size="md" className="text-white" />
          </div>
          <div className="flex-1">
            <h4 className="mb-3 font-semibold text-blue-900 dark:text-blue-200">{oauthTitle}</h4>

            {showMethodSelection ? (
              <div className="mb-4">
                <label className="mb-2 block text-sm font-medium text-blue-800 dark:text-blue-300">
                  {methodLabel}
                </label>
                <div className="flex flex-wrap gap-4">
                  {methodOptions
                    .filter((option) => option.show)
                    .map((option) => (
                      <label key={option.value} className="flex cursor-pointer items-center gap-2">
                        <input
                          type="radio"
                          value={option.value}
                          checked={inputMethod === option.value}
                          onChange={() => setInputMethod(option.value)}
                          className="text-blue-600 focus:ring-blue-500"
                        />
                        <span className="text-sm text-blue-900 dark:text-blue-200">{option.label}</span>
                      </label>
                    ))}
                </div>
              </div>
            ) : null}

            {inputMethod === 'refresh_token' || inputMethod === 'mobile_refresh_token' ? (
              <div className="space-y-4">
                <div className="rounded-lg border border-blue-300 bg-white/80 p-4 dark:border-blue-600 dark:bg-gray-800/80">
                  <p className="mb-3 text-sm text-blue-700 dark:text-blue-300">
                    {t(getOAuthKey('refreshTokenDesc'))}
                  </p>
                  <div className="mb-4">
                    <label className="mb-2 flex items-center gap-2 text-sm font-semibold text-gray-700 dark:text-gray-300">
                      <Icon name="key" size="sm" className="text-blue-500" />
                      Refresh Token
                      {parsedRefreshTokenCount > 1 ? (
                        <span className="rounded-full bg-blue-500 px-2 py-0.5 text-xs text-white">
                          {t('admin.accounts.oauth.keysCount', { count: parsedRefreshTokenCount })}
                        </span>
                      ) : null}
                    </label>
                    <textarea
                      value={refreshTokenInput}
                      onChange={(event) => setRefreshTokenInput(event.target.value)}
                      rows={3}
                      className="input w-full resize-y font-mono text-sm"
                      placeholder={t(getOAuthKey('refreshTokenPlaceholder'))}
                    />
                    {parsedRefreshTokenCount > 1 ? (
                      <p className="mt-1 text-xs text-blue-600 dark:text-blue-400">
                        {t('admin.accounts.oauth.batchCreateAccounts', { count: parsedRefreshTokenCount })}
                      </p>
                    ) : null}
                  </div>
                  {error ? (
                    <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-700 dark:bg-red-900/30">
                      <p className="whitespace-pre-line text-sm text-red-600 dark:text-red-400">{error}</p>
                    </div>
                  ) : null}
                  <button
                    type="button"
                    className="btn btn-primary w-full"
                    disabled={loading || !refreshTokenInput.trim()}
                    onClick={handleValidateRefreshToken}
                  >
                    {loading ? <SpinnerIcon /> : <Icon name="sparkles" size="sm" className="mr-2" />}
                    {loading ? t(getOAuthKey('validating')) : t(getOAuthKey('validateAndCreate'))}
                  </button>
                </div>
              </div>
            ) : null}

            {inputMethod === 'codex_session' ? (
              <div className="space-y-4">
                <div className="rounded-lg border border-blue-300 bg-white/80 p-4 dark:border-blue-600 dark:bg-gray-800/80">
                  <p className="mb-3 text-sm text-blue-700 dark:text-blue-300">
                    {t('admin.accounts.oauth.openai.codexSessionDesc')}
                  </p>
                  <div className="mb-4">
                    <label className="mb-2 flex items-center gap-2 text-sm font-semibold text-gray-700 dark:text-gray-300">
                      <Icon name="key" size="sm" className="text-blue-500" />
                      {t('admin.accounts.oauth.openai.codexSessionInputLabel')}
                      {parsedCodexSessionCount > 1 ? (
                        <span className="rounded-full bg-blue-500 px-2 py-0.5 text-xs text-white">
                          {t('admin.accounts.oauth.keysCount', { count: parsedCodexSessionCount })}
                        </span>
                      ) : null}
                    </label>
                    <textarea
                      value={codexSessionInput}
                      onChange={(event) => setCodexSessionInput(event.target.value)}
                      rows={8}
                      className="input w-full resize-y font-mono text-sm"
                      placeholder={t('admin.accounts.oauth.openai.codexSessionPlaceholder')}
                      spellCheck={false}
                    />
                    <p className="mt-1 text-xs text-blue-600 dark:text-blue-400">
                      {t('admin.accounts.oauth.openai.codexSessionHint')}
                    </p>
                  </div>
                  {error ? (
                    <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-700 dark:bg-red-900/30">
                      <p className="whitespace-pre-line text-sm text-red-600 dark:text-red-400">{error}</p>
                    </div>
                  ) : null}
                  <button
                    type="button"
                    className="btn btn-primary w-full"
                    disabled={loading || !codexSessionInput.trim()}
                    onClick={handleImportCodexSession}
                  >
                    {loading ? <SpinnerIcon /> : <Icon name="sparkles" size="sm" className="mr-2" />}
                    {loading
                      ? t('admin.accounts.oauth.openai.validating')
                      : t('admin.accounts.oauth.openai.codexSessionImportAndCreate')}
                  </button>
                </div>
              </div>
            ) : null}

            {inputMethod === 'cookie' ? (
              <div className="space-y-4">
                <div className="rounded-lg border border-blue-300 bg-white/80 p-4 dark:border-blue-600 dark:bg-gray-800/80">
                  <p className="mb-3 text-sm text-blue-700 dark:text-blue-300">
                    {t('admin.accounts.oauth.cookieAutoAuthDesc')}
                  </p>
                  <div className="mb-4">
                    <label className="mb-2 flex items-center gap-2 text-sm font-semibold text-gray-700 dark:text-gray-300">
                      <Icon name="key" size="sm" className="text-blue-500" />
                      {t('admin.accounts.oauth.sessionKey')}
                      {parsedKeyCount > 1 && allowMultiple ? (
                        <span className="rounded-full bg-blue-500 px-2 py-0.5 text-xs text-white">
                          {t('admin.accounts.oauth.keysCount', { count: parsedKeyCount })}
                        </span>
                      ) : null}
                      {showHelp ? (
                        <button
                          type="button"
                          className="text-blue-500 hover:text-blue-600"
                          onClick={() => setShowHelpDialog((prev) => !prev)}
                        >
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z"
                            />
                          </svg>
                        </button>
                      ) : null}
                    </label>
                    <textarea
                      value={sessionKeyInput}
                      onChange={(event) => setSessionKeyInput(event.target.value)}
                      rows={3}
                      className="input w-full resize-y font-mono text-sm"
                      placeholder={
                        allowMultiple
                          ? t('admin.accounts.oauth.sessionKeyPlaceholder')
                          : t('admin.accounts.oauth.sessionKeyPlaceholderSingle')
                      }
                    />
                    {parsedKeyCount > 1 && allowMultiple ? (
                      <p className="mt-1 text-xs text-blue-600 dark:text-blue-400">
                        {t('admin.accounts.oauth.batchCreateAccounts', { count: parsedKeyCount })}
                      </p>
                    ) : null}
                  </div>
                  {showHelpDialog && showHelp ? (
                    <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-700 dark:bg-amber-900/30">
                      <h5 className="mb-2 font-semibold text-amber-800 dark:text-amber-200">
                        {t('admin.accounts.oauth.howToGetSessionKey')}
                      </h5>
                      <ol className="list-inside list-decimal space-y-1 text-xs text-amber-700 dark:text-amber-300">
                        <li>{t('admin.accounts.oauth.step1')}</li>
                        <li>{t('admin.accounts.oauth.step2')}</li>
                        <li>{t('admin.accounts.oauth.step3')}</li>
                        <li>{t('admin.accounts.oauth.step4')}</li>
                        <li>{t('admin.accounts.oauth.step5')}</li>
                        <li>{t('admin.accounts.oauth.step6')}</li>
                      </ol>
                      <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
                        {t('admin.accounts.oauth.sessionKeyFormat')}
                      </p>
                    </div>
                  ) : null}
                  {error ? (
                    <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-700 dark:bg-red-900/30">
                      <p className="whitespace-pre-line text-sm text-red-600 dark:text-red-400">{error}</p>
                    </div>
                  ) : null}
                  <button
                    type="button"
                    className="btn btn-primary w-full"
                    disabled={loading || !sessionKeyInput.trim()}
                    onClick={handleCookieAuth}
                  >
                    {loading ? <SpinnerIcon /> : <Icon name="sparkles" size="sm" className="mr-2" />}
                    {loading
                      ? t('admin.accounts.oauth.authorizing')
                      : t('admin.accounts.oauth.startAutoAuth')}
                  </button>
                </div>
              </div>
            ) : null}

            {inputMethod === 'manual' ? (
              <div className="space-y-4">
                <p className="mb-4 text-sm text-blue-800 dark:text-blue-300">{oauthFollowSteps}</p>

                <div className="rounded-lg border border-blue-300 bg-white/80 p-4 dark:border-blue-600 dark:bg-gray-800/80">
                  <div className="flex items-start gap-3">
                    <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">
                      1
                    </div>
                    <div className="flex-1">
                      <p className="mb-2 font-medium text-blue-900 dark:text-blue-200">{oauthStep1GenerateUrl}</p>
                      {showProjectId && platform === 'gemini' ? (
                        <div className="mb-3">
                          <label className="input-label flex items-center gap-2">
                            {t('admin.accounts.oauth.gemini.projectIdLabel')}
                            <a
                              href="https://console.cloud.google.com/"
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-xs font-normal text-blue-500 hover:text-blue-600 dark:text-blue-400"
                            >
                              {t('admin.accounts.oauth.gemini.howToGetProjectId')}
                            </a>
                          </label>
                          <input
                            value={projectId}
                            onChange={(event) => setProjectId(event.target.value)}
                            type="text"
                            className="input w-full font-mono text-sm"
                            placeholder={t('admin.accounts.oauth.gemini.projectIdPlaceholder')}
                          />
                          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                            {t('admin.accounts.oauth.gemini.projectIdHint')}
                          </p>
                        </div>
                      ) : null}
                      {!authUrl ? (
                        <button
                          type="button"
                          disabled={loading}
                          className="btn btn-primary text-sm"
                          onClick={handleGenerateUrl}
                        >
                          {loading ? <SpinnerIcon /> : <Icon name="link" size="sm" className="mr-2" />}
                          {loading ? t('admin.accounts.oauth.generating') : oauthGenerateAuthUrl}
                        </button>
                      ) : (
                        <div className="space-y-3">
                          <div className="flex items-center gap-2">
                            <input
                              value={authUrl}
                              readOnly
                              type="text"
                              className="input flex-1 bg-gray-50 font-mono text-xs dark:bg-gray-700"
                            />
                            <button type="button" className="btn btn-secondary p-2" title="Copy URL" onClick={handleCopyUrl}>
                              {!copied ? (
                                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184"
                                  />
                                </svg>
                              ) : (
                                <Icon name="check" size="sm" className="text-green-500" strokeWidth={2} />
                              )}
                            </button>
                          </div>
                          <button
                            type="button"
                            className="text-xs text-blue-600 hover:text-blue-700 dark:text-blue-400"
                            onClick={handleRegenerate}
                          >
                            <Icon name="refresh" size="xs" className="mr-1 inline" />
                            {t('admin.accounts.oauth.regenerate')}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="rounded-lg border border-blue-300 bg-white/80 p-4 dark:border-blue-600 dark:bg-gray-800/80">
                  <div className="flex items-start gap-3">
                    <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">
                      2
                    </div>
                    <div className="flex-1">
                      <p className="mb-2 font-medium text-blue-900 dark:text-blue-200">{oauthStep2OpenUrl}</p>
                      <p className="text-sm text-blue-700 dark:text-blue-300">{oauthOpenUrlDesc}</p>
                      {platform === 'openai' && oauthImportantNotice ? (
                        <div className="mt-2 rounded border border-amber-300 bg-amber-50 p-3 dark:border-amber-700 dark:bg-amber-900/30">
                          <p className="text-xs text-amber-800 dark:text-amber-300">{oauthImportantNotice}</p>
                        </div>
                      ) : showProxyWarning ? (
                        <div className="mt-2 rounded border border-yellow-300 bg-yellow-50 p-3 dark:border-yellow-700 dark:bg-yellow-900/30">
                          <p className="text-xs text-yellow-800 dark:text-yellow-300">
                            {t('admin.accounts.oauth.proxyWarning')}
                          </p>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>

                <div className="rounded-lg border border-blue-300 bg-white/80 p-4 dark:border-blue-600 dark:bg-gray-800/80">
                  <div className="flex items-start gap-3">
                    <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">
                      3
                    </div>
                    <div className="flex-1">
                      <p className="mb-2 font-medium text-blue-900 dark:text-blue-200">{oauthStep3EnterCode}</p>
                      <p className="mb-3 text-sm text-blue-700 dark:text-blue-300">{oauthAuthCodeDesc}</p>
                      <div>
                        <label className="input-label">
                          <Icon name="key" size="sm" className="mr-1 inline text-blue-500" />
                          {oauthAuthCode}
                        </label>
                        <textarea
                          value={authCodeInput}
                          onChange={(event) => setAuthCodeInput(event.target.value)}
                          rows={3}
                          className="input w-full resize-none font-mono text-sm"
                          placeholder={oauthAuthCodePlaceholder}
                        />
                        <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                          <Icon name="infoCircle" size="xs" className="mr-1 inline" />
                          {oauthAuthCodeHint}
                        </p>
                        {platform === 'gemini' ? (
                          <div className="mt-3 rounded-lg border-2 border-amber-400 bg-amber-50 p-3 dark:border-amber-600 dark:bg-amber-900/30">
                            <div className="flex items-start gap-2">
                              <Icon
                                name="exclamationTriangle"
                                size="md"
                                className="shrink-0 text-amber-600 dark:text-amber-400"
                                strokeWidth={2}
                              />
                              <div className="text-sm text-amber-800 dark:text-amber-300">
                                <p className="font-semibold">{t('admin.accounts.oauth.gemini.stateWarningTitle')}</p>
                                <p className="mt-1">{t('admin.accounts.oauth.gemini.stateWarningDesc')}</p>
                              </div>
                            </div>
                          </div>
                        ) : null}
                      </div>
                      {error ? (
                        <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-700 dark:bg-red-900/30">
                          <p className="whitespace-pre-line text-sm text-red-600 dark:text-red-400">{error}</p>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    )
  },
)

export default OAuthAuthorizationFlow
