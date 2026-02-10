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

export async function POST(request: NextRequest) {
  try {
    const apiUrl = await getApiUrl()
    const body = await request.json()

    const headersObj: Record<string, string> = {
      'Content-Type': 'application/json'
    }
    if (process.env.NEXT_PUBLIC_OS_SECURITY_KEY) {
      headersObj['Authorization'] =
        `Bearer ${process.env.NEXT_PUBLIC_OS_SECURITY_KEY}`
    }

    const res = await fetch(`${apiUrl}/internal/toolbox`, {
      method: 'POST',
      headers: headersObj,
      body: JSON.stringify(body)
    })

    const text = await res.text()
    const ct = res.headers.get('content-type') || ''
    const status = res.status
    if (!ct.includes('application/json')) {
      return new NextResponse(text, { status })
    }
    return new NextResponse(text, {
      status,
      headers: { 'Content-Type': 'application/json' }
    })
  } catch (err) {
    return new NextResponse(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }
}
