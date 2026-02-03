import { NextRequest } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function getRunnerBaseUrl() {
  return process.env.RUNNER_BASE_URL ?? 'http://localhost:8788'
}

function getRunnerToken() {
  const token = process.env.RUNNER_TOKEN
  if (!token) {
    throw new Error('Missing RUNNER_TOKEN env var (server-side)')
  }
  return token
}

function buildTargetUrl(req: NextRequest, pathParts: string[]) {
  const base = getRunnerBaseUrl().replace(/\/$/, '')
  const path = pathParts.map(encodeURIComponent).join('/')
  const url = new URL(`${base}/${path}`)

  // Preserve query string
  req.nextUrl.searchParams.forEach((value, key) => {
    url.searchParams.append(key, value)
  })

  return url
}

function filterResponseHeaders(headers: Headers) {
  const out = new Headers()
  headers.forEach((value, key) => {
    const k = key.toLowerCase()
    if (
      k === 'content-encoding' ||
      k === 'content-length' ||
      k === 'transfer-encoding' ||
      k === 'connection' ||
      k === 'keep-alive'
    ) {
      return
    }
    out.set(key, value)
  })
  return out
}

async function proxy(req: NextRequest, pathParts: string[]) {
  const url = buildTargetUrl(req, pathParts)

  const upstreamHeaders = new Headers()
  const contentType = req.headers.get('content-type')
  const accept = req.headers.get('accept')
  if (contentType) upstreamHeaders.set('content-type', contentType)
  if (accept) upstreamHeaders.set('accept', accept)

  upstreamHeaders.set('authorization', `Bearer ${getRunnerToken()}`)

  const method = req.method.toUpperCase()
  const hasBody = method !== 'GET' && method !== 'HEAD'
  const body = hasBody ? await req.arrayBuffer() : undefined

  const upstream = await fetch(url, {
    method,
    headers: upstreamHeaders,
    body
  })

  return new Response(upstream.body, {
    status: upstream.status,
    headers: filterResponseHeaders(upstream.headers)
  })
}

export async function GET(req: NextRequest, ctx: { params: { path: string[] } }) {
  return proxy(req, ctx.params.path)
}

export async function POST(req: NextRequest, ctx: { params: { path: string[] } }) {
  return proxy(req, ctx.params.path)
}

export async function DELETE(req: NextRequest, ctx: { params: { path: string[] } }) {
  return proxy(req, ctx.params.path)
}

export async function PUT(req: NextRequest, ctx: { params: { path: string[] } }) {
  return proxy(req, ctx.params.path)
}

export async function PATCH(req: NextRequest, ctx: { params: { path: string[] } }) {
  return proxy(req, ctx.params.path)
}
