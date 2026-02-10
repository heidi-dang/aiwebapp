'use client'

import { useMemo, useState } from 'react'
import { useStore } from '@/store'
import { PocReview } from '@/components/chat/Sidebar/PocReview'
import RunCard from '@/components/chat/ChatArea/Messages/RunCard'
import { PocGameHud } from '@/components/poc/PocGameHud'
import { PocRunTimeline } from '@/components/poc/PocRunTimeline'
import { PocBadgeToasts } from '@/components/poc/PocBadgeToasts'
import { PocLeaderboard } from '@/components/poc/PocLeaderboard'

function formatTs(tsSeconds: number) {
  const d = new Date(tsSeconds * 1000)
  return d.toLocaleString()
}

export function PocReviewDashboard() {
  const { pocReviewHistory, runs } = useStore()
  const [selectedJobId, setSelectedJobId] = useState<string | null>(
    pocReviewHistory[0]?.jobId ?? null
  )

  const history = useMemo(() => {
    return [...pocReviewHistory].sort((a, b) => b.createdAt - a.createdAt)
  }, [pocReviewHistory])

  return (
    <div className="flex h-full w-full flex-col gap-4 p-4 font-dmmono">
      <PocBadgeToasts />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="rounded-xl border border-primary/15 bg-background/60 p-3 lg:col-span-2">
          <div className="text-xs font-medium uppercase text-primary">PoC Review</div>
          <div className="mt-1 text-sm text-secondary">
            Templates · Runs · Shareable Artifacts
          </div>
        </div>
        <PocGameHud />
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="min-h-0 rounded-xl border border-primary/15 bg-background/60 p-3">
          <PocReview emitChatMessage={false} />
        </div>

        <div className="min-h-0 space-y-4">
          <div className="min-h-0 rounded-xl border border-primary/15 bg-background/60 p-3">
            <div className="text-xs font-medium uppercase text-primary">History</div>
            <div className="mt-3 max-h-[36vh] space-y-2 overflow-auto">
              {history.length === 0 && (
                <div className="text-xs text-muted">No PoC runs yet</div>
              )}
              {history.map((h) => {
                const run = runs[h.jobId]
                const isSelected = selectedJobId === h.jobId
                return (
                  <button
                    key={h.jobId}
                    type="button"
                    onClick={() => setSelectedJobId(h.jobId)}
                    className={`w-full rounded-xl border p-3 text-left ${
                      isSelected
                        ? 'border-primary/40 bg-accent'
                        : 'border-primary/15 bg-primaryAccent'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-xs font-medium uppercase text-primary">
                        {h.templateName || 'PoC Review'}
                      </div>
                      <div className="text-[11px] text-secondary">
                        {run ? run.status : 'pending'}
                      </div>
                    </div>
                    <div className="mt-1 text-[11px] text-secondary/80">
                      {formatTs(h.createdAt)}
                    </div>
                    <div className="mt-1 break-words font-mono text-[11px] text-secondary/70">
                      {h.jobId}
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
          <PocLeaderboard />
        </div>

        <div className="min-h-0 rounded-xl border border-primary/15 bg-background/60 p-3">
          <div className="text-xs font-medium uppercase text-primary">Run</div>
          <div className="mt-3">
            {selectedJobId ? (
              <div className="space-y-3">
                <PocRunTimeline jobId={selectedJobId} />
                <RunCard jobId={selectedJobId} />
              </div>
            ) : (
              <div className="text-xs text-muted">Select a run to view</div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
