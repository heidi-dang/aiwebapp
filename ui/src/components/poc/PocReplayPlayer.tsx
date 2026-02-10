'use client'

import { useEffect, useMemo, useState } from 'react'
import type { PocReplayArtifact, PocReplayClaim } from '@/lib/pocReplay'
import { motion } from 'framer-motion'

function fmtTs(tsSeconds: number) {
  try {
    return new Date(tsSeconds * 1000).toLocaleString()
  } catch {
    return ''
  }
}

export function PocReplayPlayer({
  artifact,
  cinematic = false,
  autoplay = false,
  initialSpeed = 2,
  filter = 'all',
  start = 0,
  end,
  pauseOnFailMs = 0,
  pauseOnPassMs = 0,
  label
}: {
  artifact: PocReplayArtifact
  cinematic?: boolean
  autoplay?: boolean
  initialSpeed?: 1 | 2 | 4
  filter?: 'all' | 'pass' | 'fail'
  start?: number
  end?: number
  pauseOnFailMs?: number
  pauseOnPassMs?: number
  label?: string
}) {
  const claims = useMemo(() => (Array.isArray(artifact.claims) ? artifact.claims : []), [artifact])
  const [count, setCount] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [speed, setSpeed] = useState<1 | 2 | 4>(initialSpeed)

  const filteredClaims = useMemo(() => {
    if (filter === 'pass') return claims.filter((c) => c.ok === true)
    if (filter === 'fail') return claims.filter((c) => c.ok === false)
    return claims
  }, [claims, filter])

  const windowClaims = useMemo(() => {
    const s = Number.isFinite(start) ? Math.max(0, Math.floor(start)) : 0
    const e = Number.isFinite(end as number)
      ? Math.max(s, Math.floor(end as number))
      : filteredClaims.length
    return filteredClaims.slice(s, e)
  }, [filteredClaims, start, end])

  useEffect(() => {
    setCount(0)
    setSpeed(initialSpeed)
    setIsPlaying(autoplay && claims.length > 0)
  }, [artifact.jobId, artifact.proof_hash, autoplay, claims.length, initialSpeed])

  useEffect(() => {
    setCount(0)
  }, [filter, start, end])

  useEffect(() => {
    if (!isPlaying) return
    if (count >= windowClaims.length) {
      setIsPlaying(false)
      return
    }
    const baseDelay = 700 / speed
    const prev = count > 0 ? windowClaims[count - 1] : undefined
    const pause =
      prev && prev.ok === false ? pauseOnFailMs : prev && prev.ok === true ? pauseOnPassMs : 0
    const delay = Math.max(0, baseDelay + pause)
    const t = setTimeout(() => setCount((c) => Math.min(windowClaims.length, c + 1)), delay)
    return () => clearTimeout(t)
  }, [isPlaying, speed, count, windowClaims, pauseOnFailMs, pauseOnPassMs])

  const displayClaims = useMemo(
    () => windowClaims.slice(0, Math.max(0, count)),
    [windowClaims, count]
  )

  const { passedWeight, totalWeight, pct } = useMemo(() => {
    const passedWeight = displayClaims.reduce((sum, c) => sum + (c.ok ? (c.weight || 1) : 0), 0)
    const totalWeight = displayClaims.reduce((sum, c) => sum + (c.weight || 1), 0)
    const pct = totalWeight > 0 ? Math.round((passedWeight / totalWeight) * 100) : 0
    return { passedWeight, totalWeight, pct }
  }, [displayClaims])

  const maxListHeight = cinematic ? 'max-h-[66vh]' : 'max-h-[52vh]'
  const pad = cinematic ? 'p-6' : 'p-4'

  return (
    <div className={`rounded-xl border border-primary/15 bg-primaryAccent ${pad}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-xs font-medium uppercase text-primary">PoC Replay</div>
          {label && (
            <div className="mt-1 text-[11px] font-medium uppercase text-secondary/80">
              {label}
            </div>
          )}
          <div className="mt-1 break-words font-mono text-[11px] text-secondary/80">
            job: {artifact.jobId} · proof: {artifact.proof_hash}
            {artifact.createdAt ? ` · ${fmtTs(artifact.createdAt)}` : ''}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIsPlaying((p) => !p)}
            className="rounded-md border border-primary/10 bg-background/40 px-2 py-1 text-[11px] uppercase text-primary"
          >
            {isPlaying ? 'Pause' : 'Play'}
          </button>
          <button
            type="button"
            onClick={() => {
              setIsPlaying(false)
              setCount(0)
            }}
            className="rounded-md border border-primary/10 bg-background/40 px-2 py-1 text-[11px] uppercase text-secondary"
          >
            Reset
          </button>
          <select
            value={String(speed)}
            onChange={(e) => setSpeed(Number(e.target.value) as 1 | 2 | 4)}
            className="rounded-md border border-primary/10 bg-background/40 px-2 py-1 text-[11px] uppercase text-secondary"
          >
            <option value="1">1x</option>
            <option value="2">2x</option>
            <option value="4">4x</option>
          </select>
        </div>
      </div>

      <div className="mt-3">
        <div className="flex items-center justify-between gap-2">
          <div className="text-[11px] font-medium uppercase text-primary">
            Replay {count}/{windowClaims.length}
          </div>
          <div className="text-[11px] text-secondary">
            {totalWeight > 0 ? `${passedWeight}/${totalWeight} (${pct}%)` : 'Waiting…'}
          </div>
        </div>
        <div className="mt-2 h-2 w-full overflow-hidden rounded-full border border-primary/15 bg-background/40">
          <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
        </div>
        <input
          type="range"
          min={0}
          max={windowClaims.length}
          value={count}
          onChange={(e) => {
            setIsPlaying(false)
            setCount(Number(e.target.value))
          }}
          className="mt-3 w-full"
        />
      </div>

      <div className={`mt-4 ${maxListHeight} space-y-2 overflow-auto`}>
        {displayClaims.length === 0 && (
          <div className="text-xs text-muted">No claims yet</div>
        )}
        {displayClaims.map((c: PocReplayClaim) => (
          <motion.div
            key={c.id}
            initial={{ opacity: 0, y: 8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            className={`rounded-xl border p-3 ${
              c.ok ? 'border-primary/20 bg-accent' : 'border-primary/10 bg-background/40'
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="text-xs font-medium uppercase text-primary">
                {c.ok ? 'PASS' : 'FAIL'} · {c.id}
              </div>
              <div className="text-[11px] text-secondary/80">w={c.weight || 1}</div>
            </div>
            {c.statement && (
              <div className="mt-2 text-[12px] text-secondary/80">{c.statement}</div>
            )}
          </motion.div>
        ))}
      </div>
    </div>
  )
}
