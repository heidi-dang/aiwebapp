'use client'

import { useEffect, useState } from 'react'
import { useStore } from '@/store'
import { cancelJob, approveJob } from '@/lib/runner/client'
import Icon from '@/components/ui/icon'
import { Button } from '@/components/ui/button'
import type { RunState } from '@/lib/runner/types'
import ToolLogs, { ToolExecution } from './ToolLogs'

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

type PocClaim = {
  id?: string
  hash?: string
  statement?: string
  command?: string
  ok?: boolean
  exitCode?: number
  dependencies?: string[]
  weight?: number
}

type PocEvidence = {
  stdout?: string
  stderr?: string
  stdout_hash?: string
  stderr_hash?: string
}

type PocClaimEvent = {
  claim: PocClaim
  evidence: PocEvidence
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function getPocClaimFromPayload(payload: unknown): PocClaim | null {
  if (!isRecord(payload)) return null
  if (payload['tool'] !== 'poc_review') return null
  const claim = payload['claim']
  if (!isRecord(claim)) return null

  const dependencies = claim['dependencies']
  return {
    id: typeof claim['id'] === 'string' ? claim['id'] : undefined,
    hash: typeof claim['hash'] === 'string' ? claim['hash'] : undefined,
    statement: typeof claim['statement'] === 'string' ? claim['statement'] : undefined,
    command: typeof claim['command'] === 'string' ? claim['command'] : undefined,
    ok: typeof claim['ok'] === 'boolean' ? claim['ok'] : undefined,
    exitCode: typeof claim['exitCode'] === 'number' ? claim['exitCode'] : undefined,
    weight: typeof claim['weight'] === 'number' ? claim['weight'] : undefined,
    dependencies: Array.isArray(dependencies) ? dependencies.filter((d) => typeof d === 'string') : undefined
  }
}

function getPocClaimEventFromPayload(payload: unknown): PocClaimEvent | null {
  if (!isRecord(payload)) return null
  if (payload['tool'] !== 'poc_review') return null
  const claim = getPocClaimFromPayload(payload)
  if (!claim) return null
  const evidenceRaw = payload['evidence']
  const evidence: PocEvidence = {}
  if (isRecord(evidenceRaw)) {
    if (typeof evidenceRaw['stdout'] === 'string') evidence.stdout = evidenceRaw['stdout']
    if (typeof evidenceRaw['stderr'] === 'string') evidence.stderr = evidenceRaw['stderr']
    if (typeof evidenceRaw['stdout_hash'] === 'string') evidence.stdout_hash = evidenceRaw['stdout_hash']
    if (typeof evidenceRaw['stderr_hash'] === 'string') evidence.stderr_hash = evidenceRaw['stderr_hash']
  }
  return { claim, evidence }
}

interface ApprovalState {
  tokenId: string
  description: string
  type: string
}

export default function RunCard({ jobId }: { jobId: string }) {
  const { runs, runUi, setRunCollapsed } = useStore()
  const run = runs[jobId]

  const [toolExecutions, setToolExecutions] = useState<ToolExecution[]>([])
  const [planSteps, setPlanSteps] = useState<Array<{ tool: string; description: string }>>([])
  const [planMessage, setPlanMessage] = useState<string>('')
  const [pendingApproval, setPendingApproval] = useState<ApprovalState | null>(null)
  const [approving, setApproving] = useState(false)
  const [expandedClaimId, setExpandedClaimId] = useState<string | null>(null)

  useEffect(() => {
    if (!run) return
    const newToolExecutions: ToolExecution[] = []
    const activeTools = new Map<string, number>() // name -> index
    const newPlanSteps: Array<{ tool: string; description: string }> = []
    let newPlanMessage = ''
    let currentApproval: ApprovalState | null = null

    if (run.events && Array.isArray(run.events)) {
        run.events.forEach((evt) => {
          if (!evt) return;
          const { type, payload, ts } = evt
          
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
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const args = (payload as any).input || (payload as any).args
        
        const tool: ToolExecution = {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          id: (payload as any).id || `${name}-${ts}-${newToolExecutions.length}`,
          name,
          status: 'running',
          args,
          timestamp: ts,
          output: ''
        }
        
        const idx = newToolExecutions.push(tool) - 1
        activeTools.set(name, idx)
      }

      if (type === 'tool.output' && isRecord(payload) && typeof payload['tool'] === 'string') {
        const name = payload['tool']
        const idx = activeTools.get(name)
        if (idx !== undefined) {
          const output =
            typeof payload['output'] === 'string'
              ? payload['output']
              : payload['claim']
                ? JSON.stringify(payload['claim'])
                : ''
          newToolExecutions[idx].output = (newToolExecutions[idx].output || '') + (output || '')
        }
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (type === 'tool.end' && payload && typeof payload === 'object' && payload !== null && 'tool' in payload && typeof (payload as any).tool === 'string') {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const name = (payload as any).tool
        const idx = activeTools.get(name)
        if (idx !== undefined) {
          const tool = newToolExecutions[idx]
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          tool.status = (payload as any).success ? 'success' : 'failure'
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          if ((payload as any).error) {
             // eslint-disable-next-line @typescript-eslint/no-explicit-any
             tool.output = (tool.output || '') + '\nError: ' + (payload as any).error
          }
          tool.duration = ts - tool.timestamp
          activeTools.delete(name)
        }
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (type === 'tool.refused' && payload && typeof payload === 'object' && payload !== null && 'tool' in payload && typeof (payload as any).tool === 'string') {
         // Treated as a tool failure that starts and fails immediately if not already started
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const name = (payload as any).tool
        let idx = activeTools.get(name)
        
        if (idx === undefined) {
             const tool: ToolExecution = {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                id: `${name}-${ts}-${newToolExecutions.length}`,
                name,
                status: 'failure',
                timestamp: ts,
                output: ''
             }
             idx = newToolExecutions.push(tool) - 1
        }
        
        const tool = newToolExecutions[idx]
        tool.status = 'failure'
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        tool.output = (tool.output || '') + '\nRefused: ' + ((payload as any).reason || 'Unknown reason')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if ((payload as any).command) {
             // eslint-disable-next-line @typescript-eslint/no-explicit-any
             tool.output += `\nCommand: ${(payload as any).command}`
        }
        activeTools.delete(name)
      }

      // Handle approvals
      if (type === 'approval.request' && payload) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const p = payload as any
        currentApproval = {
          tokenId: p.tokenId,
          description: p.description,
          type: p.type
        }
      }
      if (type === 'approval.response' && payload) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const p = payload as any
        if (currentApproval?.tokenId === p.tokenId) {
          currentApproval = null
        }
      }
    })
    } // End check for run.events

    setToolExecutions(newToolExecutions)
    setPlanSteps(newPlanSteps)
    setPlanMessage(newPlanMessage)
    setPendingApproval(currentApproval)
  }, [run])

  const handleApprove = async (approved: boolean) => {
    if (!pendingApproval) return
    setApproving(true)
    try {
      await approveJob(jobId, pendingApproval.tokenId, approved)
    } catch (err) {
      console.error('Approval failed:', err)
    } finally {
      setApproving(false)
    }
  }

  if (!run) {
    return (
      <div className="text-xs text-muted">Run not found</div>
    )
  }

  const bg = statusClass(run.status)
  const pocClaimEvents = run.events
    .filter((e) => e.type === 'tool.output')
    .map((e) => getPocClaimEventFromPayload(e.payload))
    .filter((c): c is PocClaimEvent => !!c)
  const pocClaims = pocClaimEvents.map((c) => c.claim)

  return (
    <div className="w-full" data-testid="run-thinking">
      <div data-testid="run-tool-refusal">
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
          {pocClaims.length > 0 && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                const lines = [
                  `# PoC Review Report`,
                  ``,
                  `Job: ${run.jobId}`,
                  `Status: ${run.status}`,
                  ``,
                  `## Claims`,
                  ...pocClaims.map((c) => {
                    const deps = Array.isArray(c.dependencies) ? c.dependencies.join(', ') : ''
                    const weight = typeof c.weight === 'number' ? c.weight : 1
                    const ok = !!c.ok
                    const statement = typeof c.statement === 'string' ? c.statement : ''
                    const cmd = typeof c.command === 'string' ? c.command : ''
                    const hash = typeof c.hash === 'string' ? c.hash : ''
                    return `- ${ok ? '✅' : '❌'} ${c.id ?? ''} (w=${weight}) deps=[${deps}]\n  - ${statement}\n  - \`${cmd}\`\n  - hash: ${hash}`
                  })
                ]
                const blob = new Blob([lines.join('\n') + '\n'], { type: 'text/markdown' })
                const url = URL.createObjectURL(blob)
                const a = document.createElement('a')
                a.href = url
                a.download = `poc-review-${run.jobId}.md`
                document.body.appendChild(a)
                a.click()
                a.remove()
                URL.revokeObjectURL(url)
              }}
            >
              Export PoC Report
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
          {run.events.length === 0 && run.status !== 'running' && (
            <div className="text-xs text-muted">Waiting for events...</div>
          )}

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

          {pocClaimEvents.length > 0 && (
            <div className="rounded-lg border border-primary/10 bg-accent/30 p-3">
              <div className="text-xs font-medium uppercase text-primary">PoC Claims</div>
              <div className="mt-2 space-y-2">
                {pocClaimEvents.map(({ claim, evidence }, idx) => {
                  const id = claim.id || `claim_${idx + 1}`
                  const ok = !!claim.ok
                  const weight = typeof claim.weight === 'number' ? claim.weight : 1
                  const deps = Array.isArray(claim.dependencies) ? claim.dependencies.join(', ') : ''
                  const isOpen = expandedClaimId === id
                  return (
                    <div key={id} className="rounded-lg border border-primary/10 bg-accent/40 p-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="text-xs font-medium text-primary">
                            {ok ? '✅' : '❌'} {id} <span className="text-primary/70">w={weight}</span>
                          </div>
                          {claim.hash && (
                            <div className="mt-1 break-words font-mono text-[11px] text-secondary/80">
                              hash: {claim.hash}
                            </div>
                          )}
                          {claim.statement && (
                            <div className="mt-1 break-words text-xs text-secondary">
                              {claim.statement}
                            </div>
                          )}
                          {claim.command && (
                            <div className="mt-1 break-words text-[11px] text-secondary/80">
                              {claim.command}
                            </div>
                          )}
                          {deps && (
                            <div className="mt-1 text-[11px] text-secondary/70">
                              deps: {deps}
                            </div>
                          )}
                        </div>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setExpandedClaimId(isOpen ? null : id)}
                        >
                          {isOpen ? 'Hide' : 'Evidence'}
                        </Button>
                      </div>
                      {isOpen && (
                        <div className="mt-2 space-y-2">
                          {(evidence.stdout_hash || evidence.stderr_hash) && (
                            <div className="rounded-md border border-primary/10 bg-primaryAccent p-2 text-[11px] text-secondary/80">
                              {evidence.stdout_hash && (
                                <div className="break-words">stdout_hash: {evidence.stdout_hash}</div>
                              )}
                              {evidence.stderr_hash && (
                                <div className="break-words">stderr_hash: {evidence.stderr_hash}</div>
                              )}
                            </div>
                          )}
                          {evidence.stdout && (
                            <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-md border border-primary/10 bg-primaryAccent p-2 text-[11px] text-primary/90">
                              {evidence.stdout}
                            </pre>
                          )}
                          {evidence.stderr && (
                            <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-md border border-primary/10 bg-primaryAccent p-2 text-[11px] text-red-300/90">
                              {evidence.stderr}
                            </pre>
                          )}
                          {!evidence.stdout && !evidence.stderr && (
                            <div className="text-xs text-muted">No evidence captured</div>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {toolExecutions.length > 0 && (
            <div className="rounded-lg border border-primary/10 bg-accent/30 p-3">
              <div className="text-xs font-medium uppercase text-primary">Tools</div>
              <div className="mt-2">
                <ToolLogs tools={toolExecutions} />
              </div>
            </div>
          )}

          {pendingApproval && (
            <div className="rounded-lg border border-yellow-500/20 bg-yellow-500/10 p-3" data-testid="approval-card">
              <div className="flex items-center gap-2 text-yellow-400">
                <Icon type="warning" size="xs" />
                <span className="text-xs font-medium uppercase">Approval Required</span>
              </div>
              <div className="mt-2 text-xs text-yellow-200">
                {pendingApproval.description}
              </div>
              <div className="mt-3 flex gap-2">
                <Button
                  size="sm"
                  variant="default"
                  className="bg-yellow-600 hover:bg-yellow-500 text-white"
                  onClick={() => handleApprove(true)}
                  disabled={approving}
                >
                  {approving ? 'Approving...' : 'Approve'}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="border-yellow-500/30 text-yellow-400 hover:bg-yellow-500/10"
                  onClick={() => handleApprove(false)}
                  disabled={approving}
                >
                  Reject
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
    </div>
  )
}
