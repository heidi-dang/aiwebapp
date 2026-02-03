import { FastifyInstance } from 'fastify'
import { requireOptionalBearerAuth } from '../auth.js'
import { Store } from '../storage.js'
import { RunEvent, StreamChunk } from '../types.js'

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000)
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function writeChunk(replyRaw: NodeJS.WritableStream, chunk: StreamChunk) {
  replyRaw.write(JSON.stringify(chunk))
}

export async function registerRunRoutes(app: FastifyInstance, store: Store) {
  app.post('/agents/:agentId/runs', async (req, reply) => {
    requireOptionalBearerAuth(req, reply)
    if (reply.sent) return

    const { agentId } = req.params as { agentId: string }
    const agent = store.agents.find((a) => a.id === agentId)
    if (!agent || !agent.db_id) {
      reply.code(404)
      return { detail: 'Agent not found' }
    }

    let message = ''
    let sessionId = ''
    for await (const part of req.parts()) {
      if (part.type === 'field') {
        if (part.fieldname === 'message') message = String(part.value ?? '')
        if (part.fieldname === 'session_id') sessionId = String(part.value ?? '')
      } else {
        // Drain any file streams (MVP ignores file uploads)
        await part.toBuffer()
      }
    }

    const created = await store.getOrCreateSession({
      dbId: agent.db_id,
      entityType: 'agent',
      componentId: agentId,
      sessionId,
      sessionName: message || 'New session'
    })

    reply.raw.setHeader('Content-Type', 'application/json; charset=utf-8')
    reply.raw.setHeader('Cache-Control', 'no-cache')
    reply.raw.setHeader('Connection', 'keep-alive')
    reply.raw.flushHeaders()

    const started: StreamChunk = {
      event: RunEvent.RunStarted,
      content_type: 'text',
      created_at: nowSeconds(),
      session_id: created.sessionId,
      agent_id: agentId,
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
        event: RunEvent.RunContent,
        content_type: 'text',
        created_at: nowSeconds(),
        session_id: created.sessionId,
        agent_id: agentId,
        content: current
      }
      writeChunk(reply.raw, chunk)
      await sleep(60)
    }

    const completed: StreamChunk = {
      event: RunEvent.RunCompleted,
      content_type: 'text',
      created_at: nowSeconds(),
      session_id: created.sessionId,
      agent_id: agentId,
      content: finalText
    }
    writeChunk(reply.raw, completed)

    await store.appendRun({
      dbId: agent.db_id,
      entityType: 'agent',
      componentId: agentId,
      sessionId: created.sessionId,
      run: {
        run_input: message,
        content: finalText,
        created_at: completed.created_at
      }
    })

    reply.raw.end()
  })

  app.post('/teams/:teamId/runs', async (req, reply) => {
    requireOptionalBearerAuth(req, reply)
    if (reply.sent) return

    const { teamId } = req.params as { teamId: string }
    const team = store.teams.find((t) => t.id === teamId)
    if (!team || !team.db_id) {
      reply.code(404)
      return { detail: 'Team not found' }
    }

    let message = ''
    let sessionId = ''
    for await (const part of req.parts()) {
      if (part.type === 'field') {
        if (part.fieldname === 'message') message = String(part.value ?? '')
        if (part.fieldname === 'session_id') sessionId = String(part.value ?? '')
      } else {
        // Drain any file streams (MVP ignores file uploads)
        await part.toBuffer()
      }
    }

    const created = await store.getOrCreateSession({
      dbId: team.db_id,
      entityType: 'team',
      componentId: teamId,
      sessionId,
      sessionName: message || 'New session'
    })

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
