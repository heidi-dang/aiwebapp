import { requireOptionalBearerAuth } from '../auth.js'
import { Store } from '../storage.js'
import { z } from 'zod'
import { access } from 'fs/promises'
import { constants as fsConstants } from 'fs'
import path from 'node:path'

const modelConfigSchema = z.object({
  name: z.string(),
  model: z.string(),
  provider: z.string(),
  apiKey: z.string().optional(),
  db_id: z.string().optional()
})

const baseDirSchema = z.object({
  base_dir: z.string().min(1)
})

export async function registerAgentRoutes(app: any, store: Store) {
  app.get('/agents', async (req: any, res: any) => {
    requireOptionalBearerAuth(req, res)
    if (res.headersSent) return
    res.json(store.agents)
  })

  app.put('/agents/:id/base-dir', async (req: any, res: any) => {
    requireOptionalBearerAuth(req, res)
    if (res.headersSent) return
    const { id } = req.params as { id: string }
    const parsed = baseDirSchema.safeParse(req.body)
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid base_dir', details: parsed.error.errors })
    }
    try {
      const baseDir = path.resolve(parsed.data.base_dir)
      await access(baseDir, fsConstants.R_OK | fsConstants.W_OK)
      const agent = store.agents.find(a => a.id === id)
      if (!agent) {
        return res.status(404).json({ error: 'Agent not found' })
      }
      agent.base_dir = baseDir
      return res.json({ ok: true, base_dir: baseDir })
    } catch (err) {
      return res.status(400).json({ error: 'base_dir not accessible', details: err instanceof Error ? err.message : String(err) })
    }
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
    const modelConfig = await store.getModelConfig(id)
    if (!modelConfig) {
      res.status(404).json({ error: 'Model configuration not found' })
      return
    }
    res.json(modelConfig)
  })

  app.get('/model-providers', async (req: any, res: any) => {
    const providers = [
      { id: 'openai', name: 'OpenAI' },
      { id: 'huggingface', name: 'Hugging Face' }
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
