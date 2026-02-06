'use client'

import { useEffect, useMemo, useState } from 'react'
import { useStore } from '@/store'
import { cancelJob } from '@/lib/runner/client'
import Icon from '@/components/ui/icon'
import { Button } from '@/components/ui/button'
import type { RunState, RunnerEvent } from '@/lib/runner/types'

function shortId(id: string) {
  return id.length <= 6 ? id : id.slice(-6)
}

function statusClass(status: RunState['status']) {
  switch (status) {
    case 'running':
      return 'bg-blue-500/15 text-blue-400'
    case 'done':
      return 'bg-green-500/15 text-green-400'
    case 'pending':
      return 'bg-muted/20 text-muted'
    case 'cancelled':
      return 'bg-yellow-500/15 text-yellow-400'
    case 'timeout':
      return 'bg-yellow-500/15 text-yellow-400'
    case 'error':
      return 'bg-red-500/15 text-red-400'
    default:
      return 'bg-muted/20 text-muted'
  }
}

// Convert internal tool/step identifiers into human-friendly labels.
function formatToolLabel(name: string) {
  const map: Record<string, string> = {
    planning: 'Planning',
    code_generation: 'Code generation',
    code_execution: 'Code execution',
    review: 'Review',
    iterate: 'Iterate',
    finish: 'Finish'
  }

  if (map[name]) return map[name]

  // Fallback: replace underscores with spaces and title-case words
  return name
    .replace(/_/g, ' ')
    .replace(/\w\S*/g, (w) => w.charAt(0).toUpperCase() + w.slice(1))
}

interface ToolState {
  name: string
  status: 'running' | 'done' | 'error'
  outputs: string[]
  refusedCommand?: string
  refusedReason?: string
}

