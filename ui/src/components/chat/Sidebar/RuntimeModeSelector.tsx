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

export function RuntimeModeSelector() {
  const { runtimeMode, setRuntimeMode } = useStore()

  return (
    <Select
      value={runtimeMode}
      onValueChange={(value) => setRuntimeMode(value as 'local' | 'sandbox')}
    >
      <SelectTrigger className="h-9 w-full rounded-xl border border-primary/15 bg-primaryAccent text-xs font-medium uppercase">
        <SelectValue />
      </SelectTrigger>
      <SelectContent className="border-none bg-primaryAccent font-dmmono shadow-lg">
        <SelectItem value="sandbox" className="cursor-pointer">
          <div className="flex items-center gap-3 text-xs font-medium uppercase">
            Sandbox
          </div>
        </SelectItem>
        <SelectItem value="local" className="cursor-pointer">
          <div className="flex items-center gap-3 text-xs font-medium uppercase">
            Local
          </div>
        </SelectItem>
      </SelectContent>
    </Select>
  )
}

