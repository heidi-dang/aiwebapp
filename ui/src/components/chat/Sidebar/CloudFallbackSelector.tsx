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

export function CloudFallbackSelector() {
  const { cloudFallbackEnabled, setCloudFallbackEnabled } = useStore()
  const value = cloudFallbackEnabled ? 'on' : 'off'

  return (
    <Select
      value={value}
      onValueChange={(next) => setCloudFallbackEnabled(next === 'on')}
    >
      <SelectTrigger className="h-9 w-full rounded-xl border border-primary/15 bg-primaryAccent text-xs font-medium uppercase">
        <SelectValue />
      </SelectTrigger>
      <SelectContent className="border-none bg-primaryAccent font-dmmono shadow-lg">
        <SelectItem value="on" className="cursor-pointer">
          <div className="flex items-center gap-3 text-xs font-medium uppercase">
            Cloud fallback on
          </div>
        </SelectItem>
        <SelectItem value="off" className="cursor-pointer">
          <div className="flex items-center gap-3 text-xs font-medium uppercase">
            Cloud fallback off
          </div>
        </SelectItem>
      </SelectContent>
    </Select>
  )
}

