/**
 * Agent implementation for coding tasks
 * Workflow: Plan -> Code Generation -> Code Execution -> Review -> Iterate/Finish
 */

import type { JobContext, JobInput } from './executor.js'
import type { RunnerEventType } from './db.js'
import { OllamaClient, createOllamaClientFromEnv } from './ollama.js'
import { GitService } from './services/git.js'

export type AgentState = 'planning' | 'code_generation' | 'code_execution' | 'review' | 'iterate' | 'finish'

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

type ChatMessage = {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content?: string | null
  name?: string
  tool_call_id?: string
  tool_calls?: Array<{
    id: string
    type: 'function'
    function: { name: string; arguments?: string }
  }>
}

export class CoderAgent {
  private state: AgentState = 'planning'
  private memory: AgentMemory = {
    conversation: [],
    taskHistory: []
  }
  private maxIterations = 5
  private currentIteration = 0
  private messages: ChatMessage[] = []
  private ollama: OllamaClient | null = null
  private gitService: GitService

  constructor(private ctx: JobContext) {
    this.ollama = createOllamaClientFromEnv()
    const baseDir = ctx.input.base_dir && ctx.input.base_dir.trim() ? ctx.input.base_dir : process.cwd()
    this.gitService = new GitService(baseDir)
    this.initializeMessages()
    this.loadMemory()
  }

