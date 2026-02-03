import { FastifyInstance } from 'fastify'
import { requireOptionalBearerAuth } from '../auth.js'
import { Store } from '../storage.js'

export async function registerTeamRoutes(app: FastifyInstance, store: Store) {
  app.get('/teams', async (req, reply) => {
    requireOptionalBearerAuth(req, reply)
    if (reply.sent) return
    return store.teams
  })
}
