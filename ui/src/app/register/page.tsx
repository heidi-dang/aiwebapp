'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { useStore } from '@/store'

type RegisterResponse = {
  access_token: string
}

export default function RegisterPage() {
  const router = useRouter()
  const selectedEndpoint = useStore((s) => s.selectedEndpoint)
  const setAuthToken = useStore((s) => s.setAuthToken)

  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const canSubmit = useMemo(() => {
    return email.trim().length > 0 && name.trim().length > 0 && password.length >= 8
  }, [email, name, password])

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!canSubmit) return

    setIsSubmitting(true)
    try {
      const res = await fetch(`${selectedEndpoint}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), name: name.trim(), password })
      })

      if (!res.ok) {
        const msg = res.status === 409 ? 'Email already registered' : 'Registration failed'
        toast.error(msg)
        return
      }

      const data = (await res.json()) as RegisterResponse
      const token = typeof data?.access_token === 'string' ? data.access_token : ''
      if (!token) {
        toast.error('Registration succeeded but no token returned')
        return
      }

      setAuthToken(token)
      toast.success('Account created')
      router.push('/')
    } catch {
      toast.error('Registration failed')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background/80 px-4 font-dmmono">
      <div className="w-full max-w-md rounded-2xl border border-primary/10 bg-background p-6">
        <div className="text-sm font-medium uppercase text-white">Register</div>
        <div className="mt-1 text-xs text-muted">
          Create an account for this server endpoint.
        </div>

        <form className="mt-6 space-y-3" onSubmit={onSubmit}>
          <div className="space-y-1">
            <label className="text-xs font-medium uppercase text-primary">Email</label>
            <input
              className="h-10 w-full rounded-xl border border-primary/15 bg-accent px-3 text-xs text-muted"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              autoComplete="email"
              required
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium uppercase text-primary">Name</label>
            <input
              className="h-10 w-full rounded-xl border border-primary/15 bg-accent px-3 text-xs text-muted"
              value={name}
              onChange={(e) => setName(e.target.value)}
              type="text"
              autoComplete="name"
              required
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium uppercase text-primary">Password</label>
            <input
              className="h-10 w-full rounded-xl border border-primary/15 bg-accent px-3 text-xs text-muted"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
              autoComplete="new-password"
              minLength={8}
              required
            />
            <div className="text-[10px] text-muted">Minimum 8 characters</div>
          </div>

          <Button
            type="submit"
            size="lg"
            disabled={!canSubmit || isSubmitting}
            className="h-10 w-full rounded-xl bg-primary text-xs font-medium text-background hover:bg-primary/80"
          >
            {isSubmitting ? 'Creating...' : 'Create account'}
          </Button>

          <Button
            type="button"
            variant="ghost"
            size="lg"
            className="h-10 w-full rounded-xl text-xs font-medium"
            onClick={() => router.push('/')}
          >
            Back
          </Button>
        </form>
      </div>
    </div>
  )
}
