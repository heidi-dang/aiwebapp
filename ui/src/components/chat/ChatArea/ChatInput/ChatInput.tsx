'use client'
import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { TextArea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { useStore } from '@/store'
import { createJob, startJob, streamJobEvents } from '@/lib/runner/client'
import { useQueryState } from 'nuqs'
import Icon from '@/components/ui/icon'
import Tooltip from '@/components/ui/tooltip'

import Highlight, { defaultProps } from 'prism-react-renderer'
import theme from 'prism-react-renderer/themes/github'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { ModeSelector } from '@/components/chat/Sidebar/ModeSelector'
import { EntitySelector } from '@/components/chat/Sidebar/EntitySelector'
import { ProviderSelector } from '@/components/chat/Sidebar/ProviderSelector'
import { ModelSelector } from '@/components/chat/Sidebar/ModelSelector'

const envAiApiUrl = process.env.NEXT_PUBLIC_AI_API_URL ?? ''

function looksLocal(url: string) {
  return (
    url.startsWith('http://localhost') || url.startsWith('http://127.0.0.1')
  )
}

const ChatInput = () => {
  const {
    chatInputRef,
    selectedEndpoint,
    authToken,
    selectedModel,
    setSelectedModel,
    setAvailableModels,
    provider,
    mode,
    messages,
    setMessages,
    isStreaming,
    initRun,
    applyRunnerEvent,
    setRunUnsubscribe,
    systemPromptMode,
    systemPromptCustom
  } = useStore()
  const [selectedAgent] = useQueryState('agent')
  const [teamId] = useQueryState('team')
  const [inputMessage, setInputMessage] = useState('')
  const [copilotStatus, setCopilotStatus] = useState<'unknown' | 'up' | 'down'>(
    'unknown'
  )
  const [isCopilotChecking, setIsCopilotChecking] = useState(false)
  const [isAgentDialogOpen, setIsAgentDialogOpen] = useState(false)
  const [isToolsDialogOpen, setIsToolsDialogOpen] = useState(false)
  const [isCopilotDialogOpen, setIsCopilotDialogOpen] = useState(false)
  const [isModelDialogOpen, setIsModelDialogOpen] = useState(false)
  const [aiApiBase, setAiApiBase] = useState(envAiApiUrl)
  const [apiBase, setApiBase] = useState<string | null>(null)

  // Tools UI state
  const [selectedTool, setSelectedTool] = useState<string>('')
  const [toolInput, setToolInput] = useState<
    Record<string, string | undefined>
  >({})
  const [toolOutput, setToolOutput] = useState<string>('')
  const [isRunningTool, setIsRunningTool] = useState<boolean>(false)
  const [toolError, setToolError] = useState<string | null>(null)

  const [copilotLatencyMs, setCopilotLatencyMs] = useState<number | null>(null)
  const [copilotLastCheckedAt, setCopilotLastCheckedAt] = useState<Date | null>(
    null
  )

  function copyOutput() {
    if (!toolOutput) return
    navigator.clipboard.writeText(toolOutput).then(() => {
      toast.success('Copied tool output to clipboard')
    })
  }

  async function handleRunTool() {
    if (!selectedTool) return
    if (!validateInputs()) return
    setToolOutput('')
    setIsRunningTool(true)
    try {
      const body: { tool: string; params: Record<string, unknown> } = {
        tool: selectedTool,
        params: {}
      }
      if (selectedTool === 'read_file') body.params.path = toolInput.path
      if (selectedTool === 'write_file') {
        body.params.path = toolInput.path
        body.params.content = toolInput.content ?? ''
      }
      if (selectedTool === 'list_files') body.params.glob = toolInput.glob
      if (selectedTool === 'list_dir') body.params.path = toolInput.path
      if (selectedTool === 'grep_search') {
        body.params.query = toolInput.query
        if (toolInput.include) body.params.include_pattern = toolInput.include
      }
      if (selectedTool === 'run_command')
        body.params.command = toolInput.command

      try {
        setToolError(null)
        const res = await fetch('/api/toolbox', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        })

        const txt = await res.text()
        const ct = res.headers.get('content-type') || ''

        if (!ct.includes('application/json')) {
          setToolOutput(txt)
        } else {
          try {
            const json = JSON.parse(txt)
            setToolOutput(JSON.stringify(json, null, 2))
          } catch {
            setToolOutput(txt)
          }
        }

        if (!res.ok) {
          try {
            const maybe = JSON.parse(txt)
            setToolError(String(maybe.error ?? `Tool returned ${res.status}`))
          } catch {
            setToolError(`Tool returned ${res.status}`)
          }
        }
      } catch (err: unknown) {
        const message =
          typeof err === 'object' && err !== null && 'message' in err
            ? String((err as { message?: unknown }).message)
            : String(err)
        setToolOutput(message)
      } finally {
        setIsRunningTool(false)
      }
    } catch (err) {
      setToolError(String(err))
      setIsRunningTool(false)
    }
  }

  function validateInputs(): boolean {
    setToolError(null)
    if (!selectedTool) {
      setToolError('No tool selected')
      return false
    }
    if (
      selectedTool === 'read_file' ||
      selectedTool === 'write_file' ||
      selectedTool === 'list_dir'
    ) {
      const p = toolInput.path ?? ''
      if (!p) {
        setToolError('Path is required')
        return false
      }
      if (p.includes('..')) {
        setToolError('Path may not contain ..')
        return false
      }
    }
    if (selectedTool === 'write_file') {
      if (!toolInput.content) {
        setToolError('Content is required for write_file')
        return false
      }
    }
    if (selectedTool === 'list_files') {
      const g = toolInput.glob ?? ''
      if (!g) {
        setToolError('Glob pattern required')
        return false
      }
    }
    if (selectedTool === 'grep_search') {
      const q = toolInput.query ?? ''
      if (!q) {
        setToolError('Query is required')
        return false
      }
      try {
        // test regex
        new RegExp(q)
      } catch {
        setToolError('Invalid regex')
        return false
      }
    }
    if (selectedTool === 'run_command') {
      const c = toolInput.command ?? ''
      if (!c) {
        setToolError('Command required')
        return false
      }
    }
    return true
  }

  // Derive AI API base from /api/config if env is missing or localhost
  useEffect(() => {
    if (aiApiBase && !looksLocal(aiApiBase) && apiBase) return

    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/api/config', { cache: 'no-store' })
        if (!res.ok) return
        const cfg = await res.json()
        const api = typeof cfg?.aiApiUrl === 'string' ? cfg.aiApiUrl : ''
        const agentApi = typeof cfg?.apiUrl === 'string' ? cfg.apiUrl : ''
        if (!cancelled && api) {
          setAiApiBase(api)
        }
        if (!cancelled && agentApi) {
          setApiBase(agentApi)
        }
      } catch {
        /* ignore */
      }
    })()

    return () => {
      cancelled = true
    }
  }, [aiApiBase, apiBase])

  // Fetch available models when provider is copilotapi
  useEffect(() => {
    // Only fetch models when using Copilot provider AND in Agent mode
    if (provider === 'copilotapi' && mode === 'agent') {
      const headers: HeadersInit = {}
      if (authToken) {
        headers['Authorization'] = `Bearer ${authToken}`
      }

      console.log(
        'Fetching models from /api/copilot/v1/models with headers:',
        headers
      )

      fetch('/api/copilot/v1/models', { headers })
        .then(async (res) => {
          console.log('Response status:', res.status)
          if (!res.ok) throw new Error(`models fetch failed: ${res.status}`)
          const ct = res.headers.get('content-type') || ''
          console.log('Response content-type:', ct)
          if (!ct.includes('application/json')) {
            const txt = await res.text()
            console.error('Models endpoint returned non-JSON:', txt)
            throw new Error('Models endpoint returned non-JSON')
          }
          return res.json()
        })
        .then((data) => {
          console.log('Fetched models data:', data)
          const models = data.data.map((m: { id: string }) => m.id)
          setAvailableModels(models)
          if (
            (!selectedModel || selectedModel === 'auto') &&
            models.length > 0
          ) {
            setSelectedModel(models[0])
          }
        })
        .catch((err) => console.error('Failed to fetch models:', err))
    }
  }, [
    provider,
    setAvailableModels,
    setSelectedModel,
    selectedModel,
    aiApiBase,
    authToken,
    mode
  ])

  const checkCopilotHealth = useCallback(async () => {
    setIsCopilotChecking(true)
    const started = performance.now()
    try {
      const base =
        apiBase && !looksLocal(apiBase)
          ? apiBase
          : looksLocal(selectedEndpoint)
            ? selectedEndpoint
            : null

      if (!base) {
        setCopilotStatus('down')
        return
      }

      const res = await fetch('/api/copilot/health', { cache: 'no-store' })
      setCopilotStatus(res.ok ? 'up' : 'down')
    } catch (error) {
      console.error('Error checking Copilot health:', error)
      setCopilotStatus('down')
    } finally {
      setCopilotLatencyMs(Math.round(performance.now() - started))
      setCopilotLastCheckedAt(new Date())
      setIsCopilotChecking(false)
    }
  }, [apiBase, selectedEndpoint])

  useEffect(() => {
    checkCopilotHealth()
    const interval = setInterval(checkCopilotHealth, 5000)
    return () => {
      clearInterval(interval)
    }
  }, [checkCopilotHealth])

  useEffect(() => {
    const inputElement = document.getElementById('chat-input')
    if (inputElement) {
      inputElement.setAttribute('aria-label', 'Chat input area')
      inputElement.setAttribute('role', 'textbox')
    }
  }, [])

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

      const system_prompt =
        systemPromptMode === 'custom' ? systemPromptCustom : systemPromptMode
      const { jobId } = await createJob({
        message: currentMessage,
        provider,
        model: selectedModel,
        system_prompt
      })

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
    } catch (error) {
      toast.error(
        `Runner error: ${error instanceof Error ? error.message : String(error)}`
      )
    }
  }, [
    applyRunnerEvent,
    initRun,
    inputMessage,
    setMessages,
    setRunUnsubscribe,
    provider,
    selectedModel,
    systemPromptCustom,
    systemPromptMode
  ])

  const handleSubmit = async () => {
    if (!inputMessage.trim()) return

    const currentMessage = inputMessage
    setInputMessage('')

    try {
      setMessages((prev) => [
        ...prev,
        {
          role: 'user',
          content: currentMessage,
          created_at: Math.floor(Date.now() / 1000)
        }
      ])

      const system_prompt =
        systemPromptMode === 'custom' ? systemPromptCustom : systemPromptMode
      const { jobId } = await createJob({
        message: currentMessage,
        provider,
        model: selectedModel,
        system_prompt
      })

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
    } catch (error) {
      toast.error(
        `Runner error: ${error instanceof Error ? error.message : String(error)}`
      )
    }
  }

  // Simple JSON syntax highlighting (minimal, no deps)
  function escapeHtml(unsafe: string) {
    return unsafe
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
  }

  function highlightJson(jsonStr: string) {
    try {
      const obj = typeof jsonStr === 'string' ? JSON.parse(jsonStr) : jsonStr
      const pretty = JSON.stringify(obj, null, 2)
      const escaped = escapeHtml(pretty)
      // Wrap keys, strings, numbers, booleans, null
      return escaped
        .replace(
          /(\"(.*?)\")(?=\s*:)/g,
          '<span class="text-indigo-400">$1</span>'
        )
        .replace(
          /:(\s*)(\".*?\")/g,
          ':$1<span class="text-emerald-400">$2</span>'
        )
        .replace(
          /:(\s*)(-?\d+(?:\.\d+)?)/g,
          ':$1<span class="text-orange-400">$2</span>'
        )
        .replace(
          /\b(true|false|null)\b/g,
          '<span class="text-purple-400">$1</span>'
        )
    } catch (e) {
      // Not valid JSON, just escape and return raw
      return escapeHtml(jsonStr)
    }
  }

  // Function to decode HTML entities
  function decodeHtml(encoded: string): string {
    const textarea = document.createElement('textarea')
    textarea.innerHTML = encoded
    return textarea.value
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
            <ProviderSelector />
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

      <Dialog open={isModelDialogOpen} onOpenChange={setIsModelDialogOpen}>
        <DialogContent className="max-w-[520px]">
          <DialogHeader>
            <DialogTitle>Select Copilot Model</DialogTitle>
            <DialogDescription>
              Choose the AI model for CopilotAPI responses.
            </DialogDescription>
          </DialogHeader>
          <ModelSelector />
        </DialogContent>
      </Dialog>

      <Dialog open={isToolsDialogOpen} onOpenChange={setIsToolsDialogOpen}>
        <DialogContent className="max-w-[520px] bg-primary text-primaryAccent">
          <DialogHeader>
            <DialogTitle>Tools</DialogTitle>
            <DialogDescription>
              Tool calls seen in the current chat session.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {toolCalls.length === 0 ? (
              <div className="text-muted-foreground text-sm">
                No tool calls yet.
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {toolCalls.map((tc, idx) => (
                  <div
                    key={
                      tc.id ||
<<<<<<< HEAD
                      `${tc.function?.name || 'unknown'}-${idx}`
=======
                      `${tc.function.name}-${idx}`
>>>>>>> 2402ca3 (fix: update ToolCall interface to OpenAI format and fix build issues)
                    }
                    className="cursor-default rounded-full bg-accent px-2 py-1.5 text-xs"
                  >
                    <p className="font-dmmono uppercase text-primary/80">
<<<<<<< HEAD
                      {tc.function?.name || 'Unknown Tool'}
=======
                      {tc.function.name}
>>>>>>> 2402ca3 (fix: update ToolCall interface to OpenAI format and fix build issues)
                    </p>
                  </div>
                ))}
              </div>
            )}

            <div className="border-t pt-3">
              <h3 className="mb-2 text-sm font-medium">Run a tool</h3>
              <div className="flex items-center gap-2">
                <select
                  className="rounded border bg-primary px-2 py-1 text-sm"
                  value={selectedTool}
                  onChange={(e) => setSelectedTool(e.target.value)}
                >
                  <option value="">-- Select tool --</option>
                  <option value="read_file">read_file</option>
                  <option value="write_file">write_file</option>
                  <option value="list_files">list_files</option>
                  <option value="list_dir">list_dir</option>
                  <option value="grep_search">grep_search</option>
                  <option value="run_command">run_command</option>
                </select>

                {selectedTool === 'read_file' && (
                  <input
                    className="flex-1 rounded border bg-primary px-2 py-1 text-sm"
                    placeholder="path (e.g. ui/src/app/page.tsx)"
                    value={toolInput.path ?? ''}
                    onChange={(e) =>
                      setToolInput((s) => ({ ...s, path: e.target.value }))
                    }
                  />
                )}

                {selectedTool === 'write_file' && (
                  <textarea
                    className="flex-1 rounded border bg-primary px-2 py-1 text-sm"
                    placeholder="path"
                    value={toolInput.content ?? ''}
                    onChange={(e) =>
                      setToolInput((s) => ({ ...s, content: e.target.value }))
                    }
                  />
                )}

                {selectedTool === 'write_file' && (
                  <input
                    className="flex-1 rounded border bg-primary px-2 py-1 text-sm"
                    placeholder="path"
                    value={toolInput.path ?? ''}
                    onChange={(e) =>
                      setToolInput((s) => ({ ...s, path: e.target.value }))
                    }
                  />
                )}

                {selectedTool === 'list_files' && (
                  <input
                    className="flex-1 rounded border bg-primary px-2 py-1 text-sm"
                    placeholder="glob (e.g. ui/src/**)"
                    value={toolInput.glob ?? ''}
                    onChange={(e) =>
                      setToolInput((s) => ({ ...s, glob: e.target.value }))
                    }
                  />
                )}

                {selectedTool === 'list_dir' && (
                  <input
                    className="flex-1 rounded border bg-primary px-2 py-1 text-sm"
                    placeholder="path (e.g. ui/src)"
                    value={toolInput.path ?? ''}
                    onChange={(e) =>
                      setToolInput((s) => ({ ...s, path: e.target.value }))
                    }
                  />
                )}

                {selectedTool === 'grep_search' && (
                  <>
                    <input
                      className="flex-1 rounded border bg-primary px-2 py-1 text-sm"
                      placeholder="query (regex)"
                      value={toolInput.query ?? ''}
                      onChange={(e) =>
                        setToolInput((s) => ({ ...s, query: e.target.value }))
                      }
                    />
                    <input
                      className="w-48 rounded border bg-primary px-2 py-1 text-sm"
                      placeholder="include pattern (optional)"
                      value={toolInput.include ?? ''}
                      onChange={(e) =>
                        setToolInput((s) => ({ ...s, include: e.target.value }))
                      }
                    />
                  </>
                )}

                {selectedTool === 'run_command' && (
                  <input
                    className="flex-1 rounded border bg-primary px-2 py-1 text-sm"
                    placeholder="command (e.g. ls -la)"
                    value={toolInput.command ?? ''}
                    onChange={(e) =>
                      setToolInput((s) => ({ ...s, command: e.target.value }))
                    }
                  />
                )}

                <Button
                  size="sm"
                  onClick={handleRunTool}
                  disabled={!selectedTool || isRunningTool}
                >
                  Run
                </Button>

                <script>
                  {/* noop to satisfy jsx parsing in older parser (removed at build) */}
                </script>
              </div>

              <div className="mt-3">
                <div className="flex items-center justify-between">
                  <label className="text-muted-foreground block text-xs">
                    Output
                  </label>
                  <div className="flex items-center gap-2">
                    <button
                      className="text-muted-foreground text-xs hover:text-primary"
                      onClick={() => copyOutput()}
                      type="button"
                    >
                      Copy
                    </button>
                  </div>
                </div>

                <div className="mt-2">
                  {toolError && (
                    <div className="mb-2 rounded border border-red-400 bg-red-50 p-2 text-xs text-red-700">
                      {toolError}
                    </div>
                  )}

                  <div className="max-h-44 overflow-auto rounded border bg-muted p-2 text-xs">
                    {toolOutput ? (
                      <Highlight
                        {...defaultProps}
                        code={toolOutput}
                        language={(() => {
                          try {
                            JSON.parse(toolOutput)
                            return 'json'
                          } catch {
                            return 'bash'
                          }
                        })()}
                        theme={theme}
                      >
                        {({
                          className,
                          style,
                          tokens,
                          getLineProps,
                          getTokenProps
                        }) => (
                          <pre
                            className={`${className} m-0 whitespace-pre`}
                            style={style}
                          >
                            {tokens.map((line, i) => (
                              <div key={i} {...getLineProps({ line, key: i })}>
                                {line.map((token, key) => (
                                  <span
                                    key={key}
                                    {...getTokenProps({ token, key })}
                                  />
                                ))}
                              </div>
                            ))}
                          </pre>
                        )}
                      </Highlight>
                    ) : (
                      'No output'
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <div className="relative w-full">
        <div className="pointer-events-auto absolute bottom-2 left-2 z-10 flex items-center gap-x-1">
          {mode === 'agent' && (
            <>
              <Tooltip content="Run as job" side="top" delayDuration={300}>
                <Button
                  type="button"
                  aria-label="Run message as job"
                  title="Run message as job"
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
                aria-label="Open tools"
                title="Open tools"
                variant="ghost"
                size="icon"
                className="h-8 w-8 rounded-lg"
                onClick={() => {
                  setIsToolsDialogOpen(true)
                }}
              >
                <Icon type="hammer" size="xs" />
              </Button>
            </>
          )}

          <Button
            type="button"
            aria-label="Select agent or team"
            title="Select agent or team"
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
            aria-label="Copilot status and controls"
            title="Copilot status and controls"
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

          {provider === 'copilotapi' && (
            <Button
              type="button"
              aria-label="Select Copilot model"
              title="Select Copilot model"
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-lg"
              onClick={() => {
                setIsModelDialogOpen(true)
              }}
            >
              <Icon type="agent" size="xs" />
            </Button>
          )}
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
          rows={4}
        />
      </div>
      <Button
        data-testid="send-inside-composer"
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
