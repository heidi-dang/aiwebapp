'use client'

import { Suspense, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import { base64UrlDecodeUtf8, type PocReplayArtifact } from '@/lib/pocReplay'
import { PocReplayPlayer } from '@/components/poc/PocReplayPlayer'
import { TextArea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function parseArtifact(jsonText: string): PocReplayArtifact {
  const parsed = JSON.parse(jsonText) as unknown
  if (!isRecord(parsed)) throw new Error('Artifact must be an object')
  if (parsed.version !== 1) throw new Error('Unsupported artifact version')
  if (typeof parsed.jobId !== 'string') throw new Error('Missing jobId')
  if (typeof parsed.proof_hash !== 'string') throw new Error('Missing proof_hash')
  if (!Array.isArray(parsed.claims)) throw new Error('Missing claims')
  return parsed as PocReplayArtifact
}

function PocReplayPageInner() {
  const sp = useSearchParams()
  const d = sp.get('d') || ''
  const cinematic = (sp.get('cinematic') || '') === '1'
  const autoplay = (sp.get('autoplay') || '') === '1'
  const director = (sp.get('director') || '') === '1'
  const sound = (sp.get('sound') || '') === '1'
  const filterRaw = sp.get('filter') || ''
  const filter =
    filterRaw === 'pass' || filterRaw === 'fail' || filterRaw === 'all'
      ? (filterRaw as 'all' | 'pass' | 'fail')
      : director
        ? 'fail'
        : 'all'
  const startRaw = sp.get('start') || ''
  const endRaw = sp.get('end') || ''
  const startParsed = startRaw ? Number(startRaw) : 0
  const endParsed = endRaw ? Number(endRaw) : undefined
  const start = Number.isFinite(startParsed) ? startParsed : 0
  const end =
    endParsed === undefined ? undefined : Number.isFinite(endParsed) ? endParsed : undefined
  const pauseFailRaw = sp.get('pauseFail') || ''
  const pausePassRaw = sp.get('pausePass') || ''
  const pauseFailParsed = pauseFailRaw ? Number(pauseFailRaw) : undefined
  const pausePassParsed = pausePassRaw ? Number(pausePassRaw) : undefined
  const pauseOnFailMs =
    pauseFailParsed !== undefined
      ? Number.isFinite(pauseFailParsed)
        ? pauseFailParsed
        : 0
      : director
        ? 1400
        : 0
  const pauseOnPassMs =
    pausePassParsed !== undefined
      ? Number.isFinite(pausePassParsed)
        ? pausePassParsed
        : 0
      : director
        ? 0
        : 0
  const speedRaw = sp.get('speed') || ''
  const initialSpeed = speedRaw === '1' || speedRaw === '2' || speedRaw === '4'
    ? (Number(speedRaw) as 1 | 2 | 4)
    : director
      ? 1
      : 2
  const [artifact, setArtifact] = useState<PocReplayArtifact | null>(null)
  const [raw, setRaw] = useState('')

  useEffect(() => {
    if (!d) return
    try {
      const jsonText = base64UrlDecodeUtf8(d)
      const art = parseArtifact(jsonText)
      setArtifact(art)
      setRaw(JSON.stringify(art, null, 2))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    }
  }, [d])

  const title = useMemo(() => {
    if (!artifact) return 'PoC Replay'
    return `PoC Replay · ${artifact.jobId}`
  }, [artifact])

  return (
    <div className={`min-h-screen bg-background/80 font-dmmono ${(cinematic || director) ? 'p-0' : 'p-4'}`}>
      <div className={`mx-auto w-full ${(cinematic || director) ? 'max-w-none' : 'max-w-5xl'}`}>
        <div className="rounded-xl border border-primary/15 bg-background/60 p-3">
          <div className="text-xs font-medium uppercase text-primary">{title}</div>
          <div className="mt-1 text-sm text-secondary">
            Paste an artifact JSON, upload one, or open a share link.
          </div>
        </div>

        <div className={`mt-4 grid grid-cols-1 gap-4 ${(cinematic || director) ? '' : 'lg:grid-cols-2'}`}>
          {!(cinematic || director) && (
          <div className="rounded-xl border border-primary/15 bg-background/60 p-3">
            <div className="text-xs font-medium uppercase text-primary">Import</div>
            <TextArea
              value={raw}
              onChange={(e) => setRaw(e.target.value)}
              placeholder="Paste replay artifact JSON here…"
              className="mt-3 h-64 w-full rounded-xl border border-primary/15 bg-accent p-3 text-xs"
            />
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                type="button"
                className="h-9 rounded-xl bg-primary text-xs font-medium uppercase text-primaryAccent"
                onClick={() => {
                  try {
                    const art = parseArtifact(raw)
                    setArtifact(art)
                    toast.success('Artifact loaded')
                  } catch (err) {
                    toast.error(err instanceof Error ? err.message : String(err))
                  }
                }}
              >
                Load
              </Button>
              <Button
                type="button"
                variant="outline"
                className="h-9 rounded-xl border border-primary/15 bg-primaryAccent text-xs font-medium uppercase"
                onClick={() => {
                  setArtifact(null)
                  setRaw('')
                }}
              >
                Clear
              </Button>
              <input
                type="file"
                accept="application/json,.json"
                className="text-xs text-secondary"
                onChange={async (e) => {
                  const file = e.target.files?.[0]
                  if (!file) return
                  try {
                    const text = await file.text()
                    const art = parseArtifact(text)
                    setArtifact(art)
                    setRaw(JSON.stringify(art, null, 2))
                    toast.success('Artifact imported')
                  } catch (err) {
                    toast.error(err instanceof Error ? err.message : String(err))
                  } finally {
                    e.target.value = ''
                  }
                }}
              />
            </div>
          </div>
          )}

          <div className="rounded-xl border border-primary/15 bg-background/60 p-3">
            <div className="text-xs font-medium uppercase text-primary">Replay</div>
            <div className="mt-3">
              {artifact ? (
                <PocReplayPlayer
                  artifact={artifact}
                  cinematic={cinematic || director}
                  autoplay={autoplay || director}
                  initialSpeed={initialSpeed}
                  filter={filter}
                  start={start}
                  end={end}
                  pauseOnFailMs={pauseOnFailMs}
                  pauseOnPassMs={pauseOnPassMs}
                  label={director ? 'Director Cut' : undefined}
                  soundEnabled={sound || director}
                />
              ) : (
                <div className="text-xs text-muted">No artifact loaded</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function PocReplayPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <PocReplayPageInner />
    </Suspense>
  )
}
