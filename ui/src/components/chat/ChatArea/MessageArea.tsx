'use client'

import { useStore } from '@/store'
import Messages from './Messages'
import ScrollToBottom from '@/components/chat/ChatArea/ScrollToBottom'
import { StickToBottom } from 'use-stick-to-bottom'
import { useIsMobile } from '@/hooks/useIsMobile'

const MessageArea = () => {
  const { messages } = useStore()
  const isMobile = useIsMobile(430, true)

  return (
    <StickToBottom
      className={
        isMobile
          ? 'relative mb-3 flex max-h-[calc(100dvh-112px)] min-h-0 flex-grow flex-col'
          : 'relative mb-4 flex max-h-[calc(100vh-64px)] min-h-0 flex-grow flex-col'
      }
      resize="smooth"
      initial="smooth"
    >
      <StickToBottom.Content className="flex min-h-full flex-col justify-center">
        <div
          className={
            isMobile
              ? 'mx-auto w-full max-w-2xl space-y-6 px-3 pb-3'
              : 'mx-auto w-full max-w-2xl space-y-9 px-4 pb-4'
          }
        >
          <Messages messages={messages} />
        </div>
      </StickToBottom.Content>
      <ScrollToBottom />
    </StickToBottom>
  )
}

export default MessageArea
