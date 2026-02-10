'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'

import { Button } from '@/components/ui/button'
import Icon from '@/components/ui/icon'

type LoginFormState = {
  email: string
  password: string
}

type OAuthTokens = {
  access_token: string
  refresh_token: string
}

type OAuthPopupMessage =
  | { ok: true; tokens: OAuthTokens; return_to?: string }
  | { ok: false; error?: string }

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

export default function LoginPage() {
  const [form, setForm] = useState<LoginFormState>({
    email: '',
    password: ''
  })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isOAuthSubmitting, setIsOAuthSubmitting] = useState<
    null | 'google' | 'github' | 'apple' | 'microsoft'
  >(null)
  const [errorMessage, setErrorMessage] = useState<string>('')
  const [successMessage, setSuccessMessage] = useState<string>('')

  useEffect(() => {
    if (errorMessage || successMessage) return
  }, [errorMessage, successMessage])

  const canSubmit = useMemo(() => {
    return (
      form.email.trim().length > 0 &&
      isValidEmail(form.email.trim()) &&
      form.password.length >= 1 &&
      !isSubmitting
    )
  }, [form.email, form.password, isSubmitting])

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErrorMessage('')
    setSuccessMessage('')

    if (!canSubmit) return

    setIsSubmitting(true)
    try {
      const res = await fetch('/api/config', { cache: 'no-store' })
      const cfg = res.ok ? await res.json() : null
      const apiUrl = typeof cfg?.apiUrl === 'string' ? cfg.apiUrl : ''

      if (!apiUrl) {
        throw new Error('Missing API URL (check /api/config)')
      }

      const loginRes = await fetch(`${apiUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: form.email.trim(),
          password: form.password
        })
      })

      const payload = await loginRes.json().catch(() => null)

      if (!loginRes.ok) {
        const msg =
          typeof payload?.error === 'string'
            ? payload.error
            : 'Login failed'
        throw new Error(msg)
      }

      setSuccessMessage('Login successful! Redirecting...')
      // Redirect to main app
      setTimeout(() => {
        window.location.href = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:4000'
      }, 1000)
    } catch (err) {
      setErrorMessage((err as Error).message)
    } finally {
      setIsSubmitting(false)
    }
  }

  async function startOAuth(provider: 'google' | 'github' | 'apple' | 'microsoft') {
    setErrorMessage('')
    setSuccessMessage('')
    setIsOAuthSubmitting(provider)

    try {
      const res = await fetch('/api/config', { cache: 'no-store' })
      const cfg = res.ok ? await res.json() : null
      const apiUrl = typeof cfg?.apiUrl === 'string' ? cfg.apiUrl : ''

      if (!apiUrl) {
        throw new Error('Missing API URL (check /api/config)')
      }

      const popup = window.open(
        `${apiUrl}/auth/oauth/${provider}/start?return_to=${encodeURIComponent(window.location.href)}`,
        'oauth',
        'width=600,height=600'
      )

      if (!popup) {
        throw new Error('Popup blocked. Please allow popups for this site.')
      }

      const handleMessage = (event: MessageEvent<OAuthPopupMessage>) => {
        if (event.origin !== window.location.origin) return
        if (event.data.ok) {
          setSuccessMessage('Signed in with social login. Redirecting...')
          setTimeout(() => {
            window.location.href = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:4000'
          }, 1000)
        } else {
          setErrorMessage(event.data.error || 'OAuth failed')
        }
        setIsOAuthSubmitting(null)
        window.removeEventListener('message', handleMessage)
      }

      window.addEventListener('message', handleMessage)
    } catch (err) {
      setErrorMessage((err as Error).message)
      setIsOAuthSubmitting(null)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-lg shadow-lg p-8">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Welcome Back</h1>
          <p className="text-gray-600">Sign in to your account</p>
        </div>

        <form onSubmit={onSubmit} className="space-y-6">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
              Email
            </label>
            <input
              id="email"
              type="email"
              value={form.email}
              onChange={(e) => setForm(prev => ({ ...prev, email: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="Enter your email"
              required
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
              Password
            </label>
            <input
              id="password"
              type="password"
              value={form.password}
              onChange={(e) => setForm(prev => ({ ...prev, password: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="Enter your password"
              required
            />
          </div>

          {errorMessage && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-md">
              <p className="text-sm text-red-600">{errorMessage}</p>
            </div>
          )}

          {successMessage && (
            <div className="p-3 bg-green-50 border border-green-200 rounded-md">
              <p className="text-sm text-green-600">{successMessage}</p>
            </div>
          )}

          <Button
            type="submit"
            disabled={!canSubmit}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-md transition duration-200"
          >
            {isSubmitting ? 'Signing in...' : 'Sign In'}
          </Button>
        </form>

        <div className="mt-6">
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-300" />
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-2 bg-white text-gray-500">Or continue with</span>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-2 gap-3">
            <Button
              onClick={() => startOAuth('google')}
              disabled={isOAuthSubmitting !== null}
              variant="outline"
              className="w-full"
            >
              <Icon name="google" className="w-4 h-4 mr-2" />
              {isOAuthSubmitting === 'google' ? 'Connecting...' : 'Google'}
            </Button>
            <Button
              onClick={() => startOAuth('github')}
              disabled={isOAuthSubmitting !== null}
              variant="outline"
              className="w-full"
            >
              <Icon name="github" className="w-4 h-4 mr-2" />
              {isOAuthSubmitting === 'github' ? 'Connecting...' : 'GitHub'}
            </Button>
          </div>
        </div>

        <div className="mt-6 text-center">
          <p className="text-sm text-gray-600">
            Don&apos;t have an account?{' '}
            <Link href="/register" className="font-medium text-blue-600 hover:text-blue-500">
              Sign up
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}