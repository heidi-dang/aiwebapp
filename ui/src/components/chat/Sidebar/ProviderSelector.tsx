'use client'

import * as React from 'react'
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem
} from '@/components/ui/select'
import { useStore } from '@/store'
import Icon from '@/components/ui/icon'
import { getProviderIcon } from '@/lib/modelProvider'

export function ProviderSelector() {
  const provider = useStore((s) => s.provider)
  const setProvider = useStore((s) => s.setProvider)
  const setAvailableModels = useStore((s) => s.setAvailableModels)
  const selectedModel = useStore((s) => s.selectedModel)
  const setSelectedModel = useStore((s) => s.setSelectedModel)
  const [ollamaStatus, setOllamaStatus] = React.useState<'unknown' | 'up' | 'down'>('unknown')
  const [ollamaLatencyMs, setOllamaLatencyMs] = React.useState<number | null>(null)

  const refreshOllamaModels = React.useCallback(async () => {
    const started = performance.now()
    try {
      const res = await fetch('/api/ollama/api/tags', { cache: 'no-store' })
      setOllamaStatus(res.ok ? 'up' : 'down')
      if (!res.ok) {
        setAvailableModels([])
        return
      }
      const data = await res.json()
      const models = Array.isArray(data?.models)
        ? data.models
            .map((m: { name?: unknown }) =>
              typeof m?.name === 'string' ? m.name : ''
            )
            .filter((x: string) => !!x)
        : []
      setAvailableModels(models)
      if ((selectedModel === 'auto' || !selectedModel) && models.length > 0) {
        setSelectedModel(models[0])
      }
    } catch {
      setOllamaStatus('down')
      setAvailableModels([])
    } finally {
      setOllamaLatencyMs(Math.round(performance.now() - started))
    }
  }, [selectedModel, setAvailableModels, setSelectedModel])

  React.useEffect(() => {
    if (provider !== 'ollama') return
    refreshOllamaModels()
    const t = setInterval(refreshOllamaModels, 8000)
    return () => clearInterval(t)
  }, [provider, refreshOllamaModels])

  return (
    <div className="space-y-2">
      <Select
        value={provider}
        onValueChange={(value) => setProvider(value as 'bridge' | 'copilotapi' | 'ollama')}
      >
        <SelectTrigger className="h-9 w-full rounded-xl border border-primary/15 bg-primaryAccent text-xs font-medium uppercase">
          <SelectValue />
        </SelectTrigger>
        <SelectContent className="border-none bg-primaryAccent font-dmmono shadow-lg">
          <SelectItem value="bridge" className="cursor-pointer">
            <div className="flex items-center gap-3 text-xs font-medium uppercase">
              <Icon type={getProviderIcon('bridge') ?? 'open-ai'} size="xs" />
              Bridge
            </div>
          </SelectItem>
          <SelectItem value="copilotapi" className="cursor-pointer">
            <div className="flex items-center gap-3 text-xs font-medium uppercase">
              <Icon type={getProviderIcon('copilotapi') ?? 'open-ai'} size="xs" />
              CopilotAPI
            </div>
          </SelectItem>
          <SelectItem value="ollama" className="cursor-pointer">
            <div className="flex items-center gap-3 text-xs font-medium uppercase">
              <Icon type={getProviderIcon('ollama') ?? 'open-ai'} size="xs" />
              Ollama
            </div>
          </SelectItem>
        </SelectContent>
      </Select>

      {provider === 'ollama' && (
        <div className="flex items-center justify-between rounded-xl border border-primary/10 bg-primaryAccent px-3 py-2">
          <div className="flex items-center gap-2 text-[11px] uppercase text-secondary">
            <span
              className={`h-2 w-2 rounded-full ${
                ollamaStatus === 'up'
                  ? 'bg-green-400'
                  : ollamaStatus === 'down'
                    ? 'bg-red-400'
                    : 'bg-secondary/40'
              }`}
            />
            Ollama {ollamaStatus}
            {ollamaLatencyMs !== null && (
              <span className="text-secondary/70">{ollamaLatencyMs}ms</span>
            )}
          </div>
          <button
            type="button"
            onClick={refreshOllamaModels}
            className="rounded-md border border-primary/10 bg-background/40 px-2 py-1 text-[11px] font-medium uppercase text-secondary"
          >
            Refresh
          </button>
        </div>
      )}
    </div>
  )
}
