/**
 * Phase 3: Job executor with realistic tool simulation
 * 
 * Executes jobs by:
 * 1. Emitting a plan event
 * 2. Running tools (simulated or via bridge)
 * 3. Emitting progress events
 * 4. Completing with done event
 */
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { glob } from 'glob'
import { spawn } from 'node:child_process'
import type { RunnerEvent, RunnerEventType, JobStore, JobStatus } from './db.js'
import { BridgeClient, createBridgeClientFromEnv } from './bridge.js'
import { runCoderAgent } from './agent.js'
import { createOllamaClientFromEnv } from './llm/providers/ollama.js'
import { llmService } from './llm/index.js'
import { sandboxService } from './services/sandbox.js'
import { registerJobProcess } from './process-registry.js'
import type { FastifyReply } from 'fastify'

function nowIso() {
  return new Date().toISOString()
}

function randomId(prefix: string) {
  return `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now()}`
}

export interface JobInput {
  message?: string
  instruction?: string
  files?: string[]
  tools?: string[]
  provider?: string
  model?: string
  planner_model?: string
  writer_model?: string
  session_id?: string
  team_agents?: Array<{id: string, provider?: string, model?: string}>
  base_dir?: string
  runtime_mode?: 'local' | 'sandbox'
  cloud_fallback?: boolean
  sleep_ms?: number
  poc_commands?: string[]
}

type ToolCall = {
  id: string
  type: 'function'
  function: { name: string; arguments?: string }
}

type ChatMessage = {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content?: string | null
  name?: string
  tool_call_id?: string
  tool_calls?: ToolCall[]
}

export interface JobContext {
  jobId: string
  store: JobStore
  subscribers: Set<FastifyReply>
  bridge: BridgeClient | null
  input: JobInput
  aborted: boolean
  baseDirResolved: string
  signal?: AbortSignal
}

function sendSse(reply: FastifyReply, event: RunnerEvent) {
  reply.raw.write(`event: ${event.type}\n`)
  reply.raw.write(`data: ${JSON.stringify(event)}\n\n`)
}

