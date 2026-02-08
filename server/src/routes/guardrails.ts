import { Express } from 'express'
import { requireOptionalBearerAuth } from '../auth.js'
import { Store } from '../storage.js'
import { guardrailService } from '../guardrail_service.js'
import { z } from 'zod'

const guardrailConfigSchema = z.object({
  inputCheck: z.boolean().optional(),
  outputCheck: z.boolean().optional(),
  toolCheck: z.boolean().optional(),
  forbiddenTerms: z.array(z.string()).optional(),
  maxPromptLength: z.number().optional(),
  maxResponseLength: z.number().optional()
})

export async function registerGuardrailRoutes(app: Express, store: Store) {
  app.get('/guardrails/config', async (req, res) => {
    requireOptionalBearerAuth(req, res)
    if (res.headersSent) return
    
    // Return current guardrail configuration (sanitized)
    res.json({
      inputCheck: guardrailService.config.inputCheck,
      outputCheck: guardrailService.config.outputCheck,
      toolCheck: guardrailService.config.toolCheck,
      maxPromptLength: guardrailService.config.maxPromptLength,
      maxResponseLength: guardrailService.config.maxResponseLength,
      forbiddenTermsCount: guardrailService.config.forbiddenTerms.length,
      dangerousCommandsCount: guardrailService.config.dangerousCommands.length
    })
  })

  app.post('/guardrails/test-input', async (req, res) => {
    requireOptionalBearerAuth(req, res)
    if (res.headersSent) return
    
    const testSchema = z.object({
      text: z.string()
    })
    
    const parsed = testSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid request', details: parsed.error.errors })
      return
    }
    
    const result = guardrailService.checkInput(parsed.data.text)
    res.json({
      allowed: result.allowed,
      reason: result.reason,
      sanitized: guardrailService.sanitizeInput(parsed.data.text)
    })
  })

  app.post('/guardrails/test-output', async (req, res) => {
    requireOptionalBearerAuth(req, res)
    if (res.headersSent) return
    
    const testSchema = z.object({
      text: z.string()
    })
    
    const parsed = testSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid request', details: parsed.error.errors })
      return
    }
    
    const result = guardrailService.checkOutput(parsed.data.text)
    res.json({
      allowed: result.allowed,
      reason: result.reason
    })
  })

  app.post('/guardrails/test-tool', async (req, res) => {
    requireOptionalBearerAuth(req, res)
    if (res.headersSent) return
    
    const testSchema = z.object({
      toolName: z.string(),
      args: z.record(z.any())
    })
    
    const parsed = testSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid request', details: parsed.error.errors })
      return
    }
    
    const result = guardrailService.checkToolCall(parsed.data.toolName, parsed.data.args)
    res.json({
      allowed: result.allowed,
      reason: result.reason
    })
  })
}