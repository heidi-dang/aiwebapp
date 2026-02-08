
import { Agent, AgentConfig } from './agent_base.js'
import type { JobContext } from './executor.js'
import { z } from 'zod'

export type DelegationPattern = 'supervisor' | 'router' | 'broadcast'

export interface TeamConfig extends AgentConfig {
  members: Agent[]
  delegationPattern?: DelegationPattern
}

export class Team extends Agent {
  private members: Map<string, Agent>
  private delegationPattern: DelegationPattern

  constructor(ctx: JobContext, config: TeamConfig) {
    super(ctx, config)
    this.members = new Map(config.members.map(m => [m.name, m]))
    this.delegationPattern = config.delegationPattern || 'supervisor'
  }

  protected registerDefaultTools(): void {
    // Register tools to call members
    for (const [name, agent] of this.members) {
      this.tools.registerTool({
        name: `call_${name.toLowerCase().replace(/\s+/g, '_')}`,
        description: `Delegate a task to ${name}`,
        parameters: z.object({
          instruction: z.string().describe('The instruction/task for the agent')
        }),
        handler: async (args) => {
          return await this.delegateToAgent(name, args.instruction)
        }
      })
    }
  }

  private async delegateToAgent(name: string, instruction: string): Promise<any> {
    const agent = this.members.get(name)
    if (!agent) throw new Error(`Agent ${name} not found`)

    await this.emitEvent('plan', { 
      state: 'delegating', 
      message: `Delegating to ${name}: ${instruction}` 
    })

    await agent.run(instruction)
    const result = agent.getLastResponse()
    
    return { result: result || 'No response from agent' } 
  }

  async run(input?: string): Promise<void> {
    const instruction = input || this.context.input.message || this.context.input.instruction
    if (instruction) {
      this.memory.conversation.push({
        role: 'user',
        content: instruction,
        timestamp: new Date().toISOString()
      })
    }
    
    const maxSteps = 10
    let step = 0
    
    while (step < maxSteps) {
      const response = await this.callLLM(this.getMessages())
      this.appendResponse(response)
      
      if (!response.tool_calls || response.tool_calls.length === 0) {
        // Final response
        break
      }
      
      // If tool calls happened, appendResponse handles them (executes and adds to memory)
      // Loop continues to let LLM see results and continue
      step++
    }
    
    await this.saveMemory()
    await this.emitEvent('done', { message: 'Team execution finished' })
  }
  
  // Helper helpers
  private getMessages() {
     return [
      { role: 'system', content: this.systemPrompt },
      ...this.memory.conversation.map(m => ({
        role: m.role,
        content: m.content,
        name: m.name,
        tool_call_id: m.tool_call_id,
        tool_calls: m.tool_calls
      }))
    ]
  }

  private appendResponse(response: any) {
    this.memory.conversation.push({
      role: response.role,
      content: response.content,
      tool_calls: response.tool_calls,
      timestamp: new Date().toISOString()
    })
    
    if (response.tool_calls && response.tool_calls.length > 0) {
      this.handleToolCalls(response.tool_calls)
    }
  }

  private async handleToolCalls(toolCalls: any[]) {
     for (const call of toolCalls) {
      const { name, arguments: args } = call.function
      const params = args ? JSON.parse(args) : {}
      
      let result: any
      try {
        result = await this.tools.executeTool(name, params, this.context)
      } catch (err) {
        result = { error: err instanceof Error ? err.message : String(err) }
      }

      this.memory.conversation.push({
        role: 'tool',
        tool_call_id: call.id,
        name: name,
        content: JSON.stringify(result),
        timestamp: new Date().toISOString()
      })
    }
  }
}
