import type { RunnerEvent, RunnerEventType } from './types'

const RUNNER_URL = process.env.NEXT_PUBLIC_RUNNER_URL ?? '/runner'

function base(path: string) {
  // Ensure we don't double-up slashes when joining
  if (RUNNER_URL.endsWith('/')) {
    return `${RUNNER_URL.replace(/\/$/, '')}${path}`
  }
  return `${RUNNER_URL}${path}`
}

function getAuthHeaders() {
  const token = process.env.NEXT_PUBLIC_RUNNER_TOKEN
  if (token) {
    return { 'Authorization': `Bearer ${token}` }
  }
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

  const data = (await res.json()) as { id: string }
  return { jobId: data.id }
}

export async function startJob(jobId: string) {
  const res = await fetch(base(`/api/jobs/${encodeURIComponent(jobId)}/start`), {
    method: 'POST',
    headers: getAuthHeaders()
  })

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

export function streamJobEvents(jobId: string, cb: StreamCallbacks) {
  const url = base(`/api/jobs/${encodeURIComponent(jobId)}/events`)
  const es = new EventSource(url)

  const seen = new Set<string>()

  const handle = (e: MessageEvent) => {
    if (!e.data) return

    let parsed: RunnerEvent
    try {
      parsed = JSON.parse(String(e.data)) as RunnerEvent
    } catch {
      return
    }

    if (!parsed?.id) return
    if (seen.has(parsed.id)) return
    seen.add(parsed.id)

    cb.onEvent(parsed)

    if (parsed.type === 'done') cb.onDone?.()
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
    'error',
    'done'
  ]

  for (const t of types) {
    es.addEventListener(t, handle as EventListener)
  }

  es.onerror = (err) => {
    cb.onError?.(err)
  }

  return () => {
    es.close()
  }
}
