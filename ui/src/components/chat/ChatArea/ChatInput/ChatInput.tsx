'use client'
import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { TextArea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { useStore } from '@/store'
import useAIChatStreamHandler from '@/hooks/useAIStreamHandler'
import { createJob, startJob, streamJobEvents } from '@/lib/runner/client'
import { useQueryState } from 'nuqs'
import Icon from '@/components/ui/icon'
import Tooltip from '@/components/ui/tooltip'
import { getStatusAPI } from '@/api/os'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { ModeSelector } from '@/components/chat/Sidebar/ModeSelector'
import { EntitySelector } from '@/components/chat/Sidebar/EntitySelector'

const ChatInput = () => {
  const { chatInputRef } = useStore()

  const { handleStreamResponse } = useAIChatStreamHandler()
  const [selectedAgent] = useQueryState('agent')
  const [teamId] = useQueryState('team')
  const [inputMessage, setInputMessage] = useState('')
  const isStreaming = useStore((state) => state.isStreaming)
  const initRun = useStore((state) => state.initRun)
  const applyRunnerEvent = useStore((state) => state.applyRunnerEvent)
  const setRunUnsubscribe = useStore((state) => state.setRunUnsubscribe)
  const selectedEndpoint = useStore((state) => state.selectedEndpoint)
  const authToken = useStore((state) => state.authToken)
  const messages = useStore((state) => state.messages)
  const setMessages = useStore((state) => state.setMessages)
  const [copilotStatus, setCopilotStatus] = useState<'unknown' | 'up' | 'down'>(
    'unknown'
  )
  const [copilotLatencyMs, setCopilotLatencyMs] = useState<number | null>(null)
  const [copilotLastCheckedAt, setCopilotLastCheckedAt] = useState<Date | null>(
    null
  )
  const [isCopilotChecking, setIsCopilotChecking] = useState(false)
  const [isAgentDialogOpen, setIsAgentDialogOpen] = useState(false)
  const [isToolsDialogOpen, setIsToolsDialogOpen] = useState(false)
  const [isCopilotDialogOpen, setIsCopilotDialogOpen] = useState(false)

  const checkCopilotHealth = useCallback(async () => {
    setIsCopilotChecking(true)
    const startedAt = Date.now()
    try {
      const status = await getStatusAPI(selectedEndpoint, authToken)
      setCopilotLatencyMs(Date.now() - startedAt)
      setCopilotLastCheckedAt(new Date())
      setCopilotStatus(status === 200 ? 'up' : 'down')
    } catch {
      setCopilotLatencyMs(Date.now() - startedAt)
      setCopilotLastCheckedAt(new Date())
      setCopilotStatus('down')
    } finally {
      setIsCopilotChecking(false)
    }
  }, [selectedEndpoint, authToken])

  useEffect(() => {
    checkCopilotHealth()
    const interval = setInterval(checkCopilotHealth, 5000)
    return () => {
      clearInterval(interval)
    }
  }, [checkCopilotHealth])

  const copilotDotClassName =
    copilotStatus === 'up'
      ? 'bg-green-500'
      : copilotStatus === 'down'
        ? 'bg-red-500'
        : 'bg-muted-foreground'

  const toolCalls = messages.flatMap((m) => m.tool_calls ?? [])

  const handleStartRunnerJob = useCallback(async () => {
    if (!inputMessage.trim()) return

    const currentMessage = inputMessage
    setInputMessage('')

    try {
      // Add user message first
      setMessages((prev) => [
        ...prev,
        {
          role: 'user',
          content: currentMessage,
          created_at: Math.floor(Date.now() / 1000)
        }
      ])

      const { jobId } = await createJob({ message: currentMessage })

      initRun(jobId)
      setMessages((prev) => [
        ...prev,
        {
          role: 'agent',
          content: '',
          created_at: Math.floor(Date.now() / 1000),
          extra_data: {
            runner_job_id: jobId
          }
        }
      ])

      const unsubscribe = streamJobEvents(jobId, {
        onEvent: (evt) => {
          applyRunnerEvent(evt)
        },
        onDone: () => {
          const unsub = useStore.getState().runUi[jobId]?.unsubscribe
          unsub?.()
          useStore.getState().setRunUnsubscribe(jobId, undefined)
        },
        onError: (err) => {
          toast.error(
            `Runner stream error: ${err instanceof Error ? err.message : String(err)}`
          )
        }
      })

      setRunUnsubscribe(jobId, unsubscribe)
      await startJob(jobId)
    } catch (error) {
      toast.error(
        `Runner error: ${error instanceof Error ? error.message : String(error)}`
      )
    }
  }, [applyRunnerEvent, initRun, inputMessage, setMessages, setRunUnsubscribe])

  const handleSubmit = async () => {
    if (!inputMessage.trim()) return

    const currentMessage = inputMessage
    setInputMessage('')

    try {
      await handleStreamResponse(currentMessage)
    } catch (error) {
      toast.error(
        `Error in handleSubmit: ${
          error instanceof Error ? error.message : String(error)
        }`
      )
    }
  }

  return (
    <div className="relative mx-auto mb-1 flex w-full max-w-2xl items-end justify-center gap-x-2 font-geist">
      <Dialog open={isAgentDialogOpen} onOpenChange={setIsAgentDialogOpen}>
        <DialogContent className="max-w-[520px]">
          <DialogHeader>
            <DialogTitle>Agent / Team</DialogTitle>
            <DialogDescription>
              Select mode and choose an entity for the current chat.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <ModeSelector />
            <EntitySelector />
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isCopilotDialogOpen} onOpenChange={setIsCopilotDialogOpen}>
        <DialogContent className="max-w-[520px]">
          <DialogHeader>
            <DialogTitle>Copilot</DialogTitle>
            <DialogDescription>Health and connection status.</DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between rounded-xl border border-primary/15 bg-accent p-3">
              <div className="flex items-center gap-3">
                <div
                  className={`h-2 w-2 rounded-full ${copilotDotClassName}`}
                />
                <div className="text-xs font-medium uppercase text-primary">
                  {copilotStatus === 'up'
                    ? 'Healthy'
                    : copilotStatus === 'down'
                      ? 'Unreachable'
                      : 'Unknown'}
                </div>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={async () => {
                  await checkCopilotHealth()
                }}
                disabled={isCopilotChecking}
              >
                {isCopilotChecking ? 'Checking...' : 'Retry now'}
              </Button>
            </div>

            <div className="grid grid-cols-1 gap-2 text-xs text-muted">
              <div className="flex items-center justify-between rounded-xl border border-primary/15 bg-primaryAccent p-3">
                <span className="uppercase text-primary">Endpoint</span>
                <span className="truncate pl-3 text-right text-muted">
                  {selectedEndpoint}
                </span>
              </div>
              <div className="flex items-center justify-between rounded-xl border border-primary/15 bg-primaryAccent p-3">
                <span className="uppercase text-primary">Auth</span>
                <span className="text-muted">
                  {authToken ? 'Bearer token set' : 'No token'}
                </span>
              </div>
              <div className="flex items-center justify-between rounded-xl border border-primary/15 bg-primaryAccent p-3">
                <span className="uppercase text-primary">Latency</span>
                <span className="text-muted">
                  {copilotLatencyMs == null ? '-' : `${copilotLatencyMs} ms`}
                </span>
              </div>
              <div className="flex items-center justify-between rounded-xl border border-primary/15 bg-primaryAccent p-3">
                <span className="uppercase text-primary">Last check</span>
                <span className="text-muted">
                  {copilotLastCheckedAt == null
                    ? '-'
                    : copilotLastCheckedAt.toLocaleTimeString()}
                </span>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isToolsDialogOpen} onOpenChange={setIsToolsDialogOpen}>
        <DialogContent className="max-w-[520px]">
          <DialogHeader>
            <DialogTitle>Tools</DialogTitle>
            <DialogDescription>
              Tool calls seen in the current chat session.
            </DialogDescription>
          </DialogHeader>
          {toolCalls.length === 0 ? (
            <div className="text-muted-foreground text-sm">
              No tool calls yet.
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {toolCalls.map((tc, idx) => (
                <div
                  key={
                    tc.tool_call_id || `${tc.tool_name}-${tc.created_at}-${idx}`
                  }
                  className="cursor-default rounded-full bg-accent px-2 py-1.5 text-xs"
                >
                  <p className="font-dmmono uppercase text-primary/80">
                    {tc.tool_name}
                  </p>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <div className="relative w-full">
        <div className="pointer-events-auto absolute bottom-2 left-2 z-10 flex items-center gap-x-1">
          <Tooltip content="Run as job" side="top" delayDuration={300}>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-lg"
              onClick={handleStartRunnerJob}
              disabled={!inputMessage.trim() || isStreaming}
            >
              <Icon type="play" size="xs" />
            </Button>
          </Tooltip>

          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 rounded-lg"
            onClick={() => {
              setIsAgentDialogOpen(true)
            }}
          >
            <Icon type="agent" size="xs" />
          </Button>

          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 rounded-lg"
            onClick={() => {
              setIsToolsDialogOpen(true)
            }}
          >
            <Icon type="hammer" size="xs" />
          </Button>

          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="relative h-8 w-8 rounded-lg"
            onClick={() => {
              setIsCopilotDialogOpen(true)
            }}
          >
            <Icon type="agno" size="xs" />
            <span
              className={`absolute right-1 top-1 h-2 w-2 rounded-full ${copilotDotClassName}`}
            />
          </Button>
        </div>

        <TextArea
          placeholder={'Ask anything'}
          value={inputMessage}
          onChange={(e) => setInputMessage(e.target.value)}
          onKeyDown={(e) => {
            if (
              e.key === 'Enter' &&
              !e.nativeEvent.isComposing &&
              !e.shiftKey &&
              !isStreaming
            ) {
              e.preventDefault()
              handleSubmit()
            }
          }}
          className="w-full border border-accent bg-primaryAccent px-4 pl-12 text-sm text-primary focus:border-accent"
          disabled={!(selectedAgent || teamId)}
          ref={chatInputRef}
        />
      </div>
      <Button
        onClick={handleSubmit}
        disabled={
          !(selectedAgent || teamId) || !inputMessage.trim() || isStreaming
        }
        size="icon"
        className="rounded-xl bg-primary p-5 text-primaryAccent"
      >
        <Icon type="send" color="primaryAccent" />
      </Button>
    </div>
  )
}

export default ChatInput
