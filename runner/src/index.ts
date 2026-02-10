import { tracingService } from './tracing.js';
tracingService.start();

import dotenv from 'dotenv'
import dotenvExpand from 'dotenv-expand'
const envConfig = dotenv.config({ path: '../.env' })
dotenvExpand.expand(envConfig)

import Fastify from 'fastify'
import cors from '@fastify/cors'
import type { FastifyReply, FastifyRequest } from 'fastify'

import { createSqliteStore, createInMemoryStore, type JobStore, type RunnerEvent, type JobStatus } from './db.js'
import { executeJob, type JobInput } from './executor.js'
import { approvalService } from './services/approval.js'

function requireEnv(name: string): string {
  const v = process.env[name]
  if (!v) throw new Error(`Missing required env var: ${name}`)
  return v
}

const PORT = Number(process.env.RUNNER_PORT ?? 4002)
const CORS_ORIGIN = process.env.CORS_ORIGIN ?? 'http://localhost:4000'
const DB_PATH = process.env.RUNNER_DB ?? './runner.db'
const USE_SQLITE = process.env.RUNNER_PERSIST !== 'false'
const MAX_CONCURRENCY = Number(process.env.RUNNER_MAX_CONCURRENCY ?? 2)

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

// In-memory subscriber tracking (SSE connections per job)
// Using a simple object as a lock for subscriber operations to prevent race conditions
const jobSubscribers = new Map<string, Set<FastifyReply>>()
const subscriberLock = new Map<string, Promise<void>>()

async function withSubscriberLock(jobId: string, action: () => Promise<void> | void) {
  // Simple mutex for job-specific subscriber operations
  while (subscriberLock.has(jobId)) {
    await subscriberLock.get(jobId)
  }
  
  let resolveLock: () => void
  const lockPromise = new Promise<void>(resolve => { resolveLock = resolve })
  subscriberLock.set(jobId, lockPromise)
  
  try {
    await action()
  } finally {
    subscriberLock.delete(jobId)
    resolveLock!()
  }
}

// Active job handles for cancellation/timeout
const jobHandles = new Map<string, { timeoutHandle?: NodeJS.Timeout; cancel: () => void; controller: AbortController }>()

