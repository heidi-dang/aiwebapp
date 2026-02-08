import { Express } from 'express'
import { requireOptionalBearerAuth } from '../auth.js'
import { Store } from '../storage.js'

export async function registerTeamRoutes(app: Express, store: Store) {
  app.get('/teams', async (req, res) => {
    requireOptionalBearerAuth(req, res)
    if (res.headersSent) return
    res.json(store.teams)
  })
}
