
import type { JobContext } from './executor.js'
import type { RunnerEventType } from './db.js'
import { ToolRegistry } from './tools.js'
import { llmService } from './llm/index.js'
import type { ChatMessage } from './llm/types.js'
import type { HistoryConfig, HistoryMode } from './history_config.js'
import { z } from 'zod'
import { contextCompressor } from './context_compressor.js'
import { guardrailService } from './guardrail_service.js'
import { hookManager, type AgentHooks } from './hooks.js'

export interface AgentMemory {
  conversation: Array<{
    role: 'user' | 'assistant' | 'system' | 'tool'
    content?: string | null
    name?: string
    tool_call_id?: string
    tool_calls?: Array<{
      id: string
      type: 'function'
      function: { name: string; arguments?: string }
    }>
    timestamp: string
  }>
  taskHistory: Array<{
    task: string
    result: string
    success: boolean
    timestamp: string
  }>
}

export interface AgentConfig {
  name: string
  model?: string
  provider?: string
  systemPrompt?: string
  historyConfig?: HistoryConfig
  hooks?: AgentHooks
}

export abstract class Agent {
  protected id: string
  public name: string
  protected model: string
  protected provider: string
  protected systemPrompt: string
  protected tools: ToolRegistry
  protected memory: AgentMemory
  protected context: JobContext
  protected historyConfig: HistoryConfig
  protected abortController: AbortController

  constructor(ctx: JobContext, config: AgentConfig) {
    this.context = ctx
    this.id = ctx.jobId
    this.name = config.name
    this.model = config.model || ctx.input.model || 'gpt-4o'
    this.provider = config.provider || ctx.input.provider || 'openai'
    this.systemPrompt = config.systemPrompt || 'You are a helpful AI assistant.'
    this.historyConfig = config.historyConfig || {
      mode: 'ALWAYS',
      maxMessages: 20,
      includeToolCalls: true,
      includeSystemMessages: true
    }
    this.tools = new ToolRegistry()
    this.memory = {
      conversation: [],
      taskHistory: []
    }
    this.abortController = new AbortController()
    
    // Set hooks if provided
    if (config.hooks) {
      hookManager.setHooks(config.hooks)
    }
    
    this.registerDefaultTools()
    this.registerHistoryTools()
  }

  protected registerHistoryTools(): void {
    if (this.historyConfig.mode === 'ON_DEMAND') {
      this.tools.registerTool({
        name: 'get_chat_history',
        description: 'Get recent conversation history from this session',
        parameters: z.object({
          maxMessages: z.number().optional().describe('Maximum number of messages to retrieve (default: 20)')
        }),
        handler: async (args: { maxMessages?: number }) => {
          const history = await this.getChatHistory(args.maxMessages)
          return {
            messages: history.map(msg => ({
              role: msg.role,
              content: msg.content,
              timestamp: msg.timestamp
            })),
            count: history.length
          }
        }
      })
    }
  }

  protected abstract registerDefaultTools(): void

  protected async loadMemory(): Promise<void> {
    const sessionId = this.context.input.session_id
    if (!sessionId) return

    switch (this.historyConfig.mode) {
      case 'ALWAYS':
        await this.loadAlwaysMode(sessionId)
        break
      case 'ON_DEMAND':
        // Don't load automatically - agent will request when needed
        break
      case 'MANUAL':
        // Don't load automatically - developer controls what to include
        break
    }
  }

