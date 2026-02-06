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
  if (!hostname || isLocalHostname(hostname)) {
    if (subdomain === 'copilot') return 'http://localhost:8080'
    if (subdomain === 'api') return 'http://localhost:3001'
    return null
  }
  return `https://${subdomain}.${hostname}`
}

export async function GET() {
  const headersList = await headers()
  // Check x-forwarded-host first (from Cloudflare tunnel), then fall back to host
  const forwardedHost = headersList.get('x-forwarded-host')
  const hostHeader = forwardedHost || headersList.get('host')
  const isLocal =
    hostHeader?.includes('localhost') || hostHeader?.includes('127.0.0.1')

  const derivedApiUrl = isLocal
    ? 'http://localhost:3001'
    : deriveSubdomainUrl('api', hostHeader)
  const derivedAiApiUrl = isLocal
    ? 'http://localhost:8080'
    : deriveSubdomainUrl('copilot', hostHeader)

  const envApi = process.env.NEXT_PUBLIC_API_URL ?? ''
  const envAiApi = process.env.NEXT_PUBLIC_AI_API_URL ?? ''

  const apiUrl = envApi || derivedApiUrl || 'http://localhost:3001'

  const aiApiUrl = envAiApi || derivedAiApiUrl || null

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