async function main() {
  const RUNNER_TOKEN = requireEnv('RUNNER_TOKEN')

  // Initialize store
  let store: JobStore
  if (USE_SQLITE) {
    console.log(`Using SQLite store: ${DB_PATH}`)
    try {
      store = await createSqliteStore(DB_PATH)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.warn(`SQLite store failed (${message}); falling back to in-memory store`)
      store = createInMemoryStore()
    }
  } else {
    console.log('Using in-memory store')
    store = createInMemoryStore()
  }

  const app = Fastify({
    logger: true
  })

  app.setErrorHandler((error: unknown, req: FastifyRequest, reply: FastifyReply) => {
    req.log.error({ err: error }, 'Unhandled error')
    const message = error instanceof Error ? error.message : String(error)
    reply.code(500).send({ detail: message })
  })

  await app.register(cors, {
    origin: [CORS_ORIGIN, 'http://localhost:4000', 'http://localhost:4001'],
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

  // Health check
  app.get('/health', async (req, reply) => {
    return { ok: true, persist: USE_SQLITE }
  })

  // Test endpoint
  app.get('/test', async (req, reply) => {
    return { message: 'Test endpoint is working' };
  });

  // List jobs
  app.get('/api/jobs', async (req: FastifyRequest<{ Querystring: { limit?: string } }>) => {
    const limit = Number(req.query.limit) || 50
    const jobs = await store.listJobs(limit)
    return { jobs }
  })

  // Create job
  app.post<{
    Body: {
      input?: JobInput
      timeout_ms?: number
    }
  }>('/api/jobs', async (req: FastifyRequest<{ Body: { input?: JobInput; timeout_ms?: number } }>) => {
    const id = randomId('job')
    const timeoutMs = req.body?.timeout_ms
    const input = req.body?.input

    await store.createJob(id, input, timeoutMs)
    await withSubscriberLock(id, () => {
      jobSubscribers.set(id, new Set())
    })

    return {
      id,
      status: 'pending',
      created_at: nowIso()
    }
  })

  // Get job details
  app.get('/api/jobs/:jobId', async (req: FastifyRequest, reply: FastifyReply) => {
    const { jobId } = req.params as { jobId: string }
    const job = await store.getJob(jobId)
    if (!job) return reply.code(404).send({ detail: 'Job not found' })

    return {
      id: job.id,
      status: job.status,
      created_at: job.created_at,
      started_at: job.started_at,
      finished_at: job.finished_at
    }
  })

  // Start job execution
  app.post('/api/jobs/:jobId/start', async (req: FastifyRequest, reply: FastifyReply) => {
    const { jobId } = req.params as { jobId: string }
    const job = await store.getJob(jobId)
    if (!job) return reply.code(404).send({ detail: 'Job not found' })
    if (job.status !== 'pending') return reply.code(400).send({ detail: 'Job not pending' })
    if (jobHandles.size >= MAX_CONCURRENCY) {
      return reply.code(429).send({ detail: 'Runner busy' })
    }

    let subscribers: Set<FastifyReply> | undefined
    await withSubscriberLock(jobId, () => {
      subscribers = jobSubscribers.get(jobId) ?? new Set()
    })
    
    const input: JobInput = job.input ? JSON.parse(job.input) : {}

    // Set up timeout if specified
    let timeoutHandle: NodeJS.Timeout | undefined
    let jobCompleted = false
    let completionMutex = false

    const cleanup = (status: JobStatus) => {
      if (timeoutHandle) clearTimeout(timeoutHandle)
      jobHandles.delete(jobId)
      
      withSubscriberLock(jobId, () => {
        const subs = jobSubscribers.get(jobId)
        if (subs) {
          // Close SSE connections
          for (const sub of subs) {
            sub.raw.end()
          }
          jobSubscribers.delete(jobId)
        }
      })
    }

    if (job.timeout_ms && job.timeout_ms > 0) {
      timeoutHandle = setTimeout(async () => {
        // Use mutex to prevent race condition with executeJob completion
        if (jobCompleted || completionMutex) return
        completionMutex = true
        jobCompleted = true

        await store.updateJobStatus(jobId, 'timeout', undefined, nowIso())

        const timeoutEvent: RunnerEvent = {
          id: randomId('evt'),
          type: 'job.timeout',
          ts: nowIso(),
          job_id: jobId
        }
        await store.addEvent(timeoutEvent)
        if (subscribers) {
          for (const sub of subscribers) sendSse(sub, timeoutEvent)
        }

        const doneEvent: RunnerEvent = {
          id: randomId('evt'),
          type: 'done',
          ts: nowIso(),
          job_id: jobId,
          data: { status: 'timeout' }
        }
        await store.addEvent(doneEvent)
        if (subscribers) {
          for (const sub of subscribers) sendSse(sub, doneEvent)
        }

        cleanup('timeout')
        completionMutex = false
      }, job.timeout_ms)
    }

    const controller = new AbortController()

    jobHandles.set(jobId, {
      timeoutHandle,
      controller,
      cancel: () => {
        if (!jobCompleted) {
          jobCompleted = true
          controller.abort()
        }
      }
    })

    // Execute job asynchronously with proper error handling (Fire-and-forget)
    // We don't await this because we want to return the job ID immediately
    Promise.resolve().then(async () => {
      try {
        await executeJob(store, jobId, subscribers ?? new Set(), input, (status: JobStatus) => {
          // Use mutex to prevent race condition with timeout handler
          if (jobCompleted || completionMutex) return
          completionMutex = true
          jobCompleted = true
          cleanup(status)
          completionMutex = false
        }, controller.signal)
      } catch (err) {
        // This catch block handles errors that might escape executeJob's internal try/catch
        console.error(`Job ${jobId} execution failed ungracefully:`, err)
        if (!jobCompleted) {
          jobCompleted = true
          cleanup('error')
        }
      }
    })

    return { id: jobId, status: 'running', started_at: nowIso() }
  })

  // Submit approval
  app.post('/api/jobs/:jobId/approval', async (req, reply) => {
    const { jobId } = req.params as { jobId: string }
    const { tokenId, approved } = req.body as { tokenId: string, approved: boolean }

    const job = await store.getJob(jobId)
    if (!job) return reply.code(404).send({ detail: 'Job not found' })

    const handled = approvalService.handleResponse({
      jobId,
      tokenId,
      approved
    })

    if (!handled) {
      return reply.code(400).send({ detail: 'Invalid token or expired request' })
    }

    return { ok: true }
  })

  // Cancel job
  app.post('/api/jobs/:jobId/cancel', async (req: FastifyRequest, reply: FastifyReply) => {
    const { jobId } = req.params as { jobId: string }
    const job = await store.getJob(jobId)
    if (!job) return reply.code(404).send({ detail: 'Job not found' })
    if (job.status !== 'pending' && job.status !== 'running') {
      return reply.code(400).send({ detail: 'Job not cancellable' })
    }

    // Cancel execution
    const handle = jobHandles.get(jobId)
    if (handle) {
      handle.cancel()
      if (handle.timeoutHandle) clearTimeout(handle.timeoutHandle)
    }

    await store.updateJobStatus(jobId, 'cancelled', undefined, nowIso())

    const cancelEvent: RunnerEvent = {
      id: randomId('evt'),
      type: 'job.cancelled',
      ts: nowIso(),
      job_id: jobId
    }
    await store.addEvent(cancelEvent)

    let subscribers: Set<FastifyReply> | undefined
    await withSubscriberLock(jobId, () => {
      subscribers = jobSubscribers.get(jobId) ?? new Set()
    })
    
    if (subscribers) {
      for (const sub of subscribers) sendSse(sub, cancelEvent)
    }

    const doneEvent: RunnerEvent = {
      id: randomId('evt'),
      type: 'done',
      ts: nowIso(),
      job_id: jobId,
      data: { status: 'cancelled' }
    }
    await store.addEvent(doneEvent)
    
    await withSubscriberLock(jobId, () => {
      const subs = jobSubscribers.get(jobId)
      if (subs) {
        for (const sub of subs) sendSse(sub, doneEvent)
        for (const sub of subs) sub.raw.end()
        subs.clear()
      }
      jobSubscribers.delete(jobId)
    })

    jobHandles.delete(jobId)

    return { id: jobId, status: 'cancelled', finished_at: nowIso() }
  })

  // Delete job
  app.delete('/api/jobs/:jobId', async (req: FastifyRequest, reply: FastifyReply) => {
    const { jobId } = req.params as { jobId: string }
    const job = await store.getJob(jobId)
    if (!job) return reply.code(404).send({ detail: 'Job not found' })

    // Cancel if running
    if (job.status === 'pending' || job.status === 'running') {
      const handle = jobHandles.get(jobId)
      if (handle) {
        handle.cancel()
        if (handle.timeoutHandle) clearTimeout(handle.timeoutHandle)
      }
    }

    await store.deleteJob(jobId)
    jobSubscribers.delete(jobId)
    jobHandles.delete(jobId)

    return { ok: true }
  })

  // SSE event stream
  app.get('/api/jobs/:jobId/events', async (req: FastifyRequest, reply: FastifyReply) => {
    const { jobId } = req.params as { jobId: string }
    const job = await store.getJob(jobId)
    if (!job) return reply.code(404).send({ detail: 'Job not found' })

    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive'
    })

    if (typeof reply.raw.flushHeaders === 'function') reply.raw.flushHeaders()

    // Send backlog of events
    const events = await store.getEvents(jobId)
    for (const ev of events) sendSse(reply, ev)

    if (job.status !== 'pending' && job.status !== 'running') {
      reply.raw.end()
      return reply
    }

    // Subscribe to new events
    await withSubscriberLock(jobId, () => {
      let subscribers = jobSubscribers.get(jobId)
      if (!subscribers) {
        subscribers = new Set()
        jobSubscribers.set(jobId, subscribers)
      }
      subscribers.add(reply)
    })

    // Heartbeat to keep connection alive
    const heartbeat = setInterval(() => {
      reply.raw.write(':heartbeat\n\n')
    }, 15000)

    req.raw.on('close', async () => {
      clearInterval(heartbeat)
      await withSubscriberLock(jobId, () => {
        const subscribers = jobSubscribers.get(jobId)
        subscribers?.delete(reply)
        if (subscribers && subscribers.size === 0) {
          jobSubscribers.delete(jobId)
        }
      })
    })

    return reply
  })

  await app.listen({ port: PORT, host: '0.0.0.0' })
  console.log(`Runner listening on port ${PORT}`)
  console.log('Runner service is starting...');
  console.log('Listening on:', { port: PORT, host: '0.0.0.0' });
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