async function emitEvent(ctx: JobContext, type: RunnerEventType, data?: unknown): Promise<RunnerEvent> {
  const event: RunnerEvent = {
    id: randomId('evt'),
    type,
    ts: nowIso(),
    job_id: ctx.jobId,
    data
  }

  await ctx.store.addEvent(event)
  for (const sub of ctx.subscribers) {
    sendSse(sub, event)
  }

  return event
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function parseToolArgs(raw?: string): Record<string, unknown> {
  if (!raw) return {}
  try {
    return JSON.parse(raw) as Record<string, unknown>
  } catch {
    return {}
  }
}

function resolveWithinBase(baseDir: string, targetPath: string) {
  const candidate = path.isAbsolute(targetPath)
    ? targetPath
    : path.resolve(baseDir, targetPath)
  const baseResolved = path.resolve(baseDir)
  const normalizedCandidate = path.resolve(candidate)
  if (
    normalizedCandidate !== baseResolved &&
    !normalizedCandidate.startsWith(baseResolved + path.sep)
  ) {
    throw new Error('Access outside of base_dir is not allowed')
  }
  return normalizedCandidate
}

function toSandboxPath(baseDir: string, absoluteHostPath: string) {
  const rel = path.relative(path.resolve(baseDir), path.resolve(absoluteHostPath))
  if (rel.startsWith('..' + path.sep) || rel === '..') {
    throw new Error('Access outside of base_dir is not allowed')
  }
  return rel === '' ? '/app/workspace' : path.posix.join('/app/workspace', rel.split(path.sep).join('/'))
}

async function handleReadFileTool(ctx: JobContext, path: string) {
  await emitEvent(ctx, 'tool.start', { tool: 'read_file', input: { path } })
  try {
    const baseDir = ctx.baseDirResolved
    const resolvedPath = resolveWithinBase(baseDir, path)
    const res =
      ctx.input.runtime_mode === 'sandbox'
        ? { path: resolvedPath, text: await sandboxService.readFile(ctx.jobId, toSandboxPath(baseDir, resolvedPath)) }
        : ctx.bridge
          ? await ctx.bridge.readFile(resolvedPath)
          : { path: resolvedPath, text: await fs.readFile(resolvedPath, 'utf8') }

    await emitEvent(ctx, 'tool.output', {
      tool: 'read_file',
      output: `Read ${res.text.length} bytes from ${res.path ?? path}`
    })
    await emitEvent(ctx, 'tool.end', { tool: 'read_file', success: true })
    return { path: res.path ?? path, content: res.text }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await emitEvent(ctx, 'tool.end', { tool: 'read_file', success: false, error: message })
    return { error: message }
  }
}

async function handleWriteFileTool(ctx: JobContext, path: string, content: string) {
  await emitEvent(ctx, 'tool.start', { tool: 'write_file', input: { path } })
  try {
    const baseDir = ctx.baseDirResolved
    const resolvedPath = resolveWithinBase(baseDir, path)
    if (ctx.input.runtime_mode === 'sandbox') {
      await sandboxService.writeFile(ctx.jobId, toSandboxPath(baseDir, resolvedPath), content)
    } else if (ctx.bridge) {
      let current = ''
      try {
        const existing = await ctx.bridge.readFile(resolvedPath)
        current = existing.text
      } catch {
        current = ''
      }
      await ctx.bridge.applyEdits([
        {
          path: resolvedPath,
          range: { start: 0, end: current.length },
          text: content
        }
      ])
    } else {
      await fs.writeFile(resolvedPath, content, 'utf8')
    }

    await emitEvent(ctx, 'tool.output', {
      tool: 'write_file',
      output: `Wrote ${content.length} bytes to ${resolvedPath}`
    })
    await emitEvent(ctx, 'tool.end', { tool: 'write_file', success: true })
    return { path: resolvedPath, bytes: content.length }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await emitEvent(ctx, 'tool.end', { tool: 'write_file', success: false, error: message })
    return { error: message }
  }
}

async function handleListFilesTool(ctx: JobContext, globPattern: string) {
  await emitEvent(ctx, 'tool.start', { tool: 'list_files', input: { glob: globPattern } })
  try {
    const baseDir = ctx.input.base_dir && ctx.input.base_dir.trim() ? ctx.input.base_dir : process.cwd()
    if (ctx.bridge) {
      const entries = await ctx.bridge.listFiles(`${globPattern}`, 200)
      await emitEvent(ctx, 'tool.output', {
        tool: 'list_files',
        output: `Found ${entries.length} file(s)`
      })
      await emitEvent(ctx, 'tool.end', { tool: 'list_files', success: true })
      return { files: entries.map((e: any) => e.path) }
    }

    // Fallback: use glob package
    const files = await glob(globPattern, { cwd: baseDir })
    await emitEvent(ctx, 'tool.output', {
      tool: 'list_files',
      output: `Found ${files.length} file(s)`
    })
    await emitEvent(ctx, 'tool.end', { tool: 'list_files', success: true })
    return { files }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await emitEvent(ctx, 'tool.end', { tool: 'list_files', success: false, error: message })
    return { error: message }
  }
}

async function handleRunCommandTool(ctx: JobContext, command: string) {
  await emitEvent(ctx, 'tool.start', { tool: 'run_command', input: { command } })
  try {
    const baseDir = ctx.baseDirResolved
    if (ctx.input.runtime_mode === 'sandbox') {
      const res = await sandboxService.execCommand(ctx.jobId, command, '/app/workspace')
      const output = (res.stdout || '').slice(0, 4000)
      const errOut = (res.stderr || '').slice(0, 4000)

      await emitEvent(ctx, 'tool.output', {
        tool: 'run_command',
        output: output || errOut || '(no output)'
      })
      await emitEvent(ctx, 'tool.end', { tool: 'run_command', success: res.exitCode === 0 })
      return { stdout: output, stderr: errOut, exitCode: res.exitCode }
    }

    const maxOutput = 4000
    const timeoutMs = 15000

    const result = await new Promise<{ stdout: string; stderr: string; exitCode: number }>((resolve, reject) => {
      const child = spawn('bash', ['-lc', command], { cwd: baseDir })
      registerJobProcess(ctx.jobId, child)

      let stdout = ''
      let stderr = ''
      let resolved = false

      const timer = setTimeout(() => {
        try {
          child.kill('SIGKILL')
        } catch {
        }
      }, timeoutMs)

      const onAbort = () => {
        try {
          child.kill('SIGKILL')
        } catch {
        }
      }

      ctx.signal?.addEventListener('abort', onAbort, { once: true })

      child.stdout.on('data', (chunk) => {
        if (stdout.length < maxOutput) stdout += chunk.toString()
      })
      child.stderr.on('data', (chunk) => {
        if (stderr.length < maxOutput) stderr += chunk.toString()
      })

      child.on('error', (err) => {
        if (resolved) return
        resolved = true
        clearTimeout(timer)
        reject(err)
      })
      child.on('close', (code) => {
        if (resolved) return
        resolved = true
        clearTimeout(timer)
        resolve({ stdout: stdout.slice(0, maxOutput), stderr: stderr.slice(0, maxOutput), exitCode: code ?? 0 })
      })
    })

    await emitEvent(ctx, 'tool.output', {
      tool: 'run_command',
      output: result.stdout || result.stderr || '(no output)'
    })
    await emitEvent(ctx, 'tool.end', { tool: 'run_command', success: result.exitCode === 0 })
    return result
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await emitEvent(ctx, 'tool.end', { tool: 'run_command', success: false, error: message })
    return { error: message }
  }
}

// Heuristics to avoid running natural-language or unsafe commands
function looksLikeNaturalLanguageCommand(command: string): boolean {
  // If the assistant returns phrases like "run the tests" or "execute the task",
  // these are natural-language instructions rather than shell commands.
  if (/\b(run|execute|start|stop|open|close|list|show|find)\b\s+(the|a|an)\b/i.test(command)) {
    return true
  }
  // If it's multiple words of plain English without typical CLI chars, consider NL
  if (/^[A-Za-z ,]+$/.test(command) && command.trim().split(/\s+/).length > 3) {
    return true
  }
  return false
}

function isDangerousCommand(command: string): boolean {
  const lowered = command.toLowerCase()
  // Simple blacklist of dangerous patterns
  return /(^|\s)(rm\s+-rf|sudo\b|shutdown\b|reboot\b|mkfs\b|dd\s+if=|:\(\)\s*{\s*:|:;};:|:\s*>\s*\/|>\s*\/)/.test(lowered)
}

async function handleListDirTool(ctx: JobContext, path: string) {
  await emitEvent(ctx, 'tool.start', { tool: 'list_dir', input: { path } })
  try {
    const baseDir = ctx.input.base_dir && ctx.input.base_dir.trim() ? ctx.input.base_dir : process.cwd()
    const { resolve, isAbsolute, sep } = await import('node:path')
    const target = (() => {
      const candidate = isAbsolute(path) ? path : resolve(baseDir, path)
      const baseResolved = resolve(baseDir)
      const normalizedCandidate = resolve(candidate)
      if (normalizedCandidate !== baseResolved && !normalizedCandidate.startsWith(baseResolved + sep)) {
        throw new Error('Access outside of base_dir is not allowed')
      }
      return normalizedCandidate
    })()
    const entries = await fs.readdir(target, { withFileTypes: true })
    const files = entries.map(entry => ({
      name: entry.name,
      type: entry.isDirectory() ? 'directory' : 'file'
    }))

    await emitEvent(ctx, 'tool.output', {
      tool: 'list_dir',
      output: `Found ${files.length} items in ${target}`
    })
    await emitEvent(ctx, 'tool.end', { tool: 'list_dir', success: true })
    return { path: target, files }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await emitEvent(ctx, 'tool.end', { tool: 'list_dir', success: false, error: message })
    return { error: message }
  }
}

async function handleGrepSearchTool(ctx: JobContext, query: string, includePattern?: string) {
  await emitEvent(ctx, 'tool.start', { tool: 'grep_search', input: { query, include_pattern: includePattern } })
  try {
    const baseDir = ctx.input.base_dir && ctx.input.base_dir.trim() ? ctx.input.base_dir : process.cwd()
    const args = ['-r', '-n', query, '.']
    if (includePattern) {
      args.push(`--include=${includePattern}`)
    }

    const maxLines = 50
    const timeoutMs = 10000
    const lines = await new Promise<string[]>((resolve, reject) => {
      const child = spawn('grep', args, { cwd: baseDir })
      registerJobProcess(ctx.jobId, child)
      let stdoutBuffer = ''
      let stderrBuffer = ''
      const results: string[] = []
      let truncated = false

      const timer = setTimeout(() => {
        child.kill('SIGKILL')
      }, timeoutMs)

      const onAbort = () => {
        try {
          child.kill('SIGKILL')
        } catch {
        }
      }
      ctx.signal?.addEventListener('abort', onAbort, { once: true })

      child.stdout.on('data', (chunk) => {
        stdoutBuffer += chunk.toString()
        const parts = stdoutBuffer.split('\n')
        stdoutBuffer = parts.pop() ?? ''
        for (const line of parts) {
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
          resolve(results)
          return
        }
        reject(new Error(stderrBuffer || `grep failed with code ${code ?? 'unknown'}`))
      })
    })

    const cleanedLines = lines.filter(line => line.trim())
    const matches = cleanedLines.map(line => {
      const colonIndex = line.indexOf(':')
      if (colonIndex === -1) return null
      const file = line.slice(0, colonIndex)
      const rest = line.slice(colonIndex + 1)
      const colonIndex2 = rest.indexOf(':')
      if (colonIndex2 === -1) return null
      const lineNum = parseInt(rest.slice(0, colonIndex2), 10)
      const text = rest.slice(colonIndex2 + 1)
      return { file, line: lineNum, text }
    }).filter(Boolean)

    await emitEvent(ctx, 'tool.output', {
      tool: 'grep_search',
      output: `Found ${matches.length} matches`
    })
    await emitEvent(ctx, 'tool.end', { tool: 'grep_search', success: true })
    return { query, matches }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await emitEvent(ctx, 'tool.end', { tool: 'grep_search', success: false, error: message })
    return { error: message }
  }
}

/**
 * Simulate a tool execution with progress events
 */
async function simulateTool(
  ctx: JobContext,
  toolName: string,
  toolInput: unknown,
  outputChunks: string[]
): Promise<void> {
  if (ctx.aborted) return

  await emitEvent(ctx, 'tool.start', { tool: toolName, input: toolInput })

  for (const chunk of outputChunks) {
    if (ctx.aborted) break
    await sleep(100 + Math.random() * 200)
    await emitEvent(ctx, 'tool.output', { tool: toolName, output: chunk })
  }

  await emitEvent(ctx, 'tool.end', { tool: toolName, success: true })
}

/**
 * Execute a job with bridge integration (when available)
 */
async function executeWithBridge(ctx: JobContext): Promise<void> {
  if (!ctx.bridge) {
    throw new Error('Bridge not available')
  }

  // Check bridge health
  const health = await ctx.bridge.health()
  if (!health.ok || !health.workspaceOpen) {
    throw new Error('Bridge not ready or workspace not open')
  }

  await emitEvent(ctx, 'plan', {
    steps: [
      { tool: 'readFiles', description: 'Read relevant files' },
      { tool: 'generateEdits', description: 'Generate code changes' },
      { tool: 'applyEdits', description: 'Apply changes to workspace' }
    ]
  })

  // Step 1: Read files
  const filesToRead = ctx.input.files ?? ['src/index.ts']
  await emitEvent(ctx, 'tool.start', { tool: 'readFiles', input: { files: filesToRead } })

  const fileContents: Array<{ path: string; text: string }> = []
  for (const path of filesToRead) {
    if (ctx.aborted) return
    try {
      const content = await ctx.bridge.readFile(path)
      fileContents.push({ path: content.path, text: content.text })
      await emitEvent(ctx, 'tool.output', { tool: 'readFiles', file: path, length: content.text.length })
    } catch (err) {
      await emitEvent(ctx, 'tool.output', { tool: 'readFiles', file: path, error: String(err) })
    }
  }
  await emitEvent(ctx, 'tool.end', { tool: 'readFiles', success: true, filesRead: fileContents.length })

  // Step 2: Generate edits via Copilot
  if (ctx.aborted) return
  const instruction = ctx.input.instruction ?? ctx.input.message ?? 'Improve the code'
  await emitEvent(ctx, 'tool.start', { tool: 'generateEdits', input: { instruction } })

  try {
    const result = await ctx.bridge.generateEdits(instruction, fileContents)
    await emitEvent(ctx, 'tool.output', {
      tool: 'generateEdits',
      summary: result.summary,
      editCount: result.edits.length
    })
    await emitEvent(ctx, 'tool.end', { tool: 'generateEdits', success: true, edits: result.edits })

    // Step 3: Apply edits (would need user confirmation in real flow)
    if (result.edits.length > 0 && !ctx.aborted) {
      await emitEvent(ctx, 'plan.update', {
        message: `Ready to apply ${result.edits.length} edit(s). Awaiting confirmation.`,
        pendingEdits: result.edits
      })
      // In real implementation, we'd wait for user confirmation before applying
    }
  } catch (err) {
    await emitEvent(ctx, 'tool.end', { tool: 'generateEdits', success: false, error: String(err) })
    throw err
  }
}

/**
 * Execute a job with simulated tools (demo mode)
 */
async function executeSimulated(ctx: JobContext): Promise<void> {
  const message = ctx.input.message ?? ctx.input.instruction ?? 'Hello'

  // Emit plan
  await emitEvent(ctx, 'plan', {
    steps: [
      { tool: 'analyzeRequest', description: 'Understanding the request' },
      { tool: 'searchCode', description: 'Finding relevant code' },
      { tool: 'generateResponse', description: 'Generating response' }
    ]
  })

  await sleep(200)

  // Tool 1: Analyze request
  await simulateTool(ctx, 'analyzeRequest', { message }, [
    'Parsing input...',
    `Detected intent: "${message.slice(0, 50)}..."`,
    'Analysis complete.'
  ])

  if (ctx.aborted) return

  // Tool 2: Search code
  await simulateTool(ctx, 'searchCode', { query: message }, [
    'Searching codebase...',
    'Found 3 relevant files.',
    'Ranked by relevance.'
  ])

  if (ctx.aborted) return

  // Update plan with findings
  await emitEvent(ctx, 'plan.update', {
    message: 'Found context, generating response...',
    filesFound: ['src/index.ts', 'src/utils.ts', 'README.md']
  })

  // Tool 3: Generate response
  await simulateTool(ctx, 'generateResponse', { context: 'files' }, [
    'Processing context...',
    'Generating response...',
    `Response: Echo - ${message}`
  ])

  // Emit final response as tool output for chat display
  await emitEvent(ctx, 'tool.output', {
    tool: 'generateResponse',
    output: `I understand you said: "${message}". This is a simulated response. In a real implementation, I would provide a helpful answer based on the codebase analysis.`
  })
}

function looksLikeActionRequest(text: string): boolean {
  return /\b(run|refactor|fix|change|update|modify|create|generate|build|test|install|delete|move|copy)\b/i.test(text)
}

/**
 * Execute a job with CopilotAPI Bridge
 */
async function executeWithCopilotApi(ctx: JobContext): Promise<void> {
  const message = ctx.input.message ?? ctx.input.instruction ?? 'Hello'
  const model = ctx.input.model || 'auto'

  // Check if this looks like an action request
  const isActionRequest = looksLikeActionRequest(message)

  const systemPrompt = isActionRequest ? `
You are an autonomous coding agent with full execution capabilities.

IMPORTANT: You are NOT GitHub Copilot Chat. You are NOT limited to suggestions or explanations.

Capabilities:
- You can read files using read_file tool
- You can write/create files using write_file tool
- You can list directories using list_dir tool
- You can search code using grep_search tool
- You can run terminal commands using run_command tool

Rules:
- If the user asks you to perform an action (refactor, fix, generate, run, build, etc.), you SHOULD do it using the available tools
- Do NOT say you "cannot run commands" or mention VS Code limitations
- Do NOT refuse actions that are technically possible
- Only refuse if the action is unsafe, disallowed, or impossible
- When using tools, provide clear reasoning for each step
- After completing actions, summarize what was done

Respond by acting with tools, not by explaining limitations.
` : `
You are a helpful coding assistant.

You can answer questions about code, provide explanations, and give advice.
For specific actions like running commands or modifying files, ask the user to clarify.
`

  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: message }
  ]

  // Only include tools for action requests
  const tools = isActionRequest ? [
    {
      type: 'function',
      function: {
        name: 'read_file',
        description: 'Read a UTF-8 text file from the workspace',
        parameters: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'Path to the file relative to the workspace root'
            }
          },
          required: ['path']
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'write_file',
        description: 'Replace the full contents of a file in the workspace',
        parameters: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'Path to the file relative to the workspace root'
            },
            content: {
              type: 'string',
              description: 'Full file contents to write (UTF-8)'
            }
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
            glob: {
              type: 'string',
              description: 'Glob pattern, e.g. src/**/*.ts'
            }
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
            path: {
              type: 'string',
              description: 'Directory path to list'
            }
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
            query: {
              type: 'string',
              description: 'Regex pattern to search for'
            },
            include_pattern: {
              type: 'string',
              description: 'Glob pattern for files to include (optional)'
            }
          },
          required: ['query']
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'run_command',
        description: 'Run a terminal command in the workspace (15s timeout)',
        parameters: {
          type: 'object',
          properties: {
            command: {
              type: 'string',
              description: 'Shell command to execute'
            }
          },
          required: ['command']
        }
      }
    }
  ] : []

  // Only emit plan for action requests
  if (isActionRequest) {
    await emitEvent(ctx, 'plan', {
      steps: [
        { tool: 'read_file', description: 'Gather context from files' },
        { tool: 'write_file', description: 'Apply requested changes' },
        { tool: 'list_files', description: 'List files with glob patterns' },
        { tool: 'list_dir', description: 'List directory contents' },
        { tool: 'grep_search', description: 'Search text in files' },
        { tool: 'run_command', description: 'Run terminal commands' }
      ]
    })
  }

  await emitEvent(ctx, 'tool.start', { tool: 'copilot', input: { model, message } })

  // Build the API URL
  const base = (process.env.AI_API_URL ?? '').replace(/\/+$/, '')
  const chatPath = process.env.AI_API_CHAT_PATH ?? '/v1/chat/completions'
  const url = `${base}${chatPath.startsWith('/') ? '' : '/'}${chatPath}`

  const debug = process.env.RUNNER_DEBUG === '1'
  if (debug) {
    console.log('[CopilotAPI] base=', base)
    console.log('[CopilotAPI] chatPath=', chatPath)
    console.log('[CopilotAPI] url=', url)
    console.log('[CopilotAPI] model=', model)
  }

  for (let i = 0; i < 6; i++) {
    let res: Response
    let raw = ''

    try {
      res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(process.env.AI_API_KEY ? { Authorization: `Bearer ${process.env.AI_API_KEY}` } : {})
        },
        body: JSON.stringify({
          model,
          messages,
          ...(isActionRequest && tools.length > 0 ? { tools, tool_choice: 'auto' } : {}),
          temperature: 0.7
        })
      })

      // Read body ONCE
      raw = await res.text()

      if (debug) {
        console.log('[CopilotAPI] status=', res.status)
        console.log('[CopilotAPI] content-type=', res.headers.get('content-type'))
        console.log('[CopilotAPI] body(head)=', raw.slice(0, 800))
      }

      // If not OK, include raw in error and exit
      if (!res.ok) {
        await emitEvent(ctx, 'error', {
          message: `CopilotAPI request failed: ${res.status}. ${raw.slice(0, 500)}`
        })
        await emitEvent(ctx, 'done', { status: 'error' })
        return
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (debug) console.log('[CopilotAPI] fetch threw:', msg)

      await emitEvent(ctx, 'error', {
        message: `CopilotAPI fetch failed: ${msg}`
      })
      await emitEvent(ctx, 'done', { status: 'error' })
      return
    }

    const ct = res.headers.get('content-type') || ''
    if (!ct.includes('application/json')) {
      await emitEvent(ctx, 'error', {
        message: `CopilotAPI returned non-JSON response: ${raw.slice(0, 500)}`
      })
      await emitEvent(ctx, 'done', { status: 'error' })
      return
    }

    // Parse JSON from the same string (DON'T call res.json())
    let json: any
    try {
      json = JSON.parse(raw)
    } catch {
      await emitEvent(ctx, 'error', {
        message: `CopilotAPI returned invalid JSON: ${raw.slice(0, 500)}`
      })
      await emitEvent(ctx, 'done', { status: 'error' })
      return
    }
    const choice = json.choices?.[0]
    const assistantMessage = choice?.message as ChatMessage | undefined

    if (!assistantMessage) {
      await emitEvent(ctx, 'error', {
        message: 'CopilotAPI returned no message'
      })
      await emitEvent(ctx, 'done', { status: 'error' })
      return
    }

    messages.push(assistantMessage)

    const toolCalls: ToolCall[] = assistantMessage.tool_calls ?? []
    if (toolCalls.length === 0) {
      const content = assistantMessage.content ?? 'No response'
      await emitEvent(ctx, 'tool.output', { tool: 'copilot', output: content })
      await emitEvent(ctx, 'tool.end', { tool: 'copilot', success: true })
      return
    }

    for (const call of toolCalls) {
      const args = parseToolArgs(call.function?.arguments)
      let result: unknown = { error: 'Unsupported tool' }

      if (call.function?.name === 'read_file') {
        const path = typeof args.path === 'string' ? args.path : ''
        result = path ? await handleReadFileTool(ctx, path) : { error: 'Missing path' }
      } else if (call.function?.name === 'write_file') {
        const path = typeof args.path === 'string' ? args.path : ''
        const content = typeof args.content === 'string' ? args.content : ''
        result = path ? await handleWriteFileTool(ctx, path, content) : { error: 'Missing path' }
      } else if (call.function?.name === 'list_files') {
        const glob = typeof args.glob === 'string' ? args.glob : ''
        result = glob ? await handleListFilesTool(ctx, glob) : { error: 'Missing glob' }
      } else if (call.function?.name === 'list_dir') {
        const path = typeof args.path === 'string' ? args.path : ''
        result = path ? await handleListDirTool(ctx, path) : { error: 'Missing path' }
      } else if (call.function?.name === 'grep_search') {
        const query = typeof args.query === 'string' ? args.query : ''
        const includePattern = typeof args.include_pattern === 'string' ? args.include_pattern : undefined
        result = query ? await handleGrepSearchTool(ctx, query, includePattern) : { error: 'Missing query' }
      } else if (call.function?.name === 'run_command') {
        const command = typeof args.command === 'string' ? args.command : ''
        if (!command) {
          result = { error: 'Missing command' }
        } else {
          // Load allowlist (cached) and enforce
          const allowedPath = new URL('../..', import.meta.url)
            .pathname.replace(/\/runner\/(?:\.\.)?$/, '') // fallback no-op
          // Helper to read config file safely
          async function loadAllowlist(): Promise<string[]> {
            try {
              const cfgPath = new URL('../../config/allowed-commands.json', import.meta.url).pathname
              const content = await (await import('node:fs/promises')).readFile(cfgPath, 'utf8')
              return JSON.parse(content) as string[]
            } catch {
              return []
            }
          }

          function matchesAllowlist(cmd: string, allowed: string[]) {
            if (!allowed || allowed.length === 0) return false
            const trimmed = cmd.trim()
            for (const a of allowed) {
              const pick = a.trim()
              if (trimmed === pick) return true
              if (trimmed.startsWith(pick + ' ')) return true
            }
            return false
          }

          const allowed = await loadAllowlist()
          if (!matchesAllowlist(command, allowed)) {
            const message = 'Refused to run: command not on the allowlist.'
            console.warn(`[Runner] Refused run_command: ${command}`)
            // Emit structured refusal event containing the attempted command for UI affordances
            try {
              await emitEvent(ctx, 'tool.refused', { tool: 'run_command', command, reason: message })
            } catch (e) {
              /* best-effort */
            }
            await emitEvent(ctx, 'tool.output', { tool: 'run_command', output: message })
            await emitEvent(ctx, 'tool.end', { tool: 'run_command', success: false, error: message })
            // Audit log
            try {
              const logLine = `${nowIso()} ${ctx.jobId} REFUSE allowlist ${command}\n`
              await (await import('node:fs/promises')).appendFile(process.cwd() + '/logs/command-refusals.log', logLine, 'utf8')
            } catch (e) {
              /* ignore logging errors */
            }
            result = { error: message }
          } else if (looksLikeNaturalLanguageCommand(command)) {
            const message = 'Refused to run: command looks like natural language rather than a shell command.'
            try {
              await emitEvent(ctx, 'tool.refused', { tool: 'run_command', command, reason: message })
            } catch (e) {
              /* best-effort */
            }
            await emitEvent(ctx, 'tool.output', { tool: 'run_command', output: message })
            await emitEvent(ctx, 'tool.end', { tool: 'run_command', success: false, error: message })
            try {
              const logLine = `${nowIso()} ${ctx.jobId} REFUSE natural_language ${command}\n`
              await (await import('node:fs/promises')).appendFile(process.cwd() + '/logs/command-refusals.log', logLine, 'utf8')
            } catch (e) {
              /* ignore logging errors */
            }
            result = { error: message }
          } else if (isDangerousCommand(command)) {
            const message = 'Refused to run: command matches disallowed or unsafe patterns.'
            try {
              await emitEvent(ctx, 'tool.refused', { tool: 'run_command', command, reason: message })
            } catch (e) {
              /* best-effort */
            }
            await emitEvent(ctx, 'tool.output', { tool: 'run_command', output: message })
            await emitEvent(ctx, 'tool.end', { tool: 'run_command', success: false, error: message })
            try {
              const logLine = `${nowIso()} ${ctx.jobId} REFUSE dangerous ${command}\n`
              await (await import('node:fs/promises')).appendFile(process.cwd() + '/logs/command-refusals.log', logLine, 'utf8')
            } catch (e) {
              /* ignore logging errors */
            }
            result = { error: message }
          } else {
            result = await handleRunCommandTool(ctx, command)
          }
        }
      }

      messages.push({
        role: 'tool',
        tool_call_id: call.id,
        name: call.function?.name ?? 'unknown',
        content: JSON.stringify(result)
      })
    }
  }

  await emitEvent(ctx, 'tool.end', {
    tool: 'copilot',
    success: false,
    error: 'Exceeded tool-call iterations'
  })
  await emitEvent(ctx, 'error', {
    message: 'Copilot tool loop exceeded iteration limit'
  })
  await emitEvent(ctx, 'done', { status: 'error' })
  return
}

