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

export function ProviderSelector() {
  const { provider, setProvider } = useStore()

  return (
    <Select
      value={provider}
      onValueChange={(value) => setProvider(value as 'bridge' | 'copilotapi')}
    >
      <SelectTrigger className="h-9 w-full rounded-xl border border-primary/15 bg-primaryAccent text-xs font-medium uppercase">
        <SelectValue />
      </SelectTrigger>
      <SelectContent className="border-none bg-primaryAccent font-dmmono shadow-lg">
        <SelectItem value="bridge" className="cursor-pointer">
          <div className="text-xs font-medium uppercase">Bridge</div>
        </SelectItem>
        <SelectItem value="copilotapi" className="cursor-pointer">
          <div className="text-xs font-medium uppercase">CopilotAPI</div>
        </SelectItem>
      </SelectContent>
    </Select>
  )
}