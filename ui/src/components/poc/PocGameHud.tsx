'use client'

import { useEffect, useMemo, useState } from 'react'
import { useStore } from '@/store'
import { motion, AnimatePresence } from 'framer-motion'

function levelFromXp(xp: number, k: number) {
  return Math.floor(Math.sqrt(Math.max(0, xp) / k)) + 1
}

function levelBaseXp(level: number, k: number) {
  const l = Math.max(1, level)
  return k * (l - 1) * (l - 1)
}

function levelNextXp(level: number, k: number) {
  const l = Math.max(1, level)
  return k * l * l
}

const badges: Array<{ id: string; name: string; description: string }> = [
  { id: 'first_template_created', name: 'First Template', description: 'Create your first template' },
  { id: 'all_claims_verified', name: 'All Verified', description: 'Finish a perfect run' },
  { id: 'streak_5', name: 'Streak 5', description: 'Win 5 perfect runs in a row' },
  { id: 'clean_build', name: 'Clean Build', description: 'All build claims pass' },
  { id: 'zero_warnings', name: 'Zero Warnings', description: 'Perfect run with no warnings' }
]

export function PocGameHud() {
  const { pocXpTotal, pocStreak, pocLongestStreak, pocBadges, pocLastXpGain } = useStore()
  const k = 25
  const [levelUp, setLevelUp] = useState(false)
  const [streakUp, setStreakUp] = useState(false)

  const { level, progressPct, xpInto, xpNeeded } = useMemo(() => {
    const level = levelFromXp(pocXpTotal, k)
    const base = levelBaseXp(level, k)
    const next = levelNextXp(level, k)
    const span = Math.max(1, next - base)
    const into = Math.max(0, pocXpTotal - base)
    const pct = Math.max(0, Math.min(1, into / span))
    return { level, progressPct: pct, xpInto: into, xpNeeded: span }
  }, [pocXpTotal])

  useEffect(() => {
    const key = 'poc_last_level'
    const prev = Number(localStorage.getItem(key) || '0')
    if (prev > 0 && level > prev) {
      setLevelUp(true)
      const t = setTimeout(() => setLevelUp(false), 1200)
      return () => clearTimeout(t)
    }
    localStorage.setItem(key, String(level))
  }, [level])

  useEffect(() => {
    const key = 'poc_last_streak'
    const prev = Number(localStorage.getItem(key) || '0')
    if (pocStreak > 0 && pocStreak > prev) {
      setStreakUp(true)
      const t = setTimeout(() => setStreakUp(false), 900)
      return () => clearTimeout(t)
    }
    localStorage.setItem(key, String(pocStreak))
  }, [pocStreak])

  return (
    <div className="rounded-xl border border-primary/15 bg-background/60 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs font-medium uppercase text-primary">Player</div>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <motion.div
              className="rounded-full border border-primary/20 bg-primaryAccent px-2 py-1 text-xs font-medium uppercase text-primary"
              animate={levelUp ? { scale: [1, 1.12, 1] } : { scale: 1 }}
              transition={{ duration: 0.5, ease: 'easeOut' }}
            >
              Level {level}
            </motion.div>
            <div className="text-xs text-secondary">
              XP {pocXpTotal}
              {pocLastXpGain > 0 ? <span className="text-secondary/70"> (+{pocLastXpGain})</span> : null}
            </div>
            <motion.div
              className="text-xs text-secondary"
              animate={streakUp ? { scale: [1, 1.1, 1] } : { scale: 1 }}
              transition={{ duration: 0.4, ease: 'easeOut' }}
            >
              Streak {pocStreak} <span className="text-secondary/70">(best {pocLongestStreak})</span>
            </motion.div>
          </div>
          <div className="mt-2 h-2 w-full overflow-hidden rounded-full border border-primary/15 bg-primaryAccent">
            <div
              className="h-full bg-primary"
              style={{ width: `${Math.round(progressPct * 100)}%` }}
            />
          </div>
          <div className="mt-1 text-[11px] text-secondary/70">
            {xpInto}/{xpNeeded} to next level
          </div>
        </div>
      </div>

      <div className="mt-3">
        <div className="text-xs font-medium uppercase text-primary">Badges</div>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {badges.map((b) => {
            const unlocked = !!pocBadges[b.id]
            return (
              <div
                key={b.id}
                className={`rounded-xl border p-2 ${
                  unlocked ? 'border-primary/25 bg-accent' : 'border-primary/10 bg-primaryAccent'
                }`}
              >
                <div className="text-xs font-medium uppercase text-primary">
                  {unlocked ? 'Unlocked' : 'Locked'} · {b.name}
                </div>
                <div className="mt-1 text-[11px] text-secondary/80">{b.description}</div>
              </div>
            )
          })}
        </div>
      </div>

      <AnimatePresence>
        {levelUp && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
            className="mt-3 rounded-xl border border-primary/25 bg-accent p-2 text-xs font-medium uppercase text-primary"
          >
            Level Up
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