/**
 * Execute a job with Ollama
 */
async function executeWithOllama(ctx: JobContext): Promise<void> {
  const message = ctx.input.message ?? ctx.input.instruction ?? 'Hello'
  const model = ctx.input.model || 'qwen2.5-coder:7b'

  const ollama = createOllamaClientFromEnv()
  if (!ollama) {
    throw new Error('Ollama client not configured')
  }

  await emitEvent(ctx, 'tool.start', { tool: 'ollama', input: { model, message } })

  try {
    const response = await ollama.chat(model, [
      { role: 'user', content: message }
    ])

    await emitEvent(ctx, 'tool.output', {
      tool: 'ollama',
      output: response.content || ''
    })
    await emitEvent(ctx, 'tool.end', { tool: 'ollama', success: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await emitEvent(ctx, 'tool.end', { tool: 'ollama', success: false, error: message })
    throw err
  }
}

async function executeWithSleep(ctx: JobContext): Promise<void> {
  const ms = typeof ctx.input.sleep_ms === 'number' ? ctx.input.sleep_ms : 60000
  await emitEvent(ctx, 'tool.start', { tool: 'sleep', input: { ms } })

  const result = await new Promise<{ exitCode: number }>((resolve, reject) => {
    const seconds = Math.max(1, Math.ceil(ms / 1000))
    const child = spawn('bash', ['-lc', `sleep ${seconds}`], { cwd: ctx.baseDirResolved })
    registerJobProcess(ctx.jobId, child)

    const onAbort = () => {
      try {
        child.kill('SIGKILL')
      } catch {
      }
    }
    ctx.signal?.addEventListener('abort', onAbort, { once: true })

    child.on('error', reject)
    child.on('close', (code) => resolve({ exitCode: code ?? 0 }))
  })

  await emitEvent(ctx, 'tool.output', { tool: 'sleep', output: `exitCode=${result.exitCode}` })
  await emitEvent(ctx, 'tool.end', { tool: 'sleep', success: result.exitCode === 0 })
}

async function runReviewCommand(
  ctx: JobContext,
  command: string
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  if (ctx.input.runtime_mode === 'sandbox') {
    const res = await sandboxService.execCommand(ctx.jobId, command, '/app/workspace')
    return {
      stdout: (res.stdout || '').slice(0, 12000),
      stderr: (res.stderr || '').slice(0, 12000),
      exitCode: res.exitCode
    }
  }

  const maxOutput = 12000
  const timeoutMs = 10 * 60 * 1000

  return new Promise((resolve, reject) => {
    const child = spawn('bash', ['-lc', command], { cwd: ctx.baseDirResolved })
    registerJobProcess(ctx.jobId, child)

    let stdout = ''
    let stderr = ''
    let resolved = false

    const timer = setTimeout(() => {
      try {
        child.kill('SIGKILL')
      } catch {
      }
    }, timeoutMs)

    const onAbort = () => {
      try {
        child.kill('SIGKILL')
      } catch {
      }
    }
    ctx.signal?.addEventListener('abort', onAbort, { once: true })

    child.stdout.on('data', (chunk) => {
      if (stdout.length < maxOutput) stdout += chunk.toString()
    })
    child.stderr.on('data', (chunk) => {
      if (stderr.length < maxOutput) stderr += chunk.toString()
    })

    child.on('error', (err) => {
      if (resolved) return
      resolved = true
      clearTimeout(timer)
      reject(err)
    })
    child.on('close', (code) => {
      if (resolved) return
      resolved = true
      clearTimeout(timer)
      resolve({
        stdout: stdout.slice(0, maxOutput),
        stderr: stderr.slice(0, maxOutput),
        exitCode: code ?? 0
      })
    })
  })
}

async function executeWithPocReview(ctx: JobContext): Promise<void> {
  const commands = (Array.isArray(ctx.input.poc_commands) && ctx.input.poc_commands.length > 0)
    ? ctx.input.poc_commands
    : [
        'node -v',
        'npm -v',
        'cd runner && npm run build',
        'cd server && npm run build',
        'cd ui && npm run build'
      ]

  await emitEvent(ctx, 'tool.start', {
    tool: 'poc_review',
    input: {
      base_dir: ctx.input.base_dir ?? '',
      runtime_mode: ctx.input.runtime_mode ?? 'local',
      checks: commands.length
    }
  })

  const results: Array<{
    id: string
    statement: string
    command: string
    ok: boolean
    exitCode: number
    stdout: string
    stderr: string
  }> = []

  for (let i = 0; i < commands.length; i++) {
    if (ctx.aborted) break
    const command = commands[i]
    const id = `C${i + 1}`
    const statement = `Command succeeds: ${command}`
    const res = await runReviewCommand(ctx, command)
    const ok = res.exitCode === 0
    results.push({ id, statement, command, ok, exitCode: res.exitCode, stdout: res.stdout, stderr: res.stderr })

    await emitEvent(ctx, 'tool.output', {
      tool: 'poc_review',
      claim: {
        id,
        statement,
        dependencies: i === 0 ? [] : [`C${i}`],
        command,
        ok,
        exitCode: res.exitCode
      },
      evidence: {
        stdout: res.stdout,
        stderr: res.stderr
      }
    })
  }

  const passed = results.filter(r => r.ok).length
  const failed = results.length - passed
  const summaryLines = [
    `PoC Review: ${passed} passed, ${failed} failed`,
    ...results.map(r => `- ${r.ok ? '✅' : '❌'} ${r.id}: ${r.command}`)
  ]

  await emitEvent(ctx, 'tool.output', {
    tool: 'poc_review',
    output: summaryLines.join('\n')
  })
  await emitEvent(ctx, 'tool.end', { tool: 'poc_review', success: failed === 0 })
}

async function executeWithOpenRouter(ctx: JobContext): Promise<void> {
  const message = ctx.input.message ?? ctx.input.instruction ?? 'Hello'
  if (!process.env.OPENROUTER_API_KEY) {
    throw new Error('OPENROUTER_API_KEY is not set')
  }
  const model =
    (ctx.input.model && ctx.input.model.includes('/'))
      ? ctx.input.model
      : (process.env.OPENROUTER_MODEL || 'openai/gpt-4o-mini')

  await emitEvent(ctx, 'tool.start', { tool: 'openrouter', input: { model, message } })

  const response = await llmService.chat(
    { provider: 'openrouter', model },
    [{ role: 'user', content: message }]
  )

  await emitEvent(ctx, 'tool.output', { tool: 'openrouter', output: response.content || '' })
  await emitEvent(ctx, 'tool.end', { tool: 'openrouter', success: true })
}

/**
 * Call LLM based on provider
 */
async function callLLM(ctx: JobContext, provider: string, model: string, messages: ChatMessage[]): Promise<string> {
  if (provider === 'ollama') {
    const ollama = createOllamaClientFromEnv()
    if (!ollama) throw new Error('Ollama not configured')
    const ollamaMessages = messages.map(m => ({
      role: m.role === 'tool' ? 'assistant' : m.role,
      content: m.content || ''
    }))
    return (await ollama.chat(model, ollamaMessages)).content || ''
  } else if (provider === 'copilotapi') {
    // For now, simple, but since executeWithCopilotApi is complex, perhaps duplicate or simplify
    // To keep simple, assume only ollama for multi-agent
    throw new Error('CopilotAPI not supported for multi-agent yet')
  } else {
    throw new Error(`Unknown provider: ${provider}`)
  }
}

/**
 * Execute multi-agent chat
 */
async function executeMultiAgent(ctx: JobContext): Promise<void> {
  const teamAgents = ctx.input.team_agents!
  const initialMessage = ctx.input.message ?? 'Hello'

  let messages: ChatMessage[] = [
    { role: 'user', content: initialMessage }
  ]

  for (const agent of teamAgents) {
    const provider = agent.provider || 'ollama'
    const model = agent.model || 'qwen2.5-coder:7b'

    await emitEvent(ctx, 'tool.start', { tool: 'agent', agent: agent.id, input: { provider, model } })

    try {
      const response = await callLLM(ctx, provider, model, messages)

      messages.push({ role: 'assistant', content: response, name: agent.id })

      await emitEvent(ctx, 'tool.output', {
        tool: 'agent',
        agent: agent.id,
        output: response
      })
      await emitEvent(ctx, 'tool.end', { tool: 'agent', agent: agent.id, success: true })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      await emitEvent(ctx, 'tool.end', { tool: 'agent', agent: agent.id, success: false, error: msg })
      // Continue to next agent
    }
  }
}

/**
 * Main job executor
 */
export async function executeJob(
  store: JobStore,
  jobId: string,
  subscribers: Set<FastifyReply>,
  input: JobInput,
  onComplete: (status: JobStatus) => void,
  signal?: AbortSignal
): Promise<void> {
  const bridge = createBridgeClientFromEnv()
  const baseDirResolved = path.resolve(
    input.base_dir && input.base_dir.trim() ? input.base_dir : process.cwd()
  )

  const ctx: JobContext = {
    jobId,
    store,
    subscribers,
    bridge,
    input,
    aborted: false,
    baseDirResolved,
    signal
  }

  let sandboxCreated = false

  if (signal) {
    if (signal.aborted) ctx.aborted = true
    signal.addEventListener('abort', () => {
      ctx.aborted = true
      if (ctx.input.runtime_mode === 'sandbox') {
        sandboxService.destroySandbox(jobId).catch(() => {})
      }
    })
  }

  try {
    if (ctx.aborted) {
      onComplete('cancelled')
      return
    }

    // Emit job started
    await store.updateJobStatus(jobId, 'running', nowIso())
    await emitEvent(ctx, 'job.started', { input })

    if (ctx.input.runtime_mode === 'sandbox') {
      await sandboxService.createSandbox(jobId, ctx.baseDirResolved)
      sandboxCreated = true
    }

    // Execute based on provider
    // When the provider is "copilotapi" we should call the Copilot API directly
    // rather than using the internal CoderAgent. The CoderAgent is designed
    // for autonomous coding tasks and exposes internal reasoning and tool calls,
    // which leads to chat responses that are not conversational. By using
    // executeWithCopilotApi, we relay the user message to the configured AI API
    // (see `AI_API_URL` and `AI_API_KEY` in environment) and stream back
    // natural language answers. For other providers we fall back to the bridge
    // client if available, otherwise use the simulated executor.
    if (input.provider === 'sleep') {
      await executeWithSleep(ctx)
    } else if (input.provider === 'poc_review') {
      await executeWithPocReview(ctx)
    } else if (input.provider === 'copilotapi') {
      console.log(`[Runner] Using Copilot API for job ${jobId}`);
      await executeWithCopilotApi(ctx);
    } else if (input.provider === 'ollama') {
      console.log(`[Runner] Using Ollama for job ${jobId}`);
      try {
        await executeWithOllama(ctx)
      } catch (err) {
        if (!ctx.input.cloud_fallback) throw err
        console.log(`[Runner] Ollama failed for job ${jobId}, using cloud fallback`)
        await executeWithOpenRouter(ctx)
      }
    } else if (input.team_agents && input.team_agents.length > 0) {
      console.log(`[Runner] Using multi-agent for job ${jobId}`);
      await executeMultiAgent(ctx);
    } else if (bridge) {
      console.log(`[Runner] Using bridge client for job ${jobId}`);
      try {
        await executeWithBridge(ctx);
      } catch (err) {
        console.log(`[Runner] Bridge failed for job ${jobId}, falling back to simulation:`, err);
        await executeSimulated(ctx);
      }
    } else {
      console.log(`[Runner] No bridge available for job ${jobId}, using simulation`);
      await executeSimulated(ctx);
    }

    if (!ctx.aborted) {
      // Complete successfully
      await store.updateJobStatus(jobId, 'done', undefined, nowIso())
      await emitEvent(ctx, 'done', { status: 'done' })
      onComplete('done')
    } else {
      onComplete('cancelled')
    }
  } catch (err) {
    if (ctx.aborted) {
      onComplete('cancelled')
      return
    }
    // Error occurred
    await store.updateJobStatus(jobId, 'error', undefined, nowIso())
    await emitEvent(ctx, 'error', { message: err instanceof Error ? err.message : String(err) })
    await emitEvent(ctx, 'done', { status: 'error' })
    onComplete('error')
  } finally {
    if (sandboxCreated) {
      await sandboxService.destroySandbox(jobId)
    }
  }
}

/**
 * Cancel a running job
 */
export function cancelJob(ctx: JobContext): void {
  ctx.aborted = true
}
