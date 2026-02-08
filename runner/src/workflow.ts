
import { Agent } from './agent_base.js'
import { Team } from './team.js'
import type { JobContext } from './executor.js'

export type StepType = 'agent' | 'team' | 'function' | 'loop' | 'parallel' | 'condition' | 'router'

export interface StepInput {
  [key: string]: any
}

export interface StepOutput {
  [key: string]: any
}

export interface Step {
  id: string
  name: string
  type: StepType
  input?: (context: any) => StepInput // Function to derive input from context/prev steps
  next?: string // ID of next step (if not sequential)
}

export interface AgentStep extends Step {
  type: 'agent'
  agent: Agent
}

export interface TeamStep extends Step {
  type: 'team'
  team: Team
}

export interface FunctionStep extends Step {
  type: 'function'
  handler: (input: StepInput, context: JobContext) => Promise<StepOutput>
}

export interface LoopStep extends Step {
  type: 'loop'
  condition: (context: any) => boolean
  stepId: string // The step to loop back to or execute
}

export interface WorkflowConfig {
  name: string
  steps: Step[]
}

export class Workflow {
  private steps: Map<string, Step>
  private context: JobContext
  private workflowContext: any = {} // Store outputs of steps

  constructor(ctx: JobContext, config: WorkflowConfig) {
    this.context = ctx
    this.steps = new Map(config.steps.map(s => [s.id, s]))
  }

  async run(input: any): Promise<void> {
    this.workflowContext.input = input
    
    // Simple sequential execution for now unless next is specified
    const stepList = Array.from(this.steps.values())
    let currentStepIndex = 0
    
    while (currentStepIndex < stepList.length) {
      const step = stepList[currentStepIndex]
      
      await this.emitEvent('workflow.step.start', { step: step.id, name: step.name })
      
      try {
        const stepInput = step.input ? step.input(this.workflowContext) : (this.workflowContext.lastOutput || input)
        let output: any
        
        if (step.type === 'agent') {
           const agentStep = step as AgentStep
           await agentStep.agent.run(stepInput)
           output = agentStep.agent.getLastResponse()
        } else if (step.type === 'team') {
           const teamStep = step as TeamStep
           await teamStep.team.run(stepInput)
           output = teamStep.team.getLastResponse()
        } else if (step.type === 'function') {
           const funcStep = step as FunctionStep
           output = await funcStep.handler(stepInput, this.context)
        }
        
        this.workflowContext[step.id] = output
        this.workflowContext.lastOutput = output
        
        await this.emitEvent('workflow.step.end', { step: step.id, success: true, output })
        
        // Handle control flow (next)
        if (step.next) {
            const nextIndex = stepList.findIndex(s => s.id === step.next)
            if (nextIndex !== -1) {
                currentStepIndex = nextIndex
                continue
            }
        }
        
        currentStepIndex++
        
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err)
        await this.emitEvent('workflow.step.end', { step: step.id, success: false, error })
        throw err
      }
    }
    
    await this.emitEvent('done', { message: 'Workflow completed', output: this.workflowContext.lastOutput })
  }

  private async emitEvent(type: string, data?: unknown): Promise<void> {
    const event = {
      id: `evt_${Date.now()}_${Math.random().toString(16).slice(2)}`,
      type: type as any, // Cast to any to avoid strict checking against RunnerEventType for now
      ts: new Date().toISOString(),
      job_id: this.context.jobId,
      data
    }

    await this.context.store.addEvent(event)
    
    for (const sub of this.context.subscribers) {
      sub.raw.write(`event: ${type}\n`)
      sub.raw.write(`data: ${JSON.stringify(event)}\n\n`)
    }
  }
}
