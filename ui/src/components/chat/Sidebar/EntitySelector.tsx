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
import { useQueryState } from 'nuqs'
import Icon from '@/components/ui/icon'
import { useEffect } from 'react'
import useChatActions from '@/hooks/useChatActions'
import { Button } from '@/components/ui/button'
import { createAgentAPI } from '@/api/os'
import { toast } from 'sonner'

export function EntitySelector() {
  const { mode, agents, teams, setMessages, setSelectedModel, selectedEndpoint, authToken, setAgents } = useStore()

  const { focusChatInput } = useChatActions()
  const [agentId, setAgentId] = useQueryState('agent', {
    parse: (value) => value || undefined,
    history: 'push'
  })
  const [teamId, setTeamId] = useQueryState('team', {
    parse: (value) => value || undefined,
    history: 'push'
  })
  const [, setSessionId] = useQueryState('session')

  const currentEntities = mode === 'team' ? teams : agents
  const currentValue = mode === 'team' ? teamId : agentId
  const placeholder = mode === 'team' ? 'Select Team' : 'Select Agent'

  useEffect(() => {
    if (currentValue && currentEntities.length > 0) {
      const entity = currentEntities.find((item) => item.id === currentValue)
      if (entity) {
        setSelectedModel(entity.model?.model || '')
        if (mode === 'team') {
          setTeamId(entity.id)
        }
        if (entity.model?.model) {
          focusChatInput()
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentValue, currentEntities, setSelectedModel, mode])

  const handleOnValueChange = (value: string) => {
    const newValue = value === currentValue ? null : value
    const selectedEntity = currentEntities.find((item) => item.id === newValue)

    setSelectedModel(selectedEntity?.model?.provider || '')

    if (mode === 'team') {
      setTeamId(newValue)
      setAgentId(null)
    } else {
      setAgentId(newValue)
      setTeamId(null)
    }

    setMessages([])
    setSessionId(null)

    if (selectedEntity?.model?.provider) {
      focusChatInput()
    }
  }

  if (currentEntities.length === 0) {
    const handleCreateDefaultAgent = async () => {
      const defaultAgent = {
        id: 'agent_default',
        name: 'Default Agent',
        model: {
          provider: 'openai',
          model: 'gpt-4o',
          name: 'GPT-4o'
        },
        db_id: 'db_default'
      }

      // Optimistic update
      setAgents([...agents, defaultAgent])

      const created = await createAgentAPI(selectedEndpoint, defaultAgent, authToken)
      if (created) {
        toast.success('Default agent created')
        setAgents([...agents, created])
      }
    }

    return (
      <div className="flex flex-col gap-2">
        <Select disabled>
          <SelectTrigger className="h-9 w-full rounded-xl border border-primary/15 bg-primaryAccent text-xs font-medium uppercase opacity-50">
            <SelectValue placeholder={`No ${mode}s Available`} />
          </SelectTrigger>
        </Select>
        {mode === 'agent' && (
          <Button onClick={handleCreateDefaultAgent} variant="outline" size="sm" className="w-full">
            Add Default Agent
          </Button>
        )}
      </div>
    )
  }

  return (
    <Select
      value={currentValue || ''}
      onValueChange={(value) => handleOnValueChange(value)}
    >
      <SelectTrigger className="h-9 w-full rounded-xl border border-primary/15 bg-primaryAccent text-xs font-medium uppercase">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent className="border-none bg-primaryAccent font-dmmono shadow-lg">
        {currentEntities.map((entity, index) => (
          <SelectItem
            className="cursor-pointer"
            key={`${entity.id}-${index}`}
            value={entity.id}
          >
            <div className="flex items-center gap-3 text-xs font-medium uppercase">
              <Icon type={'user'} size="xs" />
              {entity.name || entity.id}
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
