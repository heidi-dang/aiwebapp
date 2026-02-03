import { FastifyInstance } from 'fastify'
import { requireOptionalBearerAuth } from '../auth.js'

export async function registerHealthRoutes(app: FastifyInstance) {
  app.get('/', async (req, reply) => {
    requireOptionalBearerAuth(req, reply)
    if (reply.sent) return
    return { status: 'ok' }
  })

  app.get('/health', async (req, reply) => {
    requireOptionalBearerAuth(req, reply)
    if (reply.sent) return
    return { status: 'ok' }
  })

  app.get('/favicon.ico', async (req, reply) => {
    requireOptionalBearerAuth(req, reply)
    if (reply.sent) return
    reply.code(204)
    return null
  })
}
