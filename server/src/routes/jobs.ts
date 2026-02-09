import { requireOptionalBearerAuth } from '../auth.js'
import { Store } from '../storage.js'
import { z } from 'zod'

export async function registerJobRoutes(app: any, store: Store) {
  // Store runner URL and token for job cancellation
  const RUNNER_URL = process.env.RUNNER_URL ?? 'http://localhost:4002'
  const RUNNER_TOKEN = process.env.RUNNER_TOKEN ?? 'change_me'

  app.post('/jobs/:id/cancel', async (req: any, res: any) => {
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

  app.post('/jobs/:id/approve', async (req: any, res: any) => {
    requireOptionalBearerAuth(req, res)
    if (res.headersSent) return

    const jobId = req.params.id
    const approvalSchema = z.object({
      tokenId: z.string(),
      approved: z.boolean()
    })

    const parsed = approvalSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid approval request', details: parsed.error.errors })
      return
    }

    try {
      const response = await fetch(`${RUNNER_URL}/api/jobs/${encodeURIComponent(jobId)}/approval`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${RUNNER_TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(parsed.data)
      })

      if (!response.ok) {
        const errorText = await response.text()
        res.status(response.status).json({ 
          error: 'Failed to submit approval', 
          details: errorText 
        })
        return
      }

      res.json({ success: true, message: 'Approval submitted' })
    } catch (error) {
      res.status(500).json({ 
        error: 'Failed to submit approval', 
        details: error instanceof Error ? error.message : String(error) 
      })
    }
  })

  // Remove separate reject endpoint as approval endpoint handles both
  // app.post('/jobs/:id/reject', ...) - removed


  app.get('/jobs/:id/status', async (req: any, res: any) => {
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