  protected async getChatHistory(maxMessages?: number): Promise<typeof this.memory.conversation> {
    if (this.historyConfig.mode !== 'ON_DEMAND') {
      return this.memory.conversation
    }

    const limit = maxMessages || this.historyConfig.maxMessages || 20
    const sessionId = this.context.input.session_id
    
    if (!sessionId) {
      return []
    }

    try {
      const recentJobs = await this.context.store.listJobs(10)
      const history: typeof this.memory.conversation = []

      for (const job of recentJobs) {
        if (job.id === this.context.jobId) continue

        const jobEvents = await this.context.store.getEvents(job.id)
        const memoryEvents = jobEvents.filter(e => e.type === 'memory')

        for (const event of memoryEvents) {
          if (event.data && typeof event.data === 'object') {
            const data = event.data as any
            if (data.role && this.shouldIncludeMessage(data)) {
              history.push({
                role: data.role,
                content: data.content,
                name: data.name,
                tool_call_id: data.tool_call_id,
                tool_calls: data.tool_calls,
                timestamp: event.ts
              })
            }
          }
        }
        if (history.length >= limit) break
      }

      history.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
      return history.slice(-limit)
    } catch (err) {
      console.log('Failed to get chat history:', err)
      return []
    }
  }

  private async loadAlwaysMode(sessionId: string): Promise<void> {
    try {
      const maxMessages = this.historyConfig.maxMessages || 20
      const recentJobs = await this.context.store.listJobs(10)

      for (const job of recentJobs) {
        if (job.id === this.context.jobId) continue

        const jobEvents = await this.context.store.getEvents(job.id)
        const memoryEvents = jobEvents.filter(e => e.type === 'memory')

        for (const event of memoryEvents) {
          if (event.data && typeof event.data === 'object') {
            const data = event.data as any
            if (data.role && this.shouldIncludeMessage(data)) {
              this.memory.conversation.push({
                role: data.role,
                content: data.content,
                name: data.name,
                tool_call_id: data.tool_call_id,
                tool_calls: data.tool_calls,
                timestamp: event.ts
              })
            }
          }
        }
        if (this.memory.conversation.length >= maxMessages) break
      }
      
      // Sort and limit
      this.memory.conversation.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
      if (this.memory.conversation.length > maxMessages) {
        this.memory.conversation = this.memory.conversation.slice(-maxMessages)
      }
    } catch (err) {
      console.log('Failed to load memory:', err)
    }
  }

  private shouldIncludeMessage(data: any): boolean {
    if (data.role === 'system' && !this.historyConfig.includeSystemMessages) {
      return false
    }
    if (data.role === 'tool' && !this.historyConfig.includeToolCalls) {
      return false
    }
    return true
  }

  protected async saveMemory(): Promise<void> {
    for (const msg of this.memory.conversation) {
      await this.emitEvent('memory', {
        role: msg.role,
        content: msg.content,
        name: msg.name,
        tool_call_id: msg.tool_call_id,
        tool_calls: msg.tool_calls,
        timestamp: msg.timestamp
      })
    }
  }

  protected async emitEvent(type: RunnerEventType, data?: unknown): Promise<void> {
    const event = {
      id: `evt_${Date.now()}_${Math.random().toString(16).slice(2)}`,
      type,
      ts: new Date().toISOString(),
      job_id: this.context.jobId,
      data
    }

    // Trigger hooks based on event type
    switch (type) {
      case 'job.started':
        await hookManager.triggerStart({ event, context: this.context })
        break
      case 'error':
        await hookManager.triggerError(new Error(data as string), { event, context: this.context })
        break
      case 'done':
        await hookManager.triggerEnd(data, { event, context: this.context })
        break
      case 'tool.output':
        if (data && typeof data === 'object' && 'tool' in data) {
          const toolData = data as any
          await hookManager.triggerToolCall(toolData.tool, toolData.args, toolData.output)
        }
        break
    }

    await this.context.store.addEvent(event)

    for (const sub of this.context.subscribers) {
      sub.raw.write(`event: ${type}\n`)
      sub.raw.write(`data: ${JSON.stringify(event)}\n\n`)
    }
  }

