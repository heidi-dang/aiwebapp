import { requireOptionalBearerAuth } from '../auth.js'
import { Store } from '../storage.js'
import { z } from 'zod'

const modelConfigSchema = z.object({
  name: z.string(),
  model: z.string(),
  provider: z.string(),
  apiKey: z.string().optional()
})

export async function registerAgentRoutes(app: any, store: Store) {
  app.get('/agents', async (req: any, res: any) => {
    requireOptionalBearerAuth(req, res)
    if (res.headersSent) return
    console.log('Agents data:', store.agents);
    res.json(store.agents)
  })

  app.post('/agents/:id/configure-model', async (req: any, res: any) => {
    const { id } = req.params
    const parsedBody = modelConfigSchema.safeParse(req.body)
    if (!parsedBody.success) {
      res.status(400).json({ error: 'Invalid model configuration data', details: parsedBody.error.errors })
      return
    }

    await store.saveModelConfig(id, parsedBody.data)
    res.json({ ok: true })
  })

  app.get('/agents/:id/model-config', async (req: any, res: any) => {
    const { id } = req.params

    // Retrieve model configuration from the database
    const modelConfig = await store.getModelConfig(id)
    if (!modelConfig) {
      res.status(404).json({ error: 'Model configuration not found' })
      return
    }

    res.json(modelConfig)
  })

  app.get('/model-providers', async (req: any, res: any) => {
    // Simulate retrieving available model providers
    const providers = [
      { id: 'openai', name: 'OpenAI' },
      { id: 'huggingface', name: 'Hugging Face' },
    ]
    res.json(providers)
  })

  app.post('/agents/:id/validate-model-config', async (req: any, res: any) => {
    const { id } = req.params
    const parsedBody = modelConfigSchema.safeParse(req.body)
    if (!parsedBody.success) {
      res.status(400).json({ error: 'Invalid model configuration data', details: parsedBody.error.errors })
      return
    }

    const isValid = await store.validateModelConfig(parsedBody.data)
    if (!isValid) {
      res.status(400).json({ error: 'Invalid provider specified' })
      return
    }

    res.json({ message: 'Model configuration is valid' })
  })

  app.delete('/agents/:id/model-config', async (req: any, res: any) => {
    const { id } = req.params

    // Delete model configuration from the database
    await store.deleteModelConfig(id)
    res.json({ ok: true })
  })

  app.post('/agents/:id/model-config', async (req: any, res: any) => {
    const { id } = req.params
    const parsedBody = modelConfigSchema.safeParse(req.body)
    if (!parsedBody.success) {
      res.status(400).json({ error: 'Invalid model configuration data', details: parsedBody.error.errors })
      return
    }

    await store.saveModelConfig(id, parsedBody.data)

    res.json({ message: 'Model configuration saved successfully' })
  })
}
