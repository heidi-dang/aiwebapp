import { Express } from 'express'
import { requireOptionalBearerAuth } from '../auth.js'

export async function registerHealthRoutes(app: Express) {
  app.get('/', async (req, res) => {
    requireOptionalBearerAuth(req, res)
    if (res.headersSent) return
    res.json({ status: 'ok' })
  })

  app.get('/health', async (req, res) => {
    // Temporarily bypass authentication for debugging
    res.json({ status: 'ok' })
  })

  app.get('/favicon.ico', async (req, res) => {
    requireOptionalBearerAuth(req, res)
    if (res.headersSent) return
    res.status(204).end()
  })
}
