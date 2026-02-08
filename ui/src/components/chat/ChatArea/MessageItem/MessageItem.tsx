import { memo } from 'react'
import { useStore } from '@/store'
import Icon from '@/components/ui/icon'
import MarkdownRenderer from '@/components/chat/ChatArea/Messages/MarkdownRenderer'
import Videos from '@/components/chat/ChatArea/Messages/Videos'
import Images from '@/components/chat/ChatArea/Messages/Images'
import Audios from '@/components/chat/ChatArea/Messages/Audios'
import RunCard from '@/components/chat/ChatArea/Messages/RunCard'
import AgentThinkingLoader from '@/components/chat/ChatArea/Messages/AgentThinkingLoader'
import type { ChatMessage } from '@/types/os'

interface MessageProps {
  message: ChatMessage
}

const AgentMessage = memo(({ message }: MessageProps) => {
  const { streamingErrorMessage } = useStore()
  let messageContent
  const runnerJobId = message.extra_data?.runner_job_id
  const mode = useStore((s) => s.mode)

  if (message.streamingError) {
    messageContent = (
      <p className="text-destructive">
        Oops! Something went wrong while streaming.{' '}
        {streamingErrorMessage ? (
          <>{streamingErrorMessage}</>
        ) : (
          'Please try refreshing the page or try again later.'
        )}
      </p>
    )
  } else if (runnerJobId) {
    // In chat mode we should not show RunCards or plan/tools — show plain content instead
    if (mode === 'agent') {
      messageContent = (
        <div className="flex w-full flex-col gap-4">
          <RunCard jobId={runnerJobId} />
        </div>
      )
    } else {
      messageContent = (
        <div className="flex w-full flex-col gap-4">
          {message.content ? (
            <MarkdownRenderer>{message.content}</MarkdownRenderer>
          ) : (
            <div className="text-xs text-muted">Agent response</div>
          )}
        </div>
      )
    }
  } else if (message.content) {
    messageContent = (
      <div className="flex w-full flex-col gap-4">
        <MarkdownRenderer>{message.content}</MarkdownRenderer>
        {message.videos && message.videos.length > 0 && (
          <Videos videos={message.videos} />
        )}
        {message.images && message.images.length > 0 && (
          <Images images={message.images} />
        )}
        {message.audio && message.audio.length > 0 && (
          <Audios audio={message.audio} />
        )}
      </div>
    )
  } else {
    messageContent = (
      <div className="mt-2">
        <AgentThinkingLoader />
      </div>
    )
  }

  return (
    <div className="flex flex-row items-start gap-4 font-geist">
      <div className="flex-shrink-0">
        <Icon type="agent" size="sm" />
      </div>
      {messageContent}
    </div>
  )
})

const UserMessage = memo(({ message }: MessageProps) => {
  return (
    <div className="flex items-start gap-4 pt-4 text-start max-md:break-words">
      <div className="flex-shrink-0">
        <Icon type="user" size="sm" />
      </div>
      <div className="text-md rounded-lg font-geist text-secondary">
        {message.content}
      </div>
    </div>
  )
})

AgentMessage.displayName = 'AgentMessage'
UserMessage.displayName = 'UserMessage'
export { AgentMessage, UserMessage }