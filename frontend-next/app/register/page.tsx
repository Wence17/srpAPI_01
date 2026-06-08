'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/context/AuthContext'
import { useApp } from '@/context/AppContext'
import PageShell from '@/components/PageShell'

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export default function RegisterPage() {
  const auth = useAuth()
  const app = useApp()
  const router = useRouter()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [username, setUsername] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

  useEffect(() => {
    if (auth.isAuthenticated) {
      router.replace(auth.isAdmin ? '/admin/dashboard' : '/dashboard')
    }
  }, [auth.isAuthenticated, auth.isAdmin, router])

  const validate = () => {
    setErrorMessage('')
    if (!username.trim()) {
      setErrorMessage('Please enter a username.')
      return false
    }
    if (!email || !emailRegex.test(email)) {
      setErrorMessage('Please enter a valid email address.')
      return false
    }
    if (!password || password.length < 6) {
      setErrorMessage('Password must be at least 6 characters long.')
      return false
    }
    return true
  }

  const handleRegister = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!validate()) return

    setIsLoading(true)
    try {
      await auth.register({ email, password, username })
      app.showToast('success', 'Registration succeeded. Welcome!')
      router.push('/dashboard')
    } catch (error) {
      const message = (error as Error)?.message || 'Registration failed. Please try again.'
      setErrorMessage(message)
      app.showToast('error', message)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <PageShell title="Register" description="Create a new Sub2API account." path="/register">
      <div className="mx-auto max-w-xl rounded-3xl border border-slate-200 bg-slate-50 p-8 shadow-sm">
        <div className="space-y-6">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-brand-700">Create Account</p>
            <h2 className="mt-3 text-3xl font-semibold text-slate-900">Register for Sub2API</h2>
            <p className="mt-2 text-sm text-slate-600">Create a new account to manage your API keys, subscriptions, and usage.</p>
          </div>

          {errorMessage ? (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
              {errorMessage}
            </div>
          ) : null}

          <form className="space-y-5" onSubmit={handleRegister}>
            <div>
              <label htmlFor="register-username" className="mb-2 block text-sm font-medium text-slate-700">
                Username
              </label>
              <input
                id="register-username"
                type="text"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                disabled={isLoading}
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
              />
            </div>

            <div>
              <label htmlFor="register-email" className="mb-2 block text-sm font-medium text-slate-700">
                Email
              </label>
              <input
                id="register-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                disabled={isLoading}
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
              />
            </div>

            <div>
              <label htmlFor="register-password" className="mb-2 block text-sm font-medium text-slate-700">
                Password
              </label>
              <input
                id="register-password"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                disabled={isLoading}
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
              />
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full rounded-2xl bg-brand-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-brand-300"
            >
              {isLoading ? 'Creating account…' : 'Create account'}
            </button>
          </form>

          <p className="text-center text-sm text-slate-600">
            Already have an account?{' '}
            <Link href="/login" className="text-brand-600 hover:text-brand-800">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </PageShell>
  )
}
