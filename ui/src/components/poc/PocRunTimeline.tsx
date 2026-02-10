'use client'

import { useEffect, useMemo, useState } from 'react'
import { useStore } from '@/store'
import { ConfettiBurst } from './ConfettiBurst'
import { motion } from 'framer-motion'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { toast } from 'sonner'
import { base64UrlEncodeUtf8, buildReplayArtifact } from '@/lib/pocReplay'

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

function downloadFile(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

function buildReplayHtml(artifactJson: string, title: string) {
  const safeTitle = title.replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${safeTitle}</title>
    <style>
      :root { color-scheme: dark; }
      body { margin: 0; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace; background: #0b0f1a; color: #e5e7eb; }
      .wrap { max-width: 1100px; margin: 0 auto; padding: 20px; }
      .card { border: 1px solid rgba(255,255,255,0.08); border-radius: 14px; background: rgba(255,255,255,0.04); padding: 14px; }
      .row { display: flex; gap: 12px; flex-wrap: wrap; align-items: center; justify-content: space-between; }
      .pill { border: 1px solid rgba(255,255,255,0.12); background: rgba(255,255,255,0.04); border-radius: 999px; padding: 6px 10px; font-size: 12px; text-transform: uppercase; }
      .muted { color: rgba(229,231,235,0.75); font-size: 12px; }
      .bar { height: 10px; border: 1px solid rgba(255,255,255,0.10); border-radius: 999px; overflow: hidden; background: rgba(255,255,255,0.04); }
      .bar > div { height: 100%; background: #a78bfa; width: 0%; }
      .btn { cursor: pointer; border: 1px solid rgba(255,255,255,0.12); background: rgba(255,255,255,0.04); border-radius: 10px; padding: 8px 10px; font-size: 12px; text-transform: uppercase; color: #e5e7eb; }
      .btn:hover { background: rgba(255,255,255,0.07); }
      input[type="range"] { width: 100%; }
      .list { margin-top: 12px; display: grid; gap: 10px; }
      .item { border: 1px solid rgba(255,255,255,0.10); border-radius: 12px; background: rgba(255,255,255,0.03); padding: 10px; }
      .ok { border-color: rgba(52,211,153,0.25); background: rgba(52,211,153,0.07); }
      .bad { border-color: rgba(251,113,133,0.25); background: rgba(251,113,133,0.06); }
      .h { font-size: 12px; font-weight: 700; text-transform: uppercase; color: #e5e7eb; display: flex; justify-content: space-between; gap: 10px; }
      .s { margin-top: 6px; font-size: 12px; color: rgba(229,231,235,0.80); white-space: pre-wrap; overflow-wrap: anywhere; }
      .mono { font-size: 12px; color: rgba(229,231,235,0.75); overflow-wrap: anywhere; }
    </style>
  </head>
  <body>
    <script id="artifact" type="application/json">${artifactJson.replaceAll('</', '<\\/')}</script>
    <div class="wrap">
      <div class="card">
        <div class="row">
          <div>
            <div class="pill">PoC Replay</div>
            <div class="muted" id="meta"></div>
          </div>
          <div class="row" style="justify-content:flex-end">
            <button class="btn" id="play">Play</button>
            <button class="btn" id="reset">Reset</button>
            <select class="btn" id="speed">
              <option value="1">1x</option>
              <option value="2" selected>2x</option>
              <option value="4">4x</option>
            </select>
          </div>
        </div>
        <div style="margin-top:12px">
          <div class="row">
            <div class="muted" id="counter"></div>
            <div class="muted" id="score"></div>
          </div>
          <div class="bar" style="margin-top:8px"><div id="bar"></div></div>
          <div style="margin-top:10px">
            <input id="scrub" type="range" min="0" max="0" value="0" />
          </div>
        </div>
      </div>
      <div class="list" id="list"></div>
    </div>
    <script>
      const artifact = JSON.parse(document.getElementById('artifact').textContent);
      const claims = Array.isArray(artifact.claims) ? artifact.claims : [];
      const meta = document.getElementById('meta');
      const counter = document.getElementById('counter');
      const score = document.getElementById('score');
      const bar = document.getElementById('bar');
      const list = document.getElementById('list');
      const scrub = document.getElementById('scrub');
      const playBtn = document.getElementById('play');
      const resetBtn = document.getElementById('reset');
      const speedSel = document.getElementById('speed');
      let count = 0;
      let timer = null;
      const fmtTs = (s) => {
        try { return new Date(s * 1000).toLocaleString(); } catch { return ''; }
      };
      meta.textContent = 'Job: ' + (artifact.jobId || '') + ' · proof: ' + (artifact.proof_hash || '') + (artifact.createdAt ? (' · ' + fmtTs(artifact.createdAt)) : '');
      scrub.max = String(claims.length);
      const render = () => {
        const slice = claims.slice(0, count);
        const passed = slice.reduce((sum, c) => sum + (c.ok ? (c.weight || 1) : 0), 0);
        const total = slice.reduce((sum, c) => sum + (c.weight || 1), 0);
        const pct = total > 0 ? Math.round((passed / total) * 100) : 0;
        counter.textContent = 'Replay ' + count + '/' + claims.length;
        score.textContent = total > 0 ? (passed + '/' + total + ' (' + pct + '%)') : 'Waiting';
        bar.style.width = pct + '%';
        list.innerHTML = '';
        slice.forEach((c) => {
          const div = document.createElement('div');
          div.className = 'item ' + (c.ok ? 'ok' : 'bad');
          div.innerHTML = '<div class="h"><div>' + (c.ok ? 'PASS' : 'FAIL') + ' · ' + (c.id || '') + '</div><div>w=' + (c.weight || 1) + '</div></div>' +
            (c.statement ? '<div class="s">' + c.statement + '</div>' : '');
          list.appendChild(div);
        });
        scrub.value = String(count);
      };
      const stop = () => {
        if (timer) clearInterval(timer);
        timer = null;
        playBtn.textContent = 'Play';
      };
      const start = () => {
        stop();
        playBtn.textContent = 'Pause';
        const speed = Number(speedSel.value || '2');
        timer = setInterval(() => {
          count += 1;
          if (count >= claims.length) {
            count = claims.length;
            stop();
          }
          render();
        }, 700 / speed);
      };
      playBtn.addEventListener('click', () => {
        if (timer) stop(); else start();
      });
      resetBtn.addEventListener('click', () => {
        stop();
        count = 0;
        render();
      });
      speedSel.addEventListener('change', () => {
        if (timer) start();
      });
      scrub.addEventListener('input', (e) => {
        stop();
        count = Number(e.target.value || '0');
        render();
      });
      render();
    </script>
  </body>
</html>`
}

function PocRunTimelineInner({
  jobId,
  variant = 'default',
  onOpenCinematic
}: {
  jobId: string
  variant?: 'default' | 'cinematic'
  onOpenCinematic?: () => void
}) {
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
  const maxListHeight = variant === 'cinematic' ? 'max-h-[58vh]' : 'max-h-56'
  const baseCard = variant === 'cinematic'
    ? 'relative rounded-xl border border-primary/20 bg-primaryAccent p-5'
    : 'relative rounded-xl border border-primary/15 bg-primaryAccent p-3'

  return (
    <div className={baseCard}>
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
              <button
                type="button"
                onClick={() => {
                  const artifact = buildReplayArtifact({
                    jobId,
                    proofHash: summary?.proofHash || '',
                    claims
                  })
                  const artifactJson = JSON.stringify(artifact, null, 2)
                  downloadFile(`poc-replay-${jobId}.json`, artifactJson + '\n', 'application/json')
                  const html = buildReplayHtml(artifactJson, `PoC Replay ${jobId}`)
                  downloadFile(`poc-replay-${jobId}.html`, html, 'text/html')
                }}
                className="rounded-md border border-primary/10 bg-primaryAccent px-2 py-1 text-[11px] uppercase text-secondary"
              >
                Export Replay
              </button>
              <button
                type="button"
                onClick={async () => {
                  try {
                    const artifact = buildReplayArtifact({
                      jobId,
                      proofHash: summary?.proofHash || '',
                      claims
                    })
                    const artifactJson = JSON.stringify(artifact)
                    const encoded = base64UrlEncodeUtf8(artifactJson)
                    const url = `${window.location.origin}/poc-replay?d=${encoded}`
                    await navigator.clipboard.writeText(url)
                    toast.success('Share link copied')
                  } catch (err) {
                    toast.error(err instanceof Error ? err.message : String(err))
                  }
                }}
                className="rounded-md border border-primary/10 bg-primaryAccent px-2 py-1 text-[11px] uppercase text-secondary"
              >
                Copy Share Link
              </button>
              {variant === 'default' && (
                <button
                  type="button"
                  onClick={() => onOpenCinematic?.()}
                  className="rounded-md border border-primary/10 bg-primaryAccent px-2 py-1 text-[11px] uppercase text-secondary"
                >
                  Cinematic
                </button>
              )}
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

      <div className={`mt-3 ${maxListHeight} space-y-2 overflow-auto`}>
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

export function PocRunTimeline({ jobId }: { jobId: string }) {
  const [cinematicOpen, setCinematicOpen] = useState(false)
  return (
    <>
      <PocRunTimelineInner
        jobId={jobId}
        variant="default"
        onOpenCinematic={() => setCinematicOpen(true)}
      />
      <Dialog open={cinematicOpen} onOpenChange={setCinematicOpen}>
        <DialogContent className="max-h-[92vh] w-[min(96vw,1200px)] max-w-none border border-primary/15 bg-background/95 font-dmmono">
          <div className="text-xs font-medium uppercase text-primary">Cinematic Replay</div>
          <div className="mt-3">
            <PocRunTimelineInner jobId={jobId} variant="cinematic" />
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
