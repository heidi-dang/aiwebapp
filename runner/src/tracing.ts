export interface TraceSpan {
  name: string
  startTime: number
  endTime?: number
  attributes: Record<string, any>
  events: Array<{
    name: string
    timestamp: number
    attributes?: Record<string, any>
  }>
  status: 'unset' | 'ok' | 'error'
  error?: Error
}

export interface TraceData {
  traceId: string
  spans: TraceSpan[]
  startTime: number
  endTime?: number
}

export class SimpleTracer {
  private currentTrace?: TraceData
  private currentSpan?: TraceSpan
  private spans: TraceSpan[] = []

  startTrace(traceId: string): void {
    this.currentTrace = {
      traceId,
      spans: [],
      startTime: Date.now()
    }
    this.spans = []
  }

  startSpan(name: string, attributes: Record<string, any> = {}): void {
    if (this.currentSpan) {
      // End previous span if still active
      this.endSpan()
    }

    this.currentSpan = {
      name,
      startTime: Date.now(),
      attributes,
      events: [],
      status: 'unset'
    }
  }

  addEvent(name: string, attributes?: Record<string, any>): void {
    if (!this.currentSpan) return

    this.currentSpan.events.push({
      name,
      timestamp: Date.now(),
      attributes
    })
  }

  setStatus(status: 'ok' | 'error', error?: Error): void {
    if (!this.currentSpan) return

    this.currentSpan.status = status
    if (error) {
      this.currentSpan.error = error
    }
  }

  endSpan(): void {
    if (!this.currentSpan) return

    this.currentSpan.endTime = Date.now()
    this.spans.push(this.currentSpan)
    this.currentSpan = undefined
  }

  endTrace(): TraceData | undefined {
    if (!this.currentTrace) return undefined

    // End any active span
    if (this.currentSpan) {
      this.endSpan()
    }

    const traceData: TraceData = {
      ...this.currentTrace,
      spans: [...this.spans],
      endTime: Date.now()
    }

    // Reset state
    this.currentTrace = undefined
    this.spans = []

    return traceData
  }

  getCurrentTrace(): TraceData | undefined {
    if (!this.currentTrace) return undefined

    return {
      ...this.currentTrace,
      spans: [...this.spans]
    }
  }

  exportTrace(): string {
    const trace = this.getCurrentTrace()
    if (!trace) return ''

    return JSON.stringify(trace, null, 2)
  }
}

// Global tracer instance
export const tracer = new SimpleTracer()

// Helper functions for common tracing patterns
export function traceFunction<T>(
  name: string,
  fn: () => T | Promise<T>,
  attributes: Record<string, any> = {}
): T | Promise<T> {
  tracer.startSpan(name, attributes)
  
  try {
    const result = fn()
    
    if (result instanceof Promise) {
      return result.then(
        (value) => {
          tracer.setStatus('ok')
          tracer.endSpan()
          return value
        },
        (error) => {
          tracer.setStatus('error', error)
          tracer.endSpan()
          throw error
        }
      )
    } else {
      tracer.setStatus('ok')
      tracer.endSpan()
      return result
    }
  } catch (error) {
    tracer.setStatus('error', error as Error)
    tracer.endSpan()
    throw error
  }
}

export function traceAsyncFunction<T>(
  name: string,
  fn: () => Promise<T>,
  attributes: Record<string, any> = {}
): Promise<T> {
  tracer.startSpan(name, attributes)
  
  return fn().then(
    (value) => {
      tracer.setStatus('ok')
      tracer.endSpan()
      return value
    },
    (error) => {
      tracer.setStatus('error', error)
      tracer.endSpan()
      throw error
    }
  )
}

// Integration with Agent execution
export function traceAgentExecution(
  agentName: string,
  input: string,
  runFn: () => Promise<void>
): Promise<void> {
  const traceId = `agent_${agentName}_${Date.now()}`
  tracer.startTrace(traceId)
  
  tracer.startSpan('agent.execution', {
    'agent.name': agentName,
    'agent.input': input
  })
  
  return runFn().then(
    () => {
      tracer.setStatus('ok')
      tracer.endSpan()
      const traceData = tracer.endTrace()
      
      // Log trace data (in production, this would go to a trace collector)
      if (traceData) {
        console.log('Agent execution trace:', JSON.stringify(traceData, null, 2))
      }
    },
    (error) => {
      tracer.setStatus('error', error)
      tracer.endSpan()
      const traceData = tracer.endTrace()
      
      if (traceData) {
        console.error('Agent execution failed:', JSON.stringify(traceData, null, 2))
      }
      
      throw error
    }
  )
}