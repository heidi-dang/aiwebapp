import { z } from 'zod'
import jwt from 'jsonwebtoken'
import { FastifyInstance } from 'fastify'

import { Store } from '../storage.js'
import { createUserAuthService } from '../user-auth.js'

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().optional()
})

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1)
})

function getBearerToken(authHeader: unknown): string | null {
  if (typeof authHeader !== 'string') return null
  const m = authHeader.match(/^Bearer\s+(.+)$/i)
  return m?.[1] ?? null
}

function getRequestBaseUrl(req: any): string {
  const xfProto = req.headers?.['x-forwarded-proto']
  const xfHost = req.headers?.['x-forwarded-host']
  const host = xfHost || req.headers?.host
  const proto = xfProto || req.protocol || 'http'
  return `${proto}://${host}`
}

type OAuthProvider = 'google' | 'github' | 'apple' | 'microsoft'

function isOAuthProvider(value: string): value is OAuthProvider {
  return value === 'google' || value === 'github' || value === 'apple' || value === 'microsoft'
}

function oauthStateSecret(): string {
  const secret = process.env.OAUTH_STATE_SECRET || process.env.JWT_SECRET
  if (!secret) throw new Error('OAuth state secret not configured (set OAUTH_STATE_SECRET or JWT_SECRET)')
  return secret
}

function issueState(payload: { provider: OAuthProvider; ui_origin: string; return_to?: string; popup?: boolean }): string {
  return jwt.sign(payload, oauthStateSecret(), { expiresIn: '10m' })
}

function verifyState(token: string): { provider: OAuthProvider; ui_origin: string; return_to?: string; popup?: boolean } {
  return jwt.verify(token, oauthStateSecret()) as {
    provider: OAuthProvider
    ui_origin: string
    return_to?: string
    popup?: boolean
  }
}

async function exchangeGitHubCode(args: { code: string; redirectUri: string }): Promise<{ access_token: string }> {
  const clientId = process.env.GITHUB_CLIENT_ID
  const clientSecret = process.env.GITHUB_CLIENT_SECRET
  if (!clientId || !clientSecret) throw new Error('GitHub OAuth not configured')

  const res = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json'
    },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code: args.code,
      redirect_uri: args.redirectUri
    })
  })

  const data = (await res.json().catch(() => null)) as any
  if (!res.ok || !data?.access_token) {
    throw new Error('GitHub token exchange failed')
  }
  return { access_token: data.access_token }
}

async function fetchGitHubProfile(accessToken: string): Promise<{ id: string; name?: string; email?: string; avatar_url?: string; raw: any }> {
  const userRes = await fetch('https://api.github.com/user', {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/vnd.github+json' }
  })
  const user = (await userRes.json().catch(() => null)) as any
  if (!userRes.ok || !user?.id) throw new Error('GitHub profile fetch failed')

  let email: string | undefined = typeof user?.email === 'string' ? user.email : undefined

  if (!email) {
    const emailsRes = await fetch('https://api.github.com/user/emails', {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/vnd.github+json' }
    })
    const emails = (await emailsRes.json().catch(() => null)) as any
    if (emailsRes.ok && Array.isArray(emails)) {
      const primary = emails.find((e: any) => e?.primary && e?.verified && typeof e?.email === 'string')
      const anyVerified = emails.find((e: any) => e?.verified && typeof e?.email === 'string')
      email = primary?.email || anyVerified?.email
    }
  }

  if (!email) throw new Error('GitHub account has no accessible email')

  return {
    id: String(user.id),
    name: typeof user?.name === 'string' ? user.name : typeof user?.login === 'string' ? user.login : undefined,
    email,
    avatar_url: typeof user?.avatar_url === 'string' ? user.avatar_url : undefined,
    raw: user
  }
}

async function exchangeOAuthCode(args: {
  tokenUrl: string
  code: string
  redirectUri: string
  clientId: string
  clientSecret: string
}): Promise<any> {
  const res = await fetch(args.tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code: args.code,
      redirect_uri: args.redirectUri,
      client_id: args.clientId,
      client_secret: args.clientSecret
    })
  })

  const data = (await res.json().catch(() => null)) as any
  if (!res.ok) throw new Error('OAuth token exchange failed')
  return data
}

