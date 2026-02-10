'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { TextArea } from '@/components/ui/textarea'
import { useStore } from '@/store'
import { createJob, startJob, streamJobEvents } from '@/lib/runner/client'

export function PocReview() {
  const {
    pocReviewBaseDir,
    setPocReviewBaseDir,
    pocReviewChecksJson,
    setPocReviewChecksJson,
    runtimeMode,
    cloudFallbackEnabled,
    initRun,
    applyRunnerEvent,
    setRunUnsubscribe,
    setMessages
  } = useStore()

  const [isRunning, setIsRunning] = useState(false)

  return (
    <div className="mt-3 w-full">
      <div className="text-xs font-medium uppercase text-primary">PoC Review</div>
      <div className="mt-2 flex w-full flex-col gap-2">
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
    </div>
  )
}
