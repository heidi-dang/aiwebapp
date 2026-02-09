import { NextRequest, NextResponse } from 'next/server'

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
  const runnerUrl = process.env.RUNNER_URL ?? 'http://localhost:4002'
  const runnerToken = process.env.RUNNER_TOKEN ?? 'change_me'

  const pathStr = path.join('/')
  const targetUrl = `${runnerUrl}/${pathStr}`

  // Remove the /api/runner prefix from the URL
  const url = new URL(request.url)
  const searchParams = url.searchParams.toString()
  const queryString = searchParams ? `?${searchParams}` : ''

  const finalUrl = `${targetUrl}${queryString}`

  try {
    const response = await fetch(finalUrl, {
      method: request.method,
      headers: {
        ...Object.fromEntries(request.headers.entries()),
        Authorization: `Bearer ${runnerToken}`,
        // Remove host header to avoid conflicts
        host: new URL(runnerUrl).host
      },
      body:
        request.method !== 'GET' && request.method !== 'HEAD'
          ? await request.arrayBuffer()
          : undefined
    })

    const responseHeaders = new Headers()
    response.headers.forEach((value, key) => {
      // Skip certain headers that Next.js handles
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
    console.error('Runner proxy error:', error)
    return NextResponse.json(
      { error: 'Failed to proxy request to runner' },
      { status: 500 }
    )
  }
}
