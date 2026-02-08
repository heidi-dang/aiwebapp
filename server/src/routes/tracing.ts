import { Express } from 'express'
import { requireOptionalBearerAuth } from '../auth.js'
import { Store } from '../storage.js'

// Mock tracing data - in real implementation this would come from runner

export async function registerTracingRoutes(app: Express, store: Store) {
  app.get('/tracing/current', async (req, res) => {
    requireOptionalBearerAuth(req, res)
    if (res.headersSent) return
    
    // Mock current trace
    res.json({
      trace: {
        traceId: 'mock-trace-123',
        spans: [],
        startTime: Date.now() - 5000,
        endTime: null
      },
      hasActiveTrace: false
    })
  })

  app.post('/tracing/export', async (req, res) => {
    requireOptionalBearerAuth(req, res)
    if (res.headersSent) return
    
    // Mock trace export
    res.json({
      trace: {
        traceId: 'mock-trace-123',
        spans: [
          {
            name: 'agent.execution',
            startTime: Date.now() - 5000,
            endTime: Date.now() - 1000,
            attributes: { agent: 'coder' },
            events: [],
            status: 'ok'
          }
        ],
        startTime: Date.now() - 5000,
        endTime: Date.now() - 1000
      },
      format: 'json'
    })
  })

  app.post('/tracing/start', async (req, res) => {
    requireOptionalBearerAuth(req, res)
    if (res.headersSent) return
    
    const { traceId } = req.body
    if (!traceId || typeof traceId !== 'string') {
      res.status(400).json({ error: 'traceId is required and must be a string' })
      return
    }
    
    // Mock trace start
    res.json({ success: true, message: 'Trace started', traceId })
  })

  app.post('/tracing/end', async (req, res) => {
    requireOptionalBearerAuth(req, res)
    if (res.headersSent) return
    
    // Mock trace end
    res.json({
      success: true,
      message: 'Trace ended',
      trace: {
        traceId: 'mock-trace-123',
        spans: [],
        startTime: Date.now() - 5000,
        endTime: Date.now()
      }
    })
  })

  app.post('/tracing/span/start', async (req, res) => {
    requireOptionalBearerAuth(req, res)
    if (res.headersSent) return
    
    const { name, attributes } = req.body
    if (!name || typeof name !== 'string') {
      res.status(400).json({ error: 'name is required and must be a string' })
      return
    }
    
    // Mock span start
    res.json({ success: true, message: 'Span started', name })
  })

  app.post('/tracing/span/end', async (req, res) => {
    requireOptionalBearerAuth(req, res)
    if (res.headersSent) return
    
    // Mock span end
    res.json({ success: true, message: 'Span ended' })
  })

  app.post('/tracing/event', async (req, res) => {
    requireOptionalBearerAuth(req, res)
    if (res.headersSent) return
    
    const { name, attributes } = req.body
    if (!name || typeof name !== 'string') {
      res.status(400).json({ error: 'name is required and must be a string' })
      return
    }
    
    // Mock event addition
    res.json({ success: true, message: 'Event added', name })
  })

  app.post('/tracing/status', async (req, res) => {
    requireOptionalBearerAuth(req, res)
    if (res.headersSent) return
    
    const { status, error } = req.body
    if (!status || !['ok', 'error'].includes(status)) {
      res.status(400).json({ error: 'status must be "ok" or "error"' })
      return
    }
    
    // Mock status setting
    res.json({ success: true, message: 'Status set', status })
  })
}