'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useStore } from '@/store'
import { setAgentBaseDirAPI } from '@/api/os'
import { toast } from 'sonner'
import Icon from '@/components/ui/icon'

export function AgentBaseDirSelector({ agentId }: { agentId: string }) {
  const { selectedEndpoint, authToken, agents, setAgents } = useStore()
  const [isEditing, setIsEditing] = useState(false)
  const [baseDir, setBaseDir] = useState('')

  const agent = agents.find(a => a.id === agentId)
  const currentBaseDir = agent?.base_dir || ''

  const handleSave = async () => {
    if (!baseDir.trim()) {
      toast.error('Base directory cannot be empty')
      return
    }
    const res = await setAgentBaseDirAPI(selectedEndpoint, agentId, baseDir.trim(), authToken)
    if (res.ok) {
      toast.success('Base directory updated')
      // Update local state
      setAgents(agents.map(a => a.id === agentId ? { ...a, base_dir: res.base_dir } : a))
      setIsEditing(false)
    } else {
      toast.error(`Failed to update: ${res.error}${res.details ? ` (${res.details})` : ''}`)
    }
  }

  const handleCancel = () => {
    setBaseDir(currentBaseDir)
    setIsEditing(false)
  }

  return (
    <div className="flex w-full items-center gap-2 rounded-xl border border-primary/15 bg-accent p-2 text-xs">
      <Icon type="sheet" size="xs" className="shrink-0 text-muted" />
      {isEditing ? (
        <>
          <Input
            value={baseDir}
            onChange={(e) => setBaseDir(e.target.value)}
            placeholder="/path/to/folder"
            className="h-7 w-full rounded-md border border-primary/15 bg-background-secondary px-2 text-xs"
            autoFocus
          />
          <Button onClick={handleSave} size="sm" className="h-7 rounded-md">
            Save
          </Button>
          <Button onClick={handleCancel} variant="ghost" size="sm" className="h-7 rounded-md">
            Cancel
          </Button>
        </>
      ) : (
        <>
          <span className="flex-1 truncate text-muted">{currentBaseDir || 'No folder assigned'}</span>
          <Button onClick={() => setIsEditing(true)} variant="ghost" size="sm" className="h-7 rounded-md">
            <Icon type="edit" size="xxs" />
          </Button>
        </>
      )}
    </div>
  )
}
