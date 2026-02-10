'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { TextArea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { useStore } from '@/store'
import { createJob, startJob, streamJobEvents } from '@/lib/runner/client'

function randomId(prefix: string) {
  return `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now()}`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function parseChecksJson(raw: string): unknown[] | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  const parsed = JSON.parse(trimmed)
  if (!Array.isArray(parsed)) throw new Error('Checks JSON must be an array')
  return parsed
}

export function PocReview() {
  const {
    pocReviewBaseDir,
    setPocReviewBaseDir,
    pocReviewChecksJson,
    setPocReviewChecksJson,
    pocReviewTemplates,
    setPocReviewTemplates,
    selectedPocReviewTemplateId,
    setSelectedPocReviewTemplateId,
    runtimeMode,
    cloudFallbackEnabled,
    initRun,
    applyRunnerEvent,
    setRunUnsubscribe,
    setMessages
  } = useStore()

  const [isRunning, setIsRunning] = useState(false)
  const [isTemplatesOpen, setIsTemplatesOpen] = useState(false)
  const [templateName, setTemplateName] = useState('')

  let parsedChecks: unknown[] | null = null
  let parsedChecksError: string | null = null
  try {
    parsedChecks = parseChecksJson(pocReviewChecksJson)
  } catch (err) {
    parsedChecksError = err instanceof Error ? err.message : String(err)
  }

  return (
    <div className="mt-3 w-full">
      <div className="text-xs font-medium uppercase text-primary">PoC Review</div>
      <div className="mt-2 flex w-full flex-col gap-2">
        {pocReviewTemplates.length > 0 && (
          <Select
            value={selectedPocReviewTemplateId}
            onValueChange={(value) => {
              setSelectedPocReviewTemplateId(value)
              const t = pocReviewTemplates.find((x) => x.id === value)
              if (t) setPocReviewChecksJson(t.checksJson)
            }}
          >
            <SelectTrigger className="h-9 w-full rounded-xl border border-primary/15 bg-accent p-3 text-xs uppercase">
              <SelectValue placeholder="Select template" />
            </SelectTrigger>
            <SelectContent className="border-none bg-primaryAccent font-dmmono shadow-lg">
              {pocReviewTemplates.map((t) => (
                <SelectItem key={t.id} value={t.id} className="cursor-pointer">
                  <div className="text-xs font-medium uppercase">{t.name}</div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <Input
          value={pocReviewBaseDir}
          onChange={(e) => setPocReviewBaseDir(e.target.value)}
          placeholder="Folder (optional): /path/to/repo"
          className="h-9 w-full rounded-xl border border-primary/15 bg-accent p-3 text-xs"
        />
        <TextArea
          value={pocReviewChecksJson}
          onChange={(e) => setPocReviewChecksJson(e.target.value)}
          placeholder={`Optional checks JSON (advanced)\n[\n  {\"id\":\"C1\",\"statement\":\"UI builds\",\"command\":\"cd ui && npm run build\",\"dependencies\":[],\"weight\":3}\n]`}
          className="h-28 w-full rounded-xl border border-primary/15 bg-accent p-3 text-xs"
        />
        {parsedChecksError && (
          <div className="rounded-xl border border-primary/15 bg-accent p-2 text-[11px] text-red-300/90">
            {parsedChecksError}
          </div>
        )}
        {parsedChecks && (
          <div className="rounded-xl border border-primary/15 bg-accent p-2">
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="text-[11px] font-medium uppercase text-primary/80">
                Checks
              </div>
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 rounded-md border border-primary/15 bg-primaryAccent text-[11px] uppercase"
                  onClick={() => {
                    const next = parsedChecks!.map((c) => {
                      if (!isRecord(c)) return c
                      return { ...c, enabled: true }
                    })
                    setPocReviewChecksJson(JSON.stringify(next, null, 2))
                  }}
                >
                  Enable all
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 rounded-md border border-primary/15 bg-primaryAccent text-[11px] uppercase"
                  onClick={() => {
                    const next = parsedChecks!.map((c) => {
                      if (!isRecord(c)) return c
                      return { ...c, enabled: false }
                    })
                    setPocReviewChecksJson(JSON.stringify(next, null, 2))
                  }}
                >
                  Disable all
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 rounded-md border border-primary/15 bg-primaryAccent text-[11px] uppercase"
                  onClick={() => {
                    const next = parsedChecks!.map((c) => (isRecord(c) ? { ...c } : c))
                    let prevId: string | null = null
                    for (let i = 0; i < next.length; i++) {
                      const row = next[i]
                      if (!isRecord(row)) continue
                      if (row.enabled === false) continue
                      const idRaw = row.id
                      const id =
                        typeof idRaw === 'string' && idRaw.trim()
                          ? idRaw.trim()
                          : `C${i + 1}`
                      row.id = id
                      row.dependencies = prevId ? [prevId] : []
                      prevId = id
                    }
                    setPocReviewChecksJson(JSON.stringify(next, null, 2))
                    toast.success('Dependencies generated')
                  }}
                >
                  Auto deps
                </Button>
              </div>
            </div>
            <div className="space-y-2">
              {parsedChecks.map((c, idx) => {
                const row = isRecord(c) ? c : null
                const enabled = row ? row.enabled !== false : true
                const id = row && typeof row.id === 'string' ? row.id : `#${idx + 1}`
                const statement = row && typeof row.statement === 'string' ? row.statement : ''
                return (
                  <label key={`${id}_${idx}`} className="flex items-start gap-2 text-xs text-secondary">
                    <input
                      type="checkbox"
                      checked={enabled}
                      onChange={(e) => {
                        const next = parsedChecks!.map((x) => (isRecord(x) ? { ...x } : x))
                        const target = next[idx]
                        if (isRecord(target)) {
                          target.enabled = e.target.checked
                          setPocReviewChecksJson(JSON.stringify(next, null, 2))
                        }
                      }}
                      className="mt-0.5 h-4 w-4 accent-white"
                    />
                    <div className="min-w-0">
                      <div className="text-xs font-medium text-primary">
                        {id}
                      </div>
                      {statement && (
                        <div className="mt-0.5 break-words text-[11px] text-secondary/80">
                          {statement}
                        </div>
                      )}
                    </div>
                  </label>
                )
              })}
            </div>
          </div>
        )}
        <div className="flex w-full gap-2">
          <Button
            type="button"
            variant="outline"
            className="h-9 w-full rounded-xl border border-primary/15 bg-primaryAccent text-xs font-medium uppercase"
            onClick={() => {
              const activeTemplate = selectedPocReviewTemplateId
                ? pocReviewTemplates.find((t) => t.id === selectedPocReviewTemplateId)
                : undefined
              setTemplateName(activeTemplate ? activeTemplate.name : '')
              setIsTemplatesOpen(true)
            }}
          >
            Templates
          </Button>
          <Button
            type="button"
            variant="outline"
            className="h-9 w-full rounded-xl border border-primary/15 bg-primaryAccent text-xs font-medium uppercase"
            onClick={() => {
              const standard = [
                {
                  id: 'C1',
                  statement: 'Node is available',
                  command: 'node -v',
                  dependencies: [],
                  weight: 1,
                  enabled: true
                },
                {
                  id: 'C2',
                  statement: 'npm is available',
                  command: 'npm -v',
                  dependencies: ['C1'],
                  weight: 1,
                  enabled: true
                },
                {
                  id: 'C3',
                  statement: 'Runner builds',
                  command: 'cd runner && npm run build',
                  dependencies: ['C2'],
                  weight: 3,
                  enabled: true
                },
                {
                  id: 'C4',
                  statement: 'Server builds',
                  command: 'cd server && npm run build',
                  dependencies: ['C2'],
                  weight: 3,
                  enabled: true
                },
                {
                  id: 'C5',
                  statement: 'UI builds',
                  command: 'cd ui && npm run build',
                  dependencies: ['C2'],
                  weight: 3,
                  enabled: true
                },
                {
                  id: 'C6',
                  statement: 'UI validate (lint/format/typecheck)',
                  command: 'cd ui && npm run validate',
                  dependencies: ['C2'],
                  weight: 5,
                  enabled: false
                }
              ]
              const nextJson = JSON.stringify(standard, null, 2)
              setPocReviewChecksJson(nextJson)

              const name = 'Standard Repo Review'
              const existing = pocReviewTemplates.find((t) => t.name === name)
              const id = existing?.id ?? randomId('poc_tpl')
              setPocReviewTemplates((prev) => {
                const without = prev.filter((t) => t.id !== id)
                return [{ id, name, checksJson: nextJson }, ...without]
              })
              setSelectedPocReviewTemplateId(id)
              toast.success('Standard template generated')
            }}
          >
            Generate
          </Button>
        </div>
        <Button
          type="button"
          disabled={isRunning}
          className="h-9 w-full rounded-xl bg-primary text-xs font-medium uppercase text-primaryAccent"
          onClick={async () => {
            setIsRunning(true)
            try {
              let poc_checks: unknown = undefined
              if (pocReviewChecksJson.trim()) {
                poc_checks = parseChecksJson(pocReviewChecksJson)
              }
              const input: Record<string, unknown> = {
                provider: 'poc_review',
                runtime_mode: runtimeMode,
                cloud_fallback: cloudFallbackEnabled
              }
              if (pocReviewBaseDir.trim()) input.base_dir = pocReviewBaseDir.trim()
              if (poc_checks) input.poc_checks = poc_checks
              const { jobId } = await createJob(
                input,
                12 * 60 * 1000
              )

              initRun(jobId)
              setMessages((prev) => [
                ...prev,
                {
                  role: 'agent',
                  content: 'PoC review started…',
                  created_at: Math.floor(Date.now() / 1000),
                  extra_data: { runner_job_id: jobId }
                }
              ])

              const unsubscribe = streamJobEvents(jobId, {
                onEvent: (evt) => {
                  applyRunnerEvent(evt)
                },
                onDone: () => {
                  unsubscribe()
                  setRunUnsubscribe(jobId, undefined)
                },
                onError: (err) => {
                  toast.error(
                    `Runner stream error: ${err instanceof Error ? err.message : String(err)}`
                  )
                }
              })

              setRunUnsubscribe(jobId, unsubscribe)
              await startJob(jobId)
            } catch (err) {
              toast.error(err instanceof Error ? err.message : String(err))
            } finally {
              setIsRunning(false)
            }
          }}
        >
          {isRunning ? 'Running…' : 'Run PoC Review'}
        </Button>
      </div>

      <Dialog open={isTemplatesOpen} onOpenChange={setIsTemplatesOpen}>
        <DialogContent className="max-w-xl border border-primary/15 bg-primaryAccent font-dmmono">
          <DialogHeader>
            <DialogTitle>PoC Templates</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <Input
              value={templateName}
              onChange={(e) => setTemplateName(e.target.value)}
              placeholder="Template name"
              className="h-9 w-full rounded-xl border border-primary/15 bg-accent p-3 text-xs"
            />
            <div className="flex gap-2">
              <Button
                type="button"
                className="h-9 w-full rounded-xl bg-primary text-xs font-medium uppercase text-primaryAccent"
                onClick={() => {
                  if (!templateName.trim()) {
                    toast.error('Template name is required')
                    return
                  }
                  if (!pocReviewChecksJson.trim()) {
                    toast.error('Checks JSON is empty')
                    return
                  }
                  try {
                    const parsed = JSON.parse(pocReviewChecksJson)
                    if (!Array.isArray(parsed)) {
                      toast.error('Checks JSON must be an array')
                      return
                    }
                  } catch (err) {
                    toast.error(err instanceof Error ? err.message : String(err))
                    return
                  }

                  const id = selectedPocReviewTemplateId || randomId('poc_tpl')
                  setPocReviewTemplates((prev) => {
                    const idx = prev.findIndex((t) => t.id === id)
                    const next = [...prev]
                    const row = { id, name: templateName.trim(), checksJson: pocReviewChecksJson }
                    if (idx === -1) next.unshift(row)
                    else next[idx] = row
                    return next
                  })
                  setSelectedPocReviewTemplateId(id)
                  toast.success('Template saved')
                  setIsTemplatesOpen(false)
                }}
              >
                Save
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={!selectedPocReviewTemplateId}
                className="h-9 w-full rounded-xl border border-primary/15 bg-primaryAccent text-xs font-medium uppercase"
                onClick={() => {
                  const id = selectedPocReviewTemplateId
                  if (!id) return
                  setPocReviewTemplates((prev) => prev.filter((t) => t.id !== id))
                  setSelectedPocReviewTemplateId('')
                  toast.success('Template deleted')
                  setIsTemplatesOpen(false)
                }}
              >
                Delete
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
