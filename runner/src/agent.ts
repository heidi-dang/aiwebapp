/**
 * Agent implementation for coding tasks
 * Workflow: Plan -> Code Generation -> Code Execution -> Review -> Iterate/Finish
 */

import type { JobContext, JobInput } from './executor.js'
import type { RunnerEventType } from './db.js'
import fs from 'node:fs/promises'
import path from 'node:path'
import { GitService } from './services/git.js'
import { RepoMapper } from './services/repo-map.js'
import { WebService } from './services/web.js'
import { MemoryService } from './services/memory.js'
import { ContextManager } from './services/context.js'
import { approvalService } from './services/approval.js'
import { loadHeidiGuidelines } from './services/heidi-guidelines.js'
import { llmService } from './llm/index.js'
import type { ChatMessage } from './llm/types.js'
import { McpRegistry } from './mcp/registry.js'

import { tracingService } from './tracing.js'
import { SpanStatusCode } from '@opentelemetry/api'
import { jobRateLimiter } from './rate-limiter.js'

export type AgentState = 'planning' | 'code_generation' | 'code_execution' | 'review' | 'iterate' | 'finish'

type PlanTaskStatus = 'pending' | 'in_progress' | 'done' | 'blocked'

type PlanTask = {
  id: string
  title: string
  verification?: string
  status: PlanTaskStatus
}

export interface AgentMemory {
  conversation: Array<{
    role: 'user' | 'assistant' | 'system'
    content: string
    timestamp: string
  }>
  taskHistory: Array<{
    task: string
    result: string
    success: boolean
    timestamp: string
  }>
}

export class CoderAgent {
  private state: AgentState = 'planning'
  private memory: AgentMemory = {
    conversation: [],
    taskHistory: []
  }
  private loadedConversation: AgentMemory['conversation'] = []
  private maxIterations = 5
  private currentIteration = 0
  private messages: ChatMessage[] = []
  private gitService: GitService
  private repoMapper: RepoMapper
  private webService: WebService
  private memoryService: MemoryService
  private contextManager: ContextManager
  private baseDir: string
  private planTasks: PlanTask[] = []
  private planMarkdown: string | null = null
  private autoRepairActive = false
  private mcp: McpRegistry

  constructor(private ctx: JobContext) {
    this.baseDir = ctx.input.base_dir && ctx.input.base_dir.trim() ? ctx.input.base_dir : process.cwd()
    this.gitService = new GitService(this.baseDir)
    this.repoMapper = new RepoMapper(this.baseDir)
    this.webService = new WebService()
    this.memoryService = new MemoryService(this.baseDir)
    this.contextManager = new ContextManager(llmService)
    this.mcp = new McpRegistry(this.baseDir)
    this.initializeMessages()
  }

