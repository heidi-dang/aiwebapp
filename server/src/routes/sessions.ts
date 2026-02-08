import { Express } from 'express'
import { requireOptionalBearerAuth } from '../auth.js'
import { Store } from '../storage.js'

export async function registerSessionRoutes(app: Express, store: Store) {
  app.get('/sessions', async (req, res) => {
    requireOptionalBearerAuth(req, res)
    if (res.headersSent) return
    const sessions = await store.listAllSessions()
    res.json(sessions)
  })

  app.get('/sessions/:id', async (req, res) => {
    requireOptionalBearerAuth(req, res)
    if (res.headersSent) return
    const session = await store.getSession(req.params.id)
    if (!session) {
      res.status(404).json({ error: 'Session not found' })
      return
    }
    res.json(session)
  })
}
