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
import { Input } from '@/components/ui/input'

// Hard‑code any models you want to expose to users here.
const models = [
  'auto',
  'gpt-4o',
  'gpt-4o-mini',
  'grok-code-fast-1',
  'gpt-5',
  'gpt-5-mini',
  'copilot-fast',
  'claude-sonnet-4',
  'claude-opus-4.5'
]

export function ModelSelector() {
  const selectedModel = useStore((state) => state.selectedModel)
  const setSelectedModel = useStore((state) => state.setSelectedModel)
  const provider = useStore((state) => state.provider)
  const availableModels = useStore((state) => state.availableModels)
  const [query, setQuery] = React.useState('')

  const options = React.useMemo(() => {
    const base =
      availableModels.length > 0 ? availableModels : models
    const cleaned =
      provider === 'ollama' && availableModels.length > 0
        ? base.filter((m) => m !== 'auto')
        : base
    const q = query.trim().toLowerCase()
    if (!q) return cleaned
    return cleaned.filter((m) => m.toLowerCase().includes(q))
  }, [availableModels, provider, query])

  return (
    <Select
      value={selectedModel}
      onValueChange={(value) => setSelectedModel(value)}
    >
      <SelectTrigger className="h-9 w-full rounded-xl border border-primary/15 bg-primaryAccent text-xs font-medium uppercase">
        <SelectValue placeholder="Select Model" />
      </SelectTrigger>
      <SelectContent className="border-none bg-primaryAccent font-dmmono shadow-lg">
        <div className="p-1">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={provider === 'ollama' ? 'Search local models…' : 'Search models…'}
            className="h-9 rounded-xl border border-primary/15 bg-background/60 text-xs"
          />
        </div>
        {options.length === 0 ? (
          <div className="px-3 py-2 text-xs text-secondary">No models found</div>
        ) : (
          options.map((model) => {
            const iconType = getProviderIcon(model) ?? 'open-ai'
            return (
              <SelectItem key={model} value={model} className="cursor-pointer">
                <div className="flex items-center gap-3 text-xs font-medium uppercase">
                  <Icon type={iconType} size="xs" />
                  {model}
                </div>
              </SelectItem>
            )
          })
        )}
      </SelectContent>
    </Select>
  )
}

export default ModelSelector
