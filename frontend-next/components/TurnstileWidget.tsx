'use client'

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'

interface TurnstileRenderOptions {
  sitekey: string
  callback: (token: string) => void
  'expired-callback'?: () => void
  'error-callback'?: () => void
  theme?: 'light' | 'dark' | 'auto'
  size?: 'normal' | 'compact' | 'flexible'
}

interface TurnstileAPI {
  render: (container: HTMLElement, options: TurnstileRenderOptions) => string
  reset: (widgetId?: string) => void
  remove: (widgetId?: string) => void
}

declare global {
  interface Window {
    turnstile?: TurnstileAPI
    onTurnstileLoad?: () => void
  }
}

export interface TurnstileWidgetHandle {
  reset: () => void
}

interface TurnstileWidgetProps {
  siteKey: string
  theme?: 'light' | 'dark' | 'auto'
  size?: 'normal' | 'compact' | 'flexible'
  onVerify: (token: string) => void
  onExpire: () => void
  onError: () => void
}

const TurnstileWidget = forwardRef<TurnstileWidgetHandle, TurnstileWidgetProps>(function TurnstileWidget(
  { siteKey, theme = 'auto', size = 'flexible', onVerify, onExpire, onError },
  ref,
) {
  const containerRef = useRef<HTMLDivElement>(null)
  const widgetIdRef = useRef<string | null>(null)
  const [scriptLoaded, setScriptLoaded] = useState(false)

  const loadScript = (): Promise<void> => {
    return new Promise((resolve, reject) => {
      if (window.turnstile) {
        setScriptLoaded(true)
        resolve()
        return
      }

      const existingScript = document.querySelector('script[src*="turnstile"]')
      if (existingScript) {
        window.onTurnstileLoad = () => {
          setScriptLoaded(true)
          resolve()
        }
        return
      }

      const script = document.createElement('script')
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?onload=onTurnstileLoad'
      script.async = true
      script.defer = true

      window.onTurnstileLoad = () => {
        setScriptLoaded(true)
        resolve()
      }

      script.onerror = () => {
        reject(new Error('Failed to load Turnstile script'))
      }

      document.head.appendChild(script)
    })
  }

  const renderWidget = () => {
    if (!window.turnstile || !containerRef.current || !siteKey) {
      return
    }

    if (widgetIdRef.current) {
      try {
        window.turnstile.remove(widgetIdRef.current)
      } catch {
        // ignore
      }
      widgetIdRef.current = null
    }

    containerRef.current.innerHTML = ''

    widgetIdRef.current = window.turnstile.render(containerRef.current, {
      sitekey: siteKey,
      callback: (token: string) => onVerify(token),
      'expired-callback': () => onExpire(),
      'error-callback': () => onError(),
      theme,
      size,
    })
  }

  const reset = () => {
    if (window.turnstile && widgetIdRef.current) {
      window.turnstile.reset(widgetIdRef.current)
    }
  }

  useImperativeHandle(ref, () => ({ reset }))

  useEffect(() => {
    if (!siteKey) {
      return
    }

    let cancelled = false

    loadScript()
      .then(() => {
        if (!cancelled) {
          renderWidget()
        }
      })
      .catch((error) => {
        console.error('Failed to initialize Turnstile:', error)
        onError()
      })

    return () => {
      cancelled = true
      if (window.turnstile && widgetIdRef.current) {
        try {
          window.turnstile.remove(widgetIdRef.current)
        } catch {
          // ignore
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siteKey])

  useEffect(() => {
    if (siteKey && scriptLoaded) {
      renderWidget()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siteKey, scriptLoaded])

  if (!siteKey) {
    return null
  }

  return (
    <div className="turnstile-wrapper w-full">
      <div ref={containerRef} className="turnstile-container min-h-[65px] w-full [&_iframe]:!w-full" />
    </div>
  )
})

export default TurnstileWidget
