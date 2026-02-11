import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function normalizeOllamaBaseUrl(input: string) {
  let url = input.trim()
  if (!url) return url
  url = url.replace(/\/$/, '')
  if (url.endsWith('/api')) url = url.slice(0, -4)
  url = url.replace(/\/$/, '')
  return url
}

function getOllamaBaseUrl() {
  const env = process.env.OLLAMA_API_URL?.trim() ?? ''
  const base = env || 'http://127.0.0.1:11434'
  return normalizeOllamaBaseUrl(base)
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
  const baseUrl = getOllamaBaseUrl()
  if (!baseUrl) {
    return NextResponse.json(
      { error: 'Ollama base URL is not configured' },
      { status: 400 }
    )
  }

  const pathStr = path.join('/')
  const targetUrl = `${baseUrl}/${pathStr}`

  const url = new URL(request.url)
  const searchParams = url.searchParams.toString()
  const queryString = searchParams ? `?${searchParams}` : ''
  const finalUrl = `${targetUrl}${queryString}`

  let targetHost: string
  try {
    targetHost = new URL(baseUrl).host
  } catch {
    return NextResponse.json(
      { error: `Invalid Ollama base URL: ${baseUrl}` },
      { status: 500 }
    )
  }

  try {
    const response = await fetch(finalUrl, {
      method: request.method,
      headers: {
        ...Object.fromEntries(request.headers.entries()),
        host: targetHost
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
  } catch {
    return NextResponse.json(
      { error: 'Failed to proxy request to Ollama' },
      { status: 502 }
    )
  }
}