async function fetchJson(url: string, headers: Record<string, string>) {
  const res = await fetch(url, { headers })
  const data = await res.json().catch(() => null)
  if (!res.ok) throw new Error(`OAuth userinfo fetch failed: ${res.status}`)
  return data as any
}

function renderPopupResultHtml(args: { origin: string; payload: unknown }): string {
  const safeOrigin = args.origin || '*'
  const json = JSON.stringify(args.payload)
  return `<!doctype html><html><head><meta charset="utf-8" /></head><body><script>(function(){\n  try {\n    if (window.opener && typeof window.opener.postMessage === 'function') {\n      window.opener.postMessage(${json}, ${JSON.stringify(safeOrigin)});\n    }\n  } catch (e) {}\n  try { window.close(); } catch (e) {}\n})();</script></body></html>`
}

function getAllowedUiOrigins(): string[] {
  const base = (process.env.CORS_ORIGIN ?? '').trim()
  const hardcoded = ['https://heidiai.com.au', 'https://www.heidiai.com.au', 'https://api.heidiai.com.au']
  return [base, ...hardcoded].filter(Boolean)
}

function isAllowedUiOrigin(origin: string): boolean {
  const allowed = getAllowedUiOrigins()
  if (allowed.length === 0) return false
  try {
    const parsed = new URL(origin)
    return allowed.includes(parsed.origin)
  } catch {
    return false
  }
}

function validateReturnTo(uiOrigin: string, returnTo: string): string | null {
  if (!returnTo) return null
  let url: URL
  try {
    url = new URL(returnTo)
  } catch {
    return null
  }
  if (url.origin !== uiOrigin) return null
  return url.toString()
}

