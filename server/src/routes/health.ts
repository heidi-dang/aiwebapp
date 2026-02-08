import { requireOptionalBearerAuth } from '../auth.js'

export async function registerHealthRoutes(app: any) {
  app.get('/', async (req: any, res: any) => {
    requireOptionalBearerAuth(req, res)
    if (res.headersSent) return
    res.json({ status: 'ok' })
  })

  app.get('/health', async (req: any, res: any) => {
    // Temporarily bypass authentication for debugging
    res.json({ status: 'ok' })
  })

  app.get('/favicon.ico', async (req: any, res: any) => {
    requireOptionalBearerAuth(req, res)
    if (res.headersSent) return
    res.status(204).end()
  })
}
