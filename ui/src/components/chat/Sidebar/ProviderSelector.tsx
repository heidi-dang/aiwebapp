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
  const { provider, setProvider } = useStore()

  return (
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
  )
}