  protected async callLLM(messages: any[]): Promise<any> {
    // Check for cancellation
    if (this.abortController.signal.aborted) {
      throw new Error('Agent execution cancelled')
    }

    // Use bridge if available
    if (this.context.bridge) {
      return this.callLLMWithBridge(messages)
    }

    const tools = this.tools.getToolSchemas()
    
    // Map internal memory format to ChatMessage format
    let chatMessages: ChatMessage[] = messages.map(m => ({
      role: m.role,
      content: m.content,
      name: m.name,
      tool_call_id: m.tool_call_id,
      tool_calls: m.tool_calls
    }))

    // Apply input guardrails to user messages
    const userMessages = chatMessages.filter(m => m.role === 'user')
    for (const msg of userMessages) {
      if (msg.content) {
        const guardResult = guardrailService.checkInput(msg.content)
        if (!guardResult.allowed) {
          throw new Error(`Input blocked: ${guardResult.reason}`)
        }
        // Optionally sanitize
        msg.content = guardrailService.sanitizeInput(msg.content)
      }
    }

    // Apply context compression if needed
    const nonSystemMessages = chatMessages.filter(m => m.role !== 'system')
    if (nonSystemMessages.length > 10) {
      try {
        const compression = await contextCompressor.compressMessages(nonSystemMessages)
        if (compression.savedTokens > 0) {
          // Replace old messages with compressed summary
          const systemMessages = chatMessages.filter(m => m.role === 'system')
          const compressedMsg = contextCompressor.createCompressedMessage(compression.summary)
          chatMessages = [...systemMessages, compressedMsg]
        }
      } catch (error) {
        console.warn('Context compression failed:', error)
      }
    }

    try {
      const response = await llmService.chat({
        provider: this.provider,
        model: this.model,
        apiKey: process.env.AI_API_KEY
      }, chatMessages, tools)

      // Apply output guardrails
      if (response.content) {
        const outputGuard = guardrailService.checkOutput(response.content)
        if (!outputGuard.allowed) {
          return {
            role: 'assistant',
            content: `I cannot provide that response: ${outputGuard.reason}`
          }
        }
      }

      return response
    } catch (err) {
      throw new Error(`LLM call failed: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  protected async callLLMWithBridge(messages: any[]): Promise<any> {
    if (!this.context.bridge) throw new Error('Bridge not available')

    // Convert conversation to instruction for Copilot
    // This is a simplification. In a real scenario, we'd want to preserve the structure better.
    const lastUserMessage = [...messages].reverse().find(m => m.role === 'user')?.content || ''
    const systemContext = messages.find(m => m.role === 'system')?.content || ''
    
    const instruction = `${systemContext}\n\nUser request: ${lastUserMessage}\n\nPlease provide a helpful response and use tools as needed.`

    // Simplified file context loading
    const relevantFiles: Array<{ path: string; text: string }> = []
    try {
        // We might want to make this configurable or smarter
        const files = await this.context.bridge.listFiles('**/*.{js,ts,json,md}', 10)
        for (const file of files.slice(0, 5)) {
            const content = await this.context.bridge.readFile(file.path)
            relevantFiles.push({ path: content.path, text: content.text.slice(0, 2000) })
        }
    } catch (e) {
        console.warn("Bridge file listing failed", e)
    }

    const result = await this.context.bridge.generateEdits(instruction, relevantFiles)

    // Map bridge result to OpenAI format
    return {
      role: 'assistant',
      content: result.summary || 'Code changes generated successfully',
      tool_calls: result.edits.map((edit, index) => ({
        id: `call_${index}`,
        type: 'function',
        function: {
          name: 'apply_edit',
          arguments: JSON.stringify({
            path: edit.path,
            range: edit.range,
            text: edit.text
          })
        }
      }))
    }
  }

  public getLastResponse(): string | null {
    for (let i = this.memory.conversation.length - 1; i >= 0; i--) {
      const msg = this.memory.conversation[i]
      if (msg.role === 'assistant' && msg.content) {
        return msg.content
      }
    }
    return null
  }

  public cancel(): void {
    this.abortController.abort()
  }

  abstract run(input?: any): Promise<void>
}
