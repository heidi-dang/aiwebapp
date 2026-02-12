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
  // The runner's API is mounted at /api/jobs, but the path here includes 'api/jobs' from the client call?
  // client calls /api/runner/api/jobs/...
  // path will be ['api', 'jobs', ...]
  // So we just join them.
  const targetUrl = `${runnerUrl}/${pathStr}`

  // Remove the /api/runner prefix from the URL
  const url = new URL(request.url)
  const searchParams = url.searchParams.toString()
  const queryString = searchParams ? `?${searchParams}` : ''

  const finalUrl = `${targetUrl}${queryString}`

  try {
    // Exclude headers that might interfere with proxying
    const headers = new Headers()
    const excludeHeaders = [
      'host',
      'connection',
      'transfer-encoding',
      'content-length',
      'content-encoding',
      'accept-encoding',
      'expect'
    ]
    
    request.headers.forEach((value, key) => {
      if (!excludeHeaders.includes(key.toLowerCase())) {
        headers.set(key, value)
      }
    })
    
    // Add auth token
    headers.set('Authorization', `Bearer ${runnerToken}`)

    const contentLength = Number(request.headers.get('content-length') ?? '0')
    const hasBody = Number.isFinite(contentLength) && contentLength > 0
    if (!hasBody) {
      headers.delete('content-type')
    }

    const response = await fetch(finalUrl, {
      method: request.method,
      headers,
      body:
        request.method !== 'GET' && request.method !== 'HEAD' && hasBody
          ? await request.arrayBuffer()
          : undefined,
      // @ts-expect-error - duplex is needed for some node versions/fetch implementations
      duplex: 'half', 
      cache: 'no-store'
    })

    const responseHeaders = new Headers()
    response.headers.forEach((value, key) => {
      // Skip certain headers that Next.js handles
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

    // Ensure SSE headers are set correctly if upstream is SSE
    if (response.headers.get('content-type')?.includes('text/event-stream')) {
        responseHeaders.set('Content-Type', 'text/event-stream')
        responseHeaders.set('Cache-Control', 'no-cache, no-transform')
        responseHeaders.set('Connection', 'keep-alive')
    }

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
