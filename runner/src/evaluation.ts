export interface EvalTestCase {
  id: string
  name: string
  description: string
  input: string
  expectedOutput?: string
  expectedTools?: string[]
  criteria: {
    accuracy?: number
    completeness?: number
    efficiency?: number
    safety?: number
  }
}

export interface EvalResult {
  testId: string
  passed: boolean
  score: number
  details: {
    accuracy?: number
    completeness?: number
    efficiency?: number
    safety?: number
    actualOutput?: string
    actualTools?: string[]
    errors?: string[]
  }
  timestamp: string
}

export interface EvalSuite {
  id: string
  name: string
  description: string
  testCases: EvalTestCase[]
  results: EvalResult[]
}

export class EvaluationFramework {
  private suites: Map<string, EvalSuite> = new Map()

  createSuite(id: string, name: string, description: string): EvalSuite {
    const suite: EvalSuite = {
      id,
      name,
      description,
      testCases: [],
      results: []
    }
    this.suites.set(id, suite)
    return suite
  }

  addTestCase(suiteId: string, testCase: EvalTestCase): void {
    const suite = this.suites.get(suiteId)
    if (!suite) {
      throw new Error(`Suite ${suiteId} not found`)
    }
    suite.testCases.push(testCase)
  }

  async runEvaluation(
    suiteId: string,
    agentRunner: (input: string) => Promise<{
      output: string
      tools: string[]
      duration: number
      tokenUsage: number
    }>
  ): Promise<EvalResult[]> {
    const suite = this.suites.get(suiteId)
    if (!suite) {
      throw new Error(`Suite ${suiteId} not found`)
    }

    const results: EvalResult[] = []

    for (const testCase of suite.testCases) {
      try {
        const startTime = Date.now()
        const result = await agentRunner(testCase.input)
        const duration = Date.now() - startTime

        const evalResult = this.evaluateTestCase(testCase, result)
        results.push(evalResult)

      } catch (error) {
        results.push({
          testId: testCase.id,
          passed: false,
          score: 0,
          details: {
            errors: [error instanceof Error ? error.message : String(error)]
          },
          timestamp: new Date().toISOString()
        })
      }
    }

    suite.results = results
    return results
  }

  private evaluateTestCase(
    testCase: EvalTestCase,
    result: { output: string; tools: string[]; duration: number; tokenUsage: number }
  ): EvalResult {
    const details: EvalResult['details'] = {
      actualOutput: result.output,
      actualTools: result.tools
    }

    let score = 0
    const errors: string[] = []

    // Accuracy evaluation
    if (testCase.expectedOutput) {
      const accuracy = this.calculateAccuracy(testCase.expectedOutput, result.output)
      details.accuracy = accuracy
      score += accuracy * (testCase.criteria.accuracy || 0.3)
    }

    // Tool usage evaluation
    if (testCase.expectedTools) {
      const toolScore = this.calculateToolScore(testCase.expectedTools, result.tools)
      details.completeness = toolScore
      score += toolScore * (testCase.criteria.completeness || 0.3)
    }

    // Efficiency evaluation
    const efficiency = this.calculateEfficiency(result.duration, result.tokenUsage)
    details.efficiency = efficiency
    score += efficiency * (testCase.criteria.efficiency || 0.2)

    // Safety evaluation (basic check)
    const safety = this.calculateSafety(result.output)
    details.safety = safety
    score += safety * (testCase.criteria.safety || 0.2)

    return {
      testId: testCase.id,
      passed: score >= 0.7, // 70% threshold
      score: Math.min(score, 1.0),
      details,
      timestamp: new Date().toISOString()
    }
  }

  private calculateAccuracy(expected: string, actual: string): number {
    // Simple similarity check - can be enhanced with more sophisticated methods
    const expectedWords = expected.toLowerCase().split(/\s+/)
    const actualWords = actual.toLowerCase().split(/\s+/)
    
    const intersection = expectedWords.filter(word => actualWords.includes(word))
    const union = [...new Set([...expectedWords, ...actualWords])]
    
    return intersection.length / union.length
  }

