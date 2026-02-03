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
      return 'bg-green-500/15 text-green-400'
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

export default function RunCard({ jobId }: { jobId: string }) {
  const run = useStore((s) => s.runs[jobId])
  const setRunCollapsed = useStore((s) => s.setRunCollapsed)
  const isCollapsed = useStore((s) => s.runUi[jobId]?.collapsed ?? false)

  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const i = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(i)
  }, [])

  const elapsedMs = useMemo(() => {
    if (!run?.startedAt) return 0
    const end = run.finishedAt ?? now
    return Math.max(0, end - run.startedAt)
  }, [run?.startedAt, run?.finishedAt, now])

  if (!run) return null

  return (
    <div className="rounded-xl border border-primary/15 bg-primaryAccent p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <div
              className={`rounded-md px-2 py-1 text-[11px] uppercase ${statusClass(run.status)}`}
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
        </div>

        <div className="flex items-center gap-2">
          {run.status === 'running' && (
            <Button
              type="button"
              size="sm"
              variant="outline"
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

      {!isCollapsed && (
        <div className="mt-3 space-y-2">
          {run.events.length === 0 ? (
            <div className="text-xs text-muted">No events yet.</div>
          ) : (
            <div className="space-y-2">
              {run.events.map((e: RunEvent) => (
                <div
                  key={e.key}
                  className="rounded-lg border border-primary/10 bg-accent p-2"
                >
                  <div className="flex items-center justify-between">
                    <div className="text-xs font-medium text-primary">
                      {e.type}
                    </div>
                    <div className="text-[11px] text-muted">
                      {new Date(e.ts).toLocaleTimeString()}
                    </div>
                  </div>
                  {e.payload != null && (
                    <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-words text-[11px] text-secondary">
                      {typeof e.payload === 'string'
                        ? e.payload
                        : JSON.stringify(e.payload, null, 2)}
                    </pre>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
