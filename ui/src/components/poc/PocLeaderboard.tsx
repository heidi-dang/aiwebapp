'use client'

import { useMemo } from 'react'
import { useStore } from '@/store'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function getRunXpFromRun(run: unknown) {
  if (!isRecord(run)) return 0
  const events = run['events']
  if (!Array.isArray(events)) return 0
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i]
    if (!isRecord(e)) continue
    if (e['type'] !== 'tool.end') continue
    const payload = e['payload']
    if (!isRecord(payload)) continue
    if (payload['tool'] !== 'poc_review') continue
    const weightPassed = payload['weight_passed']
    if (typeof weightPassed === 'number' && Number.isFinite(weightPassed)) {
      return Math.max(0, Math.floor(weightPassed))
    }
  }
  return 0
}

export function PocLeaderboard() {
  const { pocReviewHistory, runs } = useStore()

  const { topRuns, topTemplates } = useMemo(() => {
    const byTemplate = new Map<string, number>()
    for (const h of pocReviewHistory) {
      const name = h.templateName || 'PoC Review'
      byTemplate.set(name, (byTemplate.get(name) ?? 0) + 1)
    }
    const topTemplates = Array.from(byTemplate.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5)

    const topRuns = pocReviewHistory
      .map((h) => {
        const run = runs[h.jobId]
        const xp = getRunXpFromRun(run as unknown)
        return {
          jobId: h.jobId,
          templateName: h.templateName || 'PoC Review',
          createdAt: h.createdAt,
          xp
        }
      })
      .sort((a, b) => b.xp - a.xp)
      .slice(0, 5)

    return { topRuns, topTemplates }
  }, [pocReviewHistory, runs])

  return (
    <div className="rounded-xl border border-primary/15 bg-background/60 p-3">
      <div className="text-xs font-medium uppercase text-primary">Leaderboard</div>
      <div className="mt-3 grid grid-cols-1 gap-3">
        <div>
          <div className="text-[11px] font-medium uppercase text-secondary/80">Top Runs</div>
          <div className="mt-2 space-y-2">
            {topRuns.length === 0 && (
              <div className="text-xs text-muted">No runs yet</div>
            )}
            {topRuns.map((r) => (
              <div key={r.jobId} className="rounded-xl border border-primary/10 bg-primaryAccent p-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-xs font-medium uppercase text-primary">{r.templateName}</div>
                  <div className="text-xs text-secondary">+{r.xp} XP</div>
                </div>
                <div className="mt-1 break-words font-mono text-[11px] text-secondary/70">
                  {r.jobId}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div>
          <div className="text-[11px] font-medium uppercase text-secondary/80">Top Templates</div>
          <div className="mt-2 space-y-2">
            {topTemplates.length === 0 && (
              <div className="text-xs text-muted">No templates used yet</div>
            )}
            {topTemplates.map((t) => (
              <div key={t.name} className="flex items-center justify-between rounded-xl border border-primary/10 bg-primaryAccent p-2">
                <div className="text-xs font-medium uppercase text-primary">{t.name}</div>
                <div className="text-xs text-secondary">{t.count}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

