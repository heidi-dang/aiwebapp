import Fastify from 'fastify'
import cors from '@fastify/cors'
import type { FastifyReply, FastifyRequest } from 'fastify'

type JobStatus = 'pending' | 'running' | 'done' | 'cancelled' | 'timeout' | 'error'

type RunnerEventType =
  | 'job.started'
  | 'job.cancelled'
  | 'job.timeout'
  | 'plan'
  | 'plan.update'
  | 'tool.start'
  | 'tool.output'
  | 'tool.end'
  | 'error'
  | 'done'

type RunnerEvent = {
  id: string
  type: RunnerEventType
  ts: string
  job_id: string
  data?: unknown
}

type JobRecord = {
  id: string
  status: JobStatus
  created_at: string
  started_at?: string
  finished_at?: string
  timeout_ms?: number
  input?: unknown
  events: RunnerEvent[]
  subscribers: Set<FastifyReply>
  timeoutHandle?: NodeJS.Timeout
  workHandle?: NodeJS.Timeout
}

const PORT = Number(process.env.PORT ?? 8788)
const CORS_ORIGIN = process.env.CORS_ORIGIN ?? 'http://localhost:3000'

function requireEnv(name: string): string {
  const v = process.env[name]
  if (!v) throw new Error(`Missing required env var: ${name}`)
  return v
}

function nowIso() {
  return new Date().toISOString()
}

function randomId(prefix: string) {
  return `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now()}`
}

function isAuthed(req: FastifyRequest, token: string) {
  const header = req.headers.authorization
  if (!header) return false
  const [scheme, value] = header.split(' ')
  if (scheme !== 'Bearer') return false
  return value === token
}

function sendSse(reply: FastifyReply, event: RunnerEvent) {
  reply.raw.write(`event: ${event.type}\n`)
  reply.raw.write(`data: ${JSON.stringify(event)}\n\n`)
}

