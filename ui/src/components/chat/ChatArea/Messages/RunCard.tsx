'use client'

import { useEffect, useState } from 'react'
import { useStore } from '@/store'
import { cancelJob } from '@/lib/runner/client'
import Icon from '@/components/ui/icon'
import { Button } from '@/components/ui/button'
import type { RunState } from '@/lib/runner/types'

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
            <div className="mt-2 rounded bg-yellow-500/10 p-2 text-[11px] text-yellow-300">
              <div className="font-medium">Command refused</div>
              <div className="mt-1 text-yellow-200">{tool.refusedCommand}</div>
              {tool.refusedReason && (
                <div className="mt-1 text-yellow-300">{tool.refusedReason}</div>
              )}
              {onApprove && (
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-2"
                  onClick={() => onApprove(tool.refusedCommand!)}
                >
                  Approve &amp; Run
                </Button>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

export default function RunCard({ jobId }: { jobId: string }) {
  const { runs, runUi, setRunCollapsed } = useStore()
  const run = runs[jobId]

  const [tools, setTools] = useState<Map<string, ToolState>>(new Map())
  const [planSteps, setPlanSteps] = useState<Array<{ tool: string; description: string }>>([])
  const [planMessage, setPlanMessage] = useState<string>('')

  useEffect(() => {
    if (!run) return
    const newTools = new Map<string, ToolState>()
    const newPlanSteps: Array<{ tool: string; description: string }> = []
    let newPlanMessage = ''

    run.events.forEach((evt) => {
      const { type, payload } = evt
      if (type === 'plan' && payload && typeof payload === 'object' && payload !== null && 'steps' in payload && Array.isArray((payload as { steps: unknown }).steps)) {
        (payload as { steps: Array<{ tool: string; description: string }> }).steps.forEach((step) => {
          if (step.tool && step.description) {
            newPlanSteps.push({ tool: step.tool, description: step.description })
          }
        })
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if ((payload as any).message) newPlanMessage = (payload as any).message
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (type === 'tool.start' && payload && typeof payload === 'object' && payload !== null && 'tool' in payload && typeof (payload as any).tool === 'string') {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const name = (payload as any).tool
        newTools.set(name, {
          name,
          status: 'running',
          outputs: []
        })
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (type === 'tool.output' && payload && typeof payload === 'object' && payload !== null && 'tool' in payload && typeof (payload as any).tool === 'string') {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const name = (payload as any).tool
        const existing = newTools.get(name)
        if (existing) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          existing.outputs.push((payload as any).output || '')
        }
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (type === 'tool.end' && payload && typeof payload === 'object' && payload !== null && 'tool' in payload && typeof (payload as any).tool === 'string') {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const name = (payload as any).tool
        const existing = newTools.get(name)
        if (existing) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          existing.status = (payload as any).success ? 'done' : 'error'
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          if ((payload as any).error) existing.outputs.push((payload as any).error)
        }
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (type === 'tool.refused' && payload && typeof payload === 'object' && payload !== null && 'tool' in payload && typeof (payload as any).tool === 'string') {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const name = (payload as any).tool
        const existing = newTools.get(name) || { name, status: 'error' as const, outputs: [] }
        ;(existing as ToolState).status = 'error'
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ;(existing as ToolState).refusedCommand = (payload as any).command
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ;(existing as ToolState).refusedReason = (payload as any).reason
        newTools.set(name, existing)
      }
    })

    setTools(newTools)
    setPlanSteps(newPlanSteps)
    setPlanMessage(newPlanMessage)
  }, [run])

  if (!run) {
    return (
      <div className="text-xs text-muted">Run not found</div>
    )
  }

  const bg = statusClass(run.status)

  return (
    <div className="w-full">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className={`h-2 w-2 rounded-full ${bg}`} />
          <span className="text-xs font-medium uppercase text-muted">
            Run {shortId(run.jobId)} · {run.status}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {run.status === 'running' && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => cancelJob(run.jobId)}
            >
              Cancel
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            onClick={() =>
              setRunCollapsed(run.jobId, !runUi[run.jobId]?.collapsed)
            }
          >
            <Icon
              type="chevron-down"
              size="xs"
              className={`transition-transform ${runUi[run.jobId]?.collapsed ? 'rotate-180' : ''}`}
            />
          </Button>
        </div>
      </div>

      {!runUi[run.jobId]?.collapsed && (
        <div className="mt-3 space-y-3">
          {planMessage && (
            <div className="rounded-lg border border-primary/10 bg-accent/30 p-3">
              <div className="text-xs font-medium uppercase text-primary">Plan</div>
              <div className="mt-2 text-xs text-secondary">{planMessage}</div>
            </div>
          )}

          {planSteps.length > 0 && (
            <div className="rounded-lg border border-primary/10 bg-accent/30 p-3">
              <div className="text-xs font-medium uppercase text-primary">Steps</div>
              <ul className="mt-2 list-inside list-disc space-y-1 text-xs text-secondary">
                {planSteps.map((step, i) => (
                  <li key={i}>
                    <span className="font-medium text-primary">{step.tool}</span> · {step.description}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {tools.size > 0 && (
            <div className="rounded-lg border border-primary/10 bg-accent/30 p-3">
              <div className="text-xs font-medium uppercase text-primary">Tools</div>
              <div className="mt-2">
                <ToolTimeline tools={tools} />
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
