'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'

import { Button } from '@/components/ui/button'
import Icon from '@/components/ui/icon'

type RegisterFormState = {
  name: string
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

export default function RegisterPage() {
  const [form, setForm] = useState<RegisterFormState>({
    name: '',
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
      form.password.length >= 8 &&
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

      const registerRes = await fetch(`${apiUrl}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name.trim() || undefined,
          email: form.email.trim(),
          password: form.password
        })
      })

      const payload = await registerRes.json().catch(() => null)

      if (!registerRes.ok) {
        const msg =
          typeof payload?.error === 'string'
            ? payload.error
            : 'Registration failed'
        throw new Error(msg)
      }

      setSuccessMessage('Account created. You can now sign in.')
      setForm({ name: '', email: '', password: '' })
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
      if (!apiUrl) throw new Error('Missing API URL (check /api/config)')

      const serverOrigin = new URL(apiUrl).origin
      const uiOrigin = window.location.origin

      const url = new URL(`${apiUrl}/auth/oauth/${provider}/start`)
      url.searchParams.set('ui_origin', uiOrigin)
      url.searchParams.set('popup', '1')

      const w = 520
      const h = 640
      const left = Math.max(0, Math.round(window.screenX + (window.outerWidth - w) / 2))
      const top = Math.max(0, Math.round(window.screenY + (window.outerHeight - h) / 2))
      const popup = window.open(
        url.toString(),
        `oauth_${provider}`,
        `width=${w},height=${h},left=${left},top=${top},resizable=yes,scrollbars=yes`
      )

      if (!popup) throw new Error('Popup blocked')

      const popupWindow = popup

      const tokens = await new Promise<OAuthTokens>((resolve, reject) => {
        const timeout = window.setTimeout(() => {
          cleanup()
          reject(new Error('OAuth timed out'))
        }, 2 * 60 * 1000)

        function onMessage(event: MessageEvent) {
          if (event.origin !== serverOrigin) return
          const data = event.data as unknown
          cleanup()
          if (!data || typeof data !== 'object') {
            reject(new Error('OAuth failed'))
            return
          }

          const msg = data as OAuthPopupMessage
          if (msg.ok !== true || !msg.tokens) {
            const err = 'error' in msg && typeof msg.error === 'string' ? msg.error : 'OAuth failed'
            reject(new Error(err))
            return
          }

          resolve(msg.tokens)
        }

        function cleanup() {
          window.clearTimeout(timeout)
          window.removeEventListener('message', onMessage)
          try {
            popupWindow.close()
          } catch {
            // ignore
          }
        }

        window.addEventListener('message', onMessage)
      })

      try {
        localStorage.setItem('access_token', String(tokens.access_token || ''))
        localStorage.setItem('refresh_token', String(tokens.refresh_token || ''))
      } catch {
        // ignore
      }

      setSuccessMessage('Signed in with social login.')
    } catch (err) {
      setErrorMessage((err as Error).message)
    } finally {
      setIsOAuthSubmitting(null)
    }
  }

  return (
    <div className="min-h-screen bg-background/80">
      <div className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-6 py-12">
        <div className="mb-6 flex items-center gap-3">
          <Icon type="agno" size="sm" />
          <div className="flex flex-col">
            <div className="text-sm font-semibold text-primary">Create your account</div>
            <div className="text-xs text-muted">Simple registration to get started.</div>
          </div>
        </div>

        <div className="rounded-xl border border-primary/10 bg-background p-5 shadow-sm">
          <form className="flex flex-col gap-3" onSubmit={onSubmit}>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-primary">Name (optional)</label>
              <input
                value={form.name}
                onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                placeholder="Heidi"
                className="h-10 rounded-md border border-primary/15 bg-accent px-3 text-sm text-primary placeholder:text-muted/60 focus:outline-none focus:ring-1 focus:ring-ring"
                autoComplete="name"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-primary">Email</label>
              <input
                value={form.email}
                onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
                placeholder="you@example.com"
                className="h-10 rounded-md border border-primary/15 bg-accent px-3 text-sm text-primary placeholder:text-muted/60 focus:outline-none focus:ring-1 focus:ring-ring"
                autoComplete="email"
                inputMode="email"
              />
              {form.email.trim().length > 0 && !isValidEmail(form.email.trim()) && (
                <div className="text-xs text-muted">Enter a valid email address.</div>
              )}
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-primary">Password</label>
              <input
                type="password"
                value={form.password}
                onChange={(e) => setForm((prev) => ({ ...prev, password: e.target.value }))}
                placeholder="At least 8 characters"
                className="h-10 rounded-md border border-primary/15 bg-accent px-3 text-sm text-primary placeholder:text-muted/60 focus:outline-none focus:ring-1 focus:ring-ring"
                autoComplete="new-password"
              />
              {form.password.length > 0 && form.password.length < 8 && (
                <div className="text-xs text-muted">Use at least 8 characters.</div>
              )}
            </div>

            {errorMessage && (
              <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                {errorMessage}
              </div>
            )}

            {successMessage && (
              <div className="rounded-md border border-primary/20 bg-primary/10 px-3 py-2 text-xs text-primary">
                {successMessage}
              </div>
            )}

            <Button
              type="submit"
              disabled={!canSubmit}
              className="mt-1 bg-brand text-white hover:bg-brand/90"
            >
              {isSubmitting ? 'Creating account...' : 'Create account'}
            </Button>

            <div className="mt-2 flex items-center gap-3">
              <div className="h-px flex-1 bg-primary/10" />
              <div className="text-[11px] uppercase text-muted">or</div>
              <div className="h-px flex-1 bg-primary/10" />
            </div>

            <div className="grid grid-cols-1 gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => startOAuth('google')}
                disabled={!!isOAuthSubmitting || isSubmitting}
              >
                {isOAuthSubmitting === 'google' ? 'Opening Google...' : 'Continue with Google'}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => startOAuth('github')}
                disabled={!!isOAuthSubmitting || isSubmitting}
              >
                {isOAuthSubmitting === 'github' ? 'Opening GitHub...' : 'Continue with GitHub'}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => startOAuth('apple')}
                disabled={!!isOAuthSubmitting || isSubmitting}
              >
                {isOAuthSubmitting === 'apple' ? 'Opening Apple...' : 'Continue with Apple'}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => startOAuth('microsoft')}
                disabled={!!isOAuthSubmitting || isSubmitting}
              >
                {isOAuthSubmitting === 'microsoft' ? 'Opening Microsoft...' : 'Continue with Microsoft'}
              </Button>
            </div>

            <div className="mt-2 text-xs text-muted">
              Already have an account?
              <Link className="ml-1 text-primary underline-offset-4 hover:underline" href="/">
                Go to app
              </Link>
            </div>
          </form>
        </div>

        <div className="mt-6 text-[11px] text-muted">
          UI running on port 3006 when started with <span className="font-mono">npm run dev:3006</span>.
        </div>
      </div>
    </div>
  )
}
