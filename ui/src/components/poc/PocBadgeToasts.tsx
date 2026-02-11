'use client'

import { useEffect } from 'react'
import { toast } from 'sonner'
import { useStore } from '@/store'

const badgeMeta: Record<string, { title: string; description: string }> = {
  first_template_created: {
    title: 'Badge Unlocked: First Template',
    description: 'You created your first template.'
  },
  all_claims_verified: {
    title: 'Badge Unlocked: All Verified',
    description: 'Perfect run completed.'
  },
  streak_5: {
    title: 'Badge Unlocked: Streak 5',
    description: 'Five perfect runs in a row.'
  },
  clean_build: {
    title: 'Badge Unlocked: Clean Build',
    description: 'All build claims passed.'
  },
  zero_warnings: {
    title: 'Badge Unlocked: Zero Warnings',
    description: 'Perfect run with no warnings detected.'
  }
}

export function PocBadgeToasts() {
  const pocBadgeFeed = useStore((s) => s.pocBadgeFeed)
  const clearPocBadgeFeed = useStore((s) => s.clearPocBadgeFeed)

  useEffect(() => {
    if (!pocBadgeFeed.length) return
    pocBadgeFeed.forEach((e) => {
      const meta = badgeMeta[e.badgeId] ?? {
        title: `Badge Unlocked: ${e.badgeId}`,
        description: 'Achievement unlocked.'
      }
      toast.success(meta.title, { description: meta.description })
    })
    clearPocBadgeFeed()
  }, [pocBadgeFeed, clearPocBadgeFeed])

  return null
}

