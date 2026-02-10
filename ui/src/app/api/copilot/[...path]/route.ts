import { NextRequest, NextResponse } from 'next/server'
import { headers } from 'next/headers'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

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
    return null
  }
  return `https://${subdomain}.${hostname}`
}

async function getCopilotBaseUrl() {
  const headersList = await headers()
  const forwardedHost = headersList.get('x-forwarded-host')
  const hostHeader = forwardedHost || headersList.get('host')
  const isLocal =
    hostHeader?.includes('localhost') || hostHeader?.includes('127.0.0.1')

  const derivedAiApiUrl = isLocal
    ? 'http://localhost:8080'
    : deriveSubdomainUrl('copilot', hostHeader)

  const envAiApi = process.env.NEXT_PUBLIC_AI_API_URL?.trim() ?? ''

  return envAiApi || derivedAiApiUrl || null
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const resolvedParams = await params
  return proxyRequest(request, resolvedParams.path)
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const resolvedParams = await params
  return proxyRequest(request, resolvedParams.path)
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const resolvedParams = await params
  return proxyRequest(request, resolvedParams.path)
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const resolvedParams = await params
  return proxyRequest(request, resolvedParams.path)
}

async function proxyRequest(request: NextRequest, path: string[]) {
  const copilotBaseUrl = await getCopilotBaseUrl()

  if (!copilotBaseUrl || copilotBaseUrl.trim() === '') {
    return NextResponse.json(
      { error: 'Copilot API base URL is not configured' },
      { status: 400 }
    )
  }

  const pathStr = path.join('/')
  const targetUrl = `${copilotBaseUrl.replace(/\/$/, '')}/${pathStr}`

  const url = new URL(request.url)
  const searchParams = url.searchParams.toString()
  const queryString = searchParams ? `?${searchParams}` : ''
  const finalUrl = `${targetUrl}${queryString}`

  try {
    let copilotHost: string
    try {
      copilotHost = new URL(copilotBaseUrl).host
    } catch (e) {
      console.error('Invalid copilotBaseUrl:', copilotBaseUrl)
      return NextResponse.json(
        { error: `Invalid Copilot API base URL: ${copilotBaseUrl}` },
        { status: 500 }
      )
    }

    const response = await fetch(finalUrl, {
      method: request.method,
      headers: {
        ...Object.fromEntries(request.headers.entries()),
        host: copilotHost
      },
      body:
        request.method !== 'GET' && request.method !== 'HEAD'
          ? await request.arrayBuffer()
          : undefined
    })

    const responseHeaders = new Headers()
    response.headers.forEach((value, key) => {
      if (
        ![
          'transfer-encoding',
          'connection',
          'keep-alive',
          'proxy-authenticate',
          'proxy-authorization',
          'te',
          'trailers'
        ].includes(key.toLowerCase())
      ) {
        responseHeaders.set(key, value)
      }
    })

    return new NextResponse(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders
    })
  } catch (error) {
    console.error('Copilot proxy error:', error)
    return NextResponse.json(
      { error: 'Failed to proxy request to Copilot API' },
      { status: 502 }
    )
  }
}