async function main() {
  const RUNNER_TOKEN = requireEnv('RUNNER_TOKEN')

  const app = Fastify({
    logger: true
  })

  app.setErrorHandler((error: unknown, req: FastifyRequest, reply: FastifyReply) => {
    req.log.error({ err: error }, 'Unhandled error')
    const message = error instanceof Error ? error.message : String(error)
    reply.code(500).send({ detail: message })
  })

  await app.register(cors, {
    origin: [CORS_ORIGIN, 'http://localhost:3000', 'http://localhost:3001'],
    credentials: true,
    methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
  })

  app.addHook('onRequest', async (req: FastifyRequest, reply: FastifyReply) => {
    if (req.url.startsWith('/health')) return

    if (!isAuthed(req, RUNNER_TOKEN)) {
      reply.code(401).send({ detail: 'Unauthorized' })
    }
  })

  const jobs = new Map<string, JobRecord>()

  app.get('/health', async () => {
    return { ok: true }
  })

  app.post<{
    Body: {
      input?: unknown
      timeout_ms?: number
    }
  }>('/v1/jobs', async (req: FastifyRequest<{ Body: { input?: unknown; timeout_ms?: number } }>) => {
    const id = randomId('job')
    const job: JobRecord = {
      id,
      status: 'pending',
      created_at: nowIso(),
      timeout_ms: req.body?.timeout_ms,
      input: req.body?.input,
      events: [],
      subscribers: new Set()
    }

    jobs.set(id, job)

    return {
      id,
      status: job.status,
      created_at: job.created_at
    }
  })

  app.get('/v1/jobs/:jobId', async (req: FastifyRequest, reply: FastifyReply) => {
    const { jobId } = req.params as { jobId: string }
    const job = jobs.get(jobId)
    if (!job) return reply.code(404).send({ detail: 'Job not found' })

    return {
      id: job.id,
      status: job.status,
      created_at: job.created_at,
      started_at: job.started_at,
      finished_at: job.finished_at
    }
  })

  app.post('/v1/jobs/:jobId/start', async (req: FastifyRequest, reply: FastifyReply) => {
    const { jobId } = req.params as { jobId: string }
    const job = jobs.get(jobId)
    if (!job) return reply.code(404).send({ detail: 'Job not found' })
    if (job.status !== 'pending') return reply.code(400).send({ detail: 'Job not pending' })

    job.status = 'running'
    job.started_at = nowIso()

    const startedEvent: RunnerEvent = {
      id: randomId('evt'),
      type: 'job.started',
      ts: nowIso(),
      job_id: job.id
    }

    job.events.push(startedEvent)
    for (const sub of job.subscribers) sendSse(sub, startedEvent)

    if (job.timeout_ms && job.timeout_ms > 0) {
      job.timeoutHandle = setTimeout(() => {
        if (job.status !== 'running') return
        job.status = 'timeout'
        job.finished_at = nowIso()

        const ev: RunnerEvent = {
          id: randomId('evt'),
          type: 'job.timeout',
          ts: nowIso(),
          job_id: job.id
        }

        job.events.push(ev)
        for (const sub of job.subscribers) sendSse(sub, ev)

        const doneEv: RunnerEvent = {
          id: randomId('evt'),
          type: 'done',
          ts: nowIso(),
          job_id: job.id,
          data: { status: job.status }
        }

        job.events.push(doneEv)
        for (const sub of job.subscribers) sendSse(sub, doneEv)
        for (const sub of job.subscribers) sub.raw.end()
        job.subscribers.clear()
      }, job.timeout_ms)
    }

    job.workHandle = setTimeout(() => {
      if (job.status !== 'running') return

      job.status = 'done'
      job.finished_at = nowIso()

      const doneEv: RunnerEvent = {
        id: randomId('evt'),
        type: 'done',
        ts: nowIso(),
        job_id: job.id,
        data: { status: job.status }
      }

      job.events.push(doneEv)
      for (const sub of job.subscribers) sendSse(sub, doneEv)
      for (const sub of job.subscribers) sub.raw.end()
      job.subscribers.clear()

      if (job.timeoutHandle) clearTimeout(job.timeoutHandle)
    }, 500)

    return { id: job.id, status: job.status, started_at: job.started_at }
  })

  app.post('/v1/jobs/:jobId/cancel', async (req: FastifyRequest, reply: FastifyReply) => {
    const { jobId } = req.params as { jobId: string }
    const job = jobs.get(jobId)
    if (!job) return reply.code(404).send({ detail: 'Job not found' })
    if (job.status !== 'pending' && job.status !== 'running') {
      return reply.code(400).send({ detail: 'Job not cancellable' })
    }

    job.status = 'cancelled'
    job.finished_at = nowIso()

    if (job.timeoutHandle) clearTimeout(job.timeoutHandle)
    if (job.workHandle) clearTimeout(job.workHandle)

    const ev: RunnerEvent = {
      id: randomId('evt'),
      type: 'job.cancelled',
      ts: nowIso(),
      job_id: job.id
    }

    job.events.push(ev)
    for (const sub of job.subscribers) sendSse(sub, ev)

    const doneEv: RunnerEvent = {
      id: randomId('evt'),
      type: 'done',
      ts: nowIso(),
      job_id: job.id,
      data: { status: job.status }
    }

    job.events.push(doneEv)
    for (const sub of job.subscribers) sendSse(sub, doneEv)
    for (const sub of job.subscribers) sub.raw.end()
    job.subscribers.clear()

    return { id: job.id, status: job.status, finished_at: job.finished_at }
  })

  app.get('/v1/jobs/:jobId/events', async (req: FastifyRequest, reply: FastifyReply) => {
    const { jobId } = req.params as { jobId: string }
    const job = jobs.get(jobId)
    if (!job) return reply.code(404).send({ detail: 'Job not found' })

    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive'
    })

    if (typeof reply.raw.flushHeaders === 'function') reply.raw.flushHeaders()

    for (const ev of job.events) sendSse(reply, ev)

    job.subscribers.add(reply)

    req.raw.on('close', () => {
      job.subscribers.delete(reply)
    })

    return reply
  })

  await app.listen({ port: PORT, host: '0.0.0.0' })
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err)
  process.exit(1)
})
