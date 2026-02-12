'use client'

import ChatInput from './ChatInput'
import MessageArea from './MessageArea'
import { useIsMobile } from '@/hooks/useIsMobile'
const ChatArea = () => {
  const isMobile = useIsMobile(430, true)
  return (
    <main
      className={
        isMobile
          ? 'relative flex flex-grow flex-col bg-background/40 backdrop-blur-sm'
          : 'relative m-2 flex flex-grow flex-col rounded-2xl glass-dark shadow-2xl border-white/5'
      }
    >
      <MessageArea />
      <div
        className={
          isMobile
            ? 'sticky bottom-0 px-3 pb-2'
            : 'sticky bottom-0 ml-9 px-4 pb-2'
        }
      >
        <ChatInput />
      </div>
    </main>
  )
}

export default ChatArea
