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
                poc_checks = JSON.parse(pocReviewChecksJson)
                if (!Array.isArray(poc_checks)) {
                  throw new Error('Checks JSON must be an array')
                }
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
