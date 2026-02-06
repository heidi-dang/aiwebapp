import { FastifyInstance } from 'fastify'
import { requireOptionalBearerAuth } from '../auth.js'
import { Store } from '../storage.js'
import { RunEvent, StreamChunk } from '../types.js'
import multer from 'multer'

const upload = multer()

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000)
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function writeChunk(replyRaw: NodeJS.WritableStream, chunk: StreamChunk) {
  // Ensure chunks are newline-delimited so downstream stream parsers
  // can split and parse individual JSON objects incrementally.
  replyRaw.write(JSON.stringify(chunk) + '\n')
}

function requireEnv(name: string): string {
  const v = process.env[name]
  if (!v) throw new Error(`Missing required env var: ${name}`)
  return v
}

export async function registerRunRoutes(app: FastifyInstance, store: Store) {
  const RUNNER_URL = requireEnv('RUNNER_URL')
  const RUNNER_TOKEN = process.env.RUNNER_TOKEN ?? 'change_me'
  app.post('/agents/:agentId/runs', upload.none(), async (req, reply) => {
    requireOptionalBearerAuth(req, reply)
    if (reply.sent) return

    const { agentId } = req.params as { agentId: string }
    const agent = store.agents.find((a) => a.id === agentId)
    if (!agent || !agent.db_id) {
      reply.code(404)
      return { detail: 'Agent not found' }
    }

    const message = (req.body as { message?: string }).message || ''
    const sessionId = (req.body as { session_id?: string }).session_id || ''

    const created = await store.getOrCreateSession({
      dbId: agent.db_id,
      entityType: 'agent',
      componentId: agentId,
      sessionId,
      sessionName: message || 'New session'
    })

    // Call runner to create job
    const runnerRes = await fetch(`${RUNNER_URL}/api/jobs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${RUNNER_TOKEN}`
      },
      body: JSON.stringify({
        input: {
          message,
          session_id: created.sessionId,
          provider: agent.model?.provider ?? 'mock',
          model: agent.model?.model ?? 'echo'
        }
      })
    })

    if (!runnerRes.ok) {
      const text = await runnerRes.text()
      reply.code(500)
      return { detail: `Runner error: ${runnerRes.status} ${text}` }
    }

    const job = await runnerRes.json()
    const jobId = job.id

    const startRes = await fetch(`${RUNNER_URL}/api/jobs/${encodeURIComponent(jobId)}/start`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RUNNER_TOKEN}`
      }
    })

    if (!startRes.ok) {
      const text = await startRes.text()
      reply.code(500)
      return { detail: `Start error: ${startRes.status} ${text}` }
    }

    // Stream events from runner
    const eventsRes = await fetch(`${RUNNER_URL}/api/jobs/${jobId}/events`, {
      headers: {
        'Authorization': `Bearer ${RUNNER_TOKEN}`
      }
    })

    if (!eventsRes.ok) {
      const text = await eventsRes.text()
      reply.code(500)
      return { detail: `Events error: ${eventsRes.status} ${text}` }
    }

    const reader = eventsRes.body?.getReader()
    if (!reader) {
      reply.code(500)
      return { detail: 'No reader for events' }
    }

    const origin = req.headers.origin
    if (origin) {
      reply.raw.setHeader('Access-Control-Allow-Origin', origin)
      reply.raw.setHeader('Access-Control-Allow-Credentials', 'true')
    }
    reply.raw.setHeader('Content-Type', 'application/json; charset=utf-8')
    reply.raw.setHeader('Cache-Control', 'no-cache')
    reply.raw.setHeader('Connection', 'keep-alive')
    reply.hijack()
    reply.raw.flushHeaders()

    const decoder = new TextDecoder()
    let buffer = ''
    let finalContent = ''

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const data = line.slice(6)
          try {
            const event = JSON.parse(data)
            let chunk: StreamChunk | null = null

            if (event.type === 'job.started') {
              chunk = {
                event: RunEvent.RunStarted,
                content_type: 'text',
                created_at: nowSeconds(),
                session_id: created.sessionId,
                agent_id: agentId,
                content: ''
              }
            } else if (event.type === 'tool.output' && typeof event.data?.output === 'string') {
              const output = event.data.output
              finalContent += output
              chunk = {
                event: RunEvent.RunContent,
                content_type: 'text',
                created_at: nowSeconds(),
                session_id: created.sessionId,
                agent_id: agentId,
                content: output
              }
            } else if (event.type === 'done') {
              chunk = {
                event: RunEvent.RunCompleted,
                content_type: 'text',
                created_at: nowSeconds(),
                session_id: created.sessionId,
                agent_id: agentId,
                content: finalContent
              }
            }

            if (chunk) writeChunk(reply.raw, chunk)
          } catch {
            // ignore parse errors
          }
        }
      }
    } catch {
      // Avoid throwing after hijacking the response
    } finally {
      reader.releaseLock()
    }

    await store.appendRun({
      dbId: agent.db_id,
      entityType: 'agent',
      componentId: agentId,
      sessionId: created.sessionId,
      run: {
        run_input: message,
        content: finalContent,
        created_at: nowSeconds()
      }
    })

    reply.raw.end()
  })

  app.post('/teams/:teamId/runs', upload.none(), async (req, reply) => {
    requireOptionalBearerAuth(req, reply)
    if (reply.sent) return

    const { teamId } = req.params as { teamId: string }
    const team = store.teams.find((t) => t.id === teamId)
    if (!team || !team.db_id) {
      reply.code(404)
      return { detail: 'Team not found' }
    }

    const message = (req.body as { message?: string }).message || ''
    const sessionId = (req.body as { session_id?: string }).session_id || ''

    const created = await store.getOrCreateSession({
      dbId: team.db_id,
      entityType: 'team',
      componentId: teamId,
      sessionId,
      sessionName: message || 'New session'
    })

    const origin = req.headers.origin
    if (origin) {
      reply.raw.setHeader('Access-Control-Allow-Origin', origin)
      reply.raw.setHeader('Access-Control-Allow-Credentials', 'true')
    }
    reply.raw.setHeader('Content-Type', 'application/json; charset=utf-8')
    reply.raw.setHeader('Cache-Control', 'no-cache')
    reply.raw.setHeader('Connection', 'keep-alive')
    reply.raw.flushHeaders()

    const started: StreamChunk = {
      event: RunEvent.TeamRunStarted,
      content_type: 'text',
      created_at: nowSeconds(),
      session_id: created.sessionId,
      team_id: teamId,
      content: ''
    }
    writeChunk(reply.raw, started)

    const finalText = `Echo: ${message}`
    let current = ''
    const steps = Math.min(5, Math.max(2, Math.ceil(finalText.length / 12)))
    for (let i = 1; i <= steps; i++) {
      const sliceLen = Math.ceil((finalText.length * i) / steps)
      current = finalText.slice(0, sliceLen)
      const chunk: StreamChunk = {
        event: RunEvent.TeamRunContent,
        content_type: 'text',
        created_at: nowSeconds(),
        session_id: created.sessionId,
        team_id: teamId,
        content: current
      }
      writeChunk(reply.raw, chunk)
      await sleep(60)
    }

    const completed: StreamChunk = {
      event: RunEvent.TeamRunCompleted,
      content_type: 'text',
      created_at: nowSeconds(),
      session_id: created.sessionId,
      team_id: teamId,
      content: finalText
    }
    writeChunk(reply.raw, completed)

    await store.appendRun({
      dbId: team.db_id,
      entityType: 'team',
      componentId: teamId,
      sessionId: created.sessionId,
      run: {
        run_input: message,
        content: finalText,
        created_at: completed.created_at
      }
    })

    reply.raw.end()
  })
}
