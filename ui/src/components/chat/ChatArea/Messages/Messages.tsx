'use client'

import type { ChatMessage } from '@/types/os'

import { AgentMessage, UserMessage } from './MessageItem'
import Tooltip from '@/components/ui/tooltip'
import { memo } from 'react'
import { ReasoningStepProps, ReasoningProps, ReferenceData, Reference } from '@/types/os'
import React, { type FC } from 'react'

import Icon from '@/components/ui/icon'
import ChatBlankState from './ChatBlankState'
import { motion, AnimatePresence } from 'framer-motion'
import { useStore } from '@/store'


interface MessageListProps {
  messages: ChatMessage[]
}

interface MessageWrapperProps {
  message: ChatMessage
  isLastMessage: boolean
}

interface ReferenceProps {
  references: ReferenceData[]
}

interface ReferenceItemProps {
  reference: Reference
}

const ReferenceItem: FC<ReferenceItemProps> = ({ reference }) => (
  <div className="relative flex h-[63px] w-[190px] cursor-default flex-col justify-between overflow-hidden rounded-md bg-background-secondary p-3 transition-colors hover:bg-background-secondary/80">
    <p className="text-sm font-medium text-primary">{reference.name}</p>
    <p className="truncate text-xs text-primary/40">{reference.content}</p>
  </div>
)

const References: FC<ReferenceProps> = ({ references }) => (
  <div className="flex flex-col gap-4">
    {references.map((referenceData, index) => (
      <div
        key={`${referenceData.query}-${index}`}
        className="flex flex-col gap-3"
      >
        <div className="flex flex-wrap gap-3">
          {referenceData.references.map((reference, refIndex) => (
            <ReferenceItem
              key={`${reference.name}-${reference.meta_data.chunk}-${refIndex}`}
              reference={reference}
            />
          ))}
        </div>
      </div>
    ))}
  </div>
)

const AgentMessageWrapper = ({ message, isLastMessage }: MessageWrapperProps & { isLastMessage?: boolean }) => {
  const { isStreaming } = useStore()
  const isThinking = isStreaming && isLastMessage

  return (
    <div className={`flex flex-col gap-y-9 transition-all duration-500 ${isThinking ? 'opacity-90' : 'opacity-100'}`}>

      {Array.isArray(message.extra_data?.reasoning_steps) &&
        message.extra_data.reasoning_steps.length > 0 && (
          <div className="flex items-start gap-4">
            <Tooltip
              delayDuration={0}
              content={<p className="text-accent">Reasoning</p>}
              side="top"
            >
              <Icon type="reasoning" size="sm" />
            </Tooltip>
            <div className="flex flex-col gap-3">
              <p className="text-xs uppercase">Reasoning</p>
              <Reasonings reasoning={message.extra_data.reasoning_steps} />
            </div>
          </div>
        )}
      {message.extra_data?.references &&
        message.extra_data.references.length > 0 && (
          <div className="flex items-start gap-4">
            <Tooltip
              delayDuration={0}
              content={<p className="text-accent">References</p>}
              side="top"
            >
              <Icon type="references" size="sm" />
            </Tooltip>
            <div className="flex flex-col gap-3">
              <References references={message.extra_data.references} />
            </div>
          </div>
        )}
      {message.tool_calls && message.tool_calls.length > 0 && (
        <div className="flex items-start gap-3">
          <Tooltip
            delayDuration={0}
            content={<p className="text-accent">Tool Calls</p>}
            side="top"
          >
            <Icon
              type="hammer"
              className="rounded-lg bg-background-secondary p-1"
              size="sm"
              color="secondary"
            />
          </Tooltip>

          <div className="flex flex-wrap gap-2">
            {message.tool_calls.map((toolCall, index) => {
              const key =
                toolCall.tool_call_id ||
                toolCall.id ||
                `${toolCall.tool_name || toolCall.function?.name || 'tool'}-${index}`
              const name = toolCall.tool_name || toolCall.function?.name || 'tool'
              const isExecuting = isThinking && index === (message.tool_calls?.length ?? 0) - 1
              return <ToolComponent key={key} name={name} status={isExecuting ? 'executing' : 'done'} />
            })}

          </div>
        </div>
      )}
      <AgentMessage message={message} />
    </div>
  )
}
const Reasoning: FC<ReasoningStepProps> = ({ index, stepTitle }) => (
  <div className="flex items-center gap-2 text-secondary">
    <div className="flex h-[20px] items-center rounded-md bg-background-secondary p-2">
      <p className="text-xs">STEP {index + 1}</p>
    </div>
    <p className="text-xs">{stepTitle}</p>
  </div>
)
const Reasonings: FC<ReasoningProps> = ({ reasoning }) => (
  <div className="flex flex-col items-start justify-center gap-2">
    {reasoning.map((title, index) => (
      <Reasoning
        key={`${title.title}-${title.action}-${index}`}
        stepTitle={title.title}
        index={index}
      />
    ))}
  </div>
)

const ToolComponent = memo(({ name, status = 'done' }: { name: string; status?: 'executing' | 'done' }) => (
  <div className={`cursor-default rounded-full px-2 py-1.5 text-xs transition-all duration-300 ${
    status === 'executing' 
      ? 'bg-purple-500/20 text-purple-300 animate-pulse border border-purple-500/30 shadow-[0_0_10px_rgba(168,85,247,0.2)]' 
      : 'bg-accent text-primary/80'
  }`}>
    <p className="font-dmmono uppercase">{name}</p>
  </div>
))
ToolComponent.displayName = 'ToolComponent'
const Messages = memo(({ messages }: MessageListProps) => {
  if (messages.length === 0) {
    return <ChatBlankState />
  }

  return (
    <div className="flex flex-col gap-6">
      <AnimatePresence initial={false}>
        {messages.map((message, index) => {
          const key = `${message.role}-${message.created_at}-${index}`
          const isLastMessage = index === messages.length - 1

          return (
            <motion.div
              key={key}
              initial={{ opacity: 0, y: 10, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.3, ease: 'easeOut' }}
            >
              {message.role === 'agent' ? (
                <AgentMessageWrapper
                  message={message}
                  isLastMessage={isLastMessage}
                />
              ) : (
                <UserMessage message={message} />
              )}
            </motion.div>
          )
        })}
      </AnimatePresence>
    </div>
  )
})

Messages.displayName = 'Messages'

export default Messages
