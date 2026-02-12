import type { RunnerEvent, RunnerEventType } from './types'

const RUNNER_URL = process.env.NEXT_PUBLIC_RUNNER_URL ?? '/api/runner'
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? '/api' // Server API URL

function base(path: string) {
  // Ensure we don't double-up slashes when joining
  if (RUNNER_URL.endsWith('/')) {
    return `${RUNNER_URL.replace(/\/$/, '')}${path}`
  }
  return `${RUNNER_URL}${path}`
}

function apiBase(path: string) {
    // For Server API calls
    // If path starts with http, use it as is
    if (path.startsWith('http')) return path
    
    // Ensure we don't double-up slashes
    const prefix = API_URL.endsWith('/') ? API_URL.replace(/\/$/, '') : API_URL
    return `${prefix}${path}`
}

function getAuthHeaders() {
  // Auth headers are added by the Next.js API proxy route server-side
  return {}
}

export async function createJob(input?: unknown, timeoutMs?: number) {
  const res = await fetch(base('/api/jobs'), {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify({ input, timeout_ms: timeoutMs })
  })

  if (!res.ok) {
    throw new Error(`createJob failed: ${res.status}`)
  }

  const ct = res.headers.get('content-type') || ''
  if (!ct.includes('application/json')) {
    const txt = await res.text()
    console.error('createJob returned non-JSON response:', txt)
    throw new Error('createJob returned non-JSON response')
  }

  const data = (await res.json()) as { id: string }
  return { jobId: data.id }
}

export async function createAgentRun(agentId: string, message: string, sessionId?: string) {
    // Call Server API instead of Runner
    const res = await fetch(apiBase(`/agents/${encodeURIComponent(agentId)}/runs`), {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ message, session_id: sessionId })
    })

    if (!res.ok) {
        const text = await res.text()
        throw new Error(`createAgentRun failed: ${res.status} ${text}`)
    }

    const data = await res.json()
    // data should be { jobId: string, sessionId: string, status: string }
    return data
}

export async function startJob(jobId: string) {
  const res = await fetch(
    base(`/api/jobs/${encodeURIComponent(jobId)}/start`),
    {
      method: 'POST',
      headers: getAuthHeaders()
    }
  )

  if (!res.ok) {
    throw new Error(`startJob failed: ${res.status}`)
  }

  return res.json()
}

export async function cancelJob(jobId: string) {
  const res = await fetch(
    base(`/api/jobs/${encodeURIComponent(jobId)}/cancel`),
    {
      method: 'POST',
      headers: getAuthHeaders()
    }
  )

  if (!res.ok) {
    throw new Error(`cancelJob failed: ${res.status}`)
  }

  return res.json()
}

export async function approveJob(jobId: string, tokenId: string, approved: boolean) {
  const res = await fetch(
    base(`/api/jobs/${encodeURIComponent(jobId)}/approval`),
    {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...getAuthHeaders() },
      body: JSON.stringify({ tokenId, approved })
    }
  )

  if (!res.ok) {
    throw new Error(`approveJob failed: ${res.status}`)
  }

  return res.json()
}

export async function getJob(jobId: string) {
  const res = await fetch(base(`/api/jobs/${encodeURIComponent(jobId)}`), {
    method: 'GET'
  })

  if (!res.ok) {
    throw new Error(`getJob failed: ${res.status}`)
  }

  return res.json()
}

type StreamCallbacks = {
  onEvent: (event: RunnerEvent) => void
  onError?: (err: unknown) => void
  onDone?: () => void
}

export function streamJobEvents(jobId: string, cb: StreamCallbacks, useServerProxy = false) {
  // If useServerProxy is true, use the Server API proxy endpoint
  // Otherwise use the Runner API endpoint (legacy/direct)
  
  let url: string
  if (useServerProxy) {
     url = apiBase(`/runs/${encodeURIComponent(jobId)}/events`) // /api/runs/:jobId/events
  } else {
     url = base(`/api/jobs/${encodeURIComponent(jobId)}/events`)
  }

  const es = new EventSource(url, { withCredentials: true })

  const seen = new Set<string>()

  const handle = (e: MessageEvent) => {
    if (!e.data) return

    let parsed: RunnerEvent
    try {
      parsed = JSON.parse(String(e.data)) as RunnerEvent
    } catch {
      return
    }

    // Filter duplicates if ID is present
    if (parsed.id) {
        if (seen.has(parsed.id)) return
        seen.add(parsed.id)
    }

    cb.onEvent(parsed)

    if (parsed.type === 'done') {
        // RunCompleted
        cb.onDone?.()
        es.close()
    }
  }

  const types: RunnerEventType[] = [
    'job.started',
    'job.cancelled',
    'job.timeout',
    'plan',
    'plan.update',
    'tool.start',
    'tool.output',
    'tool.end',
    'tool.refused',
    'approval.request',
    'approval.response',
    'error',
    'done'
  ]

  for (const t of types) {
    es.addEventListener(t, handle as EventListener)
  }
  
  // Also listen to default 'message' event which some SSE implementations use
  es.onmessage = handle

  es.onerror = (e) => {
    // Check if readyState is CLOSED (2), which might just mean the stream ended naturally if the server closed it
    if (es.readyState === 2) {
       // Only trigger done if we haven't already
    } else {
       cb.onError?.(new Error('Runner SSE connection error'))
    }
  }

  return () => {
    es.close()
  }
}