  private async loadMemory(): Promise<void> {
    const sessionId = this.ctx.input.session_id
    if (!sessionId) return

    // Load previous conversation from jobs with the same session_id
    try {
      // Use the optimized query by session_id
      const recentJobs = await this.ctx.store.listJobsBySession(sessionId, 10)

      for (const job of recentJobs) {
        if (job.id === this.ctx.jobId) continue // Skip current job

        const jobEvents = await this.ctx.store.getEvents(job.id)
        const memoryEvents = jobEvents.filter(e => e.type === 'memory')

        for (const event of memoryEvents) {
          if (event.data && typeof event.data === 'object') {
            const data = event.data as any
            if (data.role && data.content) {
              this.loadedConversation.push({
                role: data.role,
                content: data.content,
                timestamp: event.ts
              })
            }
          }
        }

        // Limit memory to last 20 messages to avoid context overflow
        if (this.loadedConversation.length >= 20) break
      }

      // Sort by timestamp
      this.loadedConversation.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())

    } catch (err) {
      console.log('Failed to load memory:', err)
      // Continue without memory if loading fails
    }
  }

  private pushMessage(msg: ChatMessage): void {
    this.messages.push(msg)

    if ((msg.role === 'user' || msg.role === 'assistant' || msg.role === 'system') && typeof msg.content === 'string') {
      this.memory.conversation.push({
        role: msg.role,
        content: msg.content,
        timestamp: new Date().toISOString()
      })
    }
  }

  private applyLoadedMemoryToMessages(): void {
    if (this.loadedConversation.length === 0) return

    const system = this.messages.find(m => m.role === 'system')
    const lastUser = [...this.messages].reverse().find(m => m.role === 'user')

    const history: ChatMessage[] = this.loadedConversation
      .filter(m => m.role === 'user' || m.role === 'assistant')
      .map(m => ({ role: m.role, content: m.content }))

    const next: ChatMessage[] = []
    if (system) next.push(system)
    next.push(...history)
    if (lastUser) next.push(lastUser)

    this.messages = next
  }

  private async saveMemory(): Promise<void> {
    // Save current conversation to events in batch
    const memoryEvents = this.memory.conversation.map(msg => ({
      id: `evt_${Date.now()}_${Math.random().toString(16).slice(2)}_${Math.random().toString(16).slice(2)}`,
      type: 'memory' as RunnerEventType,
      ts: new Date().toISOString(),
      job_id: this.ctx.jobId,
      data: {
        role: msg.role,
        content: msg.content,
        timestamp: msg.timestamp
      }
    }))

    if (memoryEvents.length > 0) {
      await this.ctx.store.addEvents(memoryEvents)

      // Also emit to subscribers
      for (const event of memoryEvents) {
        for (const sub of this.ctx.subscribers) {
          sub.raw.write(`event: memory\n`)
          sub.raw.write(`data: ${JSON.stringify(event)}\n\n`)
        }
      }
    }
  }

  private initializeMessages(): void {
    const userSystemPrompt = this.ctx.input.system_prompt?.trim()
    const userSystemPromptBlock = userSystemPrompt
      ? `\n\nUser System Prompt (must follow):\n${userSystemPrompt}`
      : ''

    this.messages = []

    this.pushMessage({
      role: 'system',
      content: `You are a coding assistant that follows a structured workflow:
1. PLAN: Analyze the request and create a detailed plan
2. CODE: Generate or modify code based on the plan
3. EXECUTE: Run and test the code
4. REVIEW: Check if the task is complete and correct
5. ITERATE: Fix any issues found in review

Use the available tools to accomplish tasks. Always provide clear, working code.

For multi-file projects:
- First explore the existing codebase structure
- Create appropriate file/directory structure
- Generate all necessary files (main code, config files, tests, etc.)
- Ensure proper imports and dependencies between files
- Test the complete system, not just individual files

Be thorough and systematic in your approach.${userSystemPromptBlock}`
    })

    this.pushMessage({
      role: 'user',
      content: this.ctx.input.message || this.ctx.input.instruction || ''
    })
  }

  async run(): Promise<void> {
    const tracer = tracingService.getTracer()
    return tracer.startActiveSpan('CoderAgent.run', async (span) => {
      span.setAttribute('job_id', this.ctx.jobId)

      try {
        const heidiGuidelines = await loadHeidiGuidelines(this.baseDir)
        if (heidiGuidelines && this.messages.length > 0 && this.messages[0].role === 'system') {
          this.messages[0].content += `\n\nTeam Guidelines (must follow):\n${heidiGuidelines}`
        }

        await this.loadMemory()
        this.applyLoadedMemoryToMessages()

        try {
          await this.mcp.load()
        } catch {
        }

        // Inject repo map into system prompt
        const mapSpan = tracer.startSpan('generate_repo_map')
        try {
          const map = await this.repoMapper.generateMap()
          if (this.messages.length > 0 && this.messages[0].role === 'system') {
            this.messages[0].content += `\n\nCurrent Repository Map:\n${map}`
          }
          mapSpan.setStatus({ code: SpanStatusCode.OK })
        } catch (err) {
          console.warn('Failed to generate repo map:', err)
          mapSpan.setStatus({ code: SpanStatusCode.ERROR, message: String(err) })
        } finally {
          mapSpan.end()
        }

        if (this.ctx.input.resume_from_tasks) {
          await this.tryResumeFromFiles()
        }

        while (this.state !== 'finish' && this.currentIteration < this.maxIterations) {
          if (this.ctx.aborted) {
            await this.emitEvent('job.cancelled')
            span.setAttribute('aborted', true)
            return
          }

          const iterSpan = tracer.startSpan(`iteration_${this.currentIteration}`)
          iterSpan.setAttribute('state', this.state)

          await this.processState()

          iterSpan.end()
          this.currentIteration++
        }

        // Save memory before finishing
        await this.saveMemory()

        if (this.state === 'finish') {
          await this.emitEvent('done', { message: 'Task completed successfully' })
          span.setStatus({ code: SpanStatusCode.OK })
        } else {
          await this.emitEvent('done', { message: 'Task completed after max iterations' })
          span.setStatus({ code: SpanStatusCode.OK, message: 'Max iterations reached' })
        }
      } catch (err) {
        span.recordException(err instanceof Error ? err : new Error(String(err)))
        span.setStatus({ code: SpanStatusCode.ERROR })
        throw err
      } finally {
        await this.mcp.closeAll().catch(() => {})
        span.end()
      }
    })
  }

  private async processState(): Promise<void> {
    switch (this.state) {
      case 'planning':
        await this.handlePlanning()
        break
      case 'code_generation':
        await this.handleCodeGeneration()
        break
      case 'code_execution':
        await this.handleCodeExecution()
        break
      case 'review':
        await this.handleReview()
        break
      case 'iterate':
        await this.handleIterate()
        break
    }
  }

  private async handlePlanning(): Promise<void> {
    const planPrompt = `Before executing any edits:
1) Explore the repository (use list_dir / list_files / read_file as needed).
2) Produce a strategy document and a verifiable task checklist.

Return EXACTLY two sections in this format:

<plan_md>
...markdown for plan.md...
</plan_md>

<tasks_json>
[{"id":"T1","title":"...","verification":"(optional) command or check"}]
</tasks_json>

Rules:
- Tasks MUST be actionable and verifiable.
- Keep tasks small and sequential.

User request: "${this.ctx.input.message || this.ctx.input.instruction}"`

    this.pushMessage({ role: 'user', content: planPrompt })

    const response = await this.callLLMWithTools()

    const { planMarkdown, tasks } = this.extractPlanAndTasks(response.content || '')
    this.planMarkdown = planMarkdown
    this.planTasks = tasks

    if (this.planMarkdown) {
      await this.writePlanFile(this.planMarkdown)
    }
    if (this.planTasks.length > 0) {
      await this.writeTasksFile()
    }

    if (this.planTasks.length > 0) {
      await this.emitEvent('plan', {
        message: 'Plan created. Executing tasks…',
        steps: this.planTasks.map(t => ({ tool: t.id, description: t.title }))
      })
    } else {
      await this.emitEvent('plan', {
        message: 'Planning complete.',
        steps: [{ tool: 'planning', description: 'No structured tasks were generated' }]
      })
    }

    // Transition to code generation
    this.state = 'code_generation'
  }

  private async handleCodeGeneration(): Promise<void> {
    await this.emitEvent('tool.start', { tool: 'code_generation', state: 'code_generation' })

    const codePrompt = `Now generate the code based on the plan.
- Read any necessary files first to understand the existing codebase
- Generate complete, working code that fulfills the user's request
- Write the code to appropriate files (create new files or modify existing ones)
- Ensure the code is well-structured and follows best practices
- If this is a multi-file project, create all necessary files

User request: "${this.ctx.input.message || this.ctx.input.instruction}"

Generate the code now.`

    if (this.planTasks.length > 0) {
      for (const task of this.planTasks) {
        if (this.ctx.aborted) return
        if (task.status === 'done') continue

        task.status = 'in_progress'
        await this.writeTasksFile()
        await this.emitEvent('plan.update', { task })

        const taskPrompt = `Execute this task now.

Task: ${task.id} - ${task.title}
Verification: ${task.verification || '(none provided)'}

Rules:
- Use tools to make real edits.
- Keep changes focused to this task.
- When you believe the task is complete, respond with TASK DONE.`

        this.pushMessage({ role: 'user', content: taskPrompt })
        await this.callLLMWithTools()

        task.status = 'done'
        await this.writeTasksFile()
        await this.emitEvent('plan.update', { task })
      }
    } else {
      this.pushMessage({ role: 'user', content: codePrompt })
      await this.callLLMWithTools()
    }

    await this.emitEvent('tool.end', { tool: 'code_generation', success: true })
    this.state = 'code_execution'
  }

  private async tryResumeFromFiles(): Promise<boolean> {
    const planPath = path.join(this.baseDir, 'plan.md')
    const tasksPath = path.join(this.baseDir, 'tasks.md')

    let tasksText = ''
    try {
      tasksText = await fs.readFile(tasksPath, 'utf8')
    } catch {
      return false
    }

    const parsedTasks = this.parseTasksMarkdown(tasksText)
    if (parsedTasks.length === 0) return false

    this.planTasks = parsedTasks

    try {
      const planText = await fs.readFile(planPath, 'utf8')
      const trimmed = planText.trim()
      this.planMarkdown = trimmed ? trimmed : null
    } catch {
    }

    await this.emitEvent('plan', {
      message: 'Resumed from existing tasks.md',
      steps: this.planTasks.map(t => ({ tool: t.id, description: t.title }))
    })

    this.state = 'code_generation'
    return true
  }

  private parseTasksMarkdown(text: string): PlanTask[] {
    const lines = text.split('\n')
    const tasks: PlanTask[] = []

    for (const line of lines) {
      const m = line.match(/^\s*-\s*\[( |x|X)\]\s+([^:]+):\s*(.*?)(?:\s+\(verify:\s+`([^`]+)`\))?\s*$/)
      if (!m) continue
      const status: PlanTaskStatus = m[1].toLowerCase() === 'x' ? 'done' : 'pending'
      const id = m[2].trim()
      const title = m[3].trim()
      const verification = m[4]?.trim() || undefined
      if (!id || !title) continue
      tasks.push({ id, title, verification, status })
    }

    return tasks
  }

  private async handleCodeExecution(): Promise<void> {
    await this.emitEvent('tool.start', { tool: 'code_execution', state: 'code_execution' })

    const execPrompt = `Execute and test the generated code.
- If it's a script, run it with the appropriate runtime (node for .js, python for .py, etc.)
- If it's a web application, check if it can be built/started
- **Run Tests/Lint**: Use 'run_test' and 'run_lint' tools if available to verify correctness.
- Check for any runtime errors or issues
- Verify the code works as expected and fulfills the user's request

User request: "${this.ctx.input.message || this.ctx.input.instruction}"

Execute the code and report the results. If tests fail, try to fix the code.`

    this.pushMessage({ role: 'user', content: execPrompt })
    await this.callLLMWithTools()

    await this.emitEvent('tool.end', { tool: 'code_execution', success: true })
    this.state = 'review'
  }

  private async handleReview(): Promise<void> {
    await this.emitEvent('tool.start', { tool: 'review', state: 'review' })

    const reviewPrompt = `Review the results:
- Does the code work correctly?
- Are there any errors or issues?
- Does it fully satisfy the user's request?
- Is the code clean and well-structured?

If everything is good, respond with "TASK COMPLETE". Otherwise, explain what needs to be fixed.`

    this.pushMessage({ role: 'user', content: reviewPrompt })
    const response = await this.callLLMWithTools()

    const content = response.content || ''
    if (content.toLowerCase().includes('task complete') || content.toLowerCase().includes('complete')) {
      this.state = 'finish'
    } else {
      this.state = 'iterate'
    }

    await this.emitEvent('tool.end', { tool: 'review', success: true })
  }

  private extractPlanAndTasks(raw: string): { planMarkdown: string | null; tasks: PlanTask[] } {
    const planMatch = raw.match(/<plan_md>\s*([\s\S]*?)\s*<\/plan_md>/i)
    const tasksMatch = raw.match(/<tasks_json>\s*([\s\S]*?)\s*<\/tasks_json>/i)

    const planMarkdown = planMatch?.[1]?.trim() || null
    const tasksRaw = tasksMatch?.[1]?.trim()

    if (!tasksRaw) return { planMarkdown, tasks: [] }

    try {
      const parsed = JSON.parse(tasksRaw)
      if (!Array.isArray(parsed)) return { planMarkdown, tasks: [] }

      const tasks: PlanTask[] = parsed
        .map((t: any, idx: number) => {
          const id = typeof t?.id === 'string' && t.id.trim() ? t.id.trim() : `T${idx + 1}`
          const title = typeof t?.title === 'string' && t.title.trim() ? t.title.trim() : `Task ${idx + 1}`
          const verification = typeof t?.verification === 'string' && t.verification.trim() ? t.verification.trim() : undefined
          return { id, title, verification, status: 'pending' as const }
        })
        .filter(t => t.title)

      return { planMarkdown, tasks }
    } catch {
      return { planMarkdown, tasks: [] }
    }
  }

  private async writePlanFile(content: string): Promise<void> {
    const filePath = path.join(this.baseDir, 'plan.md')
    await fs.writeFile(filePath, content + (content.endsWith('\n') ? '' : '\n'), 'utf8')
  }

  private renderTasksMarkdown(): string {
    const lines: string[] = ['# Tasks', '']

    for (const t of this.planTasks) {
      const box = t.status === 'done' ? 'x' : ' '
      const verify = t.verification ? ` (verify: \`${t.verification}\`)` : ''
      lines.push(`- [${box}] ${t.id}: ${t.title}${verify}`)
    }

    lines.push('')
    return lines.join('\n')
  }

  private async writeTasksFile(): Promise<void> {
    const filePath = path.join(this.baseDir, 'tasks.md')
    await fs.writeFile(filePath, this.renderTasksMarkdown(), 'utf8')
  }

  private isAutoRepairEnabled(): boolean {
    if (this.ctx.input.auto_repair === false) return false
    if (process.env.RUNNER_AUTO_REPAIR === '0') return false
    return true
  }

  private formatCommandResult(result: any): string {
    const stdout = typeof result?.stdout === 'string' ? result.stdout : ''
    const stderr = typeof result?.stderr === 'string' ? result.stderr : ''
    const error = typeof result?.error === 'string' ? result.error : ''

    const parts = [
      stdout.trim() ? `STDOUT:\n${stdout.trim()}` : '',
      stderr.trim() ? `STDERR:\n${stderr.trim()}` : '',
      error.trim() ? `ERROR:\n${error.trim()}` : ''
    ].filter(Boolean)

    return parts.join('\n\n') || '(no output)'
  }

  private stringifyForEvent(value: unknown, maxChars: number = 200000): string {
    let s = ''
    if (typeof value === 'string') s = value
    else {
      try {
        s = JSON.stringify(value)
      } catch {
        s = String(value)
      }
    }

    if (s.length <= maxChars) return s
    return s.slice(0, maxChars) + `…(truncated, ${s.length} chars)`
  }

  private async maybeAutoRepair(triggerTool: string): Promise<void> {
    if (!this.isAutoRepairEnabled()) return
    if (this.autoRepairActive) return

    this.autoRepairActive = true
    try {
      await this.emitEvent('tool.start', { tool: 'auto_repair', input: { triggerTool } })

      let testResult = await this.handleRunTest()
      if (!testResult?.error) {
        await this.emitEvent('tool.end', { tool: 'auto_repair', success: true })
        return
      }

      for (let attempt = 1; attempt <= 3; attempt++) {
        const failureText = this.formatCommandResult(testResult)
        const repairPrompt = `The previous change caused this failure:\n\n${failureText}\n\nPlease fix the code. After fixing, ensure tests pass.`
        this.pushMessage({ role: 'user', content: repairPrompt })

        await this.callLLMWithTools()
        testResult = await this.handleRunTest()

        if (!testResult?.error) {
          await this.emitEvent('tool.end', { tool: 'auto_repair', success: true, attempt })
          return
        }
      }

      await this.emitEvent('tool.end', { tool: 'auto_repair', success: false, error: 'Auto-repair failed to make tests pass' })
    } finally {
      this.autoRepairActive = false
    }
  }

  private async handleIterate(): Promise<void> {
    await this.emitEvent('plan.update', {
      state: 'iterate',
      message: 'Iterating based on review feedback'
    })

    // Go back to code generation to fix issues
    this.state = 'code_generation'
  }

  private async callLLMWithTools(): Promise<ChatMessage> {
    const provider = this.ctx.input.provider || 'bridge'

    // Use bridge if available (preferred for Copilot access)
    if (this.ctx.bridge && provider === 'bridge') {
      const message = await this.callLLMWithBridge()
      this.pushMessage(message)

      if (message.tool_calls && message.tool_calls.length > 0) {
        for (const call of message.tool_calls) {
          const result = await this.executeTool(call)
          this.pushMessage({
            role: 'tool',
            tool_call_id: call.id,
            name: call.function?.name,
            content: JSON.stringify(result)
          })
        }

        return await this.callLLMWithTools()
      }

      return message
    }

    // Determine model based on state (Architect/Editor pattern)
    let model = this.ctx.input.model || 'gpt-4o'
    if (this.state === 'planning' && this.ctx.input.planner_model) {
      model = this.ctx.input.planner_model
    } else if (this.state !== 'planning' && this.ctx.input.writer_model) {
      model = this.ctx.input.writer_model
    }

    // Configure LLM Service
    // Note: We might want to pass API keys from ctx.input if provided, or rely on env vars
    // For now, we assume env vars are set or ctx.input might have them in future

    // Default fallback order: Browser Proxy -> OpenRouter -> Ollama
    const fallbackOrder = process.env.LLM_FALLBACK_ORDER
      ? process.env.LLM_FALLBACK_ORDER.split(',').map(p => p.trim()).filter(Boolean)
      : ['browser-proxy', 'openrouter', 'ollama']

    const llmConfig = {
      provider: provider === 'bridge' ? 'openai' : provider, // Fallback to openai if bridge not available but requested? Or just use provider.
      model,
      fallbackOrder
      // We can pass apiKey if we have it in ctx.input securely, otherwise LLMService uses env
    }

    // If provider was 'bridge' but we got here, it means bridge wasn't available.
    // We should probably default to 'openai' or 'ollama' depending on config.
    if (llmConfig.provider === 'bridge') {
      llmConfig.provider = 'openai'
    }

    const tools = this.getAvailableTools()
    const maxRetries = 3
    let lastError: Error | null = null

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // Compress context before sending
        const compressedMessages = await this.contextManager.compress(this.messages)

        const response = await llmService.chat(llmConfig, compressedMessages, tools)

        // Normalize response if needed (LLMService returns ChatResponse which is compatible with ChatMessage mostly)
        // ChatResponse doesn't have 'name' or 'tool_call_id' usually, but 'tool_calls' matches.

        const message: ChatMessage = {
          role: 'assistant',
          content: response.content,
          tool_calls: response.tool_calls
        }

        this.pushMessage(message)

        // Handle tool calls
        if (message.tool_calls && message.tool_calls.length > 0) {
          for (const call of message.tool_calls) {
            const result = await this.executeTool(call)
            this.pushMessage({
              role: 'tool',
              tool_call_id: call.id,
              name: call.function?.name,
              content: JSON.stringify(result)
            })
          }
          // Continue the loop to get the next response after tool execution
          // We need to call LLM again with the tool results
          // Recursive call or loop?
          // The original code was: "Continue the loop to get the next response after tool execution"
          // But it was inside the retry loop which is wrong. The retry loop is for *one* request.
          // The original code actually had a bug or I misread it.
          // "Continue the loop to get the next response after tool execution" implies we go back to top of retry loop?
          // No, that would re-send the original request.

          // Actually, the original code had:
          // } else { return message }
          // If tool calls, it looped? But the loop is `for (let attempt = 1...)`.
          // If it successfully got a message and handled tool calls, it *should* call the API again.
          // But the `attempt` loop is for retries of a *single* call.

          // Let's look at the original code:
          // It seems the original code was confusingly structured or I am misinterpreting "Continue the loop".
          // If `message.tool_calls` exists, it executes tools, pushes results.
          // Then it falls through to... where?
          // If it falls through the `try` block, it continues the `attempt` loop? No, `attempt` loop is for retries.
          // If success, we should break the `attempt` loop.

          // Wait, the original code:
          // if (message.tool_calls) { ... } else { return message }
          // If it handled tool calls, it *finishes* the try block.
          // Then it continues to `attempt++`? That means it retries the *same* request?
          // That seems wrong. It should be a new request with the tool outputs.

          // The standard pattern is:
          // 1. Call LLM
          // 2. If tool calls: execute, append results, GOTO 1.
          // 3. If no tool calls: return response.

          // I will implement this standard pattern here using recursion or a `while(true)` loop.

          return await this.callLLMWithTools()
        } else {
          return message
        }
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err))
        console.log(`LLM API attempt ${attempt} failed:`, lastError.message)

        if (attempt < maxRetries) {
          const delay = Math.pow(2, attempt - 1) * 1000
          await new Promise(resolve => setTimeout(resolve, delay))
        }
      }
    }

    throw new Error(`LLM API failed after ${maxRetries} attempts. Last error: ${lastError?.message}`)
  }

  private async callLLMWithBridge(): Promise<ChatMessage> {
    if (!this.ctx.bridge) {
      throw new Error('Bridge not available')
    }

    // For bridge mode, we use a different approach
    // Convert the conversation to an instruction for Copilot
    const lastUserMessage = [...this.messages].reverse().find(m => m.role === 'user')?.content || ''
    const systemContext = this.messages.find(m => m.role === 'system')?.content || ''

    const instruction = `${systemContext}\n\nUser request: ${lastUserMessage}\n\nPlease provide a helpful response and use tools as needed.`

    // Get relevant files for context (simplified - in practice we'd be more selective)
    const relevantFiles: Array<{ path: string; text: string }> = []
    try {
      const files = await this.ctx.bridge.listFiles('**/*.{js,ts,json,md}', 10)
      for (const file of files.slice(0, 5)) { // Limit to 5 files for context
        try {
          const content = await this.ctx.bridge.readFile(file.path)
          relevantFiles.push({ path: content.path, text: content.text.slice(0, 2000) }) // Limit content size
        } catch (err) {
          console.log(`Failed to read file ${file.path}:`, err)
        }
      }
    } catch (err) {
      console.log('Failed to list files for context:', err)
    }

    try {
      const result = await this.ctx.bridge.generateEdits(instruction, relevantFiles)

      // Convert the bridge result to a ChatMessage format
      return {
        role: 'assistant',
        content: result.summary || 'Code changes generated successfully',
        tool_calls: result.edits.map((edit, index) => ({
          id: `call_${index}`,
          type: 'function' as const,
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
    } catch (err) {
      throw new Error(`Bridge Copilot call failed: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  private getAvailableTools() {
    const tools = [
      {
        type: 'function',
        function: {
          name: 'read_file',
          description: 'Read a UTF-8 text file from the workspace',
          parameters: {
            type: 'object',
            properties: {
              path: { type: 'string', description: 'Path to the file relative to workspace root' }
            },
            required: ['path']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'write_file',
          description: 'Replace the full contents of a file',
          parameters: {
            type: 'object',
            properties: {
              path: { type: 'string', description: 'Path to the file' },
              content: { type: 'string', description: 'Full file contents to write' }
            },
            required: ['path', 'content']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'list_files',
          description: 'List files using a glob pattern',
          parameters: {
            type: 'object',
            properties: {
              glob: { type: 'string', description: 'Glob pattern, e.g. src/**/*.ts' }
            },
            required: ['glob']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'list_dir',
          description: 'List contents of a directory',
          parameters: {
            type: 'object',
            properties: {
              path: { type: 'string', description: 'Directory path to list' }
            },
            required: ['path']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'grep_search',
          description: 'Search for text patterns in files using regex',
          parameters: {
            type: 'object',
            properties: {
              query: { type: 'string', description: 'Regex pattern to search for' },
              include_pattern: { type: 'string', description: 'Glob pattern for files to include (optional)' }
            },
            required: ['query']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'run_command',
          description: 'Run a terminal command (15s timeout)',
          parameters: {
            type: 'object',
            properties: {
              command: { type: 'string', description: 'Shell command to execute' }
            },
            required: ['command']
          }
        }
      },

      ...(this.isBraveModeEnabled() ? [
        {
          type: 'function',
          function: {
            name: 'shell_execute',
            description: 'Run a terminal command in brave mode (still safety-checked)',
            parameters: {
              type: 'object',
              properties: {
                command: { type: 'string', description: 'Shell command to execute' }
              },
              required: ['command']
            }
          }
        }
      ] : []),
      {
        type: 'function',
        function: {
          name: 'apply_edit',
          description: 'Apply a text edit to a file at a specific range',
          parameters: {
            type: 'object',
            properties: {
              path: { type: 'string', description: 'Path to the file to edit' },
              range: {
                type: 'object',
                description: 'Range to replace (start and end positions)',
                properties: {
                  start: {
                    type: 'object',
                    properties: {
                      line: { type: 'number', description: '0-based line number' },
                      character: { type: 'number', description: '0-based character position' }
                    },
                    required: ['line', 'character']
                  },
                  end: {
                    type: 'object',
                    properties: {
                      line: { type: 'number', description: '0-based line number' },
                      character: { type: 'number', description: '0-based character position' }
                    },
                    required: ['line', 'character']
                  }
                },
                required: ['start', 'end']
              },
              text: { type: 'string', description: 'Text to insert at the range' }
            },
            required: ['path', 'range', 'text']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'git_commit',
          description: 'Stage all files and commit changes with a message',
          parameters: {
            type: 'object',
            properties: {
              message: { type: 'string', description: 'Commit message' }
            },
            required: ['message']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'git_diff',
          description: 'Show changes between commits or working tree',
          parameters: {
            type: 'object',
            properties: {
              target: { type: 'string', description: 'Target to diff against (default: HEAD)' }
            }
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'git_log',
          description: 'Show recent commit history',
          parameters: {
            type: 'object',
            properties: {
              limit: { type: 'number', description: 'Number of commits to show' }
            }
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'git_undo',
          description: 'Undo the last commit (soft reset)',
          parameters: {
            type: 'object',
            properties: {}
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'run_test',
          description: 'Run project tests (e.g. npm test)',
          parameters: {
            type: 'object',
            properties: {}
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'run_lint',
          description: 'Run project linter (e.g. npm run lint)',
          parameters: {
            type: 'object',
            properties: {}
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'web_fetch',
          description: 'Fetch and extract text from a URL',
          parameters: {
            type: 'object',
            properties: {
              url: { type: 'string', description: 'URL to fetch' }
            },
            required: ['url']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'memory_store',
          description: 'Store valuable information in long-term memory',
          parameters: {
            type: 'object',
            properties: {
              content: { type: 'string', description: 'Information to store' },
              tags: { type: 'array', items: { type: 'string' }, description: 'Tags for retrieval' }
            },
            required: ['content']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'memory_search',
          description: 'Search long-term memory',
          parameters: {
            type: 'object',
            properties: {
              query: { type: 'string', description: 'Search query' }
            },
            required: ['query']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'search_knowledge',
          description: 'Search the vector knowledge base for relevant code snippets or documentation',
          parameters: {
            type: 'object',
            properties: {
              query: { type: 'string', description: 'Search query' }
            },
            required: ['query']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'search_web',
          description: 'Search the web for documentation or technical solutions (via DuckDuckGo)',
          parameters: {
            type: 'object',
            properties: {
              query: { type: 'string', description: 'Search query' }
            },
            required: ['query']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'run_sql_query',
          description: 'Execute a SQL query against a database',
          parameters: {
            type: 'object',
            properties: {
              query: { type: 'string', description: 'SQL query to execute' },
              connection_string: { type: 'string', description: 'Database connection string (optional, uses env if not provided)' }
            },
            required: ['query']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'call_api',
          description: 'Make an external API call',
          parameters: {
            type: 'object',
            properties: {
              method: { type: 'string', enum: ['GET', 'POST', 'PUT', 'DELETE'], description: 'HTTP method' },
              url: { type: 'string', description: 'Full URL' },
              headers: { type: 'object', description: 'JSON object of headers' },
              body: { type: 'string', description: 'Request body' }
            },
            required: ['method', 'url']
          }
        }
      },

      ...(this.mcp.hasServers() ? [
        {
          type: 'function',
          function: {
            name: 'mcp_list_servers',
            description: 'List configured MCP servers',
            parameters: { type: 'object', properties: {} }
          }
        },
        {
          type: 'function',
          function: {
            name: 'mcp_initialize',
            description: 'Initialize an MCP server connection',
            parameters: {
              type: 'object',
              properties: {
                server_id: { type: 'string', description: 'MCP server id' }
              },
              required: ['server_id']
            }
          }
        },
        {
          type: 'function',
          function: {
            name: 'mcp_list_tools',
            description: 'List tools exposed by an MCP server',
            parameters: {
              type: 'object',
              properties: {
                server_id: { type: 'string', description: 'MCP server id' }
              },
              required: ['server_id']
            }
          }
        },
        {
          type: 'function',
          function: {
            name: 'mcp_call_tool',
            description: 'Call a tool on an MCP server',
            parameters: {
              type: 'object',
              properties: {
                server_id: { type: 'string', description: 'MCP server id' },
                tool: { type: 'string', description: 'Tool name' },
                arguments: { type: 'object', description: 'Tool arguments' }
              },
              required: ['server_id', 'tool']
            }
          }
        }
      ] : [])
    ]

    return tools
  }

  private async executeTool(call: NonNullable<ChatMessage['tool_calls']>[0]): Promise<any> {
    if (this.ctx.aborted) return { error: 'Job cancelled' }
    const { name, arguments: args } = call.function!
    const params = args ? JSON.parse(args) : {}

    const toolCallId = call.id

    // Check rate limits before executing the tool
    const rateLimitKey = `${this.ctx.jobId}:${name}`;
    if (!jobRateLimiter.isAllowed(rateLimitKey)) {
      const { resetTime } = jobRateLimiter.getRateLimitInfo(rateLimitKey);
      const resetTimeFormatted = new Date(resetTime).toISOString();
      const errorMsg = `Rate limit exceeded for tool ${name}. Try again after ${resetTimeFormatted}`;

      await this.emitEvent('tool.start', { id: toolCallId, tool: name, input: params })
      await this.emitEvent('tool.output', { id: toolCallId, tool: name, output: this.stringifyForEvent({ error: errorMsg }) })
      await this.emitEvent('tool.end', { id: toolCallId, tool: name, success: false, error: errorMsg })

      return { error: errorMsg };
    }

    await this.emitEvent('tool.start', { id: toolCallId, tool: name, input: params })

    let result: any

    try {
      switch (name) {
        case 'read_file':
          result = await this.handleReadFile(params.path)
          break
        case 'write_file':
          result = await this.handleWriteFile(params.path, params.content)
          await this.maybeAutoRepair('write_file')
          break
        case 'list_files':
          result = await this.handleListFiles(params.glob)
          break
        case 'list_dir':
          result = await this.handleListDir(params.path)
          break
        case 'grep_search':
          result = await this.handleGrepSearch(params.query, params.include_pattern)
          break
        case 'run_command':
          result = await this.handleRunCommand(params.command, toolCallId)
          break
        case 'shell_execute':
          result = await this.handleRunCommand(params.command, toolCallId)
          break
        case 'apply_edit':
          result = await this.handleApplyEdit(params.path, params.range, params.text)
          await this.maybeAutoRepair('apply_edit')
          break
        case 'git_commit':
          result = await this.handleGitCommit(params.message)
          break
        case 'git_diff':
          result = await this.handleGitDiff(params.target)
          break
        case 'git_log':
          result = await this.handleGitLog(params.limit)
          break
        case 'git_undo':
          result = await this.handleGitUndo()
          break
        case 'run_test':
          result = await this.handleRunTest()
          break
        case 'run_lint':
          result = await this.handleRunLint()
          break
        case 'web_fetch':
          result = await this.handleWebFetch(params.url)
          break
        case 'memory_store':
          result = await this.handleMemoryStore(params.content, params.tags)
          break
        case 'memory_search':
          result = await this.handleMemorySearch(params.query)
          break
        case 'search_knowledge':
          result = await this.handleSearchKnowledge(params.query)
          break
        case 'search_web':
          result = await this.handleSearchWeb(params.query)
          break
        case 'run_sql_query':
          result = await this.handleRunSqlQuery(params.query, params.connection_string)
          break
        case 'call_api':
          result = await this.handleCallApi(params.method, params.url, params.headers, params.body)
          break
        case 'mcp_list_servers':
          result = { servers: this.mcp.listServers() }
          break
        case 'mcp_initialize':
          result = await this.mcp.initialize(params.server_id)
          break
        case 'mcp_list_tools':
          result = await this.mcp.listTools(params.server_id)
          break
        case 'mcp_call_tool':
          result = await this.mcp.callTool(params.server_id, params.tool, params.arguments)
          break
        default:
          throw new Error(`Unknown tool: ${name}`)
      }

      await this.emitEvent('tool.output', {
        id: toolCallId,
        tool: name,
        output: this.stringifyForEvent(result)
      })

      await this.emitEvent('tool.end', { id: toolCallId, tool: name, success: true })
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err)
      result = { error }
      await this.emitEvent('tool.output', { id: toolCallId, tool: name, output: this.stringifyForEvent(result) })
      await this.emitEvent('tool.end', { id: toolCallId, tool: name, success: false, error })
    }

    return result
  }

  private async handleReadFile(path: string) {
    if (this.ctx.bridge) {
      return await this.ctx.bridge.readFile(path)
    } else {
      const fs = await import('fs/promises')
      const content = await fs.readFile(path, 'utf8')
      return { path, text: content }
    }
  }

  private async handleWriteFile(path: string, content: string) {
    if (this.ctx.bridge) {
      const existing = await this.handleReadFile(path)
      await this.ctx.bridge.applyEdits([{
        path,
        range: { start: 0, end: existing.text?.length || 0 },
        text: content
      }])
    } else {
      const fs = await import('fs/promises')
      await fs.writeFile(path, content, 'utf8')
    }
    return { path, bytes: content.length }
  }

  private async handleListFiles(glob: string) {
    const { glob: globFn } = await import('glob')
    const files = await globFn(glob)
    return { files }
  }

  private async handleListDir(path: string) {
    const fs = await import('fs/promises')
    const entries = await fs.readdir(path, { withFileTypes: true })
    const entryDetails = await Promise.all(entries.map(async (entry) => {
      const fullPath = `${path}/${entry.name}`
      const stats = entry.isFile() ? await fs.stat(fullPath) : null
      return {
        name: entry.name,
        type: entry.isDirectory() ? 'directory' : entry.isFile() ? 'file' : 'other',
        size: stats?.size
      }
    }))
    return { path, entries: entryDetails }
  }

  private async handleGrepSearch(query: string, includePattern?: string) {
    const { spawn } = await import('child_process')
    const args = ['-r', '-n', query, '.']
    if (includePattern) {
      args.push(`--include=${includePattern}`)
    }

    const maxLines = 50
    const timeoutMs = 10000

    return await new Promise((resolve, reject) => {
      const child = spawn('grep', args, { cwd: process.cwd() })
      let stdoutBuffer = ''
      let stderrBuffer = ''
      const results: string[] = []
      let truncated = false

      const timer = setTimeout(() => {
        child.kill('SIGKILL')
      }, timeoutMs)

      child.stdout.on('data', (chunk) => {
        stdoutBuffer += chunk.toString()
        const lines = stdoutBuffer.split('\n')
        stdoutBuffer = lines.pop() ?? ''
        for (const line of lines) {
          if (!line.trim()) continue
          results.push(line)
          if (results.length >= maxLines) {
            truncated = true
            child.kill('SIGKILL')
            break
          }
        }
      })

      child.stderr.on('data', (chunk) => {
        stderrBuffer += chunk.toString()
      })

      child.on('error', (err) => {
        clearTimeout(timer)
        reject(err)
      })

      child.on('close', (code) => {
        clearTimeout(timer)
        if (stdoutBuffer.trim() && results.length < maxLines) {
          results.push(stdoutBuffer.trim())
        }
        if (code === 0 || (code === 1 && results.length === 0) || (code === null && truncated)) {
          resolve({ query, results, truncated })
          return
        }
        const error = new Error(stderrBuffer || `grep failed with code ${code ?? 'unknown'}`)
        ;(error as { code?: number | null }).code = code
        reject(error)
      })
    })
  }

  private async handleRunCommand(command: string, toolCallId?: string) {
    if (this.ctx.aborted) return { error: 'Job cancelled' }

    if (this.isForbiddenCommand(command)) {
      const reason = 'Refused to run: command matches disallowed or unsafe patterns.'
      await this.emitEvent('tool.refused', { id: toolCallId, tool: 'run_command', command, reason })
      return { error: reason }
    }

    const braveMode = this.isBraveModeEnabled()

    // Check for sensitive commands requiring approval
    if (!braveMode && this.isSensitiveCommand(command)) {
      const { tokenId, wait } = approvalService.createRequest(this.ctx.jobId)

      await this.emitEvent('approval.request', {
        tokenId,
        type: 'run_command',
        description: `Execute command: ${command}`,
        data: { command }
      })

      const approved = await wait(300000) // 5 minutes timeout

      await this.emitEvent('approval.response', {
        tokenId,
        approved
      })

      if (!approved) {
        const reason = 'Command execution denied by user or timed out'
        await this.emitEvent('tool.refused', { id: toolCallId, tool: 'run_command', command, reason })
        return { error: reason }
      }
    }

    const { exec } = await import('child_process')
    const { promisify } = await import('util')
    const execAsync = promisify(exec)
    try {
      const result = await execAsync(command, { timeout: 15000, cwd: this.baseDir })
      return { stdout: result.stdout, stderr: result.stderr }
    } catch (err: any) {
      return { stdout: err.stdout || '', stderr: err.stderr || err.message, error: err.message }
    }
  }

  private isBraveModeEnabled(): boolean {
    return Boolean(this.ctx.input.brave_mode) || process.env.RUNNER_BRAVE_MODE === '1'
  }

  private isForbiddenCommand(command: string): boolean {
    const lowered = command.toLowerCase()
    return /(^|\s)(rm\s+-rf|sudo\b|shutdown\b|reboot\b|mkfs\b|dd\s+if=|:\(\)\s*{\s*:|:;};:|:\s*>\s*\/|>\s*\/)/.test(lowered)
  }

  private isSensitiveCommand(command: string): boolean {
    const sensitivePatterns = [
      /\brm\b/i,
      /\bmv\b/i,
      /\bchmod\b/i,
      /\bchown\b/i,
      /\bsudo\b/i,
      /\bgit push\b/i,
      /\bnpm publish\b/i,
      /\byarn publish\b/i,
      />/  // redirection
    ]
    return sensitivePatterns.some(p => p.test(command))
  }

  private async handleApplyEdit(path: string, range: { start: { line: number; character: number }; end: { line: number; character: number } }, text: string) {
    if (this.ctx.bridge) {
      // Convert line/character range to absolute positions for bridge
      const content = await this.handleReadFile(path)
      const lines = content.text.split('\n')

      let startPos = 0
      for (let i = 0; i < range.start.line; i++) {
        startPos += lines[i].length + 1 // +1 for newline
      }
      startPos += range.start.character

      let endPos = 0
      for (let i = 0; i < range.end.line; i++) {
        endPos += lines[i].length + 1
      }
      endPos += range.end.character

      await this.ctx.bridge.applyEdits([{
        path,
        range: { start: startPos, end: endPos },
        text
      }])
    } else {
      // Fallback: read file, apply edit manually, write back
      const fs = await import('fs/promises')
      const content = await fs.readFile(path, 'utf8')
      const lines = content.split('\n')

      // Convert range to string positions
      let startPos = 0
      for (let i = 0; i < range.start.line; i++) {
        startPos += lines[i].length + 1 // +1 for newline
      }
      startPos += range.start.character

      let endPos = 0
      for (let i = 0; i < range.end.line; i++) {
        endPos += lines[i].length + 1
      }
      endPos += range.end.character

      const newContent = content.slice(0, startPos) + text + content.slice(endPos)
      await fs.writeFile(path, newContent, 'utf8')
    }
    return { path, range, textLength: text.length }
  }

  private async handleGitCommit(message: string) {
    await this.gitService.add()
    const hash = await this.gitService.commit(message)
    return { hash, message }
  }

  private async handleGitDiff(target?: string) {
    const diff = await this.gitService.diff(target)
    return { diff }
  }

  private async handleGitLog(limit?: number) {
    const log = await this.gitService.log(limit)
    return { log }
  }

  private async handleGitUndo() {
    await this.gitService.undo()
    return { success: true, message: 'Undid last commit' }
  }

  private async handleRunTest() {
    return this.runPackageScript('test')
  }

  private async handleRunLint() {
    return this.runPackageScript('lint')
  }

  private async runPackageScript(scriptName: string) {
    const fs = await import('fs/promises')
    const path = await import('path')
    const baseDir = this.ctx.input.base_dir && this.ctx.input.base_dir.trim() ? this.ctx.input.base_dir : process.cwd()
    const pkgPath = path.join(baseDir, 'package.json')

    try {
      const content = await fs.readFile(pkgPath, 'utf8')
      const pkg = JSON.parse(content)
      if (pkg.scripts && pkg.scripts[scriptName]) {
        return await this.handleRunCommand(`npm run ${scriptName}`)
      }
      return { error: `No "${scriptName}" script found in package.json` }
    } catch (err) {
      return { error: 'Could not read package.json' }
    }
  }

  private async handleWebFetch(url: string) {
    const text = await this.webService.fetchPage(url)
    return { url, text }
  }

  private async handleMemoryStore(content: string, tags?: string[]) {
    await this.memoryService.store(content, tags)
    return { success: true, message: 'Stored in memory' }
  }

  private async handleMemorySearch(query: string) {
    const results = await this.memoryService.search(query)
    return { query, results }
  }

  private async handleSearchWeb(query: string) {
    // Use DuckDuckGo HTML search for simplicity (no API key required)
    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`
    const text = await this.webService.fetchPage(url)
    // Extract results (simple regex parsing)
    // This is brittle but works for MVP without external paid API
    // Real implementation should use SerpApi or similar
    return { query, raw_html_snippet: text.slice(0, 2000), note: 'For better results, upgrade to SerpApi' }
  }

  private async handleRunSqlQuery(query: string, connectionString?: string) {
    // Security: Only allow SELECT statements to prevent data modification
    const trimmedQuery = query.trim();
    const lowerQuery = trimmedQuery.toLowerCase();

    if (!lowerQuery.startsWith('select')) {
      return { error: 'Only SELECT statements are allowed in this tool' }
    }

    // Additional security: Prevent potentially dangerous SQL patterns
    const dangerousPatterns = [
      /union\s+select/i,
      /insert\s+into/i,
      /update\s+/i,
      /delete\s+from/i,
      /drop\s+(table|database)/i,
      /alter\s+(table|database)/i,
      /create\s+(table|database)/i,
      /exec\s*\(/i,
      /execute\s*\(/i,
      /sp_/i,  // Stored procedure calls
      /xp_/i,  // Extended procedure calls
      /;\s*(drop|create|alter|delete|update|insert)/i,
      /;\s*exec/i,
      /;\s*execute/i,
      /;\s*declare/i,
      /;\s*use/i,
      /;\s*grant/i,
      /;\s*revoke/i,
      /;\s*truncate/i,
      /;\s*merge/i,
      /;\s*call/i,
      /;\s*with/i,
      /;\s*begin/i,
      /;\s*end/i,
      /;\s*commit/i,
      /;\s*rollback/i,
      /;\s*savepoint/i,
      /;\s*lock/i,
      /;\s*unlock/i,
      /;\s*kill/i,
      /;\s*set/i,
      /;\s*show/i,
      /;\s*describe/i,
      /;\s*explain/i,
      /;\s*analyze/i,
      /;\s*optimize/i,
      /;\s*repair/i,
      /;\s*checksum/i,
      /;\s*cache/i,
      /;\s*flush/i,
      /;\s*reset/i,
      /;\s*purge/i,
      /;\s*rename/i,
      /;\s*replace/i,
      /;\s*load/i,
      /;\s*unload/i,
      /;\s*import/i,
      /;\s*export/i,
      /;\s*backup/i,
      /;\s*restore/i,
      /;\s*recover/i,
      /;\s*migrate/i,
      /;\s*upgrade/i,
      /;\s*downgrade/i,
      /;\s*install/i,
      /;\s*uninstall/i,
      /;\s*enable/i,
      /;\s*disable/i,
      /;\s*activate/i,
      /;\s*deactivate/i,
      /;\s*start/i,
      /;\s*stop/i,
      /;\s*pause/i,
      /;\s*resume/i,
      /;\s*attach/i,
      /;\s*detach/i,
      /;\s*link/i,
      /;\s*unlink/i,
      /;\s*mount/i,
      /;\s*unmount/i,
      /;\s*bind/i,
      /;\s*unbind/i,
      /;\s*subscribe/i,
      /;\s*unsubscribe/i,
      /;\s*publish/i,
      /;\s*consume/i,
      /;\s*queue/i,
      /;\s*topic/i,
      /;\s*channel/i,
      /;\s*stream/i,
      /;\s*socket/i,
      /;\s*pipe/i,
      /;\s*file/i,
      /;\s*directory/i,
      /;\s*folder/i,
      /;\s*path/i,
      /;\s*system/i,
      /;\s*os/i,
      /;\s*shell/i,
      /;\s*exec/i,
      /;\s*execute/i,
      /;\s*run/i,
      /;\s*launch/i,
      /;\s*spawn/i,
      /;\s*fork/i,
      /;\s*thread/i,
      /;\s*process/i,
      /;\s*task/i,
      /;\s*job/i,
      /;\s*service/i,
      /;\s*daemon/i,
      /;\s*background/i,
      /;\s*async/i,
      /;\s*parallel/i,
      /;\s*concurrent/i,
      /;\s*multithread/i,
      /;\s*cluster/i,
      /;\s*network/i,
      /;\s*internet/i,
      /;\s*web/i,
      /;\s*http/i,
      /;\s*ftp/i,
      /;\s*ssh/i,
      /;\s*telnet/i,
      /;\s*smtp/i,
      /;\s*pop3/i,
      /;\s*imap/i,
      /;\s*dns/i,
      /;\s*dhcp/i,
      /;\s*arp/i,
      /;\s*icmp/i,
      /;\s*tcp/i,
      /;\s*udp/i,
      /;\s*ip/i,
      /;\s*mac/i,
      /;\s*ethernet/i,
      /;\s*wifi/i,
      /;\s*bluetooth/i,
      /;\s*usb/i,
      /;\s*serial/i,
      /;\s*parallel/i,
      /;\s*port/i,
      /;\s*socket/i,
      /;\s*endpoint/i,
      /;\s*address/i,
      /;\s*location/i,
      /;\s*uri/i,
      /;\s*url/i,
      /;\s*path/i,
      /;\s*file/i,
      /;\s*directory/i,
      /;\s*folder/i,
      /;\s*drive/i,
      /;\s*volume/i,
      /;\s*partition/i,
      /;\s*disk/i,
      /;\s*memory/i,
      /;\s*ram/i,
      /;\s*cpu/i,
      /;\s*gpu/i,
      /;\s*processor/i,
      /;\s*core/i,
      /;\s*chip/i,
      /;\s*board/i,
      /;\s*motherboard/i,
      /;\s*hardware/i,
      /;\s*firmware/i,
      /;\s*bios/i,
      /;\s*uefi/i,
      /;\s*driver/i,
      /;\s*kernel/i,
      /;\s*os/i,
      /;\s*operating/i,
      /;\s*system/i,
      /;\s*platform/i,
      /;\s*architecture/i,
      /;\s*machine/i,
      /;\s*computer/i,
      /;\s*device/i,
      /;\s*mobile/i,
      /;\s*phone/i,
      /;\s*tablet/i,
      /;\s*laptop/i,
      /;\s*desktop/i,
      /;\s*server/i,
      /;\s*client/i,
      /;\s*user/i,
      /;\s*password/i,
      /;\s*credential/i,
      /;\s*secret/i,
      /;\s*token/i,
      /;\s*key/i,
      /;\s*certificate/i,
      /;\s*ssl/i,
      /;\s*tls/i,
      /;\s*encryption/i,
      /;\s*decryption/i,
      /;\s*cipher/i,
      /;\s*hash/i,
      /;\s*signature/i,
      /;\s*authentication/i,
      /;\s*authorization/i,
      /;\s*permission/i,
      /;\s*privilege/i,
      /;\s*access/i,
      /;\s*control/i,
      /;\s*security/i,
      /;\s*privacy/i,
      /;\s*audit/i,
      /;\s*log/i,
      /;\s*trace/i,
      /;\s*debug/i,
      /;\s*monitor/i,
      /;\s*profile/i,
      /;\s*performance/i,
      /;\s*benchmark/i,
      /;\s*test/i,
      /;\s*stress/i,
      /;\s*load/i,
      /;\s*stress/i,
      /;\s*capacity/i,
      /;\s*scalability/i,
      /;\s*availability/i,
      /;\s*reliability/i,
      /;\s*fault/i,
      /;\s*tolerance/i,
      /;\s*recovery/i,
      /;\s*backup/i,
      /;\s*disaster/i,
      /;\s*continuity/i,
      /;\s*business/i,
      /;\s*continuity/i,
      /;\s*plan/i,
      /;\s*strategy/i,
      /;\s*policy/i,
      /;\s*procedure/i,
      /;\s*protocol/i,
      /;\s*standard/i,
      /;\s*compliance/i,
      /;\s*regulation/i,
      /;\s*law/i,
      /;\s*rule/i,
      /;\s*governance/i,
      /;\s*management/i,
      /;\s*administration/i,
      /;\s*configuration/i,
      /;\s*setting/i,
      /;\s*option/i,
      /;\s*parameter/i,
      /;\s*variable/i,
      /;\s*environment/i,
      /;\s*context/i,
      /;\s*scope/i,
      /;\s*namespace/i,
      /;\s*module/i,
      /;\s*package/i,
      /;\s*library/i,
      /;\s*framework/i,
      /;\s*engine/i,
      /;\s*runtime/i,
      /;\s*compiler/i,
      /;\s*interpreter/i,
      /;\s*virtual/i,
      /;\s*machine/i,
      /;\s*container/i,
      /;\s*docker/i,
      /;\s*kubernetes/i,
      /;\s*pod/i,
      /;\s*service/i,
      /;\s*deployment/i,
      /;\s*replica/i,
      /;\s*scale/i,
      /;\s*horizontal/i,
      /;\s*vertical/i,
      /;\s*autoscale/i,
      /;\s*load/i,
      /;\s*balancer/i,
      /;\s*proxy/i,
      /;\s*gateway/i,
      /;\s*router/i,
      /;\s*switch/i,
      /;\s*hub/i,
      /;\s*bridge/i,
      /;\s*firewall/i,
      /;\s*vpn/i,
      /;\s*proxy/i,
      /;\s*cache/i,
      /;\s*buffer/i,
      /;\s*queue/i,
      /;\s*stack/i,
      /;\s*heap/i,
      /;\s*pool/i,
      /;\s*collection/i,
      /;\s*array/i,
      /;\s*list/i,
      /;\s*map/i,
      /;\s*set/i,
      /;\s*tree/i,
      /;\s*graph/i,
      /;\s*algorithm/i,
      /;\s*data/i,
      /;\s*structure/i,
      /;\s*type/i,
      /;\s*class/i,
      /;\s*object/i,
      /;\s*instance/i,
      /;\s*method/i,
      /;\s*function/i,
      /;\s*procedure/i,
      /;\s*routine/i,
      /;\s*subroutine/i,
      /;\s*macro/i,
      /;\s*template/i,
      /;\s*generic/i,
      /;\s*interface/i,
      /;\s*abstract/i,
      /;\s*inheritance/i,
      /;\s*polymorphism/i,
      /;\s*encapsulation/i,
      /;\s*abstraction/i,
      /;\s*composition/i,
      /;\s*aggregation/i,
      /;\s*association/i,
      /;\s*dependency/i,
      /;\s*coupling/i,
      /;\s*cohesion/i,
      /;\s*design/i,
      /;\s*pattern/i,
      /;\s*architecture/i,
      /;\s*model/i,
      /;\s*view/i,
      /;\s*controller/i,
      /;\s*mvc/i,
      /;\s*mvp/i,
      /;\s*mvvm/i,
      /;\s*layer/i,
      /;\s*tier/i,
      /;\s*component/i,
      /;\s*module/i,
      /;\s*plugin/i,
      /;\s*extension/i,
      /;\s*addon/i,
      /;\s*widget/i,
      /;\s*gadget/i,
      /;\s*applet/i,
      /;\s*servlet/i,
      /;\s*filter/i,
      /;\s*listener/i,
      /;\s*interceptor/i,
      /;\s*middleware/i,
      /;\s*handler/i,
      /;\s*adapter/i,
      /;\s*facade/i,
      /;\s*proxy/i,
      /;\s*decorator/i,
      /;\s*observer/i,
      /;\s*strategy/i,
      /;\s*factory/i,
      /;\s*builder/i,
      /;\s*prototype/i,
      /;\s*singleton/i,
      /;\s*command/i,
      /;\s*memento/i,
      /;\s*iterator/i,
      /;\s*composite/i,
      /;\s*bridge/i,
      /;\s*flyweight/i,
      /;\s*proxy/i,
      /;\s*chain/i,
      /;\s*responsibility/i,
      /;\s*mediator/i,
      /;\s*memento/i,
      /;\s*state/i,
      /;\s*visitor/i,
      /;\s*interpreter/i,
      /;\s*template/i,
      /;\s*method/i,
      /;\s*iterator/i,
      /;\s*composite/i,
      /;\s*observer/i,
      /;\s*command/i,
      /;\s*facade/i,
      /;\s*builder/i,
      /;\s*abstract/i,
      /;\s*factory/i,
      /;\s*prototype/i,
      /;\s*singleton/i,
      /;\s*adapter/i,
      /;\s*decorator/i,
      /;\s*proxy/i,
      /;\s*flyweight/i,
      /;\s*bridge/i,
      /;\s*chain/i,
      /;\s*responsibility/i,
      /;\s*command/i,
      /;\s*interpreter/i,
      /;\s*iterator/i,
      /;\s*mediator/i,
      /;\s*memento/i,
      /;\s*observer/i,
      /;\s*state/i,
      /;\s*strategy/i,
      /;\s*template/i,
      /;\s*visitor/i
    ];

    for (const pattern of dangerousPatterns) {
      if (pattern.test(lowerQuery)) {
        return { error: 'Query contains potentially dangerous SQL patterns' };
      }
    }

    // Validate connection string format (basic validation)
    if (!connectionString) {
      return { error: 'Connection string is required' };
    }

    // Basic validation for connection string format
    if (!/^[\w\d\-_.+:@/?=#%&]*$/.test(connectionString)) {
      return { error: 'Invalid connection string format' };
    }

    try {
      // For security, we'll only support SQLite in-memory or file-based connections
      // This prevents connections to external databases
      if (!connectionString.startsWith('sqlite://') && !connectionString.startsWith('file://')) {
        return { error: 'Only SQLite connections are allowed for security reasons' };
      }

      // Parse the connection string to extract the database path
      const dbPath = connectionString.replace(/^sqlite:\/\//, '').replace(/^file:\/\//, '');

      // Validate that the database path is within allowed directories
      const path = await import('path');
      const resolvedPath = path.resolve(dbPath);
      const allowedBaseDir = this.baseDir; // Use the job's base directory as allowed path

      if (!resolvedPath.startsWith(path.resolve(allowedBaseDir))) {
        return { error: 'Database path is outside allowed directory' };
      }

      // Import sqlite3 module for database operations
      const Database = (await import('better-sqlite3')).default;
      const db = new Database(resolvedPath);

      // Execute the query
      const result = db.prepare(trimmedQuery).all();

      // Close the database connection
      db.close();

      return {
        query: trimmedQuery,
        result: result,
        rowCount: result.length
      };
    } catch (err) {
      return { error: `SQL execution failed: ${err instanceof Error ? err.message : String(err)}` };
    }
  }

  private async handleCallApi(method: string, url: string, headers?: any, body?: string) {
    try {
      // Validate method
      const allowedMethods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'];
      if (!allowedMethods.includes(method.toUpperCase())) {
        return { error: `Method ${method} is not allowed. Only ${allowedMethods.join(', ')} are permitted.` };
      }

      // Validate URL to prevent SSRF (Server-Side Request Forgery)
      try {
        const parsedUrl = new URL(url);

        // Block private IP ranges to prevent internal network access
        const hostname = parsedUrl.hostname.toLowerCase();
        const ipPattern = /^(\d{1,3}\.){3}\d{1,3}$/;

        if (ipPattern.test(hostname)) {
          // Check for private IP ranges
          const [firstOctet] = hostname.split('.').map(Number);
          const secondOctet = parseInt(hostname.split('.')[1]);

          if (
            firstOctet === 10 ||                                    // 10.0.0.0/8
            (firstOctet === 172 && secondOctet >= 16 && secondOctet <= 31) || // 172.16.0.0/12
            (firstOctet === 192 && secondOctet === 168) ||          // 192.168.0.0/16
            firstOctet === 127 ||                                   // 127.0.0.0/8 (localhost)
            firstOctet === 0                                        // 0.0.0.0/8
          ) {
            return { error: 'Request to private/internal IP addresses is not allowed' };
          }
        }

        // Block certain protocols for security
        if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
          return { error: 'Only HTTP and HTTPS protocols are allowed' };
        }
      } catch (urlErr) {
        return { error: `Invalid URL format: ${urlErr instanceof Error ? urlErr.message : String(urlErr)}` };
      }

      // Limit the size of the request body
      if (body && typeof body === 'string' && body.length > 1024 * 1024) { // 1MB limit
        return { error: 'Request body exceeds size limit of 1MB' };
      }

      // Limit headers to prevent header injection
      if (headers) {
        const disallowedHeaders = [
          'connection', 'content-length', 'host', 'origin', 'referer',
          'user-agent', 'accept-encoding', 'accept-language', 'cookie'
        ];

        for (const header in headers) {
          if (disallowedHeaders.includes(header.toLowerCase())) {
            return { error: `Header ${header} is not allowed` };
          }
        }
      }

      // Make the API call with a timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout

      const response = await fetch(url, {
        method,
        headers: headers || { 'Content-Type': 'application/json' },
        body: body,
        signal: controller.signal,
        // Disable redirects to prevent potential abuse
        redirect: 'error'
      });

      clearTimeout(timeoutId);

      const text = await response.text();

      // Limit response size to prevent large responses
      if (text.length > 10 * 1024 * 1024) { // 10MB limit
        return { error: 'Response exceeds size limit of 10MB' };
      }

      let json;
      try {
        json = JSON.parse(text);
      } catch {
        // If response is not JSON, return as text
      }

      return {
        status: response.status,
        statusText: response.statusText,
        data: json || text,
        headers: Object.fromEntries(response.headers.entries())
      };
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        return { error: 'API call timed out after 30 seconds' };
      }
      return { error: `API call failed: ${err instanceof Error ? err.message : String(err)}` };
    }
  }

  private async handleSearchKnowledge(query: string) {
    // Call server to search knowledge base
    // We assume the runner can talk to the server API
    const serverUrl = process.env.SERVER_URL || 'http://localhost:4001'
    try {
      const response = await fetch(`${serverUrl}/knowledge/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, limit: 5 })
      })
      if (!response.ok) {
        throw new Error(`Server returned ${response.status}: ${response.statusText}`)
      }
      const data = await response.json()
      return data
    } catch (err) {
      return { error: `Failed to search knowledge: ${err instanceof Error ? err.message : String(err)}` }
    }
  }

  private async emitEvent(type: RunnerEventType, data?: unknown): Promise<void> {
    if (
      type === 'tool.output' &&
      data &&
      typeof data === 'object' &&
      'output' in data &&
      typeof (data as any).output === 'string'
    ) {
      const output = (data as any).output as string
      const chunkSize = 4000
      if (output.length > chunkSize) {
        const baseId = `evt_${Date.now()}_${Math.random().toString(16).slice(2)}`
        const total = Math.ceil(output.length / chunkSize)

        for (let i = 0; i < total; i++) {
          const chunk = output.slice(i * chunkSize, (i + 1) * chunkSize)
          const event = {
            id: `${baseId}_${i + 1}of${total}`,
            type,
            ts: new Date().toISOString(),
            job_id: this.ctx.jobId,
            data: { ...(data as any), output: chunk }
          }

          await this.ctx.store.addEvent(event)
          for (const sub of this.ctx.subscribers) {
            sub.raw.write(`event: ${type}\n`)
            sub.raw.write(`data: ${JSON.stringify(event)}\n\n`)
          }
        }

        return
      }
    }

    const event = {
      id: `evt_${Date.now()}_${Math.random().toString(16).slice(2)}`,
      type,
      ts: new Date().toISOString(),
      job_id: this.ctx.jobId,
      data
    }

    await this.ctx.store.addEvent(event)

    for (const sub of this.ctx.subscribers) {
      sub.raw.write(`event: ${type}\n`)
      sub.raw.write(`data: ${JSON.stringify(event)}\n\n`)
    }
  }
}

export async function runCoderAgent(ctx: JobContext): Promise<void> {
  const agent = new CoderAgent(ctx)
  await agent.run()
}
