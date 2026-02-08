import { requireOptionalBearerAuth } from '../auth.js'
import { Store } from '../storage.js'

export async function registerTeamRoutes(app: any, store: Store) {
  app.get('/teams', async (req: any, res: any) => {
    requireOptionalBearerAuth(req, res)
    if (res.headersSent) return
    res.json(store.teams)
  })
}
