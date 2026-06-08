'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useAuth } from '@/context/AuthContext'
import { useApp } from '@/context/AppContext'
import PageShell from '@/components/PageShell'
import { isTotp2FARequired } from '@/lib/auth'
import type { LoginResponse, TotpLoginResponse } from '@/lib/types'

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export default function LoginPage() {
  const auth = useAuth()
  const app = useApp()
  const router = useRouter()
  const searchParams = useSearchParams()
  const redirect = useMemo(() => searchParams.get('redirect') || '/dashboard', [searchParams])

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [totpRequired, setTotpRequired] = useState(false)
  const [totpCode, setTotpCode] = useState('')
  const [tempToken, setTempToken] = useState('')

  useEffect(() => {
    if (auth.isAuthenticated) {
      router.replace(auth.isAdmin ? '/admin/dashboard' : '/dashboard')
    }
  }, [auth.isAuthenticated, auth.isAdmin, router])

  const title = `Login - ${app.siteName || 'Sub2API'}`

  const validate = () => {
    setErrorMessage('')
    if (!email || !emailRegex.test(email)) {
      setErrorMessage('Please enter a valid email address.')
      return false
    }
    if (!password || password.length < 6) {
      setErrorMessage('Please enter a password with at least 6 characters.')
      return false
    }
    return true
  }

  const handleLogin = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!validate()) return

    setIsLoading(true)
    try {
      const response: LoginResponse = await auth.login({ email, password })
      if (isTotp2FARequired(response)) {
        const totpResponse = response as TotpLoginResponse
        setTempToken(totpResponse.temp_token)
        setTotpRequired(true)
        setErrorMessage('Two-factor authentication is required. Please enter your code.')
        return
      }

      app.showToast('success', 'Login successful!')
      router.push(redirect)
    } catch (error) {
      const message = (error as Error)?.message || 'Login failed. Please try again.'
      setErrorMessage(message)
      app.showToast('error', message)
    } finally {
      setIsLoading(false)
    }
  }

  const handleTotpSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!totpCode.trim()) {
      setErrorMessage('Please enter the TOTP code.')
      return
    }

    setIsLoading(true)
    try {
      await auth.login2FA({ temp_token: tempToken, totp_code: totpCode.trim() })
      app.showToast('success', 'Two-factor authentication succeeded.')
      router.push(redirect)
    } catch (error) {
      const message = (error as Error)?.message || 'TOTP verification failed.'
      setErrorMessage(message)
      app.showToast('error', message)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <PageShell title="Login" description="Sign in to your Sub2API account." path="/login">
      <div className="mx-auto max-w-xl rounded-3xl border border-slate-200 bg-slate-50 p-8 shadow-sm">
        <div className="space-y-6">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-brand-700">Welcome Back</p>
            <h2 className="mt-3 text-3xl font-semibold text-slate-900">Sign in to your account</h2>
            <p className="mt-2 text-sm text-slate-600">Use your email and password to access the Sub2API dashboard.</p>
          </div>

          {errorMessage ? (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
              {errorMessage}
            </div>
          ) : null}

          {!totpRequired ? (
            <form className="space-y-5" onSubmit={handleLogin}>
              <div>
                <label htmlFor="login-email" className="mb-2 block text-sm font-medium text-slate-700">
                  Email
                </label>
                <input
                  id="login-email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  disabled={isLoading}
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                />
              </div>

              <div>
                <label htmlFor="login-password" className="mb-2 block text-sm font-medium text-slate-700">
                  Password
                </label>
                <div className="relative">
                  <input
                    id="login-password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    disabled={isLoading}
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((value) => !value)}
                    className="absolute inset-y-0 right-3 flex items-center text-slate-500 hover:text-slate-700"
                  >
                    {showPassword ? 'Hide' : 'Show'}
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between text-sm text-slate-600">
                <Link href="/forgot-password" className="text-brand-600 hover:text-brand-800">
                  Forgot password?
                </Link>
                <Link href="/register" className="text-brand-600 hover:text-brand-800">
                  Create account
                </Link>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full rounded-2xl bg-brand-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-brand-300"
              >
                {isLoading ? 'Signing in…' : 'Sign in'}
              </button>
            </form>
          ) : (
            <form className="space-y-5" onSubmit={handleTotpSubmit}>
              <div>
                <label htmlFor="totp-code" className="mb-2 block text-sm font-medium text-slate-700">
                  Two-factor authentication code
                </label>
                <input
                  id="totp-code"
                  type="text"
                  inputMode="numeric"
                  value={totpCode}
                  onChange={(event) => setTotpCode(event.target.value)}
                  disabled={isLoading}
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                />
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full rounded-2xl bg-brand-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-brand-300"
              >
                {isLoading ? 'Verifying…' : 'Verify code'}
              </button>
            </form>
          )}
        </div>
      </div>
    </PageShell>
  )
}
