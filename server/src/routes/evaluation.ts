import { requireOptionalBearerAuth } from '../auth.js'
import { Store } from '../storage.js'
import { z } from 'zod'

// Mock evaluation framework - in real implementation this would come from runner

const runEvalSchema = z.object({
  suiteId: z.string(),
  agentId: z.string().optional()
})

export async function registerEvaluationRoutes(app: any, store: Store) {
  app.get('/evaluation/suites', async (req: any, res: any) => {
    requireOptionalBearerAuth(req, res)
    if (res.headersSent) return
    
    // Mock suites for now
    const mockSuites = [
      {
        id: 'coding-basics',
        name: 'Basic Coding Skills Test Suite',
        description: 'Tests fundamental coding capabilities',
        testCount: 5,
        lastRunResults: 0
      },
      {
        id: 'web-search',
        name: 'Web Search and Information Retrieval',
        description: 'Tests web search and information gathering',
        testCount: 3,
        lastRunResults: 0
      }
    ]
    
    res.json(mockSuites)
  })

  app.get('/evaluation/suites/:id', async (req: any, res: any) => {
    requireOptionalBearerAuth(req, res)
    if (res.headersSent) return
    
    // Mock suite details
    const mockSuite = {
      id: req.params.id,
      name: 'Test Suite',
      description: 'Mock test suite for demonstration',
      testCases: [
        {
          id: 'test-1',
          name: 'Test 1',
          description: 'First test case'
        },
        {
          id: 'test-2', 
          name: 'Test 2',
          description: 'Second test case'
        }
      ],
      results: [],
      summary: {
        totalTests: 2,
        passedTests: 0,
        failedTests: 0,
        averageScore: 0
      }
    }
    
    res.json(mockSuite)
  })

  app.post('/evaluation/suites/:id/run', async (req: any, res: any) => {
    requireOptionalBearerAuth(req, res)
    if (res.headersSent) return
    
    const parsed = runEvalSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid request', details: parsed.error.errors })
      return
    }

    // Mock evaluation run
    try {
      const mockResults = [
        {
          testId: 'test-1',
          passed: true,
          score: 0.85,
          details: {
            accuracy: 0.9,
            completeness: 0.8,
            efficiency: 0.85,
            safety: 1.0
          },
          timestamp: new Date().toISOString()
        },
        {
          testId: 'test-2',
          passed: false,
          score: 0.45,
          details: {
            accuracy: 0.5,
            completeness: 0.4,
            efficiency: 0.6,
            safety: 1.0
          },
          timestamp: new Date().toISOString()
        }
      ]
      
      res.json({
        success: true,
        results: mockResults,
        summary: {
          totalTests: 2,
          passedTests: 1,
          failedTests: 1,
          averageScore: 0.65
        }
      })
    } catch (error) {
      res.status(500).json({ 
        error: 'Evaluation failed', 
        details: error instanceof Error ? error.message : String(error) 
      })
    }
  })

  app.post('/evaluation/suites/seed', async (req: any, res: any) => {
    requireOptionalBearerAuth(req, res)
    if (res.headersSent) return
    
    // Create default test suites
    res.json({
      success: true,
      message: 'Created default evaluation suites',
      suites: [
        {
          id: 'coding-basics',
          name: 'Basic Coding Skills Test Suite',
          testCount: 5
        },
        {
          id: 'web-search',
          name: 'Web Search and Information Retrieval',
          testCount: 3
        }
      ]
    })
  })
}