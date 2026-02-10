'use client'

import { useMemo } from 'react'
import { useStore } from '@/store'

function estimateTokens(text: string) {
  return Math.ceil(text.length / 4)
}

const modelContextLimits: Record<string, number> = {
  auto: 128000,
  'gpt-4o': 128000,
  'gpt-4o-mini': 128000,
  'grok-code-fast-1': 128000,
  'gpt-5': 200000,
  'gpt-5-mini': 128000,
  'copilot-fast': 16384,
  'claude-sonnet-4': 200000,
  'claude-opus-4.5': 200000
}

export function TokenBudgetBar() {
  const { messages, systemPromptMode, systemPromptCustom, selectedModel } =
    useStore()

  const { used, budget, pct } = useMemo(() => {
    const budget = modelContextLimits[selectedModel] ?? 32000
    const messageTokens = messages.reduce((sum, m) => {
      const content = typeof m.content === 'string' ? m.content : ''
      return sum + (content ? estimateTokens(content) : 0)
    }, 0)
    const systemPrompt =
      systemPromptMode === 'custom'
        ? systemPromptCustom
        : systemPromptMode === 'strict'
          ? 'strict'
          : ''
    const systemTokens = systemPrompt ? estimateTokens(systemPrompt) : 0
    const used = messageTokens + systemTokens
    const pct = Math.min(1, used / budget)
    return { used, budget, pct }
  }, [messages, selectedModel, systemPromptCustom, systemPromptMode])

  const barClass =
    pct >= 0.95 ? 'bg-red-500' : pct >= 0.8 ? 'bg-yellow-500' : 'bg-primary'

  return (
    <div className="mb-2 w-full rounded-xl border border-accent bg-primaryAccent px-3 py-2">
      <div className="flex items-center justify-between text-[11px] font-medium uppercase text-primary/80">
        <div>Token Budget</div>
        <div>
          {used.toLocaleString()} / {budget.toLocaleString()} est
        </div>
      </div>
      <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-accent">
        <div
          className={`h-2 ${barClass}`}
          style={{ width: `${Math.round(pct * 100)}%` }}
        />
      </div>
    </div>
  )
}

