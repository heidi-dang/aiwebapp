import { requireOptionalBearerAuth } from '../auth.js'
import { Store } from '../storage.js'

export async function registerToolboxRoutes(app: any, store: Store) {
  app.get('/toolbox', async (req: any, res: any) => {
    requireOptionalBearerAuth(req, res)
    if (res.headersSent) return
    res.json(store.toolbox)
  })
}
