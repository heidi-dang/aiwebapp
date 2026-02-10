'use client'

import { useEffect, useMemo, useState } from 'react'
import { useStore } from '@/store'
import { ConfettiBurst } from './ConfettiBurst'
import { motion } from 'framer-motion'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function getEndSummary(events: Array<{ type: string; payload?: unknown }>) {
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i]
    if (e.type !== 'tool.end') continue
    if (!isRecord(e.payload)) continue
    if (e.payload.tool !== 'poc_review') continue
    const proofHash = typeof e.payload.proof_hash === 'string' ? e.payload.proof_hash : ''
    const failed = typeof e.payload.failed === 'number' ? e.payload.failed : undefined
    const weightPassed = typeof e.payload.weight_passed === 'number' ? e.payload.weight_passed : undefined
    const weightTotal = typeof e.payload.weight_total === 'number' ? e.payload.weight_total : undefined
    return { proofHash, failed, weightPassed, weightTotal }
  }
  return null
}

export function PocRunTimeline({ jobId }: { jobId: string }) {
  const run = useStore((s) => s.runs[jobId])
  const [confettiSeed, setConfettiSeed] = useState<string | null>(null)
  const [highlightClaimId, setHighlightClaimId] = useState<string | null>(null)
  const [lastCount, setLastCount] = useState(0)
  const [mode, setMode] = useState<'live' | 'replay'>('live')
  const [replayCount, setReplayCount] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [speed, setSpeed] = useState<1 | 2 | 4>(2)

  const { claims, summary } = useMemo(() => {
    const events = run?.events ?? []
    const claimPayloads = events
      .filter((e) => e.type === 'tool.output' && isRecord(e.payload) && e.payload.tool === 'poc_review')
      .map((e) => e.payload as Record<string, unknown>)

    const claimEvents = claimPayloads
      .map((p) => (isRecord(p.claim) ? p.claim : null))
      .filter((c): c is Record<string, unknown> => !!c)
      .map((c) => {
        const id = typeof c.id === 'string' ? c.id : 'C'
        const statement = typeof c.statement === 'string' ? c.statement : ''
        const ok = c.ok === true
        const weight = typeof c.weight === 'number' && Number.isFinite(c.weight) ? c.weight : 1
        return { id, statement, ok, weight }
      })

    const summary = getEndSummary(events.map((e) => ({ type: e.type, payload: e.payload })))

    return { claims: claimEvents, summary }
  }, [run?.events])

  const displayClaims = useMemo(() => {
    if (mode === 'replay') return claims.slice(0, Math.max(0, replayCount))
    return claims
  }, [claims, mode, replayCount])

  const displayPassedWeight = useMemo(() => {
    return displayClaims.reduce((sum, c) => sum + (c.ok ? c.weight : 0), 0)
  }, [displayClaims])

  const displayTotalWeight = useMemo(() => {
    return displayClaims.reduce((sum, c) => sum + c.weight, 0)
  }, [displayClaims])

  useEffect(() => {
    if (mode !== 'replay') return
    setReplayCount((c) => Math.min(Math.max(c, 0), claims.length))
  }, [mode, claims.length])

  useEffect(() => {
    if (!run || run.status !== 'done') return
    if (!summary?.proofHash || summary.failed !== 0) return
    setConfettiSeed(`${summary.proofHash}_${run.finishedAt ?? Date.now()}`)
  }, [run, summary])

  useEffect(() => {
    const source = mode === 'replay' ? displayClaims : claims
    if (source.length <= lastCount) return
    const newest = source[source.length - 1]
    if (newest?.id) setHighlightClaimId(newest.id)
    setLastCount(source.length)
    const t = setTimeout(() => setHighlightClaimId(null), 1400)
    return () => clearTimeout(t)
  }, [claims, displayClaims, lastCount, mode])

  useEffect(() => {
    if (mode !== 'replay') return
    if (!isPlaying) return
    const intervalMs = 700 / speed
    const t = setInterval(() => {
      setReplayCount((c) => {
        const next = c + 1
        if (next >= claims.length) {
          setIsPlaying(false)
          return claims.length
        }
        return next
      })
    }, intervalMs)
    return () => clearInterval(t)
  }, [mode, isPlaying, speed, claims.length])

  const pct = displayTotalWeight > 0 ? Math.round((displayPassedWeight / displayTotalWeight) * 100) : 0

  return (
    <div className="relative rounded-xl border border-primary/15 bg-primaryAccent p-3">
      {confettiSeed && <ConfettiBurst seed={confettiSeed} />}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="text-xs font-medium uppercase text-primary">Timeline</div>
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => {
                setMode('live')
                setIsPlaying(false)
              }}
              className={`rounded-md border px-2 py-1 text-[11px] uppercase ${
                mode === 'live'
                  ? 'border-primary/30 bg-accent text-primary'
                  : 'border-primary/10 bg-primaryAccent text-secondary'
              }`}
            >
              Live
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('replay')
                setIsPlaying(false)
                setReplayCount(Math.min(replayCount || 0, claims.length))
              }}
              className={`rounded-md border px-2 py-1 text-[11px] uppercase ${
                mode === 'replay'
                  ? 'border-primary/30 bg-accent text-primary'
                  : 'border-primary/10 bg-primaryAccent text-secondary'
              }`}
            >
              Replay
            </button>
          </div>
        </div>
        <div className="text-[11px] text-secondary">
          {displayTotalWeight > 0 ? `${displayPassedWeight}/${displayTotalWeight} (${pct}%)` : 'Waiting…'}
        </div>
      </div>

      <div className="mt-2 h-2 w-full overflow-hidden rounded-full border border-primary/15 bg-background/60">
        <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
      </div>

      {summary?.proofHash && (
        <div className="mt-2 break-words font-mono text-[11px] text-secondary/80">
          proof: {summary.proofHash}
        </div>
      )}

      {mode === 'live' && summary?.failed === 0 && run?.status === 'done' && (
        <div className="mt-2 rounded-xl border border-primary/20 bg-accent p-2 text-xs font-medium uppercase text-primary">
          Perfect Run
        </div>
      )}

      {mode === 'replay' && claims.length > 0 && (
        <div className="mt-2 rounded-xl border border-primary/15 bg-background/60 p-2">
          <div className="flex items-center justify-between gap-2">
            <div className="text-[11px] font-medium uppercase text-primary">
              Replay {replayCount}/{claims.length}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setIsPlaying((p) => !p)}
                className="rounded-md border border-primary/10 bg-primaryAccent px-2 py-1 text-[11px] uppercase text-primary"
              >
                {isPlaying ? 'Pause' : 'Play'}
              </button>
              <button
                type="button"
                onClick={() => setReplayCount(0)}
                className="rounded-md border border-primary/10 bg-primaryAccent px-2 py-1 text-[11px] uppercase text-secondary"
              >
                Reset
              </button>
              <select
                value={String(speed)}
                onChange={(e) => setSpeed(Number(e.target.value) as 1 | 2 | 4)}
                className="rounded-md border border-primary/10 bg-primaryAccent px-2 py-1 text-[11px] uppercase text-secondary"
              >
                <option value="1">1x</option>
                <option value="2">2x</option>
                <option value="4">4x</option>
              </select>
            </div>
          </div>
          <input
            type="range"
            min={0}
            max={claims.length}
            value={replayCount}
            onChange={(e) => {
              setIsPlaying(false)
              setReplayCount(Number(e.target.value))
            }}
            className="mt-2 w-full"
          />
        </div>
      )}

      <div className="mt-3 max-h-56 space-y-2 overflow-auto">
        {displayClaims.length === 0 && (
          <div className="text-xs text-muted">No claims yet</div>
        )}
        {displayClaims.map((c) => (
          <motion.div
            key={c.id}
            initial={{ opacity: 0, y: 6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            className={`rounded-xl border p-2 ${
              c.ok ? 'border-primary/20 bg-accent' : 'border-primary/10 bg-background/60'
            } ${highlightClaimId === c.id ? 'ring-2 ring-primary/60' : ''}`}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="text-xs font-medium uppercase text-primary">
                {c.ok ? 'PASS' : 'FAIL'} · {c.id}
              </div>
              <div className="text-[11px] text-secondary/80">w={c.weight}</div>
            </div>
            {c.statement && (
              <div className="mt-1 text-[11px] text-secondary/80">{c.statement}</div>
            )}
          </motion.div>
        ))}
      </div>
    </div>
  )
}
