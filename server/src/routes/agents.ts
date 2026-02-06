import { FastifyInstance } from 'fastify'
import { requireOptionalBearerAuth } from '../auth.js'
import { Store } from '../storage.js'
import { z } from 'zod'

const modelConfigSchema = z.object({
  name: z.string(),
  model: z.string(),
  provider: z.string(),
  apiKey: z.string().optional()
})

export async function registerAgentRoutes(app: FastifyInstance, store: Store) {
  app.get('/agents', async (req, reply) => {
    requireOptionalBearerAuth(req, reply)
    if (reply.sent) return
    console.log('Agents data:', store.agents);
    return store.agents
  })

  app.post('/agents/:id/configure-model', async (request, reply) => {
    const { id } = request.params as { id: string }
    const parsedBody = modelConfigSchema.safeParse(request.body)
    if (!parsedBody.success) {
      return reply.status(400).send({ error: 'Invalid model configuration data', details: parsedBody.error.errors })
    }

    await store.saveModelConfig(id, parsedBody.data)
    reply.send({ ok: true })
  })

  app.get('/agents/:id/model-config', async (request, reply) => {
    const { id } = request.params as { id: string }

    // Retrieve model configuration from the database
    const modelConfig = await store.getModelConfig(id)
    if (!modelConfig) {
      return reply.status(404).send({ error: 'Model configuration not found' })
    }

    reply.send(modelConfig)
  })

  app.get('/model-providers', async (request, reply) => {
    // Simulate retrieving available model providers
    const providers = [
      { id: 'openai', name: 'OpenAI' },
      { id: 'huggingface', name: 'Hugging Face' },
    ]
    reply.send(providers)
  })

  app.post('/agents/:id/validate-model-config', async (request, reply) => {
    const { id } = request.params as { id: string }
    const parsedBody = modelConfigSchema.safeParse(request.body)
    if (!parsedBody.success) {
      return reply.status(400).send({ error: 'Invalid model configuration data', details: parsedBody.error.errors })
    }

    const isValid = await store.validateModelConfig(parsedBody.data)
    if (!isValid) {
      return reply.status(400).send({ error: 'Invalid provider specified' })
    }

    reply.send({ message: 'Model configuration is valid' })
  })

  app.delete('/agents/:id/model-config', async (request, reply) => {
    const { id } = request.params as { id: string }

    // Delete model configuration from the database
    await store.deleteModelConfig(id)
    reply.send({ ok: true })
  })

  app.post('/agents/:id/model-config', async (request, reply) => {
    const { id } = request.params as { id: string }
    const parsedBody = modelConfigSchema.safeParse(request.body)
    if (!parsedBody.success) {
      return reply.status(400).send({ error: 'Invalid model configuration data', details: parsedBody.error.errors })
    }

    await store.saveModelConfig(id, parsedBody.data)

    reply.send({ message: 'Model configuration saved successfully' })
  })
}