  private calculateToolScore(expectedTools: string[], actualTools: string[]): number {
    if (expectedTools.length === 0) return 1.0
    
    const foundTools = expectedTools.filter(tool => actualTools.includes(tool))
    return foundTools.length / expectedTools.length
  }

  private calculateEfficiency(duration: number, tokenUsage: number): number {
    // Normalize duration (assume 30s is good)
    const durationScore = Math.min(1.0, 30000 / duration)
    
    // Normalize token usage (assume 1000 tokens is good)
    const tokenScore = Math.min(1.0, 1000 / tokenUsage)
    
    return (durationScore + tokenScore) / 2
  }

  private calculateSafety(output: string): number {
    // Basic safety checks
    const dangerousPatterns = [
      /rm -rf/gi,
      /sudo rm/gi,
      /format c:/gi,
      /delete from/gi,
      /drop table/gi
    ]
    
    const hasDangerousContent = dangerousPatterns.some(pattern => pattern.test(output))
    return hasDangerousContent ? 0.0 : 1.0
  }

  getSuiteResults(suiteId: string): EvalSuite | undefined {
    return this.suites.get(suiteId)
  }

  getAllSuites(): EvalSuite[] {
    return Array.from(this.suites.values())
  }

  getSummary(suiteId: string): {
    totalTests: number
    passedTests: number
    failedTests: number
    averageScore: number
    totalDuration: number
  } {
    const suite = this.suites.get(suiteId)
    if (!suite) {
      throw new Error(`Suite ${suiteId} not found`)
    }

    const results = suite.results
    const passedTests = results.filter(r => r.passed).length
    const totalScore = results.reduce((sum, r) => sum + r.score, 0)

    return {
      totalTests: results.length,
      passedTests,
      failedTests: results.length - passedTests,
      averageScore: results.length > 0 ? totalScore / results.length : 0,
      totalDuration: 0 // Would need to track this during execution
    }
  }
}

export const evaluationFramework = new EvaluationFramework()

// Pre-built test suites
export function createCodingTestSuite(): EvalSuite {
  const suite = evaluationFramework.createSuite(
    'coding-basics',
    'Basic Coding Skills Test Suite',
    'Tests fundamental coding capabilities'
  )

  evaluationFramework.addTestCase('coding-basics', {
    id: 'create-function',
    name: 'Create a Simple Function',
    description: 'Test ability to create a basic function',
    input: 'Create a function that calculates the factorial of a number',
    expectedOutput: 'function factorial(n)',
    expectedTools: ['write_file'],
    criteria: {
      accuracy: 0.4,
      completeness: 0.4,
      efficiency: 0.1,
      safety: 0.1
    }
  })

  evaluationFramework.addTestCase('coding-basics', {
    id: 'debug-error',
    name: 'Debug and Fix Error',
    description: 'Test debugging capabilities',
    input: 'Fix this code: console.log("Hello World"',
    expectedOutput: 'console.log("Hello World")',
    expectedTools: ['read_file', 'apply_edit'],
    criteria: {
      accuracy: 0.5,
      completeness: 0.3,
      efficiency: 0.1,
      safety: 0.1
    }
  })

  return suite
}

export function createWebSearchTestSuite(): EvalSuite {
  const suite = evaluationFramework.createSuite(
    'web-search',
    'Web Search and Information Retrieval',
    'Tests web search and information gathering'
  )

  evaluationFramework.addTestCase('web-search', {
    id: 'current-events',
    name: 'Find Current Information',
    description: 'Test ability to find recent information',
    input: 'What are the latest developments in AI for 2024?',
    expectedTools: ['search_knowledge'],
    criteria: {
      accuracy: 0.3,
      completeness: 0.5,
      efficiency: 0.1,
      safety: 0.1
    }
  })

  return suite
}