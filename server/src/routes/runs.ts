import { requireOptionalBearerAuth } from '../auth.js'
import { Store } from '../storage.js'
import { RunEvent, StreamChunk } from '../types.js'
import multer from 'multer'
import { sessionNamer } from '../session_namer.js'

const upload = multer()

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000)
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function writeChunk(res: any, chunk: StreamChunk) {
  // Ensure chunks are newline-delimited so downstream stream parsers
  // can split and parse individual JSON objects incrementally.
  res.write(JSON.stringify(chunk) + '\n')
}

function requireEnv(name: string): string {
  const v = process.env[name]
  if (!v) {
    console.warn(`Warning: Missing env var ${name}, using default`)
    return name === 'RUNNER_URL' ? 'http://localhost:7778' : ''
  }
  return v
}

export async function registerRunRoutes(app: any, store: Store) {
  const RUNNER_URL = requireEnv('RUNNER_URL')
  const RUNNER_TOKEN = process.env.RUNNER_TOKEN ?? 'change_me'
  
  app.post('/agents/:agentId/runs', upload.none(), async (req: any, res: any) => {
    requireOptionalBearerAuth(req, res)
    if (res.headersSent) return

    const { agentId } = req.params as { agentId: string }
    const agent = store.agents.find((a) => a.id === agentId)
    if (!agent || !agent.db_id) {
      res.status(404).json({ detail: 'Agent not found' })
      return
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

    // Generate session title if needed
    if (message && await store.shouldGenerateName(created.sessionId)) {
      try {
        const title = await sessionNamer.generateTitle(message)
        await store.updateSessionName(created.sessionId, title)
        created.entry.session_name = title
      } catch (error) {
        console.warn('Failed to generate session title:', error)
      }
    }

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
          model: agent.model?.model ?? 'echo',
          base_dir: agent.base_dir
        }
      })
    })

    if (!runnerRes.ok) {
      const text = await runnerRes.text()
      res.status(500).json({ detail: `Runner error: ${runnerRes.status} ${text}` })
      return
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
      res.status(500).json({ detail: `Start error: ${startRes.status} ${text}` })
      return
    }

    // Stream events from runner
    const eventsRes = await fetch(`${RUNNER_URL}/api/jobs/${jobId}/events`, {
      headers: {
        'Authorization': `Bearer ${RUNNER_TOKEN}`
      }
    })

    if (!eventsRes.ok) {
      const text = await eventsRes.text()
      res.status(500).json({ detail: `Events error: ${eventsRes.status} ${text}` })
      return
    }

    const reader = eventsRes.body?.getReader()
    if (!reader) {
      res.status(500).json({ detail: 'No reader for events' })
      return
    }

    const origin = req.headers.origin
    if (origin) {
      res.setHeader('Access-Control-Allow-Origin', origin)
      res.setHeader('Access-Control-Allow-Credentials', 'true')
    }
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')
    res.flushHeaders()

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

            if (chunk) writeChunk(res, chunk)
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

    res.end()
  })

  app.post('/teams/:teamId/runs', upload.none(), async (req: any, res: any) => {
    requireOptionalBearerAuth(req, res)
    if (res.headersSent) return

    const { teamId } = req.params as { teamId: string }
    const team = store.teams.find((t) => t.id === teamId)
    if (!team || !team.db_id) {
      res.status(404).json({ detail: 'Team not found' })
      return
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

    // Generate session title if needed
    if (message && await store.shouldGenerateName(created.sessionId)) {
      try {
        const title = await sessionNamer.generateTitle(message)
        await store.updateSessionName(created.sessionId, title)
        created.entry.session_name = title
      } catch (error) {
        console.warn('Failed to generate session title:', error)
      }
    }

    // Create job ID for team run
    const jobId = `team_${teamId}_${Date.now()}`

    const origin = req.headers.origin
    if (origin) {
      res.setHeader('Access-Control-Allow-Origin', origin)
      res.setHeader('Access-Control-Allow-Credentials', 'true')
    }
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')
    res.flushHeaders()

    const started: StreamChunk = {
      event: RunEvent.TeamRunStarted,
      content_type: 'text',
      created_at: nowSeconds(),
      session_id: created.sessionId,
      team_id: teamId,
      content: ''
    }
    writeChunk(res, started)

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
      writeChunk(res, chunk)
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
    writeChunk(res, completed)

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

    res.end()
  })
}
