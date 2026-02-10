import { requireOptionalBearerAuth } from '../auth.js'
import { Store } from '../storage.js'
import { z } from 'zod'
import { sessionCache } from '../session_cache.js'
import { Summarizer } from '../services/summarizer.js'

const renameSessionSchema = z.object({
  name: z.string().min(1).max(100)
})

const sessionStateSchema = z.object({
  state: z.record(z.any())
})

export async function registerSessionRoutes(app: any, store: Store) {
  const summarizer = new Summarizer(store)

  app.get('/sessions', async (req: any, res: any) => {
    requireOptionalBearerAuth(req, res)
    if (res.headersSent) return
    const query = (req.query ?? {}) as Record<string, unknown>
    const dbId = String(query.db_id ?? '')
    const entityType = String(query.type ?? '')
    const componentId = String(query.component_id ?? '')

    if (dbId && entityType && componentId) {
      const data = await store.listSessions({ dbId, entityType: entityType as any, componentId })
      res.json({ data })
      return
    }

    const sessions = await store.listAllSessions()
    res.json(sessions)
  })

  app.get('/sessions/:id', async (req: any, res: any) => {
    requireOptionalBearerAuth(req, res)
    if (res.headersSent) return
    const session = await store.getSession(req.params.id)
    if (!session) {
      res.status(404).json({ error: 'Session not found' })
      return
    }

    // Phase 15: Check organization access if org_id is present in session metadata
    // For now, we assume public or user-owned. Real RBAC check would go here.

    res.json(session)
  })

  app.delete('/sessions/:id', async (req: any, res: any) => {
    requireOptionalBearerAuth(req, res)
    if (res.headersSent) return

    const sessionId = req.params.id
    const query = (req.query ?? {}) as Record<string, string>
    const dbId = String(query.db_id ?? '').trim()
    const entityType = String(query.type ?? '').trim() as 'agent' | 'team'
    const componentId = String(query.component_id ?? '').trim()

    if (!dbId || !entityType || !componentId) {
      res.status(400).json({
        error: 'Missing required query params: db_id, type, component_id'
      })
      return
    }
    if (entityType !== 'agent' && entityType !== 'team') {
      res.status(400).json({ error: 'Invalid type; must be agent or team' })
      return
    }

    const deleted = await store.deleteSession({
      dbId,
      entityType,
      componentId,
      sessionId
    })
    if (!deleted) {
      res.status(404).json({ error: 'Session not found' })
      return
    }

    sessionCache.deleteSession(sessionId)
    sessionCache.deleteSessionList('all_sessions')

    res.status(204).send()
  })

  // Phase 15: Share Session
  app.post('/sessions/:id/share', async (req: any, res: any) => {
    requireOptionalBearerAuth(req, res)
    if (res.headersSent) return
    
    const { orgId, role } = req.body // e.g. "editor", "viewer"
    
    const session = await store.getSession(req.params.id)
    if (!session) {
      res.status(404).json({ error: 'Session not found' })
      return
    }

    // Update session metadata to include orgId
    // In a real implementation, we'd have a separate table for session_shares
    // For MVP, we'll store it in session state
    const state = (await store.getSessionState(req.params.id)) || {}
    state.sharedWith = state.sharedWith || []
    state.sharedWith.push({ orgId, role, sharedAt: Date.now() })
    
    await store.updateSessionState(req.params.id, state)
    
    res.json({ success: true, message: 'Session shared' })
  })

  app.get('/sessions/:id/runs', async (req: any, res: any) => {
    requireOptionalBearerAuth(req, res)
    if (res.headersSent) return
    const session = await store.getSession(req.params.id)
    if (!session) {
      res.status(404).json({ error: 'Session not found' })
      return
    }
    
    const runs = await store.getRuns({
      sessionId: req.params.id
    })
    res.json(runs)
  })

  app.patch('/sessions/:id/rename', async (req: any, res: any) => {
    requireOptionalBearerAuth(req, res)
    if (res.headersSent) return

    const parsed = renameSessionSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid session name', details: parsed.error.errors })
      return
    }

    const session = await store.getSession(req.params.id)
    if (!session) {
      res.status(404).json({ error: 'Session not found' })
      return
    }

    await store.updateSessionName(req.params.id, parsed.data.name)
    res.json({ success: true, name: parsed.data.name })
  })

  app.get('/sessions/:id/state', async (req: any, res: any) => {
    requireOptionalBearerAuth(req, res)
    if (res.headersSent) return

    const session = await store.getSession(req.params.id)
    if (!session) {
      res.status(404).json({ error: 'Session not found' })
      return
    }

    const state = await store.getSessionState(req.params.id)
    res.json({ state: state || {} })
  })

  app.patch('/sessions/:id/state', async (req: any, res: any) => {
    requireOptionalBearerAuth(req, res)
    if (res.headersSent) return

    const parsed = sessionStateSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid session state', details: parsed.error.errors })
      return
    }

    const session = await store.getSession(req.params.id)
    if (!session) {
      res.status(404).json({ error: 'Session not found' })
      return
    }

    await store.updateSessionState(req.params.id, parsed.data.state)
    res.json({ success: true, state: parsed.data.state })
  })

  app.post('/sessions/:id/summarize', async (req: any, res: any) => {
    requireOptionalBearerAuth(req, res)
    if (res.headersSent) return

    const session = await store.getSession(req.params.id)
    if (!session) {
      res.status(404).json({ error: 'Session not found' })
      return
    }

    try {
      const summary = await summarizer.summarizeSession(req.params.id)
      
      // Update session state with summary
      const state = (await store.getSessionState(req.params.id)) || {}
      state.summary = summary
      await store.updateSessionState(req.params.id, state)
      
      res.json({ success: true, summary })
    } catch (error) {
      res.status(500).json({ error: 'Summarization failed', details: error instanceof Error ? error.message : String(error) })
    }
  })

  app.get('/sessions/cache/stats', async (req: any, res: any) => {
    requireOptionalBearerAuth(req, res)
    if (res.headersSent) return
    
    const stats = sessionCache.getStats()
    res.json(stats)
  })
}
