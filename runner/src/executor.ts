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
import { glob } from 'glob'
import { exec as execCb } from 'node:child_process'
import { promisify } from 'node:util'
import type { RunnerEvent, RunnerEventType, JobStore, JobStatus } from './db.js'
import { BridgeClient, createBridgeClientFromEnv } from './bridge.js'
import { runCoderAgent } from './agent.js'
import type { FastifyReply } from 'fastify'

const execAsync = promisify(execCb)

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
  session_id?: string
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

async function handleReadFileTool(ctx: JobContext, path: string) {
  await emitEvent(ctx, 'tool.start', { tool: 'read_file', input: { path } })
  try {
    const res = ctx.bridge
      ? await ctx.bridge.readFile(path)
      : { path, text: await fs.readFile(path, 'utf8') }

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
    if (ctx.bridge) {
      let current = ''
      try {
        const existing = await ctx.bridge.readFile(path)
        current = existing.text
      } catch {
        current = ''
      }
      await ctx.bridge.applyEdits([
        {
          path,
          range: { start: 0, end: current.length },
          text: content
        }
      ])
    } else {
      await fs.writeFile(path, content, 'utf8')
    }

    await emitEvent(ctx, 'tool.output', {
      tool: 'write_file',
      output: `Wrote ${content.length} bytes to ${path}`
    })
    await emitEvent(ctx, 'tool.end', { tool: 'write_file', success: true })
    return { path, bytes: content.length }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await emitEvent(ctx, 'tool.end', { tool: 'write_file', success: false, error: message })
    return { error: message }
  }
}

async function handleListFilesTool(ctx: JobContext, globPattern: string) {
  await emitEvent(ctx, 'tool.start', { tool: 'list_files', input: { glob: globPattern } })
  try {
    if (ctx.bridge) {
      const entries = await ctx.bridge.listFiles(globPattern, 200)
      await emitEvent(ctx, 'tool.output', {
        tool: 'list_files',
        output: `Found ${entries.length} file(s)`
      })
      await emitEvent(ctx, 'tool.end', { tool: 'list_files', success: true })
      return { files: entries.map((e: any) => e.path) }
    }

    // Fallback: use glob package
    const files = await glob(globPattern, { cwd: process.cwd() })
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
    const { stdout, stderr } = await execAsync(command, {
      timeout: 15000,
      maxBuffer: 1024 * 1024
    })

    const output = (stdout || '').slice(0, 4000)
    const errOut = (stderr || '').slice(0, 4000)

    await emitEvent(ctx, 'tool.output', {
      tool: 'run_command',
      output: output || errOut || '(no output)'
    })
    await emitEvent(ctx, 'tool.end', { tool: 'run_command', success: true })
    return { stdout: output, stderr: errOut }
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
    const entries = await fs.readdir(path, { withFileTypes: true })
    const files = entries.map(entry => ({
      name: entry.name,
      type: entry.isDirectory() ? 'directory' : 'file'
    }))

    await emitEvent(ctx, 'tool.output', {
      tool: 'list_dir',
      output: `Found ${files.length} items in ${path}`
    })
    await emitEvent(ctx, 'tool.end', { tool: 'list_dir', success: true })
    return { path, files }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await emitEvent(ctx, 'tool.end', { tool: 'list_dir', success: false, error: message })
    return { error: message }
  }
}

async function handleGrepSearchTool(ctx: JobContext, query: string, includePattern?: string) {
  await emitEvent(ctx, 'tool.start', { tool: 'grep_search', input: { query, include_pattern: includePattern } })
  try {
    let command = `grep -r -n "${query.replace(/"/g, '\\"')}" .`
    if (includePattern) {
      command += ` --include="${includePattern}"`
    }
    command += ` | head -50`

    const { stdout } = await execAsync(command, {
      timeout: 10000,
      maxBuffer: 1024 * 1024,
      cwd: process.cwd()
    })

    const lines = stdout.trim().split('\n').filter(line => line.trim())
    const matches = lines.map(line => {
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

/**
 * Execute a job with CopilotAPI Bridge
 */
async function executeWithCopilotApi(ctx: JobContext): Promise<void> {
  const message = ctx.input.message ?? ctx.input.instruction ?? 'Hello'
  const model = ctx.input.model || 'auto'

  const tools = [
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
  ]

  const messages: ChatMessage[] = [
    {
      role: 'system',
      content:
        'You are a coding assistant. Use the available tools to read/write files, list files, and run terminal commands before answering.'
    },
    { role: 'user', content: message }
  ]

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
          messages: [{ role: 'user', content: message }],
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
 * Main job executor
 */
export async function executeJob(
  store: JobStore,
  jobId: string,
  subscribers: Set<FastifyReply>,
  input: JobInput,
  onComplete: (status: JobStatus) => void
): Promise<void> {
  const bridge = createBridgeClientFromEnv()

  const ctx: JobContext = {
    jobId,
    store,
    subscribers,
    bridge,
    input,
    aborted: false
  }

  try {
    // Emit job started
    await store.updateJobStatus(jobId, 'running', nowIso())
    await emitEvent(ctx, 'job.started', { input })

    // Execute based on provider
    // When the provider is "copilotapi" we should call the Copilot API directly
    // rather than using the internal CoderAgent. The CoderAgent is designed
    // for autonomous coding tasks and exposes internal reasoning and tool calls,
    // which leads to chat responses that are not conversational. By using
    // executeWithCopilotApi, we relay the user message to the configured AI API
    // (see `AI_API_URL` and `AI_API_KEY` in environment) and stream back
    // natural language answers. For other providers we fall back to the bridge
    // client if available, otherwise use the simulated executor.
    if (input.provider === 'copilotapi') {
      console.log(`[Runner] Using Copilot API for job ${jobId}`);
      await executeWithCopilotApi(ctx);
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
    }
  } catch (err) {
    // Error occurred
    await store.updateJobStatus(jobId, 'error', undefined, nowIso())
    await emitEvent(ctx, 'error', { message: err instanceof Error ? err.message : String(err) })
    await emitEvent(ctx, 'done', { status: 'error' })
    onComplete('error')
  }
}

/**
 * Cancel a running job
 */
export function cancelJob(ctx: JobContext): void {
  ctx.aborted = true
}
