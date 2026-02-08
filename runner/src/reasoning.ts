import { llmService } from './llm/index.js'
import type { ChatMessage } from './llm/types.js'

export type ReasoningMode = 'react' | 'chain_of_thought' | 'parallel'

export interface ReasoningConfig {
  mode: ReasoningMode
  maxSteps?: number
  parallelModels?: string[]
  consensusThreshold?: number
}

export interface ReasoningStep {
  step: number
  type: 'thought' | 'action' | 'observation' | 'response'
  content: string
  timestamp: string
}

export class ReasoningEngine {
  private readonly config: ReasoningConfig
  private steps: ReasoningStep[] = []

  constructor(config: ReasoningConfig) {
    this.config = {
      maxSteps: 10,
      parallelModels: ['gpt-4o', 'claude-3-sonnet', 'gemini-pro'],
      consensusThreshold: 0.7,
      ...config
    }
  }

  async processWithReasoning(
    messages: ChatMessage[],
    tools: any[],
    context: any
  ): Promise<{ response: ChatMessage; steps: ReasoningStep[] }> {
    switch (this.config.mode) {
      case 'react':
        return await this.processReAct(messages, tools, context)
      case 'chain_of_thought':
        return await this.processChainOfThought(messages, tools, context)
      case 'parallel':
        return await this.processParallel(messages, tools, context)
      default:
        throw new Error(`Unknown reasoning mode: ${this.config.mode}`)
    }
  }

  private async processReAct(
    messages: ChatMessage[],
    tools: any[],
    context: any
  ): Promise<{ response: ChatMessage; steps: ReasoningStep[] }> {
    this.steps = []
    let stepCount = 0
    
    const systemPrompt = `You are an AI assistant that uses the ReAct (Reasoning and Acting) framework.

For each user request, follow this pattern:

1. **Thought**: Analyze the situation and plan your approach
2. **Action**: Take a specific action (use a tool if needed)
3. **Observation**: Observe the result of your action
4. **Response**: Provide a final response to the user

Format your responses as:
Thought: [Your reasoning]
Action: [Your action or tool call]
Observation: [Result of action]
Response: [Final answer to user]

Keep thoughts concise and actionable.`

    const reactMessages = [
      { role: 'system' as const, content: systemPrompt },
      ...messages
    ]

    while (stepCount < this.config.maxSteps!) {
      stepCount++
      
      try {
        const response = await llmService.chat({
          provider: 'openai',
          model: 'gpt-4o',
          apiKey: context.apiKey
        }, reactMessages, tools)

        const content = response.content || ''
        
        // Parse ReAct format
        const thought = this.extractSection(content, 'Thought:')
        const action = this.extractSection(content, 'Action:')
        const observation = this.extractSection(content, 'Observation:')
        const finalResponse = this.extractSection(content, 'Response:')

        // Record steps
        if (thought) {
          this.steps.push({
            step: stepCount,
            type: 'thought',
            content: thought,
            timestamp: new Date().toISOString()
          })
        }

        if (action) {
          this.steps.push({
            step: stepCount,
            type: 'action',
            content: action,
            timestamp: new Date().toISOString()
          })
        }

        if (observation) {
          this.steps.push({
            step: stepCount,
            type: 'observation',
            content: observation,
            timestamp: new Date().toISOString()
          })
        }

        // If we have a final response, return it
        if (finalResponse) {
          this.steps.push({
            step: stepCount,
            type: 'response',
            content: finalResponse,
            timestamp: new Date().toISOString()
          })

          return {
            response: {
              role: 'assistant' as const,
              content: finalResponse
            },
            steps: this.steps
          }
        }

        // If no final response, continue the loop
        reactMessages.push({ role: 'assistant', content })
        
      } catch (error) {
        this.steps.push({
          step: stepCount,
          type: 'observation', // Changed from 'error' to valid type
          content: `Error in ReAct processing: ${error instanceof Error ? error.message : String(error)}`,
          timestamp: new Date().toISOString()
        })
        break
      }
    }

    // Fallback response if max steps reached
    return {
      response: {
        role: 'assistant' as const,
        content: 'I apologize, but I need more steps to complete this task. Let me try a different approach.'
      },
      steps: this.steps
    }
  }

