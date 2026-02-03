/**
 * Phase 3: Job executor with realistic tool simulation
 * 
 * Executes jobs by:
 * 1. Emitting a plan event
 * 2. Running tools (simulated or via bridge)
 * 3. Emitting progress events
 * 4. Completing with done event
 */
import type { RunnerEvent, RunnerEventType, JobStore, JobStatus } from './db.js'
import { BridgeClient, createBridgeClientFromEnv } from './bridge.js'
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

    // Execute based on bridge availability
    if (bridge) {
      console.log(`[Runner] Using bridge client for job ${jobId}`)
      try {
        await executeWithBridge(ctx)
      } catch (err) {
        console.log(`[Runner] Bridge failed for job ${jobId}, falling back to simulation:`, err)
        await executeSimulated(ctx)
      }
    } else {
      console.log(`[Runner] No bridge available for job ${jobId}, using simulation`)
      await executeSimulated(ctx)
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
