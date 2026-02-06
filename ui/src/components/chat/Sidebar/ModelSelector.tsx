'use client';

import * as React from 'react';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem
} from '@/components/ui/select';
import { useStore } from '@/store';
import Icon from '@/components/ui/icon';
import { getProviderIcon } from '@/lib/modelProvider';

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
];

export function ModelSelector() {
  const selectedModel = useStore((state) => state.selectedModel);
  const setSelectedModel = useStore((state) => state.setSelectedModel);

  return (
    <Select
      value={selectedModel}
      onValueChange={(value) => setSelectedModel(value)}
    >
      <SelectTrigger className="h-9 w-full rounded-xl border border-primary/15 bg-primaryAccent text-xs font-medium uppercase">
        <SelectValue placeholder="Select Model" />
      </SelectTrigger>
      <SelectContent className="border-none bg-primaryAccent font-dmmono shadow-lg">
        {models.map((model) => {
          const iconType = getProviderIcon(model) ?? 'open-ai';
          return (
            <SelectItem key={model} value={model} className="cursor-pointer">
              <div className="flex items-center gap-3 text-xs font-medium uppercase">
                <Icon type={iconType} size="xs" />
                {model}
              </div>
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
}

export default ModelSelector;