  private async processChainOfThought(
    messages: ChatMessage[],
    tools: any[],
    context: any
  ): Promise<{ response: ChatMessage; steps: ReasoningStep[] }> {
    this.steps = []
    
    const systemPrompt = `You are an AI assistant that uses step-by-step reasoning.

For complex problems, break down your thinking into clear steps:

1. **Understand**: What is the user asking?
2. **Analyze**: What information do I have? What do I need?
3. **Plan**: What's the best approach to solve this?
4. **Execute**: Take action step by step
5. **Verify**: Check if the solution works

Use "Let's think step by step:" to start your reasoning, then proceed methodically.

Be thorough but concise in your reasoning.`

    const cotMessages = [
      { role: 'system' as const, content: systemPrompt },
      ...messages
    ]

    try {
      const response = await llmService.chat({
        provider: 'openai',
        model: 'gpt-4o',
        apiKey: context.apiKey
      }, cotMessages, tools)

      const content = response.content || ''
      
      // Extract reasoning steps from the response
      const steps = this.extractChainOfThoughtSteps(content)
      this.steps = steps.map((step, index) => ({
        step: index + 1,
        type: 'thought' as const,
        content: step,
        timestamp: new Date().toISOString()
      }))

      return {
        response,
        steps: this.steps
      }
    } catch (error) {
      this.steps.push({
        step: 1,
        type: 'observation', // Changed from 'error' to valid type
        content: `Error in Chain-of-Thought processing: ${error instanceof Error ? error.message : String(error)}`,
        timestamp: new Date().toISOString()
      })

      return {
        response: {
          role: 'assistant' as const,
          content: 'I encountered an error while processing your request.'
        },
        steps: this.steps
      }
    }
  }

  private async processParallel(
    messages: ChatMessage[],
    tools: any[],
    context: any
  ): Promise<{ response: ChatMessage; steps: ReasoningStep[] }> {
    this.steps = []
    const models = this.config.parallelModels!
    
    const promises = models.map(async (model, index) => {
      try {
        const response = await llmService.chat({
          provider: 'openai',
          model,
          apiKey: context.apiKey
        }, messages, tools)
        
        return {
          model,
          response: response.content || '',
          success: true
        }
      } catch (error) {
        return {
          model,
          response: '',
          success: false,
          error: error instanceof Error ? error.message : String(error)
        }
      }
    })

    const results = await Promise.all(promises)
    
    // Record individual model responses
    results.forEach((result, index) => {
      this.steps.push({
        step: index + 1,
        type: 'thought',
        content: `${result.model}: ${result.success ? result.response : `Error: ${result.error}`}`,
        timestamp: new Date().toISOString()
      })
    })

    // Consensus mechanism - simple majority vote on best response
    const successfulResponses = results.filter(r => r.success && r.response.length > 0)
    
    if (successfulResponses.length === 0) {
      return {
        response: {
          role: 'assistant' as const,
          content: 'All models failed to process your request.'
        },
        steps: this.steps
      }
    }

    // For simplicity, use the first successful response
    // In a real implementation, you'd have more sophisticated consensus
    const bestResponse = successfulResponses[0]
    
    this.steps.push({
      step: results.length + 1,
      type: 'response',
      content: `Consensus: Using response from ${bestResponse.model}`,
      timestamp: new Date().toISOString()
    })

    return {
      response: {
        role: 'assistant' as const,
        content: bestResponse.response
      },
      steps: this.steps
    }
  }

  private extractSection(content: string, section: string): string | null {
    const regex = new RegExp(`${section}\\s*([^\\n]+)`, 'i')
    const match = content.match(regex)
    return match ? match[1].trim() : null
  }

  private extractChainOfThoughtSteps(content: string): string[] {
    // Simple extraction of numbered or bulleted steps
    const lines = content.split('\n')
    const steps: string[] = []
    
    for (const line of lines) {
      const trimmed = line.trim()
      if (trimmed.match(/^\d+\./) || trimmed.match(/^[-*]/)) {
        steps.push(trimmed)
      } else if (trimmed.includes('step') || trimmed.includes('Step')) {
        steps.push(trimmed)
      }
    }
    
    return steps.length > 0 ? steps : [content]
  }

  getSteps(): ReasoningStep[] {
    return this.steps
  }
}

export const reasoningEngine = new ReasoningEngine({
  mode: 'chain_of_thought',
  maxSteps: 8
})