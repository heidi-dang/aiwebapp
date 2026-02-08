import { Express } from 'express'
import { requireOptionalBearerAuth } from '../auth.js'
import { Store } from '../storage.js'
import { z } from 'zod'

export async function registerJobRoutes(app: Express, store: Store) {
  // Store runner URL and token for job cancellation
  const RUNNER_URL = process.env.RUNNER_URL ?? 'http://localhost:7778'
  const RUNNER_TOKEN = process.env.RUNNER_TOKEN ?? 'change_me'

  app.post('/jobs/:id/cancel', async (req, res) => {
    requireOptionalBearerAuth(req, res)
    if (res.headersSent) return

    const jobId = req.params.id
    
    try {
      // Call runner's cancel endpoint
      const response = await fetch(`${RUNNER_URL}/api/jobs/${encodeURIComponent(jobId)}/cancel`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${RUNNER_TOKEN}`
        }
      })

      if (!response.ok) {
        const errorText = await response.text()
        res.status(response.status).json({ 
          error: 'Failed to cancel job', 
          details: errorText 
        })
        return
      }

      res.json({ 
        success: true, 
        message: 'Job cancelled',
        jobId 
      })
    } catch (error) {
      res.status(500).json({ 
        error: 'Failed to cancel job', 
        details: error instanceof Error ? error.message : String(error) 
      })
    }
  })

  app.post('/jobs/:id/approve', async (req, res) => {
    requireOptionalBearerAuth(req, res)
    if (res.headersSent) return

    const jobId = req.params.id
    const approvalSchema = z.object({
      toolName: z.string(),
      args: z.record(z.any())
    })

    const parsed = approvalSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid approval request', details: parsed.error.errors })
      return
    }

    // Store approval decision (this would be used by the runner)
    // For now, we'll just acknowledge the approval
    res.json({ success: true, message: 'Tool call approved', tool: parsed.data.toolName })
  })

  app.post('/jobs/:id/reject', async (req, res) => {
    requireOptionalBearerAuth(req, res)
    if (res.headersSent) return

    const jobId = req.params.id
    const rejectionSchema = z.object({
      toolName: z.string(),
      reason: z.string().optional()
    })

    const parsed = rejectionSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid rejection request', details: parsed.error.errors })
      return
    }

    // Store rejection decision (this would be used by the runner)
    // For now, we'll just acknowledge the rejection
    res.json({ success: true, message: 'Tool call rejected', tool: parsed.data.toolName })
  })

  app.get('/jobs/:id/status', async (req, res) => {
    requireOptionalBearerAuth(req, res)
    if (res.headersSent) return

    const jobId = req.params.id
    
    try {
      // Call runner's job status endpoint
      const response = await fetch(`${RUNNER_URL}/api/jobs/${encodeURIComponent(jobId)}`, {
        headers: {
          'Authorization': `Bearer ${RUNNER_TOKEN}`
        }
      })

      if (!response.ok) {
        res.status(404).json({ error: 'Job not found or already completed' })
        return
      }

      const jobData = await response.json()
      res.json({
        jobId,
        status: jobData.status,
        canCancel: jobData.status === 'pending' || jobData.status === 'running'
      })
    } catch (error) {
      res.status(500).json({ 
        error: 'Failed to get job status', 
        details: error instanceof Error ? error.message : String(error) 
      })
    }
  })
}