import { FastifyInstance } from 'fastify'
import { requireOptionalBearerAuth } from '../auth.js'
import { Store } from '../storage.js'

export async function registerAgentRoutes(app: FastifyInstance, store: Store) {
  app.get('/agents', async (req, reply) => {
    requireOptionalBearerAuth(req, reply)
    if (reply.sent) return
    console.log('Agents data:', store.agents);
    return store.agents
  })
}
