export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { headers } from 'next/headers'

function stripPort(host: string): string {
  const idx = host.indexOf(':')
  return idx === -1 ? host : host.slice(0, idx)
}

function isLocalHostname(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1'
}

function stripWww(hostname: string): string {
  return hostname.startsWith('www.') ? hostname.slice(4) : hostname
}

function deriveSubdomainUrl(subdomain: string, hostHeader: string | null) {
  if (!hostHeader) return null
  const hostname = stripWww(stripPort(hostHeader))
  if (!hostname || isLocalHostname(hostname)) return null
  return `https://${subdomain}.${hostname}`
}

function isLocalUrl(url: string): boolean {
  return url.startsWith('http://localhost') || url.startsWith('http://127.0.0.1')
}

export async function GET() {
  const hostHeader = (await headers()).get('host')
  const derivedApiUrl = deriveSubdomainUrl('api', hostHeader)
  const derivedAiApiUrl = deriveSubdomainUrl('copilot', hostHeader)

  const envApi = process.env.NEXT_PUBLIC_API_URL ?? ''
  const envAiApi = process.env.NEXT_PUBLIC_AI_API_URL ?? ''

  const apiUrl = isLocalUrl(envApi)
    ? (derivedApiUrl ?? envApi) || 'http://localhost:3001'
    : envApi || derivedApiUrl || 'http://localhost:3001'

  const aiApiUrl = isLocalUrl(envAiApi)
    ? derivedAiApiUrl ?? null
    : envAiApi || derivedAiApiUrl || null

  const payload = {
    apiUrl,
    aiApiUrl,
    runnerBaseUrl: process.env.RUNNER_BASE_URL ?? 'http://localhost:8788',
    hasEnvToken: !!process.env.NEXT_PUBLIC_OS_SECURITY_KEY
  }

  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  })
}