function ToolTimeline({
  tools,
  onApprove
}: {
  tools: Map<string, ToolState>
  onApprove?: (command: string) => Promise<void>
}) {
  return (
    <div className="space-y-2">
      {Array.from(tools.entries()).map(([name, tool]) => (
        <div
          key={name}
          className="rounded-lg border border-primary/10 bg-accent/50 p-3"
        >
          <div className="flex items-center gap-2">
            {tool.status === 'running' && (
              <div className="h-2 w-2 animate-pulse rounded-full bg-blue-400" />
            )}
            {tool.status === 'done' && (
              <Icon type="check" size="xs" className="text-green-400" />
            )}
            {tool.status === 'error' && (
              <Icon type="x" size="xs" className="text-red-400" />
            )}
            <span className="font-mono text-xs font-medium text-primary">
              {formatToolLabel(name)}
            </span>
          </div>

          {tool.outputs.length > 0 && (
            <div className="mt-2 max-h-32 overflow-y-auto rounded bg-background/50 p-2">
              {tool.outputs.map((output, i) => (
                <div key={i} className="text-[11px] text-secondary">
                  {output}
                </div>
              ))}
            </div>
          )}

          {tool.refusedCommand && (
            <div
              data-testid="run-tool-refusal"
              className="mt-2 rounded-md border border-red-500/20 bg-red-500/5 p-3"
            >
              <div className="text-xs text-red-300">Refused to run:</div>
              <div className="mt-1 font-mono text-sm">
                {tool.refusedCommand}
              </div>
              {tool.refusedReason && (
                <div className="mt-1 text-[11px] text-red-300">
                  {tool.refusedReason}
                </div>
              )}
              <div className="mt-3 flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    navigator.clipboard?.writeText(tool.refusedCommand ?? '')
                  }
                >
                  Copy Command
                </Button>
                <Button
                  size="sm"
                  onClick={async () => {
                    if (!tool.refusedCommand || !onApprove) return
                    await onApprove(tool.refusedCommand)
                  }}
                  data-testid="run-allow-button"
                >
                  Allow & run
                </Button>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3">
      <div className="flex items-center gap-2">
        <Icon type="warning" size="xs" className="text-red-400" />
        <span className="text-xs font-medium text-red-400">Error</span>
      </div>
      <div className="mt-1 text-xs text-red-300">{message}</div>
    </div>
  )
}

export default function RunCard({ jobId }: { jobId: string }) {
  const run = useStore((s) => s.runs[jobId])
  const setRunCollapsed = useStore((s) => s.setRunCollapsed)
  const isCollapsed = useStore((s) => s.runUi[jobId]?.collapsed ?? false)

  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (run?.status === 'running') {
      const i = setInterval(() => setNow(Date.now()), 250)
      return () => clearInterval(i)
    }
  }, [run?.status])

  const elapsedMs = useMemo(() => {
    if (!run?.startedAt) return 0
    const end = run.finishedAt ?? now
    return Math.max(0, end - run.startedAt)
  }, [run?.startedAt, run?.finishedAt, now])

  // Derive structured view from events
  const { tools, errorMessage, planUpdateMessage } = useMemo(() => {
    const tools = new Map<string, ToolState>()
    let errorMessage: string | null = null
    let planUpdateMessage: string | null = null

    if (!run) return { tools, errorMessage, planUpdateMessage }

    for (const evt of run.events) {
      const payload = evt.payload as Record<string, unknown> | undefined

      if (evt.type === 'plan.update' && payload?.message) {
        planUpdateMessage = payload.message as string
      }

      if (evt.type === 'tool.start' && payload?.tool) {
        const toolName = payload.tool as string
        tools.set(toolName, { name: toolName, status: 'running', outputs: [] })
      }

      if (evt.type === 'tool.output' && payload?.tool) {
        const toolName = payload.tool as string
        const output = payload.output as string | undefined
        const existing = tools.get(toolName)
        if (existing && output) {
          existing.outputs.push(output)
        }
      }

      if (evt.type === 'tool.end' && payload?.tool) {
        const toolName = payload.tool as string
        const success = payload.success as boolean
        const existing = tools.get(toolName)
        if (existing) {
          existing.status = success ? 'done' : 'error'
        }
      }

      // New: structured refusal events include the attempted command and reason
      if (evt.type === 'tool.refused' && payload?.tool) {
        const toolName = payload.tool as string
        const cmd = (payload.command as string) || ''
        const reason = (payload.reason as string) || ''
        const existing = tools.get(toolName)
        if (existing) {
          existing.refusedCommand = cmd
          existing.refusedReason = reason
        } else {
          tools.set(toolName, {
            name: toolName,
            status: 'error',
            outputs: [],
            refusedCommand: cmd,
            refusedReason: reason
          })
        }
      }

      if (evt.type === 'error' && payload?.message) {
        errorMessage = payload.message as string
      }
    }

    return { tools, errorMessage, planUpdateMessage }
  }, [run])

  // Approve-and-run flow: call server to add command to allowlist and execute it, then inject synthetic events
  async function handleApproveAndRun(command: string) {
    try {
      // Approve command (persist to allowlist)
      await fetch('/api/toolbox', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tool: 'approve_command', params: { command } })
      })

      // Execute the command now
      const runRes = await fetch('/api/toolbox', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tool: 'run_command', params: { command } })
      })
      const runJson = await runRes.json()
      const output =
        (runJson?.result?.stdout as string) ?? runJson?.error ?? '(no output)'

      // Inject events into store so the UI reflects execution result immediately
      const ev1: RunnerEvent = {
        id: `ui-synth-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        type: 'tool.output',
        ts: new Date().toISOString(),
        job_id: run.jobId,
        data: { tool: 'run_command', output }
      }
      const ev2: RunnerEvent = {
        id: `ui-synth-end-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        type: 'tool.end',
        ts: new Date().toISOString(),
        job_id: run.jobId,
        data: { tool: 'run_command', success: true }
      }

      useStore.getState().applyRunnerEvent(ev1)
      useStore.getState().applyRunnerEvent(ev2)
    } catch (err) {
      console.warn('approve and run failed', err)
    }
  }

  if (!run) return null

  return (
    <div className="rounded-xl border border-primary/15 bg-primaryAccent p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            {run.status === 'running' && (
              <div className="h-3 w-3 animate-spin rounded-full border-2 border-blue-400 border-t-transparent" />
            )}
            <div
              className={`rounded-md px-2 py-1 text-[11px] font-medium uppercase ${statusClass(run.status)}`}
            >
              {run.status}
            </div>
            <div className="text-xs text-muted">job {shortId(run.jobId)}</div>
            {run.startedAt && (
              <div className="text-xs text-muted">
                {(elapsedMs / 1000).toFixed(1)}s
              </div>
            )}
          </div>
          {planUpdateMessage && (
            <div className="text-xs text-secondary">{planUpdateMessage}</div>
          )}
        </div>

        <div className="flex items-center gap-2">
          {run.status === 'running' && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              aria-label={`Cancel job ${shortId(run.jobId)}`}
              title={`Cancel job ${shortId(run.jobId)}`}
              onClick={async () => {
                await cancelJob(run.jobId)
              }}
            >
              Cancel
            </Button>
          )}

          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-8 w-8 rounded-lg"
            onClick={() => setRunCollapsed(run.jobId, !isCollapsed)}
          >
            <Icon
              type={isCollapsed ? 'chevron-down' : 'chevron-up'}
              size="xs"
            />
          </Button>
        </div>
      </div>

      {/* Plan and replay/pause/resume UI removed per contract (no static PLAN, no replay/pause/resume controls) */}

      {!isCollapsed && (
        <div className="mt-4 space-y-3">
          {errorMessage && <ErrorBanner message={errorMessage} />}

          {tools.size > 0 && (
            <div aria-live="polite">
              <ToolTimeline tools={tools} onApprove={handleApproveAndRun} />
            </div>
          )}

          {run.events.length === 0 && run.status === 'running' && (
            <div
              data-testid="run-thinking"
              role="button"
              onClick={() => setRunCollapsed(run.jobId, false)}
              className="cursor-pointer rounded-lg border border-primary/10 bg-background/50 p-3"
            >
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 animate-pulse rounded-full bg-blue-400" />
                <span className="text-xs text-muted">Thinking...</span>
              </div>
              <div className="mt-2 text-[11px] text-secondary">
                Agent is planning steps. Click to view workflow.
              </div>
            </div>
          )}

          {run.events.length === 0 && run.status !== 'running' && (
            <div className="text-xs text-muted">Waiting for events...</div>
          )}
        </div>
      )}
    </div>
  )
}