export default function createAuthRoutes(store: Store) {
  const auth = createUserAuthService(store)

  return async function registerAuthRoutes(app: FastifyInstance) {
    app.post('/register', async (req, reply) => {
      const parsed = registerSchema.safeParse(req.body)
      if (!parsed.success) return reply.code(400).send({ error: 'Invalid registration data', details: parsed.error.errors })

      try {
        const tokens = await auth.register(parsed.data)
        return reply.send(tokens)
      } catch (err) {
        return reply.code(400).send({ error: (err as Error).message })
      }
    })

    app.post('/login', async (req, reply) => {
      const parsed = loginSchema.safeParse(req.body)
      if (!parsed.success) return reply.code(400).send({ error: 'Invalid login data', details: parsed.error.errors })

      try {
        const tokens = await auth.login(parsed.data)
        return reply.send(tokens)
      } catch (err) {
        return reply.code(401).send({ error: (err as Error).message })
      }
    })

    app.get('/me', async (req, reply) => {
      const token = getBearerToken((req.headers as any)?.authorization)
      if (!token) return reply.code(401).send({ error: 'Missing bearer token' })

      const user = await auth.authenticate(token)
      if (!user) return reply.code(401).send({ error: 'Invalid token' })

      return reply.send({ user })
    })

    app.post('/logout', async (req, reply) => {
      const token = getBearerToken((req.headers as any)?.authorization)
      if (!token) return reply.code(401).send({ error: 'Missing bearer token' })

      const ok = await auth.logout(token)
      return reply.send({ ok })
    })

    app.get('/oauth/:provider/start', async (req, reply) => {
      const providerRaw = String((req.params as any)?.provider || '')
      if (!isOAuthProvider(providerRaw)) return reply.code(404).send({ error: 'Unknown provider' })
      const provider = providerRaw

      const serverBase = process.env.SERVER_PUBLIC_URL || getRequestBaseUrl(req)
      const redirectUri = `${serverBase}/auth/oauth/${provider}/callback`

      const query = (req.query ?? {}) as any
      const uiOrigin = typeof query.ui_origin === 'string' ? query.ui_origin : ''
      const returnTo = typeof query.return_to === 'string' ? query.return_to : ''
      const popup = query.popup === '1' || query.popup === 'true'
      if (!uiOrigin) return reply.code(400).send({ error: 'Missing ui_origin' })

      if (!isAllowedUiOrigin(uiOrigin)) {
        return reply.code(403).send({ error: 'ui_origin not allowed' })
      }

      const validatedReturnTo = validateReturnTo(uiOrigin, returnTo)
      const state = issueState({ provider, ui_origin: uiOrigin, return_to: validatedReturnTo || undefined, popup })

      if (provider === 'github') {
        const clientId = process.env.GITHUB_CLIENT_ID
        if (!clientId) return reply.code(500).send({ error: 'GitHub OAuth not configured' })
        const url = new URL('https://github.com/login/oauth/authorize')
        url.searchParams.set('client_id', clientId)
        url.searchParams.set('redirect_uri', redirectUri)
        url.searchParams.set('scope', 'read:user user:email')
        url.searchParams.set('state', state)
        return reply.redirect(url.toString())
      }

      if (provider === 'google') {
        const clientId = process.env.GOOGLE_CLIENT_ID
        if (!clientId) return reply.code(500).send({ error: 'Google OAuth not configured' })
        const url = new URL('https://accounts.google.com/o/oauth2/v2/auth')
        url.searchParams.set('client_id', clientId)
        url.searchParams.set('redirect_uri', redirectUri)
        url.searchParams.set('response_type', 'code')
        url.searchParams.set('scope', 'openid email profile')
        url.searchParams.set('state', state)
        url.searchParams.set('access_type', 'offline')
        url.searchParams.set('prompt', 'consent')
        return reply.redirect(url.toString())
      }

      if (provider === 'microsoft') {
        const clientId = process.env.MICROSOFT_CLIENT_ID
        if (!clientId) return reply.code(500).send({ error: 'Microsoft OAuth not configured' })
        const url = new URL('https://login.microsoftonline.com/common/oauth2/v2.0/authorize')
        url.searchParams.set('client_id', clientId)
        url.searchParams.set('redirect_uri', redirectUri)
        url.searchParams.set('response_type', 'code')
        url.searchParams.set('scope', 'openid email profile User.Read')
        url.searchParams.set('state', state)
        return reply.redirect(url.toString())
      }

      if (provider === 'apple') {
        const clientId = process.env.APPLE_CLIENT_ID
        if (!clientId) return reply.code(500).send({ error: 'Apple OAuth not configured' })
        const url = new URL('https://appleid.apple.com/auth/authorize')
        url.searchParams.set('client_id', clientId)
        url.searchParams.set('redirect_uri', redirectUri)
        url.searchParams.set('response_type', 'code')
        url.searchParams.set('response_mode', 'query')
        url.searchParams.set('scope', 'name email')
        url.searchParams.set('state', state)
        return reply.redirect(url.toString())
      }

      return reply.code(500).send({ error: 'Unsupported provider' })
    })

    app.get('/oauth/:provider/callback', async (req, reply) => {
      const providerRaw = String((req.params as any)?.provider || '')
      if (!isOAuthProvider(providerRaw)) return reply.code(404).send('Unknown provider')
      const provider = providerRaw

      const query = (req.query ?? {}) as any
      const error = typeof query.error === 'string' ? query.error : ''
      if (error) return reply.code(400).send(error)

      const code = typeof query.code === 'string' ? query.code : ''
      const stateToken = typeof query.state === 'string' ? query.state : ''
      if (!code || !stateToken) return reply.code(400).send('Missing code/state')

      let state: { provider: OAuthProvider; ui_origin: string; return_to?: string; popup?: boolean }
      try {
        state = verifyState(stateToken)
      } catch {
        return reply.code(400).send('Invalid state')
      }

      const serverBase = process.env.SERVER_PUBLIC_URL || getRequestBaseUrl(req)
      const redirectUri = `${serverBase}/auth/oauth/${provider}/callback`

      try {
        let profile: { id: string; email: string; name?: string; avatar_url?: string }
        let providerData: any = {}

        if (provider === 'github') {
          const token = await exchangeGitHubCode({ code, redirectUri })
          const gh = await fetchGitHubProfile(token.access_token)
          profile = { id: gh.id, email: gh.email!, name: gh.name, avatar_url: gh.avatar_url }
          providerData = { token, user: gh.raw }
        } else if (provider === 'google') {
          const clientId = process.env.GOOGLE_CLIENT_ID
          const clientSecret = process.env.GOOGLE_CLIENT_SECRET
          if (!clientId || !clientSecret) throw new Error('Google OAuth not configured')
          const token = await exchangeOAuthCode({
            tokenUrl: 'https://oauth2.googleapis.com/token',
            code,
            redirectUri,
            clientId,
            clientSecret
          })
          const userinfo = await fetchJson('https://openidconnect.googleapis.com/v1/userinfo', {
            Authorization: `Bearer ${token.access_token}`
          })
          if (!userinfo?.sub || !userinfo?.email) throw new Error('Google userinfo missing fields')
          profile = {
            id: String(userinfo.sub),
            email: String(userinfo.email),
            name: typeof userinfo?.name === 'string' ? userinfo.name : undefined,
            avatar_url: typeof userinfo?.picture === 'string' ? userinfo.picture : undefined
          }
          providerData = { token, userinfo }
        } else if (provider === 'microsoft') {
          const clientId = process.env.MICROSOFT_CLIENT_ID
          const clientSecret = process.env.MICROSOFT_CLIENT_SECRET
          if (!clientId || !clientSecret) throw new Error('Microsoft OAuth not configured')
          const token = await exchangeOAuthCode({
            tokenUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
            code,
            redirectUri,
            clientId,
            clientSecret
          })
          const me = await fetchJson('https://graph.microsoft.com/v1.0/me', {
            Authorization: `Bearer ${token.access_token}`
          })
          const email = typeof me?.mail === 'string' ? me.mail : typeof me?.userPrincipalName === 'string' ? me.userPrincipalName : ''
          if (!me?.id || !email) throw new Error('Microsoft profile missing fields')
          profile = {
            id: String(me.id),
            email,
            name: typeof me?.displayName === 'string' ? me.displayName : undefined
          }
          providerData = { token, me }
        } else {
          const clientId = process.env.APPLE_CLIENT_ID
          const clientSecret = process.env.APPLE_CLIENT_SECRET
          if (!clientId || !clientSecret) throw new Error('Apple OAuth not configured')
          const token = await fetch('https://appleid.apple.com/auth/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
              grant_type: 'authorization_code',
              code,
              redirect_uri: redirectUri,
              client_id: clientId,
              client_secret: clientSecret
            })
          })
          const data = (await token.json().catch(() => null)) as any
          if (!token.ok || !data?.id_token) throw new Error('Apple token exchange failed')
          const decoded = jwt.decode(data.id_token) as any
          if (!decoded?.sub || !decoded?.email) throw new Error('Apple id_token missing fields')
          profile = {
            id: String(decoded.sub),
            email: String(decoded.email),
            name: undefined
          }
          providerData = { token: data, id_token: decoded }
        }

        const tokens = await auth.oauthLogin({
          id: profile.id,
          email: profile.email,
          name: profile.name,
          avatar_url: profile.avatar_url,
          provider
        }, providerData)

        if (state.popup) {
          return reply
            .type('text/html; charset=utf-8')
            .send(renderPopupResultHtml({ origin: state.ui_origin, payload: { ok: true, tokens, return_to: state.return_to } }))
        }

        return reply.send({ ok: true, tokens, return_to: state.return_to })
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        if (state.popup) {
          return reply
            .type('text/html; charset=utf-8')
            .send(renderPopupResultHtml({ origin: state.ui_origin, payload: { ok: false, error: message } }))
        }
        return reply.code(400).send({ ok: false, error: message })
      }
    })
  }
}