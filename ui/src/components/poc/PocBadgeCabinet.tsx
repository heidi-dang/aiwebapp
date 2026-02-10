'use client'

import { useMemo, useState } from 'react'
import { useStore } from '@/store'

type Rarity = 'common' | 'rare' | 'epic' | 'legendary'

const rarityOrder: Rarity[] = ['legendary', 'epic', 'rare', 'common']

const rarityLabel: Record<Rarity, string> = {
  common: 'Common',
  rare: 'Rare',
  epic: 'Epic',
  legendary: 'Legendary'
}

const rarityClass: Record<Rarity, string> = {
  common: 'border-primary/10 bg-primaryAccent',
  rare: 'border-blue-400/25 bg-accent',
  epic: 'border-purple-400/25 bg-accent',
  legendary: 'border-yellow-400/25 bg-accent'
}

const badgeDefs: Array<{
  id: string
  name: string
  description: string
  rarity: Rarity
}> = [
  {
    id: 'first_template_created',
    name: 'First Template',
    description: 'Create your first template.',
    rarity: 'common'
  },
  {
    id: 'clean_build',
    name: 'Clean Build',
    description: 'All build claims passed.',
    rarity: 'rare'
  },
  {
    id: 'zero_warnings',
    name: 'Zero Warnings',
    description: 'Perfect run with no warnings.',
    rarity: 'epic'
  },
  {
    id: 'all_claims_verified',
    name: 'All Verified',
    description: 'Perfect run completed.',
    rarity: 'rare'
  },
  {
    id: 'streak_5',
    name: 'Streak 5',
    description: 'Five perfect runs in a row.',
    rarity: 'legendary'
  }
]

export function PocBadgeCabinet() {
  const pocBadges = useStore((s) => s.pocBadges)
  const [filter, setFilter] = useState<'all' | 'unlocked' | 'locked'>('all')

  const grouped = useMemo(() => {
    const filtered = badgeDefs.filter((b) => {
      const unlocked = !!pocBadges[b.id]
      if (filter === 'unlocked') return unlocked
      if (filter === 'locked') return !unlocked
      return true
    })
    const byRarity = new Map<Rarity, typeof filtered>()
    rarityOrder.forEach((r) => byRarity.set(r, []))
    filtered.forEach((b) => {
      const arr = byRarity.get(b.rarity) ?? []
      arr.push(b)
      byRarity.set(b.rarity, arr)
    })
    return rarityOrder
      .map((r) => ({ rarity: r, items: byRarity.get(r) ?? [] }))
      .filter((g) => g.items.length > 0)
  }, [pocBadges, filter])

  return (
    <div className="rounded-xl border border-primary/15 bg-background/60 p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs font-medium uppercase text-primary">Badge Cabinet</div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setFilter('all')}
            className={`rounded-md border px-2 py-1 text-[11px] uppercase ${
              filter === 'all' ? 'border-primary/30 bg-accent text-primary' : 'border-primary/10 bg-primaryAccent text-secondary'
            }`}
          >
            All
          </button>
          <button
            type="button"
            onClick={() => setFilter('unlocked')}
            className={`rounded-md border px-2 py-1 text-[11px] uppercase ${
              filter === 'unlocked' ? 'border-primary/30 bg-accent text-primary' : 'border-primary/10 bg-primaryAccent text-secondary'
            }`}
          >
            Unlocked
          </button>
          <button
            type="button"
            onClick={() => setFilter('locked')}
            className={`rounded-md border px-2 py-1 text-[11px] uppercase ${
              filter === 'locked' ? 'border-primary/30 bg-accent text-primary' : 'border-primary/10 bg-primaryAccent text-secondary'
            }`}
          >
            Locked
          </button>
        </div>
      </div>

      <div className="mt-3 space-y-3">
        {grouped.map((g) => (
          <div key={g.rarity}>
            <div className="text-[11px] font-medium uppercase text-secondary/80">
              {rarityLabel[g.rarity]}
            </div>
            <div className="mt-2 grid grid-cols-1 gap-2">
              {g.items.map((b) => {
                const unlocked = !!pocBadges[b.id]
                return (
                  <div
                    key={b.id}
                    className={`rounded-xl border p-2 ${rarityClass[b.rarity]} ${unlocked ? '' : 'opacity-70'}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-xs font-medium uppercase text-primary">
                        {unlocked ? 'Unlocked' : 'Locked'} · {b.name}
                      </div>
                      <div className="text-[11px] text-secondary/80">{b.rarity}</div>
                    </div>
                    <div className="mt-1 text-[11px] text-secondary/80">{b.description}</div>
                  </div>
                )
              })}
            </div>
          </div>
        ))}

        {grouped.length === 0 && (
          <div className="text-xs text-muted">No badges in this filter</div>
        )}
      </div>
    </div>
  )
}

