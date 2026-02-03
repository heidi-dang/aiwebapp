'use client'

import { useEffect, useMemo, useState } from 'react'
import { useStore } from '@/store'
import { cancelJob } from '@/lib/runner/client'
import Icon from '@/components/ui/icon'
import { Button } from '@/components/ui/button'
import type { RunEvent, RunState } from '@/lib/runner/types'

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

interface PlanStep {
  tool: string
  description: string
}

interface ToolState {
  name: string
  status: 'running' | 'done' | 'error'
  outputs: string[]
}

function PlanSection({ steps }: { steps: PlanStep[] }) {
  return (
    <div className="rounded-lg border border-primary/10 bg-accent/50 p-3">
      <div className="mb-2 text-xs font-medium uppercase text-muted">Plan</div>
      <div className="space-y-1">
        {steps.map((step, i) => (
          <div key={`${step.tool}-${i}`} className="flex items-center gap-2 text-xs">
            <span className="font-mono text-primary/60">{i + 1}.</span>
            <span className="font-medium text-primary">{step.tool}</span>
            <span className="text-secondary">{step.description}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function ToolTimeline({ tools }: { tools: Map<string, ToolState> }) {
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
              {name}
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
  const { planSteps, tools, errorMessage, planUpdateMessage } = useMemo(() => {
    let planSteps: PlanStep[] = []
    const tools = new Map<string, ToolState>()
    let errorMessage: string | null = null
    let planUpdateMessage: string | null = null

    if (!run) return { planSteps, tools, errorMessage, planUpdateMessage }

    for (const evt of run.events) {
      const payload = evt.payload as Record<string, unknown> | undefined

      if (evt.type === 'plan' && payload?.steps) {
        planSteps = payload.steps as PlanStep[]
      }

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

      if (evt.type === 'error' && payload?.message) {
        errorMessage = payload.message as string
      }
    }

    return { planSteps, tools, errorMessage, planUpdateMessage }
  }, [run])

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

      <div className="flex items-center gap-2">
        <button onClick={handleReplay} aria-label="Replay Run">Replay</button>
        <button onClick={handlePause} aria-label="Pause Run">Pause</button>
        <button onClick={handleResume} aria-label="Resume Run">Resume</button>
      </div>

      {!isCollapsed && (
        <div className="mt-4 space-y-3">
          {errorMessage && <ErrorBanner message={errorMessage} />}

          {planSteps.length > 0 && <PlanSection steps={planSteps} />}

          {tools.size > 0 && (
            <div aria-live="polite">
              <ToolTimeline tools={tools} />
            </div>
          )}

          {run.events.length === 0 && (
            <div className="text-xs text-muted">Waiting for events...</div>
          )}
        </div>
      )}
    </div>
  )
}

function handleReplay() {
  // Logic to replay the run
  console.log('Replay button clicked');
}

function handlePause() {
  // Logic to pause the run
  console.log('Pause button clicked');
}

function handleResume() {
  // Logic to resume the run
  console.log('Resume button clicked');
}
