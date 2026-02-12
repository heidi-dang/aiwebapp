'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import React from 'react'

const EXTERNAL_LINKS = {
  documentation: 'https://agno.link/agent-ui',
  agenOS: 'https://os.agno.com',
  agno: 'https://agno.com'
}

interface ActionButtonProps {
  href: string
  variant?: 'primary'
  text: string
}

const ActionButton = ({ href, variant, text }: ActionButtonProps) => {
  const baseStyles =
    'px-4 py-2 text-[11px] transition-all font-dmmono tracking-[0.1em] uppercase'
  const variantStyles = {
    primary: 'border border-white/10 hover:bg-white/5 rounded-xl backdrop-blur-sm shadow-sm'
  }

  return (
    <Link
      href={href}
      target="_blank"
      className={`${baseStyles} ${variant ? variantStyles[variant] : ''} hover:scale-105 active:scale-95`}
    >
      {text}
    </Link>
  )
}

const ChatBlankState = () => {
  return (
    <section
      className="flex flex-col items-center justify-center min-h-[400px] text-center font-geist"
      aria-label="Welcome message"
    >
      <div className="flex max-w-xl flex-col gap-y-10 glass border-white/5 rounded-[2rem] p-12 shadow-2xl">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6, ease: 'backOut' }}
          className="flex flex-col items-center gap-4"
        >
          <div className="h-16 w-16 rounded-3xl bg-primaryAccent border border-white/10 flex items-center justify-center shadow-inner">
             {/* Simple spark/star icon for welcome */}
             <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 2L14.5 9.5L22 12L14.5 14.5L12 22L9.5 14.5L2 12L9.5 9.5L12 2Z" fill="white" fillOpacity="0.8"/>
             </svg>
          </div>
          <h1 className="text-3xl font-[600] tracking-tight text-primary">
            Welcome to AIWebApp
          </h1>
          <p className="text-[15px] leading-relaxed text-muted/70 max-w-sm">
            Your high-performance workspace for intelligent agents and seamless automation.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.4 }}
          className="flex flex-col items-center gap-6"
        >
          <div className="h-px w-12 bg-white/10" />
          <ActionButton
            href={EXTERNAL_LINKS.documentation}
            variant="primary"
            text="Explore Documentation"
          />
        </motion.div>
      </div>
    </section>
  )
}

export default ChatBlankState
