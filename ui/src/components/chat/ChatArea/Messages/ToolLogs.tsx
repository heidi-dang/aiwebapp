'use client'

import { useState } from 'react'
import Icon from '@/components/ui/icon'

export interface ToolExecution {
  id: string
  name: string
  status: 'running' | 'success' | 'failure'
  args?: Record<string, unknown>
  output?: string
  timestamp: number
  duration?: number
}

function ToolLogItem({ tool }: { tool: ToolExecution }) {
  const [isExpanded, setIsExpanded] = useState(tool.status !== 'success')

  const toggleExpand = () => setIsExpanded(!isExpanded)

  return (
    <div className="rounded-lg border border-primary/10 bg-accent/30 overflow-hidden">
      <div
        className="flex items-center justify-between p-3 cursor-pointer hover:bg-accent/50 transition-colors"
        onClick={toggleExpand}
      >
        <div className="flex items-center gap-2 overflow-hidden">
          <div className="shrink-0">
            {tool.status === 'running' && (
              <div className="h-2 w-2 animate-pulse rounded-full bg-blue-400" />
            )}
            {tool.status === 'success' && (
              <Icon type="check" size="xs" className="text-green-400" />
            )}
            {tool.status === 'failure' && (
              <Icon type="x" size="xs" className="text-red-400" />
            )}
          </div>
          <span className="font-mono text-xs font-medium text-primary truncate">
            {tool.name}
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {tool.duration && (
            <span className="text-[10px] text-muted">
              {Math.round(tool.duration)}ms
            </span>
          )}
          <Icon
            type="chevron-down"
            size="xs"
            className={`text-muted transition-transform ${isExpanded ? 'rotate-180' : ''}`}
          />
        </div>
      </div>

      {isExpanded && (
        <div className="border-t border-primary/10 bg-background/30 p-3 space-y-3">
          {tool.args && Object.keys(tool.args).length > 0 && (
            <div className="space-y-1">
              <div className="text-[10px] uppercase text-muted font-semibold tracking-wider">
                Input
              </div>
              <div className="rounded bg-background/50 p-2 overflow-x-auto">
                <pre className="text-[10px] text-secondary font-mono leading-relaxed">
                  {JSON.stringify(tool.args, null, 2)}
                </pre>
              </div>
            </div>
          )}

          {tool.output && (
            <div className="space-y-1">
              <div className="text-[10px] uppercase text-muted font-semibold tracking-wider">
                Output
              </div>
              <div className="rounded bg-black/80 border border-white/10 p-2 overflow-x-auto max-h-64 overflow-y-auto">
                <pre className="text-[10px] text-green-400 font-mono leading-relaxed whitespace-pre-wrap">
                  {tool.output}
                </pre>
              </div>
            </div>
          )}

          {!tool.output && tool.status === 'running' && (
            <div className="text-[10px] text-muted italic">
              Waiting for output...
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function ToolLogs({ tools }: { tools: ToolExecution[] }) {
  if (tools.length === 0) return null

  return (
    <div className="space-y-2">
      {tools.map((tool) => (
        <ToolLogItem key={tool.id} tool={tool} />
      ))}
    </div>
  )
}
