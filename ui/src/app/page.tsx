'use client'
import Sidebar from '@/components/chat/Sidebar/Sidebar'
import { ChatArea } from '@/components/chat/ChatArea'
import { Suspense, useEffect, useState } from 'react'
import { useIsMobile } from '@/hooks/useIsMobile'
import { Button } from '@/components/ui/button'
import Icon from '@/components/ui/icon'
import { Dialog, DialogOverlay, DialogPortal } from '@/components/ui/dialog'
import { motion } from 'framer-motion'
import { useStore } from '@/store'

export default function Home() {
  // Check if OS_SECURITY_KEY is defined on server-side
  const hasEnvToken = !!process.env.NEXT_PUBLIC_OS_SECURITY_KEY
  const envToken = process.env.NEXT_PUBLIC_OS_SECURITY_KEY || ''
  const hydrated = useStore((state) => state.hydrated)
  const setSelectedEndpoint = useStore((state) => state.setSelectedEndpoint)
  const isMobile = useIsMobile(430, true)
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)

  // Fetch config once on mount
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/api/config', { cache: 'no-store' })
        if (!res.ok) return
        const cfg = await res.json()
        const apiUrl = typeof cfg?.apiUrl === 'string' ? cfg.apiUrl : ''
        if (!cancelled && apiUrl) {
          setSelectedEndpoint(apiUrl)
        }
      } catch {
        // ignore
      }
    })()

    return () => {
      cancelled = true
    }
  }, [setSelectedEndpoint])

  // Don't render until store is hydrated to avoid SSR mismatch
  if (!hydrated) {
    return null
  }

  return (
    <Suspense fallback={<div>Loading...</div>}>
      {isMobile ? (
        <div className="flex h-[100dvh] flex-col bg-background/80">
          <div className="flex items-center justify-between border-b border-primary/10 bg-background px-3 py-2">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-9 w-9"
              onClick={() => setIsSidebarOpen(true)}
            >
              <Icon type="sheet" size="xs" />
            </Button>
            <div className="flex flex-1 items-center gap-2 px-2">
              <Icon type="agno" size="xs" />
              <span className="text-xs font-medium uppercase text-white">
                Agent UI
              </span>
            </div>
          </div>

          <Dialog open={isSidebarOpen} onOpenChange={setIsSidebarOpen}>
            <DialogPortal>
              <DialogOverlay
                className="z-40 bg-background/80"
                onClick={() => setIsSidebarOpen(false)}
              />
              <motion.aside
                initial={{ x: '-100%' }}
                animate={{ x: 0 }}
                exit={{ x: '-100%' }}
                transition={{ type: 'spring', stiffness: 320, damping: 30 }}
                className="fixed left-0 top-0 z-50 h-[100dvh] w-[min(20rem,90vw)] border-r border-border bg-background"
                onClick={(e) => e.stopPropagation()}
              >
                <Sidebar
                  hasEnvToken={hasEnvToken}
                  envToken={envToken}
                  isMobile
                />
              </motion.aside>
            </DialogPortal>
          </Dialog>

          <div className="flex min-h-0 flex-1">
            <ChatArea />
          </div>
        </div>
      ) : (
        <div className="flex h-screen bg-background/80">
          <Sidebar hasEnvToken={hasEnvToken} envToken={envToken} />
          <ChatArea />
        </div>
      )}
    </Suspense>
  )
}
