import { NextRequest, NextResponse } from 'next/server'
import { headers } from 'next/headers'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function getApiUrl() {
  const headersList = await headers()
  const forwardedHost = headersList.get('x-forwarded-host')
  const hostHeader = forwardedHost || headersList.get('host')
  const isLocal =
    hostHeader?.includes('localhost') || hostHeader?.includes('127.0.0.1')

  const envApi = process.env.NEXT_PUBLIC_API_URL ?? ''
  const derived = isLocal
    ? 'http://localhost:4001'
    : `https://api.${hostHeader}`
  return envApi || derived
}

async function proxyRequest(request: NextRequest, pathParts: string[]) {
  const apiUrl = await getApiUrl()
  const pathStr = pathParts.join('/')
  const targetUrl = `${apiUrl.replace(/\/$/, '')}/knowledge/${pathStr}`

  const url = new URL(request.url)
  const searchParams = url.searchParams.toString()
  const queryString = searchParams ? `?${searchParams}` : ''
  const finalUrl = `${targetUrl}${queryString}`

  const headersObj: Record<string, string> = {}
  request.headers.forEach((value, key) => {
    if (
      ![
        'host',
        'connection',
        'transfer-encoding',
        'content-length',
        'content-encoding'
      ].includes(key.toLowerCase())
    ) {
      headersObj[key] = value
    }
  })

  if (process.env.NEXT_PUBLIC_OS_SECURITY_KEY) {
    headersObj['Authorization'] = `Bearer ${process.env.NEXT_PUBLIC_OS_SECURITY_KEY}`
  }

  const response = await fetch(finalUrl, {
    method: request.method,
    headers: headersObj,
    body:
      request.method !== 'GET' && request.method !== 'HEAD'
        ? await request.arrayBuffer()
        : undefined,
    cache: 'no-store'
  })

  const responseHeaders = new Headers()
  response.headers.forEach((value, key) => {
    if (
      ![
        'transfer-encoding',
        'connection',
        'content-encoding',
        'content-length'
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