  private async loadMemory(): Promise<void> {
    const sessionId = this.ctx.input.session_id
    if (!sessionId) return

    // Load previous conversation from jobs with the same session_id
    // For now, we'll load from recent jobs. In a full implementation,
    // we'd have a separate memory table or better indexing

    try {
      // Get recent jobs (this is a simplified approach)
      const recentJobs = await this.ctx.store.listJobs(10) // Get last 10 jobs

      for (const job of recentJobs) {
        if (job.id === this.ctx.jobId) continue // Skip current job

        // Check if this job has the same session_id
        // For now, we'll assume jobs with similar input are related
        // In a full implementation, we'd store session_id in the job record

        const jobEvents = await this.ctx.store.getEvents(job.id)
        const memoryEvents = jobEvents.filter(e => e.type === 'memory')

        for (const event of memoryEvents) {
          if (event.data && typeof event.data === 'object') {
            const data = event.data as any
            if (data.role && data.content) {
              this.memory.conversation.push({
                role: data.role,
                content: data.content,
                timestamp: event.ts
              })
            }
          }
        }

        // Limit memory to last 20 messages to avoid context overflow
        if (this.memory.conversation.length >= 20) break
      }

      // Sort by timestamp
      this.memory.conversation.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())

    } catch (err) {
      console.log('Failed to load memory:', err)
      // Continue without memory if loading fails
    }
  }

  private async saveMemory(): Promise<void> {
    // Save current conversation to events
    for (const msg of this.memory.conversation) {
      await this.emitEvent('memory', {
        role: msg.role,
        content: msg.content,
        timestamp: msg.timestamp
      })
    }
  }

  private initializeMessages(): void {
    this.messages = [
      {
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

Be thorough and systematic in your approach.`
      },
      {
        role: 'user',
        content: this.ctx.input.message || this.ctx.input.instruction || ''
      }
    ]
  }

  async run(): Promise<void> {
    while (this.state !== 'finish' && this.currentIteration < this.maxIterations) {
      await this.processState()
      this.currentIteration++
    }

    // Save memory before finishing
    await this.saveMemory()

    if (this.state === 'finish') {
      await this.emitEvent('done', { message: 'Task completed successfully' })
    } else {
      await this.emitEvent('done', { message: 'Task completed after max iterations' })
    }
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
    await this.emitEvent('plan', {
      state: 'planning',
      description: 'Analyzing the request and creating a plan'
    })

    const planPrompt = `Analyze this coding request and create a detailed plan. Focus on:

User request: "${this.ctx.input.message || this.ctx.input.instruction}"

Planning steps:
1. **Understand the scope**: Is this a single file, multi-file project, or modification to existing code?
2. **Explore codebase**: Use list_dir and read_file to understand the current structure
3. **Identify components**: What files need to be created/modified?
4. **Plan dependencies**: What libraries/frameworks are needed?
5. **Design architecture**: How should files be organized?
6. **Testing strategy**: How will you verify the code works?

Create a comprehensive plan that covers all aspects of the implementation.`

    this.messages.push({ role: 'user', content: planPrompt })

    const response = await this.callLLMWithTools()
    this.messages.push(response)

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

    this.messages.push({ role: 'user', content: codePrompt })

    const response = await this.callLLMWithTools()
    this.messages.push(response)

    await this.emitEvent('tool.end', { tool: 'code_generation', success: true })
    this.state = 'code_execution'
  }

  private async handleCodeExecution(): Promise<void> {
    await this.emitEvent('tool.start', { tool: 'code_execution', state: 'code_execution' })

    const execPrompt = `Execute and test the generated code.
- If it's a script, run it with the appropriate runtime (node for .js, python for .py, etc.)
- If it's a web application, check if it can be built/started
- If there are tests, run them
- Check for any runtime errors or issues
- Verify the code works as expected and fulfills the user's request

User request: "${this.ctx.input.message || this.ctx.input.instruction}"

Execute the code and report the results.`

    this.messages.push({ role: 'user', content: execPrompt })

    const response = await this.callLLMWithTools()
    this.messages.push(response)

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

    this.messages.push({ role: 'user', content: reviewPrompt })

    const response = await this.callLLMWithTools()
    this.messages.push(response)

    const content = response.content || ''
    if (content.toLowerCase().includes('task complete') || content.toLowerCase().includes('complete')) {
      this.state = 'finish'
    } else {
      this.state = 'iterate'
    }

    await this.emitEvent('tool.end', { tool: 'review', success: true })
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

    if (provider === 'ollama' && this.ollama) {
      return this.callLLMWithOllama()
    }

    // Use bridge if available (preferred for Copilot access)
    if (this.ctx.bridge && provider === 'bridge') {
      return this.callLLMWithBridge()
    }

    // Fallback to direct API
    const tools = this.getAvailableTools()
    const maxRetries = 3
    let lastError: Error | null = null

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const res = await fetch(`${process.env.AI_API_URL}/v1/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.AI_API_KEY}`,
            ...(process.env.AI_API_KEY && { 'X-API-Key': process.env.AI_API_KEY })
          },
          body: JSON.stringify({
            model: this.ctx.input.model || 'gpt-4o',
            messages: this.messages,
            tools,
            tool_choice: 'auto',
            temperature: 0.2,
            max_tokens: 4000
          })
        })

        if (!res.ok) {
          const errorText = await res.text()
          throw new Error(`LLM API request failed (${res.status}): ${errorText}`)
        }

        const json = await res.json()
        const choice = json.choices?.[0]
        const message = choice?.message as ChatMessage

        if (!message) {
          throw new Error('LLM API returned no message')
        }

        this.messages.push(message)

        // Handle tool calls
        if (message.tool_calls && message.tool_calls.length > 0) {
          for (const call of message.tool_calls) {
            const result = await this.executeTool(call)
            this.messages.push({
              role: 'tool',
              tool_call_id: call.id,
              name: call.function?.name,
              content: JSON.stringify(result)
            })
          }
          // Continue the loop to get the next response after tool execution
        } else {
          // No more tool calls, return the response
          return message
        }
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err))
        console.log(`LLM API attempt ${attempt} failed:`, lastError.message)

        if (attempt < maxRetries) {
          // Exponential backoff: wait 1s, 2s, 4s...
          const delay = Math.pow(2, attempt - 1) * 1000
          await new Promise(resolve => setTimeout(resolve, delay))
        }
      }
    }

    // All retries failed
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

  private async callLLMWithOllama(): Promise<ChatMessage> {
    if (!this.ollama) {
      throw new Error('Ollama client not available')
    }

    try {
      // Convert messages to Ollama format
      const ollamaMessages = this.messages.map(m => ({
        role: m.role === 'tool' ? 'assistant' : m.role, // Ollama doesn't have 'tool' role
        content: m.content || ''
      }))

      const response = await this.ollama.chat(ollamaMessages)

      // For now, assume no tool calls; just return the content
      return {
        role: 'assistant',
        content: response
      }
    } catch (err) {
      throw new Error(`Ollama call failed: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  private getAvailableTools() {
    return [
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
      }
    ]
  }

  private async executeTool(call: NonNullable<ChatMessage['tool_calls']>[0]): Promise<any> {
    const { name, arguments: args } = call.function!
    const params = args ? JSON.parse(args) : {}

    await this.emitEvent('tool.start', { tool: name, input: params })

    let result: any

    try {
      switch (name) {
        case 'read_file':
          result = await this.handleReadFile(params.path)
          break
        case 'write_file':
          result = await this.handleWriteFile(params.path, params.content)
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
          result = await this.handleRunCommand(params.command)
          break
        case 'apply_edit':
          result = await this.handleApplyEdit(params.path, params.range, params.text)
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
        default:
          throw new Error(`Unknown tool: ${name}`)
      }

      await this.emitEvent('tool.end', { tool: name, success: true })
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err)
      result = { error }
      await this.emitEvent('tool.end', { tool: name, success: false, error })
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
    const { glob } = await import('glob')
    const { exec } = await import('child_process')
    const { promisify } = await import('util')
    const execAsync = promisify(exec)

    let grepCommand = `grep -r -n "${query.replace(/"/g, '\\"')}" .`
    if (includePattern) {
      grepCommand += ` --include="${includePattern}"`
    }
    grepCommand += ` | head -50` // Limit results

    try {
      const result = await execAsync(grepCommand, { timeout: 10000 })
      return {
        query,
        results: result.stdout.split('\n').filter(line => line.trim()),
        truncated: result.stdout.split('\n').length >= 50
      }
    } catch (err: any) {
      // grep returns exit code 1 when no matches found
      if (err.code === 1) {
        return { query, results: [], truncated: false }
      }
      throw err
    }
  }

  private async handleRunCommand(command: string) {
    const { exec } = await import('child_process')
    const { promisify } = await import('util')
    const execAsync = promisify(exec)
    const result = await execAsync(command, { timeout: 15000 })
    return { stdout: result.stdout, stderr: result.stderr }
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

  private async emitEvent(type: RunnerEventType, data?: unknown): Promise<void> {
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